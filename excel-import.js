// NutriCalc — Excel/BOM import
(function () {
  "use strict";

  var Data = window.NutriCalcData;
  var Ingredients = window.NutriCalcIngredients;
  var Recipes = window.NutriCalcRecipes;

  var excelWorkbook = null;
  var excelSheetData = [];
  var excelHeaders = [];
  var excelFileName = "";
  var excelSheetName = "";
  var excelUnmatchedPending = [];
  var excelUnmatchedMappings = null;

  function showToast(msg) { if (typeof window.showToast === "function") window.showToast(msg); }
  function openModal(id) { if (typeof window.openModal === "function") window.openModal(id); }
  function closeModal(id) { if (typeof window.closeModal === "function") window.closeModal(id); }
  function renderAll() { if (typeof window.renderAll === "function") window.renderAll(); }

  function openExcelImport() {
    excelWorkbook = null;
    excelSheetData = [];
    excelHeaders = [];
    excelFileName = "";
    document.getElementById("excel-step-1").style.display = "";
    document.getElementById("excel-step-2").style.display = "none";
    document.getElementById("excel-step-3").style.display = "none";
    document.getElementById("excel-import-btn").style.display = "none";
    document.getElementById("excel-back-btn").style.display = "none";
    document.getElementById("excelFileInput").value = "";
    openModal("modal-excel-import");
  }

  function closeExcelImport() {
    closeModal("modal-excel-import");
  }

  function handleExcelDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleExcelFile(file);
  }

  function handleExcelFile(file) {
    if (!file || typeof XLSX === "undefined") return;
    excelFileName = file.name.replace(/\.[^.]+$/, "");
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        excelWorkbook = XLSX.read(data, { type: "array", cellDates: true });
        populateSheetSelector();
        selectExcelSheet();
        document.getElementById("excel-step-1").style.display = "none";
        document.getElementById("excel-step-2").style.display = "";
        document.getElementById("excel-import-btn").style.display = "";
        document.getElementById("excel-back-btn").style.display = "";
        document.getElementById("excel-step-3").style.display = "none";
        document.getElementById("excel-recipe-name").value = excelFileName;
      } catch (err) {
        showToast("Error reading file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function populateSheetSelector() {
    var sel = document.getElementById("excel-sheet-select");
    if (!sel || !excelWorkbook) return;
    sel.innerHTML = excelWorkbook.SheetNames.map(function (name, i) { return '<option value="' + i + '">' + name + "</option>"; }).join("");
  }

  function selectExcelSheet() {
    if (!excelWorkbook) return;
    var sheetIdx = parseInt(document.getElementById("excel-sheet-select").value, 10) || 0;
    var headerRowIdx = parseInt(document.getElementById("excel-header-row").value, 10) || 0;
    var sheetName = excelWorkbook.SheetNames[sheetIdx];
    var sheet = excelWorkbook.Sheets[sheetName];
    var raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (raw.length <= headerRowIdx) { showToast("Sheet appears empty or header row is beyond data"); return; }
    excelHeaders = raw[headerRowIdx].map(function (h) { return (h || "").toString().trim(); });
    var headerLen = excelHeaders.length;
    excelSheetData = raw.slice(headerRowIdx + 1)
      .filter(function (row) { return row.some(function (cell) { return cell !== "" && cell != null; }); })
      .map(function (row) {
        while (row.length < headerLen) row.push("");
        return row;
      });
    excelSheetName = sheetName || "";
    renderColumnMapping();
    renderExcelPreview();
    updateImportSummary();
  }

  function autoDetectCodeColumn() {
    if (!excelSheetData.length || !excelHeaders.length) return -1;
    var colCount = excelHeaders.length;
    var bestCol = -1;
    var bestScore = 0;
    for (var c = 0; c < colCount; c++) {
      var codeLikeCount = 0;
      var nonEmptyCount = 0;
      excelSheetData.forEach(function (row) {
        var v = row[c];
        if (v !== "" && v != null) {
          nonEmptyCount++;
          if (Data.extractCode(v)) codeLikeCount++;
        }
      });
      if (nonEmptyCount > 0 && codeLikeCount / nonEmptyCount >= 0.5 && codeLikeCount > bestScore) {
        bestScore = codeLikeCount;
        bestCol = c;
      }
    }
    return bestCol;
  }

  function findCodeInRow(row) {
    for (var i = 0; i < row.length; i++) {
      var extracted = Data.extractCode(row[i]);
      if (extracted) return extracted;
    }
    return "";
  }

  function colIndexToLetter(idx) {
    var s = "";
    idx++;
    while (idx > 0) {
      var r = (idx - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      idx = Math.floor((idx - 1) / 26);
    }
    return s || "A";
  }

  function renderColumnMapping() {
    var container = document.getElementById("excel-column-mapping");
    if (!container) return;
    var codeColByHeader = excelHeaders.findIndex(function (h) { return Data.autoMapColumn(h) === "code"; });
    var codeColByData = codeColByHeader >= 0 ? -1 : autoDetectCodeColumn();
    var firstRow = excelSheetData[0] || [];
    container.innerHTML = Data.NC_FIELDS.map(function (f) {
      var autoMatch = excelHeaders.findIndex(function (h) { return Data.autoMapColumn(h) === f.key; });
      if (f.key === "code" && autoMatch < 0 && codeColByData >= 0) autoMatch = codeColByData;
      // This sheet layout's header text is unreliable for these fields — e.g. "ParentItemNo",
      // "ParentNoofPortions" and "ParentDescription" all contain "Parent", so fuzzy text/data
      // matching grabs the wrong one. These columns are pinned to fixed letters instead,
      // always winning over any fuzzy match. Still overridable via the dropdown.
      var PINNED_COLUMNS = { code: 3, supplier: 13, parentdescription: 2, parentuom: 11, parent: 0, name: 4, parentnoofportions: 10 };
      if (Object.prototype.hasOwnProperty.call(PINNED_COLUMNS, f.key) && excelHeaders.length > PINNED_COLUMNS[f.key]) {
        autoMatch = PINNED_COLUMNS[f.key];
      }
      var options = excelHeaders.map(function (h, i) {
        var letter = colIndexToLetter(i);
        var headerText = (h || "").toString().trim();
        var label = headerText ? letter + ": " + headerText : letter;
        var sample = firstRow[i];
        if (sample !== undefined && sample !== null && sample !== "") {
          var sampleStr = (sample + "").toString().trim().replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
          if (sampleStr.length > 20) sampleStr = sampleStr.slice(0, 17) + "...";
          label += " (e.g. " + sampleStr + ")";
        }
        return '<option value="' + i + '"' + (i === autoMatch ? " selected" : "") + ">" + (label.replace(/</g, "&lt;").replace(/>/g, "&gt;")) + "</option>";
      }).join("");
      return '<div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">' + f.label + (f.required ? ' <span style="color:var(--nc-red)">*</span>' : "") + '</label><select class="form-select" data-ncfield="' + f.key + '" onchange="updateImportSummary()" style="font-size:12px;padding:5px 8px"><option value="-1">— Skip —</option>' + options + "</select></div>";
    }).join("");
  }

  function getColumnMappings() {
    var mappings = {};
    document.querySelectorAll("#excel-column-mapping select").forEach(function (sel) {
      var field = sel.getAttribute("data-ncfield") || sel.dataset.ncfield;
      if (!field) return;
      var colIdx = parseInt(sel.value, 10);
      if (!isNaN(colIdx) && colIdx >= 0) mappings[field] = colIdx;
    });
    return mappings;
  }

  function getCellString(row, colIdx) {
    if (row == null || colIdx == null || colIdx < 0) return "";
    var cell = row[colIdx];
    if (cell == null || cell === "") return "";
    var s = (typeof cell === "string" ? cell : String(cell)).trim().replace(/\s+/g, " ");
    return s;
  }

  function renderExcelPreview() {
    var table = document.getElementById("excel-preview-table");
    if (!table) return;
    var previewRows = excelSheetData.slice(0, 5);
    var html = "<thead><tr>";
    excelHeaders.forEach(function (h, i) { html += '<th style="font-size:10px;white-space:nowrap">' + ((h || "").toString().trim() || colIndexToLetter(i)) + "</th>"; });
    html += "</tr></thead><tbody>";
    previewRows.forEach(function (row) {
      html += "<tr>";
      excelHeaders.forEach(function (_, i) {
        html += '<td style="font-size:11px;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis">' + (row[i] != null ? row[i] : "") + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody>";
    table.innerHTML = html;
  }

  function updateImportSummary() {
    var mappings = getColumnMappings();
    var mode = document.getElementById("excel-import-mode").value;
    var hasName = mappings.name !== undefined;
    var hasCode = mappings.code !== undefined;
    var rowCount = excelSheetData.filter(function (row) {
      if (hasName) {
        var val = row[mappings.name];
        if (val && val.toString().trim() !== "") return true;
      }
      if (hasCode) {
        var c = (row[mappings.code] ?? "").toString().trim();
        if (c) return true;
      }
      return false;
    }).length;
    var mappedFields = Object.keys(mappings);
    var summary = "";
    var hasParent = mappings.parentdescription !== undefined || mappings.parent !== undefined;
    var hasItem = mappings.itemdescription !== undefined || hasName;
    if (mode === "recipe-structure" && (!hasParent || !hasItem)) summary = "⚠ Select <strong>Recipe column</strong> (e.g. C) and <strong>Ingredient column</strong> (e.g. E). System will build all recipes and add all ingredients.";
    else if (!hasName && !hasCode && !hasParent) summary = "⚠ Please map <strong>Ingredient Name</strong> or <strong>Code</strong> (or both) to continue.";
    else {
      summary = "Ready to import <strong>" + rowCount + " row(s)</strong> with " + mappedFields.length + " field(s) mapped.";
      if (!hasName && hasCode) summary += " <span style=\"color:var(--nc-amber)\">Costs/codes only — will update existing ingredients by code.</span>";
      if (mode === "nutritionals") summary += " <span style=\"color:var(--nc-green)\">Match by code (or Code 2); merge into existing. Unmatched rows with a name: you choose which to add. Code-only rows without a match are skipped.</span>";
      if (hasParent && hasItem && mode !== "recipe-structure") summary += " <span style=\"color:var(--nc-amber)\">⚠ Switch to <strong>Recipe library</strong> mode to build recipes from your ingredient list.</span>";
      if (mode === "recipe") {
        summary += " A new recipe will also be created.";
        if (!hasName) summary += ' <span style="color:var(--nc-amber)">⚠ Recipe mode requires Ingredient Name.</span>';
        else if (mappings.qty === undefined) summary += ' <span style="color:var(--nc-amber)">⚠ No Quantity column mapped — all quantities will default to 0.1 KG.</span>';
      }
      if (hasName && mappings.kcal === undefined && mappings.kj === undefined) summary += ' <span style="color:var(--nc-amber)">⚠ No energy column mapped.</span>';
      if (mappings.cost !== undefined && mappings.costuom === undefined && mappings.parentuom === undefined) summary += ' <span style="color:var(--nc-amber)">Tip: map <strong>Item UOM</strong> to the column with KG, L, EACH (etc.) so each ingredient keeps its correct unit; otherwise all will show as KG.</span>';
      if (mappings.supplier !== undefined && excelSheetData.length > 0) {
        var supplierSample = getCellString(excelSheetData[0], mappings.supplier).toUpperCase();
        var uomLike = ["KG", "L", "EACH", "G", "ML", "M", "EACHES", "EA", "UNIT", "UNITS"].indexOf(supplierSample) >= 0;
        if (uomLike) summary += ' <span style="color:var(--nc-red)">⚠ <strong>Supplier</strong> column contains UOM values (' + supplierSample + '). Swap: map <strong>Item UOM</strong> to this column and <strong>Supplier</strong> to the column with vendor names.</span>';
      }
    }
    document.getElementById("excel-import-summary").innerHTML = summary;
    document.getElementById("excel-recipe-name-wrap").style.display = (mode === "recipe") ? "" : "none";
    if (mode === "recipe-structure" && hasParent && hasItem) summary += " <span style=\"color:var(--nc-green)\">✓ Will add all ingredients (codes, cost, etc.) and build all recipes with correct ingredients and amounts.</span>";
  }

  function findExistingIngredient(ingredients, name, code) {
    function n(s) { return (s || "").toString().toLowerCase().trim().replace(/\s+/g, " "); }
    if (code && code.trim()) {
      var codeNorm = (code || "").toString().trim().toLowerCase();
      var byCode = ingredients.find(function (i) {
        if (n(i.code) === codeNorm) return true;
        var alts = i.altCodes || [];
        return alts.some(function (c) { return n(c) === codeNorm; });
      });
      if (byCode) return byCode;
    }
    if (name && name.trim()) {
      var nameNorm = n(name);
      return ingredients.find(function (i) { return n(i.name) === nameNorm; });
    }
    return null;
  }

  function analyzeExcelDuplicates(mappings) {
    var ingredients = Ingredients.getIngredients();
    var matchCount = 0, newCount = 0, skipCount = 0;
    var hasName = mappings.name !== undefined;
    var hasCode = mappings.code !== undefined;
    var hasCode2 = mappings.code2 !== undefined;
    if (!hasName && !hasCode) return null;
    excelSheetData.forEach(function (row) {
      var name = hasName ? (row[mappings.name] ?? "").toString().trim() : "";
      var codeColVal = hasCode ? (row[mappings.code] ?? "").toString().trim() : "";
      var code = codeColVal;
      var code2Val = hasCode2 ? (row[mappings.code2] ?? "").toString().trim() : "";
      if (!name && !code && !code2Val) { skipCount++; return; }
      var existing = findExistingIngredient(ingredients, name, code);
      if (!existing && code2Val) existing = findExistingIngredient(ingredients, name, code2Val);
      if (existing) matchCount++; else newCount++;
    });
    return { matchCount: matchCount, newCount: newCount, skipCount: skipCount };
  }

  async function executeExcelImport() {
    try {
      var mappings = getColumnMappings();
      var hasName = mappings.name !== undefined;
      var hasCode = mappings.code !== undefined;
      var hasParent = mappings.parentdescription !== undefined || mappings.parent !== undefined;
      var hasItem = mappings.itemdescription !== undefined || hasName;
      var mode = document.getElementById("excel-import-mode").value;

      if (mode === "recipe-structure") {
        if (!hasParent || !hasItem) { showToast("Select Recipe column and Ingredient column to build recipes"); return; }
        await executeRecipeStructureImport(mappings);
        return;
      }

      if (!hasName && !hasCode) { showToast("Please map Ingredient Name or Code (or both) to continue"); return; }
      if (mode === "recipe" && !hasName) { showToast("Recipe mode requires Ingredient Name"); return; }
      if (mode === "nutritionals") {
        executeExcelImportWithChoice("update_existing");
        return;
      }

      var analysis = analyzeExcelDuplicates(mappings);

      if (!hasName && hasCode) {
        executeExcelImportWithChoice("update_existing");
        return;
      }

      if (analysis && analysis.matchCount > 0 && mode === "ingredients") {
        var msg = document.getElementById("excel-duplicate-msg");
        if (msg) msg.textContent = analysis.matchCount + " of " + (analysis.matchCount + analysis.newCount) + " ingredients match existing ones in your library. " + (analysis.newCount > 0 ? analysis.newCount + " would be new." : "");
        openModal("modal-excel-duplicate-choice");
        return;
      }

      executeExcelImportWithChoice("add_new");
    } catch (err) {
      showToast("Import failed: " + (err && err.message ? err.message : String(err)));
      if (typeof console !== "undefined" && console.error) console.error(err);
    }
  }

  function buildIngredientFromRow(name, code, code2Val, cat, kj, kcal, salt, parseNum, costVal, supplierVal, costUOM, codeB) {
    var primary = (code || "").toString().trim() || (code2Val || "").toString().trim();
    var altCodes = [];
    if (code2Val && code2Val.trim() && code2Val !== primary) altCodes.push(code2Val.trim());
    if (code && code.trim() && code !== primary && altCodes.indexOf(code.trim()) === -1) altCodes.push(code.trim());
    return {
      id: Data.genId(),
      name: name,
      code: primary,
      codeB: (codeB != null && String(codeB).trim() !== "") ? String(codeB).trim() : "",
      altCodes: altCodes,
      cat: cat,
      kj: kj,
      kcal: kcal,
      fat: parseNum("fat"),
      sat: parseNum("sat"),
      carb: parseNum("carb"),
      sugar: parseNum("sugar"),
      fibre: parseNum("fibre"),
      protein: parseNum("protein"),
      salt: salt,
      cost: costVal,
      costUOM: (costUOM != null && String(costUOM).trim() !== "") ? String(costUOM).trim() : "",
      supplier: supplierVal || "",
      allergens: Data.autoDetectAllergens(name, cat),
      fvn: Data.autoDetectFVN(name, cat)
    };
  }

  function executeExcelImportWithChoice(mergeMode) {
    try {
      var mappings = getColumnMappings();
      var hasName = mappings.name !== undefined;
      var hasCode = mappings.code !== undefined;
      var hasCode2 = mappings.code2 !== undefined;
      if (!hasName && !hasCode) { showToast("Please map Ingredient Name or Code"); return; }
      var mode = document.getElementById("excel-import-mode").value;
      var importedCount = 0, skippedCount = 0, updatedCount = 0;
      var recipeIngredients = [];
      var ingredients = Ingredients.getIngredients();
      var recipes = Recipes.getRecipes();
    excelUnmatchedPending = [];
    excelUnmatchedMappings = null;

    excelSheetData.forEach(function (row) {
      function parseNum(key) {
        if (mappings[key] === undefined) return 0;
        var v = row[mappings[key]];
        if (v === "" || v == null) return 0;
        return parseFloat(v.toString().replace(/[^0-9.\-]/g, "")) || 0;
      }
      var nameVal = hasName ? row[mappings.name] : "";
      var name = (nameVal || "").toString().trim();
      var mappedCode = hasCode ? (row[mappings.code] ?? "").toString().trim() : "";
      var code = mappedCode || findCodeInRow(row);
      var code2Val = hasCode2 ? (row[mappings.code2] ?? "").toString().trim() : "";
      var codeBVal = mappings.codeb !== undefined ? (row[mappings.codeb] ?? "").toString().trim() : "";
      if (!name && !code) { skippedCount++; return; }
      var kj = parseNum("kj");
      var kcal = parseNum("kcal");
      var salt = parseNum("salt");
      var sodium = parseNum("sodium");
      if (kcal > 0 && kj === 0) kj = Math.round(kcal * 4.184);
      if (kj > 0 && kcal === 0) kcal = Math.round(kj / 4.184);
      if (sodium > 0 && salt === 0) salt = Data.round(sodium * 2.5 / 1000, 2);
      var cat = mappings.cat !== undefined ? (row[mappings.cat] || "Other").toString().trim() : "Other";
      var qty = parseNum("qty") || 100;
      var costVal = parseNum("cost");
      var supplierVal = mappings.supplier !== undefined ? (row[mappings.supplier] ?? "").toString().trim() : "";
      if (Data.isPackagingBySupplier && Data.isPackagingBySupplier(supplierVal)) cat = "Packaging";
      var costUomRaw = "";
      if (mappings.costuom !== undefined) costUomRaw = getCellString(row, mappings.costuom);
      var costUom = (costUomRaw != null && String(costUomRaw).trim() !== "") ? String(costUomRaw).trim() : "";
      var existing = findExistingIngredient(ingredients, name, code);
      if (!existing && code2Val) existing = findExistingIngredient(ingredients, name, code2Val);
      if (existing) {
        if (mergeMode === "update_existing") {
          if (costVal > 0) existing.cost = costVal;
          existing.costUOM = costUom;
          if (codeBVal !== undefined) existing.codeB = codeBVal;
          if (code && code !== existing.code) {
            existing.altCodes = existing.altCodes || [];
            if (existing.altCodes.indexOf(code) === -1) existing.altCodes.push(code);
          }
          if (code2Val && code2Val !== existing.code) {
            existing.altCodes = existing.altCodes || [];
            if (existing.altCodes.indexOf(code2Val) === -1) existing.altCodes.push(code2Val);
          }
          if (kj > 0) existing.kj = kj;
          if (kcal > 0) existing.kcal = kcal;
          if (parseNum("fat") > 0) existing.fat = parseNum("fat");
          if (parseNum("sat") > 0) existing.sat = parseNum("sat");
          if (parseNum("carb") > 0) existing.carb = parseNum("carb");
          if (parseNum("sugar") > 0) existing.sugar = parseNum("sugar");
          if (parseNum("fibre") > 0) existing.fibre = parseNum("fibre");
          if (parseNum("protein") > 0) existing.protein = parseNum("protein");
          if (salt > 0) existing.salt = salt;
          if (cat && cat !== "Other") existing.cat = cat;
          if (supplierVal) existing.supplier = supplierVal;
          updatedCount++;
          if (mode === "recipe") recipeIngredients.push({ ingredientId: existing.id, qty: qty, uom: "G", fvnOverride: null });
        } else {
          if (!name) { skippedCount++; return; }
          var newIng = buildIngredientFromRow(name, code, code2Val, cat, kj, kcal, salt, parseNum, costVal, supplierVal, costUom, codeBVal);
          ingredients.push(newIng);
          importedCount++;
          if (mode === "recipe") recipeIngredients.push({ ingredientId: newIng.id, qty: qty, uom: "G", fvnOverride: null });
        }
      } else {
        if (mergeMode === "update_existing" && name) {
          excelUnmatchedPending.push({
            name: name,
            code: code,
            code2Val: code2Val,
            codeBVal: codeBVal,
            cat: cat,
            kj: kj,
            kcal: kcal,
            salt: salt,
            fat: parseNum("fat"),
            sat: parseNum("sat"),
            carb: parseNum("carb"),
            sugar: parseNum("sugar"),
            fibre: parseNum("fibre"),
            protein: parseNum("protein"),
            costVal: costVal,
            costUom: costUom,
            supplierVal: supplierVal
          });
          return;
        }
        if (!name) { skippedCount++; return; }
        var newIng = buildIngredientFromRow(name, code, code2Val, cat, kj, kcal, salt, parseNum, costVal, supplierVal, costUom, codeBVal);
        ingredients.push(newIng);
        importedCount++;
        if (mode === "recipe") recipeIngredients.push({ ingredientId: newIng.id, qty: qty, uom: "G", fvnOverride: null });
      }
    });

    function finishImport(addedFromUnmatched) {
      if (addedFromUnmatched) {
        ingredients = Ingredients.getIngredients();
        addedFromUnmatched.forEach(function (ing) { ingredients.push(ing); });
        Ingredients.setIngredients(ingredients);
      } else {
        Ingredients.setIngredients(ingredients);
      }
      var recipeName = "";
      if (mode === "recipe" && recipeIngredients.length > 0) {
        recipeName = document.getElementById("excel-recipe-name").value.trim() || excelFileName || "Imported Recipe";
        var newRecipe = {
          id: Data.genId(),
          name: recipeName,
          desc: "Imported from " + (excelFileName || "spreadsheet"),
          type: "food",
          recipeType: "finishedProduct",
          serving: 100,
          ingredients: recipeIngredients,
          created: new Date().toISOString()
        };
        recipes.push(newRecipe);
        Recipes.setRecipes(recipes);
      }
      renderAll();
      document.getElementById("excel-step-2").style.display = "none";
      document.getElementById("excel-step-3").style.display = "";
      document.getElementById("excel-import-btn").style.display = "none";
      var msg = "";
      if (importedCount > 0) msg += importedCount + " new ingredient(s) imported";
      if (addedFromUnmatched && addedFromUnmatched.length) msg += (msg ? ", " : "") + addedFromUnmatched.length + " added from approval";
      if (updatedCount > 0) msg += (msg ? ", " : "") + updatedCount + " updated";
      if (skippedCount > 0) msg += (msg ? ", " : "") + skippedCount + " skipped";
      if (!msg) msg = "No changes";
      document.getElementById("excel-result-msg").textContent = msg;
      document.getElementById("excel-result-detail").textContent = (mode === "recipe" && recipeIngredients.length > 0) ? 'Recipe "' + recipeName + '" created with ' + recipeIngredients.length + " ingredients." : "";
    }

    if (excelUnmatchedPending.length > 0) {
      excelUnmatchedMappings = mappings;
      Ingredients.setIngredients(ingredients);
      window._excelLastUpdatedCount = updatedCount;
      showExcelUnmatchedApprovalModal(updatedCount);
      return;
    }
    finishImport(null);
    } catch (err) {
      showToast("Import failed: " + (err && err.message ? err.message : String(err)));
      if (typeof console !== "undefined" && console.error) console.error(err);
    }
  }

  function buildIngredientFromUnmatched(item) {
    var code = (item.code || "").toString().trim();
    var code2Val = (item.code2Val || "").toString().trim();
    var altCodes = [];
    if (code2Val && code2Val !== code) altCodes.push(code2Val);
    var costUom = (item.costUom != null && String(item.costUom).trim() !== "") ? String(item.costUom).trim().toUpperCase() : "";
    var codeB = (item.codeBVal != null && String(item.codeBVal).trim() !== "") ? String(item.codeBVal).trim() : ((item.codeB != null && String(item.codeB).trim() !== "") ? String(item.codeB).trim() : "");
    return {
      id: Data.genId(),
      name: item.name,
      code: code || code2Val,
      codeB: codeB,
      altCodes: code ? altCodes : [],
      cat: item.cat || "Other",
      kj: item.kj,
      kcal: item.kcal,
      fat: item.fat || 0,
      sat: item.sat || 0,
      carb: item.carb || 0,
      sugar: item.sugar || 0,
      fibre: item.fibre || 0,
      protein: item.protein || 0,
      salt: item.salt || 0,
      cost: item.costVal || 0,
      costUOM: costUom,
      supplier: item.supplierVal || "",
      allergens: Data.autoDetectAllergens(item.name, item.cat),
      fvn: Data.autoDetectFVN(item.name, item.cat)
    };
  }

  function showExcelUnmatchedApprovalModal(updatedCount) {
    var listEl = document.getElementById("excel-unmatched-list");
    var msgEl = document.getElementById("excel-unmatched-msg");
    if (msgEl) msgEl.textContent = (updatedCount > 0 ? updatedCount + " ingredient(s) updated. " : "") + excelUnmatchedPending.length + " row(s) not found in library. Add any you want to keep.";
    if (!listEl) return;
    listEl.innerHTML = "";
    excelUnmatchedPending.forEach(function (item, idx) {
      var row = document.createElement("label");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:4px";
      row.onmouseover = function () { row.style.background = "var(--nc-gray-100)"; };
      row.onmouseout = function () { row.style.background = ""; };
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.setAttribute("data-unmatched-idx", String(idx));
      var text = document.createElement("span");
      text.textContent = (item.name || "—") + (item.code ? " (" + item.code + ")" : "") + (item.code2Val ? " / " + item.code2Val : "");
      row.appendChild(cb);
      row.appendChild(text);
      listEl.appendChild(row);
    });
    document.getElementById("modal-excel-approve-unmatched").classList.add("active");
  }

  function confirmExcelUnmatchedAdd() {
    var listEl = document.getElementById("excel-unmatched-list");
    var checked = listEl.querySelectorAll('input[type="checkbox"]:checked');
    var toAdd = [];
    checked.forEach(function (cb) {
      var idx = parseInt(cb.getAttribute("data-unmatched-idx"), 10);
      if (!isNaN(idx) && excelUnmatchedPending[idx]) toAdd.push(buildIngredientFromUnmatched(excelUnmatchedPending[idx]));
    });
    document.getElementById("modal-excel-approve-unmatched").classList.remove("active");
    excelUnmatchedMappings = null;
    finishExcelImportWithUnmatched(toAdd);
  }

  function skipExcelUnmatched() {
    document.getElementById("modal-excel-approve-unmatched").classList.remove("active");
    excelUnmatchedMappings = null;
    finishExcelImportWithUnmatched([]);
  }

  function finishExcelImportWithUnmatched(addedIngredients) {
    var ingredients = Ingredients.getIngredients();
    addedIngredients.forEach(function (ing) { ingredients.push(ing); });
    Ingredients.setIngredients(ingredients);
    renderAll();
    document.getElementById("excel-step-2").style.display = "none";
    document.getElementById("excel-step-3").style.display = "";
    document.getElementById("excel-import-btn").style.display = "none";
    var msg = "";
    if (addedIngredients.length > 0) msg += addedIngredients.length + " new ingredient(s) added from approval";
    var updated = (window._excelLastUpdatedCount != null) ? window._excelLastUpdatedCount : 0;
    if (updated > 0) msg += (msg ? ", " : "") + updated + " updated";
    if (!msg) msg = "Import complete";
    document.getElementById("excel-result-msg").textContent = msg;
    document.getElementById("excel-result-detail").textContent = addedIngredients.length < excelUnmatchedPending.length
      ? (excelUnmatchedPending.length - addedIngredients.length) + " skipped."
      : "";
    excelUnmatchedPending = [];
  }

  /** When backend is unavailable, run recipe-structure import in the browser using app.js client logic. */
  function runClientRecipeStructureImport(mappings) {
    try {
      window._excelSheetData = excelSheetData;
      window._excelFileName = excelFileName;
      window._excelSheetName = excelSheetName;
      if (typeof window.executeRecipeStructureImportClient === "function") {
        window.executeRecipeStructureImportClient(mappings);
      } else {
        showToast("Import requires backend or refresh the page and try again.");
      }
    } finally {
      if (document.getElementById("excel-import-btn")) document.getElementById("excel-import-btn").disabled = false;
    }
  }

  /**
   * BOM Import — 4-level hierarchy:
   * 1. Base ingredients: items in itemdescription that never appear in parent column. Stored in Ingredient Centre.
   * 2. Single-component ingredients: parents with exactly one base ingredient. Created as recipes linking to base. Shown in Ingredient Centre only.
   * 3. Sub-recipes: parents with multiple items that also appear as items elsewhere. Use subRecipeId when referenced.
   * 4. Finished products: parents with multiple items that never appear as items elsewhere. Not used as sub-recipes.
   */
  async function executeRecipeStructureImport(mappings) {
    var importBtn = document.getElementById("excel-import-btn");
    try {
      if (importBtn) importBtn.disabled = true;
      var apiBase = (window.NC_API_BASE_URL || (window.location.origin + "/api"));
      var reqRows = [];
      // If Item UOM not mapped, try to find UOM column by header name
      if (mappings.costuom === undefined && excelHeaders && excelHeaders.length) {
        var uomPatterns = ["unitofmeasurecode", "unitofmeasure", "uom", "unit", "costunit", "purchaseuom", "buyuom", "itemuom", "ingredientuom", "purchaseunit", "buyunit", "packsize", "orderunit"];
        for (var i = 0; i < excelHeaders.length; i++) {
          var h = (excelHeaders[i] || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
          if (uomPatterns.some(function (p) { return h === p || h.indexOf(p) !== -1 || p.indexOf(h) !== -1; })) {
            mappings = Object.assign({}, mappings, { costuom: i });
            break;
          }
        }
      }
      excelSheetData.forEach(function (row) {
        function getVal(key) {
          if (mappings[key] === undefined) return "";
          return getCellString(row, mappings[key]);
        }
        function parseNum(key) {
          if (mappings[key] === undefined) return 0;
          var v = row[mappings[key]];
          if (v === "" || v == null) return 0;
          return parseFloat(String(v).replace(/[^0-9.\-]/g, "")) || 0;
        }
        var parentVal = (mappings.parentdescription !== undefined ? getVal("parentdescription") : "") || (mappings.parent !== undefined ? getVal("parent") : "");
        var itemName = (mappings.itemdescription !== undefined ? getVal("itemdescription") : "") || (mappings.name !== undefined ? getVal("name") : "");
        var rowCode = mappings.code !== undefined ? getVal("code") : "";
        var rowCode2 = mappings.code2 !== undefined ? getVal("code2") : "";
        // A blank description with a real code (e.g. "P00022") is still a real BOM line —
        // don't drop it here before it even reaches the backend's own fallback. If the mapped
        // code columns are blank too, scan every cell in the row for anything code-shaped
        // (the code sometimes sits in a column that wasn't mapped).
        if (!itemName && !rowCode && !rowCode2) {
          for (var scanIdx = 0; scanIdx < row.length; scanIdx++) {
            var maybeCode = Data.extractCode(row[scanIdx]);
            if (maybeCode) { rowCode = maybeCode; break; }
          }
        }
        if (!itemName) itemName = rowCode || rowCode2;
        if (!itemName) return;
        // Read UOM from Item UOM column only; pass through trimmed.
        var costUomColIdx = mappings.costuom !== undefined ? mappings.costuom : -1;
        var rawCostUom = "";
        if (costUomColIdx >= 0) {
          var uomCell = getCellString(row, costUomColIdx);
          rawCostUom = (uomCell != null && String(uomCell).trim() !== "") ? String(uomCell).trim() : "";
        }
        var codeBVal = mappings.codeb !== undefined ? getVal("codeb") : "";
        function normParentUom(val) {
          var v = (val || "").toString().trim().toUpperCase();
          if (!v) return "G";
          if (v === "L" || v === "LITRE" || v === "LITRES" || v === "ML") return "L";
          if (v === "EACH" || v === "EACHES" || v === "EA" || v === "UNIT" || v === "UNITS") return "EACH";
          if (v === "KG" || v === "KGS" || v === "G" || v === "GRAM" || v === "GRAMS") return "KG";
          return "G";
        }
        var parsed = {
          parentDescription: parentVal,
          parentCode: mappings.parent !== undefined ? getVal("parent") : "",
          parentUom: getVal("parentuom"),
          itemDescription: itemName,
          code: rowCode,
          code2: rowCode2,
          codeB: codeBVal,
          qtyKg: parseNum("qty") || 0.1,
          category: mappings.cat !== undefined ? getVal("cat") || "Other" : "Other",
          supplier: mappings.supplier !== undefined ? getVal("supplier") : "",
          kj: parseNum("kj"),
          kcal: parseNum("kcal"),
          fat: parseNum("fat"),
          sat: parseNum("sat"),
          carb: parseNum("carb"),
          sugar: parseNum("sugar"),
          fibre: parseNum("fibre"),
          protein: parseNum("protein"),
          salt: parseNum("salt"),
          sodiumMg: parseNum("sodium"),
          costPerKg: parseNum("cost"),
          costUom: rawCostUom,
          scrapPct: mappings.scrap !== undefined ? parseNum("scrap") : -1,
          parentCost: parseNum("parentcost"),
          parentNoofPortions: parseNum("parentnoofportions")
        };
        reqRows.push(parsed);
      });
      if (reqRows.length === 0) { showToast("No valid BOM rows found to import"); return; }
      var resp = await fetch(apiBase + "/imports/recipe-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        sourceName: excelFileName || excelSheetName || "spreadsheet",
        rows: reqRows
        })
      });
      if (resp.ok) {
        var r = {};
        try { r = await resp.json(); } catch (e) {}
        if (window.NutriCalcStorage && typeof window.NutriCalcStorage.refreshFromApi === "function") {
          await window.NutriCalcStorage.refreshFromApi();
        }
        renderAll();
        document.getElementById("excel-step-2").style.display = "none";
        document.getElementById("excel-step-3").style.display = "";
        document.getElementById("excel-import-btn").style.display = "none";
        var msg = (r.recipesCreated || 0) + " recipe(s) built";
        if ((r.ingredientsCreated || 0) > 0) msg += ", " + r.ingredientsCreated + " new ingredient(s)";
        if ((r.ingredientsUpdated || 0) > 0) msg += ", " + r.ingredientsUpdated + " ingredient(s) updated";
        document.getElementById("excel-result-msg").textContent = msg;
        document.getElementById("excel-result-detail").textContent = "Imported via backend (C#).";
        return;
      }
      showToast("Backend import failed (" + resp.status + "). Using local import.");
      runClientRecipeStructureImport(mappings);
    } catch (e) {
      showToast("Backend unavailable. Importing locally.");
      runClientRecipeStructureImport(mappings);
    } finally {
      if (importBtn && importBtn.style.display !== "none") importBtn.disabled = false;
    }
  }

  function excelBack() {
    document.getElementById("excel-step-1").style.display = "";
    document.getElementById("excel-step-2").style.display = "none";
    document.getElementById("excel-step-3").style.display = "none";
    document.getElementById("excel-import-btn").style.display = "none";
    document.getElementById("excel-back-btn").style.display = "none";
    document.getElementById("excelFileInput").value = "";
  }

  if (document.getElementById("excel-import-mode")) {
    document.getElementById("excel-import-mode").addEventListener("change", updateImportSummary);
  }

  window.openExcelImport = openExcelImport;
  window.closeExcelImport = closeExcelImport;
  window.handleExcelDrop = handleExcelDrop;
  window.handleExcelFile = handleExcelFile;
  window.selectExcelSheet = selectExcelSheet;
  window.excelBack = excelBack;
  window.executeExcelImport = executeExcelImport;
  window.executeExcelImportWithChoice = executeExcelImportWithChoice;
  window.confirmExcelUnmatchedAdd = confirmExcelUnmatchedAdd;
  window.skipExcelUnmatched = skipExcelUnmatched;
  window.updateImportSummary = updateImportSummary;
})();
