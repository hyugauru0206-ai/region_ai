[CmdletBinding()]
param(
  [switch]$Start,
  [switch]$Stop,
  [switch]$Status,
  [switch]$Json,
  [ValidateRange(5, 300)]
  [int]$ReadyTimeoutSec = 60,
  [string]$WorkspaceRoot = "",
  [string]$ApiHost = "127.0.0.1",
  [int]$ApiPort = 8787,
  [string]$UiHost = "127.0.0.1",
  [int]$UiPort = 5173
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$script:RepoRootForOutput = ""
$script:PushedRepoRoot = $false

function Emit-Result {
  param(
    [Parameter(Mandatory = $true)]$Result,
    [int]$ExitCode = 0
  )
  if ($script:RepoRootForOutput -and -not $Result.Contains("repo_root")) {
    $Result.repo_root = $script:RepoRootForOutput
  }
  $Result.exit_code = $ExitCode
  $jsonLine = ($Result | ConvertTo-Json -Compress -Depth 10)
  if (-not $Json) {
    Write-Output ("action: " + [string]$Result.action)
    if ($Result.status) { Write-Output ("status: " + [string]$Result.status) }
    if ($Result.note) { Write-Output ("note: " + [string]$Result.note) }
  }
  [Console]::Out.WriteLine($jsonLine)
  exit $ExitCode
}

function New-DirIfMissing {
  param([string]$PathText)
  if (-not (Test-Path -LiteralPath $PathText)) {
    New-Item -ItemType Directory -Path $PathText -Force | Out-Null
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

function Stop-ProcessTree {
  param([int]$RootPid)
  if ($RootPid -le 0) { return }
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

function Wait-ProcessExit {
  param([int]$ProcessId, [int]$TimeoutSec = 10)
  $deadline = (Get-Date).AddSeconds([Math]::Max(1, $TimeoutSec))
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-ProcessAlive -ProcessId $ProcessId)) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return (-not (Test-ProcessAlive -ProcessId $ProcessId))
}

function Test-Http200 {
  param([string]$Url)
  try {
    $resp = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 2 -UseBasicParsing
    return ($resp.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Test-EndpointWithHint {
  param(
    [string]$Url,
    [int]$Attempts = 3
  )
  if ([string]::IsNullOrWhiteSpace($Url)) {
    return [ordered]@{ ok = $false; hint = "endpoint_url_missing" }
  }
  $lastHint = ""
  $tries = [Math]::Max(1, $Attempts)
  for ($i = 0; $i -lt $tries; $i++) {
    try {
      $resp = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 2 -UseBasicParsing
      if ($resp.StatusCode -eq 200) {
        return [ordered]@{ ok = $true; hint = "" }
      }
      $lastHint = "http_status_" + [string]$resp.StatusCode
    } catch {
      $lastHint = [string]$_.Exception.Message
    }
    if ($i -lt ($tries - 1)) { Start-Sleep -Milliseconds 300 }
  }
  if ([string]::IsNullOrWhiteSpace($lastHint)) { $lastHint = "endpoint_unreachable" }
  return [ordered]@{ ok = $false; hint = $lastHint }
}

function Wait-EndpointReady {
  param(
    [string]$Url,
    [int]$TimeoutSec,
    [int]$PidToWatch
  )
  $deadline = (Get-Date).AddSeconds([Math]::Max(1, $TimeoutSec))
  while ((Get-Date) -lt $deadline) {
    if ($PidToWatch -gt 0 -and -not (Test-ProcessAlive -ProcessId $PidToWatch)) { return $false }
    if (Test-Http200 -Url $Url) { return $true }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

function Get-UiHint {
  param([string]$UiDir)
  $nodeModulesPath = Join-Path $UiDir "node_modules"
  $vitePkgPath = Join-Path $UiDir "node_modules\vite\package.json"
  if (-not (Test-Path -LiteralPath $nodeModulesPath)) {
    return "UI not ready; check node_modules/vite or run REGION_AI_UI_DEPS_PACK=1 unpack route, or run ui:build:smoke"
  }
  if (-not (Test-Path -LiteralPath $vitePkgPath)) {
    return "UI not ready; vite dependency missing in node_modules. Re-run deps unpack or install deps, then retry."
  }
  return "UI not ready; check Vite startup logs or run ui:build:smoke."
}

function Get-DesktopStartError {
  param(
    [string]$DesktopLogPath,
    [string]$Fallback = "desktop_not_running"
  )
  if (-not [string]::IsNullOrWhiteSpace($DesktopLogPath) -and (Test-Path -LiteralPath $DesktopLogPath)) {
    try {
      $tail = Get-Content -LiteralPath $DesktopLogPath -Tail 40 -ErrorAction Stop
      foreach ($line in $tail) {
        $t = [string]$line
        if ([string]::IsNullOrWhiteSpace($t)) { continue }
        if ($t -match "(?i)electron|not recognized|cannot find|spawn|EPERM|ENOENT") {
          return $t.Trim()
        }
      }
    } catch {}
  }
  return $Fallback
}

function Resolve-UiDepsMode {
  param(
    [string]$RepoRoot,
    [string]$UiDir
  )
  $nodeModulesPath = Join-Path $UiDir "node_modules"
  $usePack = ([string]$env:REGION_AI_UI_DEPS_PACK -eq "1")
  if ($usePack) {
    $unpackScript = Join-Path $RepoRoot "tools\ui_deps_unpack.ps1"
    if (-not (Test-Path -LiteralPath $unpackScript)) {
      return [ordered]@{ ok = $false; mode = "missing"; failure_reason = "ui_deps_unpack_script_missing" }
    }
    $raw = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $unpackScript -Json 2>&1)
    $line = [string]($raw | Select-Object -Last 1)
    $obj = $null
    try { $obj = $line | ConvertFrom-Json -ErrorAction Stop } catch {}
    if (-not $obj) {
      return [ordered]@{ ok = $false; mode = "missing"; failure_reason = "ui_deps_unpack_json_invalid" }
    }
    if ([int]$obj.exit_code -ne 0 -or -not [bool]$obj.unpacked) {
      $reason = [string]$obj.failure_reason
      if ([string]::IsNullOrWhiteSpace($reason)) { $reason = "ui_deps_unpack_failed" }
      return [ordered]@{ ok = $false; mode = "missing"; failure_reason = ("ui_deps_unpack_failed:" + $reason) }
    }
    if (Test-Path -LiteralPath $nodeModulesPath) {
      return [ordered]@{ ok = $true; mode = "deps_pack"; failure_reason = "" }
    }
    return [ordered]@{ ok = $false; mode = "missing"; failure_reason = "ui_deps_unpack_no_node_modules" }
  }

  if (Test-Path -LiteralPath $nodeModulesPath) {
    return [ordered]@{ ok = $true; mode = "node_modules"; failure_reason = "" }
  }

  if ([string]$env:REGION_AI_UI_AUTO_NPM_CI -eq "1") {
    $cmd = 'npm.cmd ci --no-audit --no-fund --prefer-offline'
    $proc = Start-Process -FilePath $env:ComSpec -ArgumentList @("/d", "/s", "/c", $cmd) -WorkingDirectory $UiDir -PassThru -WindowStyle Hidden
    $waitOk = $proc.WaitForExit(180000)
    if (-not $waitOk) {
      try { Stop-ProcessTree -RootPid $proc.Id } catch {}
      return [ordered]@{ ok = $false; mode = "missing"; failure_reason = "ui_auto_npm_ci_timeout" }
    }
    if ($proc.ExitCode -eq 0 -and (Test-Path -LiteralPath $nodeModulesPath)) {
      return [ordered]@{ ok = $true; mode = "node_modules"; failure_reason = "" }
    }
    return [ordered]@{ ok = $false; mode = "missing"; failure_reason = "ui_auto_npm_ci_failed" }
  }

  return [ordered]@{
    ok = $false
    mode = "missing"
    failure_reason = "ui_node_modules_missing"
    hint = "Run tools/ui_deps_pack.ps1 on a network-enabled env and copy artifacts, then set REGION_AI_UI_DEPS_PACK=1"
  }
}

function Save-JsonUtf8NoBom {
  param([string]$PathText, $Obj)
  $json = $Obj | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($PathText, $json, [System.Text.UTF8Encoding]::new($false))
}

function Load-State {
  param([string]$PathText)
  if (-not (Test-Path -LiteralPath $PathText)) { return $null }
  try { return (Get-Content -LiteralPath $PathText -Raw | ConvertFrom-Json) } catch { return $null }
}

function Parse-PidsTextFile {
  param([string]$PathText)
  if (-not (Test-Path -LiteralPath $PathText)) { return $null }
  $obj = [ordered]@{}
  try {
    $lines = Get-Content -LiteralPath $PathText -ErrorAction Stop
    foreach ($line in $lines) {
      $t = [string]$line
      if ($t -notmatch '=') { continue }
      $idx = $t.IndexOf('=')
      if ($idx -lt 1) { continue }
      $k = $t.Substring(0, $idx).Trim()
      $v = $t.Substring($idx + 1).Trim()
      if (-not [string]::IsNullOrWhiteSpace($k)) { $obj[$k] = $v }
    }
  } catch {
    return $null
  }
  return $obj
}

try {
  $script:RepoRootForOutput = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
  Push-Location -LiteralPath $script:RepoRootForOutput
  $script:PushedRepoRoot = $true

  $modeCount = @($Start, $Stop, $Status | Where-Object { $_ }).Count
  if ($modeCount -gt 1) {
    Emit-Result -Result ([ordered]@{
        action = "desktop_dev_all"
        status = "not_ready"
        ui_deps_mode = "missing"
        ui_optional = $true
        api_ok = $false
        ui_ok = $false
        desktop_ok = $false
        failure_reason = "multiple_actions"
        note = "multiple_actions"
        timestamp = (Get-Date).ToString("o")
      }) -ExitCode 1
  }
  if ($modeCount -eq 0) { $Status = $true }

  $repoRoot = $script:RepoRootForOutput
  $logsDir = Join-Path $repoRoot "data\\logs"
  New-DirIfMissing -PathText $logsDir
  $statePath = Join-Path $logsDir "desktop_dev_all_state.json"
  $timestamp = Get-Date -Format "yyyyMMdd_HHmmss_fff"

  $orchDir = Join-Path $repoRoot "apps\\orchestrator"
  $uiDir = Join-Path $repoRoot "apps\\ui_discord"
  $desktopDir = Join-Path $repoRoot "apps\\ui_desktop_electron"

  if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = Join-Path $env:TEMP "region_ai\\workspace"
  }
  $WorkspaceRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot)

  $apiUrl = "http://$ApiHost`:$ApiPort/api/ssot/recipes"
  $uiUrl = "http://$UiHost`:$UiPort/"
  $desktopOptional = ([string]$env:REGION_AI_DESKTOP_OPTIONAL -eq "1")

if ($Start) {
  $existing = Load-State -PathText $statePath
  if ($existing) {
    $existingApiAlive = Test-ProcessAlive -ProcessId ([int]$existing.api_pid)
    $existingUiAlive = Test-ProcessAlive -ProcessId ([int]$existing.ui_pid)
    $existingDesktopAlive = Test-ProcessAlive -ProcessId ([int]$existing.desktop_pid)
    if ($existingApiAlive -or $existingUiAlive -or $existingDesktopAlive) {
      $existingApiUrl = if ([string]::IsNullOrWhiteSpace([string]$existing.api_url)) { $apiUrl } else { [string]$existing.api_url }
      $existingApiBaseUrl = if ([string]::IsNullOrWhiteSpace([string]$existing.api_base_url)) { $existingApiUrl } else { [string]$existing.api_base_url }
      $existingUiUrl = if ([string]::IsNullOrWhiteSpace([string]$existing.ui_url)) { $uiUrl } else { [string]$existing.ui_url }
      $apiCheck = if ($existingApiAlive) { Test-EndpointWithHint -Url $existingApiBaseUrl -Attempts 3 } else { [ordered]@{ ok = $false; hint = "api_process_not_alive" } }
      $apiOk = [bool]$apiCheck.ok
      $apiHint = [string]$apiCheck.hint
      $uiCheck = if ($existingUiAlive) { Test-EndpointWithHint -Url $existingUiUrl -Attempts 2 } else { [ordered]@{ ok = $false; hint = "ui_process_not_alive" } }
      $uiOk = [bool]$uiCheck.ok
      $desktopOk = $existingDesktopAlive
      $status = "not_ready"
      if ($apiOk -and $desktopOk -and $uiOk) {
        $status = "ready"
      } elseif ($apiOk -and (($desktopOk) -or $desktopOptional)) {
        $status = "partial_ready"
      }
      $code = if ($status -eq "not_ready" -or ($apiOk -and -not $desktopOk -and -not $desktopOptional)) { 1 } else { 0 }
      $uiHint = if ($uiOk) { "" } else { Get-UiHint -UiDir $uiDir }
      $desktopStartError = if ($desktopOk) { "" } else { [string]$existing.desktop_start_error }
      if ([string]::IsNullOrWhiteSpace($desktopStartError) -and -not $desktopOk) {
        $desktopStartError = "desktop_not_running"
      }
      Emit-Result -Result ([ordered]@{
          action = "desktop_dev_all"
          status = $status
          note = "already_running"
          ui_deps_mode = [string]($existing.ui_deps_mode)
          ui_optional = $true
          desktop_optional = $desktopOptional
          failure_reason = if ($code -eq 0) { "" } else { "already_running_not_ready" }
          api_hint = $apiHint
          ui_hint = $uiHint
          desktop_start_error = $desktopStartError
          api_base_url = $existingApiBaseUrl
          ui_url = $existingUiUrl
          api_pid = [int]$existing.api_pid
          ui_pid = [int]$existing.ui_pid
          desktop_pid = [int]$existing.desktop_pid
          api_ok = $apiOk
          ui_ok = $uiOk
          desktop_ok = $desktopOk
          timestamp = (Get-Date).ToString("o")
        }) -ExitCode $code
    }
  }

  $apiLog = Join-Path $logsDir ("dev_all_{0}_api.log" -f $timestamp)
  $uiLog = Join-Path $logsDir ("dev_all_{0}_ui.log" -f $timestamp)
  $desktopLog = Join-Path $logsDir ("dev_all_{0}_desktop.log" -f $timestamp)
  $pidTextPath = Join-Path $logsDir ("pids_dev_all_{0}.txt" -f $timestamp)
  "" | Set-Content -LiteralPath $apiLog -Encoding UTF8
  "" | Set-Content -LiteralPath $uiLog -Encoding UTF8
  "" | Set-Content -LiteralPath $desktopLog -Encoding UTF8

  $apiCmd = 'set "REGION_AI_WORKSPACE=' + $WorkspaceRoot.Replace('"', '""') + '" && npm.cmd run build && npm.cmd run ui:api >> "' + $apiLog + '" 2>>&1'
  $uiCmd = 'npm.cmd run ui:dev -- --host ' + $UiHost + ' --port ' + $UiPort + ' --strictPort >> "' + $uiLog + '" 2>>&1'
  $desktopCmd = 'set "REGION_AI_WORKSPACE=' + $WorkspaceRoot.Replace('"', '""') + '" && set "REGION_AI_UI_URL=http://' + $UiHost + ':' + $UiPort + '" && set "REGION_AI_UI_API_BASE=http://' + $ApiHost + ':' + $ApiPort + '" && npm.cmd run desktop:dev >> "' + $desktopLog + '" 2>>&1'

  $apiProc = $null
  $uiProc = $null
  $desktopProc = $null
  $uiDeps = Resolve-UiDepsMode -RepoRoot $repoRoot -UiDir $uiDir
  if (-not [bool]$uiDeps.ok) {
    $failReason = [string]$uiDeps.failure_reason
    $hint = [string]$uiDeps.hint
    if (-not [string]::IsNullOrWhiteSpace($hint)) { $failReason = "$failReason ($hint)" }
    Emit-Result -Result ([ordered]@{
        action = "desktop_dev_all"
        status = "not_ready"
        ui_deps_mode = [string]$uiDeps.mode
        ui_optional = $true
        desktop_optional = $desktopOptional
        api_ok = $false
        ui_ok = $false
        desktop_ok = $false
        failure_reason = $failReason
        api_hint = "api_not_started"
        ui_hint = Get-UiHint -UiDir $uiDir
        desktop_start_error = ""
        api_base_url = $apiUrl
        ui_url = $uiUrl
        note = $failReason
        api_pid = 0
        ui_pid = 0
        desktop_pid = 0
        api_log = $apiLog
        ui_log = $uiLog
        desktop_log = $desktopLog
        state_file = $statePath
        timestamp = (Get-Date).ToString("o")
      }) -ExitCode 1
  }
  try {
    $apiProc = Start-Process -FilePath $env:ComSpec -ArgumentList @("/d", "/s", "/c", $apiCmd) -WorkingDirectory $orchDir -PassThru -WindowStyle Hidden
    $apiReady = Wait-EndpointReady -Url $apiUrl -TimeoutSec $ReadyTimeoutSec -PidToWatch $apiProc.Id
    if (-not $apiReady) { throw "api_not_ready" }

    $uiOk = $false
    $uiStartError = ""
    try {
      $uiProc = Start-Process -FilePath $env:ComSpec -ArgumentList @("/d", "/s", "/c", $uiCmd) -WorkingDirectory $uiDir -PassThru -WindowStyle Hidden
      $uiReady = Wait-EndpointReady -Url $uiUrl -TimeoutSec $ReadyTimeoutSec -PidToWatch $uiProc.Id
      $uiOk = [bool]$uiReady
    } catch {
      $uiStartError = [string]$_.Exception.Message
      $uiOk = $false
    }

    $desktopAlive = $false
    $desktopStartError = ""
    try {
      $desktopProc = Start-Process -FilePath $env:ComSpec -ArgumentList @("/d", "/s", "/c", $desktopCmd) -WorkingDirectory $desktopDir -PassThru -WindowStyle Hidden
      Start-Sleep -Milliseconds 700
      $desktopAlive = Test-ProcessAlive -ProcessId $desktopProc.Id
      if (-not $desktopAlive) {
        $desktopStartError = Get-DesktopStartError -DesktopLogPath $desktopLog -Fallback "desktop_not_running"
        if (-not $desktopOptional) { throw "desktop_not_running" }
      }
    } catch {
      $desktopStartError = Get-DesktopStartError -DesktopLogPath $desktopLog -Fallback ([string]$_.Exception.Message)
      if (-not $desktopOptional) { throw "desktop_not_running" }
      $desktopAlive = $false
    }
    $apiOk = $true
    $statusText = if ($uiOk -and $desktopAlive) { "ready" } else { "partial_ready" }
    $uiHint = if ($uiOk) { "" } else { Get-UiHint -UiDir $uiDir }
    if ((-not $uiOk) -and -not [string]::IsNullOrWhiteSpace($uiStartError)) {
      $uiHint = "$uiHint ui_start_error=$uiStartError"
    }

    $lines = @(
      "api_pid=$($apiProc.Id)",
      "ui_pid=$($uiProc.Id)",
      "desktop_pid=$(if ($desktopProc) { $desktopProc.Id } else { 0 })",
      "api_base_url=$apiUrl",
      "api_url=$apiUrl",
      "ui_url=$uiUrl",
      "api_log=$apiLog",
      "ui_log=$uiLog",
      "desktop_log=$desktopLog",
      "desktop_optional=$desktopOptional",
      "desktop_start_error=$desktopStartError",
      "workspace_root=$WorkspaceRoot"
    )
    [System.IO.File]::WriteAllText($pidTextPath, ($lines -join [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))

    $stateObj = [ordered]@{
      timestamp = (Get-Date).ToString("o")
      api_pid = [int]$apiProc.Id
      ui_pid = [int]$uiProc.Id
      desktop_pid = if ($desktopProc) { [int]$desktopProc.Id } else { 0 }
      ui_deps_mode = [string]$uiDeps.mode
      desktop_optional = $desktopOptional
      desktop_start_error = [string]$desktopStartError
      api_base_url = $apiUrl
      api_url = $apiUrl
      ui_url = $uiUrl
      api_log = $apiLog
      ui_log = $uiLog
      desktop_log = $desktopLog
      pid_file = $pidTextPath
      workspace_root = $WorkspaceRoot
    }
    Save-JsonUtf8NoBom -PathText $statePath -Obj $stateObj

    Emit-Result -Result ([ordered]@{
        action = "desktop_dev_all"
        status = $statusText
        ui_deps_mode = [string]$uiDeps.mode
        ui_optional = $true
        desktop_optional = $desktopOptional
        failure_reason = ""
        api_hint = ""
        api_ok = $apiOk
        ui_ok = $uiOk
        desktop_ok = $desktopAlive
        ui_hint = $uiHint
        desktop_start_error = [string]$desktopStartError
        api_base_url = $apiUrl
        ui_url = $uiUrl
        api_pid = [int]$apiProc.Id
        ui_pid = [int]$uiProc.Id
        desktop_pid = if ($desktopProc) { [int]$desktopProc.Id } else { 0 }
        api_log = $apiLog
        ui_log = $uiLog
        desktop_log = $desktopLog
        pid_file = $pidTextPath
        state_file = $statePath
        workspace_root = $WorkspaceRoot
        timestamp = (Get-Date).ToString("o")
      }) -ExitCode 0
  } catch {
    if ($desktopProc -and (Test-ProcessAlive -ProcessId $desktopProc.Id)) { Stop-ProcessTree -RootPid $desktopProc.Id | Out-Null }
    if ($uiProc -and (Test-ProcessAlive -ProcessId $uiProc.Id)) { Stop-ProcessTree -RootPid $uiProc.Id | Out-Null }
    if ($apiProc -and (Test-ProcessAlive -ProcessId $apiProc.Id)) { Stop-ProcessTree -RootPid $apiProc.Id | Out-Null }
    $apiAlive = if ($apiProc) { Test-ProcessAlive -ProcessId $apiProc.Id } else { $false }
    $uiAlive = if ($uiProc) { Test-ProcessAlive -ProcessId $uiProc.Id } else { $false }
    $desktopAlive = if ($desktopProc) { Test-ProcessAlive -ProcessId $desktopProc.Id } else { $false }
    $apiCheck = if ($apiAlive) { Test-EndpointWithHint -Url $apiUrl -Attempts 3 } else { [ordered]@{ ok = $false; hint = "api_process_not_alive" } }
    $apiOk = [bool]$apiCheck.ok
    $apiHint = [string]$apiCheck.hint
    $uiCheck = if ($uiAlive) { Test-EndpointWithHint -Url $uiUrl -Attempts 2 } else { [ordered]@{ ok = $false; hint = "ui_process_not_alive" } }
    $uiOk = [bool]$uiCheck.ok
    $uiHint = Get-UiHint -UiDir $uiDir
    $desktopStartError = Get-DesktopStartError -DesktopLogPath $desktopLog -Fallback ([string]$_.Exception.Message)
    Emit-Result -Result ([ordered]@{
        action = "desktop_dev_all"
        status = "not_ready"
        ui_deps_mode = [string]$uiDeps.mode
        ui_optional = $true
        desktop_optional = $desktopOptional
        api_ok = $apiOk
        ui_ok = $uiOk
        desktop_ok = $desktopAlive
        failure_reason = [string]$_.Exception.Message
        api_hint = $apiHint
        ui_hint = $uiHint
        desktop_start_error = $desktopStartError
        api_base_url = $apiUrl
        ui_url = $uiUrl
        note = [string]$_.Exception.Message
        api_pid = if ($apiProc) { [int]$apiProc.Id } else { 0 }
        ui_pid = if ($uiProc) { [int]$uiProc.Id } else { 0 }
        desktop_pid = if ($desktopProc) { [int]$desktopProc.Id } else { 0 }
        api_log = $apiLog
        ui_log = $uiLog
        desktop_log = $desktopLog
        state_file = $statePath
        timestamp = (Get-Date).ToString("o")
      }) -ExitCode 1
  }
}

if ($Stop) {
  $state = Load-State -PathText $statePath
  $latestPidFile = $null
  if (-not $state) {
    $latestPidFile = Get-ChildItem -LiteralPath $logsDir -File -Filter "pids_dev_all_*.txt" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($latestPidFile) {
      $parsed = Parse-PidsTextFile -PathText $latestPidFile.FullName
      if ($parsed) {
        $state = [pscustomobject]@{
          api_pid = [int]($parsed.api_pid | ForEach-Object { $_ })
          ui_pid = [int]($parsed.ui_pid | ForEach-Object { $_ })
          desktop_pid = [int]($parsed.desktop_pid | ForEach-Object { $_ })
          api_base_url = [string]$parsed.api_base_url
          api_url = [string]$parsed.api_url
          ui_url = [string]$parsed.ui_url
          pid_file = $latestPidFile.FullName
        }
      }
    }
  }

  if (-not $state) {
    Emit-Result -Result ([ordered]@{
        action = "desktop_dev_all"
        status = "stopped"
        ui_deps_mode = "missing"
        ui_optional = $true
        desktop_optional = $false
        failure_reason = ""
        api_hint = ""
        ui_hint = ""
        desktop_start_error = ""
        api_base_url = $apiUrl
        ui_url = $uiUrl
        api_ok = $false
        ui_ok = $false
        desktop_ok = $false
        note = "no_state"
        timestamp = (Get-Date).ToString("o")
      }) -ExitCode 0
  }

  $desktopPid = [int]($state.desktop_pid | ForEach-Object { $_ })
  $uiPid = [int]($state.ui_pid | ForEach-Object { $_ })
  $apiPid = [int]($state.api_pid | ForEach-Object { $_ })
  $killed = @()
  foreach ($procId in @($desktopPid, $uiPid, $apiPid)) {
    if ($procId -le 0) { continue }
    if (Test-ProcessAlive -ProcessId $procId) {
      Stop-ProcessTree -RootPid $procId
      $null = Wait-ProcessExit -ProcessId $procId -TimeoutSec 10
      $killed += $procId
    }
  }
  $remaining = @()
  foreach ($procId in @($desktopPid, $uiPid, $apiPid)) {
    if ($procId -gt 0 -and (Test-ProcessAlive -ProcessId $procId)) { $remaining += $procId }
  }
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
  $statusText = if ($remaining.Count -eq 0) { "stopped" } else { "partial" }
  $code = if ($remaining.Count -eq 0) { 0 } else { 1 }
  Emit-Result -Result ([ordered]@{
      action = "desktop_dev_all"
      status = $statusText
      ui_optional = $true
      desktop_optional = if ($null -eq $state.desktop_optional) { $false } else { [bool]$state.desktop_optional }
      ui_deps_mode = [string]($state.ui_deps_mode)
      failure_reason = if ($remaining.Count -eq 0) { "" } else { "stop_remaining_processes" }
      api_hint = ""
      ui_hint = ""
      desktop_start_error = [string]($state.desktop_start_error)
      api_base_url = if ([string]::IsNullOrWhiteSpace([string]$state.api_base_url)) { [string]$state.api_url } else { [string]$state.api_base_url }
      ui_url = [string]($state.ui_url)
      api_ok = $false
      ui_ok = $false
      desktop_ok = $false
      killed_pids = @($killed)
      remaining_pids = @($remaining)
      pid_file = [string]($state.pid_file)
      timestamp = (Get-Date).ToString("o")
    }) -ExitCode $code
}

if ($Status) {
  $state = Load-State -PathText $statePath
  if (-not $state) {
    Emit-Result -Result ([ordered]@{
        action = "desktop_dev_all"
        status = "stopped"
        ui_deps_mode = "missing"
        ui_optional = $true
        desktop_optional = $false
        failure_reason = ""
        api_hint = ""
        ui_hint = ""
        desktop_start_error = ""
        api_base_url = $apiUrl
        ui_url = ""
        api_ok = $false
        ui_ok = $false
        desktop_ok = $false
        timestamp = (Get-Date).ToString("o")
      }) -ExitCode 0
  }
  $apiPid = [int]($state.api_pid | ForEach-Object { $_ })
  $uiPid = [int]($state.ui_pid | ForEach-Object { $_ })
  $desktopPid = [int]($state.desktop_pid | ForEach-Object { $_ })
  $apiAlive = Test-ProcessAlive -ProcessId $apiPid
  $uiAlive = Test-ProcessAlive -ProcessId $uiPid
  $desktopAlive = Test-ProcessAlive -ProcessId $desktopPid
  $desktopOptionalState = if ($null -eq $state.desktop_optional) { $desktopOptional } else { [bool]$state.desktop_optional }
  $apiBaseUrlState = if ([string]::IsNullOrWhiteSpace([string]$state.api_base_url)) { [string]$state.api_url } else { [string]$state.api_base_url }
  if ([string]::IsNullOrWhiteSpace($apiBaseUrlState)) { $apiBaseUrlState = $apiUrl }
  $uiUrlState = [string]$state.ui_url
  $apiCheck = if ($apiAlive) { Test-EndpointWithHint -Url $apiBaseUrlState -Attempts 3 } else { [ordered]@{ ok = $false; hint = "api_process_not_alive" } }
  $apiOk = [bool]$apiCheck.ok
  $apiHint = [string]$apiCheck.hint
  $uiCheck = if ($uiAlive -and -not [string]::IsNullOrWhiteSpace($uiUrlState)) { Test-EndpointWithHint -Url $uiUrlState -Attempts 2 } else { [ordered]@{ ok = $false; hint = "ui_endpoint_unknown_or_not_alive" } }
  $uiOk = [bool]$uiCheck.ok
  $statusText = if (-not $apiOk) { "not_ready" } elseif ($uiOk -and $desktopAlive) { "ready" } else { "partial_ready" }
  $uiHint = if ($uiOk) { "" } else { Get-UiHint -UiDir $uiDir }
  $failureReason = if ($statusText -eq "not_ready") { "status_not_ready" } else { "" }
  $code = if ($statusText -eq "not_ready") { 1 } else { 0 }
  Emit-Result -Result ([ordered]@{
      action = "desktop_dev_all"
      status = $statusText
      ui_optional = $true
      desktop_optional = $desktopOptionalState
      ui_deps_mode = [string]($state.ui_deps_mode)
      failure_reason = $failureReason
      api_hint = $apiHint
      ui_hint = $uiHint
      desktop_start_error = [string]($state.desktop_start_error)
      api_base_url = $apiBaseUrlState
      ui_url = $uiUrlState
      api_ok = $apiOk
      ui_ok = $uiOk
      desktop_ok = $desktopAlive
      api_alive = $apiAlive
      ui_alive = $uiAlive
      desktop_alive = $desktopAlive
      api_pid = $apiPid
      ui_pid = $uiPid
      desktop_pid = $desktopPid
      api_log = [string]($state.api_log)
      ui_log = [string]($state.ui_log)
      desktop_log = [string]($state.desktop_log)
      pid_file = [string]($state.pid_file)
      state_file = $statePath
      workspace_root = [string]($state.workspace_root)
      timestamp = (Get-Date).ToString("o")
    }) -ExitCode $code
}
}
finally {
  if ($script:PushedRepoRoot) {
    Pop-Location
    $script:PushedRepoRoot = $false
  }
}
