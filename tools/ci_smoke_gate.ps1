[CmdletBinding()]
param(
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$psExe = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$gateScript = Join-Path $repoRoot "tools/design_gate.ps1"
$whiteboardScript = Join-Path $repoRoot "tools/whiteboard_update.ps1"
$recipesScript = Join-Path $repoRoot "tools/recipes_update.ps1"
$contractIndexScript = Join-Path $repoRoot "tools/contract_index_update.ps1"
$uiSmokeScript = Join-Path $repoRoot "tools/ui_smoke.ps1"
$uiBuildSmokeScript = Join-Path $repoRoot "tools/ui_build_smoke.ps1"
$desktopSmokeScript = Join-Path $repoRoot "tools/desktop_smoke.ps1"
$docsCheckScript = Join-Path $repoRoot "tools/docs_check.ps1"
$smokeScript = Join-Path $repoRoot "tools/ci_smoke.ps1"
$repoSanityScript = Join-Path $repoRoot "tools/repo_sanity.ps1"
$logsRoot = Join-Path $repoRoot "data\\logs"
$runId = "ci_smoke_gate_" + (Get-Date -Format "yyyyMMdd_HHmmss_fff")
$runLogDir = Join-Path $logsRoot $runId

function Get-EnvIntOrDefault {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][int]$DefaultValue
  )
  $raw = [string][Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($raw)) { return $DefaultValue }
  $parsed = 0
  if ([int]::TryParse($raw, [ref]$parsed) -and $parsed -gt 0) {
    return $parsed
  }
  return $DefaultValue
}

function Write-ProgressLine {
  param([Parameter(Mandatory = $true)][string]$Message)
  [Console]::Out.WriteLine("[ci_smoke_gate] " + $Message)
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
  foreach ($pidToStop in ($toStop | Sort-Object -Descending)) {
    try { Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue } catch {}
  }
}

function Try-ParseLastJsonLine {
  param([Parameter(Mandatory = $true)][System.Collections.IEnumerable]$Lines)
  $arr = @($Lines)
  for ($i = $arr.Count - 1; $i -ge 0; $i--) {
    $line = [string]$arr[$i]
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try {
      return ($line | ConvertFrom-Json -ErrorAction Stop)
    } catch {}
  }
  return $null
}

