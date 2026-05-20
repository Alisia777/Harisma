param(
  [string]$LogDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$resolvedLogDir = if ($LogDir) { $LogDir } else { Join-Path $repoRoot ".altea-google-sheet-sync-output" }
New-Item -ItemType Directory -Path $resolvedLogDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = Join-Path $resolvedLogDir "scheduled-sync-$timestamp.log"
$syncScript = Join-Path $PSScriptRoot "portal-google-sheet-sync.ps1"

function Write-LogLine {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  $line | Tee-Object -FilePath $logFile -Append
}

try {
  Write-LogLine "Scheduled portal sync started."
  & $syncScript 2>&1 | Tee-Object -FilePath $logFile -Append
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  Write-LogLine "Scheduled portal sync finished with exit code $exitCode."
  exit $exitCode
} catch {
  $message = [string]$_.Exception.Message
  if ($message -like "*another portal sync seems to be running*") {
    Write-LogLine "Scheduled portal sync skipped: another sync is already running."
    Write-LogLine $message
    exit 0
  }
  Write-LogLine "Scheduled portal sync failed: $message"
  Write-LogLine $_.ScriptStackTrace
  exit 1
}
