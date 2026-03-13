[CmdletBinding()]
param(
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$uiDir = Join-Path $repoRoot "apps\\ui_discord"
$orchestratorDir = Join-Path $repoRoot "apps\\orchestrator"
$desktopDir = Join-Path $repoRoot "apps\\ui_desktop_electron"
$outputDir = Join-Path $repoRoot "artifacts\\release\\ui_desktop_electron\\win-unpacked"

function Invoke-NpmScript {
  param(
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$ScriptName
  )

  Push-Location $WorkingDirectory
  try {
    & npm.cmd run $ScriptName
    if ($LASTEXITCODE -ne 0) {
      throw "npm run $ScriptName failed with exit code $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
}

$result = [ordered]@{
  action = "desktop_dist_win"
  output_dir = $outputDir
  executable_path = ""
  executable_name = ""
  exit_code = 1
}

try {
  $env:VITE_UI_API_BASE = "http://127.0.0.1:8787"
  $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
  Invoke-NpmScript -WorkingDirectory $uiDir -ScriptName "ui:build"
  Invoke-NpmScript -WorkingDirectory $orchestratorDir -ScriptName "build"
  Invoke-NpmScript -WorkingDirectory $desktopDir -ScriptName "desktop:dist:win:dir"

  $exe = Get-ChildItem -LiteralPath $outputDir -File -Filter *.exe -ErrorAction SilentlyContinue |
    Sort-Object Name |
    Select-Object -First 1
  if (-not $exe) {
    throw "packaged_executable_not_found: $outputDir"
  }

  $result.executable_path = $exe.FullName
  $result.executable_name = $exe.Name
  $result.exit_code = 0
}
catch {
  $result.error = [string]$_.Exception.Message
}

if ($Json) {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
} else {
  if ($result.exit_code -eq 0) {
    Write-Output ("output_dir: " + $result.output_dir)
    Write-Output ("executable_name: " + $result.executable_name)
    Write-Output ("executable_path: " + $result.executable_path)
  } else {
    Write-Output ("desktop_dist_win_failed: " + [string]$result.error)
  }
}

exit $result.exit_code