function Invoke-StepScript {
  param(
    [Parameter(Mandatory = $true)][string]$StepName,
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [string[]]$ScriptArgs = @(),
    [Parameter(Mandatory = $true)][datetime]$GlobalDeadline,
    [Parameter(Mandatory = $true)][int]$StepTimeoutSec,
    [Parameter(Mandatory = $true)][string]$LogsDir
  )

  $stepStart = Get-Date
  Write-ProgressLine ("step_start name=" + $StepName)

  $stepLogPath = Join-Path $LogsDir ($StepName + ".log")
  if (Test-Path -LiteralPath $stepLogPath) { Remove-Item -LiteralPath $stepLogPath -Force -ErrorAction SilentlyContinue }

  $invokeBlock = {
    param($ChildPsExe, $ChildRepoRoot, $ChildScriptPath, [string[]]$ChildScriptArgs)
    Set-Location -LiteralPath $ChildRepoRoot
    $lines = @(& $ChildPsExe -NoProfile -ExecutionPolicy Bypass -File $ChildScriptPath @ChildScriptArgs 2>&1 | ForEach-Object { [string]$_ })
    return [pscustomobject]@{
      exit_code = [int]$LASTEXITCODE
      lines = $lines
    }
  }

  $prevWarningPreference = $WarningPreference
  $WarningPreference = "SilentlyContinue"
  $job = Start-Job -ScriptBlock $invokeBlock -ArgumentList @($psExe, $repoRoot, $ScriptPath, $ScriptArgs)
  $stepDeadline = $stepStart.AddSeconds([Math]::Max(1, $StepTimeoutSec))
  $timedOut = $false
  $globalTimedOut = $false
  while ($job.State -eq "Running" -or $job.State -eq "NotStarted") {
    $now = Get-Date
    if ($now -ge $GlobalDeadline) {
      $globalTimedOut = $true
      Stop-Job -Id $job.Id -ErrorAction SilentlyContinue
      break
    }
    if ($now -ge $stepDeadline) {
      $timedOut = $true
      Stop-Job -Id $job.Id -ErrorAction SilentlyContinue
      break
    }
    Start-Sleep -Milliseconds 200
    $job = Get-Job -Id $job.Id -ErrorAction SilentlyContinue
    if (-not $job) { break }
  }

  $allLines = @()
  $exitCode = 1
  if (-not $timedOut -and -not $globalTimedOut) {
    try {
      $jobResult = Receive-Job -Id $job.Id -Wait -AutoRemoveJob -ErrorAction Stop
      if ($jobResult) {
        $jr = $jobResult | Select-Object -Last 1
        $exitCode = [int]$jr.exit_code
        if ($jr.lines) { $allLines = @($jr.lines) }
      }
    } catch {
      $allLines += ("job_receive_failed: " + $_.Exception.Message)
      try { Remove-Job -Id $job.Id -Force -ErrorAction SilentlyContinue } catch {}
      $exitCode = 1
    }
  } else {
    try { Remove-Job -Id $job.Id -Force -ErrorAction SilentlyContinue } catch {}
    $exitCode = 124
  }
  $WarningPreference = $prevWarningPreference

  $elapsedMs = [int64]((Get-Date) - $stepStart).TotalMilliseconds

  $merged = @()
  $merged += ("step=" + $StepName)
  $merged += ("elapsed_ms=" + $elapsedMs)
  $merged += ("exit_code=" + $exitCode)
  $merged += ("script=" + $ScriptPath)
  $merged += ("args=" + ([string]::Join(" ", $ScriptArgs)))
  $merged += "== OUTPUT =="
  $merged += ($allLines | ForEach-Object { [string]$_ })
  [System.IO.File]::WriteAllText($stepLogPath, ($merged -join [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))

  Write-ProgressLine ("step_end name=" + $StepName + " elapsed_ms=" + $elapsedMs + " exit_code=" + $exitCode + " log=" + $stepLogPath)
  return [ordered]@{
    step_name = $StepName
    exit_code = $exitCode
    timed_out = $timedOut
    global_timed_out = $globalTimedOut
    elapsed_ms = $elapsedMs
    log_path = $stepLogPath
    lines = $allLines
  }
}

function Resolve-DesignId {
  param([string]$Root)
  $latest = Join-Path $Root "docs/design/LATEST.txt"
  if (-not (Test-Path -LiteralPath $latest)) { return "" }
  $line = (Get-Content -LiteralPath $latest -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($line)) { return "" }
  $parts = $line -split "\|"
  $rel = $parts[0].Trim()
  if ([string]::IsNullOrWhiteSpace($rel)) { return "" }
  return [System.IO.Path]::GetFileNameWithoutExtension($rel)
}

$stepTimeoutSec = Get-EnvIntOrDefault -Name "REGION_AI_SMOKE_STEP_TIMEOUT_SEC" -DefaultValue 600
$globalTimeoutSec = Get-EnvIntOrDefault -Name "REGION_AI_SMOKE_TIMEOUT_SEC" -DefaultValue 1200
$globalStart = Get-Date
$globalDeadline = $globalStart.AddSeconds($globalTimeoutSec)

New-Item -ItemType Directory -Path $runLogDir -Force | Out-Null
Write-ProgressLine ("run_id=" + $runId + " step_timeout_sec=" + $stepTimeoutSec + " global_timeout_sec=" + $globalTimeoutSec + " logs_dir=" + $runLogDir)

$result = [ordered]@{
  action = "ci_smoke_gate"
  gate_required = $true
  repo_sanity_ok = $false
  gate_passed = $false
  whiteboard_passed = $false
  recipes_passed = $false
  contract_index_passed = $false
  ui_passed = $false
  ui_build_passed = $false
  ui_build_skipped = $false
  desktop_passed = $false
  desktop_skipped = $false
  docs_check_ok = $false
  design_id = Resolve-DesignId -Root $repoRoot
  smoke_ok = $false
  failed_step = ""
  failed_step_elapsed_ms = 0
  last_completed_step = ""
  failure_reason = ""
  step_timeout_sec = $stepTimeoutSec
  global_timeout_sec = $globalTimeoutSec
  logs_dir = $runLogDir
  step_logs = [ordered]@{}
  step_elapsed_ms = [ordered]@{}
  exit_code = 1
}

function Register-StepResult {
  param(
    [Parameter(Mandatory = $true)][System.Collections.IDictionary]$ResultObj,
    [Parameter(Mandatory = $true)]$StepObj
  )
  $ResultObj.step_logs[$StepObj.step_name] = [string]$StepObj.log_path
  $ResultObj.step_elapsed_ms[$StepObj.step_name] = [int64]$StepObj.elapsed_ms
}

function Throw-StepFailure {
  param(
    [Parameter(Mandatory = $true)][System.Collections.IDictionary]$ResultObj,
    [Parameter(Mandatory = $true)]$StepObj,
    [Parameter(Mandatory = $true)][string]$Reason
  )
  $ResultObj.failed_step = [string]$StepObj.step_name
  $ResultObj.failed_step_elapsed_ms = [int64]$StepObj.elapsed_ms
  if ($StepObj.global_timed_out) {
    $ResultObj.failure_reason = "global_timeout"
  } elseif ($StepObj.timed_out) {
    $ResultObj.failure_reason = "step_timeout"
  } else {
    $ResultObj.failure_reason = $Reason
  }
  throw $ResultObj.failure_reason
}

try {
  if ((Get-Date) -ge $globalDeadline) { throw "global_timeout" }

  $step = Invoke-StepScript -StepName "repo_sanity" -ScriptPath $repoSanityScript -ScriptArgs @("-Json", "-StrictGit") -GlobalDeadline $globalDeadline -StepTimeoutSec $stepTimeoutSec -LogsDir $runLogDir
  Register-StepResult -ResultObj $result -StepObj $step
  if ($step.exit_code -ne 0 -or $step.timed_out -or $step.global_timed_out) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "repo_sanity_failed"
  }
  $sanityObj = Try-ParseLastJsonLine -Lines $step.lines
  if (-not $sanityObj -or -not [bool]$sanityObj.ok) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "repo_sanity_not_ok"
  }
  $result.repo_sanity_ok = $true
  $result.last_completed_step = "repo_sanity"

  $step = Invoke-StepScript -StepName "design_gate" -ScriptPath $gateScript -GlobalDeadline $globalDeadline -StepTimeoutSec $stepTimeoutSec -LogsDir $runLogDir
  Register-StepResult -ResultObj $result -StepObj $step
  if ($step.exit_code -ne 0 -or $step.timed_out -or $step.global_timed_out) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "design_gate_failed"
  }
  $result.gate_passed = $true
  $result.last_completed_step = "design_gate"

  $step = Invoke-StepScript -StepName "whiteboard_gate" -ScriptPath $whiteboardScript -ScriptArgs @("-DryRun", "-RequireApplied", "-Json") -GlobalDeadline $globalDeadline -StepTimeoutSec $stepTimeoutSec -LogsDir $runLogDir
  Register-StepResult -ResultObj $result -StepObj $step
  if ($step.exit_code -ne 0 -or $step.timed_out -or $step.global_timed_out) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "whiteboard_gate_failed"
  }
  $result.whiteboard_passed = $true
  $result.last_completed_step = "whiteboard_gate"

  $step = Invoke-StepScript -StepName "recipes_dryrun" -ScriptPath $recipesScript -ScriptArgs @("-DryRun", "-Json") -GlobalDeadline $globalDeadline -StepTimeoutSec $stepTimeoutSec -LogsDir $runLogDir
  Register-StepResult -ResultObj $result -StepObj $step
  if ($step.exit_code -ne 0 -or $step.timed_out -or $step.global_timed_out) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "recipes_dryrun_failed"
  }
  $recipesObj = Try-ParseLastJsonLine -Lines $step.lines
  if (-not $recipesObj) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "recipes_json_invalid"
  }
  if ([bool]$recipesObj.changed) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "recipes_drift_detected"
  }
  $result.recipes_passed = $true
  $result.last_completed_step = "recipes_dryrun"

  $step = Invoke-StepScript -StepName "contract_index_dryrun" -ScriptPath $contractIndexScript -ScriptArgs @("-DryRun", "-Json") -GlobalDeadline $globalDeadline -StepTimeoutSec $stepTimeoutSec -LogsDir $runLogDir
  Register-StepResult -ResultObj $result -StepObj $step
  if ($step.exit_code -ne 0 -or $step.timed_out -or $step.global_timed_out) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "contract_index_dryrun_failed"
  }
  $contractObj = Try-ParseLastJsonLine -Lines $step.lines
  if (-not $contractObj) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "contract_index_json_invalid"
  }
  if ([bool]$contractObj.changed) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "contract_index_drift_detected"
  }
  $result.contract_index_passed = $true
  $result.last_completed_step = "contract_index_dryrun"

  $step = Invoke-StepScript -StepName "ui_build_smoke" -ScriptPath $uiBuildSmokeScript -ScriptArgs @("-Json") -GlobalDeadline $globalDeadline -StepTimeoutSec $stepTimeoutSec -LogsDir $runLogDir
  Register-StepResult -ResultObj $result -StepObj $step
  if ($step.exit_code -ne 0 -or $step.timed_out -or $step.global_timed_out) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "ui_build_smoke_failed"
  }
  $uiBuildObj = Try-ParseLastJsonLine -Lines $step.lines
  if (-not $uiBuildObj) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "ui_build_smoke_json_invalid"
  }
  $result.ui_build_passed = [bool]$uiBuildObj.ui_build_passed
  $result.ui_build_skipped = [bool]$uiBuildObj.skipped
  if (-not $result.ui_build_passed) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "ui_build_passed_false"
  }
  $result.last_completed_step = "ui_build_smoke"

  $step = Invoke-StepScript -StepName "ui_smoke" -ScriptPath $uiSmokeScript -ScriptArgs @("-Json") -GlobalDeadline $globalDeadline -StepTimeoutSec $stepTimeoutSec -LogsDir $runLogDir
  Register-StepResult -ResultObj $result -StepObj $step
  if ($step.exit_code -ne 0 -or $step.timed_out -or $step.global_timed_out) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "ui_smoke_failed"
  }
  $uiObj = Try-ParseLastJsonLine -Lines $step.lines
  if (-not $uiObj -or -not [bool]$uiObj.ok) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "ui_smoke_ok_false"
  }
  $result.ui_passed = $true
  $result.last_completed_step = "ui_smoke"

  $step = Invoke-StepScript -StepName "desktop_smoke" -ScriptPath $desktopSmokeScript -ScriptArgs @("-Json") -GlobalDeadline $globalDeadline -StepTimeoutSec $stepTimeoutSec -LogsDir $runLogDir
  Register-StepResult -ResultObj $result -StepObj $step
  if ($step.exit_code -ne 0 -or $step.timed_out -or $step.global_timed_out) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "desktop_smoke_failed"
  }
  $desktopObj = Try-ParseLastJsonLine -Lines $step.lines
  if (-not $desktopObj) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "desktop_smoke_json_invalid"
  }
  $result.desktop_passed = [bool]$desktopObj.desktop_passed
  $result.desktop_skipped = [bool]$desktopObj.skipped
  if (-not $result.desktop_passed) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "desktop_passed_false"
  }
  $result.last_completed_step = "desktop_smoke"

  $step = Invoke-StepScript -StepName "docs_check" -ScriptPath $docsCheckScript -ScriptArgs @("-Json") -GlobalDeadline $globalDeadline -StepTimeoutSec $stepTimeoutSec -LogsDir $runLogDir
  Register-StepResult -ResultObj $result -StepObj $step
  if ($step.exit_code -ne 0 -or $step.timed_out -or $step.global_timed_out) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "docs_check_failed"
  }
  $docsObj = Try-ParseLastJsonLine -Lines $step.lines
  $result.docs_check_ok = $true
  if ($docsObj) { $result.docs_check_ok = ($docsObj.exit_code -eq 0) }
  if (-not $result.docs_check_ok) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "docs_check_not_ok"
  }
  $result.last_completed_step = "docs_check"

  $step = Invoke-StepScript -StepName "ci_smoke" -ScriptPath $smokeScript -ScriptArgs @("-Json") -GlobalDeadline $globalDeadline -StepTimeoutSec $stepTimeoutSec -LogsDir $runLogDir
  Register-StepResult -ResultObj $result -StepObj $step
  if ($step.exit_code -ne 0 -or $step.timed_out -or $step.global_timed_out) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "ci_smoke_failed"
  }
  $smokeObj = Try-ParseLastJsonLine -Lines $step.lines
  if (-not $smokeObj) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "ci_smoke_json_invalid"
  }
  $result.smoke_ok = ($smokeObj.exit_code -eq 0)
  if (-not $result.smoke_ok) {
    Throw-StepFailure -ResultObj $result -StepObj $step -Reason "ci_smoke_not_ok"
  }
  $result.last_completed_step = "ci_smoke"
}
catch {
  if ([string]::IsNullOrWhiteSpace($result.failure_reason)) {
    $msg = $_.Exception.Message
    if ([string]::IsNullOrWhiteSpace($msg)) { $msg = "ci_smoke_gate_failed" }
    if ($msg -eq "global_timeout") {
      $result.failure_reason = "global_timeout"
    } else {
      $result.failure_reason = $msg
    }
  }
  if (-not $Json) {
    Write-Output ("ci_smoke_gate_failed: " + $result.failure_reason)
  }
}

$result.exit_code = if ($result.repo_sanity_ok -and $result.gate_passed -and $result.whiteboard_passed -and $result.recipes_passed -and $result.contract_index_passed -and $result.ui_build_passed -and $result.ui_passed -and $result.desktop_passed -and $result.docs_check_ok -and $result.smoke_ok) { 0 } else { 1 }

if ($Json) {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress -Depth 6))
} else {
  Write-Output ("gate_passed: " + $result.gate_passed)
  Write-Output ("smoke_ok: " + $result.smoke_ok)
}

exit $result.exit_code
