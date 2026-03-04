[CmdletBinding()]
param(
  [string]$Path = "docs/whiteboard_region_ai.md",
  [string]$SetNow = "",
  [string]$SetDoD = "",
  [string]$SetNext = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$abs = Join-Path $repoRoot $Path

if (-not (Test-Path -LiteralPath $abs)) {
  Write-Output ("not_found: " + $abs)
  exit 1
}

$raw = Get-Content -LiteralPath $abs -Raw

function Replace-Section {
  param(
    [string]$Text,
    [string]$Header,
    [string]$NewBody
  )
  $pattern = "(?ms)(##\s+" + [regex]::Escape($Header) + "\s*`r?`n)(.*?)(?=`r?`n##\s+|$)"
  $m = [regex]::Match($Text, $pattern)
  if (-not $m.Success) { return $Text }
  $prefix = $m.Groups[1].Value
  $body = "- " + $NewBody.Trim()
  return $Text.Substring(0, $m.Index) + $prefix + $body + "`r`n" + $Text.Substring($m.Index + $m.Length)
}

if (-not [string]::IsNullOrWhiteSpace($SetNow)) {
  $raw = Replace-Section -Text $raw -Header "Now" -NewBody $SetNow
}
if (-not [string]::IsNullOrWhiteSpace($SetDoD)) {
  $raw = Replace-Section -Text $raw -Header "DoD" -NewBody $SetDoD
}
if (-not [string]::IsNullOrWhiteSpace($SetNext)) {
  $raw = Replace-Section -Text $raw -Header "Next" -NewBody $SetNext
}

if ((-not [string]::IsNullOrWhiteSpace($SetNow)) -or (-not [string]::IsNullOrWhiteSpace($SetDoD)) -or (-not [string]::IsNullOrWhiteSpace($SetNext))) {
  Set-Content -LiteralPath $abs -Value $raw -Encoding UTF8
  Write-Output ("updated: " + $abs)
} else {
  Write-Output $raw
}
