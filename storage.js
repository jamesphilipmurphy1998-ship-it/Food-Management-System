// NutriCalc — storage abstraction for ingredients and recipes
// Primary store is backend API. Local adapter remains for fallback/testing.
window.NutriCalcStorage = (function () {
  "use strict";

  var KEYS = { ingredients: "nc_ingredients", recipes: "nc_recipes" };

  // ─── Local adapter (current default): persists in browser localStorage ───
  function localGetIngredients() {
    try {
      var raw = localStorage.getItem(KEYS.ingredients);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function localSetIngredients(arr) {
    try { localStorage.setItem(KEYS.ingredients, JSON.stringify(arr || [])); } catch (e) {}
  }
  function localGetRecipes() {
    try {
      var raw = localStorage.getItem(KEYS.recipes);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function localSetRecipes(arr) {
    try { localStorage.setItem(KEYS.recipes, JSON.stringify(arr || [])); } catch (e) {}
  }
  var API_BASE_URL = (typeof window !== "undefined" && window.location) ? (window.location.origin + "/api") : "/api";
  var useApiMode = true;
  var ingredientsCache = localGetIngredients();
  var recipesCache = localGetRecipes();
  var ingredientsSaveQueued = false;
  var recipesSaveQueued = false;
  var refreshInFlight = false;

  function emitStorageUpdated(key, data) {
    try {
      window.dispatchEvent(new CustomEvent("nutricalc-storage-updated", { detail: { key: key, data: data } }));
    } catch (e) {}
  }

  async function apiRequestAsync(method, path, body) {
    if (!API_BASE_URL) return null;
    var response = await fetch(API_BASE_URL + path, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body != null ? JSON.stringify(body) : undefined
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    var text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
  }

  function queueSaveIngredients() {
    if (!useApiMode || !API_BASE_URL || ingredientsSaveQueued) return;
    ingredientsSaveQueued = true;
    setTimeout(function () {
      ingredientsSaveQueued = false;
      apiRequestAsync("PUT", "/ingredients", ingredientsCache).catch(function () {
        localSetIngredients(ingredientsCache);
      });
    }, 0);
  }

  function queueSaveRecipes() {
    if (!useApiMode || !API_BASE_URL || recipesSaveQueued) return;
    recipesSaveQueued = true;
    setTimeout(function () {
      recipesSaveQueued = false;
      apiRequestAsync("PUT", "/recipes", recipesCache).catch(function () {
        localSetRecipes(recipesCache);
      });
    }, 0);
  }

  async function refreshFromApi() {
    if (!useApiMode || !API_BASE_URL || refreshInFlight) return;
    refreshInFlight = true;
    try {
      var results = await Promise.all([
        apiRequestAsync("GET", "/ingredients?includeUnlinked=true", null),
        apiRequestAsync("GET", "/recipes", null)
      ]);
      var ingredients = Array.isArray(results[0]) ? results[0] : ingredientsCache;
      var recipes = Array.isArray(results[1]) ? results[1] : recipesCache;
      if (Array.isArray(results[0])) {
        ingredients = results[0].map(function (ing) {
          var codeB = (ing.codeB != null && String(ing.codeB) !== "") ? ing.codeB : (ing.CodeB != null && String(ing.CodeB) !== "") ? ing.CodeB : "";
          var costUom = (ing.costUom != null && String(ing.costUom) !== "") ? ing.costUom : (ing.costUOM != null && String(ing.costUOM) !== "") ? ing.costUOM : (ing.CostUom != null && String(ing.CostUom) !== "") ? ing.CostUom : (ing.CostUOM != null && String(ing.CostUOM) !== "") ? ing.CostUOM : (ing.cost_uom != null && String(ing.cost_uom) !== "") ? ing.cost_uom : "";
          var out = { ...ing, codeB: codeB, costUom: costUom };
          if (out.CodeB !== undefined) delete out.CodeB;
          if (out.costUOM !== undefined) delete out.costUOM;
          if (out.CostUom !== undefined) delete out.CostUom;
          if (out.CostUOM !== undefined) delete out.CostUOM;
          return out;
        });
        ingredientsCache = ingredients;
        localSetIngredients(ingredientsCache);
        emitStorageUpdated("ingredients", ingredientsCache);
      }
      if (Array.isArray(results[1])) {
        recipes = normalizeRecipeIngredientUoms(recipes, ingredients);
        recipesCache = recipes;
        localSetRecipes(recipesCache);
        emitStorageUpdated("recipes", recipesCache);
      }
    } catch (e) {
      // Keep local cache on network/API errors.
    } finally {
      refreshInFlight = false;
    }
  }

  /** Set each recipe ingredient line's uom to match the ingredient's cost UOM when we have the ingredient. */
  function normalizeRecipeIngredientUoms(recipes, ingredients) {
    if (!Array.isArray(recipes) || !Array.isArray(ingredients)) return recipes;
    return recipes.map(function (r) {
      if (!r || !Array.isArray(r.ingredients)) return r;
      var lines = r.ingredients.map(function (ri) {
        if (!ri.ingredientId) return ri;
        var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
        if (!ing) return ri;
        var costUom = (ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || "").toString().trim().toUpperCase();
        if (!costUom) return ri;
        return { ...ri, uom: costUom };
      });
      return { ...r, ingredients: lines };
    });
  }

  function getIngredients() { return ingredientsCache; }
  function setIngredients(arr) {
    ingredientsCache = Array.isArray(arr) ? arr : [];
    localSetIngredients(ingredientsCache);
    queueSaveIngredients();
  }
  function getRecipes() { return recipesCache; }
  function setRecipes(arr) {
    var list = Array.isArray(arr) ? arr : [];
    list = normalizeRecipeIngredientUoms(list, ingredientsCache);
    recipesCache = list;
    localSetRecipes(recipesCache);
    queueSaveRecipes();
  }

  // Initial non-blocking refresh from backend.
  setTimeout(function () { refreshFromApi(); }, 0);

  return {
    getIngredients: getIngredients,
    setIngredients: setIngredients,
    getRecipes: getRecipes,
    setRecipes: setRecipes,
    refreshFromApi: refreshFromApi,
    useLocal: function () { useApiMode = false; },
    useApi: function (baseUrl) {
      API_BASE_URL = baseUrl || API_BASE_URL;
      useApiMode = true;
      refreshFromApi();
    },
    isUsingApi: function () { return useApiMode; }
  };
})();
