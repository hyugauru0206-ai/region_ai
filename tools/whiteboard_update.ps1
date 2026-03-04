[CmdletBinding()]
param(
  [string]$DesignPath = "",
  [string]$WhiteboardPath = "docs/whiteboard_region_ai.md",
  [switch]$DryRun,
  [switch]$RequireApplied,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$latestPath = Join-Path $repoRoot "docs/design/LATEST.txt"

function Write-Info {
  param([string]$Message)
  if (-not $Json) {
    Write-Output $Message
  }
}

function Resolve-DesignPath {
  param([string]$InputPath)
  if (-not [string]::IsNullOrWhiteSpace($InputPath)) {
    if ([System.IO.Path]::IsPathRooted($InputPath)) { return $InputPath }
    return Join-Path $repoRoot $InputPath
  }
  if (-not (Test-Path -LiteralPath $latestPath)) {
    throw "LATEST.txt not found: $latestPath"
  }
  $line = (Get-Content -LiteralPath $latestPath -Raw).Trim()
  $parts = $line -split "\|"
  $candidate = $parts[0].Trim()
  if ([string]::IsNullOrWhiteSpace($candidate)) {
    throw "LATEST.txt missing design path"
  }
  if ([System.IO.Path]::IsPathRooted($candidate)) { return $candidate }
  return Join-Path $repoRoot $candidate
}

function Extract-ImpactValue {
  param(
    [string]$Text,
    [string]$Key
  )
  $impact = [regex]::Match($Text, '(?s)##[ \t]*Whiteboard impact[ \t]*\r?\n(.*?)(?=\r?\n##\s+|\z)').Groups[1].Value
  if ([string]::IsNullOrWhiteSpace($impact)) { return "" }
  $m = [regex]::Match($impact, '(?im)^\s*-\s*' + [regex]::Escape($Key) + '\s*:\s*(.+)$')
  if ($m.Success) { return (Normalize-ImpactText -Text $m.Groups[1].Value) }
  return ""
}

function Extract-SectionValue {
  param(
    [string]$Text,
    [string]$Header
  )
  $m = [regex]::Match($Text, "(?s)##\s*" + [regex]::Escape($Header) + "[ \t]*\r?\n-\s*(.*?)(?=\r?\n##\s+|\z)")
  if ($m.Success) {
    return (Normalize-ImpactText -Text $m.Groups[1].Value)
  }
  return ""
}

function Normalize-ImpactText {
  param([string]$Text)
  if ($null -eq $Text) { return "" }
  $v = $Text.Replace("`r", " ").Replace("`n", " ").Trim()
  $v = [regex]::Replace($v, '\s{2,}', ' ')
  while ($v -match '(?i)(^|\s)before:\s*before:\s*') {
    $v = [regex]::Replace($v, '(?i)(^|\s)before:\s*before:\s*', '$1Before: ')
  }
  while ($v -match '(?i)(^|\s)after:\s*after:\s*') {
    $v = [regex]::Replace($v, '(?i)(^|\s)after:\s*after:\s*', '$1After: ')
  }
  return $v.Trim()
}

function Extract-LastDesignId {
  param([string]$Text)
  $m = [regex]::Match($Text, '(?m)^- last_design_id:\s*(.+)\s*$')
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  return ""
}

function Replace-SectionBody {
  param(
    [string]$Text,
    [string]$Header,
    [string]$Body
  )
  $pattern = "(?s)(##\s+" + [regex]::Escape($Header) + "[ \t]*`r?`n)(.*?)(?=`r?`n##\s+|\z)"
  $m = [regex]::Match($Text, $pattern)
  if (-not $m.Success) { return $Text }
  $clean = Normalize-ImpactText -Text $Body
  $newBody = "- " + $clean + "`r`n"
  return $Text.Substring(0, $m.Index) + $m.Groups[1].Value + $newBody + $Text.Substring($m.Index + $m.Length)
}

$DesignPath = Resolve-DesignPath -InputPath $DesignPath
if (-not (Test-Path -LiteralPath $DesignPath)) {
  throw "design not found: $DesignPath"
}

$whiteboardAbs = if ([System.IO.Path]::IsPathRooted($WhiteboardPath)) { $WhiteboardPath } else { Join-Path $repoRoot $WhiteboardPath }
if (-not (Test-Path -LiteralPath $whiteboardAbs)) {
  throw "whiteboard not found: $whiteboardAbs"
}

$designRaw = Get-Content -LiteralPath $DesignPath -Raw
$wbRaw = Get-Content -LiteralPath $whiteboardAbs -Raw
$designId = [System.IO.Path]::GetFileNameWithoutExtension($DesignPath)
$designRel = "docs/design/" + [System.IO.Path]::GetFileName($DesignPath)
$beforeNow = Extract-SectionValue -Text $wbRaw -Header "Now"
$beforeDoD = Extract-SectionValue -Text $wbRaw -Header "DoD"
$beforeLastDesignId = Extract-LastDesignId -Text $wbRaw

$now = Extract-ImpactValue -Text $designRaw -Key "Now"
$dod = Extract-ImpactValue -Text $designRaw -Key "DoD"
if (-not [string]::IsNullOrWhiteSpace($now)) {
  $wbRaw = Replace-SectionBody -Text $wbRaw -Header "Now" -Body $now
}
if (-not [string]::IsNullOrWhiteSpace($dod)) {
  $wbRaw = Replace-SectionBody -Text $wbRaw -Header "DoD" -Body $dod
}

if ($wbRaw -match '(?m)^- Active design:') {
  $wbRaw = [regex]::Replace($wbRaw, '(?m)^- Active design:.*$', ('- Active design: ' + $designRel))
} else {
  $wbRaw += "`r`n- Active design: " + $designRel
}

if ($wbRaw -match '(?m)^- last_design_id:') {
  $wbRaw = [regex]::Replace($wbRaw, '(?m)^- last_design_id:.*$', ('- last_design_id: ' + $designId))
} else {
  $wbRaw += "`r`n- last_design_id: " + $designId
}

$stamp = (Get-Date).ToString("o")
if ($wbRaw -match '(?m)^- last_updated:') {
  $wbRaw = [regex]::Replace($wbRaw, '(?m)^- last_updated:.*$', ('- last_updated: ' + $stamp))
} else {
  $wbRaw += "`r`n- last_updated: " + $stamp
}

$afterNow = Extract-SectionValue -Text $wbRaw -Header "Now"
$afterDoD = Extract-SectionValue -Text $wbRaw -Header "DoD"
$afterLastDesignId = Extract-LastDesignId -Text $wbRaw
$nowDodChanged = (($beforeNow -ne $afterNow) -or ($beforeDoD -ne $afterDoD))
$designIdMismatchBefore = ([string]::IsNullOrWhiteSpace($beforeLastDesignId) -or ($beforeLastDesignId -ne $designId))
$changed = ($nowDodChanged -or $designIdMismatchBefore)

if ($DryRun) {
  if (-not $Json) {
    Write-Output ("dry_run_changed: " + $changed)
    Write-Output "dry_run_diff_now:"
    Write-Output ("  before: " + $beforeNow)
    Write-Output ("  after:  " + $afterNow)
    Write-Output "dry_run_diff_dod:"
    Write-Output ("  before: " + $beforeDoD)
    Write-Output ("  after:  " + $afterDoD)
  }
} else {
  Set-Content -LiteralPath $whiteboardAbs -Value $wbRaw -Encoding UTF8
  Write-Info ("updated: " + $whiteboardAbs)
}

if ($Json) {
  $requireAppliedOk = $true
  if ($RequireApplied -and $DryRun -and $changed) {
    $requireAppliedOk = $false
  }
  $obj = [ordered]@{
    action = "whiteboard_update"
    dry_run = [bool]$DryRun
    changed = [bool]$changed
    now_dod_changed = [bool]$nowDodChanged
    design_id_mismatch_before = [bool]$designIdMismatchBefore
    design_id = $designId
    whiteboard_path = $whiteboardAbs
    before_last_design_id = $beforeLastDesignId
    after_last_design_id = $afterLastDesignId
    require_applied = [bool]$RequireApplied
    require_applied_ok = [bool]$requireAppliedOk
  }
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
}
if ($RequireApplied -and $DryRun -and $changed) {
  exit 1
}
exit 0
