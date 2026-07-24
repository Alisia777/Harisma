param(
  [switch]$DryRun,
  [string]$InputXlsx = "",
  [string]$ProfileDir = "",
  [string]$OutputDir = "",
  [string]$AdsWindowFrom = "",
  [string]$AdsWindowTo = "",
  [string]$ApiWindowFrom = "",
  [string]$ApiWindowTo = "",
  [string]$HistoryFrom = "",
  [string]$LiveHealthUrl = "https://xn--80aocfomk2b.xn--p1ai/data/portal_sync_health.json"
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
    [int]$Attempts = 2,
    [int]$RetryDelaySeconds = 20,
    [int]$TimeoutSeconds = 1800,
    [switch]$StreamOutput
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    Write-Output "[sync] $StepName attempt $attempt/$Attempts"
    if ($StreamOutput) {
      $global:LASTEXITCODE = 0
      & $nodeExe @Arguments 2>&1 | ForEach-Object {
        Write-Output ([string]$_)
      }
      $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
      if ($exitCode -eq 0) {
        return
      }
      if ($attempt -ge $Attempts) {
        throw "$StepName failed with exit code $exitCode"
      }
      Write-Output "[sync] $StepName failed with exit code $exitCode. Retrying in $RetryDelaySeconds sec."
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

function Resolve-FirstExistingPath {
  param([string[]]$Candidates = @())

  foreach ($candidate in @($Candidates)) {
    if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }
  return ""
}

function Resolve-GoogleDriveFileId {
  param([string]$Value)

  $raw = [string]$Value
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return ""
  }

  $match = [regex]::Match($raw, "/d/([^/?#]+)")
  if ($match.Success) {
    return $match.Groups[1].Value
  }

  $match = [regex]::Match($raw, "[?&]id=([^&#]+)")
  if ($match.Success) {
    return [System.Uri]::UnescapeDataString($match.Groups[1].Value)
  }

  if ($raw -notmatch "^https?://") {
    return $raw.Trim()
  }

  return ""
}

function Resolve-GoogleDriveSpreadsheetExportUrl {
  param([string]$Value)

  $fileId = Resolve-GoogleDriveFileId -Value $Value
  if ([string]::IsNullOrWhiteSpace($fileId)) {
    return ""
  }

  return "https://docs.google.com/spreadsheets/d/$fileId/export?format=xlsx"
}

function Get-EnvValue {
  param([string]$Name)

  $processValue = [Environment]::GetEnvironmentVariable($Name, "Process")
  if (-not [string]::IsNullOrWhiteSpace($processValue)) {
    return $processValue
  }

  $userValue = [Environment]::GetEnvironmentVariable($Name, "User")
  if (-not [string]::IsNullOrWhiteSpace($userValue)) {
    return $userValue
  }

  return ""
}

function Sync-GoogleDriveWorkbookSource {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$DestinationPath,
    [string]$UrlEnvName = "",
    [string]$IdEnvName = "",
    [string]$DefaultFileId = "",
    [string[]]$OutputEnvNames = @()
  )

  $sourceValue = ""
  if (-not [string]::IsNullOrWhiteSpace($UrlEnvName)) {
    $sourceValue = Get-EnvValue -Name $UrlEnvName
  }
  if ([string]::IsNullOrWhiteSpace($sourceValue) -and -not [string]::IsNullOrWhiteSpace($IdEnvName)) {
    $sourceValue = Get-EnvValue -Name $IdEnvName
  }
  if ([string]::IsNullOrWhiteSpace($sourceValue)) {
    $sourceValue = $DefaultFileId
  }

  $downloadUrl = Resolve-GoogleDriveSpreadsheetExportUrl -Value $sourceValue
  if ([string]::IsNullOrWhiteSpace($downloadUrl)) {
    Write-Warning "[sync] $Name Drive source skipped: no Google Drive file id/url configured."
    return ""
  }

  $destinationDir = Split-Path -Parent $DestinationPath
  New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
  $tempPath = "$DestinationPath.download"
  Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue

  try {
    Write-Output "[sync] $Name Drive download started"
    Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $tempPath -TimeoutSec 180 -MaximumRedirection 5
    $item = Get-Item -LiteralPath $tempPath -ErrorAction Stop
    if ($item.Length -lt 1024) {
      throw "downloaded file is unexpectedly small: $($item.Length) bytes"
    }
    $bytes = [System.IO.File]::ReadAllBytes($tempPath)
    $probeLength = [Math]::Min(256, $bytes.Length)
    $probe = [System.Text.Encoding]::ASCII.GetString($bytes, 0, $probeLength)
    if ($probe -match "<!DOCTYPE|<html") {
      throw "download returned HTML instead of workbook"
    }
    Move-Item -LiteralPath $tempPath -Destination $DestinationPath -Force
    foreach ($envName in @($OutputEnvNames)) {
      if (-not [string]::IsNullOrWhiteSpace($envName)) {
        [Environment]::SetEnvironmentVariable($envName, $DestinationPath, "Process")
        Set-Item -Path ("Env:" + $envName) -Value $DestinationPath
      }
    }
    Write-Output "[sync] $Name Drive download completed: $DestinationPath ($($item.Length) bytes)"
    return $DestinationPath
  } catch {
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    Write-Warning "[sync] $Name Drive download failed: $($_.Exception.Message)"
    if (Test-Path -LiteralPath $DestinationPath) {
      Write-Warning "[sync] $Name Drive source will use previous local copy: $DestinationPath"
      foreach ($envName in @($OutputEnvNames)) {
        if (-not [string]::IsNullOrWhiteSpace($envName)) {
          [Environment]::SetEnvironmentVariable($envName, $DestinationPath, "Process")
          Set-Item -Path ("Env:" + $envName) -Value $DestinationPath
        }
      }
      return $DestinationPath
    }
    return ""
  }
}

