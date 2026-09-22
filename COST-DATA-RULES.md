# Cost & Accuracy Data Rules

Reference for how recipe/ingredient costing actually works in this codebase, and how to verify
it. Read this before touching cost calculation, import logic, or running an accuracy review —
it exists so the same investigation doesn't have to be redone from scratch every time.

## 1. Environments — know which one you're touching

There are **two separate databases**. Confusing them wastes time and risks writing test data
into the wrong place.

| | Frontend | Backend | Database |
|---|---|---|---|
| **Local dev** | `localhost:5005` (static-server.ps1) | `localhost:5055` (`dotnet run`, applies `backend/Properties/launchSettings.json`) | Cloud Supabase Postgres (`aws-1-eu-west-1.pooler.supabase.com`) |
| **Pi (production)** | `192.168.0.50:5001` | same process, port 5001 | Local Postgres **on the Pi itself** (`Host=localhost;Database=nutricost`) |

- These are genuinely different data. Don't assume a fix or a test verified on one is verified
  on the other — check both.
- Local dev backend must be started with `dotnet run` from `backend/`, not the raw `.exe`
  directly — running the exe skips `launchSettings.json` and defaults to port 5001 with auth
  enabled instead of port 5055 with `NUTRICOST_AUTH_MODE=disabled`. If you do need to run the
  exe directly, set `DOTNET_ROOT`, `ASPNETCORE_URLS=http://localhost:5055`, and
  `NUTRICOST_AUTH_MODE=disabled` yourself first.
- Before writing any test data anywhere, confirm which database you're actually pointed at.
  `curl .../api/recipes` and check the result — don't assume from the port number alone.

## 2. Deployment — two files, one command each, never partial

- **Frontend** (`app.js`, `index.html`, etc.): `scp` the changed files to
  `/opt/nutricost/` on the Pi. No service restart needed. **Always push every frontend file
  that changed together** — pushing `app.js` without a matching `index.html` (or vice versa)
  leaves the two out of sync and silently breaks whatever DOM elements the new JS expects but
  the old HTML doesn't have. Verify with `md5sum` on both sides after deploying.
- **Backend**: `dotnet publish -c Release -r linux-arm64 --self-contained true -o publish-pi`,
  then on the Pi: stop the `nutricost` service, copy both `NutriCost.Api` (launcher) and
  `NutriCost.Api.dll`, `chmod +x`, start the service. Full steps in `PI-RUNBOOK.md`.
- After any deploy, verify with a real functional test (not just "service is active") — POST a
  throwaway row through `/api/imports/recipe-structure` and check the response fields, or hit
  the actual page. Clean up any test record you create (see §6).

## 3. The cost model — read this before changing any cost function

Three different numbers can exist for the same recipe. Know which one you're looking at.

- **`ownCost`** — a cached, top-level cost stored directly on the recipe record. Only ever
  written by an import (`backend/ImportService.cs`, or the older client-side path in `app.js`).
  Nothing else ever sets it. It represents "Business Central's declared cost for this exact
  item," taken from the sheet's `ParentCost / ParentNoofPortions` (see §4) — **not** derived
  from the recipe's own ingredient lines.
