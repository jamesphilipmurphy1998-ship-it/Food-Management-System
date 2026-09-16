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
    public string Supplier { get; set; } = "";
    public List<string> Allergens { get; set; } = [];
    public bool Fvn { get; set; }
    public bool Approved { get; set; }
    public string Created { get; set; } = DateTimeOffset.UtcNow.ToString("O");
    public List<string> VersionHistory { get; set; } = [];
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
