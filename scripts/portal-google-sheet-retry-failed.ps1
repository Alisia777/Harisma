param(
  [Parameter(Mandatory = $true)]
  [string]$Manifest,
  [string]$LogDir = "",
  [string]$TaskName = "",
  [string]$LiveHealthUrl = "https://xn--80aocfomk2b.xn--p1ai/data/portal_sync_health.json"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
$nodeExe = (Get-Command node -ErrorAction Stop).Source

$resolvedLogDir = if ($LogDir) { $LogDir } else { Join-Path $repoRoot ".altea-google-sheet-sync-output" }
New-Item -ItemType Directory -Path $resolvedLogDir -Force | Out-Null
$logStamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = Join-Path $resolvedLogDir "failed-step-retry-$logStamp.log"

function Write-LogLine {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  $line | Tee-Object -FilePath $logFile -Append
}

function Stop-ProcessTree {
  param([int]$ProcessId)

  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue
  foreach ($child in @($children)) {
    Stop-ProcessTree -ProcessId $child.ProcessId
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function ConvertTo-ProcessArgumentList {
  param([string[]]$Arguments)

  return (($Arguments | ForEach-Object {
    $value = [string]$_
    if ($value -match '[\s"]') {
      '"' + ($value -replace '"', '\"') + '"'
    } else {
      $value
    }
  }) -join " ")
}

function Invoke-NodeStep {
  param(
    [Parameter(Mandatory = $true)]
    [string]$StepName,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [int]$Attempts = 1,
    [int]$RetryDelaySeconds = 60,
    [int]$TimeoutSeconds = 1800,
    [switch]$StreamOutput
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    Write-LogLine "[retry] $StepName attempt $attempt/$Attempts"
    if ($StreamOutput) {
      $global:LASTEXITCODE = 0
      & $nodeExe @Arguments 2>&1 | ForEach-Object {
        Write-LogLine ([string]$_)
      }
      $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
      if ($exitCode -eq 0) {
        return
      }
      if ($attempt -ge $Attempts) {
        throw "$StepName failed with exit code $exitCode"
      }
      Write-LogLine "[retry] $StepName failed with exit code $exitCode. Retrying in $RetryDelaySeconds sec."
      Start-Sleep -Seconds $RetryDelaySeconds
      continue
    }

    $tempStdout = [System.IO.Path]::GetTempFileName()
    $tempStderr = [System.IO.Path]::GetTempFileName()
    try {
      $processArguments = ConvertTo-ProcessArgumentList -Arguments $Arguments
      $process = Start-Process -FilePath $nodeExe -ArgumentList $processArguments -NoNewWindow -PassThru -RedirectStandardOutput $tempStdout -RedirectStandardError $tempStderr
      if ($TimeoutSeconds -gt 0) {
        $timeoutMs = [int][Math]::Min([int]::MaxValue, [double]$TimeoutSeconds * 1000)
        $exited = $process.WaitForExit($timeoutMs)
        if (-not $exited) {
          Write-LogLine "[retry] $StepName exceeded timeout ${TimeoutSeconds}s; stopping process tree $($process.Id)."
          Stop-ProcessTree -ProcessId $process.Id
          $process.WaitForExit()
          $exitCode = 124
        } else {
          $exitCode = if ($null -eq $process.ExitCode) { 0 } else { $process.ExitCode }
        }
      } else {
        $process.WaitForExit()
        $exitCode = if ($null -eq $process.ExitCode) { 0 } else { $process.ExitCode }
      }
      if (Test-Path -LiteralPath $tempStdout) {
        Get-Content -LiteralPath $tempStdout -ErrorAction SilentlyContinue | ForEach-Object { Write-LogLine $_ }
      }
      if (Test-Path -LiteralPath $tempStderr) {
        Get-Content -LiteralPath $tempStderr -ErrorAction SilentlyContinue | ForEach-Object { Write-LogLine $_ }
      }
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
    Write-LogLine "[retry] $StepName failed with exit code $exitCode. Retrying in $RetryDelaySeconds sec."
    Start-Sleep -Seconds $RetryDelaySeconds
  }
}

function Invoke-PowerShellStep {
  param(
    [Parameter(Mandatory = $true)]
    [string]$StepName,
    [Parameter(Mandatory = $true)]
    [string]$ScriptPath,
    [hashtable]$Parameters = @{}
  )

  Write-LogLine "[retry] $StepName started"
  $global:LASTEXITCODE = 0
  & $ScriptPath @Parameters 2>&1 | ForEach-Object { Write-LogLine ([string]$_) }
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  if ($exitCode -ne 0) {
    throw "$StepName failed with exit code $exitCode"
  }
  Write-LogLine "[retry] $StepName completed"
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

function Resolve-RetryPath {
  param([string]$PathValue, [string]$DefaultValue)
  if ([string]::IsNullOrWhiteSpace($PathValue) -and [string]::IsNullOrWhiteSpace($DefaultValue)) {
    return ""
  }
  $value = if ([string]::IsNullOrWhiteSpace($PathValue)) { $DefaultValue } else { $PathValue }
  if ([System.IO.Path]::IsPathRooted($value)) {
    return $value
  }
  return Join-Path $repoRoot $value
}

function Resolve-DateOnly {
  param([string]$Value, [datetime]$Fallback)

  if (-not [string]::IsNullOrWhiteSpace($Value)) {
    return ([datetime]::ParseExact($Value, "yyyy-MM-dd", [System.Globalization.CultureInfo]::InvariantCulture)).Date
  }
  return $Fallback.Date
}

function Format-DateOnly {
  param([datetime]$Value)
  return $Value.ToString("yyyy-MM-dd")
}

function Resolve-HistoryStartDate {
  param([string]$TargetDate)

  $targetDateObject = Resolve-DateOnly -Value $TargetDate -Fallback ((Get-Date).Date.AddDays(-1))
  $historyValue = [Environment]::GetEnvironmentVariable("ALTEA_PORTAL_HISTORY_FROM", "Process")
  if ([string]::IsNullOrWhiteSpace($historyValue)) {
    $historyValue = [Environment]::GetEnvironmentVariable("ALTEA_PORTAL_HISTORY_FROM", "User")
  }
  if ([string]::IsNullOrWhiteSpace($historyValue)) {
    $historyValue = [Environment]::GetEnvironmentVariable("ALTEA_PORTAL_API_WINDOW_FROM", "Process")
  }
  if ([string]::IsNullOrWhiteSpace($historyValue)) {
    $historyValue = [Environment]::GetEnvironmentVariable("ALTEA_PORTAL_API_WINDOW_FROM", "User")
  }
  if ([string]::IsNullOrWhiteSpace($historyValue)) {
    $historyValue = "2026-05-01"
  }

  $monthStartFallback = (Get-Date -Year $targetDateObject.Year -Month $targetDateObject.Month -Day 1).Date
  $historyStartDate = Resolve-DateOnly -Value $historyValue -Fallback $monthStartFallback
  if ($historyStartDate -gt $targetDateObject) {
    return Format-DateOnly $monthStartFallback
  }
  return Format-DateOnly $historyStartDate
}

function Copy-IfExists {
  param([string]$SourcePath, [string]$DestinationPath)
  if (Test-Path -LiteralPath $SourcePath) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $DestinationPath) -Force | Out-Null
    Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
  }
}

function Copy-DataFilesToOutput {
  param([string[]]$FileNames)
  foreach ($fileName in $FileNames) {
    Copy-IfExists -SourcePath (Join-Path "data" $fileName) -DestinationPath (Join-Path $resolvedOutputDir $fileName)
  }
}

function Invoke-Upload {
  param([string[]]$Snapshots)
  $existing = @()
  foreach ($snapshot in ($Snapshots | Select-Object -Unique)) {
    if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir ($snapshot + ".json"))) {
      $existing += $snapshot
    } else {
      Write-LogLine "[retry] upload skipped for missing snapshot: $snapshot"
    }
  }
  if (-not $existing.Count) {
    return
  }
  Invoke-NodeStep -StepName "upload $($existing -join ',')" -Arguments @(
    "scripts/portal-google-sheet-upload.js",
    "--input-dir",
    $resolvedOutputDir,
    "--snapshot",
    ($existing -join ",")
  ) -Attempts 2 -RetryDelaySeconds 30 -TimeoutSeconds 1800
}

function Invoke-GoogleSheetBuild {
  $arguments = @(
    "scripts/portal-google-sheet-sync.js",
    "sync",
    "--dry-run",
    "--output-dir",
    $resolvedOutputDir,
    "--mirror-local-fallback"
  )
  if (-not [string]::IsNullOrWhiteSpace($profileDir)) {
    $arguments += "--profile-dir"
    $arguments += $profileDir
  }
  Invoke-NodeStep -StepName "Google sheet data retry build" -Arguments $arguments -Attempts 2 -RetryDelaySeconds 30 -TimeoutSeconds 1800
}

function Invoke-HealthRefresh {
  param([switch]$MarkLastGood)
  $arguments = @(
    "scripts/portal-sync-health.js",
    "--input-dir",
    $resolvedOutputDir,
    "--base-data-dir",
    "data",
    "--output-dir",
    $resolvedOutputDir,
    "--mirror-local-fallback"
  )
  if ($MarkLastGood) {
    $arguments += "--mark-last-good"
  }
  Invoke-NodeStep -StepName "sync health retry build" -Arguments $arguments -Attempts 1 -RetryDelaySeconds 10 -TimeoutSeconds 900
}

function Invoke-SkuMatrixBuild {
  Invoke-NodeStep -StepName "SKU matrix retry build" -Arguments @(
    "scripts/build-sku-matrix-layer.js",
    "--input-dir",
    $resolvedOutputDir,
    "--base-data-dir",
    "data",
    "--output-dir",
    $resolvedOutputDir,
    "--mirror-local-fallback"
  ) -Attempts 2 -RetryDelaySeconds 20 -TimeoutSeconds 900
}

function Invoke-LayerAudit {
  Invoke-NodeStep -StepName "portal layer retry audit" -Arguments @(
    "scripts/portal-layer-audit.js",
    "--input-dir",
    $resolvedOutputDir,
    "--base-data-dir",
    "data",
    "--output-dir",
    $resolvedOutputDir,
    "--manifest",
    "scripts/portal-layer-manifest.json",
    "--mirror-local-fallback"
  ) -Attempts 1 -RetryDelaySeconds 10 -TimeoutSeconds 900
}

function Invoke-DailyGuard {
  $arguments = @(
    "scripts/portal-daily-layer-guard.js",
    "--input-dir",
    $resolvedOutputDir,
    "--base-data-dir",
    "data",
    "--output-dir",
    $resolvedOutputDir,
    "--sync-issues",
    (Join-Path $resolvedOutputDir "portal_sync_issues.json"),
    "--mirror-local-fallback",
    "--no-fail"
  )
  if (-not [string]::IsNullOrWhiteSpace($script:expectedDate)) {
    $arguments += "--expected-date"
    $arguments += $script:expectedDate
  }
  Invoke-NodeStep -StepName "daily layer retry guard" -Arguments $arguments -Attempts 1 -RetryDelaySeconds 10 -TimeoutSeconds 900
}

function Invoke-IuDrrBuild {
  Invoke-NodeStep -StepName "IU/DRR retry build" -Arguments @(
    "scripts/build-iu-drr-summary.js",
    "--input-dir",
    $resolvedOutputDir,
    "--base-data-dir",
    "data",
    "--output-dir",
    $resolvedOutputDir,
    "--mirror-local-fallback"
  ) -Attempts 2 -RetryDelaySeconds 30 -TimeoutSeconds 1800
  Invoke-NodeStep -StepName "plan truth retry audit" -Arguments @(
    "scripts/audit-plan-truth.js",
    "--input-dir",
    $resolvedOutputDir,
    "--base-data-dir",
    "data"
  ) -Attempts 1 -RetryDelaySeconds 10 -TimeoutSeconds 900
}

function Invoke-OzonFeedbacksSync {
  $targetDate = if (-not [string]::IsNullOrWhiteSpace($script:expectedDate)) {
    $script:expectedDate
  } else {
    (Get-Date).Date.AddDays(-1).ToString("yyyy-MM-dd")
  }
  Invoke-NodeStep -StepName "Ozon feedbacks/questions retry sync" -Arguments @(
    "scripts/portal-ozon-feedback-sync.js",
    "--output-dir",
    $resolvedOutputDir,
    "--date-to",
    $targetDate
  ) -Attempts 2 -RetryDelaySeconds 60 -TimeoutSeconds 1200
  Copy-IfExists -SourcePath (Join-Path $resolvedOutputDir "ozon_feedbacks_summary.json") -DestinationPath (Join-Path "data" "ozon_feedbacks_summary.json")
}

function Invoke-WbSalesFunnelBuild {
  Invoke-NodeStep -StepName "WB sales funnel retry build" -Arguments @(
    "scripts/build-wb-sales-funnel-from-platform-trends.js",
    "--output-dir",
    $resolvedOutputDir,
    "--base-data-dir",
    "data",
    "--mirror-local-fallback"
  ) -Attempts 2 -RetryDelaySeconds 20 -TimeoutSeconds 900
}

function Invoke-OzonAdsFinanceBuild {
  $adsSummaryPath = Join-Path $resolvedOutputDir "ads_summary.json"
  $arguments = @(
    "scripts/portal-ozon-ads-finance-sync.js",
    "sync",
    "--input-file",
    $adsSummaryPath,
    "--output-file",
    $adsSummaryPath,
    "--mirror-file",
    (Join-Path "data" "ads_summary.json")
  )

  try {
    if (Test-Path -LiteralPath $adsSummaryPath) {
      $adsSummary = Get-Content -LiteralPath $adsSummaryPath -Raw | ConvertFrom-Json
      $to = [string]$adsSummary.window.to
      if ([string]::IsNullOrWhiteSpace($to)) {
        $to = [string]$adsSummary.asOfDate
      }
      if (-not [string]::IsNullOrWhiteSpace($to)) {
        $toDate = [datetime]::ParseExact($to, "yyyy-MM-dd", [System.Globalization.CultureInfo]::InvariantCulture)
        $from = (Get-Date -Year $toDate.Year -Month $toDate.Month -Day 1).ToString("yyyy-MM-dd")
        $arguments += "--from"
        $arguments += $from
        $arguments += "--to"
        $arguments += $to
      }
    }
  } catch {
    Write-LogLine "[retry] Ozon ads finance retry will use ads_summary window defaults: $($_.Exception.Message)"
  }

  Invoke-NodeStep -StepName "Ozon ads finance retry refresh" -Arguments $arguments -Attempts 2 -RetryDelaySeconds 60 -TimeoutSeconds 900
}

function Invoke-StaticDataPublish {
  Invoke-PowerShellStep -StepName "static data retry publish" -ScriptPath (Join-Path $PSScriptRoot "portal-static-data-publish.ps1") -Parameters @{
    SourceDir = $resolvedOutputDir
    DeployDir = ".codex-rollout-main"
    LiveHealthUrl = $LiveHealthUrl
    LiveVerifyAttempts = 5
    LiveVerifyDelaySeconds = 30
  }
}

function Invoke-RetryStep {
  param([string]$StepId)

  switch ($StepId) {
    "full-sync" {
      $parameters = @{ LiveHealthUrl = $LiveHealthUrl }
      if (-not [string]::IsNullOrWhiteSpace($profileDir)) {
        $parameters.ProfileDir = $profileDir
      }
      Invoke-PowerShellStep -StepName "full portal sync retry" -ScriptPath (Join-Path $PSScriptRoot "portal-google-sheet-sync.ps1") -Parameters $parameters
    }
    "sku-alias-snapshots" {
      Invoke-NodeStep -StepName "shared SKU alias snapshots retry" -Arguments @(
        "scripts/portal-snapshot-pull.js",
        "--output-dir",
        "data",
        "--snapshot",
        "sku_aliases,sku_alias_ignore,sku_alias_audit"
      ) -Attempts 2 -RetryDelaySeconds 30
      Copy-DataFilesToOutput @("sku_aliases.json", "sku_alias_ignore.json", "sku_alias_audit.json")
      Invoke-SkuMatrixBuild
      Invoke-Upload @("sku_aliases", "sku_alias_ignore", "sku_alias_audit", "sku_matrix")
    }
    "yandex-market" {
      $targetDate = if (-not [string]::IsNullOrWhiteSpace($script:expectedDate)) {
        $script:expectedDate
      } else {
        (Get-Date).Date.AddDays(-1).ToString("yyyy-MM-dd")
      }
      $historyStart = Resolve-HistoryStartDate -TargetDate $targetDate
      Invoke-NodeStep -StepName "Yandex Market analytics retry" -Arguments @(
        "scripts/portal-yandex-market-trends-sync.js",
        "sync",
        "--from",
        $historyStart,
        "--to",
        $targetDate,
        "--input-file",
        (Join-Path "data" "platform_trends.json"),
        "--output-file",
        (Join-Path "data" "platform_trends.json"),
        "--rate-limit-attempts",
        "4",
        "--rate-limit-extra-delay-ms",
        "30000"
      ) -Attempts 1 -RetryDelaySeconds 20 -TimeoutSeconds 2700 -StreamOutput
      Copy-DataFilesToOutput @("platform_trends.json")
      Invoke-GoogleSheetBuild
      Invoke-Upload @("dashboard", "platform_trends")
    }
    "extra-marketplace-merge" {
      Invoke-NodeStep -StepName "extra marketplace retry merge" -Arguments @(
        "scripts/portal-extra-marketplace-trends-sync.js",
        "sync",
        "--workbook",
        "exports/altea_max_funnel_2025_2026.xlsx",
        "--output-dir",
        $resolvedOutputDir,
        "--mirror-local-fallback"
      ) -Attempts 2 -RetryDelaySeconds 30 -TimeoutSeconds 1800
      Invoke-GoogleSheetBuild
      Invoke-Upload @("dashboard", "platform_trends", "ads_summary", "smart_price_overlay")
    }
    "wb-owner-distribution" {
      Invoke-NodeStep -StepName "WB owner distribution retry" -Arguments @(
        "scripts/import-wb-owner-distribution.js",
        "--input-dir",
        $resolvedOutputDir,
        "--base-data-dir",
        "data",
        "--output-dir",
        $resolvedOutputDir,
        "--mirror-local-fallback"
      ) -Attempts 1 -RetryDelaySeconds 10 -TimeoutSeconds 900
      Invoke-SkuMatrixBuild
      Invoke-Upload @("skus", "wb_owner_distribution_audit", "sku_matrix")
    }
    "smart-price" {
      $arguments = @(
        "scripts/portal-smart-price-overlay-sync.js",
        "sync",
        "--output-dir",
        $resolvedOutputDir,
        "--dry-run"
      )
      if (-not [string]::IsNullOrWhiteSpace($profileDir)) {
        $arguments += "--profile-dir"
        $arguments += $profileDir
      }
      Invoke-NodeStep -StepName "smart price retry build" -Arguments $arguments -Attempts 2 -RetryDelaySeconds 30 -TimeoutSeconds 1800
      Copy-DataFilesToOutput @("prices.json", "repricer.json", "smart_price_overlay.json", "smart_price_workbench.json", "price_workbench_support.json")
      Invoke-Upload @("prices", "repricer", "smart_price_overlay", "smart_price_workbench", "price_workbench_support")
    }
    "oos-control" {
      Invoke-NodeStep -StepName "OOS control retry build" -Arguments @(
        "scripts/build-oos-control-layer.js",
        "--input-dir",
        $resolvedOutputDir,
        "--base-data-dir",
        "data",
        "--output-dir",
        $resolvedOutputDir,
        "--mirror-local-fallback"
      ) -Attempts 2 -RetryDelaySeconds 20 -TimeoutSeconds 900
      Invoke-Upload @("oos_control")
    }
    "product-leaderboard" {
      $kzParams = @{
        OutputDir = $resolvedOutputDir
        AllowStaleWeek = $true
        DryRun = $true
      }
      if (-not [string]::IsNullOrWhiteSpace($profileDir)) {
        $kzParams.ProfileDir = $profileDir
      }
      Invoke-PowerShellStep -StepName "product leaderboard retry sync" -ScriptPath (Join-Path $PSScriptRoot "portal-kz-product-leaderboard-sync.ps1") -Parameters $kzParams
      Invoke-NodeStep -StepName "product leaderboard history retry build" -Arguments @("scripts/build-product-leaderboard-history.js") -Attempts 2 -RetryDelaySeconds 20 -TimeoutSeconds 900
      Copy-DataFilesToOutput @("product_leaderboard_history.json")
      Invoke-Upload @("product_leaderboard", "product_leaderboard_history")
    }
    "wb-ads" {
      Invoke-NodeStep -StepName "WB ads retry build" -Arguments @(
        "scripts/portal-wb-ads-sync.js",
        "sync",
        "--input-dir",
        $resolvedOutputDir,
        "--base-data-dir",
        "data",
        "--output-dir",
        $resolvedOutputDir,
        "--mirror-local-fallback",
        "--skip-campaign-details"
      ) -Attempts 1 -RetryDelaySeconds 60 -TimeoutSeconds 2700
      Invoke-OzonAdsFinanceBuild
      Invoke-Upload @("ads_summary")
      Invoke-IuDrrBuild
      Invoke-Upload @("iu_drr_summary")
    }
    "ozon-ads-finance" {
      Invoke-OzonAdsFinanceBuild
      Invoke-Upload @("ads_summary")
      Invoke-IuDrrBuild
      Invoke-Upload @("iu_drr_summary")
    }
    "ozon-feedbacks" {
      Invoke-OzonFeedbacksSync
      Invoke-Upload @("ozon_feedbacks_summary")
    }
    "iu-drr" {
      Invoke-IuDrrBuild
      Invoke-Upload @("iu_drr_summary")
    }
    "iu-drr-with-feedbacks" {
      Invoke-IuDrrBuild
      Invoke-Upload @("iu_drr_summary")
    }
    "wb-feedbacks" {
      Invoke-NodeStep -StepName "WB feedbacks/questions retry sync" -Arguments @(
        "scripts/portal-wb-feedback-sync.js",
        "sync",
        "--input-dir",
        $resolvedOutputDir,
        "--base-data-dir",
        "data",
        "--output-dir",
        $resolvedOutputDir,
        "--mirror-local-fallback"
      ) -Attempts 2 -RetryDelaySeconds 60 -TimeoutSeconds 1800
      Invoke-IuDrrBuild
      Invoke-WbSalesFunnelBuild
      Invoke-Upload @("wb_feedbacks_summary", "iu_drr_summary", "wb_sales_funnel_report")
    }
    "wb-sales-funnel" {
      Invoke-WbSalesFunnelBuild
      Invoke-Upload @("wb_sales_funnel_report")
    }
    "data-quality" {
      Invoke-NodeStep -StepName "data quality retry build" -Arguments @(
        "scripts/build-portal-data-quality-report.js",
        "--input-dir",
        $resolvedOutputDir,
        "--base-data-dir",
        "data",
        "--output-dir",
        $resolvedOutputDir,
        "--mirror-local-fallback"
      ) -Attempts 2 -RetryDelaySeconds 20 -TimeoutSeconds 900
      Invoke-Upload @("portal_data_quality", "portal_data_quarantine")
    }
    "sku-matrix" {
      Invoke-SkuMatrixBuild
      Invoke-Upload @("sku_matrix")
    }
    "static-data-publish" {
      Invoke-LayerAudit
      Invoke-StaticDataPublish
    }
    default {
      throw "Unsupported retry step id: $StepId"
    }
  }
}

try {
  if (-not (Test-Path -LiteralPath $Manifest)) {
    throw "Retry manifest not found: $Manifest"
  }

  $manifestPayload = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
  $resolvedOutputDir = Resolve-RetryPath -PathValue ([string]$manifestPayload.outputDir) -DefaultValue ".altea-google-sheet-sync-output"
  $profileDir = Resolve-RetryPath -PathValue ([string]$manifestPayload.profileDir) -DefaultValue ""
  if ([string]::IsNullOrWhiteSpace($profileDir) -or -not (Test-Path -LiteralPath $profileDir)) {
    $profileDir = ""
  }
  New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null

  foreach ($envName in @(
    "ALTEA_WB_API_TOKEN",
    "ALTEA_WB_PROMOTION_TOKEN",
    "ALTEA_WB_FEEDBACKS_TOKEN",
    "ALTEA_OZON_CLIENT_ID",
    "ALTEA_OZON_API_KEY",
    "ALTEA_YM_API_KEY",
    "ALTEA_YM_CAMPAIGN_ID",
    "ALTEA_YM_BUSINESS_ID",
    "ALTEA_LETUAL_API_TOKEN",
    "ALTEA_LETUAL_API_BASE_URL",
    "ALTEA_LETUAL_SALES_PATH",
    "ALTEA_LETUAL_CLIENT_ID",
    "ALTEA_LETUAL_LOCAL_EXPORT_XLSX",
    "ALTEA_LETUAL_PLAN_XLSX",
    "ALTEA_MEGAMARKET_API_TOKEN",
    "ALTEA_MEGAMARKET_API_KEY",
    "ALTEA_MEGAMARKET_API_BASE_URL",
    "ALTEA_MEGAMARKET_SALES_PATH",
    "ALTEA_MEGAMARKET_CLIENT_ID",
    "ALTEA_MEGAMARKET_API_METHOD",
    "ALTEA_MEGAMARKET_API_BODY_JSON",
    "ALTEA_MEGAMARKET_GRAPHQL_QUERY",
    "ALTEA_SAMOKAT_API_TOKEN",
    "ALTEA_SAMOKAT_API_KEY",
    "ALTEA_SAMOKAT_API_BASE_URL",
    "ALTEA_SAMOKAT_SALES_PATH",
    "ALTEA_SAMOKAT_CLIENT_ID",
    "ALTEA_SAMOKAT_API_METHOD",
    "ALTEA_SAMOKAT_API_BODY_JSON",
    "ALTEA_SAMOKAT_GRAPHQL_QUERY"
  )) {
    Set-ProcessEnvFallback -Name $envName
  }
  Set-ProcessEnvFallback -Name "ALTEA_ZYA_SALES_ZIP" (Join-Path $env:LOCALAPPDATA "Temp\zya_sales.zip")
  Set-ProcessEnvFallback -Name "ALTEA_ZYA_ADS_XLSX" (Join-Path $env:LOCALAPPDATA "Temp\zya_ads.xlsx")
  Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_SALES_CSV" (Join-Path $env:LOCALAPPDATA "Temp\magnit_sales.csv")
  Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_SERVICES_CSV" (Join-Path $env:LOCALAPPDATA "Temp\magnit_services.csv")

  if ([string]::IsNullOrWhiteSpace($env:ALTEA_WB_PROMOTION_TOKEN) -and -not [string]::IsNullOrWhiteSpace($env:ALTEA_WB_API_TOKEN)) {
    $env:ALTEA_WB_PROMOTION_TOKEN = $env:ALTEA_WB_API_TOKEN
  }
  if ([string]::IsNullOrWhiteSpace($env:ALTEA_WB_FEEDBACKS_TOKEN) -and -not [string]::IsNullOrWhiteSpace($env:ALTEA_WB_API_TOKEN)) {
    $env:ALTEA_WB_FEEDBACKS_TOKEN = $env:ALTEA_WB_API_TOKEN
  }

  $steps = @($manifestPayload.steps | ForEach-Object { [string]$_.id } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
  Write-LogLine "[retry] manifest: $Manifest"
  Write-LogLine "[retry] output dir: $resolvedOutputDir"
  Write-LogLine "[retry] steps: $($steps -join ', ')"

  $failed = @()
  foreach ($stepId in $steps) {
    try {
      Write-LogLine "[retry] step started: $stepId"
      Invoke-RetryStep -StepId $stepId
      Write-LogLine "[retry] step completed: $stepId"
    } catch {
      $failed += [ordered]@{
        id = $stepId
        message = [string]$_.Exception.Message
      }
      Write-LogLine "[retry] step failed: ${stepId}: $($_.Exception.Message)"
    }
  }

  try {
    Invoke-HealthRefresh -MarkLastGood
    Invoke-LayerAudit
    Invoke-DailyGuard
    Invoke-Upload @("portal_sync_health", "portal_layer_freshness", "portal_daily_guard")
    Invoke-StaticDataPublish
  } catch {
    $failed += [ordered]@{
      id = "portal-sync-health-or-static-publish"
      message = [string]$_.Exception.Message
    }
    Write-LogLine "[retry] health/upload/static publish failed: $($_.Exception.Message)"
  }

  $resultPath = [System.IO.Path]::ChangeExtension($Manifest, ".result.json")
  $result = [ordered]@{
    schema = "portal-failed-step-retry-result-v1"
    generatedAt = (Get-Date).ToString("o")
    manifest = $Manifest
    logFile = $logFile
    requestedSteps = $steps
    ok = ($failed.Count -eq 0)
    failed = $failed
  }
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resultPath -Encoding UTF8

  if ($failed.Count -gt 0) {
    Write-LogLine "[retry] completed with failures: $($failed.Count)"
    exit 1
  }

  Write-LogLine "[retry] completed successfully"
  exit 0
} finally {
  if (-not [string]::IsNullOrWhiteSpace($TaskName)) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  }
}
