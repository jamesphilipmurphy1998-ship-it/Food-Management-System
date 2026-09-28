// Data-quality audit for ingredients — there's no BOM "tally vs sheet" concept for ingredients
// the way there is for recipes (an ingredient's cost IS the source value, nothing separate to
// compare it against), so this checks real structural/data problems instead: missing cost,
// missing nutrition, blank identifiers, duplicate codes. See ACCURACY-SCAN.md for how this is
// used alongside scripts/accuracy-scan.js (the recipe-cost checker).
const fs = require("fs");
const path = require("path");
const root = "C:\\Dev\\NutriCost";

const ingredients = JSON.parse(fs.readFileSync(path.join(root, ".scan", "live_ingredients_final.json"), "utf8"));

function isPackagingItem(i) {
  var c = (i.cat || "").trim();
  var nameStart = (i.name || "").trim().toLowerCase();
  var PACKAGING_SUPPLIERS = [
    "Europac Packaging Ltd", "COVERIS FLEXIBLES UK LTD (BOARD)", "COVERIS FLEXIBLES UK LTD (LABELS)",
    "TRANSCEND PACKAGING LIMITED", "FAERCH UK LIMITED", "CCS McLAYS Ltd", "WRAPID MANUFACTURING LIMITED",
    "S.SHEARD & SON LTD", "ProAmpac London Limited", "COLPAC LTD"
  ];
  var supplierMatch = PACKAGING_SUPPLIERS.some(function (p) { return p.trim().toLowerCase() === (i.supplier || "").trim().toLowerCase(); });
  return c === "Packaging" || supplierMatch || nameStart.indexOf("nf ") === 0;
}

const noName = [], noCode = [], zeroCost = [], noNutrition = [], duplicateCodeGroups = [];

const byCode = new Map();
ingredients.forEach(function (i) {
  if (!i.name || !i.name.trim()) noName.push({ id: i.id, code: i.code, name: i.name });
  if (!i.code || !i.code.trim()) noCode.push({ id: i.id, code: i.code, name: i.name });
  if (!isPackagingItem(i) && (!i.cost || i.cost <= 0)) zeroCost.push({ id: i.id, code: i.code, name: i.name, cat: i.cat });
  var hasNutrition = (i.kcal || 0) > 0 || (i.protein || 0) > 0 || (i.fat || 0) > 0 || (i.carb || 0) > 0
    || (i.sat || 0) > 0 || (i.sugar || 0) > 0 || (i.fibre || 0) > 0 || (i.salt || 0) > 0;
  if (!isPackagingItem(i) && !hasNutrition) noNutrition.push({ id: i.id, code: i.code, name: i.name, cat: i.cat });
  if (i.code && i.code.trim()) {
    var key = i.code.trim().toLowerCase();
    if (!byCode.has(key)) byCode.set(key, []);
    byCode.get(key).push({ id: i.id, code: i.code, name: i.name });
  }
});
byCode.forEach(function (group, key) {
  if (group.length > 1) duplicateCodeGroups.push({ code: key, count: group.length, items: group });
});

console.log("Total ingredients:", ingredients.length);
console.log("No name:", noName.length);
console.log("No code:", noCode.length);
console.log("Zero/missing cost (excl. packaging):", zeroCost.length);
console.log("No nutrition values at all (excl. packaging):", noNutrition.length);
console.log("Duplicate codes (2+ ingredients sharing a code):", duplicateCodeGroups.length, "groups,", duplicateCodeGroups.reduce(function (s, g) { return s + g.count; }, 0), "ingredients involved");

fs.writeFileSync(path.join(root, ".scan", "ingredient_no_name.json"), JSON.stringify(noName, null, 2));
fs.writeFileSync(path.join(root, ".scan", "ingredient_no_code.json"), JSON.stringify(noCode, null, 2));
fs.writeFileSync(path.join(root, ".scan", "ingredient_zero_cost.json"), JSON.stringify(zeroCost, null, 2));
fs.writeFileSync(path.join(root, ".scan", "ingredient_no_nutrition.json"), JSON.stringify(noNutrition, null, 2));
fs.writeFileSync(path.join(root, ".scan", "ingredient_duplicate_codes.json"), JSON.stringify(duplicateCodeGroups, null, 2));
console.log("Lists written to .scan/");
