[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$DesignId,
  [string]$Title = "Design",
  [string]$Owner = "Codex",
  [string]$DesignDir = "docs/design",
  [string]$WhiteboardPath = "docs/whiteboard_region_ai.md"
)

$ErrorActionPreference = "Stop"

function Ensure-Dir {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$designDirAbs = Join-Path $repoRoot $DesignDir
$designPath = Join-Path $designDirAbs ($DesignId + ".md")
$latestPath = Join-Path $designDirAbs "LATEST.txt"
$today = Get-Date -Format "yyyy-MM-dd"

Ensure-Dir -Path $designDirAbs

if (Test-Path -LiteralPath $designPath) {
  Write-Output ("exists: " + $designPath)
} else {
  $contentTemplate = @'
# Design: __DESIGN_ID__

- Status: Draft
- Owner: __OWNER__
- Created: __TODAY__
- Updated: __TODAY__
- Scope: __TITLE__

## Context
- Problem: <fill>
- Goal: <fill>
- Non-goals: <fill>

## Design diagram
```mermaid
%% title: data flow
flowchart LR
  A[Design] --> B[Review]
  B --> C[Discussion]
  C --> D[Final Decisions]
  D --> E[Gate]
  E --> F[Implement]
```

```mermaid
%% title: decision flow
flowchart TD
  O[Open decisions] --> S[Discussion summary update]
  S --> FD[Final decisions update]
  FD --> WB[Whiteboard impact apply]
  WB --> G[Gate pass]
```

## Whiteboard impact
- Now: Before: <fill>. After: <fill>.
- DoD: Before: <fill>. After: <fill>.
- Blockers: <fill>
- Risks: <fill>

## Multi-AI participation plan
- Reviewer:
  - Request:
  - Expected output format:
- QA:
  - Request:
  - Expected output format:
- Researcher:
  - Request:
  - Expected output format:
- External AI:
  - Request:
  - Expected output format:
- external_participation: optional
- external_not_required: false

## Open Decisions
- [ ] Decision 1
- [ ] Decision 2

### Open Decisions checklist
- [ ] Add "Decision 1 Final:" entry with final choice.
- [ ] Add "Decision 2 Final:" entry with final choice.

## Final Decisions
- Decision 1 Final:
- Decision 2 Final:

## Discussion summary
- Change 1:

## Plan
1. Design
2. Review
3. Implement
4. Verify

## Risks
- Risk:
  - Mitigation:

## Test Plan
- Unit:
- E2E:

## Reviewed-by
- Reviewer / pending / __TODAY__ / pending
- QA / pending / __TODAY__ / pending
- Researcher / pending / __TODAY__ / optional

## External Reviews
- <optional reviewer file path> / <status>
'@
  $content = $contentTemplate.Replace("__DESIGN_ID__", $DesignId).Replace("__OWNER__", $Owner).Replace("__TODAY__", $today).Replace("__TITLE__", $Title)
  $content | Set-Content -LiteralPath $designPath -Encoding UTF8
  Write-Output ("created: " + $designPath)
}

$designRelPath = Join-Path $DesignDir ($DesignId + ".md")
$designAbsPath = (Resolve-Path -LiteralPath $designPath).Path
($designRelPath + " | " + $designAbsPath) | Set-Content -LiteralPath $latestPath -Encoding UTF8
Write-Output ("latest_updated: " + $latestPath)

$whiteboardAbs = Join-Path $repoRoot $WhiteboardPath
if (Test-Path -LiteralPath $whiteboardAbs) {
  $wb = Get-Content -LiteralPath $whiteboardAbs -Raw
  $needle = $DesignId
  if ($wb -notmatch [regex]::Escape($needle)) {
    Add-Content -LiteralPath $whiteboardAbs -Value ("`n- Design link: " + $DesignDir + "/" + $DesignId + ".md")
    Write-Output ("whiteboard_link_added: " + $DesignId)
  }
}

$reviewerPath = Join-Path $designDirAbs ($DesignId + "__reviewer.md")
$qaPath = Join-Path $designDirAbs ($DesignId + "__qa.md")
$researchPath = Join-Path $designDirAbs ($DesignId + "__researcher.md")

$commonHeader = @"
# Review Request: $DesignId

## Goal Summary
- $Title

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
"@

($commonHeader + @"

## Reviewer Checklist
- Is decision rationale coherent and minimal?
- Any architectural regressions?
- Any compatibility risk with existing E2E contracts?
"@) | Set-Content -LiteralPath $reviewerPath -Encoding UTF8

($commonHeader + @"

## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?
"@) | Set-Content -LiteralPath $qaPath -Encoding UTF8

($commonHeader + @"

## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?
"@) | Set-Content -LiteralPath $researchPath -Encoding UTF8

Write-Output ("generated: " + $reviewerPath)
Write-Output ("generated: " + $qaPath)
Write-Output ("generated: " + $researchPath)
