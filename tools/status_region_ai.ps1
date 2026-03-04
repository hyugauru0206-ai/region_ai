[CmdletBinding()]
param(
  [string]$WorkspaceRoot = "",
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
if ($Json) {
  $VerbosePreference = "SilentlyContinue"
  $WarningPreference = "SilentlyContinue"
  $InformationPreference = "SilentlyContinue"
  $DebugPreference = "SilentlyContinue"
}

function Write-Info {
  param([Parameter(Mandatory = $true)][string]$Message)
  if (-not $Json) { Write-Output $Message }
}

function Emit-JsonFinal {
  param(
    [Parameter(Mandatory = $true)]$Object,
    [int]$ExitCode = 0
  )
  $jsonText = ($Object | ConvertTo-Json -Compress -Depth 10)
  try {
    if ([type]::GetType("System.Text.Json.JsonDocument")) {
      $null = [System.Text.Json.JsonDocument]::Parse($jsonText)
    } else {
      $null = $jsonText | ConvertFrom-Json -ErrorAction Stop
    }
  } catch {
    if ($Json) {
      $fallback = [ordered]@{
        action = "status"
        timestamp = (Get-Date).ToString("o")
        exit_code = 1
        error = "json_self_parse_failed"
      }
      [Console]::Out.WriteLine(($fallback | ConvertTo-Json -Compress -Depth 10))
    }
    exit 1
  }
  if ($Json) { [Console]::Out.WriteLine($jsonText) }
  exit $ExitCode
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

function Read-PidsFile {
  param([string]$PidsPath)
  if (-not (Test-Path -LiteralPath $PidsPath)) { return $null }
  try { return (Get-Content -LiteralPath $PidsPath -Raw | ConvertFrom-Json) } catch { return $null }
}

function Parse-ResultFile {
  param(
    [Parameter(Mandatory = $true)][System.IO.FileInfo]$File,
    [Parameter(Mandatory = $true)][string]$WorkspaceRoot
  )
  $raw = Get-Content -LiteralPath $File.FullName -Raw -ErrorAction SilentlyContinue
  $status = [regex]::Match($raw, '(?m)^\s*status:\s*(\S+)\s*$').Groups[1].Value
  $taskId = [regex]::Match($File.Name, '^result_(.+?)_run_').Groups[1].Value
  if ([string]::IsNullOrWhiteSpace($taskId)) {
    $taskId = [regex]::Match($raw, '(?m)^\s*task_id:\s*(\S+)\s*$').Groups[1].Value
  }
  $errorCode = [regex]::Match($raw, '(?m)^\s*-\s*code:\s*(\S+)\s*$').Groups[1].Value
  $finishedAt = [regex]::Match($raw, '(?m)^\s*finished_at:\s*(\S+)\s*$').Groups[1].Value
  $runId = [regex]::Match($raw, '(?m)^\s*run_id:\s*(\S+)\s*$').Groups[1].Value
  $artifactsFile = ""
  $filesCount = 0
  $filesSample = @()
  if (-not [string]::IsNullOrWhiteSpace($runId)) {
    $artifactsFile = Join-Path (Join-Path (Join-Path $WorkspaceRoot "runs") $runId) "artifacts.json"
    if (Test-Path -LiteralPath $artifactsFile) {
      try {
        $art = Get-Content -LiteralPath $artifactsFile -Raw | ConvertFrom-Json
        if ($null -ne $art.files) {
          $arr = @($art.files)
          $filesCount = $arr.Count
          $filesSample = @($arr | Select-Object -First 10)
        }
      } catch {}
    }
  }
  $noteExpectedFailure = $false
  if (($taskId -match 'strict_ng') -or ($errorCode -eq 'ERR_ACCEPTANCE')) {
    $noteExpectedFailure = $true
  }
  return [ordered]@{
    file = $File.FullName
    task_id = $taskId
    status = $status
    error_code = $errorCode
    finished_at = $finishedAt
    run_id = $runId
    artifacts_file = $artifactsFile
    files_count = $filesCount
    files_sample = $filesSample
    note_expected_failure = $noteExpectedFailure
  }
}

function Get-ResultByTaskId {
  param(
    [Parameter(Mandatory = $true)][string]$EventsDir,
    [Parameter(Mandatory = $true)][string]$TaskId,
    [Parameter(Mandatory = $true)][string]$WorkspaceRoot
  )
  if ([string]::IsNullOrWhiteSpace($TaskId)) { return $null }
  if (-not (Test-Path -LiteralPath $EventsDir)) { return $null }
  $escaped = [regex]::Escape($TaskId)
  $f = Get-ChildItem -LiteralPath $EventsDir -File -Filter "result_*" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match ("^result_" + $escaped + "_run_") } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $f) { return $null }
  return (Parse-ResultFile -File $f -WorkspaceRoot $WorkspaceRoot)
}

function Get-LatestResultByStatus {
  param(
    [Parameter(Mandatory = $true)][string]$EventsDir,
    [Parameter(Mandatory = $true)][string]$Status,
    [Parameter(Mandatory = $true)][string]$WorkspaceRoot
  )
  if (-not (Test-Path -LiteralPath $EventsDir)) { return $null }
  $files = Get-ChildItem -LiteralPath $EventsDir -File -Filter "result_*" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
  foreach ($f in $files) {
    $parsed = Parse-ResultFile -File $f -WorkspaceRoot $WorkspaceRoot
    if ([string]$parsed.status -eq $Status) { return $parsed }
  }
  return $null
}

