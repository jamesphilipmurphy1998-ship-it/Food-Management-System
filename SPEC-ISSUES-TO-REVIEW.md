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

---

## 107246 — RM Coffee Beans - Ueshima Kobe BLEND

**File:** `107246 CBEUES0015 UESHIMA KOBE BLEND RFA BEANS 10x500g v2.xlsx`

**Two separate issues, both paused pending user review:**

1. **Nutrition data describes brewed coffee, not the dry beans.** The spec's own source note on
   the nutrition sheet reads: *"Coffee is exempted from Nutritional labelling and declaration.
   Source is theoretical - FDA FoodData Central Beverages, coffee brewed, prepared with tap
   water."* The "Per 100g" values (kj: 3, kcal: 1, fat: 0.02g, protein: 0.12g, etc.) are
   consistent with a diluted cup of brewed black coffee, not 100g of dry roasted beans/grounds
   (which would be far higher-calorie). Our live ingredient, `RM Coffee Beans - Ueshima Kobe
   BLEND`, is the dry product. Writing these values as-is would misrepresent the ingredient's
   actual nutrition per 100g of the product as stored/used. User asked to pause and think about
   this rather than deciding immediately.
2. **Product Name and Product Code cells are swapped in the source document.** `C3` (labeled
   "Product Name") holds `"CBEUES0015"` (a SKU-shaped string), while `C4` (labeled "Product
   Code") holds `"UESHIMA KOBE BLEND RFA BEANS 10 x 500g"` (a plain-English product
   description) -- the two fields' contents are the wrong way round versus every other spec
   seen this session. Neither cell contains anything resembling our own code (107246). Filename
   and product description both point to `RM Coffee Beans - Ueshima Kobe BLEND` being the
   correct live match, but this hasn't been applied.

**Status:** paused, awaiting user review on the brewed-vs-dry-beans nutrition question before
any code override or write is attempted. `RM Coffee Beans - Ueshima Kobe BLEND` remains
unspecced.

---

## 106198 — Prime Chicken Wing 50-70g

**File:** `106198_1 (105073) Chicken Wings (W Miedzyrzecu) 50-70g RM Spec V7 (13.08.2026).xlsx`

**Issue:** 11 of the 12 sheets in this workbook agree on Product Code `106198 (105073)` and
Product Name `Prime Chicken Wing 50-70g` — the one exception is the `15&16&17 Meat & Fish & Veg`
sheet, which shows Product Code `15193 (103736)` while still agreeing on the same Product Name
(`Prime Chicken Wing 50-70g`). `spec-extract.py` correctly refuses to proceed (cross-sheet code
mismatch) rather than guess which code is right.

**Investigated:** the near-unanimous agreement (11/12 sheets) plus matching product name on
every sheet including the odd one out strongly suggests `15193 (103736)` is a stale leftover
code from an earlier version of this spec template that was reused/repurposed for a new
customer code, not a sign of corrupted or swapped data. Same pattern as the 106188 Chicken
Thigh case earlier this session (resolved via `--confirm-cross-sheet-mismatch`). User chose to
pause and investigate further rather than confirm immediately — nothing has been written yet.

**Not yet extracted/applied.** `RM chicken Wings 55g-75g` (106198) remains unspecced.

---

## 120087 — Lamb Weston Potato Puffs 10x1Kg

**File:** `120087 Spec Lamb Weston Potato Puff s 10x1Kg V1 (signed).xlsx`

**Issue:** the spec's own Product Code cell reads `120087`, but no live ingredient exists with
that code. `RM Potato Puffs - Pre-fried – frozen` (code `107496`, supplier Fresh Direct (UK)
Ltd) is unspecced and matches this product by description (potato puffs), but the spec names
the manufacturer/brand as Lamb Weston, a different name than the live supplier field.

