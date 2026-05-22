param(
  [string]$EarliestRun = "10:00",
  [string]$LogDir = "",
  [string]$LiveHealthUrl = "https://xn--80aocfomk2b.xn--p1ai/data/portal_sync_health.json"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $PSScriptRoot "portal-google-sheet-scheduled-run.ps1"
$resolvedLogDir = if ($LogDir) { $LogDir } else { Join-Path $repoRoot ".altea-google-sheet-sync-output" }
$today = Get-Date -Format "yyyy-MM-dd"
$cutoff = [DateTime]::Today.Add([TimeSpan]::Parse($EarliestRun))

if ((Get-Date) -lt $cutoff) {
  exit 0
}

function Test-HealthFileFreshEnough {
  param([string]$HealthPath)

  if (-not (Test-Path -LiteralPath $HealthPath)) {
    return $false
  }

  try {
    $health = Get-Content -LiteralPath $HealthPath -Raw | ConvertFrom-Json
    $maxDate = [string]$health.freshness.maxDate
    $publishAllowed = [bool]$health.publish.allowed
    $expectedDate = (Get-Date).Date.AddDays(-1).ToString("yyyy-MM-dd")
    return $publishAllowed -and -not [string]::IsNullOrWhiteSpace($maxDate) -and ($maxDate -ge $expectedDate)
  } catch {
    return $false
  }
}

function Test-LiveHealthFreshEnough {
  param([string]$Url)

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return $false
  }

  try {
    $separator = if ($Url.Contains("?")) { "&" } else { "?" }
    $cacheBustUrl = "{0}{1}t={2}" -f $Url, $separator, ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
    $health = Invoke-RestMethod -Uri $cacheBustUrl -Method Get -TimeoutSec 20 -Headers @{ "Cache-Control" = "no-cache" }
    $maxDate = [string]$health.freshness.maxDate
    $publishAllowed = [bool]$health.publish.allowed
    $expectedDate = (Get-Date).Date.AddDays(-1).ToString("yyyy-MM-dd")
    return $publishAllowed -and -not [string]::IsNullOrWhiteSpace($maxDate) -and ($maxDate -ge $expectedDate)
  } catch {
    return $false
  }
}

function Test-PortalDataFreshEnough {
  $localHealthPath = Join-Path $repoRoot "data\portal_sync_health.json"
  $staticHealthPath = Join-Path $repoRoot ".codex-minmax-publish\data\portal_sync_health.json"
  return (Test-HealthFileFreshEnough -HealthPath $localHealthPath) `
    -and (Test-HealthFileFreshEnough -HealthPath $staticHealthPath) `
    -and (Test-LiveHealthFreshEnough -Url $LiveHealthUrl)
}

if (Test-PortalDataFreshEnough) {
  exit 0
}

if (-not (Test-Path -LiteralPath $runnerPath)) {
  throw "Task runner not found: $runnerPath"
}

New-Item -ItemType Directory -Path $resolvedLogDir -Force | Out-Null

& $runnerPath -LogDir $resolvedLogDir
exit $LASTEXITCODE
