param(
  [string]$TaskName = "Portal KZ Product Leaderboard Friday",
  [string]$RunAt = "10:15",
  [ValidateSet("S4U", "Interactive")]
  [string]$LogonType = "S4U"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $PSScriptRoot "portal-kz-product-leaderboard-scheduled-run.ps1"

if (-not (Test-Path -LiteralPath $runnerPath)) {
  throw "Task runner not found: $runnerPath"
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$triggerTime = [DateTime]::Today.Add([TimeSpan]::Parse($RunAt))
$actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`""

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Friday -At $triggerTime
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType $LogonType -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun
$description = "Каждую пятницу обновляет КЗ product leaderboard из Google Sheets, пишет локальный JSON и загружает snapshot в портал."

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
