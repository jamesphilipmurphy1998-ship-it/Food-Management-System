# NutriCost — dev, deploy, backup, and git — quick reference

One-stop guide for the four things that come up over and over: running it locally, pushing
a change live, saving a backup zip, and committing/pushing to git. Deeper mechanics for
deploy/backup live in [SAVE-AND-DEPLOY.md](SAVE-AND-DEPLOY.md), [PI-RUNBOOK.md](PI-RUNBOOK.md)
and [PI-CONNECTION.md](PI-CONNECTION.md) — this file is the short version + git, which
wasn't written down anywhere before.

## 0. One-time machine setup (skip if already done)

Everything below assumes these are already true on the machine running the commands.
None of this is AI/session memory — it's state that lives on disk/in the OS, so a fresh AI
session on an **already set-up** machine needs none of this; a genuinely new machine needs
all of it before section 1 onward will work.

**.NET SDK** — required for `dotnet run` / `dotnet publish`. Verify with:
```powershell
dotnet --version
```
This machine has `10.0.103`. If missing, install the .NET SDK from Microsoft.

**SSH access to the Pi** (`dizziness7883@192.168.0.50`) — an SSH key must exist and be
authorized on the Pi:
```powershell
ls ~/.ssh/
# expect id_ed25519 / id_ed25519.pub, and 192.168.0.50 present in known_hosts
```
If there's no key pair, generate one (`ssh-keygen -t ed25519`) and get its **public** key
added to `~/.ssh/authorized_keys` on the Pi (ask whoever manages the Pi, or do it directly
if you already have another way in). Test with `ssh dizziness7883@192.168.0.50 "echo ok"` —
it should return `ok` with no password prompt.

**GitHub push access** — `git push` needs to already be authenticated as an account that's
a collaborator on `jamesphilipmurphy1998-ship-it/Food-Management-System` (currently
`Wasabi-Projects`; see the account-mismatch gotcha in section 4). This machine has no
`.gitconfig`-level credential helper explicitly set, so it's relying on Windows' own Git
Credential Manager having a cached token from a previous `git push`/login — the standard
way to (re)establish this on a new machine is:
```powershell
gh auth login
```
(or triggering any `git push` to this remote, which will prompt a browser-based GitHub
login the first time). There's no way to verify this is set up short of trying a push —
if `git push` prompts for credentials instead of just working, it isn't done yet.

**OneDrive sync** — the backup script writes into a synced OneDrive folder; if OneDrive
isn't signed in yet on this Windows account, that folder won't exist and
`backup-full.ps1 -ConfirmOneDrive` will fail with `OneDrive folder not found`. Sign into
OneDrive with the Wasabi account first, and confirm the folder resolves:
```powershell
Test-Path "C:\Users\JamesMurphy\OneDrive - Wasabi\WASUK - Food Team - NPD\New Wasabi System Development\FMS System\2. Wasabi FMS Code & Database Backups"
# expect True
```

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

## 5. Deploying the other Wasabi Functions apps (homepage, Approval Process)

These live outside this repo, at `C:\Dev\wasabi-home` and `C:\Dev\wasabi-approval` — neither
is a git repo, so there's no push/pull step, just copy-to-Pi. Both are plain static HTML (no
build step, no backend of their own), served the same way `wasabi-home` already is: a
systemd unit running `python3 -m http.server <port>` pointed at a folder under `/opt`.

**Wasabi Functions homepage** (`http://192.168.0.50:5000`, systemd service `wasabi-home`) —
after editing `wasabi-home/index.html` (e.g. adding a new app box):

```powershell
scp C:\Dev\wasabi-home\index.html dizziness7883@192.168.0.50:/opt/wasabi-home/
ssh dizziness7883@192.168.0.50 "sudo systemctl restart wasabi-home"
curl http://192.168.0.50:5000/
```

No cache-buster needed — it's a single un-cached HTML file with no separate JS/CSS assets.

**Approval Process** (`http://192.168.0.50:5005` once deployed) — tracks where each recipe
sits in the code-creation pipeline (In Development → Approved for Code Creation → Complete)
by reading NutriCost's `/api/recipes` live, using the visitor's existing NutriCost sign-in
cookie (this only works because NutriCost's CORS policy has `AllowCredentials()` — see
`backend/Program.cs`). First-time setup on the Pi (do this once):

```powershell
ssh dizziness7883@192.168.0.50 "sudo mkdir -p /opt/wasabi-approval"
scp C:\Dev\wasabi-approval\index.html dizziness7883@192.168.0.50:/opt/wasabi-approval/
```

Then create the systemd unit (`/etc/systemd/system/wasabi-approval.service` on the Pi),
mirroring whatever `wasabi-home.service` already looks like — same `python3 -m http.server`
pattern, just port `5005` and `WorkingDirectory=/opt/wasabi-approval`:

```powershell
ssh dizziness7883@192.168.0.50 "sudo systemctl enable --now wasabi-approval"
curl http://192.168.0.50:5005/
```

**Every later update** (just the one file, same as the homepage):

```powershell
scp C:\Dev\wasabi-approval\index.html dizziness7883@192.168.0.50:/opt/wasabi-approval/
ssh dizziness7883@192.168.0.50 "sudo systemctl restart wasabi-approval"
```

Also add its box to the homepage (section above) once it's live, if not already there.

> **Local testing note:** `static-server.ps1` (section 1) already uses port 5005 for
> NutriCost's own frontend-only dev server. If that's running, test Approval Process on a
> different local port instead (e.g. `python -m http.server 5006` from
> `C:\Dev\wasabi-approval`) and pass `?api=http://localhost:5055` in the URL to point it at
> the local NutriCost backend — the Pi deployment still uses 5005 as documented above, this
> is purely a local dev-port collision, not a Pi-side one.
