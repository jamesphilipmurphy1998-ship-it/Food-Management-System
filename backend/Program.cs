using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
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

// ─── Auth modes ─────────────────────────────────────────────────────────────
// disabled: no auth (dev)
// homepage: require login from the Wasabi homepage (JWT) — the original NutriCost behaviour
// local: username/password accounts stored in Postgres, same pattern as Wasabi Timeline's
//        `timeline_users` — a framework this can later be switched to Entra ID from, the same
//        way Timeline was, without changing anything else about how "signed in" is checked.
var authMode = (Environment.GetEnvironmentVariable("NUTRICOST_AUTH_MODE") ?? "homepage").Trim().ToLowerInvariant();
if (authMode is not ("disabled" or "homepage" or "local"))
    throw new InvalidOperationException($"Unsupported NUTRICOST_AUTH_MODE '{authMode}'. Allowed: disabled, homepage, local.");
var authDisabled = authMode == "disabled";
var authHomepage = authMode == "homepage";
var authLocal = authMode == "local";

if (authLocal)
{
    builder.Services
        .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
        .AddCookie(o =>
        {
            o.Cookie.Name = "nutricost_auth";
            o.LoginPath = "/login";
            o.LogoutPath = "/api/auth/logout";
            o.ExpireTimeSpan = TimeSpan.FromDays(30);
            o.SlidingExpiration = true;
            o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
        });
    builder.Services.AddAuthorization();
}

var app = builder.Build();
app.UseResponseCompression();
app.UseCors();

// ─── Wasabi auth: require login from homepage (JWT) to access NutriCost ───
var authSecret = builder.Configuration["WasabiAuth:Secret"] ?? "default-secret-change-in-production-min-32-chars";
var homepageUrl = builder.Configuration["WasabiAuth:HomepageUrl"] ?? "http://localhost:5000";
const string cookieName = "wasabi_auth";

