# Backend Migration Notes (for future reference)

When you need to move NutriCalc to a backend with a relational database, here are the key steps:

---

## Data & Storage

- [ ] Set up a relational database (e.g. PostgreSQL, SQLite, MySQL)
- [ ] Create `ingredients` table (id, name, code, altCodes, cat, kj, kcal, fat, sat, carb, sugar, fibre, protein, salt, cost, supplier, allergens, fvn, approved, versionHistory, created)
- [ ] Create `recipes` table (id, name, code, desc, type, recipeType, serving, method, kitchenMade, factoryMade, approved, versionHistory, created)
- [ ] Create `recipe_ingredients` table (recipe_id, ingredient_id, sub_recipe_id, qty, uom, fvnOverride) — one of ingredient_id or sub_recipe_id per row
- [ ] Add foreign key constraints (ingredient_id → ingredients.id, sub_recipe_id → recipes.id)
- [ ] Implement API endpoints: GET/POST/PUT/DELETE for ingredients and recipes
- [ ] Replace localStorage reads/writes with API calls in the frontend

---

## Logic to Move

- [ ] BOM import (`executeRecipeStructureImport`) — run on server, write to DB
- [ ] Base ingredient detection (items in itemdescription not in parent column)
- [ ] Single-component, sub-recipe, finished product classification
- [ ] Referential integrity — block delete of ingredient/recipe if still in use
- [ ] `getRecipesUsingIngredient`, `recipeContainsIngredient`, `getIngredientIdsInRecipe` — can become DB queries or stay in API layer

---

## When to Consider This

Consider a backend/database when you need:

- **Multiple users sharing data**
- **Large datasets** (thousands of items)
- **Strong referential integrity** (e.g. block delete of ingredient still in use)
- **Backups and audit trails**
- **Mobile or offline sync**

Until then, JavaScript plus localStorage is a reasonable choice.

---

*Do not implement until needed. Keep this as a reference.*