**Extracted data (not yet applied):**
```json
{
  "name": "Lamb Weston Potato Puff s 10x1Kg",
  "code": "120087",
  "nutrition": {"kj": 654, "kcal": 156, "fat": 7.1, "sat": 0.67, "carb": 20, "sugar": 0.5, "protein": 1.9, "fibre": 2.6, "salt": 0.9},
  "allergens": [],
  "packSize": "10x1kg",
  "packFormat": "Food grade vertical form sealed plastic bag",
  "storageConditions": "frozen max -18c",
  "shelfLife": "548 min 365 days from delivery",
  "ingredientsList": "Potatoes (82%), Vegetable oils (rapeseed, sunflower, in varying proportions), Potato starch, Onion, Potato flakes, Salt, Dextrose, Flavouring (Onion extract), Spice."
}
```

**Status:** paused, not applied. User asked to add to this list and move on rather than
investigate further right now — whether `120087` should override to `107496`, or whether
`107496`'s supplier is actually a distributor for Lamb Weston (same pattern as the 106205 Beef
Slice supplier-name case), still needs a decision. `RM Potato Puffs - Pre-fried – frozen`
(107496) remains unspecced in the meantime.

---

## 106192 — RM Baking Powder

**Issue:** no spec document exists for this ingredient anywhere in the Ingredient Specs folder —
confirmed by searching the full current folder listing for the code (`106192`) and for "baking"
in any filename; no match found. There is nothing to extract or apply.

**Status:** blocked on the source document. Someone needs to obtain/upload a spec file for RM
Baking Powder (106192) before this can be processed. Not a data-quality or extraction issue —
purely a missing document.

---

## Pack Size audit (2026-10-07) -- live values needing a person's decision

Found by auditing every archived extraction against its source spec (full output in
`.scan/packsize_audit.txt`; the audit script is not committed). The extractor read the right
cell in all 116 source files still on disk (column B label is always "Weight or Volume"), so
these are not wrong-cell reads: they are values the cleanup deliberately left raw (ranges,
two sizes, net-vs-gross, count-only, sentences), a stored-vs-name conflict, or a missing value.
30 further archives have no source file on disk and could not be re-verified at all.

Each needs a confirmed single per-unit measure (Pack Size) with any count/container wording in
Pack Format. Nothing below has been changed.

