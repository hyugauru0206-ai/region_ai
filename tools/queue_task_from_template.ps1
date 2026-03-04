[CmdletBinding()]
param(
  [string]$TemplatePath = "templates\\tasks\\e2e\\task_e2e_timeout_expected_pwsh.yaml",
  [Parameter(Mandatory = $true)]
  [string]$TaskId,
  [string]$TitleSuffix = "",
  [switch]$Wait,
  [switch]$SkipTemplateValidation,
  [switch]$AllowAnyNewResult,
  [string]$ExpectStatus = "success",
  [string]$ExpectErrorCode = ""
)

$ErrorActionPreference = "Stop"

if (@("success", "failed") -notcontains $ExpectStatus.ToLowerInvariant()) {
  Write-Output "usage: -ExpectStatus must be success|failed"
  Write-Output ("got: " + $ExpectStatus)
  exit 1
}

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )
  $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($Content)
  Set-Content -LiteralPath $Path -Value $bytes -Encoding Byte
}

function Replace-Once {
  param(
    [string]$InputText,
    [string]$Pattern,
    [string]$Replacement
  )
  $rx = New-Object System.Text.RegularExpressions.Regex($Pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)
  return $rx.Replace($InputText, $Replacement, 1)
}

function Resolve-WorkspaceRoot {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot
  )

  $candidates = New-Object System.Collections.Generic.List[object]
  $fromEnv = [string]$env:REGION_AI_WORKSPACE
  if (-not [string]::IsNullOrWhiteSpace($fromEnv)) {
    $candidates.Add([PSCustomObject]@{ Label = "REGION_AI_WORKSPACE"; Path = [System.IO.Path]::GetFullPath($fromEnv) })
  }
  $orchestratorLog = Join-Path $RepoRoot "workspace\\orchestrator.out.log"
  if (Test-Path -LiteralPath $orchestratorLog) {
    try {
      $line = Select-String -Path $orchestratorLog -Pattern '^\[orchestrator\] workspace=' | Select-Object -Last 1
      if ($line) {
        $v = ($line.Line -replace '^\[orchestrator\] workspace=', '').Trim()
        if (-not [string]::IsNullOrWhiteSpace($v)) {
          $candidates.Add([PSCustomObject]@{ Label = "orchestrator_runtime_workspace"; Path = [System.IO.Path]::GetFullPath($v) })
        }
      }
    } catch {
      Write-Verbose ("debug_orchestrator_log_parse_failed: " + $_.Exception.Message)
    }
  }
  $candidates.Add([PSCustomObject]@{ Label = "repo_workspace"; Path = (Join-Path $RepoRoot "workspace") })

  if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    $candidates.Add([PSCustomObject]@{
      Label = "localappdata_workspace";
      Path = (Join-Path $env:LOCALAPPDATA "region_ai\\workspace")
    })
  }
  if (-not [string]::IsNullOrWhiteSpace($env:TEMP)) {
    $candidates.Add([PSCustomObject]@{
      Label = "temp_workspace";
      Path = (Join-Path $env:TEMP "region_ai\\workspace")
    })
  }

  try {
    $userName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $principal = New-Object System.Security.Principal.WindowsPrincipal([System.Security.Principal.WindowsIdentity]::GetCurrent())
    $isAdmin = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
    Write-Verbose ("debug_user: " + $userName)
    Write-Verbose ("debug_is_admin: " + $isAdmin)
  } catch {
    Write-Verbose ("debug_user_probe_failed: " + $_.Exception.Message)
  }

  $seen = @{}
  $logs = New-Object System.Collections.Generic.List[string]
  foreach ($c in $candidates) {
    $k = $c.Path.ToLowerInvariant()
    if ($seen.ContainsKey($k)) { continue }
    $seen[$k] = $true

    try {
      $pending = Join-Path $c.Path "queue\\pending"
      New-Item -ItemType Directory -Path $pending -Force | Out-Null
      $testFile = Join-Path $pending (".write_test_{0}_{1}.tmp" -f $PID, [Guid]::NewGuid().ToString("N"))
      "ok" | Set-Content -LiteralPath $testFile -Encoding utf8
      Remove-Item -LiteralPath $testFile -Force -ErrorAction SilentlyContinue
      $logs.Add(("selected {0}: {1}" -f $c.Label, $c.Path))
      return [PSCustomObject]@{ Path = $c.Path; Logs = $logs }
    } catch {
      $hresult = ""
      try { $hresult = ("0x{0:X8}" -f ($_.Exception.HResult -band 0xffffffff)) } catch { $hresult = "" }
      $detail = $_.Exception.Message
      $logs.Add(("failed {0}: {1} ({2})" -f $c.Label, $c.Path, $detail))
      $hPart = ""
      if ($hresult) { $hPart = " :: hresult=" + $hresult }
      Write-Verbose ("debug_probe_fail: " + $c.Path + " :: " + $detail + $hPart)
      continue
    }
  }

  Write-Verbose "hint_security: if all candidates fail with access denied, check Controlled Folder Access and ACL."
  Write-Verbose "hint_cmd_acl: icacls <path>"
  Write-Verbose "hint_cmd_cfa: review Defender protection history / allowed apps."
  throw ("Unable to resolve writable workspace. {0}Hint: set REGION_AI_WORKSPACE to a writable path." -f ([Environment]::NewLine + ($logs -join [Environment]::NewLine) + [Environment]::NewLine))
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$templateAbs = if ([System.IO.Path]::IsPathRooted($TemplatePath)) { $TemplatePath } else { Join-Path $repoRoot $TemplatePath }
if (!(Test-Path -LiteralPath $templateAbs)) {
  throw "Template not found: $templateAbs"
}
$templateRaw = Get-Content -LiteralPath $templateAbs -Raw
$templateTimeoutExpected = $templateRaw -match '(?m)^\s*timeout_expected:\s*true\s*$'
$expectedStdoutText = if ($templateTimeoutExpected) { "DONE" } else { "OK" }
$stdoutMatch = [regex]::Match($templateRaw, '(?ms)-\s*type:\s*stdout_contains\s*\r?\n\s*text:\s*"?(?<t>[^"\r\n]+)"?')
if ($stdoutMatch.Success) {
  $expectedStdoutText = [string]$stdoutMatch.Groups["t"].Value
}
$expectedArtifactPath = ""
$fileExistsMatch = [regex]::Match($templateRaw, '(?ms)-\s*type:\s*file_exists\s*\r?\n\s*path:\s*"?(?<p>[^"\r\n]+)"?')
if ($fileExistsMatch.Success) {
  $expectedArtifactPath = [string]$fileExistsMatch.Groups["p"].Value
}
$artifactExistsMatch = [regex]::Match($templateRaw, '(?ms)-\s*type:\s*artifact_exists\s*\r?\n\s*path:\s*"?(?<p>[^"\r\n]+)"?')
if ($artifactExistsMatch.Success) {
  $expectedArtifactPath = [string]$artifactExistsMatch.Groups["p"].Value
}
$templateHasArtifactAcceptance = $artifactExistsMatch.Success -or $fileExistsMatch.Success
$expectedArtifactName = ""
if (-not [string]::IsNullOrWhiteSpace($expectedArtifactPath)) {
  $parts = $expectedArtifactPath -split '[\\/]'
  if ($parts.Count -gt 0) {
    $expectedArtifactName = [string]$parts[$parts.Count - 1]
  }
}
if ([string]::IsNullOrWhiteSpace($expectedArtifactName) -and ($expectedStdoutText -eq "ARTIFACT_OK")) {
  $expectedArtifactName = "artifact.txt"
}

