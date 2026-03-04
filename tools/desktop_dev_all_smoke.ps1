[CmdletBinding()]
param(
  [switch]$Json,
  [switch]$NoDepsPack,
  [switch]$RequireDesktop
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$launcher = Join-Path $repoRoot "tools\desktop_dev_all.ps1"
$pushed = $false

function Get-LastJsonObject {
  param(
    [string[]]$Lines
  )
  $line = [string]($Lines | Select-Object -Last 1)
  if ([string]::IsNullOrWhiteSpace($line)) { return $null }
  return ($line | ConvertFrom-Json -ErrorAction Stop)
}

$result = [ordered]@{
  action = "desktop_dev_all_smoke"
  start_ok = $false
  status_ok = $false
  stop_ok = $false
  ready = $false
  status = "not_ready"
  api_ok = $false
  ui_ok = $false
  desktop_ok = $false
  desktop_optional = $true
  desktop_start_error = ""
  ui_optional = $true
  ui_deps_mode = ""
  failure_reason = ""
  repo_root = $repoRoot
  start_result = $null
  status_result = $null
  stop_result = $null
  exit_code = 1
}

try {
  Push-Location -LiteralPath $repoRoot
  $pushed = $true

  if (-not $NoDepsPack) {
    $env:REGION_AI_UI_DEPS_PACK = "1"
  }
  if ($RequireDesktop) {
    $env:REGION_AI_DESKTOP_OPTIONAL = "0"
    $result.desktop_optional = $false
  } else {
    $env:REGION_AI_DESKTOP_OPTIONAL = "1"
    $result.desktop_optional = $true
  }

  $startRaw = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $launcher -Start -Json 2>&1)
  $startObj = Get-LastJsonObject -Lines $startRaw
  $result.start_result = $startObj
  if ($startObj) {
    $result.ui_deps_mode = [string]$startObj.ui_deps_mode
    $result.start_ok = ([int]$startObj.exit_code -eq 0)
    if ($null -ne $startObj.desktop_optional) {
      $result.desktop_optional = [bool]$startObj.desktop_optional
    }
    $result.desktop_ok = [bool]$startObj.desktop_ok
    $result.api_ok = [bool]$startObj.api_ok
    $result.ui_ok = [bool]$startObj.ui_ok
    $result.status = [string]$startObj.status
    $result.desktop_start_error = [string]$startObj.desktop_start_error
    if (-not [string]::IsNullOrWhiteSpace([string]$startObj.failure_reason)) {
      $result.failure_reason = [string]$startObj.failure_reason
    }
  }

  $statusObj = $null
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    $statusRaw = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $launcher -Status -Json 2>&1)
    $statusObj = Get-LastJsonObject -Lines $statusRaw
    if ($statusObj -and [bool]$statusObj.api_ok -and ([string]$statusObj.status -in @("ready", "partial_ready"))) {
      break
    }
    Start-Sleep -Seconds 1
  }
  $result.status_result = $statusObj
  if ($statusObj) {
    $result.status = [string]$statusObj.status
    $result.api_ok = [bool]$statusObj.api_ok
    $result.ui_ok = [bool]$statusObj.ui_ok
    $result.desktop_ok = [bool]$statusObj.desktop_ok
    if ($null -ne $statusObj.desktop_optional) {
      $result.desktop_optional = [bool]$statusObj.desktop_optional
    }
    $result.desktop_start_error = [string]$statusObj.desktop_start_error
    $result.ui_optional = if ($null -eq $statusObj.ui_optional) { $true } else { [bool]$statusObj.ui_optional }
    if ([string]::IsNullOrWhiteSpace($result.ui_deps_mode)) {
      $result.ui_deps_mode = [string]$statusObj.ui_deps_mode
    }
    $result.status_ok = ($result.status -in @("ready", "partial_ready"))
    $result.ready = ($result.status -eq "ready")
    if ((-not $result.status_ok -or -not $result.api_ok) -and [string]::IsNullOrWhiteSpace($result.failure_reason)) {
      $result.failure_reason = if ([string]::IsNullOrWhiteSpace([string]$statusObj.failure_reason)) { "status_not_ready" } else { [string]$statusObj.failure_reason }
    }
  }

  $stopRaw = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $launcher -Stop -Json 2>&1)
  $stopObj = Get-LastJsonObject -Lines $stopRaw
  $result.stop_result = $stopObj
  if ($stopObj) {
    $result.stop_ok = ([string]$stopObj.status -eq "stopped")
  }

  $startStatusOk = ($result.start_result -and ([string]$result.start_result.status -in @("ready", "partial_ready")))
  $startApiOk = ($result.start_result -and [bool]$result.start_result.api_ok)
  if ((-not $result.status_ok -or -not $result.api_ok) -and $startStatusOk -and $startApiOk) {
    $result.status_ok = $true
    $result.api_ok = $true
    $result.status = [string]$result.start_result.status
    if ([bool]$result.start_result.desktop_ok -eq $false) {
      $result.desktop_ok = $false
    }
    if ([string]::IsNullOrWhiteSpace($result.desktop_start_error)) {
      $result.desktop_start_error = [string]$result.start_result.desktop_start_error
    }
    if ($result.failure_reason -eq "status_not_ready") {
      $result.failure_reason = ""
    }
  }

  if ($result.start_ok -and $result.status_ok -and $result.api_ok) {
    $result.exit_code = 0
  } else {
    $result.exit_code = 1
    if ([string]::IsNullOrWhiteSpace($result.failure_reason)) {
      $result.failure_reason = "start_or_status_failed"
    }
  }
}
catch {
  try {
    $cleanupRaw = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $launcher -Stop -Json 2>&1)
    $cleanupObj = Get-LastJsonObject -Lines $cleanupRaw
    if (-not $result.stop_result) { $result.stop_result = $cleanupObj }
  } catch {}
  if ([string]::IsNullOrWhiteSpace($result.failure_reason)) {
    $result.failure_reason = $_.Exception.Message
  }
}
finally {
  if ($pushed) {
    Pop-Location
  }
}

if ($Json) {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress -Depth 12))
}

exit $result.exit_code
