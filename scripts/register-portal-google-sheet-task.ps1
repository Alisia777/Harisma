param(
  [string]$TaskName = "Portal Google Sheet Sync 10AM",
  [string]$RunAt = "10:00",
  [ValidateSet("S4U", "Interactive")]
  [string]$LogonType = "S4U"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $PSScriptRoot "portal-google-sheet-scheduled-run.ps1"

if (-not (Test-Path -LiteralPath $runnerPath)) {
  throw "Task runner not found: $runnerPath"
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$triggerTime = [DateTime]::Today.Add([TimeSpan]::Parse($RunAt))
$actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`""

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType $LogonType -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun
$description = "Ежедневно обновляет портал из Google Sheets, сохраняет историю срезов по датам и пишет логи в .altea-google-sheet-sync-output."

$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $description
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

$registeredTask = Get-ScheduledTask -TaskName $TaskName
$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName

[pscustomobject]@{
  TaskName = $registeredTask.TaskName
  UserId = $registeredTask.Principal.UserId
  LogonType = $registeredTask.Principal.LogonType
  State = $registeredTask.State
  LastRunTime = $taskInfo.LastRunTime
  NextRunTime = $taskInfo.NextRunTime
  Action = $registeredTask.Actions.Execute
  Arguments = $registeredTask.Actions.Arguments
}
