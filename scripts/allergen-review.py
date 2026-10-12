#!/usr/bin/env python
"""allergen-review.py -- READ-ONLY review of every spec's allergen answers against what is on the live site (the Pi).

Writes nothing to the site. It reads: the live ingredients (allergen ticks + Allergen notes) over ssh with SELECTs, the spec-data
archives (to find each ingredient's spec file) and the spec files themselves (every allergen row, ALL answer columns).
Output: ALLERGEN-FULL-REVIEW.md in the repo (script-generated) and a summary on screen.

Rules applied (from SPEC-EXTRACTION.md and ALLERGEN-THRESHOLDS.md):
 * A tick means the product CONTAINS the allergen ("Product contains?" = Yes). Wheat/oat/rye/spelt/barley/"gluten level" -> Cereals containing gluten.
 * Cross-contamination / "handled or used on site" / "below ppm" answers on a row answered No stay a NO (no tick); the supplier wording belongs in the
   Allergen notes box.
 * A row answered Yes whose comment claims an exemption or threshold is NEVER automatic: it needs the user's decision each time.
 * Only sulphites/sulphur dioxide has a numeric threshold (10 mg/kg or mg/L as SO2); the other 13 have none (any deliberate presence is declared).
"""
import glob, json, os, re, shutil, subprocess, sys, tempfile, warnings
warnings.filterwarnings("ignore")
import openpyxl

PI = "dizziness7883@192.168.0.50"
FOLDER = r"C:\Users\JamesMurphy\OneDrive - Wasabi\WASUK - Food Team - NPD\New Wasabi System Development\FMS System\3. Supporting Docs\Ingredient Specs"
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(REPO, "ALLERGEN-FULL-REVIEW.md")

REMOTE = r'''
CONN=$(systemctl show nutricost -p Environment --value | tr ' ' '\n' | tr -d '"' | grep -m1 '^NUTRICOST_DB=' | sed 's/^NUTRICOST_DB=//')
get() { echo "$CONN" | tr ';' '\n' | grep -i "^$1=" | head -1 | cut -d= -f2; }
export PGPASSWORD="$(get Password)"; U=$(get Username); H=$(get Host); P=$(get Port); H=${H:-localhost}; P=${P:-5432}
psql -h $H -p $P -U $U -d nutricost -At -c "select coalesce(json_agg(x),'[]'::json) from (select code, name, allergens, allergen_notes, ingredients_list from ingredients order by code) x"
'''

ROWMAP = [  # (regex on the row label start, site allergen)
    (r"^(wheat|oat|rye|spelt|barley|gluten level)", "Cereals containing gluten"),
    (r"^crustacean", "Crustaceans"), (r"^egg", "Eggs"), (r"^fish", "Fish"), (r"^lupin", "Lupin"), (r"^milk", "Milk"),
    (r"^mollusc", "Molluscs"), (r"^mustard", "Mustard"), (r"^nut/nut|^nut\b", "Nuts"), (r"^peanut", "Peanuts"),
    (r"^sesame", "Sesame"), (r"^soya", "Soya"), (r"^sulphite", "Sulphur dioxide"), (r"^celery", "Celery"),
]
EXEMPT = re.compile(r"ppm|exempt|not (be )?(require|declar)|no allergen|declaration|below|<|trace|naturally|carry|annex|not declarable|non-functional", re.I)
HANDLED = re.compile(r"handled|used on|on site|same (line|site)|shared|may contain|cross", re.I)
norm = lambda v: re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""
yes = lambda v: v.strip().lower().startswith(("y", "present"))
no = lambda v: v.strip().lower().startswith("n")

