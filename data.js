// NutriCalc — constants, RI, sample ingredients, Excel field definitions
window.NutriCalcData = (function () {
  "use strict";

  const EU_ALLERGENS = [
    "Celery", "Cereals containing gluten", "Crustaceans", "Eggs", "Fish",
    "Lupin", "Milk", "Molluscs", "Mustard", "Nuts", "Peanuts", "Sesame", "Soya", "Sulphur dioxide"
  ];

  const RI = { kj: 8400, kcal: 2000, fat: 70, saturates: 20, carbs: 260, sugars: 90, fibre: 30, protein: 50, salt: 6 };

  const CURRENCY_SYMBOL = "£";

  const UOM_OPTIONS = ["G", "KG", "L", "ML", "M", "EACH"];
  const INGREDIENT_COST_UOM = ["KG", "L", "EACH"];

  /** Normalize a sheet/cell UOM value to ingredient cost UOM (KG, L, or EACH). Returns null if empty or unrecognized (so import can leave UOM blank instead of defaulting to KG). */
  function normalizeCostUom(value) {
    var v = (value != null ? value : "").toString().trim().toUpperCase().replace(/[.,]+$/, "");
    if (!v) return null;
    // If cell is combined "cost / uom" (e.g. "1.50 / L" or "2.00 / EACH"), use the part after the last " / "
    if (v.indexOf("/") !== -1) {
      var parts = v.split("/");
      var afterSlash = (parts[parts.length - 1] || "").trim().replace(/[.,]+$/, "");
      if (afterSlash) return normalizeCostUom(afterSlash);
    }
    if (v === "L" || v === "LITRE" || v === "LITRES" || v === "LTR" || v === "LTRS" || v === "LT" || v === "ML") return "L";
    if (v === "EACH" || v === "EACHES" || v === "EA" || v === "UNIT" || v === "UNITS" || v === "U" || v === "PCS" || v === "PCE" || v === "PC" || v === "NO" || v === "STK" || v === "CTN" || v === "BOX") return "EACH";
    if (v === "G" || v === "GRAM" || v === "GRAMS" || v === "KG" || v === "KGS" || v === "KILO" || v === "KILOGRAM" || v === "KILOGRAMS") return "KG";
    if (v === "M" || v === "METRE" || v === "METRES" || v === "METER" || v === "METERS") return "M";
    return null;
  }

  /** Return UOM string if value looks like a unit (for using Code column as UOM fallback). */
  function codeAsCostUom(value) {
    var v = (value != null ? value : "").toString().trim().toUpperCase();
    if (!v) return "";
    if (["KG", "KGS", "L", "ML", "G", "EACH", "EA", "M"].indexOf(v) >= 0) return v === "EA" ? "EACH" : (v === "KGS" ? "KG" : v);
    return "";
  }

  /** Convert recipe qty to grams (for nutrition calc). Nutrition values are per 100g. */
  function qtyToGrams(qty, uom) {
    if (!qty || qty <= 0) return 0;
    var u = (uom || "G").toUpperCase();
    if (u === "G") return qty;
    if (u === "KG") return qty * 1000;
    if (u === "L") return qty * 1000;
    if (u === "ML") return qty;
    if (u === "M") return qty * 1000;
    if (u === "EACH") return qty * 100;
    return qty;
  }

  /** Convert grams to quantity in the given UOM (inverse of qtyToGrams). */
  function gramsToUom(grams, uom) {
    if (grams == null || grams < 0) return 0;
    var u = (uom || "G").toUpperCase();
    if (u === "G") return grams;
    if (u === "KG") return grams / 1000;
    if (u === "L") return grams / 1000;
    if (u === "ML") return grams;
    if (u === "M") return grams / 1000;
    if (u === "EACH") return grams / 100;
    return grams;
  }

  /** Convert weight (grams) to volume (litres) using density (kg/L). 1 L at density d = d kg = d*1000 g, so L = grams / (density * 1000). */
  function weightGramsToVolumeL(grams, density) {
    if (grams == null || grams < 0) return 0;
    var d = (density != null && density > 0) ? Number(density) : 1;
    return grams / (d * 1000);
  }

  /** Convert volume (litres) to weight (grams) using density (kg/L). weight_g = litres * density * 1000. */
  function volumeLToWeightGrams(litres, density) {
    if (litres == null || litres < 0) return 0;
    var d = (density != null && density > 0) ? Number(density) : 1;
    return litres * d * 1000;
  }

  /** Convert recipe qty to the unit matching ingredient cost (for line cost). */
  function qtyToCostBase(qty, uom, costUOM) {
    if (!qty || qty <= 0) return 0;
    var u = (uom || "G").toUpperCase();
    var c = (costUOM || "KG").toUpperCase();
    if (c === "EACH") return (u === "EACH" ? qty : qty / 100);
    var qtyG = qtyToGrams(qty, u);
    return qtyG / 1000;
  }

  function genId() {
    return "id_" + Math.random().toString(36).substr(2, 9);
  }

  function round(v, d) {
    if (d === undefined) d = 1;
    return Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
  }

  const CATEGORIES = [
    "Cereals & Grains", "Dairy", "Eggs", "Fats & Oils", "Fish & Seafood", "Fruits",
    "Meat & Poultry", "Nuts & Seeds", "Sugars & Syrups", "Vegetables", "Herbs & Spices", "Beverages", "Packaging", "Other"
  ];

  /** Suppliers whose items are auto-designated as packaging. Keep in sync with backend ImportService.PackagingSuppliers so re-imports and UI stay consistent. */
  const PACKAGING_SUPPLIERS = [
    "Europac Packaging Ltd",
    "COVERIS FLEXIBLES UK LTD (BOARD)",
    "COVERIS FLEXIBLES UK LTD (LABELS)",
    "TRANSCEND PACKAGING LIMITED",
    "FAERCH UK LIMITED",
    "CCS McLAYS Ltd",
    "WRAPID MANUFACTURING LIMITED",
    "S.SHEARD & SON LTD",
    "ProAmpac London Limited",
    "COLPAC LTD"
  ];

  function normForSupplierMatch(s) {
    return (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  }

  function isPackagingBySupplier(supplier) {
    if (!supplier || !(supplier = normForSupplierMatch(supplier))) return false;
    return PACKAGING_SUPPLIERS.some(function (p) { return normForSupplierMatch(p) === supplier; });
  }

  const SAMPLE_INGREDIENTS = [
    { name: "Wheat Flour, white, plain", cat: "Cereals & Grains", kj: 1450, kcal: 341, fat: 1.3, sat: 0.2, carb: 72, sugar: 1.5, fibre: 3.1, protein: 10, salt: 0.01, cost: 0.80, allergens: ["Cereals containing gluten"], fvn: false },
    { name: "Wheat Flour, wholemeal", cat: "Cereals & Grains", kj: 1318, kcal: 310, fat: 2.2, sat: 0.3, carb: 61.8, sugar: 1.8, fibre: 9, protein: 12.7, salt: 0.01, cost: 1.10, allergens: ["Cereals containing gluten"], fvn: false },
    { name: "Butter, salted", cat: "Dairy", kj: 3031, kcal: 735, fat: 81, sat: 52, carb: 0.6, sugar: 0.6, fibre: 0, protein: 0.6, salt: 1.4, cost: 7.50, allergens: ["Milk"], fvn: false },
    { name: "Cheddar Cheese, mature", cat: "Dairy", kj: 1725, kcal: 416, fat: 34.9, sat: 21.7, carb: 0.1, sugar: 0.1, fibre: 0, protein: 25.4, salt: 1.8, cost: 8.00, allergens: ["Milk"], fvn: false },
    { name: "Whole Milk", cat: "Dairy", kj: 275, kcal: 66, fat: 3.7, sat: 2.3, carb: 4.7, sugar: 4.7, fibre: 0, protein: 3.3, salt: 0.11, cost: 1.10, allergens: ["Milk"], fvn: false },
    { name: "Semi-Skimmed Milk", cat: "Dairy", kj: 195, kcal: 46, fat: 1.7, sat: 1.1, carb: 4.7, sugar: 4.7, fibre: 0, protein: 3.4, salt: 0.11, cost: 1.00, allergens: ["Milk"], fvn: false },
    { name: "Eggs, chicken, whole, raw", cat: "Eggs", kj: 612, kcal: 147, fat: 10.8, sat: 3.1, carb: 0, sugar: 0, fibre: 0, protein: 12.5, salt: 0.36, cost: 3.20, allergens: ["Eggs"], fvn: false },
    { name: "Olive Oil, extra virgin", cat: "Fats & Oils", kj: 3696, kcal: 899, fat: 99.9, sat: 14.2, carb: 0, sugar: 0, fibre: 0, protein: 0, salt: 0, cost: 6.00, allergens: [], fvn: false },
    { name: "Sunflower Oil", cat: "Fats & Oils", kj: 3696, kcal: 899, fat: 99.9, sat: 12, carb: 0, sugar: 0, fibre: 0, protein: 0, salt: 0, cost: 2.50, allergens: [], fvn: false },
    { name: "Sugar, white, granulated", cat: "Sugars & Syrups", kj: 1680, kcal: 400, fat: 0, sat: 0, carb: 100, sugar: 100, fibre: 0, protein: 0, salt: 0, cost: 1.00, allergens: [], fvn: false },
    { name: "Honey, clear", cat: "Sugars & Syrups", kj: 1372, kcal: 324, fat: 0, sat: 0, carb: 81, sugar: 81, fibre: 0, protein: 0.4, salt: 0.04, cost: 10.00, allergens: [], fvn: false },
    { name: "Tomatoes, raw", cat: "Vegetables", kj: 75, kcal: 18, fat: 0.3, sat: 0.1, carb: 3.1, sugar: 3.1, fibre: 1, protein: 0.7, salt: 0.01, cost: 2.50, allergens: [], fvn: true },
    { name: "Onions, raw", cat: "Vegetables", kj: 150, kcal: 36, fat: 0.1, sat: 0, carb: 7.9, sugar: 5.6, fibre: 1.3, protein: 1.2, salt: 0.01, cost: 0.90, allergens: [], fvn: true },
    { name: "Carrots, raw", cat: "Vegetables", kj: 143, kcal: 34, fat: 0.2, sat: 0, carb: 7.7, sugar: 5.6, fibre: 2.4, protein: 0.6, salt: 0.06, cost: 0.80, allergens: [], fvn: true },
    { name: "Potatoes, raw, peeled", cat: "Vegetables", kj: 318, kcal: 75, fat: 0.1, sat: 0, carb: 17.2, sugar: 0.8, fibre: 1.3, protein: 1.8, salt: 0.02, cost: 0.60, allergens: [], fvn: true },
    { name: "Broccoli, raw", cat: "Vegetables", kj: 138, kcal: 33, fat: 0.4, sat: 0.1, carb: 3.5, sugar: 1.4, fibre: 2.6, protein: 3.3, salt: 0.04, cost: 2.00, allergens: [], fvn: true },
    { name: "Garlic, raw", cat: "Vegetables", kj: 445, kcal: 106, fat: 0.3, sat: 0.1, carb: 22, sugar: 1, fibre: 4.1, protein: 7.9, salt: 0.04, cost: 8.00, allergens: [], fvn: true },
    { name: "Chicken Breast, skinless, raw", cat: "Meat & Poultry", kj: 460, kcal: 110, fat: 1.2, sat: 0.3, carb: 0, sugar: 0, fibre: 0, protein: 24, salt: 0.15, cost: 7.00, allergens: [], fvn: false },
    { name: "Beef Mince, lean (10% fat)", cat: "Meat & Poultry", kj: 735, kcal: 176, fat: 10, sat: 4.3, carb: 0, sugar: 0, fibre: 0, protein: 21.3, salt: 0.17, cost: 6.50, allergens: [], fvn: false },
    { name: "Salmon Fillet, raw", cat: "Fish & Seafood", kj: 770, kcal: 185, fat: 11, sat: 2, carb: 0, sugar: 0, fibre: 0, protein: 20.4, salt: 0.1, cost: 16.00, allergens: ["Fish"], fvn: false },
    { name: "Prawns, raw", cat: "Fish & Seafood", kj: 310, kcal: 73, fat: 0.6, sat: 0.1, carb: 0, sugar: 0, fibre: 0, protein: 17.6, salt: 0.55, cost: 14.00, allergens: ["Crustaceans"], fvn: false },
    { name: "Almonds, whole", cat: "Nuts & Seeds", kj: 2502, kcal: 601, fat: 52.8, sat: 4, carb: 6.9, sugar: 4.2, fibre: 12.2, protein: 21.2, salt: 0.01, cost: 12.00, allergens: ["Nuts"], fvn: true },
    { name: "Walnuts", cat: "Nuts & Seeds", kj: 2738, kcal: 659, fat: 65.2, sat: 5.6, carb: 7, sugar: 2.6, fibre: 6.7, protein: 14.7, salt: 0.01, cost: 14.00, allergens: ["Nuts"], fvn: true },
    { name: "Apples, eating, raw", cat: "Fruits", kj: 199, kcal: 47, fat: 0.1, sat: 0, carb: 11.6, sugar: 11.6, fibre: 1.8, protein: 0.4, salt: 0, cost: 2.20, allergens: [], fvn: true },
    { name: "Banana, raw", cat: "Fruits", kj: 403, kcal: 95, fat: 0.3, sat: 0.1, carb: 23.2, sugar: 20.9, fibre: 1.1, protein: 1.2, salt: 0, cost: 1.20, allergens: [], fvn: true },
    { name: "Cocoa Powder, unsweetened", cat: "Other", kj: 1301, kcal: 312, fat: 21.7, sat: 12.8, carb: 11.5, sugar: 0.5, fibre: 33.2, protein: 22.4, salt: 0.05, cost: 10.00, allergens: [], fvn: false },
    { name: "Dark Chocolate (70%)", cat: "Other", kj: 2332, kcal: 560, fat: 38.3, sat: 22.6, carb: 38, sugar: 32, fibre: 11, protein: 7.8, salt: 0.03, cost: 12.00, allergens: ["Milk", "Soya"], fvn: false },
    { name: "Baking Powder", cat: "Other", kj: 339, kcal: 81, fat: 0, sat: 0, carb: 20, sugar: 0, fibre: 0, protein: 0, salt: 27.6, cost: 4.00, allergens: [], fvn: false },
    { name: "Salt, table", cat: "Herbs & Spices", kj: 0, kcal: 0, fat: 0, sat: 0, carb: 0, sugar: 0, fibre: 0, protein: 0, salt: 100, cost: 0.50, allergens: [], fvn: false },
    { name: "Black Pepper, ground", cat: "Herbs & Spices", kj: 1059, kcal: 255, fat: 3.3, sat: 1.4, carb: 44.2, sugar: 0.6, fibre: 26.5, protein: 10.4, salt: 0.04, cost: 18.00, allergens: [], fvn: false },
    { name: "Soy Sauce", cat: "Other", kj: 243, kcal: 57, fat: 0.1, sat: 0, carb: 5.2, sugar: 1.7, fibre: 0.8, protein: 8.1, salt: 14.5, cost: 4.00, allergens: ["Soya", "Cereals containing gluten"], fvn: false },
    { name: "Cream, double (48% fat)", cat: "Dairy", kj: 1849, kcal: 449, fat: 48, sat: 30, carb: 2.6, sugar: 2.6, fibre: 0, protein: 1.6, salt: 0.05, cost: 5.00, allergens: ["Milk"], fvn: false },
    { name: "Rice, white, raw", cat: "Cereals & Grains", kj: 1527, kcal: 361, fat: 0.7, sat: 0.2, carb: 80, sugar: 0, fibre: 1.3, protein: 7, salt: 0, cost: 1.50, allergens: [], fvn: false },
    { name: "Pasta, dried", cat: "Cereals & Grains", kj: 1509, kcal: 356, fat: 1.8, sat: 0.4, carb: 71.3, sugar: 3.2, fibre: 3, protein: 12, salt: 0.01, cost: 1.80, allergens: ["Cereals containing gluten", "Eggs"], fvn: false },
    { name: "Tinned Tomatoes, chopped", cat: "Vegetables", kj: 75, kcal: 18, fat: 0.1, sat: 0, carb: 3.3, sugar: 3.3, fibre: 0.9, protein: 0.8, salt: 0.05, cost: 1.00, allergens: [], fvn: true },
    { name: "Cream Cheese", cat: "Dairy", kj: 1452, kcal: 352, fat: 34.4, sat: 21.7, carb: 3.1, sugar: 3.1, fibre: 0, protein: 7.5, salt: 0.65, cost: 6.00, allergens: ["Milk"], fvn: false },
    { name: "Peanut Butter, smooth", cat: "Nuts & Seeds", kj: 2577, kcal: 622, fat: 51.4, sat: 8.5, carb: 12.5, sugar: 6, fibre: 5.4, protein: 25.6, salt: 1.05, cost: 5.00, allergens: ["Peanuts"], fvn: true },
    { name: "Coconut Milk, tinned", cat: "Other", kj: 636, kcal: 154, fat: 15.6, sat: 13.7, carb: 2.8, sugar: 1.6, fibre: 0, protein: 1.4, salt: 0.03, cost: 3.00, allergens: [], fvn: false },
    { name: "Strong Bread Flour", cat: "Cereals & Grains", kj: 1480, kcal: 352, fat: 1.5, sat: 0.2, carb: 72.5, sugar: 0.8, fibre: 3.2, protein: 12.5, salt: 0.01, cost: 1.20, allergens: ["Cereals containing gluten"], fvn: false },
    { name: "Self-Raising Flour", cat: "Cereals & Grains", kj: 1460, kcal: 348, fat: 1.2, sat: 0.2, carb: 73, sugar: 0.5, fibre: 2.8, protein: 9.5, salt: 1.2, cost: 1.00, allergens: ["Cereals containing gluten"], fvn: false },
    { name: "Plain Flour, sieved", cat: "Cereals & Grains", kj: 1455, kcal: 346, fat: 1.2, sat: 0.2, carb: 72.8, sugar: 0.4, fibre: 2.9, protein: 9.8, salt: 0.01, cost: 0.85, allergens: ["Cereals containing gluten"], fvn: false },
    { name: "Spelt Flour", cat: "Cereals & Grains", kj: 1420, kcal: 338, fat: 2.5, sat: 0.4, carb: 67, sugar: 0.6, fibre: 6.5, protein: 14.6, salt: 0.02, cost: 2.80, allergens: ["Cereals containing gluten"], fvn: false },
    { name: "Rye Flour, dark", cat: "Cereals & Grains", kj: 1310, kcal: 312, fat: 2.2, sat: 0.3, carb: 61.3, sugar: 0.9, fibre: 11.8, protein: 9.8, salt: 0.02, cost: 2.20, allergens: ["Cereals containing gluten"], fvn: false },
    { name: "Cornflour", cat: "Cereals & Grains", kj: 1520, kcal: 362, fat: 0.1, sat: 0, carb: 91.3, sugar: 0, fibre: 0.9, protein: 0.3, salt: 0.02, cost: 1.50, allergens: [], fvn: false },
    { name: "Icing Sugar", cat: "Sugars & Syrups", kj: 1680, kcal: 400, fat: 0, sat: 0, carb: 100, sugar: 100, fibre: 0, protein: 0, salt: 0, cost: 1.80, allergens: [], fvn: false },
    { name: "Light Brown Sugar", cat: "Sugars & Syrups", kj: 1640, kcal: 390, fat: 0, sat: 0, carb: 98, sugar: 97, fibre: 0, protein: 0, salt: 0.05, cost: 1.40, allergens: [], fvn: false },
    { name: "Golden Caster Sugar", cat: "Sugars & Syrups", kj: 1665, kcal: 398, fat: 0, sat: 0, carb: 99.5, sugar: 99.5, fibre: 0, protein: 0, salt: 0, cost: 1.60, allergens: [], fvn: false },
    { name: "Baking Soda (Bicarbonate)", cat: "Other", kj: 0, kcal: 0, fat: 0, sat: 0, carb: 0, sugar: 0, fibre: 0, protein: 0, salt: 100, cost: 2.00, allergens: [], fvn: false },
    { name: "Vanilla Extract", cat: "Herbs & Spices", kj: 288, kcal: 68, fat: 0.1, sat: 0, carb: 12.7, sugar: 12.7, fibre: 0, protein: 0.1, salt: 0.02, cost: 22.00, allergens: [], fvn: false },
    { name: "Dried Active Yeast", cat: "Other", kj: 1170, kcal: 280, fat: 4.5, sat: 0.6, carb: 38, sugar: 0, fibre: 22, protein: 40, salt: 0.05, cost: 5.00, allergens: [], fvn: false },
    { name: "Vegetable Shortening", cat: "Fats & Oils", kj: 3690, kcal: 884, fat: 100, sat: 25, carb: 0, sugar: 0, fibre: 0, protein: 0, salt: 0.5, cost: 3.50, allergens: [], fvn: false },
    { name: "Margarine, block (baking)", cat: "Fats & Oils", kj: 3020, kcal: 722, fat: 80, sat: 20, carb: 0.5, sugar: 0.5, fibre: 0, protein: 0.2, salt: 1.2, cost: 2.20, allergens: ["Milk"], fvn: false },
    { name: "Ground Cinnamon", cat: "Herbs & Spices", kj: 1040, kcal: 247, fat: 1.2, sat: 0.3, carb: 81, sugar: 2.2, fibre: 53, protein: 4, salt: 0.03, cost: 15.00, allergens: [], fvn: false },
    { name: "Ground Ginger", cat: "Herbs & Spices", kj: 1330, kcal: 318, fat: 2.8, sat: 0.6, carb: 71.6, sugar: 3.4, fibre: 14.1, protein: 9, salt: 0.12, cost: 12.00, allergens: [], fvn: false },
    { name: "Nutmeg, ground", cat: "Herbs & Spices", kj: 2150, kcal: 514, fat: 36.3, sat: 25.9, carb: 28.5, sugar: 2.8, fibre: 20.8, protein: 5.8, salt: 0.02, cost: 28.00, allergens: [], fvn: false },
    { name: "Dried Cranberries", cat: "Fruits", kj: 1280, kcal: 308, fat: 1.4, sat: 0.1, carb: 82.4, sugar: 72.6, fibre: 5.2, protein: 0.1, salt: 0.01, cost: 8.00, allergens: [], fvn: true },
    { name: "Desiccated Coconut", cat: "Nuts & Seeds", kj: 2660, kcal: 660, fat: 64.5, sat: 57.2, carb: 6.9, sugar: 6.2, fibre: 16.3, protein: 6.9, salt: 0.06, cost: 4.50, allergens: [], fvn: true },
    { name: "Chocolate Chips, milk", cat: "Other", kj: 2240, kcal: 535, fat: 30, sat: 19, carb: 59, sugar: 58, fibre: 3.5, protein: 7.7, salt: 0.25, cost: 6.00, allergens: ["Milk", "Soya"], fvn: false },
    { name: "Golden Syrup", cat: "Sugars & Syrups", kj: 1340, kcal: 320, fat: 0, sat: 0, carb: 83, sugar: 83, fibre: 0, protein: 0, salt: 0.08, cost: 3.50, allergens: [], fvn: false },
    { name: "Treacle, black", cat: "Sugars & Syrups", kj: 1045, kcal: 250, fat: 0, sat: 0, carb: 61.5, sugar: 50, fibre: 0, protein: 0, salt: 0.5, cost: 2.80, allergens: [], fvn: false }
  ];

  // Sample recipe: ingredients by name (resolved to ids when loading). All must exist in SAMPLE_INGREDIENTS.
  const SAMPLE_RECIPES = [
    {
      name: "Victoria Sponge Cake",
      desc: "Classic British sponge with butter, flour, sugar and eggs. Cream the butter and sugar, beat in eggs, fold in flour. Bake at 180°C for 25–30 min.",
      type: "food",
      serving: 100,
      ingredientsByName: [
        { name: "Self-Raising Flour", qty: 225 },
        { name: "Butter, salted", qty: 225 },
        { name: "Sugar, white, granulated", qty: 225 },
        { name: "Eggs, chicken, whole, raw", qty: 200 },
        { name: "Baking Powder", qty: 5 },
        { name: "Vanilla Extract", qty: 5 }
      ]
    }
  ];

  const NC_FIELDS = [
    { key: "parentdescription", label: "Recipe column (parent — which recipe each ingredient is in)", required: false },
    { key: "parentuom", label: "Parent/Recipe UOM (sub & finished recipes only — e.g. G, KG, EACH)", required: false },
    { key: "name", label: "Ingredient name (only this column → app Name column)", required: false },
    { key: "parent", label: "Recipe Code (Parent ref)", required: false },
    { key: "code", label: "Item code (→ app Code column: ref, UOM, etc.)", required: false },
    { key: "qty", label: "Quantity (KG)", required: false },
    { key: "cat", label: "Category", required: false },
    { key: "kj", label: "Energy (kJ)", required: false },
    { key: "kcal", label: "Energy (kcal)", required: false },
    { key: "fat", label: "Fat (g)", required: false },
    { key: "sat", label: "Saturates (g)", required: false },
    { key: "carb", label: "Carbohydrate (g)", required: false },
    { key: "sugar", label: "Sugars (g)", required: false },
    { key: "fibre", label: "Fibre (g)", required: false },
    { key: "protein", label: "Protein (g)", required: false },
    { key: "salt", label: "Salt (g)", required: false },
    { key: "sodium", label: "Sodium (mg)", required: false },
    { key: "cost", label: "Cost per UOM (£) — UOM from Item UOM column (e.g. KG, L, EACH)", required: false },
    { key: "costuom", label: "Item UOM (map to the column with KG, L, EACH, etc. — any column works)", required: false },
    { key: "supplier", label: "Supplier / Vendor", required: false },
    { key: "scrap", label: "Scrap % (waste from prep — this row's own value, applies to every ingredient line)", required: false },
    { key: "parentcost", label: "Recipe/Finished Product Cost (parent's own total cost from sheet — for comparison only)", required: false },
    { key: "parentnoofportions", label: "Parent batch size (ParentNoofPortions — divides Parent Cost down to a true per-unit cost)", required: false }
  ];

  /** Detect if a value looks like an ingredient code: 6 digits or starts with P0 */
  function isCodeLike(val) {
    if (val === "" || val == null) return false;
    var s = val.toString().trim();
    if (!s) return false;
    return /^\d{6}$/.test(s) || /^P0/i.test(s);
  }

  /** Extract a code from a cell value (handles "123456", "P01234", or text containing them) */
  function extractCode(val) {
    if (val === "" || val == null) return "";
    var s = val.toString().trim();
    if (!s) return "";
    if (isCodeLike(s)) return s;
    var m6 = s.match(/\b(\d{6})\b/);
    if (m6) return m6[1];
    var mP0 = s.match(/\b(P0[\w\-]*)/i);
    if (mP0) return mP0[1];
    return "";
  }

  function autoMapColumn(header) {
    const h = (header || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
    // Check costuom BEFORE name so "Ingredient UOM" maps to costuom, not name (ingredientuom contains "ingredient")
    const maps = {
      costuom: ["costuom", "uom", "unit", "costunit", "unitofmeasure", "unitofmeasurement", "unitofmeasurecode", "uomcode", "purchaseuom", "buyuom", "itemuom", "ingredientuom", "purchaseunit", "buyunit", "packsize", "orderunit", "order unit", "pack size"],
      name: ["ingredient", "ingredientname", "name", "item", "food", "foodname", "product", "productname", "description", "rawmaterial"],
      code: ["code", "sku", "productcode", "itemcode", "barcode", "ingredientcode", "materialcode", "partnumber", "ref", "reference", "id"],
      qty: ["qty", "quantity", "amount", "weight", "grams", "g", "weightg", "amountg", "recipequantity"],
      cat: ["category", "cat", "group", "type", "foodgroup", "class", "producttype", "ingredientcategory", "categoryname", "classification"],
      kj: ["kj", "energykj", "energykjper100g", "kilojoules", "kj100g", "kjper100g"],
      kcal: ["kcal", "calories", "cal", "energykcal", "energykcalper100g", "kcal100g", "kcalper100g", "energy"],
      fat: ["fat", "totalfat", "fatg", "fatper100g", "fats", "fatg100g"],
      sat: ["saturates", "saturatedfat", "satfat", "sat", "saturatedfattyacids", "ofwhichsaturates", "saturatesg"],
      carb: ["carbohydrate", "carb", "carbs", "totalcarbohydrate", "carbohydrates", "carbsg", "totalcarbs", "cho"],
      sugar: ["sugar", "sugars", "totalsugars", "ofwhichsugars", "sugarsg", "totalsugar"],
      fibre: ["fibre", "fiber", "dietaryfibre", "dietaryfiber", "fibr", "fibreg", "nspaoac"],
      protein: ["protein", "proteins", "proteint", "proteing", "pro"],
      salt: ["salt", "salts", "saltg", "nacl", "saltequivalent", "sodium", "sodiumg", "sodiummg"],
      sodium: ["sodium", "na", "sodiumg", "sodiummg", "sodiummgper100g"],
      scrap: ["scrap", "scrappct", "scrappercent", "wastepct", "waste", "yieldloss", "losspct"],
      parentnoofportions: ["parentnoofportions", "noofportions", "parentportions", "batchsize", "parentbatchsize"],
      parentcost: ["parentcost", "recipecost", "finishedcost", "finishedproductcost", "producttotalcost", "recipetotalcost", "mparentcost"],
      cost: ["cost", "costperkg", "costkg", "costperuom", "costperunit", "price", "priceperkg", "unitcost", "costkgpound", "costp", "standardcost", "standardcostperkg"],
      parentdescription: ["parentdescription", "parentdesc", "recipe", "recipename", "product", "productname", "parentname"],
      parentuom: ["parentuom", "parentuom", "recipeuom", "servinguom", "servingunit", "parentunit", "recipeunit", "parentuomcode", "recipeuomcode"],
      parent: ["parent", "parentref", "recipecode", "productcode", "parentcode"],
      itemdescription: ["itemdescription", "itemdesc", "item", "rawmaterial", "component"],
      supplier: ["supplier", "vendor", "vendorname", "vendornames", "suppliername"]
    };
    for (const [field, patterns] of Object.entries(maps)) {
      if (patterns.some(function (p) { return h.indexOf(p) !== -1 || p.indexOf(h) !== -1; })) return field;
    }
    return "";
  }

  function autoDetectAllergens(name, cat) {
    const n = name.toLowerCase();
    const detected = [];
    const rules = [
      { allergen: "Milk", patterns: ["milk", "cream", "butter", "cheese", "yogurt", "yoghurt", "whey", "casein", "lactose", "dairy"] },
      { allergen: "Eggs", patterns: ["egg", "eggs", "albumin", "mayonnaise", "meringue"] },
      { allergen: "Cereals containing gluten", patterns: ["wheat", "flour", "bread", "pasta", "barley", "rye", "oat", "spelt", "semolina", "couscous", "bulgur", "noodle"] },
      { allergen: "Nuts", patterns: ["almond", "walnut", "hazelnut", "cashew", "pecan", "pistachio", "macadamia", "brazil nut", "chestnut"] },
      { allergen: "Peanuts", patterns: ["peanut"] },
      { allergen: "Soya", patterns: ["soy", "soya", "tofu", "tempeh", "edamame", "miso"] },
      { allergen: "Fish", patterns: ["fish", "salmon", "tuna", "cod", "haddock", "mackerel", "anchov", "sardine", "trout", "bass", "plaice", "sole", "halibut"] },
      { allergen: "Crustaceans", patterns: ["prawn", "shrimp", "crab", "lobster", "crayfish", "langoustine", "scampi"] },
      { allergen: "Molluscs", patterns: ["mussel", "oyster", "squid", "clam", "octopus", "snail", "scallop", "cockle", "whelk"] },
      { allergen: "Celery", patterns: ["celery", "celeriac"] },
      { allergen: "Mustard", patterns: ["mustard"] },
      { allergen: "Sesame", patterns: ["sesame", "tahini"] },
      { allergen: "Lupin", patterns: ["lupin"] },
      { allergen: "Sulphur dioxide", patterns: ["sulphite", "sulfite", "sulphur dioxide", "sulfur dioxide", "dried fruit", "wine", "vinegar"] }
    ];
    rules.forEach(function (r) {
      if (r.patterns.some(function (p) { return n.indexOf(p) !== -1; })) detected.push(r.allergen);
    });
    return detected;
  }

  function autoDetectFVN(name, cat) {
    const n = name.toLowerCase();
    const c = (cat || "").toLowerCase();
    if (c.indexOf("fruit") !== -1 || c.indexOf("vegetable") !== -1 || c.indexOf("nut") !== -1 || c.indexOf("seed") !== -1) return true;
    const fvnTerms = ["apple", "banana", "orange", "lemon", "lime", "berry", "grape", "melon", "peach", "pear", "plum", "cherry", "mango", "pineapple", "kiwi", "fig", "date", "raisin", "sultana", "coconut", "tomato", "onion", "garlic", "pepper", "carrot", "broccoli", "spinach", "cabbage", "pea", "bean", "lentil", "corn", "sweetcorn", "courgette", "aubergine", "beetroot", "celery", "leek", "mushroom", "potato", "sweet potato", "parsnip", "turnip", "swede", "squash", "pumpkin", "almond", "walnut", "hazelnut", "cashew", "pecan", "pistachio", "peanut", "brazil nut", "macadamia", "sunflower seed", "pumpkin seed", "sesame seed", "flaxseed", "chia seed"];
    return fvnTerms.some(function (t) { return n.indexOf(t) !== -1; });
  }

  return {
    EU_ALLERGENS: EU_ALLERGENS,
    RI: RI,
    CURRENCY_SYMBOL: CURRENCY_SYMBOL,
    UOM_OPTIONS: UOM_OPTIONS,
    INGREDIENT_COST_UOM: INGREDIENT_COST_UOM,
    normalizeCostUom: normalizeCostUom,
    codeAsCostUom: codeAsCostUom,
    qtyToGrams: qtyToGrams,
    gramsToUom: gramsToUom,
    weightGramsToVolumeL: weightGramsToVolumeL,
    volumeLToWeightGrams: volumeLToWeightGrams,
    qtyToCostBase: qtyToCostBase,
    genId: genId,
    round: round,
    CATEGORIES: CATEGORIES,
    isPackagingBySupplier: isPackagingBySupplier,
    SAMPLE_INGREDIENTS: SAMPLE_INGREDIENTS,
    SAMPLE_RECIPES: SAMPLE_RECIPES,
    NC_FIELDS: NC_FIELDS,
    isCodeLike: isCodeLike,
    extractCode: extractCode,
    autoMapColumn: autoMapColumn,
    autoDetectAllergens: autoDetectAllergens,
    autoDetectFVN: autoDetectFVN
  };
})();
