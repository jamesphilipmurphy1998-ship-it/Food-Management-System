// NutriCalc — UI: views, modals, render, export/import, Excel
(function () {
  "use strict";

  var Data = window.NutriCalcData;
  var Ingredients = window.NutriCalcIngredients;
  var Recipes = window.NutriCalcRecipes;
  var HFSS = window.NutriCalcHFSS;

  var currentRecipeId = null;
  var editIngredientId = null;
  var jamesFireworksTimer = null;

  var INGREDIENT_DISPLAY_DECIMALS_KEY = "wasabi_ingredientDisplayDecimals";
  var PROJECTS_STORAGE_KEY = "nutricalc_projects";
  var editProjectId = null;

  var PROJECT_FOLDERS_STORAGE_KEY = "nutricalc_project_folders";
  var EXPORT_TEMPLATES_STORAGE_KEY = "nutricalc_export_templates";
  var COMPARISON_SAVES_STORAGE_KEY = "nutricalc_comparison_saves";
  var EXCEL_SAVES_STORAGE_KEY = "nutricalc_export_excel_saves";
  var EXCEL_SAVES_DB_NAME = "NutriCostExcelSaves";
  var EXCEL_SAVES_STORE_NAME = "saves";
  var excelSavesCache = [];
  var EXPORT_TEMPLATES_API = (typeof window !== "undefined" && window.location) ? (window.location.origin + "/api/export-templates") : "/api/export-templates";
  var PROJECT_TAG_PREFIX = "Project:";

  function exportTemplatesApiFetch(path, options) {
    var url = path.indexOf("/") === 0 ? (window.location.origin + "/api/export-templates" + path) : (EXPORT_TEMPLATES_API + path);
    return fetch(url, { credentials: "same-origin", headers: options && options.headers || {}, method: options && options.method || "GET", body: options && options.body }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      if (options && options.noJson) return r.text();
      return r.json();
    });
  }

  // ─── Project folders — shared server-side tree (Projects page). Replaces the old flat,
  // localStorage-only list. A folder either holds sub-folders (a pure container, e.g. Technical/
  // Food Team/Restaurant/Grocery) or holds recipes (a leaf — determined by whether it currently
  // has any children, not a stored flag), never both. Each folder's `id` is what a recipe's
  // "Project:{id}" descriptionTag names, exactly as the old flat `slug` did — only the storage
  // and the tree shape changed, not the tagging mechanism itself. ───
  var PROJECT_FOLDERS_API = (typeof window !== "undefined" && window.location) ? (window.location.origin + "/api/project-folders") : "/api/project-folders";
  var PROJECT_FOLDERS_MIGRATED_KEY = "nutricalc_project_folders_migrated_v1";
  var projectFoldersCache = [];
  var currentProjectFolderId = null; // null = root

  function projectFoldersApiFetch(path, options) {
    var url = PROJECT_FOLDERS_API + (path || "");
    return fetch(url, { headers: { "Content-Type": "application/json" }, method: (options && options.method) || "GET", body: options && options.body }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return null; }).then(function (body) { var e = new Error("HTTP " + r.status); e.status = r.status; e.body = body; throw e; });
      return r.status === 204 ? null : r.json();
    });
  }

  function getProjectFolderChildren(parentId) {
    return projectFoldersCache.filter(function (f) { return (f.parentId || null) === (parentId || null); });
  }
  function projectFolderHasChildren(id) {
    return projectFoldersCache.some(function (f) { return f.parentId === id; });
  }
  function getProjectFolderById(id) {
    return projectFoldersCache.find(function (f) { return f.id === id; });
  }
  /** Only recipe folders (isLayer false, explicitly chosen at creation) can hold recipes — used
   * to populate the recipe "Project" dropdown, so a layer folder like Restaurant never shows up
   * as something to directly tag. */
  function getLeafProjectFolders() {
    return projectFoldersCache.filter(function (f) { return !f.locked && !f.isLayer; });
  }

  /** One-time upgrade from the old localStorage-only flat list: whatever folders were sitting in
   * this browser's localStorage get created on the server, nested under Restaurant, so existing
   * "Project:{slug}" recipe tags keep matching (same id/slug carried across) instead of orphaning. */
  async function migrateLocalProjectFoldersOnce() {
    try {
      if (localStorage.getItem(PROJECT_FOLDERS_MIGRATED_KEY)) return;
      var raw = localStorage.getItem(PROJECT_FOLDERS_STORAGE_KEY);
      var localFolders = raw ? JSON.parse(raw) : null;
      if (Array.isArray(localFolders) && localFolders.length > 0) {
        for (var i = 0; i < localFolders.length; i++) {
          var f = localFolders[i];
          var slug = (f && f.slug || "").trim();
          var label = (f && (f.label || f.slug) || "").trim();
          if (!slug || !label) continue;
          if (projectFoldersCache.some(function (sf) { return sf.id === slug; })) continue;
          try {
            var created = await projectFoldersApiFetch("", { method: "POST", body: JSON.stringify({ id: slug, name: label, parentId: "restaurant" }) });
            if (created) projectFoldersCache.push(created);
          } catch (e) { /* best-effort — a failed one just stays local-only until next load */ }
        }
      }
      localStorage.setItem(PROJECT_FOLDERS_MIGRATED_KEY, "1");
    } catch (e) { /* migration is best-effort, never block the Projects page over it */ }
  }

  async function loadProjectFolders() {
    try {
      projectFoldersCache = await projectFoldersApiFetch("") || [];
    } catch (e) {
      projectFoldersCache = [];
    }
    await migrateLocalProjectFoldersOnce();
    renderProjectFolders();
  }

  function getRecipeProjectSlug(recipe) {
    var tags = (recipe && recipe.descriptionTags) || [];
    for (var i = 0; i < tags.length; i++) {
      var t = String(tags[i] || "").trim();
      if (t.toLowerCase().indexOf(PROJECT_TAG_PREFIX.toLowerCase()) === 0) {
        return t.slice(PROJECT_TAG_PREFIX.length).trim().toLowerCase();
      }
    }
    return "";
  }

  function recipeHasProjectTag(recipe, slug) {
    if (!slug) return false;
    var s = String(slug).toLowerCase().trim();
    var tags = (recipe && recipe.descriptionTags) || [];
    return tags.some(function (t) {
      var v = String(t || "").trim();
      return v.toLowerCase() === PROJECT_TAG_PREFIX.toLowerCase() + s;
    });
  }

  function setRecipeProjectInTags(recipe, slug) {
    var tags = (recipe.descriptionTags || []).slice();
    tags = tags.filter(function (t) {
      var v = String(t || "").trim();
      return v.toLowerCase().indexOf(PROJECT_TAG_PREFIX.toLowerCase()) !== 0;
    });
    if (slug && String(slug).trim()) {
      tags.push(PROJECT_TAG_PREFIX + String(slug).trim());
    }
    recipe.descriptionTags = tags;
  }

  function getIngredientDisplayDecimals() {
    try {
      var v = localStorage.getItem(INGREDIENT_DISPLAY_DECIMALS_KEY);
      if (v === "full" || v === "" || v == null) return null;
      var n = parseInt(v, 10);
      if (n >= 0 && n <= 3) return n;
    } catch (e) {}
    return null;
  }

  /** Packaging never carries nutritional values — show "—" instead of 0.00 so it reads as
   * "not applicable" rather than "measured at zero", matching costDisplay's dash convention. */
  function formatNutritionCell(n, isPackaging) {
    if (isPackaging) return "<span style=\"color:var(--nc-gray-300)\">—</span>";
    return formatIngredientDisplayNum(n);
  }

  function formatIngredientDisplayNum(n) {
    if (n === undefined || n === null || n === "") return "";
    var num = parseFloat(n);
    if (isNaN(num)) return "";
    var dec = getIngredientDisplayDecimals();
    if (dec === null) dec = 4;
    var mult = Math.pow(10, dec);
    return (Math.round(num * mult) / mult).toFixed(dec);
  }

  function hasNoNutrition(i) {
    var z = function (v) { return (parseFloat(v) || 0) === 0; };
    return z(i.kj) && z(i.kcal) && z(i.fat) && z(i.sat) && z(i.carb) && z(i.sugar) && z(i.fibre) && z(i.protein) && z(i.salt);
  }

  function isDelisted(name) {
    return (name || "").toLowerCase().indexOf("delisted") !== -1;
  }

  function isPackagingItem(i) {
    if (!i) return false;
    var c = (i.cat || "").trim();
    var nameStart = (i.name || "").trim().toLowerCase();
    return c === "Packaging" || (Data.isPackagingBySupplier && Data.isPackagingBySupplier(i.supplier)) || nameStart.indexOf("nf ") === 0;
  }

  function searchWordsMatch(text, q) {
    if (!q || !(text = (text || "").toString())) return { match: !q, score: 0 };
    var t = text.toLowerCase();
    // A trailing space on the RAW query (before it gets trimmed below) means the user just
    // finished typing a whole word — e.g. "new " — rather than still mid-word. Used on top of
    // the existing substring/word-order scoring below: whole-word matches ("RM New Beef Slice",
    // "(New recipe)") now outrank a query that merely happens to appear inside a longer word
    // ("Newlyweds", "Newly Weds"), across every search box on the site since they all share
    // this one function. Doesn't change anything when there's no trailing space.
    var wholeWordQuery = /\s$/.test(q);
    var qLower = q.toLowerCase().trim();
    var words = qLower.split(/\s+/).filter(Boolean);
    if (words.length === 0) return { match: true, score: 2 };
    if (wholeWordQuery) {
      var escaped = qLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var wholeWordRe = new RegExp("(^|[^a-z0-9])" + escaped + "($|[^a-z0-9])");
      if (wholeWordRe.test(t)) return { match: true, score: 3 };
    }
    if (t.indexOf(qLower) !== -1) return { match: true, score: 2 };
    var allMatch = words.every(function (w) { return t.indexOf(w) !== -1; });
    if (!allMatch) return { match: false, score: 0 };
    var lastIdx = -1;
    for (var i = 0; i < words.length; i++) {
      var idx = t.indexOf(words[i], lastIdx + 1);
      if (idx === -1) return { match: true, score: 0 };
      lastIdx = idx;
    }
    return { match: true, score: 1 };
  }

  function searchTextMatches(text, q) {
    return searchWordsMatch(text, q).match;
  }

  // Recipe hierarchy: base ingredients (nutritionals only) → sub-recipes (can use ingredients + other sub-recipes) → finished products (final; not used in anything).
  // Ingredient Centre: items made of only one base ingredient (1 ingredient with ingredientId only). Recipe Centre: items made of multiple ingredients, or one sub-recipe (which itself has multiple ingredients).
  function isSingleIngredientRecipe(recipe) {
    var ing = (recipe.ingredients || []);
    if (ing.length !== 1) return false;
    return !!ing[0].ingredientId && !ing[0].subRecipeId;
  }

  /** The UOM a recipe presents itself as everywhere it's costed, weighed, or referenced from a
   * parent (e.g. "1 EACH" of this sub-recipe). For a single-ingredient recipe this MUST be the
   * base ingredient's own costUOM — it's nothing but a costing wrapper around one ingredient, so
   * its unit can't independently diverge from what it wraps. A recipe's own costUOM/uom field is
   * only meaningful for a real multi-ingredient recipe; on a single-ingredient wrapper it's
   * frequently a leftover default from import (e.g. "G") that doesn't match the packaging item's
   * real EACH/M unit, which silently broke cost-per-uom (it fell through the weight-ratio path,
   * and packaging is correctly excluded from weight, dividing a real cost by zero) and made the
   * displayed "Total" line for a single-ingredient recipe show the wrong unit entirely. */
  function recipeOwnUom(rec, ingredients) {
    // A recipe's own declared unit (costUOM/uom/serving_uom) is always trusted when present —
    // even if unusual, e.g. a prep recipe correctly using KG while its raw input is EACH
    // (2.5 whole cucumbers -> a KG-costed prepared product is a real transform, not a passthrough).
    var ownUom = (rec.costUOM || rec.uom || rec.serving_uom || "").toString().trim().toUpperCase();
    // Fall back to the base ingredient's unit (the "predecessor") only when: (a) the recipe
    // genuinely has no unit assigned at all, or (b) it's a pure 1:1 costing wrapper (line
    // qty === 1) — kept as a safety net for legacy records that were wrongly defaulted to "G"
    // at import time before that default was removed, so their stored value looks "assigned"
    // even though it never really was.
    if (isSingleIngredientRecipe(rec) && (!ownUom || rec.ingredients[0].qty === 1)) {
      var baseLine = rec.ingredients[0];
      var baseIng = ingredients.find(function (i) { return i.id === baseLine.ingredientId; });
      var baseUom = baseIng ? (baseIng.costUOM || baseIng.costUom || baseIng.CostUom || baseIng.CostUOM || baseIng.cost_uom || "") : "";
      if (baseUom) return baseUom.toString().trim().toUpperCase();
    }
    return ownUom || "G";
  }

  /** Returns badge HTML for a recipe line: PKG for packaging, Sub for sub-recipe, RM for raw material. Uses ingredient/recipe category. Single-ingredient sub-recipes use the same RM/PKG label as in Ingredient Centre. */
  function getRecipeLineBadge(ri, ingredients, recipes) {
    var pkg = '<span class="badge badge-pkg" style="font-size:9px;margin-right:4px">PKG</span>';
    var sub = '<span class="badge badge-subrecipe" style="font-size:9px;margin-right:4px">Sub</span>';
    var rm = '<span class="badge badge-rm" style="font-size:9px;margin-right:4px">RM</span>';
    if (ri.subRecipeId) {
      var subRec = recipes.find(function (r) { return r.id === ri.subRecipeId; });
      if (!subRec) return sub;
      if (isSingleIngredientRecipe(subRec)) {
        var first = subRec.ingredients && subRec.ingredients[0];
        var baseIng = first && first.ingredientId ? ingredients.find(function (i) { return i.id === first.ingredientId; }) : null;
        // Same label as Ingredient Centre: RM or PKG from the base ingredient
        return baseIng && isPackagingItem(baseIng) ? pkg : rm;
      }
      return sub;
    }
    var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
    return ing && isPackagingItem(ing) ? pkg : rm;
  }

  function includeDelistedIngredients() {
    var cb = document.getElementById("ingredient-include-delisted");
    return cb ? cb.checked : false;
  }

  function includeUnlinkedIngredients() {
    var cb = document.getElementById("ingredient-include-unlinked");
    return cb ? cb.checked : false;
  }

  function includeDelistedRecipes() {
    var cb = document.getElementById("recipe-include-delisted");
    return cb ? cb.checked : false;
  }

  function saveIngredientDisplayDecimals() {
    try {
      var sel = document.getElementById("config-ingredient-decimals");
      if (sel) localStorage.setItem(INGREDIENT_DISPLAY_DECIMALS_KEY, sel.value || "full");
    } catch (e) {}
  }

  function showToast(msg) {
    var c = document.getElementById("toast-container");
    if (!c) return;
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);
  }

  function stripSushiWhiteBackground(img) {
    if (!img || img.dataset.processed) return;
    if (!img.complete || !img.naturalWidth) return;
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    var data = ctx.getImageData(0, 0, w, h);
    var d = data.data;
    var threshold = 248;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i] >= threshold && d[i + 1] >= threshold && d[i + 2] >= threshold) d[i + 3] = 0;
    }
    ctx.putImageData(data, 0, 0);
    img.src = canvas.toDataURL("image/png");
    img.dataset.processed = "1";
  }
  (function initSushiStrip() {
    var img = document.getElementById("sushi-loading-img");
    if (!img) return;
    if (img.complete && img.naturalWidth) stripSushiWhiteBackground(img);
    else img.addEventListener("load", function () { stripSushiWhiteBackground(img); });
  })();

  function showSushiLoading(label) {
    var img = document.getElementById("sushi-loading-img");
    if (img) stripSushiWhiteBackground(img);
    var el = document.getElementById("sushi-loading-overlay");
    var labelEl = document.getElementById("sushi-loading-label");
    if (el) {
      el.classList.add("active");
      el.setAttribute("aria-hidden", "false");
      if (labelEl) labelEl.textContent = label || "Loading…";
    }
  }

  function hideSushiLoading() {
    var el = document.getElementById("sushi-loading-overlay");
    if (el) {
      el.classList.remove("active");
      el.setAttribute("aria-hidden", "true");
    }
  }

  function testSushiLoading() {
    showSushiLoading("Loading…");
    setTimeout(hideSushiLoading, 3000);
  }

  function removeJamesFireworks() {
    if (jamesFireworksTimer) {
      clearTimeout(jamesFireworksTimer);
      jamesFireworksTimer = null;
    }
    var existing = document.getElementById("james-fireworks-overlay");
    if (existing) existing.remove();
  }

  function showJamesFireworks() {
    removeJamesFireworks();
    var overlay = document.createElement("div");
    overlay.id = "james-fireworks-overlay";
    overlay.className = "james-fireworks-overlay";

    var colorPalette = ["#ff2d95", "#ffd93d", "#00d4ff", "#9bff7a", "#ff7b00", "#c084fc"];
    for (var i = 0; i < 20; i++) {
      var burst = document.createElement("div");
      burst.className = "james-firework-burst";
      burst.style.left = (4 + Math.random() * 92) + "vw";
      burst.style.bottom = (4 + Math.random() * 22) + "vh";
      burst.style.animationDelay = (Math.random() * 0.35).toFixed(2) + "s";

      for (var s = 0; s < 12; s++) {
        var spark = document.createElement("span");
        spark.className = "james-firework-spark";
        spark.style.setProperty("--spark-angle", (s * 30 + Math.random() * 10) + "deg");
        spark.style.setProperty("--spark-dist", (68 + Math.random() * 68) + "px");
        spark.style.setProperty("--spark-color", colorPalette[(i + s) % colorPalette.length]);
        burst.appendChild(spark);
      }
      overlay.appendChild(burst);
    }

    document.body.appendChild(overlay);
    jamesFireworksTimer = setTimeout(function () {
      removeJamesFireworks();
    }, 3000);
  }

  function handleIngredientSearchKeydown(e) {
    if (!e) return;
    var isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
    if (!isEnter) return;
    var q = (e.target && e.target.value ? e.target.value : "").trim().toLowerCase();
    if (q.indexOf("james") === -1) return;
    showJamesFireworks();
  }

  function handleSearchInputForJames(e) {
    if (!e || !e.target) return;
    var q = (e.target.value || "").toLowerCase();
    var hasJames = q.indexOf("james") !== -1;
    var alreadyTriggered = e.target.dataset.jamesTriggered === "1";
    if (hasJames && !alreadyTriggered) {
      e.target.dataset.jamesTriggered = "1";
      showJamesFireworks();
      return;
    }
    if (!hasJames && alreadyTriggered) {
      e.target.dataset.jamesTriggered = "0";
    }
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove("open");
    if (id === "modal-ingredient") editIngredientId = null;
  }

  function openModal(id) {
    document.getElementById(id).classList.add("open");
  }

  var viewHistoryStack = [];
  var VIEW_HISTORY_MAX = 20;

  // Holds the {name, opts} navigation that was interrupted by the Save/Discard/Cancel prompt
  // below, so Save/Discard can resume it once the user picks — Cancel just clears this and
  // leaves the user on the comparison page.
  var comparisonPendingNav = null;
  // Same idea for leaving the recipe detail page with unsaved ingredient edits — see
  // openRecipe/saveCurrentRecipeChanges/discardCurrentRecipeChanges below. A pending action is
  // a function (not just {name, opts}) since this same prompt also guards openRecipe() itself
  // (navigating from one recipe straight to another never goes through switchView at all).
  var recipeLeavePendingAction = null;
  var recipeSnapshotAtOpen = null;

  function switchView(name, opts) {
    var currentEl = document.querySelector(".view.active");
    var currentName = currentEl && currentEl.id ? currentEl.id.replace("view-", "") : "";
    // Leaving the compare-result page with unsaved qty edits (see comparisonLineQtyChange) —
    // ask whether to write them back to the real recipe(s) before navigating away, discard
    // them, or stay put. Navigation itself is deferred until the user picks Save or Discard.
    if (currentName === "comparison-result" && name !== "comparison-result" && typeof comparisonHasUnsavedChanges === "function" && comparisonHasUnsavedChanges()) {
      comparisonPendingNav = { name: name, opts: opts };
      openModal("modal-comparison-leave");
      return;
    }
    if (currentName === "recipe-detail" && name !== "recipe-detail" && typeof Recipes.hasUnsavedChanges === "function" && Recipes.hasUnsavedChanges()) {
      recipeLeavePendingAction = function () { switchViewInner(name, opts); };
      openModal("modal-recipe-leave");
      return;
    }
    switchViewInner(name, opts);
  }

  function recipeLeaveModalSave() {
    Recipes.flushSave();
    showToast("Recipe saved");
    updateRecipeSaveButton();
    closeModal("modal-recipe-leave");
    var fn = recipeLeavePendingAction;
    recipeLeavePendingAction = null;
    if (fn) fn();
  }

  function recipeLeaveModalDiscard() {
    discardCurrentRecipeChanges();
    closeModal("modal-recipe-leave");
    var fn = recipeLeavePendingAction;
    recipeLeavePendingAction = null;
    if (fn) fn();
  }

  function recipeLeaveModalCancel() {
    recipeLeavePendingAction = null;
    closeModal("modal-recipe-leave");
  }

  function comparisonLeaveModalSave() {
    saveComparisonChanges({ silent: true });
    closeModal("modal-comparison-leave");
    var nav = comparisonPendingNav;
    comparisonPendingNav = null;
    if (nav) switchViewInner(nav.name, nav.opts);
  }

  function comparisonLeaveModalDiscard() {
    discardComparisonChanges();
    closeModal("modal-comparison-leave");
    var nav = comparisonPendingNav;
    comparisonPendingNav = null;
    if (nav) switchViewInner(nav.name, nav.opts);
  }

  function comparisonLeaveModalCancel() {
    comparisonPendingNav = null;
    closeModal("modal-comparison-leave");
  }

  function switchViewInner(name, opts) {
    var currentEl = document.querySelector(".view.active");
    var currentName = currentEl && currentEl.id ? currentEl.id.replace("view-", "") : "";
    // Leaving the Comparisons/Compare-result pair for anywhere else resets the search and
    // selection, so coming back later starts fresh. Moving between comparisons and
    // comparison-result (Compare button, swap, Back) doesn't count as "leaving".
    var COMPARISON_VIEWS = ["comparisons", "comparison-result", "comparison-saves"];
    if (COMPARISON_VIEWS.indexOf(currentName) !== -1 && COMPARISON_VIEWS.indexOf(name) === -1) {
      comparisonSelected = [];
      var compSearchInput = document.getElementById("comparison-search-input");
      if (compSearchInput) compSearchInput.value = "";
      var compSearchBody = document.getElementById("comparison-search-body");
      if (compSearchBody) compSearchBody.innerHTML = "";
      var compSearchCount = document.getElementById("comparison-search-count");
      if (compSearchCount) compSearchCount.textContent = "";
      var compSelectedWrap = document.getElementById("comparison-selected-wrap");
      if (compSelectedWrap) compSelectedWrap.style.display = "none";
      var compSelectedList = document.getElementById("comparison-selected-list");
      if (compSelectedList) compSelectedList.innerHTML = "";
    }
    if (!opts || !opts.isBack) {
      if (currentName && currentName !== name) {
        viewHistoryStack.push(currentName);
        if (viewHistoryStack.length > VIEW_HISTORY_MAX) viewHistoryStack.shift();
      }
    }
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.remove("active");
      v.style.display = "";
    });
    var viewEl = document.getElementById("view-" + name);
    if (viewEl) {
      viewEl.classList.add("active");
      viewEl.style.display = "block";
    }
    if (document.body) {
      if (name === "login") document.body.classList.add("login-page-active");
      else document.body.classList.remove("login-page-active");
    }
    document.querySelectorAll(".sidebar-item").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === name);
    });
    document.querySelectorAll(".topbar-nav button").forEach(function (b) {
      b.classList.remove("active");
      if (b.textContent.toLowerCase().indexOf(name === "recipe-detail" ? "recipe" : name.split("-")[0]) !== -1) b.classList.add("active");
    });
    if (name === "reports") window.populateReportSelect();
    if (name === "projects") { currentProjectFolderId = null; window.loadProjectFolders(); }
    if (name === "export-templates") loadExcelSavesIntoCache(function () { renderExportTemplates(); });
    if (name === "recipes") window.renderRecipesList();
    if (name === "project-recipes") window.renderProjectRecipesList();
    if (name === "comparisons") filterComparisonSearch();
    if (name === "comparison-saves") renderComparisonSaves();
    persistLastView(name);
  }

  // Items picked from the Comparisons search — {kind: "ingredient"|"recipe", id, name, code}.
  // Clicking a result row adds/removes it here instead of navigating away, so several items
  // can be picked and looked at side by side (shown as chips below the search bar).
  var comparisonSelected = [];

  function isComparisonSelected(kind, id) {
    return comparisonSelected.some(function (s) { return s.kind === kind && s.id === id; });
  }

  function toggleComparisonSelect(kind, id, name, code) {
    var idx = comparisonSelected.findIndex(function (s) { return s.kind === kind && s.id === id; });
    if (idx !== -1) comparisonSelected.splice(idx, 1);
    else comparisonSelected.push({ kind: kind, id: id, name: name, code: code });
    renderComparisonSelected();
    filterComparisonSearch();
  }

  function removeComparisonSelected(kind, id) {
    comparisonSelected = comparisonSelected.filter(function (s) { return !(s.kind === kind && s.id === id); });
    renderComparisonSelected();
    filterComparisonSearch();
  }

  // Named, reusable comparisons — {id, name, savedAt, items: [{kind,id,name,code}]} — kept
  // client-side only (like Export Templates), since they're just a personal shortcut back to a
  // particular set of items, not shared/authoritative data.
  function getComparisonSaves() {
    try {
      var raw = localStorage.getItem(COMPARISON_SAVES_STORAGE_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      }
    } catch (e) {}
    return [];
  }

  function setComparisonSaves(saves) {
    if (!Array.isArray(saves)) saves = [];
    try {
      localStorage.setItem(COMPARISON_SAVES_STORAGE_KEY, JSON.stringify(saves));
    } catch (e) {}
  }

  /** "Save this comparison" button on the Comparison Result page — stores the current
   * comparisonSelected set (whatever's currently being compared) under a name for later. */
  // Pricing calculator inputs are per-card (cardIdx matches comparisonSelected's own index) and
  // always present in the DOM regardless of which tab is active (see COMPARISON_TAB_KEYS —
  // every pane is rendered, just hidden), so they can be read here even if the user saved while
  // looking at the Recipe tab rather than Costing Summary.
  function buildComparisonSaveItems() {
    return comparisonSelected.map(function (s, idx) {
      var sellPriceEl = document.getElementById("comp-sell-price-" + idx);
      var annualVolumeEl = document.getElementById("comp-annual-volume-" + idx);
      return {
        kind: s.kind, id: s.id, name: s.name, code: s.code,
        sellPrice: sellPriceEl && sellPriceEl.value !== "" ? sellPriceEl.value : null,
        annualVolume: annualVolumeEl && annualVolumeEl.value !== "" ? annualVolumeEl.value : null
      };
    });
  }

  // Set while modal-comparison-save-overwrite is open, so its three buttons know which existing
  // save they're acting on.
  var comparisonSaveOverwriteTarget = null;

  function saveCurrentComparison() {
    if (!comparisonSelected.length) return;
    // Same exact set of items (order-independent) already saved under a name? Offer to
    // overwrite that entry in place instead of silently piling up duplicate saves every time
    // someone re-saves the same comparison (e.g. after tweaking the sell price) — or save a
    // fresh copy alongside it as a new version.
    var currentKeySet = comparisonSelected.map(function (s) { return s.kind + ":" + s.id; }).sort().join("|");
    var saves = getComparisonSaves();
    var existing = saves.find(function (sv) {
      var keySet = (sv.items || []).map(function (it) { return it.kind + ":" + it.id; }).sort().join("|");
      return keySet === currentKeySet;
    });
    if (existing) {
      comparisonSaveOverwriteTarget = existing;
      var msgEl = document.getElementById("comparison-save-overwrite-msg");
      if (msgEl) msgEl.textContent = "This comparison is already saved as \"" + existing.name + "\". What would you like to do?";
      openModal("modal-comparison-save-overwrite");
      return;
    }
    var defaultName = comparisonSelected.map(function (s) { return s.name; }).join(" vs ");
    var name = prompt("Name this comparison:", defaultName);
    if (!name) return;
    saves.unshift({ id: Data.genId(), name: name, savedAt: new Date().toISOString(), items: buildComparisonSaveItems() });
    setComparisonSaves(saves);
    showToast("Comparison saved");
  }

  function comparisonSaveOverwriteConfirm() {
    var existing = comparisonSaveOverwriteTarget;
    comparisonSaveOverwriteTarget = null;
    closeModal("modal-comparison-save-overwrite");
    if (!existing) return;
    existing.savedAt = new Date().toISOString();
    existing.items = buildComparisonSaveItems();
    var saves = getComparisonSaves().filter(function (sv) { return sv.id !== existing.id; });
    saves.unshift(existing);
    setComparisonSaves(saves);
    showToast("Comparison updated");
  }

  function comparisonSaveOverwriteAsNew() {
    var existing = comparisonSaveOverwriteTarget;
    comparisonSaveOverwriteTarget = null;
    closeModal("modal-comparison-save-overwrite");
    var defaultName = existing ? existing.name + " (2)" : comparisonSelected.map(function (s) { return s.name; }).join(" vs ");
    var name = prompt("Name this new version:", defaultName);
    if (!name) return;
    var saves = getComparisonSaves();
    saves.unshift({ id: Data.genId(), name: name, savedAt: new Date().toISOString(), items: buildComparisonSaveItems() });
    setComparisonSaves(saves);
    showToast("Saved as a new version");
  }

  function comparisonSaveOverwriteCancel() {
    comparisonSaveOverwriteTarget = null;
    closeModal("modal-comparison-save-overwrite");
  }

  function renderComparisonSaves() {
    var saves = getComparisonSaves();
    var empty = document.getElementById("comparison-saves-empty");
    var list = document.getElementById("comparison-saves-list");
    if (!list) return;
    if (empty) empty.style.display = saves.length ? "none" : "";
    list.innerHTML = saves.map(function (save) {
      var itemsLabel = save.items.map(function (it) { return it.name; }).join(", ");
      var dateLabel = save.savedAt ? new Date(save.savedAt).toLocaleString() : "";
      return "<div class=\"card\" style=\"padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap\">" +
        "<div>" +
        "<div style=\"font-weight:600\">" + save.name + "</div>" +
        "<div style=\"font-size:12px;color:var(--nc-gray-500)\">" + itemsLabel + (dateLabel ? " · " + dateLabel : "") + "</div>" +
        "</div>" +
        "<div style=\"display:flex;gap:8px\">" +
        "<button type=\"button\" class=\"btn btn-sm btn-primary\" onclick=\"openComparisonSave('" + save.id + "')\">Open</button>" +
        "<button type=\"button\" class=\"btn btn-sm btn-danger\" onclick=\"deleteComparisonSave('" + save.id + "')\">Delete</button>" +
        "</div></div>";
    }).join("");
  }

  function openComparisonSave(id) {
    var save = getComparisonSaves().find(function (s) { return s.id === id; });
    if (!save) return;
    comparisonSelected = save.items.slice();
    renderComparisonTable();
    // renderComparisonTable() builds the cards synchronously (innerHTML, no async gap), so the
    // per-card calculator inputs already exist in the DOM by this point — restore whatever was
    // saved for each card index and recalculate so the figures aren't just the raw saved
    // sellPrice/annualVolume sitting unused in blank-looking inputs.
    save.items.forEach(function (item, idx) {
      var sellPriceEl = document.getElementById("comp-sell-price-" + idx);
      var annualVolumeEl = document.getElementById("comp-annual-volume-" + idx);
      if (sellPriceEl) sellPriceEl.value = item.sellPrice != null ? item.sellPrice : "";
      if (annualVolumeEl) annualVolumeEl.value = item.annualVolume != null ? item.annualVolume : "";
      if (sellPriceEl || annualVolumeEl) comparisonRecalcMargins(idx);
    });
  }

  function deleteComparisonSave(id) {
    setComparisonSaves(getComparisonSaves().filter(function (s) { return s.id !== id; }));
    renderComparisonSaves();
  }

  /** "Compare" button on the real Recipe Detail page — jumps to the Comparisons search page
   * with the recipe the user was just viewing already selected, ready to pick a second item
   * to compare against. Doesn't clear any existing selection, just adds this one if missing. */
  function openCurrentRecipeInComparisons() {
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    if (!isComparisonSelected("recipe", r.id)) {
      comparisonSelected.push({ kind: "recipe", id: r.id, name: r.name, code: r.code || "" });
    }
    switchView("comparisons");
    renderComparisonSelected();
  }

  /** One selected item's stats, normalized so ingredients and recipes can sit in the same
   * comparison table. Cost is shown per the item's own natural unit (ingredient's costUOM, or
   * a recipe's own resolved UOM via recipeOwnUom/getSubRecipeCostPerUom) since ingredients and
   * recipes aren't priced on a common base. Nutrition is always per 100g, which both already
   * share. Returns null if the item no longer exists (e.g. deleted after being selected). */
  function buildComparisonStats(sel, ingredients, recipes) {
    if (sel.kind === "ingredient") {
      var ing = ingredients.find(function (i) { return i.id === sel.id; });
      if (!ing) return null;
      var costUom = (ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || "").toString().toUpperCase();
      return {
        name: ing.name, code: ing.code || "—",
        kind: isPackagingItem(ing) ? "Packaging" : "Ingredient",
        status: ing.approved ? "Approved" : "In development",
        cost: (ing.cost != null && ing.cost > 0) ? ((ing.currency || "£") + Number(ing.cost).toFixed(3) + " / " + (costUom || "—")) : "—",
        kcal: ing.kcal, protein: ing.protein, fat: ing.fat, carb: ing.carb, fibre: ing.fibre, salt: ing.salt
      };
    }
    var r = recipes.find(function (x) { return x.id === sel.id; });
    if (!r) return null;
    var uom = recipeOwnUom(r, ingredients);
    var costPerUom = getSubRecipeCostPerUom(r, ingredients, uom);
    var nut = Recipes.calcRecipeNutrition(r, ingredients);
    return {
      name: r.name, code: r.code || "—",
      kind: isSingleIngredientRecipe(r) ? "Recipe (single-ingredient)" : ((r.recipeType || "finishedProduct") === "subRecipe" ? "Sub recipe" : "Recipe"),
      status: r.approved ? "Approved" : "In development",
      cost: costPerUom > 0 ? ("£" + costPerUom.toFixed(3) + " / " + uom) : "—",
      kcal: nut.kcal, protein: nut.protein, fat: nut.fat, carb: nut.carb, fibre: nut.fibre, salt: nut.salt
    };
  }

  function renderComparisonTable() {
    var wrap = document.getElementById("comparison-result-body");
    if (!wrap) return;
    if (comparisonSelected.length === 0) {
      showToast("Select at least one ingredient or recipe first");
      return;
    }
    if (comparisonSelected.length === 1 && comparisonSelected[0].kind === "recipe") {
      renderComparisonSingleRecipe(comparisonSelected[0].id);
      return;
    }
    if (comparisonSelected.length === 2 && comparisonSelected[0].kind === "recipe" && comparisonSelected[1].kind === "recipe") {
      renderComparisonTwoRecipes(comparisonSelected[0].id, comparisonSelected[1].id);
      return;
    }
    var ingredients = Ingredients.getIngredients();
    var recipes = Recipes.getRecipes();
    var stats = comparisonSelected.map(function (s) { return buildComparisonStats(s, ingredients, recipes); }).filter(Boolean);
    var fields = [
      { key: "kind", label: "Type" },
      { key: "code", label: "Code" },
      { key: "status", label: "Status" },
      { key: "cost", label: "Cost" },
      { key: "kcal", label: "Energy (kcal/100g)" },
      { key: "protein", label: "Protein (g/100g)" },
      { key: "fat", label: "Fat (g/100g)" },
      { key: "carb", label: "Carbs (g/100g)" },
      { key: "fibre", label: "Fibre (g/100g)" },
      { key: "salt", label: "Salt (g/100g)" }
    ];
    var html = "<div class=\"card\" style=\"padding:0\"><div style=\"overflow:auto\"><table class=\"data-table\"><thead><tr><th></th>" +
      stats.map(function (s) { return "<th>" + escapeHtml(s.name) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      fields.map(function (f) {
        return "<tr><td class=\"bold\">" + f.label + "</td>" + stats.map(function (s) {
          var v = s[f.key];
          return "<td>" + (v == null ? "—" : (typeof v === "number" ? formatIngredientDisplayNum(v) : v)) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></div></div>";
    wrap.innerHTML = html;
    switchView("comparison-result");
  }

  /** Self-contained single-recipe view, reached only by clicking Compare on the Comparisons
   * page — mirrors the real recipe detail page's tab set (with "Ingredients" relabelled
   * "Recipe" here only) but is entirely separate: its own view (view-comparison-result), own
   * render function, never touches view-recipe-detail or any of its DOM/state, so nothing here
   * can affect the real recipe page anywhere else. */
  var COMPARISON_TABS = ["Recipe", "Cooking Instructions", "Nutrition", "Label", "HFSS Score", "Allergens", "Costing Summary", "Photography"];
  var COMPARISON_TAB_KEYS = ["recipe", "cooking", "nutrition", "label", "hfss", "allergens", "costing", "photography"];

  /** One shared tab bar, stretched full width, sitting in the top gap above the card(s). A
   * single set of buttons drives every card's matching pane at once (see
   * switchComparisonRecipeTab), rather than each card having its own separate tab bar. */
  function buildComparisonSharedTabBar() {
    var buttons = COMPARISON_TABS.map(function (label, idx) {
      return "<button type=\"button\" class=\"tab-btn" + (idx === 0 ? " active" : "") + "\" data-comp-tab=\"" + COMPARISON_TAB_KEYS[idx] + "\" onclick=\"switchComparisonRecipeTab('" + COMPARISON_TAB_KEYS[idx] + "')\">" + label + "</button>";
    }).join("");
    return "<div class=\"tab-bar\" style=\"width:100%;margin-top:72px\">" + buttons + "</div>";
  }


  function renderComparisonSingleRecipe(recipeId) {
    var wrap = document.getElementById("comparison-result-body");
    if (!wrap) return;
    var cardHtml = buildComparisonRecipeCardHtml(recipeId, 0, null, "calc(100% - 32px)");
    if (!cardHtml) { wrap.innerHTML = ""; return; }
    wrap.innerHTML = buildComparisonSharedTabBar() + "<div style=\"display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:16px\">" + cardHtml + "</div>";
    switchView("comparison-result");
  }

  /** Two recipes selected — same cards as the single-recipe view, side by side, each capped
   * at half width so both fit in one row. */
  function renderComparisonTwoRecipes(idA, idB) {
    var wrap = document.getElementById("comparison-result-body");
    if (!wrap) return;
    var recipes = Recipes.getRecipes();
    var rA = recipes.find(function (rec) { return rec.id === idA; });
    var rB = recipes.find(function (rec) { return rec.id === idB; });
    var maxLines = Math.max((rA && rA.ingredients || []).length, (rB && rB.ingredients || []).length);
    var ingredientsForMap = Ingredients.getIngredients();
    comparisonLineOrder[0] = rA ? rA.ingredients.slice() : [];
    comparisonLineOrder[1] = rB ? rB.ingredients.slice() : [];
    var arrA = rA ? buildRecipeLineCostMap(comparisonLineOrder[0], ingredientsForMap, recipes) : null;
    var arrB = rB ? buildRecipeLineCostMap(comparisonLineOrder[1], ingredientsForMap, recipes) : null;
    var cardA = buildComparisonRecipeCardHtml(idA, 0, maxLines, null, arrB);
    var cardB = buildComparisonRecipeCardHtml(idB, 1, maxLines, null, arrA);
    var diffCard = buildComparisonCostChangeCardHtml(rA, rB);
    wrap.innerHTML = buildComparisonSharedTabBar() + "<div style=\"display:flex;gap:16px;flex-wrap:wrap;justify-content:center;align-items:flex-start;margin-top:16px\">" + (cardA || "") + (cardB || "") + "</div>" + diffCard;
    switchView("comparison-result");
    equalizeComparisonCardHeaders();
  }

  /** Same 4 costing figures shown in each recipe's own Costing Summary card, used again here
   * to build the diff between two recipes. */
  function computeComparisonCostStats(r, ingredients, recipes) {
    var totalCost = getRecipeTotalCost(r, ingredients, recipes);
    var totalWeight = (r.ingredients || []).reduce(function (s, ri) { return s + recipeLineWeightForTotal(ri); }, 0);
    var serving = r.serving || 100;
    return {
      costPerKg: totalWeight > 0 ? totalCost / totalWeight * 1000 : 0,
      costPerServing: totalWeight > 0 ? totalCost * (serving / totalWeight) : 0,
      costPer100: totalWeight > 0 ? totalCost / totalWeight * 100 : 0,
      totalCost: totalCost
    };
  }

  /** "Cost Change" card — same stat-card theme as each recipe's own Costing Summary, showing
   * the difference (second selected recipe minus first) for all 4 figures. Only meaningful
   * with two recipes selected, so it's built once here rather than per-card. */
  function buildComparisonCostChangeCardHtml(rA, rB) {
    if (!rA || !rB) return "";
    var ingredients = Ingredients.getIngredients();
    var recipes = Recipes.getRecipes();
    var statsA = computeComparisonCostStats(rA, ingredients, recipes);
    var statsB = computeComparisonCostStats(rB, ingredients, recipes);
    function diffCell(label, key) {
      var diff = statsB[key] - statsA[key];
      var sign = diff > 0 ? "+" : "";
      var color = diff > 0 ? "var(--nc-red, #c0392b)" : (diff < 0 ? "var(--nc-green, #2e7d32)" : "var(--nc-gray-700)");
      var pct = statsA[key] !== 0 ? (diff / statsA[key] * 100) : null;
      var pctHtml = pct != null ? " <span style=\"font-size:11px;font-weight:400\">(" + (pct > 0 ? "+" : "") + pct.toFixed(1) + "%)</span>" : "";
      return "<div class=\"stat-card\" style=\"width:fit-content\"><div class=\"stat-label\">" + label + "</div><div class=\"stat-value\" style=\"color:" + color + "\">" + sign + "£" + diff.toFixed(2) + pctHtml + "</div></div>";
    }
    return "<div class=\"card\" data-comp-pane=\"costing\" style=\"display:none;width:100%;margin-top:16px\">" +
      "<h2 style=\"margin-bottom:8px\">Cost Comparison</h2>" +
      "<p style=\"font-size:12px;color:var(--nc-gray-500);margin-bottom:8px\">" + escapeHtml(rB.name) + " vs " + escapeHtml(rA.name) + "</p>" +
      "<div style=\"display:flex;flex-wrap:wrap;gap:12px\">" +
      diffCell("Cost Change per kg", "costPerKg") +
      diffCell("Cost Change per Serving", "costPerServing") +
      diffCell("Cost Change per 100g", "costPer100") +
      diffCell("Cost Change Total Recipe Cost", "totalCost") +
      "<div class=\"stat-card\" style=\"min-width:200px;width:fit-content;position:relative;padding-right:28px\">" +
      "<div class=\"stat-label\" id=\"comp-annual-cell-label\">Annual Profit Change</div>" +
      "<div class=\"stat-value\" id=\"comp-annual-profit-change\">—</div>" +
      "<button type=\"button\" onclick=\"toggleAnnualComparisonCellMode()\" title=\"Switch between Annual Profit Change and Annual Cost Saving\" style=\"position:absolute;top:8px;right:6px;background:none;border:none;cursor:pointer;color:var(--nc-gray-400);font-size:10px;padding:2px;line-height:1\">&#9660;</button>" +
      "</div>" +
      "</div></div>";
  }

  // "profit" = Annual Profit Change (sellPrice-aware, positive=more profit=green — matches the
  // per-card Annual Profit/Year cells). "cost" = Annual Cost Saving — the annualized version of
  // "Cost Change Total Recipe Cost" above, same sign convention as its 4 siblings (cost going
  // DOWN is the good direction, so negative=green here, opposite of profit mode). Same
  // underlying £-impact data, two different lenses on it — not persisted, resets on rebuild.
  var comparisonAnnualCellMode = "profit";
  function toggleAnnualComparisonCellMode() {
    comparisonAnnualCellMode = comparisonAnnualCellMode === "profit" ? "cost" : "profit";
    updateAnnualProfitChangeCell();
  }

  /** Annual Profit/Cost cell depends on each card's own live Target Sell Price + Annual Volume
   * inputs, not just recipe data — so unlike the other 4 Cost Comparison cells (static,
   * computed once at card build time), this one has to be refreshed from here every time either
   * card's calculator changes, using whichever cards are actually on screen. */
  function updateAnnualProfitChangeCell() {
    var cell = document.getElementById("comp-annual-profit-change");
    var labelEl = document.getElementById("comp-annual-cell-label");
    if (!cell) return;
    var diff, color;
    if (comparisonAnnualCellMode === "profit") {
      if (labelEl) labelEl.textContent = "Annual Profit Change";
      var elA = document.getElementById("comp-margin-annual-profit-0");
      var elB = document.getElementById("comp-margin-annual-profit-1");
      if (!elA || !elB) { cell.textContent = "—"; return; }
      var parse = function (el) {
        var n = parseFloat((el.textContent || "").replace(/[£,]/g, ""));
        return isNaN(n) ? null : n;
      };
      var a = parse(elA), b = parse(elB);
      if (a == null || b == null) { cell.textContent = "—"; return; }
      diff = b - a;
      color = diff > 0 ? "var(--nc-green, #2e7d32)" : (diff < 0 ? "var(--nc-red, #c0392b)" : "var(--nc-gray-700)");
    } else {
      if (labelEl) labelEl.textContent = "Annual Cost Saving";
      var cardA = document.querySelector('#comparison-result-body [data-comp-card="0"]');
      var cardB = document.querySelector('#comparison-result-body [data-comp-card="1"]');
      var volA = parseFloat(document.getElementById("comp-annual-volume-0") ? document.getElementById("comp-annual-volume-0").value : "");
      var volB = parseFloat(document.getElementById("comp-annual-volume-1") ? document.getElementById("comp-annual-volume-1").value : "");
      if (!cardA || !cardB || !(volA > 0) || !(volB > 0)) { cell.textContent = "—"; return; }
      var recipes = Recipes.getRecipes();
      var ingredients = Ingredients.getIngredients();
      var rA = recipes.find(function (r) { return r.id === cardA.getAttribute("data-comp-recipe-id"); });
      var rB = recipes.find(function (r) { return r.id === cardB.getAttribute("data-comp-recipe-id"); });
      if (!rA || !rB) { cell.textContent = "—"; return; }
      var annualCostA = getRecipeTotalCost(rA, ingredients, recipes) * volA;
      var annualCostB = getRecipeTotalCost(rB, ingredients, recipes) * volB;
      diff = annualCostB - annualCostA;
      // Cost going down is the saving, same convention as the 4 cost-change cells above.
      color = diff < 0 ? "var(--nc-green, #2e7d32)" : (diff > 0 ? "var(--nc-red, #c0392b)" : "var(--nc-gray-700)");
    }
    var sign = diff > 0 ? "+" : "";
    cell.style.color = color;
    cell.textContent = sign + "£" + diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Each line's cost in row order — purely positional (row 1 vs row 1, row 2 vs row 2, ...),
   * not matched by ingredient identity, so the other card can look up "whatever line happens
   * to be in this same position". */
  /** Keyed by ingredient/sub-recipe identity ("ing:<id>" / "sub:<id>"), not row position — two
   * recipes rarely list the same ingredients in the same order, so matching by row index (the
   * old behaviour) compared unrelated lines against each other and produced nonsense "Line Cost
   * Change" figures. Also carries the recipe's own total, so the Total row's change can be the
   * real total-cost difference rather than a sum of only the lines that happened to line up. */
  function buildRecipeLineCostMap(lines, ingredients, recipes) {
    var byKey = {};
    var total = 0;
    (lines || []).forEach(function (ri) {
      var costPerUom, key;
      if (ri.subRecipeId) {
        var sub = recipes.find(function (x) { return x.id === ri.subRecipeId; });
        var subUom = sub ? recipeOwnUom(sub, ingredients) : (ri.uom || "G");
        costPerUom = sub ? getSubRecipeCostPerUom(sub, ingredients, subUom) : 0;
        key = "sub:" + ri.subRecipeId;
      } else {
        var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
        costPerUom = ing ? (ing.cost || 0) : 0;
        key = "ing:" + ri.ingredientId;
      }
      var lineCost = costPerUom * (ri.qty || 0);
      byKey[key] = (byKey[key] || 0) + lineCost; // same ingredient used twice in one recipe sums together
      total += lineCost;
    });
    return { byKey: byKey, total: total };
  }

  /** Per-card working copy of the recipe's ingredient lines, used only for the Recipe tab's
   * drag-to-reorder (see comparisonLineDrop) — a view-only reshuffle, never touching the real
   * recipe data or saving anything. Reset to the recipe's real line order whenever a card is
   * freshly built (new Compare click, or after a card swap). */
  var comparisonLineOrder = {};
  // Tracks which cards have a qty edit not yet written back to the real recipe (see
  // comparisonLineQtyChange / saveComparisonChanges) — drives the "Save Changes" button and
  // the leave-page prompt.
  var comparisonDirty = {};
  function comparisonHasUnsavedChanges() {
    return Object.keys(comparisonDirty).some(function (k) { return comparisonDirty[k]; });
  }

  function buildComparisonRecipeCardHtml(recipeId, cardIdx, padToLineCount, maxWidth, otherLineCostMap) {
    var recipes = Recipes.getRecipes();
    var ingredients = Ingredients.getIngredients();
    var r = recipes.find(function (rec) { return rec.id === recipeId; });
    if (!r) return null;
    if (!comparisonLineOrder[cardIdx] || comparisonLineOrder[cardIdx].__recipeId !== recipeId) {
      comparisonLineOrder[cardIdx] = (r.ingredients || []).slice();
      comparisonLineOrder[cardIdx].__recipeId = recipeId;
      comparisonLineOrder[cardIdx].__origQty = comparisonLineOrder[cardIdx].map(function (ri) { return ri.qty; });
      comparisonDirty[cardIdx] = false;
      comparisonUndoStack = comparisonUndoStack.filter(function (e) { return e.cardIdx !== cardIdx; });
      updateComparisonUndoButton();
    }

    var tabKeys = COMPARISON_TAB_KEYS;

    var nut = Recipes.calcRecipeNutrition(r, ingredients);
    var hfss = HFSS.calcHFSS(r, ingredients);
    var totalCost = getRecipeTotalCost(r, ingredients, recipes);
    var ownUom = recipeOwnUom(r, ingredients);
    var costPerOwnUom = getSubRecipeCostPerUom(r, ingredients, ownUom);
    var totalWeight = (r.ingredients || []).reduce(function (s, ri) { return s + recipeLineWeightForTotal(ri); }, 0);
    var serving = r.serving || 100;
    var costPer100 = totalWeight > 0 ? totalCost / totalWeight * 100 : 0;
    var costPerKg = totalWeight > 0 ? totalCost / totalWeight * 1000 : 0;
    var costPerServing = totalWeight > 0 ? totalCost * (serving / totalWeight) : 0;
    var locked = !!r.approved;

    function lineRowsHtml() {
      var workingLines = comparisonLineOrder[cardIdx];
      var totalChange = 0;
      // Recompute costPerUom/lineCost for every line first, so the Total row and each line's
      // % Recipe reflect any qty edits made below (in-development recipes only — see
      // comparisonLineQtyChange) rather than the stored, unedited recipe total.
      var lineData = (workingLines || []).map(function (ri) {
        var name, code, uom, costPerUom;
        if (ri.subRecipeId) {
          var sub = recipes.find(function (x) { return x.id === ri.subRecipeId; });
          name = sub ? sub.name : "(missing)"; code = sub ? sub.code : "—";
          var subUom = sub ? recipeOwnUom(sub, ingredients) : (ri.uom || "G");
          costPerUom = sub ? getSubRecipeCostPerUom(sub, ingredients, subUom) : 0;
        } else {
          var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
          name = ing ? ing.name : "(missing)"; code = ing ? ing.code : "—";
          costPerUom = ing ? (ing.cost || 0) : 0;
        }
        uom = ri.uom || "G";
        var lineCost = costPerUom * (ri.qty || 0);
        return { name: name, code: code, uom: uom, costPerUom: costPerUom, lineCost: lineCost };
      });
      var tabTotalCost = lineData.reduce(function (s, d) { return s + d.lineCost; }, 0);
      var rows = (workingLines || []).map(function (ri, idx) {
        var d = lineData[idx];
        var pctRecipe = tabTotalCost > 0 ? (d.lineCost / tabTotalCost * 100) : 0;
        // Matched by ingredient/sub-recipe identity, not row position — the two recipes rarely
        // list their lines in the same order, so comparing "whatever's in this same row" (the
        // old behaviour) diffed unrelated ingredients against each other. A line with no match
        // in the other recipe (only present here) shows "—" rather than a meaningless number.
        var changeCell = "<td>—</td>";
        if (otherLineCostMap) {
          var key = ri.subRecipeId ? "sub:" + ri.subRecipeId : "ing:" + ri.ingredientId;
          if (Object.prototype.hasOwnProperty.call(otherLineCostMap.byKey, key)) {
            var change = d.lineCost - otherLineCostMap.byKey[key];
            var sign = change > 0 ? "+" : "";
            var color = change > 0 ? "var(--nc-red, #c0392b)" : (change < 0 ? "var(--nc-green, #2e7d32)" : "var(--nc-gray-700)");
            changeCell = "<td class=\"num\" style=\"color:" + color + "\">" + sign + "£" + change.toFixed(3) + "</td>";
          } else {
            changeCell = "<td class=\"num\" style=\"color:var(--nc-gray-400)\">only here</td>";
          }
        }
        // Row reordering is a development-time convenience, same lock rules as everything else
        // here — an approved recipe's line order isn't something a comparison view should let
        // anyone casually shuffle.
        var handleCell = locked
          ? "<td style=\"color:var(--nc-gray-200);text-align:center;width:20px;user-select:none\">&#8942;&#8942;</td>"
          : "<td draggable=\"true\" data-comp-line-idx=\"" + idx + "\" ondragstart=\"comparisonLineDragStart(event," + cardIdx + "," + idx + ")\" ondragend=\"comparisonLineDragEnd(event)\" style=\"cursor:grab;color:var(--nc-gray-300);text-align:center;width:20px;user-select:none\" title=\"Drag to reorder\">&#8942;&#8942;</td>";
        // Qty is only editable here for a recipe still in development (not approved) — the
        // same lock rules as the real recipe page apply once approved. Editing recalculates
        // this card's Recipe-tab totals only (Nutrition/Costing tabs stay on stored data).
        var qtyCell = locked
          ? "<td class=\"num\">" + (ri.qty || 0) + " " + escapeHtml(d.uom) + "</td>"
          : "<td onclick=\"event.stopPropagation()\" class=\"num\" style=\"padding:6px 12px\"><input type=\"number\" class=\"form-input\" min=\"0\" step=\"any\" value=\"" + (ri.qty || 0) + "\" style=\"width:58px;padding:2px 6px;text-align:right;box-sizing:border-box\" onchange=\"comparisonLineQtyChange(" + cardIdx + "," + idx + ", this.value)\"> " + escapeHtml(d.uom) + "</td>";
        var rowDragAttrs = locked ? "" : " ondragover=\"comparisonLineDragOver(event," + cardIdx + "," + idx + ")\" ondrop=\"comparisonLineDrop(event," + cardIdx + "," + idx + ")\"";
        return "<tr" + rowDragAttrs + ">" + handleCell + "<td style=\"font-family:var(--nc-mono);font-size:12px;color:var(--nc-gray-600)\">" + escapeHtml(d.code || "—") + "</td>" +
          "<td class=\"bold\">" + escapeHtml(d.name) + "</td>" +
          qtyCell +
          "<td class=\"num\">" + pctRecipe.toFixed(1) + "%</td>" +
          "<td class=\"num\">" + (ri.scrapPct || 0) + "%</td>" +
          "<td class=\"num\">£" + d.costPerUom.toFixed(3) + " / " + escapeHtml(d.uom) + "</td>" +
          "<td class=\"num\">£" + d.lineCost.toFixed(3) + "</td>" +
          changeCell + "</tr>";
      }).join("");
      // Pad with blank rows so this card's Total row lines up with the other card's, when the
      // two recipes being compared have different numbers of ingredient lines.
      var lineCount = (workingLines || []).length;
      var padCount = padToLineCount ? Math.max(0, padToLineCount - lineCount) : 0;
      // Was only 8 <td>s against this table's real 9 columns, and had no explicit height at
      // all — on some renders that made the filler shorter than a genuine content row, so the
      // Total row didn't actually land in the same place as the other card's even though the
      // line COUNT was padded correctly. A fixed height matching a normal single-line row
      // (confirmed via the locked/unlocked row-height parity fix earlier) makes this exact
      // regardless of either card's lock state.
      // Deliberately structured like a real row's cells rather than plain empty <td>s — a real
      // row's ~60px height turned out to come from the qty cell's <input> box (padding+border),
      // not from generic td padding, so a filler with no input never reached the same height
      // even with matching classes/glyphs (measured ~40px vs ~60px either way). Including one
      // here (disabled, row hidden via visibility) was the only thing that actually closed the
      // gap — confirmed by measurement, not guessed.
      // `height` on the <tr> itself is only ever a hint in table layout — the actual rendered
      // row height comes from each <td>'s own auto/content height, so it has to be set on every
      // cell individually (confirmed by direct measurement) to reliably force this row to match
      // a real single-line row's height (60px) regardless of either card's lock state.
      var fillerTd = "<td style=\"height:60px\"></td>";
      var fillerRow = "<tr style=\"visibility:hidden\">" + new Array(10).join(fillerTd) + "</tr>";
      var filler = padCount > 0 ? new Array(padCount + 1).join(fillerRow) : "";
      var totalChangeCell = "<td class=\"num bold\" style=\"height:60px\">—</td>";
      if (otherLineCostMap) {
        totalChange = tabTotalCost - otherLineCostMap.total;
        var totalSign = totalChange > 0 ? "+" : "";
        var totalColor = totalChange > 0 ? "var(--nc-red, #c0392b)" : (totalChange < 0 ? "var(--nc-green, #2e7d32)" : "var(--nc-gray-700)");
        totalChangeCell = "<td class=\"num bold\" style=\"height:60px;color:" + totalColor + "\">" + totalSign + "£" + totalChange.toFixed(3) + "</td>";
      }
      // The Total row's own cells also get an explicit per-cell height, same as the filler row
      // above and for the same reason — without it, this row is the one that ends up
      // compressed to keep the two cards' overall table heights matching each other, which just
      // moves the misalignment here instead of fixing it.
      return "<div style=\"overflow-x:auto\"><table class=\"data-table\"><colgroup><col style=\"width:24px\"><col><col style=\"width:220px\"><col style=\"width:96px\"><col><col style=\"width:52px\"><col style=\"width:100px\"><col><col></colgroup><thead><tr><th></th><th>Code</th><th>Ingredient</th><th>Qty</th><th>% Recipe</th><th>Scrap %</th><th>Cost per UOM (£)</th><th>Line Cost</th><th>Line Cost Change</th></tr></thead><tbody id=\"comp-line-tbody-" + cardIdx + "\">" +
        (rows || "<tr><td colspan=\"9\" style=\"color:var(--nc-gray-400)\">No ingredient lines.</td></tr>") +
        filler +
        "<tr><td style=\"height:60px\"></td><td style=\"height:60px\"></td><td class=\"bold\" style=\"height:60px\">Total</td><td class=\"num bold\" style=\"height:60px\">1 " + escapeHtml(ownUom) + "</td><td class=\"num bold\" style=\"height:60px\">100%</td><td style=\"height:60px\"></td><td style=\"height:60px\"></td><td class=\"num bold\" style=\"height:60px\">£" + tabTotalCost.toFixed(3) + "</td>" + totalChangeCell + "</tr>" +
        "</tbody></table></div>";
    }

    var allergenSet = {};
    (r.ingredients || []).forEach(function (ri) {
      var ing = ri.ingredientId ? ingredients.find(function (i) { return i.id === ri.ingredientId; }) : null;
      (ing && ing.allergens || []).forEach(function (a) { allergenSet[a] = true; });
    });
    var allergenList = Object.keys(allergenSet);

    var panels = {
      recipe: lineRowsHtml(),
      cooking: "<div style=\"white-space:pre-wrap;font-size:13px\">" + (escapeHtml(r.method || r.methodKitchen || r.methodFactory || "") || "<span style=\"color:var(--nc-gray-400)\">No cooking instructions recorded.</span>") + "</div>",
      nutrition: "<table class=\"data-table\"><tbody>" +
        "<tr><td class=\"bold\">Energy</td><td class=\"num\">" + formatIngredientDisplayNum(nut.kcal) + " kcal / 100g</td></tr>" +
        "<tr><td class=\"bold\">Protein</td><td class=\"num\">" + formatIngredientDisplayNum(nut.protein) + " g / 100g</td></tr>" +
        "<tr><td class=\"bold\">Fat</td><td class=\"num\">" + formatIngredientDisplayNum(nut.fat) + " g / 100g</td></tr>" +
        "<tr><td class=\"bold\">Carbs</td><td class=\"num\">" + formatIngredientDisplayNum(nut.carb) + " g / 100g</td></tr>" +
        "<tr><td class=\"bold\">Sugar</td><td class=\"num\">" + formatIngredientDisplayNum(nut.sugar) + " g / 100g</td></tr>" +
        "<tr><td class=\"bold\">Fibre</td><td class=\"num\">" + formatIngredientDisplayNum(nut.fibre) + " g / 100g</td></tr>" +
        "<tr><td class=\"bold\">Salt</td><td class=\"num\">" + formatIngredientDisplayNum(nut.salt) + " g / 100g</td></tr>" +
        "</tbody></table>",
      label: "<p style=\"font-size:12px;color:var(--nc-gray-500)\">Nutrition declaration (per 100g):</p><table class=\"data-table\"><tbody>" +
        "<tr><td class=\"bold\">Energy</td><td class=\"num\">" + formatIngredientDisplayNum(nut.kcal) + " kcal</td></tr>" +
        "<tr><td class=\"bold\">Fat</td><td class=\"num\">" + formatIngredientDisplayNum(nut.fat) + " g</td></tr>" +
        "<tr><td class=\"bold\">of which Sugars</td><td class=\"num\">" + formatIngredientDisplayNum(nut.sugar) + " g</td></tr>" +
        "<tr><td class=\"bold\">Fibre</td><td class=\"num\">" + formatIngredientDisplayNum(nut.fibre) + " g</td></tr>" +
        "<tr><td class=\"bold\">Protein</td><td class=\"num\">" + formatIngredientDisplayNum(nut.protein) + " g</td></tr>" +
        "<tr><td class=\"bold\">Salt</td><td class=\"num\">" + formatIngredientDisplayNum(nut.salt) + " g</td></tr>" +
        "</tbody></table>",
      hfss: "<table class=\"data-table\"><tbody>" +
        "<tr><td class=\"bold\">HFSS Status</td><td>" + (hfss.isHFSS ? "<span class=\"badge badge-red\">HFSS</span>" : "<span class=\"badge badge-green\">Non-HFSS</span>") + "</td></tr>" +
        "<tr><td class=\"bold\">Score</td><td class=\"num\">" + hfss.total + "</td></tr>" +
        "</tbody></table>",
      allergens: allergenList.length
        ? allergenList.map(function (a) { return "<span class=\"allergen-tag allergen-present\" style=\"margin-right:6px\">" + escapeHtml(a) + "</span>"; }).join("")
        : "<span style=\"color:var(--nc-gray-400)\">None</span>",
      costing: "<div style=\"display:flex;flex-wrap:wrap;gap:12px\">" +
        "<div class=\"stat-card\" style=\"width:fit-content\"><div class=\"stat-label\">Cost per kg</div><div class=\"stat-value\">£" + costPerKg.toFixed(2) + "</div></div>" +
        "<div class=\"stat-card\" style=\"width:fit-content\"><div class=\"stat-label\">Cost per Serving</div><div class=\"stat-value\">£" + costPerServing.toFixed(2) + "</div></div>" +
        "<div class=\"stat-card\" style=\"width:fit-content\"><div class=\"stat-label\">Cost per 100g</div><div class=\"stat-value\">£" + costPer100.toFixed(2) + "</div></div>" +
        "<div class=\"stat-card\" style=\"width:fit-content\"><div class=\"stat-label\">Total Recipe Cost</div><div class=\"stat-value\">£" + totalCost.toFixed(2) + "</div></div>" +
        "</div>" +
        "<div style=\"margin-top:16px\">" +
        "<h3 style=\"font-size:14px;margin-bottom:8px\">Pricing &amp; Margin Calculator</h3>" +
        "<div style=\"display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px\">" +
        "<div class=\"form-group\" style=\"width:150px\"><label class=\"form-label\">RSP (£)</label><input class=\"form-input\" type=\"number\" step=\"any\" min=\"0\" placeholder=\"e.g. 3.50\" id=\"comp-sell-price-" + cardIdx + "\" oninput=\"comparisonRecalcMargins(" + cardIdx + ")\">" +
        "<label style=\"display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px;color:var(--nc-gray-600);cursor:pointer\"><input type=\"checkbox\" id=\"comp-vat-toggle-" + cardIdx + "\" checked onchange=\"toggleVatRateVisibility('comparison'," + cardIdx + ");comparisonRecalcMargins(" + cardIdx + ")\" style=\"margin:0\">VAT<input class=\"form-input\" type=\"number\" step=\"any\" min=\"0\" max=\"100\" value=\"20\" id=\"comp-vat-pct-" + cardIdx + "\" oninput=\"comparisonRecalcMargins(" + cardIdx + ")\" style=\"width:48px;padding:2px 6px;font-size:12px\" title=\"VAT rate (%)\">%</label>" +
        "<div class=\"stat-card\" style=\"margin-top:8px;padding:8px 10px;width:fit-content\"><div class=\"stat-label\" style=\"font-size:11px\">RSP Ex VAT</div><div class=\"stat-value\" style=\"font-size:15px\" id=\"comp-rsp-ex-vat-" + cardIdx + "\">—</div></div>" +
        "</div>" +
        "<div class=\"form-group\" style=\"width:190px\"><label class=\"form-label\" style=\"white-space:nowrap\">Annual Volume (units)</label><input class=\"form-input\" type=\"number\" step=\"any\" min=\"0\" placeholder=\"e.g. 50000\" id=\"comp-annual-volume-" + cardIdx + "\" oninput=\"comparisonRecalcMargins(" + cardIdx + ")\"></div>" +
        "</div>" +
        "<div style=\"display:flex;flex-wrap:wrap;gap:12px\">" +
        "<div class=\"stat-card\" style=\"width:fit-content;border-color:var(--nc-green);background:var(--nc-green-light)\"><div class=\"stat-label\" style=\"color:#059669\">Gross Profit / Unit</div><div class=\"stat-value\" style=\"color:#065F46\" id=\"comp-margin-profit-" + cardIdx + "\">—</div></div>" +
        "<div class=\"stat-card\" style=\"width:fit-content;border-color:var(--nc-green);background:var(--nc-green-light)\" id=\"comp-margin-pct-card-" + cardIdx + "\"><div class=\"stat-label\" style=\"color:#059669\">Gross Margin %</div><div class=\"stat-value\" style=\"color:#065F46\" id=\"comp-margin-pct-" + cardIdx + "\">—</div></div>" +
        "<div class=\"stat-card\" style=\"width:fit-content;border-color:var(--nc-green);background:var(--nc-green-light)\"><div class=\"stat-label\" style=\"color:#059669\">Annual Profit / Year</div><div class=\"stat-value\" style=\"color:#065F46\" id=\"comp-margin-annual-profit-" + cardIdx + "\">—</div></div>" +
        "</div></div>",
      photography: "<span style=\"color:var(--nc-gray-400)\">Photography is not available in this view.</span>"
    };

    var tabPanels = tabKeys.map(function (key, idx) {
      return "<div class=\"comp-recipe-tab-pane\" data-comp-pane=\"" + key + "\" style=\"" + (idx === 0 ? "" : "display:none;") + "padding-top:12px\">" + panels[key] + "</div>";
    }).join("");

    var statusBadge = r.approved ? "<span class=\"badge badge-approved\">Approved</span>" : "<span class=\"badge badge-development\">In development</span>";
    var kindBadge = (r.recipeType || "finishedProduct") === "subRecipe" ? "<span class=\"badge badge-subrecipe\">Sub recipe</span>" : "<span class=\"badge badge-finishedproduct\">Finished product</span>";
    // Same weight display as the real recipe page's "Total weight" (app.js renderRecipeIngredients)
    // — EACH-based recipes show "1 EACH" as the primary figure, plus a derived gram weight
    // underneath wherever the lines carry a known per-unit weight; weight-based recipes just
    // show the summed weight directly.
    var weightLabel = (ownUom === "EACH") ? "Total: " : "Total weight: ";
    var weightPrimary = (ownUom === "EACH") ? "1 EACH" : (Data.round(totalWeight) + "g");
    var weightHtml = "<div style=\"font-size:12px;color:var(--nc-gray-500);margin-top:2px\">" + weightLabel + "<strong>" + weightPrimary + "</strong>" +
      ((ownUom === "EACH" && totalWeight > 0) ? "<br><span style=\"font-size:11px\">Total weight: </span><strong style=\"font-size:11px\">" + Data.round(totalWeight) + "g</strong>" : "") +
      "</div>";

    return "<div class=\"card\" data-comp-card=\"" + cardIdx + "\" data-comp-recipe-id=\"" + escapeHtml(recipeId) + "\" style=\"flex:1 1 480px;max-width:" + (maxWidth || "calc(50% - 8px)") + ";padding:20px 8px\">" +
      "<div data-comp-card-header=\"" + cardIdx + "\">" +
      "<div style=\"display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:8px\">" +
      "<h2 style=\"margin-bottom:4px;cursor:grab\" draggable=\"true\" data-comp-title=\"" + cardIdx + "\" ondragstart=\"comparisonCardDragStart(event," + cardIdx + ")\" ondragover=\"comparisonCardDragOver(event)\" ondrop=\"comparisonCardDrop(event," + cardIdx + ")\" ondragend=\"comparisonCardDragEnd(event)\">" + escapeHtml(r.name) + "</h2>" +
      "<div style=\"text-align:right\"><div style=\"display:flex;gap:6px;justify-content:flex-end\">" + statusBadge + kindBadge + "</div>" + weightHtml + "</div>" +
      "</div>" +
      (r.code ? "<p style=\"font-size:12px;color:var(--nc-gray-500);margin-bottom:2px\">Code: " + escapeHtml(r.code) + "</p>" : "") +
      (r.desc ? "<p style=\"font-size:12px;color:var(--nc-gray-500);margin-bottom:8px\">" + escapeHtml(r.desc) + "</p>" : "") +
      "</div>" +
      tabPanels +
      "</div>";
  }

  /** When comparing two recipes, a longer/wrapping name (or code/desc) on one card pushes that
   * card's whole Recipe-tab table down relative to the other's, even though every row inside
   * both tables now matches height-for-height — the offset was above the table, not within it.
   * Pads the shorter card's header to match the taller one's real rendered height so both
   * tables (and therefore both Total rows) start at the same Y position. */
  function equalizeComparisonCardHeaders() {
    var headerA = document.querySelector('[data-comp-card-header="0"]');
    var headerB = document.querySelector('[data-comp-card-header="1"]');
    if (!headerA || !headerB) return;
    headerA.style.minHeight = "";
    headerB.style.minHeight = "";
    var hA = headerA.getBoundingClientRect().height;
    var hB = headerB.getBoundingClientRect().height;
    var max = Math.max(hA, hB);
    headerA.style.minHeight = max + "px";
    headerB.style.minHeight = max + "px";
    // The Recipe tab's own <thead> can independently wrap its column labels differently between
    // the two cards even with identical <colgroup> widths (confirmed by measurement — 66.5px vs
    // 83px for the exact same header row), which re-introduces the same kind of offset the
    // header-height equalization above just fixed. Same fix, same reason: force both to the
    // taller of the two so both tbodys — and both Total rows — start at the same Y regardless.
    document.querySelectorAll('[data-comp-pane="recipe"] thead tr').forEach(function (tr) { tr.style.height = ""; Array.from(tr.children).forEach(function (th) { th.style.height = ""; }); });
    var theadRows = document.querySelectorAll('[data-comp-pane="recipe"] thead tr');
    var maxTheadH = 0;
    theadRows.forEach(function (tr) { maxTheadH = Math.max(maxTheadH, tr.getBoundingClientRect().height); });
    theadRows.forEach(function (tr) { Array.from(tr.children).forEach(function (th) { th.style.height = maxTheadH + "px"; }); });
  }

  /** Drag a card's title across the midline onto the other card's title to swap which recipe
   * displays first/second — re-renders the whole comparison (cards, Cost Comparison, everything)
   * against the new order by reordering comparisonSelected and calling renderComparisonTable(). */
  var comparisonCardDragIdx = null;
  function comparisonCardDragStart(e, cardIdx) {
    comparisonCardDragIdx = cardIdx;
    e.currentTarget.style.opacity = "0.4";
    e.dataTransfer.effectAllowed = "move";
  }
  function comparisonCardDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function comparisonCardDrop(e, targetIdx) {
    e.preventDefault();
    if (comparisonCardDragIdx == null || comparisonCardDragIdx === targetIdx) return;
    var activeTabBtn = document.querySelector("#comparison-result-body > .tab-bar .tab-btn.active");
    var activeTabKey = activeTabBtn ? activeTabBtn.getAttribute("data-comp-tab") : null;
    var tmp = comparisonSelected[0];
    comparisonSelected[0] = comparisonSelected[1];
    comparisonSelected[1] = tmp;
    comparisonCardDragIdx = null;
    renderComparisonSelected();
    renderComparisonTable();
    if (activeTabKey) switchComparisonRecipeTab(activeTabKey);
  }
  function comparisonCardDragEnd(e) {
    e.currentTarget.style.opacity = "";
    comparisonCardDragIdx = null;
  }

  /** Drag a line's handle (just left of the Code column) up or down within its own recipe's
   * table to reorder it — view-only, never edits or saves the actual recipe. Moving a line only
   * changes that card's "Line Cost Change" values (it now lines up against a different row on
   * the other card), nothing else about the line itself. */
  var comparisonLineDragState = null;
  function comparisonLineDragStart(e, cardIdx, idx) {
    comparisonLineDragState = { cardIdx: cardIdx, idx: idx };
    var tr = e.currentTarget.closest ? e.currentTarget.closest("tr") : null;
    if (tr) tr.style.opacity = "0.4";
    e.dataTransfer.effectAllowed = "move";
  }
  var COMPARISON_INSERT_BORDER = "3px solid var(--nc-primary, #2e7d32)";
  function comparisonClearLineIndicators(cardIdx) {
    var tbody = document.getElementById("comp-line-tbody-" + cardIdx);
    if (!tbody) return;
    tbody.querySelectorAll("tr").forEach(function (row) {
      row.style.borderTop = "";
      row.style.borderBottom = "";
    });
  }
  function comparisonLineDragOver(e, cardIdx, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!comparisonLineDragState || comparisonLineDragState.cardIdx !== cardIdx) return;
    var tr = e.currentTarget;
    var rect = tr.getBoundingClientRect();
    var before = (e.clientY - rect.top) < rect.height / 2;
    comparisonClearLineIndicators(cardIdx);
    if (before) tr.style.borderTop = COMPARISON_INSERT_BORDER;
    else tr.style.borderBottom = COMPARISON_INSERT_BORDER;
    tr.dataset.compInsertBefore = before ? "1" : "0";
  }
  function comparisonLineDrop(e, cardIdx, targetIdx) {
    e.preventDefault();
    var before = e.currentTarget.dataset.compInsertBefore !== "0";
    comparisonClearLineIndicators(cardIdx);
    if (!comparisonLineDragState || comparisonLineDragState.cardIdx !== cardIdx) {
      comparisonLineDragState = null;
      return;
    }
    var fromIdx = comparisonLineDragState.idx;
    var insertIdx = before ? targetIdx : targetIdx + 1;
    if (fromIdx === insertIdx || fromIdx === insertIdx - 1) { comparisonLineDragState = null; return; }
    var lines = comparisonLineOrder[cardIdx];
    if (!lines) { comparisonLineDragState = null; return; }
    var recipeId = lines.__recipeId;
    var moved = lines.splice(fromIdx, 1)[0];
    if (fromIdx < insertIdx) insertIdx--;
    lines.splice(insertIdx, 0, moved);
    lines.__recipeId = recipeId;
    comparisonLineDragState = null;
    comparisonRefreshCardsAfterLineReorder();
  }
  function comparisonLineDragEnd(e) {
    var tr = e.currentTarget.closest ? e.currentTarget.closest("tr") : null;
    if (tr) tr.style.opacity = "";
    if (comparisonLineDragState) comparisonClearLineIndicators(comparisonLineDragState.cardIdx);
    comparisonLineDragState = null;
  }

  /** Rebuilds both recipe cards in place from the current comparisonLineOrder — used after a
   * line-reorder drag, since the Line Cost Change on BOTH cards depends on each other's row
   * order. Preserves whichever tab is currently active. */
  function comparisonRefreshCardsAfterLineReorder() {
    var ingredients = Ingredients.getIngredients();
    var recipes = Recipes.getRecipes();
    var activeTabBtn = document.querySelector("#comparison-result-body > .tab-bar .tab-btn.active");
    var activeTabKey = activeTabBtn ? activeTabBtn.getAttribute("data-comp-tab") : null;
    var idA = comparisonLineOrder[0] ? comparisonLineOrder[0].__recipeId : null;
    var idB = comparisonLineOrder[1] ? comparisonLineOrder[1].__recipeId : null;
    var cardAEl = document.querySelector('[data-comp-card="0"]');
    if (idB && cardAEl) {
      var maxLines = Math.max(comparisonLineOrder[0].length, comparisonLineOrder[1].length);
      var arrA = buildRecipeLineCostMap(comparisonLineOrder[0], ingredients, recipes);
      var arrB = buildRecipeLineCostMap(comparisonLineOrder[1], ingredients, recipes);
      var cardBEl = document.querySelector('[data-comp-card="1"]');
      var htmlA = buildComparisonRecipeCardHtml(idA, 0, maxLines, null, arrB);
      var htmlB = buildComparisonRecipeCardHtml(idB, 1, maxLines, null, arrA);
      if (cardAEl && htmlA) cardAEl.outerHTML = htmlA;
      if (cardBEl && htmlB) cardBEl.outerHTML = htmlB;
    } else if (idA && cardAEl) {
      var htmlSingle = buildComparisonRecipeCardHtml(idA, 0, null, "calc(100% - 32px)");
      if (htmlSingle) cardAEl.outerHTML = htmlSingle;
    }
    if (activeTabKey) switchComparisonRecipeTab(activeTabKey);
    equalizeComparisonCardHeaders();
  }

  /** Qty edit on an in-development recipe's Recipe tab (see lineRowsHtml/locked in
   * buildComparisonRecipeCardHtml — approved recipes never render this input). Mutates the
   * working line in place (marks the card dirty) and rebuilds both cards so totals/line-cost
   * change stay in sync; nothing is written to the real recipe until Save Changes is clicked. */
  // Undo stack for comparison qty edits — one shared stack across both cards so Undo always
  // reverts whichever edit happened most recently, regardless of which card it was on.
  var comparisonUndoStack = [];
  var COMPARISON_UNDO_MAX = 20;
  function updateComparisonUndoButton() {
    var btn = document.getElementById("comparison-undo-btn");
    if (btn) btn.style.display = comparisonUndoStack.length ? "" : "none";
  }

  function comparisonLineQtyChange(cardIdx, idx, val) {
    var lines = comparisonLineOrder[cardIdx];
    if (!lines || !lines[idx]) return;
    comparisonUndoStack.push({ cardIdx: cardIdx, idx: idx, qty: lines[idx].qty });
    if (comparisonUndoStack.length > COMPARISON_UNDO_MAX) comparisonUndoStack.shift();
    lines[idx].qty = parseFloat(val) || 0;
    comparisonDirty[cardIdx] = true;
    comparisonRefreshCardsAfterLineReorder();
    comparisonUpdateSaveChangesButton();
    updateComparisonUndoButton();
  }

  function undoComparisonChange() {
    var last = comparisonUndoStack.pop();
    updateComparisonUndoButton();
    if (!last) return;
    var lines = comparisonLineOrder[last.cardIdx];
    if (!lines || !lines[last.idx]) return;
    lines[last.idx].qty = last.qty;
    var origQty = lines.__origQty || [];
    comparisonDirty[last.cardIdx] = lines.some(function (ri, i) { return (ri.qty || 0) !== (origQty[i] || 0); });
    comparisonRefreshCardsAfterLineReorder();
    comparisonUpdateSaveChangesButton();
  }

  function comparisonUpdateSaveChangesButton() {
    var btn = document.getElementById("comparison-save-changes-btn");
    if (btn) btn.style.display = comparisonHasUnsavedChanges() ? "" : "none";
  }

  /** Writes every dirty card's edited quantities back to the real recipe (same versioning call
   * used by the real recipe page) and persists via Recipes.setRecipes. Only ever touches
   * recipes still in development — approved recipes can't produce a dirty card in the first
   * place, since their qty cells aren't editable. */
  function saveComparisonChanges(opts) {
    var silent = opts && opts.silent;
    if (!comparisonHasUnsavedChanges()) return;
    var recipes = Recipes.getRecipes();
    Object.keys(comparisonDirty).forEach(function (cardIdx) {
      if (!comparisonDirty[cardIdx]) return;
      var lines = comparisonLineOrder[cardIdx];
      if (!lines || !lines.__recipeId) return;
      var r = recipes.find(function (rec) { return rec.id === lines.__recipeId; });
      if (!r) return;
      addRecipeVersionBeforeSave(r);
      lines.__origQty = lines.map(function (ri) { return ri.qty; });
      comparisonDirty[cardIdx] = false;
      comparisonUndoStack = comparisonUndoStack.filter(function (e) { return String(e.cardIdx) !== String(cardIdx); });
    });
    Recipes.setRecipes(recipes);
    comparisonUpdateSaveChangesButton();
    updateComparisonUndoButton();
    if (!silent) showToast("Comparison changes saved to the recipe(s)");
  }

  /** Reverts every dirty card's edited quantities back to what they were when this comparison
   * was opened (or last saved), without touching the real recipe. */
  function discardComparisonChanges() {
    Object.keys(comparisonDirty).forEach(function (cardIdx) {
      if (!comparisonDirty[cardIdx]) return;
      var lines = comparisonLineOrder[cardIdx];
      if (!lines || !lines.__origQty) return;
      lines.forEach(function (ri, idx) { ri.qty = lines.__origQty[idx]; });
      comparisonDirty[cardIdx] = false;
      comparisonUndoStack = comparisonUndoStack.filter(function (e) { return String(e.cardIdx) !== String(cardIdx); });
    });
    updateComparisonUndoButton();
  }

  /** One shared tab bar (see buildComparisonSharedTabBar) drives every card at once — this
   * flips the matching pane in ALL cards together, so comparing two recipes shows the same
   * tab side by side rather than each card having its own independent tab state. */
  function switchComparisonRecipeTab(key) {
    document.querySelectorAll("#comparison-result-body > .tab-bar [data-comp-tab]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-comp-tab") === key);
    });
    document.querySelectorAll("#comparison-result-body [data-comp-pane]").forEach(function (pane) {
      pane.style.display = pane.getAttribute("data-comp-pane") === key ? "" : "none";
    });
  }

  /** Same math as the real recipe page's recalcMargins(), scoped to one card's own recipe and
   * its own namespaced inputs/outputs, so two cards' calculators don't interfere. */
  function comparisonRecalcMargins(cardIdx) {
    var card = document.querySelector('#comparison-result-body [data-comp-card="' + cardIdx + '"]');
    if (!card) return;
    var recipeId = card.getAttribute("data-comp-recipe-id");
    var recipes = Recipes.getRecipes();
    var ingredients = Ingredients.getIngredients();
    var r = recipes.find(function (rec) { return rec.id === recipeId; });
    if (!r) return;
    var totalCost = getRecipeTotalCost(r, ingredients, recipes);
    var costPerUnit = totalCost;
    var sellPrice = parseFloat(document.getElementById("comp-sell-price-" + cardIdx).value);
    var annualVolume = parseFloat(document.getElementById("comp-annual-volume-" + cardIdx).value);
    var profitEl = document.getElementById("comp-margin-profit-" + cardIdx);
    var pctEl = document.getElementById("comp-margin-pct-" + cardIdx);
    var pctCardEl = document.getElementById("comp-margin-pct-card-" + cardIdx);
    var annualProfitEl = document.getElementById("comp-margin-annual-profit-" + cardIdx);
    // Same VAT handling as the real recipe page's Costing tab — see recalcMargins for the why.
    var vatToggle = document.getElementById("comp-vat-toggle-" + cardIdx);
    var vatOn = vatToggle ? vatToggle.checked : false;
    var vatPct = parseFloat(document.getElementById("comp-vat-pct-" + cardIdx) ? document.getElementById("comp-vat-pct-" + cardIdx).value : 0) || 0;
    var netSellPrice = (vatOn && sellPrice > 0) ? sellPrice / (1 + vatPct / 100) : sellPrice;
    var rspExVatEl = document.getElementById("comp-rsp-ex-vat-" + cardIdx);
    if (rspExVatEl) rspExVatEl.textContent = netSellPrice > 0 ? "£" + netSellPrice.toFixed(2) : "—";
    var profit = null;
    if (netSellPrice > 0) {
      profit = netSellPrice - costPerUnit;
      var marginPct = (profit / netSellPrice) * 100;
      profitEl.textContent = "£" + profit.toFixed(2);
      pctEl.textContent = Data.round(marginPct) + "%";
      pctCardEl.style.borderColor = marginPct >= 50 ? "var(--nc-green)" : marginPct >= 30 ? "var(--nc-amber)" : "var(--nc-red)";
      pctCardEl.style.background = marginPct >= 50 ? "var(--nc-green-light)" : marginPct >= 30 ? "var(--nc-amber-light)" : "var(--nc-red-light)";
    } else {
      profitEl.textContent = "—";
      pctEl.textContent = "—";
    }
    if (annualProfitEl) {
      annualProfitEl.textContent = (profit != null && annualVolume > 0) ? "£" + (profit * annualVolume).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
    }
    updateAnnualProfitChangeCell();
  }

  function renderComparisonSelected() {
    var wrap = document.getElementById("comparison-selected-wrap");
    var list = document.getElementById("comparison-selected-list");
    if (!wrap || !list) return;
    wrap.style.display = comparisonSelected.length ? "" : "none";
    list.innerHTML = comparisonSelected.map(function (s, idx) {
      var kindLabel = s.kind === "ingredient" ? "Ingredient" : "Recipe";
      return "<span class=\"badge\" draggable=\"true\" data-comp-selected-idx=\"" + idx + "\" ondragstart=\"comparisonSelectedDragStart(event," + idx + ")\" ondragover=\"comparisonSelectedDragOver(event)\" ondrop=\"comparisonSelectedDrop(event," + idx + ")\" ondragend=\"comparisonSelectedDragEnd(event)\" style=\"display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:var(--nc-gray-50);border:1px solid var(--nc-gray-200);border-radius:999px;font-size:12px;cursor:grab\">" +
        "<span style=\"color:var(--nc-gray-400)\">" + kindLabel + "</span>" +
        "<span class=\"bold\">" + escapeHtml(s.name) + "</span>" +
        (s.code ? "<span style=\"font-family:var(--nc-mono);color:var(--nc-gray-500)\">" + escapeHtml(s.code) + "</span>" : "") +
        "<button type=\"button\" onclick=\"removeComparisonSelected('" + s.kind + "','" + s.id.replace(/'/g, "\\'") + "')\" style=\"border:none;background:none;cursor:pointer;color:var(--nc-gray-400);font-size:14px;line-height:1;padding:0\" title=\"Remove\">&times;</button>" +
        "</span>";
    }).join("");
  }

  var comparisonSelectedDragIdx = null;
  function comparisonSelectedDragStart(e, idx) {
    comparisonSelectedDragIdx = idx;
    e.currentTarget.style.opacity = "0.4";
    e.dataTransfer.effectAllowed = "move";
  }
  function comparisonSelectedDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function comparisonSelectedDrop(e, targetIdx) {
    e.preventDefault();
    if (comparisonSelectedDragIdx == null || comparisonSelectedDragIdx === targetIdx) return;
    var moved = comparisonSelected.splice(comparisonSelectedDragIdx, 1)[0];
    comparisonSelected.splice(targetIdx, 0, moved);
    comparisonSelectedDragIdx = null;
    renderComparisonSelected();
  }
  function comparisonSelectedDragEnd(e) {
    e.currentTarget.style.opacity = "";
    comparisonSelectedDragIdx = null;
  }

  /** Global search across ingredients and recipes (including single-ingredient wrapper
   * recipes), for the Comparisons page. Matches on name and code/altCodes. Clicking a row
   * selects/deselects it (see comparisonSelected above) rather than navigating away. */
  function filterComparisonSearch() {
    var body = document.getElementById("comparison-search-body");
    var countEl = document.getElementById("comparison-search-count");
    if (!body) return;
    var qEl = document.getElementById("comparison-search-input");
    // Not trimmed here — searchWordsMatch needs to see a genuine trailing space (the user just
    // finished typing a whole word) to rank whole-word matches above mid-word substring hits;
    // it does its own trimming internally for the actual matching.
    var q = (qEl ? qEl.value : "").toLowerCase();
    if (!q.trim()) {
      body.innerHTML = "";
      if (countEl) countEl.textContent = "Type to search across every ingredient and recipe.";
      return;
    }
    var statusFilter = (document.getElementById("comparison-search-status-filter") || {}).value || "all";
    var typeFilter = (document.getElementById("comparison-search-type-filter") || {}).value || "all";
    var ingredients = Ingredients.getIngredients();
    var recipes = Recipes.getRecipes();
    function statusMatches(approved) {
      if (statusFilter === "approved") return !!approved;
      if (statusFilter === "development") return !approved;
      return true;
    }
    // Shares searchWordsMatch with every other search box on the site (Ingredient/Recipe
    // Centre, add-ingredient dropdowns, etc.) instead of a bespoke raw-substring check, so it
    // gets the same word-order scoring and whole-word-on-trailing-space ranking as those —
    // and, unlike the old boolean-only matches(), actually sorts by relevance now.
    function bestMatch(name, code, altCodes) {
      var nameR = searchWordsMatch(name, q);
      var codeR = searchWordsMatch(code, q);
      var altR = (altCodes || []).map(function (c) { return searchWordsMatch(c, q); }).reduce(function (a, b) { return a.score > b.score ? a : b; }, { match: false, score: 0 });
      return [nameR, codeR, altR].reduce(function (a, b) { return a.score >= b.score ? a : b; }, { match: false, score: 0 });
    }
    var ingRows = (typeFilter === "recipes" ? [] : ingredients).filter(function (i) { return bestMatch(i.name, i.code, i.altCodes).match && statusMatches(i.approved); })
      .sort(function (a, b) { return bestMatch(b.name, b.code, b.altCodes).score - bestMatch(a.name, a.code, a.altCodes).score; })
      .map(function (i) {
        var statusBadge = i.approved ? "<span class=\"badge badge-approved\" style=\"font-size:10px\">Approved</span>" : "<span class=\"badge badge-development\" style=\"font-size:10px\">In development</span>";
        var typeLabel = isPackagingItem(i) ? "Packaging" : "Ingredient";
        var selected = isComparisonSelected("ingredient", i.id);
        var safeId = i.id.replace(/'/g, "\\'");
        var safeName = escapeHtml(i.name).replace(/'/g, "\\'");
        return "<tr class=\"row-clickable\" style=\"cursor:pointer" + (selected ? ";background:var(--nc-gray-50)" : "") + "\" onclick=\"toggleComparisonSelect('ingredient','" + safeId + "','" + safeName + "','" + (i.code || "") + "')\">" +
          "<td class=\"bold\">" + (selected ? "<span style=\"color:var(--nc-primary, #2e7d32);margin-right:4px\">&#10003;</span>" : "") + escapeHtml(i.name) + "</td>" +
          "<td style=\"color:var(--nc-gray-500)\">" + typeLabel + "</td>" +
          "<td style=\"font-size:12px;color:var(--nc-gray-600);font-family:var(--nc-mono)\">" + (i.code || "—") + "</td>" +
          "<td>" + statusBadge + "</td></tr>";
      });
    var recRows = (typeFilter === "ingredients" ? [] : recipes).filter(function (r) { return bestMatch(r.name, r.code, null).match && statusMatches(r.approved); })
      .sort(function (a, b) { return bestMatch(b.name, b.code, null).score - bestMatch(a.name, a.code, null).score; })
      .map(function (r) {
        var statusBadge = r.approved ? "<span class=\"badge badge-approved\" style=\"font-size:10px\">Approved</span>" : "<span class=\"badge badge-development\" style=\"font-size:10px\">In development</span>";
        var typeLabel = isSingleIngredientRecipe(r) ? "Recipe (single-ingredient)" : ((r.recipeType || "finishedProduct") === "subRecipe" ? "Sub recipe" : "Recipe");
        var selected = isComparisonSelected("recipe", r.id);
        var safeId = r.id.replace(/'/g, "\\'");
        var safeName = escapeHtml(r.name).replace(/'/g, "\\'");
        return "<tr class=\"row-clickable\" style=\"cursor:pointer" + (selected ? ";background:var(--nc-gray-50)" : "") + "\" onclick=\"toggleComparisonSelect('recipe','" + safeId + "','" + safeName + "','" + (r.code || "") + "')\">" +
          "<td class=\"bold\">" + (selected ? "<span style=\"color:var(--nc-primary, #2e7d32);margin-right:4px\">&#10003;</span>" : "") + escapeHtml(r.name) + "</td>" +
          "<td style=\"color:var(--nc-gray-500)\">" + typeLabel + "</td>" +
          "<td style=\"font-size:12px;color:var(--nc-gray-600);font-family:var(--nc-mono)\">" + (r.code || "—") + "</td>" +
          "<td>" + statusBadge + "</td></tr>";
      });
    var rows = ingRows.concat(recRows);
    body.innerHTML = rows.length ? rows.join("") : "<tr><td colspan=\"4\" style=\"color:var(--nc-gray-400)\">No matches.</td></tr>";
    if (countEl) countEl.textContent = rows.length + " match" + (rows.length !== 1 ? "es" : "") + " (" + ingRows.length + " ingredient" + (ingRows.length !== 1 ? "s" : "") + ", " + recRows.length + " recipe" + (recRows.length !== 1 ? "s" : "") + ")";
  }

  // Remembers where the user was so a page refresh (F5) returns to the same spot instead of
  // resetting to the dashboard. "login" is deliberately never persisted as a destination.
  var LAST_VIEW_KEY = "ncLastView";
  function persistLastView(name) {
    if (!name || name === "login") return;
    try {
      localStorage.setItem(LAST_VIEW_KEY, JSON.stringify({ view: name, recipeId: name === "recipe-detail" ? currentRecipeId : null }));
    } catch (e) { /* ignore (e.g. private browsing) */ }
  }
  function restoreLastView() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(LAST_VIEW_KEY) || "null"); } catch (e) { saved = null; }
    if (!saved || !saved.view || !document.getElementById("view-" + saved.view)) { switchView("dashboard"); return; }
    if (saved.view === "recipe-detail" && saved.recipeId) {
      var stillExists = Recipes.getRecipes().some(function (r) { return r.id === saved.recipeId; });
      if (stillExists) { openRecipe(saved.recipeId); return; }
      switchView("recipes");
      return;
    }
    switchView(saved.view);
  }

  function goBack() {
    if (viewHistoryStack.length > 0) {
      var prev = viewHistoryStack.pop();
      switchView(prev, { isBack: true });
    } else {
      switchView("projects", { isBack: true });
    }
  }

  function goBackFromRecipeDetail() {
    var entry = recipeNavStack.pop();
    if (!entry) { switchView("recipes"); return; }
    if (entry.type === "recipe") { openRecipe(entry.id, null, true); return; }
    switchView(entry.name);
  }

  // Single always-visible Back button in the top bar — different views already have their own
  // back logic (recipe detail tracks its own nav stack of parent recipes), so this just routes
  // to whichever one applies to the currently active view instead of duplicating that logic.
  function topbarGoBack() {
    var activeView = document.querySelector(".view.active");
    var name = activeView && activeView.id ? activeView.id.replace("view-", "") : "";
    if (name === "recipe-detail") { goBackFromRecipeDetail(); return; }
    // Inside the Projects folder tree, Back steps up one folder level at a time (matching how
    // breadcrumb navigation already works) instead of leaving the Projects page entirely — only
    // falls through to the normal view-history Back once already at the root.
    if (name === "projects" && currentProjectFolderId) {
      var f = getProjectFolderById(currentProjectFolderId);
      openProjectFolder(f ? f.parentId : null);
      return;
    }
    goBack();
  }

  function getProjects() {
    try {
      var raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      }
    } catch (e) {}
    return [];
  }

  function setProjects(projects) {
    if (!Array.isArray(projects)) projects = [];
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {}
  }

  function getExportTemplates() {
    try {
      var raw = localStorage.getItem(EXPORT_TEMPLATES_STORAGE_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      }
    } catch (e) {}
    return [];
  }

  function setExportTemplates(templates) {
    if (!Array.isArray(templates)) templates = [];
    try {
      localStorage.setItem(EXPORT_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    } catch (e) {}
  }

  function getExcelSaves() {
    return excelSavesCache;
  }

  /* Excel saves storage: all IndexedDB access is async and callback-based. Never assume
     sync completion. getExcelSaves() returns the in-memory cache; call
     loadExcelSavesIntoCache(cb) before relying on the cache (e.g. when opening Export Templates view). */

  function openExcelSavesDB(callback) {
    if (typeof indexedDB === "undefined") { callback(new Error("IndexedDB not supported")); return; }
    var req = indexedDB.open(EXCEL_SAVES_DB_NAME, 1);
    req.onerror = function () { callback(req.error); };
    req.onsuccess = function () { callback(null, req.result); };
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(EXCEL_SAVES_STORE_NAME)) db.createObjectStore(EXCEL_SAVES_STORE_NAME);
    };
  }

  function getExcelSavesFromIDB(callback) {
    openExcelSavesDB(function (err, db) {
      if (err) { callback(err, []); return; }
      var tx = db.transaction(EXCEL_SAVES_STORE_NAME, "readonly");
      var store = tx.objectStore(EXCEL_SAVES_STORE_NAME);
      var req = store.get("list");
      req.onerror = function () { db.close(); callback(req.error, []); };
      req.onsuccess = function () {
        db.close();
        var arr = req.result;
        callback(null, Array.isArray(arr) ? arr : []);
      };
    });
  }

  function setExcelSavesToIDB(saves, callback) {
    if (!Array.isArray(saves)) saves = [];
    openExcelSavesDB(function (err, db) {
      if (err) { callback(err); return; }
      var tx = db.transaction(EXCEL_SAVES_STORE_NAME, "readwrite");
      var store = tx.objectStore(EXCEL_SAVES_STORE_NAME);
      store.put(saves, "list");
      tx.onerror = function () { db.close(); callback(tx.error); };
      tx.oncomplete = function () { db.close(); callback(null); };
    });
  }

  function loadExcelSavesIntoCache(callback) {
    exportTemplatesApiFetch("", { method: "GET" }).then(function (list) {
      if (Array.isArray(list) && list.length >= 0) {
        excelSavesCache = list.map(function (t) {
          var prev = t.preview;
          if (typeof prev === "string") { try { prev = JSON.parse(prev); } catch (e) { prev = []; } }
          return { id: t.id, name: t.name || t.fileName, fileName: t.fileName || (t.name || "template") + ".xlsx", preview: prev, createdAt: t.createdAt, updatedAt: t.updatedAt, fromApi: true };
        });
        if (callback) callback();
        return;
      }
      throw new Error("Invalid response");
    }).catch(function () {
      getExcelSavesFromIDB(function (err, arr) {
        excelSavesCache = arr || [];
        if (!err && excelSavesCache.length === 0) {
          try {
            var raw = localStorage.getItem(EXCEL_SAVES_STORAGE_KEY);
            if (raw) {
              var migrated = JSON.parse(raw);
              if (Array.isArray(migrated) && migrated.length > 0) {
                setExcelSavesToIDB(migrated, function (e) {
                  if (!e) { excelSavesCache = migrated; try { localStorage.removeItem(EXCEL_SAVES_STORAGE_KEY); } catch (x) {} }
                  if (callback) callback();
                });
                return;
              }
            }
          } catch (x) {}
        }
        if (callback) callback();
      });
    });
  }

  function renderExportTemplates() {
    var list = document.getElementById("export-templates-list");
    if (!list) return;
    var templates = getExportTemplates();
    var excelSaves = getExcelSaves();
    var addBtnHtml = "<button type=\"button\" class=\"photography-add-box\" id=\"export-template-add-btn\" onclick=\"openNewExportTemplate()\" title=\"New blank template\"><svg width=\"32\" height=\"32\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><path d=\"M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z\"/></svg><span>New template</span></button>";
    var html = addBtnHtml;
    html += templates.map(function (t) {
      var name = (t.name || "Unnamed template").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      var id = (t.id || "").replace(/'/g, "\\'");
      return '<div class="photography-thumb" style="cursor:pointer;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;padding:8px;box-sizing:border-box" onclick="openEditExportTemplate(\'' + id + '\')" title="' + name + '">' +
        '<svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" opacity="0.7"><path d="M2 1h12a1 1 0 011 1v12a1 1 0 01-1 1H2a1 1 0 01-1-1V2a1 1 0 011-1zm1 3v2h8V4H3zm0 4v1h5V8H3zm0 3v1h8v-1H3z"/></svg>' +
        '<span style="font-size:12px;color:var(--nc-gray-600);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">' + name + '</span>' +
        '<button type="button" class="photography-thumb-remove" onclick="event.stopPropagation();deleteExportTemplate(\'' + id + '\')" title="Delete template">×</button></div>';
    }).join("");
    html += excelSaves.map(function (s) {
      var name = (s.name || s.fileName || "Excel").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      var id = (s.id || "").replace(/'/g, "\\'");
      var thumbHtml = "";
      if (s.preview && Array.isArray(s.preview) && s.preview.length > 0) {
        thumbHtml = "<table class=\"excel-save-thumb-table\"><tbody>";
        for (var r = 0; r < Math.min(3, s.preview.length); r++) {
          thumbHtml += "<tr>";
          var row = s.preview[r];
          for (var c = 0; c < Math.min(4, Array.isArray(row) ? row.length : 0); c++) {
            var cell = (row && row[c] != null) ? String(row[c]).slice(0, 8) : "";
            thumbHtml += "<td>" + (cell.replace(/</g, "&lt;").replace(/&/g, "&amp;")) + "</td>";
          }
          thumbHtml += "</tr>";
        }
        thumbHtml += "</tbody></table>";
      } else {
        thumbHtml = "<svg width=\"32\" height=\"32\" viewBox=\"0 0 16 16\" fill=\"currentColor\" opacity=\"0.7\"><path d=\"M2 1h12a1 1 0 011 1v12a1 1 0 01-1 1H2a1 1 0 01-1-1V2a1 1 0 011-1zm1 3v2h8V4H3zm0 4v1h5V8H3zm0 3v1h8v-1H3z\"/></svg>";
      }
      return "<div class=\"photography-thumb excel-save-thumb\" onclick=\"openExcelEditorFromSaved('" + id + "')\" title=\"" + name + "\">" +
        "<div class=\"excel-save-thumb-preview\">" + thumbHtml + "</div>" +
        "<span class=\"excel-save-thumb-name\">" + name + "</span>" +
        "<button type=\"button\" class=\"photography-thumb-remove\" onclick=\"event.stopPropagation();deleteExcelSave('" + id + "')\" title=\"Delete\">×</button></div>";
    }).join("");
    list.innerHTML = html;
  }

  function ensureExportTemplatesViewRefreshed() {
    var view = document.getElementById("view-export-templates");
    if (view && view.classList.contains("active")) renderExportTemplates();
  }

  function openNewExportTemplate() {
    document.getElementById("modal-export-template-title").textContent = "New template";
    document.getElementById("export-template-id").value = "";
    document.getElementById("export-template-name").value = "";
    document.getElementById("export-template-content").value = "";
    document.getElementById("export-template-delete-btn").style.display = "none";
    openModal("modal-export-template");
  }

  function openEditExportTemplate(id) {
    var templates = getExportTemplates();
    var t = templates.find(function (x) { return x.id === id; });
    if (!t) return;
    document.getElementById("modal-export-template-title").textContent = "Edit template";
    document.getElementById("export-template-id").value = t.id || "";
    document.getElementById("export-template-name").value = t.name || "";
    document.getElementById("export-template-content").value = t.content || "";
    document.getElementById("export-template-delete-btn").style.display = "";
    openModal("modal-export-template");
  }

  function saveExportTemplate() {
    var idEl = document.getElementById("export-template-id");
    var nameEl = document.getElementById("export-template-name");
    var contentEl = document.getElementById("export-template-content");
    var id = (idEl && idEl.value || "").trim();
    var name = (nameEl && nameEl.value || "").trim();
    var content = (contentEl && contentEl.value || "").trim();
    if (!name) { showToast("Enter a template name"); return; }
    var templates = getExportTemplates();
    if (id) {
      var idx = templates.findIndex(function (x) { return x.id === id; });
      if (idx >= 0) {
        templates[idx] = { id: templates[idx].id, name: name, content: content, updatedAt: new Date().toISOString() };
      }
    } else {
      var newId = "tpl_" + Math.random().toString(36).slice(2, 11);
      templates.push({ id: newId, name: name, content: content, createdAt: new Date().toISOString() });
    }
    setExportTemplates(templates);
    renderExportTemplates();
    closeModal("modal-export-template");
    showToast("Template saved");
  }

  function deleteExportTemplate(id) {
    if (!confirm("Delete this template?")) return;
    var templates = getExportTemplates().filter(function (t) { return t.id !== id; });
    setExportTemplates(templates);
    renderExportTemplates();
    showToast("Template deleted");
  }

  function deleteExportTemplateFromModal() {
    var id = (document.getElementById("export-template-id") && document.getElementById("export-template-id").value || "").trim();
    if (!id) return;
    closeModal("modal-export-template");
    deleteExportTemplate(id);
  }

  // --- Excel editor (drag file in Export Templates, edit in modal, save into site templates only — no download ---
  var excelEditorWorkbook = null;
  var excelEditorFileName = "";
  var excelEditorSheetIndex = 0;
  var excelEditorSelectedCol = 0;
  var excelEditorSavedId = null;
  /** When set, we save by merging grid into this original zip so formatting is preserved (no SheetJS write). */
  var excelEditorOriginalBytes = null;
  var excelEditorMerges = [];
  var excelEditorHiddenRows = [];
  var excelEditorColProps = [];
  var excelEditorRowProps = [];
  var excelEditorMaxRows = 0;
  var excelEditorMaxCols = 0;
  var EXCEL_EDITOR_DEFAULT_COL_PX = 72;
  var EXCEL_EDITOR_DEFAULT_ROW_PX = 28;

  function excelEditorColWidthPx(c) {
    var col = excelEditorColProps[c];
    if (!col) return EXCEL_EDITOR_DEFAULT_COL_PX;
    if (typeof col.wpx === "number" && col.wpx > 0) return col.wpx;
    if (typeof col.wch === "number" && col.wch > 0) return Math.round(col.wch * 8);
    return EXCEL_EDITOR_DEFAULT_COL_PX;
  }

  function excelEditorRowHeightPx(r) {
    var row = excelEditorRowProps[r];
    if (!row) return EXCEL_EDITOR_DEFAULT_ROW_PX;
    if (typeof row.hpx === "number" && row.hpx > 0) return row.hpx;
    if (typeof row.hpt === "number" && row.hpt > 0) return Math.round(row.hpt * (96 / 72));
    return EXCEL_EDITOR_DEFAULT_ROW_PX;
  }

  function excelEditorColIndexToLetter(n) {
    var s = "";
    n = n + 1;
    while (n > 0) {
      var r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s || "A";
  }

  /** Update only cell values in sheet XML; leaves all other XML unchanged so hidden rows, merges,
   * styles (colours, fonts, borders), column widths, row heights, and every other format are preserved. */
  function updateSheetXmlCellValues(sheetXml, valueByRef) {
    if (!sheetXml || typeof valueByRef !== "object") return sheetXml;
    var result = sheetXml;
    for (var ref in valueByRef) {
      if (!valueByRef.hasOwnProperty(ref)) continue;
      var value = valueByRef[ref];
      var refEsc = ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var re = new RegExp("<c r=\"" + refEsc + "\"([^>]*)>([\\s\\S]*?)</c>");
      var match = result.match(re);
      if (!match) continue;
      var attrs = (match[1] || "").replace(/\s*t="s"\s*/gi, " ").replace(/\s*t="inlineStr"\s*/gi, " ").trim();
      var isNum = typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !isNaN(parseFloat(value)) && String(Number(value)) === String(value).trim());
      var newCell;
      if (isNum) {
        var v = typeof value === "number" ? value : parseFloat(value);
        newCell = "<c r=\"" + ref + "\" " + (attrs ? attrs + " " : "") + "><v>" + v + "</v></c>";
      } else {
        var escaped = (value != null ? String(value) : "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
        newCell = "<c r=\"" + ref + "\" " + (attrs ? attrs + " " : "") + "t=\"inlineStr\"><is><t>" + escaped + "</t></is></c>";
      }
      result = result.replace(match[0], newCell);
    }
    return result;
  }

  function openExcelFileInEditor(file) {
    if (!file || typeof XLSX === "undefined") return;
    excelEditorSavedId = null;
    var name = (file.name || "export").replace(/\.[^.]+$/, "");
    excelEditorFileName = name + ".xlsx";
    var loadingEl = document.getElementById("excel-editor-loading");
    var reader = new FileReader();
    reader.onload = function (e) {
      var ab = e.target.result;
      openModal("modal-excel-editor");
      document.getElementById("excel-editor-title").textContent = name;
      if (loadingEl) loadingEl.style.display = "flex";
      setTimeout(function () {
        try {
          var data = new Uint8Array(ab);
          excelEditorOriginalBytes = ab;
          excelEditorWorkbook = XLSX.read(data, { type: "array", cellDates: true, cellStyles: true });
          excelEditorSheetIndex = 0;
          var sel = document.getElementById("excel-editor-sheet-select");
          if (sel && excelEditorWorkbook.SheetNames.length) {
            sel.innerHTML = excelEditorWorkbook.SheetNames.map(function (n, i) {
              return "<option value=\"" + i + "\">" + (n || "Sheet" + (i + 1)) + "</option>";
            }).join("");
            sel.style.display = excelEditorWorkbook.SheetNames.length > 1 ? "" : "none";
          }
          excelEditorSelectedCol = 0;
          excelEditorRenderTable();
          excelEditorPopulateColumnSelect();
          excelEditorApplyColumnHighlight();
        } catch (err) {
          showToast("Error reading file: " + (err.message || err));
        }
        if (loadingEl) loadingEl.style.display = "none";
      }, 0);
    };
    reader.readAsArrayBuffer(file);
  }

  function excelEditorSwitchSheet() {
    var sel = document.getElementById("excel-editor-sheet-select");
    if (sel) excelEditorSheetIndex = parseInt(sel.value, 10) || 0;
    excelEditorSelectedCol = 0;
    excelEditorRenderTable();
    excelEditorPopulateColumnSelect();
    excelEditorApplyColumnHighlight();
  }

  function excelEditorPopulateColumnSelect() {
    var sel = document.getElementById("excel-editor-column-select");
    if (!sel) return;
    var colCount = excelEditorMaxCols || 1;
    if (colCount < 1) colCount = 1;
    sel.innerHTML = "";
    for (var c = 0; c < colCount; c++) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = "Column " + excelEditorColIndexToLetter(c);
      sel.appendChild(opt);
    }
    sel.value = Math.min(excelEditorSelectedCol, colCount - 1);
    excelEditorSelectedCol = parseInt(sel.value, 10) || 0;
    sel.style.display = colCount > 1 ? "" : "none";
  }

  function excelEditorApplyColumnHighlight() {
    var tbody = document.getElementById("excel-editor-tbody");
    if (!tbody) return;
    tbody.querySelectorAll("td.excel-editor-col-selected").forEach(function (td) { td.classList.remove("excel-editor-col-selected"); });
    var col = parseInt(excelEditorSelectedCol, 10) || 0;
    tbody.querySelectorAll("td.excel-editor-cell").forEach(function (td) {
      var c = parseInt(td.getAttribute("data-c"), 10);
      var span = parseInt(td.getAttribute("data-colspan"), 10) || 1;
      if (!isNaN(c) && c <= col && c + span > col) td.classList.add("excel-editor-col-selected");
    });
  }

  function excelEditorSelectColumn() {
    var sel = document.getElementById("excel-editor-column-select");
    if (sel) excelEditorSelectedCol = parseInt(sel.value, 10) || 0;
    excelEditorApplyColumnHighlight();
  }

  function excelEditorCellFillHex(sheet, r, c) {
    if (!sheet || typeof XLSX === "undefined" || !XLSX.utils || !XLSX.utils.encode_cell) return null;
    var addr = XLSX.utils.encode_cell({ r: r, c: c });
    var cell = sheet[addr];
    if (!cell || !cell.s) return null;
    var s = cell.s;
    var rgb = (s.fgColor && s.fgColor.rgb) || (s.fill && s.fill.fgColor && s.fill.fgColor.rgb) || (s.bgColor && s.bgColor.rgb);
    if (!rgb) return null;
    rgb = String(rgb).replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
    if (rgb.length === 8) rgb = rgb.slice(-6);
    if (rgb.length === 6) return rgb;
    return null;
  }

  function excelEditorBorderStyleToCss(excelStyle) {
    var s = (excelStyle && String(excelStyle).toLowerCase()) || "thin";
    if (s === "medium" || s === "mediumdashed" || s === "mediumdashdot" || s === "mediumdashdotdot") return "2px solid";
    if (s === "thick") return "3px solid";
    if (s === "double") return "3px double";
    if (s === "dashed" || s === "dashdot" || s === "dashdotdot" || s === "slantdashdot") return "1px dashed";
    if (s === "dotted") return "1px dotted";
    if (s === "hair") return "1px solid";
    return "1px solid";
  }

  function excelEditorCellBorderCss(sheet, r, c) {
    if (!sheet || typeof XLSX === "undefined" || !XLSX.utils || !XLSX.utils.encode_cell) return "";
    var addr = XLSX.utils.encode_cell({ r: r, c: c });
    var cell = sheet[addr];
    if (!cell || !cell.s || typeof cell.s !== "object" || !cell.s.border) return "";
    var b = cell.s.border;
    var out = [];
    ["top", "left", "bottom", "right"].forEach(function (side) {
      var sideBorder = b[side];
      if (sideBorder && sideBorder.style) {
        var cssVal = excelEditorBorderStyleToCss(sideBorder.style);
        var color = "#c4c4c4";
        if (sideBorder.color && sideBorder.color.rgb) {
          var rgb = String(sideBorder.color.rgb).replace(/[^0-9A-Fa-f]/g, "");
          if (rgb.length >= 6) color = "#" + rgb.slice(-6);
        }
        out.push("border-" + side + ":" + cssVal + " " + color);
      }
    });
    return out.length ? out.join(";") + ";" : "";
  }

  function excelEditorRenderTable() {
    var theadRow = document.getElementById("excel-editor-header-row");
    var tbody = document.getElementById("excel-editor-tbody");
    if (!tbody || !excelEditorWorkbook || !theadRow) return;
    var sheetName = excelEditorWorkbook.SheetNames[excelEditorSheetIndex];
    var sheet = excelEditorWorkbook.Sheets[sheetName];
    var rows = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) : [];
    if (!rows.length) rows = [[""]];
    var merges = (sheet && sheet["!merges"] && Array.isArray(sheet["!merges"])) ? sheet["!merges"].slice() : [];
    excelEditorMerges = merges;
    var maxR = rows.length - 1;
    var maxC = -1;
    rows.forEach(function (r) { if (Array.isArray(r) && r.length > 0 && r.length - 1 > maxC) maxC = r.length - 1; });
    merges.forEach(function (m) {
      if (m && m.s && m.e) {
        if (m.e.r > maxR) maxR = m.e.r;
        if (m.e.c > maxC) maxC = m.e.c;
      }
    });
    var rowCount = maxR + 1;
    var colCount = maxC + 1;
    if (colCount < 1) colCount = 1;
    excelEditorMaxRows = rowCount;
    excelEditorMaxCols = colCount;
    excelEditorHiddenRows = [];
    excelEditorColProps = [];
    excelEditorRowProps = [];
    if (sheet["!cols"] && Array.isArray(sheet["!cols"])) {
      for (var ci = 0; ci < colCount; ci++) {
        excelEditorColProps[ci] = (sheet["!cols"][ci] && typeof sheet["!cols"][ci] === "object") ? Object.assign({}, sheet["!cols"][ci]) : {};
      }
    }
    if (sheet["!rows"] && Array.isArray(sheet["!rows"])) {
      for (var ri = 0; ri < rowCount; ri++) {
        excelEditorRowProps[ri] = (sheet["!rows"][ri] && typeof sheet["!rows"][ri] === "object") ? Object.assign({}, sheet["!rows"][ri]) : {};
        if (excelEditorRowProps[ri].hidden) excelEditorHiddenRows.push(ri);
      }
    }
    var grid = [];
    for (var r = 0; r < rowCount; r++) {
      grid[r] = [];
      for (var c = 0; c < colCount; c++) {
        var val = (rows[r] && rows[r][c] != null) ? String(rows[r][c]) : "";
        var fillHex = excelEditorCellFillHex(sheet, r, c);
        grid[r][c] = { value: val, fill: fillHex || undefined };
      }
    }
    merges.forEach(function (m) {
      if (!m || !m.s || !m.e) return;
      var sr = m.s.r, sc = m.s.c, er = m.e.r, ec = m.e.c;
      if (grid[sr] && grid[sr][sc]) {
        grid[sr][sc].rowspan = er - sr + 1;
        grid[sr][sc].colspan = ec - sc + 1;
      }
      for (var r = sr; r <= er; r++) {
        for (var c = sc; c <= ec; c++) {
          if (r !== sr || c !== sc) grid[r][c] = null;
        }
      }
    });
    var headerHtml = "<th class=\"excel-editor-corner\"></th>";
    for (var c = 0; c < colCount; c++) {
      var cw = excelEditorColWidthPx(c);
      headerHtml += "<th class=\"excel-editor-col-header\" style=\"width:" + cw + "px;min-width:" + cw + "px\">" + excelEditorColIndexToLetter(c) + "</th>";
    }
    theadRow.innerHTML = headerHtml;
    var html = "";
    for (var r = 0; r < rowCount; r++) {
      var rowHidden = excelEditorHiddenRows.indexOf(r) >= 0;
      var rh = excelEditorRowHeightPx(r);
      var trStyle = "min-height:" + rh + "px;height:" + rh + "px";
      html += "<tr" + (rowHidden ? " class=\"excel-editor-row-hidden\" data-row-index=\"" + r + "\"" : "") + " style=\"" + trStyle + "\"><td class=\"excel-editor-row-header\">" + (r + 1) + "</td>";
      for (var c = 0; c < colCount; c++) {
        var cell = grid[r][c];
        if (cell === null) continue;
        var val = (cell.value || "").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/&/g, "&amp;");
        var rowspan = cell.rowspan || 1;
        var colspan = cell.colspan || 1;
        html += "<td class=\"excel-editor-cell\" data-r=\"" + r + "\" data-c=\"" + c + "\" data-rowspan=\"" + rowspan + "\" data-colspan=\"" + colspan + "\"";
        if (rowspan > 1) html += " rowspan=\"" + rowspan + "\"";
        if (colspan > 1) html += " colspan=\"" + colspan + "\"";
        var cellStyle = "";
        if (cell.fill) cellStyle += "background-color:#" + cell.fill.replace(/[^0-9A-Fa-f]/g, "") + ";";
        if (colspan === 1) {
          var cw = excelEditorColWidthPx(c);
          cellStyle += "width:" + cw + "px;min-width:" + cw + "px;";
        }
        var borderCss = excelEditorCellBorderCss(sheet, r, c);
        if (borderCss) cellStyle += borderCss;
        if (cellStyle) html += " style=\"" + cellStyle + "\"";
        html += "><input type=\"text\" class=\"excel-editor-input\" value=\"" + val + "\" data-r=\"" + r + "\" data-c=\"" + c + "\"></td>";
      }
      html += "</tr>";
    }
    tbody.innerHTML = html;
  }

  function saveExcelFromEditor() {
    if (!excelEditorWorkbook || typeof XLSX === "undefined") return;
    var tbody = document.getElementById("excel-editor-tbody");
    if (!tbody) return;
    var loadingEl = document.getElementById("excel-editor-loading");
    var loadingTextEl = document.getElementById("excel-editor-loading-text");
    if (loadingEl) { loadingEl.style.display = "flex"; if (loadingTextEl) loadingTextEl.textContent = "Saving…"; }
    var rowCount = excelEditorMaxRows || 1;
    var colCount = excelEditorMaxCols || 1;
    var rows = [];
    for (var r = 0; r < rowCount; r++) {
      var row = [];
      for (var c = 0; c < colCount; c++) row.push("");
      rows.push(row);
    }
    tbody.querySelectorAll("td.excel-editor-cell").forEach(function (td) {
      var r = parseInt(td.getAttribute("data-r"), 10);
      var c = parseInt(td.getAttribute("data-c"), 10);
      var inp = td.querySelector("input");
      var val = inp ? inp.value || "" : "";
      if (!isNaN(r) && !isNaN(c) && r >= 0 && r < rowCount && c >= 0 && c < colCount) rows[r][c] = val;
    });
    var valueByRef = {};
    for (var ri = 0; ri < rowCount; ri++) {
      for (var ci = 0; ci < colCount; ci++) {
        var ref = excelEditorColIndexToLetter(ci) + (ri + 1);
        valueByRef[ref] = rows[ri][ci];
      }
    }
    var preview = [];
    for (var r = 0; r < Math.min(3, rows.length); r++) {
      var pRow = [];
      for (var c = 0; c < Math.min(5, (rows[r] || []).length); c++) pRow.push((rows[r] && rows[r][c] != null) ? rows[r][c] : "");
      preview.push(pRow);
    }
    var name = (excelEditorFileName || "").replace(/\.xlsx$/i, "") || "Excel";

    function hideSaving() {
      if (loadingEl) loadingEl.style.display = "none";
      if (loadingTextEl) loadingTextEl.textContent = "Loading spreadsheet…";
    }

    function persistToTemplates(base64) {
      var saves = getExcelSaves();
      var existing = excelEditorSavedId ? saves.find(function (s) { return s.id === excelEditorSavedId; }) : null;
      var useApi = !excelEditorSavedId || (existing && existing.fromApi);
      if (useApi) {
        setTimeout(function () {
          var previewJson = JSON.stringify(preview);
          var payload = { name: name, fileName: excelEditorFileName || name + ".xlsx", data: base64, preview: previewJson };
          var apiPromise = excelEditorSavedId
            ? exportTemplatesApiFetch("/" + encodeURIComponent(excelEditorSavedId), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
            : exportTemplatesApiFetch("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          apiPromise.then(function (res) {
            if (excelEditorSavedId) {
              var idx = saves.findIndex(function (s) { return s.id === excelEditorSavedId; });
              if (idx >= 0) saves[idx] = { id: saves[idx].id, name: name, fileName: excelEditorFileName || name + ".xlsx", preview: preview, updatedAt: res.updatedAt || new Date().toISOString(), fromApi: true };
            } else if (res && res.id) {
              saves.push({ id: res.id, name: name, fileName: excelEditorFileName || name + ".xlsx", preview: preview, createdAt: res.createdAt, updatedAt: res.updatedAt, fromApi: true });
            }
            excelSavesCache = saves;
            hideSaving();
            closeModal("modal-excel-editor");
            showToast("Saved to templates");
            setTimeout(function () { renderExportTemplates(); }, 0);
          }).catch(function () {
            persistToTemplatesIdB(base64, saves, name, preview);
            hideSaving();
          });
        }, 0);
        return;
      }
      persistToTemplatesIdB(base64, saves, name, preview);
    }

    function persistToTemplatesIdB(base64, saves, name, preview) {
      var now = new Date().toISOString();
      if (excelEditorSavedId) {
        var idx = saves.findIndex(function (s) { return s.id === excelEditorSavedId; });
        if (idx >= 0) saves[idx] = { id: saves[idx].id, name: name, fileName: excelEditorFileName, data: base64, preview: preview, updatedAt: now };
        else excelEditorSavedId = null;
      }
      if (!excelEditorSavedId) {
        var newId = "excel_" + Math.random().toString(36).slice(2, 11);
        saves.push({ id: newId, name: name, fileName: excelEditorFileName, data: base64, preview: preview, createdAt: now, updatedAt: now });
      }
      setExcelSavesToIDB(saves, function (err) {
        hideSaving();
        if (err) { if (typeof showToast === "function") showToast("Save failed: " + (err.message || err)); return; }
        excelSavesCache = saves;
        closeModal("modal-excel-editor");
        showToast("Saved to templates");
        setTimeout(function () { renderExportTemplates(); }, 0);
      });
    }

    function runSave() {
    // Prefer zip path: only replace cell values in sheet XML; rest of file (styles, hidden rows, colours, fonts, borders, merges) is unchanged.
    if (excelEditorOriginalBytes && typeof JSZip !== "undefined") {
      var sheetPath = "xl/worksheets/sheet" + (excelEditorSheetIndex + 1) + ".xml";
      JSZip.loadAsync(excelEditorOriginalBytes).then(function (zip) {
        var f = zip.file(sheetPath);
        if (!f) return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        return f.async("string").then(function (xml) {
          var updated = updateSheetXmlCellValues(xml, valueByRef);
          zip.file(sheetPath, updated);
          return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        });
      }).then(function (blob) {
        var reader = new FileReader();
        reader.onload = function () {
          var buf = reader.result;
          var bytes = new Uint8Array(buf);
          var binary = "";
          for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          var base64 = typeof btoa !== "undefined" ? btoa(binary) : "";
          excelEditorOriginalBytes = buf;
          persistToTemplates(base64);
        };
        reader.readAsArrayBuffer(blob);
      }).catch(function (err) {
        hideSaving();
        if (typeof showToast === "function") showToast("Save failed: " + (err.message || err));
      });
      return;
    }

    // Fallback only when no original bytes (e.g. very old template): rebuilds from grid and loses hidden rows, colours, fonts, borders, etc.
    var sheetName = excelEditorWorkbook.SheetNames[excelEditorSheetIndex];
    var newSheet = XLSX.utils.aoa_to_sheet(rows);
    if (excelEditorMerges && excelEditorMerges.length > 0) newSheet["!merges"] = excelEditorMerges;
    if (excelEditorRowProps.length > 0 || excelEditorHiddenRows.length > 0) {
      newSheet["!rows"] = [];
      for (var ri = 0; ri < rowCount; ri++) {
        var rowInfo = (excelEditorRowProps[ri] && typeof excelEditorRowProps[ri] === "object") ? Object.assign({}, excelEditorRowProps[ri]) : {};
        if (excelEditorHiddenRows.indexOf(ri) >= 0) rowInfo.hidden = true;
        newSheet["!rows"][ri] = rowInfo;
      }
    }
    if (excelEditorColProps.length > 0) {
      newSheet["!cols"] = [];
      for (var ci = 0; ci < colCount; ci++) {
        newSheet["!cols"][ci] = (excelEditorColProps[ci] && typeof excelEditorColProps[ci] === "object") ? Object.assign({}, excelEditorColProps[ci]) : {};
      }
    }
    excelEditorWorkbook.Sheets[sheetName] = newSheet;
    var base64 = XLSX.write(excelEditorWorkbook, { type: "base64", bookType: "xlsx", cellStyles: true });
    persistToTemplates(base64);
    }

    setTimeout(runSave, 0);
  }

  function openExcelEditorFromSaved(id) {
    var saves = getExcelSaves();
    var item = saves.find(function (s) { return s.id === id; });
    if (!item || typeof XLSX === "undefined") { showToast("Could not load saved file"); return; }
    var loadingEl = document.getElementById("excel-editor-loading");
    openModal("modal-excel-editor");
    document.getElementById("excel-editor-title").textContent = item.name || item.fileName || "Excel";
    if (loadingEl) loadingEl.style.display = "flex";

    function openWithData(base64Data, fileName) {
      setTimeout(function () {
        try {
          var binary = typeof atob !== "undefined" ? atob(base64Data) : (XLSX.utils && XLSX.utils.decode_base64 ? XLSX.utils.decode_base64(base64Data) : "");
          var bytes = new Uint8Array(binary.length);
          for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          excelEditorWorkbook = XLSX.read(bytes, { type: "array", cellDates: true, cellStyles: true });
          excelEditorOriginalBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          excelEditorSavedId = id;
          excelEditorFileName = fileName || (item.name || "saved") + ".xlsx";
          excelEditorSheetIndex = 0;
          excelEditorSelectedCol = 0;
          var sel = document.getElementById("excel-editor-sheet-select");
          if (sel && excelEditorWorkbook.SheetNames.length) {
            sel.innerHTML = excelEditorWorkbook.SheetNames.map(function (n, i) {
              return "<option value=\"" + i + "\">" + (n || "Sheet" + (i + 1)) + "</option>";
            }).join("");
            sel.style.display = excelEditorWorkbook.SheetNames.length > 1 ? "" : "none";
          }
          excelEditorRenderTable();
          excelEditorPopulateColumnSelect();
          excelEditorApplyColumnHighlight();
        } catch (err) {
          showToast("Error opening file: " + (err.message || err));
        }
        if (loadingEl) loadingEl.style.display = "none";
      }, 0);
    }

    if (item.fromApi) {
      exportTemplatesApiFetch("/" + encodeURIComponent(id)).then(function (t) {
        if (t && t.data) openWithData(t.data, t.fileName);
        else { showToast("Could not load template"); if (loadingEl) loadingEl.style.display = "none"; }
      }).catch(function () {
        showToast("Could not load template");
        if (loadingEl) loadingEl.style.display = "none";
      });
      return;
    }
    if (!item.data) { showToast("Could not load saved file"); if (loadingEl) loadingEl.style.display = "none"; return; }
    openWithData(item.data, item.fileName || (item.name || "saved") + ".xlsx");
  }

  function deleteExcelSave(id) {
    if (!confirm("Remove this saved Excel from templates?")) return;
    var item = getExcelSaves().find(function (s) { return s.id === id; });
    var saves = getExcelSaves().filter(function (s) { return s.id !== id; });
    if (item && item.fromApi) {
      exportTemplatesApiFetch("/" + encodeURIComponent(id), { method: "DELETE" }).then(function () {
        excelSavesCache = saves;
        renderExportTemplates();
        showToast("Removed from templates");
      }).catch(function () {
        if (typeof showToast === "function") showToast("Delete failed");
      });
      return;
    }
    setExcelSavesToIDB(saves, function (err) {
      if (err && typeof showToast === "function") showToast("Delete failed: " + (err.message || err));
      else {
        excelSavesCache = saves;
        renderExportTemplates();
        showToast("Removed from templates");
      }
    });
  }

  function handleExportExcelFileSelect(event) {
    var input = event && event.target;
    var file = input && input.files && input.files[0];
    if (file) openExcelFileInEditor(file);
    if (input) input.value = "";
  }

  function handleExportExcelDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    var card = document.getElementById("export-excel-dropzone-card");
    if (card) { card.style.borderColor = ""; card.style.background = ""; }
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) openExcelFileInEditor(file);
  }

  function handleExportExcelDragover(e) {
    e.preventDefault();
    e.stopPropagation();
    var card = document.getElementById("export-excel-dropzone-card");
    if (card) { card.style.borderColor = "var(--nc-accent)"; card.style.background = "var(--nc-accent-light)"; }
  }

  function handleExportExcelDragleave(e) {
    e.preventDefault();
    e.stopPropagation();
    var card = document.getElementById("export-excel-dropzone-card");
    if (card && (!e.relatedTarget || !card.contains(e.relatedTarget))) {
      card.style.borderColor = ""; card.style.background = "";
    }
  }

  function bindExportExcelDropzone() {
    var card = document.getElementById("export-excel-dropzone-card");
    if (!card) return;
    card.addEventListener("dragover", handleExportExcelDragover);
    card.addEventListener("dragleave", handleExportExcelDragleave);
    card.addEventListener("drop", handleExportExcelDrop);
  }

  function switchReportsTab(tabName) {
    document.querySelectorAll(".reports-subnav-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-reports-tab") === tabName);
    });
    document.querySelectorAll(".reports-tab-panel").forEach(function (panel) {
      var isReports = panel.id === "reports-tab-reports";
      panel.classList.toggle("active", (tabName === "reports" && isReports) || (tabName === "projects" && !isReports));
    });
    if (tabName === "projects") renderProjects();
  }

  function renderProjects() {
    var grid = document.getElementById("projects-grid");
    if (!grid) return;
    var projects = getProjects();
    if (projects.length === 0) {
      grid.innerHTML = "<div class=\"empty-state\" style=\"grid-column:1/-1\"><p style=\"color:var(--nc-gray-500)\">No projects yet. Click &quot;New project&quot; to add one.</p></div>";
      return;
    }
    grid.innerHTML = projects.map(function (p) {
      var name = (p.name || "").trim() || "Unnamed project";
      var owner = (p.ownerName || "").trim() || "—";
      return "<div class=\"project-box\" data-id=\"" + (p.id || "") + "\">" +
        "<div class=\"project-box-name\">" + escapeHtml(name) + "</div>" +
        "<div class=\"project-box-owner\">" + escapeHtml(owner) + "</div>" +
        "<div class=\"project-box-actions\">" +
        "<button type=\"button\" class=\"btn btn-sm\" onclick=\"openEditProjectModal('" + (p.id || "").replace(/'/g, "\\'") + "')\">Edit</button> " +
        "<button type=\"button\" class=\"btn btn-sm btn-danger\" onclick=\"if(confirm('Delete this project?')) deleteProject('" + (p.id || "").replace(/'/g, "\\'") + "')\">Delete</button>" +
        "</div></div>";
    }).join("");
  }

  function escapeHtml(s) {
    if (s == null) return "";
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function openNewProjectModal() {
    editProjectId = null;
    var titleEl = document.getElementById("modal-project-title");
    if (titleEl) titleEl.textContent = "New project";
    var nameEl = document.getElementById("project-name");
    var ownerEl = document.getElementById("project-owner");
    if (nameEl) nameEl.value = "";
    if (ownerEl) ownerEl.value = "";
    openModal("modal-project");
  }

  function openEditProjectModal(id) {
    var projects = getProjects();
    var p = projects.find(function (x) { return x.id === id; });
    if (!p) return;
    editProjectId = id;
    var titleEl = document.getElementById("modal-project-title");
    if (titleEl) titleEl.textContent = "Edit project";
    var nameEl = document.getElementById("project-name");
    var ownerEl = document.getElementById("project-owner");
    if (nameEl) nameEl.value = p.name || "";
    if (ownerEl) ownerEl.value = p.ownerName || "";
    openModal("modal-project");
  }

  function saveProject() {
    var nameEl = document.getElementById("project-name");
    var ownerEl = document.getElementById("project-owner");
    var name = (nameEl && nameEl.value || "").trim();
    var ownerName = (ownerEl && ownerEl.value || "").trim();
    var projects = getProjects();
    if (editProjectId) {
      var idx = projects.findIndex(function (x) { return x.id === editProjectId; });
      if (idx !== -1) {
        projects[idx] = { id: projects[idx].id, name: name || "Unnamed project", ownerName: ownerName };
      }
    } else {
      projects.push({ id: Data.genId(), name: name || "Unnamed project", ownerName: ownerName });
    }
    setProjects(projects);
    closeModal("modal-project");
    renderProjects();
    if (typeof showToast === "function") showToast("Project saved");
  }

  function deleteProject(id) {
    var projects = getProjects().filter(function (p) { return p.id !== id; });
    setProjects(projects);
    renderProjects();
    if (typeof showToast === "function") showToast("Project deleted");
  }

  function renderAllergenCheckboxes(selected) {
    var c = document.getElementById("new-ing-allergens");
    if (!c) return;
    c.innerHTML = Data.EU_ALLERGENS.map(function (a) {
      return '<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:4px 8px;background:var(--nc-gray-50);border-radius:4px;cursor:pointer">' +
        '<input type="checkbox" value="' + a + '" ' + (selected.indexOf(a) !== -1 ? "checked" : "") + "> " + a + "</label>";
    }).join("");
  }

  function openNewIngredientModal() {
    editIngredientId = null;
    ["new-ing-name", "new-ing-code", "new-ing-secondary-code", "new-ing-kj", "new-ing-kcal", "new-ing-fat", "new-ing-sat", "new-ing-carb", "new-ing-sugar", "new-ing-fibre", "new-ing-protein", "new-ing-salt", "new-ing-cost", "new-ing-supplier", "new-ing-description-tags", "new-ing-density", "new-ing-unit-weight"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = "";
    });
    var catEl = document.getElementById("new-ing-cat");
    if (catEl) catEl.selectedIndex = 0;
    var currencyEl = document.getElementById("new-ing-currency");
    if (currencyEl) currencyEl.value = "£";
    var costUomEl = document.getElementById("new-ing-cost-uom");
    if (costUomEl) costUomEl.value = "KG";
    var fvnEl = document.getElementById("new-ing-fvn");
    if (fvnEl) fvnEl.checked = false;
    var approvedEl = document.getElementById("new-ing-approved");
    if (approvedEl) approvedEl.checked = false;
    renderAllergenCheckboxes([]);
    var titleEl = document.getElementById("modal-ingredient-title-text");
    if (titleEl) titleEl.textContent = "New Ingredient";
    var vhList = document.getElementById("ingredient-version-history-list");
    var vhSummary = document.getElementById("ingredient-version-history-summary");
    if (vhList) vhList.innerHTML = "";
    if (vhSummary) vhSummary.textContent = "Version History";
    hideIngredientVersionPicker();
    setIngredientModalViewMode(true);
    openModal("modal-ingredient");
  }

  var ingredientVersionsCache = [];

  function hideIngredientVersionPicker() {
    ingredientVersionsCache = [];
    var sel = document.getElementById("ingredient-version-select");
    if (sel) { sel.style.display = "none"; sel.innerHTML = ""; }
    var banner = document.getElementById("ingredient-version-readonly-banner");
    if (banner) banner.style.display = "none";
  }

  /** Fills the ingredient form fields from a plain data object — either the live ingredient
   * or a past version's snapshot (both use the same field names). Does not touch the store. */
  function applyIngredientDataToForm(data) {
    document.getElementById("new-ing-name").value = data.name || "";
    var codeEl = document.getElementById("new-ing-code");
    if (codeEl) codeEl.value = data.code || "";
    var secCodeEl = document.getElementById("new-ing-secondary-code");
    if (secCodeEl) secCodeEl.value = (data.altCodes || []).join(", ");
    var tagsEl = document.getElementById("new-ing-description-tags");
    if (tagsEl) tagsEl.value = (data.descriptionTags || []).join(", ");
    document.getElementById("new-ing-cat").value = data.cat || "";
    document.getElementById("new-ing-kj").value = data.kj;
    document.getElementById("new-ing-kcal").value = data.kcal;
    document.getElementById("new-ing-fat").value = data.fat;
    document.getElementById("new-ing-sat").value = data.sat;
    document.getElementById("new-ing-carb").value = data.carb;
    document.getElementById("new-ing-sugar").value = data.sugar;
    document.getElementById("new-ing-fibre").value = data.fibre;
    document.getElementById("new-ing-protein").value = data.protein;
    document.getElementById("new-ing-salt").value = data.salt;
    document.getElementById("new-ing-cost").value = data.cost != null ? data.cost : "";
    var currencyEl = document.getElementById("new-ing-currency");
    if (currencyEl) currencyEl.value = (data.currency === "$" ? "$" : "£");
    var costUomEl = document.getElementById("new-ing-cost-uom");
    if (costUomEl) {
      var uom = (data.costUOM || data.costUom || data.CostUom || data.CostUOM || "").toString().trim().toUpperCase();
      if (uom) {
        var hasOpt = Array.prototype.some.call(costUomEl.options, function (o) { return o.value === uom; });
        if (!hasOpt) {
          var opt = document.createElement("option");
          opt.value = uom;
          opt.textContent = uom;
          costUomEl.appendChild(opt);
        }
        costUomEl.value = uom;
      } else costUomEl.value = "";
    }
    var densityEl = document.getElementById("new-ing-density");
    if (densityEl) densityEl.value = (data.density != null && data.density > 0) ? data.density : "";
    var unitWeightEl = document.getElementById("new-ing-unit-weight");
    if (unitWeightEl) unitWeightEl.value = (data.unitWeightG != null && data.unitWeightG > 0) ? data.unitWeightG : "";
    var supplierEl = document.getElementById("new-ing-supplier");
    if (supplierEl) supplierEl.value = data.supplier || "";
    document.getElementById("new-ing-fvn").checked = !!data.fvn;
    var approvedEl = document.getElementById("new-ing-approved");
    if (approvedEl) approvedEl.checked = !!data.approved;
    renderAllergenCheckboxes(data.allergens || []);
    syncIngredientDensityField();
  }

  /** Called from the version <select> in the Edit Ingredient modal. */
  function onIngredientVersionSelectChange() {
    var sel = document.getElementById("ingredient-version-select");
    if (sel) selectIngredientVersion(sel.value);
  }

  /** Switches the Edit Ingredient modal between the live (editable) ingredient and a
   * read-only past version. Never touches the underlying store — recipes and everywhere
   * else in the app always use the live/latest ingredient data regardless of what's
   * being viewed here. */
  function selectIngredientVersion(value) {
    var ingredients = Ingredients.getIngredients();
    var ing = ingredients.find(function (i) { return i.id === editIngredientId; });
    if (!ing) return;
    var banner = document.getElementById("ingredient-version-readonly-banner");
    var sel = document.getElementById("ingredient-version-select");
    if (value === "latest") {
      applyIngredientDataToForm(ing);
      if (banner) banner.style.display = "none";
      setIngredientModalViewMode(true);
    } else {
      var versionNumber = parseInt(value, 10);
      var version = ingredientVersionsCache.find(function (v) { return v.versionNumber === versionNumber; });
      if (!version) return;
      applyIngredientDataToForm(version);
      if (banner) banner.style.display = "";
      setIngredientModalViewMode(false);
    }
    if (sel) { sel.disabled = false; sel.value = value; }
  }

  async function loadIngredientVersionPicker(id) {
    var sel = document.getElementById("ingredient-version-select");
    if (!sel) return;
    try {
      var res = await fetch(window.location.origin + "/api/ingredients/" + encodeURIComponent(id) + "/versions", { credentials: "same-origin" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var versions = await res.json();
      ingredientVersionsCache = Array.isArray(versions) ? versions : [];
    } catch (e) {
      ingredientVersionsCache = [];
    }
    if (ingredientVersionsCache.length === 0) {
      sel.style.display = "none";
      sel.innerHTML = "";
      return;
    }
    var maxVersion = ingredientVersionsCache.reduce(function (m, v) { return Math.max(m, v.versionNumber); }, 1);
    var older = ingredientVersionsCache
      .filter(function (v) { return v.versionNumber !== maxVersion; })
      .sort(function (a, b) { return b.versionNumber - a.versionNumber; });
    var options = ["<option value=\"latest\" selected>v" + maxVersion + " (latest)</option>"];
    older.forEach(function (v) { options.push("<option value=\"" + v.versionNumber + "\">v" + v.versionNumber + "</option>"); });
    sel.innerHTML = options.join("");
    sel.style.display = "";
    sel.value = "latest";
  }

  function setIngredientModalViewMode(editable) {
    var modal = document.getElementById("modal-ingredient");
    if (!modal) return;
    var inputs = modal.querySelectorAll("input, select, textarea");
    inputs.forEach(function (el) {
      el.disabled = !editable;
    });
    syncIngredientDensityField();
    var cancelBtn = document.getElementById("modal-ingredient-cancel-btn");
    var closeBtn = document.getElementById("modal-ingredient-close-btn");
    var saveBtn = document.getElementById("modal-ingredient-save-btn");
    if (editable) {
      if (closeBtn) closeBtn.style.display = "none";
      if (cancelBtn) cancelBtn.style.display = "";
      if (saveBtn) saveBtn.style.display = "";
    } else {
      if (closeBtn) closeBtn.style.display = "";
      if (cancelBtn) cancelBtn.style.display = "none";
      if (saveBtn) saveBtn.style.display = "none";
    }
  }

  function syncIngredientDensityField() {
    var costUomEl = document.getElementById("new-ing-cost-uom");
    var densityEl = document.getElementById("new-ing-density");
    var hintEl = document.getElementById("new-ing-density-hint");
    if (!costUomEl || !densityEl) return;
    var uom = (costUomEl.value || "").toUpperCase();
    var editable = document.getElementById("modal-ingredient-save-btn") && document.getElementById("modal-ingredient-save-btn").style.display !== "none";
    if (uom === "EACH" || uom === "M") {
      densityEl.value = "";
      densityEl.placeholder = "N/A";
      if (editable) densityEl.disabled = true;
      if (hintEl) hintEl.textContent = "Not applicable for EACH or M (no conversion between weight and volume).";
    } else {
      if (editable) densityEl.disabled = false;
      densityEl.placeholder = "1";
      if (hintEl) hintEl.textContent = "Optional. Default 1. Used when switching ingredient between KG and L in a recipe.";
      if (densityEl.value === "" || densityEl.value === "N/A") densityEl.value = "1";
    }
  }

  function saveIngredient() {
    var nameEl = document.getElementById("new-ing-name");
    var name = nameEl && nameEl.value.trim();
    if (!name) { showToast("Please enter ingredient name"); return; }
    var allergenInputs = document.querySelectorAll("#new-ing-allergens input:checked");
    var allergens = [];
    allergenInputs.forEach(function (c) { allergens.push(c.value); });
    var costEl = document.getElementById("new-ing-cost");
    var currencyEl = document.getElementById("new-ing-currency");
    var supplierEl = document.getElementById("new-ing-supplier");
    var codeEl = document.getElementById("new-ing-code");
    var data = {
      name: name,
      code: codeEl ? codeEl.value.trim() : "",
      altCodes: (function () {
        var primary = codeEl ? codeEl.value.trim() : "";
        var alts = parseDescriptionTags(document.getElementById("new-ing-secondary-code"));
        return alts.filter(function (c) { return c && c !== primary; });
      })(),
      descriptionTags: parseDescriptionTags(document.getElementById("new-ing-description-tags")),
      cat: document.getElementById("new-ing-cat").value,
      kj: parseFloat(document.getElementById("new-ing-kj").value) || 0,
      kcal: parseFloat(document.getElementById("new-ing-kcal").value) || 0,
      fat: parseFloat(document.getElementById("new-ing-fat").value) || 0,
      sat: parseFloat(document.getElementById("new-ing-sat").value) || 0,
      carb: parseFloat(document.getElementById("new-ing-carb").value) || 0,
      sugar: parseFloat(document.getElementById("new-ing-sugar").value) || 0,
      fibre: parseFloat(document.getElementById("new-ing-fibre").value) || 0,
      protein: parseFloat(document.getElementById("new-ing-protein").value) || 0,
      salt: parseFloat(document.getElementById("new-ing-salt").value) || 0,
      cost: costEl ? parseFloat(costEl.value) || 0 : 0,
      currency: currencyEl ? (currencyEl.value || "£") : "£",
      costUOM: (document.getElementById("new-ing-cost-uom") && document.getElementById("new-ing-cost-uom").value) || "",
      costUom: (document.getElementById("new-ing-cost-uom") && document.getElementById("new-ing-cost-uom").value) || "",
      density: (function () { var el = document.getElementById("new-ing-density"); var v = el ? parseFloat(el.value) : NaN; return (v != null && !isNaN(v) && v > 0) ? v : 1; })(),
      unitWeightG: (function () { var el = document.getElementById("new-ing-unit-weight"); var v = el ? parseFloat(el.value) : NaN; return (v != null && !isNaN(v) && v > 0) ? v : 0; })(),
      supplier: supplierEl ? supplierEl.value.trim() : "",
      allergens: allergens,
      fvn: document.getElementById("new-ing-fvn").checked,
      approved: document.getElementById("new-ing-approved") ? document.getElementById("new-ing-approved").checked : false
    };
    if (Data.isPackagingBySupplier && Data.isPackagingBySupplier(data.supplier)) data.cat = "Packaging";
    if ((name || "").trim().toLowerCase().indexOf("nf ") === 0) data.cat = "Packaging";
    var ingredients = Ingredients.getIngredients();
    var normName = name.toLowerCase().trim();
    var existingSameName = ingredients.find(function (i) {
      return (i.name || "").toLowerCase().trim() === normName && i.id !== editIngredientId;
    });
    if (existingSameName) {
      if (!confirm("An ingredient named \"" + name + "\" already exists. Save anyway? (This may create a duplicate.)")) return;
    }
    var versionComment = null;
    if (editIngredientId) {
      data.id = editIngredientId;
      var liveIng = ingredients.find(function (i) { return i.id === editIngredientId; });
      if (liveIng && ingredientDataDiffers(data, liveIng)) {
        var nextVersion = ingredientVersionsCache.reduce(function (m, v) { return Math.max(m, v.versionNumber); }, 0) + 1;
        var comment = window.prompt("This change will be saved as version " + nextVersion + ". Describe what changed (optional) — or click Cancel to discard this change and keep editing.", "");
        if (comment === null) return; // Cancel — abort the save entirely, don't touch the ingredient.
        versionComment = comment.trim();
      }
    }
    Ingredients.saveIngredient(data);
    if (versionComment) attachLatestVersionComment(editIngredientId, versionComment);
    renderAll();
    closeModal("modal-ingredient");
    showToast(editIngredientId ? "Ingredient updated" : "Ingredient added");
  }

  /** Client-side heuristic mirroring the backend's version-diff fields — used only to decide
   * whether to show the version-change prompt at all (the backend independently determines
   * whether a version is actually created; this never blocks a save, only skips a needless prompt). */
  function ingredientDataDiffers(data, ing) {
    var numKeys = ["kj", "kcal", "fat", "sat", "carb", "sugar", "fibre", "protein", "salt", "cost", "density", "unitWeightG"];
    var strKeys = ["name", "code", "cat", "costUOM", "supplier"];
    for (var i = 0; i < numKeys.length; i++) {
      if ((parseFloat(data[numKeys[i]]) || 0) !== (parseFloat(ing[numKeys[i]]) || 0)) return true;
    }
    for (var j = 0; j < strKeys.length; j++) {
      if ((data[strKeys[j]] || "").toString() !== (ing[strKeys[j]] || "").toString()) return true;
    }
    if (!!data.fvn !== !!ing.fvn) return true;
    if (!!data.approved !== !!ing.approved) return true;
    if (JSON.stringify((data.allergens || []).slice().sort()) !== JSON.stringify((ing.allergens || []).slice().sort())) return true;
    if (JSON.stringify((data.altCodes || []).slice().sort()) !== JSON.stringify((ing.altCodes || []).slice().sort())) return true;
    if (JSON.stringify((data.descriptionTags || []).slice().sort()) !== JSON.stringify((ing.descriptionTags || []).slice().sort())) return true;
    return false;
  }

  /** Attaches a comment to whatever version the save just created/left as latest. Best-effort:
   * fires shortly after the debounced save so the backend has had time to write the new version. */
  function attachLatestVersionComment(ingredientId, comment) {
    setTimeout(function () {
      fetch(window.location.origin + "/api/ingredients/" + encodeURIComponent(ingredientId) + "/latest-version-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ comment: comment })
      }).catch(function () {});
    }, 600);
  }

  function editIngredient(id, fromSearch) {
    var ingredients = Ingredients.getIngredients();
    var ing = ingredients.find(function (i) { return i.id === id; });
    if (!ing) return;
    editIngredientId = id;
    var detailSections = document.querySelectorAll(".ingredient-detail-sections");
    if (detailSections.length) detailSections.forEach(function (el) { el.style.display = fromSearch ? "none" : ""; });
    applyIngredientDataToForm(ing);
    hideIngredientVersionPicker();
    loadIngredientVersionPicker(id);
    var titleEl = document.getElementById("modal-ingredient-title-text");
    if (titleEl) titleEl.textContent = "Edit Ingredient";
    var usedInRecipes = getRecipesUsingIngredient(id);
    var usedInEl = document.getElementById("ingredient-used-in-recipes");
    var usedInListEl = document.getElementById("ingredient-used-in-list");
    var whereUsedBtn = document.getElementById("ingredient-where-used-btn");
    if (usedInEl) {
      usedInEl.style.display = usedInRecipes.length > 0 ? "block" : "none";
      if (usedInListEl) usedInListEl.textContent = usedInRecipes.length === 0 ? "" : usedInRecipes.map(function (r) { return r.name; }).join(", ");
      if (whereUsedBtn) {
        whereUsedBtn.textContent = usedInRecipes.length > 0 ? "View all (" + usedInRecipes.length + ")" : "";
        whereUsedBtn.onclick = function () { showIngredientWhereUsed(id); };
      }
    }
    setIngredientModalViewMode(true);
    openModal("modal-ingredient");
  }

  function parseDescriptionTags(el) {
    if (!el || !el.value) return [];
    return el.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function recipeContainsIngredient(recipe, ingId, visited) {
    if (!recipe || !recipe.ingredients) return false;
    if (visited[recipe.id]) return false;
    visited[recipe.id] = true;
    var recipes = Recipes.getRecipes();
    for (var i = 0; i < recipe.ingredients.length; i++) {
      var ri = recipe.ingredients[i];
      if (ri.ingredientId === ingId) return true;
      if (ri.subRecipeId) {
        var subRec = recipes.find(function (r) { return r.id === ri.subRecipeId; });
        if (subRec && recipeContainsIngredient(subRec, ingId, visited)) return true;
      }
    }
    return false;
  }

  function getIngredientIdsInRecipe(recipe, visited) {
    if (!recipe || !recipe.ingredients) return [];
    if (visited[recipe.id]) return [];
    visited[recipe.id] = true;
    var recipes = Recipes.getRecipes();
    var ids = [];
    (recipe.ingredients || []).forEach(function (ri) {
      if (ri.ingredientId) ids.push(ri.ingredientId);
      if (ri.subRecipeId) {
        var subRec = recipes.find(function (r) { return r.id === ri.subRecipeId; });
        if (subRec) ids = ids.concat(getIngredientIdsInRecipe(subRec, visited));
      }
    });
    return ids;
  }

  function getRecipesUsingIngredient(ingId) {
    var recipes = Recipes.getRecipes();
    return recipes.filter(function (r) {
      return (r.ingredients || []).some(function (ri) { return ri.ingredientId === ingId; });
    });
  }

  function openIngredientView(id) {
    var ingredients = Ingredients.getIngredients();
    var ing = ingredients.find(function (i) { return i.id === id; });
    if (!ing) return;
    editIngredientId = id;
    var detailSections = document.querySelectorAll(".ingredient-detail-sections");
    if (detailSections.length) detailSections.forEach(function (el) { el.style.display = ""; });
    var vhList = document.getElementById("ingredient-version-history-list");
    var vhSummary = document.getElementById("ingredient-version-history-summary");
    if (vhList) {
      var vh = (ing.versionHistory || []).slice().reverse();
      if (ing.created && vh.indexOf(ing.created) === -1) vh.push(ing.created);
      if (vh.length === 0) {
        vhList.innerHTML = "<p style=\"margin:0;color:var(--nc-gray-500);font-size:13px\">No version history recorded.</p>";
        if (vhSummary) vhSummary.textContent = "Version History";
      } else {
        var latest = new Date(vh[0]).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        if (vhSummary) vhSummary.textContent = "Version History — Last edited: " + latest;
        vhList.innerHTML = vh.map(function (ts) { var d = new Date(ts); return "<div style=\"padding:6px 0;border-bottom:1px solid var(--nc-gray-100)\">" + d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + "</div>"; }).join("");
      }
    }
    var wuList = document.getElementById("ingredient-where-used-list");
    var wuSummary = document.getElementById("ingredient-where-used-summary");
    if (wuList && wuSummary) {
      var usedIn = getRecipesUsingIngredient(id);
      wuSummary.textContent = usedIn.length === 0 ? "Where used" : "Where used — " + usedIn.length + " recipe" + (usedIn.length !== 1 ? "s" : "");
      if (usedIn.length === 0) {
        wuList.innerHTML = "<p style=\"margin:0;color:var(--nc-gray-500);font-size:13px\">Not used in any recipes yet.</p>";
      } else {
        wuList.innerHTML = usedIn.map(function (r) {
          var status = r.approved ? "<span class=\"badge badge-approved\" style=\"font-size:9px;margin-left:8px\">Approved</span>" : "<span class=\"badge badge-development\" style=\"font-size:9px;margin-left:8px\">In development</span>";
          var code = (r.code && r.code.trim()) ? "<span style=\"font-family:var(--nc-mono);font-size:12px;color:var(--nc-gray-500);margin-right:8px\">[" + r.code + "]</span>" : "";
          return "<div class=\"card row-clickable\" style=\"padding:12px;cursor:pointer\" onclick=\"closeModal('modal-ingredient');openRecipe('" + r.id.replace(/'/g, "\\'") + "')\">" +
            "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px\">" +
            "<div style=\"min-width:0\"><div style=\"font-weight:700;color:var(--nc-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">" + code + r.name + status + "</div>" +
            "<div style=\"font-size:12px;color:var(--nc-gray-500)\">" + (r.ingredients || []).length + " ingredient(s) · " + r.type + "</div></div>" +
            "<span style=\"font-size:12px;color:var(--nc-gray-400)\">Open →</span></div></div>";
        }).join("");
      }
    }
    applyIngredientDataToForm(ing);
    hideIngredientVersionPicker();
    loadIngredientVersionPicker(id);
    var titleEl = document.getElementById("modal-ingredient-title-text");
    if (titleEl) titleEl.textContent = "Ingredient details";
    setIngredientModalViewMode(false);
    openModal("modal-ingredient");
  }

  function deleteIngredient(id) {
    if (!confirm("Delete this ingredient?")) return;
    Ingredients.deleteIngredient(id);
    renderAll();
    showToast("Ingredient deleted");
  }

  function filterIngredients() {
    // Not trimmed — see searchWordsMatch's own comment; a trailing space signals "whole word",
    // which it needs to see to rank e.g. "New Beef Slice" above "Newlyweds Sack" for "new ".
    var q = (document.getElementById("ingredient-search").value || "").toLowerCase();
    var tbody = document.getElementById("ingredients-body");
    if (tbody) tbody.querySelectorAll("tr").forEach(function (r) {
      var show = !q || searchTextMatches(r.textContent, q);
      r.style.display = show ? "" : "none";
    });
  }

  function searchIngredientLibrary() {
    var q = (document.getElementById("ingredient-search").value || "").toLowerCase();
    var dd = document.getElementById("ingredient-library-dropdown");
    if (!dd) return;
    filterIngredients();
    var ingredients = Ingredients.getIngredients();
    var recipes = Recipes.getRecipes();
    var usedInCount = {};
    recipes.forEach(function (r) {
      var seen = {};
      (r.ingredients || []).forEach(function (ri) {
        if (ri.ingredientId && !seen[ri.ingredientId]) {
          seen[ri.ingredientId] = true;
          usedInCount[ri.ingredientId] = (usedInCount[ri.ingredientId] || 0) + 1;
        }
        if (ri.subRecipeId && !seen["s:" + ri.subRecipeId]) {
          seen["s:" + ri.subRecipeId] = true;
          usedInCount["rec:" + ri.subRecipeId] = (usedInCount["rec:" + ri.subRecipeId] || 0) + 1;
        }
      });
    });
    var filterVal = (document.getElementById("ingredient-filter") && document.getElementById("ingredient-filter").value) || "all";
    var typeFilterVal = (document.getElementById("ingredient-type-filter") && document.getElementById("ingredient-type-filter").value) || "all";
    var filtered = ingredients;
    if (filterVal === "approved") filtered = ingredients.filter(function (i) { return !!i.approved; });
    if (filterVal === "development") filtered = ingredients.filter(function (i) { return !i.approved; });
    // "Ingredients only" = not packaging, full stop. It used to also require a populated,
    // non-"Other" category — but the real dataset's cat field is only ever "Other" or
    // "Packaging" (no finer taxonomy has actually been entered), so that extra condition never
    // matched a single RM item and made this filter return nothing. "Other" is kept as a
    // forward-compatible bucket for once real categories exist, but today it's a strict subset
    // of "Ingredients only" it doesn't need to duplicate the packaging check for.
    if (typeFilterVal === "ingredients") filtered = filtered.filter(function (i) { return !isPackagingItem(i); });
    if (typeFilterVal === "packaging") filtered = filtered.filter(isPackagingItem);
    if (typeFilterVal === "other") filtered = filtered.filter(function (i) { return (i.cat || "").trim() === "Other" && !isPackagingItem(i); });
    if (!includeDelistedIngredients()) filtered = filtered.filter(function (i) { return !isDelisted(i.name); });
    var singleIngRecipes = recipes.filter(isSingleIngredientRecipe);
    if (filterVal === "approved") singleIngRecipes = singleIngRecipes.filter(function (r) { return !!r.approved; });
    if (filterVal === "development") singleIngRecipes = singleIngRecipes.filter(function (r) { return !r.approved; });
    if (typeFilterVal === "ingredients") singleIngRecipes = singleIngRecipes.filter(function (r) {
      var baseIng = ingredients.find(function (i) { return i.id === (r.ingredients || [])[0].ingredientId; });
      return !baseIng || !isPackagingItem(baseIng);
    });
    if (typeFilterVal === "packaging") singleIngRecipes = singleIngRecipes.filter(function (r) {
      var baseIng = ingredients.find(function (i) { return i.id === (r.ingredients || [])[0].ingredientId; });
      return baseIng && isPackagingItem(baseIng);
    });
    if (typeFilterVal === "other") singleIngRecipes = singleIngRecipes.filter(function (r) {
      var baseIng = ingredients.find(function (i) { return i.id === (r.ingredients || [])[0].ingredientId; });
      return baseIng && (baseIng.cat || "").trim() === "Other" && !isPackagingItem(baseIng);
    });
    if (!includeDelistedIngredients()) singleIngRecipes = singleIngRecipes.filter(function (r) { return !isDelisted(r.name); });
    if (!includeUnlinkedIngredients()) {
      filtered = filtered.filter(function (i) { return (usedInCount[i.id] || 0) > 0; });
      singleIngRecipes = singleIngRecipes.filter(function (r) { return (usedInCount["rec:" + r.id] || 0) > 0; });
    }
    if (!q) { dd.classList.remove("open"); dd.innerHTML = ""; return; }
    function ingScore(i) {
      var nameR = searchWordsMatch(i.name, q);
      var codeR = searchWordsMatch(i.code, q);
      var altR = (i.altCodes || []).map(function (c) { return searchWordsMatch(c, q); }).reduce(function (a, b) { return a.score > b.score ? a : b; }, { match: false, score: 0 });
      var catR = searchWordsMatch(i.cat, q);
      var supR = searchWordsMatch(i.supplier, q);
      var tagsR = searchWordsMatch((i.descriptionTags || []).join(" "), q);
      var best = [nameR, codeR, altR, catR, supR, tagsR].reduce(function (a, b) { return a.score >= b.score ? a : b; }, { match: false, score: 0 });
      return best;
    }
    var ingMatches = filtered.filter(function (i) { return ingScore(i).match; }).sort(function (a, b) { return ingScore(b).score - ingScore(a).score; });
    function recScore(r) {
      var nameR = searchWordsMatch(r.name, q);
      var codeR = searchWordsMatch(r.code, q);
      var tagsR = searchWordsMatch((r.descriptionTags || []).join(" "), q);
      var best = [nameR, codeR, tagsR].reduce(function (a, b) { return a.score >= b.score ? a : b; }, { match: false, score: 0 });
      return best;
    }
    var recMatches = singleIngRecipes.filter(function (r) { return recScore(r).match; }).sort(function (a, b) { return recScore(b).score - recScore(a).score; });
    var allMatches = ingMatches.slice(0, 8).map(function (i) { return { type: "ingredient", item: i }; }).concat(recMatches.slice(0, 4).map(function (r) { return { type: "recipe", item: r }; }));
    if (allMatches.length === 0) {
      dd.innerHTML = "<div style=\"padding:10px;color:var(--nc-gray-400);font-size:13px\">No matches</div>";
      dd.classList.add("open");
      return;
    }
    dd.innerHTML = allMatches.map(function (m) {
      if (m.type === "ingredient") {
        var i = m.item;
        var codePart = (i.code && i.code.trim()) ? "<span style=\"font-size:11px;color:var(--nc-gray-500);font-family:var(--nc-mono);margin-right:8px\">" + i.code + "</span>" : "";
        var noNutBadge = (hasNoNutrition(i) && !isPackagingItem(i)) ? "<span title=\"No nutritional values\" style=\"margin-left:4px;color:var(--nc-amber);font-size:11px;cursor:help\">⚠</span>" : "";
        var tagsPart = (i.descriptionTags || []).length ? "<span style=\"font-size:11px;color:var(--nc-gray-500);margin-left:6px\">" + (i.descriptionTags || []).join(", ") + "</span>" : "";
        var statusBadge = i.approved ? "<span class=\"badge badge-approved\" style=\"font-size:9px;margin-left:6px\">Approved</span>" : "<span class=\"badge badge-development\" style=\"font-size:9px;margin-left:6px\">In development</span>";
        var onclick = "editIngredient('" + i.id.replace(/'/g, "\\'") + "', true); document.getElementById('ingredient-library-dropdown').classList.remove('open');";
        return "<div class=\"ingredient-dropdown-item\" onclick=\"" + onclick + "\">" + codePart + "<span>" + i.name + "</span>" + noNutBadge + tagsPart + "<span class=\"cat\">" + (i.cat || "") + "</span>" + statusBadge + "</div>";
      } else {
        var r = m.item;
        var codePart = (r.code && r.code.trim()) ? "<span style=\"font-size:11px;color:var(--nc-gray-500);font-family:var(--nc-mono);margin-right:8px\">" + r.code + "</span>" : "";
        var statusBadge = r.approved ? "<span class=\"badge badge-approved\" style=\"font-size:9px;margin-left:6px\">Approved</span>" : "<span class=\"badge badge-development\" style=\"font-size:9px;margin-left:6px\">In development</span>";
        var onclick = "openSingleIngredientRecipeView('" + r.id.replace(/'/g, "\\'") + "'); document.getElementById('ingredient-library-dropdown').classList.remove('open');";
        return "<div class=\"ingredient-dropdown-item\" onclick=\"" + onclick + "\">" + codePart + "<span>" + r.name + "</span><span class=\"badge badge-subrecipe\" style=\"font-size:9px;margin-left:6px\">1 ing</span>" + statusBadge + "</div>";
      }
    }).join("");
    dd.classList.add("open");
  }

  /** "(vN)" shown right after a name wherever it's listed — N is how many times this record
   * has been saved (versionHistory.length), starting at v1 for a never-yet-edited record. */
  function versionBadge(entity) {
    var v = (entity && entity.versionHistory && entity.versionHistory.length) || 1;
    return "<span style=\"font-size:10px;color:var(--nc-gray-400);margin-left:4px\">(v" + v + ")</span>";
  }

  function rowHtml(i, usedInCount) {
    var tagsStr = (i.descriptionTags || []).join(" ");
    var isPkg = isPackagingItem(i);
    var approvedLabel = i.approved ? "<span class=\"badge badge-approved\" style=\"font-size:10px;margin-right:6px\">Approved</span>" : "";
    var typeLabel = isPkg ? "<span class=\"badge badge-pkg\" style=\"font-size:10px;margin-right:6px\">PKG</span>" : "<span class=\"badge badge-rm\" style=\"font-size:10px;margin-right:6px\">RM</span>";
    var noNutBadge = (hasNoNutrition(i) && !isPackagingItem(i)) ? "<span class=\"ingredient-no-nutrition\" title=\"No nutritional values\" style=\"margin-left:4px;color:var(--nc-amber);font-size:12px;cursor:help\">⚠</span>" : "";
    var usedInBadge = (usedInCount || 0) > 0 ? "<span style=\"font-size:10px;color:var(--nc-gray-500);margin-left:4px\" title=\"Used in " + usedInCount + " recipe(s)\">(" + usedInCount + " recipes)</span>" : "";
    var costUom = (i.costUOM || i.costUom || i.CostUom || i.CostUOM || i.cost_uom || "").toString().trim().toUpperCase();

    //if (isPackagingItem(i) && !costUom) costUom = "EACH";
    var costDisplay = i.cost != null && i.cost > 0 ? (i.currency || "£") + Number(i.cost).toFixed(2) : "—";
    var uomDisplay = costUom || "—";
    return "<tr class=\"row-clickable\" onclick=\"handleIngredientRowClick(event, '" + i.id + "')\" ondblclick=\"handleIngredientRowDblClick(event, '" + i.id + "')\" oncontextmenu=\"return handleIngredientRowContextMenu(event, '" + i.id + "')\" style=\"cursor:pointer\">" +
      "<td class=\"bold\">" + approvedLabel + typeLabel + i.name + versionBadge(i) + noNutBadge + usedInBadge + (tagsStr ? "<span style=\"display:none\"> " + tagsStr + "</span>" : "") + "</td>" +
      "<td style=\"font-size:12px;color:var(--nc-gray-600);font-family:var(--nc-mono)\">" + (i.code || "—") + "</td>" +
      "<td style=\"color:var(--nc-gray-500)\">" + (i.cat || "") + "</td>" +
      "<td class=\"num\">" + formatNutritionCell(i.kj, isPkg) + "</td>" +
      "<td class=\"num\">" + formatNutritionCell(i.protein, isPkg) + "</td>" +
      "<td class=\"num\">" + formatNutritionCell(i.fat, isPkg) + "</td>" +
      "<td class=\"num\">" + formatNutritionCell(i.carb, isPkg) + "</td>" +
      "<td class=\"num\">" + formatNutritionCell(i.fibre, isPkg) + "</td>" +
      "<td class=\"num\">" + formatNutritionCell(i.salt, isPkg) + "</td>" +
      "<td class=\"num\" style=\"font-size:12px;font-family:var(--nc-mono);color:var(--nc-gray-700)\">" + costDisplay + "</td>" +
      "<td style=\"font-size:12px;color:var(--nc-gray-600);font-family:var(--nc-mono)\">" + uomDisplay + "</td>" +
      "<td style=\"font-size:12px;color:var(--nc-gray-600)\">" + (i.supplier || "—") + "</td>" +
      "<td>" + ((i.allergens || []).length ? (i.allergens || []).map(function (a) { return "<span class=\"allergen-tag allergen-present\" style=\"font-size:10px;padding:2px 6px\">" + a + "</span>"; }).join(" ") : "<span style=\"color:var(--nc-gray-300)\">None</span>") + "</td>" +
      "<td onclick=\"event.stopPropagation()\"><button class=\"btn btn-sm\" onclick=\"editIngredient('" + i.id + "')\">Edit</button> <button class=\"btn btn-sm btn-danger\" onclick=\"deleteIngredient('" + i.id + "')\">×</button></td>" +
      "</tr>";
  }

  var ingredientRowClickTimer = null;
  function handleIngredientRowClick(e, ingId) {
    if (ingredientRowClickTimer) clearTimeout(ingredientRowClickTimer);
    ingredientRowClickTimer = setTimeout(function () {
      openIngredientView(ingId);
      ingredientRowClickTimer = null;
    }, 200);
  }
  function handleIngredientRowDblClick(e, ingId) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (ingredientRowClickTimer) { clearTimeout(ingredientRowClickTimer); ingredientRowClickTimer = null; }
    openIngredientActionsMenu(e, ingId);
  }
  function handleIngredientRowContextMenu(e, ingId) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (ingredientRowClickTimer) { clearTimeout(ingredientRowClickTimer); ingredientRowClickTimer = null; }
    openIngredientActionsMenu(e, ingId);
    return false;
  }
  function handleIngredientCentreRowClick(e, id) {
    if (id.indexOf("rec:") === 0) {
      if (ingredientRowClickTimer) clearTimeout(ingredientRowClickTimer);
      ingredientRowClickTimer = setTimeout(function () {
        // View only: shows the recipe-style layout for consistency. This item still only lives
        // in the Ingredient Centre (found there, filtered there, badged there) — "ingredients"
        // as the back-target keeps the flow rooted there, never Recipe Centre.
        openRecipe(id.slice(4), "ingredients");
        ingredientRowClickTimer = null;
      }, 200);
    } else {
      handleIngredientRowClick(e, id);
    }
  }
  function handleIngredientCentreRowDblClick(e, id) {
    if (id.indexOf("rec:") === 0) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (ingredientRowClickTimer) { clearTimeout(ingredientRowClickTimer); ingredientRowClickTimer = null; }
      openSingleIngredientRecipeActionsMenu(e, id.slice(4));
    } else {
      handleIngredientRowDblClick(e, id);
    }
  }
  function handleIngredientCentreRowContextMenu(e, id) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (id.indexOf("rec:") === 0) {
      if (ingredientRowClickTimer) { clearTimeout(ingredientRowClickTimer); ingredientRowClickTimer = null; }
      openSingleIngredientRecipeActionsMenu(e, id.slice(4));
    } else {
      handleIngredientRowContextMenu(e, id);
    }
    return false;
  }

  function openSingleIngredientRecipeView(recipeId) {
    var recipes = Recipes.getRecipes();
    var ingredients = Ingredients.getIngredients();
    var r = recipes.find(function (rec) { return rec.id === recipeId; });
    if (!r || !isSingleIngredientRecipe(r)) return;
    var baseIng = ingredients.find(function (i) { return i.id === (r.ingredients || [])[0].ingredientId; });
    document.getElementById("single-ing-recipe-modal-title").textContent = r.name;
    var content = "<p style=\"margin:0 0 12px;font-size:13px;color:var(--nc-gray-600)\">" + (r.code ? "Code: <span style=\"font-family:var(--nc-mono)\">" + r.code + "</span>" : "") + "</p>";
    var yieldPct = (r.yieldPct != null && r.yieldPct > 0 && r.yieldPct <= 100) ? r.yieldPct : 100;
    var scrapPct = 100 - yieldPct;
    var locked = !!r.approved;
    content += "<p style=\"margin:0 0 12px;font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap\"><strong>Contains:</strong> " + (baseIng ? baseIng.name : "—") +
      "<span style=\"display:inline-flex;align-items:center;gap:6px;margin-left:8px\">" +
      "<label for=\"single-ing-recipe-scrap\" style=\"color:var(--nc-gray-500);font-weight:400\">Scrap:</label>" +
      (locked
        ? "<span style=\"font-family:var(--nc-mono)\">" + scrapPct + "%</span>"
        : "<input type=\"number\" id=\"single-ing-recipe-scrap\" class=\"form-input\" min=\"0\" max=\"99\" step=\"any\" value=\"" + scrapPct + "\" style=\"width:60px;padding:4px 6px\" onchange=\"updateSubRecipeScrapPct('" + recipeId.replace(/'/g, "\\'") + "', this.value); openSingleIngredientRecipeView('" + recipeId.replace(/'/g, "\\'") + "');\" title=\"% of input weight lost in prep (e.g. chopping/trimming). Affects cost only, not nutrition.\">%") +
      "</span>" +
      "<span style=\"display:inline-flex;align-items:center;gap:6px;margin-left:8px\">" +
      "<label for=\"single-ing-recipe-owncost\" style=\"color:var(--nc-gray-500);font-weight:400\">Cost (£/kg):</label>" +
      (locked
        ? "<span style=\"font-family:var(--nc-mono)\">£" + (r.ownCost || 0) + "</span>"
        : "<input type=\"number\" id=\"single-ing-recipe-owncost\" class=\"form-input\" min=\"0\" step=\"any\" value=\"" + (r.ownCost || 0) + "\" style=\"width:70px;padding:4px 6px\" onchange=\"updateSubRecipeOwnCost('" + recipeId.replace(/'/g, "\\'") + "', this.value); openSingleIngredientRecipeView('" + recipeId.replace(/'/g, "\\'") + "');\" title=\"Own cost from the sheet/API. Leave 0 to derive from the base ingredient instead.\">") +
      "</span></p>";
    if (scrapPct > 0) {
      content += "<p style=\"margin:0 0 12px;font-size:12px;color:var(--nc-amber)\">" + scrapPct + "% scrap from prep — cost is scaled up accordingly; nutrition per 100g is unchanged.</p>";
    }
    if (baseIng) {
      content += "<p style=\"margin:0;font-size:12px;color:var(--nc-gray-500)\">Nutrition from base: " + (baseIng.kcal || 0) + " kcal/100g · " + (baseIng.protein || 0) + "g protein</p>";
    }
    document.getElementById("single-ing-recipe-content").innerHTML = content;
    var vhList = document.getElementById("single-ing-recipe-version-history-list");
    var vhSummary = document.getElementById("single-ing-recipe-version-history-summary");
    if (vhList) {
      var vh = (r.versionHistory || []).slice().reverse();
      if (r.created && vh.indexOf(r.created) === -1) vh.push(r.created);
      if (vh.length === 0) {
        vhList.innerHTML = "<p style=\"margin:0;color:var(--nc-gray-500);font-size:13px\">No version history recorded.</p>";
        if (vhSummary) vhSummary.textContent = "Version History";
      } else {
        var latest = new Date(vh[0]).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        if (vhSummary) vhSummary.textContent = "Version History — Last edited: " + latest;
        vhList.innerHTML = vh.map(function (ts) { var d = new Date(ts); return "<div style=\"padding:6px 0;border-bottom:1px solid var(--nc-gray-100)\">" + d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + "</div>"; }).join("");
      }
    }
    var wuList = document.getElementById("single-ing-recipe-where-used-list");
    var wuSummary = document.getElementById("single-ing-recipe-where-used-summary");
    if (wuList && wuSummary) {
      var recipes = Recipes.getRecipes();
      var usedIn = recipes.filter(function (rec) {
        if (rec.id === recipeId) return false;
        return (rec.ingredients || []).some(function (ri) { return ri.subRecipeId === recipeId; });
      });
      wuSummary.textContent = usedIn.length === 0 ? "Where used" : "Where used — " + usedIn.length + " recipe" + (usedIn.length !== 1 ? "s" : "");
      if (usedIn.length === 0) {
        wuList.innerHTML = "<p style=\"margin:0;color:var(--nc-gray-500);font-size:13px\">Not used as a sub recipe in any other recipe yet.</p>";
      } else {
        wuList.innerHTML = usedIn.map(function (rec) {
          var status = rec.approved ? "<span class=\"badge badge-approved\" style=\"font-size:9px;margin-left:8px\">Approved</span>" : "<span class=\"badge badge-development\" style=\"font-size:9px;margin-left:8px\">In development</span>";
          var kind = (rec.recipeType || "finishedProduct") === "subRecipe" ? "Sub recipe" : "Finished";
          var code = (rec.code && rec.code.trim()) ? "<span style=\"font-family:var(--nc-mono);font-size:12px;color:var(--nc-gray-500);margin-right:8px\">[" + rec.code + "]</span>" : "";
          return "<div class=\"card row-clickable\" style=\"padding:12px;cursor:pointer\" onclick=\"closeModal('modal-single-ingredient-recipe');openRecipe('" + rec.id.replace(/'/g, "\\'") + "')\">" +
            "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px\">" +
            "<div style=\"min-width:0\"><div style=\"font-weight:700;color:var(--nc-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">" + code + rec.name + status + "</div>" +
            "<div style=\"font-size:12px;color:var(--nc-gray-500)\">" + (rec.ingredients || []).length + " ingredient(s) · " + kind + " · " + rec.type + "</div></div>" +
            "<span style=\"font-size:12px;color:var(--nc-gray-400)\">Open →</span></div></div>";
        }).join("");
      }
    }
    var openBtn = document.getElementById("single-ing-recipe-open-btn");
    if (openBtn) {
      openBtn.onclick = function () { closeModal("modal-single-ingredient-recipe"); openRecipe(recipeId); };
    }
    openModal("modal-single-ingredient-recipe");
  }

  function openSingleIngredientRecipeActionsMenu(e, recipeId) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    var m = document.getElementById("ingredient-actions-menu");
    if (!m) return;
    var x = (e && (e.pageX || e.clientX)) || 0;
    var y = (e && (e.pageY || e.clientY)) || 0;
    m.style.left = x + "px";
    m.style.top = y + "px";
    m.style.display = "";
    m.innerHTML =
      "<div class=\"menu-item\" onclick=\"showRecipeWhereUsed('" + recipeId.replace(/'/g, "\\'") + "'); hideIngredientActionsMenu();\">" +
      "<span>Where used</span><span class=\"hint\">Shows recipes</span></div>" +
      "<div class=\"menu-divider\"></div>" +
      "<div class=\"menu-item\" onclick=\"openRecipeForEdit('" + recipeId.replace(/'/g, "\\'") + "', window.recipeDetailBackView || 'recipes'); hideIngredientActionsMenu();\">" +
      "<span>Edit</span><span class=\"hint\">Name, code, kind</span></div>";
  }

  function hideIngredientActionsMenu() {
    var m = document.getElementById("ingredient-actions-menu");
    if (!m) return;
    m.style.display = "none";
    m.innerHTML = "";
  }

  function openIngredientActionsMenu(e, ingId) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    var m = document.getElementById("ingredient-actions-menu");
    if (!m) return;
    var ingredients = Ingredients.getIngredients();
    var ing = ingredients.find(function (i) { return i.id === ingId; });
    if (!ing) return;

    var x = (e && (e.pageX || e.clientX)) || 0;
    var y = (e && (e.pageY || e.clientY)) || 0;
    m.style.left = x + "px";
    m.style.top = y + "px";
    m.style.display = "";
    m.innerHTML =
      "<div class=\"menu-item\" onclick=\"showIngredientWhereUsed('" + ingId.replace(/'/g, "\\'") + "')\">" +
      "<span>Where used</span><span class=\"hint\">Shows recipes</span></div>" +
      "<div class=\"menu-divider\"></div>" +
      "<div class=\"menu-item\" onclick=\"editIngredient('" + ingId.replace(/'/g, "\\'") + "'); hideIngredientActionsMenu();\">" +
      "<span>Edit ingredient</span><span class=\"hint\">Open</span></div>";
  }

  function handleRecipeContextMenu(e, recipeId) {
    e.preventDefault();
    e.stopPropagation();
    openRecipeActionsMenu(e, recipeId);
    return false;
  }

  function hideRecipeActionsMenu() {
    var m = document.getElementById("recipe-actions-menu");
    if (m) { m.style.display = "none"; m.innerHTML = ""; }
  }

  function handleRecipeTitleContextMenu(e) {
    if (!currentRecipeId) return true;
    e.preventDefault();
    e.stopPropagation();
    openRecipeTitleContextMenu(e);
    return false;
  }

  function hideRecipeTitleContextMenu() {
    var m = document.getElementById("recipe-title-actions-menu");
    if (m) { m.style.display = "none"; m.innerHTML = ""; }
  }

  function openRecipeTitleContextMenu(e) {
    var m = document.getElementById("recipe-title-actions-menu");
    if (!m || !currentRecipeId) return;
    var recipeId = currentRecipeId.replace(/'/g, "\\'");
    var x = (e && (e.pageX || e.clientX)) || 0;
    var y = (e && (e.pageY || e.clientY)) || 0;
    m.style.left = x + "px";
    m.style.top = y + "px";
    m.style.display = "";
    m.innerHTML =
      "<div class=\"menu-item\" onclick=\"showRecipeWhereUsed('" + recipeId + "'); hideRecipeTitleContextMenu();\">" +
      "<span>Where used</span><span class=\"hint\">Recipes that use this</span></div>" +
      "<div class=\"menu-divider\"></div>" +
      "<div class=\"menu-item\" onclick=\"showRecipeVersionHistory('" + recipeId + "'); hideRecipeTitleContextMenu();\">" +
      "<span>Version history</span><span class=\"hint\">Edit history</span></div>";
  }

  function showRecipeVersionHistory(recipeId) {
    hideRecipeTitleContextMenu();
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === recipeId; });
    if (!r) { showToast("Recipe not found"); return; }
    var list = document.getElementById("recipe-version-history-modal-list");
    if (!list) return;
    var vh = (r.versionHistory || []).slice().reverse();
    if (r.created && vh.indexOf(r.created) === -1) vh.push(r.created);
    if (vh.length === 0) {
      list.innerHTML = "<p style=\"margin:0;color:var(--nc-gray-500);font-size:13px\">No version history recorded.</p>";
    } else {
      list.innerHTML = vh.map(function (ts) {
        var d = new Date(ts);
        return "<div style=\"padding:8px 0;border-bottom:1px solid var(--nc-gray-100)\">" + d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + "</div>";
      }).join("");
    }
    openModal("modal-recipe-version-history");
  }

  function openRecipeActionsMenu(e, recipeId) {
    var m = document.getElementById("recipe-actions-menu");
    if (!m) return;
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === recipeId; });
    if (!r) return;
    var x = (e && (e.pageX || e.clientX)) || 0;
    var y = (e && (e.pageY || e.clientY)) || 0;
    m.style.left = x + "px";
    m.style.top = y + "px";
    m.style.display = "";
    m.innerHTML =
      "<div class=\"menu-item\" onclick=\"showRecipeWhereUsed('" + recipeId.replace(/'/g, "\\'") + "'); hideRecipeActionsMenu();\">" +
      "<span>Where used</span><span class=\"hint\">Shows recipes</span></div>" +
      "<div class=\"menu-divider\"></div>" +
      "<div class=\"menu-item\" onclick=\"editRecipeFromContext('" + recipeId.replace(/'/g, "\\'") + "'); hideRecipeActionsMenu();\">" +
      "<span>Edit</span><span class=\"hint\">Name, code, kind</span></div>";
  }

  function showRecipeWhereUsed(recipeId) {
    hideRecipeActionsMenu();
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === recipeId; });
    if (!r) { showToast("Recipe not found"); return; }
    var usedIn = recipes.filter(function (rec) {
      if (rec.id === recipeId) return false;
      return (rec.ingredients || []).some(function (ri) { return ri.subRecipeId === recipeId; });
    });
    var isFinishedProduct = (r.recipeType || "finishedProduct") === "finishedProduct";
    var subtitle = document.getElementById("where-used-subtitle");
    var list = document.getElementById("where-used-list");
    if (subtitle) {
      subtitle.textContent = r.name + " — used in " + usedIn.length + " recipe" + (usedIn.length !== 1 ? "s" : "");
    }
    if (list) {
      if (usedIn.length === 0) {
        if (isFinishedProduct) {
          list.innerHTML = "<p style=\"margin:0;color:var(--nc-gray-500);font-size:13px\">Finished product — not used in other recipes (final product in the hierarchy).</p>";
        } else {
          list.innerHTML = "<p style=\"margin:0;color:var(--nc-gray-500);font-size:13px\">Not used as a sub recipe in any other recipe yet.</p>";
        }
      } else {
        list.innerHTML = usedIn.map(function (rec) {
          var status = rec.approved
            ? "<span class=\"badge badge-approved\" style=\"font-size:9px;margin-left:8px\">Approved</span>"
            : "<span class=\"badge badge-development\" style=\"font-size:9px;margin-left:8px\">In development</span>";
          var kind = (rec.recipeType || "finishedProduct") === "subRecipe" ? "Sub recipe" : "Finished";
          var code = (rec.code && rec.code.trim()) ? "<span style=\"font-family:var(--nc-mono);font-size:12px;color:var(--nc-gray-500);margin-right:8px\">[" + rec.code + "]</span>" : "";
          return "<div class=\"card row-clickable\" style=\"padding:12px;cursor:pointer\" onclick=\"openRecipe('" + rec.id.replace(/'/g, "\\'") + "'); closeModal('modal-ingredient-where-used');\">" +
            "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px\">" +
            "<div style=\"min-width:0\"><div style=\"font-weight:700;color:var(--nc-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">" + code + rec.name + status + "</div>" +
            "<div style=\"font-size:12px;color:var(--nc-gray-500)\">" + (rec.ingredients || []).length + " ingredient(s) · " + kind + " · " + rec.type + "</div></div>" +
            "<span style=\"font-size:12px;color:var(--nc-gray-400)\">Open →</span></div></div>";
        }).join("");
      }
    }
    openModal("modal-ingredient-where-used");
  }

  function editRecipeFromContext(recipeId) {
    hideRecipeActionsMenu();
    openRecipeForEdit(recipeId, "recipes");
  }

  function showIngredientWhereUsed(ingId) {
    hideIngredientActionsMenu();
    var ingredients = Ingredients.getIngredients();
    var ing = ingredients.find(function (i) { return i.id === ingId; });
    if (!ing) { showToast("Ingredient not found"); return; }
    var usedIn = getRecipesUsingIngredient(ingId);
    var subtitle = document.getElementById("where-used-subtitle");
    var list = document.getElementById("where-used-list");
    if (subtitle) {
      subtitle.textContent = ing.name + " — used in " + usedIn.length + " recipe" + (usedIn.length !== 1 ? "s" : "");
    }
    if (list) {
      if (usedIn.length === 0) {
        list.innerHTML = "<p style=\"margin:0;color:var(--nc-gray-500);font-size:13px\">Not used in any recipes yet.</p>";
      } else {
        list.innerHTML = usedIn.map(function (r) {
          var status = r.approved
            ? "<span class=\"badge badge-approved\" style=\"font-size:9px;margin-left:8px\">Approved</span>"
            : "<span class=\"badge badge-development\" style=\"font-size:9px;margin-left:8px\">In development</span>";
          var code = (r.code && r.code.trim()) ? "<span style=\"font-family:var(--nc-mono);font-size:12px;color:var(--nc-gray-500);margin-right:8px\">[" + r.code + "]</span>" : "";
          return "<div class=\"card row-clickable\" style=\"padding:12px;cursor:pointer\" onclick=\"openRecipe('" + r.id.replace(/'/g, "\\'") + "'); closeModal('modal-ingredient-where-used');\">" +
            "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px\">" +
            "<div style=\"min-width:0\"><div style=\"font-weight:700;color:var(--nc-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">" + code + r.name + status + "</div>" +
            "<div style=\"font-size:12px;color:var(--nc-gray-500)\">" + (r.ingredients || []).length + " ingredient(s) · " + r.type + "</div></div>" +
            "<span style=\"font-size:12px;color:var(--nc-gray-400)\">Open →</span></div></div>";
        }).join("");
      }
    }
    openModal("modal-ingredient-where-used");
  }

  // null = insertion order; not persisted, resets on page reload. Only one column sorts at a
  // time — clicking a different header switches to it (starting at asc); clicking the same
  // header again toggles asc/desc.
  var ingredientSortColumn = null; // "name" | "supplier" | null
  var ingredientSortDir = null; // "asc" | "desc" | null

  function toggleIngredientSort(column) {
    if (ingredientSortColumn === column) {
      ingredientSortDir = ingredientSortDir === "asc" ? "desc" : "asc";
    } else {
      ingredientSortColumn = column;
      ingredientSortDir = "asc";
    }
    renderIngredientsTable();
  }

  function renderIngredientsTable() {
    var ingredients = Ingredients.getIngredients();
    //console.log(ingredients);
    var recipes = Recipes.getRecipes();
    var usedInCount = {};
    recipes.forEach(function (r) {
      var seen = {};
      (r.ingredients || []).forEach(function (ri) {
        if (ri.ingredientId && !seen[ri.ingredientId]) {
          seen[ri.ingredientId] = true;
          usedInCount[ri.ingredientId] = (usedInCount[ri.ingredientId] || 0) + 1;
        }
        if (ri.subRecipeId && !seen["s:" + ri.subRecipeId]) {
          seen["s:" + ri.subRecipeId] = true;
          usedInCount["rec:" + ri.subRecipeId] = (usedInCount["rec:" + ri.subRecipeId] || 0) + 1;
        }
      });
    });
    var filterVal = (document.getElementById("ingredient-filter") && document.getElementById("ingredient-filter").value) || "all";
    var typeFilterVal = (document.getElementById("ingredient-type-filter") && document.getElementById("ingredient-type-filter").value) || "all";
    var filteredIng = ingredients;
    if (filterVal === "approved") filteredIng = ingredients.filter(function (i) { return !!i.approved; });
    if (filterVal === "development") filteredIng = ingredients.filter(function (i) { return !i.approved; });
    if (typeFilterVal === "ingredients") filteredIng = filteredIng.filter(function (i) { return !isPackagingItem(i); });
    if (typeFilterVal === "packaging") filteredIng = filteredIng.filter(isPackagingItem);
    if (typeFilterVal === "other") filteredIng = filteredIng.filter(function (i) { return (i.cat || "").trim() === "Other" && !isPackagingItem(i); });
    if (!includeDelistedIngredients()) filteredIng = filteredIng.filter(function (i) { return !isDelisted(i.name); });
    var singleIngRecipes = recipes.filter(isSingleIngredientRecipe);
    if (filterVal === "approved") singleIngRecipes = singleIngRecipes.filter(function (r) { return !!r.approved; });
    if (filterVal === "development") singleIngRecipes = singleIngRecipes.filter(function (r) { return !r.approved; });
    if (typeFilterVal === "ingredients") singleIngRecipes = singleIngRecipes.filter(function (r) {
      var baseIng = ingredients.find(function (i) { return i.id === (r.ingredients || [])[0].ingredientId; });
      return !baseIng || !isPackagingItem(baseIng);
    });
    if (typeFilterVal === "packaging") singleIngRecipes = singleIngRecipes.filter(function (r) {
      var baseIng = ingredients.find(function (i) { return i.id === (r.ingredients || [])[0].ingredientId; });
      return baseIng && isPackagingItem(baseIng);
    });
    if (typeFilterVal === "other") singleIngRecipes = singleIngRecipes.filter(function (r) {
      var baseIng = ingredients.find(function (i) { return i.id === (r.ingredients || [])[0].ingredientId; });
      return baseIng && (baseIng.cat || "").trim() === "Other" && !isPackagingItem(baseIng);
    });
    if (!includeDelistedIngredients()) singleIngRecipes = singleIngRecipes.filter(function (r) { return !isDelisted(r.name); });
    if (!includeUnlinkedIngredients()) {
      filteredIng = filteredIng.filter(function (i) { return (usedInCount[i.id] || 0) > 0; });
      singleIngRecipes = singleIngRecipes.filter(function (r) { return (usedInCount["rec:" + r.id] || 0) > 0; });
    }
    var body = document.getElementById("ingredients-body");
    var emptyEl = document.getElementById("ingredients-empty");
    var countLabel = document.getElementById("ingredients-count-label");
    var combined = filteredIng.map(function (i) { return { name: i.name || "", supplier: i.supplier || "", html: rowHtml(i, usedInCount[i.id]) }; })
      .concat(singleIngRecipes.map(function (r) {
        var baseIng = ingredients.find(function (i) { return i.id === (r.ingredients || [])[0].ingredientId; });
        return { name: r.name || "", supplier: (baseIng && baseIng.supplier) || "", html: rowHtmlForSingleIngredientRecipe(r, ingredients, usedInCount["rec:" + r.id]) };
      }));
    if (ingredientSortColumn) {
      combined.sort(function (a, b) {
        var cmp = (a[ingredientSortColumn] || "").toLowerCase().localeCompare((b[ingredientSortColumn] || "").toLowerCase());
        return ingredientSortDir === "desc" ? -cmp : cmp;
      });
    }
    var rows = combined.map(function (x) { return x.html; });
    if (body) body.innerHTML = rows.join("");
    if (countLabel) countLabel.textContent = (filteredIng.length + singleIngRecipes.length) + " ingredient" + (filteredIng.length + singleIngRecipes.length !== 1 ? "s" : "");
    if (emptyEl) emptyEl.style.display = (filteredIng.length + singleIngRecipes.length) === 0 ? "block" : "none";
    ["name", "supplier"].forEach(function (col) {
      var arrowEl = document.getElementById("ingredient-sort-arrow-" + col);
      if (arrowEl) arrowEl.textContent = ingredientSortColumn === col ? (ingredientSortDir === "asc" ? "▲" : "▼") : "";
    });
    filterIngredients();
  }

  function rowHtmlForSingleIngredientRecipe(r, ingredients, usedInCount) {
    var baseIng = ingredients.find(function (i) { return i.id === (r.ingredients || [])[0].ingredientId; });
    var tagsStr = (r.descriptionTags || []).join(" ");
    var approvedLabel = r.approved ? "<span class=\"badge badge-approved\" style=\"font-size:10px;margin-right:6px\">Approved</span>" : "";
    var isPkg = !!(baseIng && isPackagingItem(baseIng));
    var typeLabel = isPkg ? "<span class=\"badge badge-pkg\" style=\"font-size:10px;margin-right:6px\">PKG</span>" : "<span class=\"badge badge-rm\" style=\"font-size:10px;margin-right:6px\">RM</span>";
    var usedInBadge = (usedInCount || 0) > 0 ? "<span style=\"font-size:10px;color:var(--nc-gray-500);margin-left:4px\" title=\"Used in " + usedInCount + " recipe(s)\">(" + usedInCount + " recipes)</span>" : "";
    var kj = baseIng ? baseIng.kj : 0, kcal = baseIng ? baseIng.kcal : 0, protein = baseIng ? baseIng.protein : 0, fat = baseIng ? baseIng.fat : 0, carb = baseIng ? baseIng.carb : 0, fibre = baseIng ? baseIng.fibre : 0, salt = baseIng ? baseIng.salt : 0;
    // Own cost from the sheet/API wins when present; only derives from the base ingredient
    // (scaled for yield/scrap) while own cost is unset — see getSubRecipeTotalCost for the
    // same priority applied wherever this item is used as a recipe component.
    var cost;
    if (r.ownCost && r.ownCost > 0) {
      cost = r.ownCost;
    } else {
      cost = baseIng && baseIng.cost != null ? baseIng.cost : null;
      var yieldPct = (r.yieldPct != null && r.yieldPct > 0 && r.yieldPct <= 100) ? r.yieldPct : 100;
      if (cost != null && yieldPct < 100) cost = cost * (100 / yieldPct);
    }
    var supplier = baseIng ? baseIng.supplier : "", allergens = baseIng ? (baseIng.allergens || []) : [];
    var costUom = baseIng ? (baseIng.costUOM || baseIng.costUom || baseIng.CostUom || baseIng.CostUOM || "").toString().trim().toUpperCase() : "";
    var costDisplay = cost != null && cost > 0 ? (baseIng && baseIng.currency === "$" ? "$" : "£") + Number(cost).toFixed(2) : "—";
    var uomDisplay = costUom || "—";
    return "<tr class=\"row-clickable\" onclick=\"handleIngredientCentreRowClick(event, 'rec:" + r.id.replace(/'/g, "\\'") + "')\" ondblclick=\"handleIngredientCentreRowDblClick(event, 'rec:" + r.id.replace(/'/g, "\\'") + "')\" oncontextmenu=\"return handleIngredientCentreRowContextMenu(event, 'rec:" + r.id.replace(/'/g, "\\'") + "')\" style=\"cursor:pointer\">" +
      "<td class=\"bold\">" + approvedLabel + typeLabel + r.name + versionBadge(r) + usedInBadge + (tagsStr ? "<span style=\"display:none\"> " + tagsStr + "</span>" : "") + "</td>" +
      "<td style=\"font-size:12px;color:var(--nc-gray-600);font-family:var(--nc-mono)\">" + (r.code || "—") + "</td>" +
      "<td style=\"color:var(--nc-gray-500)\">" + (baseIng ? (baseIng.cat || "") : "") + "</td>" +
      "<td class=\"num\">" + formatNutritionCell(kj, isPkg) + "</td>" +
      "<td class=\"num\">" + formatNutritionCell(protein, isPkg) + "</td>" +
      "<td class=\"num\">" + formatNutritionCell(fat, isPkg) + "</td>" +
      "<td class=\"num\">" + formatNutritionCell(carb, isPkg) + "</td>" +
      "<td class=\"num\">" + formatNutritionCell(fibre, isPkg) + "</td>" +
      "<td class=\"num\">" + formatNutritionCell(salt, isPkg) + "</td>" +
      "<td class=\"num\" style=\"font-size:12px;font-family:var(--nc-mono);color:var(--nc-gray-700)\">" + costDisplay + "</td>" +
      "<td style=\"font-size:12px;color:var(--nc-gray-600);font-family:var(--nc-mono)\">" + uomDisplay + "</td>" +
      "<td style=\"font-size:12px;color:var(--nc-gray-600)\">" + (supplier || "—") + "</td>" +
      "<td>" + (allergens.length ? allergens.map(function (a) { return "<span class=\"allergen-tag allergen-present\" style=\"font-size:10px;padding:2px 6px\">" + a + "</span>"; }).join(" ") : "<span style=\"color:var(--nc-gray-300)\">None</span>") + "</td>" +
      "<td onclick=\"event.stopPropagation()\"><button class=\"btn btn-sm\" onclick=\"openSingleIngredientRecipeView('" + r.id.replace(/'/g, "\\'") + "')\">Details</button></td>" +
      "</tr>";
  }

  function setIngredientFilter(value) {
    renderIngredientsTable();
  }

  function clearAllIngredients(closeModalAfter) {
    var ingredients = Ingredients.getIngredients();
    if (ingredients.length === 0) { showToast("Ingredient library is already empty"); return false; }
    if (!confirm("Delete all " + ingredients.length + " ingredients from the library? Recipes will keep their entries but ingredients will show as missing until you add them again.")) return false;
    Ingredients.setIngredients([]);
    renderAll();
    showToast("All ingredients removed from library");
    if (closeModalAfter) closeModal("modal-config-ingredients");
    return true;
  }

  function clearAllIngredientsFromModal() {
    clearAllIngredients(true);
  }

  function clearAllRecipes(closeModalAfter) {
    var recipes = Recipes.getRecipes();
    if (recipes.length === 0) { showToast("No recipes to remove"); return false; }
    if (!confirm("Delete all " + recipes.length + " recipes? This cannot be undone.")) return false;
    Recipes.setRecipes([]);
    renderAll();
    showToast("All recipes removed");
    if (closeModalAfter) closeModal("modal-config-ingredients");
    return true;
  }

  function clearAllRecipesFromModal() {
    clearAllRecipes(true);
  }

  function mergeDuplicateIngredientsInRecipe(recipe) {
    if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) return 0;
    var ingredients = (typeof Ingredients !== "undefined" && Ingredients.getIngredients) ? Ingredients.getIngredients() : [];
    var merged = {};
    var recipes = (typeof Recipes !== "undefined" && Recipes.getRecipes) ? Recipes.getRecipes() : [];
    recipe.ingredients.forEach(function (ri) {
      var key = ri.ingredientId ? ("i:" + ri.ingredientId) : ("s:" + ri.subRecipeId);
      if (!key || key === "i:undefined" || key === "s:undefined") return;
      var qtyG = Data.qtyToGrams(ri.qty, ri.uom);
      if (merged[key]) {
        merged[key].qty += qtyG;
      } else {
        var lineUom = "G";
        if (ri.ingredientId && ingredients.length) {
          var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
          if (ing && (ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM)) lineUom = (ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM).toUpperCase();
        }
        if (ri.subRecipeId && recipes.length) {
          var subRec = recipes.find(function (r) { return r.id === ri.subRecipeId; });
          if (subRec) lineUom = recipeOwnUom(subRec, ingredients);
        }
        merged[key] = ri.ingredientId
          ? { ingredientId: ri.ingredientId, qty: qtyG, uom: lineUom, fvnOverride: ri.fvnOverride || null }
          : { subRecipeId: ri.subRecipeId, qty: qtyG, uom: lineUom, fvnOverride: ri.fvnOverride || null };
      }
    });
    var newList = Object.keys(merged).map(function (k) {
      var m = merged[k];
      if (m.ingredientId && m.uom !== "G" && Data.gramsToUom) m = { ingredientId: m.ingredientId, qty: Data.gramsToUom(m.qty, m.uom), uom: m.uom, fvnOverride: m.fvnOverride };
      if (m.subRecipeId && m.uom !== "G" && Data.gramsToUom) m = { subRecipeId: m.subRecipeId, qty: Data.gramsToUom(m.qty, m.uom), uom: m.uom, fvnOverride: m.fvnOverride };
      return m;
    });
    var before = recipe.ingredients.length;
    recipe.ingredients = newList;
    return before - newList.length;
  }

  function mergeDuplicateIngredientsInAllRecipes() {
    var recipes = Recipes.getRecipes();
    var totalMerged = 0;
    var affectedRecipes = [];
    recipes.forEach(function (r) {
      var removed = mergeDuplicateIngredientsInRecipe(r);
      if (removed > 0) {
        totalMerged += removed;
        affectedRecipes.push(r.name);
      }
    });
    if (totalMerged > 0) {
      Recipes.setRecipes(recipes);
      renderAll();
      showToast("Merged " + totalMerged + " duplicate ingredient line(s) in " + affectedRecipes.length + " recipe(s): " + affectedRecipes.slice(0, 5).join(", ") + (affectedRecipes.length > 5 ? "…" : ""));
    } else {
      showToast("No duplicate ingredient lines found in any recipe.");
    }
  }

  function repairRecipeHierarchyFromModal() {
    var ingredients = Ingredients.getIngredients();
    var recipes = Recipes.getRecipes();
    var repaired = 0;
    var toRemove = [];
    var newRecipes = [];
    ingredients.forEach(function (cpuIng) {
      var cpuName = (cpuIng.name || "").trim();
      if (!cpuName) return;
      var baseName = cpuName
        .replace(/^CPU\s+/i, "")
        .replace(/\s*\(CPU\s*Only\)\s*$/i, "")
        .trim();
      if (baseName === cpuName) return;
      var baseIng = ingredients.find(function (i) {
        var n = (i.name || "").trim();
        return n === baseName && i.id !== cpuIng.id;
      });
      if (!baseIng) return;
      var existingRecipe = recipes.find(function (r) { return (r.name || "").trim() === cpuName; });
      if (existingRecipe) return;
      var recId = Data.genId();
      newRecipes.push({
        id: recId,
        name: cpuName,
        code: cpuIng.code || "",
        desc: "Repaired hierarchy — links to base ingredient",
        type: "food",
        recipeType: "subRecipe",
        serving: 100,
        ingredients: [{ ingredientId: baseIng.id, qty: (baseIng.costUOM || baseIng.costUom || baseIng.CostUom || baseIng.CostUOM || "G").toUpperCase() === "EACH" ? 1 : 100, uom: (baseIng.costUOM || baseIng.costUom || baseIng.CostUom || baseIng.CostUOM || "G").toUpperCase() || "G", fvnOverride: null }],
        created: new Date().toISOString()
      });
      recipes.forEach(function (r) {
        (r.ingredients || []).forEach(function (ri) {
          if (ri.ingredientId === cpuIng.id) {
            ri.subRecipeId = recId;
            delete ri.ingredientId;
            repaired++;
          }
        });
      });
      toRemove.push(cpuIng.id);
    });
    if (newRecipes.length === 0) {
      showToast("No single-ingredient duplicates found to repair (look for 'CPU X' or 'X (CPU Only)' patterns)");
      return;
    }
    if (!confirm("Repair " + newRecipes.length + " item(s)? Will create linked recipes and remove duplicate ingredients.")) return;
    newRecipes.forEach(function (r) { recipes.push(r); });
    Recipes.setRecipes(recipes);
    var kept = ingredients.filter(function (i) { return toRemove.indexOf(i.id) === -1; });
    Ingredients.setIngredients(kept);
    renderAll();
    showToast("Repaired " + newRecipes.length + " item(s). Base ingredients now linked correctly.");
    closeModal("modal-config-ingredients");
  }

  function removeDuplicates() {
    var ingredients = Ingredients.getIngredients();
    var recipes = Recipes.getRecipes();
    var ingByNormName = {};
    ingredients.forEach(function (i) {
      var n = (i.name || "").toLowerCase().trim();
      if (!ingByNormName[n]) ingByNormName[n] = [];
      ingByNormName[n].push(i);
    });
    var idMap = {};
    var idsToRemove = [];
    Object.keys(ingByNormName).forEach(function (n) {
      var group = ingByNormName[n];
      if (group.length <= 1) return;
      var keep = group[0];
      for (var d = 1; d < group.length; d++) {
        idMap[group[d].id] = keep.id;
        idsToRemove.push(group[d].id);
      }
    });
    var ingredientsRemoved = idsToRemove.length;
    if (Object.keys(idMap).length > 0) {
      recipes.forEach(function (r) {
        (r.ingredients || []).forEach(function (ri) {
          if (idMap[ri.ingredientId]) ri.ingredientId = idMap[ri.ingredientId];
        });
      });
      Recipes.setRecipes(recipes);
      var kept = ingredients.filter(function (i) { return idsToRemove.indexOf(i.id) === -1; });
      Ingredients.setIngredients(kept);
    }
    var recByNormName = {};
    recipes = Recipes.getRecipes();
    recipes.forEach(function (r) {
      var n = (r.name || "").toLowerCase().trim();
      if (!recByNormName[n]) recByNormName[n] = [];
      recByNormName[n].push(r);
    });
    var recipesRemoved = 0;
    Object.keys(recByNormName).forEach(function (n) {
      var group = recByNormName[n];
      if (group.length <= 1) return;
      for (var d = 1; d < group.length; d++) {
        Recipes.deleteRecipe(group[d].id);
        recipesRemoved++;
      }
    });
    renderAll();
    var msg = [];
    if (ingredientsRemoved > 0) msg.push(ingredientsRemoved + " duplicate ingredient(s) removed");
    if (recipesRemoved > 0) msg.push(recipesRemoved + " duplicate recipe(s) removed");
    if (msg.length > 0) showToast(msg.join(". "));
    else showToast("No duplicates found.");
  }

  function openConfigureIngredients() {
    openModal("modal-config-ingredients");
    var panel = document.getElementById("duplicates-panel");
    if (panel) panel.style.display = "none";
    var list = document.getElementById("duplicates-list");
    if (list) list.innerHTML = "";
    var summary = document.getElementById("duplicates-summary");
    if (summary) summary.textContent = "";
    var decSel = document.getElementById("config-ingredient-decimals");
    if (decSel) {
      var saved = null;
      try { saved = localStorage.getItem(INGREDIENT_DISPLAY_DECIMALS_KEY); } catch (e) {}
      decSel.value = (saved === "0" || saved === "1" || saved === "2" || saved === "3") ? saved : "full";
    }
  }

  function getDuplicateGroupsByName(items, getNameFn) {
    var by = {};
    items.forEach(function (it) {
      var n = (getNameFn(it) || "").toLowerCase().trim();
      if (!n) return;
      if (!by[n]) by[n] = [];
      by[n].push(it);
    });
    return Object.keys(by).filter(function (k) { return by[k].length > 1; }).map(function (k) {
      return { norm: k, name: (by[k][0] && getNameFn(by[k][0])) || k, items: by[k] };
    });
  }

  function showDuplicates() {
    var panel = document.getElementById("duplicates-panel");
    var list = document.getElementById("duplicates-list");
    var summary = document.getElementById("duplicates-summary");
    if (!panel || !list || !summary) return;
    panel.style.display = "";

    var ingredients = Ingredients.getIngredients();
    var recipes = Recipes.getRecipes();
    var ingGroups = getDuplicateGroupsByName(ingredients, function (i) { return i.name; });
    var recGroups = getDuplicateGroupsByName(recipes, function (r) { return r.name; });
    summary.textContent = ingGroups.length + " ingredient group(s), " + recGroups.length + " recipe group(s)";

    if (ingGroups.length === 0 && recGroups.length === 0) {
      list.innerHTML = "<p style=\"margin:0;color:var(--nc-gray-500);font-size:13px\">No duplicates found.</p>";
      return;
    }

    function ingRow(i, norm) {
      var status = i.approved ? "<span class=\"badge badge-approved\" style=\"font-size:9px\">Approved</span>" : "<span class=\"badge badge-development\" style=\"font-size:9px\">In development</span>";
      var code = (i.code && i.code.trim()) ? i.code : "—";
      var sup = (i.supplier && i.supplier.trim()) ? i.supplier : "—";
      var safeNorm = (norm || "").replace(/'/g, "\\'");
      var safeId = (i.id || "").replace(/'/g, "\\'");
      return "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;border:1px solid var(--nc-gray-200);border-radius:8px;background:var(--nc-white);margin-top:8px\">" +
        "<div style=\"min-width:0\">" +
        "<div style=\"font-weight:600;color:var(--nc-secondary);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">" + i.name + "</div>" +
        "<div style=\"font-size:12px;color:var(--nc-gray-500);font-family:var(--nc-mono)\">Code: " + code + " · Supplier: " + sup + "</div>" +
        "</div>" +
        "<div style=\"display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end\">" + status +
        "<button class=\"btn btn-sm\" onclick=\"dedupeIngredientGroup('" + safeNorm + "', '" + safeId + "')\">Keep this, remove others</button>" +
        "</div></div>";
    }

    function recRow(r, norm) {
      var status = r.approved ? "<span class=\"badge badge-approved\" style=\"font-size:9px\">Approved</span>" : "<span class=\"badge badge-development\" style=\"font-size:9px\">In development</span>";
      var code = (r.code && r.code.trim()) ? r.code : "—";
      var safeNorm = (norm || "").replace(/'/g, "\\'");
      var safeId = (r.id || "").replace(/'/g, "\\'");
      return "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;border:1px solid var(--nc-gray-200);border-radius:8px;background:var(--nc-white);margin-top:8px\">" +
        "<div style=\"min-width:0\">" +
        "<div style=\"font-weight:600;color:var(--nc-secondary);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">" + r.name + "</div>" +
        "<div style=\"font-size:12px;color:var(--nc-gray-500);font-family:var(--nc-mono)\">Code: " + code + "</div>" +
        "</div>" +
        "<div style=\"display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end\">" + status +
        "<button class=\"btn btn-sm\" onclick=\"dedupeRecipeGroup('" + safeNorm + "', '" + safeId + "')\">Keep this, remove others</button>" +
        "</div></div>";
    }

    var html = "";
    if (ingGroups.length) {
      html += "<h4 style=\"margin:10px 0 0;font-size:12px;color:var(--nc-gray-500);text-transform:uppercase;letter-spacing:.8px\">Ingredient duplicates</h4>";
      ingGroups.forEach(function (g) {
        html += "<div style=\"margin-top:10px\"><div style=\"font-size:13px;font-weight:700;color:var(--nc-secondary)\">" + g.name + "</div>";
        g.items.forEach(function (i) { html += ingRow(i, g.norm); });
        html += "</div>";
      });
    }
    if (recGroups.length) {
      html += "<h4 style=\"margin:16px 0 0;font-size:12px;color:var(--nc-gray-500);text-transform:uppercase;letter-spacing:.8px\">Recipe duplicates</h4>";
      recGroups.forEach(function (g) {
        html += "<div style=\"margin-top:10px\"><div style=\"font-size:13px;font-weight:700;color:var(--nc-secondary)\">" + g.name + "</div>";
        g.items.forEach(function (r) { html += recRow(r, g.norm); });
        html += "</div>";
      });
    }
    list.innerHTML = html;
  }

  function dedupeIngredientGroup(normName, keepId) {
    var ingredients = Ingredients.getIngredients();
    var recipes = Recipes.getRecipes();
    var norm = (normName || "").toLowerCase().trim();
    var group = ingredients.filter(function (i) { return (i.name || "").toLowerCase().trim() === norm; });
    if (group.length <= 1) { showToast("No duplicates found for that ingredient"); return; }
    var keep = group.find(function (i) { return i.id === keepId; }) || group[0];
    var toRemove = group.filter(function (i) { return i.id !== keep.id; }).map(function (i) { return i.id; });
    if (!confirm("Keep \"" + keep.name + "\" and remove " + toRemove.length + " duplicate(s)? Recipes will be updated to use the kept ingredient.")) return;
    var idMap = {};
    toRemove.forEach(function (id) { idMap[id] = keep.id; });
    recipes.forEach(function (r) {
      (r.ingredients || []).forEach(function (ri) {
        if (idMap[ri.ingredientId]) ri.ingredientId = idMap[ri.ingredientId];
      });
    });
    Recipes.setRecipes(recipes);
    Ingredients.setIngredients(ingredients.filter(function (i) { return toRemove.indexOf(i.id) === -1; }));
    renderAll();
    showToast("Duplicates removed");
    showDuplicates();
  }

  function dedupeRecipeGroup(normName, keepId) {
    var recipes = Recipes.getRecipes();
    var norm = (normName || "").toLowerCase().trim();
    var group = recipes.filter(function (r) { return (r.name || "").toLowerCase().trim() === norm; });
    if (group.length <= 1) { showToast("No duplicates found for that recipe"); return; }
    var keep = group.find(function (r) { return r.id === keepId; }) || group[0];
    var toRemove = group.filter(function (r) { return r.id !== keep.id; }).map(function (r) { return r.id; });
    if (!confirm("Keep \"" + keep.name + "\" and remove " + toRemove.length + " duplicate(s)?")) return;
    toRemove.forEach(function (id) { Recipes.deleteRecipe(id); });
    renderAll();
    showToast("Duplicates removed");
    showDuplicates();
  }

  function removeAllDuplicatesFromModal() {
    removeDuplicates();
    showDuplicates();
  }

  function loadSampleIngredients() {
    Ingredients.loadSampleIngredients();
    renderAll();
    showToast("Loaded " + Data.SAMPLE_INGREDIENTS.length + " sample ingredients");
  }

  function loadSampleRecipes() {
    var ingredients = Ingredients.getIngredients();
    var samples = Data.SAMPLE_RECIPES || [];
    var added = 0;
    samples.forEach(function (template) {
      var existing = Recipes.getRecipes().find(function (r) { return r.name === template.name; });
      if (existing) return;
      var ingredientsList = [];
      (template.ingredientsByName || []).forEach(function (item) {
        var ing = ingredients.find(function (i) { return i.name === item.name; });
        if (ing) ingredientsList.push({ ingredientId: ing.id, qty: item.qty, fvnOverride: null });
      });
      if (ingredientsList.length === 0) {
        showToast("Load sample ingredients first so \"" + template.name + "\" can find ingredients.");
        return;
      }
      var recipe = {
        name: template.name,
        desc: template.desc || "",
        type: template.type || "food",
        recipeType: template.recipeType || "finishedProduct",
        serving: template.serving || 100,
        ingredients: ingredientsList,
        approved: false
      };
      Recipes.saveRecipe(recipe);
      added++;
    });
    renderAll();
    if (added > 0) showToast("Loaded " + added + " sample recipe(s). Open from Recipe Centre.");
    else if (samples.length > 0) showToast("Sample recipe(s) already loaded or load ingredients first.");
  }

  function loadSampleData() {
    loadSampleIngredients();
    loadSampleRecipes();
    showToast("Sample data loaded. Open Ingredient Centre and Recipe Centre in the menu to see ingredients and the Victoria Sponge.");
  }

  window.updateIngredientCost = function (ingId, value) {
    Ingredients.updateIngredientCost(ingId, value);
    if (currentRecipeId) {
      var recipes = Recipes.getRecipes();
      var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
      if (r && r.ingredients.some(function (ri) { return ri.ingredientId === ingId; })) recalcCurrentRecipe();
    }
  };

  function openNewRecipeModal() {
    openNewRecipeModalWithProject(null);
  }

  function openNewRecipeModalForProject() {
    window.cameFromProjectForNewRecipe = true;
    var slug = window.currentProjectSlug || "";
    openNewRecipeModalWithProject(slug);
  }

  function openNewRecipeModalWithProject(projectSlug) {
    document.getElementById("new-rec-name").value = "";
    document.getElementById("new-rec-desc").value = "";
    document.getElementById("new-rec-type").value = "food";
    var recTypeEl = document.getElementById("new-rec-recipe-type");
    if (recTypeEl) recTypeEl.value = "finishedProduct";
    document.getElementById("new-rec-serving").value = 100;
    var recApproved = document.getElementById("new-rec-approved");
    if (recApproved) recApproved.checked = false;
    var recCode = document.getElementById("new-rec-code");
    if (recCode) recCode.value = "";
    populateProjectSelects();
    var projectSel = document.getElementById("new-rec-project");
    if (projectSel) projectSel.value = projectSlug || "";
    openModal("modal-recipe");
  }

  function saveRecipe() {
    var name = document.getElementById("new-rec-name").value.trim();
    if (!name) { showToast("Please enter recipe name"); return; }
    var recipes = Recipes.getRecipes();
    var normName = name.toLowerCase().trim();
    var existingSameName = recipes.find(function (r) { return (r.name || "").toLowerCase().trim() === normName; });
    if (existingSameName) {
      if (!confirm("A recipe named \"" + name + "\" already exists. Create anyway? (This may create a duplicate.)")) return;
    }
    var recipe = {
      id: Data.genId(),
      name: name,
      code: (document.getElementById("new-rec-code") && document.getElementById("new-rec-code").value.trim()) || "",
      desc: document.getElementById("new-rec-desc").value,
      type: document.getElementById("new-rec-type").value,
      recipeType: (document.getElementById("new-rec-recipe-type") && document.getElementById("new-rec-recipe-type").value) || "finishedProduct",
      serving: parseFloat(document.getElementById("new-rec-serving").value) || 100,
      uom: "G",
      ingredients: [],
      approved: document.getElementById("new-rec-approved") ? document.getElementById("new-rec-approved").checked : false,
      descriptionTags: [],
      created: new Date().toISOString()
    };
    var projectSel = document.getElementById("new-rec-project");
    if (projectSel && projectSel.value) setRecipeProjectInTags(recipe, projectSel.value.trim());
    Recipes.saveRecipe(recipe);
    renderAll();
    closeModal("modal-recipe");
    var fromView = window.cameFromProjectForNewRecipe ? "project-recipes" : "recipes";
    if (window.cameFromProjectForNewRecipe) window.cameFromProjectForNewRecipe = false;
    openRecipe(recipe.id, fromView);
    showToast("Recipe created");
  }

  /** Open recipe and immediately open the Edit name & code modal (like Edit in Ingredient Centre). */
  function openRecipeForEdit(id, fromView) {
    openRecipe(id, fromView);
    setTimeout(function () { openEditRecipeNameModal(); }, 0);
  }

  /** Scrap % editor in the Recipe Ingredients table — shown only for lines that are
   * single-ingredient sub-recipes. Stored internally as yieldPct (100 - scrap) since that's
   * what the cost formula uses; scrap is just how this team reads/enters the value. */
  /** Sets the scrap on a single-ingredient recipe's one and only line (used by the compact
   * Ingredient Centre modal, where "this recipe's own scrap" and "its one line's scrap" are
   * the same thing — there's nothing else it could mean with exactly one ingredient). */
  function updateSubRecipeScrapPct(recipeId, val) {
    var recipes = Recipes.getRecipes();
    var rec = recipes.find(function (r) { return r.id === recipeId; });
    if (!rec || !rec.ingredients || !rec.ingredients[0]) return;
    var scrapPct = parseFloat(val);
    if (isNaN(scrapPct) || scrapPct < 0) scrapPct = 0;
    if (scrapPct > 99) scrapPct = 99;
    rec.ingredients[0].scrapPct = scrapPct;
    Recipes.setRecipes(recipes);
    renderAll();
    renderRecipeIngredients();
    recalcCurrentRecipe();
  }

  /** Sets the scrap on one line within the CURRENTLY OPEN recipe — key is "ing:<id>" or
   * "sub:<id>" identifying which line. Scrap is per (recipe, line): the same ingredient can
   * scrap differently in different recipes, so this never touches any other recipe's data. */
  function updateRecipeLineScrapPct(key, val) {
    if (!currentRecipeId) return;
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r || !r.ingredients) return;
    var isSub = key.indexOf("sub:") === 0;
    var id = key.slice(4);
    var ri = r.ingredients.find(function (line) { return isSub ? line.subRecipeId === id : line.ingredientId === id; });
    if (!ri) return;
    var scrapPct = parseFloat(val);
    if (isNaN(scrapPct) || scrapPct < 0) scrapPct = 0;
    if (scrapPct > 99) scrapPct = 99;
    snapshotRecipeForUndo(r);
    ri.scrapPct = scrapPct;
    Recipes.setRecipes(recipes);
    renderAll();
    renderRecipeIngredients();
    recalcCurrentRecipe();
  }

  // Tracks recipe-detail navigation history specifically, since drilling from one recipe into
  // a sub-recipe stays on the same "recipe-detail" view (switchView's own history stack only
  // tracks distinct view NAMES, so it can't tell recipe A and recipe B apart) — without this,
  // Back from a sub-recipe always fell through to a hardcoded "recipes" list default instead
  // of returning to whichever recipe/page the user actually came from.
  var recipeNavStack = [];

  function openRecipe(id, fromView, isBack) {
    // Navigating straight from one recipe to another (e.g. drilling into a sub-recipe) never
    // goes through switchView — it's the same "recipe-detail" view the whole time — so the
    // unsaved-changes guard has to live here too, not just in switchView.
    if (currentRecipeId && currentRecipeId !== id && typeof Recipes.hasUnsavedChanges === "function" && Recipes.hasUnsavedChanges()) {
      recipeLeavePendingAction = function () { openRecipe(id, fromView, isBack); };
      openModal("modal-recipe-leave");
      return;
    }
    if (!isBack) {
      var prevViewEl = document.querySelector(".view.active");
      var prevViewName = prevViewEl && prevViewEl.id ? prevViewEl.id.replace("view-", "") : "";
      if (prevViewName === "recipe-detail" && currentRecipeId && currentRecipeId !== id) {
        recipeNavStack.push({ type: "recipe", id: currentRecipeId });
      } else if (prevViewName !== "recipe-detail") {
        recipeNavStack.push({ type: "view", name: fromView || prevViewName || "recipes" });
      }
    }
    window.recipeDetailBackView = fromView || "recipes";
    if (currentRecipeId !== id) { recipeUndoStack = []; updateRecipeUndoButton(); }
    currentRecipeId = id;
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === id; });
    if (!r) return;
    document.getElementById("recipe-detail-title").textContent = r.name;
    var codeEl = document.getElementById("recipe-detail-code");
    if (codeEl) {
      codeEl.textContent = (r.code && r.code.trim()) ? "Code: " + r.code : "";
      codeEl.style.display = (r.code && r.code.trim()) ? "" : "none";
    }
    var tagsEl = document.getElementById("recipe-detail-tags");
    if (tagsEl) {
      var tags = (r.descriptionTags || []);
      tagsEl.textContent = tags.length ? "Tags: " + tags.join(", ") : "";
      tagsEl.style.display = tags.length ? "" : "none";
    }
    document.getElementById("recipe-detail-desc").textContent = r.desc || "";
    document.getElementById("serving-size-input").value = r.serving || 100;
    var methodKitchenText = document.getElementById("recipe-method-kitchen-text");
    var methodFactoryText = document.getElementById("recipe-method-factory-text");
    if (methodKitchenText) methodKitchenText.value = r.methodKitchen != null ? r.methodKitchen : (r.method || "");
    if (methodFactoryText) methodFactoryText.value = r.methodFactory || "";
    switchMethodSource(window._currentMethodSource || "kitchen");
    var badge = document.getElementById("recipe-detail-status-badge");
    var toggleBtn = document.getElementById("recipe-detail-toggle-approved");
    if (badge) {
      badge.textContent = r.approved ? "Approved" : "In development";
      badge.className = "badge badge-status " + (r.approved ? "badge-approved" : "badge-development");
    }
    if (toggleBtn) {
      toggleBtn.textContent = r.approved ? "Mark as in development" : "Mark as approved";
      toggleBtn.style.display = "";
    }
    // Approved recipes are locked: the Edit modal (name/code/type/UOM/weight) must not be
    // reachable until someone explicitly unlocks the recipe via toggleRecipeApproved().
    var editBtn = document.getElementById("recipe-detail-edit-btn");
    if (editBtn) editBtn.style.display = r.approved ? "none" : "";
    var kindBadge = document.getElementById("recipe-detail-kind-badge");
    if (kindBadge) {
      var isSub = (r.recipeType || "finishedProduct") === "subRecipe";
      kindBadge.textContent = isSub ? "Sub recipe" : "Finished product";
      kindBadge.className = "badge " + (isSub ? "badge-subrecipe" : "badge-finishedproduct");
    }
    switchView("recipe-detail");
    switchRecipeTab("ingredients");
    renderRecipeIngredients();
    renderRecipePhotos();
    recalcCurrentRecipe();
    var vhList = document.getElementById("recipe-version-history-list");
    var vhSummary = document.getElementById("recipe-version-history-summary");
    if (vhList) {
      var vh = (r.versionHistory || []).slice().reverse();
      if (r.created && vh.indexOf(r.created) === -1) vh.push(r.created);
      if (vh.length === 0) {
        vhList.innerHTML = "<p style=\"margin:0;color:var(--nc-gray-500);font-size:13px\">No version history recorded.</p>";
        if (vhSummary) vhSummary.textContent = "Version History";
      } else {
        var latest = new Date(vh[0]).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        if (vhSummary) vhSummary.textContent = "Version History — Last edited: " + latest;
        vhList.innerHTML = vh.map(function (ts) { var d = new Date(ts); return "<div style=\"padding:6px 0;border-bottom:1px solid var(--nc-gray-100)\">" + d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + "</div>"; }).join("");
      }
    }
    var wuList = document.getElementById("recipe-where-used-list");
    var wuSummary = document.getElementById("recipe-where-used-summary");
    if (wuList && wuSummary) {
      var usedIn = recipes.filter(function (rec) {
        if (rec.id === id) return false;
        return (rec.ingredients || []).some(function (ri) { return ri.subRecipeId === id; });
      });
      wuSummary.textContent = usedIn.length === 0 ? "Where used" : "Where used — " + usedIn.length + " recipe" + (usedIn.length !== 1 ? "s" : "");
      if (usedIn.length === 0) {
        var isFinishedProduct = (r.recipeType || "finishedProduct") === "finishedProduct";
        wuList.innerHTML = isFinishedProduct
          ? "<p style=\"margin:0;color:var(--nc-gray-500);font-size:13px\">Finished product — not used in other recipes (final product in the hierarchy).</p>"
          : "<p style=\"margin:0;color:var(--nc-gray-500);font-size:13px\">Not used as a sub recipe in any other recipe yet.</p>";
      } else {
        wuList.innerHTML = usedIn.map(function (rec) {
          var status = rec.approved ? "<span class=\"badge badge-approved\" style=\"font-size:9px;margin-left:8px\">Approved</span>" : "<span class=\"badge badge-development\" style=\"font-size:9px;margin-left:8px\">In development</span>";
          var kind = (rec.recipeType || "finishedProduct") === "subRecipe" ? "Sub recipe" : "Finished";
          var code = (rec.code && rec.code.trim()) ? "<span style=\"font-family:var(--nc-mono);font-size:12px;color:var(--nc-gray-500);margin-right:8px\">[" + rec.code + "]</span>" : "";
          return "<div class=\"card row-clickable\" style=\"padding:12px;cursor:pointer\" onclick=\"openRecipe('" + rec.id.replace(/'/g, "\\'") + "')\">" +
            "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px\">" +
            "<div style=\"min-width:0\"><div style=\"font-weight:700;color:var(--nc-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">" + code + rec.name + status + "</div>" +
            "<div style=\"font-size:12px;color:var(--nc-gray-500)\">" + (rec.ingredients || []).length + " ingredient(s) · " + kind + " · " + rec.type + "</div></div>" +
            "<span style=\"font-size:12px;color:var(--nc-gray-400)\">Open →</span></div></div>";
        }).join("");
      }
    }
    // Ingredient edits on this recipe now hold in memory instead of autosaving (see
    // recipes.js setHoldSave) — snapshot its current state so "Leave without saving" has
    // something exact to revert to, and reset the dirty flag for this fresh open.
    recipeSnapshotAtOpen = JSON.parse(JSON.stringify(r));
    Recipes.setHoldSave(true);
    updateRecipeSaveButton();
  }

  function toggleRecipeApproved() {
    if (!currentRecipeId) return;
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    // Approved recipes are locked for editing (see renderRecipeIngredients). Moving one back
    // to "in development" reopens it to editing, so confirm first rather than silently
    // unlocking an approved recipe from a stray click.
    if (r.approved) {
      if (!confirm("This recipe is approved and currently locked. Mark it as in development so it can be edited again?")) return;
    }
    r.approved = !r.approved;
    Recipes.saveRecipe(r);
    showToast(r.approved ? "Recipe marked as approved" : "Recipe marked as in development — now editable");
    openRecipe(currentRecipeId);
    renderAll();
  }

  function openEditRecipeNameModal() {
    if (!currentRecipeId) return;
    var recipes = Recipes.getRecipes();
    var ingredients = Ingredients.getIngredients();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    if (r.approved) { showToast("This recipe is approved and locked. Mark it as in development to edit it."); return; }
    document.getElementById("edit-rec-name").value = r.name || "";
    document.getElementById("edit-rec-code").value = r.code || "";
    var editTagsEl = document.getElementById("edit-rec-description-tags");
    if (editTagsEl) editTagsEl.value = (r.descriptionTags || []).filter(function (t) {
      var v = String(t || "").trim();
      return v.toLowerCase().indexOf("project:") !== 0;
    }).join(", ");
    populateProjectSelects();
    var editProjectEl = document.getElementById("edit-rec-project");
    if (editProjectEl) editProjectEl.value = getRecipeProjectSlug(r) || "";
    var editRecipeTypeEl = document.getElementById("edit-rec-recipe-type");
    if (editRecipeTypeEl) editRecipeTypeEl.value = r.recipeType || "finishedProduct";
    var totalCostEl = document.getElementById("edit-rec-total-cost");
    var totalCostPerEl = document.getElementById("edit-rec-total-cost-per");
    if (totalCostEl) {
      var totalCost = getRecipeTotalCost(r, ingredients, recipes);
      totalCostEl.textContent = "£" + totalCost.toFixed(2);
      if (totalCostPerEl) totalCostPerEl.textContent = "(from ingredients)";
    }
    var editUomEl = document.getElementById("edit-rec-cost-uom");
    if (editUomEl) editUomEl.value = (r.costUOM || r.uom || "") && (Data.UOM_OPTIONS || ["G", "KG", "L", "ML", "M", "EACH"]).indexOf(r.costUOM || r.uom) >= 0 ? (r.costUOM || r.uom) : "G";
    var editUnitWeightEl = document.getElementById("edit-rec-unit-weight");
    if (editUnitWeightEl) {
      if (r.unitWeightG != null && r.unitWeightG > 0) {
        editUnitWeightEl.value = r.unitWeightG;
        editUnitWeightEl.placeholder = "unknown";
      } else {
        // No manual override set — leave the field itself blank (so saving as-is keeps this
        // live-derived rather than freezing a snapshot), but show the current tally as the
        // placeholder so it's visible what it would default to.
        editUnitWeightEl.value = "";
        var tallyG = (r.ingredients || []).reduce(function (s, ri) { return s + recipeLineWeightForTotal(ri); }, 0);
        editUnitWeightEl.placeholder = tallyG > 0 ? Data.round(tallyG) + " (from ingredients)" : "unknown";
      }
    }
    openModal("modal-recipe-edit-name");
  }

  // ─── Nested dropdown pattern (dropdown off another dropdown) ─────────────────
  // Rules for any submenu that opens from a row in a parent dropdown:
  // • Submenu stays open ONLY when: mouse is on the trigger row OR inside the submenu.
  // • Submenu closes when: mouse moves to another row in the parent, or leaves the submenu, or user clicks outside.
  // Implementation: trigger row = onmouseenter → open submenu; other parent rows = onmouseenter → close submenu; submenu = onmouseleave → close submenu; parent close (e.g. click outside) → close submenu too.

  function closeAllExportSubmenus() {
    var s1 = document.getElementById("recipe-export-all-data-submenu");
    var s2 = document.getElementById("recipe-export-option1-submenu");
    var s3 = document.getElementById("recipe-export-option2-submenu");
    if (s1) s1.style.display = "none";
    if (s2) s2.style.display = "none";
    if (s3) s3.style.display = "none";
  }

  function toggleExportDropdown(ev) {
    if (!ev) return;
    ev.stopPropagation();
    var panel = document.getElementById("recipe-export-dropdown");
    if (!panel) return;
    var isOpen = panel.style.display === "block";
    panel.style.display = isOpen ? "none" : "block";
    closeAllExportSubmenus();
    if (!isOpen) {
      setTimeout(function () {
        document.addEventListener("click", function closeOnClick() {
          document.removeEventListener("click", closeOnClick);
          if (panel) panel.style.display = "none";
          closeAllExportSubmenus();
        });
      }, 0);
    }
  }

  function closeExportDropdown() {
    var panel = document.getElementById("recipe-export-dropdown");
    if (panel) panel.style.display = "none";
    closeAllExportSubmenus();
  }

  function openAllDataSubmenu(ev) {
    var panel = document.getElementById("recipe-export-dropdown");
    var btn = document.getElementById("export-all-data-btn");
    var sub = document.getElementById("recipe-export-all-data-submenu");
    if (!panel || !sub) return;
    closeAllExportSubmenus();
    sub.style.top = (panel.offsetTop + (btn ? btn.offsetTop : 0)) + "px";
    sub.style.left = panel.offsetWidth + "px";
    sub.style.display = "block";
  }

  function closeAllDataSubmenu() {
    var sub = document.getElementById("recipe-export-all-data-submenu");
    if (sub) sub.style.display = "none";
  }

  function openOption1Submenu(ev) {
    var panel = document.getElementById("recipe-export-dropdown");
    var btn = document.getElementById("export-option1-btn");
    var sub = document.getElementById("recipe-export-option1-submenu");
    if (!panel || !sub) return;
    closeAllExportSubmenus();
    sub.style.top = (panel.offsetTop + (btn ? btn.offsetTop : 0)) + "px";
    sub.style.left = panel.offsetWidth + "px";
    sub.style.display = "block";
  }

  function closeOption1Submenu() {
    var sub = document.getElementById("recipe-export-option1-submenu");
    if (sub) sub.style.display = "none";
  }

  function openOption2Submenu(ev) {
    var panel = document.getElementById("recipe-export-dropdown");
    var btn = document.getElementById("export-option2-btn");
    var sub = document.getElementById("recipe-export-option2-submenu");
    if (!panel || !sub) return;
    closeAllExportSubmenus();
    sub.style.top = (panel.offsetTop + (btn ? btn.offsetTop : 0)) + "px";
    sub.style.left = panel.offsetWidth + "px";
    sub.style.display = "block";
  }

  function closeOption2Submenu() {
    var sub = document.getElementById("recipe-export-option2-submenu");
    if (sub) sub.style.display = "none";
  }

  function findBCFormTemplate() {
    var saves = getExcelSaves();
    var name = "BC Form";
    for (var i = 0; i < saves.length; i++) {
      var s = saves[i];
      var n = (s.name || s.fileName || "").trim();
      if (n.toLowerCase() === name.toLowerCase()) return s;
    }
    return null;
  }

  function buildRecipeContext(r, ingredients, recipes) {
    if (!r) return {};
    var ingredientsLib = ingredients || (typeof Ingredients !== "undefined" && Ingredients.getIngredients ? Ingredients.getIngredients() : []);
    var recipesLib = recipes || (typeof Recipes !== "undefined" && Recipes.getRecipes ? Recipes.getRecipes() : []);
    var totalCost = typeof getRecipeTotalCost === "function" ? getRecipeTotalCost(r, ingredientsLib, recipesLib) : 0;
    var totalWeight = (r.ingredients || []).reduce(function (s, ri) {
      return s + (typeof recipeLineWeightForTotal === "function" ? recipeLineWeightForTotal(ri) : 0);
    }, 0);
    var recipeUom = recipeOwnUom(r, ingredientsLib);
    var totalDisplay = (recipeUom === "EACH") ? "1 EACH" : (typeof Data !== "undefined" && Data.round ? Data.round(totalWeight) + "g" : totalWeight + "g");
    return {
      code: r.code != null ? String(r.code) : "",
      name: r.name != null ? String(r.name) : "",
      description: (r.description || "").trim(),
      type: r.recipeType || r.type || "",
      totalCost: typeof totalCost === "number" ? totalCost.toFixed(2) : String(totalCost),
      totalWeight: String(totalWeight),
      totalWeightDisplay: totalDisplay,
      uom: recipeUom,
      serving: r.serving != null ? String(r.serving) : "100",
      approved: r.approved ? "Yes" : "No"
    };
  }

  function replacePlaceholdersInString(str, context) {
    if (typeof str !== "string") return str;
    return str.replace(/\{\{recipe\.(\w+)\}\}/g, function (match, key) {
      return context[key] != null ? String(context[key]) : match;
    });
  }

  function escapeXml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function replacePlaceholdersInXml(str, context) {
    if (typeof str !== "string") return str;
    return str.replace(/\{\{recipe\.(\w+)\}\}/g, function (match, key) {
      return context[key] != null ? escapeXml(String(context[key])) : match;
    });
  }

  function fillWorkbookPlaceholders(wb, context) {
    if (!wb || !wb.Sheets) return;
    var sheetNames = wb.SheetNames || Object.keys(wb.Sheets);
    for (var s = 0; s < sheetNames.length; s++) {
      var sheet = wb.Sheets[sheetNames[s]];
      if (!sheet) continue;
      for (var key in sheet) {
        if (key.charAt(0) === "!") continue;
        var cell = sheet[key];
        if (!cell) continue;
        if (typeof cell.v === "string") {
          cell.v = replacePlaceholdersInString(cell.v, context);
        }
        if (typeof cell.w === "string") {
          cell.w = replacePlaceholdersInString(cell.w, context);
        }
      }
    }
  }

  function exportRecipeToBCFormExcel() {
    if (!currentRecipeId) {
      if (typeof showToast === "function") showToast("Open a recipe first.");
      return;
    }
    var recipes = (typeof Recipes !== "undefined" && Recipes.getRecipes) ? Recipes.getRecipes() : [];
    var ingredients = (typeof Ingredients !== "undefined" && Ingredients.getIngredients) ? Ingredients.getIngredients() : [];
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) {
      if (typeof showToast === "function") showToast("Recipe not found.");
      return;
    }
    if (typeof JSZip === "undefined") {
      if (typeof showToast === "function") showToast("Export not available (JSZip required).");
      return;
    }
    // Replace only {{recipe.xxx}} in XML; rest of file unchanged so hidden rows, colours, fonts, borders, merges, etc. are preserved.
    function doExportWithData(base64Data) {
      if (!base64Data) {
        if (typeof showToast === "function") showToast("No Excel template named \"BC Form\" in Export Templates. Add one first.");
        return;
      }
      var safeName = (r.name || "Recipe").replace(/[^a-zA-Z0-9\-_\s]/g, "").trim().slice(0, 50) || "Recipe";
      var filename = safeName + "_BC_Form.xlsx";
      var context = buildRecipeContext(r, ingredients, recipes);
      // Load from base64 directly so the zip isn't corrupted by manual atob/binary conversion.
      JSZip.loadAsync(base64Data, { base64: true }).then(function (zip) {
        var promises = [];
        zip.forEach(function (relativePath, file) {
          if (!/\.(xml|rels)$/i.test(relativePath)) return;
          promises.push(file.async("string").then(function (text) {
            var newText = replacePlaceholdersInXml(text, context);
            if (newText !== text) zip.file(relativePath, newText);
          }).catch(function () { /* skip */ }));
        });
        return Promise.all(promises).then(function () { return zip; });
      }).then(function (zip) {
        return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        if (typeof showToast === "function") showToast("Exported to " + filename);
      }).catch(function (err) {
        if (typeof showToast === "function") showToast("Export failed: " + (err.message || err));
      });
    }
    function doExport() {
      var template = findBCFormTemplate();
      if (!template) {
        if (typeof showToast === "function") showToast("No Excel template named \"BC Form\" in Export Templates. Add one first.");
        return;
      }
      if (template.fromApi && !template.data) {
        exportTemplatesApiFetch("/" + encodeURIComponent(template.id)).then(function (t) {
          doExportWithData(t && t.data ? t.data : null);
        }).catch(function () {
          if (typeof showToast === "function") showToast("Could not load BC Form template.");
        });
        return;
      }
      doExportWithData(template.data);
    }
    if (typeof loadExcelSavesIntoCache === "function") {
      loadExcelSavesIntoCache(doExport);
    } else {
      doExport();
    }
  }

  function toggleSettingsDropdown(ev) {
    if (!ev) return;
    ev.stopPropagation();
    var panel = document.getElementById("topbar-settings-dropdown");
    if (!panel) return;
    var isOpen = panel.classList.contains("open");
    panel.classList.toggle("open", !isOpen);
    if (!isOpen) {
      setTimeout(function () {
        document.addEventListener("click", function closeOnClick() {
          document.removeEventListener("click", closeOnClick);
          if (panel) panel.classList.remove("open");
        });
      }, 0);
    }
  }
  function closeSettingsDropdown() {
    var panel = document.getElementById("topbar-settings-dropdown");
    if (panel) panel.classList.remove("open");
  }

  function switchMethodSource(source) {
    window._currentMethodSource = source;
    var kitchenBtn = document.getElementById("method-source-kitchen");
    var factoryBtn = document.getElementById("method-source-factory");
    var kitchenWrap = document.getElementById("method-kitchen-wrap");
    var factoryWrap = document.getElementById("method-factory-wrap");
    if (kitchenBtn) kitchenBtn.classList.toggle("active", source === "kitchen");
    if (factoryBtn) factoryBtn.classList.toggle("active", source === "factory");
    if (kitchenWrap) kitchenWrap.style.display = source === "kitchen" ? "block" : "none";
    if (factoryWrap) factoryWrap.style.display = source === "factory" ? "block" : "none";
  }

  function saveRecipeMethodField() {
    if (!currentRecipeId) return;
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    var methodKitchenText = document.getElementById("recipe-method-kitchen-text");
    var methodFactoryText = document.getElementById("recipe-method-factory-text");
    r.methodKitchen = methodKitchenText ? methodKitchenText.value.trim() : "";
    r.methodFactory = methodFactoryText ? methodFactoryText.value.trim() : "";
    r.method = r.methodKitchen || r.methodFactory || "";
    Recipes.saveRecipe(r);
  }

  /** Mirrors ingredientDataDiffers — used only to decide whether to show the version-change
   * prompt at all (client-side heuristic; never blocks a save). */
  function recipeDataDiffers(data, r) {
    var strKeys = ["name", "code", "recipeType", "costUOM", "uom"];
    for (var i = 0; i < strKeys.length; i++) {
      if ((data[strKeys[i]] || "").toString() !== (r[strKeys[i]] || "").toString()) return true;
    }
    if ((parseFloat(data.unitWeightG) || 0) !== (parseFloat(r.unitWeightG) || 0)) return true;
    if (JSON.stringify((data.descriptionTags || []).slice().sort()) !== JSON.stringify((r.descriptionTags || []).slice().sort())) return true;
    return false;
  }

  function saveEditRecipeName() {
    if (!currentRecipeId) return;
    var name = (document.getElementById("edit-rec-name").value || "").trim();
    if (!name) { showToast("Recipe name is required"); return; }
    var code = (document.getElementById("edit-rec-code").value || "").trim();
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    if (r.approved) { showToast("This recipe is approved and locked. Mark it as in development to edit it."); closeModal("modal-recipe-edit-name"); return; }
    var editUomEl = document.getElementById("edit-rec-cost-uom");
    var editUnitWeightEl = document.getElementById("edit-rec-unit-weight");
    var uwVal = editUnitWeightEl ? parseFloat(editUnitWeightEl.value) : NaN;
    var data = {
      name: name,
      code: code,
      descriptionTags: parseDescriptionTags(document.getElementById("edit-rec-description-tags")),
      recipeType: (document.getElementById("edit-rec-recipe-type") || {}).value || r.recipeType || "finishedProduct",
      costUOM: (editUomEl && editUomEl.value) ? editUomEl.value : (r.costUOM || r.uom),
      uom: (editUomEl && editUomEl.value) ? editUomEl.value : r.uom,
      unitWeightG: (!isNaN(uwVal) && uwVal > 0) ? uwVal : 0
    };
    if (recipeDataDiffers(data, r)) {
      var nextVersion = ((r.versionHistory || []).length) + 1;
      var comment = window.prompt("This change will be saved as version " + nextVersion + ". Describe what changed (optional) — or click Cancel to discard this change and keep editing.", "");
      if (comment === null) return; // Cancel — abort the save entirely, don't touch the recipe.
      var history = (r.versionHistory || []).slice();
      history.push(new Date().toISOString() + (comment.trim() ? " — " + comment.trim() : ""));
      r.versionHistory = history;
    }
    r.name = data.name;
    r.code = data.code;
    r.descriptionTags = data.descriptionTags;
    var editProjectEl = document.getElementById("edit-rec-project");
    if (editProjectEl) setRecipeProjectInTags(r, editProjectEl.value.trim());
    r.recipeType = data.recipeType;
    r.costUOM = data.costUOM;
    r.uom = data.uom;
    r.unitWeightG = data.unitWeightG;
    Recipes.saveRecipe(r);
    closeModal("modal-recipe-edit-name");
    openRecipe(currentRecipeId);
    renderAll();
    showToast("Name and code updated");
  }

  function deleteCurrentRecipe() {
    if (!confirm("Delete this recipe?")) return;
    Recipes.deleteRecipe(currentRecipeId);
    renderAll();
    switchView("recipes");
    showToast("Recipe deleted");
  }

  function openDuplicateRecipeModal() {
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    populateProjectSelects();
    var nameEl = document.getElementById("duplicate-rec-name");
    var projectEl = document.getElementById("duplicate-rec-project");
    if (nameEl) nameEl.value = r.name + " (Copy)";
    if (projectEl) projectEl.value = getRecipeProjectSlug(r) || "";
    openModal("modal-duplicate-recipe");
  }

  function confirmDuplicateRecipe() {
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    var nameEl = document.getElementById("duplicate-rec-name");
    var projectEl = document.getElementById("duplicate-rec-project");
    var name = (nameEl && nameEl.value.trim()) || (r.name + " (Copy)");
    var dup = JSON.parse(JSON.stringify(r));
    dup.id = Data.genId();
    dup.name = name;
    dup.code = "NEW";
    dup.approved = false;
    // A "NEW"-coded duplicate was never itself costed by Business Central — it only inherited
    // the original's ownCost via the deep clone above. Carrying that figure forward would let
    // it silently override live-calculated costs wherever it's used as a sub-recipe, even after
    // its ingredients are edited (see getSubRecipeCostPerUom/getSubRecipeTotalCost's ownCost
    // shortcut). Clearing it here makes a duplicate behave like any other in-development recipe
    // with no BC-imported cost yet: always live-tallied from its own lines until it's actually
    // re-approved through a fresh BOM import.
    dup.ownCost = 0;
    dup.sheetCost = 0;
    dup.recipeType = r.recipeType || "finishedProduct";
    dup.created = new Date().toISOString();
    dup.method = r.method || "";
    dup.methodKitchen = r.methodKitchen || "";
    dup.methodFactory = r.methodFactory || "";
    setRecipeProjectInTags(dup, projectEl ? projectEl.value : "");
    Recipes.saveRecipe(dup);
    closeModal("modal-duplicate-recipe");
    renderAll();
    openRecipe(dup.id);
    showToast("Recipe duplicated");
  }

  function filterRecipes() {
    var q = (document.getElementById("recipe-search").value || "").toLowerCase();
    var body = document.getElementById("recipes-body");
    if (body) body.querySelectorAll("tr").forEach(function (row) {
      var show = !q || searchTextMatches(row.textContent, q);
      row.style.display = show ? "" : "none";
    });
  }

  function applyRecipeSearch() {
    searchRecipeLibrary();
    var dd = document.getElementById("recipe-library-dropdown");
    if (dd) dd.classList.remove("open");
    var inp = document.getElementById("recipe-search");
    if (inp) inp.blur();
  }

  function searchRecipeLibrary() {
    var q = (document.getElementById("recipe-search").value || "").toLowerCase();
    var dd = document.getElementById("recipe-library-dropdown");
    if (!dd) return;
    filterRecipes();
    var recipes = Recipes.getRecipes();
    var ingredients = Ingredients.getIngredients();
    var filterVal = (document.getElementById("recipe-filter") && document.getElementById("recipe-filter").value) || "all";
    var typeFilterVal = (document.getElementById("recipe-type-filter") && document.getElementById("recipe-type-filter").value) || "all";
    var filtered = recipes;
    if (filterVal === "approved") filtered = filtered.filter(function (r) { return !!r.approved; });
    if (filterVal === "development") filtered = filtered.filter(function (r) { return !r.approved; });
    if (typeFilterVal === "finishedProduct") filtered = filtered.filter(function (r) { return (r.recipeType || "finishedProduct") === "finishedProduct"; });
    if (typeFilterVal === "subRecipe") filtered = filtered.filter(function (r) { return (r.recipeType || "finishedProduct") === "subRecipe"; });
    if (!includeDelistedRecipes()) filtered = filtered.filter(function (r) { return !isDelisted(r.name); });
    filtered = filtered.filter(function (r) { return !isSingleIngredientRecipe(r); });
    if (!q) { dd.classList.remove("open"); dd.innerHTML = ""; return; }
    function recipeScore(r) {
      var nameR = searchWordsMatch(r.name, q);
      var codeR = searchWordsMatch(r.code, q);
      var tagsR = searchWordsMatch((r.descriptionTags || []).join(" "), q);
      return [nameR, codeR, tagsR].reduce(function (a, b) { return a.score >= b.score ? a : b; }, { match: false, score: 0 });
    }
    var matches = filtered.filter(function (r) { return recipeScore(r).match; }).sort(function (a, b) { return recipeScore(b).score - recipeScore(a).score; }).slice(0, 10);
    if (matches.length === 0) {
      dd.innerHTML = "<div style=\"padding:10px;color:var(--nc-gray-400);font-size:13px\">No matches</div>";
      dd.classList.add("open");
      return;
    }
    dd.innerHTML = matches.map(function (r) {
      var nut = Recipes.calcRecipeNutrition(r, ingredients);
      var hfss = HFSS.calcHFSS(r, ingredients);
      var codePart = (r.code && r.code.trim()) ? "<span style=\"font-size:11px;color:var(--nc-gray-500);font-family:var(--nc-mono);margin-right:8px\">[" + r.code + "]</span>" : "";
      var tagsPart = (r.descriptionTags || []).length ? "<span style=\"font-size:11px;color:var(--nc-gray-500);margin-left:6px\">" + (r.descriptionTags || []).join(", ") + "</span>" : "";
      var statusBadge = r.approved
        ? "<span class=\"badge badge-approved\" style=\"font-size:9px;margin-left:6px\">Approved</span>"
        : "<span class=\"badge badge-development\" style=\"font-size:9px;margin-left:6px\">In development</span>";
      var onclick = "openRecipe('" + r.id.replace(/'/g, "\\'") + "'); document.getElementById('recipe-library-dropdown').classList.remove('open');";
      return "<div class=\"ingredient-dropdown-item\" onclick=\"" + onclick + "\">" + codePart + "<span>" + r.name + "</span>" + tagsPart + "<span class=\"cat\">" + r.type + " · " + Data.round(nut.kcal) + " kcal/100g</span>" + statusBadge + "</div>";
    }).join("");
    dd.classList.add("open");
  }

  function setRecipeFilter(value) {
    renderRecipesList();
  }

  function recipeCardHtml(r, ingredients) {
    var nut = Recipes.calcRecipeNutrition(r, ingredients);
    var hfss = HFSS.calcHFSS(r, ingredients);
    var statusBadge = r.approved ? '<span class="badge badge-approved" style="font-size:10px;margin-right:6px">Approved</span>' : '<span class="badge badge-development" style="font-size:10px;margin-right:6px">In development</span>';
    var kindBadge = (r.recipeType || "finishedProduct") === "subRecipe"
      ? '<span class="badge badge-subrecipe" style="margin-right:6px">Sub recipe</span>'
      : '<span class="badge badge-finishedproduct" style="margin-right:6px">Finished product</span>';
    var codeChip = (r.code && r.code.trim())
      ? '<span style="font-size:11px;color:var(--nc-gray-500);font-family:var(--nc-mono);margin-right:8px">[' + r.code + "]</span>"
      : "";
    var tagsStr = (r.descriptionTags || []).join(" ");
    return '<div class="card recipe-card row-clickable" onclick="openRecipe(\'' + r.id + '\')" oncontextmenu="return handleRecipeContextMenu(event, \'' + r.id.replace(/'/g, "\\'") + '\')" style="cursor:pointer">' +
      '<div style="display:flex;justify-content:space-between;align-items:start">' +
      '<div><h3 style="font-size:15px;font-weight:600;color:var(--nc-secondary)">' + statusBadge + kindBadge + codeChip + r.name + versionBadge(r) + (tagsStr ? "<span style=\"display:none\"> " + tagsStr + "</span>" : "") + "</h3>" +
      "<p style=\"font-size:12px;color:var(--nc-gray-500);margin-top:2px\">" + r.ingredients.length + " ingredient(s) · " + r.type + " · " + Data.round(nut.kcal) + " kcal/100g</p></div>" +
      '<span class="badge ' + (hfss.isHFSS ? "badge-red" : "badge-green") + "\">" + (hfss.isHFSS ? "HFSS" : "Non-HFSS") + " (" + hfss.total + ")</span></div></div>";
  }

  function recipeRowHtml(r, ingredients, usedInCount, fromView) {
    fromView = fromView || "recipes";
    var nut = Recipes.calcRecipeNutrition(r, ingredients);
    var hfss = HFSS.calcHFSS(r, ingredients);
    var statusBadge = r.approved ? "<span class=\"badge badge-approved\" style=\"font-size:10px;margin-right:6px\">Approved</span>" : "<span class=\"badge badge-development\" style=\"font-size:10px;margin-right:6px\">In development</span>";
    var kindBadge = (r.recipeType || "finishedProduct") === "subRecipe"
      ? "<span class=\"badge badge-subrecipe\" style=\"font-size:10px;margin-right:6px\">Sub</span>"
      : "<span class=\"badge badge-finishedproduct\" style=\"font-size:10px;margin-right:6px\">Finished</span>";
    var tagsStr = (r.descriptionTags || []).join(" ");
    var usedInBadge = (usedInCount || 0) > 0 ? "<span style=\"font-size:10px;color:var(--nc-gray-500);margin-left:4px\" title=\"Used in " + usedInCount + " recipe(s)\">(" + usedInCount + " recipes)</span>" : "";
    var hfssBadge = "<span class=\"badge " + (hfss.isHFSS ? "badge-red" : "badge-green") + "\" style=\"font-size:10px\">" + (hfss.isHFSS ? "HFSS" : "Non-HFSS") + " (" + hfss.total + ")</span>";
    var safeId = r.id.replace(/'/g, "\\'");
    return "<tr class=\"row-clickable\" onclick=\"openRecipe('" + safeId + "','" + fromView + "')\" oncontextmenu=\"return handleRecipeContextMenu(event, '" + safeId + "')\" style=\"cursor:pointer\">" +
      "<td class=\"bold\">" + statusBadge + kindBadge + r.name + versionBadge(r) + usedInBadge + (tagsStr ? "<span style=\"display:none\"> " + tagsStr + "</span>" : "") + "</td>" +
      "<td style=\"font-size:12px;color:var(--nc-gray-600);font-family:var(--nc-mono)\">" + (r.code || "—") + "</td>" +
      "<td class=\"num recipe-centre-col-ing-count\">" + (r.ingredients ? r.ingredients.length : 0) + "</td>" +
      "<td class=\"num\">" + formatIngredientDisplayNum(nut.kj) + "</td>" +
      "<td class=\"num\">" + formatIngredientDisplayNum(nut.protein) + "</td>" +
      "<td class=\"num\">" + formatIngredientDisplayNum(nut.fat) + "</td>" +
      "<td class=\"num\">" + formatIngredientDisplayNum(nut.carb) + "</td>" +
      "<td class=\"num\">" + formatIngredientDisplayNum(nut.fibre) + "</td>" +
      "<td class=\"num\">" + formatIngredientDisplayNum(nut.salt) + "</td>" +
      "<td>" + hfssBadge + "</td>" +
      "<td onclick=\"event.stopPropagation()\"><button class=\"btn btn-sm\" onclick=\"openRecipeForEdit('" + safeId + "','" + fromView + "')\">Edit</button> <button class=\"btn btn-sm\" onclick=\"openRecipe('" + safeId + "','" + fromView + "')\">Open</button></td>" +
      "</tr>";
  }

  function renderRecipesList() {
    var recipes = Recipes.getRecipes();
    var ingredients = Ingredients.getIngredients();
    var usedInCount = {};
    recipes.forEach(function (rec) {
      (rec.ingredients || []).forEach(function (ri) {
        if (ri.subRecipeId) {
          usedInCount[ri.subRecipeId] = (usedInCount[ri.subRecipeId] || 0) + 1;
        }
      });
    });
    var filterVal = (document.getElementById("recipe-filter") && document.getElementById("recipe-filter").value) || "all";
    var typeFilterVal = (document.getElementById("recipe-type-filter") && document.getElementById("recipe-type-filter").value) || "all";
    var filtered = recipes;
    if (filterVal === "approved") filtered = filtered.filter(function (r) { return !!r.approved; });
    if (filterVal === "development") filtered = filtered.filter(function (r) { return !r.approved; });
    if (typeFilterVal === "finishedProduct") filtered = filtered.filter(function (r) { return (r.recipeType || "finishedProduct") === "finishedProduct"; });
    if (typeFilterVal === "subRecipe") filtered = filtered.filter(function (r) { return (r.recipeType || "finishedProduct") === "subRecipe"; });
    if (!includeDelistedRecipes()) filtered = filtered.filter(function (r) { return !isDelisted(r.name); });
    filtered = filtered.filter(function (r) { return !isSingleIngredientRecipe(r); });
    var body = document.getElementById("recipes-body");
    var emptyEl = document.getElementById("recipes-empty");
    var countLabel = document.getElementById("recipes-count-label");
    if (body) body.innerHTML = filtered.map(function (r) { return recipeRowHtml(r, ingredients, usedInCount[r.id] || 0); }).join("");
    if (countLabel) countLabel.textContent = filtered.length + " recipe" + (filtered.length !== 1 ? "s" : "");
    if (emptyEl) emptyEl.style.display = filtered.length === 0 ? "block" : "none";
    filterRecipes();
  }

  function openProjectRecipes(slug, label) {
    window.currentProjectSlug = slug || "";
    window.currentProjectLabel = label || "Project";
    switchView("project-recipes");
  }

  function renderProjectBreadcrumb() {
    var el = document.getElementById("projects-breadcrumb");
    if (!el) return;
    var chain = [];
    var cur = currentProjectFolderId;
    while (cur) {
      var f = getProjectFolderById(cur);
      if (!f) break;
      chain.unshift(f);
      cur = f.parentId;
    }
    el.innerHTML = "<span class=\"project-breadcrumb-link\" onclick=\"openProjectFolder(null)\">Projects</span>" +
      chain.map(function (f) { return " / <span class=\"project-breadcrumb-link\" onclick=\"openProjectFolder('" + f.id.replace(/'/g, "\\'") + "')\">" + escapeHtml(f.name) + "</span>"; }).join("");
  }

  function openProjectFolder(id) {
    currentProjectFolderId = id || null;
    renderProjectFolders();
  }
  window.openProjectFolder = openProjectFolder;

  var FOLDER_ICON = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 16 16\" fill=\"currentColor\" style=\"margin-right:6px;vertical-align:-2px\"><path d=\"M1.5 3A1.5 1.5 0 013 1.5h3.4a1.5 1.5 0 011.06.44l1 1H13A1.5 1.5 0 0114.5 4.44V12A1.5 1.5 0 0113 13.5H3A1.5 1.5 0 011.5 12V3z\"/></svg>";

  function renderProjectFolders() {
    var row = document.getElementById("projects-folders-row");
    if (!row) return;
    renderProjectBreadcrumb();
    var children = getProjectFolderChildren(currentProjectFolderId);
    row.innerHTML = children.map(function (f) {
      var idEsc = f.id.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      var labelEsc = (f.name || f.id).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      var labelAttr = (f.name || f.id).replace(/"/g, "&quot;");
      var clickAction = f.isLayer ? "openProjectFolder('" + idEsc + "')" : "openProjectRecipes('" + idEsc + "','" + labelEsc + "')";
      var menuBtn = f.locked ? "" :
        "<button type=\"button\" class=\"project-folder-menu-btn\" onclick=\"event.stopPropagation(); openProjectFolderDropdown(event, '" + idEsc + "', '" + labelEsc + "')\" title=\"Options\">" +
        "<svg width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><path d=\"M3 9.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM6.5 9.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM10 9.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z\"/></svg></button>";
      return "<div class=\"project-folder-box\" data-slug=\"" + f.id.replace(/"/g, "&quot;") + "\" data-label=\"" + labelAttr + "\">" +
        "<div class=\"project-folder-label\" onclick=\"" + clickAction + "\">" + (f.isLayer ? FOLDER_ICON : "") + escapeHtml(f.name || f.id) + "</div>" +
        menuBtn +
        "</div>";
    }).join("") +
      "<button type=\"button\" class=\"project-folder-add-box\" onclick=\"addProjectFolder()\" title=\"Add project folder\">" +
      "<svg width=\"32\" height=\"32\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><path d=\"M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z\"/></svg>" +
      "<span>Add folder</span></button>";
  }

  function addProjectFolder() {
    openModal("modal-new-project-folder");
  }
  window.addProjectFolder = addProjectFolder;

  async function newProjectFolderTypeChosen(isLayer) {
    closeModal("modal-new-project-folder");
    var name = prompt((isLayer ? "New layer folder name:" : "New recipe folder name:"), "");
    if (name == null || (name = (name || "").trim()) === "") return;
    try {
      var created = await projectFoldersApiFetch("", { method: "POST", body: JSON.stringify({ name: name, parentId: currentProjectFolderId, isLayer: isLayer }) });
      projectFoldersCache.push(created);
      renderProjectFolders();
      populateProjectSelects();
      if (typeof showToast === "function") showToast("Project folder added");
    } catch (e) {
      if (typeof showToast === "function") showToast((e && e.body) || "Couldn't add folder — try again");
    }
  }
  window.newProjectFolderTypeChosen = newProjectFolderTypeChosen;

  var projectFolderDropdownEl = null;
  function openProjectFolderDropdown(event, slug, label) {
    if (projectFolderDropdownEl) {
      projectFolderDropdownEl.remove();
      projectFolderDropdownEl = null;
    }
    var btn = event && event.target && event.target.closest ? event.target.closest("button") : null;
    if (!btn) return;
    var rect = btn.getBoundingClientRect();
    projectFolderDropdownEl = document.createElement("div");
    projectFolderDropdownEl.className = "project-folder-dropdown";
    projectFolderDropdownEl.dataset.slug = slug;
    projectFolderDropdownEl.innerHTML = "<div class=\"project-folder-dropdown-item\" onclick=\"renameProjectFolder('" + (slug || "").replace(/'/g, "\\'") + "')\">Rename</div>" +
      "<div class=\"project-folder-dropdown-item\" onclick=\"deleteProjectFolder('" + (slug || "").replace(/'/g, "\\'") + "')\">Delete</div>";
    projectFolderDropdownEl.style.position = "fixed";
    projectFolderDropdownEl.style.left = rect.right - 120 + "px";
    projectFolderDropdownEl.style.top = rect.bottom + 4 + "px";
    projectFolderDropdownEl.style.zIndex = "9999";
    document.body.appendChild(projectFolderDropdownEl);
    setTimeout(function () {
      document.addEventListener("click", closeProjectFolderDropdownOnClick);
    }, 0);
  }

  function closeProjectFolderDropdown() {
    if (projectFolderDropdownEl) {
      projectFolderDropdownEl.remove();
      projectFolderDropdownEl = null;
    }
    document.removeEventListener("click", closeProjectFolderDropdownOnClick);
  }

  function closeProjectFolderDropdownOnClick(e) {
    if (projectFolderDropdownEl && e && !projectFolderDropdownEl.contains(e.target) && !(e.target && e.target.closest && e.target.closest(".project-folder-menu-btn"))) {
      closeProjectFolderDropdown();
    }
  }

  async function renameProjectFolder(id) {
    closeProjectFolderDropdown();
    var f = getProjectFolderById(id);
    if (!f) return;
    var newName = prompt("Rename project folder:", f.name || f.id || "");
    if (newName == null || (newName = (newName || "").trim()) === "") return;
    try {
      await projectFoldersApiFetch("/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify({ name: newName }) });
      f.name = newName;
      renderProjectFolders();
      populateProjectSelects();
      if (typeof showToast === "function") showToast("Project folder renamed");
    } catch (e) {
      if (typeof showToast === "function") showToast((e && e.body) || "Couldn't rename folder");
    }
  }
  window.renameProjectFolder = renameProjectFolder;

  async function deleteProjectFolder(id) {
    closeProjectFolderDropdown();
    var hasKids = projectFolderHasChildren(id);
    var msg = hasKids
      ? "Delete this folder and everything inside it (including sub-folders)? Recipes tagged with any of them will keep their tag, but the folders will be gone."
      : "Delete this project folder? Recipes tagged with it will keep the tag but the folder will be removed.";
    if (!confirm(msg)) return;
    try {
      await projectFoldersApiFetch("/" + encodeURIComponent(id), { method: "DELETE" });
      // Server cascades the whole subtree — drop it from the local cache the same way rather
      // than re-fetching, since we already know exactly what just disappeared.
      var toRemove = new Set([id]);
      var frontier = [id];
      while (frontier.length) {
        var kids = projectFoldersCache.filter(function (f) { return frontier.indexOf(f.parentId) !== -1; }).map(function (f) { return f.id; });
        kids.forEach(function (k) { toRemove.add(k); });
        frontier = kids;
      }
      projectFoldersCache = projectFoldersCache.filter(function (f) { return !toRemove.has(f.id); });
      renderProjectFolders();
      populateProjectSelects();
      if (typeof showToast === "function") showToast("Project folder deleted");
    } catch (e) {
      if (typeof showToast === "function") showToast((e && e.body) || "Couldn't delete folder");
    }
  }
  window.deleteProjectFolder = deleteProjectFolder;

  function populateProjectSelects() {
    var folders = getLeafProjectFolders();
    ["new-rec-project", "edit-rec-project", "duplicate-rec-project"].forEach(function (id) {
      var sel = document.getElementById(id);
      if (!sel) return;
      var currentVal = sel.value;
      sel.innerHTML = "<option value=\"\">— None —</option>" + folders.map(function (f) {
        return "<option value=\"" + escapeHtml(f.id) + "\">" + escapeHtml(f.name || f.id) + "</option>";
      }).join("");
      if (currentVal && folders.some(function (f) { return f.id === currentVal; })) sel.value = currentVal;
    });
  }

  function includeProjectDelistedRecipes() {
    var cb = document.getElementById("project-recipe-include-delisted");
    return cb ? cb.checked : false;
  }

  function filterProjectRecipes() {
    var q = (document.getElementById("project-recipes-search") && document.getElementById("project-recipes-search").value || "").toLowerCase();
    var body = document.getElementById("project-recipes-body");
    if (!body) return;
    body.querySelectorAll("tr").forEach(function (row) {
      var show = !q || searchTextMatches(row.textContent, q);
      row.style.display = show ? "" : "none";
    });
  }

  function setProjectRecipeFilter(value) {
    renderProjectRecipesList();
  }

  function renderProjectRecipesList() {
    var slug = window.currentProjectSlug;
    if (!slug) return;
    var titleEl = document.getElementById("project-recipes-title");
    if (titleEl) titleEl.textContent = window.currentProjectLabel || slug;
    var recipes = Recipes.getRecipes();
    var ingredients = Ingredients.getIngredients();
    var usedInCount = {};
    recipes.forEach(function (rec) {
      (rec.ingredients || []).forEach(function (ri) {
        if (ri.subRecipeId) {
          usedInCount[ri.subRecipeId] = (usedInCount[ri.subRecipeId] || 0) + 1;
        }
      });
    });
    var filterVal = (document.getElementById("project-recipe-filter") && document.getElementById("project-recipe-filter").value) || "all";
    var typeFilterVal = (document.getElementById("project-recipe-type-filter") && document.getElementById("project-recipe-type-filter").value) || "all";
    var filtered = recipes.filter(function (r) { return recipeHasProjectTag(r, slug); });
    if (typeFilterVal === "ingredients") {
      filtered = filtered.filter(function (r) {
        if (!isSingleIngredientRecipe(r)) return false;
        var baseIng = ingredients.find(function (i) { return i.id === (r.ingredients || [])[0].ingredientId; });
        var c = baseIng ? (baseIng.cat || "").trim() : "";
        return c && c !== "Other" && !isPackagingItem(baseIng);
      });
    } else if (typeFilterVal === "packaging") {
      filtered = filtered.filter(function (r) {
        if (!isSingleIngredientRecipe(r)) return false;
        var baseIng = ingredients.find(function (i) { return i.id === (r.ingredients || [])[0].ingredientId; });
        return baseIng && isPackagingItem(baseIng);
      });
    } else {
      filtered = filtered.filter(function (r) { return !isSingleIngredientRecipe(r); });
      if (typeFilterVal === "finishedProduct") filtered = filtered.filter(function (r) { return (r.recipeType || "finishedProduct") === "finishedProduct"; });
      if (typeFilterVal === "subRecipe") filtered = filtered.filter(function (r) { return (r.recipeType || "finishedProduct") === "subRecipe"; });
    }
    if (filterVal === "approved") filtered = filtered.filter(function (r) { return !!r.approved; });
    if (filterVal === "development") filtered = filtered.filter(function (r) { return !r.approved; });
    if (!includeProjectDelistedRecipes()) filtered = filtered.filter(function (r) { return !isDelisted(r.name); });
    var body = document.getElementById("project-recipes-body");
    var emptyEl = document.getElementById("project-recipes-empty");
    var countLabel = document.getElementById("project-recipes-count-label");
    if (body) body.innerHTML = filtered.map(function (r) { return recipeRowHtml(r, ingredients, usedInCount[r.id] || 0, "project-recipes"); }).join("");
    if (countLabel) countLabel.textContent = filtered.length + " recipe" + (filtered.length !== 1 ? "s" : "");
    if (emptyEl) emptyEl.style.display = filtered.length === 0 ? "block" : "none";
    var tableScroll = document.getElementById("project-recipes-table-scroll");
    if (tableScroll) tableScroll.style.display = filtered.length === 0 ? "none" : "";
    filterProjectRecipes();
  }

  function searchIngredientForRecipe() {
    var q = (document.getElementById("recipe-ing-search").value || "").toLowerCase();
    var dd = document.getElementById("recipe-ing-dropdown");
    if (!q) { dd.classList.remove("open"); return; }
    var statusFilterEl = document.getElementById("recipe-ing-status-filter");
    var statusFilter = statusFilterEl ? statusFilterEl.value : "all";
    var typeFilterEl = document.getElementById("recipe-ing-type-filter");
    var typeFilter = typeFilterEl ? typeFilterEl.value : "all";
    var ingredients = Ingredients.getIngredients();
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    function statusMatches(item) {
      if (statusFilter === "approved") return !!item.approved;
      if (statusFilter === "development") return !item.approved;
      return true;
    }
    // Ingredients only ever come back as "rm"/"packaging"/"other" here — sub-recipes here are
    // always recipeType "subRecipe" (finished products can't be added as a component today, see
    // the comment below), so "sub" matches every sub-recipe result and "finished" matches none.
    function ingKindMatches(i) {
      if (typeFilter === "sub" || typeFilter === "finished") return false;
      if (typeFilter === "rm") return !isPackagingItem(i);
      if (typeFilter === "packaging") return isPackagingItem(i);
      if (typeFilter === "other") return !isPackagingItem(i) && (i.cat || "").trim() === "Other";
      return true;
    }
    function subKindMatches() {
      return typeFilter === "all" || typeFilter === "sub";
    }
    function ingScore(i) {
      var arr = [searchWordsMatch(i.name, q), searchWordsMatch(i.code, q), searchWordsMatch((i.descriptionTags || []).join(" "), q), searchWordsMatch(i.cat, q), searchWordsMatch(i.supplier, q)];
      (i.altCodes || []).forEach(function (c) { arr.push(searchWordsMatch(c, q)); });
      return arr.reduce(function (a, b) { return a.score >= b.score ? a : b; }, { match: false, score: 0 });
    }
    var ingMatches = ingredients.filter(function (i) { return !isDelisted(i.name) && statusMatches(i) && ingKindMatches(i) && ingScore(i).match; }).sort(function (a, b) { return ingScore(b).score - ingScore(a).score; }).slice(0, 6);
    var subMatches = [];
    if (r && subKindMatches()) {
      // Sub-recipes must be addable to ANY recipe, not just "finished products" — nesting a
      // sub-recipe inside another sub-recipe is completely normal (e.g. LR MIX inside HR FRIED
      // CHICKEN, itself inside a finished pack). Restricting this to finishedProduct-only made
      // most BCP/prep items (which are almost always modeled as sub-recipes) unsearchable while
      // building anything else. Single-ingredient sub-recipes are included too — they're valid,
      // commonly-used components (e.g. "BCP Chives Prepared"), not just display wrappers.
      function subScore(rec) {
        var nameR = searchWordsMatch(rec.name, q);
        var codeR = searchWordsMatch(rec.code, q);
        return nameR.score >= codeR.score ? nameR : codeR;
      }
      subMatches = recipes.filter(function (rec) {
        if ((rec.recipeType || "finishedProduct") !== "subRecipe" || rec.id === currentRecipeId || isDelisted(rec.name) || !statusMatches(rec)) return false;
        return subScore(rec).match;
      }).sort(function (a, b) { return subScore(b).score - subScore(a).score; }).slice(0, 4);
    }
    var allMatches = ingMatches.length + subMatches.length;
    if (allMatches === 0) { dd.innerHTML = "<div style=\"padding:10px;color:var(--nc-gray-400);font-size:13px\">No matches</div>"; dd.classList.add("open"); return; }
    function statusBadgeFor(item) {
      return item.approved
        ? "<span class=\"badge badge-approved\" style=\"font-size:9px\" title=\"Approved\">Approved</span>"
        : "<span class=\"badge badge-development\" style=\"font-size:9px\" title=\"In development\">In dev</span>";
    }
    var html = subMatches.map(function (rec) {
      var codePart = (rec.code && rec.code.trim()) ? rec.code : "";
      var recUom = recipeOwnUom(rec, ingredients);
      var costPerUom = getSubRecipeCostPerUom(rec, ingredients, recUom);
      var costPart = costPerUom > 0 ? "£" + costPerUom.toFixed(3) + "/" + recUom : "—";
      var typeBadge = "<span class=\"badge badge-subrecipe\" style=\"font-size:9px\">Sub</span>";
      var onclick = "addSubRecipeToRecipe('" + rec.id.replace(/'/g, "\\'") + "')";
      return "<div class=\"ingredient-dropdown-item\" onclick=\"" + onclick + "\">" +
        "<span class=\"idi-code\">" + codePart + "</span>" +
        "<span class=\"idi-name\">" + rec.name + "</span>" +
        "<span class=\"idi-cost\">" + costPart + "</span>" +
        "<span class=\"idi-status\">" + statusBadgeFor(rec) + "</span>" +
        "<span class=\"idi-type\">" + typeBadge + "</span>" +
        "</div>";
    }).join("");
    html += ingMatches.map(function (i) {
      var codePart = (i.code && i.code.trim()) ? i.code : "";
      var costUom = (i.costUOM || i.costUom || "KG").toString().toUpperCase();
      var costPart = i.cost > 0 ? "£" + Number(i.cost).toFixed(3) + "/" + costUom : "—";
      var noNutBadge = (hasNoNutrition(i) && !isPackagingItem(i)) ? "<span title=\"No nutritional values\" style=\"color:var(--nc-amber);font-size:11px;cursor:help\">⚠</span>" : "";
      var typeBadge = isPackagingItem(i)
        ? "<span class=\"badge badge-pkg\" style=\"font-size:9px\">PKG</span>"
        : "<span class=\"badge badge-rm\" style=\"font-size:9px\">RM</span>";
      var onclick = "addIngredientToRecipe('" + i.id.replace(/'/g, "\\'") + "')";
      return "<div class=\"ingredient-dropdown-item\" onclick=\"" + onclick + "\">" +
        "<span class=\"idi-code\">" + codePart + "</span>" +
        "<span class=\"idi-name\">" + i.name + " " + noNutBadge + "</span>" +
        "<span class=\"idi-cost\">" + costPart + "</span>" +
        "<span class=\"idi-status\">" + statusBadgeFor(i) + "</span>" +
        "<span class=\"idi-type\">" + typeBadge + "</span>" +
        "</div>";
    }).join("");
    dd.innerHTML = html;
    dd.classList.add("open");
  }

  function addRecipeVersionBeforeSave(r) {
    var history = (r.versionHistory || []).slice();
    history.push(new Date().toISOString());
    r.versionHistory = history;
  }

  function addSubRecipeToRecipe(subRecipeId) {
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    if (r.ingredients.some(function (ri) { return ri.subRecipeId === subRecipeId; })) { showToast("Sub recipe already in recipe"); return; }
    var subRec = recipes.find(function (rec) { return rec.id === subRecipeId; });
    var recipeUom = subRec ? recipeOwnUom(subRec, Ingredients.getIngredients()) : "G";
    if (!recipeUom || (Data.UOM_OPTIONS || ["G", "KG", "L", "ML", "M", "EACH"]).indexOf(recipeUom) < 0) recipeUom = "G";
    r.ingredients.push({ subRecipeId: subRecipeId, qty: 1, uom: recipeUom, fvnOverride: null });
    addRecipeVersionBeforeSave(r);
    document.getElementById("recipe-ing-search").value = "";
    document.getElementById("recipe-ing-dropdown").classList.remove("open");
    Recipes.setRecipes(recipes);
    renderRecipeIngredients();
    recalcCurrentRecipe();
  }

  function addIngredientToRecipe(ingId) {
    var recipes = Recipes.getRecipes();
    var ingredients = Ingredients.getIngredients();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    if (r.ingredients.some(function (ri) { return ri.ingredientId === ingId; })) { showToast("Ingredient already in recipe"); return; }
    var ing = ingredients.find(function (i) { return i.id === ingId; });
    var uom = (ing && (ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM)) ? (ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM).toUpperCase() : "KG";
    r.ingredients.push({ ingredientId: ingId, qty: 1, uom: uom, fvnOverride: null });
    addRecipeVersionBeforeSave(r);
    document.getElementById("recipe-ing-search").value = "";
    document.getElementById("recipe-ing-dropdown").classList.remove("open");
    Recipes.setRecipes(recipes);
    renderRecipeIngredients();
    recalcCurrentRecipe();
  }

  // Undo stack for recipe-detail edits (qty/uom/scrap changes, line removal) — see
  // snapshotRecipeForUndo/undoRecipeChange below. Capped so it can't grow unbounded in a long
  // editing session.
  var recipeUndoStack = [];
  var RECIPE_UNDO_MAX = 20;
  function snapshotRecipeForUndo(r) {
    recipeUndoStack.push({ recipeId: r.id, ingredients: JSON.parse(JSON.stringify(r.ingredients || [])) });
    if (recipeUndoStack.length > RECIPE_UNDO_MAX) recipeUndoStack.shift();
    updateRecipeUndoButton();
  }
  function updateRecipeUndoButton() {
    var btn = document.getElementById("recipe-undo-btn");
    if (btn) btn.disabled = !recipeUndoStack.length;
  }

  /** "Save" button next to Compare — ingredient edits (qty/uom/scrap/add/remove) no longer
   * autosave; every mutator still calls Recipes.setRecipes() exactly as before, but that
   * function now just holds the change in memory while hold mode is on (see recipes.js) rather
   * than persisting it immediately. This button (and the leave-page prompt below) are the only
   * two ways a held change actually reaches storage. */
  function updateRecipeSaveButton() {
    // Always visible and enabled, per user request — not conditioned on hasUnsavedChanges().
  }

  function saveCurrentRecipeChanges() {
    Recipes.flushSave();
    updateRecipeSaveButton();
    showToast("Recipe saved");
  }

  /** Reverts the currently-open recipe back to exactly how it looked when openRecipe() last
   * loaded it (see recipeSnapshotAtOpen) — used by "Leave without saving". Object.assign onto
   * the live object (not replacing it) so anything else still holding a reference to this same
   * recipe stays consistent, matching how every mutator above already mutates in place. */
  function discardCurrentRecipeChanges() {
    if (!recipeSnapshotAtOpen || !currentRecipeId) { Recipes.setHoldSave(true); updateRecipeSaveButton(); return; }
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (r) {
      Object.keys(r).forEach(function (k) { delete r[k]; });
      Object.assign(r, JSON.parse(JSON.stringify(recipeSnapshotAtOpen)));
    }
    Recipes.setHoldSave(true); // also resets the pending/dirty flag
    updateRecipeSaveButton();
  }
  function undoRecipeChange() {
    var last = recipeUndoStack.pop();
    updateRecipeUndoButton();
    if (!last) return;
    var recipes = Recipes.getRecipes();
    var idx = recipes.findIndex(function (rec) { return rec.id === last.recipeId; });
    if (idx < 0) return;
    recipes[idx].ingredients = last.ingredients;
    Recipes.setRecipes(recipes);
    if (currentRecipeId === last.recipeId) {
      renderRecipeIngredients();
      recalcCurrentRecipe();
    }
    showToast("Undone");
  }

  function removeIngredientFromRecipe(ingId) {
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    snapshotRecipeForUndo(r);
    r.ingredients = r.ingredients.filter(function (ri) { return ri.ingredientId !== ingId; });
    addRecipeVersionBeforeSave(r);
    var idx = recipes.findIndex(function (rec) { return rec.id === currentRecipeId; });
    if (idx >= 0) { recipes[idx] = r; Recipes.setRecipes(recipes); }
    renderRecipeIngredients();
    recalcCurrentRecipe();
  }

  function removeSubRecipeFromRecipe(subRecipeId) {
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    snapshotRecipeForUndo(r);
    r.ingredients = r.ingredients.filter(function (ri) { return ri.subRecipeId !== subRecipeId; });
    addRecipeVersionBeforeSave(r);
    var idx = recipes.findIndex(function (rec) { return rec.id === currentRecipeId; });
    if (idx >= 0) { recipes[idx] = r; Recipes.setRecipes(recipes); }
    renderRecipeIngredients();
    recalcCurrentRecipe();
  }

  function updateIngredientQty(ingId, val) {
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    snapshotRecipeForUndo(r);
    var ri = r.ingredients.find(function (x) { return x.ingredientId === ingId; });
    if (ri) ri.qty = parseFloat(val) || 0;
    addRecipeVersionBeforeSave(r);
    var idx = recipes.findIndex(function (rec) { return rec.id === currentRecipeId; });
    if (idx >= 0) { recipes[idx] = r; Recipes.setRecipes(recipes); }
    renderRecipeIngredients();
    recalcCurrentRecipe();
  }

  function updateSubRecipeQty(subRecipeId, val) {
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    snapshotRecipeForUndo(r);
    var ri = r.ingredients.find(function (x) { return x.subRecipeId === subRecipeId; });
    if (ri) ri.qty = parseFloat(val) || 0;
    addRecipeVersionBeforeSave(r);
    var idx = recipes.findIndex(function (rec) { return rec.id === currentRecipeId; });
    if (idx >= 0) { recipes[idx] = r; Recipes.setRecipes(recipes); }
    renderRecipeIngredients();
    recalcCurrentRecipe();
  }

  function updateSubRecipeUom(subRecipeId, uomVal) {
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    var ri = r.ingredients.find(function (x) { return x.subRecipeId === subRecipeId; });
    if (!ri) return;
    snapshotRecipeForUndo(r);
    var newUom = (uomVal && Data.UOM_OPTIONS.indexOf(uomVal.toUpperCase()) >= 0) ? uomVal.toUpperCase() : "G";
    if (newUom === (ri.uom || "G")) return;
    var oldUom = (ri.uom || "G").toUpperCase();
    if (oldUom === "EACH" || newUom === "EACH" || oldUom === "M" || newUom === "M") {
      ri.uom = newUom;
    } else {
      var qtyG = Data.qtyToGrams(ri.qty, ri.uom);
      ri.qty = Data.gramsToUom ? Data.gramsToUom(qtyG, newUom) : qtyG;
      ri.uom = newUom;
    }
    addRecipeVersionBeforeSave(r);
    var idx = recipes.findIndex(function (rec) { return rec.id === currentRecipeId; });
    if (idx >= 0) { recipes[idx] = r; Recipes.setRecipes(recipes); }
    renderRecipeIngredients();
    recalcCurrentRecipe();
  }

  function updateIngredientUom(ingId, uomVal) {
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    var ri = r.ingredients.find(function (x) { return x.ingredientId === ingId; });
    if (!ri) return;
    var newUom = (uomVal && Data.UOM_OPTIONS.indexOf(uomVal.toUpperCase()) >= 0) ? uomVal.toUpperCase() : "G";
    if (newUom === (ri.uom || "G")) return;
    snapshotRecipeForUndo(r);
    var oldUom = (ri.uom || "G").toUpperCase();
    var ingredients = Ingredients.getIngredients();
    var ing = ingredients.find(function (i) { return i.id === ingId; });
    var density = (ing && ing.density != null && ing.density > 0) ? Number(ing.density) : 1;

    if (oldUom === "EACH" || newUom === "EACH" || oldUom === "M" || newUom === "M") {
      ri.uom = newUom;
    } else if ((oldUom === "G" || oldUom === "KG") && (newUom === "L" || newUom === "ML")) {
      var grams = Data.qtyToGrams(ri.qty, ri.uom);
      var litres = Data.weightGramsToVolumeL(grams, density);
      ri.qty = newUom === "ML" ? litres * 1000 : litres;
      ri.uom = newUom;
    } else if ((oldUom === "L" || oldUom === "ML") && (newUom === "G" || newUom === "KG")) {
      var litresForConv = (oldUom === "ML") ? ri.qty / 1000 : ri.qty;
      var gramsConv = Data.volumeLToWeightGrams(litresForConv, density);
      ri.qty = newUom === "KG" ? gramsConv / 1000 : gramsConv;
      ri.uom = newUom;
    } else {
      var qtyG = Data.qtyToGrams(ri.qty, ri.uom);
      ri.qty = Data.gramsToUom ? Data.gramsToUom(qtyG, newUom) : qtyG;
      ri.uom = newUom;
    }
    addRecipeVersionBeforeSave(r);
    var idx = recipes.findIndex(function (rec) { return rec.id === currentRecipeId; });
    if (idx >= 0) { recipes[idx] = r; Recipes.setRecipes(recipes); }
    renderRecipeIngredients();
    recalcCurrentRecipe();
  }

  function renderRecipeIngredients() {
    var recipes = Recipes.getRecipes();
    var ingredients = Ingredients.getIngredients();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    updateRecipeSaveButton();
    // Fix a line's UOM only when it's genuinely INCOMPATIBLE with the referenced item's own
    // cost UOM (e.g. a line stuck on "EACH" while the ingredient is costed in KG — a real
    // mismatch, usually from a bad import). A line using a different but freely-convertible
    // unit within the same family (G vs KG, L vs ML — and, for plain ingredients, weight vs
    // volume via density) is a deliberate, valid user choice for how they enter the quantity —
    // it must NOT be silently snapped back on every render, which previously made switching a
    // line's UOM appear to do nothing at all.
    function uomFamily(u) {
      u = (u || "G").toString().toUpperCase();
      if (u === "L" || u === "ML") return "volume";
      if (u === "EACH") return "each";
      if (u === "M") return "m";
      return "weight"; // G, KG, and unrecognised values
    }
    var needsSave = false;
    (r.ingredients || []).forEach(function (ri) {
      if (ri.ingredientId) {
        var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
        if (!ing) return;
        var ingUom = (ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || ing.cost_uom || "").toString().trim().toUpperCase();
        if (!ingUom) return;
        var current = (ri.uom || "G").toUpperCase();
        var currentFam = uomFamily(current), ingFam = uomFamily(ingUom);
        // Ingredients support weight<->volume conversion too (via density in updateIngredientUom).
        var compatible = currentFam === ingFam || (currentFam !== "each" && currentFam !== "m" && ingFam !== "each" && ingFam !== "m");
        if (current !== ingUom && !compatible) {
          var qtyG = Data.qtyToGrams ? Data.qtyToGrams(ri.qty, current) : ri.qty;
          ri.qty = Data.gramsToUom ? Data.gramsToUom(qtyG, ingUom) : ri.qty;
          ri.uom = ingUom;
          needsSave = true;
        }
        return;
      }
      if (ri.subRecipeId) {
        var subRec = recipes.find(function (rec) { return rec.id === ri.subRecipeId; });
        if (!subRec) return;
        var subRecUom = recipeOwnUom(subRec, ingredients);
        if (!subRecUom || (Data.UOM_OPTIONS || ["G", "KG", "L", "ML", "M", "EACH"]).indexOf(subRecUom) < 0) subRecUom = "G";
        var current = (ri.uom || "G").toUpperCase();
        // updateSubRecipeUom has no density-based weight<->volume conversion, so only the
        // exact same family (weight-only or volume-only) counts as compatible here.
        if (current !== subRecUom && uomFamily(current) !== uomFamily(subRecUom)) {
          // Convert the quantity along with the unit — relabeling alone (e.g. "0.06244 KG" ->
          // "0.06244 G") silently shrinks the line 1000x instead of just renaming its unit.
          var subQtyG = Data.qtyToGrams ? Data.qtyToGrams(ri.qty, current) : ri.qty;
          ri.qty = Data.gramsToUom ? Data.gramsToUom(subQtyG, subRecUom) : ri.qty;
          ri.uom = subRecUom;
          needsSave = true;
        }
      }
    });
    if (needsSave) Recipes.setRecipes(recipes);
    var body = document.getElementById("recipe-ingredients-body");
    var empty = document.getElementById("recipe-ing-empty");
    var totalW = (r.ingredients || []).reduce(function (s, ri) { return s + recipeLineWeightForTotal(ri); }, 0);
    var recipeUom = recipeOwnUom(r, ingredients);
    var totalDisplay = (recipeUom === "EACH") ? "1 EACH" : (Data.round(totalW) + "g");
    var totalLabelEl = document.getElementById("total-weight-label");
    if (totalLabelEl) totalLabelEl.textContent = (recipeUom === "EACH") ? "Total: " : "Total weight: ";
    document.getElementById("total-weight").textContent = totalDisplay;
    // For EACH-based recipes, "1 EACH" stays the primary total (that's correct and unchanged)
    // — but also show the real underlying weight where we can derive one, using each line's
    // known per-unit weight (recipeLineWeightForTotal already excludes packaging and any
    // EACH-counted ingredient with no weight entered, rather than guessing).
    var secondaryWrap = document.getElementById("total-weight-secondary-wrap");
    var secondaryEl = document.getElementById("total-weight-secondary");
    if (secondaryWrap && secondaryEl) {
      if (recipeUom === "EACH" && totalW > 0) {
        secondaryEl.textContent = Data.round(totalW) + "g";
        secondaryWrap.style.display = "";
      } else {
        secondaryWrap.style.display = "none";
      }
    }
    // Approved recipes are locked: qty/UOM/scrap/remove controls and the add-ingredient search
    // become read-only until someone explicitly marks the recipe back as "in development"
    // (with a confirmation prompt, since that reopens an approved recipe to editing).
    var locked = !!r.approved;
    var searchBox = document.getElementById("recipe-ing-search");
    var searchWrap = searchBox ? searchBox.closest(".ingredient-search-wrap") || searchBox.parentElement : null;
    var searchRow = searchWrap ? searchWrap.parentElement : null;
    if (searchRow) searchRow.style.display = locked ? "none" : "";
    if (searchBox) searchBox.disabled = locked;
    if (r.ingredients.length === 0) { body.innerHTML = ""; empty.style.display = ""; return; }
    empty.style.display = "none";
    var totalCost = 0;
    var totalTallyCost = 0;
    var rowsHtml = r.ingredients.map(function (ri) {
      var lineUom = ri.uom || "G";
      var uomSel = (Data.UOM_OPTIONS || ["G", "KG", "L", "ML", "M", "EACH"]).map(function (u) { return '<option value="' + u + '"' + (lineUom === u ? " selected" : "") + ">" + u + "</option>"; }).join("");
      var qtyGForPct = recipeLineWeightForTotal(ri);
      var pct = totalW > 0 ? Data.round(qtyGForPct / totalW * 100) : 0;
      // Scrap is per LINE — this specific input's own loss when used in THIS recipe (e.g. oil
      // lost to frying vs. a vegetable mix retaining its weight). Never a whole-recipe value.
      var lineScrapPct = (ri.scrapPct && ri.scrapPct > 0 && ri.scrapPct < 100) ? ri.scrapPct : 0;
      var lineScrapMultiplier = lineScrapPct > 0 ? (100 / (100 - lineScrapPct)) : 1;
      if (ri.subRecipeId) {
        var subRec = recipes.find(function (rec) { return rec.id === ri.subRecipeId; });
        if (!subRec) return "";
        var subRecipeUom = recipeOwnUom(subRec, ingredients);
        var subCostPerUom = getSubRecipeCostPerUom(subRec, ingredients, subRecipeUom);
        var costBase = Data.qtyToCostBase(ri.qty, ri.uom || "G", subRecipeUom);
        var qtyPerBuom = costBase;
        var lineCost = subCostPerUom * costBase * lineScrapMultiplier;
        totalCost += lineCost;
        var isSingle = isSingleIngredientRecipe(subRec);
        // Cost is a property of the ingredient/item, not this recipe — edit it in the
        // Ingredient Centre (or that single-ingredient item's own view), not here.
        // A single-ingredient item with its own manually-entered ownCost shows that (it wins
        // in getSubRecipeCostPerUom too — see the ownCost>0 early-return there). Otherwise
        // (ownCost unset, cost derived from the linked base ingredient/packaging item) show
        // the live derived subCostPerUom instead of falsely displaying "—" while the line
        // cost total is still correctly using that same derived figure.
        var usedCostPerUom = (isSingle && subRec.ownCost > 0) ? subRec.ownCost : subCostPerUom;
        var costPerUomDisplay = usedCostPerUom > 0 ? "£" + usedCostPerUom.toFixed(3) : "<span style=\"color:var(--nc-gray-300)\">—</span>";
        // Grey figure is a freshly recomputed live tally, purely for eyeballing accuracy
        // against the dark figure (the one actually used everywhere else) — never used itself.
        var liveTallyForCheck = getSubRecipeCostPerUom(subRec, ingredients, subRecipeUom, null, true);
        if (liveTallyForCheck > 0) {
          costPerUomDisplay += "<span style=\"color:var(--nc-gray-400);font-size:11px\"> / £" + liveTallyForCheck.toFixed(3) + "</span>";
        }
        totalTallyCost += liveTallyForCheck * costBase * lineScrapMultiplier;
        var costDisplay = lineCost > 0 ? "£" + lineCost.toFixed(3) : "<span style=\"color:var(--nc-gray-300)\">—</span>";
        var codePart = (subRec.code && subRec.code.trim()) ? subRec.code : "—";
        lineUom = (ri.uom || subRecipeUom || "G").toString().toUpperCase();
        uomSel = (Data.UOM_OPTIONS || ["G", "KG", "L", "ML", "M", "EACH"]).map(function (u) { return '<option value="' + u + '"' + (lineUom === u ? " selected" : "") + ">" + u + "</option>"; }).join("");
        // Viewing-only: inside a recipe's own ingredient table, always open the full recipe
        // screen (even for a single-ingredient sub-recipe) so the table/tabs layout is
        // consistent here. Storage/classification is unchanged — it's still shown via the
        // Ingredient Centre's own list using the compact modal, untouched.
        var rowClick = "openRecipe('" + ri.subRecipeId.replace(/'/g, "\\'") + "')";
        var rowCtx = isSingle ? "openSingleIngredientRecipeActionsMenu(event, '" + ri.subRecipeId.replace(/'/g, "\\'") + "'); return false" : "handleRecipeContextMenu(event, '" + ri.subRecipeId.replace(/'/g, "\\'") + "'); return false";
        var subBadge = getRecipeLineBadge(ri, ingredients, recipes);
        // Only the code/name cells navigate — clicking elsewhere in the row (qty, scrap, etc.)
        // must never jump away while someone's trying to edit those fields.
        return "<tr oncontextmenu=\"" + rowCtx + "\">" +
          "<td class=\"recipe-line-nav\" onclick=\"" + rowClick + "\" oncontextmenu=\"" + rowCtx + "\" style=\"font-size:12px;color:var(--nc-gray-600);font-family:var(--nc-mono)\">" + codePart + "</td><td class=\"recipe-line-nav bold\" onclick=\"" + rowClick + "\" oncontextmenu=\"" + rowCtx + "\">" + subBadge + subRec.name + "</td>" +
          "<td onclick=\"event.stopPropagation()\" oncontextmenu=\"" + rowCtx + "\">" + (locked
            ? "<span style=\"font-family:var(--nc-mono);font-size:12px\">" + ri.qty + " " + lineUom + "</span>"
            : "<div style=\"display:flex;gap:4px;align-items:center\"><input class=\"form-input\" type=\"number\" value=\"" + ri.qty + "\" min=\"0\" step=\"any\" style=\"width:70px;padding:4px 8px\" onchange=\"updateSubRecipeQty('" + ri.subRecipeId.replace(/'/g, "\\'") + "', this.value)\" oncontextmenu=\"" + rowCtx + "\"><select class=\"form-select\" style=\"width:56px;padding:4px 4px;font-size:11px\" onchange=\"updateSubRecipeUom('" + ri.subRecipeId.replace(/'/g, "\\'") + "', this.value)\" oncontextmenu=\"" + rowCtx + "\">" + uomSel + "</select></div>") + "</td>" +
          "<td oncontextmenu=\"" + rowCtx + "\" class=\"num\" style=\"font-family:var(--nc-mono);font-size:12px\">" + (qtyPerBuom > 0 ? qtyPerBuom.toFixed(3) + " " + subRecipeUom : "0") + (lineUom === "EACH" && qtyGForPct > 0 ? "<br><span style=\"color:var(--nc-gray-400);font-size:11px\">(" + Data.round(qtyGForPct) + "g)</span>" : "") + "</td>" +
          "<td oncontextmenu=\"" + rowCtx + "\" class=\"num\">" + pct + "%</td>" +
          "<td onclick=\"event.stopPropagation()\" oncontextmenu=\"" + rowCtx + "\" class=\"num\">" + (locked
            ? "<span style=\"font-family:var(--nc-mono);font-size:12px\">" + lineScrapPct + "%</span>"
            : "<input type=\"number\" class=\"form-input\" min=\"0\" max=\"99\" step=\"any\" value=\"" + lineScrapPct + "\" style=\"width:55px;padding:4px 6px\" onchange=\"updateRecipeLineScrapPct('sub:" + ri.subRecipeId.replace(/'/g, "\\'") + "', this.value)\" title=\"This input's own scrap when used in this recipe (e.g. oil lost to frying) — not this sub-recipe's own separate scrap.\" oncontextmenu=\"" + rowCtx + "\">%") +
          "</td>" +
          "<td onclick=\"event.stopPropagation()\" oncontextmenu=\"" + rowCtx + "\" class=\"num\" style=\"font-family:var(--nc-mono);font-size:12px\">" + costPerUomDisplay + "</td>" +
          "<td oncontextmenu=\"" + rowCtx + "\" class=\"num\" style=\"font-family:var(--nc-mono);font-size:12px\">" + costDisplay + "</td>" +
          "<td oncontextmenu=\"" + rowCtx + "\">—</td>" +
          "<td onclick=\"event.stopPropagation()\" oncontextmenu=\"" + rowCtx + "\">" + (locked ? "" : "<button class=\"btn btn-sm btn-danger\" onclick=\"removeSubRecipeFromRecipe('" + ri.subRecipeId.replace(/'/g, "\\'") + "')\">×</button>") + "</td></tr>";
      }
      var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
      if (!ing) return "";
      lineUom = (ri.uom || ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || ing.cost_uom || "G").toString().toUpperCase();
      if (lineUom !== (ri.uom || "")) {
        uomSel = (Data.UOM_OPTIONS || ["G", "KG", "L", "ML", "M", "EACH"]).map(function (u) { return '<option value="' + u + '"' + (lineUom === u ? " selected" : "") + ">" + u + "</option>"; }).join("");
      }
      var costUOM = ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || ing.cost_uom || "KG";
      var costBase = Data.qtyToCostBase(ri.qty, lineUom || ri.uom, costUOM);
      var qtyPerBuom = costBase;
      var lineCost = (ing.cost || 0) * costBase * lineScrapMultiplier;
      totalCost += lineCost;
      totalTallyCost += lineCost; // raw ingredients have no ownCost override — used cost is the tally
      var costDisplay = ing.cost > 0 ? "£" + lineCost.toFixed(3) : "<span style=\"color:var(--nc-gray-300)\">—</span>";
      var noNutBadge = (hasNoNutrition(ing) && !isPackagingItem(ing)) ? "<span title=\"No nutritional values\" style=\"margin-left:4px;color:var(--nc-amber);font-size:12px;cursor:help\">⚠</span>" : "";
      var ingBadge = getRecipeLineBadge(ri, ingredients, recipes);
      var ingCtx = "openIngredientActionsMenu(event, '" + ri.ingredientId.replace(/'/g, "\\'") + "'); return false";
      var ingNavClick = "openIngredientView('" + ri.ingredientId.replace(/'/g, "\\'") + "')";
      // Only the code/name cells navigate — clicking elsewhere in the row (qty, scrap, etc.)
      // must never jump away while someone's trying to edit those fields.
      return "<tr oncontextmenu=\"" + ingCtx + "\">" +
        "<td class=\"recipe-line-nav\" onclick=\"" + ingNavClick + "\" oncontextmenu=\"" + ingCtx + "\" style=\"font-size:12px;color:var(--nc-gray-600);font-family:var(--nc-mono)\">" + (ing.code && ing.code.trim() ? ing.code : "—") + "</td><td class=\"recipe-line-nav bold\" onclick=\"" + ingNavClick + "\" oncontextmenu=\"" + ingCtx + "\">" + ingBadge + ing.name + noNutBadge + "</td>" +
        "<td onclick=\"event.stopPropagation()\" oncontextmenu=\"" + ingCtx + "\">" + (locked
          ? "<span style=\"font-family:var(--nc-mono);font-size:12px\">" + ri.qty + " " + lineUom + "</span>"
          : "<div style=\"display:flex;gap:4px;align-items:center\"><input class=\"form-input\" type=\"number\" value=\"" + ri.qty + "\" min=\"0\" step=\"any\" style=\"width:70px;padding:4px 8px\" onchange=\"updateIngredientQty('" + ri.ingredientId + "', this.value)\" oncontextmenu=\"" + ingCtx + "\"><select class=\"form-select\" style=\"width:56px;padding:4px 4px;font-size:11px\" onchange=\"updateIngredientUom('" + ri.ingredientId + "', this.value)\" oncontextmenu=\"" + ingCtx + "\">" + uomSel + "</select></div>") + "</td>" +
        "<td oncontextmenu=\"" + ingCtx + "\" class=\"num\" style=\"font-family:var(--nc-mono);font-size:12px\">" + (qtyPerBuom > 0 ? qtyPerBuom.toFixed(3) + " " + costUOM : "0") + (lineUom === "EACH" && qtyGForPct > 0 ? "<br><span style=\"color:var(--nc-gray-400);font-size:11px\">(" + Data.round(qtyGForPct) + "g)</span>" : "") + "</td>" +
        "<td oncontextmenu=\"" + ingCtx + "\" class=\"num\">" + pct + "%</td>" +
        "<td onclick=\"event.stopPropagation()\" oncontextmenu=\"" + ingCtx + "\" class=\"num\">" + (locked
          ? "<span style=\"font-family:var(--nc-mono);font-size:12px\">" + lineScrapPct + "%</span>"
          : "<input type=\"number\" class=\"form-input\" min=\"0\" max=\"99\" step=\"any\" value=\"" + lineScrapPct + "\" style=\"width:55px;padding:4px 6px\" onchange=\"updateRecipeLineScrapPct('ing:" + ri.ingredientId.replace(/'/g, "\\'") + "', this.value)\" title=\"This ingredient's own scrap when used in this recipe.\" oncontextmenu=\"" + ingCtx + "\">%") + "</td>" +
        "<td oncontextmenu=\"" + ingCtx + "\"><span style=\"font-size:12px;font-family:var(--nc-mono);color:var(--nc-gray-600)\" title=\"Edit this ingredient's cost in Ingredient Centre\">" + (ing.cost > 0 ? "£" + Number(ing.cost).toFixed(3) : "<span style=\"color:var(--nc-gray-300)\">—</span>") + "</span></td>" +
        "<td oncontextmenu=\"" + ingCtx + "\" class=\"num\" style=\"font-family:var(--nc-mono);font-size:12px\">" + costDisplay + "</td>" +
        "<td oncontextmenu=\"" + ingCtx + "\"></td>" + // FVN column left blank for now — not in use, kept as a slot for a future feature
        "<td onclick=\"event.stopPropagation()\" oncontextmenu=\"" + ingCtx + "\">" + (locked ? "" : "<button class=\"btn btn-sm btn-danger\" onclick=\"removeIngredientFromRecipe('" + ri.ingredientId + "')\">×</button>") + "</td></tr>";
    });
    // Dark figure = "cost per 1 unit of this recipe's own UOM" using whatever's actually used
    // elsewhere (ownCost when set, else the live derivation) — matches exactly what a parent
    // recipe referencing this one as a sub-recipe would get. Grey figure alongside it is a
    // forced, always-fresh live re-tally of the current ingredient lines, shown purely so the
    // two can be eyeballed for accuracy — it is never itself used in any calculation.
    var totalCostPerUom = getSubRecipeCostPerUom(r, ingredients, recipeUom);
    var totalLiveTally = getSubRecipeCostPerUom(r, ingredients, recipeUom, null, true);
    // totalCost/totalTallyCost (accumulated above, per line) are the actual recipe cost as
    // built — this is what belongs under Line Cost, distinct from totalCostPerUom above (cost
    // per 1 unit of the recipe's own UOM, which only equals the line-cost sum when the recipe's
    // total output happens to be exactly 1 of that unit).
    var totalRow = "<tr class=\"recipe-totals-row\" style=\"font-weight:700;background:var(--nc-gray-50);border-top:2px solid var(--nc-gray-300)\">" +
      "<td colspan=\"2\">Total</td>" +
      "<td class=\"num\" style=\"font-family:var(--nc-mono)\">" + totalDisplay + "</td>" +
      "<td></td>" +
      "<td class=\"num\">100%</td>" +
      "<td></td>" +
      "<td class=\"num\" style=\"font-family:var(--nc-mono);font-size:12px\">£" + totalCostPerUom.toFixed(3) +
      (totalLiveTally > 0 ? "<span style=\"color:var(--nc-gray-400);font-size:11px\"> / £" + totalLiveTally.toFixed(3) + "</span>" : "") + "</td>" +
      "<td class=\"num\" style=\"font-family:var(--nc-mono);font-size:12px\">£" + totalCost.toFixed(3) +
      (totalTallyCost > 0 ? "<span style=\"color:var(--nc-gray-400);font-size:11px\"> / £" + totalTallyCost.toFixed(3) + "</span>" : "") + "</td>" +
      "<td></td><td></td></tr>";
    body.innerHTML = rowsHtml.join("") + totalRow;
  }

  /** Total cost of one "batch" of the sub-recipe (all its ingredients). forceTally skips the
   * ownCost short-circuit below for THIS call only — see getSubRecipeCostPerUom. */
  function getSubRecipeTotalCost(subRec, ingredients, visited, forceTally) {
    visited = visited || {};
    if (subRec.id && visited[subRec.id]) return 0;
    if (subRec.id) visited[subRec.id] = true;
    // Own cost from the sheet/API is authoritative when present, for ANY recipe — not just
    // single-ingredient ones. Some items (e.g. "RM Wasabi Sachet 1.5g") have orphaned/misfiled
    // BOM lines in the source sheet that don't really belong to them, while the sheet's own
    // declared cost for the item is consistent everywhere it's actually used. Trusting the
    // declared cost over summing those bogus lines is what fixes that class of item. Only
    // falls through to the derived sum while own cost is unset (e.g. a development item with
    // no cost feed yet) or forceTally explicitly asked for the live-recomputed figure instead.
    // ownCost is only trusted for approved recipes — for one still in development, the
    // ingredient lines are what's actively being edited, so the live tally must win even when
    // an old ownCost from a BOM import is still sitting on the record (see getSubRecipeCostPerUom's
    // matching guard just below its own ownCost check).
    if (!forceTally && subRec.ownCost && subRec.ownCost > 0 && subRec.approved) {
      // ownCost is already defined as "cost per 1 unit of THIS recipe's own declared UOM"
      // (verified against the source sheet: ParentCost / ParentNoofPortions) — it needs no
      // weight-based derivation at all, for any UOM. Both callers of this function
      // (getSubRecipeCostPerUom, calcSubRecipeCost) treat it as already-per-unit and skip
      // their own weight division for this same case, so this must simply pass it through.
      return subRec.ownCost;
    }
    // For EACH/M-based recipes there is no weight-normalization step downstream (costPerUom
    // returns this total directly) — scrap has to inflate cost here to have any effect at all.
    // For weight-based (KG/G/L/ML) recipes, scrap must NOT inflate cost — verified against the
    // source sheet (e.g. HR FRIED CHICKEN: cost stays raw, the OUTPUT weight shrinks by scrap%
    // instead — costPerKg = Σqty×cost / Σqty×(1-scrap%), confirmed to match BC's own StandardCost
    // to within rounding). That weight-side reduction happens in getSubRecipeCostPerUom instead.
    var ownUomForScrap = (subRec.costUOM || subRec.uom || "G").toString().toUpperCase();
    var scrapAffectsCost = (ownUomForScrap === "EACH" || ownUomForScrap === "M");
    var cost = 0;
    (subRec.ingredients || []).forEach(function (ri) {
      // Scrap is per LINE — how much of THIS specific input is lost when used in THIS
      // specific recipe (e.g. oil lost to frying vs. a vegetable mix retaining its weight).
      // The same ingredient can scrap differently in different recipes, so this can never be
      // a single whole-recipe multiplier. Nutrition is unaffected — chopping/frying doesn't
      // change the composition of what remains, so calcRecipeNutrition needs no equivalent.
      // Multi-line/weight-ratio recipes already account for scrap correctly by shrinking the
      // WEIGHT denominator (costWeightForLine below) — applying an additive markup to the cost
      // numerator here too, for every line unconditionally, double-counts it and was verified
      // to badly regress the whole dataset. The additive markup only genuinely belongs in the
      // narrow single-line/no-weight-info fallback case in getSubRecipeCostPerUom below, where
      // it's applied separately and independently — never here in the general accumulation.
      var scrapMultiplier = (scrapAffectsCost && ri.scrapPct && ri.scrapPct > 0 && ri.scrapPct < 100) ? (100 / (100 - ri.scrapPct)) : 1;
      if (ri.subRecipeId) {
        var sr = Recipes.getRecipes().find(function (r) { return r.id === ri.subRecipeId; });
        if (sr && !visited[ri.subRecipeId]) {
          var subRecipeUom = recipeOwnUom(sr, ingredients);
          // Pass a COPY of visited, not the shared object — visited must only guard against
          // this branch being its own ancestor (a true cycle). Sharing/mutating one object
          // across sibling lines wrongly zeroes out any sub-recipe used by more than one line
          // of the same parent (e.g. a packaging item or oil that appears in two components) —
          // the second occurrence would look "already visited" and silently return 0.
          // forceTally propagates recursively here so a tally requested at any level genuinely
          // recomputes every nested sub-recipe beneath it too, instead of trusting a child's
          // possibly-stale ownCost — the non-tally path below is unaffected and still uses each
          // child's ownCost normally, exactly as the real "used" cost always has.
          var subCostPerUom = getSubRecipeCostPerUom(sr, ingredients, subRecipeUom, Object.assign({}, visited), forceTally);
          cost += subCostPerUom * Data.qtyToCostBase(ri.qty, ri.uom, subRecipeUom) * scrapMultiplier;
        }
      } else {
        var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
        if (ing) cost += (ing.cost || 0) * Data.qtyToCostBase(ri.qty, ri.uom, ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || ing.cost_uom || "KG") * scrapMultiplier;
      }
    });
    return cost;
  }

  // Like recipeLineWeightForTotal, but WITHOUT its blanket "EACH/M unit -> 0" rule: that rule
  // is fine for the recipe table's own "Total weight" display (where an EACH/M line is
  // basically always packaging), but real food is sometimes legitimately counted in EACH too
  // (e.g. "2.5 whole cucumbers") — zeroing those wrongly nukes the weight denominator here.
  // Only genuine packaging (by category/supplier/"NF " naming) is excluded.
  function costWeightForLine(ri, ingredients) {
    if (!ri) return 0;
    var lineUom = (ri.uom || "G").toString().toUpperCase();
    if (ri.ingredientId) {
      var ingredient = ingredients.find(function (i) { return i.id === ri.ingredientId; });
      if (ingredient && isPackagingItem(ingredient)) return 0;
      // EACH has no inherent weight — 1 EACH is never "100g" or any other guessed figure.
      // Use the ingredient's own real unit weight when it's been entered; otherwise exclude
      // this line from the weight total entirely (like packaging) rather than invent a number
      // that would silently distort every recipe's cost-per-kg.
      if (lineUom === "EACH") {
        var unitG = ingredient ? Number(ingredient.unitWeightG || 0) : 0;
        if (unitG <= 0) return 0;
        var scrapPctEach = (ri.scrapPct && ri.scrapPct > 0 && ri.scrapPct < 100) ? ri.scrapPct : 0;
        return ri.qty * unitG * (1 - scrapPctEach / 100);
      }
    }
    if (ri.subRecipeId) {
      var subRecipe = Recipes.getRecipes().find(function (r) { return r.id === ri.subRecipeId; });
      if (subRecipe && isSingleIngredientRecipe(subRecipe)) {
        var baseLine = (subRecipe.ingredients || [])[0];
        var baseIngredient = baseLine && baseLine.ingredientId ? ingredients.find(function (i) { return i.id === baseLine.ingredientId; }) : null;
        if (baseIngredient && isPackagingItem(baseIngredient)) return 0;
      }
      // A sub-recipe referenced by EACH count derives its own per-unit weight the same way the
      // "Total weight" display already does (getRecipeUnitWeightG — manual override, else
      // recursively summed from its own lines) rather than being excluded outright. Excluding
      // it entirely was based on a stale assumption ("only ingredients carry unitWeightG") —
      // recipes have carried a derivable unit weight for a while now, and the previous blanket
      // exclusion made the weight-ratio cost calculation divide by an unrepresentative sliver of
      // the batch's true weight whenever most lines were EACH-counted sub-recipes (verified:
      // e.g. California Potto Mix's real ~966g batch was computed as 234g, inflating its
      // per-kg cost by 3-6x). Scrap shrinks the contributed weight here, matching every other
      // branch in this function — recipeLineWeightForTotal deliberately doesn't do this, since
      // it's a display-only total, not a cost-driving one.
      if (lineUom === "EACH") {
        if (!subRecipe) return 0;
        var subUnitG = getRecipeUnitWeightG(subRecipe, {});
        if (subUnitG <= 0) return 0;
        var scrapPctSubEach = (ri.scrapPct && ri.scrapPct > 0 && ri.scrapPct < 100) ? ri.scrapPct : 0;
        return ri.qty * subUnitG * (1 - scrapPctSubEach / 100);
      }
    }
    // Scrap shrinks the OUTPUT weight this line actually contributes, not the cost — verified
    // against the source sheet's own math. A line with 20% scrap that weighs in at 1kg only
    // yields 0.8kg of usable output, so it should count as 0.8kg toward the batch's total yield.
    var scrapPct = (ri.scrapPct && ri.scrapPct > 0 && ri.scrapPct < 100) ? ri.scrapPct : 0;
    return Data.qtyToGrams(ri.qty, ri.uom) * (1 - scrapPct / 100);
  }

  /** Tally-only: total cost of a recipe's lines using the ADDITIVE scrap markup (cost × (1 +
   * scrap%)), applied unconditionally to every line regardless of that line's or the recipe's
   * own UOM. Verified against 76+ independent single-line BOM entries (scrap 0.25%-42%, every
   * combination of EACH/KG line uom and EACH/KG recipe uom) that Business Central's own
   * Standard Cost always matches this formula for a recipe whose cost is derived directly
   * (i.e. never went through the multi-line weight-ratio division below). A large-scrap
   * cross-check (30%) rules out the reciprocal yield formula decisively (additive off by
   * 0.000002, reciprocal off by 0.007670 on the same line). This must NEVER be used for a
   * recipe that IS going through the weight-ratio path (getSubRecipeCostPerUom's totalG>0
   * case) — that path already accounts for scrap correctly by shrinking the weight
   * denominator (costWeightForLine), and adding this markup on top there double-counts it
   * (verified: applying it unconditionally regressed dataset-wide accuracy from ~72% to ~29%
   * within 1%). Only call this from the two specific bypass points in getSubRecipeCostPerUom. */
  function getSubRecipeTotalCostAdditive(subRec, ingredients, visited) {
    visited = visited || {};
    if (subRec.id && visited[subRec.id]) return 0;
    if (subRec.id) visited[subRec.id] = true;
    var cost = 0;
    (subRec.ingredients || []).forEach(function (ri) {
      var scrapMultiplier = (ri.scrapPct && ri.scrapPct > 0 && ri.scrapPct < 100) ? (1 + ri.scrapPct / 100) : 1;
      if (ri.subRecipeId) {
        var sr = Recipes.getRecipes().find(function (r) { return r.id === ri.subRecipeId; });
        if (sr && !visited[ri.subRecipeId]) {
          var subRecipeUom = recipeOwnUom(sr, ingredients);
          // Recurse via the normal (forceTally=true) path, not this additive-only function —
          // a nested child only gets the additive treatment itself if IT ALSO hits one of the
          // two bypass points; if it goes through its own weight-ratio path instead, it must
          // use that (correct, already-scrap-accounted) result, not be forced additive too.
          var subCostPerUom = getSubRecipeCostPerUom(sr, ingredients, subRecipeUom, Object.assign({}, visited), true);
          cost += subCostPerUom * Data.qtyToCostBase(ri.qty, ri.uom, subRecipeUom) * scrapMultiplier;
        }
      } else {
        var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
        if (ing) cost += (ing.cost || 0) * Data.qtyToCostBase(ri.qty, ri.uom, ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || ing.cost_uom || "KG") * scrapMultiplier;
      }
    });
    return cost;
  }

  /** Cost per single unit of the given UOM for this recipe. EACH/M = total cost (per 1); KG/G/L/ML = cost per kg.
   * forceTally skips the ownCost short-circuit for THIS call only (recursive calls for child
   * sub-recipes still use their own ownCost normally) — used where a genuinely live-recomputed
   * figure is wanted alongside ownCost/sheetCost as a separate comparison, not instead of it. */
  function getSubRecipeCostPerUom(subRec, ingredients, recipeUom, visited, forceTally) {
    recipeUom = (recipeUom || "G").toString().toUpperCase();
    // Snapshot BEFORE calling getSubRecipeTotalCost below — that call mutates visited in place
    // (marks subRec.id as seen), so reusing the same reference afterward for the additive
    // fallback would make subRec look "already visited" and wrongly short-circuit to 0.
    var visitedForAdditive = Object.assign({}, visited || {});
    var totalCost = getSubRecipeTotalCost(subRec, ingredients, visited || {}, forceTally);
    // Tally-only: verified against 90+ BOM entries — single-line AND 2-line AND 3-line
    // recipes alike — that Business Central's own declared cost (ParentCost/ParentNoofPortions)
    // consistently equals the straight additive-scrap sum of its lines (Σ qty × price ×
    // (1+scrap%)), with NO separate weight-ratio division step at all, regardless of how many
    // lines the recipe has. getSubRecipeTotalCostAdditive never divides by weight, so it's safe
    // to use unconditionally here — this is NOT the same change that regressed accuracy earlier
    // tonight (that attempt modified the SHARED accumulator that also feeds the weight-ratio
    // path below, double-counting scrap in both the numerator and the weight denominator). This
    // is a fully separate, dedicated calculation with no such path to double-count through.
    // Confirmed dataset-wide: 66.5%->70.5% within 0.5%, 77.3%->80.0% within 1%, no new outliers.
    if (forceTally) {
      return getSubRecipeTotalCostAdditive(subRec, ingredients, visitedForAdditive);
    }
    if (recipeUom === "EACH" || recipeUom === "M") return totalCost;
    // ownCost is already per-unit — no weight division needed or wanted (matches
    // getSubRecipeTotalCost's own early return for this same case).
    if (!forceTally && subRec.ownCost && subRec.ownCost > 0 && subRec.approved) return totalCost;
    // Packaging lines (trays, film, labels) must not count toward the weight denominator of a
    // per-kg cost — otherwise mixing food (KG) with packaging in one recipe wrongly dilutes its
    // cost-per-kg using packaging's arbitrary placeholder pseudo-weight.
    var totalG = (subRec.ingredients || []).reduce(function (s, ri) { return s + costWeightForLine(ri, ingredients); }, 0);
    if (totalG <= 0) {
      // A single-ingredient wrapper around a zero-weight item (packaging) has no weight to
      // divide by, but it can still have a real cost — don't discard it. Some of these were
      // imported with their own uom/costUOM defaulted to "G" (wrong — e.g. a label roll that's
      // really priced per EACH, or wrap that's really priced per M) rather than left matching
      // the base ingredient's actual unit, which is what sent them down this weight-ratio path
      // in the first place. Derive the price directly from the one base line instead: totalCost
      // already equals price × (that line's qty converted into the base ingredient's own
      // costUOM), so dividing by the line's qty gives price-per-1-unit-of-the-line's-own-uom,
      // which can then be converted into whatever uom the caller actually asked for.
      var lines = subRec.ingredients || [];
      if (totalCost > 0 && lines.length === 1 && lines[0].qty > 0) {
        var costPerLineUnit = totalCost / lines[0].qty;
        return costPerLineUnit * Data.qtyToCostBase(1, recipeUom, lines[0].uom || "G");
      }
      return 0;
    }
    return (totalCost / totalG) * 1000;
  }

  function calcSubRecipeCost(subRec, ingredients, visited) {
    if (subRec.ownCost && subRec.ownCost > 0 && subRec.approved) return subRec.ownCost;
    var totalG = (subRec.ingredients || []).reduce(function (s, ri) { return s + costWeightForLine(ri, ingredients); }, 0);
    if (totalG <= 0) return 0;
    var totalCost = getSubRecipeTotalCost(subRec, ingredients, visited);
    return (totalCost / totalG) * 1000;
  }
  window.calcSubRecipeCost = calcSubRecipeCost;
  window.getSubRecipeCostPerUom = getSubRecipeCostPerUom;
  window.getSubRecipeTotalCost = getSubRecipeTotalCost;

  function getRecipeTotalCost(r, ingredients, recipes) {
    if (!r || !(r.ingredients && r.ingredients.length)) return 0;
    var totalCost = 0;
    (r.ingredients || []).forEach(function (ri) {
      if (ri.subRecipeId) {
        var subRec = (recipes || Recipes.getRecipes()).find(function (rec) { return rec.id === ri.subRecipeId; });
        if (subRec) {
          var subRecipeUom = recipeOwnUom(subRec, ingredients);
          var subCostPerUom = getSubRecipeCostPerUom(subRec, ingredients, subRecipeUom);
          var costBase = Data.qtyToCostBase(ri.qty, ri.uom || "G", subRecipeUom);
          totalCost += subCostPerUom * costBase;
        }
      } else {
        var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
        if (ing) {
          var lineUom = (ri.uom || ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || ing.cost_uom || "G").toString().toUpperCase();
          var costUOM = ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || ing.cost_uom || "KG";
          var costBase = Data.qtyToCostBase(ri.qty, lineUom, costUOM);
          totalCost += (ing.cost || 0) * costBase;
        }
      }
    });
    return totalCost;
  }

  /** Weight (grams) of 1 unit of this recipe's own UOM — its own manually-entered weight when
   * set, otherwise derived recursively from its own lines (which may themselves derive from
   * further sub-recipes). Lets weight flow up through as many levels as have the underlying
   * info, instead of stopping dead the moment one level has no manual entry. Display-only —
   * never used for cost/UOM. */
  function getRecipeUnitWeightG(rec, visited) {
    visited = visited || {};
    if (!rec) return 0;
    if (rec.id && visited[rec.id]) return 0;
    if (rec.id) visited[rec.id] = true;
    if (rec.unitWeightG && rec.unitWeightG > 0) return rec.unitWeightG;
    var total = 0;
    (rec.ingredients || []).forEach(function (ri) { total += recipeLineWeightForTotal(ri, visited); });
    return total;
  }

  /** Weight (grams) for recipe total weight and %. Packaging is always excluded; costs are unchanged. */
  function recipeLineWeightForTotal(ri, visited) {
    if (!ri) return 0;
    var uom = (ri.uom || "G").toString().toUpperCase();
    if (ri.ingredientId) {
      var ingredient = Ingredients.getIngredients().find(function (i) { return i.id === ri.ingredientId; });
      if (ingredient && isPackagingItem(ingredient)) return 0;
      // EACH has no inherent weight. Use the ingredient's own real unit weight when it's been
      // entered; otherwise exclude, the same way packaging is excluded, rather than guess.
      if (uom === "EACH") {
        var unitG = ingredient ? Number(ingredient.unitWeightG || 0) : 0;
        return unitG > 0 ? ri.qty * unitG : 0;
      }
    }
    if (ri.subRecipeId) {
      var subRecipe = Recipes.getRecipes().find(function (r) { return r.id === ri.subRecipeId; });
      if (subRecipe && isSingleIngredientRecipe(subRecipe)) {
        var baseLine = (subRecipe.ingredients || [])[0];
        var baseIngredient = baseLine && baseLine.ingredientId ? Ingredients.getIngredients().find(function (i) { return i.id === baseLine.ingredientId; }) : null;
        if (baseIngredient && isPackagingItem(baseIngredient)) return 0;
      }
      // Display-only weight total: recurse into the sub-recipe's own derived weight (its own
      // manual entry if set, else derived from ITS lines, and so on) — not just a one-level
      // read of a manually-entered field — so weight flows up through as many levels as have
      // the underlying info. Deliberately NOT used in costWeightForLine — cost/UOM unaffected.
      if (uom === "EACH") {
        if (!subRecipe) return 0;
        var subUnitG = getRecipeUnitWeightG(subRecipe, Object.assign({}, visited || {}));
        return subUnitG > 0 ? ri.qty * subUnitG : 0;
      }
    }
    if (uom === "M") return 0;
    return Data.qtyToGrams(ri.qty, ri.uom);
  }

  window.updateIngredientCostFromRecipe = function (ingId, value) {
    Ingredients.updateIngredientCost(ingId, value);
    renderRecipeIngredients();
    recalcCurrentRecipe();
  };
  window.updateSubRecipeOwnCost = function (subRecipeId, value) {
    Recipes.updateRecipeOwnCost(subRecipeId, value);
    renderAll();
    renderRecipeIngredients();
    recalcCurrentRecipe();
  };

  function recalcCurrentRecipe() {
    var recipes = Recipes.getRecipes();
    var ingredients = Ingredients.getIngredients();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    var servingInput = document.getElementById("serving-size-input");
    if (servingInput) r.serving = parseFloat(servingInput.value) || 100;
    var idx = recipes.findIndex(function (rec) { return rec.id === currentRecipeId; });
    if (idx >= 0) { recipes[idx] = r; Recipes.setRecipes(recipes); }

    var n = Recipes.calcRecipeNutrition(r, ingredients);
    var serving = r.serving || 100;
    var servScale = serving / 100;

    document.getElementById("nut-energy").innerHTML = Data.round(n.kj) + ' <span class="stat-unit">kJ</span>';
    document.getElementById("nut-kcal").innerHTML = Data.round(n.kcal) + ' <span class="stat-unit">kcal</span>';
    document.getElementById("nut-protein").innerHTML = Data.round(n.protein) + ' <span class="stat-unit">g</span>';

    var nutrients = [
      { name: "Energy", per100: Data.round(n.kj) + " kJ / " + Data.round(n.kcal) + " kcal", perServing: Data.round(n.kj * servScale) + " kJ / " + Data.round(n.kcal * servScale) + " kcal", ri: Data.round(n.kcal / Data.RI.kcal * 100) + "%", bold: true },
      { name: "Fat", per100: Data.round(n.fat) + "g", perServing: Data.round(n.fat * servScale) + "g", ri: Data.round(n.fat / Data.RI.fat * 100) + "%", bold: true },
      { name: "  of which saturates", per100: Data.round(n.sat) + "g", perServing: Data.round(n.sat * servScale) + "g", ri: Data.round(n.sat / Data.RI.saturates * 100) + "%" },
      { name: "Carbohydrate", per100: Data.round(n.carb) + "g", perServing: Data.round(n.carb * servScale) + "g", ri: Data.round(n.carb / Data.RI.carbs * 100) + "%", bold: true },
      { name: "  of which sugars", per100: Data.round(n.sugar) + "g", perServing: Data.round(n.sugar * servScale) + "g", ri: Data.round(n.sugar / Data.RI.sugars * 100) + "%" },
      { name: "Fibre", per100: Data.round(n.fibre) + "g", perServing: Data.round(n.fibre * servScale) + "g", ri: Data.round(n.fibre / Data.RI.fibre * 100) + "%", bold: true },
      { name: "Protein", per100: Data.round(n.protein) + "g", perServing: Data.round(n.protein * servScale) + "g", ri: Data.round(n.protein / Data.RI.protein * 100) + "%", bold: true },
      { name: "Salt", per100: Data.round(n.salt, 2) + "g", perServing: Data.round(n.salt * servScale, 2) + "g", ri: Data.round(n.salt / Data.RI.salt * 100) + "%", bold: true }
    ];
    document.getElementById("nutrition-table-body").innerHTML = nutrients.map(function (nut) {
      return "<tr><td class=\"" + (nut.bold ? "bold" : "") + "\">" + nut.name + "</td><td class=\"num\">" + nut.per100 + "</td><td class=\"num\">" + nut.perServing + "</td><td class=\"num\">" + nut.ri + "</td></tr>";
    }).join("");

    var tlData = [{ key: "fat", name: "Fat", val: n.fat }, { key: "sat", name: "Saturates", val: n.sat }, { key: "sugar", name: "Sugars", val: n.sugar }, { key: "salt", name: "Salt", val: n.salt }];
    document.getElementById("traffic-lights").innerHTML = tlData.map(function (tl) {
      var color = HFSS.getTrafficLight(tl.key, tl.val);
      return '<div class="traffic-light tl-' + color + '"><div class="tl-val">' + Data.round(tl.val) + "g</div><div class=\"tl-name\">" + tl.name + "</div></div>";
    }).join("");

    renderLabel(n, r);
    renderHFSS(r);
    renderAllergens(r);
    renderCosting(r);
  }

  function renderLabel(n, recipe) {
    var fmt = document.getElementById("label-format").value;
    var serving = recipe.serving || 100;
    var s = serving / 100;
    var container = document.getElementById("label-container");
    var RI = Data.RI;
    if (fmt === "uk") {
      container.innerHTML = '<div class="nutrition-label"><h3>Nutrition Information</h3><table><tr><th></th><th style="text-align:right">Per 100g</th><th style="text-align:right">Per ' + serving + 'g serving</th><th style="text-align:right">%RI</th></tr>' +
        '<tr class="label-bold"><td>Energy</td><td>' + Data.round(n.kj) + ' kJ</td><td>' + Data.round(n.kj * s) + ' kJ</td><td>' + Data.round(n.kcal / RI.kcal * 100) + "%</td></tr>" +
        "<tr><td></td><td>" + Data.round(n.kcal) + " kcal</td><td>" + Data.round(n.kcal * s) + " kcal</td><td></td></tr>" +
        '<tr class="label-bold"><td>Fat</td><td>' + Data.round(n.fat) + 'g</td><td>' + Data.round(n.fat * s) + 'g</td><td>' + Data.round(n.fat / RI.fat * 100) + "%</td></tr>" +
        '<tr><td style="padding-left:12px">of which saturates</td><td>' + Data.round(n.sat) + 'g</td><td>' + Data.round(n.sat * s) + 'g</td><td>' + Data.round(n.sat / RI.saturates * 100) + "%</td></tr>" +
        '<tr class="label-bold"><td>Carbohydrate</td><td>' + Data.round(n.carb) + 'g</td><td>' + Data.round(n.carb * s) + 'g</td><td>' + Data.round(n.carb / RI.carbs * 100) + "%</td></tr>" +
        '<tr><td style="padding-left:12px">of which sugars</td><td>' + Data.round(n.sugar) + 'g</td><td>' + Data.round(n.sugar * s) + 'g</td><td>' + Data.round(n.sugar / RI.sugars * 100) + "%</td></tr>" +
        '<tr class="label-bold"><td>Fibre</td><td>' + Data.round(n.fibre) + 'g</td><td>' + Data.round(n.fibre * s) + 'g</td><td></td></tr>' +
        '<tr class="label-bold"><td>Protein</td><td>' + Data.round(n.protein) + 'g</td><td>' + Data.round(n.protein * s) + 'g</td><td>' + Data.round(n.protein / RI.protein * 100) + "%</td></tr>" +
        '<tr class="label-bold"><td>Salt</td><td>' + Data.round(n.salt, 2) + 'g</td><td>' + Data.round(n.salt * s, 2) + 'g</td><td>' + Data.round(n.salt / RI.salt * 100) + "%</td></tr>" +
        '</table><p style="font-size:10px;margin-top:6px;color:var(--nc-gray-500)">*Reference intake of an average adult (8400kJ/2000kcal)</p></div>';
    } else {
      container.innerHTML = '<div class="nutrition-label" style="font-family:Helvetica,Arial,sans-serif"><div style="font-size:26px;font-weight:900;border-bottom:1px solid #000;line-height:1">Nutrition Facts</div>' +
        '<div style="font-size:11px;border-bottom:8px solid #000;padding:2px 0">Serving size ' + serving + 'g</div>' +
        '<div style="display:flex;justify-content:space-between;border-bottom:4px solid #000;padding:4px 0"><div><div style="font-size:10px;font-weight:700">Amount per serving</div><div style="font-size:20px;font-weight:900">Calories</div></div><div style="font-size:28px;font-weight:900;align-self:flex-end">' + Data.round(n.kcal * s) + '</div></div>' +
        '<div style="text-align:right;font-size:10px;font-weight:700;border-bottom:1px solid #000;padding:1px 0">% Daily Value*</div><div style="font-size:12px">' +
        '<div style="border-bottom:1px solid #000;padding:2px 0;display:flex;justify-content:space-between"><span><b>Total Fat</b> ' + Data.round(n.fat * s) + 'g</span><span><b>' + Data.round(n.fat * s / 78 * 100) + '%</b></span></div>' +
        '<div style="border-bottom:1px solid #000;padding:2px 0 2px 16px;display:flex;justify-content:space-between"><span>Saturated Fat ' + Data.round(n.sat * s) + 'g</span><span><b>' + Data.round(n.sat * s / 20 * 100) + '%</b></span></div>' +
        '<div style="border-bottom:1px solid #000;padding:2px 0;display:flex;justify-content:space-between"><span><b>Total Carbohydrate</b> ' + Data.round(n.carb * s) + 'g</span><span><b>' + Data.round(n.carb * s / 275 * 100) + '%</b></span></div>' +
        '<div style="border-bottom:1px solid #000;padding:2px 0 2px 16px">Total Sugars ' + Data.round(n.sugar * s) + 'g</div>' +
        '<div style="border-bottom:1px solid #000;padding:2px 0;display:flex;justify-content:space-between"><span>Dietary Fiber ' + Data.round(n.fibre * s) + 'g</span><span><b>' + Data.round(n.fibre * s / 28 * 100) + '%</b></span></div>' +
        '<div style="border-bottom:8px solid #000;padding:2px 0"><b>Protein</b> ' + Data.round(n.protein * s) + 'g</div>' +
        '<div style="border-bottom:1px solid #000;padding:2px 0;display:flex;justify-content:space-between"><span>Sodium ' + Data.round((n.salt / 2.5) * 1000 * s) + 'mg</span><span><b>' + Data.round((n.salt / 2.5) * 1000 * s / 2300 * 100) + '%</b></span></div></div>' +
        '<p style="font-size:9px;margin-top:4px">*The % Daily Value tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.</p></div>';
    }
    var ingredients = Ingredients.getIngredients();
    var totalWeight = (recipe.ingredients || []).reduce(function (s, ri) { return s + recipeLineWeightForTotal(ri); }, 0);
    var sorted = (recipe.ingredients || []).slice().sort(function (a, b) { return recipeLineWeightForTotal(b) - recipeLineWeightForTotal(a); });
    var recipes = Recipes.getRecipes();
    var parts = sorted.map(function (ri) {
      var name; var allergens = [];
      if (ri.subRecipeId) {
        var subRec = recipes.find(function (r) { return r.id === ri.subRecipeId; });
        if (!subRec) return "";
        name = subRec.name.split(",")[0];
        (subRec.ingredients || []).forEach(function (sri) {
          var sing = sri.ingredientId ? ingredients.find(function (i) { return i.id === sri.ingredientId; }) : null;
          if (sing) (sing.allergens || []).forEach(function (a) { if (allergens.indexOf(a) === -1) allergens.push(a); });
        });
      } else {
        var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
        if (!ing) return "";
        name = ing.name.split(",")[0];
        allergens = ing.allergens || [];
      }
      allergens.forEach(function (a) {
        a.split(" ").forEach(function (w) {
          var rx = new RegExp("\\b" + w + "\\b", "gi");
          if (name.match(rx)) name = name.replace(rx, "<b>" + w.toUpperCase() + "</b>");
        });
      });
      var qtyG = recipeLineWeightForTotal(ri);
      var pct = totalWeight > 0 ? Data.round(qtyG / totalWeight * 100) : 0;
      return name + " (" + pct + "%)";
    });
    var allergenList = [];
    recipe.ingredients.forEach(function (ri) {
      if (ri.subRecipeId) {
        var subRec = recipes.find(function (r) { return r.id === ri.subRecipeId; });
        if (subRec) (subRec.ingredients || []).forEach(function (sri) {
          var sing = sri.ingredientId ? ingredients.find(function (i) { return i.id === sri.ingredientId; }) : null;
          if (sing) (sing.allergens || []).forEach(function (a) { if (allergenList.indexOf(a) === -1) allergenList.push(a); });
        });
      } else {
        var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
        if (ing) (ing.allergens || []).forEach(function (a) { if (allergenList.indexOf(a) === -1) allergenList.push(a); });
      }
    });
    var decl = "<strong>Ingredients:</strong> " + parts.join(", ") + ".";
    if (allergenList.length) decl += "<br><br><strong>Allergens:</strong> Contains <b>" + allergenList.join(", ").toUpperCase() + "</b>.";
    document.getElementById("ingredient-declaration").innerHTML = decl;
  }

  function renderHFSS(recipe) {
    var ingredients = Ingredients.getIngredients();
    var h = HFSS.calcHFSS(recipe, ingredients);
    var badge = document.getElementById("hfss-badge");
    badge.textContent = h.isHFSS ? "HFSS" : "Non-HFSS";
    badge.className = "badge " + (h.isHFSS ? "badge-red" : "badge-green");
    var scoreColor = h.isHFSS ? "background:#FEE2E2;color:#991B1B;border:2px solid #EF4444" : "background:#D1FAE5;color:#065F46;border:2px solid #10B981";
    document.getElementById("hfss-display").innerHTML = '<div class="hfss-total" style="' + scoreColor + '"><div class="score">' + h.total + '</div><div class="label">Points</div></div>' +
      '<div class="hfss-breakdown"><div style="font-weight:600;font-size:12px;color:var(--nc-gray-400);margin-bottom:4px">A POINTS (less healthy)</div>' +
      '<div class="hfss-row"><span>Energy</span><span class="pts">+' + h.energyPts + "</span></div>" +
      '<div class="hfss-row"><span>Saturated Fat</span><span class="pts">+' + h.satPts + "</span></div>" +
      '<div class="hfss-row"><span>Sugars</span><span class="pts">+' + h.sugarPts + "</span></div>" +
      '<div class="hfss-row"><span>Sodium</span><span class="pts">+' + h.sodiumPts + "</span></div>" +
      '<div class="hfss-row" style="font-weight:600;border-top:1px solid var(--nc-gray-200);padding-top:4px"><span>Total A</span><span class="pts">' + h.aPoints + "</span></div>" +
      '<div style="font-weight:600;font-size:12px;color:var(--nc-gray-400);margin:8px 0 4px">C POINTS (healthier)</div>' +
      '<div class="hfss-row"><span>FVN (' + Data.round(h.fvnPct) + '%)</span><span class="pts">−' + h.fvnPts + "</span></div>" +
      '<div class="hfss-row"><span>Fibre</span><span class="pts">−' + h.fibrePts + "</span></div>" +
      '<div class="hfss-row"><span>Protein ' + (h.proteinExcluded ? "(excluded)" : "") + '</span><span class="pts">−' + (h.proteinExcluded ? 0 : h.proteinPts) + "</span></div>" +
      '<div class="hfss-row" style="font-weight:600;border-top:1px solid var(--nc-gray-200);padding-top:4px"><span>Total C</span><span class="pts">' + h.cPoints + "</span></div></div>";
    var tips = [];
    if (h.sugarPts >= 3) tips.push("High sugar score — consider reducing sugar content or substituting with natural alternatives.");
    if (h.satPts >= 3) tips.push("High saturated fat — try replacing some fat with unsaturated alternatives.");
    if (h.sodiumPts >= 3) tips.push("High sodium — reduce salt or use low-sodium alternatives.");
    if (h.fvnPts < 3) tips.push("Low FVN score — increasing fruit, vegetable, or nut content will improve the score.");
    if (h.fibrePts < 2) tips.push("Low fibre — consider adding wholemeal flour, oats, or other high-fibre ingredients.");
    if (!h.isHFSS) tips.push("This recipe passes as Non-HFSS. No reformulation needed.");
    document.getElementById("hfss-tips").innerHTML = tips.map(function (t) { return "<p style=\"margin-bottom:4px\">• " + t + "</p>"; }).join("");
    var ns = HFSS.calcNutriScore(recipe, ingredients);
    var letters = ["A", "B", "C", "D", "E"];
    var colors = ["#038141", "#85BB2F", "#FECB02", "#EE8100", "#E63E11"];
    document.getElementById("nutri-score-display").innerHTML = letters.map(function (l, i) {
      var isActive = l === ns.letter;
      return '<div style="flex:1;padding:' + (isActive ? "12px 8px" : "8px 6px") + ";background:" + colors[i] + ";color:#fff;text-align:center;font-weight:900;font-size:" + (isActive ? "22px" : "14px") + ";border-radius:4px;opacity:" + (isActive ? 1 : 0.4) + ";transition:all .2s\">" + l + "</div>";
    }).join("");
    document.getElementById("nutri-score-info").textContent = "This recipe scores Nutri-Score " + ns.letter + " (total nutrient profile points: " + h.total + ")";
  }

  function getAllergensFromRecipeItem(ri, ingredients, recipes) {
    var present = [];
    if (ri.subRecipeId) {
      var subRec = recipes.find(function (r) { return r.id === ri.subRecipeId; });
      if (subRec) (subRec.ingredients || []).forEach(function (sri) {
        var sing = sri.ingredientId ? ingredients.find(function (i) { return i.id === sri.ingredientId; }) : null;
        if (sing) (sing.allergens || []).forEach(function (a) { if (present.indexOf(a) === -1) present.push(a); });
      });
    } else {
      var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
      if (ing) present = ing.allergens || [];
    }
    return present;
  }

  function renderAllergens(recipe) {
    var ingredients = Ingredients.getIngredients();
    var recipes = Recipes.getRecipes();
    var present = new Set();
    recipe.ingredients.forEach(function (ri) {
      getAllergensFromRecipeItem(ri, ingredients, recipes).forEach(function (a) { present.add(a); });
    });
    document.getElementById("allergen-tags").innerHTML = Data.EU_ALLERGENS.map(function (a) {
      var has = present.has(a);
      return '<span class="allergen-tag ' + (has ? "allergen-present" : "allergen-absent") + '">' + (has ? "⚠ " : "") + a + "</span>";
    }).join("");
    var table = document.getElementById("allergen-matrix");
    var html = "<thead><tr><th>Ingredient</th>";
    Data.EU_ALLERGENS.forEach(function (a) { html += '<th style="font-size:9px;writing-mode:vertical-lr;text-align:center;padding:4px 2px">' + a + "</th>"; });
    html += "</tr></thead><tbody>";
    recipe.ingredients.forEach(function (ri) {
      var name; var itemAllergens = []; var ing = null;
      if (ri.subRecipeId) {
        var subRec = recipes.find(function (r) { return r.id === ri.subRecipeId; });
        if (!subRec) return;
        name = subRec.name;
        itemAllergens = getAllergensFromRecipeItem(ri, ingredients, recipes);
      } else {
        ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
        if (!ing) return;
        name = ing.name;
        itemAllergens = ing.allergens || [];
      }
      var ingBadge = getRecipeLineBadge(ri, ingredients, recipes);
      html += "<tr><td style=\"font-size:12px\">" + ingBadge + name + "</td>";
      Data.EU_ALLERGENS.forEach(function (a) {
        var has = itemAllergens.indexOf(a) !== -1;
        html += '<td style="text-align:center;font-size:14px">' + (has ? '<span style="color:var(--nc-red)">●</span>' : '<span style="color:var(--nc-gray-200)">○</span>') + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody>";
    table.innerHTML = html;
  }

  function renderCosting(recipe) {
    var ingredients = Ingredients.getIngredients();
    var body = document.getElementById("costing-table-body");
    var foot = document.getElementById("costing-table-foot");
    var totalCost = 0;
    var totalWeight = (recipe.ingredients || []).reduce(function (s, ri) { return s + recipeLineWeightForTotal(ri); }, 0);
    var serving = recipe.serving || 100;
    var n = Recipes.calcRecipeNutrition(recipe, ingredients);
    var missingCostCount = 0;
    var recipes = Recipes.getRecipes();
    var lineItems = (recipe.ingredients || []).map(function (ri) {
      var name; var lineCost; var costPerKg; var isSub = false;
      if (ri.subRecipeId) {
        var subRec = recipes.find(function (r) { return r.id === ri.subRecipeId; });
        if (!subRec) return null;
        var subRecipeUom = recipeOwnUom(subRec, ingredients);
        costPerKg = getSubRecipeCostPerUom(subRec, ingredients, subRecipeUom);
        lineCost = costPerKg * Data.qtyToCostBase(ri.qty, ri.uom || "G", subRecipeUom);
        if (!costPerKg || costPerKg === 0) missingCostCount++;
        totalCost += lineCost;
        return { name: subRec.name, ing: null, subRecipe: subRec, ri: ri, qty: ri.qty, uom: ri.uom || subRecipeUom || "G", lineCost: lineCost, costPerKg: costPerKg, costUom: subRecipeUom, isSub: true };
      }
      var ing = ingredients.find(function (i) { return i.id === ri.ingredientId; });
      if (!ing) return null;
      var costUOM = ing.costUOM || ing.costUom || ing.CostUom || ing.CostUOM || "KG";
      var costBase = Data.qtyToCostBase(ri.qty, ri.uom, costUOM);
      lineCost = (ing.cost || 0) * costBase;
      if (!ing.cost || ing.cost === 0) missingCostCount++;
      totalCost += lineCost;
      return { ing: ing, name: ing.name, ri: ri, qty: ri.qty, uom: ri.uom || "G", lineCost: lineCost, costPerKg: ing.cost || 0, costUom: costUOM, isSub: false };
    }).filter(Boolean);
    body.innerHTML = lineItems.map(function (item) {
      var pctOfTotal = totalCost > 0 ? (item.lineCost / totalCost * 100) : 0;
      var barWidth = Math.min(pctOfTotal, 100);
      var qtyDisplay = item.qty + (item.uom || "G");
      var costCell;
      if (item.isSub) {
        var uomLabel = (item.costUom || "KG");
        var subLabel = isFinite(item.costPerKg) && item.costPerKg > 0 ? "£" + item.costPerKg.toFixed(3) + " per " + uomLabel : "—";
        costCell = "<td><span style=\"font-size:12px;color:var(--nc-gray-600);font-family:var(--nc-mono)\">" + subLabel + "</span></td>";
      } else {
        var uomLabel = (item.costUom || "KG");
        costCell = "<td><span style=\"font-size:12px;font-family:var(--nc-mono);color:var(--nc-gray-600)\" title=\"Edit this ingredient's cost in Ingredient Centre\">" + (item.costPerKg > 0 ? "£" + Number(item.costPerKg).toFixed(3) : "<span style=\"color:var(--nc-gray-300)\">—</span>") + " <span style=\"font-size:11px;color:var(--nc-gray-500)\">per " + uomLabel + "</span></span></td>";
      }
      var lineBadge = getRecipeLineBadge(item.ri, ingredients, recipes);
      return "<tr><td>" + lineBadge + item.name + "</td><td class=\"num\">" + qtyDisplay + "</td>" + costCell +
        '<td class="num bold" style="font-family:var(--nc-mono)">£' + item.lineCost.toFixed(3) + '</td>' +
        '<td style="width:120px"><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:6px;background:var(--nc-gray-100);border-radius:3px;overflow:hidden">' +
        '<div style="height:100%;width:' + barWidth + '%;background:var(--nc-primary);border-radius:3px"></div></div><span class="num" style="font-size:11px;min-width:36px;text-align:right">' + Data.round(pctOfTotal) + "%</span></div></td></tr>";
    }).join("");
    var recipeUom = recipeOwnUom(recipe, ingredients);
    var totalQtyDisplay = (recipeUom === "EACH") ? "1 EACH" : (Data.round(totalWeight) + "g");
    foot.innerHTML = "<tr style=\"border-top:2px solid var(--nc-gray-300)\"><td class=\"bold\">TOTAL</td><td class=\"num bold\">" + totalQtyDisplay + "</td><td></td><td class=\"num bold\" style=\"font-family:var(--nc-mono);font-size:13px\">£" + totalCost.toFixed(2) + "</td><td class=\"num bold\">100%</td></tr>";
    var missingNote = document.getElementById("cost-missing-note");
    if (missingNote) missingNote.innerHTML = missingCostCount > 0 ? '<span style="color:var(--nc-amber)">⚠ ' + missingCostCount + " ingredient(s) have no cost set</span>" : "";
    var costPer100 = totalWeight > 0 ? totalCost / totalWeight * 100 : 0;
    var costPerKg = totalWeight > 0 ? totalCost / totalWeight * 1000 : 0;
    var costPerServing = totalWeight > 0 ? totalCost * (serving / totalWeight) : 0;
    var totalKcal = n.kcal * (totalWeight / 100);
    var costPerKcal = totalKcal > 0 ? totalCost / totalKcal : 0;
    document.getElementById("cost-total").textContent = "£" + totalCost.toFixed(2);
    document.getElementById("cost-per100").textContent = "£" + costPer100.toFixed(2);
    document.getElementById("cost-per-kg").textContent = "£" + costPerKg.toFixed(2);
    document.getElementById("cost-per-serving").textContent = "£" + costPerServing.toFixed(2);
    document.getElementById("cost-serving-note").textContent = "(" + serving + "g serving)";
    document.getElementById("cost-sum-weight").textContent = totalQtyDisplay;
    document.getElementById("cost-sum-total").textContent = "£" + totalCost.toFixed(2);
    document.getElementById("cost-sum-100g").textContent = "£" + costPer100.toFixed(2);
    document.getElementById("cost-sum-kg").textContent = "£" + costPerKg.toFixed(2);
    document.getElementById("cost-sum-serving").textContent = "£" + costPerServing.toFixed(2) + " (" + serving + "g)";
    document.getElementById("cost-sum-kcal").textContent = totalKcal > 0 ? "£" + costPerKcal.toFixed(4) : "—";
    var sorted = lineItems.slice().sort(function (a, b) { return b.lineCost - a.lineCost; }).slice(0, 3);
    document.getElementById("cost-top-ingredients").innerHTML = sorted.map(function (item, idx) {
      var pct = totalCost > 0 ? Data.round(item.lineCost / totalCost * 100) : 0;
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;' + (idx < sorted.length - 1 ? "border-bottom:1px solid var(--nc-gray-200)" : "") + '"><span style="font-size:13px;font-weight:500">' + (idx + 1) + ". " + item.name + "</span><span style=\"font-family:var(--nc-mono);font-size:12px;font-weight:600\">£" + item.lineCost.toFixed(3) + ' <span style="color:var(--nc-gray-400);font-weight:400">(' + pct + "%)</span></span></div>";
    }).join("") || "<p style=\"font-size:12px;color:var(--nc-gray-400)\">No costed ingredients</p>";
    recalcMargins();
  }

  function switchRecipeTab(name) {
    document.querySelectorAll("#recipe-tabs .tab-btn").forEach(function (b) {
      b.classList.toggle("active", b.textContent.toLowerCase().indexOf(name) !== -1);
    });
    document.querySelectorAll(".tab-pane").forEach(function (p) { p.classList.remove("active"); });
    var pane = document.getElementById("tab-" + name);
    if (pane) pane.classList.add("active");
  }

  function triggerRecipePhotoUpload() {
    var el = document.getElementById("recipe-photo-input");
    if (el) el.click();
  }

  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result); };
      reader.onerror = function () { reject(new Error("File read failed")); };
      reader.readAsDataURL(file);
    });
  }

  async function handleRecipePhotoUpload(event) {
    var files = event && event.target && event.target.files;
    if (!files || files.length === 0 || !currentRecipeId) return;
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    if (!r.photography) r.photography = [];
    var toRead = [];
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (!file.type || file.type.indexOf("image/") !== 0) continue;
      toRead.push({ file: file, name: file.name || "photo" });
    }
    try {
      var results = await Promise.all(toRead.map(function (item) {
        return readFileAsDataURL(item.file).then(function (data) {
          return { data: data, name: item.name };
        });
      }));
      results.forEach(function (item) { r.photography.push(item); });
      Recipes.saveRecipe(r);
      renderRecipePhotos();
      showToast("Photo(s) added");
    } catch (err) {
      showToast(err && err.message ? err.message : "Failed to add photo(s)");
    }
    if (event.target) event.target.value = "";
  }

  function removeRecipePhoto(index) {
    if (!currentRecipeId) return;
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r || !r.photography || !r.photography[index]) return;
    r.photography.splice(index, 1);
    Recipes.saveRecipe(r);
    renderRecipePhotos();
    showToast("Photo removed");
  }

  function viewRecipePhoto(index) {
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r || !r.photography || !r.photography[index]) return;
    var src = (r.photography[index].data || r.photography[index]).toString();
    var img = document.getElementById("modal-recipe-photo-img");
    if (img) img.src = src;
    openModal("modal-recipe-photo");
  }

  function renderRecipePhotos() {
    var container = document.getElementById("photography-thumbnails");
    if (!container) return;
    var recipes = Recipes.getRecipes();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    var photos = (r && r.photography) ? r.photography : [];
    container.innerHTML = photos.map(function (p, idx) {
      var src = (p.data || p).toString();
      var name = (p.name || "photo").replace(/"/g, "&quot;");
      return '<div class="photography-thumb" onclick="viewRecipePhoto(' + idx + ')"><img src="' + src + '" alt="' + name + '"><button type="button" class="photography-thumb-remove" onclick="event.stopPropagation();removeRecipePhoto(' + idx + ')" title="Remove">×</button></div>';
    }).join("");
  }

  /** Show/hide the VAT-rate input next to its toggle. scope is "recipe" (single set of ids) or
   * "comparison" (per-card ids, cardIdx required). */
  function toggleVatRateVisibility(scope, cardIdx) {
    var toggleId = scope === "recipe" ? "cost-vat-toggle" : "comp-vat-toggle-" + cardIdx;
    var pctId = scope === "recipe" ? "cost-vat-pct" : "comp-vat-pct-" + cardIdx;
    var toggle = document.getElementById(toggleId);
    var pct = document.getElementById(pctId);
    if (toggle && pct) pct.style.display = toggle.checked ? "" : "none";
  }
  window.toggleVatRateVisibility = toggleVatRateVisibility;

  function recalcMargins() {
    var recipes = Recipes.getRecipes();
    var ingredients = Ingredients.getIngredients();
    var r = recipes.find(function (rec) { return rec.id === currentRecipeId; });
    if (!r) return;
    var totalWeight = (r.ingredients || []).reduce(function (s, ri) { return s + recipeLineWeightForTotal(ri); }, 0);
    // Same total-cost calculation as the "Total Recipe Cost" stat card above — summing only
    // ri.ingredientId lines here (the old version) silently ignored every sub-recipe line,
    // showing £0 cost (and therefore ~100% margin) for any recipe built from sub-recipes.
    var totalCost = getRecipeTotalCost(r, ingredients, recipes);
    var yieldCount = parseFloat(document.getElementById("cost-yield").value) || 1;
    var costPerUnit = totalCost / yieldCount;
    var sellPrice = parseFloat(document.getElementById("cost-sell-price").value);
    var annualVolume = parseFloat(document.getElementById("cost-annual-volume").value);
    // VAT collected on a sale isn't revenue to the business — margin/profit must be measured
    // against the sell price with VAT stripped back out, not the VAT-inclusive price the
    // customer actually pays. Target Sell Price is always entered VAT-inclusive when the
    // toggle is on (that's the real shelf/menu price); "net sell price" below is what's left
    // after HMRC's share, and that's what every downstream margin figure is based on.
    var vatToggle = document.getElementById("cost-vat-toggle");
    var vatOn = vatToggle ? vatToggle.checked : false;
    var vatPct = parseFloat(document.getElementById("cost-vat-pct").value) || 0;
    var netSellPrice = (vatOn && sellPrice > 0) ? sellPrice / (1 + vatPct / 100) : sellPrice;
    var rspExVatEl = document.getElementById("cost-rsp-ex-vat");
    if (rspExVatEl) rspExVatEl.textContent = netSellPrice > 0 ? "£" + netSellPrice.toFixed(2) : "—";
    var profit;
    if (netSellPrice > 0) {
      profit = netSellPrice - costPerUnit;
      var marginPct = (profit / netSellPrice) * 100;
      document.getElementById("margin-profit").textContent = "£" + profit.toFixed(2);
      document.getElementById("margin-pct").textContent = Data.round(marginPct) + "%";
      var marginEl = document.getElementById("margin-pct").parentElement;
      marginEl.style.borderColor = marginPct >= 50 ? "var(--nc-green)" : marginPct >= 30 ? "var(--nc-amber)" : "var(--nc-red)";
      marginEl.style.background = marginPct >= 50 ? "var(--nc-green-light)" : marginPct >= 30 ? "var(--nc-amber-light)" : "var(--nc-red-light)";
    } else {
      profit = null;
      document.getElementById("margin-profit").textContent = "—";
      document.getElementById("margin-pct").textContent = "—";
    }
    var annualProfitEl = document.getElementById("margin-annual-profit");
    if (annualProfitEl) {
      annualProfitEl.textContent = (profit != null && annualVolume > 0) ? "£" + (profit * annualVolume).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
    }
    var targetMargin = parseFloat(document.getElementById("cost-target-margin").value);
    if (targetMargin > 0 && targetMargin < 100) {
      var minPrice = costPerUnit / (1 - targetMargin / 100);
      // Gross this back up to a VAT-inclusive price when VAT's on, so it's directly comparable
      // to Target Sell Price (also always VAT-inclusive) rather than a net figure someone could
      // mistake for the real number to charge.
      if (vatOn) minPrice = minPrice * (1 + vatPct / 100);
      document.getElementById("margin-min-price").textContent = "£" + minPrice.toFixed(2);
    } else {
      document.getElementById("margin-min-price").textContent = "—";
    }
  }

  function exportAllData() {
    var data = JSON.stringify({
      ingredients: Ingredients.getIngredients(),
      recipes: Recipes.getRecipes(),
      projects: getProjects()
    }, null, 2);
    var blob = new Blob([data], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "nutricalc-export.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Data exported");
  }

  function triggerImportFile() {
    var el = document.getElementById("importFile");
    if (el) el.click();
    else if (typeof showToast === "function") showToast("Import not ready");
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result); };
      reader.onerror = function () { reject(new Error("File read failed")); };
      reader.readAsText(file);
    });
  }

  async function importData(event) {
    var file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;
    try {
      var text = await readFileAsText(file);
      var data = JSON.parse(text);
      if (data.ingredients && Ingredients) Ingredients.setIngredients(data.ingredients);
      if (data.recipes && Recipes) Recipes.setRecipes(data.recipes);
      if (data.projects != null) setProjects(data.projects);
      renderAll();
      showToast("Data imported successfully");
    } catch (err) {
      showToast(err && err.message ? err.message : "Invalid JSON or import failed");
    }
    if (event.target) event.target.value = "";
  }

  function renderAll() {
    renderIngredientsTable();
    renderRecipesList();
    var ingredients = Ingredients.getIngredients();
    var recipes = Recipes.getRecipes();
    document.getElementById("ing-count").textContent = ingredients.length;
    document.getElementById("rec-count").textContent = recipes.length;
    document.getElementById("dash-ing-count").textContent = ingredients.length;
    document.getElementById("dash-rec-count").textContent = recipes.length;
    var hfssCount = recipes.filter(function (r) { return HFSS.calcHFSS(r, ingredients).isHFSS; }).length;
    document.getElementById("dash-hfss-count").textContent = hfssCount;
    var recent = document.getElementById("dash-recent-recipes");
    if (recipes.length > 0) {
      var last5 = recipes.slice(-5).reverse();
      recent.innerHTML = "<table class=\"data-table\"><thead><tr><th>Recipe</th><th>Type</th><th>Ingredients</th><th>HFSS</th><th></th></tr></thead><tbody>" + last5.map(function (r) {
        var h = HFSS.calcHFSS(r, ingredients);
        return '<tr class="row-clickable" onclick="openRecipe(\'' + r.id + "')\"><td class=\"bold\">" + r.name + "</td><td>" + r.type + "</td><td>" + r.ingredients.length + "</td><td><span class=\"badge " + (h.isHFSS ? "badge-red" : "badge-green") + "\">" + (h.isHFSS ? "HFSS" : "Non-HFSS") + " (" + h.total + ")</span></td><td><button class=\"btn btn-sm\" onclick=\"event.stopPropagation();openRecipe('" + r.id + "')\">Open</button></td></tr>";
      }).join("") + "</tbody></table>";
    }
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".ingredient-search-wrap")) {
      var dd = document.getElementById("recipe-ing-dropdown");
      if (dd) dd.classList.remove("open");
      var ingLib = document.getElementById("ingredient-library-dropdown");
      if (ingLib) ingLib.classList.remove("open");
    }
    if (!e.target.closest(".recipe-search-wrap")) {
      var recLib = document.getElementById("recipe-library-dropdown");
      if (recLib) recLib.classList.remove("open");
    }
    if (!e.target.closest("#ingredient-actions-menu")) {
      hideIngredientActionsMenu();
    }
    if (!e.target.closest("#recipe-actions-menu")) {
      hideRecipeActionsMenu();
    }
    if (!e.target.closest("#recipe-title-actions-menu")) {
      hideRecipeTitleContextMenu();
    }
    if (e.target.classList.contains("modal-overlay")) {
      e.target.classList.remove("open");
    }
  });

  document.addEventListener("contextmenu", function (e) {
    if (!e.target.closest("#ingredient-actions-menu")) {
      hideIngredientActionsMenu();
    }
    if (!e.target.closest("#recipe-actions-menu")) {
      hideRecipeActionsMenu();
    }
    if (!e.target.closest("#recipe-title-actions-menu")) {
      hideRecipeTitleContextMenu();
    }
  });

  // Excel import: see excel-import.js (modal and executeExcelImport etc. are in excel-import.js)
  // Helpers below are only used by the duplicate Excel block in this file; the modal uses excel-import.js.
  function getColumnMappings() {
    var mappings = {};
    var sel = document.querySelectorAll("#excel-column-mapping select");
    if (!sel.length) return mappings;
    sel.forEach(function (s) {
      var field = (s.getAttribute("data-ncfield") || s.dataset.ncfield);
      if (!field) return;
      var colIdx = parseInt(s.value, 10);
      if (!isNaN(colIdx) && colIdx >= 0) mappings[field] = colIdx;
    });
    return mappings;
  }
  function getExcelCellString(row, colIdx) {
    if (row == null || colIdx == null || colIdx < 0) return "";
    var cell = row[colIdx];
    return (cell == null || cell === "") ? "" : (typeof cell === "string" ? cell : String(cell)).trim();
  }
  function findExistingIngredient(ingredients, name, code) {
    function n(s) { return (s || "").toString().toLowerCase().trim().replace(/\s+/g, " "); }
    if (code && code.trim()) {
      var codeNorm = (code || "").toString().trim().toLowerCase();
      var byCode = ingredients.find(function (i) {
        if (n(i.code) === codeNorm) return true;
        return (i.altCodes || []).some(function (c) { return n(c) === codeNorm; });
      });
      if (byCode) return byCode;
    }
    if (name && name.trim()) return ingredients.find(function (i) { return n(i.name) === n(name); });
    return null;
  }
  var excelSheetData = [];
  var excelUnmatchedPending = [];
  var excelUnmatchedMappings = null;

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
      cat: cat || "Raw Material",
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
      fvn: Data.autoDetectFVN(name, cat),
      // Anything sourced from an import (spreadsheet today, an API feed later) is trusted
      // data, not a work-in-progress draft — only items built by hand via the "+ New
      // Ingredient"/"+ New Recipe" forms should start out "in development".
      approved: true
    };
  }

  function executeExcelImportWithChoice(mergeMode) {
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
      var code = hasCode ? mappedCode : "";
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
      var cat = mappings.cat !== undefined ? (row[mappings.cat] || "").toString().trim() : "";
      var qty = parseNum("qty") || 100;
      var costVal = parseNum("cost");
      var supplierVal = mappings.supplier !== undefined ? (row[mappings.supplier] ?? "").toString().trim() : "";
      var costUomRaw = "";
      if (mappings.costuom !== undefined) costUomRaw = getExcelCellString(row, mappings.costuom);
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
          if (cat) existing.cat = cat;
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
        var merged = {};
        recipeIngredients.forEach(function (ri) {
          var key = "i:" + ri.ingredientId;
          var qtyG = Data.qtyToGrams(ri.qty, ri.uom);
          if (merged[key]) merged[key].qty += qtyG;
          else merged[key] = { ingredientId: ri.ingredientId, qty: qtyG, uom: "G", fvnOverride: null };
        });
        recipeIngredients = Object.keys(merged).map(function (k) { return merged[k]; });
        recipeName = document.getElementById("excel-recipe-name").value.trim() || excelFileName || "Imported Recipe";
        var newRecipe = {
          id: Data.genId(),
          name: recipeName,
          desc: "Imported from " + (excelFileName || "spreadsheet"),
          type: "food",
          recipeType: "finishedProduct",
          serving: 100,
          ingredients: recipeIngredients,
          created: new Date().toISOString(),
          approved: true
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
  }

  function buildIngredientFromUnmatched(item) {
    var code = (item.code || "").toString().trim();
    var code2Val = (item.code2Val || "").toString().trim();
    var altCodes = [];
    if (code2Val && code2Val !== code) altCodes.push(code2Val);
    var costUom = (item.costUom != null && String(item.costUom).trim() !== "") ? String(item.costUom).trim() : "";
    var codeB = (item.codeBVal != null && String(item.codeBVal).trim() !== "") ? String(item.codeBVal).trim() : ((item.codeB != null && String(item.codeB).trim() !== "") ? String(item.codeB).trim() : "");
    return {
      id: Data.genId(),
      name: item.name,
      code: code || code2Val,
      codeB: codeB,
      altCodes: code ? altCodes : [],
      cat: item.cat || "Raw Material",
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
      fvn: Data.autoDetectFVN(item.name, item.cat),
      approved: true
    };
  }

  function showExcelUnmatchedApprovalModal(updatedCount) {
    closeModal("modal-excel-duplicate-choice");
    var listEl = document.getElementById("excel-unmatched-list");
    var msgEl = document.getElementById("excel-unmatched-msg");
    msgEl.textContent = updatedCount > 0
      ? updatedCount + " ingredient(s) were matched and updated. The following were not found in your library. Select which to add as new ingredients:"
      : "The following ingredients were not found in your library. Select which to add as new ingredients:";
    listEl.innerHTML = "";
    excelUnmatchedPending.forEach(function (item, idx) {
      var row = document.createElement("label");
      row.className = "flex align-center gap-8";
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:4px";
      row.style.background = "var(--nc-white)";
      row.style.marginBottom = "4px";
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

  function executeRecipeStructureImport(mappings) {
    var sheetData = (window._excelSheetData && window._excelSheetData.length) ? window._excelSheetData : excelSheetData;
    var fname = window._excelFileName || "";
    var sname = window._excelSheetName || "";
    var ingredients = Ingredients.getIngredients();
    var recipes = Recipes.getRecipes();
    var recipeGroups = {};
    var importedIng = 0, updatedIng = 0, recipeCount = 0;
    function normKey(s) {
      return (s || "").toString().toLowerCase().trim().replace(/\s+/g, " ");
    }
    function looksLikeSectionBreak(itemName) {
      var n = (itemName || "").trim().toUpperCase();
      if (!n) return true;
      if (/^(TOTAL|SUBTOTAL|TOTALS|---|===|\d+)$/.test(n)) return true;
      return false;
    }
    function normParentUom(val) {
      var v = (val || "").toString().trim().toUpperCase();
      if (!v) return "";
      if (v === "L" || v === "LITRE" || v === "LITRES" || v === "ML") return "L";
      if (v === "EACH" || v === "EACHES" || v === "EA" || v === "UNIT" || v === "UNITS") return "EACH";
      if (v === "KG" || v === "KGS" || v === "G" || v === "GRAM" || v === "GRAMS") return "KG";
      if (v === "M" || v === "METER" || v === "METRE" || v === "METERS" || v === "METRES") return "M";
      var opts = Data.UOM_OPTIONS || ["G", "KG", "L", "ML", "M", "EACH"];
      if (opts.indexOf(v) >= 0) return v;
      return "G";
    }
    // Own cost belongs to an item's OWN row in the sheet, not the row where it appears as
    // someone else's child — captured here by normalized name/code. (Scrap is different —
    // it's a parent-level attribute repeated on every child row; see recipeGroups[key].scrapPct.)
    var itemOwnCostByKey = {};
    sheetData.forEach(function (row) {
      function getVal(key) {
        if (mappings[key] === undefined) return "";
        return (row[mappings[key]] ?? "").toString().trim();
      }
      function parseNum(key) {
        if (mappings[key] === undefined) return 0;
        var v = row[mappings[key]];
        if (v === "" || v == null) return 0;
        return parseFloat(String(v).replace(/[^0-9.\-]/g, "")) || 0;
      }
      var parentVal = (mappings.parentdescription !== undefined ? getVal("parentdescription") : "") || (mappings.parent !== undefined ? getVal("parent") : "");
      var itemName = (mappings.itemdescription !== undefined ? getVal("itemdescription") : "") || (mappings.name !== undefined ? getVal("name") : "");
      var code = mappings.code !== undefined ? getVal("code") : "";
      var code2Val = mappings.code2 !== undefined ? getVal("code2") : "";
      // A blank description with a real code is still a real BOM line (e.g. packaging items
      // that only ever appear as a code in the sheet, like "P00022") — don't silently drop
      // it, and use the code itself as the name so it's identifiable and unique (unlike a
      // shared placeholder, which would make two different code-only items collide).
      if (!itemName && (code || code2Val)) itemName = code || code2Val;
      if (!itemName) return;
      if (looksLikeSectionBreak(itemName)) return;
      var qty = parseNum("qty") || 0.1;
      var kj = parseNum("kj");
      var kcal = parseNum("kcal");
      var salt = parseNum("salt");
      var sodium = parseNum("sodium");
      if (kcal > 0 && kj === 0) kj = Math.round(kcal * 4.184);
      if (kj > 0 && kcal === 0) kcal = Math.round(kj / 4.184);
      if (sodium > 0 && salt === 0) salt = Data.round(sodium * 2.5 / 1000, 2);
      var cat = mappings.cat !== undefined ? getVal("cat") || "" : "";
      var componentType = mappings.componenttype !== undefined ? getVal("componenttype") : "";
      if (/direct packaging/i.test(cat)) cat = "Packaging";
      var costVal = parseNum("cost");
      var supplier = mappings.supplier !== undefined ? getVal("supplier") : "";
      var rawCostUom = mappings.costuom !== undefined ? getVal("costuom") : "";
      var costUom = Data.normalizeCostUom ? (Data.normalizeCostUom(rawCostUom) || "") : rawCostUom.toUpperCase();
      var isPackaging = itemName.toLowerCase().indexOf("nf ") === 0 || (Data.isPackagingBySupplier && Data.isPackagingBySupplier(supplier));
      if (isPackaging) {
        cat = "Packaging";
        // Default to EACH only when the sheet didn't already specify a real UOM — some NF
        // items are film/wrap rolls genuinely measured in M, and the sheet's own UOM for that
        // row is authoritative when present.
        if (!costUom) costUom = "EACH";
      }
      var itemData = {
        itemName: itemName,
        code: code,
        code2Val: code2Val,
        qty: qty,
        kj: kj, kcal: kcal, salt: salt,
        fat: parseNum("fat"), sat: parseNum("sat"), carb: parseNum("carb"), sugar: parseNum("sugar"),
        fibre: parseNum("fibre"), protein: parseNum("protein"),
        cat: cat, componentType: componentType, costVal: costVal, costUom: costUom, supplier: supplier,
        // Scrap is THIS ROW's own value — how much of THIS specific input is lost when used
        // in THIS specific recipe (e.g. oil lost to frying vs. a vegetable mix retaining its
        // weight). Per (recipe, line), not per ingredient or per recipe as a whole.
        scrapPct: mappings.scrap !== undefined ? (function () { var v = parseNum("scrap"); return (v >= 0 && v < 100) ? v : 0; })() : 0
      };
      if (costVal > 0) {
        var ownCostNameKey = norm(itemName), ownCostCodeKey = norm(code) || norm(code2Val);
        if (ownCostNameKey) itemOwnCostByKey[ownCostNameKey] = costVal;
        if (ownCostCodeKey) itemOwnCostByKey[ownCostCodeKey] = costVal;
      }
      if (!parentVal) {
        var existing = findExistingIngredient(ingredients, itemName, code);
        if (!existing && code2Val) existing = findExistingIngredient(ingredients, itemName, code2Val);
        if (existing) {
          if (itemData.kj > 0) existing.kj = itemData.kj;
          if (itemData.kcal > 0) existing.kcal = itemData.kcal;
          if (itemData.fat > 0) existing.fat = itemData.fat;
          if (itemData.sat > 0) existing.sat = itemData.sat;
          if (itemData.carb > 0) existing.carb = itemData.carb;
          if (itemData.sugar > 0) existing.sugar = itemData.sugar;
          if (itemData.fibre > 0) existing.fibre = itemData.fibre;
          if (itemData.protein > 0) existing.protein = itemData.protein;
          if (itemData.salt > 0) existing.salt = itemData.salt;
          if (itemData.costVal > 0) existing.cost = itemData.costVal;
          if (itemData.costUom) existing.costUOM = itemData.costUom;
          if (itemData.code) existing.code = itemData.code;
          if (itemData.code2Val && itemData.code2Val !== itemData.code) {
            existing.altCodes = existing.altCodes || [];
            if (existing.altCodes.indexOf(itemData.code2Val) === -1 && existing.code !== itemData.code2Val) existing.altCodes.push(itemData.code2Val);
          }
          if (itemData.supplier) existing.supplier = itemData.supplier;
          if (itemData.cat) existing.cat = itemData.cat;
          updatedIng++;
        } else {
          var altCodes = [];
          if (itemData.code2Val && itemData.code2Val !== itemData.code) altCodes.push(itemData.code2Val);
          var newIng = {
            id: Data.genId(),
            name: itemData.itemName,
            code: itemData.code || itemData.code2Val,
            altCodes: itemData.code ? altCodes : [],
            cat: itemData.cat || "Raw Material",
            kj: itemData.kj, kcal: itemData.kcal,
            fat: itemData.fat, sat: itemData.sat, carb: itemData.carb, sugar: itemData.sugar,
            fibre: itemData.fibre, protein: itemData.protein, salt: itemData.salt,
            cost: itemData.costVal,
            costUOM: itemData.costUom || "KG",
            supplier: itemData.supplier || "",
            allergens: Data.autoDetectAllergens(itemData.itemName, itemData.cat),
            fvn: Data.autoDetectFVN(itemData.itemName, itemData.cat)
          };
          ingredients.push(newIng);
          importedIng++;
        }
        return;
      }
      var parentName = parentVal;
      var parentKey = normKey(parentName);
      if (!parentKey) return;
      if (!recipeGroups[parentKey]) recipeGroups[parentKey] = { name: parentName, code: mappings.parent !== undefined ? getVal("parent") : "", items: [], parentUom: "", parentCost: 0, parentNoofPortions: 0 };
      var rawParentUom = mappings.parentuom !== undefined ? getVal("parentuom") : "";
      if (rawParentUom) {
        var nu = normParentUom(rawParentUom);
        if (nu) recipeGroups[parentKey].parentUom = nu;
      }
      // ParentCost is the recipe/finished-product's own WHOLE-BATCH total cost, not a per-unit
      // cost — e.g. BC's own StandardCost for an item equals ParentCost / ParentNoofPortions
      // exactly. Comparison-only, never overrides the tallied cost.
      if (mappings.parentcost !== undefined) {
        var pc = parseNum("parentcost");
        if (pc > 0 && !recipeGroups[parentKey].parentCost) {
          recipeGroups[parentKey].parentCost = pc;
          recipeGroups[parentKey].parentNoofPortions = mappings.parentnoofportions !== undefined ? parseNum("parentnoofportions") : 0;
        }
      }
      recipeGroups[parentKey].items.push(itemData);
    });
    var groupNames = Object.keys(recipeGroups);
    if (groupNames.length === 1 && sname && normKey(groupNames[0]) === normKey(sname)) {
      if (!confirm("All rows have the same recipe name (\"" + groupNames[0] + "\") which matches the sheet name. Map Recipe (Parent description) to the column with varying recipe names (e.g. Onigiri Salmon, Tom Yum). Cancel to fix mapping, or OK to import anyway.")) return;
    }
    function norm(s) {
      return (s || "").toString().toLowerCase().trim().replace(/\s+/g, " ");
    }
    var parentNamesAsItems = {};
    var parentNamesSet = {};
    var parentCodesSet = {};
    Object.keys(recipeGroups).forEach(function (pk) {
      var g = recipeGroups[pk];
      var n = norm(pk);
      if (n) parentNamesSet[n] = pk;
      var c = norm(g.code);
      if (c) parentCodesSet[c] = pk;
    });
    Object.keys(recipeGroups).forEach(function (parentKey) {
      var parentNorm = norm(parentKey);
      var parentCodeNorm = norm(recipeGroups[parentKey].code);
      Object.keys(recipeGroups).forEach(function (otherParent) {
        if (parentKey === otherParent) return;
        recipeGroups[otherParent].items.forEach(function (item) {
          var itemNorm = norm(item.itemName);
          var itemCodeNorm = norm(item.code) || norm(item.code2Val);
          if (!itemNorm && !itemCodeNorm) return;
          if (itemNorm === parentNorm || itemCodeNorm === parentCodeNorm || itemNorm === parentCodeNorm || itemCodeNorm === parentNorm) {
            parentNamesAsItems[parentKey] = true;
          }
        });
      });
    });
    var singleIngredientParents = {};
    Object.keys(recipeGroups).forEach(function (parentKey) {
      if (!parentNamesAsItems[parentKey]) return;
      var group = recipeGroups[parentKey];
      if (group.items.length !== 1) return;
      var soleItem = group.items[0];
      var soleItemNorm = norm(soleItem.itemName);
      var soleItemCodeNorm = norm(soleItem.code) || norm(soleItem.code2Val);
      if (!soleItemNorm && !soleItemCodeNorm) return;
      if (parentNamesSet[soleItemNorm] || parentCodesSet[soleItemCodeNorm] || parentCodesSet[soleItemNorm] || parentNamesSet[soleItemCodeNorm]) return;
      singleIngredientParents[parentKey] = true;
    });
    var parentToRecipeId = {};
    Object.keys(recipeGroups).forEach(function (parentKey) {
      if (singleIngredientParents[parentKey]) return;
      var group = recipeGroups[parentKey];
      var recipeType = parentNamesAsItems[parentKey] ? "subRecipe" : "finishedProduct";
      var existingRecipe = recipes.find(function (r) { return normKey(r.name) === parentKey; });
      var recId;
      // Sheet cost is captured for every recipe now (not just single-ingredient ones) so it
      // can be shown alongside the tallied cost for comparison — display-only for now, it
      // does not change which value the app actually uses in calculations.
      // ParentCost is a whole-batch total — divide by ParentNoofPortions to get the true
      // per-unit comparison value. Sanity clamp: a real per-unit food cost is never in the
      // thousands — a value this large means the column mapping picked up the wrong cell.
      var normalizedParentCost = group.parentCost > 0 ? (group.parentNoofPortions > 0 ? group.parentCost / group.parentNoofPortions : group.parentCost) : 0;
      var groupOwnCost = (normalizedParentCost > 0 && normalizedParentCost < 1000) ? normalizedParentCost : itemOwnCostByKey[parentKey];
      if (groupOwnCost == null) groupOwnCost = itemOwnCostByKey[norm(group.code)];
      if (existingRecipe) {
        recId = existingRecipe.id;
        existingRecipe.recipeType = recipeType;
        if (group.parentUom) existingRecipe.costUOM = group.parentUom;
        // The sheet's own declared cost is authoritative — trust it over summing this item's
        // own BOM lines, since some items have orphaned/misfiled component rows that don't
        // really belong to them (see backend ImportService.cs for the full reasoning).
        if (groupOwnCost != null && groupOwnCost > 0) { existingRecipe.sheetCost = groupOwnCost; existingRecipe.ownCost = groupOwnCost; }
      } else {
        recId = Data.genId();
        var newRec = {
          id: recId,
          name: group.name || parentKey,
          code: group.code || "",
desc: "Imported from " + (fname || "spreadsheet"),
        type: "food",
        recipeType: recipeType,
        serving: 100,
        ingredients: [],
          created: new Date().toISOString(),
          approved: true
        };
        if (group.parentUom) newRec.costUOM = group.parentUom;
        if (groupOwnCost != null && groupOwnCost > 0) { newRec.sheetCost = groupOwnCost; newRec.ownCost = groupOwnCost; }
        recipes.push(newRec);
        recipeCount++;
      }
      parentToRecipeId[parentKey] = recId;
    });
    Object.keys(recipeGroups).forEach(function (parentKey) {
      if (!singleIngredientParents[parentKey]) return;
      var group = recipeGroups[parentKey];
      var item = group.items[0];
      var existingBase = findExistingIngredient(ingredients, item.itemName, item.code);
      if (!existingBase && item.code2Val) existingBase = findExistingIngredient(ingredients, item.itemName, item.code2Val);
      if (!existingBase) {
        var altCodes = [];
        if (item.code2Val && item.code2Val !== item.code) altCodes.push(item.code2Val);
        existingBase = {
          id: Data.genId(),
          name: item.itemName,
          code: item.code || item.code2Val,
          altCodes: item.code ? altCodes : [],
          cat: item.cat,
          kj: item.kj, kcal: item.kcal,
          fat: item.fat, sat: item.sat, carb: item.carb, sugar: item.sugar,
          fibre: item.fibre, protein: item.protein, salt: item.salt,
          cost: item.costVal,
          costUOM: item.costUom || "KG",
          supplier: item.supplier || "",
          allergens: Data.autoDetectAllergens(item.itemName, item.cat),
          fvn: Data.autoDetectFVN(item.itemName, item.cat),
          approved: true
        };
        ingredients.push(existingBase);
        importedIng++;
      }
      var singleLine = { ingredientId: existingBase.id, qty: item.qty, uom: item.costUom || existingBase.costUOM || "KG", fvnOverride: null, scrapPct: item.scrapPct || 0 };
      // Match an existing recipe by name (like the multi-ingredient path) so a re-upload
      // refreshes this recipe's scrap/qty/UOM in place instead of creating a duplicate with a
      // new id — otherwise anything already referencing the old id would keep pointing stale.
      var existingSingleRec = recipes.find(function (r) { return normKey(r.name) === parentKey; });
      var recId;
      if (existingSingleRec) {
        recId = existingSingleRec.id;
        existingSingleRec.recipeType = "subRecipe";
        existingSingleRec.ingredients = [singleLine];
        // Falls back to the base ingredient's own cost UOM when the sheet didn't supply a
        // Parent UOM — not "G", which would silently shrink this line wherever it's later used.
        existingSingleRec.costUOM = group.parentUom || existingBase.costUOM || "KG";
      } else {
        recId = Data.genId();
        var singleRec = {
          id: recId,
          name: group.name || parentKey,
          code: group.code || "",
          desc: "Imported from " + (fname || "spreadsheet") + " — single-ingredient (links to base)",
          type: "food",
          recipeType: "subRecipe",
          serving: 100,
          costUOM: group.parentUom || existingBase.costUOM || "KG",
          ingredients: [singleLine],
          created: new Date().toISOString(),
          approved: true
        };
        if (group.parentUom) singleRec.costUOM = group.parentUom;
        recipes.push(singleRec);
        recipeCount++;
      }
      var targetRec = existingSingleRec || recipes[recipes.length - 1];
      // Own cost still comes from the item's own separate row when it has one.
      var ownCost = itemOwnCostByKey[parentKey];
      if (ownCost == null) ownCost = itemOwnCostByKey[norm(group.code)];
      if (ownCost != null && ownCost > 0) targetRec.ownCost = ownCost;
      parentToRecipeId[parentKey] = recId;
    });
    Object.keys(recipeGroups).forEach(function (parentKey) {
      if (singleIngredientParents[parentKey]) return;
      var group = recipeGroups[parentKey];
      var recipeIngredients = [];
      var recId = parentToRecipeId[parentKey];
      group.items.forEach(function (item) {
        var itemNorm = norm(item.itemName);
        var itemCodeNorm = norm(item.code) || norm(item.code2Val);
        var itemParentKey = parentNamesSet[itemNorm] || parentCodesSet[itemCodeNorm] || parentCodesSet[itemNorm] || parentNamesSet[itemCodeNorm];
        var isExplicitItem = /^item$/i.test(item.componentType || "");
        var isExplicitRecipe = /^production bom$/i.test(item.componentType || "");
        if (itemParentKey && !isExplicitItem && (isExplicitRecipe || !item.componentType)) {
          var subRecId = parentToRecipeId[itemParentKey];
          if (subRecId) recipeIngredients.push({ subRecipeId: subRecId, qty: item.qty, uom: "KG", fvnOverride: null, scrapPct: item.scrapPct || 0 });
          return;
        }
        var existing = findExistingIngredient(ingredients, item.itemName, item.code);
        if (!existing && item.code2Val) existing = findExistingIngredient(ingredients, item.itemName, item.code2Val);
        if (existing) {
          if (item.kj > 0) existing.kj = item.kj;
          if (item.kcal > 0) existing.kcal = item.kcal;
          if (item.fat > 0) existing.fat = item.fat;
          if (item.sat > 0) existing.sat = item.sat;
          if (item.carb > 0) existing.carb = item.carb;
          if (item.sugar > 0) existing.sugar = item.sugar;
          if (item.fibre > 0) existing.fibre = item.fibre;
          if (item.protein > 0) existing.protein = item.protein;
          if (item.salt > 0) existing.salt = item.salt;
          if (item.costVal > 0) existing.cost = item.costVal;
          if (item.costUom) existing.costUOM = item.costUom;
          if (item.code) existing.code = item.code;
          if (item.code2Val && item.code2Val !== item.code) {
            existing.altCodes = existing.altCodes || [];
            if (existing.altCodes.indexOf(item.code2Val) === -1 && existing.code !== item.code2Val) existing.altCodes.push(item.code2Val);
          }
          if (item.supplier) existing.supplier = item.supplier;
          if (item.cat) existing.cat = item.cat;
          updatedIng++;
          recipeIngredients.push({ ingredientId: existing.id, qty: item.qty, uom: item.costUom || existing.costUOM || "KG", fvnOverride: null, scrapPct: item.scrapPct || 0 });
        } else {
          var altCodes = [];
          if (item.code2Val && item.code2Val !== item.code) altCodes.push(item.code2Val);
          var newIng = {
            id: Data.genId(),
            name: item.itemName,
            code: item.code || item.code2Val,
            altCodes: item.code ? altCodes : [],
            cat: item.cat || "Raw Material",
            kj: item.kj, kcal: item.kcal,
            fat: item.fat, sat: item.sat, carb: item.carb, sugar: item.sugar,
            fibre: item.fibre, protein: item.protein, salt: item.salt,
            cost: item.costVal,
            costUOM: item.costUom || "KG",
            supplier: item.supplier,
            allergens: Data.autoDetectAllergens(item.itemName, item.cat),
            fvn: Data.autoDetectFVN(item.itemName, item.cat),
            approved: true
          };
          ingredients.push(newIng);
          importedIng++;
          recipeIngredients.push({ ingredientId: newIng.id, qty: item.qty, uom: item.costUom || newIng.costUOM || "KG", fvnOverride: null, scrapPct: item.scrapPct || 0 });
        }
      });
      var merged = {};
      recipeIngredients.forEach(function (ri) {
        var qtyG = Data.qtyToGrams(ri.qty, ri.uom);
        var key = ri.ingredientId ? ("i:" + ri.ingredientId) : ("s:" + ri.subRecipeId);
        if (merged[key]) merged[key].qty += qtyG;
        else merged[key] = ri.ingredientId ? { ingredientId: ri.ingredientId, qty: qtyG, uom: "G", fvnOverride: null, scrapPct: ri.scrapPct || 0 } : { subRecipeId: ri.subRecipeId, qty: qtyG, uom: "G", fvnOverride: null, scrapPct: ri.scrapPct || 0 };
      });
      recipeIngredients = Object.keys(merged).map(function (k) {
        var line = merged[k];
        if (!line.ingredientId) return line;
        var ingredient = ingredients.find(function (i) { return i.id === line.ingredientId; });
        var targetUom = ingredient && (ingredient.costUOM || ingredient.costUom) ? (ingredient.costUOM || ingredient.costUom).toUpperCase() : "KG";
        return { ingredientId: line.ingredientId, qty: Data.gramsToUom(line.qty, targetUom), uom: targetUom, fvnOverride: null, scrapPct: line.scrapPct || 0 };
      });
      var r = recipes.find(function (rec) { return rec.id === recId; });
      if (r) r.ingredients = recipeIngredients;
    });
    Ingredients.setIngredients(ingredients);
    Recipes.setRecipes(recipes);
    renderAll();
    document.getElementById("excel-step-2").style.display = "none";
    document.getElementById("excel-step-3").style.display = "";
    document.getElementById("excel-import-btn").style.display = "none";
    var msg = recipeCount + " recipe(s) built";
    if (importedIng > 0) msg += ", " + importedIng + " new ingredient(s)";
    if (updatedIng > 0) msg += ", " + updatedIng + " ingredient(s) updated";
    document.getElementById("excel-result-msg").textContent = msg;
    document.getElementById("excel-result-detail").textContent = window._excelImportLocalFallback
      ? "Imported locally (backend was unavailable)."
      : "Recipes created from parent/child structure. Nutritionals flow from ingredients into recipes.";
    if (window._excelSheetData) { window._excelSheetData = null; window._excelFileName = null; window._excelSheetName = null; window._excelImportLocalFallback = null; }
  }
  window.executeRecipeStructureImportClient = function (mappings) {
    window._excelImportLocalFallback = true;
    executeRecipeStructureImport(mappings);
  };

  // Easter egg: trigger on Enter for any search bar containing "james".
  document.querySelectorAll("input[id*='search']").forEach(function (el) {
    el.addEventListener("keydown", handleIngredientSearchKeydown);
    el.addEventListener("input", handleSearchInputForJames);
  });

  // Attach globals for HTML onclick
  window.switchView = switchView;
  window.filterComparisonSearch = filterComparisonSearch;
  window.toggleComparisonSelect = toggleComparisonSelect;
  window.removeComparisonSelected = removeComparisonSelected;
  window.openCurrentRecipeInComparisons = openCurrentRecipeInComparisons;
  window.comparisonSelectedDragStart = comparisonSelectedDragStart;
  window.comparisonSelectedDragOver = comparisonSelectedDragOver;
  window.comparisonSelectedDrop = comparisonSelectedDrop;
  window.comparisonSelectedDragEnd = comparisonSelectedDragEnd;
  window.renderComparisonTable = renderComparisonTable;
  window.saveCurrentComparison = saveCurrentComparison;
  window.comparisonLineQtyChange = comparisonLineQtyChange;
  window.undoComparisonChange = undoComparisonChange;
  window.saveComparisonChanges = saveComparisonChanges;
  window.comparisonLeaveModalSave = comparisonLeaveModalSave;
  window.comparisonLeaveModalDiscard = comparisonLeaveModalDiscard;
  window.comparisonLeaveModalCancel = comparisonLeaveModalCancel;
  window.renderComparisonSaves = renderComparisonSaves;
  window.openComparisonSave = openComparisonSave;
  window.deleteComparisonSave = deleteComparisonSave;
  window.switchComparisonRecipeTab = switchComparisonRecipeTab;
  window.comparisonCardDragStart = comparisonCardDragStart;
  window.comparisonCardDragOver = comparisonCardDragOver;
  window.comparisonCardDrop = comparisonCardDrop;
  window.comparisonCardDragEnd = comparisonCardDragEnd;
  window.comparisonLineDragStart = comparisonLineDragStart;
  window.comparisonLineDragOver = comparisonLineDragOver;
  window.comparisonLineDrop = comparisonLineDrop;
  window.comparisonLineDragEnd = comparisonLineDragEnd;
  window.comparisonRecalcMargins = comparisonRecalcMargins;
  window.toggleAnnualComparisonCellMode = toggleAnnualComparisonCellMode;
  window.comparisonSaveOverwriteConfirm = comparisonSaveOverwriteConfirm;
  window.comparisonSaveOverwriteAsNew = comparisonSaveOverwriteAsNew;
  window.comparisonSaveOverwriteCancel = comparisonSaveOverwriteCancel;
  window.goBack = goBack;
  window.goBackFromRecipeDetail = goBackFromRecipeDetail;
  window.topbarGoBack = topbarGoBack;
  window.switchReportsTab = switchReportsTab;
  window.openNewProjectModal = openNewProjectModal;
  window.openEditProjectModal = openEditProjectModal;
  window.saveProject = saveProject;
  window.deleteProject = deleteProject;
  window.renderProjects = renderProjects;
  window.openNewIngredientModal = openNewIngredientModal;
  window.openNewRecipeModal = openNewRecipeModal;
  window.showToast = showToast;
  window.showSushiLoading = showSushiLoading;
  window.hideSushiLoading = hideSushiLoading;
  window.testSushiLoading = testSushiLoading;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.saveIngredient = saveIngredient;
  window.syncIngredientDensityField = syncIngredientDensityField;
  window.editIngredient = editIngredient;
  window.onIngredientVersionSelectChange = onIngredientVersionSelectChange;
  window.toggleIngredientSort = toggleIngredientSort;
  window.updateSubRecipeScrapPct = updateSubRecipeScrapPct;
  window.updateRecipeLineScrapPct = updateRecipeLineScrapPct;
  window.selectIngredientVersion = selectIngredientVersion;
  window.openIngredientView = openIngredientView;
  window.openSingleIngredientRecipeView = openSingleIngredientRecipeView;
  window.deleteIngredient = deleteIngredient;
  window.filterIngredients = filterIngredients;
  window.searchIngredientLibrary = searchIngredientLibrary;
  window.loadSampleIngredients = loadSampleIngredients;
  window.loadSampleRecipes = loadSampleRecipes;
  window.loadSampleData = loadSampleData;
  window.setIngredientFilter = setIngredientFilter;
  window.clearAllIngredients = clearAllIngredients;
  window.clearAllIngredientsFromModal = clearAllIngredientsFromModal;
  window.clearAllRecipesFromModal = clearAllRecipesFromModal;
  window.removeDuplicates = removeDuplicates;
  window.searchRecipeLibrary = searchRecipeLibrary;
  window.applyRecipeSearch = applyRecipeSearch;
  window.setRecipeFilter = setRecipeFilter;
  window.handleIngredientRowClick = handleIngredientRowClick;
  window.handleIngredientRowDblClick = handleIngredientRowDblClick;
  window.handleIngredientRowContextMenu = handleIngredientRowContextMenu;
  window.handleIngredientCentreRowClick = handleIngredientCentreRowClick;
  window.handleIngredientCentreRowDblClick = handleIngredientCentreRowDblClick;
  window.handleIngredientCentreRowContextMenu = handleIngredientCentreRowContextMenu;
  window.openSingleIngredientRecipeActionsMenu = openSingleIngredientRecipeActionsMenu;
  window.openIngredientActionsMenu = openIngredientActionsMenu;
  window.hideIngredientActionsMenu = hideIngredientActionsMenu;
  window.handleRecipeContextMenu = handleRecipeContextMenu;
  window.editRecipeFromContext = editRecipeFromContext;
  window.hideRecipeActionsMenu = hideRecipeActionsMenu;
  window.handleRecipeTitleContextMenu = handleRecipeTitleContextMenu;
  window.hideRecipeTitleContextMenu = hideRecipeTitleContextMenu;
  window.showRecipeVersionHistory = showRecipeVersionHistory;
  window.showRecipeWhereUsed = showRecipeWhereUsed;
  window.showIngredientWhereUsed = showIngredientWhereUsed;
  window.openConfigureIngredients = openConfigureIngredients;
  window.saveIngredientDisplayDecimals = saveIngredientDisplayDecimals;
  window.renderIngredientsTable = renderIngredientsTable;
  window.showDuplicates = showDuplicates;
  window.dedupeIngredientGroup = dedupeIngredientGroup;
  window.dedupeRecipeGroup = dedupeRecipeGroup;
  window.removeAllDuplicatesFromModal = removeAllDuplicatesFromModal;
  window.mergeDuplicateIngredientsInAllRecipes = mergeDuplicateIngredientsInAllRecipes;
  window.saveRecipe = saveRecipe;
  window.openRecipe = openRecipe;
  window.openRecipeForEdit = openRecipeForEdit;
  window.toggleRecipeApproved = toggleRecipeApproved;
  window.openEditRecipeNameModal = openEditRecipeNameModal;
  window.toggleExportDropdown = toggleExportDropdown;
  window.closeExportDropdown = closeExportDropdown;
  window.exportRecipeToBCFormExcel = exportRecipeToBCFormExcel;
  window.openAllDataSubmenu = openAllDataSubmenu;
  window.closeAllDataSubmenu = closeAllDataSubmenu;
  window.openOption1Submenu = openOption1Submenu;
  window.closeOption1Submenu = closeOption1Submenu;
  window.openOption2Submenu = openOption2Submenu;
  window.closeOption2Submenu = closeOption2Submenu;
  window.toggleSettingsDropdown = toggleSettingsDropdown;
  window.closeSettingsDropdown = closeSettingsDropdown;
  window.saveEditRecipeName = saveEditRecipeName;
  window.saveRecipeMethodField = saveRecipeMethodField;
  window.switchMethodSource = switchMethodSource;
  window.deleteCurrentRecipe = deleteCurrentRecipe;
  window.openDuplicateRecipeModal = openDuplicateRecipeModal;
  window.confirmDuplicateRecipe = confirmDuplicateRecipe;
  window.filterRecipes = filterRecipes;
  window.renderRecipesList = renderRecipesList;
  window.renderProjectRecipesList = renderProjectRecipesList;
  window.openProjectRecipes = openProjectRecipes;
  window.openNewRecipeModalForProject = openNewRecipeModalForProject;
  window.filterProjectRecipes = filterProjectRecipes;
  window.setProjectRecipeFilter = setProjectRecipeFilter;
  window.renderProjectFolders = renderProjectFolders;
  window.loadProjectFolders = loadProjectFolders;
  window.renderExportTemplates = renderExportTemplates;
  window.openNewExportTemplate = openNewExportTemplate;
  window.openEditExportTemplate = openEditExportTemplate;
  window.saveExportTemplate = saveExportTemplate;
  window.deleteExportTemplate = deleteExportTemplate;
  window.deleteExportTemplateFromModal = deleteExportTemplateFromModal;
  window.addProjectFolder = addProjectFolder;
  window.openProjectFolderDropdown = openProjectFolderDropdown;
  window.closeProjectFolderDropdown = closeProjectFolderDropdown;
  window.renameProjectFolder = renameProjectFolder;
  window.deleteProjectFolder = deleteProjectFolder;
  window.populateProjectSelects = populateProjectSelects;
  function filterWasabiApps() {
    var q = (document.getElementById("wasabi-apps-search") && document.getElementById("wasabi-apps-search").value || "").toLowerCase().trim();
    var grid = document.getElementById("wasabi-apps-grid");
    if (!grid) return;
    var buttons = grid.querySelectorAll(".project-launch-btn");
    buttons.forEach(function (btn) {
      var text = (btn.textContent || "").toLowerCase();
      btn.style.display = !q || text.indexOf(q) !== -1 ? "" : "none";
    });
  }
  function openWasabiAppsHome() {
    // Wasabi Functions homepage — separate static site on the Pi, port 5000 (see
    // C:\Dev\wasabi-home). window.WASABI_HOMEPAGE_URL lets a non-Pi deployment override this.
    var homepageUrl = (typeof window.WASABI_HOMEPAGE_URL !== "undefined" && window.WASABI_HOMEPAGE_URL) ? window.WASABI_HOMEPAGE_URL : "http://192.168.0.50:5000";
    window.location.href = homepageUrl;
  }
  function openTimelineApp() {
    var timelineUrl = (typeof window.WASABI_TIMELINE_URL !== "undefined" && window.WASABI_TIMELINE_URL) ? window.WASABI_TIMELINE_URL : "http://localhost:5002";
    window.location.href = timelineUrl + "/index-working.html";
  }
  function filterProjects() {
    var q = (document.getElementById("projects-search") && document.getElementById("projects-search").value || "").toLowerCase().trim();
    var row = document.getElementById("projects-folders-row");
    if (!row) return;
    var boxes = row.querySelectorAll(".project-folder-box");
    boxes.forEach(function (box) {
      var text = ((box.querySelector(".project-folder-label") && box.querySelector(".project-folder-label").textContent) || box.getAttribute("data-label") || "").toLowerCase();
      box.style.display = !q || text.indexOf(q) !== -1 ? "" : "none";
    });
  }
  window.filterWasabiApps = filterWasabiApps;
  window.openWasabiAppsHome = openWasabiAppsHome;
  window.openTimelineApp = openTimelineApp;
  window.filterProjects = filterProjects;
  window.searchIngredientForRecipe = searchIngredientForRecipe;
  window.addIngredientToRecipe = addIngredientToRecipe;
  window.removeIngredientFromRecipe = removeIngredientFromRecipe;
  window.removeSubRecipeFromRecipe = removeSubRecipeFromRecipe;
  window.addSubRecipeToRecipe = addSubRecipeToRecipe;
  window.updateSubRecipeQty = updateSubRecipeQty;
  window.updateSubRecipeUom = updateSubRecipeUom;
  window.updateIngredientQty = updateIngredientQty;
  window.undoRecipeChange = undoRecipeChange;
  window.saveCurrentRecipeChanges = saveCurrentRecipeChanges;
  window.recipeLeaveModalSave = recipeLeaveModalSave;
  window.recipeLeaveModalDiscard = recipeLeaveModalDiscard;
  window.recipeLeaveModalCancel = recipeLeaveModalCancel;
  window.updateIngredientUom = updateIngredientUom;
  window.recalcCurrentRecipe = recalcCurrentRecipe;
  window.switchRecipeTab = switchRecipeTab;
  window.triggerRecipePhotoUpload = triggerRecipePhotoUpload;
  window.handleRecipePhotoUpload = handleRecipePhotoUpload;
  window.removeRecipePhoto = removeRecipePhoto;
  window.viewRecipePhoto = viewRecipePhoto;
  window.recalcMargins = recalcMargins;
  window.recalcMarginFromPct = recalcMargins;
  window.exportAllData = exportAllData;
  window.importData = importData;
  window.triggerImportFile = triggerImportFile;
  window.handleIngredientSearchKeydown = handleIngredientSearchKeydown;

  // Lightweight frontend login helpers (prep for future backend auth)
  function getCurrentUser() {
    try {
      return JSON.parse(sessionStorage.getItem("ncUser") || "null");
    } catch (e) {
      return null;
    }
  }
  function setCurrentUser(user) {
    if (!user) {
      sessionStorage.removeItem("ncUser");
    } else {
      sessionStorage.setItem("ncUser", JSON.stringify(user));
    }
    var emailEl = document.getElementById("user-email");
    var logoutBtn = document.getElementById("logout-btn");
    if (emailEl) emailEl.textContent = user && user.email ? user.email : "";
    if (logoutBtn) logoutBtn.style.display = user ? "" : "none";
  }
  function login() {
    var emailInput = document.getElementById("login-email");
    var passwordInput = document.getElementById("login-password");
    var email = (emailInput && emailInput.value || "").trim();
    var password = (passwordInput && passwordInput.value || "").trim();
    if (!email) {
      showToast("Email is required to sign in");
      if (emailInput) emailInput.focus();
      return;
    }
    if (email !== "James@Murphy.com" || password !== "James123") {
      showToast("Invalid email or password");
      if (emailInput) emailInput.focus();
      return;
    }
    setCurrentUser({ email: email });
    switchView("dashboard");
    showToast("Signed in as " + email);
  }
  function handleLoginSubmit(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    login();
  }
  function skipLogin() {
    setCurrentUser({ email: "Guest" });
    switchView("dashboard");
    showToast("Skipped sign in — using as guest");
  }
  function logout() {
    setCurrentUser(null);
    switchView("login");
  }
  window.login = login;
  window.handleLoginSubmit = handleLoginSubmit;
  window.skipLogin = skipLogin;
  window.logout = logout;

  window.handleExportExcelFileSelect = handleExportExcelFileSelect;
  window.excelEditorSwitchSheet = excelEditorSwitchSheet;
  window.excelEditorSelectColumn = excelEditorSelectColumn;
  window.saveExcelFromEditor = saveExcelFromEditor;
  window.openExcelEditorFromSaved = openExcelEditorFromSaved;
  window.deleteExcelSave = deleteExcelSave;

  try {
    renderAll();
    renderAllergenCheckboxes([]);
    // Fetch the shared project-folder tree once at startup (not just when the Projects page is
    // opened) so the recipe-edit "Project" dropdown has real options from the start, not an
    // empty list until someone happens to visit Projects first.
    loadProjectFolders().then(function () { if (typeof populateProjectSelects === "function") populateProjectSelects(); });
    bindExportExcelDropzone();
    // Deep link: ?recipe=<code> opens that recipe directly on load, taking priority over the
    // normal last-view restore — lets an external list (e.g. a review checklist) link straight
    // into a specific recipe instead of just showing its code for a manual search.
    var deepLinkCode = new URLSearchParams(window.location.search).get("recipe");
    var deepLinkRecipe = deepLinkCode ? Recipes.getRecipes().find(function (r) { return r.code === deepLinkCode; }) : null;
    if (deepLinkRecipe) {
      openRecipe(deepLinkRecipe.id);
    } else {
      restoreLastView();
    }
  } catch (err) {
    console.error("Startup render error:", err);
    if (typeof showToast === "function") showToast("Load error — try Import Data to restore");
  }
})();
