// NutriCalc — UK NPM HFSS scoring, traffic lights, Nutri-Score
window.NutriCalcHFSS = (function () {
  "use strict";

  var Data = window.NutriCalcData;
  var Recipes = window.NutriCalcRecipes;

  function calcHFSS(recipe, ingredients) {
    var n = Recipes.calcRecipeNutrition(recipe, ingredients);
    var isFood = recipe.type === "food";

    var energyThresholds = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350];
    var energyPts = 0;
    for (var i = 0; i < energyThresholds.length; i++) {
      if (n.kj > energyThresholds[i]) energyPts = i + 1;
    }

    var satThresholds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    var satPts = 0;
    for (var i = 0; i < satThresholds.length; i++) {
      if (n.sat > satThresholds[i]) satPts = i + 1;
    }

    var sugarThresholds = [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45];
    var sugarPts = 0;
    for (var i = 0; i < sugarThresholds.length; i++) {
      if (n.sugar > sugarThresholds[i]) sugarPts = i + 1;
    }

    var sodiumMg = (n.salt / 2.5) * 1000;
    var sodiumThresholds = [90, 180, 270, 360, 450, 540, 630, 720, 810, 900];
    var sodiumPts = 0;
    for (var i = 0; i < sodiumThresholds.length; i++) {
      if (sodiumMg > sodiumThresholds[i]) sodiumPts = i + 1;
    }

    var aPoints = energyPts + satPts + sugarPts + sodiumPts;

    var recipes = Recipes.getRecipes();
    var totalWeight = (recipe.ingredients || []).reduce(function (s, ri) { return s + (Data.qtyToGrams ? Data.qtyToGrams(ri.qty, ri.uom) : ri.qty); }, 0);
    var fvnWeight = 0;
    (recipe.ingredients || []).forEach(function (ri) {
      var qtyG = Data.qtyToGrams ? Data.qtyToGrams(ri.qty, ri.uom) : ri.qty;
      if (ri.subRecipeId) {
        var subRec = recipes.find(function (r) { return r.id === ri.subRecipeId; });
        if (subRec) {
          var subNut = Recipes.calcRecipeNutrition(subRec, ingredients);
          var subTotal = subNut.totalWeight || 1;
          var subFvn = 0;
          (subRec.ingredients || []).forEach(function (sri) {
            var sing = ingredients.find(function (i) { return i.id === sri.ingredientId; });
            if (sing && sing.fvn) subFvn += (Data.qtyToGrams ? Data.qtyToGrams(sri.qty, sri.uom) : sri.qty);
          });
          fvnWeight += (qtyG / subTotal) * subFvn;
        }
      } else {
        var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
        if (ing && ing.fvn) fvnWeight += qtyG;
      }
    });
    var fvnPct = totalWeight > 0 ? (fvnWeight / totalWeight * 100) : 0;
    var fvnPts = 0;
    if (fvnPct >= 80) fvnPts = 5;
    else if (fvnPct >= 60) fvnPts = 2;
    else if (fvnPct >= 40) fvnPts = 1;

    var fibreThresholds = [3.0, 4.7, 6.3, 8.0, 9.7];
    var fibrePts = 0;
    for (var i = 0; i < fibreThresholds.length; i++) {
      if (n.fibre > fibreThresholds[i]) fibrePts = i + 1;
    }

    var proteinThresholds = [1.6, 3.2, 4.8, 6.4, 8.0];
    var proteinPts = 0;
    for (var i = 0; i < proteinThresholds.length; i++) {
      if (n.protein > proteinThresholds[i]) proteinPts = i + 1;
    }

    var cPoints;
    if (aPoints >= 11 && fvnPts < 5) {
      cPoints = fvnPts + fibrePts;
    } else {
      cPoints = fvnPts + fibrePts + proteinPts;
    }

    var total = aPoints - cPoints;
    var isHFSS = isFood ? total >= 4 : total >= 1;

    return {
      total: total,
      isHFSS: isHFSS,
      aPoints: aPoints,
      cPoints: cPoints,
      energyPts: energyPts,
      satPts: satPts,
      sugarPts: sugarPts,
      sodiumPts: sodiumPts,
      fvnPts: fvnPts,
      fibrePts: fibrePts,
      proteinPts: proteinPts,
      fvnPct: fvnPct,
      proteinExcluded: aPoints >= 11 && fvnPts < 5
    };
  }

  function getTrafficLight(nutrient, value) {
    var thresholds = {
      fat: { amber: 3.0, red: 17.5 },
      sat: { amber: 1.5, red: 5.0 },
      sugar: { amber: 5.0, red: 22.5 },
      salt: { amber: 0.3, red: 1.5 }
    };
    var t = thresholds[nutrient];
    if (!t) return "green";
    if (value > t.red) return "red";
    if (value > t.amber) return "amber";
    return "green";
  }

  function calcNutriScore(recipe, ingredients) {
    var h = calcHFSS(recipe, ingredients);
    var score = h.total;
    if (score <= -1) return { letter: "A", color: "#038141" };
    if (score <= 2) return { letter: "B", color: "#85BB2F" };
    if (score <= 10) return { letter: "C", color: "#FECB02" };
    if (score <= 18) return { letter: "D", color: "#EE8100" };
    return { letter: "E", color: "#E63E11" };
  }

  return {
    calcHFSS: calcHFSS,
    getTrafficLight: getTrafficLight,
    calcNutriScore: calcNutriScore
  };
})();