| Code | Ingredient | Stored Pack Size | Why flagged |
|---|---|---|---|
| 102015 | RM Avocado | '1x 14 in case with an individual weight 258-313g (5% tolerance for moisture loss = 245g)' | STORED VALUE NOT A PURE MEASURE: '1x 14 in case with an individual weight 258-313g (5% tolerance for moisture loss = 245g)' |
| 102063 | RM Cucumber Whole | '12 per box' | STORED VALUE NOT A PURE MEASURE: '12 per box' |
| 104714 | RM Gyoza Chicken and Vegetable, 1KG Bag | '20g/ Piece and 1 kg/Bag' | STORED VALUE NOT A PURE MEASURE: '20g/ Piece and 1 kg/Bag'; CONFLICT with name: stored 20g/ Piece and 1 kg/Bag vs "1KG"; CONFLICT with format: stored 20g/ Piece and 1 kg/Bag vs "1 kg" |
| 105952 | RM Teriyaki Sauce Kikkoman (CPU Only) | '4L (4000ml)' | ARCHIVE != RAW and not a clean single-measure reduction (raw='4L'); STORED VALUE NOT A PURE MEASURE: '4L (4000ml)' |
| 106099 | RM Pumpkin Croquette | '60gx100pcs' | STORED VALUE NOT A PURE MEASURE: '60gx100pcs' |
| 106130 | RM Prawn Ebi (Tazaki Own brand) | '180g' | MASS/VOLUME mismatch with raw_1a: stored 180g vs "3L" |
| 106163 | RM Pepper Green Square 25 MM | None | NO PACK SIZE stored |
| 106164 | RM Onions Crispy Fried | '2.5kg' | ARCHIVE != RAW and not a clean single-measure reduction (raw='2.5g x 4') |
| 106168 | RM Oyster Sauce | '20Kg' | MASS/VOLUME mismatch with format: stored 20Kg vs "18 litre" |
| 106215 | RM Salmon 5-6 HOG Fresh chilled | '4-5 KG, 5-6 KG' | STORED VALUE NOT A PURE MEASURE: '4-5 KG, 5-6 KG' |
| 106228 | RM Diced Red pepper 20mmx20mm PACK 5KG | '5kg, 10kg' | STORED VALUE NOT A PURE MEASURE: '5kg, 10kg' |
| 106231 | RM Teriyaki Sauce 6 KG | '6Kg' | MASS/VOLUME mismatch with format: stored 6Kg vs "5Litre" |
| 106254 | RM Gyoza Vegetable, 1KG Bag | '20g/ Piece and 1 kg/Bag' | STORED VALUE NOT A PURE MEASURE: '20g/ Piece and 1 kg/Bag'; CONFLICT with name: stored 20g/ Piece and 1 kg/Bag vs "1KG"; CONFLICT with format: stored 20g/ Piece and 1 kg/Bag vs "1 kg" |
| 106355 | RM Cooked Prawn Tail-Off Size 31/40 | '700g Net Weight (1kg Gross Weight)' | STORED VALUE NOT A PURE MEASURE: '700g Net Weight (1kg Gross Weight)' |
| 106607 | Yutaka Shredded Pickled Ginger Benishoga | 'Unit net weight : 1500g      Unit drained weight : 1000g' | STORED VALUE NOT A PURE MEASURE: 'Unit net weight : 1500g      Unit drained weight : 1000g' |
| 106833 | RM Pickled Asian Slaw 1kg | '2kg' | CONFLICT with name: stored 2kg vs "1kg" |
| 106834 | RM Vegan Kimchi Jongga | '1 kg / 3 kg' | STORED VALUE NOT A PURE MEASURE: '1 kg / 3 kg' |
| 106946 | RM Duck Gyoza Frozen 1KG | '20g/Piece and 1 kg/Bag' | STORED VALUE NOT A PURE MEASURE: '20g/Piece and 1 kg/Bag'; CONFLICT with name: stored 20g/Piece and 1 kg/Bag vs "1KG"; CONFLICT with format: stored 20g/Piece and 1 kg/Bag vs "2 g"; CONFLICT with format: stored 20g/Piece and 1 kg/Bag vs "1 kg" |
| 107200 | RM Tuna Bar SF YF (1 x 1.2kg-1.6kg pack) | '1.2kg - 1.5kg' | STORED VALUE NOT A PURE MEASURE: '1.2kg - 1.5kg'; CONFLICT with name: stored 1.2kg - 1.5kg vs "1.6kg" |
| 107240 | RM Flat Noodles (Ribbon) | None | 1-d cell EMPTY in source but archive has None; NO PACK SIZE stored |
| 107322 | RM Beef Mince Frozen (Red tractor) | '15kg' | ARCHIVE != RAW and not a clean single-measure reduction (raw='15k') |
| 107390 | RM Simply Vanilla Syrup rPET bottle | '1 litre e (bottle) / 6 x 1 Litre - 6 Litres (Outercase)' | STORED VALUE NOT A PURE MEASURE: '1 litre e (bottle) / 6 x 1 Litre - 6 Litres (Outercase)' |
| 107489 | RM Poached Egg (Free range) | 'Target weight 47g at point of pack. Weight spread is 43g-51g with possibility of outliers due to the natural variance of the product. Case net weight (1.29kg - 1.53kg).' | STORED VALUE NOT A PURE MEASURE: 'Target weight 47g at point of pack. Weight spread is 43g-51g with possibility of outliers due to the natural variance of the product. Case net weight (1.29kg - 1.53kg).' |
| 107490 | RM Cooked Breakfast Sausage | '2 kg' | CONFLICT with raw_1b: stored 2 kg vs "50g"; CONFLICT with raw_1b: stored 2 kg vs "4g" |

---

## Upload review (2026-10-07) -- everything uploaded, checked against live data and source specs

