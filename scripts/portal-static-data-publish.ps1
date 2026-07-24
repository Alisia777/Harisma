param(
  [string]$SourceDir = "",
  [string]$DeployDir = "",
  [string]$GitPath = "",
  [string]$CommitMessage = "",
  [switch]$NoPush,
  [switch]$DryRun,
  [switch]$ForceOlder,
  [string]$LiveHealthUrl = "",
  [int]$LiveVerifyAttempts = 1,
  [int]$LiveVerifyDelaySeconds = 30
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Resolve-RepoPath {
  param([string]$PathValue, [string]$DefaultValue)
  $value = if ([string]::IsNullOrWhiteSpace($PathValue)) { $DefaultValue } else { $PathValue }
  if ([System.IO.Path]::IsPathRooted($value)) {
    return $value
  }
  return Join-Path $repoRoot $value
}

function Resolve-GitPath {
  param([string]$RequestedGitPath)

  if (-not [string]::IsNullOrWhiteSpace($RequestedGitPath) -and (Test-Path -LiteralPath $RequestedGitPath)) {
    return $RequestedGitPath
  }

  $gitCommand = Get-Command git -ErrorAction SilentlyContinue
  if ($gitCommand -and $gitCommand.Source) {
    return $gitCommand.Source
  }

  $githubDesktopRoot = Join-Path $env:LOCALAPPDATA "GitHubDesktop"
  if (Test-Path -LiteralPath $githubDesktopRoot) {
    $candidate = Get-ChildItem -LiteralPath $githubDesktopRoot -Recurse -Filter git.exe -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -like "*\resources\app\git\cmd\git.exe" } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($candidate) {
      return $candidate.FullName
    }
  }

  throw "git.exe was not found. Pass -GitPath explicitly."
}

function Get-JsonStamp {
  param([string]$PathValue)
  if (-not (Test-Path -LiteralPath $PathValue)) {
    return $null
  }

  $raw = Get-Content -LiteralPath $PathValue -Raw
  $matches = [regex]::Matches($raw, '"(generatedAt|generated_at|asOfDate|latestMarketplaceDate|latest_marketplace_date|maxDate)"\s*:\s*"([^"]+)"')
  $best = $null
  foreach ($match in $matches) {
    $value = [string]$match.Groups[2].Value
    if ([string]::IsNullOrWhiteSpace($value)) {
      continue
    }
    $parsed = [DateTimeOffset]::MinValue
    if ([DateTimeOffset]::TryParse($value, [ref]$parsed)) {
      if ($null -eq $best -or $parsed -gt $best) {
        $best = $parsed
      }
    }
  }
  return $best
}

function Get-HealthMaxDate {
  param([string]$HealthPath)
  if (-not (Test-Path -LiteralPath $HealthPath)) {
    return ""
  }
  try {
    $health = Get-Content -LiteralPath $HealthPath -Raw | ConvertFrom-Json
    $publishAllowed = [bool]$health.publish.allowed
    if (-not $publishAllowed) {
      $reasons = @($health.publish.blockingReasons | Where-Object { $_ }) -join "; "
      throw "portal_sync_health blocks static publish: $reasons"
    }
    return [string]$health.freshness.maxDate
  } catch {
    throw "Failed to validate portal_sync_health before static publish: $($_.Exception.Message)"
  }
}

function Assert-LayerAuditAllowed {
  param([string]$LayerAuditPath)
  if (-not (Test-Path -LiteralPath $LayerAuditPath)) {
    return
  }
  try {
    $audit = Get-Content -LiteralPath $LayerAuditPath -Raw | ConvertFrom-Json
    $publishAllowed = [bool]$audit.publish.allowed
    if (-not $publishAllowed) {
      $reasons = @($audit.publish.blockingReasons | Where-Object { $_ }) -join "; "
      throw "portal_layer_freshness blocks static publish: $reasons"
    }
  } catch {
    throw "Failed to validate portal_layer_freshness before static publish: $($_.Exception.Message)"
  }
}

