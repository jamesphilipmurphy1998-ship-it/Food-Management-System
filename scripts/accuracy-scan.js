// Compares each recipe's stored BOM cost (ownCost) against a live-recomputed tally, using the
// app's own real cost-calculation functions (loaded straight out of data.js/recipes.js/
// ingredients.js/app.js via eval, not reimplemented) — see ACCURACY-SCAN.md at the repo root for
// the full methodology, how to refresh the input data, and the results log from every run.
const fs = require("fs");
const path = require("path");

global.window = global;
global.document = {
  addEventListener: function () {},
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  createElement: function () { return { style: {}, classList: { add() {}, remove() {} }, addEventListener() {} }; },
};
global.localStorage = {
  _data: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
};
global.navigator = { userAgent: "node" };
global.fetch = function () { return Promise.reject(new Error("no network in scan")); };
global.CustomEvent = function (name, opts) { this.type = name; this.detail = opts && opts.detail; };
global.addEventListener = function () {};
global.dispatchEvent = function () {};
global.alert = function () {};
global.confirm = function () { return true; };
global.URLSearchParams = require("url").URLSearchParams;
global.location = { search: "" };

const root = "C:\\Dev\\NutriCost";
function load(file) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  (0, eval)(code);
}

const rawRecipesData = JSON.parse(fs.readFileSync(path.join(root, ".scan", "live_recipes_final.json"), "utf8"));
const ingredientsData = JSON.parse(fs.readFileSync(path.join(root, ".scan", "live_ingredients_final.json"), "utf8"));

// The real app never costs a recipe against the raw server JSON directly — storage.js's
// setRecipes() always runs every recipe through this normalization first (see
// storage.js:normalizeRecipeIngredientUoms), forcing each line's uom to match its ingredient's
// actual cost UOM. Skipping this step here would silently cost recipes against stale/incorrect
// line UOMs the browser never actually uses, producing false mismatches. Copied verbatim rather
// than reimplemented so this can never quietly drift from the real behavior.
function normalizeRecipeIngredientUoms(recipes, ingredients) {
  if (!Array.isArray(recipes) || !Array.isArray(ingredients)) return recipes;
  var byId = new Map();
  ingredients.forEach(function (i) { byId.set(i.id, i); });
  return recipes.map(function (r) {
    if (!r || !Array.isArray(r.ingredients)) return r;
    var lines = r.ingredients.map(function (ri) {
      if (!ri.ingredientId) return ri;
      var ing = byId.get(ri.ingredientId);
      if (!ing) return ri;
      var costUom = (ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || "").toString().trim().toUpperCase();
      if (!costUom) return ri;
      return Object.assign({}, ri, { uom: costUom });
    });
    return Object.assign({}, r, { ingredients: lines });
  });
}
const recipesData = normalizeRecipeIngredientUoms(rawRecipesData, ingredientsData);

global.NutriCalcStorage = {
  getRecipes: function () { return recipesData; },
  setRecipes: function () {},
  getIngredients: function () { return ingredientsData; },
  setIngredients: function () {},
  deleteRecipe: function () {},
  deleteIngredient: function () {},
};

load("data.js");
load("recipes.js");
load("ingredients.js");

var appCode = fs.readFileSync(path.join(root, "app.js"), "utf8");
var exposeLine = "\n  window.__scanGetRecipeTotalCost = getRecipeTotalCost;\n  window.__scanRecipeOwnUom = recipeOwnUom;\n  window.__scanGetSubRecipeCostPerUom = getSubRecipeCostPerUom;\n  window.__scanGetSubRecipeTotalCost = getSubRecipeTotalCost;\n";
var marker = "})();";
var lastIdx = appCode.lastIndexOf(marker);
appCode = appCode.slice(0, lastIdx) + exposeLine + appCode.slice(lastIdx);
(0, eval)(appCode);

