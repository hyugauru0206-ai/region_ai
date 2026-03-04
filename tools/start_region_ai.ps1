[CmdletBinding()]
param(
  [string]$WorkspaceRoot = "",
  [string]$ExecRoot = "",
  [ValidateRange(1, 600)]
  [int]$ReadyTimeoutSec = 30,
  [switch]$ReuseRunning,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
if ($Json) { $VerbosePreference = "SilentlyContinue" }

function Write-Info {
  param([Parameter(Mandatory = $true)][string]$Message)
  if (-not $Json) { Write-Output $Message }
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

function Test-OrchestratorReady {
  param([string]$OrchestratorOutLog)
  if ([string]::IsNullOrWhiteSpace($OrchestratorOutLog)) { return $false }
  if (-not (Test-Path -LiteralPath $OrchestratorOutLog)) { return $false }
  $line = Select-String -Path $OrchestratorOutLog -Pattern '^\[orchestrator\] watching:' -ErrorAction SilentlyContinue | Select-Object -Last 1
  return ($null -ne $line)
}

function Resolve-PythonExe {
  $fromEnv = [string]$env:REGION_AI_PYTHON
  if (-not [string]::IsNullOrWhiteSpace($fromEnv) -and (Test-Path -LiteralPath $fromEnv)) { return $fromEnv }
  $cmdPy = Get-Command python -ErrorAction SilentlyContinue
  if ($cmdPy -and $cmdPy.Source) {
    $src = [string]$cmdPy.Source
    if ($src -notmatch 'WindowsApps\\python(\.exe)?$') { return $src }
  }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\\Python\\Python312\\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\\Python\\Python311\\python.exe"),
    "C:\\Python312\\python.exe",
    "C:\\Python311\\python.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path -LiteralPath $p) { return $p }
  }
  return ""
}

function Read-PidsFile {
  param([string]$PidsPath)
  if (-not (Test-Path -LiteralPath $PidsPath)) { return $null }
  try { return (Get-Content -LiteralPath $PidsPath -Raw | ConvertFrom-Json) } catch { return $null }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$scriptVersion = "2026-02-23.3"
$gitSha = ""
try {
  $gitSha = (& git -C $repoRoot rev-parse --short HEAD 2>$null | Out-String).Trim()
} catch { $gitSha = "" }
$orchestratorDir = Join-Path $repoRoot "apps\\orchestrator"
$executorScript = Join-Path $repoRoot "apps\\executor_py\\executor.py"
if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) { $WorkspaceRoot = Join-Path $env:TEMP "region_ai\\workspace" }
$WorkspaceRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot)
if ([string]::IsNullOrWhiteSpace($ExecRoot)) { $ExecRoot = Join-Path $WorkspaceRoot "exec" }
$ExecRoot = [System.IO.Path]::GetFullPath($ExecRoot)

New-Item -ItemType Directory -Path $WorkspaceRoot -Force | Out-Null
New-Item -ItemType Directory -Path $ExecRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $ExecRoot "requests") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $ExecRoot "results") -Force | Out-Null
$pidsDir = Join-Path $WorkspaceRoot "pids"
New-Item -ItemType Directory -Path $pidsDir -Force | Out-Null
$pidsPath = Join-Path $pidsDir "region_ai.pids.json"

$result = [ordered]@{
  action = "start"
  workspace_root = $WorkspaceRoot
  exec_root = $ExecRoot
  ready = $false
  reuse_running = $false
  orchestrator_pid = 0
  executor_pid = 0
  orchestrator_out_log = ""
  orchestrator_err_log = ""
  executor_out_log = ""
  executor_err_log = ""
  pids_file = $pidsPath
  started_at = (Get-Date).ToString("o")
  repo_root = $repoRoot
  git_sha = $gitSha
  script_version = $scriptVersion
  exit_code = 1
}

