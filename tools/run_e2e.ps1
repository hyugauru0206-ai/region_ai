[CmdletBinding()]
param(
  [string]$WorkspaceRoot = "",
  [ValidateSet("timeout_expected", "timeout_expected_strict", "timeout_expected_strict_ng", "success_pwsh", "artifact_pwsh", "artifact_parent_ng", "artifact_abs_ng", "artifact_unc_ng", "invalid_missing_id_ng", "invalid_bad_acceptance_ng", "regex_stdout_pwsh", "regex_stdout_ng_pwsh", "stderr_contains_pwsh", "stdout_not_contains_pwsh", "stderr_not_contains_ng_pwsh", "regex_compile_fail_ng", "regex_invalid_flags_ng", "regex_truncation", "stderr_target_ng", "patch_apply_success", "patch_apply_path_ng", "patch_apply_invalid_format_ng", "patch_apply_apply_fail_ng", "pipeline_success", "pipeline_step_fail_ng", "pipeline_invalid_ng", "file_write_success", "file_write_path_ng", "file_write_invalid_ng", "archive_zip_success", "archive_zip_path_ng", "archive_zip_invalid_ng", "accept_artifact_file_contains_success", "accept_artifact_file_contains_ng", "accept_artifact_file_regex_invalid_flags_ng", "accept_artifact_json_pointer_success", "accept_artifact_json_pointer_equals_ng", "accept_artifact_json_pointer_invalid_flags_ng", "accept_artifact_json_pointer_gte_success", "accept_artifact_json_pointer_gt_ng", "accept_artifact_json_pointer_gte_invalid_value_ng", "accept_zip_entries_success", "accept_zip_entries_ng", "accept_zip_entries_invalid_flags_ng", "run_meta_artifacts_success", "run_meta_artifacts_acceptance_ng", "run_meta_artifacts_invalid_ng", "recipe_generate_validate_json", "recipe_patch_apply_end_to_end", "recipe_release_bundle", "recipe_evidence_export_bundle", "recipe_ops_snapshot", "recipe_morning_brief_bundle", "recipe_pipeline_exec_fail_ng", "ui_api_smoke")]
  [string]$Mode = "timeout_expected",
  [ValidateSet("success", "failed")]
  [string]$ExpectStatus = "success",
  [string]$ExpectErrorCode = "",
  [switch]$NoVerify,
  [switch]$ReuseRunning,
  [switch]$NoEnsureExecutor,
  [ValidateRange(1, 600)]
  [int]$ReadyTimeoutSec = 30,
  [ValidateRange(1, 1800)]
  [int]$E2eTimeoutSec = 90,
  [string]$DesignPath = "",
  [switch]$SkipDesignGate,
  [switch]$IsolatedWorkspace,
  [switch]$AutoIsolate,
  [switch]$AllowForbiddenParallel,
  [ValidateRange(0, 600)]
  [int]$LockTimeoutSec = 0,
  [switch]$ForceUnlock,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Info {
  param([Parameter(Mandatory = $true)][string]$Message)
  if (-not $Json) {
    Write-Output $Message
  }
}

function Stop-ProcessTree {
  param(
    [Parameter(Mandatory = $true)][int]$RootPid
  )

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
    if (-not $toStop.Contains($id)) {
      $toStop.Add($id)
    }
    if ($childrenByParent.ContainsKey($id)) {
      foreach ($cid in $childrenByParent[$id]) {
        $stack.Push($cid)
      }
    }
  }

  $ordered = $toStop | Sort-Object -Descending
  foreach ($pid in $ordered) {
    try { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } catch {}
  }
}

function New-TaskId {
  param([string]$Prefix)
  return ($Prefix + "_" + (Get-Date -Format "yyyyMMdd_HHmmss"))
}

function Get-OrchestratorCandidates {
  param(
    [Parameter(Mandatory = $true)][string]$OrchestratorDir
  )

  $list = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -ieq "node.exe" -and
      $_.CommandLine -and
      (
        ($_.CommandLine -match 'dist[\\/]+index\.js') -or
        ($_.CommandLine -match 'run\\s+start:dist') -or
        (($_.CommandLine -match 'apps[\\/]+orchestrator') -and ($_.CommandLine -match 'node_modules[\\/]+tsx'))
      )
    } |
    Sort-Object ProcessId
  return @($list)
}

function Get-RunningOrchestratorPid {
  param(
    [Parameter(Mandatory = $true)][string]$OrchestratorDir
  )

  try {
    $cand = Get-OrchestratorCandidates -OrchestratorDir $OrchestratorDir
    if ($cand.Count -gt 0) {
      return [int]$cand[0].ProcessId
    }
  } catch {}

  return 0
}

function Parse-KeyValueLine {
  param(
    [Parameter(Mandatory = $true)][string]$Line,
    [Parameter(Mandatory = $true)][string]$Key
  )
  $prefix = $Key + ":"
  if ($Line.StartsWith($prefix)) {
    return $Line.Substring($prefix.Length).Trim()
  }
  return ""
}

function Escape-CmdDoubleQuotedValue {
  param([string]$Value)
  if ($null -eq $Value) { return "" }
  return $Value.Replace('"', '""')
}

function Quote-PowerShellArg {
  param([string]$Value)
  if ($null -eq $Value) { return "''" }
  return "'" + $Value.Replace("'", "''") + "'"
}

function Get-LatestEntries {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$Take = 3
  )
  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  return @(
    Get-ChildItem -LiteralPath $Path -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First $Take
  )
}

function Write-TimeoutDiagnosticSnapshot {
  param(
    [Parameter(Mandatory = $true)][string]$WorkspaceRoot,
    [Parameter(Mandatory = $true)][string]$ExecRoot,
    [Parameter(Mandatory = $true)][string]$TaskId,
    [Parameter(Mandatory = $true)][string]$OutLog,
    [Parameter(Mandatory = $true)][string]$ErrLog
  )

  Write-Verbose "debug_timeout_snapshot_begin: True"

  $queueRoot = Join-Path $WorkspaceRoot "queue"
  $taskPhases = @("pending", "running", "waiting", "done", "failed")
  foreach ($phase in $taskPhases) {
    $phaseDir = Join-Path $queueRoot $phase
    $found = @()
    if (Test-Path -LiteralPath $phaseDir) {
      $found = @(
        Get-ChildItem -LiteralPath $phaseDir -File -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -like ("*" + $TaskId + "*") }
      )
    }
    if ($found.Count -gt 0) {
      foreach ($f in $found) {
        Write-Verbose ("debug_timeout_task_location: phase=" + $phase + " path=" + $f.FullName)
      }
    } else {
      Write-Verbose ("debug_timeout_task_location: phase=" + $phase + " path=<none>")
    }
  }

  $eventsDir = Join-Path $queueRoot "events"
  $eventItems = @()
  if (Test-Path -LiteralPath $eventsDir) {
    $eventItems = @(
      Get-ChildItem -LiteralPath $eventsDir -File -Filter "result_*" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 3
    )
  }
  if ($eventItems.Count -gt 0) {
    foreach ($it in $eventItems) {
      Write-Verbose ("debug_timeout_events_recent: " + $it.FullName + " | " + $it.LastWriteTime.ToString("o"))
    }
  } else {
    Write-Verbose "debug_timeout_events_recent: <none>"
  }

  $reqItems = Get-LatestEntries -Path (Join-Path $ExecRoot "Requests") -Take 3
  if ($reqItems.Count -gt 0) {
    foreach ($it in $reqItems) { Write-Verbose ("debug_timeout_exec_requests_recent: " + $it.Name) }
  } else {
    Write-Verbose "debug_timeout_exec_requests_recent: <none>"
  }

  $resItems = Get-LatestEntries -Path (Join-Path $ExecRoot "Results") -Take 3
  if ($resItems.Count -gt 0) {
    foreach ($it in $resItems) { Write-Verbose ("debug_timeout_exec_results_recent: " + $it.Name) }
  } else {
    Write-Verbose "debug_timeout_exec_results_recent: <none>"
  }

  Write-Verbose "debug_timeout_orchestrator_out_tail_begin"
  if (Test-Path -LiteralPath $OutLog) {
    Get-Content -LiteralPath $OutLog -Tail 60 | ForEach-Object { Write-Verbose $_ }
  }
  Write-Verbose "debug_timeout_orchestrator_out_tail_end"

  Write-Verbose "debug_timeout_orchestrator_err_tail_begin"
  if (Test-Path -LiteralPath $ErrLog) {
    Get-Content -LiteralPath $ErrLog -Tail 60 | ForEach-Object { Write-Verbose $_ }
  }
  Write-Verbose "debug_timeout_orchestrator_err_tail_end"

  Write-Verbose "debug_timeout_snapshot_end: True"
}

