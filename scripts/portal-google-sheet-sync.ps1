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
    $tempStdout = [System.IO.Path]::GetTempFileName()
    $tempStderr = [System.IO.Path]::GetTempFileName()
    try {
      $process = Start-Process -FilePath $nodeExe -ArgumentList $Arguments -NoNewWindow -Wait -PassThru -RedirectStandardOutput $tempStdout -RedirectStandardError $tempStderr
      if (Test-Path -LiteralPath $tempStdout) {
        Get-Content -LiteralPath $tempStdout -ErrorAction SilentlyContinue | ForEach-Object { Write-Output $_ }
      }
      if (Test-Path -LiteralPath $tempStderr) {
        Get-Content -LiteralPath $tempStderr -ErrorAction SilentlyContinue | ForEach-Object { Write-Output $_ }
      }
      $exitCode = if ($null -eq $process.ExitCode) { 0 } else { $process.ExitCode }
    } finally {
      Remove-Item -LiteralPath $tempStdout -Force -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath $tempStderr -Force -ErrorAction SilentlyContinue
    }
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

function Set-ProcessEnvFallback {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [string]$FallbackPath = ""
  )

  $current = [Environment]::GetEnvironmentVariable($Name, "Process")
  if (-not [string]::IsNullOrWhiteSpace($current)) {
    return
  }

  $userValue = [Environment]::GetEnvironmentVariable($Name, "User")
  if (-not [string]::IsNullOrWhiteSpace($userValue)) {
    [Environment]::SetEnvironmentVariable($Name, $userValue, "Process")
    Set-Item -Path ("Env:" + $Name) -Value $userValue
    return
  }

  if (-not [string]::IsNullOrWhiteSpace($FallbackPath) -and (Test-Path -LiteralPath $FallbackPath)) {
    [Environment]::SetEnvironmentVariable($Name, $FallbackPath, "Process")
    Set-Item -Path ("Env:" + $Name) -Value $FallbackPath
  }
}

$resolvedOutputDir = if ($OutputDir) { $OutputDir } else { ".altea-google-sheet-sync-output" }
New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null

if ([string]::IsNullOrWhiteSpace($env:ALTEA_WB_API_TOKEN)) {
  $userWbApiToken = [Environment]::GetEnvironmentVariable("ALTEA_WB_API_TOKEN", "User")
  if ([string]::IsNullOrWhiteSpace($userWbApiToken)) {
    $userWbApiToken = [Environment]::GetEnvironmentVariable("ALTEA_WB_PROMOTION_TOKEN", "User")
  }
  if (-not [string]::IsNullOrWhiteSpace($userWbApiToken)) {
    $env:ALTEA_WB_API_TOKEN = $userWbApiToken
  }
}

Write-Output "[sync] WB analytics CSV refresh started"
Invoke-NodeStep -StepName "WB analytics CSV refresh" -Arguments @(
  "scripts/portal-wb-orders-trends-sync.js",
  "sync"
) -Attempts 3 -RetryDelaySeconds 20
Write-Output "[sync] WB analytics CSV refresh completed"

$envOzonClientId = $env:ALTEA_OZON_CLIENT_ID
if ([string]::IsNullOrWhiteSpace($envOzonClientId)) {
  $envOzonClientId = [Environment]::GetEnvironmentVariable("ALTEA_OZON_CLIENT_ID", "User")
  if (-not [string]::IsNullOrWhiteSpace($envOzonClientId)) {
    $env:ALTEA_OZON_CLIENT_ID = $envOzonClientId
  }
}

$envOzonApiKey = $env:ALTEA_OZON_API_KEY
if ([string]::IsNullOrWhiteSpace($envOzonApiKey)) {
  $envOzonApiKey = [Environment]::GetEnvironmentVariable("ALTEA_OZON_API_KEY", "User")
  if (-not [string]::IsNullOrWhiteSpace($envOzonApiKey)) {
    $env:ALTEA_OZON_API_KEY = $envOzonApiKey
  }
}

