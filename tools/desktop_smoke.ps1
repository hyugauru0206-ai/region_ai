[CmdletBinding()]
param(
  [switch]$Json,
  [string]$WorkspaceRoot = ""
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$desktopDir = Join-Path $repoRoot "apps/ui_desktop_electron"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
  $WorkspaceRoot = Join-Path $env:TEMP "region_ai\\workspace"
}

$result = [ordered]@{
  action = "desktop_smoke"
  skipped = $false
  skip_reason = ""
  desktop_passed = $false
  mode = ""
  role_tabs_ok = $false
  council_cycle_ok = $false
  deep_link_ok = $false
  quick_access_ok = $false
  command_palette_ok = $false
  office_debate_nav_ok = $false
  quick_access_mode_storage_ok = $false
  favorite_shortcut_ok = $false
  exit_code = 1
}

function Get-RegionUiStaticContent {
  param(
    [Parameter(Mandatory = $true)][string]$WorkspaceRoot,
    [Parameter(Mandatory = $true)][string]$RepoRoot
  )

  $builtUiDir = Join-Path $WorkspaceRoot "._ui_build_dist\\ui_discord"
  if (Test-Path -LiteralPath $builtUiDir) {
    $files = @(Get-ChildItem -LiteralPath $builtUiDir -Recurse -File -Include *.html, *.js, *.css -ErrorAction SilentlyContinue)
    if ($files.Count -gt 0) {
      $text = ($files | ForEach-Object {
        try { Get-Content -LiteralPath $_.FullName -Raw -ErrorAction Stop } catch { "" }
      }) -join [Environment]::NewLine
      return [ordered]@{
        source = "built_ui_dist"
        text = $text
      }
    }
  }

  $appPath = Join-Path $RepoRoot "apps\\ui_discord\\src\\App.tsx"
  if (Test-Path -LiteralPath $appPath) {
    return [ordered]@{
      source = "app_tsx"
      text = (Get-Content -LiteralPath $appPath -Raw)
    }
  }

  return [ordered]@{
    source = "missing"
    text = ""
  }
}

function Test-ContainsAllMarkers {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string[]]$Markers
  )

  foreach ($marker in $Markers) {
    if ($Text.IndexOf($marker, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
      return $false
    }
  }
  return $true
}

function Invoke-DesktopStaticFallback {
  param(
    [Parameter(Mandatory = $true)]$Result,
    [Parameter(Mandatory = $true)][string]$DesktopDir,
    [Parameter(Mandatory = $true)][string]$WorkspaceRoot,
    [Parameter(Mandatory = $true)][string]$RepoRoot
  )

  & node --check (Join-Path $DesktopDir "main.cjs")
  if ($LASTEXITCODE -ne 0) { throw "desktop_main_syntax_failed" }
  & node --check (Join-Path $DesktopDir "preload.cjs")
  if ($LASTEXITCODE -ne 0) { throw "desktop_preload_syntax_failed" }

  $regionUiStatic = Get-RegionUiStaticContent -WorkspaceRoot $WorkspaceRoot -RepoRoot $RepoRoot
  if ([string]::IsNullOrWhiteSpace([string]$regionUiStatic.text)) {
    throw "desktop_region_ui_static_missing"
  }

  $Result.quick_access_ok = Test-ContainsAllMarkers -Text ([string]$regionUiStatic.text) -Markers @(
    "Control Room",
    "Quick Access",
    "Office Canvas",
    "Favorites",
    "Recent",
    "Collapse"
  )
  $Result.command_palette_ok = Test-ContainsAllMarkers -Text ([string]$regionUiStatic.text) -Markers @(
    "Command Palette",
    "Ctrl+K",
    "View: Office",
    "View: Debate",
    "View: Dashboard"
  )
  $Result.office_debate_nav_ok = Test-ContainsAllMarkers -Text ([string]$regionUiStatic.text) -Markers @(
    "Open control room office view",
    "Open discussion stage view",
    "Debate Stage"
  )

  if (-not $Result.quick_access_ok) { throw ("desktop_region_ui_quick_access_static_failed:" + [string]$regionUiStatic.source) }
  if (-not $Result.command_palette_ok) { throw ("desktop_region_ui_command_palette_static_failed:" + [string]$regionUiStatic.source) }
  if (-not $Result.office_debate_nav_ok) { throw ("desktop_region_ui_navigation_static_failed:" + [string]$regionUiStatic.source) }

  $Result.mode = "local_static_fallback"
  $Result.desktop_passed = $true
  $Result.exit_code = 0
}

