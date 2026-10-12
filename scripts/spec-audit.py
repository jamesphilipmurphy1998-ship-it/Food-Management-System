#!/usr/bin/env python
"""spec-audit.py -- READ-ONLY completeness audit of everything the spec pipeline is supposed to have recorded.

Writes NOTHING: it only runs SELECT queries on the Pi's database over ssh, reads spec-data/*.json and the spec files.
Run it after every upload batch and before every deploy; paste the output to the user. Exit code 1 if any gap is found
in checks A-D (so it can gate a release); check E is informational (it lists, it does not fail).

  python -I scripts/spec-audit.py                 # checks A-D on the live Pi
  python -I scripts/spec-audit.py --left-behind   # also E for every spec in the folder (slow: opens each workbook)
  python -I scripts/spec-audit.py --spec "<path to one spec file>"   # E for ONE spec (use at the confirmation step)

A  every ingredient that has spec data shows a spec FILE NAME on its LATEST version (the "Source:" line)
B  every spec-data archive names a real source file that exists in the Ingredient Specs folder (not "baseline snapshot")
C  every value stored in an archive equals what is live (fields deliberately left unwritten are absent from the archive and skipped)
D  every spec file in the folder is accounted for: archived, or on the held/issues list, or flagged here (whole-folder cross-check)
E  every question on a spec that has an ANSWER but no field in NutriCost is LISTED (nothing silently left behind)
"""
import glob, json, os, re, shutil, subprocess, sys, tempfile

PI = "dizziness7883@192.168.0.50"
FOLDER = r"C:\Users\JamesMurphy\OneDrive - Wasabi\WASUK - Food Team - NPD\New Wasabi System Development\FMS System\3. Supporting Docs\Ingredient Specs"
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SPEC_DATA = os.path.join(REPO, "spec-data")
ISSUES = os.path.join(REPO, "SPEC-ISSUES-TO-REVIEW.md")

REMOTE_SQL = r'''
CONN=$(systemctl show nutricost -p Environment --value | tr ' ' '\n' | tr -d '"' | grep -m1 '^NUTRICOST_DB=' | sed 's/^NUTRICOST_DB=//')
get() { echo "$CONN" | tr ';' '\n' | grep -i "^$1=" | head -1 | cut -d= -f2; }
export PGPASSWORD="$(get Password)"; U=$(get Username); H=$(get Host); P=$(get Port); H=${H:-localhost}; P=${P:-5432}
psql -h $H -p $P -U $U -d nutricost -At -c "select coalesce(json_agg(x),'[]'::json) from (
 select i.code, i.name, i.kj, i.kcal, i.fat, i.sat, i.carb, i.sugar, i.fibre, i.protein, i.salt, i.allergens,
        i.pack_size, i.pack_size_value, i.pack_size_unit, i.pack_format, i.storage_conditions, i.shelf_life,
        i.ingredients_list, i.allergen_notes, i.unit_weight_g,
        (select v.version_number from ingredient_versions v where v.ingredient_id=i.id order by v.version_number desc limit 1) as latest_version,
        (select coalesce(v.comment,'') from ingredient_versions v where v.ingredient_id=i.id order by v.version_number desc limit 1) as latest_comment,
        (select v.version_number from ingredient_versions v where v.ingredient_id=i.id and v.comment ~* '\.xlsx?' order by v.version_number desc limit 1) as spec_comment_version
 from ingredients i order by i.code) x"
'''


def fetch_live():
    # Send BYTES: in text mode Windows turns every newline into CR+LF and the Pi's bash then fails.
    script = REMOTE_SQL.replace(chr(13), "").encode("utf-8")
    r = subprocess.run(["ssh", "-o", "ConnectTimeout=15", PI, "bash -s"], input=script, capture_output=True)
    if r.returncode != 0:
        sys.exit("could not read the Pi database: " + r.stderr.decode("utf-8", "replace").strip()[:300])
    return {row["code"]: row for row in json.loads(r.stdout.decode("utf-8"))}


def num(v):
    return None if v is None or v == "" else round(float(v), 6)


def same(a, b):
    if isinstance(a, (int, float)) or isinstance(b, (int, float)):
        return num(a) == num(b)
    if isinstance(a, list) or isinstance(b, list):
        return sorted(a or []) == sorted(b or [])
    return (a or "").strip() == (b or "").strip()


