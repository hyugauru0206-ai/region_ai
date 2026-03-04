[CmdletBinding()]
param(
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Write-Info {
  param([string]$Message)
  if (-not $Json) {
    Write-Output $Message
  }
}

$missing = New-Object System.Collections.Generic.List[string]

$specPath = Join-Path $repoRoot "docs/spec_region_ai.md"
$runPath = Join-Path $repoRoot "docs/run_region_ai.md"
$latestPath = Join-Path $repoRoot "docs/design/LATEST.txt"
$whiteboardPath = Join-Path $repoRoot "docs/whiteboard_region_ai.md"

if (-not (Test-Path -LiteralPath $specPath)) {
  $missing.Add("spec_missing")
} else {
  $specRaw = Get-Content -LiteralPath $specPath -Raw
  $requiredHeadings = @(
    @{ text = "## Overview"; key = "Overview" },
    @{ text = "## Design-first workflow contract"; key = "Design-first workflow contract" },
    @{ text = "## Workspace/exec resolution contract"; key = "Workspace/exec resolution contract" },
    @{ text = "## Task/Result validation contract"; key = "Task/Result validation contract" },
    @{ text = "## Acceptance contract"; key = "Acceptance contract" },
    @{ text = "## Artifacts contract"; key = "Artifacts contract" },
    @{ text = "## Error code contract"; key = "Error code contract" },
    @{ text = "## status:json contract"; key = "status:json contract" }
  )
  foreach ($h in $requiredHeadings) {
    if ($specRaw -notmatch [regex]::Escape([string]$h.text)) {
      $missing.Add("heading_missing:" + [string]$h.key)
    }
  }
  $mermaidCount = ([regex]::Matches($specRaw, '```mermaid')).Count
  if ($mermaidCount -lt 2) {
    $missing.Add("mermaid_insufficient:found=" + $mermaidCount + ",need>=2")
  }
}

if (-not (Test-Path -LiteralPath $runPath)) {
  $missing.Add("run_doc_missing")
} else {
  $runRaw = Get-Content -LiteralPath $runPath -Raw
  if ($runRaw -notmatch [regex]::Escape("docs/spec_region_ai.md")) {
    $missing.Add("run_doc_ref_missing")
  }
  if ($runRaw -notmatch '(?i)##\s*Design-first workflow') {
    $missing.Add("run_doc_design_first_missing")
  }
  if ($runRaw -notmatch '(?i)##\s*Commands\s*\(Standard vs Dev\)') {
    $missing.Add("run_doc_commands_standard_vs_dev_missing")
  }
  if ($runRaw -notmatch [regex]::Escape("tools/whiteboard_update.ps1")) {
    $missing.Add("run_doc_whiteboard_update_ref_missing")
  }
  if ($runRaw -notmatch '(?i)##\s*External AI participation') {
    $missing.Add("run_doc_external_ai_participation_missing")
  }
}

if (-not (Test-Path -LiteralPath $latestPath)) {
  $missing.Add("latest_missing")
} else {
  $latestRaw = (Get-Content -LiteralPath $latestPath -Raw).Trim()
  $parts = $latestRaw -split "\|"
  $rel = $parts[0].Trim()
  if ([string]::IsNullOrWhiteSpace($rel)) {
    $missing.Add("latest_invalid")
  } else {
    $designId = [System.IO.Path]::GetFileNameWithoutExtension($rel)
    if (-not (Test-Path -LiteralPath $whiteboardPath)) {
      $missing.Add("whiteboard_missing")
    } else {
      $wbRaw = Get-Content -LiteralPath $whiteboardPath -Raw
      $m = [regex]::Match($wbRaw, '(?m)^- last_design_id:\s*(.+)\s*$')
      if (-not $m.Success) {
        $missing.Add("whiteboard_design_id_missing")
      } else {
        $wbDesignId = $m.Groups[1].Value.Trim()
        if ($wbDesignId -ne $designId) {
          $missing.Add("whiteboard_design_id_mismatch:latest=" + $designId + ",whiteboard=" + $wbDesignId)
        }
      }
    }
  }
}

$ok = ($missing.Count -eq 0)
$exitCode = if ($ok) { 0 } else { 1 }

if (-not $Json) {
  Write-Info ("docs_check_ok: " + $ok)
  if ($missing.Count -gt 0) {
    foreach ($m in $missing) {
      Write-Info ("missing: " + $m)
    }
  }
}

if ($Json) {
  $obj = [ordered]@{
    action = "docs_check"
    ok = [bool]$ok
    missing = @($missing)
    exit_code = $exitCode
  }
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
}

exit $exitCode
