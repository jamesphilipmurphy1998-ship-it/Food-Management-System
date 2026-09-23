using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using NutriCost.Api;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.FileProviders;
using System.Text.Json;
using NutriCost.Api.Persistence;

// Pi prod always runs on port 5001 (5000 = homepage) — its systemd unit sets ASPNETCORE_URLS
// explicitly. Local dev runs on 5055 instead (see backend/Properties/launchSettings.json,
// which `dotnet run` applies automatically — no flags/env vars needed). This fallback only
// kicks in for a truly bare invocation with no launch profile and no ASPNETCORE_URLS set
// (e.g. running the published exe directly), in which case it mirrors prod's port/binding.
var bindUrl = Environment.GetEnvironmentVariable("ASPNETCORE_URLS");
if (string.IsNullOrEmpty(bindUrl))
{
    bindUrl = "http://localhost:5001";
    Environment.SetEnvironmentVariable("ASPNETCORE_URLS", bindUrl);
}
if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")))
    Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls(bindUrl);

// Ensure JSON requests (e.g. import rows with codeB, costUom) bind correctly and responses use camelCase
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.SerializerOptions.PropertyNameCaseInsensitive = true;
});

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy
        .SetIsOriginAllowed(origin => true) // Allow file:// (origin null) and any other origin
        .AllowAnyHeader()
        .AllowAnyMethod());
});
builder.Services.AddDbContext<AppDbContext>(options =>
{
    var conn = Environment.GetEnvironmentVariable("NUTRICOST_DB")
        ?? builder.Configuration.GetConnectionString("Default");
    if (!string.IsNullOrWhiteSpace(conn)) options.UseNpgsql(conn);
});
builder.Services.AddSingleton<InMemoryStore>();
builder.Services.AddSingleton<IImportService, ImportService>();

// gzip the API's JSON responses and the static JS/CSS bundle — both were being served
// uncompressed (recipes.js API response ~860KB, app.js ~400KB), which was a meaningful chunk
// of page load time on anything less than a fast LAN connection.
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.MimeTypes = Microsoft.AspNetCore.ResponseCompression.ResponseCompressionDefaults.MimeTypes
        .Concat(["application/json", "application/javascript", "text/javascript"]);
});

var app = builder.Build();
app.UseResponseCompression();
app.UseCors();

// ─── Wasabi auth: require login from homepage (JWT) to access NutriCost ───
var authSecret = builder.Configuration["WasabiAuth:Secret"] ?? "default-secret-change-in-production-min-32-chars";
var homepageUrl = builder.Configuration["WasabiAuth:HomepageUrl"] ?? "http://localhost:5000";
var authDisabled = string.Equals(Environment.GetEnvironmentVariable("NUTRICOST_AUTH_MODE"), "disabled", StringComparison.OrdinalIgnoreCase);
const string cookieName = "wasabi_auth";

