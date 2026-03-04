[CmdletBinding()]
param(
  [string]$DesignPath = "",
  [string[]]$RequiredRoles = @("Reviewer", "QA")
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$latestPath = Join-Path $repoRoot "docs/design/LATEST.txt"

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
  if ([string]::IsNullOrWhiteSpace($line)) {
    throw "LATEST.txt is empty: $latestPath"
  }
  $parts = $line -split "\|"
  $candidate = $parts[0].Trim()
  if ([string]::IsNullOrWhiteSpace($candidate)) {
    throw "LATEST.txt does not contain a design path"
  }
  if ([System.IO.Path]::IsPathRooted($candidate)) {
    return $candidate
  }
  return Join-Path $repoRoot $candidate
}

function Get-SectionBlock {
  param(
    [string]$Text,
    [string[]]$Headers
  )
  foreach ($h in $Headers) {
    $pattern = "(?s)##\s*" + [regex]::Escape($h) + "[ \t]*\r?\n(.*?)(?=\r?\n##\s+|\z)"
    $m = [regex]::Match($Text, $pattern)
    if ($m.Success) {
      return $m.Groups[1].Value
    }
  }
  return ""
}

function Get-WhiteboardValue {
  param(
    [string]$Block,
    [string]$Key
  )
  if ([string]::IsNullOrWhiteSpace($Block)) { return "" }
  $pattern = '(?s)-\s*' + [regex]::Escape($Key) + '\s*:\s*(.*?)(?=\r?\n-\s*(Now|DoD|Blockers|Risks)\s*:|\z)'
  $m = [regex]::Match($Block, $pattern)
  if (-not $m.Success) { return "" }
  return ($m.Groups[1].Value -replace '\r?\n', ' ').Trim()
}

function Test-MeaningfulLine {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
  $v = $Text.Trim()
  $l = $v.ToLowerInvariant()
  if ($l -match '^(<.*>|tbd|pending|todo|n/a|none|optional)$') { return $false }
  if ($l -match '^change\s*\d+\s*:\s*$') { return $false }
  if ($l -match '^decision\s*\d+\s*final\s*:\s*$') { return $false }
  if ($l -match '^\S[\w\-/ ]*:\s*$') { return $false }
  return $true
}

function Get-BulletLines {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return @() }
  return @($Text -split "`r?`n" | Where-Object { $_ -match '^\s*-\s+\S' })
}

$DesignPath = Resolve-DesignPath -InputPath $DesignPath
Write-Verbose ("resolved_design_path: " + $DesignPath)
if (-not (Test-Path -LiteralPath $DesignPath)) {
  Write-Output ("gate_failed_summary: missing_requirements:design_not_found:" + $DesignPath)
  Write-Output ("gate_failed: design not found: " + $DesignPath)
  exit 1
}

$raw = Get-Content -LiteralPath $DesignPath -Raw
$ok = $true
$missing = New-Object System.Collections.Generic.List[string]
$lines = $raw -split "`r?`n"
$parsedReviewedBy = New-Object System.Collections.Generic.List[string]

foreach ($role in $RequiredRoles) {
  $line = ($lines | Where-Object { $_ -match ("^\s*-\s*" + [regex]::Escape($role) + "\s*/") }) | Select-Object -First 1
  if (-not $line) {
    $ok = $false
    $missing.Add($role + ":entry_missing")
    continue
  }
  if ($line -notmatch '(^|\s|/|-)approved(\s|$)') {
    $ok = $false
    $missing.Add($role + ":not_approved")
  }
  $parsedReviewedBy.Add($line.Trim())
}

$researcherLine = ($lines | Where-Object { $_ -match "^\s*-\s*Researcher\s*/" } | Select-Object -First 1)
if (-not $researcherLine) {
  $ok = $false
  $missing.Add("Researcher:entry_missing")
} elseif ($researcherLine -notmatch '(^|\s|/|-)(approved|noted)(\s|$)') {
  $ok = $false
  $missing.Add("Researcher:not_noted_or_approved")
} else {
  $parsedReviewedBy.Add($researcherLine.Trim())
}

