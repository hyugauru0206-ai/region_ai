[CmdletBinding()]
param(
  [string]$WorkspaceRoot = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$orchDir = Join-Path $repoRoot "apps/orchestrator"
$uiDir = Join-Path $repoRoot "apps/ui_discord"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
  $WorkspaceRoot = Join-Path $env:TEMP "region_ai\\workspace"
}

$apiCmd = "set REGION_AI_WORKSPACE=$WorkspaceRoot&& npm.cmd run build&& npm.cmd run ui:api"
$uiCmd = "npm.cmd run ui:dev"

$api = Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/s", "/c", $apiCmd) -WorkingDirectory $orchDir -PassThru
$ui = Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/s", "/c", $uiCmd) -WorkingDirectory $uiDir -PassThru

Write-Output ("ui_api_pid: " + $api.Id)
Write-Output ("ui_vite_pid: " + $ui.Id)
Write-Output "Press Ctrl+C to stop both."

try {
  while ($true) {
    Start-Sleep -Seconds 1
    if ($api.HasExited -or $ui.HasExited) { break }
  }
} finally {
  try { if (-not $api.HasExited) { Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue } } catch {}
  try { if (-not $ui.HasExited) { Stop-Process -Id $ui.Id -Force -ErrorAction SilentlyContinue } } catch {}
}
