param(
  [switch]$DryRun,
  [string]$InputXlsx = "",
  [string]$ProfileDir = "",
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
$nodeExe = (Get-Command node -ErrorAction Stop).Source

function Invoke-NodeStep {
  param(
    [Parameter(Mandatory = $true)]
    [string]$StepName,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [int]$Attempts = 2,
    [int]$RetryDelaySeconds = 20
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    Write-Output "[sync] $StepName attempt $attempt/$Attempts"
    & $nodeExe @Arguments
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
    if ($exitCode -eq 0) {
      return
    }
    if ($attempt -ge $Attempts) {
      throw "$StepName failed with exit code $exitCode"
    }
    Write-Output "[sync] $StepName failed with exit code $exitCode. Retrying in $RetryDelaySeconds sec."
    Start-Sleep -Seconds $RetryDelaySeconds
  }
}

$resolvedOutputDir = if ($OutputDir) { $OutputDir } else { ".altea-google-sheet-sync-output" }

$buildArguments = @(
  "scripts/portal-google-sheet-sync.js",
  "sync"
)

if ($InputXlsx) {
  $buildArguments += "--input-xlsx"
  $buildArguments += $InputXlsx
}

if ($ProfileDir) {
  $buildArguments += "--profile-dir"
  $buildArguments += $ProfileDir
}

# Build JSON locally; uploads happen below through dedicated upload scripts.
$buildArguments += "--dry-run"
$buildArguments += "--output-dir"
$buildArguments += $resolvedOutputDir
$buildArguments += "--mirror-local-fallback"

Write-Output "[sync] build phase started (expected dryRun=true in JSON summary below; local fallback data will also be mirrored)"
& $nodeExe @buildArguments
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
Write-Output "[sync] build phase completed"

$priceArguments = @(
  "scripts/portal-smart-price-overlay-sync.js",
  "sync",
  "--output-dir",
  $resolvedOutputDir
)

if ($ProfileDir) {
  $priceArguments += "--profile-dir"
  $priceArguments += $ProfileDir
}

$priceArguments += "--dry-run"

Write-Output "[sync] smart_price_overlay build phase started"
& $nodeExe @priceArguments
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
Write-Output "[sync] smart_price_overlay build phase completed"

$metaPath = Join-Path $resolvedOutputDir "meta.json"
if (Test-Path -LiteralPath $metaPath) {
  $meta = Get-Content -LiteralPath $metaPath -Raw | ConvertFrom-Json
  $sourceDate = [string]$meta.dashboard.latest_marketplace_date
  if ([string]::IsNullOrWhiteSpace($sourceDate)) {
    $sourceDate = [string]$meta.logistics.latest_logistics_date
  }
  if ([string]::IsNullOrWhiteSpace($sourceDate)) {
    $sourceDate = Get-Date -Format "yyyy-MM-dd"
  }
  $runStamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
  $historyDir = Join-Path $resolvedOutputDir (Join-Path "history" (Join-Path $sourceDate $runStamp))
  New-Item -ItemType Directory -Path $historyDir -Force | Out-Null
  Get-ChildItem -LiteralPath $resolvedOutputDir -Filter "*.json" -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $historyDir $_.Name) -Force
  }
}

if ($DryRun) {
  exit 0
}

Invoke-NodeStep -StepName "dashboard/skus/platform_trends upload" -Arguments @(
  "scripts/portal-google-sheet-upload.js",
  "--input-dir",
  $resolvedOutputDir,
  "--snapshot",
  "dashboard,skus,platform_trends"
)

Invoke-NodeStep -StepName "logistics upload" -Arguments @(
  "scripts/portal-google-sheet-logistics-upload.js",
  "--input-dir",
  $resolvedOutputDir
) -Attempts 3 -RetryDelaySeconds 30

Invoke-NodeStep -StepName "smart_price_overlay upload" -Arguments @(
  "scripts/portal-google-sheet-upload.js",
  "--input-dir",
  $resolvedOutputDir,
  "--snapshot",
  "smart_price_overlay"
)

Write-Output "[sync] full portal sync completed"