Method and results are in SPEC-EXTRACTION.md (same date). Nothing below has been changed yet.

**Likely real errors (need a decision):**
| Code | Ingredient | Problem |
|---|---|---|
| 107497 | RM IQF Julienne Carrot | **FIXED 2026-10-07 (set to kJ 146 / kcal 35, confirmed by the user).** The supplier spec has kJ and kcal swapped (kJ 35, kcal 146; carrot is about 35 kcal and 146 kJ, and its macros give 37 kcal). It was written as-entered by an earlier decision, but the same swap in 107685 (IQF Carrot Diced) and 106959 (Red Chilli Puree) WAS corrected. Used in 131 recipes. Recommend swapping to kJ 146 / kcal 35. |
| 106250 | RM Tuna Chunks In Brine | Spec states 503 kJ and 102 kcal, but 503 kJ is about 120 kcal and the macros also give about 120. It was accepted as "rounding" because only kcal was compared with the macros. |
| 102584 | RM Inari Cooked Bean Curd Ytk | Spec has sugars 14.1 g above carbohydrate 12.3 g (lab values). The extractor never checked sugars against carbohydrate. |
| 106163 | RM Pepper Green Square 25 MM | The spec states Pack Size "10 kg" and ingredients "Pepper Green 100%", but live has neither (uploaded before those were extracted). |

**Gaps that can be filled from the source (each needs its own confirmation):** 22 uploaded specs have a
blank Ingredients List although the spec has one (declaration box or ingredient table): 103895 (this one
declares gluten but has no ingredient text), 105970, 106041, 106127, 106139, 106160, 106163, 106167, 106169,
106206, 106208, 106218, 106219, 106220, 106222, 106223, 106226, 106228, 106251, 106317, 106438, 107427.

**Already known / decided earlier, listed so they are not rediscovered:** 17 Pack Sizes that are not a single
number + unit (section above); blank Pack Format on 106096, 106100, 106133, 106140, 106170, 107497 (a
dropped value or a template with no such field); 106167 blank shelf life and ingredients (paused);
12 kcal-versus-macros gaps that were confirmed when uploaded (vinegar/lemon acid, alcohol, fibre counted
in carbohydrate, and so on).

**One pairing worth a glance:** 106202 live "RM Frying powder" vs spec name "Chicken Breading WSB MK2"
(matched on code; the least obvious name pair of all 150).

---

## 103895 -- RM Noodle Industrial: ingredient list to come back to (user note, 2026-10-07)

The spec's Legal Ingredient Declaration box reads "Wheat flour  (Wheat flour, Calcium, Iron, Niacin, Thiamin),
Salt, Paprika, Turmeric, Firming Agents: Potassium Carbonate, Sodium Carbonate, Acidity regulator: Citric
Acid." (with a double space after "Wheat flour"). The ingredient table on the same sheet also lists Water
(22-24%) and Sodium hexacyanoferrate (II) E535 (<0.001%), which the box does not. The live ingredient declares
Cereals containing gluten but has NO ingredient text. The user asked to come back to this one rather than
write it now; nothing has been written.


## 2026-10-07 — 107605 Japanese Style Mayonnaise: spec file named 107605 but its own Product Code cell says 107606 (HELD by the user, nothing written)
`107605 Japanese Style Mayo RM Spec V2 (03.06.2026).xlsx` (found in folder check 33) and the earlier `(107606) Japanese Style Mayo RM Spec V1 (05.02.2026).xlsx`
(folder check 32) both carry code 107606 inside. Live 107606 is RM Sesame Dressing (already uploaded from its own spec), so applying as-is would overwrite it with
mayo data. Live 107605 = RM Japanese Style Mayonnaise (KG, 5.50), no spec. Extracted (not applied): 2882 kJ / 701 kcal, fat 76, sat 5.5, carb 2, sugars 1.8, fibre 0.1,
protein 1.6, salt 1.8; allergens Eggs, Mustard; Pack Size 1 kg (cell "6 x 1kg"); storage Chilled 2-5; shelf life "90 days & 68 days" (odd); ingredients from the declaration box.
User chose to hold. To resume: confirm the spec's Product Code is a typo for 107605 (or have the supplier file corrected), then extract with `--override-code 107605`
and confirm every field by click.