function Get-LatestDashboardTaskId {
  param(
    [Parameter(Mandatory = $true)][string]$DashboardPath,
    [Parameter(Mandatory = $true)][ValidateSet("OK", "NG")][string]$Mark
  )
  if (-not (Test-Path -LiteralPath $DashboardPath)) { return "" }
  $line = Select-String -Path $DashboardPath -Pattern ("^\s*-\s*\[" + $Mark + "\]\s+(\S+)") -ErrorAction SilentlyContinue | Select-Object -Last 1
  if (-not $line) { return "" }
  return [regex]::Match($line.Line, "^\s*-\s*\[" + $Mark + "\]\s+(\S+)").Groups[1].Value
}

try {
  if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) { $WorkspaceRoot = Join-Path $env:TEMP "region_ai\\workspace" }
  $WorkspaceRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot)
  $pidsPath = Join-Path (Join-Path $WorkspaceRoot "pids") "region_ai.pids.json"
  $pids = Read-PidsFile -PidsPath $pidsPath
  $eventsDir = Join-Path $WorkspaceRoot "queue\\events"
  $dashboardPath = Join-Path $WorkspaceRoot "status\\dashboard.md"

  $execRoot = if ($pids -and $pids.exec_root) { [string]$pids.exec_root } else { Join-Path $WorkspaceRoot "exec" }
  $orchPid = if ($pids) { [int]($pids.orchestrator_pid | ForEach-Object { $_ }) } else { 0 }
  $execPid = if ($pids) { [int]($pids.executor_pid | ForEach-Object { $_ }) } else { 0 }
  $orchOutLog = if ($pids) { [string]$pids.orchestrator_out_log } else { "" }
  $ready = Test-OrchestratorReady -OrchestratorOutLog $orchOutLog

  $latestOverall = $null
  if (Test-Path -LiteralPath $eventsDir) {
    $f = Get-ChildItem -LiteralPath $eventsDir -File -Filter "result_*" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($f) { $latestOverall = Parse-ResultFile -File $f -WorkspaceRoot $WorkspaceRoot }
  }

  $okTaskId = Get-LatestDashboardTaskId -DashboardPath $dashboardPath -Mark OK
  $ngTaskId = Get-LatestDashboardTaskId -DashboardPath $dashboardPath -Mark NG
  $latestOk = Get-ResultByTaskId -EventsDir $eventsDir -TaskId $okTaskId -WorkspaceRoot $WorkspaceRoot
  $latestNg = Get-ResultByTaskId -EventsDir $eventsDir -TaskId $ngTaskId -WorkspaceRoot $WorkspaceRoot
  if (-not $latestOk) { $latestOk = Get-LatestResultByStatus -EventsDir $eventsDir -Status "success" -WorkspaceRoot $WorkspaceRoot }
  if (-not $latestNg) { $latestNg = Get-LatestResultByStatus -EventsDir $eventsDir -Status "failed" -WorkspaceRoot $WorkspaceRoot }

  $result = [ordered]@{
    action = "status"
    timestamp = (Get-Date).ToString("o")
    exit_code = 0
    workspace_root = $WorkspaceRoot
    exec_root = $execRoot
    orchestrator_pid = $orchPid
    executor_pid = $execPid
    orchestrator_alive = (Test-ProcessAlive -ProcessId $orchPid)
    executor_alive = (Test-ProcessAlive -ProcessId $execPid)
    ready = $ready
    latest_result = $latestOverall
    latest_ok_result = $latestOk
    latest_failed_result = $latestNg
    latest_ok_result_files_count = if ($latestOk) { [int]$latestOk.files_count } else { 0 }
    latest_ok_result_files_sample = if ($latestOk) { @($latestOk.files_sample) } else { @() }
  }

  if (-not $Json) {
    Write-Info ("workspace_root: " + $WorkspaceRoot)
    Write-Info ("exec_root: " + $execRoot)
    Write-Info ("orchestrator_pid: " + $orchPid + " alive=" + $result.orchestrator_alive)
    Write-Info ("executor_pid: " + $execPid + " alive=" + $result.executor_alive)
    Write-Info ("ready: " + $ready)
    Write-Info ("queue_pending_exists: " + (Test-Path -LiteralPath (Join-Path $WorkspaceRoot "queue\\pending")))
    Write-Info ("queue_events_exists: " + (Test-Path -LiteralPath $eventsDir))
    if ($latestOverall) {
      Write-Info ("latest_result_task_id: " + [string]$latestOverall.task_id)
      Write-Info ("latest_result_status: " + [string]$latestOverall.status)
      Write-Info ("latest_result_error_code: " + [string]$latestOverall.error_code)
      Write-Info ("latest_result_note_expected_failure: " + [string]$latestOverall.note_expected_failure)
    } else {
      Write-Info "latest_result: <none>"
    }
    if ($latestOk) {
      Write-Info ("latest_ok_result_task_id: " + [string]$latestOk.task_id)
      Write-Info ("latest_ok_result_status: " + [string]$latestOk.status)
      Write-Info ("latest_ok_result_files_count: " + [string]$latestOk.files_count)
    } else {
      Write-Info "latest_ok_result: <none>"
    }
    if ($latestNg) {
      Write-Info ("latest_failed_result_task_id: " + [string]$latestNg.task_id)
      Write-Info ("latest_failed_result_status: " + [string]$latestNg.status)
      Write-Info ("latest_failed_result_note_expected_failure: " + [string]$latestNg.note_expected_failure)
    } else {
      Write-Info "latest_failed_result: <none>"
    }
  }

  Emit-JsonFinal -Object $result -ExitCode 0
}
catch {
  $errorResult = [ordered]@{
    action = "status"
    timestamp = (Get-Date).ToString("o")
    exit_code = 1
    workspace_root = $WorkspaceRoot
    error = $_.Exception.Message
  }
  if (-not $Json) { Write-Output ("status_failed: " + $_.Exception.Message) }
  Emit-JsonFinal -Object $errorResult -ExitCode 1
}
