param(
  [string]$TaskName = "Portal Google Sheet Sync 10AM",
  [string]$RunAt = "10:00",
  [ValidateSet("S4U", "Interactive")]
  [string]$LogonType = "S4U",
  [ValidateSet("Highest", "Limited")]
  [string]$RunLevel = "Limited",
  [bool]$EnableLogonCatchup = $true,
  [string]$LogonCatchupDelay = "PT5M"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $PSScriptRoot "portal-google-sheet-scheduled-run.ps1"
$catchupPath = Join-Path $PSScriptRoot "portal-google-sheet-catchup.ps1"

if (-not (Test-Path -LiteralPath $runnerPath)) {
  throw "Task runner not found: $runnerPath"
}
if (-not (Test-Path -LiteralPath $catchupPath)) {
  throw "Catchup runner not found: $catchupPath"
}

function Get-TaskSafePath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  try {
    if (-not ("NativePathTools" -as [type])) {
      Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NativePathTools {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern uint GetShortPathName(string lpszLongPath, StringBuilder lpszShortPath, uint cchBuffer);
}
"@
    }
    $buffer = New-Object System.Text.StringBuilder 1024
    $length = [NativePathTools]::GetShortPathName($resolvedPath, $buffer, [uint32]$buffer.Capacity)
    if ($length -gt 0 -and $length -lt $buffer.Capacity) {
      return $buffer.ToString()
    }
  } catch {
    Write-Warning "Short path lookup failed for ${resolvedPath}: $($_.Exception.Message)"
  }

  return $resolvedPath
}

function New-PortalTaskSettings {
  New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -WakeToRun `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 6)
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$triggerTime = [DateTime]::Today.Add([TimeSpan]::Parse($RunAt))
$actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$catchupPath`" -EarliestRun `"$RunAt`""

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs -WorkingDirectory $repoRoot
$dailyTrigger = New-ScheduledTaskTrigger -Daily -At $triggerTime
$triggers = @($dailyTrigger)
if ($EnableLogonCatchup) {
  $logonTrigger = New-ScheduledTaskTrigger -AtLogOn
  $logonTrigger.Delay = $LogonCatchupDelay
  $triggers += $logonTrigger
}
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType $LogonType -RunLevel $RunLevel
$settings = New-PortalTaskSettings
$description = "Daily portal sync from Google Sheets. Early catch-up starts before the scheduled time are ignored; fresh data is not rebuilt twice."

$task = New-ScheduledTask -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Description $description
$registrationMode = "ScheduledTasks"
try {
  Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force -ErrorAction Stop | Out-Null
} catch {
  Write-Warning "Register-ScheduledTask failed: $($_.Exception.Message)"
  Write-Warning "Falling back to schtasks.exe with a short 8.3 script path."

  $registrationMode = "schtasks"
  $safeCatchupPath = Get-TaskSafePath -Path $catchupPath
  $safeRunAt = $RunAt.Trim('"')
  $taskRun = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $safeCatchupPath -EarliestRun $safeRunAt"
  if ($taskRun.Length -gt 261) {
    throw "schtasks /TR would be $($taskRun.Length) characters, over the 261 character limit: $taskRun"
  }

  $schtasksRunLevel = if ($RunLevel -eq "Highest") { "HIGHEST" } else { "LIMITED" }
  & schtasks.exe /Create /TN $TaskName /SC DAILY /ST $RunAt /TR $taskRun /F /RL $schtasksRunLevel | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "schtasks.exe failed with exit code $LASTEXITCODE"
  }

  try {
    Set-ScheduledTask -TaskName $TaskName -Settings $settings | Out-Null
  } catch {
    Write-Warning "Scheduled task was created, but applying advanced settings failed: $($_.Exception.Message)"
  }
}

$registeredTask = Get-ScheduledTask -TaskName $TaskName
$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName

[pscustomobject]@{
  TaskName = $registeredTask.TaskName
  RegistrationMode = $registrationMode
  UserId = $registeredTask.Principal.UserId
  LogonType = $registeredTask.Principal.LogonType
  State = $registeredTask.State
  LastRunTime = $taskInfo.LastRunTime
  NextRunTime = $taskInfo.NextRunTime
  TriggerCount = @($registeredTask.Triggers).Count
  StartWhenAvailable = $registeredTask.Settings.StartWhenAvailable
  MultipleInstances = $registeredTask.Settings.MultipleInstances
  Action = $registeredTask.Actions.Execute
  Arguments = $registeredTask.Actions.Arguments
}
