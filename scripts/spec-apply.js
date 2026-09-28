// Takes the JSON a spec-extract.py run produced, matches it against the live ingredient by
// code (trying the primary code first, then the alt/parenthetical code if present -- some
// specs only ever show one code, some show two, this handles both), builds a diff against the
// current live values, and either just prints the diff (default) or writes it (--apply).
//
// SAFETY-CRITICAL: --apply is refused outright unless extraction.status === "ok". An allergen
// written wrong is a consumer safety incident, not a cosmetic bug -- if spec-extract.py hit
// anything it couldn't fully verify (unrecognised sheet layout, a missing allergen category,
// an ambiguous Y/N, a sanity-check failure), this script must say so and stop, never fall back
// to writing partial or best-guess data. See SPEC-EXTRACTION.md's safety section.
//
// Usage:
//   node scripts/spec-apply.js <extraction.json>            (dry run -- prints the diff only)
//   node scripts/spec-apply.js <extraction.json> --apply     (writes via PUT after showing the diff)
//
// Requires a signed-in session cookie jar at /tmp/qa_cookies.txt (or set COOKIE_JAR env var) --
// on Windows pass the real Windows path (see SPEC-EXTRACTION.md), not the Git-Bash /tmp/... form.
const fs = require("fs");
const { execSync } = require("child_process");

const API_BASE = process.env.NUTRICOST_API_BASE || "http://192.168.0.50:5001";
const COOKIE_JAR = process.env.COOKIE_JAR || "/tmp/qa_cookies.txt";

const extractionPath = process.argv[2];
const apply = process.argv.includes("--apply");
if (!extractionPath) {
  console.error("Usage: node scripts/spec-apply.js <extraction.json> [--apply]");
  process.exit(1);
}
const extraction = JSON.parse(fs.readFileSync(extractionPath, "utf8"));

if (extraction.status !== "ok") {
  console.log(`CANNOT SAFELY PROCEED — extraction status is "${extraction.status}", not "ok".`);
  if (extraction.errors && extraction.errors.length) {
    console.log("\nErrors (the spec format wasn't fully recognised, or something didn't check out):");
    extraction.errors.forEach((e) => console.log("  - " + e));
  }
  if (extraction.warnings && extraction.warnings.length) {
    console.log("\nWarnings:");
    extraction.warnings.forEach((w) => console.log("  - " + w));
  }
  console.log("\nThis extraction will not be matched or written, even in dry-run mode — manual review required.");
  process.exit(1);
}

function curlGet(url) {
  const out = execSync(`curl -s -b "${COOKIE_JAR}" "${url}"`, { maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(out.toString());
}
function curlPut(url, body) {
  const tmp = extractionPath + ".put-body.json";
  fs.writeFileSync(tmp, JSON.stringify(body));
  const out = execSync(`curl -s -b "${COOKIE_JAR}" -X PUT "${url}" -H "content-type: application/json" --data @"${tmp}" -w "\\n%{http_code}"`, { maxBuffer: 50 * 1024 * 1024 });
  fs.unlinkSync(tmp);
  const text = out.toString();
  const idx = text.lastIndexOf("\n");
  return { body: text.slice(0, idx), status: text.slice(idx + 1).trim() };
}

const allIngredients = curlGet(`${API_BASE}/api/ingredients?includeUnlinked=true`);

const candidates = [extraction.code, extraction.altCode].filter(Boolean);
let matched = null, matchedOn = null;
for (const c of candidates) {
  matched = allIngredients.find((i) => (i.code || "").trim().toUpperCase() === c.trim().toUpperCase());
  if (matched) { matchedOn = c; break; }
}

if (!matched) {
  console.log(`NO MATCH. Tried code(s): ${candidates.join(", ")}. Nothing in the live system has any of these codes -- not writing anything.`);
  process.exit(1);
}

console.log(`Matched on code "${matchedOn}" -> "${matched.name}" (id ${matched.id})`);

const nutritionFields = ["kj", "kcal", "fat", "sat", "carb", "sugar", "protein", "fibre", "salt"];
const diff = [];
nutritionFields.forEach((f) => {
  const before = matched[f];
  const after = extraction.nutrition[f];
  if (after == null) return; // spec didn't have this field -- don't touch it
  if (before !== after) diff.push({ field: f, before, after });
});
const beforeAllergens = (matched.allergens || []).slice().sort();
const afterAllergens = (extraction.allergens || []).slice().sort();
const allergensChanged = JSON.stringify(beforeAllergens) !== JSON.stringify(afterAllergens);
if (allergensChanged) diff.push({ field: "allergens", before: beforeAllergens, after: afterAllergens });

console.log("\n--- Diff (nutrition + allergens only; cost, supplier, code, everything else untouched) ---");
if (diff.length === 0) {
  console.log("No changes -- live ingredient already matches the spec.");
  process.exit(0);
}
diff.forEach((d) => console.log(`  ${d.field}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`));

if (!apply) {
  console.log("\nDry run only -- re-run with --apply to write this to the live ingredient.");
  process.exit(0);
}

const updated = Object.assign({}, matched);
nutritionFields.forEach((f) => { if (extraction.nutrition[f] != null) updated[f] = extraction.nutrition[f]; });
if (allergensChanged) updated.allergens = afterAllergens;

const result = curlPut(`${API_BASE}/api/ingredients/${matched.id}`, updated);
console.log(`\nPUT status: ${result.status}`);
console.log(result.body);