$resolvedOutputDir = if ($OutputDir) { $OutputDir } else { ".altea-google-sheet-sync-output" }
New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null
$script:retrySteps = @()
$script:syncIssuesPath = Join-Path $resolvedOutputDir "portal_sync_issues.json"

function Resolve-DateOnly {
  param(
    [string]$Value,
    [datetime]$Fallback
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $Fallback.Date
  }

  return ([datetime]::ParseExact($Value, "yyyy-MM-dd", [System.Globalization.CultureInfo]::InvariantCulture)).Date
}

function Format-DateOnly {
  param([datetime]$Value)
  return $Value.ToString("yyyy-MM-dd")
}

function Resolve-HistoryStartDate {
  param([datetime]$WindowToDate)

  $historyValue = $HistoryFrom
  if ([string]::IsNullOrWhiteSpace($historyValue)) {
    $historyValue = [Environment]::GetEnvironmentVariable("ALTEA_PORTAL_HISTORY_FROM", "Process")
  }
  if ([string]::IsNullOrWhiteSpace($historyValue)) {
    $historyValue = [Environment]::GetEnvironmentVariable("ALTEA_PORTAL_HISTORY_FROM", "User")
  }
  if ([string]::IsNullOrWhiteSpace($historyValue)) {
    $historyValue = "2026-05-01"
  }

  $monthStartFallback = (Get-Date -Year $WindowToDate.Year -Month $WindowToDate.Month -Day 1).Date
  $historyStartDate = Resolve-DateOnly -Value $historyValue -Fallback $monthStartFallback
  if ($historyStartDate -gt $WindowToDate) {
    return $monthStartFallback
  }
  return $historyStartDate
}

$portalAdsWindowToDate = Resolve-DateOnly -Value $AdsWindowTo -Fallback ((Get-Date).Date.AddDays(-1))
$portalAdsHistoryFromDate = Resolve-HistoryStartDate -WindowToDate $portalAdsWindowToDate
$portalAdsWindowFromValue = $AdsWindowFrom
if ([string]::IsNullOrWhiteSpace($portalAdsWindowFromValue)) {
  $portalAdsWindowFromValue = [Environment]::GetEnvironmentVariable("ALTEA_PORTAL_ADS_WINDOW_FROM", "Process")
}
if ([string]::IsNullOrWhiteSpace($portalAdsWindowFromValue)) {
  $portalAdsWindowFromValue = [Environment]::GetEnvironmentVariable("ALTEA_PORTAL_ADS_WINDOW_FROM", "User")
}
if ([string]::IsNullOrWhiteSpace($portalAdsWindowFromValue)) {
  $portalAdsWindowFromValue = Format-DateOnly $portalAdsHistoryFromDate
}
$portalAdsWindowFromDate = Resolve-DateOnly -Value $portalAdsWindowFromValue -Fallback $portalAdsHistoryFromDate

if ($portalAdsWindowFromDate -gt $portalAdsWindowToDate) {
  throw "AdsWindowFrom must be before or equal AdsWindowTo. Got $($portalAdsWindowFromDate.ToString("yyyy-MM-dd"))..$($portalAdsWindowToDate.ToString("yyyy-MM-dd"))."
}

$portalAdsWindowFrom = Format-DateOnly $portalAdsWindowFromDate
$portalAdsWindowTo = Format-DateOnly $portalAdsWindowToDate
$portalOzonFinanceWindowFromDate = $portalAdsWindowFromDate
$portalOzonFinanceWindowFrom = Format-DateOnly $portalOzonFinanceWindowFromDate
Write-Output "[sync] Ozon ads analytics window: $portalAdsWindowFrom..$portalAdsWindowTo; Ozon finance API window: $portalOzonFinanceWindowFrom..$portalAdsWindowTo"

$portalApiWindowToDate = Resolve-DateOnly -Value $ApiWindowTo -Fallback ((Get-Date).Date.AddDays(-1))
$portalApiHistoryFromDate = Resolve-HistoryStartDate -WindowToDate $portalApiWindowToDate
$portalApiWindowFromValue = $ApiWindowFrom
if ([string]::IsNullOrWhiteSpace($portalApiWindowFromValue)) {
  $portalApiWindowFromValue = [Environment]::GetEnvironmentVariable("ALTEA_PORTAL_API_WINDOW_FROM", "Process")
}
if ([string]::IsNullOrWhiteSpace($portalApiWindowFromValue)) {
  $portalApiWindowFromValue = [Environment]::GetEnvironmentVariable("ALTEA_PORTAL_API_WINDOW_FROM", "User")
}
if ([string]::IsNullOrWhiteSpace($portalApiWindowFromValue)) {
  $portalApiWindowFromValue = Format-DateOnly $portalApiHistoryFromDate
}
$portalApiWindowFromFallback = $portalApiHistoryFromDate
$portalApiWindowFromDate = Resolve-DateOnly -Value $portalApiWindowFromValue -Fallback $portalApiWindowFromFallback

if ($portalApiWindowFromDate -gt $portalApiWindowToDate) {
  throw "ApiWindowFrom must be before or equal ApiWindowTo. Got $($portalApiWindowFromDate.ToString("yyyy-MM-dd"))..$($portalApiWindowToDate.ToString("yyyy-MM-dd"))."
}

