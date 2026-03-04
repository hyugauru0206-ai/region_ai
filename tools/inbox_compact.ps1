[CmdletBinding()]
param(
  [int]$MaxLines = 5000,
  [string]$ArchiveDir = "",
  [string]$WorkspaceRoot = "",
  [switch]$Json
)

$ErrorActionPreference = "Stop"

function Resolve-WorkspaceRoot {
  param([string]$InputRoot)
  if (-not [string]::IsNullOrWhiteSpace($InputRoot)) {
    return [System.IO.Path]::GetFullPath($InputRoot)
  }
  $fromEnv = [string]$env:REGION_AI_WORKSPACE
  if (-not [string]::IsNullOrWhiteSpace($fromEnv)) {
    return [System.IO.Path]::GetFullPath($fromEnv)
  }
  return (Join-Path $env:TEMP "region_ai\workspace")
}

function Move-AtomicFile {
  param(
    [Parameter(Mandatory = $true)][string]$TempPath,
    [Parameter(Mandatory = $true)][string]$TargetPath
  )
  if (Test-Path -LiteralPath $TargetPath) {
    Remove-Item -LiteralPath $TargetPath -Force
  }
  [System.IO.File]::Move($TempPath, $TargetPath)
}

function Write-GzipUtf8 {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$Lines
  )
  $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try {
    $gzip = New-Object System.IO.Compression.GzipStream($fs, [System.IO.Compression.CompressionLevel]::Optimal, $false)
    try {
      $enc = New-Object System.Text.UTF8Encoding($false)
      $sw = New-Object System.IO.StreamWriter($gzip, $enc)
      try {
        foreach ($line in $Lines) {
          $sw.WriteLine([string]$line)
        }
      } finally {
        $sw.Dispose()
      }
    } finally {
      $gzip.Dispose()
    }
  } finally {
    $fs.Dispose()
  }
}

$result = [ordered]@{
  action = "inbox_compact"
  compacted = $false
  archived_lines = 0
  kept_lines = 0
  inbox_path = ""
  archive_path = ""
  exit_code = 1
}

try {
  if ($MaxLines -lt 1) { throw "max_lines_invalid" }
  $workspace = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
  $desktopDir = Join-Path $workspace "ui\desktop"
  $inboxPath = Join-Path $desktopDir "inbox.jsonl"
  $result.inbox_path = $inboxPath

  if ([string]::IsNullOrWhiteSpace($ArchiveDir)) {
    $archiveDirResolved = Join-Path $desktopDir "archive"
  } elseif ([System.IO.Path]::IsPathRooted($ArchiveDir)) {
    $archiveDirResolved = $ArchiveDir
  } else {
    $archiveDirResolved = Join-Path $desktopDir $ArchiveDir
  }

  if (-not (Test-Path -LiteralPath $inboxPath)) {
    $result.kept_lines = 0
    $result.exit_code = 0
    if ($Json) { [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress)) }
    exit 0
  }

  $allLines = @([System.IO.File]::ReadAllLines($inboxPath, [System.Text.Encoding]::UTF8))
  $total = $allLines.Count
  if ($total -le $MaxLines) {
    $result.kept_lines = $total
    $result.exit_code = 0
    if ($Json) { [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress)) }
    exit 0
  }

  $archiveCount = $total - $MaxLines
  $archived = @($allLines[0..($archiveCount - 1)])
  $kept = @($allLines[$archiveCount..($total - 1)])

  [System.IO.Directory]::CreateDirectory($archiveDirResolved) | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $archivePath = Join-Path $archiveDirResolved ("inbox_" + $stamp + ".jsonl.gz")
  $archiveTmp = $archivePath + ".tmp"

  Write-GzipUtf8 -Path $archiveTmp -Lines $archived
  Move-AtomicFile -TempPath $archiveTmp -TargetPath $archivePath

  $trimTmp = $inboxPath + ".tmp"
  [System.IO.File]::WriteAllLines($trimTmp, $kept, [System.Text.UTF8Encoding]::new($false))
  Move-AtomicFile -TempPath $trimTmp -TargetPath $inboxPath

  $result.compacted = $true
  $result.archived_lines = $archiveCount
  $result.kept_lines = $kept.Count
  $result.archive_path = $archivePath
  $result.exit_code = 0
}
catch {
  if (-not $Json) {
    Write-Output ("inbox_compact_failed: " + $_.Exception.Message)
  }
}

if ($Json) {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
}

exit $result.exit_code