# ---------------------------------------------------------------- E: answers that have no field
NO_FIELD = [
    ("shelf life / storage ONCE OPENED", r"once opened|after opening|opened shelf"),
    ("transport temperature", r"transport(ation)? temp|temp(erature)? (at|during) transport"),
    ("ready to eat / ready to cook", r"ready to (eat|cook)|is it ready to eat"),
    ("vegetarian suitability", r"^vegetarian"),
    ("vegan suitability", r"^vegan"),
    ("microbiological limits", r"salmonella|listeria|e\.? ?coli|aerobic colony|yeast.{0,6}mou?ld|coliform|enterobacter|staphylococc|bacillus"),
    ("date coding", r"best before|use by|manufacturing date|date (format|coding|location)|production date"),
    ("manufacturer details", r"\baddress\b|telephone|emergency contact|site code|sedex|certification|scope of"),
    ("packaging materials / pallet", r"inner.{0,20}(material|dimension)|outer.{0,20}(material|dimension)|pallet|hs code|commodity code"),
    ("quality checks", r"weigh check|metal detect|visual check|pest control|x-?ray"),
    ("pesticide / palm / GMO / deforestation", r"pesticide|palm oil|\bgmo\b|genetically|deforestation"),
]
NO_ANSWER = {"", "n/a", "na", "none", "-", "n", "no", "0", "nil", "not applicable", "tbc"}


def cell_text(v):
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""


