// NutriCalc — ingredient store and CRUD (persistence via NutriCalcStorage)
window.NutriCalcIngredients = (function () {
  "use strict";

  var Storage = window.NutriCalcStorage;
  var Data = window.NutriCalcData;
  var ingredients = [];

  function loadData() {
    ingredients = Storage ? Storage.getIngredients() : [];
    if (!Array.isArray(ingredients)) ingredients = [];
  }

  function saveData() {
    if (Storage) Storage.setIngredients(ingredients);
  }

  function getIngredients() {
    return ingredients;
  }

  function setIngredients(arr) {
    ingredients = arr || [];
    saveData();
  }

  function saveIngredient(data) {
    var now = new Date().toISOString();
    var existing = data.id && ingredients.find(function (i) { return i.id === data.id; });
    if (existing) {
      var idx = ingredients.indexOf(existing);
      var versionHistory = (existing.versionHistory || []).slice();
      versionHistory.push(now);
      ingredients[idx] = { ...existing, ...data, versionHistory: versionHistory };
    } else {
      var id = Data.genId();
      ingredients.push({ id: id, ...data, versionHistory: [now] });
    }
    saveData();
  }

  function deleteIngredient(id) {
    ingredients = ingredients.filter(function (i) { return i.id !== id; });
    saveData();
  }

  function loadSampleIngredients() {
    var samples = Data.SAMPLE_INGREDIENTS;
    samples.forEach(function (s) {
      if (!ingredients.find(function (i) { return i.name === s.name; })) {
        ingredients.push({ id: Data.genId(), ...s });
      }
    });
    saveData();
  }

  function updateIngredientCost(ingId, value) {
    var ing = ingredients.find(function (i) { return i.id === ingId; });
    if (ing) {
      ing.cost = parseFloat(value) || 0;
      saveData();
    }
  }

  loadData();
  window.addEventListener("nutricalc-storage-updated", function (e) {
    var detail = e && e.detail;
    if (!detail || detail.key !== "ingredients" || !Array.isArray(detail.data)) return;
    ingredients = detail.data;
    //console.log(ingredients);
    if (typeof window.renderAll === "function") window.renderAll();
  });

  return {
    getIngredients: getIngredients,
    setIngredients: setIngredients,
    saveIngredient: saveIngredient,
    deleteIngredient: deleteIngredient,
    loadSampleIngredients: loadSampleIngredients,
    updateIngredientCost: updateIngredientCost
  };
})();
