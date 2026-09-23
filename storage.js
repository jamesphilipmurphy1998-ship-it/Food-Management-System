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
  // See "Diffing has to compare..." comment below for why these exist. Declared here (not
  // just where they're first used) so the boot-time seed call right after this can reach them —
  // `var` hoists the name but not the assignment, so seeding any earlier than this throws.
  var lastSyncedRecipesById = new Map();
  var lastSyncedIngredientsById = new Map();
  // Seed the diff baselines from whatever was in localStorage — refreshFromApi() reseeds them
  // properly from the server a moment later; this just avoids every record looking "new" and
  // getting needlessly re-POSTed if an edit somehow lands before that first refresh resolves.
  seedSyncSnapshots(recipesCache, ingredientsCache);

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
    var text = await response.text();
    var parsed = text ? JSON.parse(text) : null;
    if (!response.ok) {
      // status/body surfaced on the error so callers (e.g. the 409-conflict handling in
      // flushRecipeSaves/flushIngredientSaves) can react to *why* it failed, not just that it did.
      var err = new Error("HTTP " + response.status);
      err.status = response.status;
      err.body = parsed;
      throw err;
    }
    return parsed;
  }

  function queueSaveIngredients() {
    if (!useApiMode || !API_BASE_URL || ingredientsSaveQueued) return;
    ingredientsSaveQueued = true;
    setTimeout(function () {
      ingredientsSaveQueued = false;
      apiRequestAsync("PUT", "/ingredients", ingredientsCache).then(function () {
        // Bulk PUT doesn't hand back real per-record UpdatedAt stamps (its response is just a
        // count), so this can't set a perfectly accurate baseline — but it at least re-syncs the
        // CONTENT, so a routine per-record edit right after a bulk import diffs correctly instead
        // of comparing against a now-stale pre-import snapshot.
        ingredientsCache.forEach(function (r) { if (r && r.id) lastSyncedIngredientsById.set(r.id, snapshotRecord(r)); });
      }).catch(function () {
        localSetIngredients(ingredientsCache);
      });
    }, 0);
  }

  function queueSaveRecipes() {
    if (!useApiMode || !API_BASE_URL || recipesSaveQueued) return;
    recipesSaveQueued = true;
    setTimeout(function () {
      recipesSaveQueued = false;
      apiRequestAsync("PUT", "/recipes", recipesCache).then(function () {
        recipesCache.forEach(function (r) { if (r && r.id) lastSyncedRecipesById.set(r.id, snapshotRecord(r)); });
      }).catch(function () {
        localSetRecipes(recipesCache);
      });
    }, 0);
  }

  // ─── Per-record saves with optimistic concurrency (multi-user save rework, step 2) ───
  // Routine interactive edits (a qty change, an approve toggle, etc.) now save just the one
  // record that changed, via PUT /api/{recipes|ingredients}/{id} with the UpdatedAt stamp the
  // client last saw for it — the server rejects with 409 if someone else saved that record in
  // the meantime, instead of this silently overwriting their change (see backend Program.cs
  // for the server-side half of this). The bulk PUT above is kept for genuinely bulk operations
  // (Excel/BOM import, "clear all", etc.) — setRecipes/setIngredients fall back to it when a
  // single call changes more than BULK_THRESHOLD records, since firing that many individual
  // requests would be slower and spammier than one bulk upsert for a deliberate mass-sync.
  var BULK_THRESHOLD = 5;
  var pendingRecipeSaves = new Map(); // id -> { record, baseUpdatedAt, isNew }
  var pendingIngredientSaves = new Map();
  var recipeFlushQueued = false;
  var ingredientFlushQueued = false;

  // Diffing has to compare against an INDEPENDENT copy of "what the server last confirmed",
  // not against ingredientsCache/recipesCache directly — ingredients.js/recipes.js load their
  // arrays from Storage.getIngredients()/getRecipes() by reference (not a copy) and mutate
  // records in place before calling setIngredients/setRecipes. If the diff baseline were the
  // same live array, a record already mutated in place would show "no change" against itself,
  // and the save would silently never fire. These maps hold cloned snapshots instead, updated
  // only when we actually know the server's state (after a successful save, a conflict
  // response, or a fresh refreshFromApi) — never aliased to what the rest of the app is editing.
  // (declared up near ingredientsCache/recipesCache so the boot-time seed call can reach them)

  function snapshotRecord(r) { return JSON.parse(JSON.stringify(r)); }
  function seedSyncSnapshots(recipesArr, ingredientsArr) {
    lastSyncedRecipesById.clear();
    (recipesArr || []).forEach(function (r) { if (r && r.id) lastSyncedRecipesById.set(r.id, snapshotRecord(r)); });
    lastSyncedIngredientsById.clear();
    (ingredientsArr || []).forEach(function (r) { if (r && r.id) lastSyncedIngredientsById.set(r.id, snapshotRecord(r)); });
  }

  /** True if the meaningful fields of a record changed — ignores updatedAt (the server's own
   * concurrency stamp, never something client code intentionally mutates). */
  function recordChanged(a, b) {
    if (!b) return true;
    var strip = function (r) { var c = Object.assign({}, r); delete c.updatedAt; return c; };
    return JSON.stringify(strip(a)) !== JSON.stringify(strip(b));
  }

  function diffChangedRecords(newArr, lastSyncedById) {
    var changed = [];
    newArr.forEach(function (r) {
      if (!r || !r.id) return;
      var old = lastSyncedById.get(r.id);
      if (recordChanged(r, old)) changed.push({ record: r, old: old });
    });
    return changed;
  }

  function queueRecipeSave(record, old) {
    pendingRecipeSaves.set(record.id, { record: record, baseUpdatedAt: old ? old.updatedAt : null, isNew: !old });
    if (recipeFlushQueued) return;
    recipeFlushQueued = true;
    setTimeout(flushRecipeSaves, 0);
  }
  function queueIngredientSave(record, old) {
    pendingIngredientSaves.set(record.id, { record: record, baseUpdatedAt: old ? old.updatedAt : null, isNew: !old });
    if (ingredientFlushQueued) return;
    ingredientFlushQueued = true;
    setTimeout(flushIngredientSaves, 0);
  }

  function applySavedRecord(cacheArr, snapshotMap, record) {
    var idx = cacheArr.findIndex(function (r) { return r.id === record.id; });
    if (idx >= 0) cacheArr[idx] = record; else cacheArr.push(record);
    snapshotMap.set(record.id, snapshotRecord(record));
  }

  function notifyConflict(kind, name) {
    if (typeof window.showToast === "function") {
      window.showToast((name || "A record") + " was changed by someone else — refreshed with their version");
    }
    console.warn("[storage] save conflict on " + kind + ": " + (name || ""));
  }

  function flushRecipeSaves() {
    recipeFlushQueued = false;
    if (!useApiMode || !API_BASE_URL || pendingRecipeSaves.size === 0) return;
    var batch = Array.from(pendingRecipeSaves.values());
    pendingRecipeSaves.clear();
    Promise.all(batch.map(function (entry) {
      var record = Object.assign({}, entry.record, { updatedAt: entry.baseUpdatedAt });
      var path = entry.isNew ? "/recipes" : "/recipes/" + encodeURIComponent(record.id);
      var method = entry.isNew ? "POST" : "PUT";
      return apiRequestAsync(method, path, record).then(function (saved) {
        if (saved) applySavedRecord(recipesCache, lastSyncedRecipesById, saved);
      }).catch(function (err) {
        if (err && err.status === 409 && err.body) {
          applySavedRecord(recipesCache, lastSyncedRecipesById, err.body);
          notifyConflict("recipe", err.body.name);
        }
        // Other errors: local cache already reflects the attempted edit; best-effort, no retry
        // loop, same tolerance as the rest of this module.
      });
    })).then(function () {
      localSetRecipes(recipesCache);
      emitStorageUpdated("recipes", recipesCache);
    });
  }

  function flushIngredientSaves() {
    ingredientFlushQueued = false;
    if (!useApiMode || !API_BASE_URL || pendingIngredientSaves.size === 0) return;
    var batch = Array.from(pendingIngredientSaves.values());
    pendingIngredientSaves.clear();
    Promise.all(batch.map(function (entry) {
      var record = Object.assign({}, entry.record, { updatedAt: entry.baseUpdatedAt });
      var path = entry.isNew ? "/ingredients" : "/ingredients/" + encodeURIComponent(record.id);
      var method = entry.isNew ? "POST" : "PUT";
      return apiRequestAsync(method, path, record).then(function (saved) {
        if (saved) applySavedRecord(ingredientsCache, lastSyncedIngredientsById, saved);
      }).catch(function (err) {
        if (err && err.status === 409 && err.body) {
          applySavedRecord(ingredientsCache, lastSyncedIngredientsById, err.body);
          notifyConflict("ingredient", err.body.name);
        }
      });
    })).then(function () {
      localSetIngredients(ingredientsCache);
      emitStorageUpdated("ingredients", ingredientsCache);
    });
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
      // Server is the ground truth right after a fetch — reseed both diff baselines from it.
      seedSyncSnapshots(recipesCache, ingredientsCache);
    } catch (e) {
      // Keep local cache on network/API errors.
    } finally {
      refreshInFlight = false;
    }
  }

  /** Set each recipe ingredient line's uom to match the ingredient's cost UOM when we have the ingredient. */
  function normalizeRecipeIngredientUoms(recipes, ingredients) {
    if (!Array.isArray(recipes) || !Array.isArray(ingredients)) return recipes;
    // Map lookup instead of .find() per line — with ~1,100 recipes x several lines each
    // against 400+ ingredients, the old linear scan meant roughly a million comparisons on
    // every refresh; this makes each lookup O(1) instead.
    var byId = new Map();
    ingredients.forEach(function (i) { byId.set(i.id, i); });
    return recipes.map(function (r) {
      if (!r || !Array.isArray(r.ingredients)) return r;
      var lines = r.ingredients.map(function (ri) {
        if (!ri.ingredientId) return ri;
        var ing = byId.get(ri.ingredientId);
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
    var list = Array.isArray(arr) ? arr : [];
    var changed = diffChangedRecords(list, lastSyncedIngredientsById);
    ingredientsCache = list;
    localSetIngredients(ingredientsCache);
    if (changed.length === 0) return;
    if (changed.length > BULK_THRESHOLD) {
      // A big batch (import, "clear all", etc.) — one bulk upsert beats firing dozens+ of
      // individual concurrency-checked requests for what's really one deliberate sync operation.
      queueSaveIngredients();
    } else {
      changed.forEach(function (c) { queueIngredientSave(c.record, c.old); });
    }
  }
  function getRecipes() { return recipesCache; }
  function setRecipes(arr) {
    var list = Array.isArray(arr) ? arr : [];
    list = normalizeRecipeIngredientUoms(list, ingredientsCache);
    var changed = diffChangedRecords(list, lastSyncedRecipesById);
    recipesCache = list;
    localSetRecipes(recipesCache);
    if (changed.length === 0) return;
    if (changed.length > BULK_THRESHOLD) {
      queueSaveRecipes();
    } else {
      changed.forEach(function (c) { queueRecipeSave(c.record, c.old); });
    }
  }

  // Real deletes, separate from setIngredients/setRecipes — the PUT endpoints are upserts and
  // never remove a row the caller didn't send, specifically so a stale cached array can't
  // silently wipe out records added elsewhere. Deleting something has to say so explicitly.
  function deleteIngredient(id) {
    ingredientsCache = ingredientsCache.filter(function (i) { return i.id !== id; });
    localSetIngredients(ingredientsCache);
    if (useApiMode && API_BASE_URL) {
      apiRequestAsync("DELETE", "/ingredients/" + encodeURIComponent(id), null).catch(function () {});
    }
  }
  function deleteRecipe(id) {
    recipesCache = recipesCache.filter(function (r) { return r.id !== id; });
    localSetRecipes(recipesCache);
    if (useApiMode && API_BASE_URL) {
      apiRequestAsync("DELETE", "/recipes/" + encodeURIComponent(id), null).catch(function () {});
    }
  }

  // Initial non-blocking refresh from backend.
  setTimeout(function () { refreshFromApi(); }, 0);

  return {
    getIngredients: getIngredients,
    setIngredients: setIngredients,
    getRecipes: getRecipes,
    setRecipes: setRecipes,
    deleteIngredient: deleteIngredient,
    deleteRecipe: deleteRecipe,
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
