"""Extract nutrition + allergens from a Wasabi Raw Material Specification .xlsx, per the
mapping documented in SPEC-EXTRACTION.md. Outputs JSON to stdout.

SAFETY-CRITICAL: an allergen extracted wrong is a consumer safety incident, not a cosmetic
bug. This script refuses to produce anything spec-apply.js will treat as safe to write unless
every structural check below passes AND every allergen category this template defines was
actually found and read from a validated column -- never assumed from a fixed cell address. A
format the code doesn't recognise must come back as `"status": "cannot_extract"` with a clear
`errors` list, never as an empty/partial/best-guess result silently treated as "no allergens."

Usage: python scripts/spec-extract.py "<path to .xlsx>" [--override-code CODE[/ALTCODE]]
       [--confirm-cross-sheet-mismatch]

--override-code covers two narrow cases, both requiring the document to be internally
self-consistent (every sheet's C4 either blank or in exact agreement -- a real disagreement
between sheets is refused regardless of this flag, full stop):
  1. The Product Code cell is blank on every sheet, and a human has manually confirmed,
     outside this script, what the code should be (e.g. from the filename).
  2. The Product Code cell consistently states a DIFFERENT code across every sheet -- e.g. the
     manufacturer's own product code rather than ours -- and a human has confirmed the correct
     code to use instead.
Either way this is a human decision substituting for what the document states, never an
automatic inference, and the output is always stamped with a warning naming exactly what was
overridden and why, so it's never silently indistinguishable from a code the document itself
stated correctly.

--allow-blank-nutrition FIELD[,FIELD2,...] covers a named nutrition field that's genuinely
unusable in this spec, in any of three ways: (a) the cell is blank, (b) the row itself doesn't
exist in this template at all, or (c) the cell holds a non-numeric value a human has confirmed
is a real source notation, not a parsing bug (e.g. McCance & Widdowson's "N" for "present, no
reliable quantified amount"). All three leave the field unset (never written as 0), and all
three require a human to have actually looked at the specific cell first.

--correct-unit-mismatch FIELD[,FIELD2,...] covers a nutrition value entered with the wrong unit
suffix for its own column (e.g. "62.5mg" typed into a "Salt (g)" cell) -- only usable for a
KNOWN, purely-arithmetic conversion (see UNIT_CONVERSION_FACTORS: mg<->g, kg<->g, ml<->l), never
for a different-quantity relationship like Sodium->Salt (that stays behind its own
--derive-salt-from-sodium flag). A human must have looked at the specific cell and confirmed it's
genuinely a wrong-unit entry, not some other kind of problem, before this is used.

Pack Size and Pack Format each ALWAYS raise their own mandatory confirmation warning whenever a
value is extracted (like Storage Conditions and Shelf Life), so every spec stops for a human to
confirm each field separately before --apply, even on an otherwise clean extraction.

Pack Size is always reduced to a single "<number><unit>" measure (e.g. "10ml", "1kg") when
exactly one such token can be found in the source cell -- container/count wording ("sachet",
"x 4", "per carton") is dropped from Pack Size and belongs in Pack Format instead. This isn't
cosmetic: the app parses Pack Size as a number to work out what "1 EACH" of the ingredient
weighs/measures for recipe costing and nutrition math, and text like "10ml sachet" can't be
parsed that way at all. If zero or more than one measure-shaped token is found, the value is
left as extracted and flagged for manual review rather than guessing which one is correct.

--confirm-cross-sheet-mismatch is separate and much narrower: it does NOT change which code is
used (that's still whatever's on the recipe sheet, or --override-code if also given). It only
permits proceeding when exactly one or a few sheets disagree with the rest, after a human has
manually opened the document, confirmed the Product Name and every other sheet's code agree,
and judged the differing sheet a stray typo/leftover rather than evidence the sheet was
copy-pasted from a different product's spec. Always stamped with a warning naming the exact
sheet and value that was overridden.
Exit code 0 with status "ok" only when the format was fully recognised and nothing looked off.
Exit code 1 (status "cannot_extract" or "extracted_with_warnings") otherwise -- spec-apply.js
refuses --apply unless it sees status "ok".
"""
import sys
import json
import re
import openpyxl

# Windows' console defaults stdout to cp1252, which crashes outright on a real degree-Celsius
# character (U+2103, seen in a real spec -- Breaded Prawns, 2026-09-28) or any other character
# outside that codepage. Force UTF-8 so a spec containing genuine Unicode text never takes the
# whole extraction down -- this is an I/O fix, not a data interpretation change.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def cell_text(cell, warnings=None, field_label=None):
    """Plain-text value of a cell. Handles one specific rich-text trick: a run of text styled as
    superscript whose text is exactly '0' is a common manual fake for a degree symbol (no real
    Unicode '°' character used at all) -- confirmed against a real spec (Beef Mince,
    2026-09-29) whose Storage Conditions cell reads as *plain* text "00C - 20C" (indistinguishable
    from a genuine double-zero typo, and from a real 0-20C range) but is actually rich text:
    "0" + SUPERSCRIPT"0" + "C - 2" + SUPERSCRIPT"0" + "C", i.e. "0[deg]C - 2[deg]C" is what a
    human reading the spec actually sees.

    SAFETY: this substitution is NEVER trusted silently. A wrong read here is the difference
    between "chilled" and "ambient" storage instructions -- a genuine food-safety risk, not a
    cosmetic formatting quirk. Whenever ANY superscript-styled run is found in a cell (whether
    it's the exact "0"->degree-sign case or something else this pattern doesn't recognise), a
    warning is appended and the extraction status can never be "ok" until a human explicitly
    reviews it via --confirm-warnings, per the standing rule that every questionable read gets
    a person's eyes on it -- this is not something a font-formatting heuristic gets to decide
    alone, no matter how confident the pattern match looks. A workbook opened without
    rich_text=True, or a cell with no rich-text runs at all, just returns str(value) unchanged."""
    v = cell.value
    if v is None:
        return None
    runs = getattr(v, "__iter__", None) and not isinstance(v, str)
    if not runs:
        return str(v)
    out = []
    plain_concat = []
    superscript_found = []
    for run in v:
        if isinstance(run, str):
            out.append(run)
            plain_concat.append(run)
        else:
            text = getattr(run, "text", None) or ""
            font = getattr(run, "font", None)
            vert_align = getattr(font, "vertAlign", None) if font else None
            plain_concat.append(text)
            if vert_align == "superscript":
                superscript_found.append(text)
                out.append("°" if text == "0" else text)
            else:
                out.append(text)
    result = "".join(out)
    if superscript_found and warnings is not None:
        warnings.append(
            "%s contains superscript-styled text (%r read plainly, %r with superscript '0' runs "
            "translated to the degree sign) -- this is a rich-text formatting trick some specs "
            "use to fake a degree symbol without the real Unicode character. SAFETY-RELEVANT: "
            "never trusted automatically -- a person must verify this against the actual spec "
            "(open it in Excel and read what it visually shows) before this can be applied; "
            "re-run with --confirm-warnings once confirmed." % (field_label or "A cell", "".join(plain_concat), result))
    return result