function Invoke-GitCommandResult {
  param([string[]]$Arguments)

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = New-Object System.Collections.Generic.List[string]
  try {
    $global:LASTEXITCODE = 0
    & $gitExe @Arguments 2>&1 | ForEach-Object {
      [void]$output.Add([string]$_)
    }
    $exitCode = if ($null -eq $LASTEXITCODE) {
      0
    } else {
      [int]$LASTEXITCODE
    }
    return [pscustomobject]@{
      ExitCode = $exitCode
      Output = [string[]]$output.ToArray()
    }
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

function Write-GitCommandOutput {
  param([string[]]$Lines)

  foreach ($line in @($Lines)) {
    if (-not [string]::IsNullOrWhiteSpace($line)) {
      Write-Host $line
    }
  }
}

function Invoke-GitCommand {
  param([string[]]$Arguments)

  $result = Invoke-GitCommandResult -Arguments $Arguments
  Write-GitCommandOutput -Lines $result.Output
  return [int]$result.ExitCode
}

function Invoke-StaticGitPush {
  param([string]$Reason = "")

  if ($NoPush) {
    return
  }

  $reasonText = if ([string]::IsNullOrWhiteSpace($Reason)) { "static data" } else { $Reason }
  Write-Output "[static-publish] git push origin main ($reasonText)."
  $gitExitCode = Invoke-GitCommand -Arguments @("-C", $resolvedDeployDir, "push", "origin", "main")
  if ($gitExitCode -ne 0) {
    throw "git push failed for static portal data."
  }
  $script:StaticPushAttempted = $true
}

function Sync-DeployBranch {
  param([string]$Reason = "")

  if ($NoPush) {
    return
  }

  $reasonText = if ([string]::IsNullOrWhiteSpace($Reason)) { "before static publish" } else { $Reason }
  Write-Output "[static-publish] git pull --rebase --autostash origin main ($reasonText)."
  $gitExitCode = Invoke-GitCommand -Arguments @("-C", $resolvedDeployDir, "pull", "--rebase", "--autostash", "origin", "main")
  if ($gitExitCode -ne 0) {
    throw "git pull --rebase failed for static portal data."
  }
}

function Assert-LiveHealthFresh {
  param([string]$ExpectedMaxDate)

  if ($NoPush -or [string]::IsNullOrWhiteSpace($LiveHealthUrl) -or [string]::IsNullOrWhiteSpace($ExpectedMaxDate) -or $LiveVerifyAttempts -le 0) {
    return
  }

  $delaySeconds = [Math]::Max(1, $LiveVerifyDelaySeconds)
  $lastMessage = ""
  for ($attempt = 1; $attempt -le $LiveVerifyAttempts; $attempt += 1) {
    try {
      $separator = if ($LiveHealthUrl.Contains("?")) { "&" } else { "?" }
      $cacheBustUrl = "{0}{1}t={2}" -f $LiveHealthUrl, $separator, ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
      $health = Invoke-RestMethod -Uri $cacheBustUrl -Method Get -TimeoutSec 25 -Headers @{ "Cache-Control" = "no-cache" }
      $liveMaxDate = [string]$health.freshness.maxDate
      $publishAllowed = [bool]$health.publish.allowed
      $generatedAt = [string]$health.generatedAt
      Write-Output "[static-publish] live health attempt $attempt/${LiveVerifyAttempts}: maxDate=$liveMaxDate; publishAllowed=$publishAllowed; expected=$ExpectedMaxDate"
      if ($publishAllowed -and -not [string]::IsNullOrWhiteSpace($liveMaxDate) -and $liveMaxDate -ge $ExpectedMaxDate) {
        $script:LiveHealthVerified = [ordered]@{
          ok = $true
          url = $LiveHealthUrl
          maxDate = $liveMaxDate
          expectedMaxDate = $ExpectedMaxDate
          generatedAt = $generatedAt
          attempts = $attempt
        }
        return
      }
      $lastMessage = "live maxDate '$liveMaxDate' is behind expected '$ExpectedMaxDate'"
    } catch {
      $lastMessage = [string]$_.Exception.Message
      Write-Warning "[static-publish] live health attempt $attempt/$LiveVerifyAttempts failed: $lastMessage"
    }

    if ($attempt -lt $LiveVerifyAttempts) {
      Start-Sleep -Seconds $delaySeconds
    }
  }

  throw "Live portal did not reach static health maxDate $ExpectedMaxDate after $LiveVerifyAttempts attempts: $lastMessage"
}

$resolvedSourceDir = Resolve-RepoPath -PathValue $SourceDir -DefaultValue ".altea-google-sheet-sync-output"
$resolvedDeployDir = Resolve-RepoPath -PathValue $DeployDir -DefaultValue ".codex-rollout-main"
$deployDataDir = Join-Path $resolvedDeployDir "data"
$gitExe = Resolve-GitPath -RequestedGitPath $GitPath
$manifestPath = Join-Path $repoRoot "scripts\portal-truth-manifest.json"
$script:StaticPushAttempted = $false
$script:LiveHealthVerified = $null

if (-not (Test-Path -LiteralPath $resolvedSourceDir)) {
  throw "Source data dir not found: $resolvedSourceDir"
}
if (-not (Test-Path -LiteralPath (Join-Path $resolvedDeployDir ".git"))) {
  throw "Deploy git repo not found: $resolvedDeployDir"
}
New-Item -ItemType Directory -Path $deployDataDir -Force | Out-Null

$healthMaxDate = Get-HealthMaxDate -HealthPath (Join-Path $resolvedSourceDir "portal_sync_health.json")
$layerAuditPath = Join-Path $resolvedSourceDir "portal_layer_freshness.json"
Assert-LayerAuditAllowed -LayerAuditPath $layerAuditPath
Sync-DeployBranch -Reason "before static data copy"

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Layer manifest not found: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

$publishMap = [ordered]@{}
$requiredSourceFiles = @{}
foreach ($source in @($manifest.sources)) {
  if ($null -ne $source.snapshot -and $false -eq [bool]$source.snapshot) {
    continue
  }
  $sourceFile = [string]$source.file
  if ([string]::IsNullOrWhiteSpace($sourceFile)) {
    throw "Source $($source.key) has no file in portal-truth-manifest.json"
  }
  $publishMap[$sourceFile] = $sourceFile
  if ([bool]$source.required) {
    $requiredSourceFiles[$sourceFile] = $true
  }
}

@(
  "portal_daily_intake.json",
  "portal_sync_health.json",
  "portal_daily_guard.json",
  "portal_layer_freshness.json"
) | ForEach-Object {
  $publishMap[$_] = $_
  $requiredSourceFiles[$_] = $true
}

$copied = @()
$skipped = @()
$missing = @()
$olderSkipped = @()

foreach ($entry in $publishMap.GetEnumerator()) {
  $sourcePath = Join-Path $resolvedSourceDir $entry.Key
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    $baseSourcePath = Join-Path (Join-Path $repoRoot "data") $entry.Key
    if (Test-Path -LiteralPath $baseSourcePath) {
      $sourcePath = $baseSourcePath
    }
  }
  $destPath = Join-Path $deployDataDir $entry.Value
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    $missing += $entry.Key
    if ($requiredSourceFiles.ContainsKey($entry.Key)) {
      throw "Required layer source file is missing: $($entry.Key)"
    }
    continue
  }

  if ((Test-Path -LiteralPath $destPath)) {
    $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
    $destHash = (Get-FileHash -LiteralPath $destPath -Algorithm SHA256).Hash
    if ($sourceHash -eq $destHash) {
      $skipped += $entry.Value
      continue
    }

    if (-not $ForceOlder) {
      $sourceStamp = Get-JsonStamp -PathValue $sourcePath
      $destStamp = Get-JsonStamp -PathValue $destPath
      if ($sourceStamp -and $destStamp -and $destStamp -gt $sourceStamp.AddMinutes(5)) {
        $olderSkipped += [ordered]@{
          file = $entry.Value
          sourceStamp = $sourceStamp.ToString("o")
          destStamp = $destStamp.ToString("o")
        }
        continue
      }
    }
  }

  if (-not $DryRun) {
    Copy-Item -LiteralPath $sourcePath -Destination $destPath -Force
  }
  $copied += $entry.Value
}

