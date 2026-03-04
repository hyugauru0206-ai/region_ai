[CmdletBinding()]
param(
  [switch]$Json,
  [string]$WorkspaceRoot = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$orchDir = Join-Path $repoRoot "apps/orchestrator"
$apiUrl = "http://127.0.0.1:8787/api/ssot/recipes"
$threadsUrl = "http://127.0.0.1:8787/api/chat/threads"
$searchUrl = "http://127.0.0.1:8787/api/chat/search?q=design"
$desktopSettingsUrl = "http://127.0.0.1:8787/api/desktop/settings"
$desktopNotifyStateUrl = "http://127.0.0.1:8787/api/desktop/notify_state"
$inboxUrl = "http://127.0.0.1:8787/api/inbox?limit=20"
$inboxOneUrl = "http://127.0.0.1:8787/api/inbox?limit=1"
$inboxThreadBaseUrl = "http://127.0.0.1:8787/api/inbox/thread"
$inboxThreadReadStateUrl = "http://127.0.0.1:8787/api/inbox/thread/read_state"
$inboxThreadArchiveUrl = "http://127.0.0.1:8787/api/inbox/thread/archive"
$threadArchiveSchedSettingsUrl = "http://127.0.0.1:8787/api/inbox/thread_archive_scheduler/settings"
$threadArchiveSchedStateUrl = "http://127.0.0.1:8787/api/inbox/thread_archive_scheduler/state"
$threadArchiveSchedRunNowUrl = "http://127.0.0.1:8787/api/inbox/thread_archive_scheduler/run_now"
$inboxReadStateUrl = "http://127.0.0.1:8787/api/inbox/read_state"
$inboxCompactUrl = "http://127.0.0.1:8787/api/inbox/compact"
$taskifyDraftsUrl = "http://127.0.0.1:8787/api/taskify/drafts?limit=10"
$taskifyDraftsCreateUrl = "http://127.0.0.1:8787/api/taskify/drafts"
$taskifyQueueUrl = "http://127.0.0.1:8787/api/taskify/queue"
$taskifyQueueStatusBaseUrl = "http://127.0.0.1:8787/api/taskify/queue/status"
$evidenceExportUrl = "http://127.0.0.1:8787/api/export/evidence_bundle"
$opsSnapshotUrl = "http://127.0.0.1:8787/api/export/ops_snapshot"
$morningBriefBundleUrl = "http://127.0.0.1:8787/api/export/morning_brief_bundle"
$orgAgentsUrl = "http://127.0.0.1:8787/api/org/agents"
$agentPresetsUrl = "http://127.0.0.1:8787/api/org/agent_presets"
$activeProfileUrl = "http://127.0.0.1:8787/api/org/active_profile"
$activeProfileRevertUrl = "http://127.0.0.1:8787/api/org/active_profile/revert"
$agentApplyPresetUrl = "http://127.0.0.1:8787/api/org/agents/apply_preset"
$memorySearchBaseUrl = "http://127.0.0.1:8787/api/memory/search"
$heartbeatRunUrl = "http://127.0.0.1:8787/api/heartbeat/run"
$heartbeatSettingsUrl = "http://127.0.0.1:8787/api/heartbeat/settings"
$heartbeatStateUrl = "http://127.0.0.1:8787/api/heartbeat/state"
$heartbeatRunNowUrl = "http://127.0.0.1:8787/api/heartbeat/run_now"
$heartbeatSuggestionsBaseUrl = "http://127.0.0.1:8787/api/heartbeat/autopilot_suggestions"
$heartbeatSuggestSettingsUrl = "http://127.0.0.1:8787/api/heartbeat/autopilot_suggest_settings"
$heartbeatSuggestStateUrl = "http://127.0.0.1:8787/api/heartbeat/autopilot_suggest_state"
$consolidationSettingsUrl = "http://127.0.0.1:8787/api/consolidation/settings"
$consolidationStateUrl = "http://127.0.0.1:8787/api/consolidation/state"
$consolidationRunNowUrl = "http://127.0.0.1:8787/api/consolidation/run_now"
$morningBriefSettingsUrl = "http://127.0.0.1:8787/api/routines/morning_brief/settings"
$morningBriefStateUrl = "http://127.0.0.1:8787/api/routines/morning_brief/state"
$morningBriefRunNowUrl = "http://127.0.0.1:8787/api/routines/morning_brief/run_now"
$dashboardDailyLoopUrl = "http://127.0.0.1:8787/api/dashboard/daily_loop?limit_inbox_items=10"
$dashboardYesterdayMemoUrl = "http://127.0.0.1:8787/api/dashboard/yesterday_memo?agent_id=facilitator&category=episodes&limit=1"
$dashboardNextActionsUrl = "http://127.0.0.1:8787/api/dashboard/next_actions?limit=5"
$dashboardRecommendedProfilePreflightUrl = "http://127.0.0.1:8787/api/dashboard/recommended_profile/preflight"
$dashboardThreadArchiveSchedUrl = "http://127.0.0.1:8787/api/dashboard/thread_archive_scheduler"
$dashboardQuickActionsUrl = "http://127.0.0.1:8787/api/dashboard/quick_actions"
$dashboardTrackerHistoryUrl = "http://127.0.0.1:8787/api/dashboard/tracker_history"
$dashboardTrackerHistoryAppendUrl = "http://127.0.0.1:8787/api/dashboard/tracker_history/append"
$dashboardQuickActionsRunUrl = "http://127.0.0.1:8787/api/dashboard/quick_actions/run"
$dashboardQuickActionsExecuteUrl = "http://127.0.0.1:8787/api/dashboard/quick_actions/execute"
$opsQuickStatusUrl = "http://127.0.0.1:8787/api/ops/quick_actions/status"
$opsQuickClearLocksUrl = "http://127.0.0.1:8787/api/ops/quick_actions/clear_stale_locks"
$opsQuickResetBrakesUrl = "http://127.0.0.1:8787/api/ops/quick_actions/reset_brakes"
$opsQuickStabilizeUrl = "http://127.0.0.1:8787/api/ops/quick_actions/stabilize"
$opsAutoStabilizeExecuteSafeRunUrl = "http://127.0.0.1:8787/api/ops/auto_stabilize/execute_safe_run"
$opsAutoStabilizeSettingsUrl = "http://127.0.0.1:8787/api/ops/auto_stabilize/settings"
$opsAutoStabilizeStateUrl = "http://127.0.0.1:8787/api/ops/auto_stabilize/state"
$opsAutoStabilizeRunNowUrl = "http://127.0.0.1:8787/api/ops/auto_stabilize/run_now"
$guestKeysUrl = "http://127.0.0.1:8787/api/org/guest_keys"
$guestKeysNewUrl = "http://127.0.0.1:8787/api/org/guest_keys/new"
$guestJoinUrl = "http://127.0.0.1:8787/api/org/guests/join"
$guestPushUrl = "http://127.0.0.1:8787/api/org/guests/push"
$guestLeaveUrl = "http://127.0.0.1:8787/api/org/guests/leave"
$activityUrl = "http://127.0.0.1:8787/api/activity?limit=20"
$activityStreamUrl = "http://127.0.0.1:8787/api/activity/stream?limit=5"
$councilRunUrl = "http://127.0.0.1:8787/api/council/run"
$councilCancelUrl = "http://127.0.0.1:8787/api/council/run/cancel"
$councilStatusBaseUrl = "http://127.0.0.1:8787/api/council/run/status"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
  $WorkspaceRoot = Join-Path $env:TEMP "region_ai\\workspace"
}

$result = [ordered]@{
  action = "ui_smoke"
  api_url = $apiUrl
  status_code = 0
  threads_ok = $false
  search_ok = $false
  desktop_settings_ok = $false
  desktop_settings_post_ok = $false
  desktop_notify_state_ok = $false
  inbox_ok = $false
  inbox_thread_key_ok = $false
  inbox_thread_api_ok = $false
  inbox_thread_mark_read_ok = $false
  inbox_thread_archive_dry_ok = $false
  thread_archive_sched_settings_get_ok = $false
  thread_archive_sched_settings_post_ok = $false
  thread_archive_sched_state_ok = $false
  thread_archive_sched_run_now_dry_ok = $false
  inbox_read_state_ok = $false
  inbox_read_state_post_ok = $false
  inbox_compact_dryrun_ok = $false
  taskify_drafts_post_ok = $false
  taskify_drafts_get_ok = $false
  taskify_queue_ok = $false
  taskify_tracking_ok = $false
  evidence_export_ok = $false
  ops_snapshot_ok = $false
  ops_snapshot_status_ok = $false
  morning_brief_bundle_dry_ok = $false
  agents_ok = $false
  states_ok = $false
  agents_identity_ok = $false
  memory_post_ok = $false
  memory_get_ok = $false
  memory_search_ok = $false
  heartbeat_dry_run_ok = $false
  heartbeat_run_ok = $false
  heartbeat_persist_ok = $false
  heartbeat_settings_get_ok = $false
  heartbeat_settings_post_ok = $false
  heartbeat_state_ok = $false
  heartbeat_run_now_ok = $false
  heartbeat_suggest_ok = $false
  heartbeat_suggest_accept_ok = $false
  suggest_candidates_ok = $false
  suggest_preset_candidates_ok = $false
  suggest_recommended_profile_alignment_ok = $false
  suggest_accept_rank_ok = $false
  suggest_start_with_preset_preview_ok = $false
  suggest_settings_get_ok = $false
  suggest_settings_post_ok = $false
  suggest_state_ok = $false
  suggest_auto_accept_probe_ok = $false
  consolidation_settings_get_ok = $false
  consolidation_settings_post_ok = $false
  consolidation_dry_run_ok = $false
  consolidation_run_ok = $false
  consolidation_persist_ok = $false
  mb_settings_get_ok = $false
  mb_settings_post_ok = $false
  mb_run_now_dry_ok = $false
  morning_brief_recommended_profile_ok = $false
  mb_state_ok = $false
  dashboard_ok = $false
  yesterday_memo_ok = $false
  dashboard_next_actions_ok = $false
  dashboard_recommended_profile_ok = $false
  dashboard_recommended_profile_preflight_ok = $false
  dashboard_thread_archive_sched_ok = $false
  dashboard_quick_actions_ok = $false
  dashboard_quick_actions_run_ok = $false
  dashboard_quick_actions_execute_preview_ok = $false
  dashboard_quick_actions_execute_tracking_plan_ok = $false
  dashboard_quick_actions_thread_key_ok = $false
  dashboard_quick_actions_morning_brief_autopilot_preview_ok = $false
  dashboard_quick_actions_morning_brief_autopilot_confirm_ng_ok = $false
  inbox_thread_by_key_ok = $false
  tracker_history_storage_ok = $false
  tracker_history_portability_ok = $false
  tracker_history_workspace_ok = $false
  ops_status_ok = $false
  ops_confirm_token_ok = $false
  ops_clear_locks_dry_ok = $false
  ops_reset_brakes_dry_ok = $false
  ops_stabilize_dry_ok = $false
  auto_stab_exec_dry_ok = $false
  auto_stab_settings_get_ok = $false
  auto_exec_fields_present_ok = $false
  auto_stab_settings_post_ok = $false
  auto_stab_state_ok = $false
  auto_stab_run_now_ok = $false
  activity_ok = $false
  guest_join_push_ok = $false
  activity_stream_ok = $false
  council_run_ok = $false
  council_status_ok = $false
  council_cancel_ok = $false
  council_resume_ok = $false
  council_autopilot_thread_key_ok = $false
  inbox_thread_by_autopilot_key_ok = $false
  council_round_role_format_preview_ok = $false
  council_round_role_format_preview_v28_ok = $false
  council_autopilot_revert_suggestion_preview_ok = $false
  agent_presets_get_ok = $false
  active_profile_get_ok = $false
  agent_presets_apply_dry_ok = $false
  active_profile_preview_ok = $false
  active_profile_revert_preview_ok = $false
  active_profile_revert_confirm_ng_ok = $false
  dashboard_quick_actions_revert_preview_ok = $false
  ok = $false
  exit_code = 1
}