app.Use(async (ctx, next) =>
{
    if (authDisabled) { await next(); return; }

    var path = ctx.Request.Path.Value ?? "";
    // Sign out: clear cookie and redirect to homepage (no auth required)
    if (path.Equals("/api/auth/logout", StringComparison.OrdinalIgnoreCase))
    {
        ctx.Response.Cookies.Delete(cookieName, new CookieOptions { Path = "/" });
        ctx.Response.Redirect(homepageUrl);
        return;
    }

    string? token = null;
    if (ctx.Request.Query.TryGetValue("jwt", out var qjwt)) token = qjwt.FirstOrDefault();
    if (string.IsNullOrEmpty(token) && ctx.Request.Cookies.TryGetValue(cookieName, out var c)) token = c;
    if (string.IsNullOrEmpty(token) && ctx.Request.Headers.Authorization.FirstOrDefault() is { } auth && auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        token = auth["Bearer ".Length..].Trim();

    var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(authSecret));
    var valid = false;
    try
    {
        var handler = new JwtSecurityTokenHandler();
        var principal = handler.ValidateToken(token, new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = key,
            ValidIssuer = "WasabiApps",
            ValidAudience = "WasabiApps",
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        }, out _);
        valid = principal != null;
    }
    catch { /* invalid */ }

    var isEntry = path == "/" || path.Equals("/index.html", StringComparison.OrdinalIgnoreCase);
    if (isEntry && ctx.Request.Query.ContainsKey("jwt"))
    {
        if (valid)
        {
            ctx.Response.Cookies.Append(cookieName, token!, new CookieOptions { Path = "/", MaxAge = TimeSpan.FromHours(1), HttpOnly = true, SameSite = SameSiteMode.Lax });
            ctx.Response.Redirect(path);
            return;
        }
        ctx.Response.Redirect($"{homepageUrl}?returnUrl={Uri.EscapeDataString(ctx.Request.Scheme + "://" + ctx.Request.Host + path)}");
        return;
    }
    if (!valid)
    {
        if (path.StartsWith("/api", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Response.StatusCode = 401;
            await ctx.Response.WriteAsJsonAsync(new { error = "Unauthorized. Sign in at the Wasabi Apps homepage first." });
            return;
        }
        ctx.Response.Redirect($"{homepageUrl}?returnUrl={Uri.EscapeDataString(ctx.Request.Scheme + "://" + ctx.Request.Host + path)}");
        return;
    }
    await next();
});

// Ensure DB has latest schema
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    try { db.Database.Migrate(); } catch { /* ignore */ }
    // Ensure columns exist (Supabase may have stale schema)
    try
    {
        db.Database.ExecuteSqlRaw("ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS code_b text NOT NULL DEFAULT '';");
        db.Database.ExecuteSqlRaw("ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS cost_uom text NOT NULL DEFAULT '';");
        db.Database.ExecuteSqlRaw("ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS density numeric NOT NULL DEFAULT 1;");
        db.Database.ExecuteSqlRaw("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS serving_uom text NOT NULL DEFAULT 'G';");
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS export_templates (
                id text PRIMARY KEY,
                name text NOT NULL,
                file_name text NOT NULL DEFAULT '',
                data text NOT NULL,
                preview text,
                created_at timestamp with time zone NOT NULL,
                updated_at timestamp with time zone NOT NULL
            );");
    }
    catch { /* ignore */ }
}

// Serve NutriCost frontend from parent NutriCost folder
var frontendPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), ".."));
var fileProvider = new PhysicalFileProvider(frontendPath);
app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = fileProvider });
app.UseStaticFiles(new StaticFileOptions { FileProvider = fileProvider });
app.MapGet("/api/db/health", async (AppDbContext db) =>
{
    try
    {
        var canConnect = await db.Database.CanConnectAsync();
        return Results.Ok(new { canConnect });
    }
    catch (Exception ex)
    {
        return Results.Problem("DB connection failed: " + ex.Message);
    }
});

app.MapGet("/api/ingredients", async (AppDbContext db, bool includeUnlinked) =>
{
    var ingredients = await db.Ingredients.AsNoTracking().ToListAsync();
    if (includeUnlinked) return Results.Ok(ingredients.Select(i => i.ToModel()));

    var usedIngredientIds = (await db.RecipeLines
        .AsNoTracking()
        .Where(l => !string.IsNullOrWhiteSpace(l.IngredientId))
        .Select(l => l.IngredientId!)
        .ToListAsync())
        .ToHashSet();

    var filtered = ingredients
        .Where(i => usedIngredientIds.Contains(i.Id))
        .Select(i => i.ToModel());
    return Results.Ok(filtered);
});

app.MapGet("/api/recipes", async (AppDbContext db) =>
{
    var recipes = await db.Recipes
        .AsNoTracking()
        .Include(r => r.Lines)
        .ToListAsync();
    return Results.Ok(recipes.Select(r => r.ToModel()));
});