# Every category this template's allergen sheet is expected to carry, and which EU-14 allergen
# it maps to (several spec rows -> one EU allergen; several spec rows aren't EU allergens at
# all and are intentionally not mapped -- see SPEC-EXTRACTION.md). ALL of these must be found
# as an actual row in the sheet, or extraction is refused -- a missing row could mean the
# format changed and that category was silently dropped, which is unacceptable for allergens.
EXPECTED_ALLERGEN_ROWS = {
    "wheat": "Cereals containing gluten",
    "oat": "Cereals containing gluten",
    "rye": "Cereals containing gluten",
    "spelt": "Cereals containing gluten",
    "barley": "Cereals containing gluten",
    "gluten level": "Cereals containing gluten",
    "crustacean": "Crustaceans",
    "egg": "Eggs",
    "fish": "Fish",
    "lupin": "Lupin",
    "milk": "Milk",
    "mollusc": "Molluscs",
    "mustard": "Mustard",
    "nut/nut": "Nuts",
    "peanut": "Peanuts",
    "sesame": "Sesame",
    "soya": "Soya",
    "sulphite": "Sulphur dioxide",
    "celery": "Celery",
}

NUTRITION_FIELDS = [
    ("Energy (KJ)", "kj", "kj"),
    ("Energy (Kcal)", "kcal", "kcal"),
    ("Fat (g)", "fat", "g"),
    ("*of which saturate fat (g)", "sat", "g"),
    ("Carbohydrate (g)", "carb", "g"),
    ("*of which sugar (g)", "sugar", "g"),
    ("Protein (g)", "protein", "g"),
    ("Fiber (g)", "fibre", "g"),
    ("Salt (g)", "salt", "g"),
]

import re as _re

# Deterministic unit-conversion factors -- e.g. a value found in mg written into a column
# labeled (g). Only unambiguous, purely-mathematical conversions belong here (never anything
# resembling the Sodium->Salt formula, which is a nutritional/legal relationship between two
# DIFFERENT quantities, not a unit conversion of the same quantity -- that stays behind its own
# separate --derive-salt-from-sodium flag). Key is (found_unit, expected_unit), both lowercase.
UNIT_CONVERSION_FACTORS = {
    ("mg", "g"): 0.001,
    ("g", "mg"): 1000.0,
    ("kg", "g"): 1000.0,
    ("g", "kg"): 0.001,
    ("ml", "l"): 0.001,
    ("l", "ml"): 1000.0,
}

def parse_nutrition_value(val, expected_unit, correct_unit=False):
    """Accept a bare number, OR a number immediately followed by its own column's stated unit
    (e.g. "1.24g" in a "Fat (g)" column) -- some suppliers write the unit inline rather than
    leaving a pure number. Deliberately narrow: the suffix must match THIS field's own unit
    (case-insensitively), never any arbitrary trailing text -- "1.24ml" in a "Fat (g)" column
    would still be refused, since that's a real discrepancy worth a human's attention, not a
    formatting quirk to silently paper over.

    If correct_unit=True (only ever set when a human has confirmed, for this specific cell, that
    the suffix is a genuine wrong-unit entry rather than something else going on) and the suffix
    is a known convertible unit from UNIT_CONVERSION_FACTORS, the value is converted and returned
    with problem="unit_corrected:<original text>" so the caller can still surface exactly what
    was found and what it was converted to -- never silently indistinguishable from a value the
    spec stated correctly in the first place."""
    if isinstance(val, (int, float)):
        return val, None
    if val is None:
        return None, "blank"
    s = str(val).strip()
    if not s or s.upper() == "N/A":
        return None, "blank"
    # A bare dash means "none/negligible" on this template (confirmed against a real spec,
    # see SPEC-EXTRACTION.md) -- record as 0, same as if the supplier had written "0".
    if s == "-":
        return 0.0, None
    # "tr"/"trace" is standard UK food-labeling notation for "present but below the quantifiable
    # amount" -- confirmed against a real spec (Diced Potato, 2026-09-28) -- record as 0, same
    # treatment as the dash convention above.
    if s.lower() in ("tr", "trace"):
        return 0.0, None
    # A below-threshold lab result ("<0.1g") -- record the threshold value itself (the
    # standard/conservative reading: the true value is somewhere between 0 and this number).
    if s.startswith("<"):
        s = s[1:].strip()
    # Parentheses around the whole value ("(400kCals)") are just formatting some suppliers use
    # for this field -- strip one matching pair, but only if it wraps the ENTIRE cell value, so
    # this never touches a case where parens are part of a real qualifier elsewhere in the text.
    if s.startswith("(") and s.endswith(")"):
        s = s[1:-1].strip()
    # A stray trailing apostrophe/quote mark (e.g. "54.0'") -- confirmed as a plain typo against
    # a real spec (Paprika Powder, 2026-09-28), not a unit or qualifier. Strip only a SINGLE
    # trailing apostrophe/quote, never a leading one, so this doesn't touch something like a
    # feet/inches notation that happens to use the same character meaningfully.
    if s.endswith("'") or s.endswith('"'):
        s = s[:-1].strip()
    # European comma-decimal notation ("<0,02" meaning "<0.02") -- confirmed against a real spec
    # (Glucose Syrup, 2026-09-29) that mixed BOTH comma and period decimals for different fields
    # in the same document, so this isn't a one-off typo, it's a real notation variant. Safe to
    # normalize unconditionally here: a comma between two digits is never a thousands separator
    # in this context (every value on this template is well under 1000), so there's no ambiguity
    # to guess through.
    s = _re.sub(r"(\d),(\d)", r"\1.\2", s)
    m = _re.match(r"^([\d.]+)\s*([A-Za-z]*)$", s)
    if not m:
        return None, "unparseable"
    number_part, suffix = m.group(1), m.group(2).strip().lower()
    # Accept a trailing "s" on the unit (e.g. "kCals" for a "kcal" column) -- same unit, plural.
    if suffix.endswith("s") and suffix[:-1] == expected_unit.lower():
        suffix = suffix[:-1]
    if suffix and suffix != expected_unit.lower():
        if correct_unit:
            factor = UNIT_CONVERSION_FACTORS.get((suffix, expected_unit.lower()))
            if factor is not None:
                try:
                    converted = float(number_part) * factor
                    return converted, "unit_corrected:%s%s" % (number_part, suffix)
                except ValueError:
                    pass
        return None, "unit mismatch (found %r, expected %r)" % (suffix, expected_unit)
    try:
        return float(number_part), None
    except ValueError:
        return None, "unparseable"

