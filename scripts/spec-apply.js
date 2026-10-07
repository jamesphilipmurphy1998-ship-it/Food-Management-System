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
// EACH-costed ingredients with a g/kg/ml/L Pack Size and no Weight per each also need
// --each-weight-yes or --each-weight-no (see the "EACH WEIGHT QUESTION" block); --apply refuses without one.
//
// Requires a signed-in session cookie jar at /tmp/qa_cookies.txt (or set COOKIE_JAR env var) --
// on Windows pass the real Windows path (see SPEC-EXTRACTION.md), not the Git-Bash /tmp/... form.
const fs = require("fs");
const path = require("path");
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
const confirmedWarnings = process.argv.includes("--confirm-warnings");

// Errors (status "cannot_extract") are never overridable -- they mean the format itself wasn't
// recognised or something structural failed to verify (a nutrition/allergen field, specifically,
// could not be trusted at all). Warnings (status "extracted_with_warnings") CAN be overridden,
// but only by a person who has actually reviewed each one and explicitly confirmed it's fine --
// --confirm-warnings is that confirmation, never passed automatically by this script itself.
if (extraction.status === "cannot_extract" || (extraction.status !== "ok" && !confirmedWarnings)) {
  console.log(`CANNOT SAFELY PROCEED — extraction status is "${extraction.status}", not "ok".`);
  if (extraction.errors && extraction.errors.length) {
    console.log("\nErrors (the spec format wasn't fully recognised, or something didn't check out):");
    extraction.errors.forEach((e) => console.log("  - " + e));
  }
  if (extraction.warnings && extraction.warnings.length) {
    console.log("\nWarnings:");
    extraction.warnings.forEach((w) => console.log("  - " + w));
    console.log("\nIf a person has reviewed every warning above and confirmed the data is fine to use as-is, re-run with --confirm-warnings added.");
  }
  if (extraction.status === "cannot_extract") {
    console.log("\nThis extraction will not be matched or written, even in dry-run mode — manual review required. Errors cannot be overridden.");
  }
  process.exit(1);
}
if (extraction.status !== "ok" && confirmedWarnings) {
  console.log(`⚠ Proceeding despite unresolved warnings — a person reviewed and confirmed them:`);
  extraction.warnings.forEach((w) => console.log("  - " + w));
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

// A code matching but the PRODUCT NAME not matching is a real red flag -- could mean a typo'd
// code happened to hit a different, unrelated ingredient, or a code got reused/reassigned.
// Never silently proceed on this; always make a person decide. Strip the site's own naming
// prefixes (RM/FG/BHP/GR/CPU/SUB/HR/LR/NF -- e.g. "RM Black Bean Paste" for a spec titled
// just "Black Bean Paste") before comparing, so the normal prefix convention doesn't produce
// false alarms -- only flag when the actual product name looks unrelated.
function normalizeIngredientName(name) {
  return (name || "")
    .toUpperCase()
    .replace(/^\s*(RM|FG|BHP|GR|CPU|SUB|HR|LR|NF)\b\.?\s*/, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}
const specNameNorm = normalizeIngredientName(extraction.name);
const liveNameNorm = normalizeIngredientName(matched.name);
function sameWordSet(a, b) {
  const wordsA = a.split(" ").filter(Boolean).sort();
  const wordsB = b.split(" ").filter(Boolean).sort();
  return wordsA.length > 0 && JSON.stringify(wordsA) === JSON.stringify(wordsB);
}
const namesLookRelated = specNameNorm && liveNameNorm && (
  specNameNorm.includes(liveNameNorm) || liveNameNorm.includes(specNameNorm) || sameWordSet(specNameNorm, liveNameNorm)
);
const confirmedNameMismatch = process.argv.includes("--confirm-name-mismatch");
if (!namesLookRelated && !confirmedNameMismatch) {
  console.log(`\n⚠ NAME MISMATCH — code "${matchedOn}" matched, but the spec's product name ("${extraction.name}") doesn't look related to the live ingredient's name ("${matched.name}").`);
  console.log("This could mean the code was typo'd in the spec and happened to match a different, unrelated ingredient, or the code has been reassigned. Refusing to proceed — a person needs to confirm this is actually the right ingredient before anything is matched or written.");
  console.log("If a person has confirmed these ARE the same product, re-run with --confirm-name-mismatch added.");
  process.exit(1);
}
if (!namesLookRelated && confirmedNameMismatch) {
  console.log(`\n⚠ Proceeding despite name mismatch ("${extraction.name}" vs "${matched.name}") — a person confirmed this is the same product.`);
}

// --- Flow-up flag: nutrition needs no propagation code at all -- calcRecipeNutrition() in
// recipes.js always recomputes a recipe's nutrition live from its ingredient lines, recursing
// through every sub-recipe layer, with no cached "own nutrition" value that could go stale
// (unlike cost's ownCost). So writing this ingredient's nutrition already updates every recipe
// that uses it, at any depth, the instant it's saved -- nothing to trigger. This section is
// purely informational: find every recipe (direct or nested) that uses the matched ingredient
// and say so, so whoever's running this upload isn't surprised that one ingredient change just
// rippled into several recipes' labels/HFSS scores without any separate action on their part.
const allRecipes = curlGet(`${API_BASE}/api/recipes`);
const recipeById = {};
allRecipes.forEach((r) => { recipeById[r.id] = r; });
function recipeUsesIngredient(recipe, ingredientId, visited) {
  visited = visited || {};
  if (visited[recipe.id]) return false;
  visited[recipe.id] = true;
  return (recipe.ingredients || []).some((ri) => {
    if (ri.ingredientId === ingredientId) return true;
    if (ri.subRecipeId) {
      const sub = recipeById[ri.subRecipeId];
      if (sub && recipeUsesIngredient(sub, ingredientId, visited)) return true;
    }
    return false;
  });
}
const usedInRecipes = allRecipes.filter((r) => recipeUsesIngredient(r, matched.id));
if (usedInRecipes.length > 0) {
  console.log(`\nℹ Used in ${usedInRecipes.length} recipe(s) (directly or via a sub-recipe) -- their nutrition already reflects this ingredient's current values live, no separate action needed, but worth a glance if anything user-facing depends on them:`);
  usedInRecipes.forEach((r) => console.log(`  - ${r.name}${r.code ? " (" + r.code + ")" : ""}`));
} else {
  console.log("\nℹ Not currently used in any recipe.");
}

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

["packSize", "packFormat", "storageConditions", "shelfLife", "ingredientsList"].forEach((f) => {
  const after = extraction[f];
  if (after == null) return; // not extracted from this spec -- don't touch it
  const before = matched[f] || "";
  if (before !== after) diff.push({ field: f, before, after });
});

// Pack Size number + unit as their own fields (backend columns pack_size_value / pack_size_unit).
// Written ONLY when they agree exactly with the text packSize ("<number> <unit>"); if the text is not
// a single measure, or someone edited the extraction so the two disagree, the parts are cleared
// (null / "") rather than left describing a different value. undefined = packSize not in this spec,
// so the parts are not touched.
let intendedPackSizeValue, intendedPackSizeUnit;
if (extraction.packSize != null) {
  const n = extraction.packSizeNumber, u = extraction.packSizeUnit;
  if (n != null && u && extraction.packSize === `${n} ${u}`) {
    intendedPackSizeValue = Number(n);
    intendedPackSizeUnit = u;
  } else {
    intendedPackSizeValue = null;
    intendedPackSizeUnit = "";
    if (n != null || u) console.log(`NOTE: packSize ${JSON.stringify(extraction.packSize)} does not match its parts (${n} / ${u}) -- parts will be cleared, not written.`);
  }
  const beforeV = matched.packSizeValue == null ? null : Number(matched.packSizeValue);
  if (beforeV !== intendedPackSizeValue) diff.push({ field: "packSizeValue", before: beforeV, after: intendedPackSizeValue });
  if ((matched.packSizeUnit || "") !== intendedPackSizeUnit) diff.push({ field: "packSizeUnit", before: matched.packSizeUnit || "", after: intendedPackSizeUnit });
}

// "One EACH = one Pack Size?" question. When the live ingredient is costed per EACH, is not packaging, has
// a g/kg/ml/L Pack Size (from this spec, else already live) and no Weight per each yet, a person must say whether
// one EACH is one pack-size unit (sachet/pot: then the weight per each is set from the Pack Size, ml x density, 1
// when blank) or whether the Pack Size is the whole bag/case (then it is left blank). The answer is never
// assumed: --each-weight-yes / --each-weight-no, given only after the user has clicked the answer. Without
// either flag, --apply is refused. Writes the existing unitWeightG field, so recipe maths is unchanged.
const eachWeightYes = process.argv.includes("--each-weight-yes");
const eachWeightNo = process.argv.includes("--each-weight-no");
let intendedUnitWeightG;
{
  const effV = intendedPackSizeUnit !== undefined ? intendedPackSizeValue : (matched.packSizeValue == null ? null : Number(matched.packSizeValue));
  const effU = intendedPackSizeUnit !== undefined ? intendedPackSizeUnit : (matched.packSizeUnit || "");
  const isEach = String(matched.costUom || "").toUpperCase() === "EACH";
  const isPkg = String(matched.cat || "").toLowerCase() === "packaging" || /^\s*(\((delisted|on hold)\)\s*)?nf\b/i.test(matched.name || ""); // same idea as the app's isPackagingItem (category, "NF " names)
  const noWeight = !(Number(matched.unitWeightG) > 0);
  const dens = Number(matched.density) > 0 ? Number(matched.density) : 1;
  const unitG = { g: 1, kg: 1000, ml: dens, L: 1000 * dens }[effU];
  if (isEach && !isPkg && noWeight && effV > 0 && unitG) {
    const grams = Math.round(effV * unitG * 1e6) / 1e6;
    console.log(`\nEACH WEIGHT QUESTION: ${matched.code} is costed per EACH and its Pack Size is ${effV} ${effU}. Is one EACH one ${effV} ${effU} unit (sachet/pot), or is that the whole bag/case?`);
    console.log(`  Yes -> Weight per each: 0 -> ${grams} g (re-run with --each-weight-yes).  No -> left blank and flagged (re-run with --each-weight-no).`);
    if (eachWeightYes && eachWeightNo) { console.log("Both --each-weight-yes and --each-weight-no given -- refusing."); process.exit(1); }
    if (eachWeightYes) { intendedUnitWeightG = grams; diff.push({ field: "unitWeightG", before: Number(matched.unitWeightG) || 0, after: grams }); }
    else if (eachWeightNo) console.log(`  FLAG: ${matched.code} costed per EACH with no weight per each -- a person must enter one.`);
    else if (apply) { console.log("\nREFUSED: answer the EACH weight question first (nothing written)."); process.exit(1); }
  } else if (eachWeightYes || eachWeightNo) {
    console.log("NOTE: the EACH weight question does not apply to this ingredient; --each-weight-yes/no ignored.");
  }
}

console.log("\n--- Diff (nutrition + allergens + pack size/format/storage only; cost, supplier, code, everything else untouched) ---");
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
const intendedNutrition = {};
nutritionFields.forEach((f) => { if (extraction.nutrition[f] != null) { updated[f] = extraction.nutrition[f]; intendedNutrition[f] = extraction.nutrition[f]; } });
if (allergensChanged) updated.allergens = afterAllergens;
const intendedPackFields = {};
["packSize", "packFormat", "storageConditions", "shelfLife", "ingredientsList"].forEach((f) => { if (extraction[f] != null) { updated[f] = extraction[f]; intendedPackFields[f] = extraction[f]; } });
if (intendedPackSizeUnit !== undefined) { updated.packSizeValue = intendedPackSizeValue; updated.packSizeUnit = intendedPackSizeUnit; }
if (intendedUnitWeightG !== undefined) updated.unitWeightG = intendedUnitWeightG;

const result = curlPut(`${API_BASE}/api/ingredients/${matched.id}`, updated);
console.log(`\nPUT status: ${result.status}`);
if (result.status !== "200") {
  console.log(result.body);
  console.log("\nWrite did not return 200 -- treat this as failed, do not assume it partially landed.");
  process.exit(1);
}

// --- Post-upload verification: never just trust the PUT response. Re-fetch the ingredient
// fresh from the live API and confirm every field we intended to change actually landed. ---
console.log("\n--- Post-upload verification (re-fetching live ingredient, not trusting the PUT response) ---");
const verifyList = curlGet(`${API_BASE}/api/ingredients?includeUnlinked=true`);
const verifyIng = verifyList.find((i) => i.id === matched.id);
if (!verifyIng) {
  console.log(`POST-UPLOAD VERIFICATION FAILED: ingredient id ${matched.id} not found on re-fetch.`);
  process.exit(1);
}
const mismatches = [];
Object.keys(intendedNutrition).forEach((f) => {
  if (verifyIng[f] !== intendedNutrition[f]) mismatches.push({ field: f, intended: intendedNutrition[f], live: verifyIng[f] });
});
if (allergensChanged) {
  const liveAllergens = (verifyIng.allergens || []).slice().sort();
  if (JSON.stringify(liveAllergens) !== JSON.stringify(afterAllergens)) mismatches.push({ field: "allergens", intended: afterAllergens, live: liveAllergens });
}
Object.keys(intendedPackFields).forEach((f) => {
  if ((verifyIng[f] || "") !== intendedPackFields[f]) mismatches.push({ field: f, intended: intendedPackFields[f], live: verifyIng[f] });
});
if (intendedPackSizeUnit !== undefined) {
  const liveV = verifyIng.packSizeValue == null ? null : Number(verifyIng.packSizeValue);
  if (liveV !== intendedPackSizeValue) mismatches.push({ field: "packSizeValue", intended: intendedPackSizeValue, live: verifyIng.packSizeValue });
  if ((verifyIng.packSizeUnit || "") !== intendedPackSizeUnit) mismatches.push({ field: "packSizeUnit", intended: intendedPackSizeUnit, live: verifyIng.packSizeUnit });
}
if (intendedUnitWeightG !== undefined && Number(verifyIng.unitWeightG) !== intendedUnitWeightG) mismatches.push({ field: "unitWeightG", intended: intendedUnitWeightG, live: verifyIng.unitWeightG });

if (mismatches.length === 0) {
  console.log("POST-UPLOAD VERIFICATION: PASSED — every intended field matches what's live.");

  // Record WHY this version changed, on the version-history row the PUT above just created --
  // auto-filled from the spec's filename, never typed by hand. This is what lets someone open
  // an ingredient's version history and see not just what v1/v2/v3 looked like, but why each
  // change happened. The comment attaches to whatever version the PUT's snapshot diff produced
  // (see backend Program.cs's single-item PUT endpoint) -- if the fields didn't actually change,
  // no new version was created and this comment call is a harmless no-op against the prior one.
  const sourceBaseName = extraction.sourceFile ? extraction.sourceFile.split(/[\\/]/).pop() : "unknown spec file";
  const commentBody = { comment: `Spec upload: ${sourceBaseName}` };
  const commentTmp = extractionPath + ".comment-body.json";
  fs.writeFileSync(commentTmp, JSON.stringify(commentBody));
  execSync(`curl -s -b "${COOKIE_JAR}" -X POST "${API_BASE}/api/ingredients/${matched.id}/latest-version-comment" -H "content-type: application/json" --data @"${commentTmp}"`);
  fs.unlinkSync(commentTmp);

  // Archive the extracted data (not the source spec file) keyed by code, so that if the DB is
  // ever wiped and reimported from a new cost/code feed, this already-human-confirmed data can
  // be matched back onto the reimported ingredient by code and reapplied automatically --
  // see scripts/spec-reapply-all.js. This is the human-approved record; it must reflect what
  // was actually verified live just now, not the raw extraction (a --confirm-name-mismatch or
  // --override-code run means the extraction's own code/name field may not be the canonical one).
  const specDataDir = path.join(__dirname, "..", "spec-data");
  if (!fs.existsSync(specDataDir)) fs.mkdirSync(specDataDir, { recursive: true });
  const archive = {
    status: "ok",
    sourceFile: extraction.sourceFile || null,
    appliedAt: new Date().toISOString(),
    name: matched.name,
    code: matched.code,
    altCode: extraction.altCode || null,
    nutrition: intendedNutrition,
    allergens: allergensChanged ? afterAllergens : (matched.allergens || []),
    packSize: intendedPackFields.packSize != null ? intendedPackFields.packSize : (matched.packSize || null),
    packSizeValue: intendedPackSizeUnit !== undefined ? intendedPackSizeValue : (matched.packSizeValue == null ? null : matched.packSizeValue),
    packSizeUnit: intendedPackSizeUnit !== undefined ? intendedPackSizeUnit : (matched.packSizeUnit == null ? null : matched.packSizeUnit),
    packFormat: intendedPackFields.packFormat != null ? intendedPackFields.packFormat : (matched.packFormat || null),
    storageConditions: intendedPackFields.storageConditions != null ? intendedPackFields.storageConditions : (matched.storageConditions || null),
    shelfLife: intendedPackFields.shelfLife != null ? intendedPackFields.shelfLife : (matched.shelfLife || null),
    ingredientsList: intendedPackFields.ingredientsList != null ? intendedPackFields.ingredientsList : (matched.ingredientsList || null),
    unitWeightG: intendedUnitWeightG !== undefined ? intendedUnitWeightG : (Number(matched.unitWeightG) > 0 ? Number(matched.unitWeightG) : null),
    errors: [],
    warnings: []
  };
  const outPath = path.join(specDataDir, `${matched.code}.json`);
  fs.writeFileSync(outPath, JSON.stringify(archive, null, 2) + "\n", "utf8");
  console.log(`Archived to ${outPath} for future reapply.`);

  process.exit(0);
} else {
  console.log("POST-UPLOAD VERIFICATION FAILED — the following field(s) do not match what was intended to be written:");
  mismatches.forEach((m) => console.log(`  ${m.field}: intended ${JSON.stringify(m.intended)}, but live is ${JSON.stringify(m.live)}`));
  console.log("\nThis needs manual investigation before trusting this ingredient's data.");
  process.exit(1);
}