Set-ProcessEnvFallback -Name "ALTEA_YM_API_KEY"
Set-ProcessEnvFallback -Name "ALTEA_YM_CAMPAIGN_ID"
Set-ProcessEnvFallback -Name "ALTEA_YM_BUSINESS_ID"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_API_TOKEN"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_API_BASE_URL"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_SALES_PATH"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_CLIENT_ID"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_LOCAL_EXPORT_XLSX"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_PLAN_XLSX"
Set-ProcessEnvFallback -Name "ALTEA_ZYA_SALES_ZIP" (Join-Path $env:LOCALAPPDATA "Temp\zya_sales.zip")
Set-ProcessEnvFallback -Name "ALTEA_ZYA_ADS_XLSX" (Join-Path $env:LOCALAPPDATA "Temp\zya_ads.xlsx")
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_SALES_CSV" (Join-Path $env:LOCALAPPDATA "Temp\magnit_sales.csv")
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_SERVICES_CSV" (Join-Path $env:LOCALAPPDATA "Temp\magnit_services.csv")

Write-Output "[sync] Ozon marketplace analytics refresh started"
Invoke-NodeStep -StepName "Ozon marketplace analytics refresh" -Arguments @(
  "scripts/portal-ozon-finance-trends-sync.js",
  "sync"
) -Attempts 3 -RetryDelaySeconds 20
Write-Output "[sync] Ozon marketplace analytics refresh completed"
Write-Output "[sync] waiting 30 sec before the next Ozon-backed step"
Start-Sleep -Seconds 30

Write-Output "[sync] Yandex Market analytics refresh started"
try {
  Invoke-NodeStep -StepName "Yandex Market analytics refresh" -Arguments @(
    "scripts/portal-yandex-market-trends-sync.js",
    "sync"
  ) -Attempts 1 -RetryDelaySeconds 20
  Write-Output "[sync] Yandex Market analytics refresh completed"
} catch {
  Write-Warning "[sync] Yandex Market analytics refresh failed, but the portal sync will continue: $($_.Exception.Message)"
}

Write-Output "[sync] warehouse stock overlay refresh started"
Invoke-NodeStep -StepName "warehouse stock overlay refresh" -Arguments @(
  "scripts/portal-warehouse-stock-sync.js",
  "sync",
  "--output-dir",
  $resolvedOutputDir
) -Attempts 3 -RetryDelaySeconds 20
Write-Output "[sync] warehouse stock overlay refresh completed"

Write-Output "[sync] marketplace workbook build started"
Invoke-NodeStep -StepName "marketplace workbook build" -Arguments @(
  "scripts/build-altea-funnel-workbook.js",
  "build",
  "--output",
  "exports/altea_max_funnel_2025_2026.xlsx"
) -Attempts 4 -RetryDelaySeconds 90
Write-Output "[sync] marketplace workbook build completed"

$extraMarketplaceMergeArguments = @(
  "scripts/portal-extra-marketplace-trends-sync.js",
  "sync",
  "--workbook",
  "exports/altea_max_funnel_2025_2026.xlsx",
  "--output-dir",
  $resolvedOutputDir,
  "--mirror-local-fallback"
)

Write-Output "[sync] extra marketplace merge started"
try {
  Invoke-NodeStep -StepName "extra marketplace merge" -Arguments $extraMarketplaceMergeArguments -Attempts 3 -RetryDelaySeconds 20
  Write-Output "[sync] extra marketplace merge completed"
} catch {
  Write-Warning "[sync] extra marketplace merge failed, but the portal sync will continue: $($_.Exception.Message)"
}

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
Invoke-NodeStep -StepName "Google sheet data build" -Arguments $buildArguments -Attempts 2 -RetryDelaySeconds 30
Write-Output "[sync] build phase completed"

Write-Output "[sync] order procurement build phase started"
Invoke-NodeStep -StepName "order procurement build" -Arguments @("scripts/build-order-procurement-layer.js") -Attempts 2 -RetryDelaySeconds 20

$orderProcurementFiles = @(
  "order_procurement.json",
  "order_procurement_wb.json",
  "order_procurement_ozon.json"
)
foreach ($fileName in $orderProcurementFiles) {
  $sourcePath = Join-Path "data" $fileName
  if (Test-Path -LiteralPath $sourcePath) {
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $resolvedOutputDir $fileName) -Force
  }
}
Write-Output "[sync] order procurement build phase completed"

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
try {
  Invoke-NodeStep -StepName "smart_price_overlay build" -Arguments $priceArguments -Attempts 2 -RetryDelaySeconds 30
  Write-Output "[sync] smart_price_overlay build phase completed"
  $priceRefreshSucceeded = $true
} catch {
  $priceRefreshSucceeded = $false
  Write-Warning "[sync] smart_price_overlay build failed, but the portal sync will continue: $($_.Exception.Message)"
}

