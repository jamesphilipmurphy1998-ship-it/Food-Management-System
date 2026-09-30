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

## Standing rule: ask, always, whenever anything is questionable

Whenever any part of an input is questionable — an unfamiliar format, a name that doesn't
obviously match, a value that doesn't read as expected, a code that looks wrong, a structural
oddity in the spec — **the user must always be asked to confirm before proceeding.** Every
time, regardless of how many similar cases have already been confirmed before, and regardless
of how routine the question starts to feel. Two specs using the exact same override flag for
the exact same *kind* of problem still each get their own question, with their own specifics,
because the specifics are what the person is actually confirming — never the general pattern.

**These questions must always be asked via a clickable confirmation prompt (the assistant's
AskUserQuestion-style tool), never as plain chat text requiring a typed reply.** This was
missed once on 2026-09-29 (first pass on spec 107316) and corrected immediately per the user —
logged here so it's never dropped again.

## Standing rule: unmatched spec-data on reapply is always flagged, never silently skipped

Whenever `spec-reapply-all.js` is run — now or in any future session, by this AI or any other —
**every archive in `spec-data/` that doesn't match a code in the live system must be reported
to the user by name and code, every time, never just silently left out of a summary count.**
The script already does this (the "UNMATCHED" section of its output), but the rule is explicit
here so it survives a rewrite of the script or a different tool doing the same job later: a
human-confirmed nutrition/allergen/pack record failing to find its home again is exactly the
kind of thing that must surface, not disappear into a "60 matched, done" message. A missing
match usually means a reimport renumbered or dropped that code — worth a person's attention
before assuming the ingredient just isn't needed anymore.

## Standing rule: the spec's literal value is always the first choice

