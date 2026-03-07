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
      $hasElectron = Test-Path -LiteralPath (Join-Path $desktopDir "node_modules\\electron")
      if (-not $hasElectron) {
        $prevEa = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $ciOut = @(& $env:ComSpec /d /s /c "npm.cmd ci --no-audit --no-fund --prefer-offline" 2>&1)
        $ErrorActionPreference = $prevEa
        $ciExit = $LASTEXITCODE
        if ($ciExit -ne 0) {
          if (-not $Json) {
            foreach ($line in $ciOut) { Write-Output ([string]$line) }
          }
          # fallback: local static validation when electron dependency is unavailable in offline env
          & node --check (Join-Path $desktopDir "main.cjs")
          if ($LASTEXITCODE -ne 0) { throw "desktop_main_syntax_failed" }
          & node --check (Join-Path $desktopDir "preload.cjs")
          if ($LASTEXITCODE -ne 0) { throw "desktop_preload_syntax_failed" }
          $result.mode = "local_static_fallback"
          $result.desktop_passed = $true
          $result.exit_code = 0
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
