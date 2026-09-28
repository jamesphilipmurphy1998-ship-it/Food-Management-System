"""Extract nutrition + allergens from a Wasabi Raw Material Specification .xlsx, per the
mapping documented in SPEC-EXTRACTION.md. Outputs JSON to stdout: {code, name, nutrition,
allergens, warnings}. Does not touch the live site -- read-only against the spec file.

Usage: python scripts/spec-extract.py "<path to .xlsx>"
"""
import sys
import json
import re
import openpyxl

EU_ALLERGENS_FROM_SPEC_ROW = {
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
    "sulphur dioxide": "Sulphur dioxide",
    "celery": "Celery",
}

def find_header_row(ws, label_prefix):
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, max_col=1):
        cell = row[0]
        if cell.value and str(cell.value).strip().startswith(label_prefix):
            return cell.row
    return None

def extract(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    warnings = []

    # --- Product code (from "3 Ingredient & Recipe", cross-checked against every other sheet) ---
    recipe_sheet_name = next((n for n in wb.sheetnames if "Ingredient & Recipe" in n), None)
    if not recipe_sheet_name:
        raise RuntimeError("Could not find an 'Ingredient & Recipe' sheet")
    ws = wb[recipe_sheet_name]
    name = ws["C3"].value
    raw_code = str(ws["C4"].value or "").strip()
    m = re.match(r"^([A-Za-z0-9\-]+)", raw_code)
    primary_code = m.group(1) if m else raw_code
    paren_m = re.search(r"\(([A-Za-z0-9\-]+)\)", raw_code)
    alt_code = paren_m.group(1) if paren_m else None

    # Cross-check every other sheet's own header agrees on the same product code
    for sn in wb.sheetnames:
        if sn == recipe_sheet_name:
            continue
        s = wb[sn]
        c4 = s["C4"].value
        if c4 and str(c4).strip() and str(c4).strip() != raw_code:
            warnings.append("Sheet '%s' has a different Product Code (%r) than '%s' (%r)" % (sn, c4, recipe_sheet_name, raw_code))

    # --- Nutrition ("7 Nutrition Information") ---
    nut_sheet_name = next((n for n in wb.sheetnames if "Nutrition Information" in n), None)
    nutrition = {}
    if nut_sheet_name:
        ns = wb[nut_sheet_name]
        header_row = find_header_row(ns, "Typical Values")
        if header_row is None:
            warnings.append("Could not find the 'Typical Values' header row in the nutrition sheet")
        else:
            col_header = ns.cell(row=header_row, column=3).value or ""
            if "100" not in str(col_header):
                warnings.append("Column C header does not say 'Per 100g' (found %r) -- verify before trusting these values" % col_header)
            field_map = [
                ("Energy (KJ)", "kj"),
                ("Energy (Kcal)", "kcal"),
                ("Fat (g)", "fat"),
                ("*of which saturate fat (g)", "sat"),
                ("Carbohydrate (g)", "carb"),
                ("*of which sugar (g)", "sugar"),
                ("Protein (g)", "protein"),
                ("Fiber (g)", "fibre"),
                ("Salt (g)", "salt"),
            ]
            labels = {}
            for row in ns.iter_rows(min_row=header_row, max_row=ns.max_row, max_col=1):
                cell = row[0]
                if cell.value:
                    labels[str(cell.value).strip().rstrip("*").strip()] = cell.row
            for label, field in field_map:
                target = label.rstrip("*").strip()
                found_row = None
                for lbl, r in labels.items():
                    if lbl.lower() == target.lower():
                        found_row = r
                        break
                if found_row is None:
                    warnings.append("Nutrition row not found for %r" % label)
                    continue
                val = ns.cell(row=found_row, column=3).value
                if isinstance(val, (int, float)):
                    nutrition[field] = val
                elif val is not None and str(val).strip().upper() not in ("N/A", ""):
                    warnings.append("Nutrition value for %r is not numeric: %r" % (label, val))

        if "kcal" in nutrition and "protein" in nutrition and "carb" in nutrition and "fat" in nutrition:
            expected = 4 * nutrition["protein"] + 4 * nutrition["carb"] + 9 * nutrition["fat"]
            actual = nutrition["kcal"]
            if actual > 0 and abs(expected - actual) / actual > 0.15:
                warnings.append("Sanity check failed: kcal (%.1f) doesn't match 4*protein+4*carb+9*fat (%.1f) within 15%%" % (actual, expected))
    else:
        warnings.append("No 'Nutrition Information' sheet found")

    # --- Allergens ("8&9 Intolerance & Dietary") ---
    allergen_sheet_name = next((n for n in wb.sheetnames if "Intolerance" in n), None)
    allergens = []
    if allergen_sheet_name:
        as_ = wb[allergen_sheet_name]
        for row in as_.iter_rows(min_row=1, max_row=as_.max_row, max_col=5):
            label_cell, contains_cell = row[0], row[4] if len(row) > 4 else None
            if not label_cell.value or contains_cell is None or contains_cell.value != "Y":
                continue
            label_lower = str(label_cell.value).strip().lower()
            for key, allergen in EU_ALLERGENS_FROM_SPEC_ROW.items():
                if key in label_lower:
                    if allergen not in allergens:
                        allergens.append(allergen)
                    break
    else:
        warnings.append("No 'Intolerance & Dietary' sheet found")

    return {
        "sourceFile": path,
        "name": name,
        "code": primary_code,
        "altCode": alt_code,
        "nutrition": nutrition,
        "allergens": allergens,
        "warnings": warnings,
    }

if __name__ == "__main__":
    result = extract(sys.argv[1])
    print(json.dumps(result, indent=2, ensure_ascii=False))
