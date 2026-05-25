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

function Add-LogContent {
  param([string]$Message)
  if ($null -eq $Message) {
    return
  }

  for ($attempt = 1; $attempt -le 5; $attempt += 1) {
    try {
      Add-Content -LiteralPath $logFile -Value $Message -Encoding UTF8 -ErrorAction Stop
      return
    } catch {
      if ($attempt -ge 5) {
        Write-Warning "Unable to write portal sync log after $attempt attempts: $($_.Exception.Message)"
        return
      }
      Start-Sleep -Seconds 1
    }
  }
}

function Write-LogLine {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Output $line
  Add-LogContent -Message $line
}

try {
  Write-LogLine "Scheduled portal sync started."
  $global:LASTEXITCODE = 0
  & $syncScript *>&1 | ForEach-Object {
    $line = [string]$_
    Write-Output $line
    Add-LogContent -Message $line
  }
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  Write-LogLine "Scheduled portal sync finished with exit code $exitCode."
  exit $exitCode
} catch {
  $message = [string]$_.Exception.Message
  $details = [string]$_
  if ($message -like "*another portal sync seems to be running*" -or $details -like "*another portal sync seems to be running*") {
    Write-LogLine "Scheduled portal sync skipped: another sync is already running."
    Write-LogLine $(if ($message) { $message } else { $details })
    exit 0
  }
  Write-LogLine "Scheduled portal sync failed: $message"
  Write-LogLine $_.ScriptStackTrace
  exit 1
}
