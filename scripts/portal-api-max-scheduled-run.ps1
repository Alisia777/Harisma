param(
  [string]$LogDir = "",
  [string]$From = "",
  [string]$To = "",
  [string]$Platforms = "wb,ozon,ya,letu,megamarket,samokat",
  [switch]$Strict
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$resolvedLogDir = if ($LogDir) { $LogDir } else { Join-Path $repoRoot ".altea-google-sheet-sync-output" }
New-Item -ItemType Directory -Path $resolvedLogDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = Join-Path $resolvedLogDir "scheduled-api-max-sync-$timestamp.log"
$nodeExe = (Get-Command node -ErrorAction Stop).Source

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
        Write-Warning "Unable to write API max sync log after $attempt attempts: $($_.Exception.Message)"
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
  $arguments = @(
    "scripts/portal-api-max-sync.js",
    "sync",
    "--mode",
    "max",
    "--platforms",
    $Platforms
  )

  if ($From) {
    $arguments += "--from"
    $arguments += $From
  }

  if ($To) {
    $arguments += "--to"
    $arguments += $To
  }

  if ($Strict) {
    $arguments += "--strict"
  }

  Write-LogLine "Scheduled API max sync started."
  $global:LASTEXITCODE = 0
  & $nodeExe @arguments 2>&1 | ForEach-Object {
    $line = [string]$_
    Write-Output $line
    Add-LogContent -Message $line
  }
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
  Write-LogLine "Scheduled API max sync finished with exit code $exitCode."
  exit $exitCode
} catch {
  Write-LogLine "Scheduled API max sync failed: $($_.Exception.Message)"
  Write-LogLine $_.ScriptStackTrace
  exit 1
}
