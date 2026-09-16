# Connecting to and deploying onto the Raspberry Pi

Generic reference for the shared Raspberry Pi that hosts Wasabi's internal apps
(Timeline, NutriCost, and any future project). Written so a different user — or a
different AI assistant with no memory of this conversation — can connect and deploy
without any other context.

## Connection details

| | |
|---|---|
| Host / IP | `192.168.0.50` (LAN only — not reachable from outside the office network) |
| SSH user | `dizziness7883` |
| SSH auth | Key-based, already trusted from machines that have deployed here before. If connecting from a **new** machine for the first time, you'll need that machine's public key added to `~/.ssh/authorized_keys` on the Pi (ask whoever manages the Pi, or add it via a machine that already has access) |
| Sudo | The `dizziness7883` user has passwordless (or interactive) `sudo` on the Pi — used for installing packages, managing systemd services, and Postgres admin (`sudo -u postgres psql`) |
| OS | Debian-based Linux, ARM64 (Raspberry Pi) |
| Postgres | v17, already installed, running on `localhost:5432` on the Pi |
| .NET runtime | **Not installed on the Pi.** All apps are published as **self-contained** builds (`--self-contained true`), so they ship their own runtime and don't need `dotnet` present on the Pi at all |

### Test the connection

```bash
ssh -o StrictHostKeyChecking=no dizziness7883@192.168.0.50 "echo connected && psql --version"
```

If this fails with a permission/key error, connection isn't set up from your machine yet —
get added to `authorized_keys` before doing anything else.

## What's already running on this Pi (check before claiming a port/service name)

| Service | Port | Folder | Database |
|---|---|---|---|
| `wasabi-timeline.service` | 5002 | `/opt/wasabi-critical-path/current/` | `tuesday_db` |
| `wasabi-timeline-dev.service` | 5003 | `/opt/wasabi-critical-path/` (dev checkout) | `wasabi_timeline_dev` |
| `nutricost.service` | 5001 | `/opt/nutricost/` | `nutricost` |
| Wasabi Apps homepage (if deployed) | 5000 | — | — |

Live-check before adding a new app:

```bash
ssh dizziness7883@192.168.0.50 "systemctl list-units --type=service --all | grep -i wasabi; sudo ss -tlnp | grep -E ':500[0-9]'"
```

Pick a port outside this list for a new project.

## Deploying a new .NET backend to the Pi — step by step

This is the general pattern used for both Timeline and NutriCost.

### 1. Publish self-contained for the Pi's architecture

On the dev machine, from the backend project folder:

```powershell
dotnet publish YourProject.csproj -c Release -r linux-arm64 --self-contained true -o .\publish-pi
```

This produces a native ARM64 executable (e.g. `YourProject.Api`) plus its `.dll` and all
dependency `.so` files — no .NET runtime needed on the Pi.

### 2. Create an isolated folder on the Pi

```bash
ssh dizziness7883@192.168.0.50 "sudo mkdir -p /opt/<your-project>/backend && sudo chown -R dizziness7883:dizziness7883 /opt/<your-project>"
```

Use a folder name that doesn't collide with `/opt/wasabi-critical-path` or `/opt/nutricost`.

### 3. Copy the build over

**Copy the whole publish output, not just the executable.** The native file is just a
thin launcher — it loads the real code from the matching `.dll` at runtime. Copying only
the `.exe`/launcher silently redeploys stale code with no error at all (this bit us once
during NutriCost's deploy — the port-binding fix appeared to do nothing for 20 minutes
until we noticed the `.dll` was never copied).

```powershell
scp -r .\publish-pi\* dizziness7883@192.168.0.50:/opt/<your-project>/backend/
```

If the app serves a static frontend from the parent folder (both Timeline and NutriCost
do this), also copy those files as siblings of `backend/`:

```powershell
scp index.html styles.css app.js dizziness7883@192.168.0.50:/opt/<your-project>/
```

### 4. Make the executable runnable

```bash
ssh dizziness7883@192.168.0.50 "chmod +x /opt/<your-project>/backend/YourProject.Api"
```

### 5. Create a database (if the app needs one)

```bash
ssh dizziness7883@192.168.0.50 "sudo -u postgres psql" <<'SQL'
CREATE DATABASE your_db;
CREATE USER your_db_app WITH PASSWORD 'generate-a-strong-password';
GRANT ALL PRIVILEGES ON DATABASE your_db TO your_db_app;
ALTER DATABASE your_db OWNER TO your_db_app;
SQL
```

**Important — Postgres 15+ gotcha:** owning the database is not enough. Postgres 15+
revokes `CREATE` on the `public` schema from everyone except the schema's own owner, and
`ALTER DATABASE ... OWNER TO` does **not** change who owns the `public` schema inside it.
Without this next step, EF Core migrations (or any `CREATE TABLE`) fail silently/get
swallowed by app-level try/catch, and you end up with an empty database and a working
service that nonetheless does nothing:

```bash
ssh dizziness7883@192.168.0.50 "sudo -u postgres psql -d your_db" <<'SQL'
ALTER SCHEMA public OWNER TO your_db_app;
GRANT ALL ON SCHEMA public TO your_db_app;
SQL
```

### 6. Create the systemd service