External reference data (USDA tables, real-world nutrition figures, etc.) is for **sanity-
checking** a spec's stated value — never for **substituting** one. If a spec states a usable,
parseable value, that value gets written (unit-corrected if needed), even when it doesn't
reconcile against real-world reference data or the spec's own macro calculation. Only fall back
to something other than the literal value when the spec's value is genuinely unusable as
written — a range with no single number ("3.9-5.0"), a non-numeric placeholder ("not provided"),
or a case the user has explicitly told you to treat differently. A value that merely looks
implausible compared to reference data is not the same as a value that cannot be written at
all — flag the implausibility, get it confirmed, and still write what the document says unless
told otherwise. (Established 2026-09-29 on the Honey spec: its Protein cell read "0.7mg", every
other value on that row was cited "USDA" and matched real USDA honey data closely, and real USDA
protein for honey is 0.3g — a strong-looking case for substitution. The correct move was still
to write 0.0007g, the spec's own value just unit-corrected, not 0.3g.)

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

### Shelf Life (added 2026-09-29)

| Spec label | Sheet | NutriCost field | Notes |
|---|---|---|---|
| `5-a) Shelf Life from manufacturer...` | `5&6 Durability & Micro Standard` | `shelfLife` | e.g. "Production + 5 days. Minimum shelf life from delivery 3 days" |

Same sheet as Storage Conditions (`5-f)`), found the same way — by item-number prefix, not the
full question text, since the wording after "5-a)" varies between spec revisions ("Shelf Life
from manufacturer : *" on some, "...& Minimum shelf life on delivery : *" on others). Free text,
not a structured duration — specs phrase this too inconsistently to parse into a number+unit
pair reliably (some give one figure, some split manufacturer vs. delivery minimum, "once opened"
shelf life sometimes lives here and sometimes gets folded into Storage Conditions instead).

**Plausibility check, reasoned the same way as Pack Format/Storage Conditions:** a real shelf
life is always a *number of a time unit* — "5 days", "Production + 5 days", "3 months". It can
never be just prose with no duration in it. This guards against the same failure mode as those
two checks: a lookup landing on the wrong row and silently writing something that isn't
actually a shelf life. Concretely, this sheet's very next row down is `5-b) Manufacturing date
format` — a cell containing literally `"DDMMYYYY"` — which has no digit-plus-time-unit pattern
at all and would fail this check immediately if a future template change ever caused the lookup
to drift onto it. The check requires **both** a digit and a time-unit word (day/days/week/weeks/
month/months/year/years/hour/hours/hr/hrs) to be present; either one alone isn't enough (a bare
number could be a code fragment, a bare unit word with no number isn't a real duration either).
Same "warning, still blocks `--apply`" treatment as every other plausibility check — flagged for
a human to confirm, never silently written if it fails, never silently dropped either.

### Standing rule: Storage Conditions and Shelf Life ALWAYS require explicit human confirmation

Added 2026-09-29, per explicit user instruction: `storageConditions` and `shelfLife` always
generate a warning requiring `--confirm-warnings`, **even when they pass every automated check
cleanly** — unlike every other field, where a clean pass means no warning at all. These two are
singled out because a wrong value in either is a genuine food-safety risk (wrong temperature
instructions, wrong shelf life), not a cosmetic error, and because uploads are expected to be
infrequent going forward (roughly weekly) — the extra confirmation step costs almost nothing at
that cadence. In practice this means: whoever runs `spec-apply.js` must look at the actual
extracted Storage Conditions and Shelf Life text and confirm it matches the source spec before
every single `--apply`, never just trust a clean `status: "ok"` for these two fields specifically.

### Real bug found and fixed: rich-text formatting can silently fake a degree symbol

**The incident (Beef Mince, 107322, 2026-09-29):** the Storage Conditions cell read, via plain
`.value`, as `"00C - 20C"` — indistinguishable from a genuine (and dangerously different) 0–20°C
range. The actual Excel file, opened normally, visually shows `"0°C - 2°C"`. Root cause: the
cell isn't plain text at all — it's **rich text** with a manually-inserted **superscript "0"**
standing in for a real degree sign (`"0"` + superscript`"0"` + `"C - 2"` + superscript`"0"` +
`"C"`). openpyxl's default plain-text read strips all rich-text formatting, collapsing the
superscript "0" into an indistinguishable plain "0" — a silent, structurally undetectable
corruption from a 2°C range into what reads exactly like a 20°C range. This is exactly the kind
of error that matters most: it doesn't look wrong, it looks like a plausible (if oddly-typed)
value.

**Fix:** `spec-extract.py` now opens every workbook with `rich_text=True` and reads every
text-bearing cell (name, code, pack size/format, storage conditions, shelf life, ingredients
list) through a `cell_text()` helper that inspects the actual rich-text runs. A run styled
`vertAlign="superscript"` whose text is exactly `"0"` is translated to the real degree sign
(`°`). **This substitution is never trusted silently** — whenever any superscript-styled
run is found (whether it's this exact pattern or something else the helper doesn't specifically
recognise), a dedicated warning fires unconditionally, separate from the general
always-confirm-these-two-fields rule above, naming both the raw plain-text reading and the
substituted reading side by side, so a person can see exactly what was assumed and verify it
against the real file before trusting it. The reasoning for never auto-trusting this: font/
formatting tricks can vary in ways a single pattern match can't guarantee to catch every case
of — the fix makes the ONE specific pattern seen so far come out correct automatically, but the
safety net is the mandatory human check, not the pattern match's own confidence.

**Reviewed retroactively:** every one of the 63 already-processed (or in-folder) specs was
re-scanned with the fixed extraction logic, specifically checking for this rich-text warning.
**Only Beef Mince (107322) was affected** — nothing else in the batch already applied this
session was silently corrupted by this trick. No other backfill was needed for this specific
issue.

## Every field an extraction can produce — the complete list

If any of these can't be found or verified in a given spec, **that field (and depending on
which one, potentially the whole extraction) is refused, not guessed.** This is the full list —
nothing is extracted from a spec beyond what's here:

| Field | Source | If not found/verified |
|---|---|---|
| Product code (+ alt code if present) | `3 Ingredient & Recipe`, "Product Code" label (dynamic row lookup, not a fixed cell) | **Fatal** — nothing can be matched or written without this |
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
| Storage Conditions | `5&6 Durability & Micro Standard` | Warning — **plus always requires explicit human confirmation even on a clean pass** (safety-critical, see the standing rule above) |
| Shelf Life (added 2026-09-29) | `5&6 Durability & Micro Standard`, "5-a)" row | Warning — **plus always requires explicit human confirmation even on a clean pass** (safety-critical, same rule) |
| Ingredients List / Legal Ingredient Declaration (added 2026-09-29) | `3 Ingredient & Recipe`, below the "Legal Ingredient Declaration" label | Warning (non-safety — a missing declaration section is expected/normal for single-/near-single-ingredient raw materials) |

**"Fatal" means `status: "cannot_extract"`, and `spec-apply.js` refuses to even show a diff,
let alone write anything.** "Warning" means `status: "extracted_with_warnings"`, which
*currently also fully blocks `--apply`* — there is no field in this pipeline today that's
allowed through with a warning still attached. Every run either comes back completely clean
(`status: "ok"`) or is refused outright. Storage Conditions and Shelf Life are stricter still:
even a completely clean pass (`status: "ok"`, no plausibility failures) still requires
`--confirm-warnings`, because those two fields always generate their own unconditional warning
— see the standing rule earlier in this document.

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

## Surviving a full DB wipe: the `spec-data/` archive

The guarantee above covers the *incremental* cost-sync case. It does not cover a **full wipe and
reimport** — e.g. when a new live-data API/feed comes online and the ingredients table gets
cleared and rebuilt from scratch with fresh codes/costs. That would take every nutrition/
allergen/pack/ingredients-list value this pipeline has written with it, since none of it lives
anywhere except the `ingredients` row itself.

**Fix (built 2026-09-29):** every successful `spec-apply.js --apply` run now also writes a copy
of the extracted data — not the source spec file, just the small structured result: nutrition,
allergens, pack size/format/storage, ingredients list, name, and code — to
`spec-data/<code>.json`, committed to git alongside the rest of the repo. This only happens
*after* post-upload verification passes, so every archived file already represents data that was
both human-approved and confirmed live, never a guess.

- **`scripts/spec-snapshot-baseline.js`** — one-off bootstrap, already run 2026-09-29. Rebuilt
  `spec-data/` from the *then-current* live state for every ingredient that already had
  spec-derived data (60 ingredients), since the original extraction JSONs from earlier in the
  session had already been cleaned up from scratchpad temp folders before this archive existed.
  Not needed again — `spec-apply.js` now archives automatically going forward.
- **`scripts/spec-reapply-all.js`** — run this after any full wipe + reimport. It loops every
  `spec-data/<code>.json`, matches against the freshly-imported live ingredients **by code**
  (same matching logic as `spec-apply.js`), diffs, and writes back any that changed. Dry run by
  default; `--apply` writes. **No per-ingredient confirmation is asked** — each archive is
  already a previously-approved decision, so re-asking would just be asking the same question
  twice. Anything that doesn't match a code in the new import is reported separately as
  UNMATCHED and left untouched, for a person to review by hand (a renamed/renumbered code on
  reimport is exactly the kind of thing that still needs a human look, same as a first-time
  upload with no code match).
- Codes are the join key. If a reimport keeps the same codes (which is the normal case for a
  cost/code refresh — the code is the stable identifier, only cost and possibly name/pack
  change), reapply is fully automatic. If codes get renumbered, only those specific ingredients
  need manual re-matching; everything else still reapplies untouched.

## Version history: what an ingredient's nutrition looked like before

The app has a version-history feature on every ingredient (a "Version" dropdown in the edit
modal — select v1/v2/v3... to view that version's data read-only; the live/latest fields are
always what recipes and everything else in the app actually use). **This was silently broken
for months** — the single-record save endpoint that both routine UI edits and every
`spec-apply.js` write goes through never created a version snapshot at all (only the separate
bulk-import PUT did). Fixed 2026-09-29 (see backend `Program.cs`'s single-item ingredient PUT).

Every spec-driven version now also gets an auto-filled comment naming the source spec file (via
the existing `POST /api/ingredients/{id}/latest-version-comment` endpoint, called right after a
successful write) — visible in the ingredient edit modal as a "Source: ..." line under the name/
version/category row, which updates to show whichever document produced whatever version is
currently selected.

**Backfilled 2026-09-29** for all 38 ingredients already processed before this fix existed: a
one-off SQL insert (not run through the API) created a `v1` row for each, using that ingredient's
*current* live values as the snapshot (since there was never an earlier "before" state actually
saved) and a comment naming the source spec where recoverable. 8 archives still had their real
spec filename; the other 30 (this session's early baseline-snapshot recovery, see "Surviving a
full DB wipe" above) only had "baseline snapshot from live DB" as their `sourceFile`, so those
got a comment pointing back to this log instead of a fabricated filename. Nothing about future
spec uploads needs this backfill again — `spec-apply.js`/`spec-reapply-all.js` handle it
automatically from here on.

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
   - `spec-extract.py` also takes three narrow, opt-in flags — each is a real format variant hit
     during the 2026-09-28 batch (see "Extraction log" below for the specific specs). Every one
     of them is a **named exception a human must invoke explicitly, never a default behavior
     change** — the parser still hard-refuses these cases unless the flag is passed:
     - **`--override-code CODE` / `--override-code "CODE (ALTCODE)"`** — only usable when the
       Product Code cell is blank on **every** sheet of the document (nothing in the document to
       disagree with). Never overrides a code the document actually states, and never resolves a
       genuine cross-sheet code conflict — those stay hard errors. Use when a human has confirmed
       the correct code outside the document itself (e.g. from the filename).
     - **`--derive-salt-from-sodium`** — only fires when Salt (g) is blank but Sodium (mg) is
       filled in on the same row-set. Applies the standard UK/EU conversion, Salt = Sodium × 2.5
       ÷ 1000 — a legal conversion factor, not a guess, but still gated behind this flag so nothing
       gets derived without a person having looked at the specific numbers first.
     - **`--allow-blank-nutrition FIELD[,FIELD2,...]`** — covers three related but distinct
       cases, all requiring the same per-field, per-run human confirmation: (a) a field that's
       genuinely blank in the spec with no alternate value anywhere on the sheet, (b) a
       nutrition row that doesn't exist at all in this template (e.g. an older layout with no
       Fibre row), or (c) a cell holding a **non-numeric value** a human has confirmed is a real
       source notation rather than a parsing bug (extended 2026-09-29 — e.g. McCance &
       Widdowson's `"N"`, meaning "present, no reliable quantified amount", hit on the Cucumber
       spec). In every case the named field is simply omitted from the write, so `--apply`
       leaves whatever that field currently holds on the live ingredient untouched — it is never
       written as 0. A blank/missing/unparseable field NOT named here is still a hard error.
     - **`--confirm-cross-sheet-mismatch`** (added 2026-09-29, for spec 107490) — the narrowest
       of the four. Every other flag above only ever fills a blank or substitutes a
       self-consistent value; a genuine disagreement between sheets (one sheet's Product Code
       cell reads something different from all the others) was, until this flag existed,
       refused unconditionally, `--override-code` included — see the code comment "refused
       regardless of override_code". This flag does NOT change which code is used, and does NOT
       bypass the check for every case — it permits proceeding **only** after a human has
       manually opened the document, confirmed the Product Name and every other sheet's code
       agree with each other, and judged the one differing sheet's value a stray typo/leftover
       rather than evidence the sheet was copy-pasted from an unrelated product's spec. The
       differing sheet and its exact value are always named in the resulting warning.
   - **Every one of the above — including these four flags — must be preceded by asking the
     person in chat and getting an actual answer, every single time, never assumed from a prior
     ingredient's answer.** This is a standing instruction, not a one-off: even though
     `--derive-salt-from-sodium` is "just" a fixed legal formula, the person explicitly asked to
     keep being asked before it's applied, rather than have the flag become an automatic default.
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

## Known tracking exceptions

"Already uploaded?" is checked by reading the live ingredient's `kcal` value — `kcal > 0` means
a spec has already been applied, `kcal === 0` means it hasn't (see the 2026-09-28 entry below
on why the site itself, not a separate tracking file, is the source of truth for this). This
signal has exactly one known blind spot: **an ingredient whose real nutrition genuinely IS all
zeros is indistinguishable from one that's never been touched at all** — there's no separate
flag in the data model for "confirmed zero" vs "untouched."

- **Water (103004).** Confirmed correct as all-zero nutrition (2026-09-28) — writing zeros over
  existing zeros produces an empty diff, so `spec-apply.js` made no actual PUT; the record is
  unchanged. Water will keep appearing in any future "still needs a spec" scan even though it's
  already correct. Treat it as done — don't re-ask about it, and don't be surprised the
  `updatedAt`/version history shows no write from this confirmation.

If another genuinely-all-zero ingredient turns up (unlikely for anything except water/ice), the
same note applies: confirm it here by name, don't try to force a write that will just no-op.

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

### 2026-09-28 — ingredient count established; second batch hits several new real format variants

- Answered "how many ingredients total?": the live `/api/ingredients` table (409 rows) already
  **is** the base bought-in layer — BCP/HR/GR/SUB/CPU/BHP prep-recipe items live in the recipes
  API, not ingredients, so no separate filtering for "prep layer" was needed. Filtering out
  `cat: "Packaging"` (172, a strict superset of the `NF`-prefixed items) and delisted names
  leaves **207 active base ingredients**. Of those, 11 already had nutrition — **196 remained**
  needing a spec uploaded, as of the start of this batch.
- Found 6 unprocessed spec files in the folder. Processing strictly one at a time (explicit user
  instruction: "please to each ingredient 1 by 1 i dont want any cross over mistakes") — no
  batching, no extracting/asking about multiple ingredients before finishing one.
- **Konbudashi Soup Stock (106142/105034) → `RM Konbudashi Soup Stock`.** Clean extraction, no
  warnings. Name mismatch flagged ("Shimaya Kombu-Dashi Soup Stock 1kg" — brand name + spelling
  variant vs. site's stripped/respelled name) — user confirmed. Applied, verified. Used in 98
  recipes.
- **Granulated Sugar (106161/105023) → `RM Sugar Granulated (CPU ONLY)`.** Two real format
  variants, both confirmed by the user and turned into permanent, narrowly-scoped parser rules
  (not one-off fixes):
  - `Energy (Kcal)` cell read `"(400kCals)"` — parentheses-wrapped, non-standard unit spelling.
    `parse_nutrition_value()` now strips a matching pair of parens wrapping the *entire* value,
    and accepts a unit with a trailing "s" (e.g. "kCals" for a "kcal" column) as the same unit.
  - The Sulphites row read `"N, max 6 (mg/kg)"` instead of a plain Y/N. Researched the actual UK/
    EU rule first (see new `ALLERGEN-THRESHOLDS.md`) rather than guessing: **sulphites/sulphur
    dioxide is the only one of the 14 allergens with a numeric declaration threshold** — 10mg/kg
    or 10mg/L as SO2. 6 < 10, so the spec's own "N" answer is legally consistent. Added a rule
    to `spec-extract.py`, scoped *only* to the sulphite row (every other allergen row still
    requires a literal Y/N, since no other allergen has a threshold) — parses `"[Y/N], max
    X (mg/kg or mg/L)"` and trusts the stated Y/N only when X is below 10; if X were >= 10 it's
    now a hard error (a spec claiming "N" above the legal threshold is a real contradiction, not
    a formatting quirk). Also added YES/NO as a general synonym for Y/N on any allergen row,
    while here (see Soy Sauce entry below for why).
  - Name mismatch also flagged ("Standard Granulated Sugar" vs. "RM Sugar Granulated (CPU
    ONLY)", reordered words + a site-only annotation) — user confirmed. Applied, verified. Used
    in a very large number of recipes (rice/noodle/sauce base).
- **Lemon Juice (106166/105045) → `RM Lemon Juice`.** Two more real format variants, confirmed
  and turned into general parser rules:
  - `<0.1g` / `<0.01` (below-threshold lab-result notation) on Fat and Salt — user confirmed:
    record the threshold number itself (the conservative/standard reading of a "less than X"
    result). Added to `parse_nutrition_value()`: a leading `<` is stripped before parsing.
  - A bare `-` on Fibre (and on the polyunsaturate/monounsaturate/starch sub-breakdowns, which
    aren't tracked fields anyway) — user confirmed: treat as 0, same as an explicit "0". Added:
    a bare `-` now parses as `0.0`.
  - The kcal-vs-macros sanity check failed (27 stated vs. 10.5 calculated) — investigated rather
    than assumed: lemon juice's calories come mostly from citric acid, which the 4/4/9 formula
    doesn't count at all, and 27kcal/100g matches published reference values for lemon juice.
    User was confused by the raw check output first time round — walked through the formula in
    plain terms (what it's checking, why citrus specifically triggers false positives) before
    they confirmed. Applied with `--confirm-warnings`, verified (matched cleanly on name, no
    mismatch this time). Allergen "Sulphur dioxide" correctly picked up (used as a preservative
    in lemon juice, consistent).
- **Coconut Milk 17% (106169/105059) → `RM Milk Coconut Choakoch`.** The most structurally novel
  spec of the batch — this document's Product Code cell was genuinely blank on **every** sheet
  (checked "3 Ingredient & Recipe" and "1&2 Manufacturer Detail" — both empty/0), with the code
  only present in the filename. Rather than silently start trusting filenames (a real policy
  question, not a parsing detail), asked the user explicitly: they confirmed 106169 by hand for
  this one ingredient, not as a standing rule. Built `--override-code` as a narrow, opt-in flag
  for exactly this situation — it only fires when every sheet's C4 is blank (never overrides a
  code the document actually states, never resolves a real cross-sheet disagreement). Also hit
  two blank-nutrition-field cases, handled as two separate new mechanisms per the user's
  instruction to keep asking each time rather than let either become silent/automatic:
  - Salt (g) blank, but Sodium (mg) = 150 filled in — offered the standard UK/EU conversion
    (Salt = Sodium x 2.5 / 1000 = 0.375g). Built `--derive-salt-from-sodium` as an opt-in flag,
    only usable when Sodium *is* present for a blank Salt row (does nothing for a blank Salt row
    with no Sodium value to derive from — that's still a hard error).
  - Sugar (g) blank with **no** alternate value anywhere on the sheet — a genuine gap the spec
    itself never states, nothing to derive it from. Built `--allow-blank-nutrition FIELD[,...]`
    as an opt-in flag: the named field is simply omitted from the write (so `--apply` leaves the
    ingredient's current value for that field untouched, never writes it as 0).
  - Name mismatch also flagged ("Coconut Milk 17%" vs. "RM Milk Coconut Choakoch" — reordered +
    brand name "Choakoch" added + fat% dropped) — user confirmed. Applied with
    `--confirm-warnings --confirm-name-mismatch`, verified. Used in 11 recipes.
- **Standing instruction from the user, mid-batch:** keep asking via AskUserQuestion before
  applying any of these override flags, every single time — including the ones that are "just"
  a fixed formula or a legally-grounded rule (like the sulphites threshold or the sodium-to-salt
  conversion). The flags exist to make the override auditable and never-default, not to let the
  pipeline start deciding these on its own after the first confirmation.
- Remaining in this batch, still to process one at a time: Tom Yum Paste (106170), SS3 Soy Sauce
  No Added Alcohol Bulk (107170).

### 2026-09-28 — two more specs; --override-code extended to a populated-but-wrong code, and to a genuinely missing nutrition row

**Standing rule, made explicit here per the user:** whenever any part of an input is
questionable -- an unfamiliar format, a mismatched name, a value that doesn't read as
expected, a code that looks wrong -- the user must always be asked to confirm before
proceeding, every single time, regardless of how many times a similar case has already been
confirmed before. This is not a one-off preference; it's the standing rule this whole pipeline
is built around (see "Why this stays safe" above). A fresh AI reading only this doc should
treat *any* moment of "is this right?" as a hard stop for a question, not a judgment call to
make alone.

- **Java Curry Mix (105950/105006) → `RM Java Curry Mix House Foods`.** The spec's own Product
  Code cell was **filled in and consistent across every sheet, but with the manufacturer's own
  code ("F0550"), not ours.** This is a different case from a blank cell (Coconut Milk,
  previous batch) -- `--override-code` only covered "blank everywhere" until now. Extended it
  to also cover "populated everywhere but with a different, non-Wasabi code," under the exact
  same precondition: every sheet must agree with itself first (still refuses outright if sheets
  disagree with EACH OTHER, regardless of the flag). User confirmed 105950 is correct, F0550 is
  House Foods' own code. Name mismatch also flagged ("House Java Curry Sauce Mix KB No Milk
  20kg" vs "RM Java Curry Mix House Foods") -- confirmed same product. Applied, verified.
- **Xanthan Gum (106251/105019) → `RM Xanthan Gum`.** The most structurally unusual spec seen
  so far -- an older template variant with THREE separate issues, each confirmed individually:
  1. The "3 Ingredient & Recipe" sheet's Product Code cell was blank, AND its Name cell
     mistakenly held the code instead of a real name. The REAL name ("XANTHAN GUM") and REAL
     code ("106251 (105019)") were both present and correctly labeled on the "1&2 Manufacturer
     Detail" sheet, just at a shifted row offset (row 2/3 instead of the usual row 3/4) --
     evidence of an older template revision. User confirmed using those values.
  2. This template's nutrition panel has **no Fibre row at all** (jumps straight from Protein
     to Sodium/Potassium/Calcium) -- not blank, genuinely absent from the row layout. Extended
     `--allow-blank-nutrition` (previously only for a found-but-blank cell) to also cover a row
     that doesn't exist in the template at all -- still opt-in per field, still requires the
     row to actually be checked and shown to the user first, still refuses any field NOT
     explicitly named.
  3. Salt stated as literal "n/a" with Sodium = 390mg given -- same
     `--derive-salt-from-sodium` mechanism as Coconut Milk, asked and confirmed again (never
     assumed from the earlier precedent).
  4. Pack Format extracted as "CLEAR LINERS" failed the plausibility check (describes the bag's
     lining material, not the pack type). Initially going to leave it blank, but the user
     pointed out Pack Size ("25KG BAGS") already tells us the real format -- corrected to write
     "Bag" instead of leaving it unset. Applied, verified.

### 2026-09-28 — Diced Potato, Rapeseed Oil; a real self-correction on "corrupted" framing

- **Diced Potato (106208/105905) → `RM Potato Dice 10mm`.** Same "code blank on the usual
  sheet, correct on Manufacturer Detail" pattern as Xanthan Gum -- confirmed, applied via
  `--override-code`. Two new real format variants hit and confirmed:
  - Saturates cell read `"tr"` (standard food-labeling shorthand for "trace amount, below
    quantifiable"). Confirmed and generalised into `parse_nutrition_value()` as a synonym for
    the existing dash-as-zero rule (`"tr"`/`"trace"`, case-insensitive → 0).
  - Salt cell read `"17.5mg"` -- not a unit-suffix formatting quirk like earlier cases, but the
    unit itself was wrong. Verified independently before asking: Sodium was 7mg, and 7 × 2.5 =
    17.5 exactly, confirming this WAS the correct salt-from-sodium value, just mislabeled mg
    instead of g. Confirmed and corrected to 0.0175g -- handled as a one-off manual patch to
    the extraction JSON, not a new parser rule (unlike "tr", this needed spec-specific
    corroborating math, not a safely generalisable pattern).
  - Also hit the missing-Fibre-row case again (`--allow-blank-nutrition fibre`).
- **Diced Carrot (106209/105904) — user caught this spec is delisted** before any code
  question was even resolved (the filename code didn't match any live ingredient at all; the
  closest name-match candidate was a different code, 107685). User: "i now see this spec i
  have given you is delisted, ignore that i will find the correct spec." Not processed.
- **Rapeseed Oil (106167/105047) → `RM Oil Rapeseed CPU use only`.** A real self-correction
  worth recording in detail, since it shows what "always ask" looks like when the first
  read of a problem is wrong:
  - Initial investigation found the Product Code field stating a stale code ("10202/102035")
    on the first two sheets, then the pack size ("1000lt IBC") mistakenly appearing in that
    same field on several other sheets. This was reported to the user as **"the document looks
    structurally corrupted."**
  - The user pushed back with a screenshot showing the Nutrition Information sheet's actual
    data (rows 12+) completely clean and well-populated -- directly contradicting the
    "corrupted" framing. Re-checked precisely rather than defending the original claim: the
    nutrition/allergen/packaging DATA was never the problem. Only the Product Code *field
    specifically* held wrong values (a stale code, then a data-entry mistake pasting the pack
    size into the code field on later sheets) -- a real but narrow data-entry error, not
    document corruption. Said so plainly, including the direct quote of what was overstated.
  - With the accurate, narrower picture, the user re-confirmed proceeding with 106167 (105047)
    from the filename (matches a real, unprocessed live ingredient by both code and name).
  - Separately, extraction had also been silently failing on Fibre — this spec spells it
    **"Fibre"** (UK spelling) where the code only matched **"Fiber"** (US spelling), a genuine
    spelling variant across real specs. Generalised into the nutrition-row lookup: try both
    spellings for this one field before treating the row as missing.
  - The `name` field also came back as the garbage code text (same class of issue as Xanthan
    Gum's mislabeled name cell) -- corrected to "Rapeseed Oil," confirmed both directly by the
    user and independently via the Nutrition sheet's own Product Name row. Name mismatch also
    flagged against the live ingredient's name ("Rapeseed Oil" vs "RM Oil Rapeseed CPU use
    only") -- confirmed. Applied, verified.
  - **Lesson for a fresh AI:** a claim like "this looks corrupted" needs the same evidence
    standard as every other flag in this pipeline -- don't generalise from one wrong field to
    the whole document. When corrected, restate the narrower, accurate picture rather than
    quietly dropping the claim.
- **Water (103004).** Confirmed correct as all-zero nutrition. Produced no actual database
  write (writing 0 over an already-0 default is an empty diff) -- see the new "Known tracking
  exceptions" section above for why this ingredient will keep showing as "missing" in any
  future kcal-based scan despite being correct, and why that's expected, not a bug.

### 2026-09-28 — IQF Carrot Diced, IQF Diced Onions; a real kJ/kcal swap confirmed and corrected

- **IQF Carrot Diced (107685) → `RM IQF Carrot Diced 10 mm`.** This is the corrected spec the
  user re-supplied after catching that the earlier-found 106209 file was for a delisted item.
  - Energy fields were genuinely swapped in the source spec: literal cells read kj=30, kcal=125
    -- neither reconciled with anything (not with each other by the kJ/kcal conversion factor,
    not with the macro calculation, not with real-world carrot reference values). Investigated
    before asking: **30 kcal × 4.184 = 125.5 kJ**, an almost exact match, and 30kcal alone
    matches both the macro-derived estimate (31.3kcal) and real carrot data (~35kcal). User
    confirmed this is a genuine swap, not just an unreconciled discrepancy -- corrected to
    kj=125, kcal=30 (the actual values, cells transposed). This is a materially different
    resolution than the earlier IQF Julienne Carrot case, where the user chose to write an
    unreconciled kJ/kcal pair exactly as entered rather than "fix" it -- proof each case is its
    own question, not a rule to reapply.
  - Pack Format: "Liner" alone (the extractor's default read) undersold what the document
    actually said. Asked whether the spec mentioned a bag/box anywhere -- searched the whole
    workbook, found the outer packaging material is "Cardboard Carton" (Packaging Detail 4-d)
    and the date-location fields on Durability say "Box". User chose to combine both:
    **"Liner (inner), Carton (outer)"**.
  - Storage Conditions: spec said "-18 degreas Celsius" (typo'd "degrees") -- user asked for
    temperature only, written as "-18°C".
  - Name mismatch ("IQF Carrots diced 10mm" vs "RM IQF Carrot Diced 10 mm" -- plural/spacing
    only) confirmed. Applied, verified.
- **IQF Diced Onions (106579/106603 in filename, matched on 106579) → `White Onion Diced 20mm
  Bag Frozen`.** Clean energy values this time (36kcal × 4.184 = 150.6kJ, matches the stated
  150kJ almost exactly -- no swap issue here). Same inner/outer packaging pattern as the carrot
  spec just above -- inner "Blue liner", outer "Carton" -- combined the same way per the user's
  now-established preference: **"Blue liner (inner), Carton (outer)"**. Name mismatch ("IQF 20
  mm Diced Onion" vs "White Onion Diced 20mm Bag Frozen" -- live name adds colour/bag/frozen
  descriptors) confirmed. Applied, verified.
- **Note on combined inner/outer Pack Format:** this is now the second spec where the user
  chose to combine both packaging layers into one Pack Format string rather than pick just one.
  Worth checking whether a future spec's inner-only answer ("Liner", "Bag", etc.) should
  prompt the same "check for an outer material too" question by default -- but per the standing
  rule, still ask each time rather than silently assume the combined format is always wanted.

### 2026-09-28 — Kale, Chives, Breaded Prawns, Frozen Fried Tofu, Burnt Sugar Syrup; a real script-crashing Unicode bug found and fixed

- **A real bug, not a data issue:** `spec-extract.py` crashed outright (unhandled
  `UnicodeEncodeError`) on the Breaded Prawns spec, which contains a genuine single-glyph
  degree-Celsius character (U+2103, "℃") in its Storage Conditions text. Windows' console
  defaults Python's stdout to cp1252, which can't represent that character at all -- this
  wasn't a spec formatting quirk to flag, it was the script's own I/O breaking on legitimate
  Unicode text. Fixed once, generally: `sys.stdout.reconfigure(encoding="utf-8")` at the top
  of the script. This is an I/O fix, not a data-interpretation change, so it didn't need the
  same "ask every time" treatment the parsing rules get -- there's no judgment call in making
  the script not crash on valid text.
- **Chopped Kale (106127/106073) → `RM Chopped Kale TCK Bag`.** Same "code blank on the usual
  sheet, correct on Manufacturer Detail (older template)" pattern as Xanthan Gum/Diced Potato,
  confirmed. Same missing-Fibre-row gap as those two, confirmed. Clean name match, no mismatch
  flag. Applied, verified.
- **Chives (106128) → live ingredient.** Clean extraction except Storage Conditions contained a
  corrupted character where a degree symbol should be (encoding artifact in the source file,
  not the U+2103 case above -- a different, garbled byte). Confirmed and written cleanly as
  "+2°C".
- **Breaded Prawns (106131/105007) → `RM Prawn Breaded`.** Another manufacturer-code case (spec
  consistently states "YK70704", Yutaka's own code) -- same `--override-code` handling as Java
  Curry, confirmed. Fibre explicitly "N/A" in the spec, confirmed via `--allow-blank-nutrition`.
  Name mismatch ("Yutaka Ebi Fry Panko Prawns..." vs "RM Prawn Breaded") confirmed. Applied,
  verified.
- **Frozen Fried Tofu (106243) → `RM Fried Tofu NEW`.** Fibre explicitly "N/A", confirmed same
  as above. Storage Conditions ("Keep under -18℃") failed the plausibility check purely because
  it doesn't contain a recognised keyword (frozen/chilled/etc) -- phrased as "keep under" +
  temperature instead. Confirmed as genuine, written as entered. Name mismatch ("Frozen Fried
  Tofu(4 x 4cm)" vs "RM Fried Tofu NEW") confirmed. Applied, verified.
- **Burnt Sugar Syrup (107330/P00036) → `RM Plain Caramel (Burnt Sugar Syrup)`.** Clean
  extraction, `status: "ok"`. Name mismatch ("Burnt Sugar Syrup NC0020 - CARAMEL13" vs "RM
  Plain Caramel (Burnt Sugar Syrup)" -- both key phrases present, reordered, supplier codes
  added) confirmed. Applied, verified.

### 2026-09-28 — 8 more specs; a new document-type refusal, and swapped code/name labels

- **Cornflour (106189) — not a Raw Material Specification at all.** The file supplied is a
  completely different document type: `TECH-PROCESS-20 "Raw Material Quality Attribute Sheet"`
  (a single "QAS" sheet covering organoleptic goods-in criteria -- appearance, flavour, aroma,
  texture, foreign bodies) rather than `TECH-PROCESS-19 "Raw Material Specification"`. It
  contains **no nutrition or allergen data anywhere** -- not blank fields, the sections simply
  don't exist in this document type. Correctly refused (`cannot_extract`, wrong sheet names)
  before any override flag was even considered -- this class of problem isn't a formatting
  quirk to fix, it's the wrong document. Reported back plainly; the real spec still needs to be
  sourced.
- **Gluten-Free Soy Sauce Sachet (100681) → live ingredient of the same name.** Clean
  extraction, `status: "ok"`, no name mismatch. Applied, verified.
- **Industrial Noodles (103895/105076) → `RM Noodle Industrial`.** The Manufacturer Detail
  sheet had its OWN label/value pairs swapped with each other -- "Product Name :" held the
  code, "Wasabi Product Code :" held the name "Industrial Noodles". Confirmed and used
  `--override-code`. Also: no Fibre row (same older-template gap), and Salt cell contained only
  a stray backtick character with Sodium also N/A (nothing to derive from) -- confirmed left
  unset via a manual patch (the backtick was an "unparseable" error, not a "blank" one, so
  `--allow-blank-nutrition` didn't cover it automatically; handled as a one-off rather than
  extending the flag's scope to catch every unparseable case).
- **Sriracha Mayonnaise (104634/105087) → `Sriracha Mayo Sachet`.** Confirmed the extraction's
  zero-allergens result was genuinely correct (not a missed row) by checking Egg/Milk/Soya/
  Mustard explicitly -- all stated "N" (this is a vegan mayo). Pack Format ("Laminate")
  described the material, not the type; the 15g pack size made clear it's a sachet, matching
  the established soy-sauce-sachet convention -- written as "Sachet".
- **Paprika Powder (106160/105017) → `RM Paprika Powder`.** Same blank-code/Manufacturer-Detail
  pattern. Carbohydrate cell read `"54.0'"` -- a stray trailing apostrophe, confirmed as a plain
  typo and generalised into `parse_nutrition_value()` (strip a single trailing apostrophe/quote
  mark). Sanity check failed once carb was corrected (282 vs 388.5 calculated) -- investigated
  against real USDA paprika reference data (~289kcal, ~13g fat, ~14g protein, ~54g carb, ~35g
  fibre) which matches almost exactly; confirmed as the same class of false alarm as lemon
  juice, caused by dried spices' very high fibre content not being counted by the 4/4/9
  formula. No Fibre row (same gap). Name mismatch confirmed.
- **Frying Powder (106202/105049) → `RM Frying powder`.** Clean extraction, `status: "ok"`, but
  the spec's own name ("Chicken Breading WSB MK2") shared no obvious wording with the live
  ingredient's name -- user asked "do the codes match?" rather than accept on trust. Verified:
  the spec's own C4 code cell, the filename, and the live ingredient code all agreed exactly
  (this was never a blank-code or wrong-code case, `status: "ok"` the whole time) -- only the
  descriptive names differed. Confirmed once that was established. Worth remembering: a
  surprising name mismatch is a prompt to re-verify the underlying evidence, not just re-ask
  the same framing.
- **Sliced Red Pepper (106438/106450) → `RM Red Pepper Sliced 30x60mm IH Foods`.** Same
  blank-code/Manufacturer-Detail pattern (code cell had stray tabs/newlines mixed in). No Fibre
  row (same gap). Name mismatch (dimension order reversed, 60x30 vs 30x60) confirmed.
- **Onion Powder (106955) → `RM Onion Powder`.** A genuinely unresolvable allergen answer: the
  Sulphites row read *"product may contain naturally occurring SO2 (not tested to verify
  levels)"* -- not a Y/N, not a numeric ppm value the threshold logic could evaluate, and
  explicitly states no testing was done. This is a real unknown, not a formatting quirk --
  presented plainly as a genuine judgment call rather than trying to parse it. User chose the
  precautionary reading: **treat as Y (declare Sulphur dioxide present)**, on the reasoning
  that "may contain, untested" cannot be treated as absent. Handled as a one-off manual patch,
  not a new parser rule (this phrasing is too open-ended to safely generalise). Pack Format
  combined inner ("2x heat sealed inner liners") + outer ("cardboard box").
- **Shiitake Mushrooms (107320) → `RM IQF Shitake Mushroom`.** Sanity check failed (56kcal vs
  65.8 calculated, 17.5% gap) -- investigated against real shiitake reference data (close to
  56kcal for cooked/frozen) before asking; confirmed as fibre-related, same class as the
  paprika/lemon-juice cases. Pack Format combined inner ("Blue Polyliner") + outer ("Cardboard
  Carton"). Name mismatch (Shiitake/Shitake spelling, "Sliced" dropped) confirmed.

### 2026-09-29 — folder-based drip-feed workflow starts; a genuine kJ/kcal swap plus a sugar
range plus a salt-from-sodium derivation, all in one spec

Data-recovery testing (real wipe, real reimport, `spec-reapply-all.js`) happened first this day
-- see the "Surviving a full DB wipe" section above and its own dated entries there. Two real
bugs were found and fixed in the process (fake "Clear all"/wipe buttons that never actually hit
the server, and name-keyword allergen auto-guessing on every BOM import/resync) -- not spec
issues, but they blocked trusting spec-uploaded allergen data until fixed. Both are fixed and
deployed; `data.js`'s `autoDetectAllergens` is deleted entirely.

From here on, the user adds specs to the `Ingredient Specs` OneDrive folder incrementally rather
than all at once -- each session just diffs the folder's codes against `spec-data/`'s archived
codes to find what's new, rather than re-scanning everything.

- **Gyoza Sachet (106234/105048) → `RM Sauce Gyoza Dipping Sachet`.** Clean extraction,
  `status: "ok"`. Name mismatch confirmed (spec's short name vs live's fuller
  "Sauce...Dipping..." name, same Shoda-supplied product). Applied, verified. Flows into 10
  recipes (Gyoza boxes, tasting boxes).
- **Pear Puree (105557/105567) → `RM Pear Puree` (106255).** The spec's own Product Code field
  states 106255/105567 -- the folder filename's "105557" turned out to be a transposed-digit
  typo of the alt code 105567, not a real second code; doesn't collide with anything live, so no
  override needed, matched cleanly on 106255 with an exact name match. Sanity check passed
  (45.3 vs 48.2 kcal, ~6% gap, consistent with fruit fibre/acid content not counted by the
  formula). Applied, verified. Flows into 16 recipes (the whole Korean BBQ line).
- **IQF Red Chilli Puree Nuggets (106959) → `RM Puree Red Chilli Nugget IQF`.** The most
  involved single-spec case this session -- three separate issues, each individually confirmed:
  1. **kJ/kcal genuinely swapped** in the spec (entered kj=25, kcal=105). Same pattern as IQF
     Carrot Diced's swap on 2026-09-28: caught because 25kcal x 4.184 = 104.6 ~= the stated 105
     (a near-exact cross-check), AND the macro sanity check independently lands on 24.3kcal,
     matching 25 not 105. Two independent checks agreeing on the same correction is much
     stronger evidence than either alone -- corrected to kj=105, kcal=25.
  2. **Sugar given as a range**, `"3.9-5.0"`, which `parse_nutrition_value()` correctly refused
     to write (`unparseable`, not a blank -- `--allow-blank-nutrition` doesn't cover this case,
     deliberately, since a range isn't the same problem as an empty cell). Not generalized into
     the parser -- a range's midpoint is a judgment call the parser shouldn't make silently, so
     this stays a manual per-case patch. Used the midpoint, 4.45g, per human confirmation.
  3. **Salt blank, Sodium 0.01mg present** -- derived via the standard conversion
     (0.01 x 2.5 / 1000 = 0.000025g, effectively negligible but derived rather than left blank),
     per human confirmation.
  Name mismatch confirmed (word-order/plural differences, same product). Pack Format
  ("Polyliners - Blue") flagged by the heuristic as not looking like a container type, but read
  as legitimate on inspection -- consistent with "Blue Food Grade Bag" phrasing seen on several
  other frozen IQF/diced veg items this session. Applied, verified. Flows into 13 recipes
  (the Hot Honey line, Vegetable Curry).
- **Sweet Chilli Sauce (106132/105008) → `RM Sauce Sweet Chilli Yutaka`.** Clean extraction,
  sanity check passed (158.5 vs 162 kcal, ~2%). Pack Format warning ("Plastic Gallon, Heat
  Induction Seal, Cap") was another heuristic false positive -- read as a legitimate container
  + closure description on inspection, same as the Chilli Nuggets case above. Name mismatch
  confirmed (word-order/brand-name difference, same Tazaki/Yutaka product). No allergens
  declared in the spec -- trusted as stated, not assumed. Applied, verified. Flows into **111
  recipes** -- by far the widest-reaching single ingredient processed so far, covering most of
  the Korean BBQ / Sweet Chilli Chicken product range.
- **Chilli Powder (107313) → `RM Ground Chilli`.** The weakest code evidence of any spec
  applied this session: the document's own Product Code field states `CHIPO/002` (the
  manufacturer's SKU) on every one of its 11 sheets, and a full-workbook search confirmed
  `107313` appears **nowhere inside the document at all** -- the match rests entirely on the
  folder's filename convention (`<code> (<alt code>) <description>.xlsx`), corroborated by
  product category (Ground Chilli / Chilli Powder) and supplier. User explicitly confirmed
  proceeding on filename evidence alone after being shown this was weaker than the usual case.
  Salt stated as `"not provided"` (text, not a number) -- left unset rather than guessed, same
  treatment as a genuinely blank cell. Sanity check failed (459.5 vs 389.7kcal, 15.2%) --
  checked against real USDA chilli powder reference data (fat/carb/fibre/protein all matched
  closely; only the stated kcal was far off both the macro calculation AND the ~282kcal USDA
  figure). Unlike the Paprika/Shiitake fibre-driven gaps, this one didn't reconcile against
  independent real-world data either -- flagged as a likely genuine data-entry error in the
  spec, but user explicitly chose to write the literal stated value (459.5) rather than the
  macro-calculated figure. Applied, verified. Flows into 98 recipes (Flaming Chicken/Korean
  Fire Chicken line, Chilli Oil products, and many sushi sets via the Wasabi Sachet chain).
- **Diced Red Pepper (106228) → `RM Diced Red pepper 20mmx20mm PACK 5KG`.** Clean extraction,
  sanity check passed. Name mismatch confirmed (word order/pluralisation only). Applied,
  verified.
- **Ginger Sachet (105241) → same name live.** Two real internal-consistency issues, each
  confirmed individually. (1) Fibre stated 3.3g/100g while Carbohydrate is `<0.1g` -- physically
  inconsistent, since fibre is normally a subset of total carb, and every other value in this
  sachet is near-zero (fat 0.04g, sugar 0g). Read as a copy-paste artifact from an unrelated
  product's row; left unset rather than written. (2) kJ/kcal are internally self-consistent
  with each other (7.65kcal x 4.184 = 32.0kJ exactly, so not a swap) but don't reconcile against
  the macro calculation (1.8kcal) even loosely -- no confident explanation found for numbers
  this small; written as literally stated per explicit confirmation. Salt (2.81g/100g) is
  plausible on its own for a salted/brined condiment sachet. Applied, verified.
- **Pak Choi Sliced (106217) → `RM Pak Choi Sliced 1KG`.** The Wheat/wheat derivatives allergen
  row's label text was entirely missing from the sheet (row 26, blank `A26`), which
  `spec-extract.py` correctly refused to interpret automatically -- a missing category label
  could mean a dropped question, not necessarily a formatting glitch. Investigated: the row's
  Y/N answer cells were still present (`N`) in exactly the position Wheat occupies in every
  other spec's standard row order (between Seed and Oat), and every other category in the sheet
  also answered N for direct presence (Celery and Sulphites show cross-contamination risk only,
  not direct presence). Read as a label-formatting glitch, not a dropped question --
  human-confirmed before treating Wheat as N and proceeding. No existing override flag covers
  this specific case (a missing LABEL, not a missing VALUE) -- patched manually as a one-off
  rather than generalizing a new flag for something only seen once. Name mismatch confirmed.
  Applied, verified.

### 2026-09-29 — nine more specs; version-history/source-document feature built and backfilled
in between (see "Version history" section above), then this batch

- **Tomato Ketchup (103889/105074) → `RM Tomato Ketchup`.** Clean, exact name match after RM
  prefix strip. Applied, verified.
- **White Miso (106003/106022) → `RM White Miso Paste Hikari`.** Name mismatch confirmed
  (word-order only, same Hikari-brand product via Tazaki). User feedback: going forward, always
  state explicitly whether the CODE matches when asking a name-mismatch question, not just the
  name comparison -- the code match is often the stronger piece of evidence and should be named,
  not left implicit. Applied, verified.
- **Sushi Prawn (106130/105598) → `RM Prawn Ebi (Tazaki Own brand)`.** Codes matched exactly;
  name overlap was thin ("Sushi Prawn 3L ASC certified" vs "Prawn Ebi") but supplier (Tazaki) and
  high sushi-grade cost both corroborated. Confirmed, applied, verified.
- **Pak Choi Sliced 2.5kg (106174/106071) → `RM Sliced Pak Choi 2.5 Kg`.** A DIFFERENT Pak Choi
  ingredient from 106217 (processed earlier this session) -- different code, different pack size,
  different supplier (TCK Fresh Produce vs the earlier one). Clean match. Applied, verified.
- **White Cabbage Whole (106206) → `RM Cabbage Wholehead`.** Clean code/name match. Pack Format
  extracted as "N/A RM Loose" (flagged by the heuristic) -- confirmed as a legitimate answer
  meaning "sold loose, no specific pack format", written as stated. User asked directly whether
  spec-apply.js ever overwrites the live ingredient's NAME field -- confirmed from the script's
  own diff scope that it never does; the spec's product name is only ever used for the
  name-match CHECK, never written. Applied, verified.
- **Matilda Sushi Rice (106214) → `RM Rice Sushi`.** Codes matched exactly. The spec's internal
  product name ("4049 Matilda Medium Grain White Rice") doesn't say "sushi" at all -- but the
  filename does ("Matilda Shusi Rice"), and medium-grain white rice is the standard sushi rice
  variety, so the internal name field just reads as more technical/generic than the live
  ingredient's usage-based name. Confirmed, applied, verified.
- **Fine Semolina (106238/105082) → `RM SEMOLINA FINE`.** Clean, word-order-only name match.
  Applied, verified.
- **Plum Puree (107498/P00062) → `RM Plum Puree`.** Clean, exact name match. Sanity check gap
  (45.2 vs 48.2kcal, ~6%) consistent with the fibre/acid pattern seen on every other fruit puree
  this session. Applied, verified.
- **Shokupan Bun (106987) — PAUSED, not applied.** The "Product contains?" allergen column is
  entirely blank for every category except the ones genuinely present (Wheat, Gluten, Yeast,
  Milk, Egg all have an explicit Y; nothing else does). Investigated and read as internally
  consistent (every real allergen has explicit confirmation, nothing is actually ambiguous), but
  user chose to pause rather than confirm reading blanks as N -- logged in
  [SPEC-ISSUES-TO-REVIEW.md](SPEC-ISSUES-TO-REVIEW.md) with the full extracted data ready to
  apply once reviewed.

### 2026-09-29 — a new template layout variant found (row-shifted), a genuine unit-mismatch
correction, and a standing rule on external reference data

- **New template variant: row-shifted layout.** Two specs (Honey, Diced Green Pepper) use a
  document layout with everything shifted up one row versus every other spec seen this session
  -- title at row 5 instead of row 1, Product Name at row 2 instead of 3, Product Code at row 3
  instead of 4. `spec-extract.py`'s code lookup is hardcoded to C4, so it read blank on both;
  the name extraction similarly misread the wrong cell. Manually verified by reading C2/C3
  directly on the raw sheet for both -- the real Product Code cell was present and unambiguous
  in both cases (not blank, just in the wrong row for the parser to find), a stronger form of
  evidence than the usual blank-code override case. Not generalized into the parser yet (seen
  twice, both today, possibly a newer template revision -- worth watching for a third
  occurrence before deciding whether to add row-shift detection generally).
- **Honey (106041/106147) → `RM Sarant Mexican Honey`.** Real product name "Mexican Honey"
  confirmed via the row-shift investigation above. Protein stated as "0.7mg" -- a genuine unit
  mismatch (column header says g). Every OTHER value on the same row cites "USDA" as its source
  and matches real USDA honey data precisely (304kcal, 82g carb, 0g fat), so this looked like a
  case for substituting the real USDA protein figure (0.3g) -- **user explicitly corrected this
  approach**: the spec's literal value is always the first choice, external reference data is
  for sanity-checking only, never for substituting a value the spec actually states unless it's
  truly unusable (a range, "not provided", etc.) -- "0.7mg" is a normal, parseable value that
  just needs its unit corrected, not replaced. Standing rule going forward. Converted
  0.7mg → 0.0007g (unit fix only, not a value substitution). Fibre row doesn't exist in this
  template at all -- left unset. Applied, verified.
- **Diced Green Pepper 25x25mm (106163/105027) → `RM Pepper Green Square 25 MM`.** Same
  row-shifted template. Clean nutrition (sanity check 16.3 vs 15kcal, fine), same missing-fibre-
  row gap as Honey. Pack format/storage pulled from the Packaging Detail and Durability sheets
  directly (Blue Food Grade Bag, Chilled 1-5°C) -- consistent with the established convention for
  diced/sliced veg items this session. No pack size (weight) stated anywhere in the document.
  Applied, verified.
- **Simply Vanilla Syrup (107390) → `RM Simply Vanilla Syrup rPET bottle`.** Clean extraction,
  standard template. Name mismatch confirmed (spec says "UCC Vanilla Syrup" -- UCC Coffee UK
  Limited is the exact live supplier, "Simply" is just the live ingredient's product-line
  branding). Fibre genuinely blank (not a missing row, an actual blank cell this time). Applied,
  verified.
- **IQF Edamame Beans (106581) -> `RM Edamame Beans IQF`.** Spec's own code field consistently
  states "VEG383" (Pagoda Kitchen's own SKU format), not a Wasabi code -- standard
  manufacturer-code override, confirmed via filename + exact product/category match. Sanity
  check fine (118.7 vs 128kcal, ~7.7%). Applied, verified.

### 2026-09-29 (later) -- ingredients-list extraction was never actually automated; fixed and backfilled

User caught that `spec-extract.py` had never actually been extended to pull the "Legal
Ingredient Declaration" text out of a spec at all -- the `ingredientsList` field, the DB column,
and the UI form field built the day before were all real, but nothing populated them
automatically. Sriracha Mayo Sachet (104634) was the one exception, typed in by hand from a
screenshot. Every other ingredient processed since (49 of them) had this field sitting blank.

**Fixed:** `spec-extract.py` now locates the "Legal Ingredient Declaration" label row
dynamically on the recipe sheet (same `find_row_starting_with` helper used elsewhere) and reads
the cell directly below it -- the declaration text is always in a merged cell whose value lives
on the top-left anchor, so this works regardless of how many rows the merge spans. Verified
against both Katsu Mayo (label at row 54, text at row 55) and Sriracha Mayo Sachet (label at row
53, text at row 54) -- the Sriracha result matched the hand-typed value exactly, character for
character.

**Backfilled** for all 49 already-processed ingredients missing it: re-ran extraction against
each one's original source file (20 archives still had a real filename; the other 29 -- this
session's early baseline-snapshot recovery -- were located by matching their code against the
current `Ingredient Specs` folder listing, since the files themselves were never lost, only the
JSON extraction record was). 36 had an actual declaration section and got backfilled (live
ingredient PUT, spec-data archive updated, new version snapshot with its own comment). The other
13 (checked individually -- Rapeseed Oil, Industrial Noodles, Honey, and by the same pattern the
rest) are single- or near-single-ingredient raw materials (oils, spice powders, plain produce,
honey) whose source documents genuinely have no "Legal Ingredient Declaration" section at all --
confirmed as a real absence, not an extraction miss, before leaving them blank.

### 2026-09-29 (later still) — FVN name-guessing found and removed; Chartsheet crash fixed; nine more specs

- **FVN (Fruit/Vegetable/Nut) had the identical name-keyword-guessing bug already found and
  removed from allergens.** User spotted it directly: "RM Inari Cooked Bean Curd Ytk" showed
  FVN checked despite never having a spec applied. Root cause: `autoDetectFVN()`'s keyword list
  included "bean", which matched the substring in "Bean Curd" -- bean curd/tofu is not FVN-
  eligible for HFSS purposes. This ran on BOM import create AND on every routine cost resync
  (the same dangerous overwrite-on-every-sync pattern as the allergen bug). Removed all 7
  frontend call sites (5 in app.js, 2 in excel-import.js) and both backend call sites
  (ImportService.cs create + merge paths), deleted the function everywhere it existed
  (data.js, ImportService.cs). FVN is now only ever set by spec confirmation or manual entry.
  **Reviewed all live ingredients**: 42 had `fvn=true` that was never spec-confirmed -- some
  coincidentally correct (real vegetables), several genuine false positives (Bean Curd, Baked
  Beans, Potato Starch, Red Pepper Paste, Coffee Beans, Mushroom Powder -- none FVN-eligible).
  Cleared all 42 to `false` per user decision, rather than leave unconfirmed guesses looking
  authoritative even where accidentally right.
- **Real crash bug: an embedded Chartsheet in a workbook breaks every full-sheet scan.** Found
  on the Tahini spec -- `Chartsheet` objects (a chart-only tab, no cell grid) have no
  `.iter_rows()`, so the cross-sheet code-consistency check crashed outright with an
  `AttributeError` instead of returning a clean `cannot_extract`. Fixed by building one
  `sheet_names` list at the top of `extract()` (`[n for n in wb.sheetnames if hasattr(wb[n],
  "iter_rows")]`) and using it everywhere a full-workbook scan happens, instead of
  `wb.sheetnames` directly. No regression on any previously-working spec.
- **Kikkoman Teriyaki Sauce 4L (105952/105039) → `RM Teriyaki Sauce Kikkoman (CPU Only)`.** Two
  real issues. (1) Product Code cell read literally `"1105952 (105039)"` -- a genuine typo, an
  extra leading "1" before the real code -- corrected per human confirmation, matching filename/
  live ingredient/alt code. (2) **Every single nutrition value given as a dual range**
  (`"86kcal / 99kcal"`, etc, both the per-100g AND per-pack columns) -- read as two lab retest
  results, not one official figure. Used the midpoint of each range per explicit human
  confirmation. Sodium/Salt midpoints cross-checked consistently (9.54g via the standard
  conversion vs 9.55g stated), confirming the range reading itself was coherent. Sanity-check
  gap (69 vs 92.5kcal from macros, ~25%) plausibly explained by **Wine** in the ingredients list
  -- alcohol contributes calories the standard fat/carb/protein formula doesn't count, same
  class of explanation as fibre/acid gaps seen elsewhere this session. Shelf life matched a
  pre-existing legacy value on the live record exactly, corroborating the extraction.
- **Inari Cooked Bean Curd (102584) → `RM Inari Cooked Bean Curd Ytk`.** The exact ingredient
  the FVN bug above was found on. Blank code (override to 102584, confirmed via filename +
  strong name match). Clean nutrition, sanity check fine.
- **Potato Starch (105951/105014) → `RM Potato Starch`.** Blank code override, exact name
  match. Sulphites row read `"N, <=10mg/kg"` -- a clear No answer with a supporting threshold
  detail, not genuinely ambiguous -- treated as N per confirmation.
- **Mizkan Honteri Mirin 18L (106172/105035) → `RM Mizkan Honteri Mirin - Sweet Seasoning
  18L`.** Clean, sanity check fine.
- **Shredded White Cabbage 1kg (106223) → `RM Cabbage White Shredded 1KG`.** Clean, exact code/
  name match, shelf life matched a pre-existing legacy value exactly.
- **Teriyaki Sauce 6kg (106231/106072) → `RM Teriyaki Sauce 6 KG`.** A DIFFERENT teriyaki sauce
  from 105952 (Kikkoman) -- distinct code, distinct supplier (Shoda/Tazaki). Clean, sanity check
  near-exact.
- **Yutaka Shredded Pickled Ginger (106607/106719) → `Yutaka Shredded Pickled Ginger
  Benishoga`.** Clean, exact name match, shelf life matched a pre-existing legacy value
  word-for-word.
- **Reduced Salt Soy Sauce Sachet (107172) → `RM Soy Sauce Sachet (low salt)`.** A DIFFERENT
  soy sauce sachet from the earlier Gluten-Free one (100681) -- distinct code, distinct
  low-salt variant confirmed by name match. Clean, sanity check near-exact.
- **Tahini (107314/P00037) → `RM Tahini Paste`.** The spec that surfaced the Chartsheet crash
  bug above. Saturate fat genuinely blank in the spec -- left unset. Clean otherwise, sanity
  check fine (654.8 vs 671kcal, ~2.5%).

### 2026-09-29 (later still) — Red Crushed Chillies applied; standing rule on how confirmations are asked

- **Red Crushed Chillies (107316) → `RM Crushed Chilli Flakes`.** Product Code cell held a
  literal `0` (not blank text) -- the falsy-zero subtlety noted earlier turned out to matter
  here: `str(cell or "").strip()` reads a `0` cell the same as an empty one, which happened to
  be the correct outcome again (the real code isn't usable from that cell either way). Code
  supplied via `--override-code 107316`, confirmed via filename and the code embedded in the
  product name itself ("CRUCH/001"). Fat and saturated fat genuinely blank in the spec with no
  alternate cell -- left unset via `--allow-blank-nutrition fat,sat`. Salt blank but Sodium
  (30mg) present -- derived via the standard conversion (`--derive-salt-from-sodium`) to
  0.075g, human-confirmed. Storage Conditions ("cool dry warehouse") and Shelf Life ("18
  months, min 6 months upon delivery") both confirmed per the standing mandatory-warning rule.
  Also hit a genuine **name mismatch**: the spec's product name is "Red crushed chillies HT
  CRUCH/001" but the live ingredient (matched by code) is named "RM Crushed Chilli Flakes" --
  different wording for the same product, confirmed by the requestor and proceeded with
  `--confirm-name-mismatch`. Used in 31 recipes (directly or via sub-recipe); their live
  nutrition already reflects the update automatically, no separate action needed. Applied and
  post-upload-verified successfully.

**Standing rule reaffirmed: every human-confirmation question in this workflow (name
mismatches, blank-value handling, storage/shelf-life confirmation, code overrides, anything
questionable) must be asked via the clickable AskUserQuestion prompt, not as plain chat text
requiring a typed reply.** This was already the intent throughout the session but got missed
once on 107316's first pass -- corrected immediately per the requestor, logged here so it's
never dropped again.

- **Organic Japanese Matcha Green Tea Powder (107427/CS159) → `RM Organic Japanese Matcha
  Green Tea Powder (Premium Grade) 40g`.** All 9 nutrition fields blank -- investigated and
  confirmed NOT a data gap: the spec explicitly states "N/A (Tea is exempt from nutrition
  labelling)" in the source of nutrition column. Left blank as the genuinely correct answer,
  not a missing value. Product Code cell held "CS159" (the manufacturer's own code)
  consistently across every sheet -- overridden to 107427 per filename + exact name match.
  Ingredients List row was empty on the spec -- not extracted. Storage Conditions and Shelf
  Life confirmed per standing rule. Used in 1 recipe (Matcha Latte 12oz), flows up
  automatically. Applied and post-upload-verified.

- **Yuzu Vegan Mayo (107451) → `RM Vegan Wasabi & Yuzu mayo`.** Clean extraction, code and
  nutrition matched directly with no overrides needed. Name mismatch ("Yuzu Vegan Mayo" vs.
  "RM Vegan Wasabi & Yuzu mayo") confirmed as the same product under a fuller live name.
  Shelf life "180 days & 135 days" verified against the source cell directly (180 = shelf life
  from manufacturer, 135 = minimum on delivery, per the row label). Storage Conditions
  "Chilled < 8 (°C)" confirmed. Used in 6 recipes, flows up automatically. Applied and
  post-upload-verified.

- **Cooked Pork/Breakfast Sausage (107490) → `RM Cooked Breakfast Sausage`.** The flagged
  cross-sheet code mismatch: 10 of 11 sheets read "107490" and Product Name is consistently
  "Cooked Pork Sausage" on all 11, but the Additive & GMO sheet's code cell read "SKU 807" --
  confirmed a stray typo/leftover, not a copy-pasted-from-a-different-product document.
  `spec-extract.py` previously had no way to proceed past this by design (the comment literally
  said "refused regardless of override_code" -- `--override-code` only ever fills a blank code
  or replaces a self-consistent non-our-code value, never resolves an actual disagreement
  between sheets). Added a new, narrower **`--confirm-cross-sheet-mismatch`** flag specifically
  for this scenario: it does not change which code is used, it only permits proceeding once a
  human has manually opened the document and confirmed the Product Name and every other sheet
  agree, judging the one differing sheet a stray value. Always logged in the warnings with the
  exact sheet and differing value. Name mismatch ("Cooked Pork Sausage" vs. "RM Cooked
  Breakfast Sausage") also confirmed as the same product. Storage ("Frozen <-18°C") and Shelf
  Life ("Date of Production + 150 Days, Minimum Shleflife on delivery is 90 Days" -- spec's own
  typo, kept verbatim) both confirmed. Used in 4 (delisted/legacy) recipes. Applied and
  post-upload-verified.

This closes out the current spec batch -- all four previously-open items (107316, 107427,
107451, 107490) are now processed.

### 2026-09-29 (later still) — base-RM coverage check; two more specs found and applied

User asked for the list of base RM ingredients still without any spec applied (excluding
BCP/CPU single-ingredient recipes, which flow up automatically and were never in scope). Out of
403 live ingredients, filtered to `RM`-prefixed non-delisted items with zero nutrition and no
pack/storage/shelf-life data: **114 base RM ingredients with no spec applied.** Cross-checked
all 114 codes against the 74 spec files sitting in the OneDrive folder -- only 2 matched:

- **RM Flat Noodles (Ribbon) (107240) → spec "Ribbon Noodle" (P00039).** Product Code cell held
  a literal `0` (same falsy-zero pattern as 107316) -- overridden via `--override-code 107240`,
  confirmed via filename + name match ("Ribbon Noodle" vs. "RM Flat Noodles (Ribbon)", name
  mismatch confirmed same product). Pack Size genuinely not provided anywhere in this spec
  template (no weight/quantity field, only inner/outer dimensions in cm + pallet config) --
  left blank, confirmed as a real gap not an extraction miss. Pack Format read "Blue liner" --
  flagged by the parser as not looking like a normal container type, but verified against the
  source cell (`4-a) Inner packaging format/description`) as the literal, correct value.
  Storage ("Ambient") and Shelf Life (a three-part sentence: "18months from factory, 16months
  on delivery... tested the quality is the same for 24 months... warranty 18 months") both
  confirmed. Used in 14 recipes. Applied and post-upload-verified.
- **RM Butternut Squash 25mm Dice (107560) → spec "Roasted Butternut Squash 25mm Dice".**
  Product Code cell held a literal `-107560` -- a typo'd extra minus sign, not a real negative
  code. Corrected to 107560 via `--override-code`, confirmed via filename + exact name match
  (no name-mismatch this time). Clean nutrition. Shelf Life read "P+10 days, D+7 days" (P =
  Production, D = Delivery, per the spec's own notation) -- confirmed verbatim. Used in 2
  recipes. Applied and post-upload-verified.

The remaining 112 of the 114 uncovered base RM ingredients have no spec document in the folder
yet -- still awaiting sourcing from suppliers before extraction is possible.

### 2026-09-29 (later still) — Avocado applied; folder re-checked for new arrivals

User asked to re-check the spec folder for new files. One new arrival since the last check:
`102015 (105616) Avocado - RM Spec V5 (13.01.2025).xlsx`, matching **RM Avocado (102015)** from
the still-missing list above.

- **RM Avocado (102015/105616) → "PEAR HASS AVOCADO (RIPE)".** Second real-world hit of the
  cross-sheet-mismatch pattern found on 107490: 10 of 11 sheets read "102015 (105616)" and the
  Product Name "PEAR HASS AVOCADO (RIPE)" is identical on every sheet including the outlier, but
  the Nutrition Information sheet's own code cell read a stray "10764" -- confirmed a typo, not
  a copy-pasted document, same reasoning as before. Used `--confirm-cross-sheet-mismatch`.
  Also hit a genuine **no-Fibre-row template variant**: this spec's nutrition sheet has no
  Fibre/Fiber label anywhere at all (verified by reading the full sheet -- goes straight from
  Salt to the closing note), not just a blank cell in an existing row -- handled via
  `--allow-blank-nutrition fibre`, same as prior missing-row cases. Storage Conditions ("2-8c")
  and Shelf Life ("D+5. Shelf life to Wasabi minimum D+2", D = Delivery) both flagged by the
  plausibility checks as unusual phrasing but confirmed correct against the source cells. Used
  in **83 recipes** (mostly sushi/maki items) -- the largest recipe fan-out of any spec applied
  this session. Applied and post-upload-verified.

**Standing habit reinforced:** whenever the user asks to re-check the spec folder, diff the
current file listing against the last known listing (rather than re-scanning all 75+ filenames
by eye) to catch new arrivals quickly.

### 2026-09-29 (later still) — two more specs found via folder re-check

- **RM Sushi Seasoning (102022/105593) → "Sushi Seasoning" (Mizkan).** Clean extraction, code
  and name matched directly, no overrides needed. Storage ("Ambient") and Shelf Life ("365 days
  / 90 days.") both confirmed. Used in **136 recipes** -- the largest fan-out of any spec
  applied this session, essentially the entire sushi/maki/nigiri menu (sushi rice seasoning is
  used almost everywhere). Applied and post-upload-verified.
- **RM Sweet Chilli Dipping Sauce (CPU Only) (102052/105009) → "Sweet & Spicy Dipping Sauce".**
  Name mismatch confirmed as the same product (live name uses "Sweet Chilli", spec uses "Sweet
  & Spicy" -- same sauce). Storage ("Room temperature") and Shelf Life ("1 year (12month)")
  both confirmed -- note: the user's first click on the Shelf Life question read as "not
  correct," then immediately corrected to "mistakenly clicked, it is correct" on a follow-up
  question. Used in **87 recipes**, essentially the whole sweet-chilli/spicy-chicken product
  line. Applied and post-upload-verified.

### 2026-09-29 (later still) — four more specs found via folder re-check; --allow-blank-nutrition extended to non-numeric source notations

- **RM Sushi Seaweed / Nori (102058/105621) → "Dried Seaweed for Sushinori".** Clean nutrition,
  name mismatch confirmed same product. Storage ("Keep it dry at room temperature away from
  driect sunlight" -- spec's own typo, kept verbatim) and Shelf Life ("24months. Min on
  delivery is 22 months") both confirmed. Applied and post-upload-verified.
- **RM Cucumber Whole (102063) → "Cucumbers x12".** Blank code (literal `0`), overridden via
  filename + name match. Hit a **new class of unparseable nutrition value**: Saturate Fat read
  `'N'`, cited as sourced from McCance & Widdowson -- confirmed this is that reference's own
  standard notation for "present in significant quantities but no reliable information on the
  amount," genuinely non-numeric, not a typo or parsing bug. Until now `--allow-blank-nutrition`
  only covered a blank cell or an entirely missing row -- **extended it to also cover a
  non-numeric value a human has explicitly confirmed against the actual cell**, same opt-in
  shape as the other two cases (see `spec-extract.py` changes below). Pack Format ("n/a"),
  Storage ("+2°C"), and Shelf Life ("shelf life is not applicable to fresh produce products,
  min shelf life on delivery into Wasabi D+4 days.") all confirmed as literal spec values,
  flagged by plausibility checks as unusual phrasing but correct. Name mismatch confirmed same
  product. Applied and post-upload-verified.
- **RM Sauce Yakisoba (102662/105042) → "Yakisoba Sauce".** Same no-Fibre-row template variant
  as the Avocado spec -- verified by reading the full nutrition sheet, no Fibre/Fiber label
  anywhere. Clean otherwise, code/name matched directly (no mismatch this time). Storage and
  18-month/4-month Shelf Life both confirmed. Applied and post-upload-verified.
- **RM Sauce Soy Dark (102664/105043) → unnamed ("Dark Soy Sauce" by filename).** The most
  unusual case so far: **both** Product Name and Product Code cells were a literal `0` on
  **every single sheet** of the document -- not just the code, the name too, so there was
  nothing in the document itself to cross-check against. Confirmed via (a) the filename "Dark
  Soy Sauce - RM Spec V7", and (b) the ingredient breakdown on the recipe sheet (Water,
  Soybean, Sugar, Salt, Wheat Flour -- unambiguously a soy sauce), then overridden with
  `--override-code 102664`. The name-mismatch guard fired as expected (spec name came through
  as literal `"0"`) and was confirmed the same way as any other mismatch. Saturate Fat and
  Fibre cells both read literal `"N/A"` in the spec (verified) -- left blank via the newly
  extended `--allow-blank-nutrition sat,fibre`. Storage ("Normal temperature, Dry, Ventilated,
  Advice cold storage after open") and Shelf Life ("18 months") confirmed. Applied and
  post-upload-verified.

**`--allow-blank-nutrition` scope extended (spec-extract.py):** previously only covered (a) a
genuinely blank cell or (b) a nutrition row missing from the template entirely. Now also covers
(c) a cell holding a non-numeric value a human has confirmed is a real source notation rather
than a parsing bug -- e.g. McCance & Widdowson's `"N"`. All three still require the field to be
explicitly named in the flag, all three still leave the field unset (never coerced to 0), and
all three still require asking the person about that specific cell every time, per the standing
rule -- this only widens *what kind* of "genuinely blank" a human can confirm, not who gets to
skip being asked.

### 2026-09-29 (later still) — three more specs found via folder re-check

- **RM Seaweed Onigiri Universal (103487) → "Dried Seaweed for Onigiri".** Same manufacturer
  template as the sushi nori spec (102058) -- clean nutrition, same "driect sunlight" typo in
  Storage Conditions kept verbatim, both fields confirmed. Name mismatch confirmed same
  product. Applied and post-upload-verified.
- **RM Miso Block for Production (103489) → "Instant Miso Soup Block for Production".** Clean
  extraction. Name mismatch: the live name's "Miso Block for Production" isn't a substring of
  the spec's fuller "Instant Miso Soup Block for Production" (the inserted "Soup" breaks the
  containment check) -- confirmed same product. Storage and 12-month/3-month Shelf Life
  confirmed. **This directly fixes the "Miso Soup" recipe (101577)** flagged in the earlier
  missing-nutrition recipe scan as having zero computed nutrition. Applied and
  post-upload-verified.
- **RM Gyoza Chicken and Vegetable, 1KG Bag (104714/105089) → "Frozen Chicken & Vegetable
  Gyoza".** Clean extraction. Name mismatch (word order/wording difference) confirmed same
  product. Storage ("Frozen condition below -18°C") and Shelf Life ("24 month") confirmed.
  **This is one of the base ingredients behind the Chicken Gyoza / Chicken Gyoza Box recipes**
  flagged in the earlier missing-nutrition recipe scan. Applied and post-upload-verified.

### 2026-09-30 — one more spec found via folder re-check

- **RM KTC Toasted Sesame Oil (105940/105058) → "KTC Toasted Sesame Oil 1 x 20L".** Clean
  extraction, code/name matched directly with no overrides or mismatches. Storage and the
  two-part 24-month/18-month Shelf Life both confirmed. Applied and post-upload-verified.
- **RM Carrot Julienne 3mm Bag 10KG (105970) → "Carrot Julienne 3mm".** Storage Conditions read
  "Chilled (0 - 5 C)" with no degree symbol -- given the prior rich-text degree-symbol
  corruption incident (Beef Mince, 107322), this was explicitly re-verified against the raw
  cell with `rich_text=True` before confirming: no superscript run present (plain string), and
  the same document uses a real "°" character in a nearby row ("0°C and 8°C" under transport
  temperature), confirming the author simply omitted the symbol here rather than it being a
  disguised range. No Ingredients List (row after the Legal Ingredient Declaration label was
  empty -- normal for a single-ingredient fresh produce item). Applied and post-upload-verified,
  no name mismatch.
