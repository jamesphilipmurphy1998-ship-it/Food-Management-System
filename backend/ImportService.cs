namespace NutriCost.Api;

public interface IImportService
{
    RecipeStructureImportResult ImportRecipeStructure(RecipeStructureImportRequest req);
}

public sealed class InMemoryStore
{
    public List<Ingredient> Ingredients { get; } = [];
    public List<Recipe> Recipes { get; } = [];
}

public sealed class ImportService(InMemoryStore store) : IImportService
{
    // Keep in sync with frontend data.js PACKAGING_SUPPLIERS so re-imports and UI (PKG/RM) stay consistent.
    private static readonly HashSet<string> PackagingSuppliers =
    [
        "europac packaging ltd",
        "coveris flexibles uk ltd (board)",
        "coveris flexibles uk ltd (labels)",
        "transcend packaging limited",
        "faerch uk limited",
        "ccs mclays ltd",
        "wrapid manufacturing limited",
        "s.sheard & son ltd",
        "proampac london limited",
        "colpac ltd"
    ];

    public RecipeStructureImportResult ImportRecipeStructure(RecipeStructureImportRequest req)
    {
        var result = new RecipeStructureImportResult();
        var recipeGroups = new Dictionary<string, RecipeGroup>();
        var parentValuesSet = new HashSet<string>();
        var allItemDataByKey = new Dictionary<string, ItemData>();

        foreach (var row in req.Rows)
        {
            var code = (row.Code ?? "").Trim();
            var code2 = (row.Code2 ?? "").Trim();
            var rawItemName = (row.ItemDescription ?? "").Trim();
            // Section-break detection must run on the RAW description, before the code-fallback
            // below ever substitutes anything in — verified this caused a real, silent bug: an
            // item with a blank description and a purely-numeric code (e.g. "107327", extremely
            // common in this data) had its fallback name ("107327") wrongly parsed by
            // int.TryParse as if it were a stray spreadsheet total row, so the ENTIRE row got
            // skipped — silently dropping that item's own definition (its real cost, its link)
            // from the import (confirmed: this is exactly what broke "P00040", which should be a
            // proper single-component recipe linking to ingredient 107327 at £5.14, but instead
            // got created as a bare, costless ingredient because its definition row was skipped
            // outright). A genuine "1234"-style total row always HAS its own real (non-blank)
            // text in that cell, so checking the raw value — never the substituted fallback —
            // is both the correct fix and never loses real section-break detection. A genuinely
            // blank description is the normal, expected case for these code-only items (that's
            // the whole reason the fallback below exists) — LooksLikeSectionBreak itself treats
            // blank as a match too, so it must only be checked when there's real text to judge.
            if (!string.IsNullOrWhiteSpace(rawItemName) && LooksLikeSectionBreak(rawItemName)) continue;
            var itemName = rawItemName;
            // Pull in rows that have a code but blank item description — use the code itself
            // as the name so it's identifiable and unique (a shared placeholder like "Null"
            // would make two different code-only items collide with each other).
            if (string.IsNullOrWhiteSpace(itemName) && (!string.IsNullOrWhiteSpace(code) || !string.IsNullOrWhiteSpace(code2)))
                itemName = !string.IsNullOrWhiteSpace(code) ? code : code2;
            if (string.IsNullOrWhiteSpace(itemName)) continue;

            var parentVal = (row.ParentDescription ?? "").Trim();
            var parentCode = (row.ParentCode ?? "").Trim();
            // Same fallback for the parent side — use its own code as the name when blank.
            if (string.IsNullOrWhiteSpace(parentVal) && !string.IsNullOrWhiteSpace(parentCode))
                parentVal = parentCode;

            var kj = row.Kj;
            var kcal = row.Kcal;
            if (kcal > 0 && kj == 0) kj = Math.Round(kcal * 4.184m);
            if (kj > 0 && kcal == 0) kcal = Math.Round(kj / 4.184m);
            var salt = row.Salt;
            if (row.SodiumMg > 0 && salt == 0) salt = Math.Round(row.SodiumMg * 2.5m / 1000m, 2);

            var category = MapBomCategory(row.Category);
            var supplier = (row.Supplier ?? "").Trim();
            if (IsPackagingSupplier(supplier)) category = "Packaging";
            if (itemName.StartsWith("NF ", StringComparison.OrdinalIgnoreCase)) category = "Packaging";

            var costUom = !string.IsNullOrWhiteSpace(row.CostUom) ? NormUom(row.CostUom) : null;
            // NF items default to EACH (most are countable packaging: boxes, labels, lids) but
            // only when the sheet didn't already specify a real UOM — some NF items are film/
            // wrap rolls genuinely measured in M, and the sheet's own UnitofMeasureCode for that
            // row is authoritative when present, overriding this blanket default would be wrong.
            if (costUom is null && itemName.StartsWith("NF ", StringComparison.OrdinalIgnoreCase)) costUom = "EACH";

            var item = new ItemData
            {
                ItemName = itemName,
                Code = code,
                Code2 = code2,
                CodeB = (row.CodeB ?? "").Trim(),
                QtyKg = row.QtyKg <= 0 ? 0.1m : row.QtyKg,
                Cat = category,
                ComponentType = (row.ComponentType ?? "").Trim(),
                Supplier = supplier,
                CostPerKg = row.CostPerKg,
                CostUom = costUom,
                ScrapPct = row.ScrapPct,
                Kj = kj,
                Kcal = kcal,
                Fat = row.Fat,
                Sat = row.Sat,
                Carb = row.Carb,
                Sugar = row.Sugar,
                Fibre = row.Fibre,
                Protein = row.Protein,
                Salt = salt
            };

            // Codes are guaranteed unique (never reused between distinct items), while two
            // genuinely different items can share an identical description (e.g. two Teriyaki
            // sauce SKUs from different suppliers both literally named "CPU RM Sauce Teriyaki
            // Kikkoman") — so code must win whenever present, with name only as a fallback for
            // rows that genuinely have no code at all. Matching by name first previously merged
            // such distinct items into one, silently discarding whichever wasn't matched first.
            var nameNorm = Norm(itemName);
            var codeNorm = Norm(code);
            var itemKey = !string.IsNullOrWhiteSpace(codeNorm) ? codeNorm
                : (!string.IsNullOrWhiteSpace(Norm(code2)) ? Norm(code2) : nameNorm);
            if (!string.IsNullOrWhiteSpace(itemKey))
            {
                if (!allItemDataByKey.TryGetValue(itemKey, out var existingItem))
                    allItemDataByKey[itemKey] = item;
                else if (string.IsNullOrWhiteSpace(existingItem.CostUom) && !string.IsNullOrWhiteSpace(costUom))
                    existingItem.CostUom = costUom; // Merge costUom from later row when first had none
            }

            if (string.IsNullOrWhiteSpace(parentVal))
            {
                UpsertIngredient(item, result);
                continue;
            }

            // Group by CODE first (guaranteed unique — ParentItemNo), falling back to name only
            // when a row genuinely has no code. Two distinct parent items can share an identical
            // ParentDescription (verified: codes 105039 and 105041 both "CPU RM Sauce Teriyaki
            // Kikkoman" at different costs) — grouping by name first merged them into one,
            // silently dropping whichever one's rows were processed second.
            var parentCodeNorm = Norm(parentCode);
            var parentKey = !string.IsNullOrWhiteSpace(parentCodeNorm) ? parentCodeNorm : Norm(parentVal);
            if (string.IsNullOrWhiteSpace(parentKey)) { UpsertIngredient(item, result); continue; }

            parentValuesSet.Add(parentKey);
            if (!recipeGroups.TryGetValue(parentKey, out var group))
            {
                group = new RecipeGroup
                {
                    Name = parentVal,
                    Code = parentCode,
                    // Parent/recipe UOM only (sub & finished recipes). Not the item purchase UOM.
                    // Left blank (not defaulted to "G" yet) when the sheet didn't supply one —
                    // single-component recipes fall back to the base ingredient's own cost UOM
                    // instead, which NormServingUom's blanket "G" default would otherwise mask.
                    Uom = string.IsNullOrWhiteSpace(row.ParentUom) ? "" : NormUom(row.ParentUom),
                    ParentCost = row.ParentCost,
                    ParentNoofPortions = row.ParentNoofPortions
                };
                recipeGroups[parentKey] = group;
            }
            else
            {
                if (string.IsNullOrWhiteSpace(group.Uom) && !string.IsNullOrWhiteSpace(row.ParentUom))
                    group.Uom = NormUom(row.ParentUom);
                if (group.ParentCost <= 0 && row.ParentCost > 0)
                {
                    group.ParentCost = row.ParentCost;
                    group.ParentNoofPortions = row.ParentNoofPortions;
                }
            }
            group.Items.Add(item);
        }

        // 1) Base ingredients: in itemdescription but never in parent.
        foreach (var kv in allItemDataByKey)
        {
            if (parentValuesSet.Contains(kv.Key)) continue;
            EnsureIngredientExists(kv.Value, result);
        }

        var parentNamesSet = new Dictionary<string, string>();
        var parentCodesSet = new Dictionary<string, string>();
        foreach (var (parentKey, group) in recipeGroups)
        {
            // parentKey is now code-primary (see above), so this must index by the group's
            // actual NAME here — not parentKey itself, which would wrongly register a code as
            // if it were a name and break every name-based fallback lookup below.
            var nameKey = Norm(group.Name);
            if (!string.IsNullOrWhiteSpace(nameKey)) parentNamesSet[nameKey] = parentKey;
            var code = Norm(group.Code);
            if (!string.IsNullOrWhiteSpace(code)) parentCodesSet[code] = parentKey;
        }

        // 3) Determine which parents are used as items elsewhere (sub-recipe marker).
        var parentNamesAsItems = new HashSet<string>();
        foreach (var (parentKey, group) in recipeGroups)
        {
            var parentCode = Norm(group.Code);
            var parentName = Norm(group.Name);
            foreach (var (otherKey, otherGroup) in recipeGroups)
            {
                if (otherKey == parentKey) continue;
                foreach (var item in otherGroup.Items)
                {
                    var itemNorm = Norm(item.ItemName);
                    var itemCodeNorm = Norm(!string.IsNullOrWhiteSpace(item.Code) ? item.Code : item.Code2);
                    // Code match is authoritative; name match is a fallback and only meaningful
                    // when this parent's code wasn't what identified it in the first place (a
                    // shared name no longer implies the same item now that codes take priority).
                    if ((!string.IsNullOrWhiteSpace(parentCode) && itemCodeNorm == parentCode)
                        || (!string.IsNullOrWhiteSpace(parentName) && itemNorm == parentName))
                        parentNamesAsItems.Add(parentKey);
                }
            }
        }

        // 2) Single-component ingredients: parent with exactly one base ingredient.
        var singleComponentParents = new HashSet<string>();
        foreach (var (parentKey, group) in recipeGroups)
        {
            if (group.Items.Count != 1) continue;
            var item = group.Items[0];
            var itemName = Norm(item.ItemName);
            var itemCode = Norm(!string.IsNullOrWhiteSpace(item.Code) ? item.Code : item.Code2);
            var itemIsParentElsewhere =
                parentNamesSet.ContainsKey(itemName)
                || (!string.IsNullOrWhiteSpace(itemCode) && parentCodesSet.ContainsKey(itemCode));
            if (!itemIsParentElsewhere) singleComponentParents.Add(parentKey);
        }

        var parentToRecipeId = new Dictionary<string, string>();

        // Create non-single recipes: 3) sub-recipes and 4) finished products.
        foreach (var (parentKey, group) in recipeGroups)
        {
            if (singleComponentParents.Contains(parentKey)) continue;
            var recipeType = parentNamesAsItems.Contains(parentKey) ? "subRecipe" : "finishedProduct";
            // parentKey is code-primary now — match the existing recipe by its own code first
            // (guaranteed unique, so this correctly finds/updates the SAME recipe on a re-import
            // even if its description gets edited), falling back to name ONLY when the group has
            // no code AND the name-matched candidate has no code of its own either. Matching by
            // name onto a recipe that already has a DIFFERENT valid code is exactly the
            // duplicate-name collision this whole change exists to prevent — verified this
            // caused real corruption: two distinct items both named "CPU RM Sauce Teriyaki
            // Kikkoman" (codes 105039 and 105041) processed in the same run, the second one's
            // content silently overwrote the first's existing, already-correct record via this
            // exact fallback. A recipe that already owns a different code is never a valid name
            // fallback target — its code makes it a distinct, already-identified item.
            var groupCodeNorm = Norm(group.Code);
            var existing = (!string.IsNullOrWhiteSpace(groupCodeNorm) ? store.Recipes.FirstOrDefault(r => Norm(r.Code) == groupCodeNorm) : null)
                ?? store.Recipes.FirstOrDefault(r => Norm(r.Name) == Norm(group.Name) && string.IsNullOrWhiteSpace(Norm(r.Code)));
            // Sheet cost captured for every recipe (not just single-ingredient) purely for
            // display comparison against the tallied cost — never overrides the computed value.
            allItemDataByKey.TryGetValue(parentKey, out var ownGroupRow);
            // ParentCost from the sheet is a whole-batch total, not a per-unit cost — e.g. BC's
            // own "StandardCost" for an item equals its ParentCost / ParentNoofPortions exactly
            // (verified against the source BOM: LR MIX's ParentCost 6.3897 / ParentNoofPortions
            // 1.38306 = 4.61998, its StandardCost everywhere else it's referenced). Divide it
            // down to a true per-unit figure before using it as the comparison value.
            var normalizedParentCost = group.ParentCost > 0
                ? (group.ParentNoofPortions > 0 ? group.ParentCost / group.ParentNoofPortions : group.ParentCost)
                : 0;
            // Sanity clamp: a real per-unit food cost is never in the thousands — a value this
            // large means the column mapping picked up the wrong cell for that row, so fall
            // back rather than store an obviously-bogus value.
            var groupSheetCost = (normalizedParentCost > 0 && normalizedParentCost < 1000) ? normalizedParentCost : (ownGroupRow?.CostPerKg ?? 0);
            if (existing is null)
            {
                existing = new Recipe
                {
                    Id = NewId(),
                    Name = group.Name,
                    Code = group.Code,
                    RecipeType = recipeType,
                    Uom = string.IsNullOrWhiteSpace(group.Uom) ? "G" : group.Uom,
                    Desc = "Imported from " + (req.SourceName ?? "spreadsheet"),
                    SheetCost = groupSheetCost,
                    // The sheet's own declared cost for this item is authoritative — trust it
                    // over summing this item's own BOM lines. Some items (e.g. "RM Wasabi
                    // Sachet 1.5g") have orphaned/misfiled component rows in the source sheet
                    // that don't actually belong to them (unrelated meal-kit items under the
                    // wrong parent code) while every reference to the item elsewhere — including
                    // its own header rows — consistently quotes the same real cost. Without
                    // this, those bogus child rows get summed into a nonsense derived cost.
                    OwnCost = groupSheetCost
                };
                store.Recipes.Add(existing);
                result.RecipesCreated++;
            }
            else
            {
                existing.RecipeType = recipeType;
                existing.Code = string.IsNullOrWhiteSpace(existing.Code) ? group.Code : existing.Code;
                if (!string.IsNullOrWhiteSpace(group.Uom)) existing.Uom = group.Uom;
                if (groupSheetCost > 0) { existing.SheetCost = groupSheetCost; existing.OwnCost = groupSheetCost; }
            }
            parentToRecipeId[parentKey] = existing.Id;
        }

        // Create single-component recipes.
        foreach (var parentKey in singleComponentParents)
        {
            var group = recipeGroups[parentKey];
            var item = group.Items[0];
            var baseIngredient = FindIngredient(item.ItemName, item.Code, item.Code2);
            if (baseIngredient is null)
            {
                baseIngredient = CreateIngredient(item);
                store.Ingredients.Add(baseIngredient);
                result.IngredientsCreated++;
            }
            // Falls back to the base ingredient's own cost UOM (then KG) rather than "G" —
            // these are almost always weight-based preps, and a "G" default here silently
            // shrinks this line 1000x wherever it's later used as a KG-based sub-recipe.
            var singleUom = string.IsNullOrWhiteSpace(group.Uom) ? LineUom(baseIngredient.CostUOM) : group.Uom;
            var singleLine = new RecipeLine { IngredientId = baseIngredient.Id, Qty = item.QtyKg, Uom = LineUom(baseIngredient.CostUOM), ScrapPct = NormalizeScrapPct(item.ScrapPct) };
            // Match existing recipes by name/code (like the multi-component path below) so a
            // re-upload refreshes this recipe's scrap/qty/UOM in place instead of creating a
            // duplicate with a new Id — otherwise anything already referencing the old Id (as
            // a subRecipeId elsewhere) would keep pointing at stale, unrefreshed data.
            // Code first (guaranteed unique — see the multi-component path above for why), name
            // only as a fallback when BOTH this group has no code AND the name-matched candidate
            // has no code of its own — a name match onto a recipe that already has a different
            // valid code is a duplicate-name collision, not the same item (verified: this exact
            // gap let 105041's import content silently overwrite 105039's existing, already-
            // correct single-ingredient recipe, since 105041 had no code match of its own and
            // fell back to matching the shared name "CPU RM Sauce Teriyaki Kikkoman").
            var singleGroupCodeNorm = Norm(group.Code);
            var existingSingle = (!string.IsNullOrWhiteSpace(singleGroupCodeNorm) ? store.Recipes.FirstOrDefault(r => Norm(r.Code) == singleGroupCodeNorm) : null)
                ?? store.Recipes.FirstOrDefault(r => Norm(r.Name) == Norm(group.Name) && string.IsNullOrWhiteSpace(Norm(r.Code)));
            Recipe rec;
            if (existingSingle is not null)
            {
                rec = existingSingle;
                rec.RecipeType = "subRecipe";
                rec.Uom = singleUom;
                rec.Ingredients = [singleLine];
            }
            else
            {
                rec = new Recipe
                {
                    Id = NewId(),
                    Name = group.Name,
                    Code = group.Code,
                    RecipeType = "subRecipe",
                    Uom = singleUom,
                    Desc = "Imported from " + (req.SourceName ?? "spreadsheet") + " — single-component ingredient (links to base)",
                    Ingredients = [singleLine]
                };
                store.Recipes.Add(rec);
                result.RecipesCreated++;
                result.SingleComponentCreated++;
            }
            // Own cost still comes from the item's own separate row when it has one.
            if (allItemDataByKey.TryGetValue(parentKey, out var ownRow) && ownRow.CostPerKg > 0)
            {
                rec.OwnCost = ownRow.CostPerKg;
            }
            parentToRecipeId[parentKey] = rec.Id;
        }

        // Fill non-single recipe lines: ingredients or subRecipeId.
        foreach (var (parentKey, group) in recipeGroups)
        {
            if (singleComponentParents.Contains(parentKey)) continue;
            if (!parentToRecipeId.TryGetValue(parentKey, out var recId)) continue;
            var recipe = store.Recipes.First(r => r.Id == recId);
            var lines = new List<RecipeLine>();

            foreach (var item in group.Items)
            {
                var itemNorm = Norm(item.ItemName);
                var itemCodeNorm = Norm(!string.IsNullOrWhiteSpace(item.Code) ? item.Code : item.Code2);
                // Code first (guaranteed unique), name only as a fallback for a row with no code
                // at all — matching by name first previously resolved a component reference to
                // whichever of two same-named-but-different-coded parents happened to be
                // registered first (see codes 105039/105041, both "CPU RM Sauce Teriyaki
                // Kikkoman" at different costs), silently pointing every recipe that should use
                // one at the other instead. parentNamesSet/parentCodesSet both map to the
                // group's real (code-primary) parentKey now, not a raw name.
                var itemParentKey = (!string.IsNullOrWhiteSpace(itemCodeNorm) && parentCodesSet.TryGetValue(itemCodeNorm, out var pkByCode)) ? pkByCode
                    : (parentNamesSet.TryGetValue(itemNorm, out var pkByName) ? pkByName : "");
                var isPackagingItem = string.Equals(item.Cat, "Packaging", StringComparison.OrdinalIgnoreCase)
                    || item.ItemName.StartsWith("NF ", StringComparison.OrdinalIgnoreCase);
                var isExplicitItem = string.Equals(item.ComponentType, "Item", StringComparison.OrdinalIgnoreCase);
                var isExplicitRecipe = string.Equals(item.ComponentType, "Production BOM", StringComparison.OrdinalIgnoreCase);

                if (!isPackagingItem
                    && !isExplicitItem
                    && (isExplicitRecipe || string.IsNullOrWhiteSpace(item.ComponentType))
                    && !string.IsNullOrWhiteSpace(itemParentKey)
                    && itemParentKey != parentKey
                    && parentToRecipeId.TryGetValue(itemParentKey, out var subId)
                    && subId != recId)
                {
                    // Use this row's own Item UOM when the sheet supplied one, otherwise fall
                    // back to the referenced sub-recipe's own UOM rather than hardcoding "KG" —
                    // forcing KG onto an EACH/M-based sub-recipe reference (e.g. a sushi piece
                    // cut from a roll) corrupts its cost by orders of magnitude.
                    var subRecForUom = store.Recipes.FirstOrDefault(r => r.Id == subId);
                    var subLineUom = !string.IsNullOrWhiteSpace(item.CostUom) ? NormUom(item.CostUom) : LineUom(subRecForUom?.Uom);
                    lines.Add(new RecipeLine { SubRecipeId = subId, Qty = item.QtyKg, Uom = subLineUom, ScrapPct = NormalizeScrapPct(item.ScrapPct) });
                    continue;
                }

                var ingredient = FindIngredient(item.ItemName, item.Code, item.Code2);
                if (ingredient is null)
                {
                    ingredient = CreateIngredient(item);
                    store.Ingredients.Add(ingredient);
                    result.IngredientsCreated++;
                }
                else
                {
                    UpdateIngredient(ingredient, item);
                    result.IngredientsUpdated++;
                }
                lines.Add(new RecipeLine { IngredientId = ingredient.Id, Qty = item.QtyKg, Uom = LineUom(ingredient.CostUOM), ScrapPct = NormalizeScrapPct(item.ScrapPct) });
            }

            recipe.Ingredients = ConvertMergedLinesToIngredientUom(MergeLinesInGrams(lines));
        }

        return result;
    }