def find_row_starting_with(ws, prefix, max_col=1):
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, max_col=max_col):
        cell = row[0]
        if cell.value and str(cell.value).strip().startswith(prefix):
            return cell.row
    return None

def find_row_containing(ws, text_lower, max_col=1):
    """Case-insensitive substring search on column A -- used for the 'Branches' template variant
    (confirmed 2026-09-30, Shichimi Pepper + Black Sesame Seeds) whose row numbering/wording
    doesn't follow the "5-a)"/"5-f)" prefix convention at all (its Durability sheet uses "8-a)",
    "8-b)", etc, and combines Storage Conditions + Shelf Life into a single row). Substring, not
    prefix, since this template's row text varies in what comes before the phrase."""
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, max_col=max_col):
        cell = row[0]
        if cell.value and text_lower in str(cell.value).strip().lower():
            return cell.row
    return None

def find_col_in_row(ws, row_num, text_contains, max_col=20):
    for col in range(1, max_col + 1):
        v = ws.cell(row=row_num, column=col).value
        if v and text_contains.lower() in str(v).lower():
            return col
    return None

def extract(path, override_code=None, derive_salt_from_sodium=False, allow_blank_nutrition=(),
            confirm_cross_sheet_mismatch=False, correct_unit_mismatch=()):
    errors = []
    warnings = []

    try:
        wb = openpyxl.load_workbook(path, data_only=True, rich_text=True)
    except Exception as e:
        return {"status": "cannot_extract", "sourceFile": path, "errors": ["Could not open file as .xlsx: %s" % e], "warnings": []}

    # A workbook can contain a Chartsheet (an embedded chart with no cell grid) alongside its
    # normal worksheets -- confirmed against a real spec (Tahini, 2026-09-29) that crashed every
    # cross-sheet consistency check outright, since Chartsheet has no .iter_rows() at all. Using
    # this filtered list (instead of sheet_names directly) wherever every sheet needs scanning
    # keeps a chart tab from taking down an otherwise-normal extraction.
    sheet_names = [n for n in wb.sheetnames if hasattr(wb[n], "iter_rows")]

    # --- Locate the three sheets this extraction depends on, by name pattern, not fixed index ---
    recipe_sheet_name = next((n for n in sheet_names if "Ingredient & Recipe" in n), None)
    # "Nutrition" alone, not "Nutrition Information" -- confirmed 2026-09-30 (Shichimi Pepper)
    # that a newer template variant names this sheet "Nutritional Information", which does NOT
    # contain the exact substring "Nutrition Information" (the "al" breaks it). "Nutrition" alone
    # is still an unambiguous match -- no other sheet in any spec seen so far contains that word.
    nut_sheet_name = next((n for n in sheet_names if "Nutrition" in n), None)
    allergen_sheet_name = next((n for n in sheet_names if "Intolerance" in n), None)
    if not recipe_sheet_name:
        errors.append("No sheet matching 'Ingredient & Recipe' found -- cannot determine product code. Sheet names present: %s" % sheet_names)
    if not nut_sheet_name:
        errors.append("No sheet matching 'Nutrition Information' found. Sheet names present: %s" % sheet_names)
    if not allergen_sheet_name:
        errors.append("No sheet matching 'Intolerance' found -- CANNOT determine allergens, refusing to proceed. Sheet names present: %s" % sheet_names)
    if errors:
        return {"status": "cannot_extract", "sourceFile": path, "errors": errors, "warnings": warnings}

    # --- Product code + name ---
    # Located by scanning for the "Product Name :"/"Product Code :" label text in column A,
    # same as every other field in this file (packSize, storageConditions, etc.) -- NOT a fixed
    # C3/C4 cell. A third document layout variant was found 2026-09-29 (Honey, Diced Green
    # Pepper, Pineapple) with everything shifted up one row (title at row 5, Product Name at row
    # 2, Product Code at row 3, instead of the usual row 1/3/4) -- a fixed-cell lookup silently
    # read blank on all three until this was made dynamic like everything else.
    def labeled_cell(sheet, label_prefix):
        row = find_row_starting_with(sheet, label_prefix)
        return sheet.cell(row=row, column=3).value if row else None

    ws = wb[recipe_sheet_name]
    name = labeled_cell(ws, "Product Name")
    raw_code_from_doc = str(labeled_cell(ws, "Product Code") or "").strip()
    # Whether every OTHER sheet agrees with the recipe sheet's own C4 (blank sheets don't count
    # as disagreeing -- only a sheet with its own different non-blank value does). This is the
    # single precondition for --override-code, in BOTH its forms below: the document must be
    # internally self-consistent (every sheet either blank or in agreement) before a human's
    # override is allowed to substitute a different code. A document where sheets actively
    # disagree with each other is refused regardless of override_code -- that looks like
    # corrupted or mixed-up data, not something a single confirmed code can safely paper over.
    doc_self_consistent = all(
        not (labeled_cell(wb[sn], "Product Code") and str(labeled_cell(wb[sn], "Product Code")).strip())
        or str(labeled_cell(wb[sn], "Product Code")).strip() == raw_code_from_doc
        for sn in sheet_names if sn != recipe_sheet_name
    )
    # --override-code normally requires the document to be self-consistent -- but a human can
    # ALSO have separately reviewed a genuine cross-sheet disagreement and confirmed it's a
    # stray typo/leftover (via --confirm-cross-sheet-mismatch, resolved further down), not
    # evidence of a copy-pasted-from-a-different-product file. When that confirmation has
    # already been given, --override-code is also allowed to apply on top of it -- e.g. a spec
    # where 10/11 sheets agree on the MANUFACTURER's own code (not ours) and one sheet has a
    # stray different value: the cross-sheet confirmation establishes which manufacturer code is
    # real, and the override then still substitutes our own code, since neither manufacturer
    # code was ever going to be one we recognise. Confirmed 2026-09-30 (Chicken Thigh/Morliny).
    override_allowed = doc_self_consistent or confirm_cross_sheet_mismatch
    raw_code = raw_code_from_doc
    if override_code and override_allowed and not raw_code_from_doc:
        raw_code = override_code
        warnings.append(
            "Product Code cell was blank on every sheet of the document itself -- code %r was "
            "supplied via --override-code (human-confirmed, not read from the spec document). "
            "Flagging so this is never mistaken for a code the document actually stated." % override_code)
    elif override_code and override_allowed and raw_code_from_doc and raw_code_from_doc != override_code:
        # The document DOES consistently state a code -- just not ours (e.g. the manufacturer's
        # own product code). Overriding a populated field is a stronger action than filling a
        # blank one, so this branch is distinguished in the warning text on purpose.
        raw_code = override_code
        warnings.append(
            "Product Code cell consistently states %r across every sheet of the document -- "
            "this does NOT look like our own ingredient code, so it was replaced with %r via "
            "--override-code (human-confirmed: %r is the manufacturer's own code, not ours)." % (raw_code_from_doc, override_code, raw_code_from_doc))
    elif not raw_code:
        errors.append("Product Code cell (found via label search on '%s') is empty" % recipe_sheet_name)
    m = re.match(r"^([A-Za-z0-9\-]+)", raw_code) if raw_code else None
    primary_code = m.group(1) if m else None
    paren_m = re.search(r"\(([A-Za-z0-9\-]+)\)", raw_code) if raw_code else None
    alt_code = paren_m.group(1) if paren_m else None
    if not primary_code:
        errors.append("Could not parse a product code out of Product Code cell value %r" % raw_code)

    # Every sheet must agree on the same product code -- a mismatch means either a corrupted
    # file or (more dangerously) sheets copy-pasted from a different product's spec. Skipped
    # when the code came from --override-code AND the document was already self-consistent
    # (checked above, against the ORIGINAL document value) before the override applied. If the
    # document was NOT self-consistent (only override_allowed via --confirm-cross-sheet-mismatch),
    # this check still needs to run below so each differing sheet gets its own confirmed warning.
    if not (override_code and doc_self_consistent and raw_code != raw_code_from_doc):
        for sn in sheet_names:
            if sn == recipe_sheet_name:
                continue
            s = wb[sn]
            c4 = labeled_cell(s, "Product Code")
            if c4 and str(c4).strip() and str(c4).strip() != raw_code:
                mismatch_text = str(c4).strip()
                if confirm_cross_sheet_mismatch:
                    # A human has manually reviewed this exact document, confirmed every OTHER
                    # sheet and the Product Name agree, and judged this one sheet's differing
                    # value a stray typo/leftover -- not evidence of a copy-pasted-from-a-
                    # different-product file. This is a narrower, more deliberate action than
                    # --override-code (which only ever fills a blank or replaces a
                    # self-consistent non-our-code value) -- it does not change which code gets
                    # used, only permits proceeding despite one sheet disagreeing.
                    warnings.append(
                        "Sheet '%s' has Product Code %r, which does not match '%s'’s %r -- "
                        "a human reviewed this exact document and confirmed every other sheet "
                        "and the Product Name agree, judging this one sheet's value a stray "
                        "typo/leftover, not evidence of mismatched/corrupted data. Proceeding "
                        "per --confirm-cross-sheet-mismatch (human-confirmed)." % (sn, mismatch_text, recipe_sheet_name, raw_code))
                else:
                    errors.append("Sheet '%s' has Product Code %r, which does not match '%s'’s %r -- refusing, this looks like mismatched/corrupted data, not a format change" % (sn, c4, recipe_sheet_name, raw_code))

    if errors:
        return {"status": "cannot_extract", "sourceFile": path, "errors": errors, "warnings": warnings}

    # --- Nutrition ("Per 100g" column, located by header text, not a fixed column letter) ---
    nutrition = {}
    ns = wb[nut_sheet_name]
    header_row = find_row_starting_with(ns, "Typical Values")
    if header_row is None:
        errors.append("Could not find the 'Typical Values' header row in '%s' -- sheet layout does not match the recognised template" % nut_sheet_name)
    else:
        per100_col = find_col_in_row(ns, header_row, "100")
        if per100_col is None:
            errors.append("Could not find a 'Per 100g' column on the header row of '%s' (row %d) -- refusing to guess which column holds per-100g values" % (nut_sheet_name, header_row))
        else:
            labels = {}
            for row in ns.iter_rows(min_row=header_row, max_row=ns.max_row, max_col=1):
                cell = row[0]
                if cell.value:
                    labels[str(cell.value).strip().rstrip("*").strip().lower()] = cell.row
            blank_fields = {}  # field -> label, for fields that were genuinely blank in the spec
            for label, field, unit in NUTRITION_FIELDS:
                target = label.rstrip("*").strip().lower()
                found_row = labels.get(target)
                # "Fiber"/"Fibre" is a genuine US/UK spelling variant seen across real specs
                # (confirmed: Rapeseed Oil, 2026-09-28, spells it "Fibre") -- same field, try
                # both spellings before treating the row as missing.
                if found_row is None and target == "fiber (g)":
                    found_row = labels.get("fibre (g)")
                if found_row is None:
                    # A missing row is normally refused outright (see module docstring -- it
                    # could mean the format changed and a category silently dropped). The one
                    # exception is a field a human has explicitly named via
                    # --allow-blank-nutrition, confirming (after being shown the actual sheet,
                    # each time) that this specific template genuinely omits it -- e.g. an older
                    # template with no Fibre row at all. Any field NOT named there still hits the
                    # hard refusal below, so this doesn't weaken the general protection.
                    if field in allow_blank_nutrition:
                        warnings.append(
                            "Nutrition row for %r not found in '%s' at all (not just blank -- the row itself "
                            "doesn't exist in this template) -- left unset per --allow-blank-nutrition "
                            "(human-confirmed this template genuinely omits it)." % (label, nut_sheet_name))
                    else:
                        errors.append("Nutrition row for %r not found in '%s' -- template may have changed" % (label, nut_sheet_name))
                    continue
                raw_val = ns.cell(row=found_row, column=per100_col).value
                parsed, problem = parse_nutrition_value(raw_val, unit, correct_unit=(field in correct_unit_mismatch))
                if parsed is not None and problem and problem.startswith("unit_corrected:"):
                    # A human has explicitly named this field via --correct-unit-mismatch,
                    # confirming (after being shown the actual cell) that the value is genuinely
                    # in the wrong unit rather than something else going on -- e.g. a Salt (g)
                    # cell that literally reads "62.5mg". The conversion factor itself is pure
                    # arithmetic (mg->g etc, see UNIT_CONVERSION_FACTORS), never a guess, but the
                    # decision to apply it is still opt-in and logged every time.
                    original_text = problem.split(":", 1)[1]
                    nutrition[field] = parsed
                    warnings.append(
                        "Nutrition value for %r read %r -- a unit mismatch (expected %r), converted "
                        "to %.4g%s per --correct-unit-mismatch (human-confirmed genuine wrong-unit "
                        "entry, not a different problem)." % (label, original_text, unit, parsed, unit))
                elif parsed is not None:
                    nutrition[field] = parsed
                elif problem == "blank":
                    blank_fields[field] = label
                elif field in allow_blank_nutrition:
                    # A non-numeric value a human has explicitly named via
                    # --allow-blank-nutrition, confirming (after being shown the actual cell,
                    # each time) that it's a genuine non-numeric source notation -- e.g. McCance
                    # & Widdowson's "N" ("present, no reliable quantified amount"), as opposed to
                    # blank/missing (handled above) or a real parsing bug. Left unset, same as a
                    # genuinely blank cell -- never coerced to 0 or guessed at.
                    warnings.append(
                        "Nutrition value for %r was %r -- not a number, and not blank either "
                        "(a non-numeric source notation) -- left unset per --allow-blank-nutrition "
                        "(human-confirmed this specific value can't be written as a number)." % (label, raw_val))
                else:
                    errors.append("Nutrition value for %r is not usable: %r (%s) -- refusing to write it" % (label, raw_val, problem))

            # Salt is blank but a Sodium (mg) row is filled in -- offer the standard UK/EU
            # conversion (Salt g = Sodium mg x 2.5 / 1000) as a NAMED, opt-in option, never
            # applied automatically. A human must explicitly pass --derive-salt-from-sodium
            # (after being asked, each time -- see SPEC-EXTRACTION.md) for this to take effect.
            if "salt" in blank_fields:
                sodium_row = labels.get("sodium (mg)")
                sodium_val = ns.cell(row=sodium_row, column=per100_col).value if sodium_row else None
                sodium_parsed, _ = parse_nutrition_value(sodium_val, "mg") if sodium_row else (None, None)
                if sodium_parsed is not None:
                    if derive_salt_from_sodium:
                        nutrition["salt"] = round(sodium_parsed * 2.5 / 1000, 4)
                        warnings.append(
                            "Salt (g) was blank in the spec -- derived as %.4fg from Sodium %.1fmg using the "
                            "standard UK/EU conversion (Salt = Sodium x 2.5 / 1000), per --derive-salt-from-sodium "
                            "(human-confirmed)." % (nutrition["salt"], sodium_parsed))
                        del blank_fields["salt"]
                    else:
                        errors.append(
                            "Salt (g) is blank, but Sodium (mg) = %r is present -- salt CAN be derived via the "
                            "standard conversion (Salt = Sodium x 2.5 / 1000), but this requires a human decision "
                            "each time; re-run with --derive-salt-from-sodium if confirmed." % sodium_val)
                        del blank_fields["salt"]

            # Any remaining blank field is a hard error UNLESS a human has explicitly named it
            # via --allow-blank-nutrition (after being asked, each time) as a confirmed real gap
            # in the source document -- in which case it's simply omitted from `nutrition`
            # (so an --apply run leaves the ingredient's existing value for that field untouched)
            # and recorded as a warning, never silently dropped without a trace.
            for field, label in blank_fields.items():
                if field in allow_blank_nutrition:
                    warnings.append(
                        "Nutrition value for %r is blank/N-A in the spec, with no alternate value on the sheet -- "
                        "left unset per --allow-blank-nutrition (human-confirmed real gap in the source document)." % label)
                else:
                    errors.append("Nutrition value for %r is blank/N-A in the spec" % label)

    if "kcal" in nutrition and "protein" in nutrition and "carb" in nutrition and "fat" in nutrition:
        expected = 4 * nutrition["protein"] + 4 * nutrition["carb"] + 9 * nutrition["fat"]
        actual = nutrition["kcal"]
        if actual > 0 and abs(expected - actual) / actual > 0.15:
            warnings.append("Sanity check failed: kcal (%.1f) doesn't match 4*protein+4*carb+9*fat (%.1f) within 15%% -- verify against the source spec before trusting" % (actual, expected))

    # Recognised container/pack-format words -- a plausibility check, not a hard whitelist. The
    # cell being found and non-empty doesn't mean the *value* actually makes sense as a pack
    # format: this row's free-text answer could describe the product's physical state ("Liquid",
    # "Frozen", "Powder") instead of what it's packaged IN, especially if a future template
    # moves this question or a supplier answers the wrong thing. If none of these words appear
    # anywhere in the extracted text, flag it rather than trust it blindly.
    PLAUSIBLE_PACK_FORMAT_WORDS = [
        "bag", "box", "bottle", "tub", "pouch", "sachet", "jar", "can", "carton", "tray",
        "drum", "pallet", "sack", "pot", "bucket", "container", "roll", "wrap", "film",
        "keg", "cartridge", "tube", "crate", "blister", "barrel", "canister", "pail",
        "sleeve", "case", "vac pack", "vacuum",
    ]

    def check_pack_format_plausible(value):
        v = value.lower()
        if any(word in v for word in PLAUSIBLE_PACK_FORMAT_WORDS):
            return None
        return ("Pack Format extracted as %r, but that doesn't read like a container/pack type "
                "(expected something like Bag/Box/Bottle/Tub/Pouch/etc.) -- it may actually "
                "describe the product's physical state or something else entirely. Flagging "
                "for manual review rather than assuming it's correct." % value)

    PLAUSIBLE_STORAGE_WORDS = ["ambient", "chilled", "frozen", "refrigerat", "cool", "dry", "room temperature"]

    def check_storage_conditions_plausible(value):
        v = value.lower()
        if any(word in v for word in PLAUSIBLE_STORAGE_WORDS):
            return None
        return ("Storage Conditions extracted as %r, but that doesn't read like a storage "
                "condition (expected something like Ambient/Chilled/Frozen/Cool Dry Place) -- "
                "flagging for manual review rather than assuming it's correct." % value)

    # A real shelf life is always a NUMBER of a TIME UNIT ("5 days", "Production + 5 days",
    # "3 months") -- never just prose with no duration in it. Guards against the same class of
    # mistake as the pack format/storage conditions checks: a cell reference drifting onto the
    # wrong row (e.g. landing on the date-FORMAT row just below it, "DDMMYYYY", which has no
    # time-unit word and would otherwise silently get written as if it were a duration).
    # Requires the time-unit word to immediately follow a number (with optional whitespace in
    # between), checking only the RIGHT-hand word boundary -- not both sides. A plain \bday\b
    # word-boundary check fails on real specs that omit the space ("540days": confirmed against
    # a real spec, Frozen Fried Tofu, 2026-09-29) because digits and letters are the same "word
    # character" class in regex, so there's no boundary between the "0" and the "d". Anchoring on
    # "number immediately before the unit" is both more permissive (catches the no-space case)
    # and more precise (a stray unit word elsewhere with no adjacent number still won't match).
    SHELF_LIFE_PATTERN = _re.compile(r"\d\s*(day|days|week|weeks|month|months|year|years|hour|hours|hrs|hr)\b", _re.IGNORECASE)

    def check_shelf_life_plausible(value):
        if SHELF_LIFE_PATTERN.search(value):
            return None
        return ("Shelf Life extracted as %r, but it doesn't read like a duration (expected a "
                "number plus a time unit, e.g. '5 days' or '3 months') -- flagging for manual "
                "review rather than assuming it's correct." % value)

    def check_pack_size_plausible(value):
        if any(ch.isdigit() for ch in value):
            return None
        return ("Pack Size extracted as %r, but it has no digit in it (expected something like "
                "'5 kg' or '480g') -- flagging for manual review rather than assuming it's "
                "correct." % value)

    # Pack Size must be a pure measure (e.g. "10ml", "480g") -- container-type words like
    # "sachet"/"bag"/"tub" belong in Pack Format instead. This matters beyond tidiness: the app
    # uses Pack Size to work out what "1 EACH" of this ingredient weighs/measures for recipe
    # costing and nutrition math, and a value like "10ml sachet" can't be parsed as a number at
    # all, so it silently breaks that calculation. Find every "<number><unit>" token in the raw
    # cell text; if exactly one is found, use that as the clean measure and treat the rest of the
    # text as descriptive (container/count wording that Pack Format already covers separately,
    # so it's dropped here rather than guessed into any other field). If zero or more than one
    # measure is found, leave the value as extracted and flag for manual review -- splitting it
    # automatically in an ambiguous case would risk silently keeping the wrong number.
    PACK_SIZE_UNIT_PATTERN = _re.compile(
        r"(\d+(?:\.\d+)?)\s*(kgs?|g|ml|l|litres?|ltr)\b", _re.IGNORECASE
    )

    def clean_pack_size_measure(raw, warnings):
        matches = list(PACK_SIZE_UNIT_PATTERN.finditer(raw))
        if len(matches) != 1:
            warnings.append(
                "Pack Size cell read %r -- could not isolate a single clear measure (found %d "
                "candidate number+unit token(s)), so left as-is rather than guessing which one "
                "is the real pack size. A person should confirm/clean this up manually if it "
                "contains container wording (e.g. 'sachet', 'bag') that shouldn't be there."
                % (raw, len(matches))
            )
            return raw
        m = matches[0]
        measure = m.group(0).strip()
        if measure != raw:
            warnings.append(
                "Pack Size cell read %r -- reduced to the measure %r, dropping the surrounding "
                "container/count wording (that belongs in Pack Format, which is extracted "
                "separately). This split always requires human confirmation." % (raw, measure)
            )
        return measure

    # --- Pack Size ("1&2 Manufacturer Detail", row "1-d) Weight or Volume") -- this sheet uses
    # a DIFFERENT label layout than every other section extracted so far: the item number
    # ("1-d)") is in column A, the question text is a SEPARATE cell in column B, and the actual
    # answer is in column C. The generic "scan columns left-to-right for the first non-empty
    # cell" approach used below for Pack Format/Storage Conditions would wrongly grab column B's
    # label text here, since it's non-empty -- this section must read column C specifically, not
    # scan for it. Verified against Black Bean Paste: A15="1-d)", B15="Weight or Volume : *",
    # C15="5 kg" -- if B is ever empty for a future spec, this would misread that spec's actual
    # value as coming from the wrong place, so this is intentionally narrower/more literal than
    # the generic pattern rather than trying to generalise across two different label layouts.
    pack_size = None
    manufacturer_sheet_name = next((n for n in sheet_names if "Manufacturer Detail" in n), None)
    if manufacturer_sheet_name:
        ms = wb[manufacturer_sheet_name]
        row = find_row_starting_with(ms, "1-d)")
        if row is None:
            warnings.append("Could not find the '1-d) Weight or Volume' row in '%s' -- Pack Size not extracted" % manufacturer_sheet_name)
        else:
            v = cell_text(ms.cell(row=row, column=3), warnings, "Pack Size")  # column C
            if v is not None and v.strip():
                pack_size = v.strip()
                implausible = check_pack_size_plausible(pack_size)
                if implausible:
                    warnings.append(implausible)
                else:
                    pack_size = clean_pack_size_measure(pack_size, warnings)
            else:
                warnings.append("Row '1-d)' in '%s', column C is empty -- Pack Size not extracted" % manufacturer_sheet_name)
    else:
        warnings.append("No sheet matching 'Manufacturer Detail' found -- Pack Size not extracted")

    pack_format = None
    storage_conditions = None
    shelf_life = None
    combined_row = None
    # "Packaging" alone, not "Packaging Detail" -- same newer template variant names this sheet
    # "Packaging & Label Information", which doesn't contain "Packaging Detail" verbatim.
    packaging_sheet_name = next((n for n in sheet_names if "Packaging" in n), None)
    if packaging_sheet_name:
        ps = wb[packaging_sheet_name]
        row = find_row_starting_with(ps, "4-a)")
        if row is None:
            warnings.append("Could not find the '4-a) Inner packaging format' row in '%s' -- Pack Format not extracted" % packaging_sheet_name)
        else:
            for col in range(2, 15):
                v = cell_text(ps.cell(row=row, column=col), warnings, "Pack Format")
                if v is not None and v.strip():
                    pack_format = v.strip()
                    break
            if pack_format is None:
                warnings.append("Row '4-a)' in '%s' has no value in any column -- Pack Format not extracted" % packaging_sheet_name)
            else:
                implausible = check_pack_format_plausible(pack_format)
                if implausible:
                    warnings.append(implausible)
    else:
        warnings.append("No sheet matching 'Packaging Detail' found -- Pack Format not extracted")

    durability_sheet_name = next((n for n in sheet_names if "Durability" in n), None)
    if durability_sheet_name:
        ds = wb[durability_sheet_name]
        row = find_row_starting_with(ds, "5-f)")
        if row is None:
            # Fallback: the "Branches" template variant (confirmed 2026-09-30, Shichimi Pepper +
            # Black Sesame Seeds) doesn't have a separate "5-f)" row at all -- it combines
            # Storage Conditions and Shelf Life into one row instead (its own numbering, e.g.
            # "8-b) Shelf life & Storage conditions: *"), split by "/" ("540 days / Store cool
            # and dry place"). Only engaged when the normal row is genuinely absent, so this
            # never overrides or competes with the standard template's own "5-f)"/"5-a)" rows.
            combined_row = find_row_containing(ds, "shelf life & storage conditions")
            if combined_row is not None:
                combined_val = None
                for col in range(2, 15):
                    v = cell_text(ds.cell(row=combined_row, column=col), warnings, "Shelf Life & Storage Conditions")
                    if v is not None and v.strip():
                        combined_val = v.strip()
                        break
                if combined_val:
                    if "/" in combined_val:
                        shelf_part, storage_part = combined_val.split("/", 1)
                        shelf_part, storage_part = shelf_part.strip(), storage_part.strip()
                    else:
                        # No "/" separator present -- can't safely split into two fields, so the
                        # whole value goes to Shelf Life (the more specific of the two labels in
                        # the combined row name) and Storage Conditions stays unextracted, same
                        # as any other "couldn't find this field" case.
                        shelf_part, storage_part = combined_val, None
                    min_row = find_row_containing(ds, "minimum shelf life on deli")  # covers both "delivery" and the "deliery" typo seen in real specs (stops short of the "v" so either spelling matches)
                    min_val = None
                    if min_row is not None:
                        for col in range(2, 15):
                            v = cell_text(ds.cell(row=min_row, column=col), warnings, "Minimum Shelf Life on Delivery")
                            if v is not None and str(v).strip() and str(v).strip().upper() != "N/A":
                                min_val = str(v).strip()
                                break
                    shelf_life = ("%s, minimum on delivery %s" % (shelf_part, min_val)) if min_val else shelf_part
                    storage_conditions = storage_part
                    warnings.append(
                        "This spec's template combines Shelf Life and Storage Conditions into one cell "
                        "(%r) instead of the usual separate '5-a)'/'5-f)' rows -- split on the '/' "
                        "separator into Shelf Life %r and Storage Conditions %r (plus the separate "
                        "minimum-on-delivery row, if present). This split itself, not just the final "
                        "values, always requires explicit human confirmation." % (combined_val, shelf_life, storage_part))
                else:
                    warnings.append("Row matching 'Shelf life & Storage conditions' in '%s' has no value in any column -- Storage Conditions/Shelf Life not extracted" % durability_sheet_name)
            else:
                warnings.append("Could not find the '5-f) Storage conditions' row in '%s' -- Storage Conditions not extracted" % durability_sheet_name)
        else:
            for col in range(2, 15):
                v = cell_text(ds.cell(row=row, column=col), warnings, "Storage Conditions")
                if v is not None and v.strip():
                    storage_conditions = v.strip()
                    break
            if storage_conditions is None:
                warnings.append("Row '5-f)' in '%s' has no value in any column -- Storage Conditions not extracted" % durability_sheet_name)
        if storage_conditions is not None:
            implausible = check_storage_conditions_plausible(storage_conditions)
            if implausible:
                warnings.append(implausible)
            # Always human-confirmed, even when it passes every automated check -- per
            # explicit user instruction 2026-09-29, prompted by the degree-symbol rich-text
            # case above: a wrong storage temperature is a real food-safety risk, and with
            # uploads expected to be infrequent going forward (roughly weekly), the extra
            # confirmation step costs nothing. This is deliberately unconditional -- it fires
            # on every extraction with a Storage Conditions value, not just implausible ones.
            warnings.append("Storage Conditions extracted as %r -- always requires explicit human confirmation before writing (temperature-relevant, safety-critical), regardless of whether it looks plausible. Confirm this matches what the source spec actually states, then re-run with --confirm-warnings." % storage_conditions)
        # --- Shelf Life ("5-a)" on the same Durability sheet) -- the label text varies between
        # spec revisions ("5-a) Shelf Life from manufacturer : *" vs "...& Minimum shelf life on
        # delivery : *"), so this matches on the "5-a)" prefix only, same approach as everything
        # else in this file that's found by item-number prefix rather than the full question text.
        # (shelf_life may already be set by the combined-row fallback above -- only search the
        # standard "5-a)" row when it isn't.)
        if shelf_life is None:
            sl_row = find_row_starting_with(ds, "5-a)")
            if sl_row is None:
                if combined_row is None:
                    # Only warn about the missing standard row when the combined-row fallback
                    # didn't already explain the absence (its own "no value" warning above covers
                    # that case; this avoids reporting the same gap twice under two different
                    # messages).
                    warnings.append("Could not find the '5-a) Shelf Life' row in '%s' -- Shelf Life not extracted" % durability_sheet_name)
            else:
                for col in range(2, 15):
                    v = cell_text(ds.cell(row=sl_row, column=col), warnings, "Shelf Life")
                    if v is not None and v.strip():
                        shelf_life = v.strip()
                        break
                if shelf_life is None:
                    warnings.append("Row '5-a)' in '%s' has no value in any column -- Shelf Life not extracted" % durability_sheet_name)
        if shelf_life is not None:
            implausible = check_shelf_life_plausible(shelf_life)
            if implausible:
                warnings.append(implausible)
            # Always human-confirmed -- same reasoning and same date as the Storage
            # Conditions rule just above.
            warnings.append("Shelf Life extracted as %r -- always requires explicit human confirmation before writing (safety-relevant), regardless of whether it looks plausible. Confirm this matches what the source spec actually states, then re-run with --confirm-warnings." % shelf_life)
    else:
        warnings.append("No sheet matching 'Durability' found -- Storage Conditions/Shelf Life not extracted")

    # --- Legal Ingredient Declaration: the composition list as it would appear on a label,
    # lives on the recipe sheet, one row below its own label ("Legal Ingredient Declaration
    # (conform with Food Regulation Information 2014)"). The actual text is always in a merged
    # cell -- openpyxl gives the value on the merge's top-left anchor regardless, so reading
    # column A of the row right after the label works whether it's merged across 1 row or 10.
    ingredients_list = None
    declaration_row = find_row_starting_with(ws, "Legal Ingredient Declaration")
    if declaration_row is None:
        warnings.append("Could not find a 'Legal Ingredient Declaration' row on '%s' -- Ingredients List not extracted" % recipe_sheet_name)
    else:
        v = cell_text(ws.cell(row=declaration_row + 1, column=1), warnings, "Ingredients List")
        if v is not None and v.strip():
            ingredients_list = v.strip()
        else:
            warnings.append("Row after 'Legal Ingredient Declaration' on '%s' is empty -- Ingredients List not extracted" % recipe_sheet_name)

    # --- Allergens: locate header row + the actual "contains?" column dynamically, then
    # require EVERY expected category to be present as its own row before trusting any of it.
    allergens = []
    as_ = wb[allergen_sheet_name]
    allergen_header_row = find_row_starting_with(as_, "Potential Component")
    if allergen_header_row is None:
        errors.append("Could not find the 'Potential Component' header row in '%s' -- allergen table layout not recognised, REFUSING to extract allergens" % allergen_sheet_name)
    else:
        contains_col = find_col_in_row(as_, allergen_header_row, "contains?")
        if contains_col is None:
            errors.append("Could not find a 'Product contains?' column on the allergen header row of '%s' -- refusing to guess which column holds Y/N" % allergen_sheet_name)
        else:
            # Stop before "Section 9" (Dietary Requirement) -- that table's rows (Vegetarian/
            # Vegan suitability) use descriptive text like "may contain animal by-product e.g.
            # milk/egg" that a loose substring match would misread as a Milk/Egg allergen row.
            # Restricting the range AND requiring the row label to *start with* the category
            # name (never just "contain" it anywhere) is belt-and-braces against that class of
            # false match -- verified necessary: an earlier substring-anywhere version of this
            # matched exactly that description text on a real spec before this fix.
            section9_row = find_row_starting_with(as_, "Section 9")
            last_row = (section9_row - 1) if section9_row else as_.max_row
            row_labels = {}
            for row in as_.iter_rows(min_row=allergen_header_row, max_row=last_row, max_col=1):
                cell = row[0]
                if cell.value:
                    row_labels[str(cell.value).strip().lower()] = cell.row

            found_categories = set()
            for label_lower, row_num in row_labels.items():
                for key in EXPECTED_ALLERGEN_ROWS:
                    if label_lower.startswith(key):
                        found_categories.add(key)
                        val = as_.cell(row=row_num, column=contains_col).value
                        val_norm = str(val).strip().upper() if val is not None else ""
                        # YES/NO is an unambiguous synonym for Y/N on any allergen row.
                        if val_norm == "YES":
                            val_norm = "Y"
                        elif val_norm == "NO":
                            val_norm = "N"
                        elif key == "sulphite" and val_norm not in ("Y", "N"):
                            # Sulphites/sulphur dioxide is the ONLY one of the 14 allergens with a
                            # legal declaration threshold (10mg/kg or 10mg/L as SO2 -- see
                            # ALLERGEN-THRESHOLDS.md). A spec answer like "N, max 6 (mg/kg)" is
                            # legally consistent with "N" only if the stated max is below 10. This
                            # rule is deliberately restricted to this one allergen -- no other row
                            # has a threshold, so no other row gets this treatment.
                            thresh_match = _re.match(
                                r"^([YN])\s*,?\s*max\s*([\d.]+)\s*\(?\s*mg\s*/\s*(kg|l|litre)\s*\)?$",
                                str(val).strip(), _re.IGNORECASE)
                            if thresh_match:
                                stated_answer, max_val, _unit = thresh_match.groups()
                                max_val = float(max_val)
                                stated_answer = stated_answer.upper()
                                if max_val < 10:
                                    val_norm = stated_answer  # consistent with legal threshold
                                else:
                                    errors.append(
                                        "Sulphites row answer %r states a max of %.1f mg/kg/L, which is AT OR ABOVE "
                                        "the 10mg/kg legal declaration threshold -- refusing to trust a stated %r "
                                        "answer that contradicts the threshold; needs human review" % (val, max_val, stated_answer))
                        if val_norm not in ("Y", "N"):
                            errors.append("Allergen row %r has an unrecognised contains-value %r (expected Y or N) -- refusing to assume either way" % (label_lower, val))
                        elif val_norm == "Y":
                            allergen = EXPECTED_ALLERGEN_ROWS[key]
                            if allergen not in allergens:
                                allergens.append(allergen)
                        break

            missing = sorted(set(EXPECTED_ALLERGEN_ROWS.keys()) - found_categories)
            if missing:
                errors.append("Allergen categories expected by this template were NOT found in the sheet (could mean the format changed and a category was dropped): %s -- REFUSING to extract any allergens, since a missing category cannot be confirmed absent" % missing)

    # Pack Size and Pack Format are always human-confirmed, same as Storage Conditions and Shelf
    # Life above -- per explicit user instruction 2026-10-07, after a review of how Pack Size is
    # read found several live values still holding ranges, two-size strings, net-vs-gross text and
    # a source typo (2.5g for 2.5kg) that no automated check can reliably catch. Unconditional on
    # purpose: fires on every extraction that has a value, even a clean single measure. Both are
    # emitted here, after both fields are final, so one point covers every extraction path.
    if pack_size is not None:
        warnings.append("Pack Size extracted as %r -- always requires explicit human confirmation before writing, regardless of whether it looks plausible. It must be a single measure for ONE unit (e.g. '10ml', '1kg') with no container or count wording; confirm it against the source spec, then re-run with --confirm-warnings." % pack_size)
    if pack_format is not None:
        warnings.append("Pack Format extracted as %r -- always requires explicit human confirmation before writing, regardless of whether it looks plausible. This is where container type and count/case wording belong; confirm it against the source spec, then re-run with --confirm-warnings." % pack_format)

    status = "cannot_extract" if errors else ("extracted_with_warnings" if warnings else "ok")
    return {
        "status": status,
        "sourceFile": path,
        "name": name,
        "code": primary_code,
        "altCode": alt_code,
        "nutrition": nutrition,
        "allergens": allergens,
        "packSize": pack_size,
        "packFormat": pack_format,
        "storageConditions": storage_conditions,
        "shelfLife": shelf_life,
        "ingredientsList": ingredients_list,
        "errors": errors,
        "warnings": warnings,
    }