const getRecipeTotalCost = global.__scanGetRecipeTotalCost;
const getSubRecipeCostPerUom = global.__scanGetSubRecipeCostPerUom;
const recipeOwnUom = global.__scanRecipeOwnUom;
const Data = global.NutriCalcData;

// The Total row's grey "Cost per UOM" figure (the one actually comparable to ownCost) is
// getSubRecipeCostPerUom(r, ingredients, recipeOwnUom(r,ingredients), null, true) — see
// app.js:4868. The per-line totalTallyCost accumulator (app.js:4762-4838) answers a DIFFERENT
// question (raw batch "Line Cost", reciprocal scrap formula) and is NOT comparable to ownCost;
// using it here was the bug that produced false-positive mismatches for any multi-unit-batch
// recipe (e.g. a 1.6kg prep batch costed per KG).
function computeTopLevelTally(r, ingredients, recipes) {
  var ownUom = recipeOwnUom(r, ingredients);
  return getSubRecipeCostPerUom(r, ingredients, ownUom, null, true);
}

// Known-bad / excluded recipe codes (confirmed broken/stale source data, not calc issues)
const KNOWN_BAD_RECIPE_CODES = new Set([
  // "107645" removed — user fixed it directly (stripped its 3 bogus BOM lines, now a clean
  // 0-line RM packaging item with ownCost £0.01537 matching the item master exactly). Was
  // tainting 383 recipes purely defensively; re-included in the accuracy check now.
  "107140", // RM Wasabi Sachet 1.5g — top-level cost fixed, but own BOM line still malformed ("1 KG" of a 1.5g sachet)
  "106359", // Wasabi Sachet (FREE) — wraps 107140, inherits the same broken line
  "105707", // HR Vegetable Mix for Beef
  "P00040", // blank-description BOM export gap
  "107359", // cascades from P00040
  "107363", // cascades from P00040
  "107642", // NF Process Hold Tape
  "107098", // Large Korean BBQ Chicken + Sweet Chilli Chk - Yaki
  "107689", // WASABI STICKY HOT HONEY CHICKEN WITH RICE 400g
  "107471", // Mocha 12oz (Regular)
  "107643", // NF Baby Bento PP lid — confirmed against source BOM sheet itself: ParentCost (0.10116) already stale vs the sum of its own 2 lines (0.111) in the raw export, before any import/calc touched it
  "107473", // Mocha 16oz (Large) — same BOM shape/family as already-excluded 107471 (Mocha 12oz), same stale-cost pattern
  "106947", // Kaiso Seaweed Salad — sheet's own ParentCost (0.53671) doesn't match the sum of its own 3 BOM lines (0.4885) in the raw export, same fingerprint as 107643
  "105770", // BHP Plain Rice Hot Food — stored cost is an exact match to sheet's ParentCost/Portions; mismatch is BC's Standard Cost being behind current live ingredient costs, same class as 105707
  "106361", // Ginger Sachet (FREE) — same stale-BC-cost class, confirmed against sheet
  "100483", // Teriyaki Sauce Cup — same stale-BC-cost class, confirmed against sheet
  "105308", // WASABI SWEET CHILLI CHICKEN AND RICE 450g — same stale-BC-cost class, confirmed against sheet
  "105314", // WS BENTO SWEET CHILLI CHICKEN YAKISOBA 450g — same stale-BC-cost class, confirmed against sheet
  "106542", // Hosomaki Cucumber Piece — same stale-BC-cost class, confirmed against sheet
  "106548", // Hosomaki Inari & Red Pepper Piece — same stale-BC-cost class, confirmed against sheet
  "106550", // Hosomaki Asian Slaw Piece — same stale-BC-cost class, confirmed against sheet
  "106540", // Hosomaki Avocado Piece — same stale-BC-cost class, confirmed against sheet
]);

const ingredients = ingredientsData;
const recipes = recipesData;

