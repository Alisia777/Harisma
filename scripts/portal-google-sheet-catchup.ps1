param(
  [string]$EarliestRun = "10:05",
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

if (-not (Test-Path -LiteralPath $runnerPath)) {
  throw "Task runner not found: $runnerPath"
}

New-Item -ItemType Directory -Path $resolvedLogDir -Force | Out-Null

$hasSuccessfulRun = Get-ChildItem -LiteralPath $resolvedLogDir -Filter "scheduled-sync-${today}_*.log" -File -ErrorAction SilentlyContinue |
  Where-Object {
    Select-String -LiteralPath $_.FullName -Pattern "Scheduled portal sync finished with exit code 0." -Quiet -ErrorAction SilentlyContinue
  } |
  Select-Object -First 1

if ($hasSuccessfulRun) {
  exit 0
}

& $runnerPath -LogDir $resolvedLogDir
exit $LASTEXITCODE
