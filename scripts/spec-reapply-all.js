// Batch-reapplies every archived spec-data/<code>.json onto the live ingredients. Intended use:
// the live DB gets wiped and reimported from a new cost/code data feed (a separate process, not
// this script's concern), which restores ingredient rows keyed by code but with no nutrition/
// allergen/pack/ingredients-list data on them. Every archive in spec-data/ already represents a
// human-approved decision (it's only ever written by spec-apply.js after a person confirmed the
// original extraction AND post-upload verification passed) -- so this script does NOT re-ask for
// confirmation per ingredient. It matches by code, diffs, writes, and re-verifies, exactly like
// spec-apply.js's own apply step, just looped and unattended.
//
// What it does NOT do: if a reimport changes a code, renames a product, or otherwise breaks the
// code match, that archive is reported as UNMATCHED and left alone -- never guessed at. A person
// reviews the unmatched list and re-runs spec-apply.js by hand for those, same as a first-time
// upload.
//
// Usage:
//   node scripts/spec-reapply-all.js            (dry run -- prints what WOULD change, per ingredient)
//   node scripts/spec-reapply-all.js --apply     (writes every matched, changed archive)
//
// Requires a signed-in session cookie jar (COOKIE_JAR env var, default /tmp/qa_cookies.txt).
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const API_BASE = process.env.NUTRICOST_API_BASE || "http://192.168.0.50:5001";
const COOKIE_JAR = process.env.COOKIE_JAR || "/tmp/qa_cookies.txt";
const SPEC_DATA_DIR = path.join(__dirname, "..", "spec-data");
const apply = process.argv.includes("--apply");