$workspaceInfo = Resolve-WorkspaceRoot -RepoRoot $repoRoot
$workspaceRoot = [string]$workspaceInfo.Path
Write-Verbose ("debug_workspace_root: " + $workspaceRoot)
foreach ($l in $workspaceInfo.Logs) {
  Write-Verbose ("debug_workspace_probe: " + $l)
}

$raw = $templateRaw
$nowIso = [DateTimeOffset]::Now.ToString("yyyy-MM-ddTHH:mm:sszzz")

$raw = Replace-Once -InputText $raw -Pattern '^\s*id:\s*.*$' -Replacement "  id: $TaskId"
$raw = Replace-Once -InputText $raw -Pattern '^\s*created_at:\s*.*$' -Replacement "  created_at: ""$nowIso"""
if (![string]::IsNullOrWhiteSpace($TitleSuffix)) {
  $m = [regex]::Match($raw, '^(?<p>\s*title:\s*")(?<t>[^"]*)(?<s>".*)$', [System.Text.RegularExpressions.RegexOptions]::Multiline)
  if ($m.Success) {
    $newTitle = ($m.Groups["t"].Value + " " + $TitleSuffix).Trim()
    $raw = Replace-Once -InputText $raw -Pattern '^\s*title:\s*".*"$' -Replacement ('  title: "' + $newTitle + '"')
  }
}

