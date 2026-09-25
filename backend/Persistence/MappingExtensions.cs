namespace NutriCost.Api.Persistence;

public static class MappingExtensions
{
    public static Ingredient ToModel(this IngredientEntity entity) => new()
    {
        Id = entity.Id,
        Name = entity.Name,
        Code = entity.Code,
        CodeB = entity.CodeB ?? "",
        AltCodes = entity.AltCodes.ToList(),
        DescriptionTags = entity.DescriptionTags.ToList(),
        Cat = entity.Cat,
        Kj = entity.Kj,
        Kcal = entity.Kcal,
        Fat = entity.Fat,
        Sat = entity.Sat,
        Carb = entity.Carb,
        Sugar = entity.Sugar,
        Fibre = entity.Fibre,
        Protein = entity.Protein,
        Salt = entity.Salt,
        Cost = entity.Cost,
        CostUOM = entity.CostUom ?? "",
        Density = entity.Density,
        UnitWeightG = entity.UnitWeightG,
        Supplier = entity.Supplier,
        Allergens = entity.Allergens.ToList(),
        Fvn = entity.Fvn,
        Approved = entity.Approved,
        Created = entity.Created,
        VersionHistory = entity.VersionHistory.ToList(),
        UpdatedAt = entity.UpdatedAt
    };

    public static IngredientEntity ToEntity(this Ingredient model) => new()
    {
        Id = model.Id,
        Name = model.Name,
        Code = model.Code,
        CodeB = model.CodeB ?? "",
        AltCodes = model.AltCodes.ToList(),
        DescriptionTags = model.DescriptionTags.ToList(),
        Cat = model.Cat,
        Kj = model.Kj,
        Kcal = model.Kcal,
        Fat = model.Fat,
        Sat = model.Sat,
        Carb = model.Carb,
        Sugar = model.Sugar,
        Fibre = model.Fibre,
        Protein = model.Protein,
        Salt = model.Salt,
        Cost = model.Cost,
        CostUom = model.CostUOM ?? "",
        Density = model.Density,
        UnitWeightG = model.UnitWeightG,
        Supplier = model.Supplier,
        Allergens = model.Allergens.ToList(),
        Fvn = model.Fvn,
        Approved = model.Approved,
        Created = model.Created,
        VersionHistory = model.VersionHistory.ToList()
    };

    public static Recipe ToModel(this RecipeEntity entity) => new()
    {
        Id = entity.Id,
        Name = string.IsNullOrWhiteSpace(entity.Name) && !string.IsNullOrWhiteSpace(entity.Code)
            ? "Name not detected"
            : (entity.Name ?? ""),
        Code = entity.Code,
        Desc = entity.Desc,
        Type = entity.Type,
        RecipeType = entity.RecipeType,
        Serving = entity.Serving,
        Uom = entity.Uom ?? "G",
        Approved = entity.Approved,
        DescriptionTags = entity.DescriptionTags.ToList(),
        Ingredients = entity.Lines.Select(ToModel).ToList(),
        Created = entity.Created,
        VersionHistory = entity.VersionHistory.ToList(),
        YieldPct = entity.YieldPct,
        OwnCost = entity.OwnCost,
        SheetCost = entity.SheetCost,
        UnitWeightG = entity.UnitWeightG,
        UpdatedAt = entity.UpdatedAt,
        PendingApproval = entity.PendingApproval,
        PendingApprovalReviewerName = entity.PendingApprovalReviewerName,
        PendingApprovalSubmittedByName = entity.PendingApprovalSubmittedByName,
        PendingApprovalAt = entity.PendingApprovalAt
    };

    public static RecipeEntity ToEntity(this Recipe model) => new()
    {
        Id = model.Id,
        Name = model.Name,
        Code = model.Code,
        Desc = model.Desc,
        Type = model.Type,
        RecipeType = model.RecipeType,
        Serving = model.Serving,
        Uom = model.Uom ?? "G",
        Approved = model.Approved,
        DescriptionTags = model.DescriptionTags.ToList(),
        Created = model.Created,
        VersionHistory = model.VersionHistory.ToList(),
        YieldPct = model.YieldPct,
        OwnCost = model.OwnCost,
        SheetCost = model.SheetCost,
        UnitWeightG = model.UnitWeightG,
        PendingApproval = model.PendingApproval,
        PendingApprovalReviewerName = model.PendingApprovalReviewerName,
        PendingApprovalSubmittedByName = model.PendingApprovalSubmittedByName,
        PendingApprovalAt = model.PendingApprovalAt,
        Lines = model.Ingredients.Select(l => l.ToEntity(model.Id)).ToList()
    };

    public static RecipeLine ToModel(this RecipeLineEntity entity) => new()
    {
        IngredientId = entity.IngredientId,
        SubRecipeId = entity.SubRecipeId,
        Qty = entity.Qty,
        Uom = entity.Uom ?? "KG",
        FvnOverride = entity.FvnOverride,
        ScrapPct = entity.ScrapPct
    };

    public static RecipeLineEntity ToEntity(this RecipeLine model, string recipeId) => new()
    {
        RecipeId = recipeId,
        IngredientId = model.IngredientId,
        SubRecipeId = model.SubRecipeId,
        ScrapPct = model.ScrapPct,
        Qty = model.Qty,
        Uom = model.Uom ?? "KG",
        FvnOverride = model.FvnOverride
    };
}
