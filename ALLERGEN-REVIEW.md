# Allergen review: columns beyond "Product contains?" (script-generated 2026-10-07)

Source: `.scan/tools/allergen_sweep.py` read every allergen row of every uploaded spec, ALL answer columns. The system stores only what a product **contains**.
Nothing below has been changed in the live data. Each item needs the user's decision before anything is recorded.

## STANDING RULE (user instruction 2026-10-07)
When extracting any spec, ALSO check the whole allergen row: the "Risk of cross contamination?" column and the "in which ingredient?" supplier-comment column. Never decide from "Product contains?" alone. If cross-contamination is anything other than a plain No, or a supplier comment claims an exemption/threshold, STOP and ASK the user what to record. `spec-extract.py` now prints every such comment/cross-contamination answer as a mandatory warning and returns `allergenSupplierComments`.

## A. Declared NOT contained, but the supplier says there is a cross-contamination risk (may-contain candidates): 39 rows in 18 specs

- 102052: Nut (cross-contamination: Y); Peanut (cross-contamination: Y); Sesame seeds (cross-contamination: Y); Rye (cross-contamination: Y); Barley (cross-contamination: Y); Fish (cross-contamination: Y); Molluscs (cross-contamination: Y); Crustaceans (cross-contamination: Y); Milk (cross-contamination: Y); Egg (cross-contamination: Y); Mustard (cross-contamination: Y)
- 102058: Fish (cross-contamination: Y); Crustaceans (cross-contamination: Y)
- 103487: Fish (cross-contamination: Y); Crustaceans (cross-contamination: Y)
- 105950: Milk (cross-contamination: Y)
- 105971: Celery (cross-contamination: Yes, but controlled)
- 106127: Mustard (cross-contamination: Yes); Celery (cross-contamination: Yes); Sulphites or sulphur dioxide (cross-contamination: Yes)
- 106138: Celery (cross-contamination: Y); Sulphites or sulphur dioxide (cross-contamination: Y)
- 106162: Celery (cross-contamination: Yes, but controlled)
- 106163: Celery (cross-contamination: Yes, but controlled)
- 106174: Mustard (cross-contamination: Yes); Celery (cross-contamination: Yes); Sulphites or sulphur dioxide (cross-contamination: Yes)
- 106208: Celery (cross-contamination: Yes, but controlled)
- 106211: Celery (cross-contamination: Yes, validated control procedu); Sulphites or sulphur dioxide (cross-contamination: Yes, validated control procedu)
- 106217: Celery (cross-contamination: Y); Sulphites or sulphur dioxide (cross-contamination: Y)
- 106238: Soya (cross-contamination: Y); Mustard (cross-contamination: Y)
- 106317: Celery (cross-contamination: Y); Sulphites or sulphur dioxide (cross-contamination: Y)
- 106363: Egg (cross-contamination: Y)
- 106438: Celery (cross-contamination: Yes, but controlled)
- 106834: Fish (cross-contamination: Y)

## B. Odd "Product contains?" answers on an EU allergen row (not plain Y/N): 7

- 105951: Sulphites or sulphur dioxide -> 'N, <=10mg/kg'
- 106161: Sulphites or sulphur dioxide -> 'N, max 6 (mg/kg)'
- 106955: Sulphites or sulphur dioxide -> 'product may contain naturally ocurring SO2 (not tested to verify levels)'
- 107247: Wheat -> 'N- But handled on site'
- 107247: Gluten level (more than 20ppm?) -> 'N- But handled on site'
- 107247: Soya -> 'N- But handled on site'
- 107247: Sulphites or sulphur dioxide -> 'N- But handled on site'

## C. Supplier comments claiming an exemption or threshold on an EU allergen row: 15

- 102022: Sulphites or sulphur dioxide (contains: N): "Sulphites are added to other products. Sugar & Demerara Sugar SO2 as Non-functional carryover additive. It is less then 10ppm, hence not declarable. Strict allergen handling Strict allergen handling p"
- 102664: Sulphites or sulphur dioxide (contains: Y): "Naturally present sulphites"
- 103889: Barley (contains: Y): "Malt vinegar made from barley. Levels of gluten <20ppm"
- 106168: Gluten level (more than 20ppm?) (contains: N): "Barley malt extract. <20ppm gluten. Suitable for coeliacs, as per Regulation (EU) No. 828/ 2014"
- 106172: Sulphites or sulphur dioxide (contains: N): "Sugar & Glucose syrup contains less than 10ppm of Sulphites."
- 106196: Gluten level (more than 20ppm?) (contains: N): "< 20 PPM"
- 106255: Sulphites or sulphur dioxide (contains: N): "Mainfrucht is handling SO2 (however <10ppm) HACCP in place, cleaning , trained staff."
- 106833: Sulphites or sulphur dioxide (contains: N): "E220 present in sugar at <10ppm"
- 106961: Sulphites or sulphur dioxide (contains: N): "<10ppm in the finished product as carryover"
- 107091: Molluscs (contains: N): "May contain traces of Molluscs"
- 107091: Crustaceans (contains: N): "May contain traces of crustaceans"
- 107316: Peanut (contains: N): "Peanut testing ELISA <2.5ppm by manufacturing site due to possible cross contamination risks in origin cropping areas"
- 107391: Wheat (contains: N): "Glucose syrup is derived from maize/ wheat, but it is exempt of allergen declaration as per REGULATION (EU) No 1169/2011 Annex II. Wheat used on site. Strict allergen handling procedures in place."
- 107391: Sulphites or sulphur dioxide (contains: N): "Sulphites are added to other products. Glucose Syrup contains Sodium Bisulphate as Non-functional carryover additive. It is less then 10ppm, hence not declarable. Strict allergen handling procedures i"
- 107558: Sulphites or sulphur dioxide (contains: N): "E220 present in sugar at <10ppm"

## What is not done
- The 337 cross-contamination answers and 501 comments in `.scan/allergen_sweep.txt` (local only) are the full evidence; most are plain "handled on same line, full clean down"-style statements.
- Section A may-contain risks are NOT recorded anywhere in the system (no field for it). The new ingredient "Allergen notes" field (database column deployed 2026-10-07, form box not yet built) is the planned place to record them.