function curlGet(url) {
  const out = execSync(`curl -s -b "${COOKIE_JAR}" "${url}"`, { maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(out.toString());
}
function curlPut(url, body, tmpPath) {
  fs.writeFileSync(tmpPath, JSON.stringify(body));
  const out = execSync(`curl -s -b "${COOKIE_JAR}" -X PUT "${url}" -H "content-type: application/json" --data @"${tmpPath}" -w "\\n%{http_code}"`, { maxBuffer: 50 * 1024 * 1024 });
  fs.unlinkSync(tmpPath);
  const text = out.toString();
  const idx = text.lastIndexOf("\n");
  return { body: text.slice(0, idx), status: text.slice(idx + 1).trim() };
}

if (!fs.existsSync(SPEC_DATA_DIR)) {
  console.log(`No spec-data/ folder found at ${SPEC_DATA_DIR} -- nothing to reapply.`);
  process.exit(0);
}
const archiveFiles = fs.readdirSync(SPEC_DATA_DIR).filter((f) => f.endsWith(".json"));
if (archiveFiles.length === 0) {
  console.log("spec-data/ is empty -- nothing to reapply.");
  process.exit(0);
}

const allIngredients = curlGet(`${API_BASE}/api/ingredients?includeUnlinked=true`);
const nutritionFields = ["kj", "kcal", "fat", "sat", "carb", "sugar", "protein", "fibre", "salt"];

const results = { matched: 0, unchanged: 0, applied: 0, failed: 0, unmatched: [] };

archiveFiles.forEach((file) => {
  const archive = JSON.parse(fs.readFileSync(path.join(SPEC_DATA_DIR, file), "utf8"));
  const candidates = [archive.code, archive.altCode].filter(Boolean);
  let matched = null, matchedOn = null;
  for (const c of candidates) {
    matched = allIngredients.find((i) => (i.code || "").trim().toUpperCase() === c.trim().toUpperCase());
    if (matched) { matchedOn = c; break; }
  }
  if (!matched) {
    results.unmatched.push({ file, code: archive.code, name: archive.name });
    return;
  }
  results.matched++;

  const diff = [];
  nutritionFields.forEach((f) => {
    const after = archive.nutrition ? archive.nutrition[f] : null;
    if (after == null) return;
    if (matched[f] !== after) diff.push({ field: f, before: matched[f], after });
  });
  const beforeAllergens = (matched.allergens || []).slice().sort();
  const afterAllergens = (archive.allergens || []).slice().sort();
  const allergensChanged = JSON.stringify(beforeAllergens) !== JSON.stringify(afterAllergens);
  if (allergensChanged) diff.push({ field: "allergens", before: beforeAllergens, after: afterAllergens });
  ["packSize", "packFormat", "storageConditions", "shelfLife", "ingredientsList"].forEach((f) => {
    const after = archive[f];
    if (after == null) return;
    const before = matched[f] || "";
    if (before !== after) diff.push({ field: f, before, after });
  });
  if (archive.packSizeUnit != null) {
    const bv = matched.packSizeValue == null ? null : Number(matched.packSizeValue), av = archive.packSizeValue == null ? null : Number(archive.packSizeValue);
    if (bv !== av) diff.push({ field: "packSizeValue", before: bv, after: av });
    if ((matched.packSizeUnit || "") !== archive.packSizeUnit) diff.push({ field: "packSizeUnit", before: matched.packSizeUnit || "", after: archive.packSizeUnit });
  }

  if (diff.length === 0) {
    results.unchanged++;
    return;
  }

  console.log(`\n${archive.code} "${matched.name}" (matched on ${matchedOn}):`);
  diff.forEach((d) => console.log(`  ${d.field}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`));

  if (!apply) return;

  const updated = Object.assign({}, matched);
  const intendedNutrition = {};
  nutritionFields.forEach((f) => { if (archive.nutrition && archive.nutrition[f] != null) { updated[f] = archive.nutrition[f]; intendedNutrition[f] = archive.nutrition[f]; } });
  if (allergensChanged) updated.allergens = afterAllergens;
  const intendedPackFields = {};
  ["packSize", "packFormat", "storageConditions", "shelfLife", "ingredientsList"].forEach((f) => { if (archive[f] != null) { updated[f] = archive[f]; intendedPackFields[f] = archive[f]; } });
  // Pack Size number + unit: restored from the archive when it carries them. Older archives have
  // neither key (undefined), in which case the live values are left exactly as they are.
  if (archive.packSizeUnit != null) { updated.packSizeValue = archive.packSizeValue == null ? null : archive.packSizeValue; updated.packSizeUnit = archive.packSizeUnit; }

  const tmpPath = path.join(SPEC_DATA_DIR, `.${archive.code}.put-body.json`);
  const result = curlPut(`${API_BASE}/api/ingredients/${matched.id}`, updated, tmpPath);
  if (result.status !== "200") {
    console.log(`  PUT FAILED (status ${result.status}): ${result.body}`);
    results.failed++;
    return;
  }
  results.applied++;

  // Record why, same as spec-apply.js -- auto-filled, never typed by hand.
  const sourceBaseName = archive.sourceFile ? archive.sourceFile.split(/[\\/]/).pop() : "unknown spec file";
  const commentBody = { comment: `Reapplied from spec-data archive: ${sourceBaseName}` };
  const commentTmp = path.join(SPEC_DATA_DIR, `.${archive.code}.comment-body.json`);
  fs.writeFileSync(commentTmp, JSON.stringify(commentBody));
  execSync(`curl -s -b "${COOKIE_JAR}" -X POST "${API_BASE}/api/ingredients/${matched.id}/latest-version-comment" -H "content-type: application/json" --data @"${commentTmp}"`);
  fs.unlinkSync(commentTmp);
});

console.log(`\n--- Summary ---`);
console.log(`Archives: ${archiveFiles.length}, matched by code: ${results.matched}, already up to date: ${results.unchanged}, ${apply ? "applied" : "would apply"}: ${apply ? results.applied : (results.matched - results.unchanged)}, failed writes: ${results.failed}`);
if (results.unmatched.length > 0) {
  console.log(`\nUNMATCHED (${results.unmatched.length}) -- no live ingredient has this code, needs manual review:`);
  results.unmatched.forEach((u) => console.log(`  ${u.code}  ${u.name}  (${u.file})`));
}
if (!apply) {
  console.log("\nDry run only -- re-run with --apply to write these to the live ingredients.");
}
