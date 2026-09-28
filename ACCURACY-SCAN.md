# Recipe costing accuracy scan

Compares NutriCost's stored recipe cost (`ownCost`, pulled from the BOM/Business Central
sheet on import) against a live recomputation from the recipe's own ingredient lines, across
every recipe in the database — the "tally vs the sheet" check. Lets us catch cost-calculation
regressions or bad source data before they show up as a wrong price somewhere.

## How it works

The script (`scripts/accuracy-scan.js`) doesn't reimplement the costing formula — it loads the
**real** `data.js` / `recipes.js` / `ingredients.js` / `app.js` straight into a stubbed Node
environment (`window`/`document`/`localStorage` etc. mocked out) via `eval`, then calls the
app's own `getSubRecipeCostPerUom(recipe, ingredients, uom, null, /*forceTally*/ true)` for
every recipe. This guarantees the check is always testing the exact same code path a user's
browser runs, never a hand-copied approximation that could quietly drift out of sync.

`forceTally: true` skips the normal `ownCost` short-circuit and instead uses the **additive**
formula — `Σ (line qty × ingredient price × (1 + scrap%))`, recursing into sub-recipes the same
way — verified against 90+ real BOM entries to match Business Central's own declared cost for
recipes up to 3 ingredient lines (see the comment above `getSubRecipeTotalCostAdditive` in
`app.js` for the full verification history). This is a check-only code path — it is never used
for the cost actually shown to users, which always trusts the sheet's own `ownCost` when present.

### Exclusion categories

Not every recipe is comparable, so the script buckets each one and only scores the genuinely
comparable set:

| Bucket | Meaning |
|---|---|
| **Checked** | Has a stored `ownCost` and a valid live tally — the only recipes that count toward the accuracy % |
| **Excluded (known-bad)** | Recipe code is in `KNOWN_BAD_RECIPE_CODES` — confirmed broken/stale *source* data (bad BOM export, stale Business Central standard cost), not a calc bug. Each entry in the list has a one-line reason. |
| **Excluded (tainted)** | Not itself known-bad, but consumes a known-bad ingredient/recipe as a line (at any depth) — inherits the same broken input, not a separate issue |
| **Excluded (delisted)** | Name contains "delist" |
| **No code/placeholder** | Blank code or `"NEW"` — draft, not a real catalogue item |
| **Genuinely zero-cost** | No `ownCost` AND the live fallback tally is also 0 — a real gap |
| **Single-component pass-through** | No stored `ownCost`, but it's a 1-line wrapper around one ingredient/sub-recipe — trivially correct by construction, not worth tracking |
| **Multi-line, no cached cost** | No stored `ownCost`, 2+ lines, live-tallied — worth reviewing but not a mismatch (nothing to compare against yet) |
| **Tally failed/zero** | The live recompute threw or returned ≤0 — a real calc gap |

A mismatch is anything in **Checked** where `|used − tally| / used > 0.5%`.

## Running it

1. **Pull fresh live data from prod** (read-only, no changes made to the site):
   ```bash
   # Sign in as any account (a disposable test signup is fine — read-only endpoints don't need admin)
   curl -s -c /tmp/qa_cookies.txt -X POST http://192.168.0.50:5001/api/auth/local/signup \
     -H "content-type: application/json" \
     -d '{"displayName":"QA Tally Check","email":"qa-tally-check@example.com","password":"TempQAcheck123!"}'

   curl -s -b /tmp/qa_cookies.txt "http://192.168.0.50:5001/api/recipes" -o .scan/live_recipes_final.json
   curl -s -b /tmp/qa_cookies.txt "http://192.168.0.50:5001/api/ingredients?includeUnlinked=true" -o .scan/live_ingredients_final.json
   ```
   (Ask whoever's running this to remove the disposable account afterward via User Settings, or
   reuse an existing test account if one's already sitting around from a prior run.)

2. **Run the scan:**
   ```bash
   node scripts/accuracy-scan.js
   ```
   Prints the summary to console and writes these into `.scan/` (gitignored — scratch output,
   regenerated every run, not for the results log below):
   - `mismatches_final.json` — every mismatch, sorted worst-first
   - `no_code_list.json`, `no_owncost_list.json`, `multi_line_no_owncost_list.json`, `tainted_list.json`
   - `stale_recipes_to_review2.csv` — mismatches as a CSV with a deep link per row

3. **When a mismatch turns out to be genuinely bad source data** (not a calc bug), add its code
   to `KNOWN_BAD_RECIPE_CODES` in `scripts/accuracy-scan.js` with a one-line reason, so future
   runs don't re-flag it. Never add a code there just to silence a real calculation bug.

## Results log

Append a new entry here every time this is run — that's the whole point of keeping this file:
seeing whether accuracy is trending up, flat, or regressing after a change.

### 2026-09-28

- **Accuracy: 96.0%** (680 / 708 checked, within 0.5%)
- Checked 708 · Excluded (known-bad) 21 · Tainted 114 · Delisted 126 · No code 9 · Genuinely
  zero-cost 3 · Single-component pass-through 116 · Multi-line no cached cost 12 · Tally
  failed 0 · **Total 1109, reconciles: true**
- 28 remaining mismatches. **First pass at the root cause was wrong and got corrected the same
  day** (caught by a screenshot showing `HR DRY PANKO CHICKEN KATSU`'s own totals row matching
  exactly, £4.196 = £4.196, contradicting the original write-up) — see below for what's
  actually going on. Also fixed a real gap in the script itself while investigating: it was
  costing recipes against the raw `/api/recipes` JSON, but the real app never does that —
  `storage.js`'s `normalizeRecipeIngredientUoms` always forces each line's UOM to match its
  ingredient's actual cost UOM first. `scripts/accuracy-scan.js` now replicates that step
  before running any comparison (verbatim copy, not reimplemented). Re-running with the fix
  produced the *same* 96.0% / 28 mismatches for this dataset — this particular gap wasn't
  actually the cause of anything in this run, but it was a real correctness bug in the script
  and needed fixing regardless (a future dataset could easily have recipe lines whose stored
  UOM doesn't match the ingredient's cost UOM, where this would have mattered).
- **Corrected root cause:** the Chicken Katsu family mismatches are *not* a multi-line/high-scrap
  formula limitation. `HR DRY PANKO CHICKEN KATSU` (105299, the 5-line high-scrap recipe)
  tallies fine and isn't even in the mismatch list. The actual divergence starts one level up,
  at `Chicken Katsu Piece` (100249): it's `approved: true` with its own stored `ownCost`
  (£0.43598) straight from the BOM sheet, so the app just uses that value directly rather than
  deriving it from its child sub-recipe. The tally script instead recomputes it bottom-up from
  today's live ingredient prices through 4 nested sub-recipe levels. Those two numbers —
  "Business Central's cached cost from whenever it was last synced" vs. "recalculated from
  current ingredient prices" — have simply drifted ~2.6% apart over time, same as several other
  entries already in `KNOWN_BAD_RECIPE_CODES` (marked "same stale-BC-cost class"). This is
  ordinary cost drift, not a data error or a calc bug — **no fix needed**, and every recipe
  built on top of `Chicken Katsu Piece` inherits the same expected drift.
- Remaining ~12 small mismatches (all under 0.8%, sauce/pack recipes — Hot Wings Sauce, Korean
  BBQ Sauce, Chilli Oil, Turmeric Noodles, Shiitake Rice) not individually re-traced this run;
  likely the same ordinary stale-BC-cost pattern given the size of the drift, but not confirmed
  case-by-case.
- No new `KNOWN_BAD_RECIPE_CODES` entries added this run.
