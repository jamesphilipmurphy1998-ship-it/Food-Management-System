namespace NutriCost.Api.Persistence;

public sealed class IngredientEntity
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Code { get; set; } = "";
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
    public string CostUom { get; set; } = "";
    public decimal Density { get; set; } = 1;
    public string Supplier { get; set; } = "";
    public List<string> Allergens { get; set; } = [];
    public bool Fvn { get; set; }
    public bool Approved { get; set; }
    public string Created { get; set; } = "";
    public List<string> VersionHistory { get; set; } = [];
}

/// <summary>Append-only snapshot history for an ingredient. A new row is written only when the
/// saved fields actually differ from the previous version, so routine no-op syncs don't bump the version.</summary>
public sealed class IngredientVersionEntity
{
    public long Id { get; set; }
    public string IngredientId { get; set; } = "";
    public int VersionNumber { get; set; }
    /// <summary>JSON snapshot of the ingredient's fields at this version.</summary>
    public string Snapshot { get; set; } = "";
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    /// <summary>Optional user-entered note describing what changed, set via a follow-up call
    /// right after the save that created this version.</summary>
    public string? Comment { get; set; }
}

public sealed class RecipeEntity
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
    public string Created { get; set; } = "";
    public List<string> VersionHistory { get; set; } = [];
    public decimal YieldPct { get; set; } = 100;
    public decimal OwnCost { get; set; } = 0;
    public decimal SheetCost { get; set; } = 0;

    public List<RecipeLineEntity> Lines { get; set; } = [];
}

public sealed class RecipeLineEntity
{
    public long Id { get; set; }
    public string RecipeId { get; set; } = "";
    public string? IngredientId { get; set; }
    public string? SubRecipeId { get; set; }
    public decimal Qty { get; set; }
    public string Uom { get; set; } = "KG";
    public decimal? FvnOverride { get; set; }
    public decimal ScrapPct { get; set; } = 0;

    public RecipeEntity? Recipe { get; set; }
}

/// <summary>Shared export template (e.g. BC Form). Stored in backend so all users see the same templates.</summary>
public sealed class ExportTemplateEntity
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string FileName { get; set; } = "";
    /// <summary>Base64-encoded Excel file content.</summary>
    public string Data { get; set; } = "";
    /// <summary>JSON array of preview rows for thumbnail (optional).</summary>
    public string? Preview { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