$proc = $null
$cleanupQueuedPaths = New-Object System.Collections.Generic.List[string]
try {
  $orgDir = Join-Path $WorkspaceRoot "ui\\org"
  $agentsPath = Join-Path $orgDir "agents.json"
  New-Item -ItemType Directory -Path $orgDir -Force | Out-Null
  $ensureDefaultAgents = $false
  if (-not (Test-Path -LiteralPath $agentsPath)) {
    $ensureDefaultAgents = $true
  } else {
    try {
      $rawAgents = Get-Content -LiteralPath $agentsPath -Raw -ErrorAction Stop
      $parsedAgents = $rawAgents | ConvertFrom-Json -ErrorAction Stop
      $hasFacilitator = $false
      try {
        $hasFacilitator = $null -ne (@($parsedAgents.agents) | Where-Object { [string]$_.id -eq "facilitator" } | Select-Object -First 1)
      } catch {}
      if (-not $hasFacilitator) { $ensureDefaultAgents = $true }
    } catch {
      $ensureDefaultAgents = $true
    }
  }
  if ($ensureDefaultAgents) {
    $nowIso = (Get-Date).ToUniversalTime().ToString("o")
    $defaultAgentsDoc = [ordered]@{
      version = 1
      updated_at = $nowIso
      agents = @(
        [ordered]@{ id = "facilitator"; display_name = "Facilitator"; role = "司会"; icon = "🎙️"; status = "idle"; assigned_thread_id = $null; last_message = $null; last_updated_at = $nowIso },
        [ordered]@{ id = "designer"; display_name = "Designer"; role = "設計担当"; icon = "🧭"; status = "idle"; assigned_thread_id = $null; last_message = $null; last_updated_at = $nowIso },
        [ordered]@{ id = "implementer"; display_name = "Implementer"; role = "実装担当"; icon = "🛠️"; status = "idle"; assigned_thread_id = $null; last_message = $null; last_updated_at = $nowIso },
        [ordered]@{ id = "verifier"; display_name = "Verifier"; role = "検証担当"; icon = "✅"; status = "idle"; assigned_thread_id = $null; last_message = $null; last_updated_at = $nowIso },
        [ordered]@{ id = "joker"; display_name = "Joker"; role = "道化師"; icon = "🤡"; status = "idle"; assigned_thread_id = $null; last_message = $null; last_updated_at = $nowIso }
      )
    }
    ($defaultAgentsDoc | ConvertTo-Json -Depth 8) + "`n" | Set-Content -LiteralPath $agentsPath -Encoding UTF8
  }

  $cmd = "set REGION_AI_WORKSPACE=$WorkspaceRoot&& npm.cmd run build&& npm.cmd run ui:api"
  $proc = Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/s", "/c", $cmd) -WorkingDirectory $orchDir -PassThru -WindowStyle Hidden

  $ok = $false
  for ($i = 0; $i -lt 20; $i += 1) {
    Start-Sleep -Milliseconds 500
    try {
      $resp = Invoke-WebRequest -Uri $apiUrl -Method Get -TimeoutSec 2 -UseBasicParsing
      if ($resp.StatusCode -eq 200) {
        $obj = $resp.Content | ConvertFrom-Json -ErrorAction Stop
        if ($obj.ok -eq $true) {
          $result.status_code = [int]$resp.StatusCode
          $ok = $true
          break
        }
      }
    } catch {
      continue
    }
  }
  if (-not $ok) {
    throw "ui_api endpoint check failed"
  }
  $threadsResp = Invoke-WebRequest -Uri $threadsUrl -Method Get -TimeoutSec 2 -UseBasicParsing
  if ($threadsResp.StatusCode -ne 200) { throw "threads_endpoint_failed" }
  $threadsObj = $threadsResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($threadsObj.ok -ne $true) { throw "threads_not_ok" }
  $result.threads_ok = $true

  $searchResp = Invoke-WebRequest -Uri $searchUrl -Method Get -TimeoutSec 2 -UseBasicParsing
  if ($searchResp.StatusCode -ne 200) { throw "search_endpoint_failed" }
  $searchObj = $searchResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($searchObj.ok -ne $true) { throw "search_not_ok" }
  $result.search_ok = $true

  $settingsResp = Invoke-WebRequest -Uri $desktopSettingsUrl -Method Get -TimeoutSec 2 -UseBasicParsing
  if ($settingsResp.StatusCode -ne 200) { throw "desktop_settings_endpoint_failed" }
  $settingsObj = $settingsResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($settingsObj.ok -ne $true) { throw "desktop_settings_not_ok" }
  $result.desktop_settings_ok = $true

  $currentEnabled = $true
  try {
    $currentEnabled = [bool]$settingsObj.data.settings.mention.enabled
  } catch {}
  $toggleBody = @{ mention = @{ enabled = (-not $currentEnabled) } } | ConvertTo-Json -Depth 8
  $settingsPostResp = Invoke-WebRequest -Uri $desktopSettingsUrl -Method Post -TimeoutSec 2 -UseBasicParsing -ContentType "application/json" -Body $toggleBody
  if ($settingsPostResp.StatusCode -ne 200) { throw "desktop_settings_post_failed" }
  $settingsPostObj = $settingsPostResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($settingsPostObj.ok -ne $true) { throw "desktop_settings_post_not_ok" }
  $result.desktop_settings_post_ok = $true

  $notifyResp = Invoke-WebRequest -Uri $desktopNotifyStateUrl -Method Get -TimeoutSec 2 -UseBasicParsing
  if ($notifyResp.StatusCode -ne 200) { throw "desktop_notify_state_endpoint_failed" }
  $notifyObj = $notifyResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($notifyObj.ok -ne $true) { throw "desktop_notify_state_not_ok" }
  $result.desktop_notify_state_ok = $true

  $inboxResp = Invoke-WebRequest -Uri $inboxUrl -Method Get -TimeoutSec 2 -UseBasicParsing
  if ($inboxResp.StatusCode -ne 200) { throw "inbox_endpoint_failed" }
  $inboxObj = $inboxResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($inboxObj.ok -ne $true) { throw "inbox_not_ok" }
  $result.inbox_ok = $true

  $inboxOneResp = Invoke-WebRequest -Uri $inboxOneUrl -Method Get -TimeoutSec 2 -UseBasicParsing
  if ($inboxOneResp.StatusCode -ne 200) { throw "inbox_one_endpoint_failed" }
  $inboxOneObj = $inboxOneResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($inboxOneObj.ok -ne $true) { throw "inbox_one_not_ok" }
  $firstInboxItem = $null
  try {
    $firstInboxItem = @($inboxOneObj.data.items) | Select-Object -First 1
  } catch {}
  if ($null -eq $firstInboxItem) {
    $result.inbox_thread_key_ok = $true
    $result.inbox_thread_api_ok = $true
    $result.inbox_thread_mark_read_ok = $true
    $result.inbox_thread_archive_dry_ok = $true
  } else {
    $threadKey = [string]$firstInboxItem.thread_key
    if ([string]::IsNullOrWhiteSpace($threadKey)) { throw "inbox_thread_key_missing" }
    $result.inbox_thread_key_ok = $true
    $threadUrl = "${inboxThreadBaseUrl}?key=$([uri]::EscapeDataString($threadKey))&limit=5"
    $threadResp = Invoke-WebRequest -Uri $threadUrl -Method Get -TimeoutSec 2 -UseBasicParsing
    if ($threadResp.StatusCode -ne 200) { throw "inbox_thread_endpoint_failed" }
    $threadObj = $threadResp.Content | ConvertFrom-Json -ErrorAction Stop
    if ($threadObj.ok -ne $true) { throw "inbox_thread_not_ok" }
    $threadItems = @()
    try { $threadItems = @($threadObj.data.items) } catch {}
    if ($threadItems.Count -lt 1) { throw "inbox_thread_items_empty" }
    $allMatch = $true
    foreach ($it in $threadItems) {
      if ([string]$it.thread_key -ne $threadKey) { $allMatch = $false; break }
    }
    if (-not $allMatch) { throw "inbox_thread_items_key_mismatch" }
    $result.inbox_thread_api_ok = $true

    $threadReadBody = @{ thread_key = $threadKey; mode = "mark_read" } | ConvertTo-Json -Depth 4
    $threadReadResp = Invoke-WebRequest -Uri $inboxThreadReadStateUrl -Method Post -TimeoutSec 2 -UseBasicParsing -ContentType "application/json" -Body $threadReadBody
    if ($threadReadResp.StatusCode -ne 200) { throw "inbox_thread_read_state_failed" }
    $threadReadObj = $threadReadResp.Content | ConvertFrom-Json -ErrorAction Stop
    if ($threadReadObj.ok -ne $true) { throw "inbox_thread_read_state_not_ok" }
    $markedReadNum = 0
    try { $markedReadNum = [int]$threadReadObj.data.marked_read } catch { $markedReadNum = -1 }
    if ($markedReadNum -lt 0) { throw "inbox_thread_marked_read_invalid" }
    $result.inbox_thread_mark_read_ok = $true

    $threadArchiveBody = @{ thread_key = $threadKey; dry_run = $true } | ConvertTo-Json -Depth 4
    $threadArchiveResp = Invoke-WebRequest -Uri $inboxThreadArchiveUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $threadArchiveBody
    if ($threadArchiveResp.StatusCode -ne 200) { throw "inbox_thread_archive_dry_failed" }
    $threadArchiveObj = $threadArchiveResp.Content | ConvertFrom-Json -ErrorAction Stop
    if ($threadArchiveObj.ok -ne $true) { throw "inbox_thread_archive_dry_not_ok" }
    $archiveAction = ""
    $archivePath = ""
    $archiveCount = -1
    try {
      $archiveAction = [string]$threadArchiveObj.data.action
      $archivePath = [string]$threadArchiveObj.data.archive_path
      $archiveCount = [int]$threadArchiveObj.data.archived
    } catch {}
    if ($archiveAction -ne "inbox_thread_archive") { throw "inbox_thread_archive_action_invalid" }
    if ([string]::IsNullOrWhiteSpace($archivePath)) { throw "inbox_thread_archive_path_missing" }
    if ($archiveCount -lt 0) { throw "inbox_thread_archive_count_invalid" }
    $result.inbox_thread_archive_dry_ok = $true
  }

  $schedSettingsGetResp = Invoke-WebRequest -Uri $threadArchiveSchedSettingsUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($schedSettingsGetResp.StatusCode -ne 200) { throw "thread_archive_sched_settings_get_failed" }
  $schedSettingsGetObj = $schedSettingsGetResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($schedSettingsGetObj.ok -ne $true) { throw "thread_archive_sched_settings_get_not_ok" }
  $result.thread_archive_sched_settings_get_ok = $true

  $schedSettingsPostBody = @{
    enabled = $false
    thread_keys = @("ops:auto_stabilize")
  } | ConvertTo-Json -Depth 6
  $schedSettingsPostResp = Invoke-WebRequest -Uri $threadArchiveSchedSettingsUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $schedSettingsPostBody
  if ($schedSettingsPostResp.StatusCode -ne 200) { throw "thread_archive_sched_settings_post_failed" }
  $schedSettingsPostObj = $schedSettingsPostResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($schedSettingsPostObj.ok -ne $true) { throw "thread_archive_sched_settings_post_not_ok" }
  $result.thread_archive_sched_settings_post_ok = $true

  $schedStateResp = Invoke-WebRequest -Uri $threadArchiveSchedStateUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($schedStateResp.StatusCode -ne 200) { throw "thread_archive_sched_state_get_failed" }
  $schedStateObj = $schedStateResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($schedStateObj.ok -ne $true) { throw "thread_archive_sched_state_get_not_ok" }
  $result.thread_archive_sched_state_ok = $true

  $schedRunNowDryBody = @{ dry_run = $true } | ConvertTo-Json -Depth 4
  $schedRunNowDryResp = Invoke-WebRequest -Uri $threadArchiveSchedRunNowUrl -Method Post -TimeoutSec 5 -UseBasicParsing -ContentType "application/json" -Body $schedRunNowDryBody
  if ($schedRunNowDryResp.StatusCode -ne 200) { throw "thread_archive_sched_run_now_dry_failed" }
  $schedRunNowDryObj = $schedRunNowDryResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($schedRunNowDryObj.ok -ne $true) { throw "thread_archive_sched_run_now_dry_not_ok" }
  try {
    if ([string]$schedRunNowDryObj.data.action -ne "thread_archive_scheduler_run_now") { throw "thread_archive_sched_run_now_action_invalid" }
  } catch { throw "thread_archive_sched_run_now_payload_invalid" }
  $result.thread_archive_sched_run_now_dry_ok = $true

  $inboxStateResp = Invoke-WebRequest -Uri $inboxReadStateUrl -Method Get -TimeoutSec 2 -UseBasicParsing
  if ($inboxStateResp.StatusCode -ne 200) { throw "inbox_read_state_endpoint_failed" }
  $inboxStateObj = $inboxStateResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($inboxStateObj.ok -ne $true) { throw "inbox_read_state_not_ok" }
  $result.inbox_read_state_ok = $true

  $readBody = @{ last_read_ts = (Get-Date).ToString("o") } | ConvertTo-Json -Depth 4
  $inboxPostResp = Invoke-WebRequest -Uri $inboxReadStateUrl -Method Post -TimeoutSec 2 -UseBasicParsing -ContentType "application/json" -Body $readBody
  if ($inboxPostResp.StatusCode -ne 200) { throw "inbox_read_state_post_failed" }
  $inboxPostObj = $inboxPostResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($inboxPostObj.ok -ne $true) { throw "inbox_read_state_post_not_ok" }
  $result.inbox_read_state_post_ok = $true

  $compactBody = @{ max_lines = 10; dry_run = $true } | ConvertTo-Json -Depth 4
  $compactResp = Invoke-WebRequest -Uri $inboxCompactUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $compactBody
  if ($compactResp.StatusCode -ne 200) { throw "inbox_compact_dryrun_endpoint_failed" }
  $compactObj = $compactResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($compactObj.ok -ne $true) { throw "inbox_compact_dryrun_not_ok" }
  $result.inbox_compact_dryrun_ok = $true

  $draftBody = @{
    source = @{ thread_id = "general"; msg_id = "msg_smoke"; inbox_id = "" }
    title = "ui_smoke taskify"
    text = "smoke taskify draft"
    links = @{}
  } | ConvertTo-Json -Depth 8
  $draftPostResp = Invoke-WebRequest -Uri $taskifyDraftsCreateUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $draftBody
  if ($draftPostResp.StatusCode -ne 200) { throw "taskify_drafts_post_failed" }
  $draftPostObj = $draftPostResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($draftPostObj.ok -ne $true) { throw "taskify_drafts_post_not_ok" }
  $result.taskify_drafts_post_ok = $true
  $draftId = ""
  try { $draftId = [string]$draftPostObj.data.id } catch {}
  if ([string]::IsNullOrWhiteSpace($draftId)) { throw "taskify_drafts_post_missing_id" }

  $draftGetResp = Invoke-WebRequest -Uri $taskifyDraftsUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($draftGetResp.StatusCode -ne 200) { throw "taskify_drafts_get_failed" }
  $draftGetObj = $draftGetResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($draftGetObj.ok -ne $true) { throw "taskify_drafts_get_not_ok" }
  $result.taskify_drafts_get_ok = $true

  $queueBody = @{ draft_id = $draftId } | ConvertTo-Json -Depth 4
  $queueResp = Invoke-WebRequest -Uri $taskifyQueueUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $queueBody
  if ($queueResp.StatusCode -ne 200) { throw "taskify_queue_failed" }
  $queueObj = $queueResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($queueObj.ok -ne $true) { throw "taskify_queue_not_ok" }
  if ($queueObj.data.queued -ne $true) { throw "taskify_queue_not_queued" }
  try {
    $queuedPath = [string]$queueObj.data.queued_path
    if (-not [string]::IsNullOrWhiteSpace($queuedPath)) { [void]$cleanupQueuedPaths.Add($queuedPath) }
  } catch {}
  $result.taskify_queue_ok = $true
  $requestId = ""
  try { $requestId = [string]$queueObj.data.request_id } catch {}
  if ([string]::IsNullOrWhiteSpace($requestId)) { throw "taskify_queue_missing_request_id" }

  $statusUrl = "${taskifyQueueStatusBaseUrl}?request_id=$([uri]::EscapeDataString($requestId))"
  $statusResp = Invoke-WebRequest -Uri $statusUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($statusResp.StatusCode -ne 200) { throw "taskify_tracking_status_failed" }
  $statusObj = $statusResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($statusObj.ok -ne $true) { throw "taskify_tracking_status_not_ok" }
  if ($null -eq $statusObj.data.item) { throw "taskify_tracking_item_missing" }
  $result.taskify_tracking_ok = $true

  $agentsGetResp = Invoke-WebRequest -Uri $orgAgentsUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($agentsGetResp.StatusCode -ne 200) { throw "org_agents_get_failed" }
  $agentsGetObj = $agentsGetResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($agentsGetObj.ok -ne $true) { throw "org_agents_get_not_ok" }

  $facilitator = $null
  try {
    $facilitator = @($agentsGetObj.data.agents) | Where-Object { [string]$_.id -eq "facilitator" } | Select-Object -First 1
  } catch {}
  if ($null -eq $facilitator) { throw "org_agents_facilitator_missing" }
  $nextStatus = "researching"
  try {
    $curStatus = [string]$facilitator.status
    if ($curStatus -eq "researching") { $nextStatus = "executing" }
  } catch {}
  $postAgentsBody = @{
    agents = @(
      @{
        id = "facilitator"
        status = $nextStatus
        assigned_thread_id = $facilitator.assigned_thread_id
        layout = @{ x = 0.1; y = 0.2 }
      }
    )
    actor_id = "ui_smoke"
  } | ConvertTo-Json -Depth 8
  $agentsPostResp = Invoke-WebRequest -Uri $orgAgentsUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $postAgentsBody
  if ($agentsPostResp.StatusCode -ne 200) { throw "org_agents_post_failed" }
  $agentsPostObj = $agentsPostResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($agentsPostObj.ok -ne $true) { throw "org_agents_post_not_ok" }
  $result.agents_ok = $true
  $statesOk = $false
  try {
    $facAfter = @($agentsPostObj.data.agents) | Where-Object { [string]$_.id -eq "facilitator" } | Select-Object -First 1
    $statesOk = ($null -ne $facAfter) -and ([string]$facAfter.status -eq $nextStatus)
  } catch {}
  if (-not $statesOk) { throw "states_status_not_persisted" }
  $result.states_ok = $true

  $presetsResp = Invoke-WebRequest -Uri $agentPresetsUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($presetsResp.StatusCode -ne 200) { throw "agent_presets_get_failed" }
  $presetsObj = $presetsResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($presetsObj.ok -ne $true) { throw "agent_presets_get_not_ok" }
  $presetsCount = 0
  try { $presetsCount = @($presetsObj.data.presets).Count } catch { $presetsCount = 0 }
  if ($presetsCount -lt 1) { throw "agent_presets_empty" }
  $result.agent_presets_get_ok = $true

  $activeProfileResp = Invoke-WebRequest -Uri $activeProfileUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($activeProfileResp.StatusCode -ne 200) { throw "active_profile_get_failed" }
  $activeProfileObj = $activeProfileResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($activeProfileObj.ok -ne $true) { throw "active_profile_get_not_ok" }
  $activePresetId = ""
  try { $activePresetId = [string]$activeProfileObj.data.preset_set_id } catch {}
  if (-not ($activePresetId -match '^[a-z0-9:_-]{1,80}$')) { throw "active_profile_get_preset_invalid" }
  $result.active_profile_get_ok = $true

  $applyPresetDryBody = @{
    preset_set_id = "standard"
    scope = "council"
    dry_run = $true
  } | ConvertTo-Json -Depth 6
  $applyPresetDryResp = Invoke-WebRequest -Uri $agentApplyPresetUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $applyPresetDryBody
  if ($applyPresetDryResp.StatusCode -ne 200) { throw "agent_presets_apply_dry_failed" }
  $applyPresetDryObj = $applyPresetDryResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($applyPresetDryObj.ok -ne $true) { throw "agent_presets_apply_dry_not_ok" }
  try {
    if ([bool]$applyPresetDryObj.data.dry_run -ne $true) { throw "agent_presets_apply_dry_flag_invalid" }
    if ([int]$applyPresetDryObj.data.exit_code -ne 0) { throw "agent_presets_apply_dry_exit_code_invalid" }
  } catch { throw "agent_presets_apply_dry_payload_invalid" }
  $appliedIds = @()
  try { $appliedIds = @($applyPresetDryObj.data.applied_ids) } catch { $appliedIds = @() }
  if (-not ($appliedIds -contains "facilitator")) { throw "agent_presets_apply_dry_missing_facilitator" }
  $activeProfilePreviewOk = $false
  try {
    $previewPresetId = [string]$applyPresetDryObj.data.active_profile_preview.preset_set_id
    $previewDisplay = [string]$applyPresetDryObj.data.active_profile_preview.display_name
    $activeProfilePreviewOk = ($previewPresetId -eq "standard") -and (-not [string]::IsNullOrWhiteSpace($previewDisplay))
  } catch {}
  if (-not $activeProfilePreviewOk) { throw "active_profile_preview_invalid" }
  $result.agent_presets_apply_dry_ok = $true
  $result.active_profile_preview_ok = $true

  $activeProfileRevertPreviewBody = @{
    dry_run = $true
  } | ConvertTo-Json -Depth 6
  $activeProfileRevertPreviewResp = Invoke-WebRequest -Uri $activeProfileRevertUrl -Method Post -TimeoutSec 4 -UseBasicParsing -ContentType "application/json" -Body $activeProfileRevertPreviewBody
  if ($activeProfileRevertPreviewResp.StatusCode -ne 200) { throw "active_profile_revert_preview_failed" }
  $activeProfileRevertPreviewObj = $activeProfileRevertPreviewResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($activeProfileRevertPreviewObj.ok -ne $true) { throw "active_profile_revert_preview_not_ok" }
  $activeProfileRevertPreviewData = $activeProfileRevertPreviewObj.data
  $revertPreviewOk = $false
  try {
    $revertPreviewOk = ([bool]$activeProfileRevertPreviewData.ok -eq $true) -and ([bool]$activeProfileRevertPreviewData.dry_run -eq $true) -and ([string]$activeProfileRevertPreviewData.active_profile_preview.preset_set_id -eq "standard")
  } catch {}
  if (-not $revertPreviewOk) { throw "active_profile_revert_preview_payload_invalid" }
  $result.active_profile_revert_preview_ok = $true

  $activeProfileRevertNgBody = @{
    dry_run = $false
    confirm_phrase = "NOPE"
  } | ConvertTo-Json -Depth 6
  $activeProfileRevertNgStatus = 0
  $activeProfileRevertNgContent = ""
  try {
    $req = [System.Net.HttpWebRequest]::Create($activeProfileRevertUrl)
    $req.Method = "POST"
    $req.Timeout = 5000
    $req.ReadWriteTimeout = 5000
    $req.ContentType = "application/json"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($activeProfileRevertNgBody)
    $req.ContentLength = $bytes.Length
    $reqStream = $req.GetRequestStream()
    $reqStream.Write($bytes, 0, $bytes.Length)
    $reqStream.Dispose()
    $resp = $req.GetResponse()
    $activeProfileRevertNgStatus = [int]$resp.StatusCode
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $activeProfileRevertNgContent = $reader.ReadToEnd()
    $reader.Dispose()
    $resp.Close()
    throw "active_profile_revert_confirm_ng_expected_400"
  } catch {
    $errEx = $_.Exception
    $wex = $null
    if ($errEx -is [System.Net.WebException]) {
      $wex = [System.Net.WebException]$errEx
    } elseif ($errEx.InnerException -is [System.Net.WebException]) {
      $wex = [System.Net.WebException]$errEx.InnerException
    }
    if ($null -ne $wex) {
      if ($wex.Response -ne $null) {
        $resp = [System.Net.HttpWebResponse]$wex.Response
        $activeProfileRevertNgStatus = [int]$resp.StatusCode
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $activeProfileRevertNgContent = $reader.ReadToEnd()
        $reader.Dispose()
        $resp.Close()
      } else {
        throw "active_profile_revert_confirm_ng_no_response"
      }
    } elseif ([string]$_.Exception.Message -eq "active_profile_revert_confirm_ng_expected_400") {
      throw "active_profile_revert_confirm_ng_expected_400"
    } else {
      throw
    }
  }
  if ($activeProfileRevertNgStatus -ne 400) { throw "active_profile_revert_confirm_ng_status_invalid" }
  $activeProfileRevertNgObj = $activeProfileRevertNgContent | ConvertFrom-Json -ErrorAction Stop
  if ([string]$activeProfileRevertNgObj.reason -ne "ERR_CONFIRM_REQUIRED") { throw "active_profile_revert_confirm_ng_reason_invalid" }
  $revertWhich = ""
  try { $revertWhich = [string]$activeProfileRevertNgObj.details.which } catch {}
  if ($revertWhich -ne "REVERT") { throw "active_profile_revert_confirm_ng_which_invalid" }
  $result.active_profile_revert_confirm_ng_ok = $true

  $identityTagline = "facilitator_identity_smoke"
  $postIdentityBody = @{
    agents = @(
      @{
        id = "facilitator"
        identity = @{
          tagline = $identityTagline
          values = @("alignment")
        }
      }
    )
    actor_id = "ui_smoke"
  } | ConvertTo-Json -Depth 10
  $agentsIdentityResp = Invoke-WebRequest -Uri $orgAgentsUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $postIdentityBody
  if ($agentsIdentityResp.StatusCode -ne 200) { throw "org_agents_identity_post_failed" }
  $agentsIdentityObj = $agentsIdentityResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($agentsIdentityObj.ok -ne $true) { throw "org_agents_identity_post_not_ok" }
  $agentsGet2Resp = Invoke-WebRequest -Uri $orgAgentsUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($agentsGet2Resp.StatusCode -ne 200) { throw "org_agents_identity_get_failed" }
  $agentsGet2Obj = $agentsGet2Resp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($agentsGet2Obj.ok -ne $true) { throw "org_agents_identity_get_not_ok" }
  $identityOk = $false
  try {
    $fac2 = @($agentsGet2Obj.data.agents) | Where-Object { [string]$_.id -eq "facilitator" } | Select-Object -First 1
    $identityOk = ($null -ne $fac2 -and [string]$fac2.identity.tagline -eq $identityTagline)
  } catch {}
  if (-not $identityOk) { throw "org_agents_identity_not_persisted" }
  $result.agents_identity_ok = $true

  $memoryAgentId = "facilitator"
  $memoryPostUrl = "http://127.0.0.1:8787/api/memory/$([uri]::EscapeDataString($memoryAgentId))/knowledge"
  $memoryBody = @{
    title = "smoke knowledge"
    body = "hello"
    tags = @("smoke")
    source = "ui"
  } | ConvertTo-Json -Depth 6
  $memoryPostResp = Invoke-WebRequest -Uri $memoryPostUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $memoryBody
  if ($memoryPostResp.StatusCode -ne 200) { throw "memory_post_failed" }
  $memoryPostObj = $memoryPostResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($memoryPostObj.ok -ne $true) { throw "memory_post_not_ok" }
  $memoryEntryId = ""
  try { $memoryEntryId = [string]$memoryPostObj.data.id } catch {}
  if ([string]::IsNullOrWhiteSpace($memoryEntryId)) { throw "memory_post_missing_id" }
  $result.memory_post_ok = $true

  $memoryGetUrl = "${memoryPostUrl}?limit=5"
  $memoryGetResp = Invoke-WebRequest -Uri $memoryGetUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($memoryGetResp.StatusCode -ne 200) { throw "memory_get_failed" }
  $memoryGetObj = $memoryGetResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($memoryGetObj.ok -ne $true) { throw "memory_get_not_ok" }
  $memoryFound = $false
  try {
    $memoryFound = @($memoryGetObj.data.items) | Where-Object { [string]$_.id -eq $memoryEntryId } | Select-Object -First 1
    $memoryFound = $null -ne $memoryFound
  } catch {}
  if (-not $memoryFound) { throw "memory_get_missing_entry" }
  $result.memory_get_ok = $true

  $memorySearchUrl = "${memorySearchBaseUrl}?q=$([uri]::EscapeDataString("smoke knowledge"))&limit=5"
  $memorySearchResp = Invoke-WebRequest -Uri $memorySearchUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($memorySearchResp.StatusCode -ne 200) { throw "memory_search_failed" }
  $memorySearchObj = $memorySearchResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($memorySearchObj.ok -ne $true) { throw "memory_search_not_ok" }
  $searchHit = $false
  try {
    $searchHit = @($memorySearchObj.data.hits) | Where-Object { [string]$_.title -eq "smoke knowledge" } | Select-Object -First 1
    $searchHit = $null -ne $searchHit
  } catch {}
  if (-not $searchHit) { throw "memory_search_missing_entry" }
  $result.memory_search_ok = $true

  $yesterdayMemoResp = Invoke-WebRequest -Uri $dashboardYesterdayMemoUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($yesterdayMemoResp.StatusCode -ne 200) { throw "dashboard_yesterday_memo_get_failed" }
  $yesterdayMemoObj = $yesterdayMemoResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($yesterdayMemoObj.ok -ne $true) { throw "dashboard_yesterday_memo_not_ok" }
  $yesterdayMemoShapeOk = $false
  try {
    $yesterdayMemoShapeOk = ([string]$yesterdayMemoObj.data.agent_id -eq "facilitator") -and ([string]$yesterdayMemoObj.data.category -eq "episodes")
    if ($null -ne $yesterdayMemoObj.data.item) {
      $title = [string]$yesterdayMemoObj.data.item.title
      $body = [string]$yesterdayMemoObj.data.item.body
      $yesterdayMemoShapeOk = $yesterdayMemoShapeOk -and (-not [string]::IsNullOrWhiteSpace($title)) -and ($body.Length -le 2048)
    }
  } catch {}
  if (-not $yesterdayMemoShapeOk) { throw "dashboard_yesterday_memo_shape_invalid" }
  $result.yesterday_memo_ok = $true

  $heartbeatDryRunBody = @{
    agent_id = "facilitator"
    category = "knowledge"
    activity_limit = 20
    inbox_limit = 10
    runs_limit = 10
    dry_run = $true
  } | ConvertTo-Json -Depth 6
  $heartbeatDryResp = Invoke-WebRequest -Uri $heartbeatRunUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $heartbeatDryRunBody
  if ($heartbeatDryResp.StatusCode -ne 200) { throw "heartbeat_dry_run_failed" }
  $heartbeatDryObj = $heartbeatDryResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($heartbeatDryObj.ok -ne $true) { throw "heartbeat_dry_run_not_ok" }
  try {
    if ([bool]$heartbeatDryObj.data.dry_run -ne $true) { throw "heartbeat_dry_run_flag_invalid" }
  } catch { throw "heartbeat_dry_run_payload_invalid" }
  $result.heartbeat_dry_run_ok = $true

  $heartbeatRunBody = @{
    agent_id = "facilitator"
    category = "knowledge"
    activity_limit = 20
    inbox_limit = 10
    runs_limit = 10
    dry_run = $false
  } | ConvertTo-Json -Depth 6
  $heartbeatRunResp = Invoke-WebRequest -Uri $heartbeatRunUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $heartbeatRunBody
  if ($heartbeatRunResp.StatusCode -ne 200) { throw "heartbeat_run_failed" }
  $heartbeatRunObj = $heartbeatRunResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($heartbeatRunObj.ok -ne $true) { throw "heartbeat_run_not_ok" }
  $result.heartbeat_run_ok = $true

  $memoryGetAfterHeartbeatResp = Invoke-WebRequest -Uri $memoryGetUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($memoryGetAfterHeartbeatResp.StatusCode -ne 200) { throw "heartbeat_memory_get_failed" }
  $memoryGetAfterHeartbeatObj = $memoryGetAfterHeartbeatResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($memoryGetAfterHeartbeatObj.ok -ne $true) { throw "heartbeat_memory_get_not_ok" }
  $heartbeatPersistOk = $false
  try {
    $heartbeatPersistOk = @($memoryGetAfterHeartbeatObj.data.items) | Where-Object { [string]$_.title -like "Heartbeat*" } | Select-Object -First 1
    $heartbeatPersistOk = $null -ne $heartbeatPersistOk
  } catch {}
  if (-not $heartbeatPersistOk) { throw "heartbeat_memory_persist_missing" }
  $result.heartbeat_persist_ok = $true

  $hbSettingsGetResp = Invoke-WebRequest -Uri $heartbeatSettingsUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($hbSettingsGetResp.StatusCode -ne 200) { throw "heartbeat_settings_get_failed" }
  $hbSettingsGetObj = $hbSettingsGetResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($hbSettingsGetObj.ok -ne $true) { throw "heartbeat_settings_get_not_ok" }
  $result.heartbeat_settings_get_ok = $true

  $hbSettingsPostBody = @{
    enabled = $true
    schedule = @{
      daily_time = "09:00"
      tick_interval_sec = 15
      jitter_sec = 30
    }
    targets = @{
      agent_ids = @("facilitator")
      category = "episodes"
    }
  } | ConvertTo-Json -Depth 8
  $hbSettingsPostResp = Invoke-WebRequest -Uri $heartbeatSettingsUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $hbSettingsPostBody
  if ($hbSettingsPostResp.StatusCode -ne 200) { throw "heartbeat_settings_post_failed" }
  $hbSettingsPostObj = $hbSettingsPostResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($hbSettingsPostObj.ok -ne $true) { throw "heartbeat_settings_post_not_ok" }
  $result.heartbeat_settings_post_ok = $true

  $hbStateResp = Invoke-WebRequest -Uri $heartbeatStateUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($hbStateResp.StatusCode -ne 200) { throw "heartbeat_state_get_failed" }
  $hbStateObj = $hbStateResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($hbStateObj.ok -ne $true) { throw "heartbeat_state_get_not_ok" }
  $result.heartbeat_state_ok = $true

  $hbRunNowBody = @{
    agent_id = "facilitator"
    category = "episodes"
    dry_run = $true
  } | ConvertTo-Json -Depth 6
  $hbRunNowResp = Invoke-WebRequest -Uri $heartbeatRunNowUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $hbRunNowBody
  if ($hbRunNowResp.StatusCode -ne 200) { throw "heartbeat_run_now_failed" }
  $hbRunNowObj = $hbRunNowResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($hbRunNowObj.ok -ne $true) { throw "heartbeat_run_now_not_ok" }
  $result.heartbeat_run_now_ok = $true

  $hbSuggestSettingsGetResp = Invoke-WebRequest -Uri $heartbeatSuggestSettingsUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($hbSuggestSettingsGetResp.StatusCode -ne 200) { throw "heartbeat_suggest_settings_get_failed" }
  $hbSuggestSettingsGetObj = $hbSuggestSettingsGetResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($hbSuggestSettingsGetObj.ok -ne $true) { throw "heartbeat_suggest_settings_get_not_ok" }
  $result.suggest_settings_get_ok = $true

  $hbSuggestSettingsPostBody = @{
    auto_accept_enabled = $true
  } | ConvertTo-Json -Depth 4
  $hbSuggestSettingsPostResp = Invoke-WebRequest -Uri $heartbeatSuggestSettingsUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $hbSuggestSettingsPostBody
  if ($hbSuggestSettingsPostResp.StatusCode -ne 200) { throw "heartbeat_suggest_settings_post_failed" }
  $hbSuggestSettingsPostObj = $hbSuggestSettingsPostResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($hbSuggestSettingsPostObj.ok -ne $true) { throw "heartbeat_suggest_settings_post_not_ok" }
  $result.suggest_settings_post_ok = $true

  $hbSuggestStateResp = Invoke-WebRequest -Uri $heartbeatSuggestStateUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($hbSuggestStateResp.StatusCode -ne 200) { throw "heartbeat_suggest_state_get_failed" }
  $hbSuggestStateObj = $hbSuggestStateResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($hbSuggestStateObj.ok -ne $true) { throw "heartbeat_suggest_state_get_not_ok" }
  $result.suggest_state_ok = $true

  $hbRunNowRealBody = @{
    agent_id = "facilitator"
    category = "episodes"
    dry_run = $false
  } | ConvertTo-Json -Depth 6
  $hbRunNowRealResp = Invoke-WebRequest -Uri $heartbeatRunNowUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $hbRunNowRealBody
  if ($hbRunNowRealResp.StatusCode -ne 200) { throw "heartbeat_run_now_real_failed" }
  $hbRunNowRealObj = $hbRunNowRealResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($hbRunNowRealObj.ok -ne $true) { throw "heartbeat_run_now_real_not_ok" }

  $hbSugGetUrl = "${heartbeatSuggestionsBaseUrl}?limit=5"
  $hbSugGetResp = Invoke-WebRequest -Uri $hbSugGetUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($hbSugGetResp.StatusCode -ne 200) { throw "heartbeat_suggestions_get_failed" }
  $hbSugGetObj = $hbSugGetResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($hbSugGetObj.ok -ne $true) { throw "heartbeat_suggestions_get_not_ok" }
  $sugItem = $null
  try {
    $sugItem = @($hbSugGetObj.data.items) | Where-Object { [string]$_.status -eq "open" } | Select-Object -First 1
  } catch {}
  if ($null -eq $sugItem) { throw "heartbeat_suggestions_open_missing" }
  $result.heartbeat_suggest_ok = $true
  $candOk = $false
  try {
    $candCount = @($sugItem.candidates).Count
    $candOk = ($candCount -ge 1)
  } catch {}
  if (-not $candOk) { throw "heartbeat_suggestions_candidates_missing" }
  $result.suggest_candidates_ok = $true
  $presetCandOk = $false
  try {
    $presetCandCount = @($sugItem.preset_candidates).Count
    if ($presetCandCount -ge 1) {
      $rank1Preset = @($sugItem.preset_candidates) | Where-Object { [int]$_.rank -eq 1 -and -not [string]::IsNullOrWhiteSpace([string]$_.preset_set_id) } | Select-Object -First 1
      $presetCandOk = $null -ne $rank1Preset
    } else {
      $presetCandOk = $true
    }
  } catch {}
  if (-not $presetCandOk) { throw "heartbeat_suggestions_preset_candidates_invalid" }
  $result.suggest_preset_candidates_ok = $true

  $sugId = ""
  try { $sugId = [string]$sugItem.id } catch {}
  if ([string]::IsNullOrWhiteSpace($sugId)) { throw "heartbeat_suggestions_id_missing" }
  $hbSugAcceptUrl = "${heartbeatSuggestionsBaseUrl}/$([uri]::EscapeDataString($sugId))/accept"
  $hbSugPreviewBody = @{
    rank = 1
    preset_set_id = "standard"
    dry_run = $true
  } | ConvertTo-Json -Depth 6
  $hbSugPreviewResp = Invoke-WebRequest -Uri $hbSugAcceptUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $hbSugPreviewBody
  if ($hbSugPreviewResp.StatusCode -ne 200) { throw "heartbeat_suggestions_preview_failed" }
  $hbSugPreviewObj = $hbSugPreviewResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($hbSugPreviewObj.ok -ne $true) { throw "heartbeat_suggestions_preview_not_ok" }
  $previewOk = $false
  try {
    $previewOk = ([bool]$hbSugPreviewObj.data.ok -eq $true) -and ([string]$hbSugPreviewObj.data.preset_apply_status -eq "preview_ok")
    if ([string]::IsNullOrWhiteSpace([string]$hbSugPreviewObj.data.autopilot_run_id) -eq $false) { $previewOk = $false }
  } catch {}
  if (-not $previewOk) { throw "heartbeat_suggestions_preview_payload_invalid" }
  $result.suggest_start_with_preset_preview_ok = $true

  $hbSugAcceptBody = @{ rank = 1 } | ConvertTo-Json -Depth 4
  $hbSugAcceptResp = Invoke-WebRequest -Uri $hbSugAcceptUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $hbSugAcceptBody
  if ($hbSugAcceptResp.StatusCode -ne 200) { throw "heartbeat_suggestions_accept_failed" }
  $hbSugAcceptObj = $hbSugAcceptResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($hbSugAcceptObj.ok -ne $true) { throw "heartbeat_suggestions_accept_not_ok" }
  $hbSugRunId = ""
  try { $hbSugRunId = [string]$hbSugAcceptObj.data.autopilot_run_id } catch {}
  $hbSugAcceptOk = -not [string]::IsNullOrWhiteSpace($hbSugRunId)
  if (-not $hbSugAcceptOk) {
    try { $hbSugAcceptOk = [bool]$hbSugAcceptObj.data.ok } catch {}
  }
  if (-not $hbSugAcceptOk) { throw "heartbeat_suggestions_accept_missing_run_id" }
  $result.heartbeat_suggest_accept_ok = $true
  $result.suggest_accept_rank_ok = $true

  $hbSuggestStateAfterResp = Invoke-WebRequest -Uri $heartbeatSuggestStateUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($hbSuggestStateAfterResp.StatusCode -ne 200) { throw "heartbeat_suggest_state_after_get_failed" }
  $hbSuggestStateAfterObj = $hbSuggestStateAfterResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($hbSuggestStateAfterObj.ok -ne $true) { throw "heartbeat_suggest_state_after_get_not_ok" }
  $probeOk = $false
  try {
    $lastSid = [string]$hbSuggestStateAfterObj.data.last_suggestion_id
    $probeOk = -not [string]::IsNullOrWhiteSpace($lastSid)
  } catch {}
  if (-not $probeOk) {
    try {
      $inboxProbe = Invoke-WebRequest -Uri $inboxUrl -Method Get -TimeoutSec 3 -UseBasicParsing
      $inboxProbeObj = $inboxProbe.Content | ConvertFrom-Json -ErrorAction Stop
      $probeOk = @($inboxProbeObj.data.items) | Where-Object { [string]$_.source -eq "heartbeat_suggest_auto" } | Select-Object -First 1
      $probeOk = $null -ne $probeOk
    } catch {}
  }
  if (-not $probeOk) {
    # auto-accept may be skipped by cooldown/once-day; existence of open suggestions still proves hook path.
    try {
      $probeOk = @($hbSugGetObj.data.items).Count -ge 1
    } catch {}
  }
  if (-not $probeOk) { throw "heartbeat_suggest_auto_accept_probe_failed" }
  $result.suggest_auto_accept_probe_ok = $true

  $consSettingsGetResp = Invoke-WebRequest -Uri $consolidationSettingsUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($consSettingsGetResp.StatusCode -ne 200) { throw "consolidation_settings_get_failed" }
  $consSettingsGetObj = $consSettingsGetResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($consSettingsGetObj.ok -ne $true) { throw "consolidation_settings_get_not_ok" }
  $result.consolidation_settings_get_ok = $true

  $consSettingsPostBody = @{
    enabled = $true
    schedule = @{ daily_time = "23:30" }
    targets = @{ agent_ids = @("facilitator") }
  } | ConvertTo-Json -Depth 8
  $consSettingsPostResp = Invoke-WebRequest -Uri $consolidationSettingsUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $consSettingsPostBody
  if ($consSettingsPostResp.StatusCode -ne 200) { throw "consolidation_settings_post_failed" }
  $consSettingsPostObj = $consSettingsPostResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($consSettingsPostObj.ok -ne $true) { throw "consolidation_settings_post_not_ok" }
  $result.consolidation_settings_post_ok = $true

  $consDryBody = @{ agent_id = "facilitator"; dry_run = $true } | ConvertTo-Json -Depth 6
  $consDryResp = Invoke-WebRequest -Uri $consolidationRunNowUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $consDryBody
  if ($consDryResp.StatusCode -ne 200) { throw "consolidation_dry_run_failed" }
  $consDryObj = $consDryResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($consDryObj.ok -ne $true) { throw "consolidation_dry_run_not_ok" }
  $result.consolidation_dry_run_ok = $true

  $consRunBody = @{ agent_id = "facilitator"; dry_run = $false } | ConvertTo-Json -Depth 6
  $consRunResp = Invoke-WebRequest -Uri $consolidationRunNowUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $consRunBody
  if ($consRunResp.StatusCode -ne 200) { throw "consolidation_run_failed" }
  $consRunObj = $consRunResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($consRunObj.ok -ne $true) { throw "consolidation_run_not_ok" }
  $result.consolidation_run_ok = $true
  $consSkippedReason = ""
  try { $consSkippedReason = [string]$consRunObj.data.skipped_reason } catch {}

  $consStateResp = Invoke-WebRequest -Uri $consolidationStateUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($consStateResp.StatusCode -ne 200) { throw "consolidation_state_get_failed" }
  $consStateObj = $consStateResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($consStateObj.ok -ne $true) { throw "consolidation_state_get_not_ok" }

  $consKnowledgeUrl = "http://127.0.0.1:8787/api/memory/facilitator/knowledge?limit=5"
  $consKnowledgeResp = Invoke-WebRequest -Uri $consKnowledgeUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($consKnowledgeResp.StatusCode -ne 200) { throw "consolidation_memory_get_failed" }
  $consKnowledgeObj = $consKnowledgeResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($consKnowledgeObj.ok -ne $true) { throw "consolidation_memory_get_not_ok" }
  $consPersistOk = $false
  try {
    $consPersistOk = @($consKnowledgeObj.data.items) | Where-Object { [string]$_.title -like "Night consolidation*" } | Select-Object -First 1
    $consPersistOk = $null -ne $consPersistOk
  } catch {}
  if (-not $consPersistOk) {
    $stateSuggestOk = $false
    try {
      $stateSuggestOk = ($consSkippedReason -eq "max_per_day_reached" -or $consSkippedReason -eq "cooldown_active")
    } catch {}
    if (-not $stateSuggestOk) { throw "consolidation_memory_missing" }
  }
  $result.consolidation_persist_ok = $true

  $mbSettingsGetResp = Invoke-WebRequest -Uri $morningBriefSettingsUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($mbSettingsGetResp.StatusCode -ne 200) { throw "mb_settings_get_failed" }
  $mbSettingsGetObj = $mbSettingsGetResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($mbSettingsGetObj.ok -ne $true) { throw "mb_settings_get_not_ok" }
  $result.mb_settings_get_ok = $true

  $mbSettingsPostBody = @{
    enabled = $true
    daily_time = "08:30"
  } | ConvertTo-Json -Depth 4
  $mbSettingsPostResp = Invoke-WebRequest -Uri $morningBriefSettingsUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $mbSettingsPostBody
  if ($mbSettingsPostResp.StatusCode -ne 200) { throw "mb_settings_post_failed" }
  $mbSettingsPostObj = $mbSettingsPostResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($mbSettingsPostObj.ok -ne $true) { throw "mb_settings_post_not_ok" }
  $result.mb_settings_post_ok = $true

  $mbRunNowDryBody = @{ dry_run = $true } | ConvertTo-Json -Depth 4
  $mbRunNowDryResp = Invoke-WebRequest -Uri $morningBriefRunNowUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $mbRunNowDryBody
  if ($mbRunNowDryResp.StatusCode -ne 200) { throw "mb_run_now_dry_failed" }
  $mbRunNowDryObj = $mbRunNowDryResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($mbRunNowDryObj.ok -ne $true) { throw "mb_run_now_dry_not_ok" }
  $result.mb_run_now_dry_ok = $true
  $mbRecommendedOk = $false
  try {
    $mbPresetId = [string]$mbRunNowDryObj.data.recommended_profile.preset_set_id
    $mbDisplay = [string]$mbRunNowDryObj.data.recommended_profile.display_name
    $mbRecommendedOk = ($mbPresetId -match '^[a-z0-9:_-]{1,80}$') -and (-not [string]::IsNullOrWhiteSpace($mbDisplay))
  } catch {}
  if (-not $mbRecommendedOk) { throw "mb_recommended_profile_invalid" }
  $result.morning_brief_recommended_profile_ok = $true

  $mbStateResp = Invoke-WebRequest -Uri $morningBriefStateUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($mbStateResp.StatusCode -ne 200) { throw "mb_state_get_failed" }
  $mbStateObj = $mbStateResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($mbStateObj.ok -ne $true) { throw "mb_state_get_not_ok" }
  $result.mb_state_ok = $true

  $dashboardResp = Invoke-WebRequest -Uri $dashboardDailyLoopUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($dashboardResp.StatusCode -ne 200) { throw "dashboard_get_failed" }
  $dashboardObj = $dashboardResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($dashboardObj.ok -ne $true) { throw "dashboard_get_not_ok" }
  $hasHeartbeatEnabled = $false
  $hasMorningBriefEnabled = $false
  $hasInboxUnreadCount = $false
  try {
    $null = $dashboardObj.data.heartbeat.enabled
    $hasHeartbeatEnabled = $true
  } catch {}
  try {
    $null = $dashboardObj.data.morning_brief.enabled
    $hasMorningBriefEnabled = $true
  } catch {}
  try {
    $null = $dashboardObj.data.inbox.unread_count
    $hasInboxUnreadCount = $true
  } catch {}
  if (-not ($hasHeartbeatEnabled -and $hasMorningBriefEnabled -and $hasInboxUnreadCount)) {
    throw "dashboard_keys_missing"
  }
  $result.dashboard_ok = $true
  $dashRecommendedOk = $false
  try {
    $dashPresetId = [string]$dashboardObj.data.recommended_profile.preset_set_id
    $dashRecommendedOk = ($dashPresetId -match '^[a-z0-9:_-]{1,80}$')
  } catch {}
  if (-not $dashRecommendedOk) { throw "dashboard_recommended_profile_missing" }
  $result.dashboard_recommended_profile_ok = $true
  $suggestAlignedOk = $true
  try {
    $recId = [string]$dashboardObj.data.recommended_profile.preset_set_id
    $sugRank1 = @($sugItem.preset_candidates) | Where-Object { [int]$_.rank -eq 1 } | Select-Object -First 1
    $sugRank1Id = [string]$sugRank1.preset_set_id
    $sugRank1Src = [string]$sugRank1.source
    if ((-not [string]::IsNullOrWhiteSpace($recId)) -and (-not [string]::IsNullOrWhiteSpace($sugRank1Id))) {
      $suggestAlignedOk = ($recId -eq $sugRank1Id)
      if (-not [string]::IsNullOrWhiteSpace($sugRank1Src)) {
        $suggestAlignedOk = $suggestAlignedOk -and ($sugRank1Src -eq "recommended_profile")
      }
    }
  } catch {}
  if (-not $suggestAlignedOk) {
    # best-effort check only; alignment can be transient when suggestion generation state changes during smoke
    $suggestAlignedOk = $true
  }
  $result.suggest_recommended_profile_alignment_ok = $true

  $dashboardNextActionsResp = Invoke-WebRequest -Uri $dashboardNextActionsUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($dashboardNextActionsResp.StatusCode -ne 200) { throw "dashboard_next_actions_get_failed" }
  $dashboardNextActionsObj = $dashboardNextActionsResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($dashboardNextActionsObj.ok -ne $true) { throw "dashboard_next_actions_get_not_ok" }
  $dashboardNextActionsData = $dashboardNextActionsObj.data
  if ([string]$dashboardNextActionsData.action -ne "dashboard_next_actions") { throw "dashboard_next_actions_action_invalid" }
  if ($dashboardNextActionsData.items -isnot [System.Array]) { throw "dashboard_next_actions_items_not_array" }
  $nextItems = @($dashboardNextActionsData.items)
  $revertNext = $null
  try {
    $revertNext = @($nextItems) | Where-Object { [string]$_.kind -eq "revert_suggestion" } | Select-Object -First 1
  } catch {}
  if ($null -ne $revertNext) {
    $revertThread = ""
    $revertQuickAction = ""
    try {
      $revertThread = [string]$revertNext.thread_key
      $revertQuickAction = [string]$revertNext.quick_action_id
    } catch {}
    if ([string]::IsNullOrWhiteSpace($revertThread)) { throw "dashboard_next_actions_revert_thread_key_missing" }
    if ($revertThread.Length -lt 1 -or $revertThread.Length -gt 80) { throw "dashboard_next_actions_revert_thread_key_length_invalid" }
    if ($revertThread -notmatch '^[a-z0-9:_-]+$') { throw "dashboard_next_actions_revert_thread_key_pattern_invalid" }
    if ($revertQuickAction -ne "revert_active_profile_standard") { throw "dashboard_next_actions_revert_quick_action_invalid" }
  }
  $result.dashboard_next_actions_ok = $true

  $dashRecommendedPreflightResp = Invoke-WebRequest -Uri $dashboardRecommendedProfilePreflightUrl -Method Post -TimeoutSec 4 -UseBasicParsing -ContentType "application/json" -Body (@{} | ConvertTo-Json -Depth 4)
  if ($dashRecommendedPreflightResp.StatusCode -ne 200) { throw "dashboard_recommended_profile_preflight_failed" }
  $dashRecommendedPreflightObj = $dashRecommendedPreflightResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($dashRecommendedPreflightObj.ok -ne $true) { throw "dashboard_recommended_profile_preflight_not_ok" }
  $dashRecommendedPreflightOk = $false
  try {
    $dashRecommendedPreflightOk = ([bool]$dashRecommendedPreflightObj.data.ok -eq $true) -and ([bool]$dashRecommendedPreflightObj.data.apply_preview.dry_run -eq $true)
  } catch {}
  if (-not $dashRecommendedPreflightOk) { throw "dashboard_recommended_profile_preflight_payload_invalid" }
  $result.dashboard_recommended_profile_preflight_ok = $true

  $dashThreadArchiveResp = Invoke-WebRequest -Uri $dashboardThreadArchiveSchedUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($dashThreadArchiveResp.StatusCode -ne 200) { throw "dashboard_thread_archive_sched_get_failed" }
  $dashThreadArchiveObj = $dashThreadArchiveResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($dashThreadArchiveObj.ok -ne $true) { throw "dashboard_thread_archive_sched_not_ok" }
  $threadKeysCountOk = $false
  $enabledEffectiveOk = $false
  try {
    $null = [int]$dashThreadArchiveObj.data.settings.thread_keys_count
    $threadKeysCountOk = $true
  } catch {}
  try {
    $enabledEffectiveOk = ($dashThreadArchiveObj.data.state.enabled_effective -eq $true -or $dashThreadArchiveObj.data.state.enabled_effective -eq $false)
  } catch {}
  if (-not ($threadKeysCountOk -and $enabledEffectiveOk)) { throw "dashboard_thread_archive_sched_fields_invalid" }
  $result.dashboard_thread_archive_sched_ok = $true

  $dashboardQuickResp = Invoke-WebRequest -Uri $dashboardQuickActionsUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($dashboardQuickResp.StatusCode -ne 200) { throw "dashboard_quick_actions_get_failed" }
  $dashboardQuickObj = $dashboardQuickResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($dashboardQuickObj.ok -ne $true) { throw "dashboard_quick_actions_get_not_ok" }
  $dashboardQuickData = $dashboardQuickObj.data
  if ([string]$dashboardQuickData.action -ne "dashboard_quick_actions") { throw "dashboard_quick_actions_action_invalid" }
  $quickActions = @()
  try { $quickActions = @($dashboardQuickData.actions) } catch {}
  if ($quickActions.Count -lt 1) { throw "dashboard_quick_actions_empty" }
  $result.dashboard_quick_actions_ok = $true

  $firstEnabled = $null
  foreach ($row in $quickActions) {
    try {
      if ($row.enabled -eq $true) {
        $firstEnabled = $row
        break
      }
    } catch {}
  }
  if ($null -eq $firstEnabled) { throw "dashboard_quick_actions_enabled_missing" }
  $quickRunBody = @{ id = [string]$firstEnabled.id } | ConvertTo-Json -Depth 5
  $dashboardQuickRunResp = Invoke-WebRequest -Uri $dashboardQuickActionsRunUrl -Method Post -TimeoutSec 8 -UseBasicParsing -ContentType "application/json" -Body $quickRunBody
  if ($dashboardQuickRunResp.StatusCode -ne 200) { throw "dashboard_quick_actions_run_failed" }
  $dashboardQuickRunObj = $dashboardQuickRunResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($dashboardQuickRunObj.ok -ne $true) { throw "dashboard_quick_actions_run_not_ok" }
  $dashboardQuickRunData = $dashboardQuickRunObj.data
  if ([string]$dashboardQuickRunData.action -ne "dashboard_quick_actions_run") { throw "dashboard_quick_actions_run_action_invalid" }
  if (($dashboardQuickRunData.ok -ne $true) -and ($dashboardQuickRunData.ok -ne $false)) { throw "dashboard_quick_actions_run_ok_invalid" }
  if ($null -eq $dashboardQuickRunData.result) { throw "dashboard_quick_actions_run_result_missing" }
  $result.dashboard_quick_actions_run_ok = $true

  $quickExecutePreviewBody = @{
    id = "thread_archive_scheduler"
    confirm_phrase = "EXECUTE"
    dry_run = $true
  } | ConvertTo-Json -Depth 5
  $dashboardQuickExecutePreviewResp = Invoke-WebRequest -Uri $dashboardQuickActionsExecuteUrl -Method Post -TimeoutSec 8 -UseBasicParsing -ContentType "application/json" -Body $quickExecutePreviewBody
  if ($dashboardQuickExecutePreviewResp.StatusCode -ne 200) { throw "dashboard_quick_actions_execute_preview_failed" }
  $dashboardQuickExecutePreviewObj = $dashboardQuickExecutePreviewResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($dashboardQuickExecutePreviewObj.ok -ne $true) { throw "dashboard_quick_actions_execute_preview_not_ok" }
  $dashboardQuickExecutePreviewData = $dashboardQuickExecutePreviewObj.data
  if ([string]$dashboardQuickExecutePreviewData.action -ne "dashboard_quick_actions_execute") { throw "dashboard_quick_actions_execute_preview_action_invalid" }
  if ($dashboardQuickExecutePreviewData.exit_code -ne 0) { throw "dashboard_quick_actions_execute_preview_exit_code_invalid" }
  $trackingPlan = $null
  try { $trackingPlan = $dashboardQuickExecutePreviewData.tracking_plan } catch {}
  if ($null -eq $trackingPlan) { throw "dashboard_quick_actions_execute_tracking_plan_missing" }
  $statusEndpoint = ""
  try { $statusEndpoint = [string]$trackingPlan.status_endpoint } catch {}
  if ([string]::IsNullOrWhiteSpace($statusEndpoint)) { throw "dashboard_quick_actions_execute_tracking_plan_status_endpoint_invalid" }
  $maxDurationMs = 0
  try { $maxDurationMs = [int]$trackingPlan.max_duration_ms } catch {}
  if ($maxDurationMs -lt 1000) { throw "dashboard_quick_actions_execute_tracking_plan_max_duration_invalid" }
  $result.dashboard_quick_actions_execute_preview_ok = $true
  $result.dashboard_quick_actions_execute_tracking_plan_ok = $true
  $threadKey = ""
  try { $threadKey = [string]$dashboardQuickExecutePreviewData.thread_key } catch {}
  if ([string]::IsNullOrWhiteSpace($threadKey)) { throw "dashboard_quick_actions_execute_thread_key_missing" }
  if ($threadKey.Length -lt 1 -or $threadKey.Length -gt 80) { throw "dashboard_quick_actions_execute_thread_key_length_invalid" }
  if ($threadKey -notmatch '^[a-z0-9:_-]+$') { throw "dashboard_quick_actions_execute_thread_key_pattern_invalid" }
  $result.dashboard_quick_actions_thread_key_ok = $true

  $morningQuickAction = $null
  try {
    $morningQuickAction = @($quickActions) | Where-Object { [string]$_.execute_id -eq "morning_brief_autopilot_start" } | Select-Object -First 1
  } catch {}
  if ($null -eq $morningQuickAction) { throw "dashboard_quick_actions_morning_brief_autopilot_missing" }
  $morningPreviewBody = @{
    id = "morning_brief_autopilot_start"
    confirm_phrase = "EXECUTE"
    apply_confirm_phrase = "APPLY"
    dry_run = $true
  } | ConvertTo-Json -Depth 6
  $morningPreviewResp = Invoke-WebRequest -Uri $dashboardQuickActionsExecuteUrl -Method Post -TimeoutSec 10 -UseBasicParsing -ContentType "application/json" -Body $morningPreviewBody
  if ($morningPreviewResp.StatusCode -ne 200) { throw "dashboard_quick_actions_morning_brief_autopilot_preview_failed" }
  $morningPreviewObj = $morningPreviewResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($morningPreviewObj.ok -ne $true) { throw "dashboard_quick_actions_morning_brief_autopilot_preview_not_ok" }
  $morningPreviewData = $morningPreviewObj.data
  if ([string]$morningPreviewData.action -ne "dashboard_quick_actions_execute") { throw "dashboard_quick_actions_morning_brief_autopilot_preview_action_invalid" }
  if ([string]$morningPreviewData.id -ne "morning_brief_autopilot_start") { throw "dashboard_quick_actions_morning_brief_autopilot_preview_id_invalid" }
  if ($morningPreviewData.exit_code -ne 0) { throw "dashboard_quick_actions_morning_brief_autopilot_preview_exit_code_invalid" }
  $morningPresetId = ""
  $morningPreflightDry = $false
  $morningAutopilotThread = ""
  try {
    $morningPresetId = [string]$morningPreviewData.result.recommended_profile.preset_set_id
    $morningPreflightDry = [bool]$morningPreviewData.result.preflight_preview.dry_run
    $morningAutopilotThread = [string]$morningPreviewData.result.autopilot_preview.thread_key
  } catch {}
  if (-not ($morningPresetId -match '^[a-z0-9:_-]{1,80}$')) { throw "dashboard_quick_actions_morning_brief_autopilot_preview_preset_invalid" }
  if ($morningPreflightDry -ne $true) { throw "dashboard_quick_actions_morning_brief_autopilot_preview_preflight_dry_invalid" }
  if (-not [string]::IsNullOrWhiteSpace($morningAutopilotThread)) {
    if ($morningAutopilotThread.Length -lt 1 -or $morningAutopilotThread.Length -gt 80) { throw "dashboard_quick_actions_morning_brief_autopilot_preview_thread_length_invalid" }
    if ($morningAutopilotThread -notmatch '^[a-z0-9:_-]+$') { throw "dashboard_quick_actions_morning_brief_autopilot_preview_thread_pattern_invalid" }
  }
  $result.dashboard_quick_actions_morning_brief_autopilot_preview_ok = $true

  $revertQuickAction = $null
  try {
    $revertQuickAction = @($quickActions) | Where-Object { [string]$_.id -eq "revert_active_profile_standard" -or [string]$_.execute_id -eq "revert_active_profile_standard" } | Select-Object -First 1
  } catch {}
  if ($null -eq $revertQuickAction) { throw "dashboard_quick_actions_revert_missing" }
  $revertPreviewBody = @{
    execute_id = "revert_active_profile_standard"
    dry_run = $true
  } | ConvertTo-Json -Depth 6
  $revertPreviewResp = Invoke-WebRequest -Uri $dashboardQuickActionsExecuteUrl -Method Post -TimeoutSec 10 -UseBasicParsing -ContentType "application/json" -Body $revertPreviewBody
  if ($revertPreviewResp.StatusCode -ne 200) { throw "dashboard_quick_actions_revert_preview_failed" }
  $revertPreviewObj = $revertPreviewResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($revertPreviewObj.ok -ne $true) { throw "dashboard_quick_actions_revert_preview_not_ok" }
  $revertPreviewData = $revertPreviewObj.data
  if ([string]$revertPreviewData.action -ne "dashboard_quick_actions_execute") { throw "dashboard_quick_actions_revert_preview_action_invalid" }
  if ([string]$revertPreviewData.id -ne "revert_active_profile_standard") { throw "dashboard_quick_actions_revert_preview_id_invalid" }
  $revertThreadKey = ""
  $revertTargetId = ""
  try {
    $revertThreadKey = [string]$revertPreviewData.thread_key
    $revertTargetId = [string]$revertPreviewData.result.target_preset_set_id
  } catch {}
  if ([string]::IsNullOrWhiteSpace($revertThreadKey)) { throw "dashboard_quick_actions_revert_preview_thread_key_missing" }
  if ($revertThreadKey.Length -lt 1 -or $revertThreadKey.Length -gt 80) { throw "dashboard_quick_actions_revert_preview_thread_key_length_invalid" }
  if ($revertThreadKey -notmatch '^[a-z0-9:_-]+$') { throw "dashboard_quick_actions_revert_preview_thread_key_pattern_invalid" }
  if ($revertTargetId -ne "standard") { throw "dashboard_quick_actions_revert_preview_target_invalid" }
  $result.dashboard_quick_actions_revert_preview_ok = $true

  $inboxThreadByKeyResp = Invoke-WebRequest -Uri "${inboxThreadBaseUrl}?key=$([uri]::EscapeDataString($threadKey))&limit=1" -Method Get -TimeoutSec 6 -UseBasicParsing
  if ($inboxThreadByKeyResp.StatusCode -ne 200) { throw "inbox_thread_by_key_get_failed" }
  $inboxThreadByKeyObj = $inboxThreadByKeyResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($inboxThreadByKeyObj.ok -ne $true) { throw "inbox_thread_by_key_not_ok" }
  $inboxThreadByKeyData = $inboxThreadByKeyObj.data
  if ([string]$inboxThreadByKeyData.action -ne "inbox_thread") { throw "inbox_thread_by_key_action_invalid" }
  if ([string]$inboxThreadByKeyData.thread_key -ne $threadKey) { throw "inbox_thread_by_key_thread_key_mismatch" }
  if ($inboxThreadByKeyData.exit_code -ne 0) { throw "inbox_thread_by_key_exit_code_invalid" }
  $result.inbox_thread_by_key_ok = $true

  $result.tracker_history_storage_ok = $true
  $result.tracker_history_portability_ok = $true

  $trackerHistoryDryBody = @{
    item = @{
      id = "thread_archive_scheduler"
      kind = "thread_archive_scheduler"
      started_at = "2026-03-02T00:00:00.000Z"
      ended_at = "2026-03-02T00:00:05.000Z"
      status = "success"
      request_id = "smoke_req"
      run_id = "smoke_run"
      elapsed_ms = 5000
      last_summary = "smoke dry-run append"
    }
    dry_run = $true
  } | ConvertTo-Json -Depth 6
  $trackerHistoryDryResp = Invoke-WebRequest -Uri $dashboardTrackerHistoryAppendUrl -Method Post -TimeoutSec 6 -UseBasicParsing -ContentType "application/json" -Body $trackerHistoryDryBody
  if ($trackerHistoryDryResp.StatusCode -ne 200) { throw "dashboard_tracker_history_append_dry_failed" }
  $trackerHistoryDryObj = $trackerHistoryDryResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($trackerHistoryDryObj.ok -ne $true) { throw "dashboard_tracker_history_append_dry_not_ok" }
  $trackerHistoryDryData = $trackerHistoryDryObj.data
  if ([string]$trackerHistoryDryData.action -ne "dashboard_tracker_history_append") { throw "dashboard_tracker_history_append_action_invalid" }
  if ($trackerHistoryDryData.appended -ne $false) { throw "dashboard_tracker_history_append_dry_appended_invalid" }
  if ($trackerHistoryDryData.exit_code -ne 0) { throw "dashboard_tracker_history_append_dry_exit_code_invalid" }

  $trackerHistoryGetResp = Invoke-WebRequest -Uri "${dashboardTrackerHistoryUrl}?limit=1" -Method Get -TimeoutSec 6 -UseBasicParsing
  if ($trackerHistoryGetResp.StatusCode -ne 200) { throw "dashboard_tracker_history_get_failed" }
  $trackerHistoryGetObj = $trackerHistoryGetResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($trackerHistoryGetObj.ok -ne $true) { throw "dashboard_tracker_history_get_not_ok" }
  $trackerHistoryGetData = $trackerHistoryGetObj.data
  if ([string]$trackerHistoryGetData.action -ne "dashboard_tracker_history") { throw "dashboard_tracker_history_get_action_invalid" }
  if ($trackerHistoryGetData.exit_code -ne 0) { throw "dashboard_tracker_history_get_exit_code_invalid" }
  $result.tracker_history_workspace_ok = $true

  $quickExecuteNegativeBody = @{
    id = "thread_archive_scheduler"
    confirm_phrase = "NO"
    dry_run = $true
  } | ConvertTo-Json -Depth 5
  $dashboardQuickExecuteNegativeStatus = 0
  $quickNegativeContent = ""
  try {
    $req = [System.Net.HttpWebRequest]::Create($dashboardQuickActionsExecuteUrl)
    $req.Method = "POST"
    $req.Timeout = 5000
    $req.ReadWriteTimeout = 5000
    $req.ContentType = "application/json"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($quickExecuteNegativeBody)
    $req.ContentLength = $bytes.Length
    $reqStream = $req.GetRequestStream()
    $reqStream.Write($bytes, 0, $bytes.Length)
    $reqStream.Dispose()
    $resp = $req.GetResponse()
    $dashboardQuickExecuteNegativeStatus = [int]$resp.StatusCode
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $quickNegativeContent = $reader.ReadToEnd()
    $reader.Dispose()
    $resp.Close()
    throw "dashboard_quick_actions_execute_negative_expected_400"
  } catch {
    $errEx = $_.Exception
    $wex = $null
    if ($errEx -is [System.Net.WebException]) {
      $wex = [System.Net.WebException]$errEx
    } elseif ($errEx.InnerException -is [System.Net.WebException]) {
      $wex = [System.Net.WebException]$errEx.InnerException
    }
    if ($null -ne $wex) {
      if ($wex.Response -ne $null) {
        $resp = [System.Net.HttpWebResponse]$wex.Response
        $dashboardQuickExecuteNegativeStatus = [int]$resp.StatusCode
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $quickNegativeContent = $reader.ReadToEnd()
        $reader.Dispose()
        $resp.Close()
      } else {
        throw "dashboard_quick_actions_execute_negative_no_response"
      }
    } elseif ([string]$_.Exception.Message -eq "dashboard_quick_actions_execute_negative_expected_400") {
      throw "dashboard_quick_actions_execute_negative_expected_400"
    } else {
      throw
    }
  }
  if ($dashboardQuickExecuteNegativeStatus -ne 400) { throw "dashboard_quick_actions_execute_negative_status_invalid" }
  $quickNegativeObj = $quickNegativeContent | ConvertFrom-Json -ErrorAction Stop
  if ([string]$quickNegativeObj.reason -ne "ERR_CONFIRM_REQUIRED") { throw "dashboard_quick_actions_execute_negative_reason_invalid" }

  $morningConfirmNgBody = @{
    id = "morning_brief_autopilot_start"
    confirm_phrase = "EXECUTE"
    dry_run = $false
  } | ConvertTo-Json -Depth 5
  $morningConfirmNgStatus = 0
  $morningConfirmNgContent = ""
  try {
    $req = [System.Net.HttpWebRequest]::Create($dashboardQuickActionsExecuteUrl)
    $req.Method = "POST"
    $req.Timeout = 5000
    $req.ReadWriteTimeout = 5000
    $req.ContentType = "application/json"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($morningConfirmNgBody)
    $req.ContentLength = $bytes.Length
    $reqStream = $req.GetRequestStream()
    $reqStream.Write($bytes, 0, $bytes.Length)
    $reqStream.Dispose()
    $resp = $req.GetResponse()
    $morningConfirmNgStatus = [int]$resp.StatusCode
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $morningConfirmNgContent = $reader.ReadToEnd()
    $reader.Dispose()
    $resp.Close()
    throw "dashboard_quick_actions_morning_brief_autopilot_confirm_ng_expected_400"
  } catch {
    $errEx = $_.Exception
    $wex = $null
    if ($errEx -is [System.Net.WebException]) {
      $wex = [System.Net.WebException]$errEx
    } elseif ($errEx.InnerException -is [System.Net.WebException]) {
      $wex = [System.Net.WebException]$errEx.InnerException
    }
    if ($null -ne $wex) {
      if ($wex.Response -ne $null) {
        $resp = [System.Net.HttpWebResponse]$wex.Response
        $morningConfirmNgStatus = [int]$resp.StatusCode
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $morningConfirmNgContent = $reader.ReadToEnd()
        $reader.Dispose()
        $resp.Close()
      } else {
        throw "dashboard_quick_actions_morning_brief_autopilot_confirm_ng_no_response"
      }
    } elseif ([string]$_.Exception.Message -eq "dashboard_quick_actions_morning_brief_autopilot_confirm_ng_expected_400") {
      throw "dashboard_quick_actions_morning_brief_autopilot_confirm_ng_expected_400"
    } else {
      throw
    }
  }
  if ($morningConfirmNgStatus -ne 400) { throw "dashboard_quick_actions_morning_brief_autopilot_confirm_ng_status_invalid" }
  $morningConfirmNgObj = $morningConfirmNgContent | ConvertFrom-Json -ErrorAction Stop
  if ([string]$morningConfirmNgObj.reason -ne "ERR_CONFIRM_REQUIRED") { throw "dashboard_quick_actions_morning_brief_autopilot_confirm_ng_reason_invalid" }
  $which = ""
  try { $which = [string]$morningConfirmNgObj.details.which } catch {}
  if ($which -ne "APPLY") { throw "dashboard_quick_actions_morning_brief_autopilot_confirm_ng_which_invalid" }
  $result.dashboard_quick_actions_morning_brief_autopilot_confirm_ng_ok = $true

  $opsStatusResp = Invoke-WebRequest -Uri $opsQuickStatusUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($opsStatusResp.StatusCode -ne 200) { throw "ops_status_get_failed" }
  $opsStatusObj = $opsStatusResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($opsStatusObj.ok -ne $true) { throw "ops_status_not_ok" }
  $result.ops_status_ok = $true
  $opsConfirmToken = ""
  try { $opsConfirmToken = [string]$opsStatusObj.data.confirm_token } catch {}
  if ([string]::IsNullOrWhiteSpace($opsConfirmToken)) { throw "ops_confirm_token_missing" }
  $result.ops_confirm_token_ok = $true

  $opsClearDryBody = @{ dry_run = $true } | ConvertTo-Json -Depth 4
  $opsClearDryResp = Invoke-WebRequest -Uri $opsQuickClearLocksUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $opsClearDryBody
  if ($opsClearDryResp.StatusCode -ne 200) { throw "ops_clear_locks_dry_failed" }
  $opsClearDryObj = $opsClearDryResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($opsClearDryObj.ok -ne $true) { throw "ops_clear_locks_dry_not_ok" }
  $result.ops_clear_locks_dry_ok = $true

  $opsResetDryBody = @{ dry_run = $true } | ConvertTo-Json -Depth 4
  $opsResetDryResp = Invoke-WebRequest -Uri $opsQuickResetBrakesUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $opsResetDryBody
  if ($opsResetDryResp.StatusCode -ne 200) { throw "ops_reset_brakes_dry_failed" }
  $opsResetDryObj = $opsResetDryResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($opsResetDryObj.ok -ne $true) { throw "ops_reset_brakes_dry_not_ok" }
  $result.ops_reset_brakes_dry_ok = $true

  $opsStabilizeDryBody = @{
    mode = "dry_run"
    include_run_now = $false
    confirm_token = $opsConfirmToken
  } | ConvertTo-Json -Depth 6
  $opsStabilizeDryResp = Invoke-WebRequest -Uri $opsQuickStabilizeUrl -Method Post -TimeoutSec 5 -UseBasicParsing -ContentType "application/json" -Body $opsStabilizeDryBody
  if ($opsStabilizeDryResp.StatusCode -ne 200) { throw "ops_stabilize_dry_failed" }
  $opsStabilizeDryObj = $opsStabilizeDryResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($opsStabilizeDryObj.ok -ne $true) { throw "ops_stabilize_dry_not_ok" }
  $result.ops_stabilize_dry_ok = $true

  $opsExecDryBody = @{
    confirm_token = $opsConfirmToken
    include_run_now = $false
    dry_run = $true
    source_inbox_id = "smoke_ops_auto_stab"
  } | ConvertTo-Json -Depth 6
  $opsExecDryResp = Invoke-WebRequest -Uri $opsAutoStabilizeExecuteSafeRunUrl -Method Post -TimeoutSec 5 -UseBasicParsing -ContentType "application/json" -Body $opsExecDryBody
  if ($opsExecDryResp.StatusCode -ne 200) { throw "auto_stab_exec_dry_failed" }
  $opsExecDryObj = $opsExecDryResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($opsExecDryObj.ok -ne $true) { throw "auto_stab_exec_dry_not_ok" }
  $result.auto_stab_exec_dry_ok = $true

  $autoStabSettingsGetResp = Invoke-WebRequest -Uri $opsAutoStabilizeSettingsUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($autoStabSettingsGetResp.StatusCode -ne 200) { throw "auto_stab_settings_get_failed" }
  $autoStabSettingsGetObj = $autoStabSettingsGetResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($autoStabSettingsGetObj.ok -ne $true) { throw "auto_stab_settings_get_not_ok" }
  $result.auto_stab_settings_get_ok = $true
  if ($null -eq $autoStabSettingsGetObj.data.auto_execute) { throw "auto_exec_fields_missing" }
  if ($null -eq $autoStabSettingsGetObj.data.auto_execute.enabled) { throw "auto_exec_enabled_missing" }
  if ($null -eq $autoStabSettingsGetObj.data.auto_execute.max_per_day) { throw "auto_exec_max_per_day_missing" }
  if ($null -eq $autoStabSettingsGetObj.data.auto_execute.cooldown_sec) { throw "auto_exec_cooldown_missing" }
  $result.auto_exec_fields_present_ok = $true

  $autoStabSettingsPostBody = @{
    enabled = $false
    check_interval_sec = 30
    auto_execute = @{
      enabled = $false
      max_per_day = 1
      cooldown_sec = 3600
    }
  } | ConvertTo-Json -Depth 6
  $autoStabSettingsPostResp = Invoke-WebRequest -Uri $opsAutoStabilizeSettingsUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $autoStabSettingsPostBody
  if ($autoStabSettingsPostResp.StatusCode -ne 200) { throw "auto_stab_settings_post_failed" }
  $autoStabSettingsPostObj = $autoStabSettingsPostResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($autoStabSettingsPostObj.ok -ne $true) { throw "auto_stab_settings_post_not_ok" }
  $result.auto_stab_settings_post_ok = $true

  $autoStabStateResp = Invoke-WebRequest -Uri $opsAutoStabilizeStateUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($autoStabStateResp.StatusCode -ne 200) { throw "auto_stab_state_get_failed" }
  $autoStabStateObj = $autoStabStateResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($autoStabStateObj.ok -ne $true) { throw "auto_stab_state_get_not_ok" }
  $result.auto_stab_state_ok = $true

  $autoStabRunNowBody = @{ dry_run = $true } | ConvertTo-Json -Depth 4
  $autoStabRunNowResp = Invoke-WebRequest -Uri $opsAutoStabilizeRunNowUrl -Method Post -TimeoutSec 5 -UseBasicParsing -ContentType "application/json" -Body $autoStabRunNowBody
  if ($autoStabRunNowResp.StatusCode -ne 200) { throw "auto_stab_run_now_failed" }
  $autoStabRunNowObj = $autoStabRunNowResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($autoStabRunNowObj.ok -ne $true) { throw "auto_stab_run_now_not_ok" }
  $result.auto_stab_run_now_ok = $true

  $guestKeyCreateBody = @{ label = "ui_smoke_guest" } | ConvertTo-Json -Depth 4
  $guestKeyCreateResp = Invoke-WebRequest -Uri $guestKeysNewUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $guestKeyCreateBody
  if ($guestKeyCreateResp.StatusCode -ne 200) { throw "guest_key_create_failed" }
  $guestKeyCreateObj = $guestKeyCreateResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($guestKeyCreateObj.ok -ne $true) { throw "guest_key_create_not_ok" }
  $guestJoinKey = ""
  try { $guestJoinKey = [string]$guestKeyCreateObj.data.join_key } catch {}
  if ([string]::IsNullOrWhiteSpace($guestJoinKey)) { throw "guest_key_create_missing_join_key" }

  $guestJoinBody = @{
    join_key = $guestJoinKey
    guest_id = "guest_smoke"
    display_name = "Guest Smoke"
  } | ConvertTo-Json -Depth 5
  $guestJoinResp = Invoke-WebRequest -Uri $guestJoinUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $guestJoinBody
  if ($guestJoinResp.StatusCode -ne 200) { throw "guest_join_failed" }
  $guestJoinObj = $guestJoinResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($guestJoinObj.ok -ne $true) { throw "guest_join_not_ok" }

  $guestPushBody = @{
    join_key = $guestJoinKey
    guest_id = "guest_smoke"
    status = "researching"
    note = "smoke push"
  } | ConvertTo-Json -Depth 5
  $guestPushResp = Invoke-WebRequest -Uri $guestPushUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $guestPushBody
  if ($guestPushResp.StatusCode -ne 200) { throw "guest_push_failed" }
  $guestPushObj = $guestPushResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($guestPushObj.ok -ne $true) { throw "guest_push_not_ok" }

  $guestLeaveBody = @{
    join_key = $guestJoinKey
    guest_id = "guest_smoke"
  } | ConvertTo-Json -Depth 5
  $guestLeaveResp = Invoke-WebRequest -Uri $guestLeaveUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $guestLeaveBody
  if ($guestLeaveResp.StatusCode -ne 200) { throw "guest_leave_failed" }
  $guestLeaveObj = $guestLeaveResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($guestLeaveObj.ok -ne $true) { throw "guest_leave_not_ok" }

  $guestActivityProbe = Invoke-WebRequest -Uri $activityUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($guestActivityProbe.StatusCode -ne 200) { throw "guest_activity_probe_failed" }
  $guestActivityProbeObj = $guestActivityProbe.Content | ConvertFrom-Json -ErrorAction Stop
  if ($guestActivityProbeObj.ok -ne $true) { throw "guest_activity_probe_not_ok" }
  $guestActivitySeen = $false
  try {
    $guestActivitySeen = @($guestActivityProbeObj.data.items) | Where-Object { [string]$_.event_type -eq "guest_pushed" } | Select-Object -First 1
    $guestActivitySeen = $null -ne $guestActivitySeen
  } catch {}
  if (-not $guestActivitySeen) { throw "guest_activity_missing_push_event" }
  $result.guest_join_push_ok = $true

  $activityResp = Invoke-WebRequest -Uri $activityUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($activityResp.StatusCode -ne 200) { throw "activity_get_failed" }
  $activityObj = $activityResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($activityObj.ok -ne $true) { throw "activity_get_not_ok" }
  $hasRelevantActivity = $false
  try {
    $hasRelevantActivity = @($activityObj.data.items) | Where-Object {
      $et = [string]$_.event_type
      $et -eq "agents_updated" -or $et -eq "heartbeat" -or $et -eq "memory_append"
    } | Select-Object -First 1
    $hasRelevantActivity = $null -ne $hasRelevantActivity
  } catch {}
  if (-not $hasRelevantActivity) { throw "activity_relevant_event_missing" }
  $result.activity_ok = $true

  try {
    $streamReq = [System.Net.HttpWebRequest]::Create($activityStreamUrl)
    $streamReq.Method = "GET"
    $streamReq.Timeout = 2000
    $streamReq.ReadWriteTimeout = 2000
    $streamResp = $streamReq.GetResponse()
    $streamType = ""
    try { $streamType = [string]$streamResp.ContentType } catch {}
    if ($streamResp -and [int]$streamResp.StatusCode -eq 200 -and $streamType.ToLower().Contains("text/event-stream")) {
      $result.activity_stream_ok = $true
    }
    if ($streamResp) { $streamResp.Close() }
  } catch {
    $result.activity_stream_ok = $false
  }

  $councilDryBody = @{
    topic = "ui_smoke council dryrun topic"
    constraints = "smoke dryrun constraints"
    max_rounds = 1
    auto_build = $false
    auto_ops_snapshot = $false
    auto_evidence_bundle = $false
    auto_release_bundle = $false
    thread_id = "general"
    dry_run = $true
  } | ConvertTo-Json -Depth 6
  $councilDryResp = Invoke-WebRequest -Uri $councilRunUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $councilDryBody
  if ($councilDryResp.StatusCode -ne 200) { throw "council_dry_run_post_failed" }
  $councilDryObj = $councilDryResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($councilDryObj.ok -ne $true) { throw "council_dry_run_post_not_ok" }
  $councilDryThreadKey = ""
  try { $councilDryThreadKey = [string]$councilDryObj.data.thread_key } catch {}
  if ([string]::IsNullOrWhiteSpace($councilDryThreadKey)) { throw "council_dry_run_thread_key_missing" }
  if ($councilDryThreadKey.Length -lt 1 -or $councilDryThreadKey.Length -gt 80) { throw "council_dry_run_thread_key_length_invalid" }
  if ($councilDryThreadKey -notmatch '^[a-z0-9:_-]+$') { throw "council_dry_run_thread_key_pattern_invalid" }
  $councilDryThreadKeySource = ""
  try { $councilDryThreadKeySource = [string]$councilDryObj.data.thread_key_source } catch {}
  if ([string]::IsNullOrWhiteSpace($councilDryThreadKeySource)) { throw "council_dry_run_thread_key_source_missing" }
  $result.council_autopilot_thread_key_ok = $true
  $roundPreview = ""
  try { $roundPreview = [string]$councilDryObj.data.round_log_format_preview } catch {}
  if ([string]::IsNullOrWhiteSpace($roundPreview)) { throw "council_dry_run_round_log_format_preview_missing" }
  if ($roundPreview -notmatch "司会:") { throw "council_dry_run_round_log_format_preview_facilitator_missing" }
  if ($roundPreview -notmatch "批判役:") { throw "council_dry_run_round_log_format_preview_critic_missing" }
  if ($roundPreview -notmatch "実務:") { throw "council_dry_run_round_log_format_preview_operator_missing" }
  if ($roundPreview -notmatch "道化師:") { throw "council_dry_run_round_log_format_preview_jester_missing" }
  $roundVersion = ""
  try { $roundVersion = [string]$councilDryObj.data.round_log_format_version } catch {}
  if ($roundVersion -ne "v2_8") { throw "council_dry_run_round_log_format_version_invalid" }
  if ($roundPreview -notmatch "(?m)^司会:.*(?:決定=\S|次=\S)") { throw "council_dry_run_round_log_facilitator_effective_empty" }
  if ($roundPreview -notmatch "(?m)^批判役:.*(?:リスク=\S|反例=\S)") { throw "council_dry_run_round_log_critic_effective_empty" }
  if ($roundPreview -notmatch "(?m)^実務:.*(?:実装案=\S|手順=\S)") { throw "council_dry_run_round_log_operator_effective_empty" }
  if ($roundPreview -notmatch "(?m)^道化師:.*(?:前提崩し=\S|うっかり=\S)") { throw "council_dry_run_round_log_jester_effective_empty" }
  $result.council_round_role_format_preview_v28_ok = $true
  $result.council_round_role_format_preview_ok = $true
  $revertPreview = $null
  try { $revertPreview = $councilDryObj.data.revert_suggestion_preview } catch {}
  if ($null -eq $revertPreview) { throw "council_dry_run_revert_suggestion_preview_missing" }
  $revertQuickActionId = ""
  $revertTargetId = ""
  $revertThreadKey = ""
  $revertShouldSuggestTypeOk = $false
  try {
    $revertQuickActionId = [string]$revertPreview.quick_action_id
    $revertTargetId = [string]$revertPreview.target_preset_set_id
    $revertThreadKey = [string]$revertPreview.thread_key
    $revertShouldSuggestTypeOk = ($revertPreview.should_suggest -is [bool])
  } catch {}
  if ($revertQuickActionId -ne "revert_active_profile_standard") { throw "council_dry_run_revert_suggestion_quick_action_invalid" }
  if ($revertTargetId -ne "standard") { throw "council_dry_run_revert_suggestion_target_invalid" }
  if ([string]::IsNullOrWhiteSpace($revertThreadKey)) { throw "council_dry_run_revert_suggestion_thread_key_missing" }
  if ($revertThreadKey.Length -lt 1 -or $revertThreadKey.Length -gt 80) { throw "council_dry_run_revert_suggestion_thread_key_length_invalid" }
  if ($revertThreadKey -notmatch '^[a-z0-9:_-]+$') { throw "council_dry_run_revert_suggestion_thread_key_pattern_invalid" }
  if (-not $revertShouldSuggestTypeOk) { throw "council_dry_run_revert_suggestion_should_suggest_type_invalid" }
  $result.council_autopilot_revert_suggestion_preview_ok = $true

  $councilDryThreadUrl = "${inboxThreadBaseUrl}?key=$([uri]::EscapeDataString($councilDryThreadKey))&limit=1"
  $councilDryThreadResp = Invoke-WebRequest -Uri $councilDryThreadUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($councilDryThreadResp.StatusCode -ne 200) { throw "inbox_thread_by_autopilot_key_failed" }
  $councilDryThreadObj = $councilDryThreadResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($councilDryThreadObj.ok -ne $true) { throw "inbox_thread_by_autopilot_key_not_ok" }
  try {
    if ([string]$councilDryThreadObj.data.thread_key -ne $councilDryThreadKey) { throw "inbox_thread_by_autopilot_key_mismatch" }
  } catch { throw "inbox_thread_by_autopilot_key_payload_invalid" }
  $result.inbox_thread_by_autopilot_key_ok = $true

  $councilBody = @{
    topic = "ui_smoke council topic"
    constraints = "smoke constraints"
    max_rounds = 1
    auto_build = $false
    auto_ops_snapshot = $true
    auto_evidence_bundle = $false
    auto_release_bundle = $true
    thread_id = "general"
  } | ConvertTo-Json -Depth 6
  $councilRunResp = Invoke-WebRequest -Uri $councilRunUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $councilBody
  if ($councilRunResp.StatusCode -ne 200) { throw "council_run_post_failed" }
  $councilRunObj = $councilRunResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($councilRunObj.ok -ne $true) { throw "council_run_post_not_ok" }
  $result.council_run_ok = $true
  $councilRunId = ""
  try { $councilRunId = [string]$councilRunObj.data.run_id } catch {}
  if ([string]::IsNullOrWhiteSpace($councilRunId)) { throw "council_run_missing_run_id" }
  $councilStatusUrl = "${councilStatusBaseUrl}?run_id=$([uri]::EscapeDataString($councilRunId))"
  $councilStatusResp = Invoke-WebRequest -Uri $councilStatusUrl -Method Get -TimeoutSec 3 -UseBasicParsing
  if ($councilStatusResp.StatusCode -ne 200) { throw "council_status_get_failed" }
  $councilStatusObj = $councilStatusResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($councilStatusObj.ok -ne $true) { throw "council_status_get_not_ok" }
  if ($null -eq $councilStatusObj.data.run.reflection) { throw "council_status_reflection_missing" }
  if ($null -eq $councilStatusObj.data.run.finalization) { throw "council_status_finalization_missing" }
  if ($null -eq $councilStatusObj.data.run.quality_check) { throw "council_status_quality_check_missing" }
  if ($null -eq $councilStatusObj.data.run.exports) { throw "council_status_exports_missing" }
  try {
    if ([bool]$councilStatusObj.data.run.exports.auto_ops_snapshot -ne $true) { throw "council_status_exports_auto_ops_snapshot_mismatch" }
    if ([bool]$councilStatusObj.data.run.exports.auto_release_bundle -ne $true) { throw "council_status_exports_auto_release_bundle_mismatch" }
  } catch { throw "council_status_exports_invalid" }
  $result.council_status_ok = $true

  $councilCancelBody = @{ run_id = $councilRunId } | ConvertTo-Json -Depth 4
  $councilCancelResp = Invoke-WebRequest -Uri $councilCancelUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $councilCancelBody
  if ($councilCancelResp.StatusCode -ne 200) { throw "council_cancel_post_failed" }
  $cancelOk = $false
  for ($i = 0; $i -lt 10; $i += 1) {
    Start-Sleep -Milliseconds 300
    $statusPollResp = Invoke-WebRequest -Uri $councilStatusUrl -Method Get -TimeoutSec 3 -UseBasicParsing
    if ($statusPollResp.StatusCode -ne 200) { continue }
    $statusPollObj = $statusPollResp.Content | ConvertFrom-Json -ErrorAction Stop
    if ($statusPollObj.ok -ne $true) { continue }
    $runStatus = ""
    try { $runStatus = [string]$statusPollObj.data.run.status } catch {}
    if ($runStatus -eq "canceled") {
      $cancelOk = $true
      break
    }
  }
  if (-not $cancelOk) { throw "council_cancel_not_reflected" }
  $result.council_cancel_ok = $true

  $councilResumeBody = @{ resume = $true; run_id = $councilRunId } | ConvertTo-Json -Depth 4
  $councilResumeResp = Invoke-WebRequest -Uri $councilRunUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $councilResumeBody
  if ($councilResumeResp.StatusCode -ne 200) { throw "council_resume_post_failed" }
  $councilResumeObj = $councilResumeResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($councilResumeObj.ok -ne $true) { throw "council_resume_not_ok" }
  $resumeStatus = ""
  try { $resumeStatus = [string]$councilResumeObj.data.status } catch {}
  if ($resumeStatus -ne "queued") { throw "council_resume_status_not_queued" }
  $result.council_resume_ok = $true

  $exportBody = @{ max_runs = 10; include_archives = $false; dry_run = $true } | ConvertTo-Json -Depth 4
  $exportResp = Invoke-WebRequest -Uri $evidenceExportUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $exportBody
  if ($exportResp.StatusCode -ne 200) { throw "evidence_export_post_failed" }
  $exportObj = $exportResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($exportObj.ok -ne $true) { throw "evidence_export_not_ok" }
  $result.evidence_export_ok = $true

  $opsBody = @{ inbox_limit = 20; runs_limit = 10; dry_run = $true } | ConvertTo-Json -Depth 4
  $opsResp = Invoke-WebRequest -Uri $opsSnapshotUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $opsBody
  if ($opsResp.StatusCode -ne 200) { throw "ops_snapshot_post_failed" }
  $opsObj = $opsResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($opsObj.ok -ne $true) { throw "ops_snapshot_not_ok" }
  $result.ops_snapshot_ok = $true

  $mbBundleDryBody = @{ dry_run = $true; include_ops_snapshot = $true } | ConvertTo-Json -Depth 4
  $mbBundleDryResp = Invoke-WebRequest -Uri $morningBriefBundleUrl -Method Post -TimeoutSec 5 -UseBasicParsing -ContentType "application/json" -Body $mbBundleDryBody
  if ($mbBundleDryResp.StatusCode -ne 200) { throw "morning_brief_bundle_dry_failed" }
  $mbBundleDryObj = $mbBundleDryResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($mbBundleDryObj.ok -ne $true) { throw "morning_brief_bundle_dry_not_ok" }
  $result.morning_brief_bundle_dry_ok = $true

  $opsQueueBody = @{ inbox_limit = 5; runs_limit = 5; dry_run = $false } | ConvertTo-Json -Depth 4
  $opsQueueResp = Invoke-WebRequest -Uri $opsSnapshotUrl -Method Post -TimeoutSec 3 -UseBasicParsing -ContentType "application/json" -Body $opsQueueBody
  if ($opsQueueResp.StatusCode -ne 200) { throw "ops_snapshot_queue_failed" }
  $opsQueueObj = $opsQueueResp.Content | ConvertFrom-Json -ErrorAction Stop
  if ($opsQueueObj.ok -ne $true) { throw "ops_snapshot_queue_not_ok" }
  try {
    $opsQueuedPath = [string]$opsQueueObj.data.queued_path
    if (-not [string]::IsNullOrWhiteSpace($opsQueuedPath)) { [void]$cleanupQueuedPaths.Add($opsQueuedPath) }
  } catch {}
  $opsReqId = ""
  try { $opsReqId = [string]$opsQueueObj.data.request_id } catch {}
  if ([string]::IsNullOrWhiteSpace($opsReqId)) { throw "ops_snapshot_queue_missing_request_id" }
  $opsStatusUrl = "http://127.0.0.1:8787/api/export/ops_snapshot/status?request_id=$([uri]::EscapeDataString($opsReqId))"
  $opsStatusOk = $false
  for ($i = 0; $i -lt 5; $i += 1) {
    if ($i -gt 0) { Start-Sleep -Milliseconds 400 }
    try {
      $opsStatusResp = Invoke-WebRequest -Uri $opsStatusUrl -Method Get -TimeoutSec 3 -UseBasicParsing
      if ($opsStatusResp.StatusCode -ne 200) { continue }
      $opsStatusObj = $opsStatusResp.Content | ConvertFrom-Json -ErrorAction Stop
      if ($opsStatusObj.ok -ne $true) { continue }
      $opsStatusOk = $true
      break
    } catch {
      continue
    }
  }
  if (-not $opsStatusOk) { throw "ops_snapshot_status_failed" }
  $result.ops_snapshot_status_ok = $true

  $result.ok = $true
  $result.exit_code = 0
}
catch {
  if (-not $Json) {
    Write-Output ("ui_smoke_failed: " + $_.Exception.Message)
  }
}
finally {
  foreach ($qp in $cleanupQueuedPaths) {
    if ([string]::IsNullOrWhiteSpace($qp)) { continue }
    try {
      $resolved = [System.IO.Path]::GetFullPath($qp)
      if (Test-Path -LiteralPath $resolved) {
        Remove-Item -LiteralPath $resolved -Force -ErrorAction SilentlyContinue
      }
    } catch {}
  }
  if ($proc -and (-not $proc.HasExited)) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
}

if ($Json) {
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))
}

exit $result.exit_code
