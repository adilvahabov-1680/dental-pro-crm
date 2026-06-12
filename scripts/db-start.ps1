# Dental Pro CRM - start local portable PostgreSQL (no system install).
# Binaries and data live in .pglocal/ (gitignored). Docs: docs/SETUP.md
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\db-start.ps1
# NOTE: ASCII-only file (Windows PowerShell 5.1 reads no-BOM files as ANSI).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pgBin = Join-Path $root ".pglocal\pgsql\bin"
$dataDir = Join-Path $root ".pglocal\data"
$logFile = Join-Path $root ".pglocal\postgres.log"

if (-not (Test-Path (Join-Path $pgBin "pg_ctl.exe"))) {
  Write-Error "PostgreSQL binaries not found in .pglocal\pgsql. See docs/SETUP.md (Portable PostgreSQL section)."
}

# initdb on first run (auth=trust - local development only)
if (-not (Test-Path (Join-Path $dataDir "PG_VERSION"))) {
  Write-Host "-> initdb (first run)..."
  & (Join-Path $pgBin "initdb.exe") -D $dataDir -U postgres -E UTF8 -A trust | Out-Null
}

# start if not running
& (Join-Path $pgBin "pg_ctl.exe") status -D $dataDir 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "-> Starting PostgreSQL..."
  & (Join-Path $pgBin "pg_ctl.exe") start -D $dataDir -l $logFile -w | Out-Null
} else {
  Write-Host "PostgreSQL already running."
}

# create database on first run
$exists = & (Join-Path $pgBin "psql.exe") -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='dental_pro_crm'"
if ($exists -ne "1") {
  Write-Host "-> Creating database dental_pro_crm..."
  & (Join-Path $pgBin "createdb.exe") -U postgres -h localhost dental_pro_crm
}
Write-Host "OK PostgreSQL ready: postgresql://postgres@localhost:5432/dental_pro_crm"