```bash
cat <<'EOF' > /tmp/your-project.service
[Unit]
Description=Your Project API
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
WorkingDirectory=/opt/<your-project>/backend
ExecStart=/opt/<your-project>/backend/YourProject.Api
Restart=always
RestartSec=3
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://0.0.0.0:<your-port>
Environment=YOUR_DB=Host=localhost;Port=5432;Database=your_db;Username=your_db_app;Password=<password>;SSLMode=Disable

[Install]
WantedBy=multi-user.target
EOF
scp /tmp/your-project.service dizziness7883@192.168.0.50:/tmp/
ssh dizziness7883@192.168.0.50 "sudo mv /tmp/your-project.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now your-project"
```

**Second gotcha:** systemd's `Environment=` line splits on unquoted whitespace. A
connection string containing `SSL Mode=Disable` (with a space) gets silently truncated —
the value ends at the space and `Mode=Disable` becomes its own garbage variable. Always
use the no-space form of any option (`SSLMode=Disable`, not `SSL Mode=Disable`).

**Third gotcha:** if the app's own code calls `.UseUrls("http://localhost:<port>")`
hard-coded (rather than reading `ASPNETCORE_URLS` from the environment), it will silently
bind to loopback only regardless of what the systemd unit says — the service looks
healthy from the Pi itself (`curl localhost:<port>` works) but refuses every connection
from any other machine on the LAN. Check the app's `Program.cs`/startup code respects the
env var, or hardcode `0.0.0.0` there instead of `localhost`.

### 7. Verify

```bash
ssh dizziness7883@192.168.0.50 "systemctl is-active your-project; sudo ss -tlnp | grep <your-port>"
```

Confirm it shows `active` and the port is bound to `0.0.0.0:<port>`, **not**
`127.0.0.1:<port>`. Then from the dev machine (not the Pi):

```bash
curl http://192.168.0.50:<your-port>/
```

If this hangs or refuses but the Pi-local curl worked, it's the loopback-binding gotcha
above.

## Updating an already-deployed app

Same as steps 1, 3, 4, 7 — republish, copy the **entire** publish folder over (never just
the launcher), `chmod +x`, restart:

```bash
ssh dizziness7883@192.168.0.50 "sudo systemctl stop your-project"
scp -r .\publish-pi\* dizziness7883@192.168.0.50:/opt/<your-project>/backend/
ssh dizziness7883@192.168.0.50 "chmod +x /opt/<your-project>/backend/YourProject.Api && sudo systemctl start your-project"
```

## Reading logs

```bash
ssh dizziness7883@192.168.0.50 "sudo journalctl -u your-project -n 50 --no-pager"
```

Wait a couple of seconds after starting before reading — the app takes a moment to boot
and early log lines (including startup errors) can otherwise appear to be missing.

## Backing up a project (zip + DB dump) to OneDrive

Same pattern for any project deployed here: a dated zip of the project source, and a
`pg_dump` of its live Pi database, dropped into that project's own OneDrive folder.
NutriCost's copy of this is [scripts/backup-full.ps1](scripts/backup-full.ps1); Timeline's
is `wasabi-critical-path/scripts/backup-full.ps1`. To set one up for a new project, copy
whichever of those is closest and change the parameters at the top:

```powershell
param(
    [switch]$ConfirmOneDrive,
    [string]$PiHost = "192.168.0.50",
    [string]$PiUser = "dizziness7883",
    [string]$Service = "your-project",                      # systemd service name — script reads its DB env var from this
    [string]$OneDriveFolder = "C:\Users\JamesMurphy\OneDrive - Wasabi\WASUK - Food Team - NPD\Wasabi AI Development Projects Saves\<YourProject>\<subfolder>"
)
```

It also expects the systemd unit's DB connection env var to be named `<SERVICE_UPPER>_DB`
(e.g. `NUTRICOST_DB`, `WASABI_TIMELINE_DB`) — update the `grep -m1 '^...DB='` line inside
the script's embedded remote shell block to match whatever you actually called it.

**Running it:**

```powershell
cd C:\Dev\<YourProject>
.\scripts\backup-full.ps1                    # stages the zip + db dump locally only, does NOT touch OneDrive
.\scripts\backup-full.ps1 -ConfirmOneDrive   # also copies both dated files into the OneDrive folder
```

Just telling an AI *"send to the zip folder"* or *"back this up"* is enough for it to run
the second form directly — the script itself is the safety gate (nothing touches OneDrive
without `-ConfirmOneDrive`), so there's no separate confirmation needed beyond that flag.

**What it does, step by step** (useful if writing one from scratch instead of copying):

1. SSH to the Pi, read the target systemd service's `Environment=` block to pull the DB
   connection string without ever hardcoding the password in the script.
2. `pg_dump` that database on the Pi itself, gzip it, `scp` the `.sql.gz` back to the dev
   machine.
3. `robocopy /MIR /XD` the project folder to a clean temp copy, excluding build output
   (`bin`, `obj`, `publish*`, `node_modules`, `.git`, etc.) — `Compress-Archive` can't
   exclude nested folders by itself, hence the robocopy step first.
4. `Compress-Archive` that clean copy into a dated zip.
5. Only if `-ConfirmOneDrive` was passed: copy both dated files into the project's
   OneDrive folder, overwriting any existing file for that date.

Each project's OneDrive backup folder is separate — running NutriCost's script never
writes into Timeline's folder or vice versa, and each reads only its own service's DB
credentials off the Pi.
