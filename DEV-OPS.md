# NutriCost — dev, deploy, backup, and git — quick reference

One-stop guide for the four things that come up over and over: running it locally, pushing
a change live, saving a backup zip, and committing/pushing to git. Deeper mechanics for
deploy/backup live in [SAVE-AND-DEPLOY.md](SAVE-AND-DEPLOY.md), [PI-RUNBOOK.md](PI-RUNBOOK.md)
and [PI-CONNECTION.md](PI-CONNECTION.md) — this file is the short version + git, which
wasn't written down anywhere before.

## 1. Running it locally (dev)

> All commands in this file are **PowerShell**, not Bash/Git Bash — `.\static-server.ps1`
> and similar will fail with a syntax error in a POSIX shell. Run them from a PowerShell
> prompt, or prefix with `powershell -Command "..."` if you're stuck in Bash.

Two pieces, both needed for the full app (auth, API, live data):

```powershell
# Backend API — connects to the cloud Supabase Postgres DB (same data Pi prod uses)
cd C:\Dev\NutriCost\backend
dotnet run
# → http://localhost:5055
```

```powershell
# Frontend — static files only, no build step
cd C:\Dev\NutriCost
.\static-server.ps1
# → http://localhost:5005
```

Open **http://localhost:5005** in a browser. Edit `app.js` / `index.html` / etc. directly
and refresh — no build/compile step for the frontend.

> If `dotnet run` immediately throws `AddressInUseException` on port 5055, that's not
> necessarily a failure — it usually means a backend instance from an earlier session is
> already running. Check first with `curl http://localhost:5055/` (expect `200`) before
> assuming something's broken; no need to hunt down and kill the old process just to get a
> working dev server.

> Note: `START-SERVER.md` describes an older `dotnet run` → port 5001 setup routed through
> a separate `wasabi-apps` login homepage on port 5000. The ports above
> (`backend` → 5055, static frontend → 5005) are what `backend/Properties/launchSettings.json`
> and `static-server.ps1` actually specify today — if the two disagree, trust the config
> files over that doc.

## 2. Pushing a change to production (the Pi)

Live at **http://192.168.0.50:5001**, running as the `nutricost` systemd service.

**Frontend files** (`index.html`, `app.js`, `recipes.js`, `data.js`, etc.):

```powershell
scp index.html app.js recipes.js data.js styles.css excel-import.js hfss.js ingredients.js reports.js storage.js dizziness7883@192.168.0.50:/opt/nutricost/
```

**Before every frontend deploy**, bump the cache-busting version string in `index.html`'s
script tag:

```html
<script src="app.js?v=YYYYMMDD-short-description"></script>
```

Browsers cache `app.js` by that exact URL — if the string doesn't change, users (and the
preview browser) can keep silently running old code even after a hard refresh. This has
already caused real confusion once (see commit history around 2026-09-22) — always bump it.

**Backend changed** (anything under `backend/`):

```powershell
cd C:\Dev\NutriCost\backend
dotnet publish NutriCost.Api.csproj -c Release -r linux-arm64 --self-contained true -o .\publish-pi
ssh dizziness7883@192.168.0.50 "sudo systemctl stop nutricost"
scp .\publish-pi\NutriCost.Api .\publish-pi\NutriCost.Api.dll dizziness7883@192.168.0.50:/opt/nutricost/backend/
ssh dizziness7883@192.168.0.50 "chmod +x /opt/nutricost/backend/NutriCost.Api && sudo systemctl start nutricost"
```

Copy **both** `NutriCost.Api` and `NutriCost.Api.dll` — skipping the `.dll` silently leaves
the old code running with no error.

**Always verify after deploying:**

```powershell
ssh dizziness7883@192.168.0.50 "systemctl is-active nutricost; sudo ss -tlnp | grep 5001"
curl http://192.168.0.50:5001/
```

Confirm the port shows `0.0.0.0:5001` (not `127.0.0.1:5001`) and the curl returns `200`.

## 3. Saving a backup zip (+ DB dump)

```powershell
cd C:\Dev\NutriCost
.\scripts\backup-full.ps1 -ConfirmOneDrive
```

Saves two dated files to (confirmed by actually running it — the path previously written
here and in SAVE-AND-DEPLOY.md was stale/wrong; this is the real destination per
`scripts\backup-full.ps1`'s `$OneDriveFolder` default):

```
C:\Users\JamesMurphy\OneDrive - Wasabi\WASUK - Food Team - NPD\New Wasabi System Development\FMS System\2. Wasabi FMS Code & Database Backups
```

- `NutriCost Backup <YYYY-MM-DD>.zip` — full project source, build artifacts excluded
- `nutricost-db-<YYYY-MM-DD>.sql.gz` — full `pg_dump` of the live Pi database

Re-running it same-day overwrites that day's files; a new day makes new ones. Nothing is
ever deleted automatically. To restore, see `scripts\restore-from-backup.ps1` and
[BACKUP.md](BACKUP.md).

## 4. Git — committing and pushing

Remote is set up (as of 2026-09-23):

```
origin  https://github.com/jamesphilipmurphy1998-ship-it/Food-Management-System.git
```

`master` tracks `origin/master`. Deploying to the Pi (section 2) and saving a zip
(section 3) are both completely separate from git and don't touch this repo.

> **This repo is public.** Anything committed here — including this file, which names the
> Pi's SSH user/IP (`dizziness7883@192.168.0.50`) and local network layout — is visible to
> anyone. No passwords/tokens are committed (`.gitignore` excludes
> `backend/appsettings.*.json`), but the SSH username + LAN IP are enough to let someone
> attempt to connect if they were ever on the same network. If that's a concern, switch the
> repo back to private (Settings → Danger Zone → Change visibility) — it doesn't affect
> anything already pushed.

**Committing locally, then pushing:**

```powershell
cd C:\Dev\NutriCost
git add <files>
git commit -m "Short description of what changed and why"
git push
```

> **Known gotcha — account mismatch.** The machine that pushes here may be authenticated
> as a *different* GitHub account than the repo owner (e.g. this session pushed as
> `Wasabi-Projects`, while the repo is owned by `jamesphilipmurphy1998-ship-it`). If `git
> push` fails with `Permission ... denied to <account>` / `403`, that account needs to be
> added as a collaborator on the repo (owner account → repo **Settings → Collaborators**
> → add the other account), and then **that other account** has to explicitly accept the
> invite while logged in as itself — visiting the repo page while logged in as the *owner*
> does not accept anything on the collaborator's behalf. Accept via
> `github.com/<owner>/<repo>/invitations` while signed into the invited account, or the
> accept banner on the repo's own page (only visible when logged in as the invited
> account) — check the account-switcher (avatar, top-right) to confirm which account a
> browser session is actually using before assuming an invite "isn't showing up."
>
> Making the repo public does **not** grant push/write access by itself — write access
> always requires being an accepted collaborator (or repo owner), regardless of
> public/private visibility.

**If a fresh clone/machine ever needs the remote re-added** (e.g. `git remote -v` comes
back empty):

```powershell
git remote add origin https://github.com/jamesphilipmurphy1998-ship-it/Food-Management-System.git
git push -u origin master
```
