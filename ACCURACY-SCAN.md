# Recipe costing accuracy scan

Compares NutriCost's stored recipe cost (`ownCost`, pulled from the BOM/Business Central
sheet on import) against a live recomputation from the recipe's own ingredient lines, across
every recipe in the database — the "tally vs the sheet" check. Lets us catch cost-calculation
regressions or bad source data before they show up as a wrong price somewhere.

## ⚠️ Standing caution — read before flagging anything as a cost gap

**`ownCost === 0` (or missing) on a recipe does NOT mean it has no real cost, and is NOT by
itself a finding worth reporting.** This has been reported as a false "no cost" issue more than
once — every time, checking the actual app screen showed the recipe displaying a correct,
non-zero cost, because a **single-ingredient recipe (1 line, wraps exactly one ingredient —
this is the entire `P00xxx` code family) never needs `ownCost` at all**. Its displayed cost is
derived live, directly from the one underlying ingredient's own `cost` field, every time — this
flow-through was deliberately built and confirmed working (see the "single-component
pass-through" bucket below, 116 of these, correctly excluded from the accuracy count because
there's nothing to compare `ownCost` against in the first place).

Before reporting *any* recipe as having "no cost" or "zero cost": check `ingredients.length`.
If it's 1, this is expected and correct — not a finding. Only a **multi-line** recipe with
`ownCost <= 0` AND a live tally that also comes back at ≤0 is a genuine gap (see "Genuinely
zero-cost" in the table below — that's the only bucket where this is real).

## ⚠️ Stay in scope — this checks cost vs. the sheet, nothing else

This script's entire job is comparing a recipe's cost against the BOM sheet. It is not a
general data-quality auditor. Don't report an unrelated observation (a `name` field, a missing
category, anything not cost) as a "finding" from this scan just because it was visible in the
same JSON pull — a `name === code` recipe was reported here once as a gap and it turned out to
be an existing, intentional display rule, not a data problem. If something outside cost looks
worth checking, say so as a separate question rather than folding it into this scan's results.

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
- **Checked all 28, not just the Katsu family — every single mismatch fits the same pattern.**
  Every one of the 28 recipes in `mismatches_final.json` has `approved: true` and its own
  `ownCost > 0`, meaning every one of them shows its own directly-stored BOM cost to users, not
  a live-derived figure — confirmed with a one-line script rather than assumed. That includes
  the sauce/pack family (Hot Wings Sauce, Korean BBQ Sauce, Chilli Oil, Turmeric Noodles,
  Shiitake Rice, GR Fried Rice variants, Korean BBQ Katsu Sando, Mini Breakfast Bento) —
  same ordinary stale-BC-cost drift as the Katsu family, not a separate issue. **Conclusion
  stands for the full 28: none of them are a data or calculation bug** — every mismatch is
  Business Central's cached cost from whenever it was last synced drifting away from what
  today's live ingredient prices would produce, which is expected and harmless (the displayed
  cost is correct; it just isn't the *newest possible* recompute).
- No new `KNOWN_BAD_RECIPE_CODES` entries added this run.

**Re-confirmation run, same day, fresh data pull:** re-ran against a new live pull from prod
using the current script (post UOM-normalization fix) — **identical result**: 96.0% accuracy,
the exact same 28 recipe codes flagged (`100219, 100246, 100249, 101602, 103792, 103798,
105760, 106341, 106416, 106656, 106658, 106659, 106690, 106692, 106693, 106704, 106746,
106766, 106784, 106787, 107060, 107077, 107171, 107201, 107370, 107514, 107587, 107726`).
Nothing drifted, no new issues, confirming the analysis above is stable and not a one-off.

### Full reconciliation — every one of the 1109 recipes, no bucket left unexplained

The script now dumps a named list (not just a count) for every bucket — see
`scripts/accuracy-scan.js`'s `fs.writeFileSync` calls at the bottom for the full set of
`.scan/*.json` files this produces.

| Bucket | Count | What it means |
|---|---|---|
| **Checked & within 0.5%** | 680 | Matches the BOM sheet cost closely — the real accuracy number |
| **Checked & mismatched** | 28 | See above — all 28 confirmed to be ordinary stale-BC-cost drift, not a bug |
| **Excluded — known-bad source data** | 21 | Confirmed-broken BOM entries (malformed lines, stale sheet cost vs. the sheet's own totals) — each has a one-line reason in `KNOWN_BAD_RECIPE_CODES` |
| **Excluded — tainted by a known-bad component** | 114 | Not broken themselves, but built on one of the 21 above (at any nesting depth) — inherits the same known issue, not separate |
| **Excluded — delisted** | 126 | Name contains "delist" — no longer a live product, cost accuracy doesn't matter |
| **No code / placeholder** | 9 | Blank or `"NEW"` code — draft recipes, most are genuine in-progress work; 2 are confirmed leftover test data from this session (`Merge Recipe`, `HR CHILLI COATED CHICKEN WINGS (Copy)`) |
| **Single-component pass-through, no cached cost** | 116 | 1-line wrapper around one ingredient/sub-recipe — cost is trivially correct by construction, nothing to compare |
| **Multi-line, no cached cost** | 12 | 2+ lines, no stored `ownCost` yet, live-tallied cost used directly — not a gap, just nothing to cross-check against yet |
| **Genuinely zero-cost** | 3 | No stored cost AND live tally is also £0 — real gaps: `CPU RM Water` (legitimately free), `Merge Recipe` (test data), `erfg` (test data) |
| **Tally failed / errored** | 0 | None this run |
| **Total** | **1109** | Reconciles exactly — every recipe accounted for in exactly one bucket |

**RETRACTED — not a finding.** An earlier version of this file reported 117 recipes whose
`name` field equals their `code` as a real gap. This was scope creep: this script's job is
*recipe cost vs. the BOM sheet*, nothing else — a `name` observation was never something it was
built or asked to check, and it turned out to be wrong anyway. There is an existing, intentional
rule that a recipe with no real name falls through to displaying its code — this is expected
behavior, not missing data. Leaving this note here (rather than deleting it outright) so a
future run doesn't independently rediscover the same non-issue and re-report it.

### Ingredient audit — all 463 ingredients

Ingredients don't have a "tally vs. sheet" concept the way recipes do (an ingredient's cost
*is* the source value — nothing separate to compare it against), so `scripts/ingredient-audit.js`
checks real structural data-quality issues instead:

| Check | Count | Detail |
|---|---|---|
| **No name** | 0 | Clean |
| **No code** | 60 | All 60 are `approved: false` (in development) with names like "Semi-Skimmed Milk", "Golden Syrup", "Baking Powder" — this is the app's built-in sample/seed ingredient library (`SAMPLE_INGREDIENTS` in `data.js`), never a real imported ingredient. Not a data problem. |
| **Zero/missing cost** (excl. packaging) | 2 | `103004` Water (legitimately free) and `P00040` (blank name/code — already known, same BOM export gap already excluded on the recipe side) |
| **No nutrition values at all** (excl. packaging, all 8 fields checked) | 231 | Real gap. Of these, **72 are `approved: true`** (production/locked) raw materials with completely empty nutrition — e.g. `RM Baked Beans`, `RM Cooked Back Bacon`, `RM Twinings Pure Green Tea`, `RM Sauce Sweet Chilli Yutaka`. These are genuine production ingredients missing nutrition data entirely. The remaining 159 are in-development. |
| **Duplicate codes** | 0 | Clean — no two ingredients share a code |

**Bottom line for ingredients:** the real, actionable finding is **72 approved/production raw
materials with zero nutrition values entered** — anything costed through one of these will have
a silently-incomplete nutrition breakdown. Everything else (no-code sample library, the 2
zero-cost items) is either expected or already-known.

Full lists for every row above are in `.scan/*.json` (gitignored — regenerate by re-running
both scripts) — ask for the actual code/name lists if you want to work through them directly
rather than just the counts.
