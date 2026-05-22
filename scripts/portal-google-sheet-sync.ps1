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
$script:syncLockPath = Join-Path $repoRoot ".portal-google-sheet-sync.lock"
$script:syncLockAcquired = $false

function Remove-SyncLock {
  if ($script:syncLockAcquired -and (Test-Path -LiteralPath $script:syncLockPath)) {
    Remove-Item -LiteralPath $script:syncLockPath -Force -ErrorAction SilentlyContinue
  }
  $script:syncLockAcquired = $false
}

function Acquire-SyncLock {
  if (Test-Path -LiteralPath $script:syncLockPath) {
    $lockItem = Get-Item -LiteralPath $script:syncLockPath -ErrorAction SilentlyContinue
    $lockAgeHours = if ($lockItem) { ((Get-Date) - $lockItem.LastWriteTime).TotalHours } else { 0 }
    $lockText = Get-Content -LiteralPath $script:syncLockPath -Raw -ErrorAction SilentlyContinue
    $lockPayload = $null
    try {
      if (-not [string]::IsNullOrWhiteSpace($lockText)) {
        $lockPayload = $lockText | ConvertFrom-Json
      }
    } catch {
      $lockPayload = $null
    }

    $lockPid = 0
    if ($lockPayload -and $lockPayload.pid) {
      $lockPid = [int]$lockPayload.pid
    }
    $lockProcess = if ($lockPid -gt 0) { Get-Process -Id $lockPid -ErrorAction SilentlyContinue } else { $null }

    if ($lockItem -and $lockAgeHours -lt 6 -and $lockProcess) {
      throw "[sync] another portal sync seems to be running; lock age $([math]::Round($lockAgeHours, 2))h. $lockText"
    }

    if ($lockItem -and $lockAgeHours -lt 6 -and $lockPid -le 0) {
      throw "[sync] portal sync lock exists but does not contain a process id; lock age $([math]::Round($lockAgeHours, 2))h. $lockText"
    }

    if ($lockPid -gt 0 -and -not $lockProcess) {
      Write-Warning "[sync] dead lock removed for exited process ${lockPid}: $script:syncLockPath"
    } else {
      Write-Warning "[sync] stale lock removed: $script:syncLockPath"
    }
    Remove-Item -LiteralPath $script:syncLockPath -Force -ErrorAction SilentlyContinue
  }

  $lockPayload = [ordered]@{
    pid = $PID
    startedAt = (Get-Date).ToString("o")
    machine = $env:COMPUTERNAME
    cwd = $repoRoot
  } | ConvertTo-Json -Compress
  Set-Content -LiteralPath $script:syncLockPath -Value $lockPayload -Encoding UTF8
  $script:syncLockAcquired = $true
}

trap {
  Remove-SyncLock
  throw $_
}

Acquire-SyncLock