$mermaidMatches = [regex]::Matches($raw, '(?s)```mermaid\s*(.*?)```')
if ($mermaidMatches.Count -lt 2) {
  $ok = $false
  $missing.Add("mermaid_blocks_insufficient:found=" + $mermaidMatches.Count + ",need>=2")
}
for ($i = 0; $i -lt $mermaidMatches.Count; $i++) {
  $body = $mermaidMatches[$i].Groups[1].Value
  $nonEmptyLines = @($body -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($nonEmptyLines.Count -lt 1) {
    $ok = $false
    $missing.Add("mermaid_block_empty:index=" + $i)
  }
}

$whiteboardBlock = Get-SectionBlock -Text $raw -Headers @("Whiteboard impact")
if ([string]::IsNullOrWhiteSpace($whiteboardBlock)) {
  $ok = $false
  $missing.Add("whiteboard_impact_section_missing")
} else {
  $nowVal = Get-WhiteboardValue -Block $whiteboardBlock -Key "Now"
  $dodVal = Get-WhiteboardValue -Block $whiteboardBlock -Key "DoD"
  if ([string]::IsNullOrWhiteSpace($nowVal)) {
    $ok = $false
    $missing.Add("whiteboard_impact_now_missing")
  } else {
    if (($nowVal -notmatch '(?i)\bbefore\b') -or ($nowVal -notmatch '(?i)\bafter\b')) {
      $ok = $false
      $missing.Add("whiteboard_impact_now_before_after_missing")
    }
  }
  if ([string]::IsNullOrWhiteSpace($dodVal)) {
    $ok = $false
    $missing.Add("whiteboard_impact_dod_missing")
  } else {
    if (($dodVal -notmatch '(?i)\bbefore\b') -or ($dodVal -notmatch '(?i)\bafter\b')) {
      $ok = $false
      $missing.Add("whiteboard_impact_dod_before_after_missing")
    }
  }
  foreach ($k in @("Blockers", "Risks")) {
    $v = Get-WhiteboardValue -Block $whiteboardBlock -Key $k
    if ([string]::IsNullOrWhiteSpace($v)) {
      $ok = $false
      $missing.Add("whiteboard_impact_" + $k.ToLowerInvariant() + "_missing")
    }
  }
}

$multiAiBlock = Get-SectionBlock -Text $raw -Headers @("Multi-AI plan", "Multi-AI participation plan")
if ([string]::IsNullOrWhiteSpace($multiAiBlock)) {
  $ok = $false
  $missing.Add("multi_ai_plan_missing")
} else {
  foreach ($k in @("Reviewer", "QA", "Researcher")) {
    if ($multiAiBlock -notmatch ("(?im)^\s*-\s*" + [regex]::Escape($k) + "\s*:")) {
      $ok = $false
      $missing.Add("multi_ai_" + $k.ToLowerInvariant() + "_missing")
    }
  }
  if ($multiAiBlock -notmatch '(?im)^\s*-\s*External(\s+AI)?\s*:') {
    $ok = $false
    $missing.Add("multi_ai_external_missing")
  }
}

$externalParticipation = ""
$mParticipation = [regex]::Match($raw, '(?im)^\s*-\s*external_participation\s*:\s*(.+?)\s*$')
if ($mParticipation.Success) {
  $externalParticipation = $mParticipation.Groups[1].Value.Trim().ToLowerInvariant()
}
$externalNotRequired = [regex]::IsMatch($raw, '(?im)^\s*-\s*external_not_required\s*:\s*true\s*$')
if ([string]::IsNullOrWhiteSpace($externalParticipation) -and (-not $externalNotRequired)) {
  $ok = $false
  $missing.Add("external_policy_missing")
} elseif (-not [string]::IsNullOrWhiteSpace($externalParticipation)) {
  if ($externalParticipation -notin @("optional", "required", "none")) {
    $ok = $false
    $missing.Add("external_participation_invalid:" + $externalParticipation)
  }
}

$discussionBlock = Get-SectionBlock -Text $raw -Headers @("Discussion summary")
if ([string]::IsNullOrWhiteSpace($discussionBlock)) {
  $ok = $false
  $missing.Add("discussion_summary_missing")
} else {
  $discussionLines = Get-BulletLines -Text $discussionBlock
  $discussionMeaningful = @($discussionLines | Where-Object {
      $v = ($_ -replace '^\s*-\s*', '').Trim()
      Test-MeaningfulLine -Text $v
    })
  if ($discussionMeaningful.Count -lt 1) {
    $ok = $false
    $missing.Add("discussion_summary_empty")
  }
}

$finalBlock = Get-SectionBlock -Text $raw -Headers @("Final decisions", "Final Decisions")
if ([string]::IsNullOrWhiteSpace($finalBlock)) {
  $ok = $false
  $missing.Add("final_decisions_section_missing")
} else {
  $finalLines = Get-BulletLines -Text $finalBlock
  $finalMeaningful = @($finalLines | Where-Object {
      $v = ($_ -replace '^\s*-\s*', '').Trim()
      Test-MeaningfulLine -Text $v
    })
  if ($finalMeaningful.Count -lt 1) {
    $ok = $false
    $missing.Add("final_decisions_empty")
  }
}

$designId = [System.IO.Path]::GetFileNameWithoutExtension($DesignPath)
Write-Verbose ("extracted_design_id: " + $designId)
$designDir = Split-Path -Parent $DesignPath
$externalFiles = @(
  Get-ChildItem -LiteralPath $designDir -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.BaseName -like ($designId + "__external_claude*") -or
      $_.BaseName -like ($designId + "__external_gemini*") -or
      $_.BaseName -like ($designId + "__claude*") -or
      $_.BaseName -like ($designId + "__gemini*")
    }
)

