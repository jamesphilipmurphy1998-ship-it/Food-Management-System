"""Extract nutrition + allergens from a Wasabi Raw Material Specification .xlsx, per the
mapping documented in SPEC-EXTRACTION.md. Outputs JSON to stdout.

SAFETY-CRITICAL: an allergen extracted wrong is a consumer safety incident, not a cosmetic
bug. This script refuses to produce anything spec-apply.js will treat as safe to write unless
every structural check below passes AND every allergen category this template defines was
actually found and read from a validated column -- never assumed from a fixed cell address. A
format the code doesn't recognise must come back as `"status": "cannot_extract"` with a clear
`errors` list, never as an empty/partial/best-guess result silently treated as "no allergens."

Usage: python scripts/spec-extract.py "<path to .xlsx>"
Exit code 0 with status "ok" only when the format was fully recognised and nothing looked off.
Exit code 1 (status "cannot_extract" or "extracted_with_warnings") otherwise -- spec-apply.js
refuses --apply unless it sees status "ok".
"""
import sys
import json
import re
import openpyxl

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

def parse_nutrition_value(val, expected_unit):
    """Accept a bare number, OR a number immediately followed by its own column's stated unit
    (e.g. "1.24g" in a "Fat (g)" column) -- some suppliers write the unit inline rather than
    leaving a pure number. Deliberately narrow: the suffix must match THIS field's own unit
    (case-insensitively), never any arbitrary trailing text -- "1.24ml" in a "Fat (g)" column
    would still be refused, since that's a real discrepancy worth a human's attention, not a
    formatting quirk to silently paper over."""
    if isinstance(val, (int, float)):
        return val, None
    if val is None:
        return None, "blank"
    s = str(val).strip()
    if not s or s.upper() == "N/A":
        return None, "blank"
    m = _re.match(r"^([\d.]+)\s*([A-Za-z]*)$", s)
    if not m:
        return None, "unparseable"
    number_part, suffix = m.group(1), m.group(2).strip().lower()
    if suffix and suffix != expected_unit.lower():
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

def find_col_in_row(ws, row_num, text_contains, max_col=20):
    for col in range(1, max_col + 1):
        v = ws.cell(row=row_num, column=col).value
        if v and text_contains.lower() in str(v).lower():
            return col
    return None

