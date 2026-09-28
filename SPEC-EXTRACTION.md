# Ingredient specification extraction

Goal: drop a supplier's raw material specification into
`OneDrive - Wasabi\...\FMS System\3. Supporting Docs\Ingredient Specs`, and have its nutrition
and allergen data matched to the live NutriCost ingredient by **code** and written straight into
the database — no manual re-typing, and the source document itself is never stored on the site
(only the matched values persist, on the ingredient row that already exists).

**Status: pipeline built and proven on one real ingredient (Black Bean Paste, 2026-09-28), then
hardened for safety the same day (see below).** Deliberately not yet run against the rest of
the ingredient library — first confirming the extraction/matching/write approach is right on
this one before doing more.

## ⚠️ Safety requirement — refuse, never guess

**An allergen written wrong is a consumer safety incident, not a cosmetic bug.** If a future
spec uses a layout this code doesn't recognise, the pipeline must say so clearly and refuse to
proceed — never fall back to a partial extraction, a best guess, or silently skip a field and
write the rest. Getting this wrong could mean an allergen the product actually contains isn't
flagged, which can kill someone.

**How this is enforced (`scripts/spec-extract.py` + `scripts/spec-apply.js`), as of the
2026-09-28 hardening pass:**

1. Every sheet, header row, and column `spec-extract.py` reads is **located by searching for
   its label text**, never assumed to be at a fixed cell address. If a header/label it expects
   (`"Typical Values"`, `"Per 100g"`, `"Potential Component"`, `"Product contains?"`, any of the
   9 nutrition field labels) can't be found, that's an **error**, not a warning.
2. **Every one of the 19 allergen category rows this template defines must be found as an
   actual row in the sheet**, matched by the row label **starting with** the category name
   (never a loose "contains" substring match — see the false-positive this caught below). If
   any expected category is missing, extraction is refused outright — a missing row could mean
   the format changed and that category was silently dropped, and a missing allergen category
   can never be assumed "N."
3. **Every sheet in the workbook must agree on the same Product Code** (cross-checked against
   every other sheet's own header, not just the one sheet the code came from) — a mismatch is
   refused as looking like corrupted or mixed-up data, not treated as a minor warning.
4. A Y/N cell that isn't literally `"Y"` or `"N"` is refused, not interpreted either way.
5. **Output carries an explicit `status` field: `"ok"`, `"extracted_with_warnings"`, or
   `"cannot_extract"`.** `spec-apply.js` checks this before doing anything else — `--apply`
   (and even the dry-run diff) is hard-refused unless `status` is exactly `"ok"`. Warnings
   block just as hard as errors do; there is no `--force` override.
6. A structural problem (missing sheet, missing header, wrong file type entirely) goes in
   `errors` and always blocks. A softer signal that's still worth a human's attention (the
   kcal-vs-macros sanity check failing) goes in `warnings` — but as of this hardening pass,
   **both block `--apply` identically**. The distinction exists for a person reading the output
   to understand *why* it was refused, not to let warnings through where errors are blocked.

**A real false-positive this caught, same day it was built:** the first version matched
allergen category keys with a loose "is this text anywhere in the row" check. Section 9 of the
template (Dietary Requirement, not allergens) has a row literally worded *"Vegetarians
(Contains no animal product, but may animal by-product e.g. milk/egg)"* — the loose match read
"milk" and "egg" out of that description text and (correctly, as it happens, since it failed
safe rather than writing anything) refused the whole extraction with an unrecognised-value
error. Fixed by (a) restricting the row range actually scanned to end before "Section 9"
starts, and (b) requiring the row label to *start with* the category name rather than merely
contain it anywhere. Documented here specifically so a future change to this matching logic
doesn't reintroduce the same class of bug.

## Why this stays safe without relying on anyone "thinking carefully"

Everything above — the refuse-on-uncertainty rules, the plausibility checks, the name-mismatch
flag — has to work the same way whether a careful human is watching every step, or a future AI
with no memory of *why* any of this was built is just running the two scripts. **The guarantee
doesn't come from anyone being thoughtful in the moment. It comes from the code itself refusing
to proceed, past a point only a real human decision can get it past.**

Concretely: `spec-apply.js` will not write anything — not even show a dry-run diff — unless
`status: "ok"`, unless the spec's name and the live ingredient's name look related, *and* the
person running it happens to already know the exact flags below. There is no path where an AI
(or a person clicking through quickly) can accidentally cause an unsafe write just by not
thinking hard enough about it — the only way past a block is to type a specific flag that
**only makes sense to add after a human has actually been asked and has actually answered**:

- **`--confirm-name-mismatch`** — only exists to be added *after* a person was shown both names
  side by side and said "yes, same product." Nothing in the code adds this automatically, and
  nothing about running the script normally would cause someone to type it without that
  conversation having happened first.
- **`--confirm-warnings`** — same shape: only makes sense once a person has actually read the
  specific warnings listed (a sanity-check failure, an implausible pack format, etc.) and
  decided they're fine. `cannot_extract` (errors, not warnings) has **no equivalent override at
  all** — that tier is never negotiable by design.

So even an AI with zero context, reading only this file, would hit the same wall: run
`spec-extract.py`, see `status` isn't `"ok"`, run `spec-apply.js`, watch it refuse and print
exactly why, and have no flag to add that doesn't require having first surfaced the problem to
a person and gotten an answer. The investigation habits below (checking raw cells, doing a
real-world plausibility sanity check, looking for a better field elsewhere in the same
document) aren't required for safety — they're what makes the *question put to the person*
sharper and better-informed, not what stands between a bad extraction and a bad write. That
job is already done by the flags.

### A good investigation still makes for a better question, even if it isn't load-bearing

Worked example, from a real run (2026-09-28, IQF Julienne Carrot spec): the sanity check
flagged `kcal: 146` vs. an expected ~37 from the macros. Rather than just relaying "sanity
check failed" to the user, the actual raw cells were checked directly (`kj: 35`, `kcal: 146` —
confirmed these were the literal typed values, not an extraction bug), and cross-referenced
against real-world knowledge (raw carrots are ~35 kcal / ~146 kJ per 100g — suggesting the two
rows had been swapped when the spec was filled in, since `35 × 4.184 ≈ 146`). That math was put
directly in front of the user as the actual question, instead of just forwarding the raw
warning text. **The user's actual decision went against the obvious "fix" anyway** — write the
values exactly as entered in the source spec, not the corrected version — which is exactly why
this has to be a question and never an automatic correction, however confident the reasoning
looks. See the full trace in the extraction log below.