if __name__ == "__main__":
    args = sys.argv[1:]
    override_code = None
    if "--override-code" in args:
        idx = args.index("--override-code")
        override_code = args[idx + 1]
        del args[idx:idx + 2]
    derive_salt_from_sodium = "--derive-salt-from-sodium" in args
    if derive_salt_from_sodium:
        args.remove("--derive-salt-from-sodium")
    allow_blank_nutrition = ()
    if "--allow-blank-nutrition" in args:
        idx = args.index("--allow-blank-nutrition")
        allow_blank_nutrition = tuple(f.strip() for f in args[idx + 1].split(","))
        del args[idx:idx + 2]
    confirm_cross_sheet_mismatch = "--confirm-cross-sheet-mismatch" in args
    if confirm_cross_sheet_mismatch:
        args.remove("--confirm-cross-sheet-mismatch")
    correct_unit_mismatch = ()
    if "--correct-unit-mismatch" in args:
        idx = args.index("--correct-unit-mismatch")
        correct_unit_mismatch = tuple(f.strip() for f in args[idx + 1].split(","))
        del args[idx:idx + 2]
    result = extract(args[0], override_code=override_code,
                      derive_salt_from_sodium=derive_salt_from_sodium,
                      allow_blank_nutrition=allow_blank_nutrition,
                      confirm_cross_sheet_mismatch=confirm_cross_sheet_mismatch,
                      correct_unit_mismatch=correct_unit_mismatch)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    sys.exit(0 if result["status"] == "ok" else 1)