app.MapPost("/api/ingredients", async (AppDbContext db, Ingredient ingredient) =>
{
    ingredient.Id = string.IsNullOrWhiteSpace(ingredient.Id) ? "id_" + Guid.NewGuid().ToString("N")[..9] : ingredient.Id;
    db.Ingredients.Add(ingredient.ToEntity());
    await db.SaveChangesAsync();
    return Results.Created($"/api/ingredients/{ingredient.Id}", ingredient);
});

app.MapPost("/api/recipes", async (AppDbContext db, Recipe recipe) =>
{
    recipe.Id = string.IsNullOrWhiteSpace(recipe.Id) ? "id_" + Guid.NewGuid().ToString("N")[..9] : recipe.Id;
    db.Recipes.Add(recipe.ToEntity());
    await db.SaveChangesAsync();
    return Results.Created($"/api/recipes/{recipe.Id}", recipe);
});

// Single-record save with optimistic concurrency — this is what the interactive UI uses for
// routine edits (a qty change, an approve toggle, etc.), instead of the bulk PUT below re-sending
// every row in the table on every keystroke. The client sends back whatever UpdatedAt it last
// fetched for this row; if the row has moved on since (someone else saved it in between), this
// rejects with 409 and returns the current server copy rather than silently overwriting it — the
// bulk PUT has no such check, which is exactly the multi-user data-loss risk this exists to close.
app.MapPut("/api/ingredients/{id}", async (AppDbContext db, string id, Ingredient ingredient) =>
{
    var entity = await db.Ingredients.FirstOrDefaultAsync(x => x.Id == id);
    if (entity == null) return Results.NotFound();
    if (ingredient.UpdatedAt.HasValue && ingredient.UpdatedAt.Value != entity.UpdatedAt)
    {
        return Results.Conflict(entity.ToModel());
    }
    ingredient.Id = id;
    db.Entry(entity).CurrentValues.SetValues(ingredient.ToEntity());
    entity.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(entity.ToModel());
});