if (authHomepage)
{
    app.Use(async (ctx, next) =>
    {
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
}

static string HashPassword(string password)
{
    var salt = RandomNumberGenerator.GetBytes(16);
    const int iter = 100_000;
    var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, iter, HashAlgorithmName.SHA256, 32);
    return $"{iter}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(key)}";
}

static bool VerifyPassword(string password, string stored)
{
    var parts = stored.Split('.');
    if (parts.Length != 3) return false;
    try
    {
        var iter = int.Parse(parts[0]);
        var salt = Convert.FromBase64String(parts[1]);
        var key = Convert.FromBase64String(parts[2]);
        var test = Rfc2898DeriveBytes.Pbkdf2(password, salt, iter, HashAlgorithmName.SHA256, key.Length);
        return CryptographicOperations.FixedTimeEquals(test, key);
    }
    catch { return false; }
}

static bool LooksLikeEmail(string? s) => !string.IsNullOrWhiteSpace(s) && s.Contains('@') && s.Contains('.');

if (authLocal)
{
    app.UseAuthentication();
    app.UseAuthorization();

    // Ensure the accounts table exists / has the columns this version expects.
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS nutri_users (
                id text PRIMARY KEY,
                username text NOT NULL,
                email text NOT NULL DEFAULT '',
                display_name text NOT NULL DEFAULT '',
                pass_hash text NOT NULL,
                site_role text NOT NULL DEFAULT 'user',
                created_at timestamptz NOT NULL DEFAULT now()
            );");
        await db.Database.ExecuteSqlRawAsync(@"CREATE UNIQUE INDEX IF NOT EXISTS nutri_users_username_lower_uq ON nutri_users (lower(username));");
    }

    app.Use(async (ctx, next) =>
    {
        var path = ctx.Request.Path.Value ?? "";

        if (path.Equals("/api/auth/logout", StringComparison.OrdinalIgnoreCase))
        {
            await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            ctx.Response.Redirect("/login");
            return;
        }

        var isAuthPage = path.Equals("/login", StringComparison.OrdinalIgnoreCase)
                          || path.Equals("/signup", StringComparison.OrdinalIgnoreCase)
                          || path.StartsWith("/api/auth/local", StringComparison.OrdinalIgnoreCase);
        if (isAuthPage) { await next(); return; }

        var isEntry = path == "/" || path.Equals("/index.html", StringComparison.OrdinalIgnoreCase);
        var authed = ctx.User?.Identity?.IsAuthenticated ?? false;

        if (isEntry && !authed) { ctx.Response.Redirect("/login"); return; }
        if (path.StartsWith("/api", StringComparison.OrdinalIgnoreCase) && !authed)
        {
            ctx.Response.StatusCode = 401;
            await ctx.Response.WriteAsJsonAsync(new { error = "Unauthorized" });
            return;
        }
        if (!authed && !path.StartsWith("/images", StringComparison.OrdinalIgnoreCase)
                    && !path.Equals("/styles.css", StringComparison.OrdinalIgnoreCase)
                    && !path.EndsWith(".js", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Response.Redirect("/login");
            return;
        }
        await next();
    });

    app.MapGet("/login", () => Results.Text($$"""
<!doctype html><html><head><meta charset="utf-8"><title>NutriCost — Log in</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f6f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);width:320px}
h1{font-size:18px;margin:0 0 18px}label{display:block;font-size:13px;margin:12px 0 4px;color:#374151}
input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px}
button{margin-top:18px;width:100%;padding:9px;background:#2f7a4d;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer}
.err{color:#b91c1c;font-size:13px;margin-top:10px;min-height:16px}
.link{font-size:13px;margin-top:14px;text-align:center}a{color:#2f7a4d}</style></head>
<body><form class="box" id="f"><h1>Sign in to NutriCost</h1>
<label>Email</label><input id="u" type="email" autocomplete="username" required/>
<label>Password</label><input id="p" type="password" autocomplete="current-password" required/>
<button type="submit">Sign in</button><div class="err" id="e"></div>
<div class="link">No account yet? <a href="/signup">Create one</a></div>
</form><script>
document.getElementById('f').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const u = document.getElementById('u').value.trim();
  const p = document.getElementById('p').value;
  const r = await fetch('/api/auth/local/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:u,password:p})});
  if (r.ok) { sessionStorage.setItem('ncJustSignedIn','1'); location.href = '/'; return; }
  document.getElementById('e').textContent = 'Login failed — check your email and password.';
});
</script></body></html>
""", "text/html"));

    app.MapGet("/signup", () => Results.Text($$"""
<!doctype html><html><head><meta charset="utf-8"><title>NutriCost — Create account</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f6f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);width:320px}
h1{font-size:18px;margin:0 0 6px}.sub{font-size:12px;color:#6b7280;margin:0 0 14px}
label{display:block;font-size:13px;margin:12px 0 4px;color:#374151}
input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px}
button{margin-top:18px;width:100%;padding:9px;background:#2f7a4d;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer}
.err{color:#b91c1c;font-size:13px;margin-top:10px;min-height:16px}
.link{font-size:13px;margin-top:14px;text-align:center}a{color:#2f7a4d}</style></head>
<body><form class="box" id="f"><h1>Create account</h1><p class="sub">The first account created becomes Technical (full access).</p>
<label>Name</label><input id="d" type="text" required/>
<label>Email</label><input id="u" type="email" autocomplete="username" required/>
<label>Password</label><input id="p" type="password" autocomplete="new-password" minlength="6" required/>
<button type="submit">Create account</button><div class="err" id="e"></div>
<div class="link">Already have an account? <a href="/login">Log in</a></div>
</form><script>
document.getElementById('f').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const d = document.getElementById('d').value.trim();
  const u = document.getElementById('u').value.trim();
  const p = document.getElementById('p').value;
  const r = await fetch('/api/auth/local/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:d,email:u,password:p})});
  if (r.ok) { sessionStorage.setItem('ncJustSignedIn','1'); location.href = '/'; return; }
  const j = await r.json().catch(() => ({}));
  document.getElementById('e').textContent = j.error || 'Could not create account.';
});
</script></body></html>
""", "text/html"));

    app.MapPost("/api/auth/local/signup", async (AppDbContext db, HttpContext ctx, JsonElement body) =>
    {
        var email = (body.TryGetProperty("email", out var eEl) ? eEl.GetString() : "")?.Trim().ToLowerInvariant() ?? "";
        var displayName = (body.TryGetProperty("displayName", out var dEl) ? dEl.GetString() : "")?.Trim() ?? "";
        var password = body.TryGetProperty("password", out var pEl) ? pEl.GetString() : "";
        if (!LooksLikeEmail(email)) return Results.BadRequest(new { error = "Enter a valid email" });
        if (string.IsNullOrEmpty(password) || password.Length < 6) return Results.BadRequest(new { error = "Password must be at least 6 characters" });

        var exists = await db.Database.SqlQueryRaw<int>("SELECT 1 AS \"Value\" FROM nutri_users WHERE lower(username) = {0} LIMIT 1", email).FirstOrDefaultAsync();
        if (exists == 1) return Results.BadRequest(new { error = "An account with that email already exists" });

        var anyUsers = await db.Database.SqlQueryRaw<int>("SELECT 1 AS \"Value\" FROM nutri_users LIMIT 1").FirstOrDefaultAsync();
        var siteRole = anyUsers == 1 ? "user" : "admin"; // first ever sign-up bootstraps admin

        var id = Guid.NewGuid().ToString("N");
        var hash = HashPassword(password!);
        await db.Database.ExecuteSqlRawAsync(@"
            INSERT INTO nutri_users (id, username, email, display_name, site_role, pass_hash)
            VALUES ({0}, {1}, {1}, {2}, {3}, {4});", id, email, displayName, siteRole, hash);

        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, id), new(ClaimTypes.Name, displayName), new(ClaimTypes.Email, email), new("site_role", siteRole) };
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await ctx.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true });
        return Results.Ok(new { id, email, displayName, siteRole });
    });

    app.MapPost("/api/auth/local/login", async (AppDbContext db, HttpContext ctx, JsonElement body) =>
    {
        var email = (body.TryGetProperty("email", out var eEl) ? eEl.GetString() : "")?.Trim().ToLowerInvariant() ?? "";
        var password = body.TryGetProperty("password", out var pEl) ? pEl.GetString() : "";
        if (!LooksLikeEmail(email) || string.IsNullOrEmpty(password)) return Results.BadRequest(new { error = "Enter email and password" });

        var rows = await db.Database.SqlQueryRaw<string>(@"
            SELECT (id || '|' || display_name || '|' || site_role || '|' || pass_hash) AS ""Value""
            FROM nutri_users WHERE lower(username) = {0} LIMIT 1;", email).ToListAsync();
        if (rows.Count == 0) return Results.Unauthorized();
        var parts = rows[0].Split('|');
        if (parts.Length < 4) return Results.Unauthorized();
        var (id, displayName, siteRole) = (parts[0], parts[1], parts[2]);
        var hash = string.Join('|', parts.Skip(3));
        if (!VerifyPassword(password!, hash)) return Results.Unauthorized();

        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, id), new(ClaimTypes.Name, displayName), new(ClaimTypes.Email, email), new("site_role", siteRole) };
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await ctx.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true });
        return Results.Ok(new { id, email, displayName, siteRole });
    });

    // Current signed-in user (for the frontend to show name/role and gate the User Settings link).
    app.MapGet("/api/auth/me", (HttpContext ctx) =>
    {
        if (!(ctx.User?.Identity?.IsAuthenticated ?? false)) return Results.Unauthorized();
        return Results.Ok(new
        {
            id = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier),
            email = ctx.User.FindFirstValue(ClaimTypes.Email),
            displayName = ctx.User.FindFirstValue(ClaimTypes.Name),
            siteRole = ctx.User.FindFirstValue("site_role") ?? "user"
        });
    });

    // ─── User Settings admin endpoints (site_role = admin only) ───────────────
    app.MapGet("/api/site/users", async (AppDbContext db, HttpContext ctx) =>
    {
        if (!(ctx.User?.Identity?.IsAuthenticated ?? false)) return Results.Unauthorized();
        var rows = await db.Database.SqlQueryRaw<string>(@"
            SELECT (id || '|' || username || '|' || display_name || '|' || site_role || '|' || created_at::text) AS ""Value""
            FROM nutri_users ORDER BY created_at;").ToListAsync();
        var users = rows.Select(r =>
        {
            var p = r.Split('|');
            return new { id = p[0], email = p[1], displayName = p[2], siteRole = p[3] };
        });
        return Results.Ok(users);
    });

    app.MapPut("/api/site/users/{id}/role", async (AppDbContext db, HttpContext ctx, string id, JsonElement body) =>
    {
        if (!(ctx.User?.Identity?.IsAuthenticated ?? false)) return Results.Unauthorized();
        if ((ctx.User.FindFirstValue("site_role") ?? "user") != "admin") return Results.Forbid();
        var role = body.TryGetProperty("siteRole", out var rEl) ? rEl.GetString() : null;
        if (role is not ("admin" or "user")) return Results.BadRequest(new { error = "siteRole must be 'admin' or 'user'" });

        if (role == "user")
        {
            var adminCount = await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS \"Value\" FROM nutri_users WHERE site_role = 'admin'").FirstOrDefaultAsync();
            var targetIsAdmin = await db.Database.SqlQueryRaw<int>("SELECT 1 AS \"Value\" FROM nutri_users WHERE id = {0} AND site_role = 'admin' LIMIT 1", id).FirstOrDefaultAsync();
            if (targetIsAdmin == 1 && adminCount <= 1) return Results.BadRequest(new { error = "Can't remove the last admin" });
        }

        var updated = await db.Database.ExecuteSqlRawAsync(@"UPDATE nutri_users SET site_role = {0} WHERE id = {1};", role, id);
        if (updated == 0) return Results.NotFound(new { error = "User not found" });
        return Results.Ok(new { ok = true });
    });

    app.MapPut("/api/site/users/{id}/reset-password", async (AppDbContext db, HttpContext ctx, string id, JsonElement body) =>
    {
        if (!(ctx.User?.Identity?.IsAuthenticated ?? false)) return Results.Unauthorized();
        if ((ctx.User.FindFirstValue("site_role") ?? "user") != "admin") return Results.Forbid();
        var newPassword = body.TryGetProperty("password", out var pw) ? pw.GetString() : "";
        if (string.IsNullOrWhiteSpace(newPassword) || newPassword!.Length < 6)
            return Results.BadRequest(new { error = "Password must be at least 6 characters" });
        var hash = HashPassword(newPassword);
        var updated = await db.Database.ExecuteSqlRawAsync(@"UPDATE nutri_users SET pass_hash = {0} WHERE id = {1};", hash, id);
        if (updated == 0) return Results.NotFound(new { error = "User not found" });
        return Results.Ok(new { ok = true });
    });

    app.MapDelete("/api/site/users/{id}", async (AppDbContext db, HttpContext ctx, string id) =>
    {
        if (!(ctx.User?.Identity?.IsAuthenticated ?? false)) return Results.Unauthorized();
        if ((ctx.User.FindFirstValue("site_role") ?? "user") != "admin") return Results.Forbid();
        var targetRoleRows = await db.Database.SqlQueryRaw<string>(@"SELECT site_role AS ""Value"" FROM nutri_users WHERE id = {0} LIMIT 1;", id).ToListAsync();
        if (targetRoleRows.Count == 0) return Results.NotFound(new { error = "User not found" });
        if (targetRoleRows[0] == "admin")
        {
            var adminCount = await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS \"Value\" FROM nutri_users WHERE site_role = 'admin'").FirstOrDefaultAsync();
            if (adminCount <= 1) return Results.BadRequest(new { error = "Can't remove the last admin" });
        }
        await db.Database.ExecuteSqlRawAsync(@"DELETE FROM nutri_users WHERE id = {0};", id);
        return Results.Ok(new { ok = true });
    });

    // ─── Personal saved comparisons ────────────────────────────────────────────
    // Scoped to the caller's own account — every query/mutation below filters or checks
    // ownership by UserId = the caller's NameIdentifier claim, so one account can never see or
    // touch another's saves via the API, not just via what the UI happens to show.
    app.MapGet("/api/comparison-saves", async (AppDbContext db, HttpContext ctx) =>
    {
        var userId = ctx.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();
        var saves = await db.ComparisonSaves.AsNoTracking()
            .Where(c => c.UserId == userId)
            .OrderByDescending(c => c.UpdatedAt)
            .Select(c => new { c.Id, c.Name, items = JsonSerializer.Deserialize<JsonElement>(c.ItemsJson, (JsonSerializerOptions?)null), savedAt = c.UpdatedAt })
            .ToListAsync();
        return Results.Ok(saves);
    });

    app.MapPost("/api/comparison-saves", async (AppDbContext db, HttpContext ctx, JsonElement body) =>
    {
        var userId = ctx.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();
        var name = body.TryGetProperty("name", out var nEl) ? nEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { error = "Name is required" });
        var itemsJson = body.TryGetProperty("items", out var iEl) ? iEl.GetRawText() : "[]";
        var entity = new ComparisonSaveEntity { Id = Guid.NewGuid().ToString("N"), UserId = userId, Name = name!, ItemsJson = itemsJson };
        db.ComparisonSaves.Add(entity);
        await db.SaveChangesAsync();
        return Results.Ok(new { entity.Id, entity.Name, items = JsonSerializer.Deserialize<JsonElement>(entity.ItemsJson, (JsonSerializerOptions?)null), savedAt = entity.UpdatedAt });
    });

    app.MapPut("/api/comparison-saves/{id}", async (AppDbContext db, HttpContext ctx, string id, JsonElement body) =>
    {
        var userId = ctx.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();
        var entity = await db.ComparisonSaves.FirstOrDefaultAsync(c => c.Id == id);
        if (entity == null) return Results.NotFound();
        if (entity.UserId != userId) return Results.Forbid();
        if (body.TryGetProperty("name", out var nEl) && nEl.GetString() is { } newName && !string.IsNullOrWhiteSpace(newName)) entity.Name = newName;
        if (body.TryGetProperty("items", out var iEl)) entity.ItemsJson = iEl.GetRawText();
        entity.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return Results.Ok(new { entity.Id, entity.Name, items = JsonSerializer.Deserialize<JsonElement>(entity.ItemsJson, (JsonSerializerOptions?)null), savedAt = entity.UpdatedAt });
    });

    app.MapDelete("/api/comparison-saves/{id}", async (AppDbContext db, HttpContext ctx, string id) =>
    {
        var userId = ctx.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();
        var entity = await db.ComparisonSaves.FirstOrDefaultAsync(c => c.Id == id);
        if (entity == null) return Results.NotFound();
        if (entity.UserId != userId) return Results.Forbid();
        db.ComparisonSaves.Remove(entity);
        await db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    });

    // ─── Personal notifications ─────────────────────────────────────────────────
    // Nothing writes rows here yet — this is the read side of the inbox panel, ready for
    // "share a saved comparison" (and anything else personal) to start producing notifications
    // without needing a schema change first. Scoped by UserId same as comparison-saves.
    app.MapGet("/api/notifications", async (AppDbContext db, HttpContext ctx) =>
    {
        var userId = ctx.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();
        var rows = await db.Notifications.AsNoTracking()
            .Where(n => n.UserId == userId)
            .OrderByDescending(n => n.CreatedAt)
            .Select(n => new { n.Id, n.Title, n.Body, n.Link, n.Read, createdAt = n.CreatedAt })
            .ToListAsync();
        return Results.Ok(rows);
    });

    app.MapPost("/api/notifications/{id}/read", async (AppDbContext db, HttpContext ctx, string id) =>
    {
        var userId = ctx.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();
        var entity = await db.Notifications.FirstOrDefaultAsync(n => n.Id == id);
        if (entity == null) return Results.NotFound();
        if (entity.UserId != userId) return Results.Forbid();
        entity.Read = true;
        await db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    });

    app.MapPost("/api/notifications/mark-all-read", async (AppDbContext db, HttpContext ctx) =>
    {
        var userId = ctx.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();
        await db.Notifications.Where(n => n.UserId == userId && !n.Read).ExecuteUpdateAsync(s => s.SetProperty(n => n.Read, true));
        return Results.Ok(new { ok = true });
    });

    // ─── Sharing a saved comparison with another account ───────────────────────
    // The comparison stays owned by whoever saved it — a share only grants the recipient read
    // access (via GET .../shared-with-me) and creates a notification. Only the owner can share.
    app.MapPost("/api/comparison-saves/{id}/share", async (AppDbContext db, HttpContext ctx, string id, JsonElement body) =>
    {
        var userId = ctx.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();
        var save = await db.ComparisonSaves.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id);
        if (save == null) return Results.NotFound();
        if (save.UserId != userId) return Results.Forbid();
        var targetUserId = body.TryGetProperty("userId", out var uEl) ? uEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(targetUserId)) return Results.BadRequest(new { error = "Pick who to share with" });
        if (targetUserId == userId) return Results.BadRequest(new { error = "You already have this one" });
        var targetExists = await db.Database.SqlQueryRaw<int>("SELECT 1 AS \"Value\" FROM nutri_users WHERE id = {0} LIMIT 1", targetUserId).FirstOrDefaultAsync();
        if (targetExists != 1) return Results.NotFound(new { error = "Account not found" });

        var alreadyShared = await db.ComparisonShares.AnyAsync(s => s.ComparisonSaveId == id && s.SharedWithUserId == targetUserId);
        if (!alreadyShared)
        {
            db.ComparisonShares.Add(new ComparisonShareEntity { Id = Guid.NewGuid().ToString("N"), ComparisonSaveId = id, SharedByUserId = userId, SharedWithUserId = targetUserId! });
        }

        var sharerNameRows = await db.Database.SqlQueryRaw<string>("SELECT display_name AS \"Value\" FROM nutri_users WHERE id = {0} LIMIT 1", userId).ToListAsync();
        var sharerName = sharerNameRows.Count > 0 && !string.IsNullOrWhiteSpace(sharerNameRows[0]) ? sharerNameRows[0] : "Someone";
        db.Notifications.Add(new NotificationEntity
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = targetUserId!,
            Title = sharerName + " shared a comparison with you",
            Body = save.Name,
            Link = "sharedcomparison:" + id
        });
        await db.SaveChangesAsync();
        return Results.Ok(new { ok = true });
    });

    // Comparisons someone else shared with me — read-only from my side; the owner (SharedByUserId)
    // keeps sole edit/delete rights over the underlying comparison_saves row.
    app.MapGet("/api/comparison-saves/shared-with-me", async (AppDbContext db, HttpContext ctx) =>
    {
        var userId = ctx.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();
        var rows = await (
            from share in db.ComparisonShares.AsNoTracking()
            where share.SharedWithUserId == userId
            join save in db.ComparisonSaves.AsNoTracking() on share.ComparisonSaveId equals save.Id
            join owner in db.Users.AsNoTracking() on share.SharedByUserId equals owner.Id
            orderby share.CreatedAt descending
            select new { save.Id, save.Name, save.ItemsJson, savedAt = save.UpdatedAt, sharedAt = share.CreatedAt, sharedByName = owner.DisplayName, sharedByEmail = owner.Email }
        ).ToListAsync();
        var result = rows.Select(r => new { r.Id, r.Name, items = JsonSerializer.Deserialize<JsonElement>(r.ItemsJson, (JsonSerializerOptions?)null), r.savedAt, r.sharedAt, r.sharedByName, r.sharedByEmail });
        return Results.Ok(result);
    });
}

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
    var entity = ingredient.ToEntity();
    db.Ingredients.Add(entity);
    await db.SaveChangesAsync();
    // Return the saved entity, not the input model — the input has no real UpdatedAt yet, and
    // callers doing per-record concurrency-checked saves (storage.js) need the server's actual
    // stamp back so the record's very next edit has something real to check against.
    return Results.Created($"/api/ingredients/{ingredient.Id}", entity.ToModel());
});

