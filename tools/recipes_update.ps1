[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Write,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$recipesDir = Join-Path $repoRoot "templates\tasks\recipes"
$e2eDir = Join-Path $repoRoot "templates\tasks\e2e"
$ssotRel = "docs/recipes_region_ai.json"
$ssotPath = Join-Path $repoRoot $ssotRel
$latestPath = Join-Path $repoRoot "docs/design/LATEST.txt"

if (-not $DryRun -and -not $Write) { $Write = $true }
if ($DryRun) { $Write = $false }

function Normalize-JsonPath {
  param([string]$Path)
  return ($Path -replace "\\", "/")
}

function Trim-OuterQuotes {
  param([string]$Value)
  $v = [string]$Value
  $v = $v.Trim()
  $v = [regex]::Replace($v, '^"(.*)"$', '$1')
  $v = [regex]::Replace($v, "^'(.*)'$", '$1')
  return $v
}

function Resolve-DesignId {
  if (-not (Test-Path -LiteralPath $latestPath)) { return "" }
  $line = (Get-Content -LiteralPath $latestPath -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($line)) { return "" }
  $parts = $line -split "\|"
  $candidate = $parts[0].Trim()
  if ([string]::IsNullOrWhiteSpace($candidate)) { return "" }
  return [System.IO.Path]::GetFileNameWithoutExtension($candidate)
}

function Parse-RecipeMetaBlock {
  param(
    [string[]]$Lines,
    [string]$FileName,
    [string]$MetadataId,
    [string]$MetadataTitle
  )

  $id = ""
  $title = ""
  $expect = ""
  $uses = @()
  $notes = ""

  $inRecipe = $false
  foreach ($line in $Lines) {
    if (-not $line.StartsWith("#")) {
      if ($inRecipe) { break }
      continue
    }
    if ($line -match '^#\s*recipe\s*:\s*$') {
      $inRecipe = $true
      continue
    }
    if (-not $inRecipe) { continue }

    if ($line -match '^#\s{2,}id\s*:\s*(.+)$') {
      $id = Trim-OuterQuotes $Matches[1]
      continue
    }
    if ($line -match '^#\s{2,}title\s*:\s*(.+)$') {
      $title = Trim-OuterQuotes $Matches[1]
      continue
    }
    if ($line -match '^#\s{2,}expect\s*:\s*(.+)$') {
      $expect = (Trim-OuterQuotes $Matches[1]).ToLowerInvariant()
      continue
    }
    if ($line -match '^#\s{2,}uses\s*:\s*\[(.*)\]\s*$') {
      $raw = $Matches[1]
      $vals = @()
      foreach ($p in ($raw -split ',')) {
        $v = Trim-OuterQuotes $p
        if (-not [string]::IsNullOrWhiteSpace($v)) { $vals += $v }
      }
      $uses = $vals
      continue
    }
    if ($line -match '^#\s{2,}notes\s*:\s*(.+)$') {
      $notes = Trim-OuterQuotes $Matches[1]
      continue
    }
  }

  $base = [System.IO.Path]::GetFileNameWithoutExtension($FileName)
  $fallbackId = if ($base.StartsWith("recipe_")) { $base.Substring(7) } else { $base }
  if ([string]::IsNullOrWhiteSpace($id)) {
    if (-not [string]::IsNullOrWhiteSpace($MetadataId) -and $MetadataId.StartsWith("recipe_")) {
      $id = $MetadataId.Substring(7)
    } elseif (-not [string]::IsNullOrWhiteSpace($MetadataId)) {
      $id = $MetadataId
    } else {
      $id = $fallbackId
    }
  }
  if ([string]::IsNullOrWhiteSpace($title)) {
    if (-not [string]::IsNullOrWhiteSpace($MetadataTitle)) {
      $title = $MetadataTitle
    } else {
      $title = ($id -replace '_', ' ')
    }
  }
  if ($expect -notin @("success", "expected_ng")) {
    $expect = "success"
  }

  return [ordered]@{
    id = $id
    title = $title
    expect = $expect
    uses = $uses
    notes = $notes
  }
}

try {
  if (-not (Test-Path -LiteralPath $recipesDir)) {
    throw ("recipes directory not found: " + $recipesDir)
  }

  $e2eFileSet = @{}
  if (Test-Path -LiteralPath $e2eDir) {
    foreach ($f in (Get-ChildItem -LiteralPath $e2eDir -File -Filter "task_e2e_*.yaml" | Sort-Object Name)) {
      $e2eFileSet[$f.Name.ToLowerInvariant()] = $true
    }
  }

  $recipeItems = @()
  $recipeFiles = Get-ChildItem -LiteralPath $recipesDir -File -Filter "*.yaml" | Sort-Object Name
  foreach ($rf in $recipeFiles) {
    $lines = Get-Content -LiteralPath $rf.FullName
    $metadataId = ""
    $metadataTitle = ""
    $inMetadata = $false
    foreach ($line in $lines) {
      if ($line -match '^metadata\s*:\s*$') { $inMetadata = $true; continue }
      if ($inMetadata -and $line -match '^\S') { $inMetadata = $false }
      if ($inMetadata -and [string]::IsNullOrWhiteSpace($metadataId) -and $line -match '^\s{2,}id\s*:\s*(.+)$') {
        $metadataId = Trim-OuterQuotes $Matches[1]
      }
      if ($inMetadata -and [string]::IsNullOrWhiteSpace($metadataTitle) -and $line -match '^\s{2,}title\s*:\s*(.+)$') {
        $metadataTitle = Trim-OuterQuotes $Matches[1]
      }
    }

    $meta = Parse-RecipeMetaBlock -Lines $lines -FileName $rf.Name -MetadataId $metadataId -MetadataTitle $metadataTitle
    $guardCandidate = ("task_e2e_recipe_" + $meta.id + ".yaml").ToLowerInvariant()

    $item = [ordered]@{
      id = $meta.id
      file = $rf.Name
      title = $meta.title
      expect = $meta.expect
      uses = @($meta.uses)
      notes = $meta.notes
    }
    if ($e2eFileSet.ContainsKey($guardCandidate)) {
      $item.e2e_guard = "task_e2e_recipe_" + $meta.id + ".yaml"
    }
    $recipeItems += $item
  }

  $payload = [ordered]@{
    action = "recipes_catalog"
    last_design_id = (Resolve-DesignId)
    updated_at = (Get-Date -Format "yyyy-MM-dd")
    root = "templates/tasks/recipes"
    recipes = $recipeItems
  }

  $newJson = ($payload | ConvertTo-Json -Depth 8)
  $newNorm = (($newJson -replace "`r`n", "`n").TrimEnd("`r", "`n"))
  $oldNorm = ""
  if (Test-Path -LiteralPath $ssotPath) {
    $oldNorm = (((Get-Content -LiteralPath $ssotPath -Raw -Encoding UTF8) -replace "`r`n", "`n").TrimEnd("`r", "`n"))
  }
  $changed = ($newNorm -ne $oldNorm)

  if ($Write -and $changed) {
    $ssotDir = Split-Path -Parent $ssotPath
    if (-not (Test-Path -LiteralPath $ssotDir)) {
      New-Item -ItemType Directory -Path $ssotDir -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($ssotPath, $newJson + "`n", [System.Text.UTF8Encoding]::new($false))
  }

  if ($Json) {
    $obj = [ordered]@{
      action = "recipes_update"
      changed = [bool]$changed
      ssot_path = (Normalize-JsonPath -Path $ssotRel)
      count = @($recipeItems).Count
      exit_code = 0
    }
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  } else {
    if ($DryRun) {
      Write-Output ("dry_run_changed: " + $changed)
    } elseif ($Write) {
      Write-Output ("updated: " + $ssotPath)
    }
  }

  exit 0
}
catch {
  $reason = $_.Exception.Message
  if ([string]::IsNullOrWhiteSpace($reason)) { $reason = "recipes_update_failed" }
  if ($Json) {
    $obj = [ordered]@{
      action = "recipes_update"
      changed = $false
      ssot_path = (Normalize-JsonPath -Path $ssotRel)
      count = 0
      exit_code = 1
      reason = $reason
    }
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  } else {
    Write-Output ("recipes_update_failed: " + $reason)
  }
  exit 1
}
