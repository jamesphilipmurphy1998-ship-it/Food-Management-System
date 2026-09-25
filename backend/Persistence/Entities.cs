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
    public decimal UnitWeightG { get; set; }
    public string Supplier { get; set; } = "";
    public List<string> Allergens { get; set; } = [];
    public bool Fvn { get; set; }
    public bool Approved { get; set; }
    public string Created { get; set; } = "";
    public List<string> VersionHistory { get; set; } = [];
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
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
    public decimal UnitWeightG { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public bool PendingApproval { get; set; }
    public string? PendingApprovalReviewerName { get; set; }
    public DateTimeOffset? PendingApprovalAt { get; set; }

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

/// <summary>A folder in the Projects page's tree (Projects → Technical/Food Team → ... → a
/// folder that actually holds recipes). Shared across all users, unlike the old localStorage-only
/// flat list. Id doubles as the "Project:{id}" descriptionTag slug a recipe is tagged with —
/// unchanged mechanism, folders just now form a tree instead of a flat list. Locked folders
/// (the fixed Technical/Food Team/Restaurant/Grocery structure) can't be renamed or deleted from
/// the UI, so the hierarchy the business actually asked for can't be accidentally torn down.</summary>
public sealed class ProjectFolderEntity
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? ParentId { get; set; }
    public bool Locked { get; set; }
    /// <summary>Explicit, chosen-at-creation-time folder type — not inferred from whether it
    /// currently has children, which broke for a freshly-created, still-empty layer folder.
    /// true = a "layer" folder that holds other folders (never recipes directly); false = a
    /// "recipe" folder, a leaf that holds recipes (never sub-folders). All locked structural
    /// folders are layers.</summary>
    public bool IsLayer { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>A NutriCost account for local (username/password) sign-in — same pattern as Wasabi
/// Timeline's `timeline_users` table, so this can later be switched to Entra ID the same way
/// Timeline was, without changing the shape of "who is signed in." SiteRole gates the User
/// Settings admin page; every other endpoint is still shared data (accounts don't yet scope
/// ingredients/recipes to a single user — that's the next step once this framework is in place).</summary>
public sealed class NutriUserEntity
{
    public string Id { get; set; } = "";
    public string Username { get; set; } = "";
    public string Email { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string PassHash { get; set; } = "";
    public string SiteRole { get; set; } = "user";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>A named comparison a signed-in user saved for later — personal, not shared: only
/// visible to the account that created it (enforced server-side by matching UserId against the
/// caller's NameIdentifier claim, not just hidden client-side). Only reachable under
/// NUTRICOST_AUTH_MODE=local, where accounts are real; other modes have no per-user identity to
/// scope this by.</summary>
public sealed class ComparisonSaveEntity
{
    public string Id { get; set; } = "";
    public string UserId { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>JSON array of {kind,id,name,code,sellPrice,annualVolume} — same shape the
    /// frontend already builds client-side, just persisted instead of kept in localStorage.</summary>
    public string ItemsJson { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>One account sharing a saved comparison with another — the comparison stays owned
/// (and editable/deletable) by whoever saved it; a share just grants the recipient read access
/// and shows up in their "Shared with me" list. A row here also produces a NotificationEntity
/// for the recipient at share time.</summary>
public sealed class ComparisonShareEntity
{
    public string Id { get; set; } = "";
    public string ComparisonSaveId { get; set; } = "";
    public string SharedByUserId { get; set; } = "";
    public string SharedWithUserId { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>A personal notification for one account — mirrors Wasabi Timeline's inbox/alert
/// panel structurally. Nothing produces these yet (no event creates a row here today); the
/// table and endpoints exist now so the upcoming "share a saved comparison with another
/// account" feature can start writing rows without a schema change, and the frontend panel has
/// something real to read from in the meantime (just empty).</summary>
public sealed class NotificationEntity
{
    public string Id { get; set; } = "";
    public string UserId { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Body { get; set; }
    /// <summary>Client-side route to open when the notification is clicked, e.g. a comparison
    /// save id — shape TBD once the producing feature (shared comparisons) exists.</summary>
    public string? Link { get; set; }
    public bool Read { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
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
