namespace NutriCost.Api;

using System.Text.Json.Serialization;

public sealed class Ingredient
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Code { get; set; } = "";
    /// <summary>Duplicate of Code column — populated on import like Code. Use for UOM or any other column from your sheet.</summary>
    [JsonPropertyName("codeB")]
    public string CodeB { get; set; } = "";
    public List<string> AltCodes { get; set; } = [];
    public List<string> DescriptionTags { get; set; } = [];
    public string Cat { get; set; } = "Other";
    public decimal Kj { get; set; }
    public decimal Kcal { get; set; }
    public decimal Fat { get; set; }
    public decimal Sat { get; set; }
    public decimal Carb { get; set; }
    public decimal Sugar { get; set; }
    public decimal Fibre { get; set; }
    public decimal Protein { get; set; }
    public decimal Salt { get; set; }
    public decimal Cost { get; set; }
    [JsonPropertyName("costUom")]
    public string CostUOM { get; set; } = "KG";
    /// <summary>Density in kg/L (default 1). Used to convert between KG and L in recipes.</summary>
    public decimal Density { get; set; } = 1;
    /// <summary>Weight in grams of 1 EACH of this ingredient (e.g. one whole cucumber). 0 = not
    /// known. Only used when this ingredient is counted in EACH but needs to contribute real
    /// weight toward a recipe's total/cost-per-kg — never assume a value, since a wrong guess
    /// silently corrupts cost-per-kg math. Leave 0 to exclude it from weight totals entirely
    /// (the same way packaging is excluded), rather than inventing a number.</summary>
    public decimal UnitWeightG { get; set; }
    public string Supplier { get; set; } = "";
    public List<string> Allergens { get; set; } = [];
    public bool Fvn { get; set; }
    public bool Approved { get; set; }
    public string Created { get; set; } = DateTimeOffset.UtcNow.ToString("O");
    public List<string> VersionHistory { get; set; } = [];
    /// <summary>Optimistic-concurrency stamp — the server's last-saved time for this row. A
    /// client sends back whatever value it last fetched; the single-record PUT endpoint
    /// rejects the save with 409 if this doesn't match the row's current value (someone else
    /// saved in between). Null/default on a client's initial in-memory copy before first save.</summary>
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class RecipeLine
{
    public string? IngredientId { get; set; }
    public string? SubRecipeId { get; set; }
    public decimal Qty { get; set; }
    public string Uom { get; set; } = "KG";
    public decimal? FvnOverride { get; set; }
    public decimal CostPerKg { get; set; }
    /// <summary>% of this specific input lost when used in THIS recipe (e.g. oil lost to
    /// frying vs. a vegetable mix retaining its weight) — per (recipe, line), not per
    /// ingredient or per recipe as a whole, since the same input can scrap differently in
    /// different recipes. 0 = no loss. Affects cost only, not nutrition.</summary>
    public decimal ScrapPct { get; set; } = 0;
}

