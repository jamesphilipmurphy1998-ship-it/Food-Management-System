# NutriCost — how to run / edit / deploy this project

Read this first in any new chat. This project is **completely separate** from Timeline
(`wasabi-critical-path`) — different Pi service, different port, different database,
different OneDrive backup folder. Nothing here ever touches Timeline, and Timeline
scripts never touch this.

## What's running where

| Where | What | Address |
|---|---|---|
| **Raspberry Pi** (`192.168.0.50`) | NutriCost API + static frontend, backed by Postgres | **http://192.168.0.50:5001** |
| **Pi, same Postgres server** | `nutricost` database, owned by `nutricost_app` user | `localhost:5432` (Pi-local only) |
| Local dev machine (optional) | Same backend, run locally for editing/testing | `http://localhost:5001` |

Auth is **disabled** on the Pi deployment (`NUTRICOST_AUTH_MODE=disabled`) — there's no
Wasabi Apps homepage service running on the Pi for NutriCost to redirect to, so the login
check is skipped entirely there. Locally (no env var set) auth still behaves as coded
(redirects to `http://localhost:5000`), which only matters if the homepage is also
running locally.

## Isolation from Timeline (by design — do not merge these)

| | NutriCost | Timeline (`wasabi-critical-path`) |
|---|---|---|
| Pi folder | `/opt/nutricost/` | `/opt/wasabi-critical-path/` |
| systemd service | `nutricost.service` | `wasabi-timeline.service` / `wasabi-timeline-dev.service` |
| Port | `5001` | `5002` (prod) / `5003` (dev) |
| Database | `nutricost` (user `nutricost_app`) | `wasabi_timeline_dev` / `tuesday_db` |
| OneDrive backup folder | `...\Wasabi AI Development Projects Saves\NutriCost\Wasabi FMS` | `...\Wasabi AI Development Projects Saves\Backup Copy Storage` |

Same physical Pi and Postgres instance, but no shared service, port, file path, database,
or OS user role between the two projects.

## Running locally (for development/editing)

Requires the .NET SDK (already installed at
`C:\.net\dotnet-sdk-10.0.103-win-x64\dotnet.exe` on this machine — no Node/Python needed).

```powershell
cd C:\Dev\NutriCost\backend
dotnet run
```

Opens on **http://localhost:5001**. It talks to whatever's in
`backend/appsettings.Development.json` (`ConnectionStrings:Default`) — currently the
**same Pi database** (`192.168.0.50`), so local runs and the Pi deployment can share
live data. Migrations (`db.Database.Migrate()`) run automatically on startup.

If you only want to preview the static UI with no backend/data, there's a zero-dependency
option: `powershell -File static-server.ps1` serves the same frontend files on port 5005
with no API calls (no ingredients/recipes will load).

## Deploying a change to the Pi

The Pi runs a **self-contained linux-arm64 publish** (no `dotnet` needed on the Pi itself).

```powershell
cd C:\Dev\NutriCost\backend
dotnet publish NutriCost.Api.csproj -c Release -r linux-arm64 --self-contained true -o .\publish-pi
```

Then copy **both** the native launcher and the `.dll` (the launcher is just a stub —
forgetting the `.dll` silently redeploys stale code with no error):

```powershell
ssh dizziness7883@192.168.0.50 "sudo systemctl stop nutricost"
scp .\publish-pi\NutriCost.Api .\publish-pi\NutriCost.Api.dll dizziness7883@192.168.0.50:/opt/nutricost/backend/
ssh dizziness7883@192.168.0.50 "chmod +x /opt/nutricost/backend/NutriCost.Api && sudo systemctl start nutricost"
```

If frontend files changed (`index.html`, `styles.css`, `app.js`, etc. — the ones that live
next to `backend/` in this repo), copy those too, into `/opt/nutricost/` (siblings of
`backend/`, not inside it):

```powershell
scp index.html styles.css app.js data.js excel-import.js hfss.js ingredients.js recipes.js reports.js storage.js sushi-loading.png wasabi-logo.png dizziness7883@192.168.0.50:/opt/nutricost/
```

Verify:

```powershell
ssh dizziness7883@192.168.0.50 "systemctl is-active nutricost; sudo ss -tlnp | grep 5001"
curl http://192.168.0.50:5001/
```

Should show the service `active`, listening on `0.0.0.0:5001` (not `127.0.0.1:5001` —
that means the binding fix in `Program.cs` regressed), and the curl should return the UI.

## The systemd service

`/etc/systemd/system/nutricost.service` on the Pi:

```ini
[Unit]
Description=NutriCost API
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
WorkingDirectory=/opt/nutricost/backend
ExecStart=/opt/nutricost/backend/NutriCost.Api
Restart=always
RestartSec=3
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://0.0.0.0:5001
Environment=NUTRICOST_AUTH_MODE=disabled
Environment=NUTRICOST_DB=Host=localhost;Port=5432;Database=nutricost;Username=nutricost_app;Password=<see Pi or ask James>;SSLMode=Disable

[Install]
WantedBy=multi-user.target
```

**Gotcha:** systemd's `Environment=` splits on unquoted whitespace. The Npgsql connection
string must use `SSLMode=Disable` (no space) rather than `SSL Mode=Disable` — the space
version silently truncates the password/gets parsed as a bogus extra env var.

After editing the unit file: `sudo systemctl daemon-reload && sudo systemctl restart nutricost`.

## Database

- Host: `localhost` (from the Pi's own perspective) / `192.168.0.50` (from this dev machine)
- Port: `5432` (shared Postgres instance — also hosts Timeline's DB, but no shared
  tables/users)
- Database: `nutricost`
- User: `nutricost_app` (owns the database **and** the `public` schema — Postgres 15+
  revokes `CREATE` on `public` from non-owners by default, so schema ownership had to be
  explicitly granted or EF migrations silently fail to create any tables)
- Schema is managed entirely by EF Core migrations in `backend/Migrations/` — don't hand-edit
  tables on the Pi; add a migration locally (`dotnet ef migrations add <Name>`) and let
  `Migrate()` apply it on next startup instead.

## Backups

```powershell
cd C:\Dev\NutriCost
.\scripts\backup-full.ps1                   # stage a dated zip + db dump locally only
.\scripts\backup-full.ps1 -ConfirmOneDrive  # also copy both into the OneDrive folder below
```

Produces, into `C:\Users\JamesMurphy\OneDrive - Wasabi\WASUK - Food Team - NPD\Wasabi AI Development Projects Saves\NutriCost\Wasabi FMS`:
- `NutriCost Backup <date>.zip` — full project source (frontend + backend, build artifacts excluded)
- `nutricost-db-<date>.sql.gz` — full pg_dump of the live Pi database

Mirrors `wasabi-critical-path/scripts/backup-full.ps1` but reads from the `nutricost`
systemd service/DB and writes to NutriCost's own OneDrive folder — never Timeline's.