function Stop-ProcessTree {
  param([int]$ProcessId)

  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue
  foreach ($child in @($children)) {
    Stop-ProcessTree -ProcessId $child.ProcessId
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Invoke-NodeStep {
  param(
    [Parameter(Mandatory = $true)]
    [string]$StepName,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [int]$Attempts = 2,
    [int]$RetryDelaySeconds = 20,
    [int]$TimeoutSeconds = 1800
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    Write-Output "[sync] $StepName attempt $attempt/$Attempts"
    $tempStdout = [System.IO.Path]::GetTempFileName()
    $tempStderr = [System.IO.Path]::GetTempFileName()
    try {
      $process = Start-Process -FilePath $nodeExe -ArgumentList $Arguments -NoNewWindow -PassThru -RedirectStandardOutput $tempStdout -RedirectStandardError $tempStderr
      if ($TimeoutSeconds -gt 0) {
        $timeoutMs = [int][Math]::Min([int]::MaxValue, [double]$TimeoutSeconds * 1000)
        $exited = $process.WaitForExit($timeoutMs)
        if (-not $exited) {
          Write-Warning "[sync] $StepName exceeded timeout ${TimeoutSeconds}s; stopping process tree $($process.Id)."
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
        Get-Content -LiteralPath $tempStdout -ErrorAction SilentlyContinue | ForEach-Object { Write-Output $_ }
      }
      if (Test-Path -LiteralPath $tempStderr) {
        Get-Content -LiteralPath $tempStderr -ErrorAction SilentlyContinue | ForEach-Object { Write-Output $_ }
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
    Write-Output "[sync] $StepName failed with exit code $exitCode. Retrying in $RetryDelaySeconds sec."
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

  Write-Output "[sync] $StepName started"
  $global:LASTEXITCODE = 0
  & $ScriptPath @Parameters 2>&1 | ForEach-Object { Write-Output ([string]$_) }
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  if ($exitCode -ne 0) {
    throw "$StepName failed with exit code $exitCode"
  }
  Write-Output "[sync] $StepName completed"
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
$script:retrySteps = @()

function Add-RetryStep {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Id,
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [string]$Message = ""
  )

  if ($script:retrySteps | Where-Object { $_.id -eq $Id }) {
    return
  }

  $script:retrySteps += [ordered]@{
    id = $Id
    name = $Name
    message = $Message
    failedAt = (Get-Date).ToString("o")
  }
}

function Schedule-FailedStepRetry {
  if ($DryRun -or -not $script:retrySteps.Count) {
    return
  }

  $retryScript = Join-Path $PSScriptRoot "portal-google-sheet-retry-failed.ps1"
  if (-not (Test-Path -LiteralPath $retryScript)) {
    Write-Warning "[sync] failed-step retry script is missing: $retryScript"
    return
  }

  $retryDir = Join-Path $resolvedOutputDir "retry"
  New-Item -ItemType Directory -Path $retryDir -Force | Out-Null
  $runStamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
  $retryAfter = (Get-Date).AddHours(2)
  $manifestPath = Join-Path $retryDir "failed-steps-$runStamp.json"
  $taskName = "Portal Failed Step Retry $runStamp"
  $manifest = [ordered]@{
    schema = "portal-failed-step-retry-v1"
    generatedAt = (Get-Date).ToString("o")
    retryAfter = $retryAfter.ToString("o")
    retryDelayHours = 2
    cwd = $repoRoot
    outputDir = $resolvedOutputDir
    profileDir = $ProfileDir
    inputXlsx = $InputXlsx
    steps = $script:retrySteps
  }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

  $actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$retryScript`" -Manifest `"$manifestPath`" -LogDir `"$resolvedOutputDir`" -TaskName `"$taskName`""
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs -WorkingDirectory $repoRoot
  $trigger = New-ScheduledTaskTrigger -Once -At $retryAfter
  $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType S4U -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 4)

  try {
    $task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "One-shot retry for failed non-blocking portal sync steps."
    Register-ScheduledTask -TaskName $taskName -InputObject $task -Force -ErrorAction Stop | Out-Null
    Write-Output "[sync] scheduled failed-step retry at $($retryAfter.ToString("yyyy-MM-dd HH:mm:ss")): $($script:retrySteps.id -join ', ')"
    return
  } catch {
    Write-Warning "[sync] failed to register scheduled retry task: $($_.Exception.Message)"
  }

  try {
    $delaySeconds = [Math]::Max(60, [int][Math]::Round(($retryAfter - (Get-Date)).TotalSeconds))
    $command = "Start-Sleep -Seconds $delaySeconds; & `"$retryScript`" -Manifest `"$manifestPath`" -LogDir `"$resolvedOutputDir`""
    $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($command))
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded" -WorkingDirectory $repoRoot -WindowStyle Hidden | Out-Null
    Write-Output "[sync] scheduled failed-step retry via background sleeper at $($retryAfter.ToString("yyyy-MM-dd HH:mm:ss")): $($script:retrySteps.id -join ', ')"
  } catch {
    Write-Warning "[sync] failed to start fallback retry sleeper: $($_.Exception.Message)"
    Write-Warning "[sync] failed-step retry manifest was still written: $manifestPath"
  }
}

function Invoke-MinMaxImportIfAvailable {
  param([string]$StageName)

  $minMaxScript = Join-Path $PSScriptRoot "import-repricer-min-max.js"
  $minMaxInputDir = Join-Path (Split-Path -Parent $repoRoot) "Мин Макс"
  if (-not (Test-Path -LiteralPath $minMaxScript)) {
    Write-Warning "[sync] repricer MIN/MAX import skipped ($StageName): script is missing: $minMaxScript"
    return
  }
  if (-not (Test-Path -LiteralPath $minMaxInputDir)) {
    Write-Warning "[sync] repricer MIN/MAX import skipped ($StageName): input dir is missing: $minMaxInputDir"
    return
  }

  Write-Output "[sync] repricer MIN/MAX import ($StageName) started"
  try {
    Invoke-NodeStep -StepName "repricer MIN/MAX import ($StageName)" -Arguments @(
      "scripts/import-repricer-min-max.js",
      "--input-dir",
      $minMaxInputDir,
      "--data-dir",
      "data",
      "--export-dir",
      "exports"
    ) -Attempts 1 -RetryDelaySeconds 10
    Write-Output "[sync] repricer MIN/MAX import ($StageName) completed"
  } catch {
    Add-RetryStep -Id "repricer-minmax-$StageName" -Name "repricer MIN/MAX import ($StageName)" -Message ([string]$_.Exception.Message)
    Write-Warning "[sync] repricer MIN/MAX import ($StageName) failed, continuing with existing price layers: $($_.Exception.Message)"
  }
}

Write-Output "[sync] shared SKU alias snapshots pull started"
try {
  Invoke-NodeStep -StepName "shared SKU alias snapshots pull" -Arguments @(
    "scripts/portal-snapshot-pull.js",
    "--output-dir",
    "data",
    "--snapshot",
    "sku_aliases,sku_alias_ignore,sku_alias_audit"
  ) -Attempts 2 -RetryDelaySeconds 20
  Write-Output "[sync] shared SKU alias snapshots pull completed"
} catch {
  Add-RetryStep -Id "sku-alias-snapshots" -Name "shared SKU alias snapshots pull" -Message ([string]$_.Exception.Message)
  Write-Warning "[sync] shared SKU alias snapshots pull failed, continuing with local data files: $($_.Exception.Message)"
}

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
  Add-RetryStep -Id "yandex-market" -Name "Yandex Market analytics refresh" -Message ([string]$_.Exception.Message)
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
  Add-RetryStep -Id "extra-marketplace-merge" -Name "extra marketplace merge" -Message ([string]$_.Exception.Message)
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

Write-Output "[sync] WB owner distribution import started"
try {
  Invoke-NodeStep -StepName "WB owner distribution import" -Arguments @(
    "scripts/import-wb-owner-distribution.js",
    "--input-dir",
    $resolvedOutputDir,
    "--base-data-dir",
    "data",
    "--output-dir",
    $resolvedOutputDir,
    "--mirror-local-fallback"
  ) -Attempts 1 -RetryDelaySeconds 10
  Write-Output "[sync] WB owner distribution import completed"
} catch {
  Add-RetryStep -Id "wb-owner-distribution" -Name "WB owner distribution import" -Message ([string]$_.Exception.Message)
  Write-Warning "[sync] WB owner distribution import failed, continuing with owners from the main sheet: $($_.Exception.Message)"
}

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

Invoke-MinMaxImportIfAvailable -StageName "pre-price-build"

Write-Output "[sync] smart_price_overlay build phase started"
try {
  Invoke-NodeStep -StepName "smart_price_overlay build" -Arguments $priceArguments -Attempts 2 -RetryDelaySeconds 30
  Write-Output "[sync] smart_price_overlay build phase completed"
  $priceRefreshSucceeded = $true
} catch {
  $priceRefreshSucceeded = $false
  Add-RetryStep -Id "smart-price" -Name "smart_price_overlay build" -Message ([string]$_.Exception.Message)
  Write-Warning "[sync] smart_price_overlay build failed, but the portal sync will continue: $($_.Exception.Message)"
}

if ($priceRefreshSucceeded) {
  Invoke-MinMaxImportIfAvailable -StageName "post-price-build"

  $priceLayerFiles = @(
    "prices.json",
    "repricer.json",
    "smart_price_overlay.json",
    "smart_price_workbench.json",
    "price_workbench_support.json"
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

$oosControlArguments = @(
  "scripts/build-oos-control-layer.js",
  "--input-dir",
  $resolvedOutputDir,
  "--base-data-dir",
  "data",
  "--output-dir",
  $resolvedOutputDir,
  "--mirror-local-fallback"
)

Write-Output "[sync] OOS control build started"
try {
  Invoke-NodeStep -StepName "OOS control build" -Arguments $oosControlArguments -Attempts 2 -RetryDelaySeconds 20
  Write-Output "[sync] OOS control build completed"
} catch {
  Add-RetryStep -Id "oos-control" -Name "OOS control build" -Message ([string]$_.Exception.Message)
  Write-Warning "[sync] OOS control build failed, but the portal sync will continue: $($_.Exception.Message)"
}

$kzSyncScript = Join-Path $PSScriptRoot "portal-kz-product-leaderboard-sync.ps1"
$kzParams = @{
  OutputDir = $resolvedOutputDir
  AllowStaleWeek = $true
}

if ($ProfileDir) {
  $kzParams.ProfileDir = $ProfileDir
}

# Keep the nested KZ step build-only. The full portal upload below publishes
# product_leaderboard and product_leaderboard_history together with the other
# snapshots; uploading the large history here can strand the main sync midway.
$kzParams.DryRun = $true

Write-Output "[sync] product leaderboard sync started"
& $kzSyncScript @kzParams
$kzExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
if ($kzExitCode -ne 0) {
  Add-RetryStep -Id "product-leaderboard" -Name "product leaderboard sync" -Message "exit code $kzExitCode"
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
$platformPlanPath = Join-Path "data" "platform_plan.json"
if (Test-Path -LiteralPath $platformPlanPath) {
  Copy-Item -LiteralPath $platformPlanPath -Destination (Join-Path $resolvedOutputDir "platform_plan.json") -Force
}
Write-Output "[sync] plan layer build phase completed"

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
  Invoke-NodeStep -StepName "WB ads build" -Arguments $wbAdsArguments -Attempts 2 -RetryDelaySeconds 60 -TimeoutSeconds 900
  $wbAdsRefreshSucceeded = $true
  Write-Output "[sync] WB ads build phase completed"
} catch {
  Add-RetryStep -Id "wb-ads" -Name "WB ads build" -Message ([string]$_.Exception.Message)
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
  Add-RetryStep -Id "iu-drr" -Name "IU/DRR summary build" -Message ([string]$_.Exception.Message)
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
  Add-RetryStep -Id "wb-feedbacks" -Name "WB feedbacks/questions sync" -Message ([string]$_.Exception.Message)
  Write-Warning "[sync] WB feedbacks/questions sync failed, but the portal sync will continue with the last usable feedback layer if present: $($_.Exception.Message)"
}

if ($wbFeedbackRefreshSucceeded) {
  Write-Output "[sync] IU/DRR summary rebuild with WB feedbacks started"
  try {
    Invoke-NodeStep -StepName "IU/DRR summary rebuild with WB feedbacks" -Arguments $iuDrrArguments -Attempts 2 -RetryDelaySeconds 30
    $iuDrrRefreshSucceeded = $true
    Write-Output "[sync] IU/DRR summary rebuild with WB feedbacks completed"
  } catch {
    Add-RetryStep -Id "iu-drr-with-feedbacks" -Name "IU/DRR summary rebuild with WB feedbacks" -Message ([string]$_.Exception.Message)
    Write-Warning "[sync] IU/DRR summary rebuild with WB feedbacks failed, but the portal sync will continue with the last usable summary if present: $($_.Exception.Message)"
  }
} else {
  Write-Warning "[sync] IU/DRR summary rebuild with WB feedbacks skipped because WB feedbacks/questions sync did not refresh."
}

$dataQualityArguments = @(
  "scripts/build-portal-data-quality-report.js",
  "--input-dir",
  $resolvedOutputDir,
  "--base-data-dir",
  "data",
  "--output-dir",
  $resolvedOutputDir,
  "--mirror-local-fallback"
)

Write-Output "[sync] data quality report build started"
try {
  Invoke-NodeStep -StepName "data quality report build" -Arguments $dataQualityArguments -Attempts 2 -RetryDelaySeconds 20
  Write-Output "[sync] data quality report build completed"
} catch {
  Add-RetryStep -Id "data-quality" -Name "data quality report build" -Message ([string]$_.Exception.Message)
  Write-Warning "[sync] data quality report build failed, but the portal sync will continue: $($_.Exception.Message)"
}

$skuAliasFiles = @(
  "sku_aliases.json",
  "sku_alias_ignore.json",
  "sku_alias_audit.json"
)
foreach ($fileName in $skuAliasFiles) {
  $sourcePath = Join-Path "data" $fileName
  if (Test-Path -LiteralPath $sourcePath) {
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $resolvedOutputDir $fileName) -Force
  }
}

$skuMatrixArguments = @(
  "scripts/build-sku-matrix-layer.js",
  "--input-dir",
  $resolvedOutputDir,
  "--base-data-dir",
  "data",
  "--output-dir",
  $resolvedOutputDir,
  "--mirror-local-fallback"
)

Write-Output "[sync] SKU matrix build started"
try {
  Invoke-NodeStep -StepName "SKU matrix build" -Arguments $skuMatrixArguments -Attempts 2 -RetryDelaySeconds 20
  Write-Output "[sync] SKU matrix build completed"
} catch {
  Add-RetryStep -Id "sku-matrix" -Name "SKU matrix build" -Message ([string]$_.Exception.Message)
  Write-Warning "[sync] SKU matrix build failed, but the portal sync will continue: $($_.Exception.Message)"
}

$syncHealthArguments = @(
  "scripts/portal-sync-health.js",
  "--input-dir",
  $resolvedOutputDir,
  "--base-data-dir",
  "data",
  "--output-dir",
  $resolvedOutputDir,
  "--mirror-local-fallback"
)

Write-Output "[sync] sync health build started"
Invoke-NodeStep -StepName "sync health build" -Arguments $syncHealthArguments -Attempts 1 -RetryDelaySeconds 10
Write-Output "[sync] sync health build completed"

$layerAuditArguments = @(
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
)

Write-Output "[sync] portal layer audit started"
Invoke-NodeStep -StepName "portal layer audit" -Arguments $layerAuditArguments -Attempts 1 -RetryDelaySeconds 10
Write-Output "[sync] portal layer audit completed"

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

$syncHealthPath = Join-Path $resolvedOutputDir "portal_sync_health.json"
$publishAllowed = $true
$publishBlockReasons = @()
if (Test-Path -LiteralPath $syncHealthPath) {
  $syncHealth = Get-Content -LiteralPath $syncHealthPath -Raw | ConvertFrom-Json
  $publishAllowed = [bool]$syncHealth.publish.allowed
  $publishBlockReasons = @($syncHealth.publish.blockingReasons)
  Write-Output "[sync] health status: $($syncHealth.status); publish allowed: $publishAllowed"
}

$layerAuditPath = Join-Path $resolvedOutputDir "portal_layer_freshness.json"
if (Test-Path -LiteralPath $layerAuditPath) {
  $layerAudit = Get-Content -LiteralPath $layerAuditPath -Raw | ConvertFrom-Json
  $layerPublishAllowed = [bool]$layerAudit.publish.allowed
  if (-not $layerPublishAllowed) {
    $publishAllowed = $false
    $publishBlockReasons += @($layerAudit.publish.blockingReasons)
  }
  Write-Output "[sync] layer audit publish allowed: $layerPublishAllowed"
}

if ($DryRun) {
  Remove-SyncLock
  exit 0
}

if (-not $publishAllowed) {
  Write-Warning "[sync] publish blocked by sync health. Main snapshots and logistics upload will be skipped."
  $publishBlockReasons | ForEach-Object { Write-Warning "[sync] block reason: $_" }
  if (-not $script:retrySteps.Count) {
    Add-RetryStep -Id "full-sync" -Name "full portal sync retry after health block" -Message (($publishBlockReasons | Where-Object { $_ }) -join "; ")
  }
  $healthSnapshots = @("portal_sync_health")
  if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "portal_data_quarantine.json")) {
    $healthSnapshots += "portal_data_quarantine"
  }
  if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "portal_layer_freshness.json")) {
    $healthSnapshots += "portal_layer_freshness"
  }
  Invoke-NodeStep -StepName "sync health upload" -Arguments @(
    "scripts/portal-google-sheet-upload.js",
    "--input-dir",
    $resolvedOutputDir,
    "--snapshot",
    (($healthSnapshots | Select-Object -Unique) -join ",")
  )
  Schedule-FailedStepRetry
  Remove-SyncLock
  exit 0
}

$snapshotNames = @(
  "dashboard",
  "skus",
  "platform_trends",
  "platform_plan",
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

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "oos_control.json")) {
  $snapshotNames += "oos_control"
} else {
  Write-Warning "[sync] optional snapshot oos_control is absent and will not be uploaded."
}

if ($priceRefreshSucceeded) {
  foreach ($priceSnapshot in @("prices", "repricer", "smart_price_overlay", "smart_price_workbench", "price_workbench_support")) {
    if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir ($priceSnapshot + ".json"))) {
      $snapshotNames += $priceSnapshot
    } else {
      Write-Warning "[sync] optional snapshot $priceSnapshot is absent and will not be uploaded."
    }
  }
}

foreach ($optionalSnapshot in @("iu_drr_summary", "wb_feedbacks_summary")) {
  if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir ($optionalSnapshot + ".json"))) {
    $snapshotNames += $optionalSnapshot
  } else {
    Write-Warning "[sync] optional snapshot $optionalSnapshot is absent and will not be uploaded."
  }
}

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "portal_data_quality.json")) {
  $snapshotNames += "portal_data_quality"
} else {
  Write-Warning "[sync] optional snapshot portal_data_quality is absent and will not be uploaded."
}

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "portal_data_quarantine.json")) {
  $snapshotNames += "portal_data_quarantine"
}

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "portal_sync_health.json")) {
  $snapshotNames += "portal_sync_health"
}

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "portal_layer_freshness.json")) {
  $snapshotNames += "portal_layer_freshness"
}

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "sku_aliases.json")) {
  $snapshotNames += "sku_aliases"
}

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "sku_alias_ignore.json")) {
  $snapshotNames += "sku_alias_ignore"
}

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "sku_alias_audit.json")) {
  $snapshotNames += "sku_alias_audit"
}

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "sku_matrix.json")) {
  $snapshotNames += "sku_matrix"
}

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "wb_owner_distribution_audit.json")) {
  $snapshotNames += "wb_owner_distribution_audit"
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

$markLastGoodArguments = @($syncHealthArguments + "--mark-last-good")
Write-Output "[sync] last-good mark started"
Invoke-NodeStep -StepName "last-good mark" -Arguments $markLastGoodArguments -Attempts 1 -RetryDelaySeconds 10
Write-Output "[sync] last-good mark completed"

Invoke-NodeStep -StepName "sync health final upload" -Arguments @(
  "scripts/portal-google-sheet-upload.js",
  "--input-dir",
  $resolvedOutputDir,
  "--snapshot",
  "portal_sync_health"
)

Write-Output "[sync] static data publish started"
try {
  Invoke-PowerShellStep -StepName "static data publish" -ScriptPath (Join-Path $PSScriptRoot "portal-static-data-publish.ps1") -Parameters @{
    SourceDir = $resolvedOutputDir
    DeployDir = ".codex-harisma-git"
  }
  Write-Output "[sync] static data publish completed"
} catch {
  Add-RetryStep -Id "static-data-publish" -Name "static portal data publish" -Message ([string]$_.Exception.Message)
  Write-Warning "[sync] static data publish failed, but retry will be scheduled: $($_.Exception.Message)"
}

Write-Output "[sync] full portal sync completed"
Schedule-FailedStepRetry
Remove-SyncLock
