// NutriCalc — recipe store, CRUD, and nutrition calculation (persistence via NutriCalcStorage)
window.NutriCalcRecipes = (function () {
  "use strict";

  var Storage = window.NutriCalcStorage;
  var Data = window.NutriCalcData;
  var recipes = [];

  function loadData() {
    recipes = Storage ? Storage.getRecipes() : [];
    if (!Array.isArray(recipes)) recipes = [];
  }

  function saveData() {
    if (Storage) Storage.setRecipes(recipes);
  }

  function getRecipes() {
    return recipes;
  }

  // "Hold" mode — while true, setRecipes() still updates the in-memory array immediately (so
  // the UI keeps reflecting edits live) but skips the actual persist, and remembers that a save
  // is pending. Used by the recipe detail page to turn per-keystroke autosave into an explicit
  // Save button + leave-page prompt, without every individual editor function needing to know
  // about it. Actions that are already an explicit, deliberate save in their own right (approve
  // toggle, delete, duplicate, rename) call flushSave() right after, so they're never silently
  // held back by whatever hold state happens to be active.
  var holdSave = false;
  var pendingSave = false;
  function setHoldSave(v) {
    holdSave = !!v;
    if (holdSave) pendingSave = false;
  }
  function hasUnsavedChanges() {
    return pendingSave;
  }
  function flushSave() {
    pendingSave = false;
    saveData();
  }

  function setRecipes(arr) {
    recipes = arr || [];
    if (holdSave) { pendingSave = true; return; }
    saveData();
  }

  function saveRecipe(recipe) {
    var now = new Date().toISOString();
    var existing = recipe.id && recipes.find(function (r) { return r.id === recipe.id; });
    if (existing) {
      var idx = recipes.indexOf(existing);
      var versionHistory = (existing.versionHistory || []).slice();
      versionHistory.push(now);
      recipes[idx] = { ...existing, ...recipe, versionHistory: versionHistory };
    } else {
      recipes.push({ id: Data.genId(), ...recipe, created: now, versionHistory: [now] });
    }
    saveData();
  }

  function deleteRecipe(id) {
    recipes = recipes.filter(function (r) { return r.id !== id; });
    if (Storage && Storage.deleteRecipe) Storage.deleteRecipe(id);
  }

  // Mirrors app.js's isPackagingItem — recipes.js loads before app.js (see index.html script
  // order) so it can't reference that function directly; duplicated here rather than reordering
  // script loads. Keep in sync if the packaging-detection rule ever changes.
  function isPackagingItem(ing) {
    if (!ing) return false;
    var c = (ing.cat || "").trim();
    var nameStart = (ing.name || "").trim().toLowerCase();
    return c === "Packaging" || (Data.isPackagingBySupplier && Data.isPackagingBySupplier(ing.supplier)) || nameStart.indexOf("nf ") === 0;
  }

  function isSingleIngredientRecipeLocal(rec) {
    return !!(rec && rec.ingredients && rec.ingredients.length === 1 && rec.ingredients[0].ingredientId);
  }

  /** Weight (g) of 1 unit of this recipe's own UOM, for nutrition purposes — mirrors
   * getRecipeUnitWeightG in app.js so an EACH-based line here uses the recipe's real per-unit
   * weight instead of guessing. Manual override (rec.unitWeightG) wins; otherwise derived
   * recursively from the recipe's own lines. */
  function recipeUnitWeightGForNutrition(rec, ingredients, visited) {
    visited = visited || {};
    if (!rec) return 0;
    if (rec.id && visited[rec.id]) return 0;
    if (rec.id) visited[rec.id] = true;
    if (rec.unitWeightG && rec.unitWeightG > 0) return rec.unitWeightG;
    var recipes = getRecipes();
    var total = 0;
    (rec.ingredients || []).forEach(function (ri) { total += lineWeightGForNutrition(ri, ingredients, recipes, visited); });
    return total;
  }

  /** Weight (g) a single recipe line contributes to the nutrition weight denominator.
   * Packaging is excluded entirely (it isn't food and must not dilute kcal/100g), matching
   * costWeightForLine/recipeLineWeightForTotal in app.js. EACH lines use the ingredient's real
   * unitWeightG (or a sub-recipe's own derived unit weight) when known; otherwise excluded
   * rather than guessed — the previous flat "1 EACH = 100g" assumption silently distorted
   * per-100g nutrition for any EACH-counted line whose real weight differs from 100g. */
  function lineWeightGForNutrition(ri, ingredients, recipes, visited) {
    if (!ri) return 0;
    var uom = (ri.uom || "G").toString().toUpperCase();
    if (ri.ingredientId) {
      var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
      if (isPackagingItem(ing)) return 0;
      if (uom === "EACH") {
        var unitG = ing ? Number(ing.unitWeightG || 0) : 0;
        return unitG > 0 ? ri.qty * unitG : 0;
      }
      return Data.qtyToGrams ? Data.qtyToGrams(ri.qty, ri.uom) : ri.qty;
    }
    if (ri.subRecipeId) {
      var subRec = recipes.find(function (r) { return r.id === ri.subRecipeId; });
      if (!subRec) return 0;
      if (isSingleIngredientRecipeLocal(subRec)) {
        var baseLine = (subRec.ingredients || [])[0];
        var baseIng = baseLine && baseLine.ingredientId ? ingredients.find(function (i) { return i.id === baseLine.ingredientId; }) : null;
        if (isPackagingItem(baseIng)) return 0;
      }
      if (uom === "EACH") {
        var subUnitG = recipeUnitWeightGForNutrition(subRec, ingredients, Object.assign({}, visited || {}));
        return subUnitG > 0 ? ri.qty * subUnitG : 0;
      }
      return Data.qtyToGrams ? Data.qtyToGrams(ri.qty, ri.uom) : ri.qty;
    }
    return 0;
  }

  function calcRecipeNutrition(recipe, ingredients, visited) {
    visited = visited || {};
    if (recipe.id && visited[recipe.id]) return { kj: 0, kcal: 0, fat: 0, sat: 0, carb: 0, sugar: 0, fibre: 0, protein: 0, salt: 0, totalWeight: 0 };
    if (recipe.id) visited[recipe.id] = true;
    var recipes = getRecipes();
    var totalWeight = (recipe.ingredients || []).reduce(function (s, ri) {
      return s + lineWeightGForNutrition(ri, ingredients, recipes, visited);
    }, 0);
    if (totalWeight === 0) return { kj: 0, kcal: 0, fat: 0, sat: 0, carb: 0, sugar: 0, fibre: 0, protein: 0, salt: 0, totalWeight: 0 };
    var kj = 0, kcal = 0, fat = 0, sat = 0, carb = 0, sugar = 0, fibre = 0, protein = 0, salt = 0;
    (recipe.ingredients || []).forEach(function (ri) {
      var qtyG = lineWeightGForNutrition(ri, ingredients, recipes, visited);
      if (qtyG <= 0) return;
      var f = qtyG / 100;
      if (ri.subRecipeId) {
        var subRec = recipes.find(function (r) { return r.id === ri.subRecipeId; });
        if (subRec && !visited[ri.subRecipeId]) {
          var subNut = calcRecipeNutrition(subRec, ingredients, visited);
          kj += subNut.kj * f;
          kcal += subNut.kcal * f;
          fat += subNut.fat * f;
          sat += subNut.sat * f;
          carb += subNut.carb * f;
          sugar += subNut.sugar * f;
          fibre += subNut.fibre * f;
          protein += subNut.protein * f;
          salt += subNut.salt * f;
        }
      } else {
        var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
        if (!ing) return;
        kj += ing.kj * f;
        kcal += ing.kcal * f;
        fat += ing.fat * f;
        sat += ing.sat * f;
        carb += ing.carb * f;
        sugar += ing.sugar * f;
        fibre += ing.fibre * f;
        protein += ing.protein * f;
        salt += ing.salt * f;
      }
    });
    var scale = 100 / totalWeight;
    return {
      kj: kj * scale,
      kcal: kcal * scale,
      fat: fat * scale,
      sat: sat * scale,
      carb: carb * scale,
      sugar: sugar * scale,
      fibre: fibre * scale,
      protein: protein * scale,
      salt: salt * scale,
      totalWeight: totalWeight
    };
  }

  loadData();
  window.addEventListener("nutricalc-storage-updated", function (e) {
    var detail = e && e.detail;
    if (!detail || detail.key !== "recipes" || !Array.isArray(detail.data)) return;
    recipes = detail.data;
    if (typeof window.renderAll === "function") window.renderAll();
  });

  /** Yield %: portion of input weight retained after prep (chopping, trimming). Affects cost
   * only — nutrition per 100g is unchanged by yield loss (see calcSubRecipeCost/getSubRecipeCostPerUom
   * in app.js, which apply this as a cost multiplier). */
  function updateRecipeYieldPct(recipeId, value) {
    var r = recipes.find(function (rec) { return rec.id === recipeId; });
    if (!r) return;
    var pct = parseFloat(value);
    if (isNaN(pct) || pct <= 0 || pct > 100) pct = 100;
    r.yieldPct = pct;
    saveData();
  }

  /** Direct cost per kg from the source sheet/API for a single-ingredient sub-recipe —
   * authoritative over the derived-from-base cost when set (>0). 0 means "not supplied yet",
   * falling back to the derived link (see getSubRecipeTotalCost in app.js). */
  function updateRecipeOwnCost(recipeId, value) {
    var r = recipes.find(function (rec) { return rec.id === recipeId; });
    if (!r) return;
    var cost = parseFloat(value);
    r.ownCost = (isNaN(cost) || cost < 0) ? 0 : cost;
    saveData();
  }

  return {
    getRecipes: getRecipes,
    setRecipes: setRecipes,
    saveRecipe: saveRecipe,
    deleteRecipe: deleteRecipe,
    calcRecipeNutrition: calcRecipeNutrition,
    updateRecipeYieldPct: updateRecipeYieldPct,
    updateRecipeOwnCost: updateRecipeOwnCost,
    setHoldSave: setHoldSave,
    hasUnsavedChanges: hasUnsavedChanges,
    flushSave: flushSave
  };
})();