## Matching rule: exact code, never fuzzy

The spec's own "Product Code" field is matched **exactly** against `ingredient.code` in
NutriCost. No name-based fuzzy matching — see the reasoning that led here: name matching risks
picking the wrong ingredient silently, while an exact code match is unambiguous or fails loudly
(code not found → flag it, never guess or create a new ingredient).

**Real example, verified against the live site:**
- Spec file: `107168 (P00018) Black Bean Paste RM Spec V3 (06.02.25).xlsx`
- Spec's own "Product Code" cell (`3 Ingredient & Recipe`!C4, and repeated on every section
  sheet): `"107168 (P00018)"` — two codes in one cell, a NutriCost code (`107168`) and what
  looks like a project/P-code (`P00018`)
- Matched in the live system: `107168` → **"RM Black Bean Paste"** (confirmed via
  `GET /api/ingredients`, cost £3.69564, currently `kcal: 0` — no nutrition entered yet)
- **Extraction rule:** when the Product Code cell contains a parenthetical, use the part
  *before* the parenthesis as the match code — that's the one that's an actual NutriCost
  ingredient code. If a bare code with no parenthetical doesn't match anything, try any
  parenthetical portion as a fallback before giving up.

### Code matched, but the name doesn't look related — always flagged, never auto-confirmed

A code matching an ingredient is not, by itself, proof it's the *right* ingredient — the code
could be typo'd in the spec and happen to hit something unrelated, or a code could have been
reassigned since. So `spec-apply.js` also compares the spec's product name against the matched
ingredient's name after every match, and **refuses to show a diff or write anything** if they
don't look related — this needs a person to look and decide, not an automatic pass.

The comparison strips this site's own naming-prefix convention first (`RM`/`FG`/`BHP`/`GR`/
`CPU`/`SUB`/`HR`/`LR`/`NF`) before comparing, so a spec titled `"Black Bean Paste"` matching a
live ingredient named `"RM Black Bean Paste"` is correctly recognised as the same product, not
a false alarm — verified against the real spec. After stripping prefixes, the two normalized
names must contain one another (either direction) to pass; anything looser is refused with a
clear `⚠ NAME MISMATCH` message naming both the spec's name and the live ingredient's name, so
whoever's reviewing can see immediately what didn't line up.

## Source template structure

Every spec seen so far uses the same standard multi-tab "Raw Material Specification" template
(`Doc Ref: TECH-PROCESS-19`). Sheet names and purpose:

| Sheet | Contains |
|---|---|
| `1&2 Manufacturer Detail` | Supplier/manufacturer info — not extracted |
| `1bFarm&Processing Plants-Salmon` | Only relevant for fish/seafood products |
| `3 Ingredient & Recipe` | Product name, product code, sub-ingredient breakdown — **product code source** |
| `4 Packaging Detail` | **Pack Format — extracted** (`4-a`) |
| `5&6 Durability & Micro Standard` | **Storage Conditions — extracted** (`5-f`); shelf life/microbiological not extracted |
| `7 Nutrition Information` | **Nutrition values — extracted** |
| `8&9 Intolerance & Dietary` | **Allergens — extracted**; vegetarian/vegan suitability not extracted |
| `10&11 Additive & GMO` | Not extracted (could be a future field) |
| `12 Process Flow` | Not extracted |
| `13&14 Chem & Physical Std` | Not extracted |
| `15&16&17 Meat & Fish & Veg` | Not extracted |
| `18 Palm & derivatives` | Not extracted |
| `Document control & sign off` | Version/issue metadata — not extracted |

Every sheet repeats the same header block at the top (`Product Name :` in `A3`/name in `C3`,
`Product Code :` in `A4`/code in `C4`) — a cheap sanity check that every sheet in the file
agrees on which product it's for before trusting any of them.

### How a sheet is actually located — read this before touching the code

**Sheet names are matched by substring, never by position/index.** The workbook's tab order or
exact full name could vary between spec versions (`"7 Nutrition Information"` vs. some future
`"07. Nutrition Info"` would both work) — the code searches every sheet name for a distinctive
phrase and uses whichever one contains it:

```python
nut_sheet_name = next((n for n in wb.sheetnames if "Nutrition Information" in n), None)
allergen_sheet_name = next((n for n in wb.sheetnames if "Intolerance" in n), None)
recipe_sheet_name = next((n for n in wb.sheetnames if "Ingredient & Recipe" in n), None)
packaging_sheet_name = next((n for n in wb.sheetnames if "Packaging Detail" in n), None)
durability_sheet_name = next((n for n in wb.sheetnames if "Durability" in n), None)
```

If `next(...)` finds nothing, that variable is `None` — **every extraction step checks for
`None` and adds an error/warning rather than proceeding**, so a renamed or missing sheet is
reported by name, never silently skipped.

**Within a sheet, rows and columns are located the same way — by searching for the label text
that row/column is supposed to have, never a hardcoded row/column number.** For example, the
nutrition sheet's "Per 100g" column isn't assumed to be column C just because it happens to be
column C in every spec seen so far — the code finds the header row (`"Typical Values"`), then
scans that row's cells for one containing `"100"`, and uses whichever column that turns out to
be. Same pattern for every other field: find the row whose first cell matches the expected
label (`find_row_starting_with` in `spec-extract.py`), then read across that row for the value.
**This is the whole reason a format change gets flagged instead of silently mis-reading data —
if the label text this code searches for isn't found anywhere in the sheet, the search returns
nothing, which is treated as "I can't find this," not "it must be in the usual place."**

A fresh AI picking this up should extend it the same way: never add `ws["C4"]`-style fixed-cell
reads for anything new — always locate the row/column by searching for its label first, and
treat "label not found" as a reportable failure, not a fallback to the same address the last
template used.

## Field mapping: spec → NutriCost ingredient

### Nutrition (`7 Nutrition Information` sheet, "Per 100g" column — column C in every spec seen so far, but located dynamically, see above)

| Spec label (column A) | Cell | NutriCost field | Notes |
|---|---|---|---|
| `Energy (KJ)*` | C12 | `kj` | |
| `Energy (Kcal)*` | C14 | `kcal` | |
| `Fat (g)*` | C16 | `fat` | |
| `*of which saturate fat (g)*` | C22 | `sat` | Skip the polyunsaturate/monounsaturate rows (C18/C20) — NutriCost only tracks total saturates |
| `Carbohydrate (g)*` | C24 | `carb` | |
| `*of which sugar (g)*` | C26 | `sugar` | |
| `Protein (g)*` | C30 | `protein` | |
| `Fiber (g)*` | C32 | `fibre` | |
| `Salt (g)*` | C36 | `salt` | Use this directly — don't derive salt from sodium (C34); the sheet gives both, salt is what NutriCost stores |

**Always confirm the column is "Per 100g" (header row 9) before reading** — some specs may have
data entered in the "per pack/serving" column (E) instead, or in a differently-shaped table.
Row numbers above are from this template version; verify against row 9's headers first, don't
assume fixed row numbers hold across every spec revision.

**Sanity check before writing:** `kcal ≈ 4×protein + 4×carb + 9×fat` (within ~10%, since fibre
and rounding affect this). Flag, don't silently write, if a spec's own internal numbers fail
this check — that's a source-data error, not something to encode into NutriCost.

### Allergens (`8&9 Intolerance & Dietary` sheet)

The spec checks 20+ categories the EU 14 allergen list doesn't map to 1:1 — several spec rows
collapse into one NutriCost allergen, and several spec rows (Vegetable, Fruit, Animal, Yeast,
Maize, Cocoa, Alcohol, Gluten-level, dietary suitability) aren't EU allergens at all and are not
extracted as allergens.

A row counts as present when its "Product contains?" column (column E) is `Y`.