def left_behind(path):
    import openpyxl, warnings
    warnings.filterwarnings("ignore")
    tmp = os.path.join(tempfile.gettempdir(), "specaudit_copy.xlsx")
    shutil.copy(path, tmp)
    wb = openpyxl.load_workbook(tmp, data_only=True)
    found, seen = [], set()
    for ws in wb.worksheets:
        if not hasattr(ws, "iter_rows"):
            continue
        for row in ws.iter_rows(values_only=True):
            cells = [cell_text(c) for c in row]
            for ci in range(min(3, len(cells))):
                label = cells[ci]
                if len(label) < 4:
                    continue
                for cat, pat in NO_FIELD:
                    if re.search(pat, label, re.I):
                        ans = next((c for c in cells[ci + 1:] if c and c.lower().rstrip(".") not in NO_ANSWER and c.lower() != label.lower() and not re.search(pat, c, re.I) or (c and c.lower() in ("yes", "y"))), "")
                        key = (cat, label[:60], ans[:60])
                        if ans and key not in seen:
                            seen.add(key)
                            found.append((cat, label[:70], ans[:90]))
                        break
                break
    return found


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # spec names contain non-cp1252 characters
    args = sys.argv[1:]
    want_E_all = "--left-behind" in args
    one = args[args.index("--spec") + 1] if "--spec" in args else None
    live = fetch_live()
    arch = {}
    for f in sorted(glob.glob(os.path.join(SPEC_DATA, "*.json"))):
        a = json.load(open(f, encoding="utf-8"))
        arch[a["code"]] = a
    files = [f for f in os.listdir(FOLDER) if f.lower().endswith((".xlsx", ".xls", ".xlsm")) and not f.startswith("~$")]
    issues_text = open(ISSUES, encoding="utf-8").read() if os.path.exists(ISSUES) else ""
    gaps = 0
    print("SPEC AUDIT (read-only): %d live ingredients, %d spec-data archives, %d spec files in the folder\n" % (len(live), len(arch), len(files)))

    # A
    A = []
    for code in sorted(arch):
        row = live.get(code)
        if not row:
            continue
        lc = row["latest_comment"] or ""
        if not re.search(r"\.xlsx?", lc, re.I):
            A.append((code, row["name"], "latest v%s; spec file name %s" % (row["latest_version"], ("only on v%s" % row["spec_comment_version"]) if row["spec_comment_version"] else "on NO version")))
    print("A. Source line: spec-loaded ingredients whose LATEST version does not carry a spec file name: %d" % len(A))
    for x in A:
        print("   %s | %s | %s" % x)
    gaps += len(A)

    # B
    B = []
    for code, a in sorted(arch.items()):
        sf = a.get("sourceFile") or ""
        base = os.path.basename(sf.replace("\\", "/"))
        real = base in files
        if "baseline" in sf.lower() or not real:
            cand = [f for f in files if re.search(r"(?<!\d)" + re.escape(code) + r"(?!\d)", f)]
            B.append((code, a.get("name", ""), "archive says %r; folder match by code: %s" % (sf[:60], cand[0] if len(cand) == 1 else ("%d files" % len(cand)))))
    print("\nB. Archives that do not name a real file that exists in the folder: %d" % len(B))
    for x in B:
        print("   %s | %s | %s" % x)
    gaps += len(B)

    # C
    C = []
    for code, a in sorted(arch.items()):
        row = live.get(code)
        if not row:
            C.append((code, a.get("name", ""), "NOT FOUND LIVE (code missing from the Pi)"))
            continue
        diffs = []
        for f in ("kj", "kcal", "fat", "sat", "carb", "sugar", "fibre", "protein", "salt"):
            if f in (a.get("nutrition") or {}) and not same(a["nutrition"][f], row[f]):
                diffs.append("%s archive=%s live=%s" % (f, a["nutrition"][f], row[f]))
        for af, lf in (("allergens", "allergens"), ("packSize", "pack_size"), ("packFormat", "pack_format"), ("storageConditions", "storage_conditions"),
                       ("shelfLife", "shelf_life"), ("ingredientsList", "ingredients_list"), ("allergenNotes", "allergen_notes"),
                       ("packSizeValue", "pack_size_value"), ("packSizeUnit", "pack_size_unit")):
            if a.get(af) not in (None, "") and not same(a[af], row[lf]):
                diffs.append("%s archive=%r live=%r" % (af, a[af], row[lf]))
        if a.get("unitWeightG") and not same(a["unitWeightG"], row["unit_weight_g"]):
            diffs.append("unitWeightG archive=%s live=%s" % (a["unitWeightG"], row["unit_weight_g"]))
        if diffs:
            C.append((code, a.get("name", ""), "; ".join(diffs)))
    print("\nC. Archive values that differ from what is live: %d" % len(C))
    for x in C:
        print("   %s | %s | %s" % x)
    gaps += len(C)

    # D
    D = []
    # a file is also accounted for when an archive names it as its source (covers files named with a manufacturer code,
    # a typo'd code, or a code the user overrode, e.g. 120087 -> 107496)
    archived_files = set(os.path.basename((a.get("sourceFile") or "").replace("\\", "/")) for a in arch.values())
    for f in sorted(files):
        if f in archived_files:
            continue
        codes = re.findall(r"(?<!\d)(\d{6})(?!\d)", f)
        hit = [c for c in codes if c in live]
        if not hit:
            if any(c in issues_text for c in codes) or f.split(" ")[0] in issues_text:
                continue
            D.append((f, "no live ingredient code in the file name and no archive names this file"))
            continue
        if any(c in arch for c in hit):
            continue
        if any(c in issues_text for c in hit):
            continue
        D.append((f, "live code %s has NO archive and is not on the held/issues list" % ",".join(hit)))
    print("\nD. Spec files in the folder that are neither archived nor on the issues list: %d" % len(D))
    for x in D:
        print("   %s | %s" % x)
    gaps += len(D)

    # E
    if one or want_E_all:
        print("\nE. Spec answers that have NO field in NutriCost (listed, nothing stored):")
        targets = [one] if one else [os.path.join(FOLDER, f) for f in sorted(files) if any(c in arch for c in re.findall(r"(?<!\d)(\d{6})(?!\d)", f))]
        tot = {}
        for p in targets:
            try:
                res = left_behind(p)
            except Exception as e:
                print("   %s | could not be read: %s" % (os.path.basename(p), str(e)[:80]))
                continue
            print("   %s: %d answers with no field" % (os.path.basename(p), len(res)))
            for cat, label, ans in res:
                tot[cat] = tot.get(cat, 0) + 1
                print("      [%s] %s -> %s" % (cat, label, ans))
        print("   totals by kind: " + "; ".join("%s %d" % kv for kv in sorted(tot.items())))
    print("\nRESULT: %s (checks A-D gaps: %d)" % ("PASS" if gaps == 0 else "GAPS FOUND", gaps))
    sys.exit(0 if gaps == 0 else 1)


if __name__ == "__main__":
    main()