function Repair-ExecRequestFiles {
  param(
    [Parameter(Mandatory = $true)][string]$RequestsDir
  )

  if (-not (Test-Path -LiteralPath $RequestsDir)) { return }

  $fixedBom = 0
  $movedInvalid = 0
  $files = Get-ChildItem -LiteralPath $RequestsDir -File -Filter "*.json" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime
  foreach ($f in $files) {
    try {
      $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
      if ($bytes.Length -eq 0) { continue }
      $text = ""
      $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191
      if ($hasBom) {
        $text = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
        [System.IO.File]::WriteAllText($f.FullName, $text, [System.Text.UTF8Encoding]::new($false))
        $fixedBom += 1
        Write-Verbose ("debug_exec_request_bom_fixed: " + $f.FullName)
      } else {
        $text = [System.Text.Encoding]::UTF8.GetString($bytes)
      }

      try {
        $null = $text | ConvertFrom-Json -ErrorAction Stop
      } catch {
        $invalidPath = $f.FullName + ".invalid"
        Move-Item -LiteralPath $f.FullName -Destination $invalidPath -Force
        $movedInvalid += 1
        Write-Verbose ("debug_exec_request_invalid_moved: " + $f.FullName + " -> " + $invalidPath)
      }
    } catch {
      Write-Verbose ("debug_exec_request_scan_failed: " + $f.FullName + " :: " + $_.Exception.Message)
    }
  }

  if (($fixedBom -gt 0) -or ($movedInvalid -gt 0)) {
    Write-Verbose ("debug_exec_request_repair_summary: fixed_bom=" + $fixedBom + " moved_invalid=" + $movedInvalid)
  }
}

function Resolve-PythonExe {
  function Test-PythonExecutable {
    param([string]$ExePath)
    if ([string]::IsNullOrWhiteSpace($ExePath)) { return $false }
    if (-not (Test-Path -LiteralPath $ExePath)) { return $false }
    try {
      $txt = (& $ExePath -c "import sys;print(sys.version_info[0])" 2>$null | Out-String).Trim()
      if ($LASTEXITCODE -ne 0) { return $false }
      return $txt -eq "3"
    } catch {
      return $false
    }
  }

  $fromEnv = [string]$env:REGION_AI_PYTHON
  if (-not [string]::IsNullOrWhiteSpace($fromEnv) -and (Test-Path -LiteralPath $fromEnv) -and (Test-PythonExecutable -ExePath $fromEnv)) {
    return $fromEnv
  }
  $cmdPy = Get-Command python -ErrorAction SilentlyContinue
  if ($cmdPy -and $cmdPy.Source) {
    $source = [string]$cmdPy.Source
    if ($source -notmatch 'WindowsApps\\python(\.exe)?$') {
      if (Test-PythonExecutable -ExePath $source) {
        return $source
      }
    }
  }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\\Python\\Python312\\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\\Python\\Python311\\python.exe"),
    "C:\\Python312\\python.exe",
    "C:\\Python311\\python.exe"
  )
  foreach ($p in $candidates) {
    if (Test-PythonExecutable -ExePath $p) { return $p }
  }
  return ""
}

function Resolve-DesignPathForGate {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [string]$InputPath
  )
  if (-not [string]::IsNullOrWhiteSpace($InputPath)) {
    if ([System.IO.Path]::IsPathRooted($InputPath)) { return $InputPath }
    return (Join-Path $RepoRoot $InputPath)
  }
  $latestPath = Join-Path $RepoRoot "docs\\design\\LATEST.txt"
  if (-not (Test-Path -LiteralPath $latestPath)) {
    throw ("design latest pointer not found: " + $latestPath)
  }
  $line = (Get-Content -LiteralPath $latestPath -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($line)) {
    throw ("design latest pointer empty: " + $latestPath)
  }
  $parts = $line -split "\|"
  $candidate = $parts[0].Trim()
  if ([string]::IsNullOrWhiteSpace($candidate)) {
    throw ("design latest pointer invalid: " + $latestPath)
  }
  if ([System.IO.Path]::IsPathRooted($candidate)) {
    return $candidate
  }
  return (Join-Path $RepoRoot $candidate)
}

function Invoke-DesignGate {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$ResolvedDesignPath
  )
  $psExe = Join-Path $env:WINDIR "System32\\WindowsPowerShell\\v1.0\\powershell.exe"
  $gateScript = Join-Path $RepoRoot "tools\\design_gate.ps1"
  if (-not (Test-Path -LiteralPath $gateScript)) {
    throw ("design gate script not found: " + $gateScript)
  }
  $gateOutput = @(& $psExe -NoProfile -ExecutionPolicy Bypass -File $gateScript -DesignPath $ResolvedDesignPath 2>&1)
  $gateExit = $LASTEXITCODE
  foreach ($l in $gateOutput) {
    $line = [string]$l
    if (-not [string]::IsNullOrWhiteSpace($line)) {
      Write-Verbose ("debug_design_gate: " + $line)
    }
  }
  if ($gateExit -ne 0) {
    $joined = ($gateOutput | ForEach-Object { [string]$_ }) -join " | "
    throw ("design_gate failed for '" + $ResolvedDesignPath + "': " + $joined)
  }
}

function Invoke-WhiteboardAppliedGate {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$ResolvedDesignPath
  )
  $psExe = Join-Path $env:WINDIR "System32\\WindowsPowerShell\\v1.0\\powershell.exe"
  $wbScript = Join-Path $RepoRoot "tools\\whiteboard_update.ps1"
  if (-not (Test-Path -LiteralPath $wbScript)) {
    throw ("whiteboard update script not found: " + $wbScript)
  }
  $wbOutput = @(& $psExe -NoProfile -ExecutionPolicy Bypass -File $wbScript -DesignPath $ResolvedDesignPath -DryRun -RequireApplied -Json 2>&1)
  $wbExit = $LASTEXITCODE
  foreach ($l in $wbOutput) {
    $line = [string]$l
    if (-not [string]::IsNullOrWhiteSpace($line)) {
      Write-Verbose ("debug_whiteboard_gate: " + $line)
    }
  }
  if ($wbExit -ne 0) {
    $joined = ($wbOutput | ForEach-Object { [string]$_ }) -join " | "
    throw ("whiteboard gate failed for '" + $ResolvedDesignPath + "': " + $joined)
  }
}

