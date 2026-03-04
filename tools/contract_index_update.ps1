[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Write,
  [switch]$Json,
  [switch]$UpdateSpec
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$schemaRel = "schemas/task.schema.json"
$schemaPath = Join-Path $repoRoot $schemaRel
$ssotRel = "docs/contract_index_region_ai.json"
$ssotPath = Join-Path $repoRoot $ssotRel
$latestPath = Join-Path $repoRoot "docs/design/LATEST.txt"
$specPath = Join-Path $repoRoot "docs/spec_task_result.md"

if (-not $DryRun -and -not $Write) { $Write = $true }
if ($DryRun) { $Write = $false }

function Normalize-JsonPath {
  param([string]$Path)
  return ($Path -replace "\\", "/")
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

function Add-UniqueStrings {
  param([hashtable]$Set, [object]$Values)
  if ($null -eq $Values) { return }
  if ($Values -is [System.Collections.IEnumerable] -and -not ($Values -is [string])) {
    foreach ($v in $Values) {
      if ($v -is [string] -and -not [string]::IsNullOrWhiteSpace($v)) {
        $Set[$v] = $true
      }
    }
    return
  }
  if ($Values -is [string] -and -not [string]::IsNullOrWhiteSpace($Values)) {
    $Set[$Values] = $true
  }
}

function Walk-Schema {
  param(
    [object]$Node,
    [bool]$InAcceptance,
    [hashtable]$TaskKinds,
    [hashtable]$AcceptanceKeys,
    [hashtable]$ArtifactKeys,
    [hashtable]$RegexFlags
  )

  if ($null -eq $Node) { return }

  if ($Node -is [hashtable]) {
    if ($Node.ContainsKey("pattern")) {
      $pat = [string]$Node["pattern"]
      if ($pat -match '^[\^]?\[imsu\]\{0,4\}\$?$' -or $pat -eq '^[imsu]{0,4}$') {
        $RegexFlags["i"] = $true
        $RegexFlags["m"] = $true
        $RegexFlags["s"] = $true
        $RegexFlags["u"] = $true
      }
    }

    if ($Node.ContainsKey("properties") -and $Node["properties"] -is [hashtable]) {
      $props = [hashtable]$Node["properties"]

      if ($props.ContainsKey("command") -and $props["command"] -is [hashtable]) {
        $cmd = [hashtable]$props["command"]
        if ($cmd.ContainsKey("enum")) {
          Add-UniqueStrings -Set $TaskKinds -Values $cmd["enum"]
        }
      }
      if ($props.ContainsKey("kind") -and $props["kind"] -is [hashtable]) {
        $kind = [hashtable]$props["kind"]
        if ($kind.ContainsKey("enum")) {
          Add-UniqueStrings -Set $TaskKinds -Values $kind["enum"]
        }
      }

      if ($props.ContainsKey("artifact") -and $props["artifact"] -is [hashtable]) {
        $artifactNode = [hashtable]$props["artifact"]
        if ($artifactNode.ContainsKey("properties") -and $artifactNode["properties"] -is [hashtable]) {
          foreach ($k in ([hashtable]$artifactNode["properties"]).Keys) {
            if (-not [string]::IsNullOrWhiteSpace([string]$k)) { $ArtifactKeys[[string]$k] = $true }
          }
        }
      }

      foreach ($k in $props.Keys) {
        $child = $props[$k]
        $nextInAcceptance = $InAcceptance -or ([string]$k -eq "acceptance")
        Walk-Schema -Node $child -InAcceptance:$nextInAcceptance -TaskKinds $TaskKinds -AcceptanceKeys $AcceptanceKeys -ArtifactKeys $ArtifactKeys -RegexFlags $RegexFlags
      }
    }

    if ($InAcceptance -and $Node.ContainsKey("const")) {
      $constVal = [string]$Node["const"]
      if (-not [string]::IsNullOrWhiteSpace($constVal)) {
        $AcceptanceKeys[$constVal] = $true
      }
    }

    foreach ($k in $Node.Keys) {
      if ($k -eq "properties") { continue }
      $child = $Node[$k]
      Walk-Schema -Node $child -InAcceptance:$InAcceptance -TaskKinds $TaskKinds -AcceptanceKeys $AcceptanceKeys -ArtifactKeys $ArtifactKeys -RegexFlags $RegexFlags
    }
    return
  }

  if ($Node -is [System.Collections.IEnumerable] -and -not ($Node -is [string])) {
    foreach ($item in $Node) {
      Walk-Schema -Node $item -InAcceptance:$InAcceptance -TaskKinds $TaskKinds -AcceptanceKeys $AcceptanceKeys -ArtifactKeys $ArtifactKeys -RegexFlags $RegexFlags
    }
  }
}

function Sorted-Keys {
  param([hashtable]$Set)
  return @($Set.Keys | Sort-Object)
}

function ConvertTo-HashtableDeep {
  param([object]$InputObject)
  if ($null -eq $InputObject) { return $null }
  if ($InputObject -is [hashtable]) { return $InputObject }
  if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
    $h = @{}
    foreach ($p in $InputObject.PSObject.Properties) {
      $h[$p.Name] = ConvertTo-HashtableDeep -InputObject $p.Value
    }
    return $h
  }
  if ($InputObject -is [System.Collections.IEnumerable] -and -not ($InputObject -is [string])) {
    $arr = @()
    foreach ($x in $InputObject) {
      $arr += ,(ConvertTo-HashtableDeep -InputObject $x)
    }
    return $arr
  }
  return $InputObject
}

function Update-SpecContractIndexSection {
  param(
    [string]$SpecPath,
    [object]$Payload,
    [switch]$DryRun,
    [switch]$Write
  )

  if (-not (Test-Path -LiteralPath $SpecPath)) { return $false }
  $raw = Get-Content -LiteralPath $SpecPath -Raw

  $taskKinds = ($Payload.task_kinds -join ", ")
  $acceptance = ($Payload.acceptance_keys -join ", ")
  $artifact = ($Payload.artifact_keys -join ", ")

  $section = @"
## Contract Index (generated)
- Source: `docs/contract_index_region_ai.json`
- task_kinds: $taskKinds
- acceptance_keys: $acceptance
- artifact_keys: $artifact
"@

  $pattern = '(?s)## Contract Index \(generated\).*?(?=\r?\n##\s+|\z)'
  $updated = ""
  if ([regex]::IsMatch($raw, $pattern)) {
    $updated = [regex]::Replace($raw, $pattern, $section)
  } else {
    $updated = $raw.TrimEnd() + "`r`n`r`n" + $section + "`r`n"
  }

  $changed = (($raw -replace "`r`n", "`n") -ne ($updated -replace "`r`n", "`n"))
  if ($changed -and $Write -and -not $DryRun) {
    [System.IO.File]::WriteAllText($SpecPath, $updated, [System.Text.UTF8Encoding]::new($false))
  }
  return $changed
}

try {
  if (-not (Test-Path -LiteralPath $schemaPath)) {
    throw ("schema not found: " + $schemaPath)
  }

  $schemaObj = Get-Content -LiteralPath $schemaPath -Raw | ConvertFrom-Json
  $schema = ConvertTo-HashtableDeep -InputObject $schemaObj

  $taskKindsSet = @{}
  $acceptanceSet = @{}
  $artifactSet = @{}
  $flagsSet = @{}

  Walk-Schema -Node $schema -InAcceptance:$false -TaskKinds $taskKindsSet -AcceptanceKeys $acceptanceSet -ArtifactKeys $artifactSet -RegexFlags $flagsSet

  $payload = [ordered]@{
    action = "contract_index"
    last_design_id = (Resolve-DesignId)
    updated_at = (Get-Date -Format "yyyy-MM-dd")
    schema_path = (Normalize-JsonPath -Path $schemaRel)
    task_kinds = (Sorted-Keys -Set $taskKindsSet)
    acceptance_keys = (Sorted-Keys -Set $acceptanceSet)
    artifact_keys = (Sorted-Keys -Set $artifactSet)
    notes = [ordered]@{
      acceptance_regex_flags_allowed = (Sorted-Keys -Set $flagsSet)
    }
  }

  $newJson = ($payload | ConvertTo-Json -Depth 10)
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

  $specChanged = $false
  if ($UpdateSpec) {
    $specChanged = Update-SpecContractIndexSection -SpecPath $specPath -Payload $payload -DryRun:$DryRun -Write:$Write
  }

  if ($Json) {
    $obj = [ordered]@{
      action = "contract_index_update"
      changed = [bool]$changed
      ssot_path = (Normalize-JsonPath -Path $ssotRel)
      task_kinds_count = @($payload.task_kinds).Count
      acceptance_keys_count = @($payload.acceptance_keys).Count
      artifact_keys_count = @($payload.artifact_keys).Count
      update_spec = [bool]$UpdateSpec
      spec_changed = [bool]$specChanged
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
  if ([string]::IsNullOrWhiteSpace($reason)) { $reason = "contract_index_update_failed" }
  if ($Json) {
    $obj = [ordered]@{
      action = "contract_index_update"
      changed = $false
      ssot_path = (Normalize-JsonPath -Path $ssotRel)
      exit_code = 1
      reason = $reason
    }
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  } else {
    Write-Output ("contract_index_update_failed: " + $reason)
  }
  exit 1
}
