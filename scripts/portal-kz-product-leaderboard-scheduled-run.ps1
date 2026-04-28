param(
  [string]$LogDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$resolvedLogDir = if ($LogDir) { $LogDir } else { Join-Path $repoRoot ".altea-google-sheet-sync-output" }
New-Item -ItemType Directory -Path $resolvedLogDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = Join-Path $resolvedLogDir "scheduled-kz-leaderboard-$timestamp.log"
$syncScript = Join-Path $PSScriptRoot "portal-kz-product-leaderboard-sync.ps1"

function Write-LogLine {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  $line | Tee-Object -FilePath $logFile -Append
}

try {
  Write-LogLine "Scheduled KZ leaderboard sync started."
  & $syncScript 2>&1 | Tee-Object -FilePath $logFile -Append
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  Write-LogLine "Scheduled KZ leaderboard sync finished with exit code $exitCode."
  exit $exitCode
} catch {
  Write-LogLine "Scheduled KZ leaderboard sync failed: $($_.Exception.Message)"
  Write-LogLine $_.ScriptStackTrace
  exit 1
}