// Find the actual ids behind the known-bad codes (ingredient or recipe), then propagate the
// exclusion upward to any recipe that consumes one of them as a line, at any depth — a parent
// recipe built on a known-bad component inherits the same broken source data, it isn't a
// separate calc issue.
const badIds = new Set();
ingredients.forEach(function (i) { if (KNOWN_BAD_RECIPE_CODES.has(i.code)) badIds.add(i.id); });
recipes.forEach(function (r) { if (KNOWN_BAD_RECIPE_CODES.has(r.code)) badIds.add(r.id); });

const recipeById = {};
recipes.forEach(function (r) { recipeById[r.id] = r; });

const taintedCache = {};
function isTainted(r, visited) {
  if (!r) return false;
  if (taintedCache.hasOwnProperty(r.id)) return taintedCache[r.id];
  visited = visited || {};
  if (visited[r.id]) return false;
  visited[r.id] = true;
  var result = (r.ingredients || []).some(function (ri) {
    if (ri.ingredientId && badIds.has(ri.ingredientId)) return true;
    if (ri.subRecipeId) {
      if (badIds.has(ri.subRecipeId)) return true;
      var sub = recipeById[ri.subRecipeId];
      if (sub && isTainted(sub, visited)) return true;
    }
    return false;
  });
  taintedCache[r.id] = result;
  return result;
}

let checked = 0, within = 0, excluded = 0, delisted = 0, tainted = 0, noCode = 0, noOwnCost = 0, liveTallyWorks = 0, singleComponentTrivial = 0, multiLineNoOwnCost = 0, tallyFailed = 0;
const mismatches = [], withinList = [];
const noCodeList = [], noOwnCostList = [], taintedList = [], multiLineNoOwnCostList = [], delistedList = [], excludedList = [], singleComponentTrivialList = [];

recipes.forEach(function (r) {
  if (!r.code) { noCode++; noCodeList.push({ code: r.code || "", name: r.name, id: r.id }); return; }
  if (r.code === "NEW" || /^new$/i.test(r.code.trim())) { noCode++; noCodeList.push({ code: r.code, name: r.name, id: r.id }); return; } // draft/placeholder, not a real catalogue item
  if (KNOWN_BAD_RECIPE_CODES.has(r.code)) { excluded++; excludedList.push({ code: r.code, name: r.name, id: r.id }); return; }
  if (isTainted(r)) { tainted++; taintedList.push({ code: r.code, name: r.name, id: r.id }); return; }
  if (/delist/i.test(r.name || "")) { delisted++; delistedList.push({ code: r.code, name: r.name, id: r.id }); return; }
  if (!r.ownCost || r.ownCost <= 0) {
    // IMPORTANT: no stored ownCost does NOT mean "no cost"/"broken" — the app already falls
    // back to live-tallying from the recipe's own ingredient lines whenever ownCost is unset
    // (same fallback verified for the duplicate-recipe fix), so most of these already show a
    // perfectly correct cost on screen. Only count it as a genuine gap when even that live
    // fallback comes back at 0 (e.g. a truly empty/zero-cost recipe, not just an unimported one).
    var liveFallback = 0;
    try { liveFallback = getRecipeTotalCost(r, ingredients, recipes); } catch (e) {}
    if (liveFallback > 0) {
      liveTallyWorks++;
      // Single-component wrapper (1 line, a straight pass-through of one ingredient/sub-recipe)
      // can never disagree with its own tally — there's nothing to compare, it IS the one
      // ingredient's cost. Only a multi-line recipe with no cached ownCost is worth tracking,
      // since that's the case where a future recalc could meaningfully drift from what's shown.
      if ((r.ingredients || []).length > 1) {
        multiLineNoOwnCost++;
        multiLineNoOwnCostList.push({ code: r.code, name: r.name, id: r.id, lines: r.ingredients.length, liveTally: +liveFallback.toFixed(4) });
      } else {
        singleComponentTrivial++;
        singleComponentTrivialList.push({ code: r.code, name: r.name, id: r.id, liveTally: +liveFallback.toFixed(4) });
      }
      return;
    }
    noOwnCost++; noOwnCostList.push({ code: r.code, name: r.name, id: r.id, ownCost: r.ownCost, liveTally: liveFallback });
    return;
  }

  let tally;
  try {
    tally = computeTopLevelTally(r, ingredients, recipes);
  } catch (e) {
    tallyFailed++;
    return;
  }
  if (tally == null || !isFinite(tally) || tally <= 0) { tallyFailed++; return; }

  checked++;
  const used = r.ownCost;
  const diffPct = Math.abs(used - tally) / used * 100;
  if (diffPct <= 0.5) {
    within++;
    withinList.push({ code: r.code, name: r.name, used: +used.toFixed(4), tally: +tally.toFixed(4), diffPct: +diffPct.toFixed(2) });
  } else {
    mismatches.push({ code: r.code, name: r.name, used: +used.toFixed(4), tally: +tally.toFixed(4), diffPct: +diffPct.toFixed(2) });
  }
});

