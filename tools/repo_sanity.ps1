[CmdletBinding()]
param(
  [switch]$Json,
  [switch]$StrictGit
)

$ErrorActionPreference = "Stop"
$fallbackRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$coreFiles = @(
  "package.json",
  "tools/ui_smoke.ps1",
  "tools/ci_smoke_gate.ps1",
  "apps/orchestrator/package.json",
  "docs/spec_region_ai.md",
  "docs/run_region_ai.md"
)

function Invoke-GitCmd {
  param(
    [string]$WorkingDir,
    [string[]]$GitArgs
  )
  $quotedArgs = @()
  foreach ($a in $GitArgs) {
    $quotedArgs += ('"' + $a.Replace('"', '\"') + '"')
  }
  $gitExpr = "git " + ($quotedArgs -join " ") + " 2>&1"
  if ([string]::IsNullOrWhiteSpace($WorkingDir)) {
    $cmdExpr = $gitExpr
  } else {
    $cmdExpr = 'cd /d "' + $WorkingDir + '" && ' + $gitExpr
  }
  $out = @(& $env:ComSpec /d /s /c $cmdExpr)
  $code = $LASTEXITCODE
  return [ordered]@{ out = $out; code = $code }
}

$result = [ordered]@{
  action = "repo_sanity"
  ok = $false
  strict_git = [bool]$StrictGit
  repo_root = $fallbackRoot
  git_exist = $false
  git_repo = $false
  head_checked = $false
  missing_disk = @()
  missing_head = @()
  failure_reason = ""
  exit_code = 1
}

try {
  $gitCmd = Get-Command git -ErrorAction SilentlyContinue
  $gitAvailable = ($null -ne $gitCmd)
  $result.git_exist = $gitAvailable

  if ($gitAvailable) {
    $top = Invoke-GitCmd -WorkingDir $fallbackRoot -GitArgs @("rev-parse", "--show-toplevel")
    if ($top.code -eq 0) {
      $topLine = [string]($top.out | Select-Object -Last 1)
      if (-not [string]::IsNullOrWhiteSpace($topLine)) {
        try {
          $result.repo_root = ([System.IO.Path]::GetFullPath($topLine.Trim()))
          $result.git_repo = $true
        } catch {
          $result.repo_root = $fallbackRoot
          $result.git_repo = $false
        }
      }
    }
  }

  $missingDisk = New-Object System.Collections.Generic.List[string]
  foreach ($rel in $coreFiles) {
    $full = Join-Path $result.repo_root $rel
    if (-not (Test-Path -LiteralPath $full)) {
      [void]$missingDisk.Add($rel)
    }
  }
  $result.missing_disk = @($missingDisk.ToArray())
  if ($result.missing_disk.Count -gt 0) {
    $result.failure_reason = "missing_core_files"
    throw "missing_core_files"
  }

  $shouldCheckHead = ($result.git_exist -and $result.git_repo)
  if ($shouldCheckHead) {
    $result.head_checked = $true
    $missingHead = New-Object System.Collections.Generic.List[string]
    foreach ($rel in $coreFiles) {
      $headProbe = Invoke-GitCmd -WorkingDir $result.repo_root -GitArgs @("cat-file", "-e", ("HEAD:" + $rel))
      if ($headProbe.code -ne 0) {
        [void]$missingHead.Add($rel)
      }
    }
    $result.missing_head = @($missingHead.ToArray())
    if ($StrictGit -and $result.missing_head.Count -gt 0) {
      $result.failure_reason = "missing_in_head"
      throw "missing_in_head"
    }
  }

  $result.ok = $true
  $result.exit_code = 0
}
catch {
  if ([string]::IsNullOrWhiteSpace($result.failure_reason)) {
    if ($result.missing_disk.Count -gt 0) {
      $result.failure_reason = "missing_core_files"
    } elseif ($result.missing_head.Count -gt 0) {
      $result.failure_reason = "missing_in_head"
    } else {
      $result.failure_reason = "missing_core_files"
    }
  }
  if (-not $Json) {
    Write-Output ("repo_sanity_failed: " + $result.failure_reason)
  }
}
finally {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress -Depth 6))
}

exit $result.exit_code
