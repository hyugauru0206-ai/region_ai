[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$RepoUrl,
  [Parameter(Mandatory = $true)]
  [string]$BundlePath,
  [string]$PublishDir = "",
  [string]$BranchName = "from_bundle",
  [string]$RemoteBranch = "from_bundle",
  [string]$ConfirmPhrase = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$defaultPublishDir = Join-Path "C:\work" ("region_ai_publish_" + $timestamp)
if ([string]::IsNullOrWhiteSpace($PublishDir)) { $PublishDir = $defaultPublishDir }
$publishDirOriginal = $PublishDir
$publishDirFinal = $PublishDir
$publishDirReused = $false
$resolvedBundlePath = ""
$isDryRun = $true
if ($PSBoundParameters.ContainsKey("DryRun")) { $isDryRun = [bool]$DryRun }

$result = [ordered]@{
  action = "publish_from_bundle"
  ok = $false
  dry_run = $isDryRun
  repo_url = $RepoUrl
  publish_dir = $PublishDir
  publish_dir_original = $publishDirOriginal
  publish_dir_final = $publishDirFinal
  publish_dir_reused = $publishDirReused
  bundle = $BundlePath
  branch = $BranchName
  remote_branch = $RemoteBranch
  push_ok = $false
  hint = "Use HTTPS RepoUrl (https://...) and avoid SSH/22 when pushing from restricted networks."
  failure_reason = ""
  exit_code = 1
}

function Invoke-Git {
  param(
    [string]$WorkDir,
    [string[]]$GitArgs
  )
  $quotedArgs = @()
  foreach ($a in $GitArgs) {
    $quotedArgs += ('"' + $a.Replace('"', '\"') + '"')
  }
  $gitExpr = "git " + ($quotedArgs -join " ") + " 2>&1"
  if ([string]::IsNullOrWhiteSpace($WorkDir)) {
    $cmdExpr = $gitExpr
  } else {
    $cmdExpr = 'cd /d "' + $WorkDir + '" && ' + $gitExpr
  }
  $out = @(& $env:ComSpec /d /s /c $cmdExpr)
  $code = $LASTEXITCODE
  return [ordered]@{ out = $out; code = $code }
}

try {
  if ($RepoUrl -match "^git@|^ssh://") {
    throw "repo_url_must_be_https: use https://... (SSH/22 is discouraged in this flow)"
  }
  if ($RepoUrl -notmatch "^https://") {
    throw "repo_url_should_be_https: use https://... (SSH/22 is discouraged in this flow)"
  }

  if (-not (Test-Path -LiteralPath $BundlePath)) {
    throw ("bundle_not_found: " + $BundlePath)
  }
  $resolvedBundlePath = (Resolve-Path -LiteralPath $BundlePath).Path
  $result.bundle = $resolvedBundlePath

  $verify = Invoke-Git -WorkDir "" -GitArgs @("bundle", "verify", $resolvedBundlePath)
  if ($verify.code -ne 0) {
    $detail = [string]($verify.out -join " | ")
    if ([string]::IsNullOrWhiteSpace($detail)) { $detail = "git_bundle_verify_failed" }
    throw ("bundle_verify_failed: " + $detail)
  }

  if (Test-Path -LiteralPath $PublishDir) {
    try {
      Remove-Item -LiteralPath $PublishDir -Recurse -Force -ErrorAction Stop
    }
    catch {
      $publishDirFinal = Join-Path "C:\work" ("region_ai_publish_" + (Get-Date -Format "yyyyMMdd_HHmmss"))
      $PublishDir = $publishDirFinal
      $result.publish_dir = $PublishDir
      $result.publish_dir_final = $publishDirFinal
      $result.publish_dir_reused = $false
    }
  }

  $clone = Invoke-Git -WorkDir "" -GitArgs @("clone", $RepoUrl, $PublishDir)
  if ($clone.code -ne 0) {
    $detail = [string]($clone.out -join " | ")
    if ([string]::IsNullOrWhiteSpace($detail)) { $detail = "git_clone_failed" }
    throw ("git_clone_failed: " + $detail)
  }

  $fetchRef = "HEAD:refs/heads/" + $BranchName
  $fetch = Invoke-Git -WorkDir $PublishDir -GitArgs @("fetch", $resolvedBundlePath, $fetchRef)
  if ($fetch.code -ne 0) {
    $detail = [string]($fetch.out -join " | ")
    if ([string]::IsNullOrWhiteSpace($detail)) { $detail = "git_fetch_from_bundle_failed" }
    throw ("git_fetch_from_bundle_failed: " + $detail)
  }

  $checkout = Invoke-Git -WorkDir $PublishDir -GitArgs @("checkout", $BranchName)
  if ($checkout.code -ne 0) {
    $detail = [string]($checkout.out -join " | ")
    if ([string]::IsNullOrWhiteSpace($detail)) { $detail = "git_checkout_failed" }
    throw ("git_checkout_failed: " + $detail)
  }

  if ($isDryRun) {
    $result.ok = $true
    $result.push_ok = $false
    $result.exit_code = 0
    [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
    exit 0
  }

  if ($ConfirmPhrase -ne "PUSH") {
    throw "confirm_phrase_required: set -ConfirmPhrase PUSH to run non-dry-run push"
  }

  $pushSpec = $BranchName + ":" + $RemoteBranch
  $push = Invoke-Git -WorkDir $PublishDir -GitArgs @("push", "-u", "origin", $pushSpec)
  if ($push.code -ne 0) {
    $detail = [string]($push.out -join " | ")
    if ([string]::IsNullOrWhiteSpace($detail)) { $detail = "git_push_failed" }
    throw ("git_push_failed: " + $detail)
  }

  $result.ok = $true
  $result.push_ok = $true
  $result.exit_code = 0
}
catch {
  $result.failure_reason = $_.Exception.Message
  $result.hint = "Use HTTPS RepoUrl (https://...) and avoid SSH/22. " + $_.Exception.Message
}
finally {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
}

exit $result.exit_code
