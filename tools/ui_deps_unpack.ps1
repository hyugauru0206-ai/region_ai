[CmdletBinding()]
param(
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$uiDir = Join-Path $repoRoot "apps/ui_discord"
$artifactsDir = Join-Path $repoRoot "artifacts"
$zipPath = Join-Path $artifactsDir "ui_discord_node_modules.zip"
$manifestPath = Join-Path $artifactsDir "ui_discord_deps_pack_manifest.json"
$nodeModulesPath = Join-Path $uiDir "node_modules"

$result = [ordered]@{
  action = "ui_deps_unpack"
  unpacked = $false
  zip_path = $zipPath
  manifest_path = $manifestPath
  expected_zip_sha256 = ""
  actual_zip_sha256 = ""
  failure_reason = ""
  exit_code = 1
}

try {
  if (-not (Test-Path -LiteralPath $uiDir)) {
    throw "ui_dir_not_found: $uiDir"
  }
  if (-not (Test-Path -LiteralPath $zipPath)) {
    throw "deps_pack_zip_not_found: $zipPath"
  }
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "deps_pack_manifest_not_found: $manifestPath"
  }

  $manifestRaw = Get-Content -LiteralPath $manifestPath -Raw
  $manifest = $manifestRaw | ConvertFrom-Json -ErrorAction Stop
  if (-not $manifest.zip_sha256) {
    throw "deps_pack_manifest_invalid: zip_sha256_missing"
  }
  $expectedHash = ([string]$manifest.zip_sha256).ToLowerInvariant()
  $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $result.expected_zip_sha256 = $expectedHash
  $result.actual_zip_sha256 = $actualHash
  if ($actualHash -ne $expectedHash) {
    throw ("deps_pack_hash_mismatch: expected=" + $expectedHash + " actual=" + $actualHash)
  }

  if (Test-Path -LiteralPath $nodeModulesPath) {
    Remove-Item -LiteralPath $nodeModulesPath -Recurse -Force
  }

  Expand-Archive -LiteralPath $zipPath -DestinationPath $uiDir -Force

  if (-not (Test-Path -LiteralPath $nodeModulesPath)) {
    throw "node_modules_not_found_after_unpack: $nodeModulesPath"
  }

  $result.unpacked = $true
  $result.exit_code = 0
}
catch {
  $result.failure_reason = $_.Exception.Message
  if (-not $Json) {
    Write-Output ("ui_deps_unpack_failed: " + $_.Exception.Message)
  }
}

if ($Json) {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
}

exit $result.exit_code
