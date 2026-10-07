// One-off backfill: fill the new packSizeValue / packSizeUnit fields from the live text packSize,
// but ONLY for values that are exactly "<number> <unit>" with unit g, kg, ml or L. Anything else
// (ranges, two sizes, sentences, empty) is left alone. The text packSize itself is never changed.
//
//   node scripts/packsize-parts-backfill.js            (dry run: counts and a sample, writes nothing)
//   node scripts/packsize-parts-backfill.js --apply    (writes, then re-fetches and verifies everything)
//
// Needs a signed-in session cookie jar (COOKIE_JAR env var, default /tmp/qa_cookies.txt; on Windows
// pass the real Windows path). Matched by exact id from a fresh fetch; each PUT carries the record's
// own updatedAt, so a record someone edited in the meantime is refused by the server (409), not
// overwritten.
const fs = require("fs");
const { execSync } = require("child_process");

const API_BASE = process.env.NUTRICOST_API_BASE || "http://192.168.0.50:5001";
const COOKIE_JAR = process.env.COOKIE_JAR || "/tmp/qa_cookies.txt";
const apply = process.argv.includes("--apply");

function curlGet(url) {
  const out = execSync(`curl -s -b "${COOKIE_JAR}" "${url}"`, { maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(out.toString());
}
function curlPut(url, body) {
  const tmp = "packsize-parts-backfill.put-body.json";
  fs.writeFileSync(tmp, JSON.stringify(body));
  const out = execSync(`curl -s -b "${COOKIE_JAR}" -X PUT "${url}" -H "content-type: application/json" --data @"${tmp}" -w "\\n%{http_code}"`, { maxBuffer: 50 * 1024 * 1024 });
  fs.unlinkSync(tmp);
  const text = out.toString();
  return text.slice(text.lastIndexOf("\n") + 1).trim();
}

const CANON = /^(\d+(?:\.\d+)?) (g|kg|ml|L)$/;
const before = curlGet(`${API_BASE}/api/ingredients?includeUnlinked=true`);
if (!Array.isArray(before)) { console.log("Could not read ingredients (not signed in?):", JSON.stringify(before).slice(0, 120)); process.exit(1); }

const plan = [];
let already = 0, leftAlone = 0, empty = 0;
for (const i of before) {
  const ps = i.packSize || "";
  if (!ps.trim()) { empty++; continue; }
  const m = CANON.exec(ps);
  if (!m) { leftAlone++; continue; }
  const value = Number(m[1]), unit = m[2];
  if (Number(i.packSizeValue) === value && i.packSizeUnit === unit && i.packSizeValue != null) { already++; continue; }
  plan.push({ id: i.id, code: i.code, name: i.name, packSize: ps, value, unit });
}
const byUnit = {};
plan.forEach((p) => { byUnit[p.unit] = (byUnit[p.unit] || 0) + 1; });
console.log(`ingredients: ${before.length} | to fill: ${plan.length} ${JSON.stringify(byUnit)} | already filled: ${already} | text not a single "number unit" (left alone): ${leftAlone} | no Pack Size: ${empty}`);
if (!apply) {
  plan.slice(0, 8).forEach((p) => console.log(`  ${p.code}  ${JSON.stringify(p.packSize)} -> value ${p.value}, unit ${JSON.stringify(p.unit)}`));
  console.log("Dry run only. Re-run with --apply to write.");
  process.exit(0);
}

let ok = 0; const failed = [];
for (const p of plan) {
  const live = before.find((i) => i.id === p.id);
  const status = curlPut(`${API_BASE}/api/ingredients/${p.id}`, { ...live, packSizeValue: p.value, packSizeUnit: p.unit });
  if (status === "200") ok++; else failed.push({ code: p.code, status });
}
console.log(`written: ${ok} | failed: ${failed.length} ${failed.length ? JSON.stringify(failed) : ""}`);

console.log("\n--- Verification (fresh re-fetch) ---");
const after = curlGet(`${API_BASE}/api/ingredients?includeUnlinked=true`);
const planIds = new Set(plan.map((p) => p.id));
let partsOk = 0, partsBad = 0, textChanged = 0;
for (const p of plan) {
  const a = after.find((i) => i.id === p.id);
  if (a && Number(a.packSizeValue) === p.value && a.packSizeUnit === p.unit) partsOk++; else { partsBad++; console.log("  PARTS MISMATCH", p.code); }
  if (a && a.packSize !== p.packSize) { textChanged++; console.log("  TEXT CHANGED", p.code, JSON.stringify(a.packSize)); }
}
const strip = (i) => { const c = { ...i }; delete c.updatedAt; return JSON.stringify(c); };
const beforeById = new Map(before.map((i) => [i.id, i]));
let othersChanged = 0;
for (const a of after) {
  if (planIds.has(a.id)) continue;
  const b = beforeById.get(a.id);
  if (!b) continue;
  if (strip(a) !== strip(b)) { othersChanged++; console.log("  UNINTENDED CHANGE (or someone else edited it meanwhile):", a.code); }
}
console.log(`parts correct: ${partsOk}/${plan.length} | text packSize changed: ${textChanged} (must be 0) | other ingredients that changed: ${othersChanged} (must be 0) | count before/after: ${before.length}/${after.length}`);