if ($olderSkipped.Count -gt 0) {
  $olderSkipped | ForEach-Object {
    Write-Warning "[static-publish] skipped older source for $($_.file): source=$($_.sourceStamp), deploy=$($_.destStamp)"
  }
}

if ($DryRun) {
  [ordered]@{
    dryRun = $true
    sourceDir = $resolvedSourceDir
    deployDir = $resolvedDeployDir
    copied = $copied
    skipped = $skipped
    missing = $missing
    olderSkipped = $olderSkipped
    healthMaxDate = $healthMaxDate
  } | ConvertTo-Json -Depth 8
  exit 0
}

if ($copied.Count -eq 0) {
  Write-Output "[static-publish] no static data changes to copy."
  Invoke-StaticGitPush -Reason "no file changes; checking unpublished commits"
  Assert-LiveHealthFresh -ExpectedMaxDate $healthMaxDate
  [ordered]@{
    ok = $true
    changed = $false
    pushAttempted = $script:StaticPushAttempted
    sourceDir = $resolvedSourceDir
    deployDir = $resolvedDeployDir
    copied = $copied
    skipped = $skipped
    missing = $missing
    olderSkipped = $olderSkipped
    healthMaxDate = $healthMaxDate
    liveHealth = $script:LiveHealthVerified
  } | ConvertTo-Json -Depth 8
  exit 0
}

