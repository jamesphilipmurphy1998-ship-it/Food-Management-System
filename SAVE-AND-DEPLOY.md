# Saving and deploying NutriCost — quick reference for an AI assistant

Read this when the user asks to "save", "back up", "send to the zip folder", "push to the
Pi", "deploy", or anything similar for this project. It tells you exactly where things go
and what to run — no need to ask the user for paths/credentials, they're all below.

## If the user wants to save/back up the project (zip + database)

**Where it goes:**

```
C:\Users\JamesMurphy\OneDrive - Wasabi\WASUK - Food Team - NPD\Wasabi AI Development Projects Saves\NutriCost\Wasabi FMS
```

**What gets saved, as two dated files:**
- `NutriCost Backup <YYYY-MM-DD>.zip` — full project source (frontend + backend code),
  build artifacts excluded (`bin`, `obj`, `publish-pi`, etc.)
- `nutricost-db-<YYYY-MM-DD>.sql.gz` — full `pg_dump` of the live database on the Pi

**How to do it:**

```powershell
cd C:\Dev\NutriCost
.\scripts\backup-full.ps1 -ConfirmOneDrive
```

That's the whole thing — the script handles dumping the DB over SSH, zipping the project
cleanly, and copying both into the OneDrive folder above. Re-running it same-day
overwrites that day's files; running it tomorrow makes new dated ones (nothing is ever
deleted automatically).

Don't ask the user to confirm the OneDrive copy separately — `-ConfirmOneDrive` on this
specific, already-designated folder **is** the confirmation. (Full mechanics, and how to
set up the same pattern for a different project, are in
[PI-CONNECTION.md](PI-CONNECTION.md#backing-up-a-project-zip--db-dump-to-onedrive).)

## If the user wants to push a code change to the Pi

NutriCost's live deployment: **http://192.168.0.50:5001**, running as the `nutricost`
systemd service on the Pi, self-contained (no `dotnet` installed on the Pi itself).

**Backend changed** (anything under `backend/`):

```powershell
cd C:\Dev\NutriCost\backend
dotnet publish NutriCost.Api.csproj -c Release -r linux-arm64 --self-contained true -o .\publish-pi
ssh dizziness7883@192.168.0.50 "sudo systemctl stop nutricost"
scp .\publish-pi\NutriCost.Api .\publish-pi\NutriCost.Api.dll dizziness7883@192.168.0.50:/opt/nutricost/backend/
ssh dizziness7883@192.168.0.50 "chmod +x /opt/nutricost/backend/NutriCost.Api && sudo systemctl start nutricost"
```

Copy **both** `NutriCost.Api` and `NutriCost.Api.dll` — the first is just a launcher stub;
skipping the `.dll` silently leaves the old code running with no error.

**Frontend changed** (`index.html`, `styles.css`, `app.js`, `data.js`, etc. — the files
sitting next to `backend/` in this repo, not inside it):

```powershell
cd C:\Dev\NutriCost
scp index.html styles.css app.js data.js excel-import.js hfss.js ingredients.js recipes.js reports.js storage.js sushi-loading.png wasabi-logo.png dizziness7883@192.168.0.50:/opt/nutricost/
```

No restart needed for frontend-only changes — they're served as static files.

**Always verify after deploying:**

```powershell
ssh dizziness7883@192.168.0.50 "systemctl is-active nutricost; sudo ss -tlnp | grep 5001"
curl http://192.168.0.50:5001/
```

Confirm the port shows `0.0.0.0:5001` (not `127.0.0.1:5001`) and the curl succeeds.

Full deploy mechanics, database/migration notes, systemd unit contents, and the
gotchas that have already bitten us once (whitespace in `Environment=` values,
loopback-only binding) are in [PI-RUNBOOK.md](PI-RUNBOOK.md) and
[PI-CONNECTION.md](PI-CONNECTION.md) — read those if something here doesn't work as
described.

## Isolation reminder

Both of the above are entirely separate from Timeline (`wasabi-critical-path`): different
systemd service, different port (5001 vs 5002/5003), different database (`nutricost` vs
`wasabi_timeline_dev`/`tuesday_db`), different OneDrive folder. Running anything in this
file never touches Timeline's deployment or its backups.
