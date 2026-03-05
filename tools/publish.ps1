[CmdletBinding()]
param(
  [ValidateSet("export", "from_bundle")]
  [string]$Mode = "export",
  [string]$RepoUrl = "",
  [string]$BundlePath = "",
  [string]$PublishDir = "",
  [string]$BranchName = "from_bundle",
  [string]$RemoteBranch = "from_bundle",
  [string]$ConfirmPhrase = "",
  [switch]$DryRun,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ($Mode -eq "export") {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "tools\publish_bundle_export.ps1") -Json:$Json
  exit $LASTEXITCODE
}

if ([string]::IsNullOrWhiteSpace($RepoUrl) -or [string]::IsNullOrWhiteSpace($BundlePath)) {
  $result = [ordered]@{
    action = "publish"
    mode = "from_bundle"
    ok = $false
    failure_reason = "repo_url_and_bundle_path_required"
    exit_code = 1
  }
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
  exit 1
}

$args = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $repoRoot "tools\publish_from_bundle.ps1"),
  "-RepoUrl", $RepoUrl,
  "-BundlePath", $BundlePath,
  "-BranchName", $BranchName,
  "-RemoteBranch", $RemoteBranch
)
if (-not [string]::IsNullOrWhiteSpace($PublishDir)) { $args += @("-PublishDir", $PublishDir) }
if (-not [string]::IsNullOrWhiteSpace($ConfirmPhrase)) { $args += @("-ConfirmPhrase", $ConfirmPhrase) }
if ($DryRun) { $args += "-DryRun" }
if ($Json) { $args += "-Json" }

& powershell @args
exit $LASTEXITCODE