app.MapPut("/api/ingredients", async (AppDbContext db, List<Ingredient> ingredients) =>
{
    if (ingredients == null) ingredients = [];

    // Snapshot version history BEFORE the replace below wipes the old rows — only writes a
    // new version when the fields actually changed, so a no-op sync doesn't bump v1 to v2.
    var existingById = (await db.Ingredients.AsNoTracking().ToListAsync()).ToDictionary(x => x.Id);
    var latestVersionByIngredientId = (await db.IngredientVersions.AsNoTracking().ToListAsync())
        .GroupBy(v => v.IngredientId)
        .ToDictionary(g => g.Key, g => g.OrderByDescending(v => v.VersionNumber).First());

    var newVersionRows = new List<IngredientVersionEntity>();
    var now = DateTimeOffset.UtcNow;
    foreach (var ing in ingredients)
    {
        if (string.IsNullOrWhiteSpace(ing.Id)) continue;
        var newSnapshot = IngredientSnapshot.Build(ing);
        var hasOld = existingById.TryGetValue(ing.Id, out var old);
        var hasLatestVersion = latestVersionByIngredientId.TryGetValue(ing.Id, out var latestVersion);

        if (!hasLatestVersion)
        {
            var nextNumber = 1;
            if (hasOld)
            {
                var oldSnapshot = IngredientSnapshot.Build(old!.ToModel());
                newVersionRows.Add(new IngredientVersionEntity { IngredientId = ing.Id, VersionNumber = nextNumber++, Snapshot = oldSnapshot, CreatedAtUtc = now });
                if (newSnapshot == oldSnapshot) continue; // unchanged from baseline — no v2 needed
            }
            newVersionRows.Add(new IngredientVersionEntity { IngredientId = ing.Id, VersionNumber = nextNumber, Snapshot = newSnapshot, CreatedAtUtc = now });
        }
        else if (newSnapshot != latestVersion!.Snapshot)
        {
            newVersionRows.Add(new IngredientVersionEntity { IngredientId = ing.Id, VersionNumber = latestVersion.VersionNumber + 1, Snapshot = newSnapshot, CreatedAtUtc = now });
        }
    }
    if (newVersionRows.Count > 0)
    {
        db.IngredientVersions.AddRange(newVersionRows);
        await db.SaveChangesAsync();
    }

    // Upsert by id — never deletes a row the caller didn't send. A full replace here meant any
    // client holding a stale in-memory snapshot would silently wipe out records other clients
    // added since that snapshot was taken (this caused real data loss more than once). Deletion
    // now only happens via the dedicated DELETE endpoint below.
    var idsToUpsert = ingredients.Select(i => i.Id).Where(id => !string.IsNullOrWhiteSpace(id)).ToHashSet();
    var trackedExisting = await db.Ingredients.Where(x => idsToUpsert.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    foreach (var ing in ingredients)
    {
        if (string.IsNullOrWhiteSpace(ing.Id)) continue;
        if (trackedExisting.TryGetValue(ing.Id, out var entity))
        {
            db.Entry(entity).CurrentValues.SetValues(ing.ToEntity());
        }
        else
        {
            db.Ingredients.Add(ing.ToEntity());
        }
    }
    await db.SaveChangesAsync();
    return Results.Ok(new { count = ingredients.Count });
});

app.MapDelete("/api/ingredients/{id}", async (AppDbContext db, string id) =>
{
    var entity = await db.Ingredients.FindAsync(id);
    if (entity == null) return Results.NotFound();
    db.Ingredients.Remove(entity);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.MapGet("/api/ingredients/{id}/versions", async (AppDbContext db, string id) =>
{
    var versions = await db.IngredientVersions
        .AsNoTracking()
        .Where(v => v.IngredientId == id)
        .OrderByDescending(v => v.VersionNumber)
        .ToListAsync();
    return Results.Ok(versions.Select(v =>
    {
        var fields = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(v.Snapshot) ?? [];
        var result = new Dictionary<string, object?> { ["versionNumber"] = v.VersionNumber, ["createdAtUtc"] = v.CreatedAtUtc, ["comment"] = v.Comment };
        foreach (var kv in fields) result[kv.Key] = kv.Value;
        return result;
    }));
});

app.MapPost("/api/ingredients/{id}/latest-version-comment", async (AppDbContext db, string id, IngredientVersionCommentRequest req) =>
{
    var latest = await db.IngredientVersions
        .Where(v => v.IngredientId == id)
        .OrderByDescending(v => v.VersionNumber)
        .FirstOrDefaultAsync();
    if (latest == null) return Results.NotFound();
    latest.Comment = string.IsNullOrWhiteSpace(req.Comment) ? null : req.Comment.Trim();
    await db.SaveChangesAsync();
    return Results.Ok(new { latest.VersionNumber, latest.Comment });
});

// Single-record save with optimistic concurrency — see the matching /api/ingredients/{id}
// endpoint above for the full rationale. Same deal here: the interactive UI should be saving
// one recipe at a time through this, not re-sending the whole 1,000+ recipe table via the bulk
// PUT below on every edit.
app.MapPut("/api/recipes/{id}", async (AppDbContext db, string id, Recipe recipe) =>
{
    var entity = await db.Recipes.Include(r => r.Lines).FirstOrDefaultAsync(r => r.Id == id);
    if (entity == null) return Results.NotFound();
    if (recipe.UpdatedAt.HasValue && recipe.UpdatedAt.Value != entity.UpdatedAt)
    {
        return Results.Conflict(entity.ToModel());
    }
    recipe.Id = id;
    var incoming = recipe.ToEntity();
    db.Entry(entity).CurrentValues.SetValues(incoming);
    db.RecipeLines.RemoveRange(entity.Lines);
    entity.Lines = incoming.Lines.Select(l => { l.RecipeId = entity.Id; return l; }).ToList();
    entity.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(entity.ToModel());
});

app.MapPut("/api/recipes", async (AppDbContext db, List<Recipe> recipes) =>
{
    if (recipes == null) recipes = [];
    // Upsert by id — never deletes a recipe the caller didn't send (see the ingredients PUT
    // above for why: a stale full-replace silently deletes anything added since the snapshot).
    // Deletion now only happens via the dedicated DELETE endpoint below.
    var idsToUpsert = recipes.Select(r => r.Id).Where(id => !string.IsNullOrWhiteSpace(id)).ToHashSet();
    var trackedExisting = await db.Recipes.Include(r => r.Lines).Where(r => idsToUpsert.Contains(r.Id)).ToDictionaryAsync(r => r.Id);
    foreach (var recipe in recipes)
    {
        if (string.IsNullOrWhiteSpace(recipe.Id)) recipe.Id = "id_" + Guid.NewGuid().ToString("N")[..9];
        var incoming = recipe.ToEntity();
        if (trackedExisting.TryGetValue(recipe.Id, out var entity))
        {
            db.Entry(entity).CurrentValues.SetValues(incoming);
            db.RecipeLines.RemoveRange(entity.Lines);
            entity.Lines = incoming.Lines.Select(l => { l.RecipeId = entity.Id; return l; }).ToList();
        }
        else
        {
            db.Recipes.Add(incoming);
        }
    }
    await db.SaveChangesAsync();
    return Results.Ok(new { count = recipes.Count });
});

app.MapDelete("/api/recipes/{id}", async (AppDbContext db, string id) =>
{
    var entity = await db.Recipes.Include(r => r.Lines).FirstOrDefaultAsync(r => r.Id == id);
    if (entity == null) return Results.NotFound();
    db.Recipes.Remove(entity);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.MapGet("/api/where-used/ingredient/{ingredientId}", async (AppDbContext db, string ingredientId) =>
{
    var recipeIds = await db.RecipeLines
        .AsNoTracking()
        .Where(l => l.IngredientId == ingredientId)
        .Select(l => l.RecipeId)
        .Distinct()
        .ToListAsync();

    var recipes = await db.Recipes
        .AsNoTracking()
        .Include(r => r.Lines)
        .Where(r => recipeIds.Contains(r.Id))
        .ToListAsync();
    return Results.Ok(recipes.Select(r => r.ToModel()));
});

app.MapGet("/api/where-used/recipe/{recipeId}", async (AppDbContext db, string recipeId) =>
{
    var recipeIds = await db.RecipeLines
        .AsNoTracking()
        .Where(l => l.SubRecipeId == recipeId)
        .Select(l => l.RecipeId)
        .Distinct()
        .ToListAsync();

    var recipes = await db.Recipes
        .AsNoTracking()
        .Include(r => r.Lines)
        .Where(r => recipeIds.Contains(r.Id))
        .ToListAsync();
    return Results.Ok(recipes.Select(r => r.ToModel()));
});

app.MapPost("/api/imports/recipe-structure", async (IImportService importService, InMemoryStore store, AppDbContext db, RecipeStructureImportRequest request) =>
{
    if (request.Rows.Count == 0) return Results.BadRequest("No rows provided.");

    // Seed import engine from current DB state so import behavior remains merge/update.
    var existingIngredients = await db.Ingredients.AsNoTracking().ToListAsync();
    var existingRecipes = await db.Recipes.AsNoTracking().Include(r => r.Lines).ToListAsync();
    store.Ingredients.Clear();
    store.Recipes.Clear();
    store.Ingredients.AddRange(existingIngredients.Select(i => i.ToModel()));
    store.Recipes.AddRange(existingRecipes.Select(r => r.ToModel()));

    var result = importService.ImportRecipeStructure(request);

    // Persist import result back to DB (replace snapshot).
    await using var tx = await db.Database.BeginTransactionAsync();
    db.RecipeLines.RemoveRange(db.RecipeLines);
    db.Recipes.RemoveRange(db.Recipes);
    db.Ingredients.RemoveRange(db.Ingredients);
    await db.SaveChangesAsync();

    db.Ingredients.AddRange(store.Ingredients.Select(i => i.ToEntity()));
    db.Recipes.AddRange(store.Recipes.Select(r => r.ToEntity()));
    await db.SaveChangesAsync();
    await tx.CommitAsync();

    return Results.Ok(result);
});

// ─── Shared export templates (BC Form etc.) ─────────────────────────────────
app.MapGet("/api/export-templates", async (AppDbContext db) =>
{
    var list = await db.ExportTemplates.AsNoTracking()
        .OrderByDescending(t => t.UpdatedAt)
        .Select(t => new { t.Id, t.Name, t.FileName, t.Preview, t.CreatedAt, t.UpdatedAt })
        .ToListAsync();
    return Results.Ok(list);
});

app.MapGet("/api/export-templates/{id}", async (AppDbContext db, string id) =>
{
    var t = await db.ExportTemplates.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
    if (t == null) return Results.NotFound();
    return Results.Ok(new { t.Id, t.Name, t.FileName, t.Data, t.Preview, t.CreatedAt, t.UpdatedAt });
});

app.MapPost("/api/export-templates", async (AppDbContext db, ExportTemplateCreateRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req.Data)) return Results.BadRequest("Data required.");
    var id = "tpl_" + Guid.NewGuid().ToString("N")[..12];
    var now = DateTimeOffset.UtcNow;
    var entity = new ExportTemplateEntity
    {
        Id = id,
        Name = string.IsNullOrWhiteSpace(req.Name) ? "Template" : req.Name!.Trim(),
        FileName = string.IsNullOrWhiteSpace(req.FileName) ? "template.xlsx" : req.FileName.Trim(),
        Data = req.Data,
        Preview = req.Preview,
        CreatedAt = now,
        UpdatedAt = now
    };
    db.ExportTemplates.Add(entity);
    await db.SaveChangesAsync();
    return Results.Created($"/api/export-templates/{id}", new { entity.Id, entity.Name, entity.FileName, entity.CreatedAt, entity.UpdatedAt });
});

app.MapPut("/api/export-templates/{id}", async (AppDbContext db, string id, ExportTemplateUpdateRequest req) =>
{
    var t = await db.ExportTemplates.FindAsync(id);
    if (t == null) return Results.NotFound();
    if (req.Name != null) t.Name = req.Name.Trim();
    if (req.FileName != null) t.FileName = req.FileName.Trim();
    if (req.Data != null) t.Data = req.Data;
    if (req.Preview != null) t.Preview = req.Preview;
    t.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(new { t.Id, t.Name, t.FileName, t.UpdatedAt });
});

app.MapDelete("/api/export-templates/{id}", async (AppDbContext db, string id) =>
{
    var t = await db.ExportTemplates.FindAsync(id);
    if (t == null) return Results.NotFound();
    db.ExportTemplates.Remove(t);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

Console.WriteLine(">>> NutriCost app: http://localhost:5001 (NOT the homepage - open 5000 first to log in)");
app.Run();

file record IngredientVersionCommentRequest(string? Comment);
file record ExportTemplateCreateRequest(string? Name, string? FileName, string Data, string? Preview);
file record ExportTemplateUpdateRequest(string? Name, string? FileName, string? Data, string? Preview);

/// <summary>Builds the comparable, stable-key-order JSON used both to detect whether an
/// ingredient actually changed and as the persisted version snapshot. Excludes Id (constant),
/// Created (immutable metadata) and VersionHistory (the old timestamp-only log, not a value field).</summary>
file static class IngredientSnapshot
{
    public static string Build(Ingredient i) => JsonSerializer.Serialize(new
    {
        name = i.Name,
        code = i.Code,
        codeB = i.CodeB,
        altCodes = i.AltCodes,
        descriptionTags = i.DescriptionTags,
        cat = i.Cat,
        kj = i.Kj,
        kcal = i.Kcal,
        fat = i.Fat,
        sat = i.Sat,
        carb = i.Carb,
        sugar = i.Sugar,
        fibre = i.Fibre,
        protein = i.Protein,
        salt = i.Salt,
        cost = i.Cost,
        costUom = i.CostUOM,
        density = i.Density,
        supplier = i.Supplier,
        allergens = i.Allergens,
        fvn = i.Fvn,
        approved = i.Approved
    });
}
