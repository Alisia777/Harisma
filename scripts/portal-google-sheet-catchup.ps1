param(
  [string]$EarliestRun = "10:00",
  [string]$LogDir = "",
  [string]$LiveHealthUrl = "https://xn--80aocfomk2b.xn--p1ai/data/portal_sync_health.json"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $PSScriptRoot "portal-google-sheet-scheduled-run.ps1"
$resolvedLogDir = if ($LogDir) { $LogDir } else { Join-Path $repoRoot ".altea-google-sheet-sync-output" }
$syncLockPath = Join-Path $repoRoot ".portal-google-sheet-sync.lock"
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

function Test-AnyHealthFileFreshEnough {
  param([string[]]$HealthPaths)

  foreach ($healthPath in $HealthPaths) {
    if (Test-HealthFileFreshEnough -HealthPath $healthPath) {
      return $true
    }
  }
  return $false
}

function Test-PortalDataFreshEnough {
  $localHealthPath = Join-Path $repoRoot "data\portal_sync_health.json"
  $staticHealthPaths = @(
    (Join-Path $repoRoot ".codex-rollout-main\data\portal_sync_health.json"),
    (Join-Path $repoRoot ".codex-minmax-publish\data\portal_sync_health.json")
  )
  return (Test-HealthFileFreshEnough -HealthPath $localHealthPath) `
    -and (Test-AnyHealthFileFreshEnough -HealthPaths $staticHealthPaths) `
    -and (Test-LiveHealthFreshEnough -Url $LiveHealthUrl)
}

function Test-SyncAlreadyRunning {
  if (-not (Test-Path -LiteralPath $syncLockPath)) {
    return $false
  }

  try {
    $lockItem = Get-Item -LiteralPath $syncLockPath -ErrorAction Stop
    $lockText = Get-Content -LiteralPath $syncLockPath -Raw -ErrorAction Stop
    $lockPayload = $null
    if (-not [string]::IsNullOrWhiteSpace($lockText)) {
      $lockPayload = $lockText | ConvertFrom-Json
    }

    $lockPid = 0
    if ($lockPayload -and $lockPayload.pid) {
      $lockPid = [int]$lockPayload.pid
    }
    if ($lockPid -le 0) {
      return $false
    }

    $lockProcess = Get-Process -Id $lockPid -ErrorAction SilentlyContinue
    $lockAgeHours = ((Get-Date) - $lockItem.LastWriteTime).TotalHours
    if ($lockProcess -and $lockAgeHours -lt 6) {
      Write-Output "[catchup] portal sync is already running; pid=$lockPid, lockAgeHours=$([math]::Round($lockAgeHours, 2))."
      return $true
    }
  } catch {
    return $false
  }

  return $false
}

if (Test-PortalDataFreshEnough) {
  exit 0
}

if (Test-SyncAlreadyRunning) {
  exit 0
}

if (-not (Test-Path -LiteralPath $runnerPath)) {
  throw "Task runner not found: $runnerPath"
}

New-Item -ItemType Directory -Path $resolvedLogDir -Force | Out-Null

& $runnerPath -LogDir $resolvedLogDir
exit $LASTEXITCODE