public sealed class Recipe
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Code { get; set; } = "";
    public string Desc { get; set; } = "";
    public string Type { get; set; } = "food";
    public string RecipeType { get; set; } = "finishedProduct";
    public decimal Serving { get; set; } = 100;
    public string Uom { get; set; } = "G";
    public bool Approved { get; set; }
    public List<string> DescriptionTags { get; set; } = [];
    public List<RecipeLine> Ingredients { get; set; } = [];
    public string Created { get; set; } = DateTimeOffset.UtcNow.ToString("O");
    public List<string> VersionHistory { get; set; } = [];
    /// <summary>Percentage of input weight retained after prep (e.g. chopping, trimming).
    /// 100 = no loss. Only meaningful for single-ingredient sub-recipes; affects cost only —
    /// nutrition per 100g is unchanged by yield loss.</summary>
    public decimal YieldPct { get; set; } = 100;
    /// <summary>Direct cost per Uom from the source sheet/API (0 = not supplied). When set,
    /// this is authoritative and used instead of deriving cost from the base ingredient —
    /// the two should agree, but the sheet/API value wins if they ever don't. Falls back to
    /// the derived/linked cost only while this is unset (e.g. a development item with no
    /// cost feed yet).</summary>
    public decimal OwnCost { get; set; } = 0;
    /// <summary>Cost per Uom from the source sheet/API, captured for ANY recipe (not just
    /// single-ingredient ones) purely for comparison against the tallied/computed cost.
    /// Display-only — unlike OwnCost, this never overrides what the app actually calculates.</summary>
    public decimal SheetCost { get; set; } = 0;
    /// <summary>Weight in grams of 1 unit of this recipe's own UOM (e.g. 1 EACH for a sushi
    /// piece). 0 = not known. Recorded alongside the UOM without changing it — not yet used in
    /// any cost/weight calculation.</summary>
    public decimal UnitWeightG { get; set; }
    /// <summary>Optimistic-concurrency stamp — see Ingredient.UpdatedAt for the full explanation.</summary>
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class BomRow
{
    public string ParentDescription { get; set; } = "";
    public string ParentCode { get; set; } = "";
    public string ParentUom { get; set; } = "";
    public string ItemDescription { get; set; } = "";
    public string Code { get; set; } = "";
    public string Code2 { get; set; } = "";
    [JsonPropertyName("codeB")]
    public string CodeB { get; set; } = "";
    public decimal QtyKg { get; set; } = 0.1m;
    public string Category { get; set; } = "Other";
    public string ComponentType { get; set; } = "";
    public string Supplier { get; set; } = "";
    public decimal Kj { get; set; }
    public decimal Kcal { get; set; }
    public decimal Fat { get; set; }
    public decimal Sat { get; set; }
    public decimal Carb { get; set; }
    public decimal Sugar { get; set; }
    public decimal Fibre { get; set; }
    public decimal Protein { get; set; }
    public decimal Salt { get; set; }
    public decimal SodiumMg { get; set; }
    public decimal CostPerKg { get; set; }
    [JsonPropertyName("costUom")]
    public string? CostUom { get; set; }
    /// <summary>% of this item's own input weight lost in prep (e.g. chopping/trimming), from
    /// its own row in the sheet. -1 = not supplied (column not mapped). Only meaningful for
    /// single-ingredient sub-recipes.</summary>
    public decimal ScrapPct { get; set; } = -1;
    /// <summary>The parent recipe/finished-product's own total cost, as supplied by the sheet
    /// (e.g. a "ParentCost" column repeated on every line of that recipe). Comparison-only —
    /// never overrides the tallied cost calculation.</summary>
    public decimal ParentCost { get; set; }
    /// <summary>Batch size ParentCost was computed against (e.g. BC's "ParentNoofPortions").
    /// ParentCost is a whole-batch total, not a per-unit cost — divide by this to get the true
    /// per-unit comparison value. 0 = not supplied (treat ParentCost as already per-unit).</summary>
    public decimal ParentNoofPortions { get; set; }
}

public sealed class RecipeStructureImportRequest
{
    public List<BomRow> Rows { get; set; } = [];
    public string SourceName { get; set; } = "";
}

public sealed class RecipeStructureImportResult
{
    public int IngredientsCreated { get; set; }
    public int IngredientsUpdated { get; set; }
    public int RecipesCreated { get; set; }
    public int SingleComponentCreated { get; set; }
}

public sealed class ProjectFolderCreateRequest
{
    public string Name { get; set; } = "";
    public string? ParentId { get; set; }
    /// <summary>Only meaningful for the one-time structural seed (Technical/Food Team/etc) — the
    /// UI never lets a user create a locked folder.</summary>
    public bool Locked { get; set; }
    /// <summary>Lets the one-time client-side localStorage migration keep each folder's existing
    /// slug (so already-tagged recipes' "Project:{slug}" tags keep matching) instead of always
    /// generating a fresh one from the name.</summary>
    public string? Id { get; set; }
}

public sealed class ProjectFolderUpdateRequest
{
    public string Name { get; set; } = "";
}
