param(
  [string]$SourceDir = "",
  [string]$DeployDir = "",
  [string]$GitPath = "",
  [string]$CommitMessage = "",
  [switch]$NoPush,
  [switch]$DryRun,
  [switch]$ForceOlder
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

$resolvedSourceDir = Resolve-RepoPath -PathValue $SourceDir -DefaultValue ".altea-google-sheet-sync-output"
$resolvedDeployDir = Resolve-RepoPath -PathValue $DeployDir -DefaultValue ".codex-minmax-publish"
$deployDataDir = Join-Path $resolvedDeployDir "data"
$gitExe = Resolve-GitPath -RequestedGitPath $GitPath
$manifestPath = Join-Path $repoRoot "scripts\portal-layer-manifest.json"

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

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Layer manifest not found: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

$publishMap = [ordered]@{}
$requiredSourceFiles = @{}
foreach ($layer in @($manifest.layers)) {
  if ($false -eq [bool]$layer.publish) {
    continue
  }
  $sourceFile = [string]$layer.sourceFile
  if ([string]::IsNullOrWhiteSpace($sourceFile)) {
    $sourceFile = [string]$layer.file
  }
  if ([string]::IsNullOrWhiteSpace($sourceFile)) {
    $sourceFile = "$($layer.name).json"
  }
  $deployFile = [string]$layer.file
  if ([string]::IsNullOrWhiteSpace($deployFile)) {
    $deployFile = $sourceFile
  }
  $publishMap[$sourceFile] = $deployFile
  if ([bool]$layer.required) {
    $requiredSourceFiles[$sourceFile] = $true
  }
}

$copied = @()
$skipped = @()
$missing = @()
$olderSkipped = @()

foreach ($entry in $publishMap.GetEnumerator()) {
  $sourcePath = Join-Path $resolvedSourceDir $entry.Key
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
  [ordered]@{
    ok = $true
    changed = $false
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

$relativePaths = $copied | ForEach-Object { "data/$($_)" } | Select-Object -Unique
& $gitExe -C $resolvedDeployDir add -- $relativePaths
if ($LASTEXITCODE -ne 0) {
  throw "git add failed for static portal data."
}

& $gitExe -C $resolvedDeployDir diff --cached --quiet -- data
$diffExit = $LASTEXITCODE
if ($diffExit -eq 0) {
  Write-Output "[static-publish] copied files produced no staged git diff."
  [ordered]@{
    ok = $true
    changed = $false
    copied = $copied
    skipped = $skipped
    missing = $missing
    olderSkipped = $olderSkipped
    healthMaxDate = $healthMaxDate
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

& $gitExe -C $resolvedDeployDir commit -m $message
if ($LASTEXITCODE -ne 0) {
  throw "git commit failed for static portal data."
}

if (-not $NoPush) {
  & $gitExe -C $resolvedDeployDir push origin main
  if ($LASTEXITCODE -ne 0) {
    throw "git push failed for static portal data."
  }
}

[ordered]@{
  ok = $true
  changed = $true
  pushed = (-not $NoPush)
  commitMessage = $message
  sourceDir = $resolvedSourceDir
  deployDir = $resolvedDeployDir
  copied = $copied
  skipped = $skipped
  missing = $missing
  olderSkipped = $olderSkipped
  healthMaxDate = $healthMaxDate
} | ConvertTo-Json -Depth 8