$startedOrchestrator = $null
$startedExecutor = $null
try {
  $existing = Read-PidsFile -PidsPath $pidsPath
  if ($ReuseRunning -and $existing) {
    $sameWorkspace = [string]$existing.workspace_root -eq $WorkspaceRoot
    $sameExec = [string]$existing.exec_root -eq $ExecRoot
    $orchPid = [int]($existing.orchestrator_pid | ForEach-Object { $_ })
    $execPid = [int]($existing.executor_pid | ForEach-Object { $_ })
    $orchAlive = Test-ProcessAlive -ProcessId $orchPid
    $execAlive = Test-ProcessAlive -ProcessId $execPid
    $ready = Test-OrchestratorReady -OrchestratorOutLog ([string]$existing.orchestrator_out_log)
    if ($sameWorkspace -and $sameExec -and $orchAlive -and $execAlive -and $ready) {
      $result.ready = $true
      $result.reuse_running = $true
      $result.orchestrator_pid = $orchPid
      $result.executor_pid = $execPid
      $result.orchestrator_out_log = [string]$existing.orchestrator_out_log
      $result.orchestrator_err_log = [string]$existing.orchestrator_err_log
      $result.executor_out_log = [string]$existing.executor_out_log
      $result.executor_err_log = [string]$existing.executor_err_log
      $result.started_at = [string]$existing.started_at
      $result.exit_code = 0
      Write-Verbose ("debug_reuse_running: true pid_orchestrator=" + $orchPid + " pid_executor=" + $execPid)
      if (-not $Json) {
        Write-Info ("workspace_root: " + $WorkspaceRoot)
        Write-Info ("exec_root: " + $ExecRoot)
        Write-Info ("reuse_running: True")
      }
      if ($Json) { [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress)) }
      exit 0
    }
    Write-Verbose "debug_reuse_running: false due to mismatch/alive/ready check"
  }

  if ($existing) {
    $oldOrchPid = [int]($existing.orchestrator_pid | ForEach-Object { $_ })
    $oldExecPid = [int]($existing.executor_pid | ForEach-Object { $_ })
    if (Test-ProcessAlive -ProcessId $oldOrchPid) { Stop-ProcessTree -RootPid $oldOrchPid }
    if (Test-ProcessAlive -ProcessId $oldExecPid) { Stop-ProcessTree -RootPid $oldExecPid }
  }

  $env:REGION_AI_WORKSPACE = $WorkspaceRoot
  $env:REGION_AI_EXEC_ROOT = $ExecRoot

  $tag = [Guid]::NewGuid().ToString("N")
  $outLog = Join-Path $WorkspaceRoot ("orchestrator.out.{0}.log" -f $tag)
  $errLog = Join-Path $WorkspaceRoot ("orchestrator.err.{0}.log" -f $tag)
  $execOutLog = Join-Path $WorkspaceRoot ("executor.out.{0}.log" -f $tag)
  $execErrLog = Join-Path $WorkspaceRoot ("executor.err.{0}.log" -f $tag)
  "" | Set-Content -LiteralPath $outLog -Encoding UTF8
  "" | Set-Content -LiteralPath $errLog -Encoding UTF8

  $pyExe = Resolve-PythonExe
  if ([string]::IsNullOrWhiteSpace($pyExe) -or (-not (Test-Path -LiteralPath $executorScript))) {
    throw "executor start failed: python or executor.py not found"
  }
  $startedExecutor = Start-Process -FilePath $pyExe -ArgumentList @($executorScript) -WorkingDirectory $repoRoot -RedirectStandardOutput $execOutLog -RedirectStandardError $execErrLog -PassThru -WindowStyle Hidden

  $qOut = '"' + $outLog + '"'
  $qErr = '"' + $errLog + '"'
  $startCmdBody = 'set "REGION_AI_WORKSPACE=' + $WorkspaceRoot.Replace('"', '""') + '" && set "REGION_AI_EXEC_ROOT=' + $ExecRoot.Replace('"', '""') + '" && node dist/index.js 1>>' + $qOut + ' 2>>' + $qErr
  $startedOrchestrator = Start-Process -FilePath $env:ComSpec -ArgumentList @("/d", "/s", "/c", $startCmdBody) -WorkingDirectory $orchestratorDir -PassThru -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds($ReadyTimeoutSec)
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
    if (Test-OrchestratorReady -OrchestratorOutLog $outLog) { $ready = $true; break }
    if ($startedOrchestrator.HasExited) { break }
  }
  if (-not $ready) { throw ("orchestrator not ready within " + $ReadyTimeoutSec + "s") }

  $result.ready = $true
  $result.reuse_running = $false
  $result.orchestrator_pid = [int]$startedOrchestrator.Id
  $result.executor_pid = [int]$startedExecutor.Id
  $result.orchestrator_out_log = $outLog
  $result.orchestrator_err_log = $errLog
  $result.executor_out_log = $execOutLog
  $result.executor_err_log = $execErrLog
  $result.started_at = (Get-Date).ToString("o")
  $result.exit_code = 0

  $persist = [ordered]@{
    workspace_root = $WorkspaceRoot
    exec_root = $ExecRoot
    orchestrator_pid = [int]$startedOrchestrator.Id
    executor_pid = [int]$startedExecutor.Id
    orchestrator_out_log = $outLog
    orchestrator_err_log = $errLog
    executor_out_log = $execOutLog
    executor_err_log = $execErrLog
    started_at = $result.started_at
    repo_root = $repoRoot
    git_sha = $gitSha
    script_version = $scriptVersion
  }
  [System.IO.File]::WriteAllText($pidsPath, ($persist | ConvertTo-Json -Compress -Depth 10), [System.Text.UTF8Encoding]::new($false))

  if (-not $Json) {
    Write-Info ("workspace_root: " + $WorkspaceRoot)
    Write-Info ("exec_root: " + $ExecRoot)
    Write-Info ("orchestrator_pid: " + $result.orchestrator_pid)
    Write-Info ("executor_pid: " + $result.executor_pid)
    Write-Info ("ready: True")
  }
}
catch {
  $msg = $_.Exception.Message
  if ([string]::IsNullOrWhiteSpace($msg)) { $msg = "unexpected error" }
  $result.ready = $false
  $result.exit_code = 1
  if (-not $Json) { Write-Output ("start_failed: " + $msg) }
  if ($startedOrchestrator -and (Test-ProcessAlive -ProcessId $startedOrchestrator.Id)) { Stop-ProcessTree -RootPid $startedOrchestrator.Id }
  if ($startedExecutor -and (Test-ProcessAlive -ProcessId $startedExecutor.Id)) { Stop-ProcessTree -RootPid $startedExecutor.Id }
}

if ($Json) { [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress -Depth 10)) }
if ($result.exit_code -eq 0) { exit 0 } else { exit 1 }
