[CmdletBinding()]
param(
  [switch]$Json,
  [string]$WorkspaceRoot = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$uiDir = Join-Path $repoRoot "apps/ui_discord"
$artifactsDir = Join-Path $repoRoot "artifacts"
$zipPath = Join-Path $artifactsDir "ui_discord_node_modules.zip"
$manifestPath = Join-Path $artifactsDir "ui_discord_deps_pack_manifest.json"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
  $WorkspaceRoot = Join-Path $env:TEMP "region_ai\\workspace"
}

$result = [ordered]@{
  action = "ui_deps_pack"
  packed = $false
  zip_path = $zipPath
  manifest_path = $manifestPath
  zip_sha256 = ""
  zip_size_bytes = 0
  node_version = ""
  npm_version = ""
  npm_cache = ""
  failure_reason = ""
  exit_code = 1
}

try {
  if (-not (Test-Path -LiteralPath $uiDir)) {
    throw "ui_dir_not_found: $uiDir"
  }

  New-Item -ItemType Directory -Path $artifactsDir -Force | Out-Null

  $cacheDir = Join-Path $WorkspaceRoot "._npm_cache\\ui_discord"
  New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
  $env:npm_config_cache = $cacheDir
  $result.npm_cache = $cacheDir

  Push-Location $uiDir
  try {
    & npm.cmd ci --no-audit --no-fund --prefer-offline
    if ($LASTEXITCODE -ne 0) { throw "npm_ci_failed" }
  } finally {
    Pop-Location
  }

  $nodeModulesPath = Join-Path $uiDir "node_modules"
  if (-not (Test-Path -LiteralPath $nodeModulesPath)) {
    throw "node_modules_not_found_after_ci: $nodeModulesPath"
  }

  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }

  Push-Location $uiDir
  try {
    Compress-Archive -Path "node_modules" -DestinationPath $zipPath -CompressionLevel Optimal -Force
  } finally {
    Pop-Location
  }

  $zipFile = Get-Item -LiteralPath $zipPath
  $zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $nodeVersion = (& node --version).Trim()
  if ($LASTEXITCODE -ne 0) { throw "node_version_failed" }
  $npmVersion = (& npm.cmd --version).Trim()
  if ($LASTEXITCODE -ne 0) { throw "npm_version_failed" }

  $manifest = [ordered]@{
    schema_version = 1
    action = "ui_deps_pack_manifest"
    created_at_utc = [DateTime]::UtcNow.ToString("o")
    app = "apps/ui_discord"
    zip_file_name = "ui_discord_node_modules.zip"
    zip_sha256 = $zipHash
    zip_size_bytes = [int64]$zipFile.Length
    node_version = $nodeVersion
    npm_version = $npmVersion
  }
  [System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 5))

  $result.packed = $true
  $result.zip_sha256 = $zipHash
  $result.zip_size_bytes = [int64]$zipFile.Length
  $result.node_version = $nodeVersion
  $result.npm_version = $npmVersion
  $result.exit_code = 0
}
catch {
  $result.failure_reason = $_.Exception.Message
  if (-not $Json) {
    Write-Output ("ui_deps_pack_failed: " + $_.Exception.Message)
  }
}

if ($Json) {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
}

exit $result.exit_code