app.MapPost("/api/recipes", async (AppDbContext db, Recipe recipe) =>
{
    recipe.Id = string.IsNullOrWhiteSpace(recipe.Id) ? "id_" + Guid.NewGuid().ToString("N")[..9] : recipe.Id;
    var entity = recipe.ToEntity();
    db.Recipes.Add(entity);
    await db.SaveChangesAsync();
    return Results.Created($"/api/recipes/{recipe.Id}", entity.ToModel());
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
app.MapPut("/api/recipes/{id}", async (AppDbContext db, HttpContext ctx, string id, Recipe recipe) =>
{
    var entity = await db.Recipes.Include(r => r.Lines).FirstOrDefaultAsync(r => r.Id == id);
    if (entity == null) return Results.NotFound();
    if (recipe.UpdatedAt.HasValue && recipe.UpdatedAt.Value != entity.UpdatedAt)
    {
        return Results.Conflict(entity.ToModel());
    }
    // Approving/un-approving is an authority action, not a routine edit — un-approving in
    // particular re-opens an otherwise-locked recipe for editing. Only enforceable where we have
    // real accounts (local auth mode); homepage-JWT/disabled modes have no site_role concept, so
    // this only blocks the change once IsAuthenticated is actually true.
    if (recipe.Approved != entity.Approved && (ctx.User?.Identity?.IsAuthenticated ?? false)
        && (ctx.User.FindFirstValue("site_role") ?? "user") != "admin")
    {
        return Results.Json(new { error = "Only an admin can approve or un-approve a recipe." }, statusCode: 403);
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

app.MapPut("/api/recipes", async (AppDbContext db, HttpContext ctx, List<Recipe> recipes) =>
{
    if (recipes == null) recipes = [];
    // Upsert by id — never deletes a recipe the caller didn't send (see the ingredients PUT
    // above for why: a stale full-replace silently deletes anything added since the snapshot).
    // Deletion now only happens via the dedicated DELETE endpoint below.
    var idsToUpsert = recipes.Select(r => r.Id).Where(id => !string.IsNullOrWhiteSpace(id)).ToHashSet();
    var trackedExisting = await db.Recipes.Include(r => r.Lines).Where(r => idsToUpsert.Contains(r.Id)).ToDictionaryAsync(r => r.Id);
    var isAdmin = !(ctx.User?.Identity?.IsAuthenticated ?? false) || (ctx.User.FindFirstValue("site_role") ?? "user") == "admin";
    if (!isAdmin && recipes.Any(r => trackedExisting.TryGetValue(r.Id, out var existing) && r.Approved != existing.Approved))
        return Results.Json(new { error = "Only an admin can approve or un-approve a recipe." }, statusCode: 403);
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

// ─── Project folders (Projects page tree) — shared across all users ───
app.MapGet("/api/project-folders", async (AppDbContext db) =>
{
    var folders = await db.ProjectFolders.AsNoTracking().ToListAsync();
    return Results.Ok(folders.Select(f => new { f.Id, f.Name, f.ParentId, f.Locked, f.IsLayer }));
});

app.MapPost("/api/project-folders", async (AppDbContext db, ProjectFolderCreateRequest req) =>
{
    var name = (req.Name ?? "").Trim();
    if (name.Length == 0) return Results.BadRequest("Name is required.");
    if (!string.IsNullOrWhiteSpace(req.ParentId))
    {
        var parent = await db.ProjectFolders.FirstOrDefaultAsync(f => f.Id == req.ParentId);
        if (parent == null) return Results.BadRequest("Parent folder not found.");
        if (!parent.IsLayer) return Results.BadRequest("A recipe folder can't contain sub-folders.");
    }
    // Slug the same way the old client-side addProjectFolder() did, so a folder created here
    // keeps generating ids in the same style existing "Project:{slug}" recipe tags already use.
    var baseSlug = System.Text.RegularExpressions.Regex.Replace(name.ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
    if (baseSlug.Length == 0) baseSlug = "project";
    var id = string.IsNullOrWhiteSpace(req.Id) ? baseSlug : req.Id!;
    var n = 1;
    var existingIds = (await db.ProjectFolders.Select(f => f.Id).ToListAsync()).ToHashSet();
    while (existingIds.Contains(id)) id = baseSlug + "-" + (++n);
    var entity = new ProjectFolderEntity { Id = id, Name = name, ParentId = string.IsNullOrWhiteSpace(req.ParentId) ? null : req.ParentId, Locked = req.Locked, IsLayer = req.IsLayer };
    db.ProjectFolders.Add(entity);
    await db.SaveChangesAsync();
    return Results.Created($"/api/project-folders/{entity.Id}", entity);
});

app.MapPut("/api/project-folders/{id}", async (AppDbContext db, string id, ProjectFolderUpdateRequest req) =>
{
    var f = await db.ProjectFolders.FindAsync(id);
    if (f == null) return Results.NotFound();
    if (f.Locked) return Results.BadRequest("This folder is part of the fixed structure and can't be renamed.");
    var name = (req.Name ?? "").Trim();
    if (name.Length == 0) return Results.BadRequest("Name is required.");
    f.Name = name;
    await db.SaveChangesAsync();
    return Results.Ok(f);
});

app.MapDelete("/api/project-folders/{id}", async (AppDbContext db, string id) =>
{
    var f = await db.ProjectFolders.FindAsync(id);
    if (f == null) return Results.NotFound();
    if (f.Locked) return Results.BadRequest("This folder is part of the fixed structure and can't be deleted.");
    // Deleting a folder that has sub-folders removes the whole subtree under it — there's no FK
    // cascade configured (kept simple deliberately), so walk it manually.
    var toDelete = new List<string> { id };
    var frontier = new List<string> { id };
    while (frontier.Count > 0)
    {
        var children = await db.ProjectFolders.Where(x => x.ParentId != null && frontier.Contains(x.ParentId)).Select(x => x.Id).ToListAsync();
        if (children.Count == 0) break;
        toDelete.AddRange(children);
        frontier = children;
    }
    db.ProjectFolders.RemoveRange(db.ProjectFolders.Where(x => toDelete.Contains(x.Id)));
    await db.SaveChangesAsync();
    return Results.NoContent();
});

// Seed the fixed Projects page structure once — idempotent (checks by id first), safe to run
// on every startup. Technical and Food Team are pure containers (they hold sub-folders, never
// recipes directly); Restaurant and Grocery sit under Food Team the same way.
using (var seedScope = app.Services.CreateScope())
{
    try
    {
        var seedDb = seedScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var existing = await seedDb.ProjectFolders.ToDictionaryAsync(f => f.Id);
        var structural = new[]
        {
            new ProjectFolderEntity { Id = "technical", Name = "Technical Team", ParentId = null, Locked = true, IsLayer = true },
            new ProjectFolderEntity { Id = "food-team", Name = "Food Team", ParentId = null, Locked = true, IsLayer = true },
            new ProjectFolderEntity { Id = "restaurant", Name = "Restaurant", ParentId = "food-team", Locked = true, IsLayer = true },
            new ProjectFolderEntity { Id = "grocery", Name = "Grocery", ParentId = "food-team", Locked = true, IsLayer = true },
            new ProjectFolderEntity { Id = "process-team", Name = "Process Team", ParentId = null, Locked = true, IsLayer = true },
        };
        var changed = false;
        foreach (var f in structural)
        {
            if (!existing.TryGetValue(f.Id, out var row))
            {
                seedDb.ProjectFolders.Add(f);
                changed = true;
            }
            else if (row.Name != f.Name || row.IsLayer != f.IsLayer)
            {
                // Keeps a locked folder's name/type in sync with this list if either is ever
                // changed here — the rename API endpoint refuses to touch locked rows, so this
                // is the only way a structural folder's name/type actually changes. Also fixes
                // up rows created before IsLayer existed (defaulted to false on that column).
                row.Name = f.Name;
                row.IsLayer = f.IsLayer;
                changed = true;
            }
        }
        if (changed) await seedDb.SaveChangesAsync();
    }
    catch
    {
        // DB not reachable yet — not fatal, matches the warm-up block's tolerance below.
    }
}

// The very first /api/recipes or /api/ingredients request after a (re)start was taking ~5s —
// measured, not assumed — vs ~0.6-0.9s for every request after. That's .NET JIT + EF Core query
// plan compilation happening lazily on first use, not anything actually slow at runtime. Running
// the same shape of query here, once, during startup pays that cost before any real user can hit
// it, instead of whoever's unlucky enough to be first after a deploy.
using (var warmupScope = app.Services.CreateScope())
{
    try
    {
        var warmupDb = warmupScope.ServiceProvider.GetRequiredService<AppDbContext>();
        await warmupDb.Ingredients.AsNoTracking().Take(1).ToListAsync();
        await warmupDb.Recipes.AsNoTracking().Include(r => r.Lines).Take(1).ToListAsync();
    }
    catch
    {
        // DB not reachable yet at startup — not fatal, just means the first real request pays
        // the warm-up cost instead. Don't block the app from starting over this.
    }
}

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
