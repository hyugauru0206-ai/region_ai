[CmdletBinding()]
param(
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$compactScript = Join-Path $repoRoot "tools\inbox_compact.ps1"
$workspaceRoot = Join-Path $env:TEMP ("region_ai\workspace_inbox_compact_smoke_" + (Get-Date -Format "yyyyMMdd_HHmmss_fff"))
$desktopDir = Join-Path $workspaceRoot "ui\desktop"
$inboxPath = Join-Path $desktopDir "inbox.jsonl"
$archiveDir = Join-Path $desktopDir "archive"

$result = [ordered]@{
  action = "inbox_compact_smoke"
  compact_ok = $false
  archive_ok = $false
  trimmed_ok = $false
  exit_code = 1
}

try {
  New-Item -ItemType Directory -Path $desktopDir -Force | Out-Null
  $lines = @()
  for ($i = 1; $i -le 30; $i += 1) {
    $row = @{ id = "inbox_$i"; ts = (Get-Date).ToString("o"); title = "t$i"; body = "b$i" } | ConvertTo-Json -Compress
    $lines += $row
  }
  [System.IO.File]::WriteAllLines($inboxPath, $lines, [System.Text.UTF8Encoding]::new($false))

  $compactJson = & powershell -NoProfile -ExecutionPolicy Bypass -File $compactScript -WorkspaceRoot $workspaceRoot -MaxLines 10 -Json
  if ($LASTEXITCODE -ne 0) { throw "compact_script_failed" }
  $obj = $compactJson | ConvertFrom-Json -ErrorAction Stop
  if (-not [bool]$obj.compacted) { throw "compact_not_triggered" }
  if ([int]$obj.archived_lines -ne 20) { throw "archived_lines_unexpected" }
  if ([int]$obj.kept_lines -ne 10) { throw "kept_lines_unexpected" }
  $result.compact_ok = $true

  $archives = @(Get-ChildItem -LiteralPath $archiveDir -Filter "inbox_*.jsonl.gz" -ErrorAction SilentlyContinue)
  if ($archives.Count -lt 1) { throw "archive_missing" }
  $result.archive_ok = $true

  $remaining = @([System.IO.File]::ReadAllLines($inboxPath, [System.Text.Encoding]::UTF8))
  if ($remaining.Count -ne 10) { throw "trimmed_count_unexpected" }
  $result.trimmed_ok = $true

  $result.exit_code = 0
}
catch {
  if (-not $Json) {
    Write-Output ("inbox_compact_smoke_failed: " + $_.Exception.Message)
  }
}
finally {
  try { Remove-Item -LiteralPath $workspaceRoot -Recurse -Force -ErrorAction SilentlyContinue } catch {}
}

if ($Json) {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
}

exit $result.exit_code
