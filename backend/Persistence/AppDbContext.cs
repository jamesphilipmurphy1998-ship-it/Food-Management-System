using Microsoft.EntityFrameworkCore;

namespace NutriCost.Api.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<IngredientEntity> Ingredients => Set<IngredientEntity>();
    public DbSet<IngredientVersionEntity> IngredientVersions => Set<IngredientVersionEntity>();
    public DbSet<RecipeEntity> Recipes => Set<RecipeEntity>();
    public DbSet<RecipeLineEntity> RecipeLines => Set<RecipeLineEntity>();
    public DbSet<ExportTemplateEntity> ExportTemplates => Set<ExportTemplateEntity>();
    public DbSet<ProjectFolderEntity> ProjectFolders => Set<ProjectFolderEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<IngredientEntity>(e =>
        {
            e.ToTable("ingredients");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Name).HasColumnName("name").IsRequired();
            e.Property(x => x.Code).HasColumnName("code");
            e.Property(x => x.CodeB).HasColumnName("code_b");
            e.Property(x => x.AltCodes).HasColumnName("alt_codes");
            e.Property(x => x.DescriptionTags).HasColumnName("description_tags");
            e.Property(x => x.Cat).HasColumnName("cat");
            e.Property(x => x.Kj).HasColumnName("kj");
            e.Property(x => x.Kcal).HasColumnName("kcal");
            e.Property(x => x.Fat).HasColumnName("fat");
            e.Property(x => x.Sat).HasColumnName("sat");
            e.Property(x => x.Carb).HasColumnName("carb");
            e.Property(x => x.Sugar).HasColumnName("sugar");
            e.Property(x => x.Fibre).HasColumnName("fibre");
            e.Property(x => x.Protein).HasColumnName("protein");
            e.Property(x => x.Salt).HasColumnName("salt");
            e.Property(x => x.Cost).HasColumnName("cost");
            e.Property(x => x.CostUom).HasColumnName("cost_uom");
            e.Property(x => x.Density).HasColumnName("density");
            e.Property(x => x.UnitWeightG).HasColumnName("unit_weight_g").HasDefaultValue(0m);
            e.Property(x => x.Supplier).HasColumnName("supplier");
            e.Property(x => x.Allergens).HasColumnName("allergens");
            e.Property(x => x.Fvn).HasColumnName("fvn");
            e.Property(x => x.Approved).HasColumnName("approved");
            e.Property(x => x.Created).HasColumnName("created");
            e.Property(x => x.VersionHistory).HasColumnName("version_history");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");
        });

        modelBuilder.Entity<IngredientVersionEntity>(e =>
        {
            e.ToTable("ingredient_versions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
            e.Property(x => x.IngredientId).HasColumnName("ingredient_id").IsRequired();
            e.Property(x => x.VersionNumber).HasColumnName("version_number");
            e.Property(x => x.Snapshot).HasColumnName("snapshot").IsRequired();
            e.Property(x => x.CreatedAtUtc).HasColumnName("created_at_utc");
            e.Property(x => x.Comment).HasColumnName("comment");
            e.HasIndex(x => new { x.IngredientId, x.VersionNumber });
        });

        modelBuilder.Entity<RecipeEntity>(e =>
        {
            e.ToTable("recipes");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Name).HasColumnName("name").IsRequired();
            e.Property(x => x.Code).HasColumnName("code");
            e.Property(x => x.Desc).HasColumnName("desc");
            e.Property(x => x.Type).HasColumnName("type");
            e.Property(x => x.RecipeType).HasColumnName("recipe_type");
            e.Property(x => x.Serving).HasColumnName("serving");
            e.Property(x => x.Uom).HasColumnName("serving_uom");
            e.Property(x => x.Approved).HasColumnName("approved");
            e.Property(x => x.DescriptionTags).HasColumnName("description_tags");
            e.Property(x => x.Created).HasColumnName("created");
            e.Property(x => x.VersionHistory).HasColumnName("version_history");
            e.Property(x => x.YieldPct).HasColumnName("yield_pct").HasDefaultValue(100m);
            e.Property(x => x.OwnCost).HasColumnName("own_cost").HasDefaultValue(0m);
            e.Property(x => x.SheetCost).HasColumnName("sheet_cost").HasDefaultValue(0m);
            e.Property(x => x.UnitWeightG).HasColumnName("unit_weight_g").HasDefaultValue(0m);
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");
            e.HasMany(x => x.Lines)
                .WithOne(x => x.Recipe)
                .HasForeignKey(x => x.RecipeId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RecipeLineEntity>(e =>
        {
            e.ToTable("recipe_lines");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.RecipeId).HasColumnName("recipe_id").IsRequired();
            e.Property(x => x.IngredientId).HasColumnName("ingredient_id");
            e.Property(x => x.SubRecipeId).HasColumnName("sub_recipe_id");
            e.Property(x => x.Qty).HasColumnName("qty");
            e.Property(x => x.Uom).HasColumnName("uom");
            e.Property(x => x.FvnOverride).HasColumnName("fvn_override");
            e.Property(x => x.ScrapPct).HasColumnName("scrap_pct").HasDefaultValue(0m);

            e.HasIndex(x => x.RecipeId);
            e.HasIndex(x => x.IngredientId);
            e.HasIndex(x => x.SubRecipeId);
        });

        modelBuilder.Entity<ExportTemplateEntity>(e =>
        {
            e.ToTable("export_templates");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Name).HasColumnName("name").IsRequired();
            e.Property(x => x.FileName).HasColumnName("file_name");
            e.Property(x => x.Data).HasColumnName("data").IsRequired();
            e.Property(x => x.Preview).HasColumnName("preview");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<ProjectFolderEntity>(e =>
        {
            e.ToTable("project_folders");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Name).HasColumnName("name").IsRequired();
            e.Property(x => x.ParentId).HasColumnName("parent_id");
            e.Property(x => x.Locked).HasColumnName("locked").HasDefaultValue(false);
            e.Property(x => x.IsLayer).HasColumnName("is_layer").HasDefaultValue(false);
            e.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
            e.HasIndex(x => x.ParentId);
        });
    }
}
