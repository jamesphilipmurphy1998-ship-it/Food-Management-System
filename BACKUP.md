# Backing up NutriCost (code + prod database)

Trigger phrase: **"send to the zip folder"** or **"back this up"** — either is enough on its
own. No further confirmation is needed beyond that phrase; the script itself is the safety
gate (nothing touches OneDrive without `-ConfirmOneDrive`, which the phrase authorizes).

## What it does

Runs [scripts/backup-full.ps1](scripts/backup-full.ps1), which:

1. SSHes into the Pi and runs `pg_dump` on the live **prod** database (`nutricost`, read via
   the `nutricost` systemd service's own env — the password never gets typed or stored here),
   gzips it, and copies the `.sql.gz` back.
2. Mirrors this repo's source (excluding `bin`, `obj`, `publish-pi`, `.git`, `node_modules`)
   into a clean temp copy and zips it.
3. Copies both dated files into the OneDrive backup folder:

```
C:\Users\JamesMurphy\OneDrive - Wasabi\WASUK - Food Team - NPD\New Wasabi System Development\FMS System\2. Wasabi FMS Code & Database Backups
```

Produces, each run:
- `NutriCost Backup <date>.zip` — full project source
- `nutricost-db-<date>.sql.gz` — full dump of the live **prod** (Pi) database

Always backs up **prod**, not dev/Supabase — prod is the one running unattended on the Pi and
worth protecting; dev is disposable/re-importable by design.

## Running it

```powershell
cd C:\Dev\NutriCost
.\scripts\backup-full.ps1                    # stage the zip + db dump locally only, don't touch OneDrive
.\scripts\backup-full.ps1 -ConfirmOneDrive   # also copy both dated files into the OneDrive folder above
```

Same pattern as Timeline's (`wasabi-critical-path/scripts/backup-full.ps1`) — separate script,
separate service, separate OneDrive folder, never cross-writes.

## Restoring — disaster recovery only

Trigger phrase: **"restore from backup"** / **"recover the database"** (optionally with a
date, e.g. "restore from the 2026-09-18 backup"). This is for one scenario specifically:
**prod's database got wiped or corrupted and needs to be rebuilt from the last known-good
snapshot.** It is not a routine or casual action.

Runs [scripts/restore-from-backup.ps1](scripts/restore-from-backup.ps1), which:

1. Finds the requested `nutricost-db-<date>.sql.gz` in the OneDrive backup folder (or the
   most recent one if no date is given).
2. Checks how many rows are currently in the live prod database.
3. **Refuses to run if prod isn't actually empty**, unless `-Force` is passed — this script
   restores into a wiped database, it does not overwrite a live one. (To recover just a
   handful of records into an otherwise-fine live database, restore the dump into a separate
   scratch database instead — `createdb nutricost_scratch && gunzip -c nutricost-db-<date>.sql.gz | psql -d nutricost_scratch` —
   then copy out only what's needed. `psql`/`pg_restore` are already available locally via
   scoop.)
4. Copies the dump to the Pi and restores it via `psql`.

```powershell
cd C:\Dev\NutriCost
.\scripts\restore-from-backup.ps1                       # restores the most recent backup
.\scripts\restore-from-backup.ps1 -Date 2026-09-18       # restores a specific date
.\scripts\restore-from-backup.ps1 -Date 2026-09-18 -Force # overwrite a non-empty live DB (asks for a typed "YES" confirmation)
```

Recovery is only as granular as the backups that actually exist — this restores to "state as
of whenever that day's backup was taken," not to an exact moment in time. There's currently no
scheduled/automatic backup, so recoverable dates are limited to whenever "send to the zip
folder" was actually run.
