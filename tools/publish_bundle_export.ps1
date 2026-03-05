[CmdletBinding()]
param(
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$exportDir = Join-Path $repoRoot ("artifacts\push_export_" + $timestamp)
$bundlePath = Join-Path $exportDir "region_ai_head.bundle"
$headShort = ""

$result = [ordered]@{
  action = "publish_bundle_export"
  ok = $false
  export_dir = $exportDir
  bundle = $bundlePath
  head = ""
  failure_reason = ""
  exit_code = 1
}

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

try {
  Set-Location $repoRoot

  $repoCheck = Invoke-GitCmd -WorkingDir $repoRoot -GitArgs @("rev-parse", "--is-inside-work-tree")
  if ($repoCheck.code -ne 0) { throw "git_repository_not_found" }

  $headProbe = Invoke-GitCmd -WorkingDir $repoRoot -GitArgs @("rev-parse", "--short", "HEAD")
  if ($headProbe.code -eq 0) { $headShort = ([string]($headProbe.out -join "`n")).Trim() }
  if (-not [string]::IsNullOrWhiteSpace($headShort)) {
    $result.head = $headShort
  }

  New-Item -ItemType Directory -Path $exportDir -Force | Out-Null

  $createOut = Invoke-GitCmd -WorkingDir $repoRoot -GitArgs @("bundle", "create", $bundlePath, "HEAD")
  if ($createOut.code -ne 0) { throw "git_bundle_create_failed" }

  $verifyOut = Invoke-GitCmd -WorkingDir $repoRoot -GitArgs @("bundle", "verify", $bundlePath)
  if ($verifyOut.code -ne 0) {
    $reason = [string]($verifyOut.out -join " | ")
    if ([string]::IsNullOrWhiteSpace($reason)) { $reason = "git_bundle_verify_failed" }
    throw $reason
  }

  if (-not (Test-Path -LiteralPath $bundlePath)) { throw "bundle_not_found_after_create" }

  $result.ok = $true
  $result.exit_code = 0
}
catch {
  $result.failure_reason = $_.Exception.Message
  if (-not $Json) {
    Write-Output ("publish_bundle_export_failed: " + $_.Exception.Message)
  }
}
finally {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
}

exit $result.exit_code
