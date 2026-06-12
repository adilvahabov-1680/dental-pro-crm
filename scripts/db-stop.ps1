# Dental Pro CRM - stop local portable PostgreSQL.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\db-stop.ps1
# NOTE: ASCII-only file (Windows PowerShell 5.1 reads no-BOM files as ANSI).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pgBin = Join-Path $root ".pglocal\pgsql\bin"
$dataDir = Join-Path $root ".pglocal\data"

& (Join-Path $pgBin "pg_ctl.exe") stop -D $dataDir -m fast
Write-Host "OK PostgreSQL stopped"
