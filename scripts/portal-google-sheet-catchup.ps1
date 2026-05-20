param(
  [string]$EarliestRun = "10:00",
  [string]$LogDir = ""
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

function Test-PortalDataFreshEnough {
  $healthPath = Join-Path $repoRoot "data\portal_sync_health.json"
  if (-not (Test-Path -LiteralPath $healthPath)) {
    return $false
  }

  try {
    $health = Get-Content -LiteralPath $healthPath -Raw | ConvertFrom-Json
    $maxDate = [string]$health.freshness.maxDate
    $publishAllowed = [bool]$health.publish.allowed
    $expectedDate = (Get-Date).Date.AddDays(-1).ToString("yyyy-MM-dd")
    return $publishAllowed -and -not [string]::IsNullOrWhiteSpace($maxDate) -and ($maxDate -ge $expectedDate)
  } catch {
    return $false
  }
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
