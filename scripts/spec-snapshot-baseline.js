// One-off bootstrap: the spec-data/ archive (see spec-apply.js and spec-reapply-all.js) only
// gets populated going forward, from this point on -- it can't retroactively recover extraction
// JSONs that already existed in a session's temp scratchpad and were cleaned up before this
// archive existed. Since the live ingredient record IS the already-human-confirmed result of
// those earlier spec uploads, this script rebuilds spec-data/<code>.json from the current live
// state for every ingredient that already has spec-derived data, so nothing already done has to
// be redone by hand. Run once; spec-apply.js takes over archiving from here for every new upload.
//
// Usage: node scripts/spec-snapshot-baseline.js
// Requires a signed-in session cookie jar (COOKIE_JAR env var, default /tmp/qa_cookies.txt).
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const API_BASE = process.env.NUTRICOST_API_BASE || "http://192.168.0.50:5001";
const COOKIE_JAR = process.env.COOKIE_JAR || "/tmp/qa_cookies.txt";
const SPEC_DATA_DIR = path.join(__dirname, "..", "spec-data");

function curlGet(url) {
  const out = execSync(`curl -s -b "${COOKIE_JAR}" "${url}"`, { maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(out.toString());
}

if (!fs.existsSync(SPEC_DATA_DIR)) fs.mkdirSync(SPEC_DATA_DIR, { recursive: true });

const allIngredients = curlGet(`${API_BASE}/api/ingredients?includeUnlinked=true`);

const nutritionFields = ["kj", "kcal", "fat", "sat", "carb", "sugar", "protein", "fibre", "salt"];

let written = 0, skipped = 0;
allIngredients.forEach((ing) => {
  const code = (ing.code || "").trim();
  if (!code) { skipped++; return; }
  // Only archive ingredients that actually went through the spec pipeline. A checked allergen
  // box alone is NOT that signal -- plenty of ingredients have a legacy allergen tag (from
  // manual entry, or an old import, sometimes on things that aren't even raw materials, e.g.
  // pack-label/sleeve rows) with no nutrition and no spec behind it at all. Backing those up
  // here would mean spec-reapply-all.js writes them back onto a reimported record as if they
  // were a human-confirmed spec upload, when nobody ever ran a spec through this pipeline for
  // them. Real nutrition (kcal > 0) or an actual ingredients-list string are the only two
  // fields nothing else in the app currently populates -- so either one is real signal.
  const hasNutrition = ing.kcal > 0;
  const hasIngredientsList = !!(ing.ingredientsList && ing.ingredientsList.trim());
  if (!hasNutrition && !hasIngredientsList) { skipped++; return; }

  const archive = {
    status: "ok",
    sourceFile: "baseline snapshot from live DB (original extraction JSON no longer available)",
    snapshotAt: new Date().toISOString(),
    name: ing.name,
    code: code,
    altCode: (ing.altCodes && ing.altCodes[0]) || null,
    nutrition: {},
    allergens: ing.allergens || [],
    packSize: ing.packSize || null,
    packFormat: ing.packFormat || null,
    storageConditions: ing.storageConditions || null,
    ingredientsList: ing.ingredientsList || null,
    errors: [],
    warnings: []
  };
  nutritionFields.forEach((f) => { archive.nutrition[f] = ing[f]; });

  const outPath = path.join(SPEC_DATA_DIR, `${code}.json`);
  fs.writeFileSync(outPath, JSON.stringify(archive, null, 2) + "\n", "utf8");
  written++;
});

console.log(`Baseline snapshot complete: ${written} archived to spec-data/, ${skipped} skipped (no code, or no spec-derived data yet).`);
