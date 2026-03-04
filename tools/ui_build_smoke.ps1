[CmdletBinding()]
param(
  [switch]$Json,
  [string]$WorkspaceRoot = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$uiDir = Join-Path $repoRoot "apps/ui_discord"
$psExe = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$depsUnpackScript = Join-Path $repoRoot "tools/ui_deps_unpack.ps1"
$depsPackZip = Join-Path $repoRoot "artifacts/ui_discord_node_modules.zip"
$depsPackManifest = Join-Path $repoRoot "artifacts/ui_discord_deps_pack_manifest.json"
$logsDir = Join-Path $repoRoot "data\\logs"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss_fff"
$logPath = Join-Path $logsDir ("ui_build_smoke_" + $timestamp + ".log")

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
  $WorkspaceRoot = Join-Path $env:TEMP "region_ai\\workspace"
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

function Invoke-CmdLogged {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$LogPath,
    [int]$TimeoutSec = 900
  )

  $outPath = $LogPath + ".stdout"
  $errPath = $LogPath + ".stderr"
  if (Test-Path -LiteralPath $outPath) { Remove-Item -LiteralPath $outPath -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $errPath) { Remove-Item -LiteralPath $errPath -Force -ErrorAction SilentlyContinue }

  $wrappedCommand = "(" + $Command + ") & echo __RC__=%errorlevel%"
  $proc = Start-Process -FilePath $env:ComSpec -ArgumentList @("/d", "/s", "/c", $wrappedCommand) -WorkingDirectory $WorkingDirectory -PassThru -WindowStyle Hidden -RedirectStandardOutput $outPath -RedirectStandardError $errPath
  $deadline = (Get-Date).AddSeconds([Math]::Max(1, $TimeoutSec))
  $timedOut = $false
  while (-not $proc.HasExited) {
    if ((Get-Date) -ge $deadline) {
      $timedOut = $true
      Stop-ProcessTree -RootPid $proc.Id
      break
    }
    Start-Sleep -Milliseconds 200
    $proc.Refresh()
  }
  try { $proc.WaitForExit() } catch {}
  $proc.Refresh()
  $exitCode = if ($timedOut) { 124 } elseif ($null -eq $proc.ExitCode) { 1 } else { [int]$proc.ExitCode }

  $outLines = @()
  $errLines = @()
  if (Test-Path -LiteralPath $outPath) { $outLines = @(Get-Content -LiteralPath $outPath) }
  if (Test-Path -LiteralPath $errPath) { $errLines = @(Get-Content -LiteralPath $errPath) }

  $markerIndex = -1
  $markerExit = 0
  for ($i = $outLines.Count - 1; $i -ge 0; $i--) {
    $line = [string]$outLines[$i]
    if ($line -match '^__RC__=(-?\d+)\s*$') {
      $markerIndex = $i
      $markerExit = [int]$Matches[1]
      break
    }
  }
  if ($markerIndex -ge 0) {
    if ($markerIndex -gt 0) {
      $outLines = @($outLines[0..($markerIndex - 1)])
    } else {
      $outLines = @()
    }
    if (-not $timedOut) { $exitCode = $markerExit }
  }

  Add-Content -LiteralPath $LogPath -Value ("`n== CMD ==`n" + $Command + "`n")
  Add-Content -LiteralPath $LogPath -Value ("== STDOUT ==`n" + (($outLines | ForEach-Object { [string]$_ }) -join "`n") + "`n")
  Add-Content -LiteralPath $LogPath -Value ("== STDERR ==`n" + (($errLines | ForEach-Object { [string]$_ }) -join "`n") + "`n")

  return [ordered]@{
    exit_code = $exitCode
    timed_out = $timedOut
    stdout_lines = $outLines
    stderr_lines = $errLines
    all_lines = @($outLines + $errLines)
  }
}

function Update-DiagnosticsFromLines {
  param(
    [Parameter(Mandatory = $true)][System.Collections.IEnumerable]$Lines,
    [Parameter(Mandatory = $true)][System.Collections.IDictionary]$ResultObj
  )

  foreach ($lineObj in $Lines) {
    $line = [string]$lineObj
    $clean = [regex]::Replace($line, '\x1B\[[0-9;]*[A-Za-z]', '')
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if (($ResultObj.npm_error_code -eq "") -and ($clean -match 'npm error code\s+([A-Za-z0-9_]+)')) {
      $ResultObj.npm_error_code = [string]$Matches[1]
    }
    if (($ResultObj.npm_log_path -eq "") -and ($clean -match 'A complete log of this run can be found in:\s*(.+)$')) {
      $ResultObj.npm_log_path = ([string]$Matches[1]).Trim()
    }
    if (($ResultObj.eperm_path -eq "") -and ($clean -match 'npm error path\s+(.+)$')) {
      $ResultObj.eperm_path = ([string]$Matches[1]).Trim()
    }
    if (($ResultObj.eperm_path -eq "") -and ($clean -match 'failed to load config from\s+(.+)$')) {
      $ResultObj.eperm_path = ([string]$Matches[1]).Trim()
    }
    if (($ResultObj.eperm_path -eq "") -and ($clean -match '(?i)EPERM') -and ($clean -match '([A-Za-z]:\\[^"\s]+)')) {
      $ResultObj.eperm_path = ([string]$Matches[1]).Trim()
    }
  }
}

