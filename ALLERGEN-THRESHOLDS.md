# Allergen Declaration Thresholds (UK/EU — the 14 tracked allergens)

Reference for interpreting spec-sheet allergen answers that aren't a plain Y/N — e.g.
"N, max 6 (mg/kg)". Written so a future AI (or person) doesn't have to re-derive or guess
this each time. Sourced from UK Food Information Regulations (FIR), aligned with EU
Regulation (EC) No. 1169/2011 (Food Standards Agency guidance,
https://www.food.gov.uk/business-guidance/food-allergen-labelling-and-information-requirements-technical-guidance-part-1-guidance-for-businesses-providing-prepacked-food).

## The rule

**13 of the 14 tracked allergens have NO threshold.** If the allergen is present as a
deliberately added ingredient (or carried over from one), it must be declared — regardless
of quantity, even trace amounts. There is no "too small to count" for these:

Celery, Crustaceans, Eggs, Fish, Gluten (cereals containing gluten — wheat/rye/barley/oats/
spelt etc.), Lupin, Milk, Molluscs, Mustard, Nuts, Peanuts, Sesame, Soya.

**Sulphites/sulphur dioxide is the one exception**, and the only allergen in this list with
a numeric threshold: it must be declared **only if present above 10 mg/kg (solids) or
10 mg/L (liquids), measured as total SO2 in the finished product as consumed** (i.e. after
any preparation per manufacturer instructions). Below that, "does not contain" is the
legally correct answer even though sulphites are technically present at a low level.

## How to apply this to a spec answer

If a spec's sulphites row reads something like `"N, max 6 (mg/kg)"` or `"N, max X (mg/kg)"`:
- If X < 10 → the spec's own "N" answer is consistent with the legal threshold. Safe to
  record as "does not contain."
- If X ≥ 10 → the spec's "N" would be **inconsistent with the legal threshold** — this is a
  real contradiction worth flagging to a person, not silently resolving either way.
- If the unit is anything other than mg/kg or mg/L (or ppm, which is equivalent to mg/kg for
  these purposes), don't assume — ask.

This same logic does **not** apply to any other allergen row. A spec answer like
`"N, contains trace amounts"` for milk, egg, nuts, etc. is not something a threshold can
resolve — any deliberate presence is a "Yes," so that kind of answer should always be
flagged to a person rather than parsed automatically.

## Note on the "Gluten level (more than 20ppm?)" row specifically

Some spec templates phrase the gluten allergen question as "more than 20ppm?" — this is
**not** the allergen-declaration threshold (gluten has none, see above). 20ppm is the
separate legal threshold for using a "gluten-free" *marketing claim* on packaging (Commission
Implementing Regulation (EU) No 828/2014). The spec sheet is using it as its own contains-
question definition, which is that template's choice, not a general legal allergen rule —
worth knowing so it isn't confused with the sulphites case above when extending the parser.