| Spec row(s) | NutriCost allergen (`Allergens` list, must match `data.js`'s `EU_ALLERGENS` exactly) |
|---|---|
| `Wheat`, `Oat`, `Rye`, `Spelt`, `Barley`, or `Gluten level (more than 20ppm?)` = Y | `Cereals containing gluten` |
| `Crustaceans/crustaceans derivatives` | `Crustaceans` |
| `Egg/egg derivatives` | `Eggs` |
| `Fish/fish derivatives` | `Fish` |
| `Lupin/lupin derivatives` | `Lupin` |
| `Milk/milk derivatives` | `Milk` |
| `Molluscs/molluscs derivatives` | `Molluscs` |
| `Mustard/mustard derivatives` | `Mustard` |
| `Nut/Nut derivatives` | `Nuts` |
| `Peanut/Peanut derivatives` | `Peanuts` |
| `Sesame seeds/sesame seeds derivatives` | `Sesame` |
| `Soya/soya derivatives` | `Soya` |
| `Sulphites or sulphur dioxide... (more than 10ppm?)` | `Sulphur dioxide` |
| `Celery/celery derivatives` | `Celery` |

**Real example (Black Bean Paste):** spec shows `Y` for Vegetable, Seed, Yeast, Soya, and Maize
rows. Of those, only **Soya** is an EU allergen — the rest (vegetable/seed/yeast/maize) are not
extracted. So this ingredient's `Allergens` should be set to `["Soya"]`, nothing else.

**FVN checkbox:** NutriCost's `Fvn` (Fruit/Vegetable/Nut, for HFSS) isn't directly answered by
this spec's Vegetable/Fruit rows — those track ingredient composition for allergen/cross-contact
purposes, not whether the product itself counts as fruit/veg/nut for HFSS scoring. Don't set
`Fvn` from this spec; leave it to whoever reviews the extraction.

### Pack Size, Pack Format & Storage Conditions

| Spec label | Sheet | NutriCost field | Notes |
|---|---|---|---|
| `1-d) Weight or Volume` | `1&2 Manufacturer Detail` | `packSize` | e.g. "5 kg" — **different sheet layout**, see below |
| `4-a) Inner packaging format/description` | `4 Packaging Detail` | `packFormat` | e.g. "Bag" |
| `5-f) Storage conditions` | `5&6 Durability & Micro Standard` | `storageConditions` | e.g. "Ambient" |

Not allergen-safety-critical, so a missing/unrecognised row here is a **warning**, not an
error — but per the "warnings block just as hard as errors" rule above, it still stops
`--apply` until a person looks at it. This is deliberately conservative: even a non-safety
field being wrong or missing means something about this spec's format wasn't what the code
expected, which is itself worth a human's attention before trusting *anything else* extracted
from the same file.

**Pack Size's sheet uses a different label layout than every other field extracted here.**
`1&2 Manufacturer Detail` puts the item number (`1-d)`) in column A and the question text
("Weight or Volume : *") in a *separate* column B cell, with the actual answer in column C —
unlike `4 Packaging Detail`/`5&6 Durability...`, where the whole question is one string in
column A and the generic "scan rightward for the first non-empty cell" approach finds the
answer safely. Reusing that same generic scan against `1&2 Manufacturer Detail` would have
wrongly grabbed column B's label text (it's non-empty) and reported it as the pack size. So
`packSize` extraction reads column C explicitly for this one row, instead of generalizing the
scan across both layouts — see the code comment above `pack_size = None` in
`spec-extract.py` for the full reasoning. **If a future field needs to be pulled from this same
sheet, check which layout applies before assuming the generic scan works.**

**Plausibility check:** `packSize` must contain at least one digit (a real pack size always has
a quantity — "Bag" alone, with no number, would be a Pack Format value that ended up in the
wrong field, not a valid size). Same "warning, still blocks `--apply`" treatment as the other
plausibility checks.

## Every field an extraction can produce — the complete list

If any of these can't be found or verified in a given spec, **that field (and depending on
which one, potentially the whole extraction) is refused, not guessed.** This is the full list —
nothing is extracted from a spec beyond what's here:

| Field | Source | If not found/verified |
|---|---|---|
| Product code (+ alt code if present) | `3 Ingredient & Recipe`, cell C4 | **Fatal** — nothing can be matched or written without this |
| Energy (kJ) | `7 Nutrition Information` | **Fatal** |
| Energy (kcal) | `7 Nutrition Information` | **Fatal** |
| Fat (g) | `7 Nutrition Information` | **Fatal** |
| Saturates (g) | `7 Nutrition Information` | **Fatal** |
| Carbohydrate (g) | `7 Nutrition Information` | **Fatal** |
| Sugar (g) | `7 Nutrition Information` | **Fatal** |
| Protein (g) | `7 Nutrition Information` | **Fatal** |
| Fibre (g) | `7 Nutrition Information` | **Fatal** |
| Salt (g) | `7 Nutrition Information` | **Fatal** |
| Allergens (all 14 EU categories checked) | `8&9 Intolerance & Dietary` | **Fatal** if even one of the 19 source rows this maps from can't be located — an allergen can never be assumed absent |
| Pack Size | `1&2 Manufacturer Detail` | Warning (still blocks `--apply`, but distinguished as non-safety in the message) |
| Pack Format | `4 Packaging Detail` | Warning (same as above) |
| Storage Conditions | `5&6 Durability & Micro Standard` | Warning (same as above) |

**"Fatal" means `status: "cannot_extract"`, and `spec-apply.js` refuses to even show a diff,
let alone write anything.** "Warning" means `status: "extracted_with_warnings"`, which
*currently also fully blocks `--apply`* — there is no field in this pipeline today that's
allowed through with a warning still attached. Every run either comes back completely clean
(`status: "ok"`) or is refused outright.

## Nutrition flow-up (built — informational only, writes nothing)

Unlike cost (which can have a cached `ownCost` that overrides live calculation and can go
stale), a recipe's nutrition has **no cache at all** — `calcRecipeNutrition()` in `recipes.js`
always recomputes it live from the recipe's ingredient lines, recursing through every
sub-recipe layer. So **writing an ingredient's nutrition already updates every recipe that uses
it, at any depth, the instant it's saved — nothing needs to be triggered or propagated in code.**

