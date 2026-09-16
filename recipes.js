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

  function setRecipes(arr) {
    recipes = arr || [];
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
    saveData();
  }

  function calcRecipeNutrition(recipe, ingredients, visited) {
    visited = visited || {};
    if (recipe.id && visited[recipe.id]) return { kj: 0, kcal: 0, fat: 0, sat: 0, carb: 0, sugar: 0, fibre: 0, protein: 0, salt: 0, totalWeight: 0 };
    if (recipe.id) visited[recipe.id] = true;
    var recipes = getRecipes();
    var totalWeight = (recipe.ingredients || []).reduce(function (s, ri) {
      return s + (Data.qtyToGrams ? Data.qtyToGrams(ri.qty, ri.uom) : ri.qty);
    }, 0);
    if (totalWeight === 0) return { kj: 0, kcal: 0, fat: 0, sat: 0, carb: 0, sugar: 0, fibre: 0, protein: 0, salt: 0, totalWeight: 0 };
    var kj = 0, kcal = 0, fat = 0, sat = 0, carb = 0, sugar = 0, fibre = 0, protein = 0, salt = 0;
    (recipe.ingredients || []).forEach(function (ri) {
      var qtyG = Data.qtyToGrams ? Data.qtyToGrams(ri.qty, ri.uom) : ri.qty;
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
    updateRecipeOwnCost: updateRecipeOwnCost
  };
})();
