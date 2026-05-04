param(
  [switch]$DryRun,
  [switch]$AllowStaleWeek,
  [string]$ProfileDir = "",
  [string]$OutputDir = "",
  [string]$SourceUrl = "",
  [string]$Gid = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
$nodeExe = (Get-Command node -ErrorAction Stop).Source

$resolvedOutputDir = if ($OutputDir) { $OutputDir } else { ".altea-google-sheet-sync-output" }

$buildArguments = @(
  "scripts/portal-kz-product-leaderboard-sync.js",
  "sync",
  "--output-dir",
  $resolvedOutputDir,
  "--mirror-local-fallback"
)

if ($ProfileDir) {
  $buildArguments += "--profile-dir"
  $buildArguments += $ProfileDir
}

if ($SourceUrl) {
  $buildArguments += "--source-url"
  $buildArguments += $SourceUrl
}

if ($Gid) {
  $buildArguments += "--gid"
  $buildArguments += $Gid
}

if ($AllowStaleWeek) {
  $buildArguments += "--allow-stale-week"
}

if ($DryRun) {
  $buildArguments += "--dry-run"
}

Write-Output "[kz-leaderboard] build phase started"
& $nodeExe @buildArguments
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
Write-Output "[kz-leaderboard] build phase completed"

if ($DryRun) {
  exit 0
}

Write-Output "[kz-leaderboard] snapshot upload started"
& $nodeExe @(
  "scripts/portal-google-sheet-upload.js",
  "--input-dir",
  $resolvedOutputDir,
  "--snapshot",
  "product_leaderboard"
)
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
Write-Output "[kz-leaderboard] snapshot upload completed"