## 2026-10-07 — two more refused specs from folder check 32 (nothing written)
- `107049 Miso Caramel Sauce RM Spec- V2 (11.12.2024).xlsx`: refused, the nutrition sheet's Product Code is "SAU7046 Miso Caramel" but the ingredient sheet says 107049.
- `107247 Smoked Back Bacon Whole Rashers RM Spec V1 (17.07.2025).xlsx`: refused, four allergen rows (wheat, gluten level, soya, sulphites) read "N- But handled on site", not Y/N.
(The user dismissed the question about recording these, so this entry is a note only; they remain unprocessed.)


## 2026-10-07 — 106187 Chicken breast: spec file named 106187_2 but its own Product Code cell says 102041 (HELD by the user, nothing written)
`106187_2 (105005)Chicken Breast 200-240g Calibrated RM Spec V2 24.10.24.xlsx` (folder check 35). The spec's code cell reads 102041 (alt 105005), no live ingredient has either
code; 105005 is the recipe "CPU RM Chicken Breast for Dicing", whose cost (5.38511) equals live 106187 "RM Chicken breast calibrated 210-250g - Ex Inner" (the spec says 200-240g).
Extracted (not applied): 464 kJ / 110 kcal, fat 1.8, sat 0.5, carb 0, sugars 0, fibre 0, protein 23.3, salt 0.132; no allergens; Pack Size 5 kg (cell "2x5kg"); Pack Format
"Plastic tray sealed with plastic film"; Storage "0-4°C" (superscript-styled text, needs a visual check); Shelf Life "13 days from production, delivery + 4 days"; ingredients "100% Chicken Breast".
User chose to hold. To resume: confirm the file is for 106187 and that 200-240g vs 210-250g is the same product, then extract with `--override-code 106187` and confirm every field by click.


## 2026-10-07 — 106955 RM Onion Powder: Sulphur dioxide ticked on a spec answer that is neither Yes nor No (LEFT AS IS by the user, to review later)
The spec's sulphites row reads "product may contain naturally ocurring SO2 (not tested to verify levels)". At the original upload the user chose the precautionary reading and Sulphur dioxide was ticked (a one-off manual setting).
A fresh extraction ticks nothing for it, so a re-run shows a difference from live. The user's latest rule (cross-contamination / used on site / below ppm = No + a note, never a tick) does not cleanly cover this case:
it is the product itself that may naturally contain SO2 and no level is stated, so it cannot be shown to be under the 10ppm threshold.
Decision 2026-10-07: leave the tick as it is and list it here. To resolve later: ask the supplier for a tested SO2 level, or decide whether to untick it and keep the wording in Allergen notes (the box is not deployed yet).


## 2026-10-08 — 106439 Broccoli Floret: spec is 30mmx60mm, live item is "RM Broccoli Floret 35x45MM" (HELD by the user, come back later; nothing written)
`106439 Broccoli Floret 30mmx60mm RM Spec V1 11.06.2026.xlsx` (folder check 37). Same code 106439 but the cut size differs from the live item name (35x45MM), so it may be a different product/spec.
Extracted (not applied; user confirmed nutrition, Pack Size and Pack Format as read, then chose to hold on the name): 146 kJ / 34 kcal, fat 0.6, sat 0.15, carb 3.2, sugars 1.9, fibre 4, protein 4.3, salt 0.0225;
no allergens (celery and sulphites rows carry the supplier comment "Handle in the Factory. Allergen cross contamination is controlled through allergen handling procedurs and annual testing", answered No);
Pack Size 500 g (cell "500g"); Pack Format "Blue Food Grade Bag"; Storage "Chilled (0 - 5 C)"; Shelf Life "Date of Production + 4 days, Delivery + 3 days"; ingredients "Broccoli florets (100%)" (declaration box empty, taken from the ingredient table).
To resume: decide whether this spec belongs to the existing 106439 (and whether the live name/size should change), then confirm storage, shelf life, ingredients and any allergen note by click and apply.