- **The "used" cost** (what's actually displayed and used everywhere) — `getSubRecipeCostPerUom`
  / `getSubRecipeTotalCost` check `ownCost` first and return it directly if it's present and
  `> 0`. Only when `ownCost` is unset/zero do they fall through to computing live from the
  recipe's own ingredient lines. **This fallback is correct and intentional, not a bug** — a
  recipe with no cached `ownCost` still shows an accurate cost, it's just derived live instead
  of cached. See §7 for what this means for the accuracy review.
- **The forced "tally"** — `getSubRecipeCostPerUom(r, ingredients, uom, null, true)` — the 4th
  arg (`forceTally`) skips the `ownCost` shortcut entirely, at every level of nesting, and
  recomputes purely from ingredient lines. This is diagnostic-only: it's what the grey number
  next to the dark "used" number on the recipe page is, and it's what the accuracy scan compares
  `ownCost` against. **`forceTally` propagates recursively** — forcing a tally on a parent also
  forces it on every nested sub-recipe, even ones with a perfectly valid `ownCost` of their own.
  This means a forced tally through a recipe with one bad/malformed BOM line will always look
  wrong, even if the recipe's real, displayed `ownCost` is fine.

Two different scrap formulas are used depending on context — this was verified against 90+ BOM
entries, don't "fix" it back to one formula:
- **Weight-ratio recipes** (KG/G/L/ML): cost stays raw; scrap shrinks the **weight denominator**
  instead (`costPerKg = Σqty×cost / Σqty×(1-scrap%)`).
- **EACH/M recipes** (no weight-normalization step downstream): scrap has to inflate the
  **cost numerator** instead (`× 100/(100-scrap%)`), or it has no effect at all.
- The live-tally-only additive path (`getSubRecipeTotalCostAdditive`, used for `forceTally`)
  applies scrap additively to every line unconditionally — this is a separate, dedicated
  calculation and does not double up with the weight-ratio path above.

A recipe's own UOM (`recipeOwnUom`) falls back to its single ingredient's UOM only when it has
exactly one line with `qty === 1` or no UOM set. This fallback is what lets a malformed BOM line
silently corrupt a wrapper recipe's declared unit — check this first when a single-ingredient
recipe's cost looks wrong.

## 4. Reading the source BOM sheet correctly

`ParentCost` in the sheet (`New BOM (BC)` tab) is a **whole-batch total**, not a per-unit cost.
Always divide by `ParentNoofPortions` before comparing it to anything the app shows:

```
sheet's true per-unit cost = ParentCost / ParentNoofPortions   (if ParentNoofPortions > 0)
                            = ParentCost                        (otherwise, already per-unit)
```

Getting this wrong (comparing raw `ParentCost` directly) produces false-positive mismatches of
100x+ magnitude for any recipe whose batch size isn't 1. This was the single biggest source of
wasted investigation time this session — check this first, always, before concluding a sheet
value disagrees with the app.

Sanity-clamp any parsed cost — a real per-unit food cost is never in the thousands; a value that
large means the column mapping picked up the wrong cell, not a real cost.

## 5. Known data patterns — recognize these, don't re-diagnose them

- **Single-component wrapper recipes**: exactly 1 ingredient line, qty effectively 1:1. The
  recipe's cost is *by construction* identical to that one ingredient's cost — there is nothing
  to compare, it can never be "wrong." Don't flag these in an accuracy review; exclude them from
  the mismatch list up front (see §7).
- **`P00xxx` codes**: Business Central's own blank-description BOM export gap. Every one of
  these has exactly 1 BOM line with a blank `ItemDescription` in the raw sheet — confirmed
  across all 63 in the dataset. Source-side, not fixable on our end.
- **`-2` / `-B` suffixed codes**: alternate/revision versions of an existing item, deliberately
  separate from the base code. Roughly half are single-line wrappers (see above), the rest are
  real multi-line recipes that just never got a cached `ownCost` — still live-tally correctly.
- **Delisted items** (name contains "delist", allow for the sheet's own typo "Delsited"): these
  drop out of the *current* item master entirely once BC delists them, so they won't be found
  when cross-checking against the current sheet. That's expected — the app correctly retains
  them for historical recipes that still reference their old cost.
- **Dual ingredient+recipe records** (same code exists as both a standalone Ingredient and a
  separate Recipe): a real pattern in the live data, correlated with "NF" packaging items with
  stale costs. When you find one, check both records' costs against the sheet independently.
- **A recipe with a malformed/orphaned BOM line but a clean top-level cost**: the app already
  handles this correctly by trusting `ownCost` over summing the bad lines (see §3) — this is
  fine for the *displayed* cost, but poisons any `forceTally` diagnostic through that recipe,
  and taints anything that uses it as a sub-recipe (see §7). Fixing it means editing the actual
  BOM lines in the live data (removing the bad ones), not touching code.

## 6. Testing discipline

- **Never write test data without first confirming which environment you're in** (§1). If
  you're not certain, check via `curl` before touching anything.
- **Every test write must be cleaned up before moving on** — recipe/ingredient creations,
  qty edits that overwrite a real record's lines, everything. `PUT /api/recipes` and
  `PUT /api/ingredients` are **upsert-only, they never delete** — removing a stray record
  requires the dedicated `DELETE /api/recipes/{id}` / `DELETE /api/ingredients/{id}` endpoint.
- If a test import matches an **existing** recipe by code/name, it **replaces that recipe's
  entire ingredient list** with the test row — snapshot the original first
  (`GET /api/recipes`, find by code, save the object) so it can be restored exactly afterward,
  not just have the test ingredient deleted.
- Prefer testing against a copy of live data in a Node harness (see §8) over writing to a real
  database at all, when the question can be answered offline.
- Verify claims against real UI screenshots before reporting a number as fact, when the user
  can trivially check it. Silent scan-script bugs (wrong function signature, wrong global
  reference, comparing incompatible cost metrics) have each cost significant time this session
  before being caught this way.

## 7. Running an accuracy review — the correct method

1. Pull fresh `recipes` and `ingredients` from whichever environment you actually mean to
   check (§1) — never reuse a stale pull.
2. Compare each recipe's `ownCost` against `getSubRecipeCostPerUom(r, ingredients, recipeOwnUom(r, ingredients), null, true)`
   (the forced tally) — **only** for recipes that have a stored `ownCost > 0`. See `.scan/accuracy_scan2.js`.
3. **Exclude, don't just skip, every one of these buckets** — and report all of them, don't let
   any recipe silently vanish from the count without a labeled reason:
   - Known-bad codes (confirmed broken/stale source data — maintained as
     `KNOWN_BAD_RECIPE_CODES` in `.scan/accuracy_scan2.js`; remove an entry once its underlying
     data is actually fixed, don't leave stale exclusions blanket-hiding things forever).
   - Tainted — any recipe that consumes a known-bad ingredient/recipe at any depth
     (recursive, memoized check — see `isTainted` in the scan script).
   - Delisted.
   - No code / `"NEW"` draft placeholders.
   - No `ownCost` **and** the live-tally fallback also comes back 0 (genuinely zero-cost —
     rare, e.g. Water, or actual dummy/junk records).
4. Of the recipes with no `ownCost` but a working live-tally fallback: **split single-component
   wrappers (§5, can never be wrong) from real multi-line recipes** (worth tracking, since a
   future recalculation could genuinely drift). Don't report the wrappers as "needs review."
5. For every remaining mismatch, verify against the source sheet directly (§4) before concluding
   anything — most turn out to be the stored cost being a byte-for-byte match to the sheet, i.e.
   the sheet itself is just stale relative to current ingredient prices, not an app bug.
6. Do the same `ownCost`/cost comparison for **ingredients** against the sheet's `New Item (BC)`
   item master directly — this is a separate, simpler check (no tally/forceTally involved,
   ingredients don't have sub-lines) and has so far always come back 100% clean.
7. Reconcile the final counts to the total pulled record count exactly. If they don't add up,
   something is being silently dropped somewhere in the filter chain — find it before reporting
   a percentage.

## 8. Node harness pattern for offline analysis

To run any of the app's real cost-calculation functions outside the browser (for scripted
verification against a data pull, without touching a live database):

```js
global.window = global;
global.document = { /* stub getElementById/querySelector[All]/createElement/addEventListener as no-ops returning null/[] */ };
global.localStorage = { /* stub get/set/removeItem against an in-memory object */ };
global.NutriCalcStorage = { getRecipes: () => recipesData, getIngredients: () => ingredientsData, setRecipes(){}, setIngredients(){}, /* ...no-op the rest */ };

// load in dependency order
eval(fs.readFileSync("data.js", "utf8"));
eval(fs.readFileSync("recipes.js", "utf8"));
eval(fs.readFileSync("ingredients.js", "utf8"));

// expose whatever app.js functions you need before its closing `})();`
var appCode = fs.readFileSync("app.js", "utf8");
appCode = appCode.replace(/\}\)\(\);$/, '\n  window.__expose = getRecipeTotalCost;\n})();');
eval(appCode);
```

- Write this to a real `.js` file and run with `node file.js` — inline `node -e "..."` mangles
  Windows backslash paths inside nested shell quoting.
- A one-time harmless `Startup render error` from `app.js`'s own DOMContentLoaded init (calling
  into the stubbed `document`) is expected and can be ignored.
- Scratch scripts belong in `.scan/` (gitignored) — pulled JSON snapshots, working scripts, CSV
  exports. Nothing there is committed; clean up ad-hoc test scripts once their finding has been
  written up here or elsewhere durable.
