[CmdletBinding()]
param(
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$orchDir = Join-Path $repoRoot "apps/orchestrator"
$docsCheckScript = Join-Path $repoRoot "tools/docs_check.ps1"
$psExe = Join-Path $env:WINDIR "System32\\WindowsPowerShell\\v1.0\\powershell.exe"

function Write-Info {
  param([string]$Message)
  if (-not $Json) {
    Write-Output $Message
  }
}

function Resolve-WorkspaceRootForLock {
  $fromEnv = [string]$env:REGION_AI_WORKSPACE
  if (-not [string]::IsNullOrWhiteSpace($fromEnv)) {
    return [System.IO.Path]::GetFullPath($fromEnv)
  }
  return (Join-Path $env:TEMP "region_ai\\workspace")
}

function Test-AliveProcess {
  param([int]$ProcessId)
  if ($ProcessId -le 0) { return $false }
  try {
    $null = Get-Process -Id $ProcessId -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Clear-StaleRunE2eLock {
  $workspaceRoot = Resolve-WorkspaceRootForLock
  $lockDir = Join-Path $workspaceRoot "locks\\run_e2e.lock"
  if (-not (Test-Path -LiteralPath $lockDir)) { return }

  $ownerFile = Join-Path $lockDir "owner.json"
  if (-not (Test-Path -LiteralPath $ownerFile)) {
    Remove-Item -LiteralPath $lockDir -Recurse -Force -ErrorAction SilentlyContinue
    return
  }

  $owner = $null
  try {
    $owner = Get-Content -LiteralPath $ownerFile -Raw | ConvertFrom-Json -ErrorAction Stop
  } catch {
    Remove-Item -LiteralPath $lockDir -Recurse -Force -ErrorAction SilentlyContinue
    return
  }

  $ownerPid = 0
  if ($owner -and $owner.pid) { $ownerPid = [int]$owner.pid }
  if (-not (Test-AliveProcess -ProcessId $ownerPid)) {
    Remove-Item -LiteralPath $lockDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Clear-SmokeBacklog {
  $workspaceRoot = Resolve-WorkspaceRootForLock
  $paths = @(
    (Join-Path $workspaceRoot "queue\\pending"),
    (Join-Path $workspaceRoot "exec\\Requests"),
    (Join-Path $workspaceRoot "exec\\Results")
  )
  foreach ($p in $paths) {
    if (-not (Test-Path -LiteralPath $p)) { continue }
    try {
      Get-ChildItem -LiteralPath $p -File -ErrorAction SilentlyContinue | ForEach-Object {
        try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue } catch {}
      }
    } catch {}
  }
}

$result = [ordered]@{
  action = "ci_smoke"
  docs_check_ok = $false
  verify_ok = $false
  e2e_ok = $false
  exit_code = 1
}

try {
  $docsArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $docsCheckScript)
  if ($Json) { $docsArgs += "-Json" }
  $docsOut = @(& $psExe @docsArgs 2>&1)
  $docsExit = $LASTEXITCODE
  if ($Json -and $docsOut.Count -gt 0) {
    # Preserve single-line JSON contract in child by not re-emitting it here.
    # Parse and summarize in ci_smoke final JSON.
    $docsObj = $docsOut[-1] | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($docsObj) { $result.docs_check_ok = [bool]$docsObj.ok }
  } else {
    foreach ($line in $docsOut) { Write-Info ([string]$line) }
  }
  if ($docsExit -ne 0) { throw "docs_check failed" }
  if (-not $Json) { $result.docs_check_ok = $true }
  if ($Json -and (-not $result.docs_check_ok)) { $result.docs_check_ok = $true }

  Push-Location $orchDir
  try {
    & npm.cmd run verify
    if ($LASTEXITCODE -ne 0) { throw "verify failed" }
    $result.verify_ok = $true

    # Fast-fail friendly: reclaim stale run_e2e lock before e2e script.
    Clear-StaleRunE2eLock
    Clear-SmokeBacklog
    & npm.cmd run e2e:auto:dev:isolated:json
    if ($LASTEXITCODE -ne 0) { throw "e2e:auto:dev:isolated:json failed" }
    $result.e2e_ok = $true
  }
  finally {
    Pop-Location
  }
}
catch {
  if (-not $Json) {
    Write-Info ("ci_smoke_failed: " + $_.Exception.Message)
  }
}

$result.exit_code = if ($result.docs_check_ok -and $result.verify_ok -and $result.e2e_ok) { 0 } else { 1 }

if ($Json) {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
}

exit $result.exit_code