mismatches.sort(function (a, b) { return b.diffPct - a.diffPct; });

console.log("Checked:", checked, "Within 0.5%:", within, "Excluded (known-bad):", excluded, "Excluded (tainted by known-bad):", tainted, "Excluded (delisted):", delisted);
console.log("No code/placeholder:", noCode, "GENUINELY zero-cost (real gap):", noOwnCost, "Tally failed/zero:", tallyFailed);
console.log("No cached cost, single-component pass-through (trivially correct, not tracked):", singleComponentTrivial);
console.log("No cached cost, MULTI-LINE recipe (live-tallied, worth tracking):", multiLineNoOwnCost);
console.log("Total recipes in pull:", recipes.length, "| Reconciles:", (checked + excluded + tainted + delisted + noCode + noOwnCost + singleComponentTrivial + multiLineNoOwnCost + tallyFailed) === recipes.length);
console.log("Accuracy: " + (within / checked * 100).toFixed(1) + "%");
console.log("Remaining mismatches:", mismatches.length);

fs.writeFileSync(path.join(root, ".scan", "mismatches_final.json"), JSON.stringify(mismatches, null, 2));
fs.writeFileSync(path.join(root, ".scan", "no_code_list.json"), JSON.stringify(noCodeList, null, 2));
fs.writeFileSync(path.join(root, ".scan", "no_owncost_list.json"), JSON.stringify(noOwnCostList, null, 2));
fs.writeFileSync(path.join(root, ".scan", "multi_line_no_owncost_list.json"), JSON.stringify(multiLineNoOwnCostList, null, 2));
fs.writeFileSync(path.join(root, ".scan", "tainted_list.json"), JSON.stringify(taintedList, null, 2));
fs.writeFileSync(path.join(root, ".scan", "delisted_list.json"), JSON.stringify(delistedList, null, 2));
fs.writeFileSync(path.join(root, ".scan", "excluded_known_bad_list.json"), JSON.stringify(excludedList, null, 2));
fs.writeFileSync(path.join(root, ".scan", "single_component_trivial_list.json"), JSON.stringify(singleComponentTrivialList, null, 2));
fs.writeFileSync(path.join(root, ".scan", "within_list.json"), JSON.stringify(withinList, null, 2));

// CSV export
const baseUrl = "http://localhost:5055/?recipe=";
let csv = "Code,Name,Used (Stored),Tally (Live Recalc),Diff %,Link\n";
mismatches.forEach(function (m) {
  const name = '"' + String(m.name).replace(/"/g, '""') + '"';
  csv += [m.code, name, m.used, m.tally, m.diffPct, baseUrl + m.code].join(",") + "\n";
});
fs.writeFileSync(path.join(root, ".scan", "stale_recipes_to_review2.csv"), csv);
console.log("CSV written.");