$portalApiWindowFrom = Format-DateOnly $portalApiWindowFromDate
$portalApiWindowTo = Format-DateOnly $portalApiWindowToDate
$env:ALTEA_PORTAL_API_WINDOW_FROM = $portalApiWindowFrom
$env:ALTEA_PORTAL_API_WINDOW_TO = $portalApiWindowTo
Write-Output "[sync] marketplace API refresh window: $portalApiWindowFrom..$portalApiWindowTo"

function Write-SyncIssues {
  $payload = [ordered]@{
    schema = "portal-sync-issues-v1"
    generatedAt = (Get-Date).ToString("o")
    issues = $script:retrySteps
  }
  $payload | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $script:syncIssuesPath -Encoding UTF8
}

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
  Write-SyncIssues
}

Write-SyncIssues

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
    expectedDate = $portalApiWindowTo
    steps = $script:retrySteps
  }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

  $actionArgs = "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$retryScript`" -Manifest `"$manifestPath`" -LogDir `"$resolvedOutputDir`" -TaskName `"$taskName`""
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
  $minMaxInputDir = Join-Path (Split-Path -Parent $repoRoot) (-join @([char]0x041c, [char]0x0438, [char]0x043d, ' ', [char]0x041c, [char]0x0430, [char]0x043a, [char]0x0441))
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