$relativePaths = $copied | ForEach-Object { "data/$($_)" } | Select-Object -Unique
$gitAddArgs = @("-C", $resolvedDeployDir, "add", "--") + @($relativePaths)
$gitExitCode = Invoke-GitCommand -Arguments $gitAddArgs
if ($gitExitCode -ne 0) {
  throw "git add failed for static portal data."
}

$diffExit = Invoke-GitCommand -Arguments @("-C", $resolvedDeployDir, "diff", "--cached", "--quiet", "--", "data")
if ($diffExit -eq 0) {
  Write-Output "[static-publish] copied files produced no staged git diff."
  Invoke-StaticGitPush -Reason "no staged diff; checking unpublished commits"
  Assert-LiveHealthFresh -ExpectedMaxDate $healthMaxDate
  [ordered]@{
    ok = $true
    changed = $false
    pushAttempted = $script:StaticPushAttempted
    copied = $copied
    skipped = $skipped
    missing = $missing
    olderSkipped = $olderSkipped
    healthMaxDate = $healthMaxDate
    liveHealth = $script:LiveHealthVerified
  } | ConvertTo-Json -Depth 8
  exit 0
}
if ($diffExit -ne 1) {
  throw "git diff --cached failed for static portal data."
}

$message = if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
  if ([string]::IsNullOrWhiteSpace($healthMaxDate)) {
    "Update portal static data"
  } else {
    "Update portal static data to $healthMaxDate"
  }
} else {
  $CommitMessage
}

$gitExitCode = Invoke-GitCommand -Arguments @("-C", $resolvedDeployDir, "commit", "-m", $message)
if ($gitExitCode -ne 0) {
  throw "git commit failed for static portal data."
}

Invoke-StaticGitPush -Reason "new static data commit"
Assert-LiveHealthFresh -ExpectedMaxDate $healthMaxDate

[ordered]@{
  ok = $true
  changed = $true
  pushed = $script:StaticPushAttempted
  pushAttempted = $script:StaticPushAttempted
  commitMessage = $message
  sourceDir = $resolvedSourceDir
  deployDir = $resolvedDeployDir
  copied = $copied
  skipped = $skipped
  missing = $missing
  olderSkipped = $olderSkipped
  healthMaxDate = $healthMaxDate
  liveHealth = $script:LiveHealthVerified
} | ConvertTo-Json -Depth 8
