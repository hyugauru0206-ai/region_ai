[CmdletBinding()]
param(
  [string]$DesignPath = "",
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$latestPath = Join-Path $repoRoot "docs/design/LATEST.txt"

function To-RepoRelativePath {
  param(
    [Parameter(Mandatory = $true)][string]$BasePath,
    [Parameter(Mandatory = $true)][string]$TargetPath
  )
  $base = [System.IO.Path]::GetFullPath($BasePath)
  if (-not $base.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $base += [System.IO.Path]::DirectorySeparatorChar
  }
  $target = [System.IO.Path]::GetFullPath($TargetPath)
  $baseUri = New-Object System.Uri($base)
  $targetUri = New-Object System.Uri($target)
  $relative = $baseUri.MakeRelativeUri($targetUri).ToString()
  return ($relative -replace '\\', '/')
}

function Resolve-DesignPathFromLatest {
  param([string]$LatestFile)
  if (-not (Test-Path -LiteralPath $LatestFile)) {
    throw "LATEST.txt not found: $LatestFile"
  }
  $line = (Get-Content -LiteralPath $LatestFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($line)) {
    throw "LATEST.txt is empty: $LatestFile"
  }
  $parts = $line -split "\|"
  $candidate = $parts[0].Trim()
  if ([string]::IsNullOrWhiteSpace($candidate)) {
    throw "LATEST.txt does not contain a relative design path"
  }
  if ([System.IO.Path]::IsPathRooted($candidate)) {
    return $candidate
  }
  return Join-Path $repoRoot $candidate
}

if ([string]::IsNullOrWhiteSpace($DesignPath)) {
  $DesignPath = Resolve-DesignPathFromLatest -LatestFile $latestPath
} elseif (-not [System.IO.Path]::IsPathRooted($DesignPath)) {
  $DesignPath = Join-Path $repoRoot $DesignPath
}

if (-not (Test-Path -LiteralPath $DesignPath)) {
  throw "design not found: $DesignPath"
}

$designRaw = Get-Content -LiteralPath $DesignPath -Raw
$designId = [System.IO.Path]::GetFileNameWithoutExtension($DesignPath)
$scope = (($designRaw -split "`r?`n") | Where-Object { $_ -match "^- Scope:\s*" } | Select-Object -First 1)
if ($scope) { $scope = ($scope -replace "^- Scope:\s*", "").Trim() } else { $scope = $designId }
$externalNotRequired = [regex]::IsMatch($designRaw, '(?im)^\s*-\s*external_not_required\s*:\s*true\s*$')
$externalParticipation = ""
$mParticipation = [regex]::Match($designRaw, '(?im)^\s*-\s*external_participation\s*:\s*(.+?)\s*$')
if ($mParticipation.Success) {
  $externalParticipation = $mParticipation.Groups[1].Value.Trim().ToLowerInvariant()
}
if ([string]::IsNullOrWhiteSpace($externalParticipation)) {
  if ($externalNotRequired) {
    $externalParticipation = "none"
  } else {
    $externalParticipation = "optional"
  }
}

if ([string]::IsNullOrWhiteSpace($OutDir)) {
  $OutDir = Join-Path $repoRoot ("docs/design/packs/" + $designId)
} elseif (-not [System.IO.Path]::IsPathRooted($OutDir)) {
  $OutDir = Join-Path $repoRoot $OutDir
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

function Write-PackFile {
  param(
    [string]$Path,
    [string]$RoleName,
    [string[]]$Focus
  )
  $focusText = ($Focus | ForEach-Object { "- " + $_ }) -join "`r`n"
  $content = @"
# Prompt Pack: $designId ($RoleName)

## Design summary
- Design: $designId
- Scope: $scope
- Source: $DesignPath

## What to review
$focusText

## Reply template
- verdict: approved | noted
- key_findings:
  - <bullet>
- risks:
  - <bullet>
- alternatives:
  - <bullet>
- missing_tests:
  - <bullet>
"@
  $content | Set-Content -LiteralPath $Path -Encoding UTF8
}

$promptPaths = New-Object System.Collections.Generic.List[string]

$pReviewer = Join-Path $OutDir "prompt_reviewer.md"
Write-PackFile -Path $pReviewer -RoleName "Reviewer" -Focus @(
  "Design coherence and decision quality",
  "Compatibility and regression risk",
  "Scope control and implementation feasibility"
)
$promptPaths.Add($pReviewer)

$pQa = Join-Path $OutDir "prompt_qa.md"
Write-PackFile -Path $pQa -RoleName "QA" -Focus @(
  "Deterministic verification plan",
  "Flakiness and negative-path coverage",
  "Evidence quality for pass/fail triage"
)
$promptPaths.Add($pQa)

$pResearcher = Join-Path $OutDir "prompt_researcher.md"
Write-PackFile -Path $pResearcher -RoleName "Researcher" -Focus @(
  "Long-term maintainability",
  "Interoperability and standards alignment",
  "Migration and compatibility strategy"
)
$promptPaths.Add($pResearcher)

$pClaude = Join-Path $OutDir "prompt_external_claude.md"
Write-PackFile -Path $pClaude -RoleName "External Claude" -Focus @(
  "Independent design critique",
  "Risk and threat-model blind spots",
  "Alternative approaches with tradeoffs"
)
$promptPaths.Add($pClaude)

$pGemini = Join-Path $OutDir "prompt_external_gemini.md"
Write-PackFile -Path $pGemini -RoleName "External Gemini" -Focus @(
  "Independent QA-style design review",
  "Failure-mode analysis and missing checks",
  "Reporting ergonomics and operational readiness"
)
$promptPaths.Add($pGemini)

$manifestItems = @()
$externalPromptItems = @()
foreach ($pp in $promptPaths) {
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $pp).Hash.ToLowerInvariant()
  $item = [ordered]@{
    name = [System.IO.Path]::GetFileName($pp)
    path = (To-RepoRelativePath -BasePath $repoRoot -TargetPath $pp)
    sha256 = $hash
  }
  $manifestItems += $item
  if ($item.name -like "prompt_external_*.md") {
    $externalPromptItems += $item
  }
}
$manifest = [ordered]@{
  design_id = $designId
  design_path = (To-RepoRelativePath -BasePath $repoRoot -TargetPath $DesignPath)
  generated_at = (Get-Date).ToString("o")
  external_participation = $externalParticipation
  external_not_required = [bool]$externalNotRequired
  external_prompts_present = [bool]($externalPromptItems.Count -gt 0)
  external_prompts = $externalPromptItems
  prompts = $manifestItems
}
$manifestPath = Join-Path $OutDir "manifest.json"
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 6 -Compress), [System.Text.UTF8Encoding]::new($false))

Write-Output ("generated_pack: " + $OutDir)
Write-Output ("manifest: " + $manifestPath)
exit 0