What `spec-apply.js` adds on top of that is purely informational: after a successful match, it
fetches every recipe, recursively finds every one that uses the matched ingredient (directly or
buried in nested sub-recipes — same traversal the app's own "where used" feature uses), and
prints the list. This isn't a warning and doesn't block anything — it's a heads-up so whoever's
running the upload knows a single ingredient change may have just rippled into several recipes'
labels/HFSS scores, in case anything user-facing depends on them.

**Verified against Black Bean Paste:** found in 78 recipes, including several layers deep (e.g.
`HR BLACK BEAN SAUCE` uses it directly, and `WASABI KOREAN BLACK BEAN CHICKEN WITH RICE` uses
`HR BLACK BEAN SAUCE` as a sub-recipe — both correctly surfaced).

## Post-upload verification (built)

After `--apply` writes successfully, `spec-apply.js` immediately re-fetches that exact
ingredient from the live API (a fresh `GET`, not just trusting the `PUT` response body) and
re-compares every field it intended to change against what's actually now stored. This catches
anything a raw "the PUT returned 200" check wouldn't — a partial write, a value the server
normalized or rejected silently, a race with someone else editing the same ingredient, etc.

- **Every intended field matches live** → prints `POST-UPLOAD VERIFICATION: PASSED` and exits 0.
- **Anything doesn't match** → prints `POST-UPLOAD VERIFICATION FAILED`, lists exactly which
  field(s) and what's live vs. what was intended, and **exits non-zero** — this is a hard
  signal that the upload needs manual investigation, not a "probably fine."

## Persistence guarantee: a later cost sync can't delete spec-uploaded nutrition

A real concern: NutriCost's separate Excel/BOM cost-import flow (`excel-import.js`) periodically
pulls updated **cost** data for existing ingredients from a supplier sheet. If that import ever
replaced an ingredient's *entire* record wholesale, it would blank out nutrition/allergens the
spec pipeline had written, every time costs got resynced.

**Verified this is not the case — checked the actual import code, not assumed.** The
"update existing ingredient" merge path in `excel-import.js` is field-by-field additive, never
a full overwrite:

```js
if (kj > 0) existing.kj = kj;
if (kcal > 0) existing.kcal = kcal;
// ... same guard for every nutrition field
```

A cost-only sheet has no nutrition columns mapped, so `kj`/`kcal`/etc. all come out `0` for
each row — and `0 > 0` is false, so the existing value (including anything the spec pipeline
wrote) is left alone, not zeroed. Allergens, Pack Size, Pack Format, and Storage Conditions
aren't in that import path's field list **at all**, so they're preserved by omission — there's
no code path there that could touch them even accidentally.

This holds symmetrically in the other direction too: `spec-apply.js`'s write starts from
`Object.assign({}, matched)` — a full copy of the ingredient's *current* live state — and only
overwrites the specific nutrition/allergen/pack fields it actually extracted. A nutrition
upload can never touch cost, supplier, code, or anything else on the record.

**Verified live (2026-09-28):** `RM Black Bean Paste` currently carries both — cost `£3.69564`
(from the original BOM import, untouched by any of today's spec writes) and the nutrition/
allergen/pack data this pipeline wrote earlier the same day. Neither has erased the other.

## Write workflow (built)

Per the earlier discussion on reliability: **propose, don't auto-write.** Two scripts:

1. **`python scripts/spec-extract.py "<path to .xlsx>"`** — read-only, extracts product code
   (+ alt/parenthetical code when present — handles specs with one code or two), nutrition
   (confirmed: ingredient nutrition fields are always per-100g/100ml, same basis the spec's
   own "Per 100g" column uses — no unit conversion needed), and allergens. Also cross-checks
   every sheet in the workbook agrees on the same Product Code, and runs the
   kcal-vs-macros sanity check, both surfaced as `warnings` in the output rather than silently
   trusted. Outputs JSON.
2. **`node scripts/spec-apply.js <extraction.json> [--apply] [--confirm-name-mismatch] [--confirm-warnings]`**
   — matches the extracted code against the live ingredients (tries the primary code, then the
   alt code if the primary doesn't match anything — handles both the two-code and one-code
   cases). No match → stops and says so, never guesses or creates a new ingredient. Prints a
   before/after diff of just the nutrition/allergen/pack fields (cost, supplier, code,
   everything else on the record is never touched). Without `--apply` it's a dry run (diff
   only); with `--apply` it writes via `PUT /api/ingredients/{id}`, then immediately re-fetches
   and re-verifies (see "Post-upload verification" below).
   - **`--confirm-name-mismatch`** — required to proceed at all (even a dry run) if the spec's
     product name and the live ingredient's name don't look related. Never pass this without
     having actually asked a person and gotten a yes — see "Why this stays safe" above.
   - **`--confirm-warnings`** — required to proceed if `status` is `"extracted_with_warnings"`
     (not `"cannot_extract"` — that tier has no override). Same rule: only after a person has
     reviewed the specific warnings listed and confirmed them.
   - Needs a signed-in session cookie jar (`COOKIE_JAR` env var, default `/tmp/qa_cookies.txt`)
     — **on Windows, pass the actual Windows path** (e.g.
     `C:\Users\...\AppData\Local\Temp\qa_cookies.txt`), not the Git-Bash-style `/tmp/...` path
     — `execSync`'s shell is `cmd.exe`, not Git Bash, so the POSIX-style path silently fails to
     resolve and curl just doesn't send the cookie (shows up as an unexplained 401).
3. The existing ingredient version-history mechanism (`ingredient_versions` table) captures the
   before/after automatically as part of the save — no separate audit trail was built, it
   didn't need to be.
4. The source `.xlsx` is never uploaded, stored, or referenced by the server — read once,
   locally, at extraction time.
5. **Known environment quirk:** reading the spec file directly from the live OneDrive-synced
   `Ingredient Specs` folder path has intermittently thrown `PermissionError: [Errno 13]` from
   Python (openpyxl), even though the same file copies and reads fine a moment later — looks
   like a transient OneDrive cloud-sync lock, not a bug in the extraction logic (verified: the
   exact same file, copied to a local temp path, extracts cleanly every time). If
   `spec-extract.py` hits this, retry, or copy the file to a local path first and point the
   script at the copy.

## Worked example — Black Bean Paste, every field traced to its exact cell

The single real extraction this pipeline has actually run, with the precise sheet + cell/row
each value came from — use this as the reference trace when extending or debugging the
extraction logic, not just the general field-mapping tables above.

Source file: `107168 (P00018) Black Bean Paste RM Spec V3 (06.02.25).xlsx`

| Field | Sheet | Cell / row | Value found |
|---|---|---|---|
| Product Name | `3 Ingredient & Recipe` | `C3` | `Black Bean Paste` |
| Product Code (primary) | `3 Ingredient & Recipe` | `C4`, text before the `(` | `107168` |
| Product Code (alt) | `3 Ingredient & Recipe` | `C4`, text inside the `(...)` | `P00018` |
| Energy (kJ) | `7 Nutrition Information` | row labelled `Energy (KJ)*`, "Per 100g" column | `470.7` |
| Energy (kcal) | `7 Nutrition Information` | row labelled `Energy (Kcal)*` | `112.3` |
| Fat (g) | `7 Nutrition Information` | row labelled `Fat (g)*` | `3.1` |
| Saturates (g) | `7 Nutrition Information` | row labelled `*of which saturate fat (g)*` | `0` |
| Carbohydrate (g) | `7 Nutrition Information` | row labelled `Carbohydrate (g)*` | `8.9` |
| Sugar (g) | `7 Nutrition Information` | row labelled `*of which sugar (g)*` | `0.5` |
| Protein (g) | `7 Nutrition Information` | row labelled `Protein (g)*` | `9.3` |
| Fibre (g) | `7 Nutrition Information` | row labelled `Fiber (g)*` | `5.8` |
| Salt (g) | `7 Nutrition Information` | row labelled `Salt (g)*` | `5.1` |
| Allergens | `8&9 Intolerance & Dietary` | every row's "contains?" column, scanned | Only the `Soya/soya derivatives:*` row had `Y` **and** mapped to an EU allergen → `["Soya"]` |
| Pack Size | `1&2 Manufacturer Detail` | row `1-d)`, column C specifically (not a scan — see the layout note above) | `5 kg` — passed the plausibility check (contains a digit) |
| Pack Format | `4 Packaging Detail` | row `4-a) Inner packaging format/description:*` | `Bag` — passed the plausibility check (contains a recognised container word) |
| Storage Conditions | `5&6 Durability & Micro Standard` | row `5-f) Storage conditions :*` | `Ambient` — passed the plausibility check |

**On the allergen row:** four other rows in that sheet also had `Y` — `Vegetable/vegetable
derivatives`, `Seed/seed derivatives`, `Yeast/yeast derivatives`, `Maize/maize derivatives`.
None of these are on the EU-14 allergen list this system tracks (see the allergen mapping table
above), so none of them became an entry in `Allergens` — this is correct behavior, not a gap.
A fresh AI re-deriving this from scratch should get the exact same single-item `["Soya"]`
result and should be suspicious of itself if it doesn't.

**Full extraction result for this file** (what `spec-extract.py` actually printed):

```json
{
  "status": "ok",
  "name": "Black Bean Paste",
  "code": "107168",
  "altCode": "P00018",
  "nutrition": { "kj": 470.7, "kcal": 112.3, "fat": 3.1, "sat": 0, "carb": 8.9, "sugar": 0.5, "protein": 9.3, "fibre": 5.8, "salt": 5.1 },
  "allergens": ["Soya"],
  "packSize": "5 kg",
  "packFormat": "Bag",
  "storageConditions": "Ambient",
  "errors": [],
  "warnings": []
}
```

## Extraction log

Append an entry each time a spec is actually processed (once the write pipeline exists) —
mirrors `ACCURACY-SCAN.md`'s results-log pattern.

### 2026-09-28 — methodology derived, pipeline built, first live write

- Inspected `107168 (P00018) Black Bean Paste RM Spec V3 (06.02.25).xlsx` (the only file in the
  folder at the time) to derive the field mapping and matching rule above.
- Built `scripts/spec-extract.py` + `scripts/spec-apply.js`, matching the documented workflow.
- Ran the full pipeline against this one spec. Matched code `107168` → `RM Black Bean Paste`
  (id `id_2e978f66f`) on the primary code (didn't need the `P00018` fallback this time). No
  extraction warnings — sheet cross-check and kcal-sanity-check both passed clean.
- **Diff shown and confirmed by the user before writing:** kj 0→470.7, kcal 0→112.3, fat
  0→3.1, sat unchanged (0→0), carb 0→8.9, sugar 0→0.5, protein 0→9.3, fibre 0→5.8, salt 0→5.1,
  allergens `[]`→`["Soya"]`.
- **Applied — `PUT` returned 200**, response confirmed every nutrition/allergen field landed
  correctly and nothing else on the record changed (cost stayed £3.69564, code/supplier
  untouched).
- Deliberately stopping here rather than running the rest of the library — first confirming
  this one is right, then testing more ingredients once satisfied.

**Same day, hardening pass — user explicitly required that an unrecognised format must be
flagged, never silently produce a wrong upload (allergen mismatch risk):**

- Rewrote `spec-extract.py` to locate every sheet/header/column by searching for its label text
  rather than assuming fixed positions, require all 19 allergen category rows to be found
  before trusting any of them, cross-check every sheet's Product Code, and reject any
  non-Y/N allergen cell — added an explicit `status` field (`ok` / `extracted_with_warnings` /
  `cannot_extract`).
- Updated `spec-apply.js` to hard-refuse `--apply` (and even the dry-run diff) unless
  `status === "ok"` — no override flag exists.
- **Caught and fixed a real false-positive during this hardening**, on the very spec already
  proven above: a loose substring match briefly misread "milk" and "egg" out of an unrelated
  Section 9 dietary-requirement row's description text. Failed safe (blocked rather than wrote
  wrong data) but was still a real bug — fixed by restricting the scanned row range and
  requiring an exact row-label prefix match. See the safety section above for the full account.
- Re-ran extraction against Black Bean Paste after the fix: `status: "ok"`, identical
  nutrition/allergen values as the original successful run — confirms the hardening didn't
  change correct behavior, only closed the gap around incorrect/unrecognised input.

**Same day, added Pack Format + Storage Conditions:**

- Added `packFormat`/`storageConditions` fields end-to-end: new columns on the `Ingredient`
  model/entity (migration `AddIngredientPackFormatAndStorageConditions`), two new inputs in the
  Ingredient Centre modal, and extraction from `4 Packaging Detail` (`4-a`) /
  `5&6 Durability & Micro Standard` (`5-f`).
- Applied to Black Bean Paste: `packFormat` "" → "Bag", `storageConditions` "" → "Ambient".
  `PUT` returned 200, response confirmed both fields landed alongside the nutrition/allergen
  data from the first run.

**Same day, added post-upload verification:**

- `spec-apply.js` now re-fetches the ingredient fresh from the live API immediately after a
  successful `--apply` and re-compares every intended field against what's actually stored —
  never just trusts the `PUT` response body. Reports `POST-UPLOAD VERIFICATION: PASSED` or
  `FAILED` (with the exact field-by-field mismatch) and exits accordingly.
- Also documented the complete, explicit list of every field this pipeline can extract (see
  "Every field an extraction can produce" above) — nothing beyond that list is ever pulled from
  a spec, and any of the nutrition/allergen fields failing to be found is fatal, never partial.

**Same day, added a plausibility check on Pack Format and Storage Conditions:**

- Finding the expected cell non-empty isn't the same as the value actually making sense — a
  free-text answer could describe the product's physical state ("Liquid", "Frozen", "Powder")
  rather than what it's packaged in, especially if a future template moves the question. Added
  `check_pack_format_plausible()` / `check_storage_conditions_plausible()`: each checks the
  extracted text against a list of words that actually belong in that field (Bag/Box/Bottle/
  Tub/... for pack format; Ambient/Chilled/Frozen/... for storage) and adds a warning — which,
  per the existing rule, still blocks `--apply` — if none of them appear.
- Verified against Black Bean Paste: `"Bag"` and `"Ambient"` both pass cleanly (`status: "ok"`,
  zero warnings) — the check doesn't false-positive on values that are actually correct.
- Added the full worked-example trace above (every field's exact sheet + cell/row for this one
  spec) specifically so a fresh AI has a concrete, checkable reference rather than only the
  general field-mapping rules.

**Same day, added Pack Size:**

- New field `packSize`, added end-to-end: `Ingredient` model/entity/mapping, migration
  `AddIngredientPackSize`, and a new UI input positioned to the left of Pack Format in the
  Ingredient Centre modal (per the user's request — pack size and pack format read together,
  e.g. "5 kg Bag").
- Extracted from `1&2 Manufacturer Detail`, row `1-d) Weight or Volume`. **This sheet's label
  layout is different from every other section extracted so far** — item number in column A,
  question text in a separate column B cell, answer in column C — so this field reads column C
  explicitly rather than reusing the generic "scan rightward for the first non-empty cell"
  logic the other pack/storage fields use (that scan would have wrongly grabbed column B's
  label text). See the layout note in the field mapping section above and the code comment in
  `spec-extract.py` above `pack_size = None`.
  - Actually correct on the input rather than something to catch after the fact: reasoned
    through this discrepancy *before* writing the extraction code, once it became clear the two
    sheets don't share a layout, rather than discovering it as a bug afterward.
- Plausibility check: must contain a digit (mirrors the same "does this actually look like what
  it claims to be" principle applied to Pack Format/Storage Conditions).
- Applied to Black Bean Paste: `packSize` "" → "5 kg". `PUT` returned 200, and the new
  post-upload verification step confirmed it: `POST-UPLOAD VERIFICATION: PASSED`.
- Updated the field mapping table, the "every field an extraction can produce" list, and the
  worked-example trace/JSON above to include this field — this log entry is the record that
  those sections were brought current alongside the code, not left behind it.

**Same day, added a name-mismatch check on top of the code match:**

- A code matching in the live system doesn't guarantee it's the right ingredient — a typo'd
  code in the spec could coincidentally hit something unrelated, or a code could have been
  reassigned. `spec-apply.js` now compares the spec's product name against the matched
  ingredient's name (after stripping the site's `RM`/`FG`/`BHP`/`GR`/`CPU`/`SUB`/`HR`/`LR`/`NF`
  naming prefixes) and refuses to proceed — no diff shown, nothing written — if they don't look
  related, printing a `⚠ NAME MISMATCH` message with both names for a person to review.
- Verified no false positive on the real case: `"Black Bean Paste"` (spec) vs.
  `"RM Black Bean Paste"` (live) — correctly recognised as related after prefix-stripping,
  full pipeline still runs clean through to "no changes" (everything already applied from
  earlier runs).

**Same day, added the nutrition flow-up flag:**

- Confirmed (by reading `calcRecipeNutrition()` in `recipes.js`) that recipe nutrition has no
  equivalent to cost's `ownCost` cache — it's always recomputed live from ingredient lines,
  recursing through every sub-recipe layer. So no propagation code was actually needed for
  nutrition to "flow up"; it already does, automatically, the moment an ingredient is saved.
- Added a purely informational step instead: after a match, recursively find every recipe using
  the matched ingredient (direct or nested) and list them, so the person running the upload
  knows what just changed downstream. Writes nothing, blocks nothing.
- Verified against Black Bean Paste: correctly found 78 recipes, including multi-layer nesting
  (`HR BLACK BEAN SAUCE` uses it directly; `WASABI KOREAN BLACK BEAN CHICKEN WITH RICE` uses
  `HR BLACK BEAN SAUCE` as a sub-recipe — both surfaced correctly).
- While investigating the 78-count with the user, traced one branch precisely to confirm the
  traversal itself was correct: `HR Fire Sauce` genuinely uses Black Bean Paste via `P00018`
  (a legitimate single-ingredient wrapper recipe), but the count is inflated by an *already
  known* separate bug — `RM Wasabi Sachet 1.5g` (107140, already in `KNOWN_BAD_RECIPE_CODES`
  from the accuracy scan) has a malformed sub-recipe line pointing to an entire chicken dish,
  and since nearly every sushi set includes that same free sachet, dozens of unrelated sets get
  transitively pulled in. Confirmed this is a pre-existing data defect, not a bug in the new
  flow-up code — no fix applied yet (offered, not yet actioned).

**Same day, confirmed (not assumed) that a cost-only import can't delete spec-uploaded
nutrition:**

- User raised a real integrity concern: does NutriCost's separate Excel/BOM cost-import flow
  wipe nutrition when it resyncs costs for an existing ingredient? Read the actual import code
  in `excel-import.js` rather than assuming — its "update existing ingredient" path only
  overwrites a nutrition field `if (value > 0)`, so a cost-only sheet (nutrition columns blank/
  unmapped, coming out as `0`) leaves existing nutrition untouched. Allergens/Pack Size/Pack
  Format/Storage Conditions aren't touched by that import path at all.
- Holds symmetrically the other way too: `spec-apply.js`'s write starts from a full copy of the
  live record (`Object.assign({}, matched)`) and only overwrites the fields it extracted, so a
  nutrition upload can never touch cost/supplier/code either.
- Verified live: `RM Black Bean Paste` currently carries both its original BOM cost
  (`£3.69564`) and today's spec-uploaded nutrition/allergen/pack data simultaneously — neither
  has erased the other.

**Same day, batch-processed the 4 new specs added to the folder — added two override flags in
the process (`--confirm-name-mismatch`, `--confirm-warnings`), both only usable after an
explicit human decision:**

Before processing, checked live `kcal` on every candidate code first (per the user's suggestion
that the site itself, not a separate log, should answer "has this already been done") — all
four were genuinely `0`, safe to proceed.

- **Batter Mix (106006/106009) → `RM Eclipse Batter Newlyweds Sack`.** Extraction initially hit
  `cannot_extract`: values written as `"1.24g"` (number+unit inline) instead of bare numbers.
  Fixed `parse_nutrition_value()` to accept a number followed by that field's own stated unit
  (narrow — a mismatched unit is still refused). Then flagged a name mismatch ("Eclipse Batter
  6 B64503-2500-A" vs. "RM Eclipse Batter Newlyweds Sack") — user confirmed same product via
  AskUserQuestion, said this was "the best way to prompt" and asked it be documented (see
  above). Applied with `--confirm-name-mismatch`, verified. Turned out to be the batter
  underlying the entire Chicken Katsu family (78 recipes) investigated earlier the same day.
- **Rice Vermicelli (106190/105018) → `RM Rice Vermicelli`.** Clean extraction, name matched
  automatically, applied without any override, verified.
- **Red Pepper Julienne (106317, single code) → `RM Pepper Red Julienne`.** Flagged as a name
  mismatch — "Julienne Red Pepper" vs. "Pepper Red Julienne", same three words reordered. User
  confirmed same product. Improved the check itself afterward (`sameWordSet()` — order-
  independent word-set comparison) so this specific, well-defined pattern won't need flagging
  again; re-ran and it passed automatically. Applied, verified.
- **IQF Julienne Carrot (107497/P00060) → `RM IQF Julienne Carrot`.** The worked example in the
  "why this stays safe" section above — sanity-check failure on kJ/kcal investigated and
  presented with the math, user chose to write as-entered rather than "fix" it; Pack Format
  ("Liner") and Storage Conditions ("-18 degreas Celsius") both failed their plausibility
  checks but were confirmed genuine (checked the Packaging Detail sheet for a better Pack
  Format answer first — none existed, so it was dropped per the user's instruction rather than
  written as "Liner"). Also flagged a name mismatch (spec typo'd "Julianne" for "Julienne") —
  confirmed via the codes matching independently on both the primary and alt code. Applied with
  `--confirm-warnings --confirm-name-mismatch`, verified. Used in 131 recipes.