function Invoke-TeamRepricerInputsIfAvailable {
  $teamScript = Join-Path $PSScriptRoot "import-team-repricer-inputs.js"
  $teamDirName = -join @([char]0x0414, [char]0x0430, [char]0x043d, [char]0x043d, [char]0x044b, [char]0x0435, ' ', [char]0x043e, [char]0x0442, ' ', [char]0x043a, [char]0x043e, [char]0x043c, [char]0x0430, [char]0x043d, [char]0x0434, [char]0x044b)
  $teamInputDir = Join-Path (Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads") $teamDirName
  if (-not (Test-Path -LiteralPath $teamScript)) {
    Write-Warning "[sync] team repricer inputs import skipped: script is missing: $teamScript"
    return
  }
  if (-not (Test-Path -LiteralPath $teamInputDir)) {
    Write-Warning "[sync] team repricer inputs import skipped: input dir is missing: $teamInputDir"
    return
  }

  Write-Output "[sync] team repricer inputs import started"
  try {
    Invoke-NodeStep -StepName "team repricer inputs import" -Arguments @(
      "scripts/import-team-repricer-inputs.js",
      "--source-dir",
      $teamInputDir
    ) -Attempts 1 -RetryDelaySeconds 20 -TimeoutSeconds 300
    foreach ($fileName in @("skus.json", "sku_aliases.json", "sku_alias_ignore.json", "sku_alias_audit.json")) {
      $sourcePath = Join-Path "data" $fileName
      if (Test-Path -LiteralPath $sourcePath) {
        Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $resolvedOutputDir $fileName) -Force
      }
    }
    Write-Output "[sync] team repricer inputs import completed"
  } catch {
    Add-RetryStep -Id "team-repricer-inputs" -Name "team repricer inputs import" -Message ([string]$_.Exception.Message)
    Write-Warning "[sync] team repricer inputs import failed, continuing with existing owner/minmax layers: $($_.Exception.Message)"
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
  "sync",
  "--from",
  $portalApiWindowFrom,
  "--to",
  $portalApiWindowTo
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

$zyaDriveSalesPath = Join-Path $repoRoot "data\external_sources\zya_sales_drive.xlsx"
$magnitDriveSalesPath = Join-Path $repoRoot "data\external_sources\magnit_sales_drive.xlsx"

Sync-GoogleDriveWorkbookSource `
  -Name "ZYA sales" `
  -DestinationPath $zyaDriveSalesPath `
  -UrlEnvName "ALTEA_ZYA_SALES_GOOGLE_URL" `
  -IdEnvName "ALTEA_ZYA_SALES_GOOGLE_FILE_ID" `
  -DefaultFileId "1qYsAC4ksk30ZUQC_joqwnLpboy9UGODi" `
  -OutputEnvNames @("ALTEA_ZYA_SALES_XLSX")

Sync-GoogleDriveWorkbookSource `
  -Name "Magnit sales" `
  -DestinationPath $magnitDriveSalesPath `
  -UrlEnvName "ALTEA_MAGNIT_SALES_GOOGLE_URL" `
  -IdEnvName "ALTEA_MAGNIT_SALES_GOOGLE_FILE_ID" `
  -DefaultFileId "1-dFIGhk0O4gBnS0B-LtnzIL_O1KJZb4Y" `
  -OutputEnvNames @("ALTEA_MAGNIT_SALES_XLSX", "ALTEA_MAGNIT_SALES_WORKBOOK")

Set-ProcessEnvFallback -Name "ALTEA_YM_API_KEY"
Set-ProcessEnvFallback -Name "ALTEA_YM_CAMPAIGN_ID"
Set-ProcessEnvFallback -Name "ALTEA_YM_BUSINESS_ID"
Set-ProcessEnvFallback -Name "ALTEA_ZYA_API_TOKEN"
Set-ProcessEnvFallback -Name "ALTEA_ZYA_API_KEY"
Set-ProcessEnvFallback -Name "ALTEA_ZYA_API_BASE_URL"
Set-ProcessEnvFallback -Name "ALTEA_ZYA_SALES_PATH"
Set-ProcessEnvFallback -Name "ALTEA_ZYA_CLIENT_ID"
Set-ProcessEnvFallback -Name "ALTEA_ZYA_API_METHOD"
Set-ProcessEnvFallback -Name "ALTEA_ZYA_API_BODY_JSON"
Set-ProcessEnvFallback -Name "ALTEA_ZYA_GRAPHQL_QUERY"
Set-ProcessEnvFallback -Name "ALTEA_GOLDAPPLE_API_TOKEN"
Set-ProcessEnvFallback -Name "ALTEA_GOLDAPPLE_API_KEY"
Set-ProcessEnvFallback -Name "ALTEA_GOLDAPPLE_API_BASE_URL"
Set-ProcessEnvFallback -Name "ALTEA_GOLDAPPLE_SALES_PATH"
Set-ProcessEnvFallback -Name "ALTEA_GOLDAPPLE_CLIENT_ID"
Set-ProcessEnvFallback -Name "ALTEA_GOLDAPPLE_API_METHOD"
Set-ProcessEnvFallback -Name "ALTEA_GOLDAPPLE_API_BODY_JSON"
Set-ProcessEnvFallback -Name "ALTEA_GOLDAPPLE_GRAPHQL_QUERY"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_API_TOKEN"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_API_BASE_URL"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_SALES_PATH"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_CLIENT_ID"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_API_METHOD"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_API_BODY_JSON"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_GRAPHQL_QUERY"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_LOCAL_EXPORT_XLSX"
Set-ProcessEnvFallback -Name "ALTEA_LETUAL_PLAN_XLSX"
Set-ProcessEnvFallback -Name "ALTEA_ZYA_SALES_XLSX" $zyaDriveSalesPath
Set-ProcessEnvFallback -Name "ALTEA_ZYA_SALES_ZIP" (Join-Path $env:LOCALAPPDATA "Temp\zya_sales.zip")
Set-ProcessEnvFallback -Name "ALTEA_ZYA_ADS_XLSX" (Join-Path $env:LOCALAPPDATA "Temp\zya_ads.xlsx")
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_API_TOKEN"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_API_KEY"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_API_BASE_URL"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_SALES_PATH"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_CLIENT_ID"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_API_METHOD"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_API_BODY_JSON"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_GRAPHQL_QUERY"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_MARKET_API_TOKEN"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_MARKET_API_KEY"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_MARKET_API_BASE_URL"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_MARKET_SALES_PATH"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_MARKET_CLIENT_ID"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_MARKET_API_METHOD"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_MARKET_API_BODY_JSON"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_MARKET_GRAPHQL_QUERY"
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_SALES_XLSX" $magnitDriveSalesPath
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_SALES_WORKBOOK" $magnitDriveSalesPath
Set-ProcessEnvFallback -Name "ALTEA_MEGAMARKET_API_TOKEN"
Set-ProcessEnvFallback -Name "ALTEA_MEGAMARKET_API_KEY"
Set-ProcessEnvFallback -Name "ALTEA_MEGAMARKET_API_BASE_URL"
Set-ProcessEnvFallback -Name "ALTEA_MEGAMARKET_SALES_PATH"
Set-ProcessEnvFallback -Name "ALTEA_MEGAMARKET_CLIENT_ID"
Set-ProcessEnvFallback -Name "ALTEA_MEGAMARKET_API_METHOD"
Set-ProcessEnvFallback -Name "ALTEA_MEGAMARKET_API_BODY_JSON"
Set-ProcessEnvFallback -Name "ALTEA_MEGAMARKET_GRAPHQL_QUERY"
Set-ProcessEnvFallback -Name "ALTEA_SAMOKAT_API_TOKEN"
Set-ProcessEnvFallback -Name "ALTEA_SAMOKAT_API_KEY"
Set-ProcessEnvFallback -Name "ALTEA_SAMOKAT_API_BASE_URL"
Set-ProcessEnvFallback -Name "ALTEA_SAMOKAT_SALES_PATH"
Set-ProcessEnvFallback -Name "ALTEA_SAMOKAT_CLIENT_ID"
Set-ProcessEnvFallback -Name "ALTEA_SAMOKAT_API_METHOD"
Set-ProcessEnvFallback -Name "ALTEA_SAMOKAT_API_BODY_JSON"
Set-ProcessEnvFallback -Name "ALTEA_SAMOKAT_GRAPHQL_QUERY"
Set-ProcessEnvFallback -Name "ALTEA_RETAIL_NETWORK_SALES_XLSX" (Join-Path $repoRoot "data\external_sources\retail_network_sales.xlsx")
$magnitSalesCsvFallback = Resolve-FirstExistingPath @(
  (Join-Path $repoRoot "data\external_sources\magnit_sales.csv"),
  (Join-Path (Split-Path -Parent $repoRoot) "data\external_sources\magnit_sales.csv"),
  (Join-Path $env:LOCALAPPDATA "Temp\magnit_sales.csv")
)
$magnitServicesCsvFallback = Resolve-FirstExistingPath @(
  (Join-Path $repoRoot "data\external_sources\magnit_services.csv"),
  (Join-Path (Split-Path -Parent $repoRoot) "data\external_sources\magnit_services.csv"),
  (Join-Path $env:LOCALAPPDATA "Temp\magnit_services.csv")
)
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_SALES_CSV" $magnitSalesCsvFallback
Set-ProcessEnvFallback -Name "ALTEA_MAGNIT_SERVICES_CSV" $magnitServicesCsvFallback

Write-Output "[sync] Ozon marketplace analytics refresh started"
Invoke-NodeStep -StepName "Ozon marketplace analytics refresh" -Arguments @(
  "scripts/portal-ozon-finance-trends-sync.js",
  "sync",
  "--from",
  $portalApiWindowFrom,
  "--to",
  $portalApiWindowTo
) -Attempts 3 -RetryDelaySeconds 20
Write-Output "[sync] Ozon marketplace analytics refresh completed"

Write-Output "[sync] Ozon feedbacks/questions sync started"
try {
  Invoke-NodeStep -StepName "Ozon feedbacks/questions sync" -Arguments @(
    "scripts/portal-ozon-feedback-sync.js",
    "--output-dir",
    $resolvedOutputDir,
    "--date-to",
    $portalApiWindowTo
  ) -Attempts 2 -RetryDelaySeconds 60 -TimeoutSeconds 1200
  Copy-Item -LiteralPath (Join-Path $resolvedOutputDir "ozon_feedbacks_summary.json") -Destination (Join-Path "data" "ozon_feedbacks_summary.json") -Force
  Write-Output "[sync] Ozon feedbacks/questions sync completed"
} catch {
  Add-RetryStep -Id "ozon-feedbacks" -Name "Ozon feedbacks/questions sync" -Message ([string]$_.Exception.Message)
  Write-Warning "[sync] Ozon feedbacks/questions sync failed, but the portal sync will continue with the last usable Ozon feedback layer if present: $($_.Exception.Message)"
}

Write-Output "[sync] waiting 30 sec before the next Ozon-backed step"
Start-Sleep -Seconds 30

Write-Output "[sync] Yandex Market analytics refresh started"
try {
  Invoke-NodeStep -StepName "Yandex Market analytics refresh" -Arguments @(
    "scripts/portal-yandex-market-trends-sync.js",
    "sync",
    "--from",
    $portalApiWindowFrom,
    "--to",
    $portalApiWindowTo
  ) -Attempts 1 -RetryDelaySeconds 20 -TimeoutSeconds 2700 -StreamOutput
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
  "--ads-window-from",
  $portalAdsWindowFrom,
  "--ads-window-to",
  $portalAdsWindowTo,
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

$magnitDailyArguments = @(
  "scripts/portal-magnit-market-sync.js",
  "sync",
  "--input-file",
  (Join-Path $resolvedOutputDir "platform_trends.json"),
  "--output-dir",
  $resolvedOutputDir,
  "--base-data-dir",
  "data",
  "--raw-output-dir",
  (Join-Path $resolvedOutputDir "raw"),
  "--mirror-local-fallback",
  "--require-source"
)

$magnitApiConfigured = (
  (-not [string]::IsNullOrWhiteSpace($env:ALTEA_MAGNIT_API_TOKEN) -or -not [string]::IsNullOrWhiteSpace($env:ALTEA_MAGNIT_API_KEY) -or -not [string]::IsNullOrWhiteSpace($env:ALTEA_MAGNIT_MARKET_API_TOKEN) -or -not [string]::IsNullOrWhiteSpace($env:ALTEA_MAGNIT_MARKET_API_KEY))
)
$magnitWorkbookConfigured = (-not [string]::IsNullOrWhiteSpace($env:ALTEA_MAGNIT_SALES_XLSX) -and (Test-Path -LiteralPath $env:ALTEA_MAGNIT_SALES_XLSX))
$magnitCsvConfigured = (-not [string]::IsNullOrWhiteSpace($env:ALTEA_MAGNIT_SALES_CSV) -and (Test-Path -LiteralPath $env:ALTEA_MAGNIT_SALES_CSV))
$retailNetworkSalesConfigured = (-not [string]::IsNullOrWhiteSpace($env:ALTEA_RETAIL_NETWORK_SALES_XLSX) -and (Test-Path -LiteralPath $env:ALTEA_RETAIL_NETWORK_SALES_XLSX))
if ($magnitApiConfigured) {
  Write-Output "[sync] Magnit Market Partner API normalization started"
  Invoke-NodeStep -StepName "Magnit Market Partner API normalization" -Arguments $magnitDailyArguments -Attempts 2 -RetryDelaySeconds 20
  Write-Output "[sync] Magnit Market Partner API normalization completed"
} elseif ($magnitWorkbookConfigured -or $magnitCsvConfigured) {
  Write-Output "[sync] Magnit Market daily normalization started"
  Invoke-NodeStep -StepName "Magnit Market daily normalization" -Arguments $magnitDailyArguments -Attempts 2 -RetryDelaySeconds 20
  Write-Output "[sync] Magnit Market daily normalization completed"
} elseif ($retailNetworkSalesConfigured) {
  Write-Output "[sync] Magnit Market daily normalization skipped because retail-network source is active"
} else {
  Write-Output "[sync] Magnit Market daily normalization started"
  Invoke-NodeStep -StepName "Magnit Market daily normalization" -Arguments $magnitDailyArguments -Attempts 2 -RetryDelaySeconds 20
  Write-Output "[sync] Magnit Market daily normalization completed"
}

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
  Invoke-TeamRepricerInputsIfAvailable
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
$kzRefreshSucceeded = $false
try {
  & $kzSyncScript @kzParams
  $kzExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  if ($kzExitCode -ne 0) {
    Add-RetryStep -Id "product-leaderboard" -Name "product leaderboard sync" -Message "exit code $kzExitCode"
    Write-Warning "[sync] product leaderboard sync failed with exit code $kzExitCode. Continuing portal sync without leaderboard refresh."
  } else {
    $kzRefreshSucceeded = $true
    Write-Output "[sync] product leaderboard sync completed"
  }
} catch {
  Add-RetryStep -Id "product-leaderboard" -Name "product leaderboard sync" -Message ([string]$_.Exception.Message)
  Write-Warning "[sync] product leaderboard sync failed, continuing portal sync without leaderboard refresh: $($_.Exception.Message)"
}

if ($kzRefreshSucceeded) {
  Write-Output "[sync] product leaderboard history build phase started"
  Invoke-NodeStep -StepName "product leaderboard history build" -Arguments @("scripts/build-product-leaderboard-history.js") -Attempts 2 -RetryDelaySeconds 20

  $leaderboardHistoryPath = Join-Path "data" "product_leaderboard_history.json"
  if (Test-Path -LiteralPath $leaderboardHistoryPath) {
    Copy-Item -LiteralPath $leaderboardHistoryPath -Destination (Join-Path $resolvedOutputDir "product_leaderboard_history.json") -Force
  }
  Write-Output "[sync] product leaderboard history build phase completed"
} else {
  Write-Warning "[sync] product leaderboard history build skipped because leaderboard refresh failed."
}

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

$ozonAdsFinanceArguments = @(
  "scripts/portal-ozon-ads-finance-sync.js",
  "sync",
  "--input-file",
  (Join-Path $resolvedOutputDir "ads_summary.json"),
  "--output-file",
  (Join-Path $resolvedOutputDir "ads_summary.json"),
  "--mirror-file",
  (Join-Path "data" "ads_summary.json"),
  "--from",
  $portalOzonFinanceWindowFrom,
  "--to",
  $portalAdsWindowTo
)

if ($DryRun) {
  $ozonAdsFinanceArguments += "--dry-run"
}

$adsSummaryForOzonFinance = Join-Path $resolvedOutputDir "ads_summary.json"
if (Test-Path -LiteralPath $adsSummaryForOzonFinance) {
  Write-Output "[sync] Ozon ads finance refresh started"
  try {
    Invoke-NodeStep -StepName "Ozon ads finance refresh" -Arguments $ozonAdsFinanceArguments -Attempts 2 -RetryDelaySeconds 60 -TimeoutSeconds 900
    Write-Output "[sync] Ozon ads finance refresh completed"
  } catch {
    Add-RetryStep -Id "ozon-ads-finance" -Name "Ozon ads finance refresh" -Message ([string]$_.Exception.Message)
    Write-Warning "[sync] Ozon ads finance refresh failed, IU/DRR will use the existing Ozon ads layer: $($_.Exception.Message)"
  }
} else {
  Write-Warning "[sync] Ozon ads finance refresh skipped because ads_summary.json is missing in $resolvedOutputDir."
}

Write-Output "[sync] WB fixed-rate cabinet report refresh started"
Invoke-NodeStep -StepName "WB fixed-rate cabinet report refresh" -Arguments @(
  "scripts/build-wb-fixed-rate-report.js",
  "--output",
  (Join-Path $resolvedOutputDir "wb_fixed_rate_reports.json"),
  "--optional"
) -Attempts 1 -RetryDelaySeconds 10 -TimeoutSeconds 300

Write-Output "[sync] WB IU/DRR fixed-rate logic rules rebuild started"
Invoke-NodeStep -StepName "WB IU/DRR fixed-rate logic rules rebuild" -Arguments @(
  "scripts/build-wb-iu-logic-rules.js",
  "--report",
  (Join-Path $resolvedOutputDir "wb_fixed_rate_reports.json"),
  "--output",
  (Join-Path $resolvedOutputDir "wb_iu_logic_rules.json")
) -Attempts 1 -RetryDelaySeconds 10 -TimeoutSeconds 300
Write-Output "[sync] WB IU/DRR fixed-rate logic rules rebuild completed"

$iuDrrArguments = @(
  "scripts/build-iu-drr-summary.js",
  "--input-dir",
  $resolvedOutputDir,
  "--base-data-dir",
  "data",
  "--output-dir",
  $resolvedOutputDir,
  "--date-from",
  $portalAdsWindowFrom,
  "--date-to",
  $portalAdsWindowTo,
  "--ozon-finance-api-from",
  $portalOzonFinanceWindowFrom,
  "--ozon-finance-api-to",
  $portalAdsWindowTo,
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

if ($iuDrrRefreshSucceeded) {
  Write-Output "[sync] plan truth audit started"
  Invoke-NodeStep -StepName "plan truth audit" -Arguments @(
    "scripts/audit-plan-truth.js",
    "--input-dir",
    $resolvedOutputDir,
    "--base-data-dir",
    "data"
  ) -Attempts 1 -RetryDelaySeconds 10
  Write-Output "[sync] plan truth audit completed"
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

$wbSalesFunnelArguments = @(
  "scripts/build-wb-sales-funnel-from-platform-trends.js",
  "--output-dir",
  $resolvedOutputDir,
  "--base-data-dir",
  "data",
  "--mirror-local-fallback"
)

Write-Output "[sync] WB sales funnel report build started"
try {
  Invoke-NodeStep -StepName "WB sales funnel report build" -Arguments $wbSalesFunnelArguments -Attempts 2 -RetryDelaySeconds 20
  Write-Output "[sync] WB sales funnel report build completed"
} catch {
  Add-RetryStep -Id "wb-sales-funnel" -Name "WB sales funnel report build" -Message ([string]$_.Exception.Message)
  Write-Warning "[sync] WB sales funnel report build failed, but the portal sync will continue with the last usable report if present: $($_.Exception.Message)"
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

$unifiedIntakeArguments = @(
  "scripts/portal-unified-daily-intake.js",
  "--data-dir",
  $resolvedOutputDir,
  "--base-data-dir",
  "data",
  "--output-dir",
  $resolvedOutputDir,
  "--expected-date",
  $portalApiWindowTo
)

Write-Output "[sync] unified daily intake started"
Invoke-NodeStep -StepName "unified daily intake" -Arguments $unifiedIntakeArguments -Attempts 1 -RetryDelaySeconds 10
Write-Output "[sync] unified daily intake completed"

$syncHealthArguments = @(
  "scripts/portal-sync-health.js",
  "--input-dir",
  $resolvedOutputDir,
  "--base-data-dir",
  "data",
  "--output-dir",
  $resolvedOutputDir,
  "--sync-issues",
  $script:syncIssuesPath,
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
  "scripts/portal-truth-manifest.json",
  "--mirror-local-fallback"
)

Write-Output "[sync] portal layer audit started"
Invoke-NodeStep -StepName "portal layer audit" -Arguments $layerAuditArguments -Attempts 1 -RetryDelaySeconds 10
Write-Output "[sync] portal layer audit completed"

$dailyGuardArguments = @(
  "scripts/portal-daily-layer-guard.js",
  "--input-dir",
  $resolvedOutputDir,
  "--base-data-dir",
  "data",
  "--output-dir",
  $resolvedOutputDir,
  "--expected-date",
  $portalApiWindowTo,
  "--sync-issues",
  $script:syncIssuesPath,
  "--mirror-local-fallback",
  "--no-fail"
)

Write-Output "[sync] daily layer guard started"
Invoke-NodeStep -StepName "daily layer guard" -Arguments $dailyGuardArguments -Attempts 1 -RetryDelaySeconds 10
Write-Output "[sync] daily layer guard completed"

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

function Read-PublishGateState {
  $allowed = $true
  $blockReasons = @()
  $repairSteps = @()

  $syncHealthPath = Join-Path $resolvedOutputDir "portal_sync_health.json"
  if (Test-Path -LiteralPath $syncHealthPath) {
    $syncHealth = Get-Content -LiteralPath $syncHealthPath -Raw | ConvertFrom-Json
    $allowed = [bool]$syncHealth.publish.allowed
    $blockReasons = @($syncHealth.publish.blockingReasons)
    Write-Output "[sync] health status: $($syncHealth.status); publish allowed: $allowed"
  }

  $layerAuditPath = Join-Path $resolvedOutputDir "portal_layer_freshness.json"
  if (Test-Path -LiteralPath $layerAuditPath) {
    $layerAudit = Get-Content -LiteralPath $layerAuditPath -Raw | ConvertFrom-Json
    $layerPublishAllowed = [bool]$layerAudit.publish.allowed
    if (-not $layerPublishAllowed) {
      $allowed = $false
      $blockReasons += @($layerAudit.publish.blockingReasons)
    }
    Write-Output "[sync] layer audit publish allowed: $layerPublishAllowed"
  }

  $dailyGuardPath = Join-Path $resolvedOutputDir "portal_daily_guard.json"
  if (Test-Path -LiteralPath $dailyGuardPath) {
    $dailyGuard = Get-Content -LiteralPath $dailyGuardPath -Raw | ConvertFrom-Json
    $dailyGuardPublishAllowed = [bool]$dailyGuard.publish.allowed
    if (-not $dailyGuardPublishAllowed) {
      $allowed = $false
      $blockReasons += @($dailyGuard.publish.blockingReasons)
    }
    $repairSteps = @($dailyGuard.repair.suggestedSteps | Where-Object { $_ -and -not [string]::IsNullOrWhiteSpace([string]$_.id) })
    Write-Output "[sync] daily layer guard publish allowed: $dailyGuardPublishAllowed"
    if ($repairSteps.Count -gt 0) {
      Write-Output "[sync] daily layer guard suggested repair steps: $((@($repairSteps | ForEach-Object { [string]$_.id }) | Select-Object -Unique) -join ', ')"
    }
  }

  [pscustomobject]@{
    PublishAllowed = $allowed
    BlockingReasons = @($blockReasons | Where-Object { $_ })
    RepairSteps = @($repairSteps)
  }
}

function Sync-RetryStepsFromIssuesFile {
  if (-not (Test-Path -LiteralPath $script:syncIssuesPath)) {
    return
  }

  try {
    $payload = Get-Content -LiteralPath $script:syncIssuesPath -Raw | ConvertFrom-Json
    $script:retrySteps = @($payload.issues)
  } catch {
    Write-Warning "[sync] failed to reload sync issues after repair: $($_.Exception.Message)"
  }
}

function Invoke-DailyGuardRepair {
  param([object[]]$RepairSteps)

  $uniqueSteps = @($RepairSteps |
    Where-Object { $_ -and -not [string]::IsNullOrWhiteSpace([string]$_.id) } |
    Sort-Object -Property id -Unique)
  if (-not $uniqueSteps.Count) {
    return
  }

  $retryScript = Join-Path $PSScriptRoot "portal-google-sheet-retry-failed.ps1"
  if (-not (Test-Path -LiteralPath $retryScript)) {
    Write-Warning "[sync] daily guard repair skipped: retry script is missing: $retryScript"
    return
  }

  $script:dailyGuardRepairAttempted = $true
  $repairDir = Join-Path $resolvedOutputDir "repair"
  New-Item -ItemType Directory -Path $repairDir -Force | Out-Null
  $runStamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
  $manifestPath = Join-Path $repairDir "daily-guard-repair-$runStamp.json"
  $manifestSteps = @($uniqueSteps | ForEach-Object {
    [ordered]@{
      id = [string]$_.id
      name = if ($_.name) { [string]$_.name } else { [string]$_.id }
      message = if ($_.reason) { [string]$_.reason } else { "daily guard repair" }
      failedAt = (Get-Date).ToString("o")
    }
  })

  $manifest = [ordered]@{
    schema = "portal-daily-guard-repair-v1"
    generatedAt = (Get-Date).ToString("o")
    cwd = $repoRoot
    outputDir = $resolvedOutputDir
    profileDir = $ProfileDir
    inputXlsx = $InputXlsx
    expectedDate = $portalApiWindowTo
    steps = $manifestSteps
  }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

  Write-Output "[sync] daily guard repair started: $($manifestSteps.id -join ', ')"
  $global:LASTEXITCODE = 0
  & $retryScript -Manifest $manifestPath -LogDir $resolvedOutputDir -LiveHealthUrl $LiveHealthUrl -NoFinalPublish 2>&1 | ForEach-Object { Write-Output ([string]$_) }
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
  if ($exitCode -ne 0) {
    Write-Warning "[sync] daily guard repair finished with exit code $exitCode; publish gates will be rebuilt before final decision."
  } else {
    Write-Output "[sync] daily guard repair completed"
  }
  Sync-RetryStepsFromIssuesFile
}

$gateState = Read-PublishGateState
$publishAllowed = [bool]$gateState.PublishAllowed
$publishBlockReasons = @($gateState.BlockingReasons)
$dailyGuardRepairSteps = @($gateState.RepairSteps)

if ($DryRun) {
  Remove-SyncLock
  exit 0
}

if (-not $publishAllowed -and $dailyGuardRepairSteps.Count -gt 0) {
  $script:dailyGuardRepairAttempted = $false
  Invoke-DailyGuardRepair -RepairSteps $dailyGuardRepairSteps
  if ($script:dailyGuardRepairAttempted) {
    Write-Output "[sync] rebuild publish gates after daily guard repair"
    Invoke-NodeStep -StepName "sync health build after daily guard repair" -Arguments $syncHealthArguments -Attempts 1 -RetryDelaySeconds 10
    Invoke-NodeStep -StepName "portal layer audit after daily guard repair" -Arguments $layerAuditArguments -Attempts 1 -RetryDelaySeconds 10
    Invoke-NodeStep -StepName "daily layer guard after repair" -Arguments $dailyGuardArguments -Attempts 1 -RetryDelaySeconds 10
    $gateState = Read-PublishGateState
    $publishAllowed = [bool]$gateState.PublishAllowed
    $publishBlockReasons = @($gateState.BlockingReasons)
  }
}

if (-not $publishAllowed) {
  Write-Warning "[sync] publish blocked by sync health. Main snapshots and logistics upload will be skipped."
  $publishBlockReasons | ForEach-Object { Write-Warning "[sync] block reason: $_" }
  if (-not $script:retrySteps.Count) {
    Add-RetryStep -Id "full-sync" -Name "full portal sync retry after health block" -Message (($publishBlockReasons | Where-Object { $_ }) -join "; ")
  }
  $healthSnapshots = @("portal_sync_health")
  if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "portal_daily_intake.json")) {
    $healthSnapshots += "portal_daily_intake"
  }
  if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "portal_data_quarantine.json")) {
    $healthSnapshots += "portal_data_quarantine"
  }
  if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "portal_layer_freshness.json")) {
    $healthSnapshots += "portal_layer_freshness"
  }
  if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "portal_daily_guard.json")) {
    $healthSnapshots += "portal_daily_guard"
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
  "logistics",
  "ads_summary",
  "iu_plan",
  "warehouse_stock_overlay",
  "loyalty_system",
  "order_procurement",
  "order_procurement_wb",
  "order_procurement_ozon"
)

