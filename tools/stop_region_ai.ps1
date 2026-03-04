[CmdletBinding()]
param(
  [string]$WorkspaceRoot = "",
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
if ($Json) { $VerbosePreference = "SilentlyContinue" }

function Write-Info {
  param([Parameter(Mandatory = $true)][string]$Message)
  if (-not $Json) { Write-Output $Message }
}

function Test-ProcessAlive {
  param([int]$ProcessId)
  if ($ProcessId -le 0) { return $false }
  try {
    $p = Get-Process -Id $ProcessId -ErrorAction Stop
    return ($null -ne $p -and -not $p.HasExited)
  } catch {
    return $false
  }
}

function Stop-ProcessTree {
  param([Parameter(Mandatory = $true)][int]$RootPid)
  try {
    $all = Get-CimInstance Win32_Process -ErrorAction Stop
  } catch {
    try { Stop-Process -Id $RootPid -Force -ErrorAction SilentlyContinue } catch {}
    return
  }
  $childrenByParent = @{}
  foreach ($p in $all) {
    $ppid = [int]$p.ParentProcessId
    if (-not $childrenByParent.ContainsKey($ppid)) {
      $childrenByParent[$ppid] = New-Object System.Collections.Generic.List[int]
    }
    $childrenByParent[$ppid].Add([int]$p.ProcessId)
  }
  $toStop = New-Object System.Collections.Generic.List[int]
  $stack = New-Object System.Collections.Generic.Stack[int]
  $stack.Push($RootPid)
  while ($stack.Count -gt 0) {
    $id = $stack.Pop()
    if (-not $toStop.Contains($id)) { $toStop.Add($id) }
    if ($childrenByParent.ContainsKey($id)) {
      foreach ($cid in $childrenByParent[$id]) { $stack.Push($cid) }
    }
  }
  foreach ($procId in ($toStop | Sort-Object -Descending)) {
    try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch {}
  }
}

function Read-PidsFile {
  param([string]$PidsPath)
  if (-not (Test-Path -LiteralPath $PidsPath)) { return $null }
  try { return (Get-Content -LiteralPath $PidsPath -Raw | ConvertFrom-Json) } catch { return $null }
}

function Cleanup-RelatedProcesses {
  param(
    [string]$WorkspaceRoot,
    [string]$ExecRoot,
    [string]$OrchestratorOutLog,
    [string]$ExecutorOutLog
  )
  $targets = @()
  try {
    $all = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        $_.CommandLine -and
        $_.ProcessId -ne $PID -and
        ($_.Name -ieq "node.exe" -or $_.Name -ieq "python.exe" -or $_.Name -ieq "python3.exe")
      }
    $wsEsc = [Regex]::Escape([string]$WorkspaceRoot)
    $exEsc = [Regex]::Escape([string]$ExecRoot)
    $orchEsc = [Regex]::Escape([string]$OrchestratorOutLog)
    $execLogEsc = [Regex]::Escape([string]$ExecutorOutLog)
    foreach ($p in $all) {
      $cl = [string]$p.CommandLine
      if (
        ($wsEsc -and $cl -match $wsEsc) -or
        ($exEsc -and $cl -match $exEsc) -or
        ($orchEsc -and $cl -match $orchEsc) -or
        ($execLogEsc -and $cl -match $execLogEsc) -or
        ($cl -match 'apps[\\/]+orchestrator') -or
        ($cl -match 'apps[\\/]+executor_py[\\/]+executor\.py')
      ) {
        $targets += [int]$p.ProcessId
      }
    }
  } catch {}
  $killed = @()
  foreach ($tp in ($targets | Sort-Object -Unique)) {
    if (Test-ProcessAlive -ProcessId $tp) {
      Stop-ProcessTree -RootPid $tp
      $killed += $tp
    }
  }
  return @($killed | Sort-Object -Unique)
}

function Find-RelatedLiveProcesses {
  param(
    [string]$WorkspaceRoot,
    [string]$ExecRoot,
    [string]$OrchestratorOutLog,
    [string]$ExecutorOutLog
  )
  $matches = @()
  try {
    $all = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        $_.CommandLine -and
        $_.ProcessId -ne $PID -and
        ($_.Name -ieq "node.exe" -or $_.Name -ieq "python.exe" -or $_.Name -ieq "python3.exe")
      }
    $wsEsc = [Regex]::Escape([string]$WorkspaceRoot)
    $exEsc = [Regex]::Escape([string]$ExecRoot)
    $orchEsc = [Regex]::Escape([string]$OrchestratorOutLog)
    $execLogEsc = [Regex]::Escape([string]$ExecutorOutLog)
    foreach ($p in $all) {
      $cl = [string]$p.CommandLine
      if (
        ($wsEsc -and $cl -match $wsEsc) -or
        ($exEsc -and $cl -match $exEsc) -or
        ($orchEsc -and $cl -match $orchEsc) -or
        ($execLogEsc -and $cl -match $execLogEsc) -or
        ($cl -match 'apps[\\/]+orchestrator') -or
        ($cl -match 'apps[\\/]+executor_py[\\/]+executor\.py')
      ) {
        $matches += [ordered]@{
          pid = [int]$p.ProcessId
          name = [string]$p.Name
          command_line = $cl
        }
      }
    }
  } catch {}
  return @($matches)
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) { $WorkspaceRoot = Join-Path $env:TEMP "region_ai\\workspace" }
$WorkspaceRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot)
$pidsPath = Join-Path (Join-Path $WorkspaceRoot "pids") "region_ai.pids.json"