    private static bool LooksLikeSectionBreak(string itemName)
    {
        var n = itemName.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(n)) return true;
        return n is "TOTAL" or "SUBTOTAL" or "TOTALS" or "---" or "===" || int.TryParse(n, out _);
    }

    private static string Norm(string? value) =>
        (value ?? "").Trim().ToLowerInvariant().Replace("  ", " ");

    private static string NormUom(string? value)
    {
        var v = (value ?? "").Trim().ToUpperInvariant().TrimEnd('.', ',');
        if (string.IsNullOrWhiteSpace(v)) return "KG";
        if (v == "L" || v == "LITRE" || v == "LITRES") return "L";
        if (v == "EACH" || v == "EACHES" || v == "EA" || v == "UNIT" || v == "UNITS" || v == "U" || v == "PCS" || v == "PCE" || v == "PC" || v == "NO" || v == "STK" || v == "CTN" || v == "BOX") return "EACH";
        if (v == "ML") return "ML";
        if (v == "G" || v == "GRAM" || v == "GRAMS") return "G";
        return v == "KG" || v == "KGS" || v == "KILO" || v == "KILOGRAM" ? "KG" : v;
    }

    /// <summary>Normalize UOM for recipe/parent serving (default G when empty).</summary>
    private static string NormServingUom(string? value)
    {
        var v = (value ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(v)) return "G";
        return NormUom(value);
    }

    private static string NewId() => "id_" + Guid.NewGuid().ToString("N")[..9];

    private static decimal NormalizeScrapPct(decimal scrapPct) => (scrapPct >= 0 && scrapPct < 100) ? scrapPct : 0;

    private static bool IsPackagingSupplier(string supplier) =>
        PackagingSuppliers.Contains(Norm(supplier));

    private static string MapBomCategory(string? category)
    {
        var value = (category ?? "").Trim();
        if (string.IsNullOrWhiteSpace(value)) return "Raw Material";
        if (value.Contains("Direct Packaging", StringComparison.OrdinalIgnoreCase)) return "Packaging";
        return value;
    }

    private void EnsureIngredientExists(ItemData item, RecipeStructureImportResult result)
    {
        var existing = FindIngredient(item.ItemName, item.Code, item.Code2);
        if (existing is null)
        {
            store.Ingredients.Add(CreateIngredient(item));
            result.IngredientsCreated++;
        }
    }

    private void UpsertIngredient(ItemData item, RecipeStructureImportResult result)
    {
        var existing = FindIngredient(item.ItemName, item.Code, item.Code2);
        if (existing is null)
        {
            store.Ingredients.Add(CreateIngredient(item));
            result.IngredientsCreated++;
            return;
        }
        UpdateIngredient(existing, item);
        result.IngredientsUpdated++;
    }

    private Ingredient? FindIngredient(string name, string code, string code2)
    {
        var codeN = Norm(code);
        var code2N = Norm(code2);
        var nameN = Norm(name);
        // Code match tried FIRST, exclusively — not OR'd together with the name check in one
        // query. Codes are guaranteed unique, while two distinct ingredients can share an
        // identical name, so a single combined OR query risks returning a same-named-but-wrong
        // ingredient (whichever comes first in the list) even when an exact code match exists
        // elsewhere. Name is only consulted as a fallback when no code was supplied at all.
        if (!string.IsNullOrWhiteSpace(codeN) || !string.IsNullOrWhiteSpace(code2N))
        {
            var byCode = store.Ingredients.FirstOrDefault(i =>
                (!string.IsNullOrWhiteSpace(codeN) && (Norm(i.Code) == codeN || i.AltCodes.Any(c => Norm(c) == codeN)))
                || (!string.IsNullOrWhiteSpace(code2N) && (Norm(i.Code) == code2N || i.AltCodes.Any(c => Norm(c) == code2N))));
            if (byCode is not null) return byCode;
        }
        // Name fallback only matches an ingredient that has NO code of its own — matching onto
        // one that already has a different valid code is a duplicate-name collision, not the
        // same item (verified this exact gap corrupted an existing recipe elsewhere in this
        // file; same fix applied here for consistency).
        return !string.IsNullOrWhiteSpace(nameN)
            ? store.Ingredients.FirstOrDefault(i => Norm(i.Name) == nameN && string.IsNullOrWhiteSpace(Norm(i.Code)))
            : null;
    }

    private static Ingredient CreateIngredient(ItemData item)
    {
        var primary = !string.IsNullOrWhiteSpace(item.Code) ? item.Code : item.Code2;
        var altCodes = new List<string>();
        if (!string.IsNullOrWhiteSpace(item.Code2) && item.Code2 != primary) altCodes.Add(item.Code2);
        if (!string.IsNullOrWhiteSpace(item.Code) && item.Code != primary && !altCodes.Contains(item.Code)) altCodes.Add(item.Code);
        return new Ingredient
        {
            Id = NewId(),
            Name = item.ItemName,
            Code = primary,
            CodeB = item.CodeB ?? "",
            AltCodes = altCodes,
            Cat = item.Cat,
            Kj = item.Kj,
            Kcal = item.Kcal,
            Fat = item.Fat,
            Sat = item.Sat,
            Carb = item.Carb,
            Sugar = item.Sugar,
            Fibre = item.Fibre,
            Protein = item.Protein,
            Salt = item.Salt,
            Cost = item.CostPerKg,
            CostUOM = !string.IsNullOrWhiteSpace(item.CostUom) ? item.CostUom : "KG",
            Supplier = item.Supplier
        };
    }

    private static void UpdateIngredient(Ingredient target, ItemData src)
    {
        if (src.Kj > 0) target.Kj = src.Kj;
        if (src.Kcal > 0) target.Kcal = src.Kcal;
        if (src.Fat > 0) target.Fat = src.Fat;
        if (src.Sat > 0) target.Sat = src.Sat;
        if (src.Carb > 0) target.Carb = src.Carb;
        if (src.Sugar > 0) target.Sugar = src.Sugar;
        if (src.Fibre > 0) target.Fibre = src.Fibre;
        if (src.Protein > 0) target.Protein = src.Protein;
        if (src.Salt > 0) target.Salt = src.Salt;
        if (src.CostPerKg > 0) target.Cost = src.CostPerKg;
        if (!string.IsNullOrWhiteSpace(src.CostUom)) target.CostUOM = src.CostUom ?? "";
        if (!string.IsNullOrWhiteSpace(src.CodeB)) target.CodeB = src.CodeB ?? "";
        if (!string.IsNullOrWhiteSpace(src.Code)) target.Code = src.Code;
        if (!string.IsNullOrWhiteSpace(src.Code2) && src.Code2 != target.Code && !target.AltCodes.Contains(src.Code2))
            target.AltCodes.Add(src.Code2);
        if (!string.IsNullOrWhiteSpace(src.Supplier)) target.Supplier = src.Supplier;
        if (!string.IsNullOrWhiteSpace(src.Cat) && src.Cat != "Other") target.Cat = src.Cat;
        target.VersionHistory.Add(DateTimeOffset.UtcNow.ToString("O"));
    }

    private static List<RecipeLine> MergeLinesInGrams(List<RecipeLine> lines)
    {
        var merged = new Dictionary<string, RecipeLine>();
        foreach (var line in lines)
        {
            var qtyG = QtyToGrams(line.Qty, line.Uom);
            var key = !string.IsNullOrWhiteSpace(line.IngredientId) ? $"i:{line.IngredientId}" : $"s:{line.SubRecipeId}";
            if (!merged.TryGetValue(key, out var existing))
            {
                existing = new RecipeLine
                {
                    IngredientId = line.IngredientId,
                    SubRecipeId = line.SubRecipeId,
                    Qty = qtyG,
                    Uom = "G",
                    ScrapPct = line.ScrapPct
                };
                merged[key] = existing;
            }
            else
            {
                existing.Qty += qtyG;
                if (line.ScrapPct > existing.ScrapPct) existing.ScrapPct = line.ScrapPct;
            }
        }
        return merged.Values.ToList();
    }

    private static decimal QtyToGrams(decimal qty, string? uom)
    {
        return (uom ?? "G").Trim().ToUpperInvariant() switch
        {
            "KG" => qty * 1000m,
            "L" => qty * 1000m,
            "ML" => qty,
            "EACH" => qty * 100m,
            _ => qty
        };
    }

    /// <summary>Convert grams to quantity in the given UOM (inverse of QtyToGrams for display).</summary>
    private static decimal GramsToUom(decimal grams, string uom)
    {
        var u = (uom ?? "G").Trim().ToUpperInvariant();
        return u switch
        {
            "KG" => grams / 1000m,
            "L" => grams / 1000m,
            "ML" => grams,
            "EACH" => grams / 100m,
            _ => grams
        };
    }

    private static string LineUom(string? costUom) =>
        string.IsNullOrWhiteSpace(costUom) ? "KG" : costUom.Trim().ToUpperInvariant();

    /// <summary>After merge, lines have Qty in grams and Uom "G". Convert each ingredient line to the ingredient's CostUOM.</summary>
    private List<RecipeLine> ConvertMergedLinesToIngredientUom(List<RecipeLine> mergedLines)
    {
        var result = new List<RecipeLine>();
        foreach (var line in mergedLines)
        {
            if (!string.IsNullOrWhiteSpace(line.IngredientId))
            {
                var ing = store.Ingredients.FirstOrDefault(i => i.Id == line.IngredientId);
                var uom = LineUom(ing?.CostUOM);
                result.Add(new RecipeLine
                {
                    IngredientId = line.IngredientId,
                    SubRecipeId = line.SubRecipeId,
                    Qty = GramsToUom(line.Qty, uom),
                    Uom = uom,
                    FvnOverride = line.FvnOverride,
                    ScrapPct = line.ScrapPct
                });
            }
            else
            {
                // Convert to the referenced sub-recipe's own UOM (KG/EACH/M/etc.), not a
                // hardcoded "KG" — forcing KG here silently corrupts any line pointing at an
                // EACH- or M-based sub-recipe (e.g. sushi pieces cut from a roll), deflating
                // its cost by orders of magnitude.
                var subRec = store.Recipes.FirstOrDefault(r => r.Id == line.SubRecipeId);
                var subUom = LineUom(subRec?.Uom);
                result.Add(new RecipeLine
                {
                    IngredientId = line.IngredientId,
                    SubRecipeId = line.SubRecipeId,
                    Qty = GramsToUom(line.Qty, subUom),
                    Uom = subUom,
                    FvnOverride = line.FvnOverride,
                    ScrapPct = line.ScrapPct
                });
            }
        }
        return result;
    }

    private sealed class RecipeGroup
    {
        public string Name { get; set; } = "";
        public string Code { get; set; } = "";
        public string Uom { get; set; } = "G";
        public decimal ParentCost { get; set; }
        public decimal ParentNoofPortions { get; set; }
        public List<ItemData> Items { get; } = [];
    }

    private sealed class ItemData
    {
        public string ItemName { get; set; } = "";
        public string Code { get; set; } = "";
        public string Code2 { get; set; } = "";
        public string CodeB { get; set; } = "";
        public decimal QtyKg { get; set; }
        public string Cat { get; set; } = "Other";
        public string ComponentType { get; set; } = "";
        public string Supplier { get; set; } = "";
        public decimal CostPerKg { get; set; }
        public string? CostUom { get; set; }
        public decimal ScrapPct { get; set; } = -1;
        public decimal Kj { get; set; }
        public decimal Kcal { get; set; }
        public decimal Fat { get; set; }
        public decimal Sat { get; set; }
        public decimal Carb { get; set; }
        public decimal Sugar { get; set; }
        public decimal Fibre { get; set; }
        public decimal Protein { get; set; }
        public decimal Salt { get; set; }
    }
}
