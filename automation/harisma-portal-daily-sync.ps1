$ErrorActionPreference = "Stop"

$WorkspaceRoot = Split-Path -Parent $PSScriptRoot
$Runner = Join-Path $WorkspaceRoot "scripts\portal-google-sheet-catchup.ps1"
$LogDir = Join-Path $WorkspaceRoot ".altea-google-sheet-sync-output"

if (-not (Test-Path -LiteralPath $Runner)) {
  throw "Current portal sync runner not found: $Runner"
}

Write-Output "[legacy-wrapper] Harisma Portal Daily Sync is deprecated."
Write-Output "[legacy-wrapper] Delegating to: $Runner"

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Runner -EarliestRun "10:00" -LogDir $LogDir
exit $LASTEXITCODE
