# Full backup: project code + live database, as dated files for the OneDrive backup folder.
#
#   .\scripts\backup-full.ps1                  # build the backup, stage locally, DO NOT touch OneDrive
#   .\scripts\backup-full.ps1 -ConfirmOneDrive # also copy the dated files into the OneDrive folder
#
# Produces two dated artifacts:
#   NutriCost Backup <date>.zip       (project code: frontend + backend source)
#   nutricost-db-<date>.sql.gz         (full pg_dump of the Pi's nutricost DB)
#
# The DB password is read from the Pi's systemd env at runtime — NOT stored in this repo.
# Entirely separate from the Timeline backup (different service, different DB, different
# OneDrive destination) — see wasabi-critical-path/scripts/backup-full.ps1 for that one.

param(
    [switch]$ConfirmOneDrive,
    [string]$PiHost = "192.168.0.50",
    [string]$PiUser = "dizziness7883",
    [string]$Service = "nutricost",
    [string]$OneDriveFolder = "C:\Users\JamesMurphy\OneDrive - Wasabi\WASUK - Food Team - NPD\Wasabi AI Development Projects Saves\NutriCost\Wasabi FMS"
)

$ErrorActionPreference = "Stop"
$pi       = "${PiUser}@${PiHost}"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$date     = Get-Date -Format "yyyy-MM-dd"
$stage    = Join-Path $env:TEMP "nutricost-backup-$date"
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$zipName = "NutriCost Backup $date.zip"
$sqlName = "nutricost-db-$date.sql.gz"
$zipPath = Join-Path $stage $zipName
$sqlPath = Join-Path $stage $sqlName

Write-Host "== Full backup ($date) ==" -ForegroundColor Cyan
Write-Host "Staging: $stage"

# 1. DB dump on the Pi (reads connection from systemd env; password never leaves the Pi until the .sql).
Write-Host "-- Dumping database on the Pi" -ForegroundColor Cyan
$remoteSh = @'
set -e
CONN=$(systemctl show SERVICE_NAME -p Environment --value | tr ' ' '\n' | tr -d '"' | grep -m1 '^NUTRICOST_DB=' | sed 's/^NUTRICOST_DB=//')
get() { echo "$CONN" | tr ';' '\n' | grep -i "^$1=" | head -1 | cut -d= -f2; }
DB=$(get Database); USER=$(get Username); PASS=$(get Password); HOST=$(get Host); PORT=$(get Port)
[ -n "$DB" ] || { echo "could not read DB name from systemd env"; exit 1; }
OUT=/tmp/nutricost-db.sql
PGPASSWORD="$PASS" pg_dump -h "${HOST:-localhost}" -p "${PORT:-5432}" -U "$USER" -d "$DB" --no-owner --no-privileges > "$OUT"
test -s "$OUT" || { echo "dump empty"; exit 1; }
gzip -f "$OUT"
echo "dumped $(stat -c %s ${OUT}.gz) bytes"
'@ -replace 'SERVICE_NAME', $Service -replace "`r`n", "`n"

$shTmp = Join-Path $stage "dump.sh"
[System.IO.File]::WriteAllText($shTmp, $remoteSh, (New-Object System.Text.UTF8Encoding($false)))
scp -o StrictHostKeyChecking=no $shTmp "${pi}:/tmp/nutricost-dump.sh"
if ($LASTEXITCODE -ne 0) { throw "scp of dump script failed" }
& ssh -o StrictHostKeyChecking=no $pi "bash /tmp/nutricost-dump.sh && rm -f /tmp/nutricost-dump.sh"
if ($LASTEXITCODE -ne 0) { throw "remote DB dump failed" }

scp -o StrictHostKeyChecking=no "${pi}:/tmp/nutricost-db.sql.gz" $sqlPath
if ($LASTEXITCODE -ne 0) { throw "scp of DB dump failed" }
& ssh -o StrictHostKeyChecking=no $pi "rm -f /tmp/nutricost-db.sql.gz"
Write-Host "DB dump: $sqlPath" -ForegroundColor Green

# 2. Zip the project. Mirror to a clean tree first (robocopy /XD excludes build/VCS
#    dirs at ANY depth — Compress-Archive alone can't exclude nested dirs like backend/bin).
Write-Host "-- Zipping project (excluding build artifacts)" -ForegroundColor Cyan
$src = Join-Path $stage "src"
$excludeDirs = @('.git', 'node_modules', '_backups', 'bin', 'obj',
                 'publish-pi', 'publish-linux-arm64')
# robocopy returns 0-7 for success (8+ = error); don't let non-zero trip $ErrorActionPreference.
$rc = Start-Process robocopy -ArgumentList (@("`"$repoRoot`"", "`"$src`"", "/MIR", "/XD") + $excludeDirs + @("/NFL", "/NDL", "/NJH", "/NJS", "/NP")) -Wait -PassThru -NoNewWindow
if ($rc.ExitCode -ge 8) { throw "robocopy failed (exit $($rc.ExitCode))" }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $src '*') -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item $src -Recurse -Force
Write-Host "Project zip: $zipPath ($([math]::Round((Get-Item $zipPath).Length/1MB,1)) MB)" -ForegroundColor Green

# 3. OneDrive copy — only with explicit confirmation (OneDrive approval rule).
if ($ConfirmOneDrive) {
    if (-not (Test-Path $OneDriveFolder)) { throw "OneDrive folder not found: $OneDriveFolder" }
    Copy-Item $zipPath (Join-Path $OneDriveFolder $zipName) -Force
    Copy-Item $sqlPath (Join-Path $OneDriveFolder $sqlName) -Force
    Write-Host "Copied both files into OneDrive:" -ForegroundColor Green
    Write-Host "  $OneDriveFolder"
} else {
    Write-Host ""
    Write-Host "Staged only (OneDrive NOT touched). To finish, re-run with -ConfirmOneDrive," -ForegroundColor Yellow
    Write-Host "or copy these two files into the OneDrive backup folder yourself:" -ForegroundColor Yellow
    Write-Host "  $zipPath"
    Write-Host "  $sqlPath"
}
