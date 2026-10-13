// Offline test of storage.js normalizeRecipeIngredientUoms (via setRecipes/getRecipes): `node scripts/test-storage-uom.js`
// Loads the REAL storage.js with pretend browser parts; no network, nothing live. Checks: convertible units keep their unit AND number
// (5 G stays 5 G for a KG-costed item), non-convertible units are still forced as before, and nothing else on a recipe changes.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const store = {};
const sandbox = {
  console,
  setTimeout: () => 0,
  clearTimeout: () => {},
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  fetch: () => Promise.reject(new Error("offline test")),
  location: { origin: "http://localhost", protocol: "http:", hostname: "localhost", search: "" },
  document: { dispatchEvent() {}, addEventListener() {} },
  CustomEvent: function () {},
  Event: function () {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(process.env.STORAGE_JS || path.join(__dirname, "..", "storage.js"), "utf8"), sandbox);
const S = sandbox.NutriCalcStorage;
S.useLocal();

const ing = (id, uom) => ({ id, name: id, costUOM: uom, cost: 1 });
S.setIngredients([ing("kg", "KG"), ing("l", "L"), ing("each", "EACH"), ing("m", "M"), ing("g", "G")]);
const line = (id, qty, uom) => ({ ingredientId: id, qty, uom, scrapPct: 0, fvnOverride: null });
const recipe = { id: "r1", name: "Test", code: "X", serving: 100, ingredients: [
  line("kg", 5, "G"),        // 0: THE BUG: 5 G for a KG-costed item
  line("kg", 2, "KG"),       // 1: already the cost unit
  line("l", 250, "ML"),      // 2: ML for an L-costed item
  line("kg", 300, "ML"),     // 3: volume for a weight-costed item (density conversion exists in the app)
  line("each", 3, "G"),      // 4: grams for an EACH item: cannot convert, forced as before
  line("kg", 1, "EACH"),     // 5: EACH for a KG item: cannot convert, forced as before
  line("m", 2, "G"),         // 6: grams for a metre item: forced as before
  line("kg", 7, ""),         // 7: no unit stored: forced as before
  line("g", 40, "KG"),       // 8: KG line for a G-costed item: convertible, kept
  { subRecipeId: "sub1", qty: 170, uom: "G" },  // 9: sub-recipe line: never touched
] };
S.setRecipes([JSON.parse(JSON.stringify(recipe))]);
const out = S.getRecipes()[0].ingredients;
const same = (i, uom, qty) => { assert.strictEqual(out[i].uom, uom, "line " + i + " unit"); assert.strictEqual(out[i].qty, qty, "line " + i + " qty"); };
same(0, "G", 5);    console.log("PASS 5 G for a KG-costed item KEEPS its unit and number (the bug)");
same(1, "KG", 2);   console.log("PASS KG for KG unchanged");
same(2, "ML", 250); console.log("PASS ML for an L-costed item keeps its unit and number");
same(3, "ML", 300); console.log("PASS ML for a KG-costed item keeps its unit and number (as app.js allows)");
same(4, "EACH", 3); console.log("PASS grams for an EACH item still forced as before");
same(5, "KG", 1);   console.log("PASS EACH for a KG item still forced as before");
same(6, "M", 2);    console.log("PASS grams for a metre item still forced as before");
same(7, "KG", 7);   console.log("PASS a line with no unit still forced as before");
same(8, "KG", 40);  console.log("PASS KG line for a G-costed item keeps its unit and number");
same(9, "G", 170);  assert.strictEqual(out[9].subRecipeId, "sub1"); console.log("PASS sub-recipe line untouched");
// nothing else changed: every other field of every line and of the recipe
const r2 = S.getRecipes()[0];
["id", "name", "code", "serving"].forEach((k) => assert.strictEqual(r2[k], recipe[k], k + " changed"));
out.forEach((l, i) => { Object.keys(recipe.ingredients[i]).filter((k) => k !== "uom").forEach((k) => assert.deepStrictEqual(l[k], recipe.ingredients[i][k], "line " + i + " field " + k + " changed")); });
assert.strictEqual(out.length, recipe.ingredients.length);
console.log("PASS nothing except the forced units changed (every other field of the recipe and its 10 lines identical)");
console.log("\nAll offline checks passed; nothing live was touched.");
process.exit(0);
