# Ingredient specification extraction

> ## CURRENT STATE and START HERE (rewritten 2026-10-07 -- the older "Status" paragraph below is history)
>
> **Where things stand.** About 150 supplier specs have been extracted and written to the live NutriCost
> ingredients (404 ingredients, 1,098 recipes live; one archive per spec in `spec-data/`). Everything is logged
> below in date order. **Read, in this order:** this box; the "Consolidated open items and standing procedures"
> entry near the END of this file (search for it); `SPEC-ISSUES-TO-REVIEW.md` (specs not applied, and issues
> found in applied ones); the memory notes in `C:\Users\JamesMurphy\.claude\projects\C--Dev-NutriCost\memory\`.
>
> **Scripts (`scripts/`).** `spec-extract.py` reads a spec (read-only) and prints JSON; `spec-apply.js` matches
> by code, shows the diff, writes, then re-fetches to verify and archives to `spec-data/`; `spec-reapply-all.js`
> restores from the archives; `field-fix-apply.js` applies a plan file of human-confirmed single-field corrections
> (refuses if the live value is not the expected old value); `packsize-fix-apply.js` and
> `packsize-parts-backfill.js` were one-off Pack Size corrections; `qa-login.sh` saves a signed-in session;
> `backup-full.ps1` makes the code zip plus a database dump. Live app: http://192.168.0.50:5001 (Pi, folders under
> `/opt/nutricost/`; rollback copies `backend-previous-20261007` and `frontend-previous-20261007` are on the Pi).
>
> **ONE SPEC AT A TIME (user rule 2026-10-08).** After a folder check, summarise the new files in one line each (with any blockers), then take the FIRST one all the way through (table, each field confirmed by click, apply, verify, log, commit) before opening the next. Never offer the user a pick-list of specs and never start two together; the rest are queued, or held only if the user says so.
>
> **PRODUCT NAME ABOVE EVERY QUESTION (user rule 2026-10-08).** Every confirmation prompt for a spec starts with the product code and name (e.g. "107559 RM Edamame Hummus - Pack Size: ..."), with a bold header line naming the product just above the prompts, so a question is never ambiguous when specs are handled one after another.
>
> **EVERY RULE IS RECORDED AND ALWAYS TRUE (user rule 2026-10-12).** When the user sets a rule it goes into this box (and
> a memory note) the same day, and it must stay true afterwards: anything built later (a script, a page change, a data
> fix) is checked against the rules here before it is run, and must not break one. If something would break a rule, stop
> and ask. Rules recorded so far include the ones below.
>
> **RECORD AS YOU GO, WITH THIS CHECKLIST (user rule 2026-10-12; the user has had to repeat it several times because things were missed).**
> After EVERY change or decision, in the same turn and BEFORE the next step, append a dated entry to this file that covers all of:
> (1) what the user asked for, in their words; (2) every decision they made and every option they rejected; (3) what was built or
> changed: files, functions, tables, migrations, endpoints, cache tag; (4) what it does and what it deliberately does NOT do;
> (5) how it was tested and what was NOT tested; (6) which environment (Pi = production, dev = Supabase) and whether it was
> deployed, with the rollback path and checksums; (7) git state (committed? pushed?); (8) findings and numbers that came out of
> the work; (9) every new rule or instruction from the user, also copied into this box and into a memory note; (10) open items and
> anything promised but not done. Before ending a turn that changed anything, re-read the entry and check each of the ten points. A
> change that is deployed but not in this file is a defect. A full record of 2026-10-09 to 2026-10-12 was added late at the foot of
> this file because it had not been kept up.
>
> **ALLERGEN CONFLICTS: ASK THE USER (user rule 2026-10-12: "in that instance, you ask the user").** If a spec's allergen answers disagree with the
> site's ticks, with the ingredient declaration (an allergen word with no tick, or a tick with no word), with another row on the same spec (e.g. barley
> Yes but gluten level No), or a Yes row carries an exemption/threshold comment, or a row is blank/odd, or any cross-contamination / handled-on-site /
> below-ppm / may-contain comment exists: STOP and ask the user with a clickable prompt per ingredient (code and name first, the spec's exact words, what
> the site has) and record only what they confirm. Never decide by judgement or keyword. No legal advice: quote the spec and ALLERGEN-THRESHOLDS.md. The
> automatic checks for this are designed but not yet built (see the log entry of 2026-10-12, "RULE ... ASK THE USER"); the 2026-10-12 review is in
> `ALLERGEN-FULL-REVIEW.md` (script `scripts/allergen-review.py`).
>
> **BELOW THE DECLARABLE LEVEL: CATCH IT, KNOW IT, ALWAYS ASK (user rule 2026-10-12).** Search the WHOLE workbook for statements like "below / <10ppm / <20ppm / not declarable / no need to declare / exempt / not
> regarded as an allergen / processing aid / carry-over"; show each hit to the user as "supplier says below the declarable level / no declaration needed"; treat it as a strong signal but NEVER change a tick or
> note on it alone: ask the user (clickable prompt) and record their decision. Do not spend long searching for a figure: show what was found and ask. Open item: 106208 sulphites (see the log).
>
> **"COMMIT GIT" MEANS COMMIT AND PUSH (user, 2026-10-12: "i said commit git how did that not go to git?").** A local commit alone is not
> enough: commit, push, then report the commit id and that GitHub matches. Stage files by name. Commit `f04d5e4` was pushed on 2026-10-12.
>
> **PROVE WHAT DID NOT CHANGE, AND AUDIT AFTER EVERY BATCH (user rules 2026-10-12).** After ANY change say what was NOT changed and show
> proof (diff of removed lines, before/after fingerprints, a read-back; "it works and changed NOTHING we didn't want changed").
> After every upload batch run `python -I scripts/spec-audit.py` (read-only) and paste the result before saying "done". Every script that
> writes ingredients or versions must call `scripts/lib/spec-source.js` so the spec file name is recorded, carried forward and verified
> (built 2026-10-12, offline test `node scripts/test-spec-source.js`, 14 tests); `spec-apply.js` refuses a source that is not a real file in
> the Ingredient Specs folder (flag `--allow-unlisted-source` only after a person confirms).
>
> **WORDING AND APPROVALS (user rules 2026-10-12).** Never say just "note": say "Source line comment (version history)" or "Allergen
> notes box" (they are different things; the user once approved thinking of the other one). When text is to be written, show the
> EXACT text for EVERY item in full (no summaries, no "...") and let the user approve it before anything is written; if the user wants
> a click per item, give one prompt per item (not four at once). The 30 spec file names were written on 2026-10-12 (see the foot of this
> file); the root cause and the proposed safeguards S1 to S4 (NOT yet approved or built) are recorded there too: read them before touching
> any script that writes ingredients or versions.
>
> **SPEC NAME STAYS ON THE INGREDIENT INFO PAGE (user rule, agreed 2026-09-29, restated 2026-10-12).** Every spec-driven
> write records the spec file name as the comment on that ingredient's version, and the ingredient window shows it as
> "Source: ...". It must never disappear: (a) any script or code that creates a new ingredient version (including
> `packsize-fix-apply.js`, `packsize-parts-backfill.js`, `field-fix-apply.js` and any future one) must carry the previous
> spec comment forward instead of leaving the comment empty; (b) the page shows the most recent spec comment from any
> version, labelled "(vN)" when it is not on the newest version (page change deployed to the Pi 2026-10-12). **Open gap:**
> the two pack-size scripts do not yet carry the comment forward and 91 ingredients have the spec name only on an older
> version (shown correctly by the page now, but not stored on the latest version). Fixing the scripts and copying the
> comment onto those 91 versions are changes needing their own approval.
>
> **PI = PRODUCTION, SUPABASE = DEV.** The Pi (192.168.0.50) is the live system the team uses; the local dev copy uses a
> Supabase dev database. Never describe or treat one as the other; deploys to the Pi need explicit approval, a backup and a
> rollback copy.
>
> **How a spec is processed.** (1) `python scripts/spec-extract.py "<file>" [flags] 2>/dev/null > file.json` --
> the flags (`--override-code`, `--derive-salt-from-sodium`, `--allow-blank-nutrition`, `--confirm-cross-sheet-mismatch`,
> `--correct-unit-mismatch`) are added only after the user has confirmed that specific situation for that spec;
> `--confirm-warnings` only after every field is confirmed. (2) Show the user the FULL extracted table, then ask each
> thing as a clickable prompt (AskUserQuestion): code override, blanks, derived salt, **Pack Size as number + unit**,
> **Pack Format on its own line**, Storage, Shelf Life, Ingredients (and which place they came from), name match.
> (3) `COOKIE_JAR="C:\Users\JAMESM~1\AppData\Local\Temp\qa_cookies.txt" node scripts/spec-apply.js file.json --apply
> --confirm-warnings [--confirm-name-mismatch]`. (4) Log the spec here, update `spec-data`, commit and push.
> Quirks on this machine: python needs Windows paths for files in `/tmp` (`C:\Users\JAMESM~1\AppData\Local\Temp\...`);
> always redirect stderr (openpyxl prints warnings); a spec open in Excel is locked (ask the user to close it);
> the in-app PowerShell terminal does not accept `&&`; the assistant cannot sign in (see the `qa-login.sh` entry).
>
> **Standing rules (all from the user).** Refuse, never guess; a wrong allergen is a safety incident. Data integrity
> outranks everything, including speed. **Flag every change for explicit clickable approval, showing before/after,
> every time; a dry run is not approval and an earlier "go ahead" does not cover later changes.** Never retype a list
> of codes or values by hand: print it from a script. Default to the spec's own literal value over reference data.
> Ingredients come from the declaration box first, the ingredient table only if the box is empty, then confirm.
> Pack Size is written "<number> <unit>" (g, kg, ml, L) and what is shown at confirmation is exactly what is stored.
> Checking the folder is two checks (new-file diff AND a whole-folder cross-check against every unspecced RM code).
>
> **Local-only material.** `.scan/` is excluded from git: review outputs, plan files, `.scan/backups/` (the
> pre-change database dump, 2026-10-07) and `.scan/tools/` (copies of the review and test scripts used on
> 2026-10-07: `review_stage1.py`, `review_stage2.py`, `review_missing.py`, `review_ingredients.py`,
> `review_rte.py`, `review_rte_wide.py`, `audit_packsize.py`, `test_packsize_ui.js`, `pi_*.sh`, `pi_api_tests.py`)
> exist only on this PC. They are not in the repository.
>
> **Waiting on the user right now:** approval to start stage 1 (the database change) of the "Ready to eat / Ready to
> cook" box described in the 2026-10-07 DESIGN entry. Nothing for it has been built. Other open items are in the
> consolidated entry (Tuna 106250, Inari 102584, Pack Size on 106163, the 17 messy Pack Sizes, 103895 ingredients, the
> paused specs, extractor checks to add).

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

> **Updated 2026-10-07:** the row is no longer found by the `1-d)` prefix with column C fixed. It is
> found by reading the QUESTION TEXT ("weight or volume"), and the answer is the first non-empty
> cell to the right of that question. The layout actually found is reported on every extraction
> (`packSizeLayout`) and checked against the registry in the 2026-10-07 entry at the bottom of this
> file; an unknown layout raises a warning. Pack Size and Pack Format now ALWAYS stop for human
> confirmation, with Pack Size shown as number + unit (e.g. `40` + `g`).

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
| Pack Size | `1&2 Manufacturer Detail` | **Always** a mandatory confirmation warning (since 2026-10-07), shown as number + unit; also a warning if the value is not a single measure or the layout is new |
| Pack Format | `4 Packaging Detail` (or the variant's packaging sheet) | **Always** a mandatory confirmation warning (since 2026-10-07) |
| Pack Format | `4 Packaging Detail` | Warning (same as above) |
| Storage Conditions | `5&6 Durability & Micro Standard` | Warning — **plus always requires explicit human confirmation even on a clean pass** (safety-critical, see the standing rule above) |
| Shelf Life (added 2026-09-29) | `5&6 Durability & Micro Standard`, "5-a)" row | Warning — **plus always requires explicit human confirmation even on a clean pass** (safety-critical, same rule) |
| Ingredients List / Legal Ingredient Declaration (added 2026-09-29) | `3 Ingredient & Recipe`, below the "Legal Ingredient Declaration" label | Warning (non-safety — a missing declaration section is expected/normal for single-/near-single-ingredient raw materials) |
| Ingredients List fallback (added 2026-10-07) | `3 Ingredient & Recipe`, the Ingredients/Percentage table at the top | Used ONLY when the declaration box is empty or missing; list is INFERRED (e.g. `Carrot (100%)`) and **always** needs explicit human confirmation |

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
       **Combinable with `--override-code` since 2026-09-30** (Chicken Thigh/Morliny spec): when
       a genuine cross-sheet disagreement exists AND neither manufacturer code found is ours,
       `--confirm-cross-sheet-mismatch` also unlocks `--override-code` (which otherwise requires
       the document to already be self-consistent) — both confirmations are independent and
       both must have actually been asked about, but the code no longer silently ignores the
       override in this specific combined scenario.
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

**New standing rule (2026-09-30, added after the Pack Size parsing bug above): Pack Size and
Pack Format must each be shown and confirmed as their own explicit line — "Pack Size: xxx" and
"Pack Format: xxx" — in every confirmation prompt from now on, never merged into one combined
line or bullet.** This is a direct consequence of the bug where Pack Size silently absorbed
container/count wording that belonged in Pack Format (e.g. "6 x 1kg" instead of "1kg" + "x6" in
Pack Format) — forcing each field into its own visible, separately-labelled line makes that kind
of contamination obvious to a human reviewer at confirmation time, before it's ever written.

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

### 2026-09-30 (later) — two more specs; --correct-unit-mismatch added; a second sheet-naming template variant found and fixed

- **RM Carrot Baton 10x10x60mm (105971/105577) → "Carrot Batons 10x10x60mm".** No Fibre row
  (same template gap as several prior specs) -- confirmed via `--allow-blank-nutrition fibre`.
  **New case: Salt (g) cell literally read `"62.5mg"`** -- a milligram value entered into the
  gram column without converting. Confirmed internally consistent: it exactly equals the
  standard Sodium→Salt conversion from the same sheet's Sodium row (25mg × 2.5 ÷ 1000 =
  0.0625g = 62.5mg), so this isn't a random typo, just a wrong-unit entry of the correct
  underlying number. Added a new, narrow **`--correct-unit-mismatch FIELD[,FIELD2,...]`** flag
  to `spec-extract.py` for exactly this class of problem: a KNOWN, purely-arithmetic unit
  conversion (mg↔g, kg↔g, ml↔l -- see `UNIT_CONVERSION_FACTORS`), never a different-quantity
  relationship like Sodium→Salt (that stays behind its own separate
  `--derive-salt-from-sodium` flag, unaffected by this addition). kcal (30) also failed the
  macro sanity check (~23% under the computed ~38.9) -- confirmed acceptable per the standing
  literal-value-first rule, consistent with prior fresh-produce cases (Cucumber, etc.). Name
  mismatch ("Carrot Batons" plural vs. "RM Carrot Baton" singular) confirmed same product.
  Storage ("Chilled ( 1 - 5 C)") and Shelf Life ("DOP (Date of Production) + 02 days")
  confirmed. Applied and post-upload-verified.
- **RM Shichimi Chilli Powder Tazaki (105982/105623) → "Yutaka Chili Pepper - Shichimi 300g".**
  **Second real hit of a genuinely different template family** (first was the Cooked Breakfast
  Sausage/Avocado cross-sheet-mismatch cases, but this is a different problem: sheet *names*
  themselves differ) -- this spec's workbook uses `Nutritional Information` (not `Nutrition
  Information`) and `Packaging & Label Information` (not `Packaging Detail`), which didn't
  match the existing substring searches at all (`"al Information"` vs. `" Information"` breaks
  an exact-phrase match). Broadened both patterns to the shorter, still-unambiguous keywords
  `"Nutrition"` and `"Packaging"` -- confirmed no other sheet in any spec seen so far would
  coincidentally contain either word. This same template variant also **combines Storage
  Conditions and Shelf Life into one cell** ("12 months /Avoid direct sunlight, and stored in a
  cool and dry place") plus a separate minimum-on-delivery row, and has **no distinct Pack
  Format field** (only a packaging-dimensions description, "Primary: Plastic bag"). Since this
  specific combined-field structure has only been seen once, per the "generalize only after 2-3
  times" standing practice, this one extraction was built manually (JSON hand-assembled from
  the human-reviewed raw cells) rather than extending the parser further right now -- logged in
  full in the JSON's own warnings array so it's traceable. kcal (331) also failed the macro
  sanity check (~29% over the computed ~257) -- confirmed acceptable given the unusually high
  Fibre content (39g/100g, plausible for a dried spice/seed blend). **Name/brand mismatch
  investigated, not rubber-stamped:** spec names the product "Yutaka" while the live record's
  supplier is "Tazaki foods ltd" -- checked and confirmed these are consistent (Tazaki Foods
  Ltd is a real UK importer/distributor of the Yutaka brand), not a red flag. Applied and
  post-upload-verified.

**Note on formatting extracted-data summaries for the user:** combining two distinct nutrition
fields onto one line for brevity (e.g. "125 kJ / 30 kcal", "0.5g / 0.1g" for Fat/Saturates) reads
as two competing values for the SAME field, not two different fields -- confusing. Present each
field on its own line going forward when summarizing an extraction for confirmation.

**Standing rule reinforced 2026-09-30: every extraction must be shown to the user as a full
field-by-field table BEFORE asking any confirmation question**, not just summarized after the
fact or folded silently into a yes/no question. This was already good practice but made
explicit per direct user instruction, to guarantee it happens every time for this AI and any
future one picking this up.

### 2026-09-30 (later still) — nine more specs found via folder re-check; combined-field template generalized into the parser

Generalized the "Branches" template's combined Storage+Shelf Life field into `spec-extract.py`
proper (previously handled as a one-off manual JSON for Shichimi Pepper) after it recurred on
Black Sesame Seeds -- now automatic, no per-spec script change needed. Mechanism: when the
standard `"5-f)"` row genuinely isn't found, falls back to a `find_row_containing()` search for
a row whose label contains `"shelf life & storage conditions"` (covers this template's own
numbering, e.g. `"8-b)"`), splits the cell on the first `"/"` into Shelf Life and Storage
Conditions, and separately looks for a `"minimum shelf life on deli"` row (matches both
"delivery" and a real "deliery" typo seen in a spec) to append onto Shelf Life. Method 1
(standard separate rows) always tried first and never overridden; Method 2 only ever engages as
a fallback. Both paths feed into the exact same mandatory-confirmation warnings regardless of
which one produced the values, plus Method 2 adds its own extra warning calling out that the
*split itself* needs confirming, not just the resulting values. Regression-tested clean against
both the original Shichimi extraction and a known Method-1 spec (Avocado) before use.

Nine new spec files found in one folder re-check:

- **RM Sesame Seeds Black Roasted Yutaka (106096/105600) → "Black Sesame Seeds".** First live
  use of the newly-generalized combined-field parser -- correctly split "540 days / Store cool
  and dry place" into Shelf Life "540 days, minimum on delivery 3 months" (folding in the
  separate minimum-on-delivery row) and Storage Conditions "Store cool and dry place". No
  distinct Pack Format field in this template variant (verified, left unextracted). Name
  mismatch ("Black Sesame Seeds" vs. the live record's fuller "RM Sesame Seeds Black Roasted
  Yutaka") confirmed same product. Applied and post-upload-verified.
- **RM Oil Sesame (106101/105044) → "Sesame Oil".** Clean extraction, code/name matched
  directly. Salt blank but Sodium reads a genuine 0mg -- derived Salt = 0 via the standard
  conversion (still a real derived value from a real stated Sodium figure, not a guess). Storage
  ("ambient temperature") and Shelf Life ("24 months (Minimum shelf life on delivery : 20
  months)") confirmed. Applied and post-upload-verified, no name mismatch.
- **RM Seaweed Wakame (106135) → "Dry Wakame".** Blank code (literal `0`) overridden via
  filename + name match. kcal (206) failed the macro sanity check (~135 expected, ~35% off) --
  confirmed acceptable given very high Fibre (36.1g) and Salt (21.1g) content typical of dried
  seaweed. Name mismatch confirmed same product. Applied and post-upload-verified.
- **RM Pride White Vinegar Westmill Ingredient 5L (106503/105054) → "Pride White Vinegar".**
  Saturate Fat genuinely blank (verified). kcal (16) failed the sanity check against a near-zero
  macro estimate (~3.6) -- confirmed acceptable, same class of explanation as alcohol/acetic
  acid contributing calories the standard fat/carb/protein formula doesn't count. Applied and
  post-upload-verified, no name mismatch.
- **RM Mushroom Powder (106956) → "Mushroom powder MUSPO/001".** Sat Fat and Sugar both
  literally "n/a" in the spec (verified) -- left blank. Salt blank but Sodium = 170mg present --
  derived to 0.425g. Pack Format ("hand tied blue PE liner") flagged by the plausibility check
  as unusual wording but verified as the literal, correct cell value. Storage and Shelf Life
  confirmed. Applied and post-upload-verified, no name mismatch.
- **RM Chumaki Nori PACK-4200 Sheets (107091) → "Dried Seaweed for Chumaki Nori".** Clean
  extraction, same manufacturer template as the other nori/seaweed specs this session (matching
  "driect sunlight" typo kept verbatim). Name mismatch confirmed same product. Applied and
  post-upload-verified.
- **RM Diced Tuna (107199) → "RF JOII SF MSC YF DICED TUNA 800G".** Blank code (literal `0`)
  overridden via filename + name match. Real degree symbol confirmed present and un-corrupted
  ("0 - <5°C"). Applied and post-upload-verified, no name mismatch.
- **RM Tuna Bar SF YF (1 x 1.2kg-1.6kg pack) (107200) → "RF JOII SF MSC YF TUNA BARS C/W KG".**
  **A genuine wrong-code-in-the-filename case, distinct from every prior blank/typo'd-cell
  case**: the spec's own Product Code cell was blank (as usual, the falsy-zero pattern), but the
  *filename itself* stated a code ("107120") that doesn't correspond to ANY live ingredient at
  all -- checked and confirmed. The product name and nutrition data are near-identical to the
  just-processed Diced Tuna (107199, same manufacturer/fish, same nutrition profile) but this
  one is clearly the "Tuna Bars" pack format, matching the one remaining unspecced Tuna Bar
  ingredient, 107200. Overridden to 107200 per explicit user instruction, **logged here per
  their direct request that the wrong code on the source filename be recorded**: the filename
  says 107120, the correct code is 107200 -- this is the source document's own labeling error,
  not an extraction bug. Applied and post-upload-verified.
- **RM Kale Curly Prep (106139) → "Curly Kale Sliced".** Storage Conditions read "Chilled (0 -
  5 C)" with no degree symbol -- re-verified against the raw rich-text cell (plain string, no
  superscript trick) before confirming, same discipline as the earlier Julienne Carrot spec
  (same phrasing pattern, likely same document author). No Ingredients List (empty row, normal
  for single-ingredient produce). Name mismatch confirmed same product. Applied and
  post-upload-verified.

**Glossary note, added per user 2026-09-30:** **IQF = Individually Quick Frozen** -- a freezing
technology where individual pieces of food (fruit, vegetables, seafood, ready-to-eat meals) are
frozen separately rather than as a solid block. Useful context for judging name-mismatch
questions on any ingredient using this abbreviation (e.g. "IQF Leeks" vs. a spec calling the
same product "10mm Diced Leeks" with Storage Conditions of "Frozen" -- consistent, not a red
flag).

### 2026-09-30 (later still) — ten more specs found via folder re-check

- **RM Garlic Whole Peel (106211/105939) → "Whole Peeled Garlic Fresh".** Clean extraction, name
  mismatch (word order) confirmed same product. Storage and Shelf Life confirmed. Applied and
  post-upload-verified.
- **RM Salmon 5-6 HOG Fresh chilled (106215/105063) → "Atlantic Salmon head on gutted".**
  Genuinely blank Fibre (verified -- fish has none). Storage spelled out "degree celcius" in
  words (no rich-text corruption risk since there's no "C" shorthand to disguise). **Shelf Life
  spelling corrected per explicit user instruction** ("mimimum" → "minimum") -- a deliberate,
  one-off exception to the usual keep-typos-verbatim practice, logged here since it departs from
  that standing rule. Name mismatch ("HOG" = Head On Gutted, spelled out in the spec) confirmed
  same product. **Fixes several salmon-based recipes** (Salmon Nigiri, FG Wasabi Salmon Pieces,
  Salmon Tails) flagged in the earlier missing-nutrition recipe scan. Applied and
  post-upload-verified.
- **RM Pickled Asian Slaw 1kg (106833) → "New Pickled Asian Slaw 2kg".** Clean nutrition.
  **Genuine pack-size discrepancy investigated, not just a wording difference**: live record
  says "1kg", spec says "2kg" with Pack Size "4 x 2kg" -- user confirmed this is an intentional
  pack-size change ("we changed this, the new data import will have 2kg as this is correct").
  Storage and Shelf Life confirmed. Applied and post-upload-verified.
- **RM Duck Gyoza Frozen 1KG (106946/106983) → "Frozen Duck Gyoza".** Clean extraction, name
  mismatch (word order) confirmed same product. Applied and post-upload-verified.
- **RM Red Miso Paste (107180) → "Red Miso".** Pack Format "20Kg BIB" flagged by the plausibility
  check but confirmed legitimate (BIB = Bag-in-Box, same abbreviation seen on Kikkoman Teriyaki
  Sauce earlier). Clean otherwise, no name mismatch. Applied and post-upload-verified.
- **RM Oatley oat milk (107255) → "Oatly Barista".** **Second real hit of the "wrong code in a
  cell explicitly labeled as ours" pattern** (first was the Tuna Bars filename case): the cell
  literally labeled "Wasabi Product Code" read "464381" -- a plain integer, verified not a
  rich-text trick, but no live ingredient has that code at all. Confirmed via filename + product
  name match to the only unspecced Oat Milk ingredient (107255). **Investigated Pack Format
  properly instead of accepting a flagged-as-unusual value at face value**: raw cell read "TBA
  Edge 1000mL", cross-checked against the separate Inner Packaging Material field ("Composite
  Paperboard/Aluminium/LDPE/DHPE" -- the standard Tetra Pak laminate) and confirmed "TBA Edge" =
  "Tetra Brik Aseptic Edge", a real Tetra Pak carton format -- written as the clearer "Tetra Pak
  (TBA Edge) 1L carton" per human confirmation. Name mismatch (live record spells it "Oatley",
  the real brand is "Oatly") confirmed same product. **Fixes the OAT Americano coffee recipes**
  flagged in the earlier missing-nutrition scan. Applied and post-upload-verified.
- **RM Cracked Black Pepper (107312) → "black pepper 18# SS".** Blank code (literal `0`)
  overridden via filename + name match. Salt cell literally read "not provided" -- left blank.
  kcal (289) failed the sanity check (~28% under the ~399 computed) -- confirmed acceptable
  given very high Fibre (37.4g), same class of dried-spice explanation as Shichimi Pepper and
  Wakame earlier. Name mismatch ("18# SS" = manufacturer's mesh/grade notation) confirmed same
  product. Applied and post-upload-verified.
- **RM Hoisin Sauce (Bulk) (107501/P00063) → "Hoisin Sauce".** Hit the documented transient
  OneDrive permission-lock issue on first attempt (`PermissionError: [Errno 13]`) -- resolved
  per the existing documented workaround (copy to a local temp path, re-extract from the copy).
  **No allergens detected, investigated rather than assumed correct**: ingredient list (sugar,
  water, rice vinegar, mirin, glucose syrup, cornflour, salt, garlic puree, spice blend, black
  carrot, colour) genuinely has no wheat/soy, unlike a typical hoisin recipe with soy sauce --
  confirmed as a real recipe variant, not a missed allergen. Applied and post-upload-verified,
  no name mismatch.
- **RM IQF Leeks (107317) → "10mm Diced Leeks".** Blank code (literal `0`, filename itself has
  no code number at all) overridden via product name + being the only unspecced Leek ingredient
  live. **Shelf Life rewritten per explicit human instruction**: source cell read "24 monhs  18
  months" (typo, no separator between the two numbers) -- rewritten as "24 months, minimum 18
  months on delivery" based on the row's own label ("Shelf Life from manufacturer & Minimum
  shelf life on delivery"), both numbers kept exactly as stated. Name mismatch ("IQF" =
  Individually Quick Frozen, consistent with the "Frozen" storage condition -- see glossary note
  above) confirmed same product. Applied and post-upload-verified.
- **RM Velvet Chicken - fully cooked (107541) → "Velvet Chicken".** Blank code (literal `0`)
  overridden via filename + exact name match. Sugar cell literally read "N/A" -- left blank.
  **Shelf Life rewritten per human confirmation**: source cell held two newline-separated
  numbers ("18 months" / "9 Months") under a row explicitly labeled "Shelf Life from
  manufacturer & Minimum shelf life on delivery" -- rewritten as "18 months, minimum 9 months on
  delivery" matching that label. Applied and post-upload-verified, no name mismatch.

**Two deliberate exceptions to the keep-typos-verbatim standing practice this batch** (HOG
Salmon's "mimimum"→"minimum", Leek's "24 monhs  18 months"→"24 months, minimum 18 months on
delivery"): both were explicit, one-off human instructions to correct or restructure the text
for clarity, not a change to the general rule. The general rule (keep the spec's literal wording,
typos included, unless told otherwise) still applies by default.

### 2026-09-30 (later still) — six more specs applied, one paused; --override-code and --confirm-cross-sheet-mismatch made combinable

- **RM Chicken Thigh Skineless Boneless (106188) → "Morliny Chicken Thigh Skinless Boneless
  Halal Uncalibrated 2 x 5Kg Vacuum".** **New combined case**: 10 of 11 sheets agreed on
  manufacturer code "4031366" (confirmed elsewhere in the doc as an explicit "SAP 4031366"
  label), only the Ingredient & Recipe sheet said "4021000" -- but NEITHER code is ours, so this
  needed both `--confirm-cross-sheet-mismatch` (to resolve the stray sheet) AND
  `--override-code` (to substitute our real 106188) at once. The two flags previously couldn't
  be combined -- `--override-code` required `doc_self_consistent` (true only when every sheet
  agrees), which a genuine cross-sheet disagreement always fails, so the override silently
  never applied and the wrong manufacturer code came through instead. **Fixed**: introduced
  `override_allowed = doc_self_consistent or confirm_cross_sheet_mismatch`, so a human's
  separate confirmation of the cross-sheet split also unlocks the code override. Verified this
  doesn't regress the plain override-only case (blank-code, self-consistent documents still
  behave identically -- confirmed against the already-applied Diced Tuna spec). Per user
  instruction, did a full-document search confirming code 106188 appears nowhere in the source
  file at all, and that "4031366" is explicitly labeled a SAP (manufacturer ERP) code elsewhere
  in the doc -- neither manufacturer code was ever going to match ours. Name mismatch confirmed
  same product. Applied and post-upload-verified.
- **RM Tuna Chunks In Brine (106250) → "MSC Tuna Chunks in Brine".** Blank code (literal `0`)
  overridden via filename + exact name match. kcal (102) failed the sanity check by ~15%,
  plausible rounding for lean fish -- confirmed. Applied and post-upload-verified, no name
  mismatch.
- **RM Paprika Extract (107203) → "Paprika Oleoresin 40000cu".** Blank code overridden via
  filename + recognizing "Oleoresin" as the chemical/industry term for an extract. Name
  mismatch confirmed same product. Applied and post-upload-verified.
- **RM Coffee Beans - Ueshima Kobe BLEND (107246) → PAUSED, not applied.** Two separate issues
  found and both flagged to the user rather than guessed through: (1) the nutrition sheet's own
  source note states the "Per 100g" values are theoretical brewed-coffee figures (FDA FoodData
  Central, "coffee brewed, prepared with tap water"), since coffee itself is exempt from
  nutrition labelling -- these numbers describe a diluted cup, not 100g of the dry beans this
  ingredient actually is; user asked to pause and think about this rather than decide
  immediately. (2) Product Name and Product Code cells are swapped in the source document (Name
  cell holds a SKU string, Code cell holds the plain-English product description) -- neither
  cell contains anything resembling our own code. **Logged in full in SPEC-ISSUES-TO-REVIEW.md**
  per user request; nothing written to the live ingredient.
- **RM Rice Vinegar (107278) → "Yutaka Rice Vinegar 1L".** Clean extraction, code/name matched
  directly. kcal (24) failed the sanity check by ~19%, same class of vinegar/acid explanation as
  prior specs -- confirmed. Applied and post-upload-verified, no name mismatch.
- **RM Poached Egg (Free range) (107489) → "Great British Egg Company 30 x Individual
  Pre-Poached Free Range Eggs".** Clean extraction, code matched directly. Name mismatch
  (supplier's fuller product name) confirmed same product. Applied and post-upload-verified.

### 2026-09-30 (later still) — one more spec found via folder re-check

- **RM Coriander Bunch (106138) → "Unwashed Coriander".** Code cell read `"TCK spec code
  WAS19/ 106138"` -- our real code was literally present as a substring, just appended after
  the supplier's (TCK Fresh Produce Ltd) own internal reference format, so the parser's
  first-token match only caught "TCK". Overridden to 106138 per direct inspection. Storage
  ("Chilled ( 2 - 5C)", no degree symbol, same phrasing family as the earlier Carrot/Kale specs
  from what looks like the same document author) and Shelf Life confirmed. Name mismatch
  confirmed same product. Applied and post-upload-verified.

