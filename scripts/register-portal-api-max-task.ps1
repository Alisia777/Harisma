param(
  [string]$TaskName = "Portal API Max Sync",
  [string]$RunAt = "04:30",
  [ValidateSet("S4U", "Interactive")]
  [string]$LogonType = "S4U",
  [ValidateSet("Highest", "Limited")]
  [string]$RunLevel = "Limited",
  [string]$From = "",
  [string]$Platforms = "wb,ozon,ya,letu,megamarket,samokat",
  [switch]$Strict
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$scheduledRun = Join-Path $PSScriptRoot "portal-api-max-scheduled-run.ps1"
if (-not (Test-Path -LiteralPath $scheduledRun)) {
  throw "Scheduled API max script is missing: $scheduledRun"
}

function Resolve-ShortPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  try {
    if (-not ("NativePathTools" -as [type])) {
      Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NativePathTools {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  public static extern uint GetShortPathName(string lpszLongPath, StringBuilder lpszShortPath, uint cchBuffer);
}
"@
    }
    $buffer = New-Object System.Text.StringBuilder 4096
    $length = [NativePathTools]::GetShortPathName($resolvedPath, $buffer, [uint32]$buffer.Capacity)
    if ($length -gt 0) {
      return $buffer.ToString()
    }
  } catch {
    Write-Warning "Short path resolution failed for '$resolvedPath': $($_.Exception.Message)"
  }
  return $resolvedPath
}

$triggerTime = [DateTime]::Today.Add([TimeSpan]::Parse($RunAt))
$scriptPathForTask = Resolve-ShortPath -Path $scheduledRun
$repoPathForTask = Resolve-ShortPath -Path $repoRoot

$actionArgs = "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$scriptPathForTask`" -Platforms `"$Platforms`""
if ($From) {
  $actionArgs += " -From `"$From`""
}
if ($Strict) {
  $actionArgs += " -Strict"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs -WorkingDirectory $repoPathForTask
$trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType $LogonType -RunLevel $RunLevel
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -WakeToRun `
  -ExecutionTimeLimit (New-TimeSpan -Hours 6)

$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Daily full-window marketplace API harvest for the brand portal. Uses User environment credentials and writes portal_api_max_sync.json."
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force -ErrorAction Stop | Out-Null

[pscustomobject]@{
  taskName = $TaskName
  runAt = $RunAt
  workingDirectory = $repoRoot
  script = $scheduledRun
  platforms = $Platforms
  from = $From
  strict = [bool]$Strict
} | ConvertTo-Json -Depth 4