def extract(path):
    errors = []
    warnings = []

    try:
        wb = openpyxl.load_workbook(path, data_only=True)
    except Exception as e:
        return {"status": "cannot_extract", "sourceFile": path, "errors": ["Could not open file as .xlsx: %s" % e], "warnings": []}

    # --- Locate the three sheets this extraction depends on, by name pattern, not fixed index ---
    recipe_sheet_name = next((n for n in wb.sheetnames if "Ingredient & Recipe" in n), None)
    nut_sheet_name = next((n for n in wb.sheetnames if "Nutrition Information" in n), None)
    allergen_sheet_name = next((n for n in wb.sheetnames if "Intolerance" in n), None)
    if not recipe_sheet_name:
        errors.append("No sheet matching 'Ingredient & Recipe' found -- cannot determine product code. Sheet names present: %s" % wb.sheetnames)
    if not nut_sheet_name:
        errors.append("No sheet matching 'Nutrition Information' found. Sheet names present: %s" % wb.sheetnames)
    if not allergen_sheet_name:
        errors.append("No sheet matching 'Intolerance' found -- CANNOT determine allergens, refusing to proceed. Sheet names present: %s" % wb.sheetnames)
    if errors:
        return {"status": "cannot_extract", "sourceFile": path, "errors": errors, "warnings": warnings}

    # --- Product code + name ---
    ws = wb[recipe_sheet_name]
    name = ws["C3"].value
    raw_code = str(ws["C4"].value or "").strip()
    if not raw_code:
        errors.append("Product Code cell (C4 on '%s') is empty" % recipe_sheet_name)
    m = re.match(r"^([A-Za-z0-9\-]+)", raw_code) if raw_code else None
    primary_code = m.group(1) if m else None
    paren_m = re.search(r"\(([A-Za-z0-9\-]+)\)", raw_code) if raw_code else None
    alt_code = paren_m.group(1) if paren_m else None
    if not primary_code:
        errors.append("Could not parse a product code out of C4 value %r" % raw_code)

    # Every sheet must agree on the same product code -- a mismatch means either a corrupted
    # file or (more dangerously) sheets copy-pasted from a different product's spec.
    for sn in wb.sheetnames:
        if sn == recipe_sheet_name:
            continue
        s = wb[sn]
        c4 = s["C4"].value
        if c4 and str(c4).strip() and str(c4).strip() != raw_code:
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
            for label, field, unit in NUTRITION_FIELDS:
                target = label.rstrip("*").strip().lower()
                found_row = labels.get(target)
                if found_row is None:
                    errors.append("Nutrition row for %r not found in '%s' -- template may have changed" % (label, nut_sheet_name))
                    continue
                raw_val = ns.cell(row=found_row, column=per100_col).value
                parsed, problem = parse_nutrition_value(raw_val, unit)
                if parsed is not None:
                    nutrition[field] = parsed
                elif problem == "blank":
                    errors.append("Nutrition value for %r is blank/N-A in the spec" % label)
                else:
                    errors.append("Nutrition value for %r is not usable: %r (%s) -- refusing to write it" % (label, raw_val, problem))

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

    def check_pack_size_plausible(value):
        if any(ch.isdigit() for ch in value):
            return None
        return ("Pack Size extracted as %r, but it has no digit in it (expected something like "
                "'5 kg' or '480g') -- flagging for manual review rather than assuming it's "
                "correct." % value)

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
    manufacturer_sheet_name = next((n for n in wb.sheetnames if "Manufacturer Detail" in n), None)
    if manufacturer_sheet_name:
        ms = wb[manufacturer_sheet_name]
        row = find_row_starting_with(ms, "1-d)")
        if row is None:
            warnings.append("Could not find the '1-d) Weight or Volume' row in '%s' -- Pack Size not extracted" % manufacturer_sheet_name)
        else:
            v = ms.cell(row=row, column=3).value  # column C
            if v is not None and str(v).strip():
                pack_size = str(v).strip()
                implausible = check_pack_size_plausible(pack_size)
                if implausible:
                    warnings.append(implausible)
            else:
                warnings.append("Row '1-d)' in '%s', column C is empty -- Pack Size not extracted" % manufacturer_sheet_name)
    else:
        warnings.append("No sheet matching 'Manufacturer Detail' found -- Pack Size not extracted")

    pack_format = None
    storage_conditions = None
    packaging_sheet_name = next((n for n in wb.sheetnames if "Packaging Detail" in n), None)
    if packaging_sheet_name:
        ps = wb[packaging_sheet_name]
        row = find_row_starting_with(ps, "4-a)")
        if row is None:
            warnings.append("Could not find the '4-a) Inner packaging format' row in '%s' -- Pack Format not extracted" % packaging_sheet_name)
        else:
            for col in range(2, 15):
                v = ps.cell(row=row, column=col).value
                if v is not None and str(v).strip():
                    pack_format = str(v).strip()
                    break
            if pack_format is None:
                warnings.append("Row '4-a)' in '%s' has no value in any column -- Pack Format not extracted" % packaging_sheet_name)
            else:
                implausible = check_pack_format_plausible(pack_format)
                if implausible:
                    warnings.append(implausible)
    else:
        warnings.append("No sheet matching 'Packaging Detail' found -- Pack Format not extracted")

    durability_sheet_name = next((n for n in wb.sheetnames if "Durability" in n), None)
    if durability_sheet_name:
        ds = wb[durability_sheet_name]
        row = find_row_starting_with(ds, "5-f)")
        if row is None:
            warnings.append("Could not find the '5-f) Storage conditions' row in '%s' -- Storage Conditions not extracted" % durability_sheet_name)
        else:
            for col in range(2, 15):
                v = ds.cell(row=row, column=col).value
                if v is not None and str(v).strip():
                    storage_conditions = str(v).strip()
                    break
            if storage_conditions is None:
                warnings.append("Row '5-f)' in '%s' has no value in any column -- Storage Conditions not extracted" % durability_sheet_name)
            else:
                implausible = check_storage_conditions_plausible(storage_conditions)
                if implausible:
                    warnings.append(implausible)
    else:
        warnings.append("No sheet matching 'Durability' found -- Storage Conditions not extracted")

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
        "errors": errors,
        "warnings": warnings,
    }

if __name__ == "__main__":
    result = extract(sys.argv[1])
    print(json.dumps(result, indent=2, ensure_ascii=False))
    sys.exit(0 if result["status"] == "ok" else 1)