## 2026-10-08 — Placeholder / junk ingredient entries with no spec (moved off the "needing a spec" list; need a clean-up decision, not a spec)
These live ingredients have no nutrition and look like placeholders or leftovers rather than real products. Nothing has been changed. To resolve: decide for each whether to delete, rename or fill it in.
- (no code) - gdfs (category Raw Material, cost 0 KG)
- 106113 - 106113 - Sides x 6 (category Other, cost 0.28509 EACH)
- 107639-B - Do not use this item either (category Other, cost 5.38511 KG)
- 107640-B - Do not use this item (category Other, cost 3.4797 KG)
- P00040 - P00040 (category Other, cost 0 KG)


## 2026-10-08 — 107735 RM IQF Garlic Puree Nuggets: no spec found (user added to the issues list)
No spec file exists in the Ingredient Specs folder for this ingredient (checked against its code on the folder checks up to 2026-10-08), and it has no nutrition on the live item (category Other, cost 4.47924 KG). Nothing has been changed. To resolve: get the spec from the supplier, then process it like any new spec.


## 2026-10-08 — 107499 RM Chinese Five Spice: no spec found (user added to the issues list)
No spec file exists in the Ingredient Specs folder for this ingredient (checked against its code on the folder checks up to 2026-10-08), and it has no nutrition on the live item (category Other, cost 7.49 KG). Nothing has been changed. To resolve: get the spec from the supplier, then process it like any new spec.


## 2026-10-08 — 107088 RM Not RTE-Gyoza Japanese-style apple dumpling: no spec found (user added to the issues list)
No spec file exists in the Ingredient Specs folder for this ingredient (checked against its code on the folder checks up to 2026-10-08), and it has no nutrition on the live item (category Other, cost 5.3042 KG). Nothing has been changed. To resolve: get the spec from the supplier, then process it like any new spec.


## 2026-10-08 — 106192 RM Baking Powder: no spec found (re-confirmed; already listed above)
Re-checked the Ingredient Specs folder on 2026-10-08: still no file under the code 106192 or "baking". The live item still has no nutrition (category Other, cost 3.41 KG). Nothing has been changed. To resolve: get the spec from the supplier.


## 2026-10-08 — 106157 RM Salt Table Tub: no spec found (user added to the issues list)
No spec file exists in the Ingredient Specs folder for this ingredient (checked against its code on the folder checks up to 2026-10-08), and it has no nutrition on the live item (category Other, cost 0.6447 KG). Nothing has been changed. To resolve: get the spec from the supplier, then process it like any new spec.


## 2026-10-08 — 107346 RM Salt Tub: no spec found (user added to the issues list)
No spec file exists in the Ingredient Specs folder for this ingredient (checked against its code on the folder checks up to 2026-10-08), and it has no nutrition on the live item (category Other, cost 0.64339 KG). Nothing has been changed. To resolve: get the spec from the supplier, then process it like any new spec.


## 2026-10-08 — 106210 RM Pork Neck Slice: storage temperature unclear (uploaded with the user's text; to confirm with the supplier)
The spec's Storage cell reads "<-8oC" (below -8°C), shelf life 28 days, transport "-2°C to +8°C", once opened "0°C to 6°C - 3 days", and the file name says "Frozen pork neck sliced". The temperatures suggest a chilled product, the name says frozen, and -8°C is neither a normal frozen nor chilled setpoint.
Written to the live item at the user's choice: Storage "-8°C", Shelf Life "28 days". To resolve: ask the supplier whether the product is frozen (-18°C) or chilled (<8°C) and correct Storage on the live item. Source is an old .xls, converted by Excel from a copy for extraction.