if (-not $SkipTemplateValidation) {
  $hasMetadata = $raw -match '(?m)^\s*metadata:\s*$'
  $hasMetadataId = $raw -match '(?m)^\s*id:\s*\S+\s*$'
  $isPipelineKind = $raw -match '(?m)^\s*kind:\s*pipeline\s*$'
  $hasSpec = $raw -match '(?m)^\s*spec:\s*$'
  $hasSpecCommand = $raw -match '(?m)^\s*command:\s*\S+\s*$'
  $hasSteps = $raw -match '(?m)^\s*steps:\s*$'
  if ($isPipelineKind) {
    if (-not $hasMetadata -or -not $hasMetadataId -or -not $hasSteps) {
      Write-Output "error: generated pipeline yaml failed minimum validation (metadata.id/steps required)"
      Write-Output ("hint: template=" + $templateAbs)
      exit 1
    }
  } elseif (-not $hasMetadata -or -not $hasMetadataId -or -not $hasSpec -or -not $hasSpecCommand) {
    Write-Output "error: generated task yaml failed minimum validation (metadata.id/spec.command required)"
    Write-Output ("hint: template=" + $templateAbs)
    exit 1
  }
}

$pendingDir = Join-Path $workspaceRoot "queue\\pending"
New-Item -ItemType Directory -Path $pendingDir -Force | Out-Null
$queuedPath = Join-Path $pendingDir ($TaskId + ".yaml")
$eventsDir = Join-Path $workspaceRoot "queue\\events"
$existingResultNames = @{}
if (Test-Path -LiteralPath $eventsDir) {
  foreach ($it in (Get-ChildItem -LiteralPath $eventsDir -File -Filter "result_*" -ErrorAction SilentlyContinue)) {
    $existingResultNames[$it.Name] = $true
  }
}
try {
  Write-Utf8NoBom -Path $queuedPath -Content $raw
} catch {
  $msg = $_.Exception.Message
  if ($msg -match "Access to the path") {
    Write-Output "error: failed to write pending task. Access denied."
    Write-Output "hint: run PowerShell as Administrator and retry."
    exit 1
  }
  throw
}
Write-Output "queued: $queuedPath"

if (-not $Wait) {
  exit 0
}

$eventsDir = Join-Path $workspaceRoot "queue\\events"
$dashboard = Join-Path $workspaceRoot "status\\dashboard.md"
$runsDir = Join-Path $workspaceRoot "runs"
$deadline = (Get-Date).AddSeconds(90)
$resultFile = $null
$escapedTaskId = [regex]::Escape($TaskId)
$resultNamePattern = "^result_${escapedTaskId}_run_.*\.ya?ml$"

while ((Get-Date) -lt $deadline) {
  $resultFile = Get-ChildItem -LiteralPath $eventsDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match $resultNamePattern } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($AllowAnyNewResult -and -not $resultFile) {
    $resultFile = Get-ChildItem -LiteralPath $eventsDir -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like "result_*" -and -not $existingResultNames.ContainsKey($_.Name) } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
  }
  if ($resultFile) { break }
  Start-Sleep -Milliseconds 500
}

if (-not $resultFile) {
  Write-Output "result: not found within timeout"
  exit 1
}

$resultRaw = Get-Content -LiteralPath $resultFile.FullName -Raw
$status = [regex]::Match($resultRaw, '(?m)^\s*status:\s*(\S+)\s*$').Groups[1].Value
$runId = [regex]::Match($resultRaw, '(?m)^\s*run_id:\s*(\S+)\s*$').Groups[1].Value
$summary = [regex]::Match($resultRaw, '(?m)^\s*summary:\s*"?(.*?)"?\s*$').Groups[1].Value
$errorsEmpty = [regex]::IsMatch($resultRaw, '(?m)^\s*errors:\s*\[\s*\]\s*$')
$errorsBlock = [regex]::Match($resultRaw, '(?ms)^\s*errors:\s*(.+?)\r?\n\s*[A-Za-z_]+\s*:').Groups[1].Value
if ([string]::IsNullOrWhiteSpace($errorsBlock)) {
  $errorsBlock = [regex]::Match($resultRaw, '(?ms)^\s*errors:\s*(.+)$').Groups[1].Value
}
$hasErrorsArray = $resultRaw -match '(?m)^\s*errors:\s*(\[\s*\]|$)'
$firstErrorCode = [regex]::Match($resultRaw, '(?m)^\s*-\s*code:\s*(\S+)\s*$').Groups[1].Value

Write-Output ("expect_status: " + $ExpectStatus.ToLowerInvariant())
Write-Output ("expect_error_code: " + $ExpectErrorCode)
Write-Output ("result_file: " + $resultFile.FullName)
Write-Verbose ("debug_result_file: " + $resultFile.FullName)
Write-Output ("result_status: " + $status)
Write-Output ("result_summary: " + $summary)
Write-Output ("result_errors_empty: " + $errorsEmpty)
Write-Output ("result_error_code: " + $firstErrorCode)

