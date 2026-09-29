# Spec issues flagged for later review

A running list of specs that were **not** processed because something about them needs a
person's attention beyond a routine confirmation — a stale/wrong field, a document that needs
tracking down elsewhere, or anything else worth a closer look later rather than blocking the
current batch. Each entry stays here until it's resolved (processed, replaced, or explicitly
dropped), at which point move it to a "Resolved" note or delete it.

This is separate from [SPEC-EXTRACTION.md](SPEC-EXTRACTION.md)'s log, which records what *was*
processed and how. This file is the opposite: what's still open.

---

## 106987 — SHOKUPAN BUN, GLAZED & SLICED, 60g x 48

**File:** `106987 Shokupan Wasabi RM Spec-V3 (01.04.2026).xlsx`

**Issue:** the "Product contains? (Y/N)" allergen column is entirely blank for every row EXCEPT
the ones that genuinely apply — Wheat, Gluten level, Yeast, Milk, and Egg all have an explicit
"Y"; every other allergen category has no value in that column at all (only the separate
cross-contamination column is filled, mostly "N", with Rye/Barley showing "Y" there only —
cross-contamination risk from being made on the same site, not a direct ingredient).
`spec-extract.py` correctly refuses to guess whether a blank cell means "N" or "not answered".

**Investigated:** the pattern reads as internally consistent — every row where the product
actually contains something has an explicit "Y", nothing is genuinely ambiguous. User chose to
skip rather than confirm this reading, so nothing has been written.

**Extracted data (not yet applied):**
```json
{
  "name": "SHOKUPAN BUN, GLAZED & SLICED, 60g x 48",
  "code": "106987",
  "nutrition": {
    "kj": 1378, "kcal": 337, "fat": 8.7, "sat": 2, "carb": 55,
    "sugar": 9.1, "protein": 10.7, "fibre": 2.7, "salt": 1
  },
  "allergens_if_confirmed": ["Cereals containing gluten", "Milk", "Eggs"],
  "packSize": "60g x 48",
  "packFormat": "Bag",
  "storageConditions": "Store in freezer at < -18ºC."
}
```

**Status:** paused, awaiting review. Not written anywhere.

---

## 106199 — RM PANKO JAPANESE SUPERCOURSE

**File:** `106199 (105080) Breadcrumbs spec V11 (01.04.2026).xlsx`

**Issue:** the spec document's own Product Code field states `106202` / alt code `105049` — but
`106202` is already a different, unrelated live ingredient (`RM Frying powder`, processed
2026-09-28, has its own correct nutrition data). Everything else about the spec points to
`106199` instead:
- The filename says `106199 (105080)`.
- The live system already has `106199 = "RM PANKO JAPANESE SUPERCOURSE"` (currently no
  nutrition — `kcal: 0`), which matches the spec's actual product name inside the document,
  `"PANKO BREADCRUMBS C99418-1000-G"`.
- `106202`/Frying Powder has no obvious relationship to panko breadcrumbs.

**Likely explanation:** the spec's Product Code field is stale/wrong — probably copy-pasted
from a different document at some point — rather than `106199` being wrong.

**Extracted data (not yet applied):**
```json
{
  "name": "PANKO BREADCRUMBS C99418-1000-G",
  "code_in_spec": "106202",
  "altcode_in_spec": "105049",
  "likely_correct_code": "106199",
  "nutrition": {
    "kj": 1570, "kcal": 370, "fat": 1.3, "sat": 0.3, "carb": 75.6,
    "sugar": 2.8, "protein": 12.2, "fibre": 3.3, "salt": 0.7
  },
  "allergens": ["Cereals containing gluten"],
  "packSize": "10.00KG",
  "packFormat": "P00206 Corby Block Bottom Sack",
  "storageConditions": "Ambient"
}
```

**Status:** skipped, awaiting review. Not written anywhere. Once confirmed, re-run
`spec-extract.py` with `--override-code 106199` (or whatever code is confirmed correct) and
apply via `spec-apply.js` in the usual way.

---

## 106167 -- RM Oil Rapeseed CPU use only (shelf life not backfilled)

**File:** `106167 (105047) Rapeseed Oil spec V6 (08.01.2025).xlsx`

**Issue:** the document's `5&6 Durability & Micro Standard` sheet has "1000lt IBC" (a pack size
value) written into what should be its Product Code cell -- a genuine data-entry error specific
to this one sheet of this one document. The recipe sheet states the correct code consistently
("10202 (102035)"), but this sheet disagrees, which the cross-sheet consistency check correctly
refuses regardless of any override (a real disagreement between sheets is never overridable,
per the standing rule -- only a uniformly blank or uniformly-different-but-consistent code is).

This was only discovered 2026-09-29 during the Shelf Life field's backfill, because the
Product Code lookup only recently became dynamic (label-search based, not hardcoded C4) --
the old lookup happened to read a blank C4 on this sheet and never noticed the mismatch. The
ingredient's nutrition/allergen/pack data was already correctly applied earlier this session
(via the recipe sheet's own consistent code) and is unaffected -- this only blocks re-extracting
anything from the Durability sheet specifically (Shelf Life, and any future Storage Conditions
re-extraction).

**Status:** paused, awaiting review. `RM Oil Rapeseed CPU use only` has no `shelfLife` value.
Once a person confirms what this sheet's Product Code cell should actually say (or confirms the
real shelf life from elsewhere in the document/supplier), re-run extraction and apply normally.