function Test-ProcessAlive {
  param([int]$ProcessId)
  if ($ProcessId -le 0) { return $false }
  try {
    $null = Get-Process -Id $ProcessId -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Read-LockOwner {
  param([string]$OwnerFile)
  if (-not (Test-Path -LiteralPath $OwnerFile)) { return $null }
  try {
    return (Get-Content -LiteralPath $OwnerFile -Raw | ConvertFrom-Json -ErrorAction Stop)
  } catch {
    return $null
  }
}

function Write-LockOwner {
  param(
    [Parameter(Mandatory = $true)][string]$OwnerFile,
    [Parameter(Mandatory = $true)][string]$WorkspaceRoot,
    [Parameter(Mandatory = $true)][string]$ExecRoot,
    [Parameter(Mandatory = $true)][string]$Mode,
    [Parameter(Mandatory = $true)][bool]$GateRequired
  )
  $owner = [ordered]@{
    pid = $PID
    started_at = (Get-Date).ToString("o")
    commandline = [Environment]::CommandLine
    workspace_root = $WorkspaceRoot
    exec_root = $ExecRoot
    mode = $Mode
    gate_required = $GateRequired
  }
  ($owner | ConvertTo-Json -Compress) | Set-Content -LiteralPath $OwnerFile -Encoding UTF8
}

function Try-AcquireWorkspaceLock {
  param(
    [Parameter(Mandatory = $true)][string]$LockDir,
    [Parameter(Mandatory = $true)][string]$WorkspaceRoot,
    [Parameter(Mandatory = $true)][string]$ExecRoot,
    [Parameter(Mandatory = $true)][string]$Mode,
    [Parameter(Mandatory = $true)][bool]$GateRequired,
    [Parameter(Mandatory = $true)][int]$TimeoutSec,
    [Parameter(Mandatory = $true)][bool]$ForceUnlock
  )

  $ownerFile = Join-Path $LockDir "owner.json"
  $deadline = (Get-Date).AddSeconds([Math]::Max(0, $TimeoutSec))
  while ($true) {
    try {
      New-Item -ItemType Directory -Path $LockDir -ErrorAction Stop | Out-Null
      Write-LockOwner -OwnerFile $ownerFile -WorkspaceRoot $WorkspaceRoot -ExecRoot $ExecRoot -Mode $Mode -GateRequired $GateRequired
      return @{
        acquired = $true
        reason = "lock_acquired"
        owner_pid = $PID
        owner_mode = $Mode
        owner_gate_required = $GateRequired
      }
    } catch {
      $owner = Read-LockOwner -OwnerFile $ownerFile
      $ownerPid = 0
      if ($owner -and $owner.pid) { $ownerPid = [int]$owner.pid }
      $ownerMode = ""
      if ($owner -and $owner.mode) { $ownerMode = [string]$owner.mode }
      $ownerGateRequired = $true
      if ($owner -and ($owner.PSObject.Properties.Name -contains "gate_required")) {
        $ownerGateRequired = [bool]$owner.gate_required
      }
      $ownerStartedAt = ""
      if ($owner -and $owner.started_at) { $ownerStartedAt = [string]$owner.started_at }
      $ownerCommandline = ""
      if ($owner -and $owner.commandline) { $ownerCommandline = [string]$owner.commandline }

      $reclaimReason = ""
      if ($ForceUnlock) {
        $reclaimReason = "force_unlock"
      } elseif (-not (Test-Path -LiteralPath $ownerFile)) {
        $reclaimReason = "stale_lock_owner_missing"
      } elseif ($ownerPid -le 0) {
        $reclaimReason = "stale_lock_owner_invalid"
      } elseif (($ownerPid -gt 0) -and (-not (Test-ProcessAlive -ProcessId $ownerPid))) {
        $reclaimReason = "stale_lock_pid_dead"
      }

      if (-not [string]::IsNullOrWhiteSpace($reclaimReason)) {
        try {
          Remove-Item -LiteralPath $LockDir -Recurse -Force -ErrorAction Stop
          Write-Verbose ("debug_workspace_lock_reclaimed: " + $LockDir + " reason=" + $reclaimReason + " owner_pid=" + $ownerPid)
          continue
        } catch {
          Write-Verbose ("debug_workspace_lock_reclaim_failed: " + $LockDir + " reason=" + $_.Exception.Message)
        }
      }

      if ((Get-Date) -ge $deadline) {
        return @{
          acquired = $false
          reason = "lock_busy"
          owner_pid = $ownerPid
          owner_mode = $ownerMode
          owner_gate_required = $ownerGateRequired
          owner_started_at = $ownerStartedAt
          owner_commandline = $ownerCommandline
        }
      }
      Start-Sleep -Milliseconds 250
    }
  }
}

function Get-ForbiddenParallelReason {
  param(
    [Parameter(Mandatory = $true)][string]$CurrentMode,
    [Parameter(Mandatory = $true)][bool]$CurrentGateRequired,
    [string]$OwnerMode = "",
    [bool]$OwnerGateRequired = $true
  )
  $gateModes = @("timeout_expected", "timeout_expected_strict", "timeout_expected_strict_ng")
  if ($CurrentGateRequired -and (-not $OwnerGateRequired)) {
    return "gate_required_vs_dev_forbidden_parallel"
  }
  if ((-not $CurrentGateRequired) -and $OwnerGateRequired) {
    return "dev_vs_gate_required_forbidden_parallel"
  }
  if (($gateModes -contains $CurrentMode) -and ($gateModes -contains $OwnerMode)) {
    if (($CurrentMode -eq "timeout_expected" -and $OwnerMode -eq "timeout_expected_strict") -or ($CurrentMode -eq "timeout_expected_strict" -and $OwnerMode -eq "timeout_expected")) {
      return "auto_vs_strict_forbidden_parallel"
    }
    return "e2e_gate_modes_forbidden_parallel"
  }
  return "workspace_busy_forbidden_parallel"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$orchestratorDir = Join-Path $repoRoot "apps\\orchestrator"
$queueScript = Join-Path $repoRoot "tools\\queue_task_from_template.ps1"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
  if ($AutoIsolate -and -not $IsolatedWorkspace) {
    $IsolatedWorkspace = $true
  }
  if ($IsolatedWorkspace) {
    $isolationId = "run_" + (Get-Date -Format "yyyyMMdd_HHmmssfff") + "_" + ([Guid]::NewGuid().ToString("N").Substring(0, 6))
    $WorkspaceRoot = Join-Path $env:TEMP ("region_ai\\workspaces\\" + $isolationId + "\\workspace")
  } else {
    $WorkspaceRoot = Join-Path $env:TEMP "region_ai\\workspace"
  }
}
$WorkspaceRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot)
New-Item -ItemType Directory -Path $WorkspaceRoot -Force | Out-Null
$ExecRoot = Join-Path $WorkspaceRoot "exec"
New-Item -ItemType Directory -Path (Join-Path $ExecRoot "requests") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $ExecRoot "results") -Force | Out-Null
Repair-ExecRequestFiles -RequestsDir (Join-Path $ExecRoot "requests")