if ($priceRefreshSucceeded) {
  $priceLayerFiles = @(
    "prices.json",
    "repricer.json",
    "smart_price_overlay.json"
  )
  foreach ($fileName in $priceLayerFiles) {
    $sourcePath = Join-Path "data" $fileName
    if (Test-Path -LiteralPath $sourcePath) {
      Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $resolvedOutputDir $fileName) -Force
    }
  }
  Write-Output "[sync] price/repricer layer files staged"
} else {
  Write-Warning "[sync] price/repricer layer files were not refreshed and will not be re-uploaded."
}

$kzSyncScript = Join-Path $PSScriptRoot "portal-kz-product-leaderboard-sync.ps1"
$kzParams = @{
  OutputDir = $resolvedOutputDir
  AllowStaleWeek = $true
}

if ($ProfileDir) {
  $kzParams.ProfileDir = $ProfileDir
}

if ($DryRun) {
  $kzParams.DryRun = $true
}

Write-Output "[sync] product leaderboard sync started"
& $kzSyncScript @kzParams
$kzExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
if ($kzExitCode -ne 0) {
  Write-Warning "[sync] product leaderboard sync failed with exit code $kzExitCode. Continuing portal sync without leaderboard refresh."
} else {
  Write-Output "[sync] product leaderboard sync completed"
}

Write-Output "[sync] product leaderboard history build phase started"
Invoke-NodeStep -StepName "product leaderboard history build" -Arguments @("scripts/build-product-leaderboard-history.js") -Attempts 2 -RetryDelaySeconds 20

$leaderboardHistoryPath = Join-Path "data" "product_leaderboard_history.json"
if (Test-Path -LiteralPath $leaderboardHistoryPath) {
  Copy-Item -LiteralPath $leaderboardHistoryPath -Destination (Join-Path $resolvedOutputDir "product_leaderboard_history.json") -Force
}
Write-Output "[sync] product leaderboard history build phase completed"

Write-Output "[sync] IU plan build phase started"
Invoke-NodeStep -StepName "IU plan build" -Arguments @("scripts/build-iu-plan-layer.js") -Attempts 2 -RetryDelaySeconds 20

$iuPlanPath = Join-Path "data" "iu_plan.json"
if (Test-Path -LiteralPath $iuPlanPath) {
  Copy-Item -LiteralPath $iuPlanPath -Destination (Join-Path $resolvedOutputDir "iu_plan.json") -Force
}
Write-Output "[sync] IU plan build phase completed"

if ($DryRun) {
  $wbAdsDryRunFlag = "--dry-run"
} else {
  $wbAdsDryRunFlag = ""
}

if ([string]::IsNullOrWhiteSpace($env:ALTEA_WB_PROMOTION_TOKEN)) {
  $userWbPromotionToken = [Environment]::GetEnvironmentVariable("ALTEA_WB_PROMOTION_TOKEN", "User")
  if ([string]::IsNullOrWhiteSpace($userWbPromotionToken)) {
    $userWbPromotionToken = [Environment]::GetEnvironmentVariable("ALTEA_WB_API_TOKEN", "User")
  }
  if (-not [string]::IsNullOrWhiteSpace($userWbPromotionToken)) {
    $env:ALTEA_WB_PROMOTION_TOKEN = $userWbPromotionToken
  }
}

$wbAdsArguments = @(
  "scripts/portal-wb-ads-sync.js",
  "sync",
  "--input-dir",
  $resolvedOutputDir,
  "--base-data-dir",
  "data",
  "--output-dir",
  $resolvedOutputDir,
  "--mirror-local-fallback"
)

if ($wbAdsDryRunFlag) {
  $wbAdsArguments += $wbAdsDryRunFlag
}

Write-Output "[sync] WB ads build phase started"
$wbAdsRefreshSucceeded = $false
try {
  Invoke-NodeStep -StepName "WB ads build" -Arguments $wbAdsArguments -Attempts 2 -RetryDelaySeconds 60
  $wbAdsRefreshSucceeded = $true
  Write-Output "[sync] WB ads build phase completed"
} catch {
  Write-Warning "[sync] WB ads build failed, but the portal sync will continue so price/repricer/order layers can still be uploaded: $($_.Exception.Message)"
}

$iuDrrArguments = @(
  "scripts/build-iu-drr-summary.js",
  "--input-dir",
  $resolvedOutputDir,
  "--base-data-dir",
  "data",
  "--output-dir",
  $resolvedOutputDir,
  "--mirror-local-fallback"
)