### 2026-09-30 (later still) — one more spec found via folder re-check

- **RM SS1 Soy Sauce Shoda (105981/106023) → "Soy sauce SS/1 in 15kg Jerricans".** No Fibre row
  (same template gap as several prior sauce specs, verified by reading the full sheet). Storage
  and 12-month/9-month Shelf Life confirmed. Name mismatch ("SS/1" = "SS1", Shoda's own product
  code) confirmed same product. Applied and post-upload-verified.

### 2026-09-30 (later still) — four more specs found via folder re-check

- **RM Functional Plain Brine Newlyweds Sack (106005/106010) → "FUNCTIONAL PLAIN BRINE V1".**
  Code cell consistently stated a manufacturer code ("B48691-2500-A") across every sheet --
  overridden via filename + name match. Storage ("Dry, cool") and Shelf Life ("12 months / Min
  is 75% of total (9 months)") confirmed. Name mismatch (spec drops the supplier name Newlyweds
  Foods, adds its own "V1") confirmed same product. Applied and post-upload-verified.
- **RM Fried Chicken Marinade Newlyweds Sack (106028/106038) → "FRIED CHICKEN MARINADE
  (B48699)".** Blank code (literal `0`) overridden via filename + exact name match. Shelf Life
  ("12 months , 9 months") verified directly against the row label ("Shelf Life from
  manufacturer & Minimum shelf life on delivery") before confirming -- same two-number pattern
  as the Brine Powder spec just above, same supplier (Newlyweds Foods). Name mismatch confirmed
  same product. Applied and post-upload-verified.
- **RM Pumpkin Croquette (106099/105037) → "Frozen Vegan Pumpkin Croquette 60gx100pcs".** Clean
  extraction, code/name matched directly. **Allergen investigated, not assumed correct**: Soya
  appears in the allergens list despite not being obviously visible in the shortened ingredients
  text -- checked the raw allergen sheet directly and confirmed "Soya/soya derivatives: Y" is
  explicitly declared there, a genuine declaration per the standing allergens-come-from-the-
  sheet-not-the-ingredient-text rule, not a false positive. Storage and Shelf Life confirmed.
  Applied and post-upload-verified, no name mismatch.
- **RM Sauce Soy Wasabi (106100/105040) → "Jin Soy Sauce".** No Fibre row (genuine template
  gap, verified). **Pack Format investigated and ultimately left blank per human decision**: the
  only text in the document ("Tubs containing") is itself cut off mid-sentence in the source
  spec, with no fuller description found anywhere else in the file (checked the full Packaging
  Detail and Manufacturer Detail sheets) -- offered a reconstructed version from the separate
  Inner Packaging Material field ("Body: PE / Cap: PP"), but the person chose to leave the field
  blank rather than write anything synthesized. Name mismatch investigated properly: "Jin Soy
  Sauce" (manufacturer's own brand, made by Tobagi Sunchang Food, South Korea) vs. live "RM
  Sauce Soy Wasabi" -- confirmed "Wasabi" refers to Wasabi Co Ltd's own private-label branding
  on this product, not a wasabi-flavoured sauce, before confirming. Applied and
  post-upload-verified.

### 2026-09-30 (later still) — four more specs found via folder re-check

- **RM Lettuce Chinese Leaf Sliced 1KG (106218) → "Sliced Chinese Leaf".** Storage Conditions
  read "Chilled (0 - 5 C)" with no degree symbol -- re-verified against the raw rich-text cell
  (plain string, no superscript trick), same document-author family as the earlier Carrot/
  Kale/Coriander specs. Name mismatch (word order) confirmed same product. Applied and
  post-upload-verified.
- **RM Chilli Red Sliced 250G (106219) → "Sliced Red Chilli".** Fibre cell read `"N"`, sourced
  from McCance & Widdowson reference "13-317" (visible in the sheet's own Source column) --
  confirmed genuine non-numeric notation, same as the earlier Cucumber spec. Storage (same
  "Chilled (0 - 5 C)" family) and Shelf Life confirmed. Name mismatch (word order) confirmed
  same product. Applied and post-upload-verified.
- **RM PUREE GINGER NUGGET IQF (106235) → "Frozen Ginger Puree Nuggets".** Pack Format "Blue
  Polyliner" flagged by the plausibility check but confirmed a legitimate packaging term
  (polyethylene liner bag), consistent with other "blue [material] bag/liner" descriptions this
  session. Storage and Shelf Life confirmed. Name mismatch ("Frozen" = IQF, word order)
  confirmed same product. Applied and post-upload-verified.
- **RM Cooked Prawn Tail-Off Size 31/40 (106355/105426) → "IQF Shrimps".** Storage Conditions
  "-18C or below" (no degree symbol) verified against the raw rich-text cell -- plain string, no
  corruption. **Genuine shrimp-vs-prawn naming question investigated, not rubber-stamped**:
  confirmed same product (UK specs commonly use the two terms interchangeably for this species),
  not assumed by default given the two are sometimes genuinely different animals. Applied and
  post-upload-verified.

### 2026-09-30 (later still) — three more specs found via folder re-check

- **Cookie jar path resolution bug discovered and worked around**: `spec-apply.js`'s
  `COOKIE_JAR` default (`/tmp/qa_cookies.txt`) only resolves correctly when curl is invoked from
  a POSIX shell (Git Bash's MSYS path translation). `node`'s own `execSync` spawns `cmd.exe` on
  Windows, which does not translate that path, so curl silently sent no cookie and the API
  returned 401 Unauthorized -- surfaced as a confusing `allIngredients.find is not a function`
  crash (the error body `{"error":"Unauthorized"}` isn't an array). Worked around per-invocation
  by passing `COOKIE_JAR` as a Windows-style path (`C:\Users\JAMESM~1\AppData\Local\Temp\qa_cookies.txt`)
  in the environment when calling `node scripts/spec-apply.js`. Not yet fixed in the script
  itself since it's a one-time environment quirk, not a data-correctness issue.
- **106222 Grated Carrot → "RM Carrot Grated 1KG".** Clean extraction (nutrition, storage,
  shelf life). Ingredients List row was empty on the source sheet -- left blank, not guessed.
  Name mismatch (word order + RM/pack-size prefix only) confirmed same product. Applied and
  post-upload-verified.
- **106226 Red Pepper Sliced 7mm 5Kg → "RM Red pepper sliced 7cmx1cm Pack 5KG".** Same document
  family as the Carrot spec above -- clean extraction, empty Ingredients List row left blank.
  Name mismatch (word order/prefix only) confirmed same product. Applied and post-upload-verified.
- **JF5001 Gyoza Sauce V12 → "RM Gyoza Dipping Sauce Pot 30g" (106961, altCode 107067).** Filename
  used the manufacturer's internal product code (JF5001) rather than the live system's code, but
  the sheet's own Product Code cell gave 106961 directly. Storage ("Chilled 0-5°C") and combined
  Shelf Life ("Total Life: 130 days / MLOD: 97 days") confirmed. Name mismatch ("JF5001 Gyoza
  Sauce" vs "RM Gyoza Dipping Sauce Pot 30g") confirmed same product by code match and pack
  size/allergen consistency. Applied and post-upload-verified.

### 2026-09-30 (later still) — four more specs found via folder re-check

- **106158 Crab Salad Mix (altCode 105620) → "RM Salad Crab".** Storage Conditions used a
  superscript-zero degree glyph ("0-5 ⁰C") -- verified via `rich_text=True` load, plain `str`
  cell value, no corruption, just an unusual (but readable) degree character. Name mismatch
  (word order) confirmed same product. Applied and post-upload-verified.
- **106198_1 Chicken Wings — PAUSED, not applied.** 11 of 12 sheets agree on Product Code
  `106198 (105073)`; the `15&16&17 Meat & Fish & Veg` sheet alone shows a stale `15193 (103736)`
  while still agreeing on Product Name. User chose to pause and investigate further rather than
  confirm the cross-sheet-mismatch override immediately. Logged in
  [SPEC-ISSUES-TO-REVIEW.md](SPEC-ISSUES-TO-REVIEW.md); `RM chicken Wings 55g-75g` (106198)
  remains unspecced.
- **106220 Spring Onion → "RM Onion Spring Sliced 500G".** Clean extraction, empty Ingredients
  List row left blank. Name mismatch (word order) confirmed same product. Applied and
  post-upload-verified.
- **106254 (105088) Veg Gyoza → "RM Gyoza Vegetable, 1KG Bag".** Combined Frozen/Chilled dual
  storage-condition text and a two-part pack size ("20g/Piece and 1kg/Bag") both taken verbatim
  from source, not split/simplified. Name mismatch (generic "Frozen Vegetable Gyoza 20g" vs
  product's own naming) confirmed same product by code + allergen/ingredient match. Applied and
  post-upload-verified.
- **106519 (106567) Newly Weds Katsu Predust → "RM Katsu Predust Coating".** No name mismatch —
  spec's "Katsu Predust" matches the live ingredient's name directly, and both share the same
  supplier (Newly Weds Foods). Storage Conditions "Ambient" and Shelf Life confirmed. Applied
  and post-upload-verified.

### 2026-09-30 (later still) — five more specs found via folder re-check

- **106103 Jin Gold Gochujang → "Red Pepper Paste" (106103/105056, override).** Product Code
  blank/"0" on every sheet (falsy-zero pattern recurring again). Product name is the
  manufacturer's own Korean branding ("Jin Gold Gochujang") -- confirmed as the same product
  since gochujang IS Korean red pepper paste, matching the filename. Applied and
  post-upload-verified.
- **106154 Ground White Pepper (altCode 105004).** Two genuine nutrition gaps: the Fibre row
  doesn't exist anywhere in this spec's Nutrition Information template (not just blank --
  verified row-by-row, no such row at all), and Sugar is explicitly "N/A". A sanity-check flag
  (stated kcal doesn't closely match 4P+4C+9F) was reviewed and accepted -- source is cited
  throughout as "USDA National Nutrient Database, Release 24", a real reference, not a
  fabricated one. Applied with Fibre and Sugar left unset, post-upload-verified.
- **106194 MSG → "RM Ajinomoto Msg Bag" (106194/105038, override).** Same falsy-zero blank-code
  pattern as 106103 above. Salt value (30.8g/100g) is very high but expected for pure MSG (high
  sodium content by weight) -- reviewed and accepted, not a data error. Applied and
  post-upload-verified.
- **106197 Parboiled Easy Cook Rice → "RM Rice Long Grain (Grocery)".** Clean extraction, no
  warnings beyond the standard mandatory Storage/Shelf-Life confirmations. Name mismatch (generic
  product description vs. grocery-specific live name) confirmed same product. Applied and
  post-upload-verified.
- **106205 Sliced Blade DG x3 cut → "RM New Beef Slice" (altCode 105578).** Storage Conditions
  "<6°C" used the superscript-zero rich-text trick -- verified via `rich_text=True`, cell runs
  showed literal `' <6'` + a run of `'0'` with `vertAlign='superscript'` + `'C'`, confirming a
  genuine (if unusually written) degree symbol, not corruption. Fibre genuinely blank on the
  Nutrition sheet. **Supplier-name discrepancy investigated and resolved**: the spec names the
  manufacturer as "Cooksgrove Ltd T/as Euro Farm Foods" (Ireland), while the live ingredient's
  `supplier` field says "P J Martinelli Limited" -- reasoned as a distributor/importer vs.
  processing-plant distinction (common in meat supply chains), not evidence of a wrong code
  match, since the Product Code (106205/105578) and product identity (beef blade slice) agreed
  consistently across every sheet of the spec with no cross-sheet conflict. User explicitly
  confirmed the code match was the determining factor before applying. Applied and
  post-upload-verified.

- **Transcription-error incident and process fix**: while confirming 106205 above, the user
  spotted that an earlier manually-typed "remaining ingredients" list had mislabeled code 106205
  as "RM Pork Neck Slice" -- the actual name of the adjacent code 106210. Root cause: a human
  transcription slip while scanning script output by eye, not a data or pipeline bug (the actual
  spec-apply match/diff/verify path never relies on eyeballing; it matches by exact code equality
  in code and re-fetches to verify). User's reaction, rightly: "we cannot have transcription
  errors imagine if allergens were incorrect." **Fix adopted going forward: never hand-retype a
  code/name/field list for the user again -- always have a script print the list directly from
  the live API and share that output as-is.** Saved as a standing memory rule
  (`feedback_no_manual_transcription`). The full remaining-RM list was then regenerated this way
  and re-verified against the earlier list; no further transcription errors were found.

### 2026-09-30 (later still) — one more spec found via folder re-check (two file versions, newer used)

- **106159 Plain Wheat Flour (altCode 105016), V6 used over V5 found alongside it.** Same
  missing-Fibre-row template pattern as 106154 White Pepper -- verified row-by-row, no Fibre row
  exists in this Nutrition Information sheet at all. Saturates explicitly "n/a" in source; Salt
  stated as "Trace" (read as 0). Source cited throughout: McCance & Widdowson's 6th Summary
  Edition, a real reference. Applied with Fibre and Saturates left unset, post-upload-verified.

### 2026-09-30 (later still) — one more spec found via folder re-check

- **107606 Sesame Dressing.** Clean extraction, code and name matched the live ingredient
  directly with no override or mismatch needed. Storage Conditions used a superscript-o degree
  glyph ("2-5 (ᵒC)") read plainly as part of the string. Applied and post-upload-verified.

### 2026-09-30 (later still) — two more specs found via folder re-check

- **107558 Rainbow Slaw → "RM Rainbow Slaw".** Clean extraction, code and name matched directly.
  Applied and post-upload-verified.
- **120087 Lamb Weston Potato Puffs — PAUSED, not applied.** Spec's own Product Code
  (`120087`) doesn't exist in the live system; `RM Potato Puffs - Pre-fried – frozen` (107496,
  supplier Fresh Direct (UK) Ltd) is unspecced and matches by product description, but the spec
  names the brand/manufacturer as Lamb Weston, a different name than the live supplier field.
  User asked to log and move on rather than investigate immediately. Logged in
  [SPEC-ISSUES-TO-REVIEW.md](SPEC-ISSUES-TO-REVIEW.md); 107496 remains unspecced.

### 2026-09-30 (later still) — two more specs found via folder re-check

- **106140 Salted Edamame Soybeans In Pods - Zhejiang (altCode 105605).** Template variant with
  Packaging/Durability sections renumbered (Section 7/8 instead of the usual 4/5) and no Pack
  Format field at all -- verified against the raw sheet, genuinely absent (only dimensions and
  recyclability are asked for). Combined Shelf Life/Storage cell ("730 days / Frozen -18°C")
  split as usual, plus the separate "Minimum Shelf life on deliery" row appended. Applied with
  Pack Format left blank, post-upload-verified.
- **106162 Diced Red Pepper 25x25mm (altCode 105026).** Same missing-Fibre-row template pattern
  as White Pepper/Wheat Flour -- verified row-by-row, no Fibre row in this Nutrition sheet.
  Source cited: McCance & Widdowson 6th ed / USDA. Applied with Fibre left unset,
  post-upload-verified.

### 2026-09-30 (later still) — folder-diff gap discovered; three pre-existing unprocessed specs found

- **Process gap identified**: the "check the folder for more" workflow only diffs against the
  *previous* folder snapshot, so files that were already sitting in the folder before this
  session started tracking (i.e. never part of any diff) were silently never checked. User
  caught this ("some of the specs in your list are in the folder already, check the folder") by
  noticing files existed for ingredients still marked unspecced. Cross-referenced the full
  current folder listing against every remaining-RM code (including paused ones) and found three
  genuinely unprocessed pre-existing files: 106171, 106189, 106363 (106987 and 106199 were
  already correctly logged as paused issues from before this session).
- **106171 Lion Premium Vegan Mayo → "RM Mayonnaise Vegan" (override to 106171/105640).** The
  spec's own Product Code cell consistently states `106237 (105636)` across all 11 sheets --
  internally self-consistent, but that code doesn't exist anywhere in the live system. The
  filename's code, `106171 (105640)`, does exist live and matches the product (vegan mayo).
  Treated the internal code as a stale/wrong carry-over (e.g. a manufacturer's own reused
  template) rather than trusting internal self-consistency blindly, since self-consistency alone
  doesn't help when the consistent code matches nothing. Applied via override, post-upload-verified.
- **106189 Cornflour (altCode 105013) → "RM Flour Corn".** Clean code match, no override needed.
  Applied and post-upload-verified (double-checked live via a direct API re-fetch after the diff
  output didn't clearly show every unchanged-vs-changed field in the terminal tail).
- **106363 8" Dry Fine No Egg Turmeric & Paprika Noodle (altCode 106703).** Same missing-Fibre-row
  template pattern, verified row-by-row -- source cited as "External lab, UKAS Accredited".
  Applied with Fibre left unset, post-upload-verified.

### 2026-09-30 (later still) — full folder cross-check finds five more pre-existing unprocessed specs

- **Second, more thorough gap-closing pass**: re-ran the full-folder cross-check (all 145 files
  vs. every remaining-RM code, including paused ones) after the first pass above, and found five
  more genuinely unprocessed pre-existing files: 106164, 106165, 106168, 106834, 107266.
- **106164 Crispy Onion (override to code 106164, filename "ONI103 Crispy onion 2.5kg").**
  Product Name AND Product Code were both "0" on every sheet -- worse than the usual blank-code
  pattern. Confirmed via ingredient composition (Onions, Palm Oil, Wheat Flour, Salt) matching
  fried/crispy onion, and filename. **Pack-size typo caught and corrected**: the Weight/Volume
  cell literally read "2.5g x 4", but the adjacent Legal Name cell on the same sheet read "LL
  Crispy Onions 2.5kg e x 4" -- an internal contradiction in the source document. User
  independently confirmed ("its a case with 4 2.5kg bags i think") before correcting to "2.5kg x
  4"; the correction and its reasoning were recorded in the extraction JSON's warnings before
  applying, not silently substituted. Applied with Fibre populated normally, post-upload-verified.
- **106165 Peas (override to 106165/105030) → "RM Peas Greens Frozen Choice".** Standard
  falsy-zero blank-code pattern. Pack Format "Liner" flagged by the plausibility check but
  confirmed via the Inner Packaging Material field (LDPE) as a legitimate plastic liner bag, same
  family as earlier "Polyliner"/"Blue Polyliner" specs. Applied and post-upload-verified.
- **106168 Vegetarian Oyster Sauce (altCode 105052).** Same missing-Fibre-row template pattern.
  Salt (13g/100g) is very high but stated explicitly via in-house lab analysis for a concentrated
  sauce base -- reviewed and accepted. Applied with Fibre left unset, post-upload-verified.
- **106834 Kimchi Vegan (override to 106834/106916) → "RM Vegan Kimchi Jongga".** Standard
  falsy-zero blank-code pattern. Applied and post-upload-verified.
- **107266 Semi Skimmed Milk 2.27ltr → "RM Semi Skimmed Milk for Coffee".** Fibre genuinely
  blank/N-A in the source -- expected for a dairy liquid, no fibre content. Applied and
  post-upload-verified.

### 2026-09-30 (later still) — snapshot-chain gap fixed; one more spec found

- **Folder-snapshot chain fell behind**: the sequential `spec_filesNN.txt` diff chain used for
  routine "check the folder for more" checks hadn't been updated after the two full-folder
  cross-check passes above (which used separate one-off snapshots), so the next routine diff
  showed several already-applied files as if newly arrived. Cross-referenced against
  `spec-data/` to confirm only one of the flagged files was genuinely unprocessed; the chain has
  now been resynced to the current folder listing.
- **106133 White Sesame Seeds (altCode 105601) → "RM Sesame Seeds White Roasted Yutaka".** Same
  template family as the earlier Edamame spec -- combined Shelf Life/Storage cell split as usual,
  no Pack Format field in this variant (verified genuinely absent). Applied and
  post-upload-verified.

### 2026-09-30 (later still) — three more specs found; Pack Size parsing bug found and fixed retroactively

- **106077 Sweet & Savoury Shiitake Sauce (altCode 106148).** Same missing-Fibre-row template
  pattern, verified row-by-row. Source cited "Theoretical / NutriCalc" (self-calculated). Applied
  with Fibre left unset, post-upload-verified.
- **106102 Teriyaki Sauce Sachet 20g (altCode 105046).** Clean extraction, code matched directly.
  Applied and post-upload-verified.
- **106134 J1130 Satono Yuki Silken Tofu (override to 106134/105602) → "RM Satonoyuki Silken
  Tofu".** Standard falsy-zero blank-code pattern. Pack Format "Aseptic packaging" flagged by the
  plausibility check but confirmed as a legitimate ambient-stable tofu carton format. Applied and
  post-upload-verified.
- **106192 RM Baking Powder — logged as blocked, not paused.** No spec document exists anywhere
  in the folder for this code or for "baking" in any filename (confirmed by full-listing search).
  Added to [SPEC-ISSUES-TO-REVIEW.md](SPEC-ISSUES-TO-REVIEW.md) as blocked on the source document
  (someone needs to obtain/upload a spec), distinct from the other paused entries which do have a
  document but an unresolved data question.

- **Pack Size parsing bug found and fixed (significant, retroactive).** User spotted that Pack
  Size values like "6 x 1kg" or "10ml sachets x 800 per case" mix a measure with container/count
  wording, and pointed out the real consequence: the app needs Pack Size to be a pure parseable
  number (e.g. so "1 EACH = 10ml" can be computed for recipe costing/nutrition), and a value like
  "10ml sachet" can't be parsed as a number at all -- this wasn't cosmetic, it silently breaks
  that calculation. Fixed at the source in `spec-extract.py`: added `clean_pack_size_measure()`,
  which finds every `<number><unit>` token (kg/g/ml/l/litre(s)/ltr) in the raw Pack Size cell via
  regex and, when exactly one is found, reduces Pack Size to that single measure (preserving
  original spacing/casing via the full regex match, not reconstructed) while flagging the
  reduction as a warning; when zero or multiple candidates are found, the value is left as-is and
  flagged for manual review rather than guessed. Documented in the script's module docstring.
  **Retroactively applied to 47 already-applied ingredients** whose stored Pack Size still had
  the old contaminated form (spanning ones applied earlier in this session and some from before
  it) -- full before/after list generated by script (never hand-transcribed, per
  `feedback_no_manual_transcription`) and shown to the user before any write. Per the user's
  guidance ("the x 6 would be pack format, 1kg would be the weight of the unit"), any count/case
  info that would otherwise be lost was appended to Pack Format in parentheses wherever Pack
  Format didn't already contain it (e.g. `packFormat: "Heat sealed bag"` + raw pack size
  `"4 x 2kg"` → `"Heat sealed bag (4 x 2kg)"`); skipped appending where Pack Format already
  contained the same info verbatim (e.g. `"15Kg Jerricans"` when Pack Format already says "15Kg
  Jerrican"). Applied via a dedicated one-off script (`scripts/packsize-fix-apply.js`) that
  matches by exact code equality (same safety pattern as `spec-apply.js`), writes only
  `packSize`/`packFormat`, and re-fetches every record afterward to independently verify the
  write landed -- **47/47 succeeded, 0 failures, 0 verification mismatches**. The 47 corresponding
  `spec-data/*.json` archive files were also updated to match, so a future re-apply from archive
  doesn't regress this fix.

### 2026-10-07 — Pack Size audit; Pack Size and Pack Format now always human-confirmed

- **Audit** of every archived extraction against its source spec (146 archives; 116 source files
  still on disk, 30 not re-verifiable). Result: the extractor reads the right cell every time
  (column B of the "1-d)" row is "Weight or Volume : *" in all 116), but 24 live values need a
  person's decision -- ranges, two-size strings, net-vs-gross text, count-only values, sentences,
  one stored-vs-name conflict (106833), one missing value (106163). Listed in
  [SPEC-ISSUES-TO-REVIEW.md](SPEC-ISSUES-TO-REVIEW.md). Some rows there are benign (documented
  human corrections such as 106164 and 107322, and mass/volume differences explained by density)
  and are included so the decision is explicit rather than assumed.
- **Correction to an earlier statement in this log**: the Pack Size entry above says the app
  "needs Pack Size to be a pure parseable number" for per-EACH costing/nutrition. Checked against
  the code on 2026-10-07: the frontend only stores and displays `packSize` as text; the field that
  drives EACH maths is `unitWeightG` ("Weight per each"). A clean single-measure Pack Size is still
  the agreed convention (and would allow `unitWeightG` to be filled from it later), but nothing
  currently breaks or improves based on it.
- **Known gaps in the measure pattern (not yet fixed):** "60gx100pcs" (the "x" is attached to the
  unit, so no match) and a bare "k" unit ("15k"). Both fail safe -- the value is left raw and
  flagged -- but they were not caught automatically.
- **Change made:** `spec-extract.py` now always emits a mandatory confirmation warning for Pack
  Size and another for Pack Format whenever a value is extracted, exactly like Storage Conditions
  and Shelf Life, so every spec stops for a person to confirm each field separately before
  `--apply`, even on an otherwise clean extraction. Per the user: "ask the user to click confirm
  for each bit, like you do on shelf life".
- **Still to do (awaiting user decision):** label check on the "1-d)" row, the two pattern gaps,
  a hard refusal in `spec-apply.js` for a non-single-measure Pack Size, an automatic cross-check
  against numbers in the name/filename/legal name, and resolving the 24 flagged live values.

### 2026-10-07 — Standing rules added: Ingredients source order, Pack Size layout registry

**Rule: where Ingredients come from (user instruction, 2026-10-07).**
1. **First choice: the Legal Ingredient Declaration box** (the row under that label on the
   "3 Ingredient & Recipe" sheet). This is label wording and is always preferred. A declaration
   that is present is never second-guessed against the table.
2. **Only if that box is empty or missing: the Ingredients/Percentage table** at the top of the
   same sheet. The list is built from it (e.g. `Carrot (100%)`), flagged as INFERRED, and
   **always stopped for explicit human confirmation** (clickable prompt) before writing.
3. If both are empty, Ingredients stay blank and nothing is guessed.
Found when the Matcha spec (107427) showed "Organic Matcha green tea powder, 100%, Clearspring
Ltd., Japan" in the table while the declaration box was empty, and the extractor wrongly
reported no ingredients. A cross-check of table against declaration when both exist was tried
and dropped: it warned on 20 of 116 specs, almost all spelling differences (e.g. Wheatflour vs
Wheat Flour). Regression over the 116 source specs still on disk: the declaration path gave the
same result as before on 113 (the other 3 differ from the archive for reasons unrelated to this
change: 105952's archived text was hand-edited, 106041 and 106163 were archived before ingredients
and Pack Size were extracted). The table fallback fires on exactly **11 specs whose live
Ingredients are currently blank**: 105970, 106139, 106206, 106218, 106219, 106220, 106222,
106223, 106226, 106228, 107427. Nothing has been written to them; back-filling each needs its own
confirmation.

**Pack Size layout registry.** Pack Size is found by reading the question text ("weight or
volume"), not by item number, and the layout found is reported on every extraction
(`packSizeLayout`: sheet, row, item number, question, answer column). Any layout not in the
registry below raises a warning so it gets recorded here instead of being assumed.

| Item number | Question text | Answer column | Seen in |
|---|---|---|---|
| `1-d)` | Weight or Volume : * | C | all 116 source specs still on disk |

Regression over those 116 specs: 0 new layouts; Pack Size identical to the archives except
105952 (archive had a hand-added "(4000ml)"), 106164 (archive holds the human-confirmed
correction 2.5kg; the raw cell says 2.5g, which the confirmation prompt now shows next to the
inferred value), and 106099 / 106163 (the extractor now reads "60gx100pcs" as 60g, and finds
"10 kg" that the old run missed). A bare "k" unit is read as kg and flagged as inferred.
Pack Size and Pack Format each always stop for confirmation, with the raw source text shown
beside the inferred value.

**Matcha (107427) test run, as a test of the new rules, nothing written:** code override
(CS159 to 107427) and blank nutrition were confirmed by clickable prompt, as were Pack Size
`40g` and Pack Format `Composite doy pouch with Al layer and ziplock`. The Storage, Shelf Life
and Ingredients prompts were dismissed by the user before the run finished; the Ingredients list
is now inferred from the table as above. The live ingredient was not touched (the login cookie has
expired, so no apply was possible in any case).

**Known issue, not fixed:** `--override-code CODE/ALTCODE` silently drops the alternate code
(only the "(ALT)" form inside a cell is parsed as an alternate). It has not caused a wrong match,
since matching uses the primary code, but the docstring promises more than the code does.

### 2026-10-07 — Pack Size number + unit: confirmation prompt, edit form, and where things stand

**Rule: Pack Size is confirmed as a number and a unit (user instruction, 2026-10-07).** The
extractor now reports `packSizeNumber` and `packSizeUnit` alongside `packSize`, and its mandatory
warning reads e.g. "Pack Size inferred as '40g', read as number 40 + unit g (source cell read
'40g')". In every confirmation prompt, show it as **Pack Size: 40 + g** (and Pack Format on its own
line) and ask the person to confirm or deny; where the value is not a single number + unit the
warning says so, and the person decides what it should be. This applies to every spec, with or
without an exception, so nothing reaches `--apply` without that click.

**Ingredient Specs "edit ingredient" form (`index.html` + `app.js`), written 2026-10-07, NOT yet
deployed.** Pack Size is now two boxes, a number and a unit (g / kg / ml / l), like Cost already has
a unit box. It is still ONE stored string (`"40g"`): no backend, storage.js, save-queue or database
change. Design for data safety: the stored value is loaded into the (now hidden) text field
unchanged and is only rewritten if someone edits the number or unit box; a stored value that is
not a single number + unit (e.g. `1 kg / 3 kg`) is shown as editable raw text instead of being
forced into the boxes; saving blocks a number without a unit, or a non-numeric number, with a
message rather than writing a half-value. Tested by running the real functions from `app.js`
against a stub page: for all 146 archived Pack Size values, opening the form altered 0 and would
have blocked 0 saves (127 show in the boxes, 17 stay as raw text, 2 empty). NOT tested in a real
browser: the app needs a sign-in the assistant doesn't have, so the first real use is the check.

**Extractor changes made this session, all documented above:** question-text row finder and layout
registry; `60gx100pcs` and bare `k` handled; Pack Size / Pack Format always confirmed; Ingredients
from the declaration first, table as a confirmed fallback; number + unit reporting.

**Open items (nothing below has been done):**
1. Resolve the 24 live Pack Size values listed in SPEC-ISSUES-TO-REVIEW.md, one at a time, each
   confirmed by clickable prompt.
2. Back-fill Ingredients on the 11 specs whose live list is blank but whose table has one:
   105970, 106139, 106206, 106218, 106219, 106220, 106222, 106223, 106226, 106228, 107427.
3. Hard refusal in `spec-apply.js` for a Pack Size that is not a single measure unless explicitly
   confirmed (today safety rests on the confirmation prompt alone).
4. Automatic cross-check of Pack Size against numbers in the ingredient name / filename / legal
   name (would have caught the 2.5g-for-2.5kg typo and the 1.2-1.5kg vs 1.6kg Tuna Bar).
5. Fix `--override-code CODE/ALTCODE` dropping the alternate code.
6. Compare live Pack Size values against the archives (needs a fresh sign-in; the cookie jar has
   expired), and note 30 archived specs have no source file on disk so cannot be re-verified.
7. Re-run the Matcha (107427) test through to the end (its Storage, Shelf Life and Ingredients
   prompts were dismissed) when the next spec is uploaded.
8. Deploy the Pack Size edit form once the user has agreed. `app.js` / `index.html` also still
   contain the earlier performance fixes that are already live on the Pi but were never committed.

### 2026-10-07 — four specs applied (first run of the new Pack Size / ingredients rules)

Every field of every spec below, including Pack Size as number + unit and Pack Format, was
confirmed by clickable prompt before writing, and every write was re-fetched and verified.

- **106253 Teriyaki Sauce (altCode 105041) -> "RM Teriyaki Sauce / CPU Only".** Pack Size 15 + kg
  (stored "15Kg"; source cell read "15Kg Jerrican", container word dropped), Pack Format "15Kg
  Jerrican". Nutrition identical to the 106102 sachet spec (same sauce). Name mismatch (RM prefix,
  "CPU Only" suffix) confirmed same product.
- **107315 Turmeric (filename code P00049) -> "RM Turmeric".** Code blank or "0" on every sheet,
  overridden to 107315. Salt blank but Sodium 27 mg: derived 0.0675 g with
  `--derive-salt-from-sodium`, confirmed. Pack Size 25 + kg, Pack Format "blue PE bag". High fibre
  (22.7) is normal for turmeric; calories reconcile.
- **107391 Rice Mighty -> "RM Rice Mighty ME".** Two internal inconsistencies in the source, both
  put to the user: stated energy 673 kJ / 161 kcal is consistent with the spec's own per-pack
  figures but its macros only give about 90 kcal (used as stated, per the literal-value rule); the
  Sodium cell says 0 mg while Salt says 6.95 g (used 6.95, sodium cell ignored). Protein and fibre
  written "<0.5" recorded as 0.5 by the standing convention. Basis column reads "Per 100ml 100g"
  and the numbers are "Calculated" by the manufacturer. Pack Size 5 + l, Pack Format "Jerry Can /
  Cap / Label". Ingredient percentages are marked "Confidential" in the table.
- **107561 Sweetcorn Salsa -> "RM Sweetcorn Salsa".** Pack Size cell read "8x1kg": Pack Size 1 + kg,
  and the case count appended to Pack Format ("... (Primary pack method) (8x1kg)"), both
  confirmed and recorded as warnings in the extraction JSON. The Legal Ingredient Declaration
  repeated "Lime Juice, Olive Oil" (the table lists each once); the user chose to remove the repeat.
  Worth raising with the supplier so the source is corrected.

**Sign-in problem, and what was done.** The old session file (`/tmp/qa_cookies.txt`, from the
disposable QA account) was gone and the live app returned 401. The QA account's login was also
rejected (the server answers 401 for both "no such email" and "wrong password"); the account may
have been deleted, as `ACCURACY-SCAN.md` recommends doing after use. Nothing in this session
deleted the file. The assistant cannot sign in itself, so `scripts/qa-login.sh` was written for the
user to run: it prompts for the password silently, forces Git's own `curl`/`rm` (launched from
PowerShell, bash starts with a bare PATH and Windows' `curl.exe` reads `/tmp` as a different
folder), prints what the login endpoint answered, and saves the session where the apply scripts
read it. The user signed in with their own NutriCost account (`QA_EMAIL` setting), so these four
writes are recorded under that account. Local sessions are persistent cookies
(`IsPersistent = true`), so they outlast a day, but the exact lifetime was not established.

### 2026-10-07 — Pack Size format rule: "<number> <unit>", and 114 live values corrected

**Rule (user instruction, 2026-10-07): every Pack Size is written as the number, a single space,
then the unit -- `40 g`, not `40g` -- with the unit spelled `g`, `kg`, `ml` or `L` (capital L,
because a lowercase l next to a number looks like a 1).** The number is kept exactly as written
(`25.00 kg` stays `25.00 kg`). The extractor now outputs this form, the edit form's number and unit
boxes join with a space, and a bare `k` is read as kg and flagged as inferred.

**Why it came up:** 106253 Teriyaki Sauce had just been applied as `15Kg`. At confirmation the
user was shown "number 15 + unit kg", but the string actually written was the spec's own `15Kg`
(the extractor preserved the spec's capital letter and spacing). The user saw it in the live app
and asked why it was wrong. Lesson: what is shown at confirmation must be exactly what is stored.

**Review of all live values** (read from the API): of 148 ingredients with a Pack Size, 16 were
already in the form, 86 only lacked the space, 29 also had a different unit spelling or capital
letters (`Kg`, `KG`, `Litre`, `Litres`, `ltr`, `kgs`), and 17 are not a single number + unit.
**Corrected 114 live values** to the form (the earlier 16 includes some that used a lowercase `l`,
so the changed count differs from 86 + 29). Full before/after list was shown to the user first;
`.scan/packsize_format_plan.txt` / `.json` hold it (the json can be used to reverse the change).
Written with `scripts/packsize-fix-apply.js` (now takes a plan file; writes only `packSize`, matched
by exact code, refuses any item whose live value no longer matches the plan, re-fetches every
record afterwards): **114 succeeded, 0 failed, 0 verification mismatches.** The 114 matching
`spec-data/*.json` archive files were updated too. The 17 non-single values are untouched and
still listed in SPEC-ISSUES-TO-REVIEW.md.

**Form retest:** the real functions from `app.js` against all 150 stored values: opening altered 0
and would have blocked 0 saves. The form is still not deployed.

**New request, not started (needs approval): store the number and the unit as separate data.**
The number may be used as a weight value in future. Findings so far, nothing changed:
- Backend is EF Core with a precedent: Pack Size itself was added as an additive column on
  2026-09-28 (migration `AddIngredientPackSize`). Fields live in `Models.cs`, `Persistence/Entities.cs`,
  `Persistence/AppDbContext.cs`, `Persistence/MappingExtensions.cs` (both directions), a projection in
  `Program.cs`, plus a new migration. Adding `pack_size_value` (nullable number) and `pack_size_unit`
  (text) would be additive: no existing column is touched or dropped.
- The frontend merges each save over the existing record (`{ ...existing, ...data }`), so fields the
  page already received round-trip. The risk is a page loaded BEFORE the upgrade: it has no new
  fields, sends none, and the update would overwrite the columns with defaults. Mitigation: the server
  keeps the stored values whenever a request does not send them (null = not sent, "" = cleared).
- Deploying means a backend rebuild, a database migration and an API restart on the Pi: a production
  change that needs a backup first (`scripts/backup-full.ps1`) and the user's go-ahead.
- Also needed: `spec-apply.js` writing and verifying the two new fields, the edit form saving them,
  and a backfill from the now-canonical strings (deterministic for the clean ones).

### 2026-10-07 — Pack Size number and unit stored as separate fields: backend stage DONE and live

**What changed in production:** two new nullable columns on `ingredients`: `pack_size_value`
(numeric) and `pack_size_unit` (text), migration `AddIngredientPackSizeParts`. The API model
(`packSizeValue`, `packSizeUnit`), entity, column mapping and both mapping directions carry them.
The text `packSize` field is unchanged and still what everything reads today. The version-history
snapshot deliberately does NOT include the new fields, so no ingredient got a fake new version.

**Safeguard (the important part):** on both ingredient update endpoints (`PUT /api/ingredients/{id}`
and the bulk `PUT /api/ingredients`) a request that does not send `packSizeUnit` at all (a page
loaded before this existed) keeps the stored number and unit instead of blanking them. `null` =
not sent = keep; `""` = deliberately cleared = honoured.

**How it was proven before touching production** (the Pi's database login cannot create databases,
so a scratch database was made with the Pi's admin database user, then dropped):
1. Full backup first (`scripts/backup-full.ps1`, staged locally; a copy of the database dump is
   kept in `.scan/backups/`). The dump was verified (valid gzip, 404 ingredient rows = live).
2. Copy of the live database (rows, versions and a whole-table fingerprint all identical), new
   build started against the COPY ONLY on `127.0.0.1:5099` (not reachable from the network).
3. 18 checks, all passed: migration applied to the copy and not to production; every existing
   column identical to production afterwards; the parts round-trip; an older page saving WITHOUT the
   new fields (single and bulk) leaves the stored values intact; a deliberate clear works; no fake
   version rows; every other ingredient row byte-identical. (One check in that run, "T7", was
   written so it could not fail and is disregarded; the real production check is the next point.)
4. Copy database dropped, test instance stopped, production fingerprint unchanged.

**Production deploy:** previous program saved on the Pi in `/opt/nutricost/backend-previous-20261007/`
(rollback = stop service, copy those two files back, start; the extra empty columns are harmless to the
old program). Service restarted: migration applied, both columns exist, no rows have values yet, no
errors logged. **Verified against the pre-change backup restored into a scratch database: 0 of 404
ingredient rows differ; recipes and ingredient_versions identical.** Scratch database dropped.

**Also learned:** the Pi runs `NUTRICOST_AUTH_MODE=local` (PI-RUNBOOK.md said `disabled`; corrected);
the backend applies pending migrations at every startup, so the first start of any new build changes
the database; local dev settings point at a Supabase database, so never run the backend locally
without overriding `NUTRICOST_DB`.

**Still to do for this feature:** make `spec-apply.js` write and verify the two fields; backfill them
from the now-canonical strings (about 131 clean values); make the edit form save the number and unit
separately and deploy it (to be tried in a real browser first); show them as separate fields in the UI.

### 2026-10-07 — Pack Size number + unit: scripts done and 131 live values backfilled

- `spec-apply.js` now writes and verifies `packSizeValue` / `packSizeUnit` alongside the text. They are
  written ONLY when they agree exactly with the text value (`"<number> <unit>"`); if the text is not
  a single measure, or an extraction was hand-edited so the two disagree, the parts are cleared
  rather than stored as a contradiction (with a NOTE printed). `spec-reapply-all.js` restores them from
  archives that carry them; older archives without them leave the live values untouched. Archives now
  store both. Dry run on the Matcha spec confirmed the diff includes `packSizeValue: null -> 40` and
  `packSizeUnit: "" -> "g"`.
- **Backfill (`scripts/packsize-parts-backfill.js`)**: filled the two fields from the live text for the
  131 values that are exactly `<number> <unit>` (87 kg, 28 g, 2 ml, 14 L). The 17 non-single values are
  left without parts (they need a person's decision first); 256 ingredients have no Pack Size. Result of
  the independent re-fetch: **131/131 correct, 0 text values changed, 0 other ingredients changed
  (404/404 present).** Each write carries the record's `updatedAt`, so a record someone edited in the
  meantime would be refused by the server rather than overwritten.

### 2026-10-07 — Pack Size edit form deployed: number and unit saved as separate data

**Live now.** The ingredient edit form shows Pack Size as a number box and a unit dropdown (g, kg, ml, L)
beside Pack Format. It still keeps the one text value (`12.5 kg`, number + space + unit) AND sends the
number (`packSizeValue`, a real number) and unit (`packSizeUnit`) as their own fields.

**Tried in a real browser first** (local preview, no data server, throwaway storage cleared afterwards):
typing 2.5 and choosing L stores the text `2.5 L`; a number with no unit is refused with a message and
nothing is saved; a valid save stores text `2.5 L`, value `2.5` (a number) and unit `L`; opening a
record with a clean value shows it in the two boxes; a messy legacy value (`1 kg / 3 kg`) opens as plain
editable text, is saved EXACTLY as it was with the separate fields cleared, and clearing that text
returns the form to the two boxes. Earlier: the real functions run against all 150 archived values
altered 0 and would have blocked 0 saves.

**Deployed:** `app.js` and `index.html` to `/opt/nutricost/` (cache tag `app.js?v=20261007-packsize-parts`);
`hfss.js` and `recipes.js` were already identical to the live copies. Previous `app.js` and `index.html`
are in `/opt/nutricost/frontend-previous-20261007/` on the Pi (rollback = copy them back; no restart is
needed for page files). Checksums matched after upload and the live site serves the new code, version tag,
number box and unit dropdown. This commit also saves, for the first time, the earlier speed fixes
(`recipes.js`, `hfss.js`, parts of `app.js`) that went live on 2026-09-30 but had never been committed.

**Rollback summary for the whole Pack Size parts feature:** page files: copy back from
`frontend-previous-20261007`. Backend program: `/opt/nutricost/backend-previous-20261007` (stop service,
copy the two files back, start). The two new database columns are additive and harmless to the old program.
Full database dump from before any of this: `.scan/backups/nutricost-db-2026-10-07.sql.gz`.

**Not done / still open:** the 17 live Pack Size values that are not a single number + unit (listed in
SPEC-ISSUES-TO-REVIEW.md) have no number/unit yet; 11 specs' ingredient lists could be filled from their
tables (Matcha's dry run shows it); the OneDrive copy of this backup was not made (`backup-full.ps1
-ConfirmOneDrive` would do it); the number is not yet used for any calculation.

### 2026-10-07 — Review of every uploaded spec (150): results

**Checks run:** (1) live data against what was uploaded (archives); (2) live data against a fresh re-read
of every source spec (all 150 source files were found; 147 re-read automatically, 3 checked by hand);
(3) consistency checks on the live values (kJ vs kcal, kcal vs macros, saturates vs fat, sugars vs
carbohydrate, totals, salt, negatives); (4) allergens against the ingredient text; (5) pack size text vs
number and unit; (6) storage vs shelf life; (7) repeated ingredient items; (8) duplicate codes;
(9) a lowest-name-similarity list to catch a spec landing on the wrong ingredient.

**Clean:** 0 of 150 live records drifted from what was uploaded. **Allergens: 0 differences from the source
specs** across the 147 re-read; the other 3 (105951, 106217, 106955) were checked by hand and match
(105951's "N, <=10mg/kg" is below the declaration threshold; 106217's missing row label shows N; 106955's
"may contain naturally occurring SO2" was resolved earlier by declaring Sulphur dioxide). The keyword check of
allergens against ingredient text found no genuinely missing allergen (every flag was a false alarm: "rice
malt", "Gluten Free soy sauce", a "may contain traces of milk" statement the system doesn't record, and my
checker calling sulphites "Sulphites" where the app says "Sulphur dioxide"). All 131 Pack Size number/unit
pairs agree with their text. No duplicate codes, no negative values, no spec on an obviously wrong
ingredient.

**Found:** the four likely errors and the 22 fillable ingredient lists in SPEC-ISSUES-TO-REVIEW.md. Two of
the nutrition ones got through because the extractor's sanity check only compares kcal with the macros: it
does not compare kJ with kcal, or sugars with carbohydrate. 107497 was a recorded "write as entered" decision
that later evidence (the same supplier's swap in 107685 and 106959, corrected) argues against.

**Other differences from the source were all explained** as earlier approved edits: swapped kJ/kcal
corrected (106959, 107685), fibre left unset (105241), typo fixes in shelf life and storage (106215, 107317,
107541, 106243, 107685), Pack Format count suffixes (the 47 retro edits) and a handful of hand-agreed
formats, the 105952 heading removal and the 107561 repeated-ingredient fix.

**Limits of this review:** it proves the data matches the supplier specs and is internally consistent; it
cannot prove a supplier spec is itself right. Allergen text matching is keyword-based. The system records only
what a product contains, so "may contain" statements live only in ingredient text.

**Follow-up for the extractor (not yet done):** add kJ-vs-kcal (about 4.184) and sugars-vs-carbohydrate checks
to `spec-extract.py` so these are raised at upload time.

### 2026-10-07 — 107497 IQF Julienne Carrot: swapped energy corrected

After the full upload review the user confirmed correcting **RM IQF Julienne Carrot (107497)** from
kJ 35 / kcal 146 to **kJ 146 / kcal 35**. Evidence shown: the spec's own macros (7.9 g carbohydrate, 0.6 g
protein, 0.3 g fat) give 36.7 kcal; 35 kcal x 4.184 = 146.4 kJ (almost exact); and the same supplier's IQF
Carrot Diced (107685) and Red Chilli Puree (106959) had the same swap, corrected at upload. This reverses
the earlier "write as entered" decision for this item. It feeds 131 of the 1,098 recipes (1 directly, the rest
through sub-recipes), whose carrot energy was previously about four times too high; their nutrition is
calculated live, so they correct themselves.
Done with the new `scripts/field-fix-apply.js` (a plan file of confirmed corrections; refuses if a live value
isn't the expected old one; attaches an explanatory comment to the version history; verifies by re-fetch):
status 200, both fields correct, **0 other ingredients changed (404/404)**. `spec-data/107497.json` updated so
a re-apply from archive does not undo it. Plan kept in `.scan/fix_107497.json`.

**Still open from the review (user did not choose these yet):** 106250 Tuna (kJ 503 vs kcal 102), 102584
Inari (sugars above carbohydrate), 106163 Pepper Green (Pack Size 10 kg and ingredients are in the spec),
the 22 blank ingredient lists, and adding kJ-vs-kcal and sugars-vs-carbohydrate checks to the extractor.

**Standing rule restated by the user (2026-10-07): flag every change for approval, every time.** Any change
to live data, deployed files, the database, stored archives, or how the extract/apply scripts behave is put
to the user as a specific, clickable approval (showing the before and after values) before it is made. A
dry run or a list shown first is not approval, and a broad earlier "go ahead" does not cover a later
separate change. In this session the 131-value Pack Size number/unit backfill, the 114-value Pack Size
format correction, and the archive and extractor edits went ahead under broader approvals without a
per-change click; all were verified and logged, and the rule is now explicit.

### 2026-10-07 — blank ingredient lists: all areas reviewed, 7 filled

Applying the new Ingredients rule (declaration box first, ingredient table only if the box is empty) to the
22 uploaded specs whose Ingredients List was blank, every area of each spec was read: the declaration box, the
ingredient table with percentages and suppliers, the manufacturer sheet's legal description (descriptive text
only, not used), and any other cell mentioning ingredients or composition. Result: 9 specs have the list in the
declaration box and 13 have an empty box, so the table supplies it. The text for each was built by script from
the spec, shown to the user, and approved item by item (clickable prompts).

**Written (7, approved by the user):** 106041 "Honey", 106127 "Kale 100%", 106163 "Pepper Green 100%", 106169
"Coconut Kernel Extract, Water", 106251 "XANTHAN GUM (E415)", 106438 "Pepper Red 100%" (all from the declaration
box, word for word), and 106208 "Potato 100%" (the box wording; the user chose it over adding the table's trace
sodium metabisulphite, and the Sulphur dioxide allergen stays declared separately). Written with
`scripts/field-fix-apply.js` (checks the live value was still blank, attaches an explanatory version-history
comment, verifies by re-fetch): all 7 correct, **0 other ingredients changed (404/404)**; `spec-data` archives
updated so a re-apply does not blank them. Plan kept in `.scan/fix_ingredients_7.json`.

**Not written:** 103895 (user asked to come back to it; see SPEC-ISSUES-TO-REVIEW.md), 106167 (paused, with its
own open issue), and 13 table-sourced single-ingredient lists awaiting the user's approval after asking to see
the ingredient names next to the codes: 105970, 106139, 106160, 106206, 106218, 106219, 106220, 106222, 106223,
106226, 106228, 106317, 107427.

**Follow-up, same day: the 13 table-sourced lists were then approved by the user and written** (105970, 106139,
106160, 106206, 106218, 106219, 106220, 106222, 106223, 106226, 106228, 106317, 107427), each as the single
ingredient with (100%) taken from the spec's ingredient table because its declaration box was empty, shown to
the user beside the ingredient name before approval. Written with `field-fix-apply.js`: all 13 correct, **0 other
ingredients changed (404/404)**; archives updated; plan in `.scan/fix_ingredients_13.json`. Of the 22 originally
blank, 20 are now filled; still blank are 103895 (user: come back to it) and 106167 (paused, own open issue).

### 2026-10-07 — Consolidated open items and standing procedures (read this first next session)

**Standing procedures**
- **Checking the folder for new specs = two checks, both every time.** (1) Diff the folder listing against the
  previous snapshot (`ls` into `/tmp/spec_filesNN.txt`, keep the chain going). (2) Cross-check the WHOLE folder
  against every RM ingredient that still has no spec (live API minus `spec-data/` codes minus anything with
  nutrition), matching codes into filenames. The diff alone misses files that were already sitting there before
  tracking started; that gap hid 12 specs once. The list of still-unspecced RM ingredients is regenerated from the
  live API by script each time, never retyped.
- **Signing in:** the assistant cannot sign in. The user runs `scripts/qa-login.sh` (PowerShell: `& "C:\Users\JamesMurphy\AppData\Local\Programs\Git\usr\bin\bash.exe" C:\Dev\NutriCost\scripts\qa-login.sh`;
  set `$env:QA_EMAIL` to their own NutriCost email first). The session lasts longer than a day but not forever;
  expect to refresh it. Pass `COOKIE_JAR` as a Windows path to node scripts.
- **Changes:** every change to live data, deployed files, the database, archives or script behaviour is put to the
  user as a specific clickable approval first (see the standing rule above); a corrected live value is made with
  `scripts/field-fix-apply.js` from a plan file, then the matching `spec-data` archive is updated.
- **Never run the backend locally without overriding `NUTRICOST_DB`** (local settings point at a Supabase database
  and every start applies pending migrations). Database work is tested on a scratch copy on the Pi first.

**Open items (nothing below is done)**
1. *Data needing a decision:* 106250 Tuna (spec says 503 kJ but 102 kcal; 503 kJ is about 120 kcal and the macros
   agree with that); 102584 Inari (sugars 14.1 g above carbohydrate 12.3 g); 106163 Pepper Green (spec states Pack
   Size 10 kg, live is blank); the 17 Pack Sizes that are not a single number + unit (SPEC-ISSUES-TO-REVIEW.md),
   including 106099 `60gx100pcs`.
2. *Ingredient lists still blank:* 103895 Noodle Industrial (user: come back to it; declares gluten but has no
   ingredient text) and 106167 Rapeseed Oil (paused with its own issue). The other 20 were filled on 2026-10-07.
3. *Specs paused:* 106198 Chicken Wings (one sheet has a different code), 106199 Breadcrumbs, 106987 Shokupan,
   107246 Coffee Beans (brewed-coffee nutrition and swapped name/code cells), 120087 Lamb Weston Potato Puffs
   (code not in the system; 107496 is the likely match). 106192 Baking Powder has no spec file at all.
4. *Extractor / apply script improvements not yet made:* add kJ-versus-kcal (about 4.184) and
   sugars-versus-carbohydrate checks (both slipped through at upload); `--override-code CODE/ALTCODE` silently drops
   the alternate code; make `spec-apply.js` refuse a Pack Size that is not a single measure unless explicitly
   confirmed; cross-check Pack Size against numbers in the ingredient name and filename.
5. *Housekeeping:* the 30 baseline archives still name "baseline snapshot" as their source file though the real files
   were found by code during the review (could be corrected); the review scripts live only in a scratch folder
   (could be saved under `scripts/`); 106202 "RM Frying powder" vs spec name "Chicken Breading WSB MK2" deserves a
   glance; this backup (database dump and code zip) has not been copied to the OneDrive backup folder
   (`scripts/backup-full.ps1 -ConfirmOneDrive`); the number in Pack Size is stored but not used for anything yet.

### 2026-10-07 — Audit: anything in the specs that was never extracted (early uploads never fixed)

Re-read all 150 source specs with today's extractor and compared every field it reads with the live record.

**A. Fields the extractor reads today: nothing was silently missed.** The only places where a spec has a value
and live is blank or different are ones already known and decided or paused: fibre 3.3 on 105241 (deliberately
left unset: it contradicts a carbohydrate of <0.1 g); Pack Size on 106164 (spec cell says 2.5 g, live holds the
confirmed correction 2.5 kg) and on 106163 (spec says 10 kg, live blank: open item); ingredient lists on 103895
and 106167 (open items); Pack Format on 106100 ("Tubs containing"), 106170 ("4000 g") and 107497 ("Liner")
(values deliberately dropped because they are not a container); shelf life on 106167 (paused). All other early
gaps (ingredient lists, pack format, pack size) were found and fixed earlier today.

**B. Information the specs contain that NutriCost has no field for at all** (never in scope, so not an early-upload
miss). Counts are specs with a real answer, out of 150, by question text, so they are approximate across template
versions:
- Shelf life & storage ONCE OPENED: 144. Temperature at transport: 146. Ready to eat or ready to cook: 112.
- Vegetarian suitability: 136. Vegan suitability: 123.
- Microbiological standards (Salmonella 105, aerobic colony count 104, E. coli 102, yeast & mould 84, Listeria 71, and
  others) with limits.
- Date coding: best-before/use-by format 141 and location 146; manufacturing date format 109 and location 111.
- Manufacturer details: address 148, telephone 148, emergency contact name 141 and number 140, site code 119, SEDEX
  number 86, category/scope 99, certification 35 (the manufacturer name is not read either; the live supplier field
  comes from the cost feed).
- Packaging: inner material 141, inner dimensions 137, outer material 119, outer dimensions 111, pallet configuration
  134, HS code 35.
- Quality controls: weigh check 148, visual check 145, metal detection 135, pest control 140.
- Pesticide use/level/testing (about 60), deforestation statement (15), palm oil section, gluten level 32, alcohol
  ABV 24, additives checked 44.
- The allergen sheet's "may contain" / cross-contamination column is not stored (the system records only what a
  product contains). Example: 105950 states "may contain traces of milk".
Adding any of these would be a new field end to end (backend column and migration, API, edit form, extractor,
apply script), the same way Pack Size number and unit were added. None has been started.

### 2026-10-07 — DESIGN (approved in principle, NOT built): "Ready to eat / Ready to cook" box

**What the specs actually say** (all 150 re-read; every cell on every sheet searched for any wording):
125 specs have the question (121 as "Ready to Eat or ready to cook", 4 as "8-a) Is it ready to eat?"); 25 have no
such question anywhere and say nothing about it elsewhere (mostly single ingredients and older specs: avocado,
honey, peppers, nori, oils, noodles, soy sauces). Of the 125 answers: 50 are exactly "Ready to eat"/"RTE" (any
capitalisation, trailing full stop ignored), 31 are exactly "Ready to cook"/"RTC", 9 are blank / "N/A" / "N", and
35 use other wording: other ways of saying ready to eat ("Cooked, Ready to eat", "Open & Eat", "Yes / IT CAN BE
EATEN DIRECTLY", "Raw Ready to Eat", a bare "yes"); other ways of saying cook first ("Product must be cooked
prior to consumption", "Requires further processing - Heat treatment", a bare "cook", "Not ready to eat..."); ready to
eat only after a step ("once defrosted", "after rehydration", "re-heating recommended", "submerge in water
75-95C for 5 minutes"); both ("Ready to Eat and Ready to Cook"); "Ready to drink" and "Ready to use"; "Wash before
use" / "Ready to wash" on fresh produce; "as per spec (if meets customers requirements for RDE)" on four spices;
"N/A - used during food manufacture" on two additives. The full lists are in `.scan/rte_review.txt` and
`.scan/rte_wide_search.txt`.

**Decided by the user:** (1) the box is FREE TEXT, not a fixed list. (2) Extraction is exact-match only: an
answer that is exactly RTE, RTC, "ready to eat" or "ready to cook" is proposed as read (stored as the plain words
"Ready to eat" / "Ready to cook"); ANYTHING ELSE, and any blank or N/A, stops and asks the user what to store,
showing the supplier's exact words. (3) For the specs with no such question the prompt must say so plainly ("this
spec has no ready-to-eat/cook question, so the box is BLANK") and ask for the user's approval; it is never inferred
from the product type. Every spec still gets the user's click, per the standing rules.

**Plan, each stage to be approved separately before it is done:**
1. Backend (production database change, same method as the Pack Size number/unit field: full backup, new build tested
   on a scratch copy first, deploy, verify against the backup): one new nullable text column on `ingredients`, API field
   `readyToEat`, and the keep-existing rule on both ingredient PUT endpoints so a page opened before the upgrade
   cannot blank it. Deliberately left out of the version-history snapshot (adding a key would create a fake new
   version for every ingredient); so a change to this box alone is not versioned.
2. Edit form: a text box beside Pack Format / Storage; saved and loaded with the ingredient; tried in a real browser
   first, then deployed.
3. Extractor and apply scripts: read the row (both question wordings), report the supplier's raw wording, mandatory
   confirmation prompts as above; `spec-apply.js` / `spec-reapply-all.js` write and verify the field; archives store it.
4. Backfill for the 150 specs already uploaded, by approval: the exact RTE / RTC answers shown as a list with ingredient
   names for one group approval; the 35 other wordings one by one; the 9 blanks and the 25 with no question confirmed
   as blank.


### 2026-10-07 — RUNBOOK: changing the database or backend safely (what was done for Pack Size number/unit)

Use this for any new field or schema change. Every step that changes something needs the user's approval first.
1. **Backup:** `powershell -File scripts\backup-full.ps1` (stages a code zip and a pg_dump locally; add
   `-ConfirmOneDrive` to copy to the OneDrive backup folder). Verify the dump (`gzip -t`, count the ingredient rows)
   and keep a copy of the dump in `.scan/backups/`.
2. **Code:** add the property to `backend/Models.cs`, `Persistence/Entities.cs`, `Persistence/AppDbContext.cs`
   (column name) and both directions in `Persistence/MappingExtensions.cs`; add a keep-existing rule on BOTH update
   endpoints in `Program.cs` (`PUT /api/ingredients/{id}` and the bulk `PUT /api/ingredients`: when the field is
   null, copy the stored value across before `SetValues`) so a page opened before the upgrade cannot blank it.
   Do NOT add the field to `IngredientSnapshot.Build` (that would create a fake new version for every ingredient).
3. **Migration:** with `NUTRICOST_DB` pointed at a dead address (it overrides every config file; the app runs
   `Database.Migrate()` at every start), `cd backend` then
   `dotnet ef migrations add <Name> --project NutriCost.Api.csproj`. Read the generated file: it must contain only the
   intended `AddColumn` calls, and the model snapshot diff must be only those columns.
4. **Build for the Pi:** `dotnet publish NutriCost.Api.csproj -c Release -r linux-arm64 --self-contained true -o <scratch folder>`
   (not the repo's `publish-pi`). Only `NutriCost.Api` and `NutriCost.Api.dll` differ from what is on the Pi.
5. **Test on a scratch copy on the Pi** (SSH works with a key as `dizziness7883@192.168.0.50`): the app's database
   login `nutricost_app` cannot create databases, so use
   `sudo -n -u postgres psql -c "CREATE DATABASE nutricost_migtest OWNER nutricost_app"`, fill it with `pg_dump` of
   production piped into `psql` (read-only on production), and compare row counts and a whole-table fingerprint. Copy
   `/opt/nutricost/backend` to a scratch folder, replace the two files, and start it with
   `ASPNETCORE_URLS=http://127.0.0.1:5099 NUTRICOST_AUTH_MODE=disabled ASPNETCORE_ENVIRONMENT=Production NUTRICOST_DB=<the same
   connection with Database=nutricost_migtest>` (check the string names the copy, never production). Run the checks
   (`.scan/tools/pi_api_tests.py`: migration applied to the copy and not production, existing columns identical, the new
   field round-trips, an old-page save without the field keeps it, a deliberate clear works, no fake versions, every other
   row unchanged). Then kill it, drop the scratch database, delete the scratch folder, and confirm production is unchanged.
6. **Deploy:** on the Pi save the two current files to `/opt/nutricost/backend-previous-<date>/`, `sudo systemctl stop nutricost`,
   copy the new two files into `/opt/nutricost/backend/`, `chmod +x NutriCost.Api`, `sudo systemctl start nutricost`; the start
   applies the migration. Check the service is active, the columns exist and the migration is recorded.
7. **Verify against the backup:** restore the pre-change dump into a scratch database and compare a per-row hash of every
   existing column (`row_to_json(t)::jsonb - '<new cols>'`) between it and production; also compare recipes and
   `ingredient_versions`. Expect 0 differences (other users' edits since the backup would show, so do it promptly). Drop the
   scratch database.
8. **Page files** (`index.html`, `app.js`, ...): try in a real browser first (the preview server on port 5005 serves the page
   without data; use throwaway storage and clear it), save the current live copies to `/opt/nutricost/frontend-previous-<date>/`,
   `scp` the changed files (no restart needed), check checksums and that the live page serves the new code.
9. **Rollback:** backend: stop, copy the two previous files back, start (extra empty columns are harmless to the old program);
   page files: copy back from the previous folder; data: the dump.

### 2026-10-07 (end of day) — snapshot of facts to resume from
- **Folder:** 158 files in `Ingredient Specs` at the last check (about 13:00). No unprocessed spec is sitting in it other than
  the four already paused (106198, 106199, 106987, 107246). The whole-folder cross-check, not the snapshot diff, is the
  reliable test.
- **Still without a spec: 34 RM ingredients** (regenerate the list from the live API by script, never retype it): 4 are the
  paused specs above and 30 have no spec file in the folder yet. 107496 "RM Potato Puffs" is the likely home of the paused
  120087 Lamb Weston spec; 106192 "RM Baking Powder" has no spec file at all.
- **Live data checked today:** 404 ingredients, 1,098 recipes, 150 uploaded specs; all 150 re-read against their source files
  (allergens identical to the sources); 131 ingredients carry Pack Size as a separate number and unit; writes made today were
  recorded under the user's own NutriCost account.
- **Last unanswered question to the user:** whether to start stage 1 (backend database change) of the "Ready to eat / Ready to
  cook" box. The design (free text; exact RTE / RTC / "ready to eat" / "ready to cook" proposed as read; anything else or blank
  asked; specs with no such question shown as blank for approval) is in the DESIGN entry above and the user has agreed to it
  in principle, but has not yet approved building any stage.


### 2026-10-07 — Weight per each set from Pack Size (8 ingredients, each approved by click)
Rule agreed with the user: only for non-packaging ingredients costed per EACH whose Pack Size is a g/ml measure and whose
"Weight per each" (`unitWeightG`) was blank; an EACH with no Pack Size stays with no weight. ml uses density (1 when N/A).
Written to `unitWeightG` (existing field, so no recipe maths changed) with `scripts/field-fix-apply.js`; verified, 0 other ingredients changed.
Set: 107172 10, 106102 20, 104634 15, 106234 15, 106444 15, 105241 5, 100681 10, 106961 30 (g).
Held back by the user: 103489 Miso Block (Pack Size 8 g but the box may be 30 x 8 g; cost 0.2575/each = £32/kg) -- revisit.
Not built yet: the spec-upload question "Costed per EACH and Pack Size is N g: is one EACH one N g unit, or is N g the whole bag/case?"
(Yes -> copy to Weight per each; No -> leave blank and flag). Nori 102058 (250 g bag, costed per sheet) and onigiri seaweed
103487 (125 g) are deliberately NOT set: Pack Size there is the bag, not one EACH. Recipes using these lines now count the weight.


### 2026-10-07 — EACH weight question built into spec-apply.js (and one accident)
`spec-apply.js` now asks, for an ingredient costed per EACH that is not packaging (category Packaging or an "NF " name), has a g/kg/ml/L
Pack Size (this spec's, else the live one) and no Weight per each: "is one EACH one N g unit, or the whole bag/case?". `--each-weight-yes`
writes `unitWeightG` (ml x density, 1 if blank; kg/L x1000), `--each-weight-no` flags it; neither flag -> `--apply` is refused. Tested dry-run only.
ACCIDENT: a "must refuse" test of `--apply` on spec-data/103489.json (an archive, which lacks `packSizeNumber`) was a real write and cleared
103489's Pack Size parts (text "8 g" intact, value/unit blank). User chose to leave it and come back. Restore plan: `.scan/fix_103489_restore.json`
(`field-fix-apply.js`, needs approval). LESSON: never feed archives to spec-apply.js and never test `--apply` against live.


### 2026-10-07 — 103489 Miso resolved
User confirmed one EACH is 8 g. Pack Size parts restored to 8 / g (undoing the accidental clear) and Weight per each set 0 -> 8 g, both
by `field-fix-apply.js`, each approved by click, verified, 0 other ingredients changed. 105048 (CPU Gyoza Dipping Sauce Sachet) is a KG recipe
of 66.67 sachets (1000.1 g) as set up in the system; user chose to leave it; nothing uses it.


### 2026-10-07 — 105978 Soy Sauce Sachet spec uploaded (new file found in the folder)
Folder check: snapshot diff (spec_files30 -> 31, 158 -> 159 files) found one new file, `105978 (105596) Soy Sauce Sachet - RM Spec V3 (2.1.25).xlsx`;
whole-folder cross-check of the 70 unspecced RM ingredients matched only that plus the four already paused (106198, 106199, 106987, 107246).
Every item confirmed by click: nutrition as the spec states (325 kJ / 77 kcal, carb 3.2, sugars 0.6, fibre 1.5, protein 10, salt 16.9; kcal does not match the
4/4/9 macro sum, 77 vs 52.8, but matches the kJ -- spec's own figures); allergens gluten, soya; Pack Size 10 + ml (cell '10ml x 400'); Pack Format '10ml x 400'
(user's wording: the 10 ml x how-many-per-pack); Shelf Life '12 months, minimum on delivery 90 days' and Storage 'Store in a cool, dry place away from direct sunlight.'
(the spec's combined cell split, user chose the split); ingredients 'Water, Soybeans, Wheat, Salt.' (declaration box); name 'Soy Sauce Sachet 10ml' vs live
'Soy Sauce Sachet' confirmed same product; EACH weight question answered yes -> Weight per each 0 -> 10 g. Verified live; archived `spec-data/105978.json`.
Used in 40 recipes. The extractor still cannot split a combined Shelf Life/Storage cell cleanly (the split was applied by editing the extraction JSON with the confirmed text).


### 2026-10-07 — 103004 Water needs no spec
User: Water is complete, blank nutrition is correct by default. Exclude 103004 when regenerating the "RM without a spec" list (69 -> 68). No data changed.


### 2026-10-07 — Weight per each now survives a wipe (archives + spec-reapply-all.js), both approved by the user
Gap found: the 9 weights set with `field-fix-apply.js` (100681 10, 103489 8, 104634 15, 105241 5, 106102 20, 106234 15, 106444 15, 106961 30, 107172 10 g)
were not in the archives and `spec-reapply-all.js` did not restore the field. Fixed: `unitWeightG` added to those 9 archives from the live values (105978's
already had it), and `spec-reapply-all.js` now restores `unitWeightG` when the archive carries a positive value (absent/null leaves live alone).
Tested by a dry run (0 differences against live) and by temporarily changing one archive to 99 (dry run reported 20 -> 99; archive restored).
STILL NOT in archives: weights a person types by hand in the app (including packaging item weights), and any edit made outside spec uploads.
`field-fix-apply.js` does not update archives; a corrected value needs the matching archive edited too.


### 2026-10-07 — 107247 Smoked Back Bacon uploaded (allergen cells "N- But handled on site")
The extractor refused this spec at first: four allergen rows (wheat, gluten level, soya, sulphites) read "N- But handled on site", not Y/N. The user decided to upload
treating that wording as No. New opt-in flag `spec-extract.py --accept-handled-on-site`: ONLY that exact wording ("N" + "-"/":"/"," + "but handled on site") is
recorded as N, and a mandatory warning is added per row so a person confirms; any other free text still refuses. Allergens result: none contained (ingredients pork, salt,
sodium ascorbate, sodium nitrite). Every field confirmed by click: nutrition 1337 kJ / 321 kcal, fat 21.2, sat 8.05, carb 0.4, sugars 0.3, fibre 0.5, protein 32.1, salt 2.12;
Pack Size 1.5 + kg (cell "1.5 Kg / Pack"); Pack Format "APET (Thermoformed Tray) and PET (Blue Top Film)"; Storage "Frozen <-18°C"; Shelf Life "Frozen shelflife is 90 Days;
60 Days Minimum Shelf life on delivery"; ingredients from the declaration box; name (spec "Light Cooked Beechwood Smoked Back Bacon Whole Rashers" vs live "RM Cooked Back Bacon")
confirmed same product. Used in 6 recipes. NOTE: the system records only "contains", so "handled on site" is not captured as a may-contain anywhere.


### 2026-10-07 — STANDING RULE: check the WHOLE allergen row, and ASK when anything is not a plain No (user instruction, found on 106153)
Specs have three answer columns per allergen row: "Product contains?", "Risk of cross contamination?" and "in which ingredient?" (a supplier comment). The extractor used to read only the first.
106153 Savoury Seasoning showed why: wheat and barley = Yes (yeast extract from brewers wort) but the supplier comment says "<20ppm so no allergen declaration required" and the gluten-level row says No.
User decision for 106153: record NO allergens, as the supplier said, and keep the supplier comment on the ingredient as a note. **Procedure from now on:** for every spec, read the whole row; if cross-contamination is
anything other than a plain No, or a supplier comment claims an exemption or threshold, STOP and ask the user what to record. `spec-extract.py` now prints every comment and every non-No cross-contamination
answer as a mandatory warning and returns `allergenSupplierComments` (checked: all 152 uploaded specs extract identically with the old and new script, 0 differences; it only adds warnings).
**Recheck of all 152 uploaded specs** (script `.scan/tools/allergen_sweep.py`, 151 read; 103489 was locked in Excel and not read): see `ALLERGEN-REVIEW.md` (script-generated).
It lists (A) 39 rows in 18 specs declared "not contained" but with a cross-contamination risk of Yes, (B) 7 odd answers, (C) 15 supplier exemption/threshold comments. Nothing there has been decided or changed;
the system has no may-contain field, so these risks are not recorded anywhere yet. Each item needs the user's decision.
**New field "Allergen notes" (free text under the Fruit/Veg/Nut tick box):** step 1 done and approved: nullable column `allergen_notes` (migration `AddIngredientAllergenNotes`), model, mapping and keep-existing rule
on both PUT endpoints; tested 15/15 on a scratch copy on the Pi (production fingerprint identical before/after); deployed to the live Pi (rollback copy `/opt/nutricost/backend-previous-allergen-20261007`); verified:
service active, column and migration present, 0 of 404 ingredient rows differ from the pre-change backup, recipes and versions identical. NOT built yet: the form box, the extractor/apply/archive carry-through, then the 106153 upload.


### 2026-10-07 — RULE (user decision): cross-contamination / "used on site" / "below ppm" is still a NO, recorded as a note, never a tick
Allergen ticks record only what a product **contains**. A supplier answer such as "cross-contamination risk: Yes", "N- But handled on site", "handled/used on site but not present", "carry-over below 10ppm" or
"gluten below 20ppm" is still a **No**: do NOT tick the allergen; instead put the supplier's wording in the ingredient's **Allergen notes** (free-text box directly under the "Fruit, Vegetable or Nut" tick box).
A row the supplier answers **Yes** but then comments as below a threshold / "no declaration required" (e.g. 106153 wheat/barley from yeast extract) is NOT automatic: ASK the user each time what to tick, and keep the comment as a note.
Built so far: DB column `allergen_notes` (live); form box (built, tested in the browser pane, NOT yet deployed to the Pi); `spec-extract.py` returns `allergenSupplierComments` and a `proposedAllergenNote` (cross-contamination
or "handled on site" rows declared not-contained; a PROPOSAL only, the user edits/confirms it); `spec-apply.js` and `spec-reapply-all.js` now carry `allergenNotes` (written only if the confirmed extraction JSON contains it; archived).
Procedure per spec: whole-row check -> show the user the proposed note and any Yes-with-exemption rows -> confirm each by click -> put the confirmed text in the extraction JSON as `allergenNotes` -> apply.
Re-run over all uploaded specs: `.scan/tools/run_all_proposed.py` (output `.scan/proposed_allergen_notes.txt`, local) and `ALLERGEN-REVIEW.md` (in the repo). Backfilling notes onto the already-uploaded specs needs the user's per-spec approval.


### 2026-10-07 — Re-run of ALL uploaded specs with the whole-row rule (results; nothing changed in live data)
All 152 specs read (103489 was locked earlier, now read; the sweep totals are unchanged in sections A/B/C of `ALLERGEN-REVIEW.md`: 39 rows in 18 specs / 7 odd answers / 15 exemption comments).
Re-extraction compared with the stored ticks: 124 specs clean-extract and match the stored allergens except **106955** (spec: "product may contain naturally occurring SO2, not tested"; extractor ticks nothing, live item has Sulphur dioxide ticked from the original upload; needs a ruling under the new rule).
28 specs cannot be re-extracted without their original override flags (102015, 102063, 102584, 102664, 105951, 106028, 106103, 106134, 106135, 106164, 106165, 106167, 106169, 106188, 106194, 106250, 106834, 107199, 107200, 107203, 107240, 107312, 107315, 107316, 107317, 107322, 107490, 107541); their rows are covered by the sweep only.
The extractor proposes an allergen note for 18 specs (`.scan/proposed_allergen_notes.txt`, local): 102052, 102058, 103487, 105950, 105971, 106127, 106138, 106162, 106163, 106174, 106208, 106211, 106217, 106238, 106317, 106363, 106438, 107247. None written. The page box is not yet deployed to the Pi.


### 2026-10-07 — Allergen notes box DEPLOYED to the live site (user approved)
`index.html` and `app.js` (cache tag `app.js?v=20261007-allergen-notes`) copied to `/opt/nutricost/` on the Pi after confirming the live files were byte-identical to the versions edited (checksums); rollback copies in
`/opt/nutricost/frontend-previous-allergen-20261007/`. Verified: checksums match local, the served index.html contains the box (`new-ing-allergen-notes`) and the served app.js carries `allergenNotes`, service active, the live API returns
`allergenNotes` (null on all 404 ingredients, none set yet). Rollback: copy the two files back from the previous folder (no restart needed). Next: the 106153 upload with its supplier note, and the user's decisions on `ALLERGEN-REVIEW.md`.


### 2026-10-07 — 106153 Savoury Seasoning uploaded (first spec with an Allergen note)
File `106153 (106717) RM Spec V5 24.01.2025 July 2026.xlsx` (code cell "106153 (105003)"). Every field confirmed by click: nutrition 1135 kJ / 270 kcal, fat 2.7, sat 0.4, carb 28.5, sugars 1.2, fibre 7.6, protein 29.3, salt 23.5;
Pack Size 15 + kg (cell "15Kg"); Pack Format "Heavy Duty Plastic Sack"; Storage "Ambient" (full stop dropped); Shelf Life "12 months / Minimum shelf life on delivery 6 months" (spec row 5-a is "Shelf Life from manufacturer &
Minimum shelf life on delivery" = "12 months / 6 months"); Ingredients "Seasoning Mix (Yeast Extract (Yeast Extract, Salt), Salt, Potato Starch, Onion Powder, Ground Sage, *Rapeseed Oil)." (declaration box, the processing-aid footnote left out by choice).
ALLERGENS: NONE ticked. The spec answers Yes for wheat and barley (yeast extract from brewers wort) but the supplier comment says "<20ppm so no allergen declaration required" and the gluten-level row says No; user decided to follow the supplier.
Allergen notes written: "Wheat: Yeast Extract derived from brewers wort (Wheat), but total content is <20ppm so no allergen declaration required. Barley: Yeast Extract derived from brewers wort (barley), but total content is <20ppm so no allergen declaration required."
Verified live, archived in `spec-data/106153.json` (allergenNotes carried), used in 32 recipes. No other ingredient has an allergen note.


### 2026-10-08 — RULE: one spec at a time
After a folder check found five new specs I offered a pick-list and started on two at once; the user corrected it ("but we do 1 at a time?"). The rule is now in the "START HERE" box at the top of this file and in the memory notes.
Queue after the 2026-10-08 folder check (one at a time, in this order): 106439 Broccoli Floret (in progress), 107559 Edamame Hummus (spec's own code is WASABI013, file named 107559; user said it is 107559, needs a code override),
106141 Beansprouts (no Fibre row, refused), 106568 Red Jalapeno Sriracha Mayo (saturated fat blank, refused), 106615 Portobello Mushroom (fibre blank, kcal mismatch 14 vs 11.7, refused).


### 2026-10-08 — 107559 RM Edamame Hummus uploaded (code override: spec cell "WASABI013/ 107559")
File `107559 RM Edamame Hummus Spec 0.5kg (v1 Jun,26).xlsx`; the spec's Product Code cell reads "WASABI013/ 107559" on every sheet, overridden to 107559 (user: "it is 107559"). Every field confirmed by click: nutrition 688 kJ / 165 kcal, fat 11.6, sat 1.11,
carb 7.2, sugars 2.7, fibre 4.6, protein 8.4, salt 0.7; allergens: Soya only (the seed and soya rows say cross-contamination Y but both are ingredients; seed is not an EU-14 allergen); Pack Size 0.5 + kg (cell "8 x 0.5Kg");
Pack Format "8 x 0.5kg, heat sealed, gas flushed bag yellow" (count wording added from the Pack Size cell, user's choice); Storage "Store chilled"; Shelf Life "P+9 days, D+7 days" as extracted; ingredients from the declaration box;
no Allergen note. Costed per KG, so no EACH-weight question. Verified live, archived, used in 2 recipes.


### 2026-10-08 — 106141 RM Beansprouts uploaded (spec has no Fibre row)
File `106141 (106420) Beansprouts - RM Spec - V4 (22.1.2025).xlsx`. The extractor first refused it: the nutrition sheet has no Fibre row at all (it lists polyunsaturates, monounsaturates, starch and sodium but never fibre). User: leave Fibre as it is (live 0),
so it was extracted with `--allow-blank-nutrition fibre`; Fibre is not written and not in the archive (reapply leaves it alone). Every field confirmed by click: 133 kJ / 32 kcal, fat 0.5, sat 0.1, carb 4, sugars 2.2, protein 2, salt 0.01 (sodium row reads 0.005);
no allergens ticked (only Vegetable = Yes, "Beansprouts"); the Sulphites row (No) has the supplier comment "Please see attached allergen" with no attachment: user chose NO note; Pack Size 350 + g (cell "350g");
Pack Format "FOOD GRADE/CONTACT PRIMARY LDPE 4 pack inner dimensions = L24 W22 H4 (cm). 5G HEAT SEALED" (tidied of stray tabs/spaces; spec row 4-a); Storage "Between 2°c and 5°c" and Shelf Life "5 days D+2 into customer (3 days)" as extracted; ingredients "Beansprouts".
Costed per KG so no EACH question. Verified live, archived, used in 9 recipes. Next in the queue: 106568 Red Jalapeno Sriracha Mayo, then 106615 Portobello Mushroom.


### 2026-10-08 — 106568 Sauce AAK Red Jalapeno Sriracha Mayonnaise Bottle uploaded (saturated fat blank in the spec)
File `106568 Red Jalapeno Sriracha Mayonnaise RM Spec V6 (01.09.2026).xlsx`. The extractor first refused it: the "of which saturate fat" row exists but is blank. User: leave Saturates as it is (live 0), extracted with `--allow-blank-nutrition sat`
(saturates not written, not in the archive). The per-pack column on the spec's nutrition sheet is nonsense (e.g. kcal 15515) and was ignored; per-100g values used (macros agree: 4x0.8 + 4x12 + 9x36 = 375 vs 376 kcal).
Every field confirmed by click: 1552 kJ / 376 kcal, fat 36, carb 12, sugars 10, fibre 0.8, protein 0.8, salt 2.3; no allergens ticked (no EU-14 row Yes; vegetable/fruit/yeast/alcohol rows Yes with cross-contamination N/A) and no allergen note;
Pack Size 1 + kg (cell "6 x 1kg"); Pack Format "6 x 1kg, 1 litre bottle with screw on cap, with induction heat seal, tamper evident film inside cap." (count added from the Pack Size cell, user's choice);
Storage "Chilled storage"; Shelf Life "90 days / Minimum shelf life on delivery 68 days" (spec row 5-a reads "90 days & 68 days"); ingredients: the full declaration box text (user asked to see it in full before confirming; question text was shortened with "..." the first time, which is not to be done again).
Name mismatch confirmed (spec "Red Jalapeno Sriracha Mayonnaise" vs live "Sauce AAK Red Jalapeno Sriracha Mayonnaise Bottle"). Costed per KG. "Shelf life once opened: 7 days, chilled" is on the spec but has no field. Verified live, archived, used in 12 recipes.
Next in the queue: 106615 Portobello Mushroom. LESSON: never abbreviate a list with "..." in a confirmation question; show the whole text.


### 2026-10-08 — 106615 IQF Sliced Portobello Mushroom uploaded (fibre blank in the spec)
File `106615 (106709)-Portobello Mushroom- RM Spec- V5, 04.09.2026.xlsx`. The extractor first refused it: the Fibre row exists but is blank. User: leave Fibre as it is (live 0), extracted with `--allow-blank-nutrition fibre` (fibre not written, not in the archive).
The kcal sanity warning (kcal 14 vs 4/4/9 macro sum 11.7) is explained by the missing fibre and agrees with the kJ (57 / 4.184 = 13.6); the user confirmed the values as stated. Nutrition values on the spec carry "g" suffixes (e.g. "0.1g"), read correctly.
Every field confirmed by click: 57 kJ / 14 kcal, fat 0.1, sat 0.0, carb 0.4, sugars 0.2, protein 2.3, salt 0.015 (sodium 6 mg); no allergens (every row No, no comments), no note; Pack Size 10 + kg (cell "10kg");
Pack Format "Blue Liner" (the only text in spec row 4-a); Storage "Keep Frozen -18 or colder" and Shelf Life "24 months, 12 months minimum on delivery" as extracted; ingredients "Portabello Mushroom" (the spec's spelling).
Name mismatch confirmed (spec "IQF Portobello Mushroom" vs live "IQF Sliced Portobello Mushroom"). Costed per KG. "Once opened: until end of life if stored correctly" is on the spec but has no field. Verified live, archived, used in 22 recipes.
Queue after the 2026-10-08 folder check is now empty except the held 106439 Broccoli (on the issues list).


### 2026-10-08 — 104630 Chilli Powder - California Reaper uploaded (no Fibre row, Salt "No Data" derived from sodium)
File `104630 Carolina Reaper Chilli Powder V5 101024.xlsx` (spec code cell 104630, alt 105085 = the recipe). The extractor first refused it: no Fibre row at all, and Salt reads "No Data". User: Fibre stays as it is (live 0), extracted with `--allow-blank-nutrition fibre,salt`;
Salt derived by the user's choice from the spec's own Sodium 91 mg per 100g: 0.091 g x 2.5 = 0.2275 g (the `--derive-salt-from-sodium` flag does NOT handle a "No Data" cell, so the value was set in the extraction JSON after the user approved it).
kcal sanity warning (324 vs macro sum 374) explained by the missing fibre; the kJ agrees (1356 / 4.184 = 324); source on the spec is US FDC reference data (theoretical).
Every field confirmed by click: 1356 kJ / 324 kcal, fat 5.81, sat 0.813, carb 69.86, sugars 41.06, protein 10.58, salt 0.2275 (derived); no allergens ticked (every row No with comment "NA"; Fruit = Yes "Main Ingredient", not an EU-14 allergen), no note;
Pack Size 1 + kg (cell "1 KG"); Pack Format "1kg Ziplock and heat sealed Plastic Pouch"; Storage "Cool (5 to 25°C), dry (<50% RH), away from direct heat or light" (tidied from "Cool (5 to 25oC) dry (<50% RH) and away from direct heat or light");
Shelf Life "24 Months from DOM" as extracted; ingredients "Carolina Reaper Chilli (Capsicum Chinense)". Name mismatch confirmed (spec "Carolina Reaper Chilli Powder" vs live "Chilli Powder - California Reaper", live name unchanged).
Costed per KG, £82.40. Verified live, archived. Used in 108 recipes. NOTE: the extractor now prints every allergen "NA" comment as a warning, which is very noisy on specs like this; consider hiding plain "NA" comments (not changed).


### 2026-10-08 — 106610 Ramen Broth Vegatable with Boosted Unami uploaded
File `106610 (106706) - UK12797 Umami Vegan Ramen Paste - RM Spec V6 (27.02.2026).xlsx` (spec title "UMAMI VEGAN RAMEN BROTH", code 106610, alt 106706 = recipe "CPU RM Vegan Ramen stock", whose cost 8.94196 equals the live item's).
Extracted cleanly with warnings. kcal sanity warning (180.6 vs macro sum 148): the kJ agrees (766.4 / 4.184 = 183); user confirmed as stated. Every field confirmed by click: 766.4 kJ / 180.6 kcal, fat 0.4, sat 0.1, carb 27.9, sugars 13.8, fibre 1.3, protein 8.2, salt 17.4;
no allergens ticked (no EU-14 row Yes; vegetable/fruit/seed/yeast/maize rows Yes with "Refer to section 3"; nuts/peanuts/sesame No with comment "Not used on site", user chose NO note); Pack Size 4 + kg (cell "4kg");
Pack Format "4kg pail with lid" (weight wording added, user's choice; spec says "Pail, lid"); Storage "Ambient"; Shelf Life "365 Days (12 Months), min 273 days to customer"; ingredients from the declaration box with stray spaces tidied (double spaces and spaces before commas) and shown in full before confirming.
Name mismatch confirmed (spec "UMAMI VEGAN RAMEN BROTH" vs live "Ramen Broth Vegatable with Boosted Unami", live name unchanged). Costed per KG. Verified live, archived, used in 22 recipes.


### 2026-10-08 — 106227 RM Yellow pepper sliced 7cmx1cm Pack 5KG uploaded (no Fibre row; first spec with a "proposed allergen note" confirmed)
File `106227 (105565) Yellow pepper sliced 7cmx1cm - RM Spec-V1.xlsx` (title "Yellow Pepper Sliced 70mm x 10mm", code 106227, alt 105565 = recipe). The extractor first refused it: no Fibre row. User: Fibre stays as it is (live 0), extracted with `--allow-blank-nutrition fibre` (not written, not archived).
Every field confirmed by click: 65 kJ / 15 kcal, fat 0.4, sat 0.1, carb 2.6, sugars 2.4, protein 0.8, salt 0.001; Pack Size 5 + kg (cell "5 kg"); Pack Format "5kg blue food grade bag" (weight wording added, user's choice; spec says "Blue Food Grade Bag");
Storage "Chilled (1 - 5 C)" (extra space removed); Shelf Life "DOP (Date of Production) + 02 days" as extracted; ingredients "Pepper Yellow 100%". ALLERGENS: none ticked. The Celery row answers contains No, comment "Celery", cross-contamination "Yes, but controlled":
per the rule this stays a No and the user chose the note: "Supplier: cross-contamination risk (declared not contained): Celery. Supplier answer: Yes, but controlled." (the extractor's proposed note plus the supplier's answer), saved in Allergen notes.
Name check confirmed (spec "Yellow Pepper Sliced 70mm x 10mm" vs live "RM Yellow pepper sliced 7cmx1cm Pack 5KG", same size written differently; live name unchanged). Costed per KG. Verified live, archived. Queue after this: 106281 Green Beans (new file, folder check 40).


### 2026-10-08 — 106281 RM IQF 1" Cut Green Beans Yearsley Case uploaded (fibre blank in the spec)
File `106281 (106146)- Green Beans- RM Spec 26.08.2026.xlsx` (title "Green beans 26mm", code 106281, alt 106146 = recipe). The extractor first refused it: the Fibre row exists but is blank. User: Fibre stays as it is (live 0), extracted with `--allow-blank-nutrition fibre` (not written, not archived).
The kcal sanity warning (33 vs macro sum 23.7) is explained by the blank fibre; kJ agrees (136 / 4.184 = 32.5). Every field confirmed by click: 136 kJ / 33 kcal, fat 0.1, sat 0.1, carb 3.7, sugars 1, protein 2, salt 0.03;
Pack Size 10 + kg (cell "1x10kg"); Pack Format "1x10kg, blue food grade liner" (count wording added, user's choice; spec says "Blue food grade liner"); Storage "Store at -18°C or colder" as extracted; Shelf Life "24 months"; ingredients "Green beans" (the user chose this over the spec's "Frozen cut beans 26mm");
no allergens ticked (only Vegetable = Yes, "Product is a vegetable"; no cross-contamination answers), no note. Name confirmed (spec "Green beans 26mm" vs live "RM IQF 1" Cut Green Beans Yearsley Case", 26 mm is about 1 inch; live name unchanged). Costed per KG. Verified live, archived.
Folder check 40 queue is now empty.


### 2026-10-08 — 106210 RM Pork Neck Slice uploaded (old .xls, blank code cells, no Fibre row, storage temperature set by the user)
File `106210 (105010)- Frozen pork neck sliced 3.5mm- RM Spec- V1.xls` — an OLD .xls format the extractor cannot read. It was converted by Excel (COM, SaveAs .xlsx) from a COPY in `%LOCALAPPDATA%\Temp\xlsconv\` (the original was not touched) and extracted from the copy;
the archive's `sourceFile` points at the original .xls. (No xlrd / LibreOffice on this PC. To avoid this next time, ask for specs in .xlsx.) The spec's Product Code cell is BLANK on the manufacturer sheet and "0" on every other sheet; the code appears only in the file name,
so it was extracted with `--override-code 106210` after the user confirmed ("Yes, it is 106210"). Also no Fibre row: Fibre stays as it is (live 0), `--allow-blank-nutrition fibre`.
Every field confirmed by click: 553 kJ / 132 kcal, fat 4.06, sat 1.25, carb 0.1, sugars 0.1, protein 22.4, salt 0.12; no allergens (only Animal = Yes, "Pork"), no note; Pack Size 5 + kg (cell "4x5kg"); Pack Format "4x5kg, plastic" (count added, user's choice; spec says "Plastic");
ingredients "Pork Neck"; name accepted (spec "Pork neck slice 2cm x 2cm" / "Pork neck slice 3.5mm (2cm x 2cm)" vs live "RM Pork Neck Slice", live name unchanged).
STORAGE / SHELF LIFE (user decision, differs from the spec text): the spec's storage cell reads "<-8oC" (superscript "o" = degree sign, i.e. below -8°C); shelf life from manufacturer "28 days"; transport "-2°C to +8°C"; once opened "0°C to 6°C - 3 days"; the file name says "Frozen".
The user first asked for "-18", then (seeing the transport/once-opened temperatures that suggest a chilled product) chose the exact text: Storage "-8°C", Shelf Life "28 days". The frozen vs chilled question is NOT settled; recorded in SPEC-ISSUES-TO-REVIEW.md to confirm with the supplier.
Costed per KG, £5.76. Verified live, archived.


### 2026-10-08 — 106136 RM Breadcrumbs Panko 14Mm Yellow Yutaka uploaded (no Fibre row; gluten ticked, soya note)
File `106136 (105021) - 14mm Panko Breadcrumb Wasabi RM Spec V9 (07.02.2025).xlsx` (title "Yutaka Frozen Breadcrumbs 14mm Yellow 10kg", code 106136, alt 105021 = recipe). The extractor first refused it: no Fibre row. User: Fibre stays as it is (live 0), `--allow-blank-nutrition fibre`.
(The file was briefly locked in Excel mid-way; nothing was written until it was closed and re-read.) Every field confirmed by click: 1528 kJ / 364 kcal, fat 3.2, sat 1, carb 72, sugars 3.2, protein 11.8, salt 1.4;
ALLERGENS: Cereals containing gluten ticked (wheat and gluten-level rows Yes, "wheat"); Soya row is No with supplier comment "E306 is exempt based on FIR reg" -> stays No, recorded as the Allergen note "Soya: E306 is exempt based on FIR reg (supplier)." (user's choice);
Pack Size 10 + kg (cell "10kg"); Pack Format "10kg plastic bag" (weight added, user's choice; spec says "Plastic bag."); Storage "Keep frozen -18°C" as extracted; Shelf Life "18 months / Minimum shelf life on delivery 90 days" (spec "18 months  / minimum shelf life on delivery : 90 days");
ingredients from the declaration box, double space tidied: "Wheat flour (Gluten)95.5%, Vegetable Oil (Palm Oil, Antioxidant : Tocopherol), Salt, Yeast, Colour :Red Paprika.". Name accepted (words in a different order; live name unchanged). Costed per KG, £3.69. Verified live, archived, used in 4 recipes.


### 2026-10-08 — 105962 (CPU Only) RM Yakitori Sauce Kikkoman uploaded (no Fibre row)
File `Yakitori Sauce -B7174 105962 (105566) - RM Spec V3 (18.07.2023).xlsx` (title "Yakitori Sauce", code 105962, alt 105566 = recipe, supplier code B7174). The extractor first refused it: no Fibre row. User: Fibre stays as it is (live 0), `--allow-blank-nutrition fibre` (not written, not archived).
Every field confirmed by click: 862 kJ / 203 kcal, fat 0, sat 0, carb 42, sugars 39, protein 5.1, salt 5.9 (fat and saturates equal the live 0, so no change shown); allergens Cereals containing gluten, Soya, Sulphur dioxide (wheat, soya, sulphite rows Yes: soy sauce, wine "contains SULPHUR DIOXIDE"), no cross-contamination answers, no note;
Pack Size 975 + ml (cell "975ml"); Pack Format "975ml PET bottle" as extracted; Storage "Store in a cool, dry place away from direct sunlight." and Shelf Life "24 months" as extracted; ingredients (declaration box): "Soy sauce (Water, SOYBEANS, WHEAT, Salt), Sugar, Water, Wine (contains SULPHUR DIOXIDE), Spirit vinegar, Molasses, Modified starch, Spices, Yeast extract.".
Name accepted (spec "Yakitori Sauce" vs live "(CPU Only) RM Yakitori Sauce Kikkoman", live name unchanged). Costed per L (£5.47), no EACH question. Verified live, archived, used in 1 recipe.


### 2026-10-08 — 106765 Seaweed Wakame Salad Frozen Bag uploaded
File `106765 (105815) - Seaweed salad.RM Spec V3 (06.11.2024).xlsx` (title "Frozen Seasoned Seaweed Salad", code 106765, alt 105815 = recipe). Extracted cleanly with warnings. Every field confirmed by click: 438 kJ / 105 kcal, fat 3.01, sat 0.479, carb 16.5, sugars 9.2, fibre 3.4, protein 1.14, salt 2.26;
allergens: Sesame ticked (sesame row Yes: "Sesame seeds, oil"; vegetable, seed and yeast rows Yes but not EU-14; no cross-contamination answers), no note; Pack Size 1 + kg (cell "12/1kg");
Pack Format "12/1kg, transparent plastic pouch" (count added and the spec's typo "plasic" corrected, user's choice); Storage "Keep under -18°C" (spec uses the single ℃ symbol); Shelf Life "24 months from Manufacturer; 20 - 6 months shelf-life on delivery" exactly as extracted (the "20 - 6" looks like a spec typo; user kept it as read);
ingredients without the leading word "Ingredients:": "Wakame Seaweed, Cane sugar, Rice vinegar (Water, Rice, Koji), Sesame oil, White Sesame seeds, Chilli pepper, Yeast extract". Name accepted (spec "Frozen Seasoned Seaweed Salad" vs live "Seaweed Wakame Salad Frozen Bag", live name unchanged). Costed per KG. Verified live, archived, used in 4 recipes.
Earlier in this check: 106155 rapeseed oil held (stale code cells; see issues list). Queue: 107138 Korean style pork ribs.


### 2026-10-08 — 107138 RM Pork Cooked Korean Riblets Frozen uploaded
File `107138 Korean style pork ribs Wasabi RM Spec V1 (16.12.2024).xlsx` (title "Korean style pork ribs", code 107138, no alt code). Extracted cleanly with warnings. Every field confirmed by click: 1048.4 kJ / 252.3 kcal, fat 18.3, sat 7.73, carb 3.56, sugars 3, fibre 1.73, protein 17.47, salt 0.84 (macros agree with the kcal);
no allergens ticked (no EU-14 row Yes; Animal "pork ribs", Vegetable "spices, onion, garlic...", Maize "Maize Starch" rows Yes but not EU-14; no cross-contamination answers), no note; Pack Size 1 + kg (cell "1 kg"); Pack Format "Sous-vide bag in primary box" as extracted;
Storage "Keep frozen at -18°C or colder" (stray space before the degree sign removed); Shelf Life "18 months / Minimum shelf life on delivery 12 months" (spec: "Total Shelf Life 18 months; Shelf Life on Delivery 12 months");
ingredients (declaration box) "Pork Ribs (85%), Water, Gochujang Seasoning (Glucose Syrup, Sugar, Spices (Dried Onion, Dried Garlic, Cayenne Pepper, Cumin, Oregano), Maize Starch, Salt, Yeast Extract, Preservative (Sodium Diacetate E262ii), Paprika Extract), Salt.".
Name accepted (spec "Korean style pork ribs" vs live "RM Pork Cooked Korean Riblets Frozen", live name unchanged). Costed per KG. Verified live, archived. Folder check 47 queue is now empty (106155 rapeseed oil held on the issues list).


### 2026-10-08 — 106229 RM Diced Yellow pepper 20mmx20mm PACK 5KG uploaded (two pack sizes on the spec)
File `106229 Yellow Pepper Diced 20mm RM Spec V3 (26.08.2026).xlsx` (title "Yellow Pepper Diced 20mm", code 106229, no alt). Extracted with warnings. The Pack Size cell reads "5kg, 10kg" (two sizes): the extractor left it unsplit; user chose Pack Size 5 + kg (matches the item name "PACK 5KG"),
set in the extraction JSON (packSize "5 kg", number 5, unit kg), and Pack Format "5kg or 10kg blue food grade bag" so the 10kg size is still recorded. Every field confirmed by click: 96 kJ / 23 kcal, fat 0.2, sat 0.0, carb 4.6, sugars 4.4, fibre 2.2, protein 0.8, salt 0.0025;
no allergens ticked (every row No; the Celery and Sulphites rows carry the generic comment "Handle in the Factory. Allergen cross contamination is controlled through allergen handling procedurs and annual testing", no cross-contamination Yes; user chose NO note);
Storage "Chilled (0 - 5 C)" and Shelf Life "Date of Production + 5 days, Delivery + 4 days" as extracted; ingredients "Yellow Pepper (100%)" (declaration box EMPTY, taken from the ingredient table, confirmed by the user). Name accepted (spec "Yellow Pepper Diced 20mm" vs live "RM Diced Yellow pepper 20mmx20mm PACK 5KG", live name unchanged).
Costed per KG. Verified live, archived, used in 60 recipes.
Also this turn: 107252 RM Twinings Pure Green Tea added to the issues list as "no spec found" (the only tea with a spec is the matcha 107427; teas 107253 and 107254 also have no spec).


### 2026-10-08 — 107496 RM Potato Puffs - Pre-fried - frozen uploaded (the paused 120087 Lamb Weston spec; resolved)
File `120087 Spec Lamb Weston Potato Puff s 10x1Kg V1 (signed) (1).xlsx` (a second copy of the "(signed)" file that was paused on 2026-10 earlier; extraction identical). The spec's own Product Code cell reads 120087 on every sheet (the manufacturer's code), no live item has it; the user confirmed it is
107496 ("Yes, it is 107496") and it was extracted with `--override-code 107496`. This resolves the "120087 / 107496" issue-list entry. Every field confirmed by click: 654 kJ / 156 kcal, fat 7.1, sat 0.67, carb 20, sugars 0.5, fibre 2.6, protein 1.9, salt 0.9;
no allergens (no EU-14 row Yes, no comments, no cross-contamination answers), no note; Pack Size 1 + kg (cell "10x1kg"); Pack Format "10x1kg, food grade vertical form sealed plastic bag" (count added, user's choice); Storage "Frozen, max -18°C" (spec: "frozen max -18c");
Shelf Life "548 days / Minimum shelf life on delivery 365 days" (spec: "548 min 365 days from delivery"); ingredients with the spec's broken words and a missing space tidied ("sunfl ower", "fl akes", "Dextrose,Flavouring"): "Potatoes (82%), Vegetable oils (rapeseed, sunflower, in varying proportions), Potato starch, Onion, Potato flakes, Salt, Dextrose, Flavouring (Onion extract), Spice.".
Name and supplier accepted (spec "Lamb Weston Potato Puff s 10x1Kg" vs live "RM Potato Puffs - Pre-fried - frozen", supplier Fresh Direct (UK) Ltd; live name and supplier unchanged). Costed per KG. Verified live, archived. Queue: the TS FOC2000 chocolate spec (likely 107465 RM Hot Chocolate).


### 2026-10-08 — 107465 RM Hot Chocolate uploaded BY HAND (supplier-format spec, not our template; tables are pictures)
File `TS FOC2000 FLOW Original Choc 2kg Spec_Feb25 (1).xlsx` (Selva Logistics / Blendsmiths "FLOW Original Chocolate Blend 2kg", supplier code F054, Issue 2, 18 Feb 2025; its name has no ingredient code). It has a single sheet ("Sheet1"), so `spec-extract.py` refuses it (no Ingredient & Recipe,
Nutrition or Intolerance sheet). The nutrition table (image8, rows 60-68) and the allergen table (image7, row 81) are PICTURES inside the file (extracted from the xlsx zip with Python; copies sent to the user to check). The upload was therefore built BY HAND, not by the script:
an extraction JSON was written with the values the user confirmed by click; the ingredients and storage text were copied programmatically from cells D13 and A86 (not retyped); `spec-apply.js` still diffed, wrote and verified; the archive carries a warning saying so.
Code 107465 supplied by the user (live item: supplier Unique Drinks Ltd t/a Blendsmiths, £16.22/KG). Values (per 100g, read from the nutrition picture): 1622 kJ / 385 kcal, fat 6.1, sat 3.8, carb 71, sugars 68, polyols 0.0 (not stored), fibre 7.2, protein 6.8, salt 0.54 (macros plus fibre agree: ~380 kcal calculated).
Allergens from the picture: Milk only (the Whey Powder row is red under Milk/Dairy; every other column green; "trace in supplier food chain" and "present on supplier site" all green). Pack Size 2 + kg (spec: "Product Weight 2000g pouch"); Pack Format "2000g pouch" (spec gives no material; primary pack weighs 20g);
Storage "Cool dry storage in original closed packaging protected from dust, moisture, light and extremes of temperature and humidity."; Shelf Life "18 months from production / 75% remaining life into customer haulier" (spec: "Shelf life +18 calendar months from day of production. 75% remaining life into customer nominated haulier.");
ingredients "Granulated White Sugar, Cocoa Powder (26%), Sweet Whey Powder (Milk), Natural Flavouring, Anti-caking Agent: Silicone Dioxide, Salt." (spec's own spelling). Verified live, archived, used in 4 recipes.
LESSON: supplier-format specs are not extractable by the script; if images hold the data, extract the images from the xlsx zip, show them to the user, build the JSON from confirmed values, and flag it as MANUAL in the warnings and this log.


### 2026-10-08 — 106502 RM Starch Karage Breader Newly Weds Foods MK2 uploaded (salt contradiction on the spec, left unwritten)
File `106502 (106518) starch karaage breader spec V3 (10.10.2025).xlsx` (title "STARCH KARAGE BREADER MK 2", code 106502, alt 106518 = recipe, supplier Newly Weds Foods). Extracted cleanly with warnings. SALT CONTRADICTION on the spec: the Salt cell reads 0, its source note reads "Salt as NaCl: 15.63g/100g", and the Sodium cell reads 359.8
(labelled "g" in the cell, but only plausible as mg; 359.8 mg x 2.5 = 0.8995 g salt). Three different answers: the user chose to LEAVE SALT AS IT IS (live 0) and flag it, so salt was removed from the extraction (not written, not archived). Flagged in SPEC-ISSUES-TO-REVIEW.md.
Every other field confirmed by click: 1500 kJ / 353 kcal, fat 1.0, sat 0.3, carb 81.5, sugars 1.0, fibre 1.4, protein 3.9 (macros agree: ~351 kcal calculated); no allergens ticked (wheat, barley, gluten-level rows No; potato starch and rapeseed oil rows are not EU-14);
Allergen note (user's choice, because the Gluten-level row answers No with the supplier comment "Not tested"): "Gluten level: supplier comment 'Not tested'."; Pack Size 18 + kg (cell "18.00kg"); Pack Format "18kg Ripp n Flow blue bag" (weight added; spec "Ripp n Flow blue bag"); Storage "Ambient"; Shelf Life "12 months";
ingredients "Potato Starch, Rice Flour, Dried Potato, Tapioca Starch, Garlic Powder, Ginger, Raising Agents (E450i, E500ii)". Name accepted (spec "STARCH KARAGE BREADER MK 2" vs live "RM Starch Karage Breader Newly Weds Foods MK2", live name unchanged). Costed per KG. Verified live, archived.


### 2026-10-08 — 106957 RM Pre-mix Yakisoba Sauce (shoda) uploaded
File `106957 (107000) Yakisoba Sauce Blend RM Spec V2 -(12.01.2026).xlsx` (title "Yakisoba Sauce Blend", code 106957, alt 107000 = recipe, supplier Shoda Sauces Europe). Extracted cleanly with warnings. Every field confirmed by click: 606 kJ / 143 kcal, fat 0.1, sat 0, carb 32.2, sugars 26.7, fibre 0.2, protein 3, salt 4.83;
allergens ticked: Cereals containing gluten and Soya (wheat, gluten-level and soya rows Yes; maize "Cornflour in recipe" and alcohol rows Yes but not EU-14). ALLERGEN NOTE (the supplier's handling statements, all declared No; user chose to record it): "Supplier: handled on same line, full clean down and swabbing after each run: Fruit, Seed, Barley, Yeast, Sulphites, Sesame, Fish, Molluscs, Crustaceans, Mustard. Egg handled in the factory."
(not recorded: the rows answered "N - Not handled on site": Nuts, Peanuts, Oats, Rye, Spelt, Milk, Celery, Lupin, Cocoa). Pack Size 1000 + L (cell "1000Litre IBC"); Pack Format "1000 litre IBC" (spec says "IBC"); Storage "Store unopened in a cool dry place away from direct sunlight"; Shelf Life "12 months / minimum shelf life on delivery 9 months" as extracted;
ingredients (declaration box): "Water, sugar, soy sauce (water, soya beans, wheat, salt, alcohol (ethanol)), spirit vinegar, colour: E150a, cornflour, onion puree, molasses, mirin, MSG, salt, tamarind paste, sake, wheat flour (wheat flour, calcium carbonate, niacin, iron, folic acid, thiamin), garlic puree, ginger puree, cloves".
Name accepted (spec "Yakisoba Sauce Blend" vs live "RM Pre-mix Yakisoba Sauce (shoda)", live name unchanged). Costed per KG. Verified live, archived, used in 109 recipes (the most of any spec so far; 104630 is next with 108). Queue: 107253 Lemongrass Citrus and Ginger Tea QAS.
NOTE: this is the first spec where "handled on same line / full clean down" answers were recorded as a note; earlier specs with the same wording (see ALLERGEN-REVIEW.md) were not.


### 2026-10-08 — 107253 tea file is a Quality Attribute Sheet only (nothing uploaded)
`107253 Lemongrass Citrus and Ginger Tea QAS.xlsx`: a Raw Material Quality Attribute Sheet (appearance, flavour, aroma, texture, sign-off), not a nutrition spec; no nutrition, allergens, ingredients, pack size or shelf life, and its 5 pictures are product photos. Refused by the extractor; nothing written; recorded in SPEC-ISSUES-TO-REVIEW.md.
Also worth knowing for the future: a file named "...QAS" is a quality sheet, not the technical specification we need.


### 2026-10-08 — RULE: the three tea bags are COMPLETE with no nutrition values (user decision, like Water)
User: mark 107253 as completed, and the other teas will have no nutrition values either. Treated as finished, not missing, and EXCLUDED from the "still needs a spec" lists (with Water 103004). Nothing on the live items was changed (nutrition stays blank).
Tea bags: 107252 - RM Twinings Pure Green Tea (0.16158 EACH, supplier UCC COFFEE UK LIMITED); 107253 - RM English Tea Lemongrass Citrus & Ginger Organic Tea (0.1156 EACH, supplier UCC COFFEE UK LIMITED); 107254 - RM English Tea (0.11903 EACH, supplier UCC COFFEE UK LIMITED).
The tea with a real spec stays as uploaded: 107427 Matcha Green Tea Powder. When regenerating the lists, exclude codes 103004, 107252, 107253, 107254. They are costed per EACH; the EACH weight question (is one EACH one tea bag?) is not asked for them unless the user raises it.


### 2026-10-08 — 107495 RM Baked Beans uploaded (blank code cell, code from the file name)
File `107495<non-breaking space>Baked Beans in tomato sauce V1 04.11.2025.xlsx` (the file name has a NON-BREAKING SPACE after the code, which broke path matching in my shell; opened by its exact name in Python). The spec's Product Code cell is BLANK on the manufacturer sheet and "0" elsewhere; the code appears only in the file name, so it was extracted with
`--override-code 107495` after the user confirmed ("Yes, it is 107495"). Spec product "Baked Beans in tomato sauce 6X840G Royal Crown" (case size 6x840g); live item "RM Baked Beans", supplier Kiril Mischeff Limited, £1.131/KG.
Every field confirmed by click: 338 kJ / 80 kcal, fat 0.5, sat 0.1, carb 14, sugars 4.1, fibre 3.4, protein 3.6, salt 0.4 (macros plus fibre agree); no allergens (Vegetable "Harricot Beans, Onin powder" and Fruit "Tomatoes" rows Yes but not EU-14; no cross-contamination answers), no note;
Pack Size 840 + g (cell "Case size is 6x840g", one can is 840 g); Pack Format "6x840g, metal can" (case wording added; spec "Metal Can"); Storage "Store unopened can in a cool dry place" (full stop dropped); Shelf Life "24 months / Minimum shelf life on delivery 6 months" (spec: "24 months from manufacture 6 months minimum shelf life on delivery");
ingredients with line breaks tidied: "Haricot beans (44%), Water, Tomatoes (27%), Sugar, Modified Maize Starch, Glucose-Fructose Syrup, Salt, Onion Powder, Paprika Powder, Flavouring, Paprika Extract". Name accepted (live name unchanged). Costed per KG. Verified live, archived.


### 2026-10-08 — 107319 RM Chicken breast boneless & skinless IQF Defrosted uploaded (partial nutrition: five values blank in the spec)
File `107319 IQF Chicken Fillet without inner fillets RM Spec V1.xlsx` (spec product "Calibrted Fillet Without Inner Calibreted (210-230g)", code 107319, no alt; live supplier Matthews Meats Limited, £4.68/KG). The extractor first refused it: saturates, carbohydrate, sugars, fibre and salt are BLANK in the spec (only energy, fat and protein are given).
User: write only what is stated; the five blanks stay as they are (live 0), extracted with `--allow-blank-nutrition sat,carb,sugar,fibre,salt` (not written, not archived). So the live nutrition for this item is INCOMPLETE until the supplier gives a full table.
Energy is consistent (4x23 + 9x2 = 110 kcal; kJ 461). Name/product: the spec is a FROZEN IQF fillet but the live name says "Defrosted"; the user confirmed it is 107319 ("Yes, it is 107319"); a similar spec for 106187 (200-240g) is held on the issues list. Live name unchanged.
Every field confirmed by click: 461 kJ / 110 kcal, fat 2, protein 23; no allergens ticked (only Animal = Yes, "Chicken breast"), no note; Pack Size 10 + kg (cell "210-230g (10kg carton)": the carton weight; the extractor could not split it, set in the JSON by the user's choice);
Pack Format "10kg carton, loose packed, 30 micron liner, fillets 210-230g" (spec "10kg loose packed - 30 micron liner"); Storage "Frozen -18°C" (spec "Frozen -18c"); Shelf Life "18 months / Minimum shelf life on delivery 12 months" (spec "18 months BBD - 12 month MLOD (IQF)"); ingredients "Chicken breast fillet (100% Chicken)" (shortened from "Frozen broiler-chicken breast fillet without inner fillet - Calibrated 210-230g (100% Chicken)", user's choice).
Costed per KG. Verified live, archived, used in 2 recipes.


### 2026-10-08 — 102037 Salt spec held (probably 106157 RM Salt Table Tub); recorded on the issues list
New file found at folder check 57; its code 102037 matches no live item but its supplier (JJ Food Service Ltd) is the supplier of 106157. Not applied; see SPEC-ISSUES-TO-REVIEW.md.


### 2026-10-08 — 107049 RM Miso Caramel uploaded (stray name in one sheet's code cell; energy inconsistent on the spec)
File `107049 Miso Caramel Sauce  RM Spec- V2 (11.12.2024).xlsx` (saved again 2026-10-08 16:25; product "SAU7046 Miso Caramel", supplier Beacon Foods Ltd, live item "RM Miso Caramel", £6.02/KG). It was refused earlier because the Nutrition sheet's Product Code cell holds the product name "SAU7046 Miso Caramel" instead of a code, while the other 11 sheets read 107049.
User confirmed it is 107049, extracted with `--confirm-cross-sheet-mismatch`. ENERGY INCONSISTENT ON THE SPEC: 1624.61 kJ is about 388 kcal and the macros give about 384 kcal, but the spec says 348.91 kcal; the user chose to write it AS THE SPEC STATES (kJ 1624.61, kcal 348.91), so the live kcal is probably ~39 kcal low. To correct later: kcal 388 (kJ / 4.184).
Every field confirmed by click: fat 8.54, sat 6.68, carb 74.23, sugars 69.62, fibre 0, protein 2.47, salt 2.2. ALLERGENS: Soya ticked (Yes, "Soya used within the Miso Paste"); Sulphur dioxide NOT ticked: the row answers Yes but the supplier comment says "<10ppm Sulphur Dioxide present within the Sugar and Cornflour; theoretical level in finished product <10ppm" (below the declaration threshold), user's choice.
Allergen note written: "Sulphur dioxide: <10ppm present within the Sugar and Cornflour, theoretical level in finished product <10ppm (supplier), not ticked. Handled on site: milk, honey, waxed fruit, fruit, yeast, maize, cocoa, mustard; gluten handled on site <20ppm. Nut and sesame free site.".
Pack Size 500 + g (cell "500gram", which the extractor could not split; set in the JSON); Pack Format "500g clear food grade PET/PE-EVOH-PE heat sealed co-extruded multi-layered bag"; Storage "Chilled 0-5°C" (spec "Chilled 0'C - 5'C"); Shelf Life "Date of production + 60 days / Minimum life on delivery: production + 45 days including day of delivery";
ingredients exactly as in the declaration box (with its percentages, whitespace normalised). Name accepted (live name unchanged). Costed per KG. Verified live, archived, used in 1 recipe.


### 2026-10-09 — Local dev copy (Supabase dev database) brought up to date, at the user's request ("push to dev too")
"Dev" = the local copy: page at localhost:5005 (the repo's own files, nothing to push) and backend at localhost:5055, which talks to the Supabase dev database and applies pending migrations when it starts. The user chose "Yes, update the dev database". I could not read the dev database first (the scoop `psql` shim will not start on this PC, no Python/Node database driver, and the Pi was offline),
so the pending set was unknown; I told the user "up to 3 empty columns", which was WRONG: SIX migrations were pending and ran (the log `devbackend.log` shows "Applying migration" for each, no errors, then "Application started"): AddIngredientPackFormatAndStorageConditions, AddIngredientPackSize, AddIngredientIngredientsList, AddIngredientShelfLife,
AddIngredientPackSizeParts, AddIngredientAllergenNotes (new nullable/default columns only: pack_format, storage_conditions, pack_size, ingredients_list, shelf_life, pack_size_value, pack_size_unit, allergen_notes; no existing data changed). The backend was started with `dotnet run --no-launch-profile --urls http://localhost:5055` and has since stopped (the app was closed); no dev process is left running.
The dev database holds NO spec data: the spec uploads only ever went to the Pi's database. If the dev copy should have the same data, that needs a separate decision (e.g. `spec-reapply-all.js` against the dev API, once its codes exist there). The Pi itself was unreachable on 2026-10-09 (HTTP 000, ssh timeout).


### 2026-10-09 — Dry run of `spec-reapply-all.js` against the local dev copy (nothing written)
The dev backend listens on **http://localhost:5001** (not 5055: a config setting overrides `--urls`), and needs `NUTRICOST_AUTH_MODE=disabled` (the launch profile sets it; `--no-launch-profile` does not) or every call returns 401. Start: `cd backend; NUTRICOST_AUTH_MODE=disabled dotnet run --no-launch-profile` (migrations apply automatically on start).
A first read once failed with "System.InvalidOperationException ... transient failure" (cloud database hiccup); a retry worked. Dev database: 465 ingredients (the Pi has 404), 58 with nutrition, none duplicated by code.
Dry run (`NUTRICOST_API_BASE=http://localhost:5001 node scripts/spec-reapply-all.js`, output `.scan/dev_reapply_dryrun.txt`): 174 archives, 174 matched by code, 0 already up to date, 174 would be applied, 0 unmatched, 0 failed. Dev names equal the archive names for all 174; none of the 174 dev ingredients has nutrition yet, so nothing would be overwritten.
Fields it would write (counts): kj 173, kcal 173, fat 144, sat 116, carb 165, sugar 148, protein 165, fibre 109, salt 155, allergens 77, packSize 172, packFormat 168, storageConditions 174, shelfLife 173, ingredientsList 172, packSizeValue/Unit 155, unitWeightG 10, allergenNotes 6. The real run needs the user's specific approval. The dev backend was stopped afterwards.


### 2026-10-09 — Spec data APPLIED to the local dev copy (Supabase dev database), user approved ("Yes, apply to dev")
Run: dev backend started with `NUTRICOST_AUTH_MODE=disabled dotnet run --no-launch-profile` (listens on http://localhost:5001), then `NUTRICOST_API_BASE=http://localhost:5001 node scripts/spec-reapply-all.js --apply`. First pass: 171 applied, 3 failed with the cloud database's "transient failure" (HTTP 500); a second pass (the script only writes what still differs) applied the last 3.
Verified: a fresh dry run reports 174 archives, 174 matched, 174 already up to date, 0 to apply, 0 failed. Before/after comparison of all 465 dev ingredients: exactly 174 changed, all of them in the archive codes, none outside; ingredients with nutrition went 58 -> 231; spot checks (107495, 106957, 104630) equal their archives. Each changed dev ingredient got a version-history comment "Reapplied from spec-data archive: <file>".
The Pi live site was not touched (it was unreachable that day). The dev backend was stopped afterwards. Outputs (local only): `.scan/dev_reapply_dryrun*.txt`, `.scan/dev_reapply_apply*.txt`, `.scan/dev_reapply_verify.txt`.
LIMITS: the dev copy holds only what the 174 archives carry (not the values left unwritten on purpose, e.g. the blank fibre/saturates/salt cases, 107319's five blanks, 106502's salt, nor weights typed by hand), and dev was never given the held specs (list A) because they are not in `spec-data/`. New uploads go to the Pi first; to keep dev in step, re-run this reapply against dev after a batch.


### 2026-10-09 — Search fix: words in any order are found, best order ranked first (dev copy only; NOT deployed to the Pi)
Problem found with "spring onion" / "onion spring": `searchWordsMatch` already matched words in any order and scored exact phrase 2, in-order 1, out-of-order 0, but every caller starts its best-match reduce from { match:false, score:0 } and keeps the earlier value on a tie, so an out-of-order match (score 0) was DROPPED. Typing "spring onion" therefore missed the ingredient "RM Onion Spring Sliced 500G"
(the same pattern is in six search spots: the recipe ingredient box, Ingredient Centre, recipe lists). Fix A (one line in `searchWordsMatch`, app.js): the out-of-order score is now 0.5. Fix B (recipe ingredient box only): sub-recipes and ingredients are now ranked together by score (stable sort, so sub-recipes stay first on ties) instead of always listing sub-recipes first.
Tested in the real page against the dev copy (http://localhost:5055): "spring onion" -> BCP Spring Onion Salad (exact order) then RM Onion Spring Sliced 500G (before: ingredient missing); "onion spring" -> RM Onion Spring Sliced 500G first, then BCP Spring Onion Salad; "spring" unchanged. Spelling stays strict (no fuzzy matching: "spring onions" still finds nothing).
Known, not changed: a name match and a supplier/tag/category match score the same ("spring" lists the matcha tea through its supplier "Clearspring Ltd."); ranking name matches above other fields would be a further step. Page cache tag is now `app.js?v=20261009-search-order`. The Pi was offline, so this is on the dev copy and GitHub only; the Pi needs the two page files (index.html, app.js) copied across when it is back, with a rollback copy.


### 2026-10-09 — Search ranking by field: name/code above supplier/tags/category (dev copy only; NOT deployed to the Pi)
User: "name should match higher than supplier but supplier should come up still". New helper `tierScore(r, tier)` in app.js: a match in the name, code or alternate codes is tier 2 (score +20), a match only in tags, category or supplier is tier 1 (score +10); lower-tier matches are still returned, just lower. Within a tier the order is unchanged (exact phrase, words in order, words in another order).
Applied where fields are combined: the recipe ingredient box (ingredients and sub-recipes, on one scale so the merged list stays consistent), the Ingredient Centre search, the single-ingredient recipe list and the recipe search. Cache tag now `app.js?v=20261009-search-tiers`.
Tested in the real page against the dev copy (http://localhost:5055): "spring" lists the four name matches first, then the matcha tea (found only via its supplier "Clearspring Ltd.") last; "Clearspring" and "matcha" still find the matcha; the code "106220" finds the onion; "spring onion" and "onion spring" behave as in the entry above. Caps are unchanged (6 ingredients + 4 sub-recipes in the recipe box), so when there are many name matches, supplier-only matches can fall below the cut.
Not deployed to the Pi (offline): copy `index.html` and `app.js` to `/opt/nutricost/` when it is back, with a rollback copy and the user's approval. Previous versions of app.js are in the Temp folder (`app.js.pre-search-fix`, `app.js.pre-tier-fix`) and in git history.

### 2026-10-12 — deployed to the Pi (production), approved by the user
- **Backup first:** `scripts/backup-full.ps1` (staged locally), dump verified (gzip ok, 404 ingredient rows, 1099 recipes), copy in `.scan/backups/nutricost-db-2026-10-12-before-additives.sql.gz`.
- **Scratch test on the Pi** (`nutricost_migtest`, port 5099, dropped afterwards): 16/17 checks passed; the 17th was my test expecting 7 columns where the table correctly has 8 (id, e_number, name, function_text, grading, notes, sort_order, declared_as). Ingredients, recipes and ingredient_versions fingerprints identical to production before and after the tests.
- **Backend:** rollback copy `/opt/nutricost/backend-previous-additive-20261012`; new program installed; migrations `AddAdditivePolicy` and `AddAdditiveDeclaredAs` applied (new empty table `additive_policy`, 8 columns, 2 migrations recorded, 0 rows). Row counts and fingerprints of ingredients, recipes and ingredient_versions identical before and after. Service active, 0 errors.
- **Page files:** rollback copy `/opt/nutricost/frontend-previous-additive-20261012` (app.js, index.html); new files copied, checksums match, live app.js serves the new code.
- **Contents:** allergen depth fix (Allergens tab, Label, Comparison), additive flags + Additive Policy page + recipe Additives tab, folder refresh/new-ingredient fixes, search ranking, 771 counts, pale red allergens, label Packaging row and Full listing. The additive list is NOT loaded in production yet (upload the Excel on the live site).
- **Rollback:** backend: stop, copy the two files back from the previous folder, start (the extra empty table is harmless to the old program); page: copy back from the frontend previous folder.


### 2026-10-09 to 2026-10-12 — FULL RECORD of everything built or decided in this stretch (added late, 2026-10-12, after the user pointed out the log was missing items)
Dev = the local copy (localhost:5055, Supabase dev DB). Pi = production (192.168.0.50). Commits: 5dc7d5f (additives, folder fixes, allergen depth), 8af45d9 (771 counts, pale red allergens), 7161c8b (label Packaging row, Full listing), 5ab320e (deploy log). Everything after that was uncommitted when this entry was written (see "State at the end of this entry").

**1. Refresh inside a project folder blanked the recipe list.** Cause: the saved "last view" (`ncLastView` in localStorage) kept the screen but not the folder (`window.currentProjectSlug`), so the list had nothing to filter on. Fix (app.js `persistLastView` / `restoreLastView`): the slug and label are saved and restored; if a saved project view has no slug it opens Projects instead. Cache tag `20261009-refresh-folder`.

**2. New Ingredient created from a folder page now stays in that folder.** User rule: folders hold new ingredients AND recipes saved there, and they still go to their libraries too. A folder only shows recipes carrying its `Project:<slug>` tag, and an ingredient has no tag, so folders hold ingredients through a ONE-LINE WRAPPER recipe (single-ingredient sub-recipe, qty 1, same name and code, `approved:false`, description "Created in a project folder"). `openNewIngredientModalForProject()` sets `window.newIngredientProjectSlug`; `saveIngredient` then creates the wrapper tagged with the folder (only for a NEW ingredient from a folder page; elsewhere nothing changes). The folder page's New Ingredient button and the empty-state "Create Ingredient" button use it. The folder's "All kinds" type filter now includes ingredient wrappers (the Finished product / Sub recipe filters still hide them; Ingredients / Packaging show them). Not tested by saving (it would write dev data).

**3. Recipe search does not list finished products (by design).** 106326 FG Wasabi Salmon Pieces 1kg is a finished product; the recipe ingredient box lists only ingredients and sub-recipes because finished products can't be components. Offered (not chosen): show them greyed "can't be added".

**4. ADDITIVE TRAFFIC LIGHTS (user request).** Source: `...\FMS System\3. Supporting Docs\Copy of TECH-PROCESS-40 Wasabi Additives Policy 281024 V1.xlsx`, sheet "V1" (header row 3: E-number, Additive Name, Function, Grading, Grading & Comments, FSA Approved, Existing, "Additives declared by E number or Name?", Health Effects, Notes). The sheet also holds meeting notes in column A; the importer keeps only rows whose first cell is an E-number (strict pattern), giving 388 rows: 178 Red, 172 Amber, 23 Green, 15 ungraded.
User decisions: (a) ingredients only for now; (b) recipes get NO colour; (c) bubbles like the allergen bubbles, in the ingredient window directly BELOW the allergens; the bubble shows the E-number and hovering shows the additive name (plus grading and comment); (d) ungraded additives show a GREY bubble; (e) E170 appears twice (Green as a colour, Amber as "Other") and BOTH bubbles show; (f) an Ingredient Centre filter (all / any / red / amber / green / ungraded / none); (g) the list is uploaded from Excel on the site.
How matching works (app.js, nothing is stored on the ingredient): the ingredient's legal declaration text (`ingredientsList`) is read each time. E-numbers are matched in many spellings (E 450, E450(i), E160(c), E450i); a declaration with just "E450" matches all sub-rows but is shown as ONE bubble per colour (names listed on hover). Names are matched ONLY through the sheet's own "declared as" column (69 rows), NOT the long descriptive names: matching those caused false flags (dried seaweed flagged red E407a, shichimi flagged E110 from "orange peel"). Offline test on dev: 50 of 410 ingredients flagged.
Backend: table `additive_policy` (id, e_number, name, function_text, grading, notes, declared_as, sort_order); migrations `20261009132513_AddAdditivePolicy` and `20261009132924_AddAdditiveDeclaredAs` (the second was a separate approval after the first); `GET /api/additives`, `PUT /api/additives` (replaces the whole list in one transaction; grading normalised to Green/Amber/Red/blank; an empty list is refused with 400 and the old list kept). Test scripts in `.scan/tools/`: `pi_api_tests_additive.py`, `pi_run_tests_additive.sh`, `pi_cleanup_additive.sh`, `pi_deploy_additive.sh`, `pi_check_cols_additive.sh`.
Upload: "Upload additive list" button (Ingredient Centre header and the Additive Policy page); reads the sheet with columns E-number + Grading (+ name, function, comments, "declared by"); a confirm box shows the counts before replacing.
**Additive Policy page:** top-bar tab "Additive Policy" between Projects and Return to Wasabi Functions; table of the list with search and grading filter, count "N of M additives", upload button. It does NOT show the sheet's Health Effects or "Used in (RMs & Recipes)" columns (not stored; would need another approved database column).
**Recipe "Additives" tab** (between Allergens and Costing): summary bubbles (red first) plus a table of every flagged ingredient with a "Via" path through the sub-recipes; walks ALL sub-recipe levels with a loop guard; says so when no list is loaded.
**Reload bug (fixed 2026-10-12):** after a refresh the page reopens on the last screen BEFORE the additive list has loaded and nothing redrew it, so the Additive Policy screen looked blank (the data was never lost: 388 rows on both dev and Pi). `loadAdditivePolicy` now redraws the policy screen, the ingredient bubbles and the open recipe's Additives tab when the list arrives, reloads on opening the Additive Policy screen, and keeps the current list if a load fails. Tag `20261012-additive-reload`.

**5. ALLERGEN DEPTH BUG (safety) fixed.** `getAllergensFromRecipeItem` only looked one sub-recipe level down, so on dev 550 of 810 recipes showed fewer allergens than their ingredients carry (e.g. 100670 Sweet Chilli Chicken MX missing gluten and soya). It now walks every level with a loop guard. Used by: the recipe Allergens tab and matrix, the Label tab "Allergens: Contains ..." line and the bold allergen words in its ingredient list, and the Comparison view's allergen list (which previously read only direct ingredients). NOT yet checked for the same one-level gap: Reports & Labels, exports, any other screen that lists allergens (OPEN: needs a check). Nothing stored changed, display only.

**6. Display changes.** (a) Ingredient Centre sidebar badge and dashboard count now show ingredients + single-ingredient wrapper recipes (771 on dev) regardless of filters; the list label reads "618 of 771 ingredients" when filters hide some. (b) A ticked allergen in the ingredient window gets a pale red label (#fde8e8 / border #f2b8b5 / text #b42318). (c) Label tab: packaging is listed on its own "Packaging:" row below Ingredients, WITHOUT percentages, and ONLY packaging that sits directly in the recipe's own lines (directly or through a one-line wrapper); packaging deeper in sub-recipes is not listed (user: "packaging is only the top level... not the bag the ingredients were packed in"). (d) Label "Ingredients:" has a small dropdown Top level / Full listing: Full listing replaces the line with every base ingredient in the whole recipe, duplicates merged, largest first, percentages = share of the whole recipe by weight (ignores yield/scrap in sub-recipes); an ingredient that has its own declaration shows blue (dotted underline); clicking it expands "(its declaration)" in place; opened it turns grey, bold, no underline; the choice and the expansions reset on reload. (e) Rows of the Allergen Matrix are clickable: an ingredient or wrapper opens the ingredient window, a real sub-recipe opens that recipe on its Allergens tab (unsaved-changes prompt respected). (f) The Additives tables are not clickable yet.

**7. Source line ("Source: <spec file>") in the ingredient window.** The line shows the comment of a version; the spec upload scripts (spec-apply.js, spec-reapply-all.js, field-fix-apply.js) write the spec file name as the version comment. Findings on the Pi (404 ingredients): 144 have a spec file name on some version; 30 were loaded from a spec but NO version carries a spec file name (their archives' `sourceFile` is "baseline snapshot from live DB"; the real files exist in the folder and were found by code in the 2026-10-07 review; 107320 is one: its versions say only "Shelf-life backfill"); 230 have no spec at all (nothing to record, and a source must never be invented); 91 have the spec name only on an OLDER version because later saves created comment-less versions (the pack-size scripts `packsize-fix-apply.js` and `packsize-parts-backfill.js` do not set a comment; manual edits don't either). The page used to read only the NEWEST version, hiding the name.
CHANGE DEPLOYED to the Pi 2026-10-12 (page files only, tag `20261012-source-line`, rollback `/opt/nutricost/frontend-previous-source-20261012`): the line shows the most recent version that has ANY comment, labelled "(vN)" when it is not the newest. KNOWN WEAKNESS: that picks any comment (e.g. "Shelf-life backfill"), not specifically a spec file name.
OPEN: (i) prefer the latest comment that names a spec file (.xlsx/.xls); (ii) for the 30: find each real file name in the folder, show the list to the user and, if approved, record it; (iii) the 91: copy the spec comment onto the latest version (needs approval and a backup); (iv) make the pack-size and field-fix scripts carry the previous spec comment forward (script change, needs approval). The user asked (2026-10-12) that every BASE-LEVEL ingredient has its spec source; wrappers/recipes are out of scope; the 230 with no spec cannot have one.

**8. Deploys to the Pi (production) on 2026-10-12, each approved by the user.** (a) Backend + pages: backup first (`scripts/backup-full.ps1`, 404 ingredients, 1099 recipes, copy in `.scan/backups/nutricost-db-2026-10-12-before-additives.sql.gz`, OneDrive copy NOT made), scratch-copy test (16/17: the failing check was my wrong expected column count; the table has 8 columns), backend rollback `/opt/nutricost/backend-previous-additive-20261012`, pages rollback `/opt/nutricost/frontend-previous-additive-20261012`. (b) Page files only: allergen-matrix click + additive reload fix, rollback `/opt/nutricost/frontend-previous-additive-fix-20261012`. (c) Page files only: Source line, rollback `/opt/nutricost/frontend-previous-source-20261012`. After each: Pi checksums match local, live app.js contains the new code, additive_policy rows unchanged (388). The live page's version tag could not be read without signing in. The user uploaded the additive Excel on the live site (388 rows on the Pi).

**9. Rules and instructions from the user in this stretch (also in the START HERE box).** Rules must be recorded in this file and stay true; the user has said this several times: record EVERYTHING so work can be resumed. Today only the Pi/production is worked on, not dev (2026-10-12). The Pi is production and Supabase is dev. For the Source work: base-level ingredients only, and read ALL the markdown files before starting. The dev copy still has the older page; a dev backend background task may still be running on this PC.

**10. Small facts worth keeping.** The browser tool's `top` is a built-in window variable (don't name a test variable `top`). A very long heredoc into the shell failed once; write long text with the file tool, then append. `git commit`/`git push` only when the user says so. On dev the Ingredient Centre list adds 305 wrapper recipes to 466 ingredient records. Page cache tags used: 20261009-refresh-folder, -folder-ingredient, -additives, -additive-page, -recipe-additives, -allergen-depth, -allergen-depth2, -ing-count, -allergen-red, -label-packaging, -full-listing (1 to 4), 20261012-allergen-click, -additive-reload, -source-line.

**State at the end of this entry:** GitHub has everything up to 5ab320e. Uncommitted: the allergen-matrix click, the additive reload fix, the Source line change, and the edits to this file; the page changes ARE live on the Pi. Still open: items 5 (other allergen screens), 7 (source work), 6f, and the user's decisions above.


### 2026-10-12 — Source work for BASE-LEVEL ingredients on the Pi: all markdown files read, 30 files matched (nothing written yet)
**Ask (user):** make sure every base-level ingredient in the database shows its spec source, base level only, read ALL the md files first, work on the Pi/production only today.
**Done:** read every md file in the repo (SPEC-EXTRACTION, SPEC-ISSUES-TO-REVIEW, ALLERGEN-REVIEW, ALLERGEN-THRESHOLDS, ACCURACY-SCAN, COST-DATA-RULES, DEV-OPS, PI-CONNECTION, PI-RUNBOOK, SAVE-AND-DEPLOY, BACKUP, BACKEND-MIGRATION-NOTES, START-SERVER) before starting. Facts that shape this work: the assistant cannot sign in (the comment API needs the user's session), a source must never be invented, every live write needs its own approval with before/after, lists are script-printed, the 2026-09-29 backfill of the same kind located real file names by matching the CODE against the current folder listing.
**Finding (read-only, script `.scan/tools/source_map.py`, output `.scan/source_plan_30.json`, Pi data in `%TEMP%\pi_latest.txt`):** of 404 Pi ingredients, 144 have a spec file name on some version, 230 have no spec at all, and 30 were loaded from a spec but no version carries a spec file name. All 30 match EXACTLY ONE file each in the Ingredient Specs folder by code (no ambiguity, none missing): 100681, 103895, 104634, 105950, 106006, 106127, 106128, 106131, 106142, 106160, 106161, 106166, 106167, 106169, 106170, 106190, 106202, 106208, 106243, 106251, 106317, 106438, 106579, 106955, 107168, 107170, 107320, 107330, 107497, 107685. CAVEAT: the matched file is the one in the folder NOW; the version originally used for the upload cannot be proven (older uploads had no filename kept), same limitation as the 2026-09-29 backfill.
**Not done / awaiting approval:** (A) page: prefer the latest comment that names a spec file; (B) write "Spec upload: <file>" onto the latest version of the 30 (if that version already has a note, keep it and append " | Source spec: <file>"); (C) for the 97 whose spec name is only on an older version, copy it onto the latest version; (D) make the pack-size and field-fix scripts carry the previous spec comment forward; (E) optionally show "No specification on file" for the 230. Environment: Pi. Git: nothing changed in code yet.


### 2026-10-12 — SOURCE LINE: 30 spec file names written to the live Pi (user-approved), ROOT CAUSE of the miss, and safeguards still to approve
**Ask (user):** every base-level ingredient should show its spec source on the "Source:" line of the ingredient window ("the spec name would save on that info page, like we agreed"); then "how did this miss happen, find out why and ensure when we extract NOTHING can be missed"; and "record all this in md file for future ai".

**How the approval went (keep for the next AI).** I asked for approval of "notes" and the user thought I meant the ALLERGEN NOTES box (under the Fruit/Veg/Nut tick box). They are different: the Source line is filled from the COMMENT saved on a version in the ingredient's version history (table `ingredient_versions`, column `comment`); the Allergen notes box is the ingredient's own `allergen_notes` field and was not touched. RULE: never say just "note"; say "Source line comment (version history)" or "Allergen notes box". The user also insisted the exact text be shown before approval and asked to click Yes/No per item; four per-item prompts were then dismissed (the batch of four was probably the problem), after the misunderstanding was cleared the user chose "save all spec file names for all these now" (all 30 in one go). All 30 exact texts had been shown in full first.

**What was written (Pi, production, 2026-10-12):** the latest version of 30 ingredients got the spec file name in its comment: 16 had no comment and now read `Spec upload: <file>`; 14 already had a comment which was kept word for word with ` | Source spec: <file>` appended. Codes: 100681, 103895, 104634, 105950, 106006, 106127, 106128, 106131, 106142, 106160, 106161, 106166, 106167, 106169, 106170, 106190, 106202, 106208, 106243, 106251, 106317, 106438, 106579, 106955, 107168, 107170, 107320, 107330, 107497, 107685. The file for each was matched by CODE in the Ingredient Specs folder (exactly one file each, `.scan/tools/source_map.py` -> `.scan/source_plan_30.json`); caveat: it is the file in the folder now, the version originally used cannot be proven. Exact before/after texts: `.scan/source_notes_plan.json` (the "now" values are the rollback).
**How:** fresh backup first (`.scan/backups/nutricost-db-2026-10-12-before-source-notes.sql.gz`, gzip ok, 404 ingredient rows); guarded SQL generated by `.scan/tools/source_notes_make_sql.py` (`.scan/source_notes_write.sql`: each UPDATE only touches the latest version row whose comment still equals the recorded "now" text, one transaction, aborts unless exactly 30 rows change); run on the Pi with `.scan/tools/pi_apply_source_notes.sh` (the harmless psql warnings "transaction already in progress / none in progress" are because the file has its own BEGIN/COMMIT as well as `-1`). A direct database write was used because the assistant cannot sign in to use the comment API (same method as the 2026-09-29 backfill).
**Verified:** ingredients fingerprint IDENTICAL before/after, recipes IDENTICAL, ingredient_versions IDENTICAL in every column except `comment`, version count unchanged (3213), service active; then the 30 comments were read back from the Pi and compared with the approved texts: 30 of 30 exactly as approved. Ingredients with a spec file name on their LATEST version: 47 -> 77. NOT changed: the `sourceFile` inside the 30 archives in `spec-data/` (they still say "baseline snapshot from live DB"); nothing in git yet.

**ROOT CAUSE — why the spec name was missing (found by reading the data and the scripts).**
1. The 30 came from the 2026-09-29 `spec-snapshot-baseline.js` rebuild: their original extraction files were gone, so the archives recorded `sourceFile` = "baseline snapshot from live DB" and the version-history backfill that day wrote the placeholder comment "Spec-uploaded nutrition/allergen/pack data (source spec filename not recoverable...)" instead of a file name. The real files were found by code in the 2026-10-07 review, but that was logged only as housekeeping ("could be corrected") with no owner or trigger, so it was never done.
2. The later backfills of 2026-09-29 (ingredients list, shelf life) wrote comments describing the ACTION but not the file; `packsize-fix-apply.js` (47 + 114 values) and `packsize-parts-backfill.js` (131) create new versions with NO comment at all; manual edits in the app do the same. The page showed only the NEWEST version's comment, so each of these hid the spec name that was on an older version (91 ingredients, fixed for display on 2026-10-12, data still on the older version).
3. `spec-apply.js` line ~296-299 sets the comment with a fire-and-forget `curl` after the verification step: the response is never checked, and the comment is NOT verified (verification covers fields only). If the save made no new version, the comment call overwrites the PRIOR version's comment (the code comment calling this "a harmless no-op" is wrong). `spec-reapply-all.js` has the same pattern.
4. Nothing audits the result: no script checks that every spec-loaded ingredient shows its spec file, that archives hold a real file name, or that every file in the folder has been processed.
5. Process: housekeeping items were written as "could be corrected" in a long log with no checklist and no end-of-task check (the user's repeated request to record everything).

**SAFEGUARDS PROPOSED — NONE APPROVED OR BUILT YET (each needs its own approval, they change script behaviour or the database):**
S1. `spec-apply.js` and `spec-reapply-all.js`: check the comment call's response, re-fetch the versions and FAIL LOUDLY unless the latest version's comment names the spec file; never overwrite an existing comment (append instead); refuse to archive a `sourceFile` that is "baseline snapshot".
S2. `packsize-fix-apply.js`, `packsize-parts-backfill.js`, `field-fix-apply.js` and any future script that writes: carry the previous spec-file comment forward on the new version.
S3. A read-only completeness audit script (e.g. `scripts/spec-audit.js`) run after every upload batch and before every deploy, output pasted to the user, non-zero on any gap: (a) every ingredient with spec data has a spec file name on its LATEST version; (b) every archive has a real source file that exists in the folder; (c) every archive value equals live except fields deliberately left unwritten (those recorded with a reason); (d) every spec file in the folder is matched to an ingredient and processed (whole-folder cross-check); (e) every question on each spec that has an answer but no field in NutriCost (shelf life once opened, etc., see the 2026-10-07 "never extracted" audit) is LISTED at confirmation so nothing is silently dropped.
S4 (strongest, a database change): store the spec source on the ingredient itself (new column, full runbook: backup, scratch test, deploy) so it can never be hidden or overwritten by version comments.
Also open: (i) the page still shows the latest comment of ANY kind; change it to prefer the latest comment naming a spec file (page only, not approved); (ii) optionally copy the spec name onto the latest version of the 97 whose spec name is only on an older version (needs a list and approval); (iii) fix the 30 archives' `sourceFile` (spec-data change, approval); (iv) optional "No specification on file" text for the 230 with no spec.
**Environment:** Pi (production) for the write; nothing on dev. **Git:** the new files in `.scan/` are local only; this log edit and the earlier md edits are uncommitted.


### 2026-10-12 — S3 AUDIT SCRIPT BUILT (read-only) and its first results; are all ingredients showing their spec file name? (answer: NO, 138 of 174)
**Ask (user):** safeguard S3 chosen first ("S3 audit script"); asked what "spec answers" means (explained: questions on a supplier spec that have an answer but no field in NutriCost, e.g. "shelf life once opened"); then "so now are all the ingredients showing their spec file name?".
**Built:** `scripts/spec-audit.py` (NOT committed yet). READ-ONLY: it only runs SELECTs on the Pi over ssh and reads `spec-data/` and the spec files; exit code 1 on any gap in A-D. Run: `python -I scripts/spec-audit.py` (add `--left-behind` for check E on every archived spec, or `--spec "<file>"` for one spec at the confirmation step). Checks: A every spec-loaded ingredient shows a spec file name on its LATEST version; B every archive names a real file that exists in the folder; C archive values equal live; D every file in the folder is archived, named by an archive, or on the issues list; E answers that have no field in NutriCost are LISTED (never stored). Gotchas fixed while building: the remote script must be sent as BYTES (Python text mode on Windows turns newlines into CR+LF and the Pi's bash fails); stdout must be UTF-8 (spec names contain non-cp1252 characters); never edit the file with `sed` (it mangled `\r`). Check E has NOT been run yet.
**First run on the Pi (after the 30 notes were written):** A = 97 spec-loaded ingredients whose latest version has no spec file name (they were 127 before the 30 were written); B = 32 archives that do not name a real existing file (the 30 baseline ones, plus 106188 and 107501 whose archives point at a Temp copy); C = 0 (every archived value equals live); D = 2 files not accounted for: `106209 (105904) - Diced Carrot 10mm ... V8` (the delisted spec the user told us to ignore on 2026-09-28) and `TS FOC2000 FLOW Original Choc 2kg Spec_Feb25.xlsx` (the un-"(1)" copy of the chocolate spec that was uploaded by hand as 107465). Both are known; the script has no "known exceptions" list yet.
**What the ingredient window shows today (Pi), for the 174 spec-loaded ingredients:** 77 show the spec file name on the latest version; 61 show it from an older version labelled "(vN)" (the deployed page change); 36 show a DIFFERENT comment (not the spec name) because the page picks the latest comment of ANY kind: 103489 103889 105241 105970 106003 106041 106102 106130 106132 106139 106163 106174 106193 106196 106206 106214 106217 106218 106219 106220 106222 106223 106226 106228 106234 106238 106255 106444 106581 106959 106961 107172 107313 107390 107427 107498. So 138 of 174 show it, 36 do not. The other 230 ingredients have no spec, so there is nothing to show (not invented). The fix for the 36 is the page change "prefer the latest comment that names a spec file" (awaiting approval; page files only).
**Still open / awaiting approval:** that page change; S1+S2 (script fixes), S4 (database field), fixing the 32 archives' `sourceFile`, copying the spec name onto the latest version of the 97, a known-exceptions list for check D, running check E.


### 2026-10-12 — Source line now prefers the spec file name: deployed to the Pi (page files only, user approved "Yes")
**Ask (user):** "all you are doing is making this correct, nothing more nothing less": every spec-loaded ingredient must show its spec file name on the Source line. The user's screenshot of 107320 still showed "(v3) Shelf-life backfill": checked, the database was already right (107320 v5 = `Spec upload: 107320 (P00049) Shitake Mushrooms 31.03.2025  V5, 24.01.2025.xlsx`, the versions endpoint returns every comment, no caching), so the screenshot came from a page loaded before the write; the user was told to refresh (Ctrl+F5).
**Change:** `latestIngredientVersionComment()` in app.js now picks the most recent comment that NAMES A SPEC FILE (matches `.xlsx`/`.xls`), and only falls back to the most recent comment of any kind when no version names a spec file; it is still labelled "(vN)" when the comment is not on the newest version. Display only, no data change. This makes the 36 ingredients that showed another note (list in the entry above) show their spec file name; after the 30 writes every one of the 174 spec-loaded ingredients has a spec file name on some version, so all 174 now show it. The 230 ingredients with no spec show nothing (a source is never invented).
**Deploy (Pi, production):** live files were byte-identical to my previous deploy before overwriting (checksums 104f723fbc9dd4b7 / 64d5dd73ceec742a); rollback copy `/opt/nutricost/frontend-previous-source-spec-first-20261012`; new files copied (tag `20261012-source-spec-first`): app.js 0157cf1ba2fcf64f, index.html 6cff4f87856ab3b8 on both the PC and the Pi; the live app.js contains the new code; service active.
**NOT tested on screen** (the assistant cannot sign in): the user must refresh and open e.g. 106102 (should read "Source (v2): Spec upload: ...xlsx" instead of "Weight per each set...") and 107320. **Git:** app.js and index.html changed locally, NOT committed; `scripts/spec-audit.py` and this log also uncommitted.
**User instruction right after:** "now ensure all future will capture this" = make sure every future extraction/upload records the spec file name and can never lose it (safeguards S1 and S2, below in the earlier entry); awaiting a specific approval for the exact script changes.


### 2026-10-12 — SAFEGUARDS S1 + S2 BUILT: every future write records, carries forward and verifies the spec file name (user approved "Yes, build it"); nothing else changed
**Ask (user):** "now ensure all future will capture this"; then "now when it works and changed NOTHING we didn't want it to change" (= after building, PROVE nothing else changed). Approved by click: change the five scripts so every future write records, carries forward and verifies the spec file name; no live data or archive changed.
**Built (all local, NOT committed, nothing run against the live Pi):**
- NEW `scripts/lib/spec-source.js`, used by all five scripts. `ensureSpecSource()`: reads the ingredient's versions; if the LATEST version's comment already names the given spec file (or, with no file given, any spec file) it does nothing; otherwise it adds the file name WITHOUT overwriting (empty comment -> `<label>: <file>`; existing comment kept word for word + ` | Source spec: <file>`; a newer spec file for the same ingredient is appended and the old name kept); with no file given it carries forward the last spec file recorded on any earlier version; it then RE-READS the versions and verifies; on any failure it returns not-ok (`SOURCE NOT RECORDED`, exit code 1). `isRealSpecFileName()` refuses placeholders ("baseline snapshot"), paths and non-.xlsx/.xls names. `appendNote()` adds a human "why" note to the latest version without overwriting.
- `spec-apply.js`: (1) a guard BEFORE any write refuses unless `sourceFile` is a real file name that exists in the Ingredient Specs folder (`SPEC_FOLDER` env, default the OneDrive path); the exception flag is `--allow-unlisted-source` (only after a person confirms); dry runs are unaffected (the guard sits after the dry-run exit); (2) the old unchecked comment call (which overwrote the previous version's comment when no new version was created) is replaced by `ensureSpecSourceOrExit`.
- `spec-reapply-all.js`: same replacement (label "Reapplied from spec-data archive"); an archive whose sourceFile is not a real file name (the 32 listed in audit check B) now carries forward the last recorded file, or reports SOURCE NOT RECORDED and a summary line with the count; exit code non-zero.
- `field-fix-apply.js`: its "why" comment no longer overwrites the latest comment (uses `appendNote`), then the spec file is carried forward and verified.
- `packsize-fix-apply.js` and `packsize-parts-backfill.js`: after each successful PUT the last recorded spec file is carried forward and verified; a failure is added to their failure list.
**Tested (offline, writes nothing):** `node scripts/test-spec-source.js` = 14 tests pass against a pretend version server, including: empty -> set, existing note kept + appended, already recorded -> no write, carry-forward, newer file appended, no file known -> FAILS and writes nothing, placeholder/path names refused, comment call error -> FAILS, write that did not land -> FAILS, and after EVERY run an assertion that nothing but the latest version's comment can change (same version count, older versions byte-identical, no other field changed). `node --check` passes on all five scripts and the library.
**Proof that nothing else changed:** `git diff` of the five scripts = 43 lines added, 14 removed; the ONLY removed lines are the old comment code (the unchecked `curl` comment posts and their temp-file handling in spec-apply.js and spec-reapply-all.js, the `latestversion-comment` post in field-fix-apply.js, and the one-line `ok++` branch in packsize-parts-backfill.js, which was kept inside the new block). No other file in the repo was touched by this work except the new library, its test and `scripts/spec-audit.py`.
**NOT tested:** the scripts' live paths (no sign-in, no live writes by rule); the first real upload after this must be watched: expect a line `SOURCE RECORDED (set|appended|already): <file>` after every write and `REFUSED ... not a real spec file` only for a bad source.
**New process rule (also in the START HERE box):** after every upload batch run `python -I scripts/spec-audit.py` and paste the result to the user before saying "done"; after ANY change, prove what did NOT change (diff of removed lines, before/after fingerprints, a read-back) and say so.
**Still open:** the 32 archives whose `sourceFile` is not a real file (audit check B) need correcting (spec-data change, needs approval); S4 (a dedicated database field) not started; check E of the audit not yet run; a "known exceptions" list for audit check D (2 known files); everything is uncommitted.


### 2026-10-12 — ALLERGEN FULL REVIEW requested (all specs vs the live Pi): script built, report in progress
**Ask (user):** "review all specs vs their uploads and confirm that all the allergens and allergen comments are correctly inputted into the site, check the comments on the allergen we discussed in relation to whether the allergens do or don't need to be declared, and on the same line look at allergen comments etc and report back your findings for all ingredients."
**Method (READ-ONLY, nothing on the site is changed):** new script `scripts/allergen-review.py` (uncommitted when this was written): reads the live ingredients' allergen ticks and Allergen notes from the Pi with SELECTs over ssh, finds each ingredient's spec file (the archive's recorded file, else the folder file matched by code; may be a newer version than the one uploaded), reads EVERY EU allergen row of the spec with all three answer columns ("Product contains?", "Risk of cross contamination?", the supplier comment), and compares with the site. Output: `ALLERGEN-FULL-REVIEW.md` (script-generated). Sections: A ticks that differ from the spec; B rows answered Yes with an exemption/threshold comment (needs the user's decision each time, shows whether ticked and whether the note box mentions it); C rows declared No but cross-contamination Yes (belongs in Allergen notes); D rows declared No with a handling/threshold/may-contain comment; E odd or blank answers; F ingredients with no spec but allergen ticks; unreadable specs; clean list. Decisions already made by the user are annotated (106153, 106955, 107049, 106136, 107247, 106957, 105951, 106161) so they are not reported as new.
**Rules applied:** a tick means the product CONTAINS it; cross-contamination / handled or used on site / below ppm on a No row stays No and goes in the Allergen notes box; a Yes row with an exemption or threshold comment is never automatic; only sulphites has a numeric threshold (10 mg/kg or mg/L as SO2), the other 13 have none (ALLERGEN-THRESHOLDS.md). Wheat/oat/rye/spelt/barley/gluten-level rows map to Cereals containing gluten.
**Status when written:** the run opens about 174 workbooks from OneDrive and takes several minutes (it moved to the background). Results and the user's decisions will be appended below.


### 2026-10-12 — RULE (user): when an allergen answer on a spec does not agree with the site, the declaration or another row, ASK THE USER (clickable prompt), never decide silently
**User instruction (2026-10-12, during the allergen review):** "in that instance, you ask the user - record that rule". The instance: spec allergen answers that conflict with something else (e.g. 107489 Poached Egg: the site ticks Eggs but the spec's egg row says nothing; 106168 Veggie Oyster Sauce: the Barley row says Yes ("Barley Malt Extract in recipe") but the Gluten-level row says No with "<20ppm"; a Yes row with an exemption comment; declaration words with no tick).
**The rule:** at EXTRACTION and at REVIEW time, whenever (a) the spec's "Product contains?" answers disagree with what is ticked on the site, (b) an allergen word appears in the ingredient declaration but the allergen is not ticked (or a tick has no matching word), (c) rows on the same spec contradict each other (e.g. barley Yes, gluten level No), (d) a Yes row carries an exemption or threshold comment, (e) a row is blank, odd, or not a plain Yes/No, or (f) a cross-contamination / handled-on-site / below-ppm / may-contain comment exists: STOP and ask the user, one clickable prompt per ingredient (product code and name first, the spec's exact words, what the site has), and record only what the user confirms. Never resolve these by judgement, never by keyword guessing, never "because the supplier says so". The assistant gives no legal advice: it quotes the spec and ALLERGEN-THRESHOLDS.md (only sulphites has a numeric declaration threshold, 10 mg/kg; the other 13 have none; "<20ppm" for gluten is the gluten-free CLAIM limit, not an exemption from declaring).
**To build (NOT approved or built yet):** make `spec-extract.py` run the declaration-vs-ticks word check and the row-contradiction check and print each hit as a mandatory warning that blocks `--apply` until the user has answered, and add the same checks to `scripts/allergen-review.py` (already has C, D and the tick comparison).


### 2026-10-12 — ALLERGEN FULL REVIEW: results (read-only; nothing on the site changed) and bugs found in my own review script
**Ask (user):** review all specs vs their uploads, confirm allergens and allergen comments are correctly on the site, check the declare/don't-declare comments, report findings for all ingredients.
**Script:** `scripts/allergen-review.py` -> `ALLERGEN-FULL-REVIEW.md` (script-generated; uncommitted). Two bugs in the script found and fixed during the work, both RECORDED so they are not repeated: (1) it took the first sheet with a "Potential component" header, but in some workbooks (107489) the "Additive & GMO" sheet comes first in the tab order, giving a false "Eggs ticked but spec does not say contains": fixed by preferring the sheet NAMED "Intolerance"/"Allergen" and requiring a "Product contains?" column; (2) section B only listed Yes rows whose comment matched an exemption wording filter, which MISSED 106099 (Soya = Y, "Fully Refined Soybean oil - processing aid (not regarded as an allergen in UK and EU)"): section B now lists EVERY Yes row that has ANY comment. LESSON: never filter comments by wording when the question is "did anything get missed".
**Results of the corrected run (before the final B change):** 172 of 174 archived specs read (106210 is an old .xls, 107465 is a picture-based supplier spec built by hand: neither re-read here); ticks equal the spec's "Product contains?" for every ingredient except three DECIDED cases (106153 gluten not ticked although wheat/barley rows are Yes; 106955 Sulphur dioxide ticked on "may contain naturally occurring SO2"; 107049 Sulphur dioxide not ticked, supplier <10ppm); 0 ingredients without a spec carry allergen ticks (no leftover guessed ticks); 135 fully clean. Allergen notes exist on only 6 ingredients (106136, 106153, 106227, 106502, 106957, 107049). 18 ingredients have a cross-contamination = Yes row with NO note recorded (102052, 102058, 103487, 105950, 105971, 106127, 106138, 106162, 106163, 106174, 106208, 106211, 106217, 106238, 106317, 106363, 106438, 106834) and 11 more have a handled-on-site / below-ppm / may-contain / exemption comment on a No row with no note (102022, 103895, 106168, 106172, 106196, 106255, 106833, 106961, 107091, 107391, 107558). Backfilling notes needs the user's per-spec approval (existing rule).
**Items for the user's decision (rule: ask):** 106153 (decision conflicts with ALLERGEN-THRESHOLDS.md: gluten has no declaration threshold, 20ppm is the gluten-free CLAIM limit); 106099 Soya Y with "processing aid / not regarded as an allergen" comment, ticked; 106005 Wheat Y "Dried Glucose Syrup" (declaration has no cereal word), ticked; 103889 Barley Y "malt vinegar, <20ppm", ticked; 102664 SO2 Y "naturally present sulphites", ticked, no level; 106955 SO2 untested; 106168 Barley Y but Gluten-level N "<20ppm" (site ticks gluten); 106172 / 107391 wheat-derived glucose syrup "exempt" claims with Wheat = N (not ticked); 106196 gluten <20ppm No; 106211 Sulphites cross-contamination with comment "sodium metabisulphite"; plus the 29 note backfills above.
**Status:** the full re-run with the widened section B is in progress; the final report goes to the user next; no data was changed.

**2026-10-12 FINAL RESULT of the allergen review (corrected run, `ALLERGEN-FULL-REVIEW.md`, script `scripts/allergen-review.py`, both uncommitted):** 172 of 174 archived specs read; ticks equal the spec's "Product contains?" for every ingredient except the 3 decided cases (106153, 106955, 107049); every Yes row is ticked on the site except 106153 wheat/barley and 107049 sulphites; 0 ingredients without a spec carry ticks. Section B (Yes rows with ANY comment) = 144 rows in 76 ingredients, almost all plain "which ingredient" comments (e.g. "Wheat flour", "Soy sauce"); the ones that need the user's decision are listed in the entry above (106099, 106005, 103889, 102664, 106153, 106955, 106168). Section C: 19 ingredients (cross-contamination Yes), only 106227 has a note; section D: 14 ingredients (handling/threshold comments on No rows), 107049 and 106136 have notes, 105951 decided no note. Not read: 106210 (old .xls, checked by hand at upload), 107465 (picture-based, built by hand: Milk). Nothing was written to the site. Awaiting the user's per-ingredient decisions.

### 2026-10-12 — ALLERGEN DECISIONS taken one by one (user clicks; nothing is written to the site unless stated)
1. **106153 RM Savoury Seasoning (wheat + barley Yes, "<20ppm so no declaration required"):** user chose KEEP: nothing ticked, note kept, after being shown that ALLERGEN-THRESHOLDS.md says gluten has no declaration threshold (20ppm is the gluten-free claim limit). No change to the site; the 7 Oct decision is re-confirmed on 12 Oct.
2. **106099 RM Pumpkin Croquette (Soya Yes, comment "Fully Refined Soybean oil -processing aid (not regarded as an allergen in UK and EU)"; declaration has no soya word; gluten also ticked):** user chose UNTICK SOYA and add the supplier wording to the Allergen notes box. NOT YET WRITTEN: needs its own exact before/after approval (planned: allergens ["Cereals containing gluten","Soya"] -> ["Cereals containing gluten"]; allergen notes "" -> the supplier's soya wording).
3. **106005 RM Functional Plain Brine Newlyweds Sack (Wheat Yes, comment "Dried Glucose Syrup"; gluten-level row No "not manufactured to be gluten free"; declaration has no cereal word):** user chose KEEP gluten ticked AND record in the Allergen notes box that the spec says the wheat comes from the dried glucose syrup. NOT YET WRITTEN (needs the exact note text approved: allergen notes "" -> a note naming the dried glucose syrup as the wheat source, from the supplier spec).
4. **103889 RM Tomato Ketchup (Barley Yes, "Malt vinegar made from barley. Levels of gluten <20ppm"; declaration says "Malt Vinegar (From BARLEY)"):** user chose UNTICK gluten. NOT YET WRITTEN. SAFETY FLAG for the write approval: the ingredient's own declaration names BARLEY, ALLERGEN-THRESHOLDS.md says gluten has no declaration threshold (20ppm is the gluten-free claim limit), and a recipe/label built from this ingredient would then show no gluten even though the declaration says barley. The write must be re-confirmed with this stated, and the supplier wording recorded in the Allergen notes box.
5. **102664 RM Sauce Soy Dark (Sulphites Yes, "Naturally present sulphites", no level given):** user chose KEEP Sulphur dioxide ticked AND add a note to the Allergen notes box ("Sulphites: naturally present, no level stated (supplier spec)" proposed). NOT YET WRITTEN (exact note text needs approval).
6. **106955 RM Onion Powder (sulphites answer "product may contain naturally ocurring SO2 (not tested to verify levels)"):** user chose KEEP Sulphur dioxide ticked (precautionary) and record the spec's exact wording in the Allergen notes box. NOT YET WRITTEN (exact note text needs approval); stays on the issues list.
7. **106168 RM Oyster Sauce (Barley Yes "Barley Malt Extract in recipe"; gluten-level No "<20ppm gluten"; declaration names Barley malt extract):** user chose UNTICK gluten. NOT YET WRITTEN. SAFETY FLAG for the write approval (same as 103889): the declaration names barley malt extract; the write must be re-confirmed with that stated and the supplier wording recorded in the Allergen notes box.
**Summary of the 7 decisions (12 Oct):** 106153 no change; 106099 untick Soya + note; 106005 keep gluten + note; 103889 untick gluten + note; 102664 keep SO2 + note; 106955 keep SO2 + note; 106168 untick gluten + note. NONE written yet: each needs its own exact before/after approval, and the method must keep version history (a direct SQL edit would NOT create a version row; the app's Save, or the API through a signed-in script, does).
**Exact plan built FROM THE SPEC FILES for the 6 changes (`.scan/tools/allergen_decisions_plan.py` -> `.scan/allergen_decisions_plan.json`; nothing written):**
- 106099 RM Pumpkin Croquette: ticks [Cereals containing gluten, Soya] -> [Cereals containing gluten]; note "" -> `Soya: Fully Refined Soybean oil -processing aid (not regarded as an allergen in UK and EU) (supplier spec); Soya not ticked.`
- 106005 RM Functional Plain Brine Newlyweds Sack: ticks unchanged [Cereals containing gluten]; note "" -> `Wheat: Dried Glucose Syrup (supplier spec); the wheat comes from the dried glucose syrup.`
- 103889 RM Tomato Ketchup: ticks [Cereals containing gluten] -> [] (NO allergens left ticked although the declaration says "Malt Vinegar (From BARLEY)"); note "" -> `Barley: Malt vinegar made from barley. Levels of gluten <20ppm (supplier spec); gluten not ticked.`
- 102664 RM Sauce Soy Dark: ticks unchanged [Cereals containing gluten, Soya, Sulphur dioxide]; note "" -> `Sulphites: Naturally present sulphites (supplier spec); no level stated.`
- 106955 RM Onion Powder: ticks unchanged [Sulphur dioxide]; note "" -> `Sulphites: product may contain naturally ocurring SO2 (not tested to verify levels) (supplier spec).`
- 106168 RM Oyster Sauce: ticks [Cereals containing gluten] -> [] (NO allergens left ticked although the declaration names Barley malt extract); note "" -> `Barley: Barley Malt Extract in recipe. Gluten level: Barley malt extract. <20ppm gluten. Suitable for coeliacs, as per Regulation (EU) No. 828/ 2014 (supplier spec); gluten not ticked.`
METHOD ISSUE: writing the ticks must keep the version history (ticks are in the version snapshot). The app's Save does; the API through a signed-in script does; a direct SQL edit does NOT. field-fix-apply.js compares fields with `!==` so it cannot handle the allergens ARRAY yet (a small, approvable script change). The assistant cannot sign in (the user runs scripts/qa-login.sh).
**APPROVALS (user clicked Yes on each, 12 Oct, exact texts above/in `.scan/allergen_decisions_plan.json`):** 106099, 106005, 103889, 102664, 106955, 106168 (103889 and 106168 approved after the explicit safety note that the declaration names barley). 106153: no change. Method chosen by the user: "Script, you sign in" (extend `field-fix-apply.js` to handle the ticks list, offline test first, the user runs `scripts/qa-login.sh`, fresh backup first, verify by re-reading, prove nothing else changed). NOTHING WRITTEN YET. The script change itself still needs its own approval.
**Script change DONE (user approved) and tested offline:** `scripts/field-fix-apply.js` now compares values with `sameValue()` (JSON compare) at the refusal check and the verification, so it can handle the allergens LIST; 2 comparisons changed, 1 helper added, nothing else removed. New end-to-end offline test `scripts/test-field-fix-offline.js` (a pretend server; the real script is run against it; nothing live): dry run changes nothing; a plan whose "old" list differs from live is REFUSED and writes nothing; apply changes ONLY the planned ticks list and note on ONLY the planned ingredient, every other ingredient and every older version stays byte-identical, exactly one new version, comment = why-note + spec file carried forward. Plan file for the real run, built from the approved texts: `.scan/fix_allergen_decisions.json` (6 items). NEXT: fresh backup, the user runs `scripts/qa-login.sh`, dry run shown, then `--apply`, verify, log. Nothing written to the Pi yet. Uncommitted: field-fix-apply.js, test-field-fix-offline.js, allergen-review.py, ALLERGEN-FULL-REVIEW.md, this log.
**Backup for the allergen-decision write:** `.scan/backups/nutricost-db-2026-10-12-before-allergen-decisions.sql.gz` (gzip ok, 404 ingredient rows). Next: the user signs in with `scripts/qa-login.sh`.


### 2026-10-12 — ALLERGEN DECISIONS WRITTEN TO THE LIVE PI (6 ingredients, each approved by click, user signed in with scripts/qa-login.sh)
**Process:** the user ran `scripts/qa-login.sh` (the assistant may not sign in or use a password on the live Pi even when given one: firm rule; the user also shared a password in chat and was advised to change it). Dry run first (printed to the user: live values equalled the plan's "old" values for all 6), the user clicked "Yes, apply all 6", then `COOKIE_JAR='C:\Users\JAMESM~1\AppData\Local\Temp\qa_cookies.txt' node scripts/field-fix-apply.js .scan/fix_allergen_decisions.json --apply`. Fresh backup first: `.scan/backups/nutricost-db-2026-10-12-before-allergen-decisions.sql.gz` (gzip ok, 404 ingredient rows).
**Written (exact texts as approved):** 106099 ticks [gluten, Soya] -> [gluten], note = `Soya: Fully Refined Soybean oil -processing aid (not regarded as an allergen in UK and EU) (supplier spec); Soya not ticked.`; 106005 ticks unchanged, note = `Wheat: Dried Glucose Syrup (supplier spec); the wheat comes from the dried glucose syrup.`; 103889 ticks [gluten] -> [] (no allergen ticked), note = `Barley: Malt vinegar made from barley. Levels of gluten <20ppm (supplier spec); gluten not ticked.`; 102664 ticks unchanged, note = `Sulphites: Naturally present sulphites (supplier spec); no level stated.`; 106955 ticks unchanged, note = `Sulphites: product may contain naturally ocurring SO2 (not tested to verify levels) (supplier spec).`; 106168 ticks [gluten] -> [] (no allergen ticked), note = `Barley: Barley Malt Extract in recipe. Gluten level: Barley malt extract. <20ppm gluten. Suitable for coeliacs, as per Regulation (EU) No. 828/ 2014 (supplier spec); gluten not ticked.` 106153: no change (user re-confirmed).
**Verified:** all six PUTs returned 200; the script's re-fetch: intended fields correct, 0 other ingredients changed, 404/404; independent read-back from the Pi database: ticks and notes exactly as approved, ingredients with an Allergen note 6 -> 12. Versions: 103889, 106099 and 106168 changed ticks so a new version was created; the three note-only changes (106005, 102664, 106955) create NO new version (the allergen note is not in the version snapshot by design), so their "why" comment was APPENDED to the existing latest version's comment; every comment now also carries the spec file name (spec-source routine: SOURCE RECORDED).
**SAFETY FLAGS recorded:** 103889 and 106168 now have NO allergen ticked although their declarations name barley (the user approved after the explicit warning; ALLERGEN-THRESHOLDS.md says gluten has no declaration threshold, 20ppm is the gluten-free claim limit). Recipes and labels built from them will show no gluten from these ingredients. 106153 likewise has none ticked (user decision, re-confirmed).
**NOT done / open:** (1) the `spec-data` archives of these six still hold the OLD ticks/notes (audit check C will now show differences) so a re-apply from archive would undo this: archives need updating (needs approval, exact before/after); (2) the other allergen notes (the 29 ingredients without a note, listed in the review entry) are still to be decided one by one; (3) 106172, 107391, 106196 (wheat-derived glucose syrup "exempt" claims, wheat/gluten not ticked) and 106211 (sulphites cross-contamination with comment "sodium metabisulphite") were NOT discussed yet; (4) the automatic extraction-time allergen conflict checks (see the rule above) are designed but not built; (5) git: field-fix-apply.js, the two scripts allergen-review.py / test-field-fix-offline.js, ALLERGEN-FULL-REVIEW.md and this log are uncommitted.

### 2026-10-12 — ALLERGEN NOTES for the 28 ingredients with no note: going through them ONE BY ONE (user asked: "go through them one by one")
**What these notes are:** text for the **Allergen notes box** (the free-text box under the Fruit/Veg/Nut tick box). They hold the supplier's cross-contamination / handled-on-site / below-ppm / may-contain wording. They are NOT allergen ticks (all ticks were already correct or decided). 28 ingredients: 18 with a cross-contamination = Yes row (102052, 102058, 103487, 105950, 105971, 106127, 106138, 106162, 106163, 106174, 106208, 106211, 106217, 106238, 106317, 106363, 106438, 106834) and 10 with a handling/threshold comment on a No row (102022, 103895, 106172, 106196, 106255, 106833, 106961, 107091, 107391, 107558). (106168 got its note on 12 Oct in the decisions batch; 106227, 106136, 106153, 106502, 106957, 107049 already had notes.)
**Method:** the exact note text for each is BUILT BY SCRIPT from the spec wording (`.scan/tools/allergen_notes_plan.py` -> `.scan/allergen_notes_plan.json`; fixed a doubled full stop and run-together comments before use); one clickable prompt per ingredient (code and name first, the note in full); nothing is written until all have been answered, then: fresh backup, dry run, final go, `field-fix-apply.js` with the user signed in, verify, log. Decisions are appended below as they are given.
**Decisions so far (Allergen notes, one by one):** (1) 102052: the user asked to CONDENSE the eleven "Machines used such as products containing X" comments into one, listing the allergens once, then clicked Yes on the condensed text. (2) 102058 Yes, (3) 103487 Yes, (4) 105950: the user pointed out that the spec column is "Risk of cross contamination?" which is only a RISK, "very different to cross contaminated", and that the supplier answered N on "contains": so ALL cross-contamination notes must quote the spec's own question and show the contains answer separately. Approved wording for 105950: `Supplier spec, 'Risk of cross contamination?' = Y for: Milk. ('Product contains?' = N.) Supplier comment: may contain milk.` RULE for the wording of these notes: never write "cross-contaminated" or just "Supplier answer: Y"; quote 'Risk of cross contamination?' and 'Product contains?'. Notes 1-3 were approved in the OLD wording and are being re-asked in the new wording. NOTHING WRITTEN YET.
**Allergen-note answers so far (new wording, each clicked Yes):** 102052 (condensed comment), 102058, 103487, 105950, 105971, 106127, 106138. Remaining to ask: 106162 onwards (numbers 8 to 28 of `.scan/allergen_notes_plan.json`). Answers are also kept in `.scan/allergen_notes_decisions.json`. Nothing written yet.

### 2026-10-12 — RULE (user): CATCH "below the declarable level / no need to declare" statements, KNOW they mean no declaration is needed, but ALWAYS CHECK WITH THE USER
**Trigger:** while asking about the 106208 RM Potato Dice 10mm note I started searching the whole workbook for a sulphite level; the user said (paraphrased): "I'll just tell you: it says they are below and don't need to declare, so we need to CATCH that and know we don't need to declare, but always check with the user."
**The rule:** (1) extraction and review must CATCH every spec statement that an allergen is below the declarable level or needs no declaration ("below", "<10ppm", "<20ppm", "less than 10ppm", "not declarable", "no need to declare", "no allergen declaration required", "exempt", "not regarded as an allergen", "processing aid", "carry-over", "carryover", "trace"): search the WHOLE workbook (allergen sheet comments, additive/GMO, ingredient and process sheets), not only the allergen sheet, and show each hit to the user as "supplier says below the declarable level / no declaration needed"; (2) the assistant treats it as a strong signal that no declaration may be needed, but NEVER acts on it alone: it always asks the user with a clickable prompt before any tick, untick or note is changed, and records what the user decides; (3) never spend long searching a workbook for a figure: if it is not on the allergen row, show what was found and ask the user (the user may simply tell you what the spec says).
**106208 RM Potato Dice 10mm (open item):** site has Sulphur dioxide ticked (spec sulphites row = Yes, comment "Sodium Metabisulphite - Anti-Oxidant"); the user states the spec also says the level is below the declarable level and needs no declaration. I could not verify the wording (the spec file was locked by OneDrive at the time). PENDING: read the exact spec wording when the file unlocks, show it, and ask the user whether to untick Sulphur dioxide and what the note should say. Nothing changed. The 106208 Celery note (note 11 of 28) is asked separately.
**To build (not approved or built):** add this whole-workbook "below the declarable level / no need to declare" search to `scripts/allergen-review.py` and to `spec-extract.py` as a mandatory warning (blocks `--apply` until the user answers), together with the earlier conflict checks.
**Allergen-note answers (continued):** 106162 Yes, 106163 Yes, 106174 Yes. **106208 RM Potato Dice 10mm: APPROVED (user, 12 Oct): untick Sulphur dioxide (ticks [Sulphur dioxide] -> none) and save this note:** `Supplier spec, 'Risk of cross contamination?' = Yes, but controlled for: Celery. ('Product contains?' = N.) Supplier comment: Celery. Sulphites: spec row = Yes, comment 'Sodium Metabisulphite - Anti-Oxidant'; supplier states the level is below the declarable level and no declaration is needed (confirmed by the user 2026-10-12); Sulphur dioxide not ticked.` The user said the spec itself says the sulphites are below the declarable level so there are no sulphites to declare ("that means there are no sulphites"); I could NOT verify the exact spec wording (file locked) so the note quotes the user's statement; before the write the exact spec wording must be read and shown, and if it differs I stop and ask. NOT WRITTEN. Remaining to ask: 106211 onwards (numbers 12 to 28).
**Allergen-notes scope CHANGED by the user (12 Oct):** "any that are a no, just leave these, I only want to look at the YES with a comment for an allergen." Every note that comes from a row where the spec says 'Product contains?' = No is CANCELLED, INCLUDING the twelve already approved (102052, 102058, 103487, 105950, 105971, 106127, 106138, 106162, 106163, 106174, 106211, and the celery part of 106208). None of the 28 notes goes in the batch. Still approved: the 106208 Sulphur dioxide UNTICK with a sulphites-only note (revised text to be shown again before the write: `Sulphites: spec row = Yes, comment 'Sodium Metabisulphite - Anti-Oxidant'; supplier states the level is below the declarable level and no declaration is needed (confirmed by the user 2026-10-12); Sulphur dioxide not ticked.`). The earlier standing rule (10-07: cross-contamination / handled on site on a No row goes in the Allergen notes box) is therefore NARROWED by the user: it is no longer applied to No rows. NEXT: the Yes rows that carry a comment (144 rows in 76 ingredients, section B of ALLERGEN-FULL-REVIEW.md; most are plain "which ingredient" comments).
**Allergen tick differences from the specs: ALL APPROVED, LEFT AS THEY ARE (user, 12 Oct: "just leave them then all approved").** After the corrected review the only ingredients whose ticks differ from the spec's "Product contains?" answer are, each by the user's own decision: 106153 (wheat/barley Yes, gluten not ticked), 107049 (sulphites Yes <10ppm, SO2 not ticked), 106099 (Soya Yes, unticked 12 Oct), 103889 (barley Yes, unticked 12 Oct), 106168 (barley Yes, unticked 12 Oct), 106955 (sulphites answer neither Yes nor No, SO2 ticked), and 106208 (sulphites Yes, SO2 still ticked: the untick approved earlier was NOT written; whether it is still wanted is being confirmed). All other ingredients match their specs. The "Yes rows with a comment" list (ALLERGEN-YES-WITH-COMMENT.md, 144 rows in 76 ingredients) needs no further action: ticks were confirmed at upload and re-checked on 7 Oct. NOTHING further written to the site in this stretch beyond the six decisions already logged.
### 2026-10-12 — 106208 RM Potato Dice 10mm WRITTEN to the live Pi (user: "Still untick it", then "Yes, write it" on the final wording)
Fresh backup first (`.scan/backups/nutricost-db-2026-10-12-before-106208.sql.gz`, gzip ok, 404 ingredient rows); dry run matched; `field-fix-apply.js .scan/fix_106208.json --apply` with the user's session. Written: ticks [Sulphur dioxide] -> none; Allergen notes box null -> `Sulphites: spec row = Yes, comment 'Sodium Metabisulphite - Anti-Oxidant'; supplier states the level is below the declarable level and no declaration is needed (confirmed by the user 2026-10-12); Sulphur dioxide not ticked.` The celery cross-contamination wording was NOT saved (the user cancelled all No-row notes). Verified: PUT 200, intended fields correct, 0 other ingredients changed, 404/404, spec file name carried forward (SOURCE RECORDED); independent read-back from the Pi database matches. CAVEAT: the spec's own "below the declarable level" sentence was NOT read (the file was locked by OneDrive throughout); the note quotes the user's statement. TO DO when the file unlocks: read the exact wording and, if it differs, tell the user. SAFETY FLAG: 106208 now has no allergen ticked; its spec sulphites row says Yes.
**Allergen work of 12 Oct is now COMPLETE except:** (1) the `spec-data` archives of the SEVEN changed ingredients (106099, 106005, 103889, 102664, 106955, 106168, 106208) still hold the old ticks/notes, so a re-apply from archive would undo today's changes (needs approval with exact before/after); (2) no note was written for any No-row cross-contamination (user decision); (3) the extraction-time checks for allergen conflicts and for "below the declarable level" statements are designed but NOT built; (4) uncommitted: this log, ALLERGEN-YES-WITH-COMMENT.md.

### 2026-10-12 — spec-data ARCHIVES of the 7 changed ingredients updated (user: "fix the archives", exact before/after approved by click)
**Why:** `spec-reapply-all.js` restores every ingredient from `spec-data/<code>.json` after a wipe; the seven archives still held the OLD ticks/notes, so a restore would have undone the 12 Oct allergen decisions.
**Changed (only the keys `allergens` and `allergenNotes` in each file, texts exactly as approved and as written to the live site):** 106099 (ticks [gluten, Soya] -> [gluten], note added), 106005 (note added), 103889 (ticks [gluten] -> [], note added), 102664 (note added), 106955 (note added), 106168 (ticks [gluten] -> [], note added), 106208 (ticks [Sulphur dioxide] -> [], note added). Plan: `.scan/archive_fix_plan.json` (script-built from the files and the approved plans).
**Safety method:** the edit script first proved each file round-trips BYTE FOR BYTE (the files use CRLF line endings and no final newline; the first attempt aborted on that and wrote nothing), asserted that only the two keys differ before writing, and re-read each file afterwards.
**Proof:** `git diff --stat -- spec-data`: exactly 7 files changed; every other key in each file is identical (the only other changed lines are a trailing comma added to the line before the new key). Read-only checks against the live Pi: `scripts/spec-audit.py` check C (archive values that differ from live) = 0; `spec-reapply-all.js` dry run = 174 archives, 174 matched, 174 already up to date, would apply 0, failed 0. So a restore from the archives would now change nothing and cannot undo today's decisions.
**Environment:** local files only (git); nothing written to the Pi. **Git:** the seven archive files and this log are uncommitted.
**Still open:** (1) the 32 archives whose `sourceFile` is not a real file name (audit check B) and audit check A (93 spec-loaded ingredients whose LATEST version lacks a spec file name; older versions have it, the page shows it); (2) the extraction-time allergen conflict / "below the declarable level" checks (designed, not built); (3) the exact spec wording for 106208's "below the declarable level" has not been read (file locked).

### 2026-10-12 — 32 archive `sourceFile` entries FIXED, OneDrive backup made, and the list of base ingredients with NO spec (answer to the user's question)
**Ask (user):** "why do so many not name a file ... this was literally the first quick thing I wanted solved today", then "fix that", then "are there spec-less base ingredients? I do not think there are", and earlier "are they all backed up ... if I wiped and re-added could you re-apply all the info back?".
**Why 32 archives did not name a file:** 30 were rebuilt on 29 Sep by `spec-snapshot-baseline.js` from the LIVE data (their original extraction files had gone), so `sourceFile` = "baseline snapshot from live DB"; the real files were found by code on 7 Oct but only written down as housekeeping ("could be corrected"), never fixed; 106188 and 107501 were processed from a TEMPORARY copy of the file, so `sourceFile` held a Temp path. It never affected the values (restore still works) nor the ingredient window's Source line (which reads the version comments, done earlier today for 174 of 174).
**Fixed (user approved by click, exact list shown):** `sourceFile` set to the real file in the Ingredient Specs folder (matched by code, exactly one file each, 0 ambiguous) in the 32 `spec-data` archives. Method: `.scan/tools/archive_source_plan.py` (plan) and `archive_source_apply.py`: each file must round-trip BYTE FOR BYTE first (CRLF, no final newline, indent 2; six files store non-ASCII as \uXXXX escapes so each file keeps its own style), only the key `sourceFile` may differ, re-read afterwards; the first run aborted before writing because of the escaped-character style and was fixed. PROOF: `git diff --stat`: 32 files, 32 insertions and 32 deletions, every changed line is a `sourceFile` line; `scripts/spec-audit.py`: check B (archives not naming a real file) 32 -> 0, check C (archive vs live) still 0. Local files only; nothing written to the Pi.
**Backup:** `scripts/backup-full.ps1 -ConfirmOneDrive` (user approved): fresh dump of the Pi (read-only) + code zip copied to `...\FMS System\2. Wasabi FMS Code & Database Backups` on OneDrive: `nutricost-db-2026-10-12.sql.gz` (gzip ok, 404 ingredient rows) and `NutriCost Backup 2026-10-12.zip`. Before this the dumps existed only on this PC (`.scan/backups`, Temp).
**What a wipe + re-add would restore (answer given to the user):** via `spec-reapply-all.js` from the 174 archives (on GitHub): nutrition, allergen ticks and notes, pack size/format, storage, shelf life, ingredient declaration, weight per each (where set from a spec); dry run today: 174 matched, 174 already up to date, 0 to apply; a real wipe + reimport test was done on 29 Sep. NOT restored: the ingredients with no spec, anything typed by hand in the app (weights, edits, fruit/veg/nut ticks, cost and supplier come from the Business Central import), version history (a restore creates new versions). The full database dumps are the safety net behind that.
**Base ingredients with NO spec (script `.scan/tools/specless_base.py`, read-only):** live 404 = packaging 184 + delisted 22 + decided no-nutrition 4 (Water 103004, teas 107252-107254) + WITH a spec archive 174 + **20 base-level items with no spec and no nutrition**: (a) spec file EXISTS but held, not applied (8): 106155, 106187, 106198, 106199, 106439, 106987, 107246, 107605; (b) NO spec file found (6): 106157 Salt Table Tub, 106192 Baking Powder, 107088 Not RTE-Gyoza apple dumpling, 107346 Salt Tub, 107499 Chinese Five Spice, 107735 IQF Garlic Puree Nuggets; (c) 107734 FG WASABI SMALL PANKO KATSU (Cold Food) 2 KG (not on the issues list; a finished-product-style item); (d) junk/placeholder entries needing a clean-up decision (5): "gdfs" (no code), 106113 "Sides x 6", 107639-B "Do not use this item either", 107640-B "Do not use this item", P00040. The user believed there were none: the answer is 20 (14 real items, 6 placeholders/odd).
**Git:** the 32 archive edits and this log are uncommitted.
**Decision (user, 12 Oct): LEAVE the 93 as they are.** All 174 spec-loaded ingredients have a spec file name recorded and shown on the Source line (81 on the latest version, 93 on an earlier version, 0 missing); the user chose NOT to copy the name onto the latest version of the 93. Future writes carry it forward automatically (scripts/lib/spec-source.js). Audit check A will therefore keep reporting 93 until that changes: this is an accepted, known result, not a fault.

### 2026-10-12 — Recipe ingredient search box: shows 6 rows and scrolls through ALL matches (DEPLOYED to the Pi, user approved "Yes, do it")
**Ask (user):** searching "bhp" in a recipe's ingredient box showed only 4 results ("why am I only getting these 4?"); then: "I want 6 to show (if there are 6), but I want to be able to scroll through all compatible searches; I was not able to scroll before, they only said there were 4".
**Cause:** not missing data. The Pi has 35 sub-recipes matching "bhp" (0 ingredients). `searchIngredientForRecipe()` in app.js listed at most 6 ingredients (`.slice(0, 6)`) + 4 sub-recipes (`.slice(0, 4)`), so only 4 rows existed and there was nothing to scroll. The dropdown CSS already had `max-height: 220px; overflow-y: auto`.
**Change:** (1) app.js: both fixed caps removed; every match is listed, with a CEILING of 150 per kind (`SEARCH_CEILING`) so a one- or two-letter search cannot freeze the page (the page works out a cost per sub-recipe row); beyond the ceiling a last line says "Showing the first 150 of each kind - type more letters to narrow the list". Ranking, filters and click behaviour untouched. (2) styles.css: `#recipe-ing-dropdown { max-height: 224px; overflow-y: auto; }` = exactly six 37px rows visible, scroll for the rest. (3) index.html: cache tags bumped for BOTH `app.js?v=20261012-search-scroll` and `styles.css?v=20261012-search-scroll` (styles.css had a stale tag from 20260928, so the CSS change would not have reached browsers).
**Tested (read-only, on the local copy of the page, no data written):** "bhp" -> 35 rows, box 224px, 6 rows fully visible, scrolls to the last match (BHP Chicken Teriyaki); "bhp sweet" -> 2; "zzzzzz" -> 0; "a" -> 300 rows (150 + 150) with the hint, 14 ms. NOT checked on the live page on screen (the assistant cannot sign in): the user must test it.
**Proof nothing else changed:** before deploying, a line diff of each LIVE file against mine showed ONLY the intended lines (app.js: the two caps, the ceiling and the hint; styles.css: the 2 added lines; index.html: the 2 tags). Deployed with rollback copies `/opt/nutricost/frontend-previous-search-scroll-20261012` (app.js, styles.css, index.html); checksums match on both sides (app.js fe7d6a8c1e270bef, styles.css 6b63a4a97f564509, index.html ae6ea7e1dae8a1b6); the live app.js and styles.css contain the new code; service active. Rollback: copy the three files back from that folder (no restart).
**Git:** app.js, styles.css, index.html and this log are uncommitted.

### 2026-10-12 — UNIT BUG: grams entered for a KG-costed ingredient came back as KG after a refresh (found by the user; fix approved by click "Yes, fix it")
**Report (user, with two screenshots):** "I made a recipe in grams and refreshed and look it's weirdly gone to kg and some grams, I saved it in grams, what's this bug and can you fix that." Recipe "Teriyaki Glazed Chicken Noodles" (code NEW, id_2nquq3pkc, tag Project:jan-2027): lines RM Onions Crispy Fried 5 G and RM Teriyaki Sauce 6 KG 25 G came back as 5 KG and 25 KG (total weight 260g -> 30230g, cost 0.625 -> 81.79); the BHP sub-recipe lines stayed G.
**Cause:** `normalizeRecipeIngredientUoms()` in storage.js runs on EVERY page load and on every setRecipes, and overwrote each ingredient line's unit with the ingredient's cost unit WITHOUT converting the quantity (5 G -> 5 KG, 1000x). The next save persisted it: the Pi now STORES 5 KG and 25 KG for that recipe (read from the API: qty=5 uom=KG, qty=25 uom=KG; updatedAt 2026-10-12T14:18:59). app.js already had the RIGHT rule when a recipe is opened (keep convertible units, convert the quantity when forcing), but storage.js ran first and made its check useless. Sub-recipe lines have no ingredientId so were untouched.
**Exposure check (read-only, Pi data):** all 1,119 stored ingredient lines are in their ingredient's cost unit, 0 in any other unit, so I CANNOT tell whether other recipes were corrupted the same way earlier (any recipe where someone typed grams for a KG-costed item, refreshed and saved would look like this one); only this recipe is known.
**Fix (storage.js only, a pure addition, 9 lines added, none removed):** a line whose unit is convertible to the cost unit (weight/volume against weight/volume, same rule as app.js) keeps its own unit and number; a line with no unit, or one that cannot convert (e.g. grams for an EACH or M item, EACH for a KG item), is forced as before. index.html: `storage.js?v=20261012-uom-keep`.
**Tested offline (real storage.js in a sandbox, nothing live):** `node scripts/test-storage-uom.js`: 5 G for KG stays 5 G, KG for KG, ML for L, ML for KG and KG for a G-costed item keep unit and number; grams for EACH, EACH for KG, grams for M and a missing unit are still forced as before; a sub-recipe line is untouched; every other field of the recipe and its 10 lines identical. The same test run against the OLD storage.js (env STORAGE_JS) FAILS on the first check (line 0 unit KG, expected G), so the test catches the bug.
**Not yet done:** deploy to the Pi (next), and the DATA of the one known recipe (5 KG/25 KG should be 5 G/25 G): to be set back by the user in the app after the fix is live, or by an exact approved edit. `scripts/accuracy-scan.js` has its own verbatim copy of the old normalization (not changed; its result is unaffected because all stored lines already equal the cost unit).
**DEPLOYED to the Pi (production) 2026-10-12:** storage.js + index.html (tag `storage.js?v=20261012-uom-keep`). Live files were checked first: they differed from mine ONLY by the 9 added lines and the tag. Rollback copies `/opt/nutricost/frontend-previous-uom-keep-20261012` (storage.js, index.html); checksums match both sides; the live storage.js contains the fix; service active. NOT checked on screen (the assistant cannot sign in): the user must refresh (Ctrl+F5), open a recipe, enter grams for a KG-costed ingredient, save, refresh and confirm it stays in grams. The one known corrupted recipe (Teriyaki Glazed Chicken Noodles, 5 KG / 25 KG) still holds the wrong data until it is set back to 5 G / 25 G. Git: storage.js, index.html, scripts/test-storage-uom.js and this log are uncommitted.

## 2026-10-12 — Serving size moved into the Full Nutrition Profile card (index.html only, NOT yet deployed)
1. Ask: "put a serving size option here that controls the nutrition per serving column". User chose "Yes, move it up"; %RI stays per 100g.
2. Decision: reuse the existing Serving Size (g) box (it already drove Per Serving, Label and Total row); no new logic.
3. Built: index.html only. Input id nutrition-serving-size-input (same oninput handler, same stored recipe.serving) now sits in the header of the Full Nutrition Profile card; old lower "Serving Size" card removed; its help sentence moved under the table.
4. Does not: change app.js, styles.css, storage.js, any data, or %RI.
5. Tested: read-only on the local page copy (localhost:5055 serves it): exactly one input with that id, inside the Full Nutrition Profile card. Typing-to-recalc not exercised on screen (handler untouched).
6. Deploy: pending its own approval; plan = rollback copy, live-vs-mine diff, checksum.
7. Git: uncommitted.
Deployed to Pi 2026-10-12 (user approved by click): live-vs-mine diff showed only the serving-size change; rollback copy /opt/nutricost/frontend-previous-serving-size-20261012/index.html (sha256 66ad9efc...8706); live now f703f195...94a = local. Only index.html touched. Not seen on screen by the assistant.

## 2026-10-13 — "Batch Size" column in the recipe ingredient table (DEPLOYED to Pi, user said "push prod")
1. Ask: new column between QTY per BUOM and % Recipe, "Batch Size"; bottom total is a reverse sum: each line shows its weight (g); typing a new total scales the recipe.
2. Built: index.html (header, app.js tag ?v=20261013-batch-size), app.js (per-line cell for ingredient and sub-recipe rows, editable total cell, scaleRecipeToBatch: multiplies every non-packaging line qty by target/current, undo snapshot, recipe version, re-render). Per-line cells read-only; ratios unchanged; locked/approved recipes show plain total.
3. Does not: touch packaging lines, data other than the open recipe's qty values (and only when a total is typed and Save pressed), %RI/costs logic.
4. Tested: syntax check; local page has the column and function. Typing a total NOT exercised on screen.
5. Deploy: live-vs-mine diff = only these changes; rollback /opt/nutricost/frontend-previous-batch-size-20261013 (app.js, index.html); checksums verified. Git: uncommitted.

## 2026-10-13 — Batch Size changed to DISPLAY ONLY (DEPLOYED, user clicked "Yes, deploy")
Ask: Qty determines ratios and must be unaffected by the Batch Size column. Before: typing a total rewrote every Qty (scaleRecipeToBatch). After: scaleRecipeToBatch only stores an in-memory target (batchSizeTargets, per recipe, not saved, resets on reload); the Batch Size cells and total show qty-weight x target/total; Qty, costs, % and the saved recipe are never changed. Files: app.js, index.html (tag ?v=20261013-batch-display). Rollback: /opt/nutricost/frontend-previous-batch-fix-20261013 (the previous batch version). Checksums verified. Not tested on screen. Git: uncommitted. Note: any recipe where the earlier version was used and Saved has scaled Qty values (Gochujang Chicken Noodle was shown at 500g in the Qty column; Undo or re-enter if it was saved).

## 2026-10-13 — "Download Excel" on the recipe Ingredients tab (DEPLOYED, user clicked "Yes, deploy")
Ask: download the ingredients page of a recipe to Excel; chosen layout "Table as shown + Batch Size" (recipe name/code/status/batch shown at top; columns Code, Ingredient, Qty, Unit, Qty per BUOM, BUOM, Batch Size (g), % Recipe, Scrap %, Cost per UOM, Line Cost; Total row). Built: button in index.html card header; app.js downloadRecipeIngredientsExcel reads the rendered table (so it is exactly what is shown) and writes .xlsx via the already-loaded SheetJS; file name CODE_Name_ingredients.xlsx. Read-only: no data, no recipe change. Tested locally by intercepting the writer on one recipe (rows/values correct; EACH total labelled EACH); actual file download not opened in Excel. Deployed with rollback /opt/nutricost/frontend-previous-xlsx-export-20261013; checksums verified; tag ?v=20261013-xlsx-export. Git: uncommitted.

## 2026-10-13 — Excel download: Total row Batch Size and % Recipe are SUM formulas (DEPLOYED, user clicked "Yes, deploy")
Ask (after the user opened a real download): total batch size and % recipe cells should be the sum of the ingredient lines. Built: in downloadRecipeIngredientsExcel the Total row cells G and H are =SUM(G7:Gn)/=SUM(H7:Hn) with the shown value cached. Nothing else in the file or the app changed. Tested locally via the intercepted writer (G10 = SUM(G7:G9), H10 = SUM(H7:H9)); not opened in Excel. Rollback /opt/nutricost/frontend-previous-xlsx-sum-20261013; checksums verified; tag ?v=20261013-xlsx-sum. Git: uncommitted.

## 2026-10-13 — Excel download is a working spreadsheet (DEPLOYED, user clicked "Yes, deploy")
Ask: "i want it actually to have the formula so users can then use the excel". Built: downloadRecipeIngredientsExcel rewritten: new column G "Weight (g)" (real line weights, read from data-g added to the on-screen Batch Size cells); H "Batch Size (g)" = Weight/SUM(Weights)*$B$4 and I "% Recipe" = Weight/SUM(Weights)*100 are formulas on every line (cached values included); B4 is the batch-size input (defaults to the batch shown on screen); Total row has SUM formulas for G, H, I. Lines with no gram weight (EACH without unit weight) have no batch figure, as on screen. On-screen table unchanged apart from a data-g attribute. Tested locally by intercepting the writer (formula text and cached values checked); not opened/recalculated in Excel. Rollback /opt/nutricost/frontend-previous-xlsx-formulas-20261013; checksums verified; tag ?v=20261013-xlsx-formulas. Git: uncommitted.

## 2026-10-13 — Excel download columns match the page (DEPLOYED, user clicked "Yes, deploy")
Ask: downloaded columns must match the page; I had added some (Unit, BUOM, Weight). Now visible A-J = Code, Ingredient, Qty, QTY per BUOM, Batch Size, % Recipe, Scrap %, Cost per UOM, Line Cost, FVN (units shown via number formats, cells stay numeric). Hidden helper column K "Weight (g)" feeds the formulas (Batch Size = weight share x B4; % Recipe; Total row SUMs). B4 batch input kept in the header block. Tested locally via intercepted writer; not opened in Excel. Rollback /opt/nutricost/frontend-previous-xlsx-match-20261013; checksums verified; tag ?v=20261013-xlsx-match. Git: uncommitted.

## 2026-10-13 — Excel download styled like the user's mock-up (DEPLOYED, user clicked "Yes, deploy")
Ask: bold title, green highlight + outline on the Batch size cell, green header row, table lines on the table and the title table. SheetJS community cannot write styles, so loadStyledXlsx loads xlsx-js-style@1.2.0 from cdn.jsdelivr.net only when Download is clicked and restores the global XLSX afterwards (other Excel features unaffected); if it cannot load, the same file downloads unstyled. Styles: B1 bold; A1:B4 thin borders; B4 fill C4D79B, medium outline, centred; row 6 A:I fill 92D050 + thin borders; A:I table rows to Total thin borders, A-D centred; FVN header (J) left plain like the mock-up. Columns/formulas unchanged. Tested locally: file generated, fills present in the re-read file, formulas intact, global XLSX restored; not opened in Excel. Rollback /opt/nutricost/frontend-previous-xlsx-style-20261013; checksums verified; tag ?v=20261013-xlsx-style. Git: uncommitted.

## 2026-10-13 — New in-development recipe (no code) shows tally only in the Total row Cost per UOM (DEPLOYED, user clicked "Yes, deploy")
Ask: a duplicated recipe in development has no code/system reference, so it must show only the tally, no system cost. Finding: duplicate already zeroes ownCost (app.js dup.ownCost = 0) and ownCost is only trusted when approved; the dark figure (£3.105) was the live per-UOM derivation, shown beside the tally (£7.763). Built: in renderRecipeIngredients, noSystemCost = !approved and code blank or NEW; then the Total row Cost per UOM cell shows only the grey tally. Approved/coded recipes unchanged (still dark / grey). Display only: no stored cost and no parent-recipe calculation changed. Tested locally: NEW in-dev recipe shows "£0.925" only; approved recipe still "£1.110 / £1.348". Rollback /opt/nutricost/frontend-previous-newrec-tally-20261013; checksums verified; tag ?v=20261013-newrec-tally. Not changed (open question): sub-recipe lines inside a recipe that are themselves new/in-development still show both figures. Git: uncommitted.

### 2026-10-13 — 106157 RM Salt Table Tub uploaded from "102037 Salt - Wasabi RM Spec Branches V1 29.04.2021.xlsx" (WRITTEN LIVE)
Ask: "can you upload the salt spec into the site". The held 102037 spec (see 2026-10-08 entry / issues list). Confirmed one prompt at a time by the user: code -> 106157 RM Salt Table Tub (not 107346); nutrition as shown (Fibre blank, template has no row); Pack Size = 6 kg; Pack Format blank; Storage Conditions = "store in a cool dry place" with Shelf Life blank (the script had put the text under Shelf Life; I set storageConditions and nulled shelfLife in .scan/salt106157.json after the user confirmed); Ingredients "salt, anti-caking agent: Sodium Ferrocyanide" (declaration box); allergens: all 27 rows N/N, no comments -> none ticked, no note (two extractor warnings were the page footer, not allergens). Flags used: --override-code 106157 --allow-blank-nutrition fibre --confirm-warnings. Live write approved by its own click. Diff written: salt 0->99.9; packSize ""->"6 kg" (value 6, unit kg); storageConditions ""->store in a cool dry place; ingredientsList ""->the declaration. Post-upload verification PASSED (re-fetched); Source line set to the spec file name; archived to spec-data/106157.json. Not changed: cost, supplier, code, name, energy/macros (already 0), allergens, Pack Format, Shelf Life. 31 recipes use this salt and now carry salt 99.9 g/100g for it. Closes the "106157 no spec found" and "102037 held" items. Git: spec-data/106157.json and this log are uncommitted.

## 2026-10-13 — FIX: a duplicate (or any just-saved recipe) snapped back to old quantities after Save + refresh; Back from a duplicate opened the original (BACKEND + PAGE DEPLOYED, user clicked "Yes, deploy both")
1. Ask: "when i make a duplicate and change qtys, save then refresh they go back to the original ingredient qtys? this shouldn't happen"; "ensure back must go back 1 page, not undo anything"; "once duplicated make them their own recipe they shouldn't be snapping back".
2. Cause (proved): optimistic-concurrency check in PUT /api/recipes/{id} (and /api/ingredients/{id}) compared the client's updatedAt with the stored one exactly; a stamp returned by the server for a freshly POSTed/PUT record (in-memory, sub-microsecond) never exactly equals the stored (microsecond) one, so the next Save got 409; the browser then replaced the user's edit with the server copy (toast "changed by someone else") and refresh showed the old quantities. Pi log showed many 409s straight after POST (e.g. id_go3e122cz 11:01 and 11:03 on 2026-10-13). The duplicate itself was always its own record (own id, own lines).
3. Built: backend/Program.cs SameStamp(a,b) = within 1 ms, used in both PUT endpoints (no schema change, concurrency protection for genuinely stale saves kept); app.js confirmDuplicateRecipe opens the copy with isBack=true so the original is not pushed on the Back stack (Back returns to the page the original was opened from); tag ?v=20261013-dup-fix.
4. Tested: scratch database on the Pi (pg_dump copy of production, counts 1107/3836/404 equal), old binary on port 5099 -> POST then PUT,PUT: second PUT 409 (reproduced); new binary -> all three PUTs 200, saved qty correct, a genuinely stale stamp still 409; scratch DB, folder and test process removed, production test recipe count 0. Not tested: the Back change in a browser on the live site.
5. Deploy: backup first (.scan/backups/nutricost-db-2026-10-13-before-stampfix.sql.gz; project zip in %TEMP%\nutricost-backup-2026-10-13, OneDrive NOT copied); rollback /opt/nutricost/backend-previous-stampfix-20261013 (old NutriCost.Api + .dll, dll sha 066b8a8252d8; new e4fda77476c4); service active, listening; row counts after: recipes 1107, recipe_lines 3836, ingredients 404, ingredient_versions 3219, additive_policy 388 (same as before). Page rollback /opt/nutricost/frontend-previous-dup-fix-20261013; checksums verified.
6. Does not: recover quantities already lost to earlier snap-backs (the older values are not stored anywhere); full per-row hash comparison against the backup was not run (counts only).
7. Git: uncommitted (backend/Program.cs, app.js, index.html, spec-data/106157.json, logs).

## 2026-10-14 — Sodium row under Salt in the Nutrition tab (DEPLOYED, user clicked "Yes, deploy")
Ask: "i want the sodium content displayed below the salt". Sodium is not a stored field; the row "Sodium (from salt)" is calculated in app.js (salt / 2.5, standard UK/EU conversion) and shown in mg per 100g and per serving; %RI is a dash (none defined). Display only; no data or other calculation changed. Tested locally (salt 0.36g -> 144mg). Rollback /opt/nutricost/frontend-previous-sodium-20261014; checksums verified; tag ?v=20261014-sodium-row. Not added to the Label/other tables. Git: uncommitted.

### 2026-10-14 — 107346 RM Salt Tub also given the 102037 Salt spec values (WRITTEN LIVE, user clicked "Yes, write all of it")
Ask: "can you also add salt from spec to this salt too" (screenshot: CPU RM Salt 105022 containing 107346 RM Salt Tub, no-nutrition warning). Same extraction as the 106157 entry above (code overridden to 107346 in .scan/salt107346.json; field-by-field confirmations were given for 106157 the day before). Caveat shown to and accepted by the user: the spec is the Dri-Pak 6kg salt supplied by JJ Food Service (supplier of 106157); 107346's supplier is Kluman And Balter Ltd, so Pack Size 6 kg, storage and ingredients text may not be this tub's. Diff written: salt 0->99.9; packSize ""->"6 kg" (6, kg); storageConditions ""->store in a cool dry place; ingredientsList ""->salt, anti-caking agent: Sodium Ferrocyanide. Verification and Source line as printed by spec-apply (see below / archive spec-data/107346.json). 269 recipes use it. Git: uncommitted.

### 2026-10-14 — 106155 RM Oil Rapeseed: Fat 99 g and Saturates 11.5 g set from the user's reference values, flagged "needs a spec" (WRITTEN LIVE, user clicked "Yes, write it")
Ask: screenshot showing Fat 99,0 g / Saturated fat 11,5 g: "make this the fats values and put a note it needs a spec". Confirmed by click: item = 106155; note goes in the Source line comment (version history). Applied with scripts/field-fix-apply.js (plan .scan/fix_106155_fats.json): fat 0 -> 99, sat 0 -> 11.5; nothing else changed (kj/kcal/carb/sugar/fibre/protein/salt stay 0). Version 2 comment: "Fat 99.0 g and saturated fat 11.5 g from the user's reference values (screenshot), NOT from a spec. NEEDS A SPEC: ...". No spec file name recorded (none exists; the script printed SOURCE NOT RECORDED as expected). Verified by re-fetch: intended fields correct, other ingredients changed 0, count 404/404. Not a spec upload: the held 20L rapeseed spec file for 106155 is STILL HELD (user dismissed the question on 2026-10-14); once it is approved, uploading it replaces these two values and the "needs a spec" status. NOT archived to spec-data (not a spec). Git: uncommitted.

### 2026-10-14 — 106187 RM Chicken breast calibrated 210-250g - Ex Inner uploaded from "106187_2 (105005)Chicken Breast 200-240g Calibrated RM Spec V2 24.10.24.xlsx" (WRITTEN LIVE)
Ask: "yes add it to this also but make a note in issues to revisit one day" (the held 2026-10-07 spec). Each field confirmed by its own click: nutrition as listed, Pack Size 5 kg (cell "2x5kg"), Pack Format "Plastic tray sealed with plastic film", Storage "0-4°C" (superscript degree sign translated), Shelf Life "13 days from production, delivery + 4 days", Ingredients "100% Chicken Breast", allergens none ticked / no note (Animal derivatives Y "Chicken" not ticked). Name mismatch (spec "Fresh Chicken Breast 200-240g Calibrated") confirmed with --confirm-name-mismatch; flags: --override-code 106187 --confirm-warnings. Diff written: kj 0->464, kcal 0->110, fat 0->1.8, sat 0->0.5, protein 0->23.3, salt 0->0.132, packSize "5 kg" (5, kg), packFormat, storageConditions, shelfLife, ingredientsList. Live name/cost/supplier/code unchanged. Post-upload verification and Source line as printed by the script (archive spec-data/106187.json). "Revisit one day" entry added to SPEC-ISSUES-TO-REVIEW.md. Git: uncommitted.

## 2026-10-15 — FIX: edits to a brand-new recipe lost when saved quickly / while a save is in flight (PAGE storage.js DEPLOYED, user clicked "Yes, deploy")
1. Ask: "i saved a new recipe, then went back a page and clicked into it and everything i had done in it didn't save?"
2. Finding: Pi log shows NO create/update from the user's session on 2026-10-15 (only GETs), so the exact loss could not be traced to a server event. Reproduced in a local test copy with a faked server (300 ms latency): create a recipe, edit + Save within the first save's flight -> second POST of the same id (rejected) and the first POST's answer replaced the in-memory recipe with the empty one -> server and app both empty after Back + reopen. Normal pacing (2 s) worked. Also: applySavedRecord replaced the in-memory record with the server reply, losing anything typed while any save was in flight.
3. Built (storage.js, tag ?v=20261015-inflight-fix): creatingRecipes/creatingIngredients sets + deferred maps (edits during a create are held, then sent as a normal update once the create answers); applySavedRecord(keepLocalEdits) on success only takes the new updatedAt, never replaces the in-memory record (409 conflict path unchanged: server copy wins).
4. Tested (faked server): quick Save after create -> POST then PUT with the line, server and app both 1 line; normal pace OK; qty edited while the first PUT was in flight kept and sent on the next Save (999). Not tested on the live Pi.
5. Deploy: rollback /opt/nutricost/frontend-previous-inflight-20261015 (storage.js, index.html); checksums verified. Backend untouched. Git: uncommitted.
6. Open: if it happens again, note the exact time and recipe name: the Pi log (journalctl -u nutricost, PUT/POST /api/recipes) then shows whether anything was sent.

## 2026-10-15 — Folder "Spring 2027" and its 8 recipes copied from the local dev version to the Pi (WRITTEN LIVE, user clicked "Yes, copy to the Pi")
1. Ask: "can you put the folder and recipes in the folder from the local dev version 'spring 2027' onto the prod pi version?"
2. Finding: dev folder spring-2027 (parent restaurant, not a layer) and 8 dev recipes tagged Project:spring-2027, none on the Pi. All their ingredients and sub-recipes exist on the Pi under DIFFERENT ids (matched uniquely by code, e.g. 105803, 107554, 106158, 105022); one dev-only ingredient "Curry Mayo" (id_07yacha0t, code NEW, AAK BD FOODS LTD, KG, cost 0) did not exist on the Pi: the user chose "Create it on the Pi too".
3. Built: .scan/tools/copy_folder_dev_to_pi.py (dry run, then --apply). Additions only: POST folder, POST ingredient Curry Mayo (same id), POST 8 recipes (same ids, all code NEW, lines remapped to the Pi's ids, quantities and units copied exactly). Recipes: Onigiri Template For Development (5 lines), Prawn & Salmon Onigiri Mix (2), Sriracha Prawn & Spring Onion Mix (3), Hoisin Duck Onigiri Mix (1), Katsu Curry Onigiri Mix (3), Crab & Avocado Onigiri Mix (4), Crab & Avocado Onigiri Mix 2 (2), Prawn Cocktail Onigiri Mix (0).
4. Backup first: .scan/backups/nutricost-db-2026-10-15-before-spring2027.sql.gz (OneDrive copy NOT made).
5. Verified: all POSTs 201; counts ingredients 404->405, recipes 1107->1115, folders 9->10; the Pi database shows only the 8 new recipes and Curry Mayo written in that window (no existing recipe or ingredient updated); line contents of the 8 recipes match dev (code/qty/unit listed from the DB). The script's own first verify printed "591 existing recipes changed" and "5 recipes wrong": a FALSE ALARM, the server returns a recipe's lines in a different order than they were sent and the comparison was order-sensitive; the verifier is now order-insensitive (not re-run, since it needs the pre-write state).
6. Does not: copy anything else from dev (other folders, other new dev recipes/ingredients), change costs, or touch the other 3 dev folders. Dev data left as is. Git: .scan is local only; this log is uncommitted.

## 2026-10-15 — INCIDENT (not resolved): recipes "Katsu Curry Onigiri Mix" and "Sriracha Prawn & Spring Onion Mix" appeared reverted on screen; the saved work was intact on the Pi
Report: after returning to the site (screenshot ~16:45), the recipe showed the old (copied-from-dev) lines. Evidence: Pi log shows the user's Saves 14:57-15:24 all PUT 200 (both recipes each time), no page load after 14:56:52 and no list refresh afterwards, then only recipe views at 16:45-16:47; the Pi DB held the NEW lines (Katsu: Curry Mayo 55 G, Katsu 100 G, RM Mayonnaise Vegan 15 G; Sriracha: 5 lines) with updated_at 15:24:40. After a refresh (Ctrl+F5) the user confirmed "they are back". So the server never lost anything; the open browser tab showed a stale in-memory copy. Cause NOT proven: ruled out (reproduced locally) a false "unsaved" prompt after Save, a Back-triggers-Undo path, and in-memory/cache array divergence; nothing in the code explains an in-memory revert without a reload. Open candidates: another stale tab/window on the same page, a discarded/restored browser tab, or the Leave-without-saving snapshot. Safe behaviour confirmed: a stale page's Save carries the old updatedAt and is refused (409) rather than overwriting. If it happens again: note the time and what was pressed; check journalctl for page/list GETs at that moment. No code changed for this item.