$env:REGION_AI_WORKSPACE = $WorkspaceRoot
$env:REGION_AI_EXEC_ROOT = $ExecRoot
$env:REGION_AI_WORKSPACE_SELECTED = $WorkspaceRoot
$runLogTag = [Guid]::NewGuid().ToString("N")
$outLog = Join-Path $WorkspaceRoot ("orchestrator.out.{0}.log" -f $runLogTag)
$errLog = Join-Path $WorkspaceRoot ("orchestrator.err.{0}.log" -f $runLogTag)
$executorOutLog = Join-Path $WorkspaceRoot ("executor.out.{0}.log" -f $runLogTag)
$executorErrLog = Join-Path $WorkspaceRoot ("executor.err.{0}.log" -f $runLogTag)

Write-Info ("workspace_root: " + $WorkspaceRoot)
Write-Info ("exec_root: " + $ExecRoot)
Write-Verbose ("debug_pwd: " + (Get-Location).Path)
Write-Verbose ("debug_repo_root: " + $repoRoot)
Write-Verbose ("debug_apps_orchestrator_dir: " + $orchestratorDir)
Write-Verbose ("debug_env_REGION_AI_WORKSPACE: " + [string]$env:REGION_AI_WORKSPACE)
Write-Verbose ("debug_env_REGION_AI_EXEC_ROOT: " + [string]$env:REGION_AI_EXEC_ROOT)
Write-Verbose ("debug_orchestrator_out_log: " + $outLog)
Write-Verbose ("debug_orchestrator_err_log: " + $errLog)
Write-Verbose ("debug_executor_out_log: " + $executorOutLog)
Write-Verbose ("debug_executor_err_log: " + $executorErrLog)

$resultObj = [ordered]@{
  workspace_root = $WorkspaceRoot
  orchestrator_pid = 0
  ready = $false
  mode = $Mode
  task_id = ""
  expect_status = $ExpectStatus.ToLowerInvariant()
  expect_error_code = $ExpectErrorCode
  result_status = ""
  result_error_code = ""
  timestamp = (Get-Date).ToString("o")
  exit_code = 1
  reuse_running = $false
  gate_required = $true
  gate_passed = $false
  whiteboard_required = $true
  whiteboard_passed = $false
  gate_phase = "design_gate"
  lock_mode = if ($IsolatedWorkspace) { "isolated" } else { "workspace_lock" }
  lock_acquired = $false
  lock_path = (Join-Path $WorkspaceRoot "locks\\run_e2e.lock")
  lock_owner_pid = $null
  lock_owner_mode = ""
  lock_owner_gate_required = $null
  forbidden_parallel = $false
  forbidden_parallel_reason = ""
  hint = ""
  design_path = ""
  design_id = ""
  final = "FAIL"
  phase = "init"
  reason = ""
  paths = [ordered]@{
    repo_root = $repoRoot
    apps_orchestrator_dir = $orchestratorDir
    workspace_root = $WorkspaceRoot
    exec_root = $ExecRoot
    orchestrator_out_log = $outLog
    orchestrator_err_log = $errLog
    executor_out_log = $executorOutLog
    executor_err_log = $executorErrLog
    lock_path = (Join-Path $WorkspaceRoot "locks\\run_e2e.lock")
    design_path = ""
    queue_result_file = ""
    queue_artifacts_file = ""
  }
}

$proc = $null
$startedByScript = $false
$executorProc = $null
$startedExecutorByScript = $false
$ready = $false
$watchingLine = ""
$reason = ""
$e2eExit = 1
$resultFile = ""
$artifactsFile = ""
$dashboardPath = Join-Path $WorkspaceRoot "status\\dashboard.md"
$errorsBlockLines = New-Object System.Collections.Generic.List[string]
$timeoutSnapshotWritten = $false
$lockPath = $resultObj.lock_path
$lockAcquired = $false
$lockOwnerPid = 0
$lockOwnerMode = ""
$lockOwnerGateRequired = $true
$currentGateRequired = -not $SkipDesignGate

