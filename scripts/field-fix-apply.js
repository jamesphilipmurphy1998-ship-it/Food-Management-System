// Applies human-confirmed corrections to named fields of live ingredients, from a plan file:
//   [{ "code": "107497", "changes": { "kj": { "old": 35, "new": 146 } }, "comment": "why" }]
//
//   node scripts/field-fix-apply.js <plan.json>            (dry run: shows what would change)
//   node scripts/field-fix-apply.js <plan.json> --apply    (writes, then re-fetches and verifies)
//
// Safety: matched by exact code; refuses an item whose live value is not the expected "old" value
// (so it can never overwrite something that changed since the plan was made); the PUT carries the
// record's own updatedAt (a concurrent edit is refused by the server); after writing, every field
// of every OTHER ingredient is compared with the pre-write state. The "comment" is attached to the
// version-history row the change creates, so the history says why.
// Needs a signed-in session cookie jar (COOKIE_JAR; on Windows pass the real Windows path).
const fs = require("fs");
const { execSync } = require("child_process");

const API_BASE = process.env.NUTRICOST_API_BASE || "http://192.168.0.50:5001";
const COOKIE_JAR = process.env.COOKIE_JAR || "/tmp/qa_cookies.txt";
const planPath = process.argv[2];
const apply = process.argv.includes("--apply");
if (!planPath) { console.log("usage: node scripts/field-fix-apply.js <plan.json> [--apply]"); process.exit(1); }
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));

function curlGet(url) { return JSON.parse(execSync(`curl -s -b "${COOKIE_JAR}" "${url}"`, { maxBuffer: 50 * 1024 * 1024 }).toString()); }
function curlPut(url, body) {
  const tmp = "field-fix.put-body.json"; fs.writeFileSync(tmp, JSON.stringify(body));
  const out = execSync(`curl -s -b "${COOKIE_JAR}" -X PUT "${url}" -H "content-type: application/json" --data @"${tmp}" -w "\\n%{http_code}"`, { maxBuffer: 50 * 1024 * 1024 }).toString();
  fs.unlinkSync(tmp); return out.slice(out.lastIndexOf("\n") + 1).trim();
}
function curlPostJson(url, body) {
  const tmp = "field-fix.post-body.json"; fs.writeFileSync(tmp, JSON.stringify(body));
  execSync(`curl -s -b "${COOKIE_JAR}" -X POST "${url}" -H "content-type: application/json" --data @"${tmp}"`); fs.unlinkSync(tmp);
}

const before = curlGet(`${API_BASE}/api/ingredients?includeUnlinked=true`);
if (!Array.isArray(before)) { console.log("Could not read ingredients (not signed in?)"); process.exit(1); }
const targets = [];
for (const item of plan) {
  const live = before.find((i) => (i.code || "").trim().toUpperCase() === item.code.trim().toUpperCase());
  if (!live) { console.log(`REFUSED ${item.code}: no live ingredient with that code`); process.exit(1); }
  for (const [f, c] of Object.entries(item.changes)) {
    if (live[f] !== c.old) { console.log(`REFUSED ${item.code}: live ${f} is ${JSON.stringify(live[f])}, plan expected ${JSON.stringify(c.old)} -- it changed since the plan was made`); process.exit(1); }
  }
  targets.push({ item, live });
  console.log(`${item.code} "${live.name}":`);
  Object.entries(item.changes).forEach(([f, c]) => console.log(`   ${f}: ${JSON.stringify(c.old)} -> ${JSON.stringify(c.new)}`));
}
if (!apply) { console.log("\nDry run only. Re-run with --apply to write."); process.exit(0); }

for (const { item, live } of targets) {
  const updated = { ...live };
  Object.entries(item.changes).forEach(([f, c]) => { updated[f] = c.new; });
  const status = curlPut(`${API_BASE}/api/ingredients/${live.id}`, updated);
  console.log(`\nPUT ${item.code}: status ${status}`);
  if (status !== "200") { console.log("Write did not return 200 -- treat as failed."); process.exit(1); }
  if (item.comment) curlPostJson(`${API_BASE}/api/ingredients/${live.id}/latest-version-comment`, { comment: item.comment });
}

console.log("\n--- Verification (fresh re-fetch) ---");
const after = curlGet(`${API_BASE}/api/ingredients?includeUnlinked=true`);
const ids = new Set(targets.map((t) => t.live.id));
let bad = 0;
for (const { item, live } of targets) {
  const a = after.find((i) => i.id === live.id);
  for (const [f, c] of Object.entries(item.changes)) {
    if (a[f] !== c.new) { bad++; console.log(`  MISMATCH ${item.code} ${f}: live ${JSON.stringify(a[f])}, intended ${JSON.stringify(c.new)}`); }
  }
  const changedOther = Object.keys(live).filter((k) => k !== "updatedAt" && !(k in item.changes) && JSON.stringify(a[k]) !== JSON.stringify(live[k]));
  if (changedOther.length) { bad++; console.log(`  ${item.code}: UNINTENDED change in ${changedOther.join(", ")}`); }
}
const strip = (i) => { const c = { ...i }; delete c.updatedAt; return JSON.stringify(c); };
const beforeById = new Map(before.map((i) => [i.id, i]));
let others = 0;
for (const a of after) { if (ids.has(a.id)) continue; const b = beforeById.get(a.id); if (b && strip(a) !== strip(b)) { others++; console.log("  other ingredient changed:", a.code); } }
console.log(`intended fields correct: ${bad === 0 ? "yes" : "NO (" + bad + " problems)"} | other ingredients changed: ${others} (must be 0) | count before/after: ${before.length}/${after.length}`);
