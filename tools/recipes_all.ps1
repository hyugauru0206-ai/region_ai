[CmdletBinding()]
param(
  [switch]$Json,
  [bool]$IsolatedWorkspace = $true,
  [string[]]$Modes
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Info {
  param([Parameter(Mandatory = $true)][string]$Message)
  if (-not $Json) {
    Write-Output $Message
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runE2eScript = Join-Path $repoRoot "tools\\run_e2e.ps1"
$psExe = Join-Path $env:WINDIR "System32\\WindowsPowerShell\\v1.0\\powershell.exe"

if (-not (Test-Path -LiteralPath $runE2eScript)) {
  throw ("run_e2e script not found: " + $runE2eScript)
}

if ($null -eq $Modes -or $Modes.Count -eq 0) {
  $Modes = @(
    "recipe_generate_validate_json",
    "recipe_patch_apply_end_to_end",
    "recipe_release_bundle",
    "recipe_evidence_export_bundle",
    "recipe_ops_snapshot",
    "recipe_morning_brief_bundle",
    "recipe_pipeline_exec_fail_ng"
  )
}

$result = [ordered]@{
  action = "recipes_all"
  ok = $true
  modes_run = @()
  failed_mode = ""
  exit_code = 0
}

try {
  foreach ($mode in $Modes) {
    $result.modes_run += $mode
    Write-Info ("recipes_all_mode: " + $mode)

    $args = @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", $runE2eScript,
      "-Mode", $mode,
      "-Json"
    )
    if ($IsolatedWorkspace) {
      $args += "-IsolatedWorkspace"
    }

    $output = @(& $psExe @args 2>&1)
    $exitCode = $LASTEXITCODE

    if (-not $Json) {
      foreach ($line in $output) {
        if ($null -ne $line) {
          Write-Output ([string]$line)
        }
      }
    }

    if ($exitCode -ne 0) {
      $result.ok = $false
      $result.failed_mode = $mode
      $result.exit_code = 1
      break
    }
  }
}
catch {
  $result.ok = $false
  if ([string]::IsNullOrWhiteSpace($result.failed_mode)) {
    $result.failed_mode = "recipes_all_exception"
  }
  $result.exit_code = 1
  if (-not $Json) {
    Write-Output ("recipes_all_error: " + $_.Exception.Message)
  }
}

if ($Json) {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
}

if ($result.ok) { exit 0 } else { exit 1 }