try {
  $resultObj.phase = "workspace_lock"
  $lockResult = Try-AcquireWorkspaceLock -LockDir $lockPath -WorkspaceRoot $WorkspaceRoot -ExecRoot $ExecRoot -Mode $Mode -GateRequired $currentGateRequired -TimeoutSec $LockTimeoutSec -ForceUnlock $ForceUnlock.IsPresent
  $lockAcquired = [bool]$lockResult.acquired
  $lockOwnerPid = [int]$lockResult.owner_pid
  $lockOwnerMode = [string]$lockResult.owner_mode
  if ($lockResult.PSObject.Properties.Name -contains "owner_gate_required") {
    $lockOwnerGateRequired = [bool]$lockResult.owner_gate_required
  }
  $resultObj.lock_acquired = $lockAcquired
  $resultObj.lock_owner_pid = if ($lockOwnerPid -gt 0) { $lockOwnerPid } else { $null }
  $resultObj.lock_owner_mode = $lockOwnerMode
  $resultObj.lock_owner_gate_required = $lockOwnerGateRequired
  if (-not $lockAcquired) {
    $forbiddenReason = Get-ForbiddenParallelReason -CurrentMode $Mode -CurrentGateRequired $currentGateRequired -OwnerMode $lockOwnerMode -OwnerGateRequired $lockOwnerGateRequired
    if (-not $AllowForbiddenParallel) {
      $resultObj.forbidden_parallel = $true
      $resultObj.forbidden_parallel_reason = $forbiddenReason
      $resultObj.hint = "wait/retry, stop current run, or use -IsolatedWorkspace (or -AutoIsolate). override only with -AllowForbiddenParallel."
      throw ("forbidden parallel: " + $forbiddenReason + " path=" + $lockPath + " owner_pid=" + $lockOwnerPid + " owner_mode=" + $lockOwnerMode + " hint=use -IsolatedWorkspace")
    }
    throw ("workspace lock busy: lock_busy path=" + $lockPath + " owner_pid=" + $lockOwnerPid + " owner_mode=" + $lockOwnerMode)
  }
  Write-Info ("workspace_lock: ACQUIRED path=" + $lockPath)
  Write-Verbose ("debug_workspace_lock_acquired: " + $lockPath + " owner_pid=" + $lockOwnerPid)

  $resultObj.phase = "design_gate"
  if (-not $SkipDesignGate) {
    $resolvedDesignPath = Resolve-DesignPathForGate -RepoRoot $repoRoot -InputPath $DesignPath
    $resultObj.paths.design_path = $resolvedDesignPath
    $resultObj.design_path = $resolvedDesignPath
    $resultObj.design_id = [System.IO.Path]::GetFileNameWithoutExtension($resolvedDesignPath)
    Write-Verbose ("debug_design_path: " + $resolvedDesignPath)
    Invoke-DesignGate -RepoRoot $repoRoot -ResolvedDesignPath $resolvedDesignPath
    $resultObj.gate_passed = $true
    $resultObj.phase = "whiteboard_gate"
    Invoke-WhiteboardAppliedGate -RepoRoot $repoRoot -ResolvedDesignPath $resolvedDesignPath
    $resultObj.whiteboard_passed = $true
    Write-Info "design_gate: PASS"
    Write-Info "whiteboard_gate: PASS"
  } else {
    $resultObj.gate_required = $false
    $resultObj.gate_passed = $null
    $resultObj.whiteboard_required = $false
    $resultObj.whiteboard_passed = $null
    $resultObj.gate_phase = "skipped"
    Write-Info "design_gate: SKIP"
    Write-Verbose "debug_design_gate_skipped: true"
  }

  $resultObj.phase = "bootstrap"
  if (-not $NoEnsureExecutor) {
    $pyExe = Resolve-PythonExe
    $executorScript = Join-Path $repoRoot "apps\\executor_py\\executor.py"
    if (-not [string]::IsNullOrWhiteSpace($pyExe) -and (Test-Path -LiteralPath $executorScript)) {
      Write-Verbose ("debug_python_exe: " + $pyExe)
      $env:REGION_AI_EXEC_ROOT = $ExecRoot
      $executorProc = Start-Process -FilePath $pyExe -ArgumentList @($executorScript) -WorkingDirectory $repoRoot -RedirectStandardOutput $executorOutLog -RedirectStandardError $executorErrLog -PassThru -WindowStyle Hidden
      $startedExecutorByScript = $true
      Write-Info ("executor_pid: " + $executorProc.Id)
      Write-Verbose ("debug_executor_pid: " + $executorProc.Id)
    } else {
      Write-Info "executor_pid: 0"
      Write-Verbose "debug_executor_start_skipped: python or executor script not found"
    }
  }

  if (-not $NoVerify) {
    $resultObj.phase = "verify"
    Push-Location $orchestratorDir
    try {
      & npm.cmd run verify
      if ($LASTEXITCODE -ne 0) {
        throw "verify failed"
      }
    } finally {
      Pop-Location
    }
  }

  $canReuse = $false
  $reusePid = 0
  if ($ReuseRunning) {
    $hasWatching = $false
    $workspaceLine = ""
    $execRootLine = ""
    if (Test-Path -LiteralPath $outLog) {
      $watchLineObj = Select-String -Path $outLog -Pattern '^\[orchestrator\] watching:' -ErrorAction SilentlyContinue | Select-Object -Last 1
      $hasWatching = $watchLineObj -ne $null
      $workspaceLineObj = Select-String -Path $outLog -Pattern '^\[orchestrator\] workspace=' -ErrorAction SilentlyContinue | Select-Object -Last 1
      if ($workspaceLineObj) { $workspaceLine = $workspaceLineObj.Line }
      $execRootLineObj = Select-String -Path $outLog -Pattern '^\[orchestrator\] exec_root=' -ErrorAction SilentlyContinue | Select-Object -Last 1
      if ($execRootLineObj) { $execRootLine = $execRootLineObj.Line }
    }
    $hasSameWorkspace = (-not [string]::IsNullOrWhiteSpace($workspaceLine)) -and ($workspaceLine -match [Regex]::Escape($WorkspaceRoot))
    $hasSameExecRoot = (-not [string]::IsNullOrWhiteSpace($execRootLine)) -and ($execRootLine -match [Regex]::Escape($ExecRoot))
    $runningPid = Get-RunningOrchestratorPid -OrchestratorDir $orchestratorDir
    if ($hasWatching -and $hasSameWorkspace -and $hasSameExecRoot -and $runningPid -gt 0) {
      $canReuse = $true
      $reusePid = $runningPid
      Write-Info ("reuse_running: True pid=" + $reusePid)
      Write-Verbose ("debug_reuse_running_reason: watching+workspace+exec_root matched pid=" + $reusePid)
    }
  }
  $resultObj.reuse_running = [bool]$canReuse

  if ($canReuse) {
    $proc = $null
  } else {
    $resultObj.phase = "start_orchestrator"
    $oldCandidates = Get-OrchestratorCandidates -OrchestratorDir $orchestratorDir
    foreach ($old in $oldCandidates) {
      Stop-ProcessTree -RootPid ([int]$old.ProcessId)
    }

    "" | Set-Content -LiteralPath $outLog -Encoding UTF8
    "" | Set-Content -LiteralPath $errLog -Encoding UTF8

    $qOut = '"' + $outLog + '"'
    $qErr = '"' + $errLog + '"'
    $startCmdBody = 'set "REGION_AI_WORKSPACE=' + (Escape-CmdDoubleQuotedValue $WorkspaceRoot) + '" && set "REGION_AI_EXEC_ROOT=' + (Escape-CmdDoubleQuotedValue $ExecRoot) + '" && node dist/index.js 1>>' + $qOut + ' 2>>' + $qErr
    $proc = Start-Process -FilePath $env:ComSpec -ArgumentList @("/d", "/s", "/c", $startCmdBody) -WorkingDirectory $orchestratorDir -PassThru
    $startedByScript = $true
  }

  if (-not $proc -and -not $startedByScript -and (-not $canReuse)) {
    "" | Set-Content -LiteralPath $outLog -Encoding UTF8
    "" | Set-Content -LiteralPath $errLog -Encoding UTF8
    $qOut = '"' + $outLog + '"'
    $qErr = '"' + $errLog + '"'
    $startCmdBody = 'set "REGION_AI_WORKSPACE=' + (Escape-CmdDoubleQuotedValue $WorkspaceRoot) + '" && set "REGION_AI_EXEC_ROOT=' + (Escape-CmdDoubleQuotedValue $ExecRoot) + '" && node dist/index.js 1>>' + $qOut + ' 2>>' + $qErr
    $proc = Start-Process -FilePath $env:ComSpec -ArgumentList @("/d", "/s", "/c", $startCmdBody) -WorkingDirectory $orchestratorDir -PassThru
    $startedByScript = $true
  }

  if ((-not $proc) -and (-not $canReuse)) {
    throw "failed to obtain orchestrator process handle"
  }

  $pidOut = 0
  if ($proc) { $pidOut = [int]$proc.Id } elseif ($reusePid -gt 0) { $pidOut = $reusePid }
  Write-Info ("orchestrator_pid: " + $pidOut)
  $resultObj.orchestrator_pid = $pidOut

  $deadline = (Get-Date).AddSeconds($ReadyTimeoutSec)
  $resultObj.phase = "wait_ready"
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
    $line = Select-String -Path $outLog -Pattern '^\[orchestrator\] watching:' -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($line) {
      $ready = $true
      $watchingLine = $line.Line
      break
    }
    if ($startedByScript -and $proc -and $proc.HasExited) { break }
  }

  Write-Info ("ready: " + $ready)
  $resultObj.ready = [bool]$ready
  if ($ready) {
    Write-Verbose ("debug_ready_line: " + $watchingLine)
  } else {
    throw ("orchestrator not ready within " + $ReadyTimeoutSec + "s")
  }

  $taskId = ""
  $templatePath = ""
  $titleSuffix = ""
  $skipTemplateValidation = $false
  $allowAnyNewResult = $false
  $effectiveExpectStatus = $ExpectStatus.ToLowerInvariant()
  $effectiveExpectErrorCode = $ExpectErrorCode

  switch ($Mode) {
    "timeout_expected" {
      $taskId = New-TaskId -Prefix "task_e2e_timeout_expected_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_timeout_expected_pwsh.yaml"
      $titleSuffix = "auto"
    }
    "timeout_expected_strict" {
      $taskId = New-TaskId -Prefix "task_e2e_timeout_expected_strict_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_timeout_expected_strict_pwsh.yaml"
      $titleSuffix = "auto_strict"
    }
    "timeout_expected_strict_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_timeout_expected_no_done_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_timeout_expected_no_done_pwsh.yaml"
      $titleSuffix = "auto_strict_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "success_pwsh" {
      $taskId = New-TaskId -Prefix "task_e2e_success_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_success_pwsh.yaml"
      $titleSuffix = "auto_success"
    }
    "artifact_pwsh" {
      $taskId = New-TaskId -Prefix "task_e2e_artifact_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_artifact_pwsh.yaml"
      $titleSuffix = "auto_artifact"
    }
    "regex_stdout_pwsh" {
      $taskId = New-TaskId -Prefix "task_e2e_regex_stdout_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_regex_stdout_pwsh.yaml"
      $titleSuffix = "auto_regex_stdout"
    }
    "regex_stdout_ng_pwsh" {
      $taskId = New-TaskId -Prefix "task_e2e_regex_stdout_ng_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_regex_stdout_ng_pwsh.yaml"
      $titleSuffix = "auto_regex_stdout_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "regex_compile_fail_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_regex_compile_fail_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_regex_compile_fail_pwsh.yaml"
      $titleSuffix = "auto_regex_compile_fail_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "regex_invalid_flags_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_regex_invalid_flags_ng_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_regex_invalid_flags_ng_pwsh.yaml"
      $titleSuffix = "auto_regex_invalid_flags_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "regex_truncation" {
      $taskId = New-TaskId -Prefix "task_e2e_regex_truncation_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_regex_truncation_pwsh.yaml"
      $titleSuffix = "auto_regex_truncation"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "stderr_target_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_stderr_not_contains_target_ng_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_stderr_not_contains_target_ng_pwsh.yaml"
      $titleSuffix = "auto_stderr_target_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "stderr_contains_pwsh" {
      $taskId = New-TaskId -Prefix "task_e2e_stderr_contains_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_stderr_contains_pwsh.yaml"
      $titleSuffix = "auto_stderr_contains"
    }
    "stdout_not_contains_pwsh" {
      $taskId = New-TaskId -Prefix "task_e2e_stdout_not_contains_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_stdout_not_contains_pwsh.yaml"
      $titleSuffix = "auto_stdout_not_contains"
    }
    "stderr_not_contains_ng_pwsh" {
      $taskId = New-TaskId -Prefix "task_e2e_stderr_not_contains_ng_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_stderr_not_contains_ng_pwsh.yaml"
      $titleSuffix = "auto_stderr_not_contains_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "artifact_parent_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_artifact_reject_parent_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_artifact_reject_parent_pwsh.yaml"
      $titleSuffix = "auto_artifact_parent_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "artifact_abs_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_artifact_reject_abs_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_artifact_reject_abs_pwsh.yaml"
      $titleSuffix = "auto_artifact_abs_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "artifact_unc_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_artifact_reject_unc_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_artifact_reject_unc_pwsh.yaml"
      $titleSuffix = "auto_artifact_unc_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "patch_apply_success" {
      $taskId = New-TaskId -Prefix "task_e2e_patch_apply_success_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_patch_apply_success.yaml"
      $titleSuffix = "auto_patch_apply_success"
    }
    "patch_apply_path_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_patch_apply_path_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_patch_apply_path_ng.yaml"
      $titleSuffix = "auto_patch_apply_path_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "patch_apply_invalid_format_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_patch_apply_invalid_format_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_patch_apply_invalid_format_ng.yaml"
      $titleSuffix = "auto_patch_apply_invalid_format_ng"
      $skipTemplateValidation = $true
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "patch_apply_apply_fail_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_patch_apply_apply_fail_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_patch_apply_apply_fail_ng.yaml"
      $titleSuffix = "auto_patch_apply_apply_fail_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_EXEC"
      }
    }
    "pipeline_success" {
      $taskId = New-TaskId -Prefix "task_e2e_pipeline_success_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_pipeline_success.yaml"
      $titleSuffix = "auto_pipeline_success"
    }
    "pipeline_step_fail_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_pipeline_step_fail_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_pipeline_step_fail_ng.yaml"
      $titleSuffix = "auto_pipeline_step_fail_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_EXEC"
      }
    }
    "pipeline_invalid_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_pipeline_invalid_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_pipeline_invalid_ng.yaml"
      $titleSuffix = "auto_pipeline_invalid_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "file_write_success" {
      $taskId = New-TaskId -Prefix "task_e2e_file_write_success_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_file_write_success.yaml"
      $titleSuffix = "auto_file_write_success"
    }
    "file_write_path_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_file_write_path_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_file_write_path_ng.yaml"
      $titleSuffix = "auto_file_write_path_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "file_write_invalid_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_file_write_invalid_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_file_write_invalid_ng.yaml"
      $titleSuffix = "auto_file_write_invalid_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "archive_zip_success" {
      $taskId = New-TaskId -Prefix "task_e2e_archive_zip_success_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_archive_zip_success.yaml"
      $titleSuffix = "auto_archive_zip_success"
    }
    "archive_zip_path_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_archive_zip_path_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_archive_zip_path_ng.yaml"
      $titleSuffix = "auto_archive_zip_path_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "archive_zip_invalid_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_archive_zip_invalid_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_archive_zip_invalid_ng.yaml"
      $titleSuffix = "auto_archive_zip_invalid_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "accept_artifact_file_contains_success" {
      $taskId = New-TaskId -Prefix "task_e2e_accept_artifact_file_contains_success_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_accept_artifact_file_contains_success.yaml"
      $titleSuffix = "auto_accept_artifact_file_contains_success"
    }
    "accept_artifact_file_contains_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_accept_artifact_file_contains_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_accept_artifact_file_contains_ng.yaml"
      $titleSuffix = "auto_accept_artifact_file_contains_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "accept_artifact_file_regex_invalid_flags_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_accept_artifact_file_regex_invalid_flags_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_accept_artifact_file_regex_invalid_flags_ng.yaml"
      $titleSuffix = "auto_accept_artifact_file_regex_invalid_flags_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "accept_artifact_json_pointer_success" {
      $taskId = New-TaskId -Prefix "task_e2e_accept_artifact_json_pointer_success_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_accept_artifact_json_pointer_success.yaml"
      $titleSuffix = "auto_accept_artifact_json_pointer_success"
    }
    "accept_artifact_json_pointer_equals_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_accept_artifact_json_pointer_equals_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_accept_artifact_json_pointer_equals_ng.yaml"
      $titleSuffix = "auto_accept_artifact_json_pointer_equals_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "accept_artifact_json_pointer_invalid_flags_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_accept_artifact_json_pointer_invalid_flags_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_accept_artifact_json_pointer_invalid_flags_ng.yaml"
      $titleSuffix = "auto_accept_artifact_json_pointer_invalid_flags_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "accept_artifact_json_pointer_gte_success" {
      $taskId = New-TaskId -Prefix "task_e2e_accept_artifact_json_pointer_gte_success_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_accept_artifact_json_pointer_gte_success.yaml"
      $titleSuffix = "auto_accept_artifact_json_pointer_gte_success"
    }
    "accept_artifact_json_pointer_gt_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_accept_artifact_json_pointer_gt_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_accept_artifact_json_pointer_gt_ng.yaml"
      $titleSuffix = "auto_accept_artifact_json_pointer_gt_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "accept_artifact_json_pointer_gte_invalid_value_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_accept_artifact_json_pointer_gte_invalid_value_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_accept_artifact_json_pointer_gte_invalid_value_ng.yaml"
      $titleSuffix = "auto_accept_artifact_json_pointer_gte_invalid_value_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "accept_zip_entries_success" {
      $taskId = New-TaskId -Prefix "task_e2e_accept_zip_entries_success_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_accept_zip_entries_success.yaml"
      $titleSuffix = "auto_accept_zip_entries_success"
    }
    "accept_zip_entries_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_accept_zip_entries_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_accept_zip_entries_ng.yaml"
      $titleSuffix = "auto_accept_zip_entries_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "accept_zip_entries_invalid_flags_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_accept_zip_entries_invalid_flags_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_accept_zip_entries_invalid_flags_ng.yaml"
      $titleSuffix = "auto_accept_zip_entries_invalid_flags_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "run_meta_artifacts_success" {
      $taskId = New-TaskId -Prefix "task_e2e_run_meta_artifacts_success_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_run_meta_artifacts_success.yaml"
      $titleSuffix = "auto_run_meta_artifacts_success"
    }
    "run_meta_artifacts_acceptance_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_run_meta_artifacts_acceptance_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_run_meta_artifacts_acceptance_ng.yaml"
      $titleSuffix = "auto_run_meta_artifacts_acceptance_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_ACCEPTANCE"
      }
    }
    "run_meta_artifacts_invalid_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_run_meta_artifacts_invalid_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_run_meta_artifacts_invalid_ng.yaml"
      $titleSuffix = "auto_run_meta_artifacts_invalid_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "recipe_generate_validate_json" {
      $taskId = New-TaskId -Prefix "task_e2e_recipe_generate_validate_json_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_recipe_generate_validate_json.yaml"
      $titleSuffix = "auto_recipe_generate_validate_json"
    }
    "recipe_patch_apply_end_to_end" {
      $taskId = New-TaskId -Prefix "task_e2e_recipe_patch_apply_end_to_end_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_recipe_patch_apply_end_to_end.yaml"
      $titleSuffix = "auto_recipe_patch_apply_end_to_end"
    }
    "recipe_release_bundle" {
      $taskId = New-TaskId -Prefix "task_e2e_recipe_release_bundle_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_recipe_release_bundle.yaml"
      $titleSuffix = "auto_recipe_release_bundle"
    }
    "recipe_evidence_export_bundle" {
      $taskId = New-TaskId -Prefix "task_e2e_recipe_evidence_export_bundle_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_recipe_evidence_export_bundle.yaml"
      $titleSuffix = "auto_recipe_evidence_export_bundle"
    }
    "recipe_ops_snapshot" {
      $taskId = New-TaskId -Prefix "task_e2e_recipe_ops_snapshot_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_recipe_ops_snapshot.yaml"
      $titleSuffix = "auto_recipe_ops_snapshot"
    }
    "recipe_morning_brief_bundle" {
      $taskId = New-TaskId -Prefix "task_e2e_recipe_morning_brief_bundle_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_recipe_morning_brief_bundle.yaml"
      $titleSuffix = "auto_recipe_morning_brief_bundle"
    }
    "recipe_pipeline_exec_fail_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_recipe_pipeline_exec_fail_ng_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_recipe_pipeline_exec_fail_ng.yaml"
      $titleSuffix = "auto_recipe_pipeline_exec_fail_ng"
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_EXEC"
      }
    }
    "ui_api_smoke" {
      $taskId = New-TaskId -Prefix "task_e2e_ui_api_smoke_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_ui_api_smoke.yaml"
      $titleSuffix = "auto_ui_api_smoke"
    }
    "invalid_missing_id_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_invalid_missing_id_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_invalid_missing_id_pwsh.yaml"
      $titleSuffix = "auto_invalid_missing_id_ng"
      $skipTemplateValidation = $true
      $allowAnyNewResult = $true
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
    "invalid_bad_acceptance_ng" {
      $taskId = New-TaskId -Prefix "task_e2e_invalid_bad_acceptance_pwsh_auto"
      $templatePath = "templates\\tasks\\e2e\\task_e2e_invalid_bad_acceptance_pwsh.yaml"
      $titleSuffix = "auto_invalid_bad_acceptance_ng"
      $skipTemplateValidation = $true
      if ($PSBoundParameters.ContainsKey("ExpectStatus") -eq $false) {
        $effectiveExpectStatus = "failed"
      }
      if ([string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
        $effectiveExpectErrorCode = "ERR_TASK"
      }
    }
  }

  $resultObj.task_id = $taskId
  $resultObj.expect_status = $effectiveExpectStatus
  $resultObj.expect_error_code = $effectiveExpectErrorCode

  Write-Info ("e2e_mode: " + $Mode)

  $queueOutLog = Join-Path $WorkspaceRoot ("run_e2e.queue.out.{0}.log" -f [Guid]::NewGuid().ToString("N"))
  $queueErrLog = Join-Path $WorkspaceRoot ("run_e2e.queue.err.{0}.log" -f [Guid]::NewGuid().ToString("N"))
  $resultObj.phase = "wait_e2e"
  $psExe = Join-Path $env:WINDIR "System32\\WindowsPowerShell\\v1.0\\powershell.exe"
  $waitParts = New-Object System.Collections.Generic.List[string]
  $waitParts.Add('set "REGION_AI_WORKSPACE=' + (Escape-CmdDoubleQuotedValue $WorkspaceRoot) + '"')
  $waitParts.Add('set "REGION_AI_EXEC_ROOT=' + (Escape-CmdDoubleQuotedValue $ExecRoot) + '"')
  $waitParts.Add('set "REGION_AI_WORKSPACE_SELECTED=' + (Escape-CmdDoubleQuotedValue $WorkspaceRoot) + '"')
  $waitPs = '"' + $psExe + '"'
  $waitQueueScript = '"' + ($queueScript.Replace('"', '""')) + '"'
  $waitTemplate = '"' + ($templatePath.Replace('"', '""')) + '"'
  $waitTaskId = '"' + ($taskId.Replace('"', '""')) + '"'
  $waitTitleSuffix = '"' + ($titleSuffix.Replace('"', '""')) + '"'
  $waitExpectStatus = '"' + ($effectiveExpectStatus.Replace('"', '""')) + '"'
  $waitCommand = $waitPs +
    ' -NoProfile -ExecutionPolicy Bypass -File ' + $waitQueueScript +
    ' -TemplatePath ' + $waitTemplate +
    ' -TaskId ' + $waitTaskId +
    ' -TitleSuffix ' + $waitTitleSuffix +
    ' -Wait -ExpectStatus ' + $waitExpectStatus
  if ($skipTemplateValidation) {
    $waitCommand += ' -SkipTemplateValidation'
  }
  if ($allowAnyNewResult) {
    $waitCommand += ' -AllowAnyNewResult'
  }
  if (-not [string]::IsNullOrWhiteSpace($effectiveExpectErrorCode)) {
    $waitCommand += ' -ExpectErrorCode "' + ($effectiveExpectErrorCode.Replace('"', '""')) + '"'
  }
  if ($VerbosePreference -eq "Continue") {
    $waitCommand += ' -Verbose'
  }
  $waitParts.Add($waitCommand)
  $waitCmdline = [string]::Join(" && ", $waitParts.ToArray())
  Write-Verbose ("debug_wait_cmdline: " + $waitCmdline)

  $qOut = '"' + $queueOutLog + '"'
  $qErr = '"' + $queueErrLog + '"'
  $qCmdBody = $waitCmdline + ' 1>>' + $qOut + ' 2>>' + $qErr
  $qProc = Start-Process -FilePath $env:ComSpec -ArgumentList @("/d", "/s", "/c", $qCmdBody) -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden
  $waitOk = $qProc.WaitForExit($E2eTimeoutSec * 1000)
  if (-not $waitOk) {
    Stop-ProcessTree -RootPid $qProc.Id
    if ($VerbosePreference -eq "Continue") {
      Write-TimeoutDiagnosticSnapshot -WorkspaceRoot $WorkspaceRoot -ExecRoot $ExecRoot -TaskId $taskId -OutLog $outLog -ErrLog $errLog
      $timeoutSnapshotWritten = $true
    }
    throw ("e2e wait timeout (" + $E2eTimeoutSec + "s)")
  }
  $qProc.Refresh()
  if ($null -eq $qProc.ExitCode) {
    $e2eExit = 1
  } else {
    $e2eExit = [int]$qProc.ExitCode
  }

  $mergedLines = @()
  if (Test-Path -LiteralPath $queueOutLog) {
    $mergedLines += Get-Content -LiteralPath $queueOutLog
  }
  if (Test-Path -LiteralPath $queueErrLog) {
    $mergedLines += Get-Content -LiteralPath $queueErrLog
  }

  $queueReportedPass = $false
  $queueReportedFail = $false
  foreach ($line in $mergedLines) {
    if (-not $Json) { Write-Output $line }
    if ($line -match '^final:\s+PASS') { $queueReportedPass = $true }
    if ($line -match '^final:\s+FAIL') { $queueReportedFail = $true }
    $rs = Parse-KeyValueLine -Line $line -Key "result_status"
    if ($rs) { $resultObj.result_status = $rs }
    $rec = Parse-KeyValueLine -Line $line -Key "result_error_code"
    if ($rec -or ($line -match '^result_error_code:\s*$')) { $resultObj.result_error_code = $rec }
    $rf = Parse-KeyValueLine -Line $line -Key "result_file"
    if ($rf) { $resultFile = $rf }
    $af = Parse-KeyValueLine -Line $line -Key "artifacts_file"
    if ($af) { $artifactsFile = $af }
    if ($line -match '^debug_errors_block:') { $errorsBlockLines.Add($line) }
  }

  if ($queueReportedPass -and ($e2eExit -ne 0)) {
    $e2eExit = 0
  }
  if ($queueReportedFail -and ($e2eExit -eq 0)) {
    $e2eExit = 1
  }

  if ($VerbosePreference -eq "Continue") {
    if ($resultFile) { Write-Verbose ("debug_result_file: " + $resultFile) }
    if ($artifactsFile) { Write-Verbose ("debug_artifacts_file: " + $artifactsFile) }
    if (($resultObj.result_error_code -eq "ERR_TASK") -and [string]::IsNullOrWhiteSpace($artifactsFile)) {
      Write-Verbose "debug_option_a_contract: ERR_TASK pre-validation failure; artifacts.json not expected"
    }
    if ($resultFile -and (Test-Path -LiteralPath $resultFile)) {
      $resultYamlLines = Get-Content -LiteralPath $resultFile
      $hasTarget = ($resultYamlLines | Select-String -Pattern '^\s*target:\s*' -SimpleMatch:$false | Select-Object -First 1) -ne $null
      $noteLine = ($resultYamlLines | Select-String -Pattern '^\s*note:\s*' -SimpleMatch:$false | Select-Object -First 1)
      $sampleLine = ($resultYamlLines | Select-String -Pattern '^\s*actual_sample:\s*' -SimpleMatch:$false | Select-Object -First 1)
      Write-Verbose ("debug_result_details_target_present: " + $hasTarget)
      if ($noteLine) {
        Write-Verbose ("debug_result_details_note_line: " + $noteLine.Line.Trim())
      }
      if ($sampleLine) {
        $sampleRaw = $sampleLine.Line -replace '^\s*actual_sample:\s*', ''
        $sampleRaw = $sampleRaw.Trim().Trim("'").Trim('"')
        Write-Verbose ("debug_result_details_actual_sample_len: " + $sampleRaw.Length)
      }
    }
    Write-Verbose ("debug_dashboard_file: " + $dashboardPath)
    if ($errorsBlockLines.Count -gt 0) {
      Write-Verbose "debug_errors_block_begin: True"
      foreach ($l in $errorsBlockLines) { Write-Verbose $l }
      Write-Verbose "debug_errors_block_end: True"
    }
  }

  if ($e2eExit -eq 0) {
    $resultObj.phase = "completed"
    $reason = "e2e expectation matched"
    $resultObj.final = "PASS"
    $resultObj.reason = $reason
  } else {
    throw ("e2e failed, exit=" + $e2eExit)
  }
}
catch {
  $reason = $_.Exception.Message
  if ([string]::IsNullOrWhiteSpace($reason)) { $reason = "unexpected error" }
  $resultObj.final = "FAIL"
  if ([string]::IsNullOrWhiteSpace($resultObj.phase)) { $resultObj.phase = "failed" }
  $resultObj.reason = $reason
  Write-Info ("final: FAIL (" + $reason + ")")
  if (($reason -like "e2e wait timeout*") -and ($VerbosePreference -eq "Continue") -and (-not $timeoutSnapshotWritten)) {
    Write-TimeoutDiagnosticSnapshot -WorkspaceRoot $WorkspaceRoot -ExecRoot $ExecRoot -TaskId $resultObj.task_id -OutLog $outLog -ErrLog $errLog
  }
  if ($VerbosePreference -eq "Continue") {
    Write-Verbose "debug_out_tail_begin"
    if (Test-Path -LiteralPath $outLog) {
      Get-Content -LiteralPath $outLog -Tail 40 | ForEach-Object { Write-Verbose $_ }
    }
    Write-Verbose "debug_out_tail_end"
    Write-Verbose "debug_err_tail_begin"
    if (Test-Path -LiteralPath $errLog) {
      Get-Content -LiteralPath $errLog -Tail 40 | ForEach-Object { Write-Verbose $_ }
    }
    Write-Verbose "debug_err_tail_end"
    Write-Verbose "debug_executor_out_tail_begin"
    if (Test-Path -LiteralPath $executorOutLog) {
      Get-Content -LiteralPath $executorOutLog -Tail 40 | ForEach-Object { Write-Verbose $_ }
    }
    Write-Verbose "debug_executor_out_tail_end"
    Write-Verbose "debug_executor_err_tail_begin"
    if (Test-Path -LiteralPath $executorErrLog) {
      Get-Content -LiteralPath $executorErrLog -Tail 40 | ForEach-Object { Write-Verbose $_ }
    }
    Write-Verbose "debug_executor_err_tail_end"
  }
}
finally {
  if ($startedByScript -and $proc) {
    Stop-ProcessTree -RootPid $proc.Id
  }
  if ($startedExecutorByScript -and $executorProc) {
    Stop-ProcessTree -RootPid $executorProc.Id
  }
  if ($lockAcquired -and (Test-Path -LiteralPath $lockPath)) {
    try {
      Remove-Item -LiteralPath $lockPath -Recurse -Force -ErrorAction Stop
      Write-Verbose ("debug_workspace_lock_released: " + $lockPath)
    } catch {
      Write-Verbose ("debug_workspace_lock_release_failed: " + $lockPath + " reason=" + $_.Exception.Message)
    }
  }
}

$resultObj.paths.queue_result_file = $resultFile
$resultObj.paths.queue_artifacts_file = $artifactsFile
$resultObj.timestamp = (Get-Date).ToString("o")
$resultObj.exit_code = if ($resultObj.final -eq "PASS") { 0 } else { 1 }

if (($resultObj.final -eq "PASS") -and (-not $Json)) {
  Write-Output "final: PASS (e2e expectation matched)"
}

if ($Json) { [Console]::Out.WriteLine(($resultObj | ConvertTo-Json -Compress)) }

if ($resultObj.final -eq "PASS") { exit 0 } else { exit 1 }