try {
  if ($env:REGION_AI_SKIP_DESKTOP -eq "1") {
    $result.skipped = $true
    $result.skip_reason = "env_skip"
    $result.desktop_passed = $true
    $result.exit_code = 0
  } else {
    if (-not (Test-Path -LiteralPath $desktopDir)) {
      throw "desktop_dir_not_found: $desktopDir"
    }
    $testChatPath = Join-Path $desktopDir "test_chat.html"
    if (-not (Test-Path -LiteralPath $testChatPath)) {
      throw "test_chat_not_found: $testChatPath"
    }
    $testChatResolved = (Resolve-Path -LiteralPath $testChatPath).Path
    $testChatUrl = ([System.Uri]$testChatResolved).AbsoluteUri
    $cacheDir = Join-Path $WorkspaceRoot "._npm_cache\\ui_desktop_electron"
    New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
    $env:npm_config_cache = $cacheDir
    $env:REGION_AI_CHAT_URL = $testChatUrl
    $builtUiIndex = Join-Path $WorkspaceRoot "._ui_build_dist\ui_discord\index.html"
    if (Test-Path -LiteralPath $builtUiIndex) {
      $builtUiResolved = (Resolve-Path -LiteralPath $builtUiIndex).Path
      $env:REGION_AI_UI_URL = ([System.Uri]$builtUiResolved).AbsoluteUri
    }

    Push-Location $desktopDir
    try {
      $fallbackUsed = $false
      $preferStaticFallback = ($env:REGION_AI_SMOKE_OFFLINE -eq "1" -and $env:REGION_AI_DESKTOP_SMOKE_FORCE_RUNTIME -ne "1")
      $hasElectron = Test-Path -LiteralPath (Join-Path $desktopDir "node_modules\\electron")
      if ($preferStaticFallback) {
        Invoke-DesktopStaticFallback -Result $result -DesktopDir $desktopDir -WorkspaceRoot $WorkspaceRoot -RepoRoot $repoRoot
        $fallbackUsed = $true
      } elseif (-not $hasElectron) {
        $prevEa = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $ciOut = @(& $env:ComSpec /d /s /c "npm.cmd ci --no-audit --no-fund --prefer-offline" 2>&1)
        $ErrorActionPreference = $prevEa
        $ciExit = $LASTEXITCODE
        if ($ciExit -ne 0) {
          if (-not $Json) {
            foreach ($line in $ciOut) { Write-Output ([string]$line) }
          }
          Invoke-DesktopStaticFallback -Result $result -DesktopDir $desktopDir -WorkspaceRoot $WorkspaceRoot -RepoRoot $repoRoot
          $fallbackUsed = $true
        }
      }
      if (-not $fallbackUsed) {
        $prevEa2 = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $smokeOut = @(& $env:ComSpec /d /s /c "npm.cmd run desktop:smoke" 2>&1)
        $ErrorActionPreference = $prevEa2
        if (-not $Json) {
          foreach ($line in $smokeOut) { Write-Output ([string]$line) }
        }
        $smokeExit = $LASTEXITCODE
        if ($smokeExit -ne 0) {
          throw "desktop_smoke_run_failed"
        }
        $smokeJson = $null
        foreach ($line in $smokeOut) {
          $s = [string]$line
          if ($s -match '^\[desktop_smoke\]\s+(.+)$') {
            try {
              $smokeJson = $Matches[1] | ConvertFrom-Json -ErrorAction Stop
            } catch {}
          }
        }
        if ($smokeJson) {
          $result.mode = [string]($smokeJson.mode)
          try { $result.deep_link_ok = [bool]$smokeJson.deep_link_ok } catch {}
          try { $result.role_tabs_ok = [bool]$smokeJson.role_tabs_ok } catch {}
          try { $result.council_cycle_ok = [bool]$smokeJson.council_cycle_ok } catch {}
          try { $result.quick_access_ok = [bool]$smokeJson.quick_access_ok } catch {}
          try { $result.command_palette_ok = [bool]$smokeJson.command_palette_ok } catch {}
          try { $result.office_debate_nav_ok = [bool]$smokeJson.office_debate_nav_ok } catch {}
          try { $result.quick_access_mode_storage_ok = [bool]$smokeJson.quick_access_mode_storage_ok } catch {}
          try { $result.favorite_shortcut_ok = [bool]$smokeJson.favorite_shortcut_ok } catch {}
          if (-not [bool]$smokeJson.passed) {
            throw "desktop_smoke_assert_failed"
          }
          if ($result.mode -ne "shell_init" -and -not $result.role_tabs_ok) {
            throw "desktop_smoke_role_tabs_failed"
          }
          if ($result.mode -ne "shell_init" -and -not $result.quick_access_ok) {
            throw "desktop_smoke_quick_access_failed"
          }
          if ($result.mode -ne "shell_init" -and -not $result.command_palette_ok) {
            throw "desktop_smoke_command_palette_failed"
          }
          if ($result.mode -ne "shell_init" -and -not $result.office_debate_nav_ok) {
            throw "desktop_smoke_navigation_failed"
          }
          if ($result.mode -ne "shell_init" -and -not $result.quick_access_mode_storage_ok) {
            throw "desktop_smoke_mode_storage_failed"
          }
          if ($result.mode -ne "shell_init" -and -not $result.favorite_shortcut_ok) {
            throw "desktop_smoke_favorite_shortcut_failed"
          }
        } else {
          $result.mode = "electron_smoke"
        }
      }
    } finally {
      Pop-Location
    }
    $result.desktop_passed = $true
    $result.exit_code = 0
  }
}
catch {
  if (-not $Json) {
    Write-Output ("desktop_smoke_failed: " + $_.Exception.Message)
  }
}

if ($Json) {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
}

exit $result.exit_code