$result = [ordered]@{
  action = "stop"
  timestamp = (Get-Date).ToString("o")
  workspace_root = $WorkspaceRoot
  stopped = $true
  orchestrator_pid = 0
  executor_pid = 0
  remaining_related_processes = @()
  exit_code = 0
}

try {
  $pids = Read-PidsFile -PidsPath $pidsPath
  if (-not $pids) {
    $null = Cleanup-RelatedProcesses -WorkspaceRoot $WorkspaceRoot -ExecRoot (Join-Path $WorkspaceRoot "exec") -OrchestratorOutLog "" -ExecutorOutLog ""
    $remaining = Find-RelatedLiveProcesses -WorkspaceRoot $WorkspaceRoot -ExecRoot (Join-Path $WorkspaceRoot "exec") -OrchestratorOutLog "" -ExecutorOutLog ""
    if ($remaining.Count -gt 0) {
      $result.stopped = $false
      $result.remaining_related_processes = $remaining
      $result.exit_code = 1
      if (-not $Json) { Write-Output ("stop_remaining_processes: " + (($remaining | ConvertTo-Json -Compress -Depth 10))) }
    }
    Write-Info "already_stopped: true"
    if ($Json) { [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress)) }
    exit $result.exit_code
  }

  $orchPid = [int]($pids.orchestrator_pid | ForEach-Object { $_ })
  $execPid = [int]($pids.executor_pid | ForEach-Object { $_ })
  $workspaceFromFile = [string]$pids.workspace_root
  $execFromFile = [string]$pids.exec_root
  $orchOutLog = [string]$pids.orchestrator_out_log
  $execOutLog = [string]$pids.executor_out_log
  $result.orchestrator_pid = $orchPid
  $result.executor_pid = $execPid

  if (Test-ProcessAlive -ProcessId $orchPid) { Stop-ProcessTree -RootPid $orchPid }
  if (Test-ProcessAlive -ProcessId $execPid) { Stop-ProcessTree -RootPid $execPid }

  $null = Cleanup-RelatedProcesses -WorkspaceRoot $workspaceFromFile -ExecRoot $execFromFile -OrchestratorOutLog $orchOutLog -ExecutorOutLog $execOutLog

  $remaining = Find-RelatedLiveProcesses -WorkspaceRoot $workspaceFromFile -ExecRoot $execFromFile -OrchestratorOutLog $orchOutLog -ExecutorOutLog $execOutLog
  if (($remaining.Count -gt 0) -or (Test-ProcessAlive -ProcessId $orchPid) -or (Test-ProcessAlive -ProcessId $execPid)) {
    $result.stopped = $false
    $result.exit_code = 1
    $result.remaining_related_processes = $remaining
    if (-not $Json) {
      Write-Output ("stop_remaining_orchestrator_alive: " + (Test-ProcessAlive -ProcessId $orchPid))
      Write-Output ("stop_remaining_executor_alive: " + (Test-ProcessAlive -ProcessId $execPid))
      if ($remaining.Count -gt 0) { Write-Output ("stop_remaining_processes: " + (($remaining | ConvertTo-Json -Compress -Depth 10))) }
    }
  }

  $stoppedName = "region_ai.pids.stopped.{0}.json" -f (Get-Date -Format "yyyyMMdd_HHmmss")
  $stoppedPath = Join-Path (Split-Path $pidsPath -Parent) $stoppedName
  $archiveObj = [ordered]@{
    workspace_root = $workspaceFromFile
    exec_root = $execFromFile
    orchestrator_pid = $orchPid
    executor_pid = $execPid
    orchestrator_out_log = [string]$pids.orchestrator_out_log
    orchestrator_err_log = [string]$pids.orchestrator_err_log
    executor_out_log = [string]$pids.executor_out_log
    executor_err_log = [string]$pids.executor_err_log
    started_at = [string]$pids.started_at
    stopped_at = (Get-Date).ToString("o")
    repo_root = [string]$pids.repo_root
    git_sha = [string]$pids.git_sha
    script_version = [string]$pids.script_version
  }
  [System.IO.File]::WriteAllText($stoppedPath, ($archiveObj | ConvertTo-Json -Compress -Depth 10), [System.Text.UTF8Encoding]::new($false))
  Remove-Item -LiteralPath $pidsPath -Force -ErrorAction SilentlyContinue
  Write-Info ("pids_archived: " + $stoppedPath)
}
catch {
  $result.stopped = $false
  $result.exit_code = 1
  if (-not $Json) { Write-Output ("stop_failed: " + $_.Exception.Message) }
}

if ($Json) { [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress -Depth 10)) }
if ($result.exit_code -eq 0) { exit 0 } else { exit 1 }
