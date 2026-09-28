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

## Source template structure

Every spec seen so far uses the same standard multi-tab "Raw Material Specification" template
(`Doc Ref: TECH-PROCESS-19`). Sheet names and purpose:

| Sheet | Contains |
|---|---|
| `1&2 Manufacturer Detail` | Supplier/manufacturer info — not extracted |
| `1bFarm&Processing Plants-Salmon` | Only relevant for fish/seafood products |
| `3 Ingredient & Recipe` | Product name, product code, sub-ingredient breakdown — **product code source** |
| `4 Packaging Detail` | Not extracted |
| `5&6 Durability & Micro Standard` | Shelf life/microbiological — not extracted |
| `7 Nutrition Information` | **Nutrition values — primary extraction target** |
| `8&9 Intolerance & Dietary` | **Allergens + vegetarian/vegan — primary extraction target** |
| `10&11 Additive & GMO` | Not extracted (could be a future field) |
| `12 Process Flow` | Not extracted |
| `13&14 Chem & Physical Std` | Not extracted |
| `15&16&17 Meat & Fish & Veg` | Not extracted |
| `18 Palm & derivatives` | Not extracted |
| `Document control & sign off` | Version/issue metadata — not extracted |

Every sheet repeats the same header block at the top (`Product Name :` in `A3`/name in `C3`,
`Product Code :` in `A4`/code in `C4`) — a cheap sanity check that every sheet in the file
agrees on which product it's for before trusting any of them.

## Field mapping: spec → NutriCost ingredient

### Nutrition (`7 Nutrition Information` sheet, "Per 100g" column — always column C)

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

## Write workflow (built)

Per the earlier discussion on reliability: **propose, don't auto-write.** Two scripts:

1. **`python scripts/spec-extract.py "<path to .xlsx>"`** — read-only, extracts product code
   (+ alt/parenthetical code when present — handles specs with one code or two), nutrition
   (confirmed: ingredient nutrition fields are always per-100g/100ml, same basis the spec's
   own "Per 100g" column uses — no unit conversion needed), and allergens. Also cross-checks
   every sheet in the workbook agrees on the same Product Code, and runs the
   kcal-vs-macros sanity check, both surfaced as `warnings` in the output rather than silently
   trusted. Outputs JSON.
2. **`node scripts/spec-apply.js <extraction.json> [--apply]`** — matches the extracted code
   against the live ingredients (tries the primary code, then the alt code if the primary
   doesn't match anything — handles both the two-code and one-code cases). No match → stops
   and says so, never guesses or creates a new ingredient. Prints a before/after diff of just
   the nutrition + allergen fields (cost, supplier, code, everything else on the record is
   never touched). Without `--apply` it's a dry run (diff only); with `--apply` it writes via
   `PUT /api/ingredients/{id}`, sending back the full updated record so the write can be
   confirmed immediately from the response.
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