# decisions already made by the user (so they are shown as decided, not as new findings)
DECIDED = {
    "106153": "10-07 user: NO allergens ticked although wheat/barley rows say Yes (supplier: <20ppm, no declaration required); note recorded",
    "106955": "10-07 user: Sulphur dioxide tick LEFT AS IS (spec: 'may contain naturally occurring SO2, not tested'); on the issues list",
    "107049": "10-08 user: Soya ticked; Sulphur dioxide NOT ticked (supplier <10ppm); note recorded",
    "106136": "10-08 user: Soya row No with supplier comment 'E306 is exempt'; note recorded",
    "107247": "10-07 user: 'N- But handled on site' recorded as No (rule); not captured as a note",
    "106957": "10-08 user: handling statements recorded as a note",
    "105951": "09-29: 'N, <=10mg/kg' sulphites read as No (below threshold)",
    "106161": "09-28: 'N, max 6 (mg/kg)' sulphites read as No (below threshold)",
}


def fetch_live():
    r = subprocess.run(["ssh", "-o", "ConnectTimeout=15", PI, "bash -s"], input=REMOTE.replace(chr(13), "").encode("utf-8"), capture_output=True)
    if r.returncode != 0:
        sys.exit("could not read the Pi: " + r.stderr.decode("utf-8", "replace")[:300])
    return {x["code"]: x for x in json.loads(r.stdout.decode("utf-8"))}