if ($kzRefreshSucceeded) {
  $snapshotNames += "product_leaderboard"
  $snapshotNames += "product_leaderboard_history"
} else {
  Write-Warning "[sync] product leaderboard snapshots will not be uploaded because the refresh failed; live data keeps the previous successful snapshot."
}

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

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "wb_sales_funnel_report.json")) {
  $snapshotNames += "wb_sales_funnel_report"
} else {
  Write-Warning "[sync] optional snapshot wb_sales_funnel_report is absent and will not be uploaded."
}

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "ozon_feedbacks_summary.json")) {
  $snapshotNames += "ozon_feedbacks_summary"
} else {
  Write-Warning "[sync] optional snapshot ozon_feedbacks_summary is absent and will not be uploaded."
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

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "portal_daily_intake.json")) {
  $snapshotNames += "portal_daily_intake"
}

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "portal_layer_freshness.json")) {
  $snapshotNames += "portal_layer_freshness"
}

if (Test-Path -LiteralPath (Join-Path $resolvedOutputDir "portal_daily_guard.json")) {
  $snapshotNames += "portal_daily_guard"
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
    DeployDir = ".codex-rollout-main"
    LiveHealthUrl = $LiveHealthUrl
    LiveVerifyAttempts = 5
    LiveVerifyDelaySeconds = 30
  }
  Write-Output "[sync] static data publish completed"
} catch {
  Add-RetryStep -Id "static-data-publish" -Name "static portal data publish" -Message ([string]$_.Exception.Message)
  Write-Warning "[sync] static data publish failed, but retry will be scheduled: $($_.Exception.Message)"
}

Write-Output "[sync] full portal sync completed"
Schedule-FailedStepRetry
Remove-SyncLock
exit 0
