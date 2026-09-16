// NutriCalc — Reports & Labels
(function () {
  "use strict";

  var Data = window.NutriCalcData;
  var Ingredients = window.NutriCalcIngredients;
  var Recipes = window.NutriCalcRecipes;
  var HFSS = window.NutriCalcHFSS;

  function calcSubRecipeCost(subRec, ingredients, visited) {
    if (typeof window.calcSubRecipeCost === "function") return window.calcSubRecipeCost(subRec, ingredients, visited);
    visited = visited || {};
    if (subRec.id && visited[subRec.id]) return 0;
    if (subRec.id) visited[subRec.id] = true;
    var totalG = (subRec.ingredients || []).reduce(function (s, ri) {
      return s + Data.qtyToGrams(ri.qty, ri.uom);
    }, 0);
    if (totalG <= 0) return 0;
    var cost = 0;
    (subRec.ingredients || []).forEach(function (ri) {
      if (ri.subRecipeId) {
        var sr = Recipes.getRecipes().find(function (r) { return r.id === ri.subRecipeId; });
        if (sr && !visited[ri.subRecipeId]) cost += calcSubRecipeCost(sr, ingredients, visited) * (Data.qtyToGrams(ri.qty, ri.uom) / 1000);
      } else {
        var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
        if (ing) cost += (ing.cost || 0) * Data.qtyToCostBase(ri.qty, ri.uom, ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || "KG");
      }
    });
    return (cost / totalG) * 1000;
  }

  function populateReportSelect() {
    var sel = document.getElementById("report-recipe-select");
    if (!sel) return;
    var recipes = Recipes.getRecipes();
    sel.innerHTML = "<option value=\"\">— Choose a recipe —</option><option value=\"__all__\">— All recipes —</option>" + recipes.map(function (r) { return '<option value="' + r.id + '">' + r.name + "</option>"; }).join("");
  }

  function buildReportHtmlForRecipe(r, type, ingredients) {
    var n = Recipes.calcRecipeNutrition(r, ingredients);
    var h = HFSS.calcHFSS(r, ingredients);
    var serving = r.serving || 100;
    var s = serving / 100;
    var RI = Data.RI;
    var html = "";
    if (type === "nutrition" || type === "full") {
      html += '<div class="card"><div class="card-header"><h2>Nutrition Declaration — ' + r.name + '</h2></div><table class="data-table"><thead><tr><th>Nutrient</th><th>Per 100g</th><th>Per ' + serving + 'g</th><th>%RI</th></tr></thead><tbody>' +
        '<tr class="bold"><td>Energy</td><td class="num">' + Data.round(n.kj) + " kJ / " + Data.round(n.kcal) + " kcal</td><td class=\"num\">" + Data.round(n.kj * s) + " kJ / " + Data.round(n.kcal * s) + " kcal</td><td class=\"num\">" + Data.round(n.kcal / RI.kcal * 100) + "%</td></tr>" +
        '<tr class="bold"><td>Fat</td><td class="num">' + Data.round(n.fat) + "g</td><td class=\"num\">" + Data.round(n.fat * s) + "g</td><td class=\"num\">" + Data.round(n.fat / RI.fat * 100) + "%</td></tr>" +
        "<tr><td style=\"padding-left:16px\">of which saturates</td><td class=\"num\">" + Data.round(n.sat) + "g</td><td class=\"num\">" + Data.round(n.sat * s) + "g</td><td class=\"num\">" + Data.round(n.sat / RI.saturates * 100) + "%</td></tr>" +
        '<tr class="bold"><td>Carbohydrate</td><td class="num">' + Data.round(n.carb) + "g</td><td class=\"num\">" + Data.round(n.carb * s) + "g</td><td class=\"num\">" + Data.round(n.carb / RI.carbs * 100) + "%</td></tr>" +
        "<tr><td style=\"padding-left:16px\">of which sugars</td><td class=\"num\">" + Data.round(n.sugar) + "g</td><td class=\"num\">" + Data.round(n.sugar * s) + "g</td><td class=\"num\">" + Data.round(n.sugar / RI.sugars * 100) + "%</td></tr>" +
        '<tr class="bold"><td>Fibre</td><td class="num">' + Data.round(n.fibre) + "g</td><td class=\"num\">" + Data.round(n.fibre * s) + "g</td><td class=\"num\"></td></tr>" +
        '<tr class="bold"><td>Protein</td><td class="num">' + Data.round(n.protein) + "g</td><td class=\"num\">" + Data.round(n.protein * s) + "g</td><td class=\"num\">" + Data.round(n.protein / RI.protein * 100) + "%</td></tr>" +
        '<tr class="bold"><td>Salt</td><td class="num">' + Data.round(n.salt, 2) + "g</td><td class=\"num\">" + Data.round(n.salt * s, 2) + "g</td><td class=\"num\">" + Data.round(n.salt / RI.salt * 100) + "%</td></tr></tbody></table></div>";
    }
    if (type === "hfss" || type === "full") {
      html += '<div class="card"><div class="card-header"><h2>HFSS / Nutrient Profile — ' + r.name + '</h2><span class="badge ' + (h.isHFSS ? "badge-red" : "badge-green") + '">' + (h.isHFSS ? "HFSS" : "Non-HFSS") + '</span></div><p style="font-size:14px;font-weight:600;margin-bottom:8px">Total Score: ' + h.total + " (" + (r.type === "food" ? "Food threshold: 4" : "Drink threshold: 1") + ")</p><table class=\"data-table\"><thead><tr><th>Component</th><th>Points</th></tr></thead><tbody>" +
        "<tr><td>Energy (A)</td><td class=\"num\">+" + h.energyPts + "</td></tr><tr><td>Saturated Fat (A)</td><td class=\"num\">+" + h.satPts + "</td></tr><tr><td>Sugars (A)</td><td class=\"num\">+" + h.sugarPts + "</td></tr><tr><td>Sodium (A)</td><td class=\"num\">+" + h.sodiumPts + "</td></tr>" +
        "<tr class=\"bold\"><td>Total A Points</td><td class=\"num\">" + h.aPoints + "</td></tr><tr><td>FVN (C)</td><td class=\"num\">−" + h.fvnPts + "</td></tr><tr><td>Fibre (C)</td><td class=\"num\">−" + h.fibrePts + "</td></tr>" +
        "<tr><td>Protein (C) " + (h.proteinExcluded ? "(excluded)" : "") + "</td><td class=\"num\">−" + (h.proteinExcluded ? 0 : h.proteinPts) + "</td></tr><tr class=\"bold\"><td>Total C Points</td><td class=\"num\">" + h.cPoints + "</td></tr></tbody></table></div>";
    }
    if (type === "allergens" || type === "full") {
      var recipes = Recipes.getRecipes();
      var present = new Set();
      (r.ingredients || []).forEach(function (ri) {
        if (ri.subRecipeId) {
          var subRec = recipes.find(function (rec) { return rec.id === ri.subRecipeId; });
          if (subRec) (subRec.ingredients || []).forEach(function (sri) {
            var sing = sri.ingredientId ? ingredients.find(function (i) { return i.id === sri.ingredientId; }) : null;
            if (sing) (sing.allergens || []).forEach(function (a) { present.add(a); });
          });
        } else {
          var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
          if (ing) (ing.allergens || []).forEach(function (a) { present.add(a); });
        }
      });
      html += '<div class="card"><div class="card-header"><h2>Allergen Report — ' + r.name + '</h2></div><div class="allergen-tags">' + Data.EU_ALLERGENS.map(function (a) {
        return '<span class="allergen-tag ' + (present.has(a) ? "allergen-present" : "allergen-absent") + '">' + (present.has(a) ? "⚠ " : "") + a + "</span>";
      }).join("") + "</div></div>";
    }
    if (type === "ingredients" || type === "full") {
      var recipes = Recipes.getRecipes();
      var totalWeight = (r.ingredients || []).reduce(function (s, ri) { return s + Data.qtyToGrams(ri.qty, ri.uom); }, 0);
      var sortedIng = (r.ingredients || []).slice().sort(function (a, b) { return Data.qtyToGrams(b.qty, b.uom) - Data.qtyToGrams(a.qty, a.uom); });
      var names = sortedIng.map(function (ri) {
        var namePart; var allergens = [];
        if (ri.subRecipeId) {
          var subRec = recipes.find(function (rec) { return rec.id === ri.subRecipeId; });
          if (!subRec) return "";
          namePart = subRec.name.split(",")[0];
          (subRec.ingredients || []).forEach(function (sri) {
            var sing = sri.ingredientId ? ingredients.find(function (i) { return i.id === sri.ingredientId; }) : null;
            if (sing) (sing.allergens || []).forEach(function (a) { if (allergens.indexOf(a) === -1) allergens.push(a); });
          });
        } else {
          var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
          if (!ing) return "";
          namePart = ing.name.split(",")[0];
          allergens = ing.allergens || [];
        }
        var qtyG = Data.qtyToGrams(ri.qty, ri.uom);
        var pct = totalWeight > 0 ? Data.round(qtyG / totalWeight * 100) : 0;
        allergens.forEach(function (a) {
          a.split(" ").forEach(function (w) { namePart = namePart.replace(new RegExp("\\b" + w + "\\b", "gi"), w.toUpperCase()); });
        });
        return "<b>" + namePart + "</b> (" + pct + "%)";
      });
      html += '<div class="card"><div class="card-header"><h2>Ingredient Declaration — ' + r.name + '</h2></div><p style="font-size:13px;line-height:1.7"><strong>Ingredients:</strong> ' + names.join(", ") + ".</p></div>";
    }
    if (type === "costing" || type === "full") {
      var recipes = Recipes.getRecipes();
      var totalCost = 0;
      (r.ingredients || []).forEach(function (ri) {
        if (ri.subRecipeId) {
          var subRec = recipes.find(function (rec) { return rec.id === ri.subRecipeId; });
          if (subRec) {
            var subRecipeUom = (subRec.costUOM || subRec.uom || subRec.serving_uom || "G").toString().toUpperCase();
            var subCostPerUom = (typeof window.getSubRecipeCostPerUom === "function") ? window.getSubRecipeCostPerUom(subRec, ingredients, subRecipeUom) : calcSubRecipeCost(subRec, ingredients);
            var costBase = (subRecipeUom === "KG" || subRecipeUom === "G") ? Data.qtyToCostBase(ri.qty, ri.uom, "KG") : Data.qtyToCostBase(ri.qty, ri.uom || "G", subRecipeUom);
            totalCost += subCostPerUom * costBase;
          }
        } else {
          var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
          if (ing) totalCost += (ing.cost || 0) * Data.qtyToCostBase(ri.qty, ri.uom, ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || "KG");
        }
      });
      var totalWeight = (r.ingredients || []).reduce(function (s, ri) { return s + Data.qtyToGrams(ri.qty, ri.uom); }, 0);
      var rNut = Recipes.calcRecipeNutrition(r, ingredients);
      var rows = (r.ingredients || []).map(function (ri) {
        var name; var c; var costPerKg;
        if (ri.subRecipeId) {
          var subRec = recipes.find(function (rec) { return rec.id === ri.subRecipeId; });
          if (!subRec) return "";
          var subRecipeUom = (subRec.costUOM || subRec.uom || subRec.serving_uom || "G").toString().toUpperCase();
          costPerKg = (typeof window.getSubRecipeCostPerUom === "function") ? window.getSubRecipeCostPerUom(subRec, ingredients, subRecipeUom) : calcSubRecipeCost(subRec, ingredients);
          c = costPerKg * Data.qtyToCostBase(ri.qty, ri.uom || "G", subRecipeUom);
          name = subRec.name;
        } else {
          var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
          if (!ing) return "";
          c = (ing.cost || 0) * Data.qtyToCostBase(ri.qty, ri.uom, ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || "KG");
          costPerKg = ing.cost || 0;
          name = ing.name;
        }
        var pct = totalCost > 0 ? Data.round(c / totalCost * 100) : 0;
        return "<tr><td>" + name + "</td><td class=\"num\">" + ri.qty + (ri.uom || "G") + "</td><td class=\"num\">£" + costPerKg.toFixed(2) + "</td><td class=\"num bold\">£" + c.toFixed(3) + "</td><td class=\"num\">" + pct + "%</td></tr>";
      }).join("");
      var costPer100 = totalWeight > 0 ? (totalCost / totalWeight * 100).toFixed(2) : "0.00";
      var costPerKg = totalWeight > 0 ? (totalCost / totalWeight * 1000).toFixed(2) : "0.00";
      var costPerServing = totalWeight > 0 ? (totalCost * (serving / totalWeight)).toFixed(2) : "0.00";
      var totalKcal = rNut.kcal * (totalWeight / 100);
      var costPerKcal = totalKcal > 0 ? (totalCost / totalKcal).toFixed(4) : "—";
      html += '<div class="card"><div class="card-header"><h2>Recipe Costing — ' + r.name + '</h2></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px">' +
        '<div style="background:var(--nc-gray-50);padding:8px 12px;border-radius:6px"><div style="font-size:10px;font-weight:600;color:var(--nc-gray-400);text-transform:uppercase">Total Cost</div><div style="font-size:18px;font-weight:700;font-family:var(--nc-mono)">£' + totalCost.toFixed(2) + '</div></div>' +
        '<div style="background:var(--nc-gray-50);padding:8px 12px;border-radius:6px"><div style="font-size:10px;font-weight:600;color:var(--nc-gray-400);text-transform:uppercase">Per Serving (' + serving + 'g)</div><div style="font-size:18px;font-weight:700;font-family:var(--nc-mono)">£' + costPerServing + '</div></div>' +
        '<div style="background:var(--nc-gray-50);padding:8px 12px;border-radius:6px"><div style="font-size:10px;font-weight:600;color:var(--nc-gray-400);text-transform:uppercase">Per 100g</div><div style="font-size:18px;font-weight:700;font-family:var(--nc-mono)">£' + costPer100 + '</div></div>' +
        '<div style="background:var(--nc-gray-50);padding:8px 12px;border-radius:6px"><div style="font-size:10px;font-weight:600;color:var(--nc-gray-400);text-transform:uppercase">Per kg</div><div style="font-size:18px;font-weight:700;font-family:var(--nc-mono)">£' + costPerKg + '</div></div></div>' +
        '<table class="data-table"><thead><tr><th>Ingredient</th><th>Qty</th><th>Cost/kg</th><th>Line Cost</th><th>% of Total</th></tr></thead><tbody>' + rows + '</tbody><tfoot><tr style="border-top:2px solid var(--nc-gray-300)"><td class="bold">TOTAL</td><td class="num bold">' + Data.round(totalWeight) + "g</td><td></td><td class=\"num bold\">£" + totalCost.toFixed(2) + "</td><td class=\"num bold\">100%</td></tr></tfoot></table></div>";
    }
    return html;
  }

  function previewReport() {
    var recId = document.getElementById("report-recipe-select").value;
    var type = document.getElementById("report-type-select").value;
    var preview = document.getElementById("report-preview");
    if (!preview) return;
    if (!recId) { preview.innerHTML = ""; return; }
    var recipes = Recipes.getRecipes();
    var ingredients = Ingredients.getIngredients();
    var html = "";
    if (recId === "__all__") {
      recipes.forEach(function (r) {
        html += '<div class="report-recipe-block" style="margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid var(--nc-gray-200)">';
        html += '<h3 style="font-size:16px;font-weight:700;color:var(--nc-secondary);margin-bottom:12px">' + r.name + '</h3>';
        html += buildReportHtmlForRecipe(r, type, ingredients);
        html += "</div>";
      });
      if (recipes.length === 0) html = "<p style=\"color:var(--nc-gray-500);font-size:14px\">No recipes. Add recipes in Recipe Centre first.</p>";
    } else {
      var r = recipes.find(function (rec) { return rec.id === recId; });
      if (r) html = buildReportHtmlForRecipe(r, type, ingredients);
    }
    preview.innerHTML = html;
  }

  function printLabel() {
    window.print();
  }

  window.populateReportSelect = populateReportSelect;
  window.previewReport = previewReport;
  window.printLabel = printLabel;
})();