def read_rows(path):
    """All EU allergen rows of the spec: [{allergen, label, contains, cross, comments:[...]}], or (None, reason)."""
    tmp = os.path.join(tempfile.gettempdir(), "allergen_review_copy.xlsx")
    try:
        shutil.copy(path, tmp)
        wb = openpyxl.load_workbook(tmp, data_only=True)
    except Exception as e:
        return None, "could not open: " + str(e)[:80]
    # The allergen sheet is the one named "Intolerance" / "Allergen": in some workbooks another sheet (e.g. "Additive & GMO") comes
    # first in the tab order and also has a "Potential component" header, so prefer the right sheet by NAME (bug found 2026-10-12 on 107489).
    ordered = [w for w in wb.worksheets if re.search(r"intolerance|allergen", w.title, re.I)] + [w for w in wb.worksheets if not re.search(r"intolerance|allergen", w.title, re.I)]
    for ws in ordered:
        if not hasattr(ws, "iter_rows"):
            continue
        hdr = None
        for r in range(1, min(ws.max_row, 80) + 1):
            if norm(ws.cell(row=r, column=1).value).lower().startswith("potential component"):
                hdr = r
                break
        if hdr is None:
            continue
        heads = {c: norm(ws.cell(row=hdr, column=c).value) for c in range(1, ws.max_column + 1) if norm(ws.cell(row=hdr, column=c).value)}
        ccol = next((c for c, t in heads.items() if "contains?" in t.lower()), None)
        if ccol is None:
            continue  # a sheet with a "Potential component" header but no "Product contains?" column is not the allergen table
        xcols = [c for c, t in heads.items() if "cross" in t.lower()]
        end = ws.max_row
        for r in range(hdr + 1, ws.max_row + 1):
            if norm(ws.cell(row=r, column=1).value).lower().startswith("section 9"):
                end = r - 1
                break
        rows = []
        for r in range(hdr + 1, end + 1):
            label = norm(ws.cell(row=r, column=1).value)
            if not label:
                continue
            allergen = next((a for pat, a in ROWMAP if re.search(pat, label, re.I)), None)
            if not allergen:
                continue
            contains = norm(ws.cell(row=r, column=ccol).value) if ccol else ""
            cross = " / ".join(norm(ws.cell(row=r, column=c).value) for c in xcols if norm(ws.cell(row=r, column=c).value))
            comments = [norm(ws.cell(row=r, column=c).value) for c in heads if c != ccol and c not in xcols and c > 1 and norm(ws.cell(row=r, column=c).value)]
            rows.append({"allergen": allergen, "label": label.split("/")[0].rstrip(":* "), "contains": contains, "cross": cross, "comments": comments})
        return rows, None
    return None, "no allergen sheet found (non-standard spec)"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    live = fetch_live()
    arch = {}
    for f in glob.glob(os.path.join(REPO, "spec-data", "*.json")):
        a = json.load(open(f, encoding="utf-8"))
        arch[a["code"]] = a
    files = [f for f in os.listdir(FOLDER) if f.lower().endswith((".xlsx", ".xlsm")) and not f.startswith("~$")]
    all_files_xls = [f for f in os.listdir(FOLDER) if f.lower().endswith(".xls")]

    tick_mismatch, exempt_yes, xcontam, handled, odd, unread, clean, no_spec_ticks, multi = [], [], [], [], [], [], [], [], []
    notes_present = {c: l["allergen_notes"] for c, l in live.items() if l.get("allergen_notes")}
    for code in sorted(arch):
        if code not in live:
            unread.append((code, "", "archive code not found on the Pi"))
            continue
        L = live[code]
        a = arch[code]
        base = os.path.basename((a.get("sourceFile") or "").replace("\\", "/"))
        cand = [base] if base in files else [f for f in files if re.search(r"(?<!\d)" + re.escape(code) + r"(?!\d)", f)]
        if not cand:
            xls = [f for f in all_files_xls if code in f]
            unread.append((code, L["name"], "spec is an old .xls (not read here; checked by hand when uploaded)" if xls else "no spec file found in the folder for this code"))
            continue
        if len(cand) > 1:
            cand.sort(key=lambda f: os.path.getmtime(os.path.join(FOLDER, f)), reverse=True)
            multi.append((code, L["name"], cand))
        rows, why = read_rows(os.path.join(FOLDER, cand[0]))
        if rows is None:
            unread.append((code, L["name"], why + " [" + cand[0] + "]"))
            continue
        live_set = set(L.get("allergens") or [])
        spec_yes = set()
        flagged = False
        dec = DECIDED.get(code, "")
        note = L.get("allergen_notes") or ""
        for r in rows:
            c, x = r["contains"], r["cross"]
            ctext = " | ".join(r["comments"])
            if yes(c):
                spec_yes.add(r["allergen"])
                if ctext:  # EVERY Yes row that has ANY supplier comment (a wording filter missed "processing aid / not regarded as an allergen" on 106099)
                    exempt_yes.append((code, L["name"], r["label"], c, ctext, r["allergen"] in live_set, r["allergen"].split()[0].lower() in note.lower(), dec))
                    flagged = True
            elif no(c) or c == "":
                if c == "":
                    odd.append((code, L["name"], r["label"], "(blank)", x, ctext, dec))
                    flagged = True
                if x and yes(x):
                    xcontam.append((code, L["name"], r["label"], x, ctext, r["allergen"].split()[0].lower() in note.lower(), dec))
                    flagged = True
                elif ctext and (EXEMPT.search(ctext) or HANDLED.search(ctext)) and not re.search(r"not (used|handled)|n/?a|free", ctext, re.I):
                    handled.append((code, L["name"], r["label"], c, ctext, r["allergen"].split()[0].lower() in note.lower(), dec))
                    flagged = True
            else:
                odd.append((code, L["name"], r["label"], c, x, ctext, dec))
                flagged = True
        if spec_yes != live_set:
            tick_mismatch.append((code, L["name"], sorted(spec_yes - live_set), sorted(live_set - spec_yes), dec, cand[0]))
        elif not flagged:
            clean.append(code)
    for code, L in sorted(live.items()):
        if code not in arch and (L.get("allergens") or []):
            no_spec_ticks.append((code, L["name"], L["allergens"]))

    out = []
    w = out.append
    w("# Allergen full review (script-generated 2026-10-12, READ-ONLY)\n")
    w("Compares every spec's allergen answers (all three answer columns) with what is on the live site. Nothing was changed. Rules: a tick = the product CONTAINS it; cross-contamination / handled on site / below-ppm on a No row stays a No and belongs in the Allergen notes box; a Yes row with an exemption/threshold comment needs the user's decision each time; only sulphites has a numeric threshold (10 mg/kg), the other 13 have none. See ALLERGEN-THRESHOLDS.md.\n")
    w("The spec file used for each ingredient is the archive's recorded file, or the file in the folder matched by code (it may be a NEWER version than the one uploaded).\n")
    w("## Summary\n")
    w("- Specs read: %d of %d archived ingredients; unreadable / no file: %d" % (len(arch) - len(unread), len(arch), len(unread)))
    w("- A. Allergen TICKS that differ from the spec's 'Product contains?': %d ingredients" % len(tick_mismatch))
    w("- B. Rows answered YES with an exemption/threshold comment: %d rows" % len(exempt_yes))
    w("- C. Rows answered NO with cross-contamination YES: %d rows" % len(xcontam))
    w("- D. Rows answered NO with a handling / threshold / may-contain comment: %d rows" % len(handled))
    w("- E. Odd or blank 'Product contains?' answers: %d rows" % len(odd))
    w("- F. Ingredients with NO spec on file that still carry allergen ticks: %d" % len(no_spec_ticks))
    w("- Ingredients with an Allergen notes entry on the site: %d (%s)" % (len(notes_present), ", ".join(sorted(notes_present))))
    w("- Fully clean (ticks match, no flagged row): %d\n" % len(clean))
    w("## A. Ticks that differ from the spec\n")
    for code, name, missing, extra, dec, f in tick_mismatch:
        w("- %s %s: spec says CONTAINS %s but NOT ticked; ticked but spec does not say contains: %s%s  [%s]" % (code, name, missing or "-", extra or "-", ("  | " + dec) if dec else "", f))
    w("\n## B. Yes + exemption/threshold comment (needs the user's decision; shows whether it is ticked and whether the note box mentions it)\n")
    for code, name, label, c, ctext, ticked, noted, dec in exempt_yes:
        w("- %s %s | %s = %s | ticked on site: %s | note mentions it: %s | comment: \"%s\"%s" % (code, name, label, c, "YES" if ticked else "no", "yes" if noted else "no", ctext, ("  | " + dec) if dec else ""))
    w("\n## C. Declared NOT contained but cross-contamination = Yes (belongs in the Allergen notes box)\n")
    for code, name, label, x, ctext, noted, dec in xcontam:
        w("- %s %s | %s | cross-contamination: %s | note recorded: %s%s%s" % (code, name, label, x, "yes" if noted else "NO", (" | comment: \"%s\"" % ctext) if ctext else "", ("  | " + dec) if dec else ""))
    w("\n## D. Declared NOT contained with a handling / threshold / may-contain comment\n")
    for code, name, label, c, ctext, noted, dec in handled:
        w("- %s %s | %s = %s | note recorded: %s | comment: \"%s\"%s" % (code, name, label, c, "yes" if noted else "NO", ctext, ("  | " + dec) if dec else ""))
    w("\n## E. Odd or blank 'Product contains?' answers\n")
    for code, name, label, c, x, ctext, dec in odd:
        w("- %s %s | %s = %r | cross: %s | comment: \"%s\"%s" % (code, name, label, c, x or "-", ctext, ("  | " + dec) if dec else ""))
    w("\n## F. No spec on file but allergen ticks present\n")
    for code, name, al in no_spec_ticks:
        w("- %s %s: %s" % (code, name, ", ".join(al)))
    w("\n## Specs that could not be read here\n")
    for code, name, why in unread:
        w("- %s %s: %s" % (code, name, why))
    w("\n## Ingredients whose spec has several files in the folder (newest used)\n")
    for code, name, cand in multi:
        w("- %s %s: %s" % (code, name, " || ".join(cand)))
    w("\n## Clean (%d)\n" % len(clean))
    w(", ".join(clean))
    open(OUT, "w", encoding="utf-8").write("\n".join(out) + "\n")
    print("\n".join(out[:12]))
    print("report written:", OUT, "(%d lines)" % len(out))


if __name__ == "__main__":
    main()