$artPath = Join-Path $runsDir ($runId + "\\artifacts.json")
$timedOut = $false
$exitCode = 0
$stdout = ""
$artObj = $null
if (Test-Path -LiteralPath $artPath) {
  $artObj = Get-Content -LiteralPath $artPath -Raw | ConvertFrom-Json
  $timedOut = [bool]$artObj.timedOut
  $exitCode = [int]$artObj.exitCode
  $stdout = [string]$artObj.stdout
} elseif ($ExpectStatus.ToLowerInvariant() -eq "success") {
  Write-Output ("artifacts: missing " + $artPath)
  exit 1
}
$stdoutHasDone = $stdout.Contains("DONE")
$stdoutHasExpected = $stdout.Contains($expectedStdoutText)
$artifactFiles = @()
if ($null -ne $artObj.files) {
  foreach ($f in $artObj.files) {
    if ($null -ne $f) { $artifactFiles += [string]$f }
  }
}
$artifactFilesCount = $artifactFiles.Count
$artifactHasExpected = $true
if (-not [string]::IsNullOrWhiteSpace($expectedArtifactName)) {
  $artifactHasExpected = $false
  foreach ($f in $artifactFiles) {
    if ($f -match [regex]::Escape($expectedArtifactName) + '$') {
      $artifactHasExpected = $true
      break
    }
  }
}
$timeoutObserved = $timedOut -or ($exitCode -eq 124)

Write-Output ("artifacts_file: " + $artPath)
Write-Verbose ("debug_artifacts_file: " + $artPath)
Write-Output ("artifacts_timedOut: " + $timedOut)
Write-Output ("artifacts_exitCode: " + $exitCode)
Write-Output ("artifacts_stdout_has_DONE: " + $stdoutHasDone)
Write-Output ("artifacts_stdout_has_expected: " + $stdoutHasExpected)
Write-Output ("artifacts_files_count: " + $artifactFilesCount)
if (-not [string]::IsNullOrWhiteSpace($expectedArtifactName)) {
  Write-Output ("artifacts_has_expected_file: " + $artifactHasExpected + " (" + $expectedArtifactName + ")")
}
Write-Verbose ("debug_artifact_acceptance_in_template: " + $templateHasArtifactAcceptance)
if ($templateHasArtifactAcceptance) {
  Write-Verbose "debug_artifact_validation_mode: acceptance_managed"
} else {
  Write-Verbose "debug_artifact_validation_mode: tools_mandatory"
}
if (-not [string]::IsNullOrWhiteSpace($errorsBlock)) {
  Write-Verbose "debug_errors_block_begin: True"
  Write-Verbose ("debug_errors_block: " + ($errorsBlock -replace '\r?\n', ' | '))
  Write-Verbose "debug_errors_block_end: True"
}

$dashLine = ""
if (Test-Path -LiteralPath $dashboard) {
  $dashLine = (Select-String -Path $dashboard -Pattern $TaskId | Select-Object -Last 1).Line
}
Write-Output ("dashboard_line: " + $dashLine)

$expect = $ExpectStatus.ToLowerInvariant()
if ($expect -eq "success") {
  $ok = $false
  if ($templateTimeoutExpected) {
    $ok = ($status -eq "success") -and $errorsEmpty -and $timeoutObserved -and $stdoutHasDone -and ($dashLine -match '^\s*-\s*\[OK\]')
  } else {
    $artifactGateOk = $true
    if (-not $templateHasArtifactAcceptance) {
      $artifactGateOk = $artifactHasExpected
    } elseif (-not $artifactHasExpected) {
      Write-Verbose ("debug_artifact_tools_supplemental_ng: expected=" + $expectedArtifactName)
    }
    $ok = ($status -eq "success") -and $errorsEmpty -and (-not $timeoutObserved) -and ($exitCode -eq 0) -and $stdoutHasExpected -and $artifactGateOk -and ($dashLine -match '^\s*-\s*\[OK\]')
  }
  if ($ok) {
    Write-Output "final: PASS (success expectation matched)"
    exit 0
  }
  Write-Output "final: FAIL (success expectation not met)"
  exit 1
}

if ($expect -eq "failed") {
  $okFailed = ($status -eq "failed") -and ($dashLine -match '^\s*-\s*\[NG\]')
  if (![string]::IsNullOrWhiteSpace($ExpectErrorCode)) {
    if (-not $hasErrorsArray -or $errorsEmpty) {
      Write-Output "final: FAIL (expected error code but errors are empty/missing)"
      exit 1
    }
    if ($firstErrorCode -ne $ExpectErrorCode) {
      Write-Output ("final: FAIL (error code mismatch expected=" + $ExpectErrorCode + " actual=" + $firstErrorCode + ")")
      exit 1
    }
  }
  if ($okFailed) {
    Write-Output "final: PASS (failed expectation matched)"
    exit 0
  }
  Write-Output "final: FAIL (failed expectation not met)"
  exit 1
}

Write-Output ("error: unsupported ExpectStatus: " + $ExpectStatus)
exit 1
