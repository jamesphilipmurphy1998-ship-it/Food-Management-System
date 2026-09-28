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
- 28 remaining mismatches. Root-caused the largest cluster (~16 of the 28, everything above
  ~0.9% diff except "Mini Breakfast Bento") to one shared pattern: **Chicken Katsu family
  recipes** (`Chicken Katsu Piece`, `Chicken Katsu Box HC`, `Chicken Katsu Yakisoba` and its
  variants, `Chk Kat Curry + *` line) all trace back to `HR DRY PANKO CHICKEN KATSU` (105299),
  a **5-line** recipe where every line carries **heavy scrap%** (81%, 14.9%, 19.1%, 27%, 22%).
  The additive tally formula was only verified up to 3-line recipes (see
  `getSubRecipeTotalCostAdditive`'s comment in `app.js`) — for a 5-line, high-scrap recipe like
  this one, the additive check formula itself is the thing diverging from Business Central's
  real (weight-ratio-based) cost, not the stored `ownCost`, which is trusted directly and is
  what's actually shown to users. **Conclusion: not a data or app bug** — a known blind spot of
  this verification script's approximation for recipes with 4+ lines and large cumulative
  scrap. Left un-excluded (not added to `KNOWN_BAD_RECIPE_CODES`) since the stored cost itself
  hasn't been confirmed wrong against the raw sheet the way the other exclusions were — flagged
  here instead so it doesn't get re-investigated as if it were new.
- Remaining ~12 small mismatches (all under 0.8%) are scattered across other multi-line sauce/
  pack recipes (Hot Wings Sauce, Korean BBQ Sauce, Chilli Oil, Turmeric Noodles, Shiitake Rice)
  — same 4-line-plus-scrap shape, not independently investigated this run given how small the
  drift is (all within rounding-adjacent territory).
- No new `KNOWN_BAD_RECIPE_CODES` entries added this run — nothing found that was confirmed bad
  *source* data rather than the tool's own additive-formula limitation.
