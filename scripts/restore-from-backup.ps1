# Disaster recovery: restore the Pi's nutricost database from a dated backup produced by
# backup-full.ps1. Use this if the live database gets wiped/corrupted — NOT for routine use.
#
#   .\scripts\restore-from-backup.ps1                       # restores the MOST RECENT backup found
#   .\scripts\restore-from-backup.ps1 -Date 2026-09-18       # restores that specific date's backup
#
# Safety: refuses to run against a database that already has data in it, unless -Force is
# passed — this script is for recovering a wiped/empty database, not overwriting a live one.
# To bring back individual records into a live database instead, restore into a scratch
# database first (see BACKUP.md) and copy out only what's needed.

param(
    [string]$Date,
    [switch]$Force,
    [string]$OneDriveFolder = "C:\Users\JamesMurphy\OneDrive - Wasabi\WASUK - Food Team - NPD\New Wasabi System Development\FMS System\2. Wasabi FMS Code & Database Backups",
    [string]$PiHost = "192.168.0.50",
    [string]$PiUser = "dizziness7883",
    [string]$Service = "nutricost"
)

$ErrorActionPreference = "Stop"
$pi = "${PiUser}@${PiHost}"

# 1. Find the backup file.
if ($Date) {
    $sqlName = "nutricost-db-$Date.sql.gz"
    $sqlPath = Join-Path $OneDriveFolder $sqlName
    if (-not (Test-Path $sqlPath)) { throw "No backup found for $Date at: $sqlPath" }
} else {
    $latest = Get-ChildItem $OneDriveFolder -Filter "nutricost-db-*.sql.gz" | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $latest) { throw "No nutricost-db-*.sql.gz backups found in: $OneDriveFolder" }
    $sqlPath = $latest.FullName
    $sqlName = $latest.Name
}
Write-Host "Restoring from: $sqlPath" -ForegroundColor Cyan

# 2. Read the live connection details from the Pi's systemd env (same pattern as backup-full.ps1).
$remoteCheck = @'
CONN=$(systemctl show SERVICE_NAME -p Environment --value | tr ' ' '\n' | tr -d '"' | grep -m1 '^NUTRICOST_DB=' | sed 's/^NUTRICOST_DB=//')
get() { echo "$CONN" | tr ';' '\n' | grep -i "^$1=" | head -1 | cut -d= -f2; }
DB=$(get Database); USER=$(get Username); PASS=$(get Password); HOST=$(get Host); PORT=$(get Port)
COUNT=$(PGPASSWORD="$PASS" psql -h "${HOST:-localhost}" -p "${PORT:-5432}" -U "$USER" -d "$DB" -tAc "SELECT count(*) FROM recipes" 2>/dev/null || echo "-1")
echo "DB=$DB USER=$USER PASS=$PASS HOST=${HOST:-localhost} PORT=${PORT:-5432} COUNT=$COUNT"
'@ -replace 'SERVICE_NAME', $Service -replace "`r`n", "`n"

$checkTmp = Join-Path $env:TEMP "nutricost-restore-check.sh"
[System.IO.File]::WriteAllText($checkTmp, $remoteCheck, (New-Object System.Text.UTF8Encoding($false)))
scp -o StrictHostKeyChecking=no $checkTmp "${pi}:/tmp/nutricost-restore-check.sh" | Out-Null
$result = & ssh -o StrictHostKeyChecking=no $pi "bash /tmp/nutricost-restore-check.sh && rm -f /tmp/nutricost-restore-check.sh"
if ($LASTEXITCODE -ne 0) { throw "Failed to read live DB connection details from the Pi" }

$fields = @{}
foreach ($pair in ($result -split ' ')) {
    if ($pair -match '^([A-Z]+)=(.*)$') { $fields[$matches[1]] = $matches[2] }
}
$existingCount = [int]$fields['COUNT']
Write-Host "Live database currently has $existingCount recipe row(s)." -ForegroundColor Cyan

if ($existingCount -gt 0 -and -not $Force) {
    throw "Live database is NOT empty ($existingCount recipes) — refusing to restore without -Force. " +
          "This script is for recovering a wiped database. To bring back individual records into a " +
          "live database instead, restore into a scratch database and copy out only what's needed (see BACKUP.md)."
}
if ($existingCount -gt 0 -and $Force) {
    Write-Host "WARNING: -Force set — this will DROP AND REPLACE all $existingCount existing recipe row(s) on prod." -ForegroundColor Red
    $confirm = Read-Host "Type YES to continue"
    if ($confirm -ne "YES") { Write-Host "Aborted." -ForegroundColor Yellow; exit 1 }
}

# 3. Copy the dump to the Pi and restore it.
Write-Host "-- Copying backup to the Pi" -ForegroundColor Cyan
scp -o StrictHostKeyChecking=no $sqlPath "${pi}:/tmp/nutricost-restore.sql.gz"
if ($LASTEXITCODE -ne 0) { throw "scp of backup to Pi failed" }

Write-Host "-- Restoring on the Pi (this may take a moment)" -ForegroundColor Cyan
$remoteRestore = @"
set -e
gunzip -f /tmp/nutricost-restore.sql.gz
PGPASSWORD='$($fields['PASS'])' psql -h '$($fields['HOST'])' -p '$($fields['PORT'])' -U '$($fields['USER'])' -d '$($fields['DB'])' -f /tmp/nutricost-restore.sql
rm -f /tmp/nutricost-restore.sql
echo "restore complete"
"@
& ssh -o StrictHostKeyChecking=no $pi $remoteRestore
if ($LASTEXITCODE -ne 0) { throw "Remote restore failed" }

Write-Host ""
Write-Host "Restore complete from $sqlName." -ForegroundColor Green
Write-Host "Verify: curl http://192.168.0.50:5001/api/recipes  (check the count looks right)" -ForegroundColor Cyan