$requiredReviewFiles = @(
  ($designId + "__reviewer.md"),
  ($designId + "__qa.md"),
  ($designId + "__researcher.md")
)
$missingReviewFiles = New-Object System.Collections.Generic.List[string]
foreach ($rf in $requiredReviewFiles) {
  $rfPath = Join-Path $designDir $rf
  if (-not (Test-Path -LiteralPath $rfPath)) {
    $missingReviewFiles.Add($rf)
  }
}
if ($missingReviewFiles.Count -gt 0) {
  $ok = $false
  $missing.Add("missing_review_files:" + (($missingReviewFiles | ForEach-Object { $_ }) -join ","))
}

$externalRequired = ($externalParticipation -eq "required") -and (-not $externalNotRequired)
if ($externalRequired -and $externalFiles.Count -lt 1) {
  $ok = $false
  $missing.Add("external_evidence_missing")
}

if ($externalFiles.Count -gt 0) {
  $externalBlock = Get-SectionBlock -Text $raw -Headers @("External Reviews")
  if ([string]::IsNullOrWhiteSpace($externalBlock)) {
    $ok = $false
    $missing.Add("external_reviews_section_missing")
  } else {
    foreach ($f in $externalFiles) {
      if ($externalBlock -notmatch [regex]::Escape($f.Name)) {
        $ok = $false
        $missing.Add("external_review_not_listed:" + $f.Name)
      }
    }
  }
}

if ($parsedReviewedBy.Count -gt 0) {
  Write-Verbose ("parsed_reviewed_by_entries: " + (($parsedReviewedBy | ForEach-Object { $_ }) -join " || "))
} else {
  Write-Verbose "parsed_reviewed_by_entries: <none>"
}
if ($missing.Count -gt 0) {
  Write-Verbose ("missing_requirements: " + (($missing | ForEach-Object { $_ }) -join ", "))
} else {
  Write-Verbose "missing_requirements: <none>"
}

if (-not $ok) {
  Write-Output ("gate_failed_summary: missing_requirements:" + (($missing | ForEach-Object { $_ }) -join ","))
  Write-Output "gate_failed"
  foreach ($m in $missing) { Write-Output ("missing: " + $m) }
  exit 1
}

Write-Output "gate_passed"
exit 0