if ($DryRun) {
  $iuDrrArguments += "--dry-run"
}

Write-Output "[sync] IU/DRR summary build phase started"
$iuDrrRefreshSucceeded = $false
try {
  Invoke-NodeStep -StepName "IU/DRR summary build" -Arguments $iuDrrArguments -Attempts 2 -RetryDelaySeconds 30
  $iuDrrRefreshSucceeded = $true
  Write-Output "[sync] IU/DRR summary build phase completed"
} catch {
  Write-Warning "[sync] IU/DRR summary build failed, but the portal sync will continue with the last usable summary if present: $($_.Exception.Message)"
}

if ([string]::IsNullOrWhiteSpace($env:ALTEA_WB_FEEDBACKS_TOKEN)) {
  $userWbFeedbacksToken = [Environment]::GetEnvironmentVariable("ALTEA_WB_FEEDBACKS_TOKEN", "User")
  if ([string]::IsNullOrWhiteSpace($userWbFeedbacksToken)) {
    $userWbFeedbacksToken = [Environment]::GetEnvironmentVariable("ALTEA_WB_API_TOKEN", "User")
  }
  if (-not [string]::IsNullOrWhiteSpace($userWbFeedbacksToken)) {
    $env:ALTEA_WB_FEEDBACKS_TOKEN = $userWbFeedbacksToken
  }
}

$wbFeedbackArguments = @(
  "scripts/portal-wb-feedback-sync.js",
  "sync",
  "--input-dir",
  $resolvedOutputDir,
  "--base-data-dir",
  "data",
  "--output-dir",
  $resolvedOutputDir,
  "--mirror-local-fallback"
)

Write-Output "[sync] WB feedbacks/questions sync started"
$wbFeedbackRefreshSucceeded = $false
try {
  Invoke-NodeStep -StepName "WB feedbacks/questions sync" -Arguments $wbFeedbackArguments -Attempts 2 -RetryDelaySeconds 60
  $wbFeedbackRefreshSucceeded = $true
  Write-Output "[sync] WB feedbacks/questions sync completed"
} catch {
  Write-Warning "[sync] WB feedbacks/questions sync failed, but the portal sync will continue with the last usable feedback layer if present: $($_.Exception.Message)"
}

if ($wbFeedbackRefreshSucceeded) {
  Write-Output "[sync] IU/DRR summary rebuild with WB feedbacks started"
  try {
    Invoke-NodeStep -StepName "IU/DRR summary rebuild with WB feedbacks" -Arguments $iuDrrArguments -Attempts 2 -RetryDelaySeconds 30
    $iuDrrRefreshSucceeded = $true
    Write-Output "[sync] IU/DRR summary rebuild with WB feedbacks completed"
  } catch {
    Write-Warning "[sync] IU/DRR summary rebuild with WB feedbacks failed, but the portal sync will continue with the last usable summary if present: $($_.Exception.Message)"
  }
} else {
  Write-Warning "[sync] IU/DRR summary rebuild with WB feedbacks skipped because WB feedbacks/questions sync did not refresh."
}

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

$snapshotNames = @(
  "dashboard",
  "skus",
  "platform_trends",
  "ads_summary",
  "iu_plan",
  "warehouse_stock_overlay",
  "loyalty_system",
  "product_leaderboard",
  "product_leaderboard_history",
  "order_procurement",
  "order_procurement_wb",
  "order_procurement_ozon"
)

if ($priceRefreshSucceeded) {
  $snapshotNames += @("prices", "repricer", "smart_price_overlay")
}

foreach ($optionalSnapshot in @("iu_drr_summary", "wb_feedbacks_summary")) {
  if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir ($optionalSnapshot + ".json"))) {
    $snapshotNames += $optionalSnapshot
  } else {
    Write-Warning "[sync] optional snapshot $optionalSnapshot is absent and will not be uploaded."
  }
}

$snapshotList = ($snapshotNames | Select-Object -Unique) -join ","

Invoke-NodeStep -StepName "dashboard/skus/platform_trends upload" -Arguments @(
  "scripts/portal-google-sheet-upload.js",
  "--input-dir",
  $resolvedOutputDir,
  "--snapshot",
  $snapshotList
)

Invoke-NodeStep -StepName "logistics upload" -Arguments @(
  "scripts/portal-google-sheet-logistics-upload.js",
  "--input-dir",
  $resolvedOutputDir
) -Attempts 3 -RetryDelaySeconds 30

Write-Output "[sync] full portal sync completed"