$result = [ordered]@{
  action = "ui_build_smoke"
  skipped = $false
  skip_reason = ""
  ui_build_passed = $false
  npm_cache = ""
  outdir = ""
  log_path = $logPath
  failure_reason = ""
  failed_command = ""
  npm_error_code = ""
  eperm_path = ""
  npm_log_path = ""
  suggestion = ""
  exit_code = 1
}

try {
  New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
  Set-Content -LiteralPath $logPath -Value ("ui_build_smoke started_at=" + (Get-Date).ToString("o")) -Encoding UTF8

  if ($env:REGION_AI_SKIP_UI_BUILD -eq "1") {
    $result.skipped = $true
    $result.skip_reason = "env_skip"
    $result.ui_build_passed = $true
    $result.exit_code = 0
  } else {
    if (-not (Test-Path -LiteralPath $uiDir)) {
      throw "ui_dir_not_found: $uiDir"
    }

    $cacheDir = Join-Path $WorkspaceRoot "._npm_cache\\ui_discord"
    New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
    $env:npm_config_cache = $cacheDir
    $result.npm_cache = $cacheDir

    $outDirEnv = [string]$env:REGION_AI_UI_BUILD_OUTDIR
    if ([string]::IsNullOrWhiteSpace($outDirEnv)) {
      $outDir = Join-Path $WorkspaceRoot "._ui_build_dist\\ui_discord"
    } else {
      $outDir = $outDirEnv
    }
    $result.outdir = $outDir

    try {
      New-Item -ItemType Directory -Path $outDir -Force | Out-Null
      $probe = Join-Path $outDir (".write_test_" + $PID + ".tmp")
      "ok" | Set-Content -LiteralPath $probe -Encoding utf8
      Remove-Item -LiteralPath $probe -Force
    } catch {
      $result.failure_reason = "outdir_not_writable"
      $result.suggestion = "set REGION_AI_UI_BUILD_OUTDIR to a writable path or fix ACL/EDR"
      throw $result.failure_reason
    }

    if ($env:REGION_AI_UI_DEPS_PACK -eq "1") {
      if (-not (Test-Path -LiteralPath $depsPackZip) -or -not (Test-Path -LiteralPath $depsPackManifest)) {
        throw ("deps_pack_missing: run tools/ui_deps_pack.ps1 first (" + $depsPackZip + ", " + $depsPackManifest + ")")
      }
      $result.failed_command = ("`"" + $psExe + "`" -NoProfile -ExecutionPolicy Bypass -File `"" + $depsUnpackScript + "`" -Json")
      $unpackLines = @(& $psExe -NoProfile -ExecutionPolicy Bypass -File $depsUnpackScript -Json 2>&1)
      Add-Content -LiteralPath $logPath -Value ("`n== CMD ==`n" + $result.failed_command + "`n")
      Add-Content -LiteralPath $logPath -Value ("== OUTPUT ==`n" + (($unpackLines | ForEach-Object { [string]$_ }) -join "`n") + "`n")
      Update-DiagnosticsFromLines -Lines $unpackLines -ResultObj $result
      if ($LASTEXITCODE -ne 0) { throw "ui_deps_unpack_failed" }
    } else {
      $result.failed_command = "npm.cmd ci --no-audit --no-fund --prefer-offline"
      $ciRun = Invoke-CmdLogged -Command $result.failed_command -WorkingDirectory $uiDir -LogPath $logPath
      Update-DiagnosticsFromLines -Lines $ciRun.all_lines -ResultObj $result
      if ($ciRun.exit_code -ne 0) {
        if ($ciRun.timed_out) { throw "npm_ci_timeout" }
        throw "npm_ci_failed"
      }
    }

    $result.failed_command = ("npm.cmd run ui:build -- --outDir `"" + $outDir + "`" --emptyOutDir")
    $buildRun = Invoke-CmdLogged -Command $result.failed_command -WorkingDirectory $uiDir -LogPath $logPath
    Update-DiagnosticsFromLines -Lines $buildRun.all_lines -ResultObj $result
    if ($buildRun.exit_code -ne 0) {
      if ($buildRun.timed_out) { throw "ui_build_timeout" }
      if ([string]::IsNullOrWhiteSpace($result.npm_error_code) -and ($buildRun.all_lines -join "`n" -match '(?i)EPERM')) {
        $result.npm_error_code = "EPERM"
      }
      throw "ui_build_failed"
    }
    $result.ui_build_passed = $true
    $result.npm_error_code = ""
    $result.eperm_path = ""
    $result.npm_log_path = ""
    $result.suggestion = ""
    $result.failure_reason = ""
    $result.exit_code = 0
  }
}
catch {
  if ([string]::IsNullOrWhiteSpace($result.failure_reason)) {
    $result.failure_reason = $_.Exception.Message
  }
  if (($result.failure_reason -eq "ui_build_failed") -and [string]::IsNullOrWhiteSpace($result.suggestion) -and ($result.npm_error_code -eq "EPERM")) {
    $result.suggestion = "set REGION_AI_UI_BUILD_OUTDIR to a writable path or fix ACL/EDR"
  }
  if (-not $Json) {
    Write-Output ("ui_build_smoke_failed: " + $_.Exception.Message)
    Write-Output ("ui_build_smoke_log: " + $logPath)
  }
}

if ($Json) {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
}

exit $result.exit_code
