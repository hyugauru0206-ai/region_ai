import { FormEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type ChannelId = "general" | "codex" | "chatgpt" | "external" | "runs" | "recipes" | "designs" | "settings" | "inbox" | "drafts" | "members" | "activity" | "workspace" | "dashboard" | "office" | "debate";
type Thread = { id: string; title: string; updated_at: string };
type ChatLinks = { run_id?: string; design_id?: string; artifact_paths?: string[]; source?: string; suggestion_id?: string; autopilot_run_id?: string };
type ChatMessage = {
  id: string;
  thread_id: string;
  role: string;
  kind: string;
  text: string;
  links?: ChatLinks;
  created_at: string;
};
type RunRow = { run_id: string; updated_at: string };
type Recipe = { id: string; file: string; title?: string; expect?: string; uses?: string[]; notes?: string; e2e_guard?: string };
type ReadStateMap = Record<string, { last_read_at?: string; last_seen_msg_id?: string }>;
type SearchHit = {
  scope: "message" | "run" | "recipe" | "design";
  thread_id?: string;
  msg_id?: string;
  role?: string;
  text?: string;
  run_id?: string;
  recipe_id?: string;
  title?: string;
  design_id?: string;
};
type RegionNavigatePayload = {
  type?: string;
  ts?: string;
  thread_id?: string;
  msg_id?: string;
  inbox_id?: string;
  run_id?: string;
  design_id?: string;
  source?: string;
  mention?: boolean;
};

type CommandPaletteItem = {
  id: string;
  title: string;
  subtitle: string;
  run: () => void;
};

type CommandPaletteRecentItem = {
  id: string;
  title: string;
  subtitle: string;
};

type ApiResp<T> = { ok: boolean; data: T };
type DesktopSettings = {
  api_base_url: string;
  poll_interval_ms: number;
  throttle_sec: number;
  mention: {
    enabled: boolean;
    tokens: string[];
    aliases: Record<string, string>;
    priority_throttle_sec: number;
    normal_throttle_sec: number;
  };
  hotkeys: {
    focus_chatgpt: string;
    send_confirm: string;
    capture_last: string;
    focus_region: string;
  };
};
type DesktopNotifyState = {
  last_notified: Record<string, string>;
  last_poll_ok_at: string;
  failure_count: number;
  backoff_ms: number;
};
type InboxItem = {
  id: string;
  ts: string;
  thread_id: string;
  thread_key?: string;
  msg_id?: string;
  role?: string;
  mention?: boolean;
  title?: string;
  body?: string;
  source?: string;
  links?: { run_id?: string; design_id?: string; artifact_paths?: string[]; suggestion_id?: string; agent_id?: string; category?: string; heartbeat_memory_id?: string; autopilot_run_id?: string };
};
type InboxReadState = {
  global_last_read_ts?: string;
  by_thread?: Record<string, { last_read_ts?: string; last_read_id?: string }>;
  thread_keys?: Record<string, { last_read_ts?: string; last_read_key?: string; read_keys?: string[] }>;
};
type TaskifyDraft = {
  id: string;
  ts: string;
  source: { thread_id?: string; msg_id?: string; inbox_id?: string };
  title: string;
  task_yaml: string;
  generated_by?: string;
  safe?: boolean;
  unsafe_reasons?: string[];
  unsafe_details?: Record<string, unknown>;
  notes?: string;
};
type TaskifyQueueResult = {
  queued: boolean;
  request_id: string;
  task_id: string;
  queued_path: string;
  tracking_enabled?: boolean;
  note?: string;
};
type TaskifyQueueTrackingEntry = {
  request_id: string;
  draft_id: string;
  queued_at: string;
  status: "queued" | "started" | "completed" | "failed";
  run_id?: string;
  last_checked_at?: string;
  done_at?: string;
  note?: string;
};
type InboxCompactResult = {
  action: string;
  compacted: boolean;
  archived_lines: number;
  kept_lines: number;
  dry_run: boolean;
  exit_code: number;
  note?: string;
};
type InboxThreadArchiveResult = {
  action: string;
  thread_key: string;
  dry_run: boolean;
  archived: number;
  archive_path: string;
  since_ts?: string;
  first_ts?: string;
  last_ts?: string;
  scanned?: number;
  skipped_invalid?: number;
  skipped_line_too_large?: number;
  note?: string;
  exit_code?: number;
};
type EvidenceExportResult = {
  action: string;
  queued: boolean;
  request_id?: string;
  task_id?: string;
  queued_path?: string;
  dry_run?: boolean;
  max_runs?: number;
  include_archives?: boolean;
  run_ids?: string[];
  total_inputs?: number;
  status?: string;
  run_id?: string;
  notified?: boolean;
  bundle_zip_path?: string;
  bundle_manifest_path?: string;
  queued_at?: string;
  exit_code?: number;
};
type OpsSnapshotResult = {
  action: string;
  queued: boolean;
  request_id?: string;
  task_id?: string;
  queued_path?: string;
  dry_run?: boolean;
  inbox_limit?: number;
  runs_limit?: number;
  output_path?: string;
  snapshot_path?: string;
  missing_sections?: string[];
  preview?: string;
  status?: string;
  run_id?: string;
  notified?: boolean;
  queued_at?: string;
  created_at?: string;
  exit_code?: number;
};
type MorningBriefBundleResult = {
  action: string;
  queued: boolean;
  request_id?: string;
  task_id?: string;
  queued_path?: string;
  dry_run?: boolean;
  status?: "queued" | "running" | "success" | "failed";
  run_id?: string;
  notified?: boolean;
  zip_path?: string;
  manifest_path?: string;
  queued_at?: string;
  date?: string;
  include_ops_snapshot?: boolean;
  would_enqueue?: boolean;
  suggested_paths?: { zip_path?: string; manifest_path?: string; brief_path?: string };
  plan?: any;
  preview?: string;
  exit_code?: number;
};
type OrgAgentStatus = "idle" | "writing" | "researching" | "executing" | "syncing" | "error";
type OrgAgentIdentity = {
  tagline: string;
  values: string[];
  speaking_style: string;
  strengths: string[];
  weaknesses: string[];
  do: string[];
  dont: string[];
  focus: string;
};
type OrgAgent = {
  id: string;
  display_name: string;
  role: string;
  icon: string;
  status: OrgAgentStatus;
  assigned_thread_id: string | null;
  thread_key?: string;
  active_preset_set_id?: string;
  target_preset_set_id?: string;
  recommended_preset_set_id?: string;
  last_message: string | null;
  identity?: OrgAgentIdentity;
  layout?: { x: number; y: number };
  last_updated_at: string;
};
type OrgAgentsSnapshot = {
  version: 1;
  updated_at: string;
  agents: OrgAgent[];
};
type AgentPresetSummary = {
  preset_set_id: string;
  display_name: string;
  description?: string;
};
type AgentPresetsListResponse = {
  action: string;
  version: 1;
  presets: AgentPresetSummary[];
  exit_code: number;
};
type ApplyPresetResult = {
  action: "apply_preset";
  ok: boolean;
  dry_run: boolean;
  preset_set_id: string;
  scope: "council" | "agent";
  applied_ids: string[];
  diff_sample: Record<string, { before_hash: string; after_hash: string; changed: boolean }>;
  note: string;
  exit_code: number;
  active_profile_preview?: { preset_set_id: string; display_name: string; reason: string; computed_at: string };
  active_profile_updated?: boolean;
  active_profile?: ActiveProfileState;
};
type ActiveProfileState = {
  action?: string;
  preset_set_id: string;
  display_name: string;
  applied_at?: string;
  applied_by?: string;
  reason?: string;
  thread_key?: string;
  version?: number;
  note?: string;
  exit_code?: number;
};
type ActivityEvent = {
  id: string;
  ts: string;
  event_type: "agents_updated" | "agent_state_changed" | "agents_created" | "memory_append" | "heartbeat" | "heartbeat_scheduler" | "consolidation" | "autopilot_auto_start" | "taskify_draft" | "taskify_queue" | "export_request" | "export_done" | "ops_snapshot_done" | "inbox_append" | "guest_joined" | "guest_pushed" | "guest_left" | "council_started" | "council_step" | "council_finished";
  actor_id?: string | null;
  title: string;
  summary: string;
  refs?: { thread_id?: string; run_id?: string; request_id?: string };
  source: string;
};
type DashboardYesterdayMemoResponse = {
  agent_id: string;
  category: MemoryCategory;
  limit: number;
  item?: { id: string; ts: string; title: string; body: string } | null;
};
type GuestKeyEntry = {
  join_key: string;
  created_at: string;
  revoked: boolean;
  revoked_at?: string;
  label?: string;
};
type GuestKeysDoc = {
  version: 1;
  updated_at: string;
  keys: GuestKeyEntry[];
};
type GuestStatus = OrgAgentStatus | "offline";
type GuestEntry = {
  id: string;
  display_name: string;
  status: GuestStatus;
  note?: string;
  last_seen_at: string;
};
type GuestsDoc = {
  version: 1;
  updated_at: string;
  guests: GuestEntry[];
};
type MemoryCategory = "episodes" | "knowledge" | "procedures";
type MemoryEntry = {
  id: string;
  ts: string;
  agent_id: string;
  category: MemoryCategory;
  title: string;
  body: string;
  tags?: string[];
  source?: string;
  refs?: { thread_id?: string; run_id?: string; request_id?: string };
};
type MemorySearchHit = {
  agent_id: string;
  category: MemoryCategory;
  id: string;
  ts: string;
  title: string;
  snippet: string;
};
type HeartbeatRunResult = {
  request_id: string;
  dry_run: boolean;
  planned_entry?: MemoryEntry;
  created_entry?: MemoryEntry;
  truncated?: { activity?: boolean; inbox?: boolean };
  sources_counts?: { activity?: number; inbox?: number; runs?: number };
  notes?: string[];
};
type HeartbeatSettings = {
  version: 1;
  enabled: boolean;
  timezone: string;
  schedule: { mode: "daily_time"; daily_time: string; jitter_sec: number; tick_interval_sec: number };
  targets: { agent_ids: string[]; category: MemoryCategory };
  limits: { max_per_day: number; activity_limit: number; inbox_limit: number; runs_limit: number };
  safety: { lock_stale_sec: number; global_timeout_sec: number; max_consecutive_failures: number; backoff_base_sec: number; backoff_max_sec: number };
};
type HeartbeatState = {
  version: 1;
  enabled_effective: boolean;
  last_tick_at?: string | null;
  next_run_at?: string | null;
  lock?: { held: boolean; owner_pid: number; started_at?: string | null; note?: string };
  per_target?: Record<string, {
    last_run_local_date?: string | null;
    run_count_today?: number;
    last_ok_at?: string | null;
    last_fail_at?: string | null;
    failure_count?: number;
    backoff_until?: string | null;
    last_request_id?: string;
    last_result?: string;
    last_note?: string;
  }>;
};
type HeartbeatSuggestSettings = {
  version: 2;
  auto_accept_enabled: boolean;
  facilitator_only: boolean;
  category_allowlist: MemoryCategory[];
  rank_allowlist: Array<1 | 2 | 3>;
  max_per_day: number;
  cooldown_sec: number;
  max_consecutive_failures: number;
};
type HeartbeatSuggestState = {
  version: 2;
  auto_accept_enabled_effective: boolean;
  last_auto_accept_at?: string | null;
  last_auto_accept_local_date?: string | null;
  auto_accept_count_today?: number;
  failure_count?: number;
  last_error?: string;
  last_suggestion_id?: string | null;
  last_autopilot_run_id?: string | null;
};
type ConsolidationSettings = {
  version: 1;
  enabled: boolean;
  schedule: { mode: "daily_time"; daily_time: string; tick_interval_sec: number; jitter_sec: number };
  targets: { agent_ids: string[]; source_category: "episodes"; output_categories: Array<"knowledge" | "procedures"> };
  limits: { max_episodes_per_day: number; max_lines_per_output: number; max_body_chars: number };
  safety: {
    lock_stale_sec: number;
    cooldown_sec: number;
    max_per_day: number;
    backoff_base_sec: number;
    backoff_max_sec: number;
    max_consecutive_failures: number;
  };
};
type ConsolidationState = {
  version: 1;
  enabled_effective: boolean;
  last_tick_at?: string | null;
  next_run_at?: string | null;
  failure_count?: number;
  backoff_until?: string | null;
  per_agent?: Record<string, {
    last_run_local_date?: string | null;
    last_run_at?: string | null;
    last_result?: string;
    last_note?: string;
    last_outputs?: { knowledge_id?: string | null; procedures_id?: string | null };
  }>;
};
type MorningBriefSettings = {
  version: 1;
  enabled: boolean;
  daily_time: string;
  tick_interval_sec: number;
  jitter_sec: number;
  cooldown_sec: number;
  max_per_day: number;
  max_consecutive_failures: number;
  autopilot: {
    max_rounds: 1;
    auto_ops_snapshot: boolean;
    auto_evidence_bundle: boolean;
    auto_release_bundle: boolean;
  };
  heartbeat: { activity_limit: number; inbox_limit: number; runs_limit: number };
};
type MorningBriefState = {
  version: 1;
  enabled_effective: boolean;
  last_tick_at?: string | null;
  next_run_at?: string | null;
  last_run_local_date?: string | null;
  last_run_at?: string | null;
  last_result?: string;
  last_note?: string;
  failure_count?: number;
  backoff_until?: string | null;
  last_heartbeat_request_id?: string | null;
  last_suggestion_id?: string | null;
  last_autopilot_run_id?: string | null;
  last_brief_written_path?: string | null;
};
type ThreadArchiveSchedulerSettings = {
  version: 1;
  enabled: boolean;
  daily_time: string;
  thread_keys: string[];
  max_threads_per_run: number;
  cooldown_sec: number;
  max_per_day: number;
  limit_scan: number;
  max_items: number;
  audit_summary: boolean;
  audit_per_thread: boolean;
  safety: {
    lock_stale_sec: number;
    max_consecutive_failures: number;
    per_thread_timeout_ms: number;
    total_timeout_ms: number;
  };
  scan: {
    tail_bytes: number;
  };
};
type ThreadArchiveSchedulerState = {
  version: 1;
  enabled_effective: boolean;
  last_run_at?: string | null;
  last_run_local_date?: string | null;
  run_count_today?: number;
  last_result_ok?: boolean;
  last_result_summary?: string;
  failure_count?: number;
  backoff_ms?: number;
  last_error?: string;
  last_inbox_id?: string | null;
  last_elapsed_ms?: number;
  last_timed_out?: boolean;
  last_results_sample?: Array<{
    thread_key: string;
    ok: boolean;
    archived?: number;
    reason?: string;
    elapsed_ms?: number;
    mode?: string;
  }>;
  last_failed_thread_keys?: string[];
  next_run_local?: string;
};
type ThreadArchiveSchedulerRunNowResult = {
  action: string;
  dry_run: boolean;
  ok: boolean;
  summary: string;
  timed_out: boolean;
  results: Array<{
    thread_key: string;
    ok: boolean;
    archived: number;
    archive_path: string;
    mode: "tail_bytes" | "line_scan";
    elapsed_ms: number;
    reason?: string;
  }>;
  exit_code: number;
};
type DashboardThreadArchiveScheduler = {
  action: string;
  settings: {
    enabled: boolean;
    daily_time: string;
    thread_keys_count: number;
    thread_keys_sample?: string[];
    max_items: number;
    limit_scan: number;
    cooldown_sec: number;
    max_per_day: number;
    tail_bytes: number;
    per_thread_timeout_ms: number;
    total_timeout_ms: number;
  };
  state: {
    enabled_effective: boolean;
    last_run_at?: string;
    last_result_ok?: boolean;
    last_result_summary?: string;
    failure_count?: number;
    backoff_ms?: number;
    last_elapsed_ms?: number;
    last_timed_out?: boolean;
    last_failed_thread_keys?: string[];
    next_run_local?: string;
    last_results_sample?: Array<{
      thread_key: string;
      ok: boolean;
      archived?: number;
      reason?: string;
      elapsed_ms?: number;
      mode?: string;
    }>;
  };
};
type DailyLoopDashboardCardStatus = "ok" | "warn" | "err";
type RecommendedProfile = {
  preset_set_id: string;
  display_name: string;
  rationale: string;
  computed_at: string;
  inputs_sample?: Record<string, unknown>;
};
type DailyLoopDashboard = {
  action: string;
  ts: string;
  local_date: string;
  heartbeat: {
    enabled: boolean;
    enabled_effective: boolean;
    next_run_at?: string;
    last_ok_at?: string;
    failure_count?: number;
    note?: string;
  };
  suggest: {
    auto_accept_enabled: boolean;
    auto_accept_enabled_effective: boolean;
    auto_accept_count_today?: number;
    failure_count?: number;
    last_auto_accept_at?: string | null;
    note?: string;
  };
  consolidation: {
    enabled: boolean;
    enabled_effective: boolean;
    next_run_at?: string;
    facilitator?: {
      last_result?: string;
      last_run_at?: string;
      last_outputs?: { knowledge_id?: string; procedures_id?: string };
    };
    note?: string;
  };
  morning_brief: {
    enabled: boolean;
    enabled_effective: boolean;
    next_run_at?: string;
    last_result?: string;
    last_run_at?: string;
    last_written_path?: string;
    last_autopilot_run_id?: string;
    note?: string;
  };
  inbox: {
    unread_count: number;
    mention_count: number;
    items: InboxItem[];
  };
  recommended_profile?: RecommendedProfile;
  health: { status: DailyLoopDashboardCardStatus; reasons: string[] };
  note?: string;
};
type DashboardRecommendedProfilePreflight = {
  ok: boolean;
  recommended_profile: RecommendedProfile;
  apply_preview: ApplyPresetResult;
  exit_code: number;
  reason?: string;
};
type DashboardRecommendedProfileApply = {
  ok: boolean;
  recommended_profile: RecommendedProfile;
  apply_result: ApplyPresetResult;
  exit_code: number;
  reason?: string;
};
type OpsQuickActionsStatus = {
  action: string;
  ts: string;
  confirm_token: string;
  confirm_token_ttl_sec?: number;
  locks: Array<{ name: string; path: string; exists: boolean; age_sec?: number; stale_threshold_sec?: number }>;
  brakes: Array<{ name: string; enabled: boolean; enabled_effective: boolean; reason?: string }>;
  logs: Array<{ name: string; path: string; note?: string }>;
};
type DashboardQuickAction = {
  id: string;
  title: string;
  kind: "dry_run";
  enabled: boolean;
  hint?: string;
  open_settings?: string;
  execute_id?: string;
  execute_supported?: boolean;
  execute_requires_confirm?: boolean;
  execute_side_effects?: string[];
  execute_endpoint_hint?: string;
  last?: {
    last_run_at?: string;
    ok?: boolean;
    status_code?: number;
    elapsed_ms?: number;
    result_summary?: string;
    failure_reason?: string;
    last_execute_at?: string;
    last_execute_ok?: boolean;
    last_execute_result_summary?: string;
    last_execute_failure_reason?: string;
  } | null;
};
type DashboardQuickActionsResponse = {
  action: string;
  actions: DashboardQuickAction[];
  exit_code?: number;
};
type DashboardNextActionItem = {
  kind: "revert_suggestion" | "profile_misalignment" | string;
  title?: string;
  thread_key?: string;
  created_at?: string;
  active_preset_set_id?: string;
  target_preset_set_id?: string;
  recommended_preset_set_id?: string;
  quick_action_id?: string;
  severity?: "high" | "medium" | "low" | string;
};
type DashboardNextActionsResponse = {
  action: string;
  items: DashboardNextActionItem[];
  exit_code?: number;
};
type DashboardQuickActionRunResult = {
  action: string;
  id: string;
  ok: boolean;
  status_code: number;
  dry_run?: boolean;
  result: Record<string, unknown>;
  elapsed_ms: number;
  exit_code: number;
  failure_reason?: string;
  thread_key?: string;
  thread_key_source?: "request_id" | "run_id" | "fallback" | "preview" | "result" | string;
  tracking_plan?: {
    id: string;
    kind: string;
    status_endpoint: string;
    poll_hint_ms: number;
    max_duration_ms: number;
    fields_hint?: {
      terminal_status_values?: string[];
      run_id_field?: string;
      status_field?: string;
      notified_field?: string;
    };
  };
  tracking?: {
    request_id?: string;
    run_id?: string;
    thread_key?: string;
    started_at?: string;
    status_endpoint?: string;
    poll_url?: string;
    kind?: string;
    note?: string;
  } | null;
};
type ExecutionTrackerState = {
  id: string;
  kind: string;
  startedAt: number;
  pollUrl: string;
  requestId?: string;
  runId?: string;
  threadKey?: string;
  status: "idle" | "polling" | "success" | "failed" | "timeout" | "canceled";
  lastPayload?: Record<string, unknown> | null;
  lastError?: string;
  pollCount: number;
  nextDelayMs: number;
  maxDurationMs: number;
  terminalValues: string[];
};
type ExecutionTrackerHistoryStatus = "success" | "failed" | "timeout" | "canceled";
type ExecutionTrackerHistoryItem = {
  id: string;
  kind: string;
  started_at: string;
  ended_at: string;
  status: ExecutionTrackerHistoryStatus;
  request_id?: string;
  run_id?: string;
  thread_key?: string;
  elapsed_ms?: number;
  last_summary?: string;
  last_payload_sample?: Record<string, unknown> | null;
};
type ExecutionTrackerHistoryExportPayload = {
  schema: string;
  exported_at: string;
  count: number;
  items: ExecutionTrackerHistoryItem[];
};
type DashboardTrackerHistoryResponse = {
  action: string;
  items: unknown[];
  skipped_lines?: number;
  truncated?: boolean;
  exit_code?: number;
};
type DashboardTrackerHistoryAppendResponse = {
  action: string;
  appended: boolean;
  dry_run: boolean;
  exit_code: number;
  failure_reason?: string;
};
type OpsAutoStabilizeSettings = {
  version: 1;
  enabled: boolean;
  check_interval_sec: number;
  cooldown_sec: number;
  max_per_day: number;
  mention_on_trigger: boolean;
  auto_execute?: {
    enabled?: boolean;
    mode?: "safe_no_exec";
    confirm_policy?: "server_only";
    max_per_day?: number;
    cooldown_sec?: number;
  };
};
type OpsAutoStabilizeState = {
  version: 1;
  enabled_effective: boolean;
  last_check_at?: string | null;
  last_trigger_at?: string | null;
  trigger_count_today?: number;
  failure_count?: number;
  last_reason?: string;
  last_result_summary?: string;
  last_auto_execute_at?: string | null;
  auto_execute_count_today?: number;
  last_auto_execute_ok?: boolean;
  last_auto_execute_note?: string;
};
type HeartbeatSuggestion = {
  preset_candidates?: Array<{
    rank: 1 | 2 | 3;
    preset_set_id: string;
    display_name?: string;
    source?: "recommended_profile" | "static";
  }>;
  candidates?: Array<{
    rank: 1 | 2 | 3;
    topic: string;
    context: string;
    rationale: string;
    tags?: string[];
  }>;
  id: string;
  ts: string;
  local_date: string;
  agent_id: string;
  category: MemoryCategory;
  heartbeat_memory_id: string;
  topic: string;
  context: string;
  selected_rank?: 1 | 2 | 3 | null;
  recommended_profile_snapshot?: { preset_set_id: string; display_name: string; rationale: string; computed_at: string };
  selected_preset_set_id?: string | null;
  preset_apply_status?: "not_applied" | "preview_ok" | "applied" | "failed";
  preset_apply_error?: { reason: string; details?: string };
  status: "open" | "accepted" | "dismissed";
  accepted_at?: string | null;
  dismissed_at?: string | null;
  autopilot_run_id?: string | null;
};
type HeartbeatSuggestionAcceptResult = {
  ok: boolean;
  reason?: string;
  suggestion: HeartbeatSuggestion;
  dry_run: boolean;
  autopilot_started: boolean;
  autopilot_run_id?: string;
  idempotent?: boolean;
  selected_preset_set_id?: string | null;
  preset_apply_status?: "not_applied" | "preview_ok" | "applied" | "failed";
  preset_preview?: ApplyPresetResult | null;
};
type WorkspaceBubble = {
  event_id: string;
  title: string;
  summary: string;
  expires_at: number;
  run_id?: string;
  thread_id?: string;
};
type CouncilRunStatus = "queued" | "running" | "completed" | "failed" | "stopped" | "canceled";
type CouncilRunRecord = {
  run_id: string;
  request_id: string;
  topic: string;
  constraints: string;
  max_rounds: number;
  auto_build: boolean;
  thread_id: string;
  status: CouncilRunStatus;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  step_count: number;
  current_step?: number;
  current_role?: string;
  retries?: number;
  last_captured_msg?: string;
  stop_requested: boolean;
  can_resume?: boolean;
  last_error?: string;
  final_message_id?: string;
  taskify_draft_id?: string;
  taskify_request_id?: string;
  artifact_run_id?: string;
  artifact_status?: string;
  artifact_path?: string;
  bundle_path?: string;
  quality_check?: {
    passed: boolean;
    failures: Array<{ key: string; note: string }>;
  };
  reflection?: {
    attempts: number;
    max_attempts: 1;
    last_reflection_at?: string | null;
  };
  finalization?: {
    mode: "normal" | "reflected" | "failed_quality";
    final_answer_version: 1 | 2;
  };
  exports?: {
    auto_ops_snapshot: boolean;
    auto_evidence_bundle: boolean;
    auto_release_bundle: boolean;
    ops_snapshot_request_id: string | null;
    evidence_bundle_request_id: string | null;
    release_bundle_request_id: string | null;
    release_bundle_status: "disabled" | "queued" | "running" | "done" | "failed";
    release_bundle_run_id: string | null;
    release_bundle_note?: string;
    kicked_at: { ops_snapshot?: string; evidence_bundle?: string; release_bundle?: string };
    status: { ops_snapshot?: "disabled" | "queued" | "done" | "failed"; evidence_bundle?: "disabled" | "queued" | "done" | "failed" };
    note?: string;
  };
  thread_key?: string;
  thread_key_source?: "request_id" | "run_id" | "fallback" | "preview";
  inbox_thread_hint?: {
    open_thread_endpoint?: string;
  };
};
type CouncilStatusResponse = {
  run: CouncilRunRecord;
  logs: Array<Record<string, unknown>>;
  skipped_invalid: number;
};
type DesktopSettingsForm = {
  api_base_url: string;
  poll_interval_ms: string;
  throttle_sec: string;
  mention_enabled: boolean;
  mention_tokens_lines: string;
  mention_aliases_lines: string;
  mention_priority_throttle_sec: string;
  hotkey_focus_chatgpt: string;
  hotkey_send_confirm: string;
  hotkey_capture_last: string;
  hotkey_focus_region: string;
};
type UiTheme = "staroffice" | "simple";
type UiEffects = "off" | "minimal" | "fun";
type GuardedActionKind = "autopilot_pause" | "autopilot_resume" | "cancel_run" | "retry_failed_items";

const API_BASE = import.meta.env.VITE_UI_API_BASE || "http://127.0.0.1:8787";
const TRACKER_HISTORY_STORAGE_KEY = "regionai.tracker_history.v1";
const TRACKER_HISTORY_AUTO_CLOSE_STORAGE_KEY = "regionai.tracker_autoclose_success.v1";
const CHARACTER_SHEET_LAST_AGENT_STORAGE_KEY = "regionai.character_sheet_last_agent.v1";
const TRACKER_HISTORY_EXPORT_SCHEMA_V1 = "regionai.tracker_history.export.v1";
const UI_THEME_STORAGE_KEY = "regionai.ui.theme.v1";
const UI_EFFECTS_STORAGE_KEY = "regionai.ui.effects.v1";
const OFFICE_LAYOUT_STORAGE_KEY = "region_ai.office_layout.v1";
const RECENT_TARGETS_STORAGE_KEY = "region_ai.command_palette_recent.v1";
const FAVORITE_TARGETS_STORAGE_KEY = "region_ai.favorites.v1";
const QUICK_ACCESS_MODE_STORAGE_KEY = "region_ai.quick_access_mode.v1";
const CHANNELS: Array<{ id: ChannelId; label: string }> = [
  { id: "general", label: "general" },
  { id: "codex", label: "codex" },
  { id: "chatgpt", label: "chatgpt" },
  { id: "external", label: "external" },
  { id: "runs", label: "runs" },
  { id: "recipes", label: "recipes" },
  { id: "designs", label: "designs" },
  { id: "settings", label: "settings" },
  { id: "inbox", label: "inbox" },
  { id: "drafts", label: "drafts" },
  { id: "workspace", label: "\u30ef\u30fc\u30af\u30b9\u30da\u30fc\u30b9" },
  { id: "dashboard", label: "ダッシュボード" },
  { id: "office", label: "office" },
  { id: "debate", label: "debate" },
  { id: "members", label: "メンバー" },
  { id: "activity", label: "アクティビティ" },
];
const PRIMARY_NAVS = [
  { id: "autopilot", label: "Autopilot", icon: "A", description: "Open dashboard autopilot actions" },
  { id: "dashboard", label: "Dashboard", icon: "D", description: "Open daily loop dashboard" },
  { id: "workspace", label: "Workspace", icon: "W", description: "Open workspace room" },
] as const;
const CHAT_CHANNELS: ChannelId[] = ["general", "codex", "chatgpt", "external"];
const MEMORY_CATEGORIES: MemoryCategory[] = ["episodes", "knowledge", "procedures"];
const ORG_AGENT_STATUS_OPTIONS: OrgAgentStatus[] = ["idle", "writing", "researching", "executing", "syncing", "error"];
const GUEST_PUSH_STATUS_OPTIONS: OrgAgentStatus[] = ["idle", "writing", "researching", "executing", "syncing", "error"];
const DESKTOP_SETTINGS_DEFAULT: DesktopSettings = {
  api_base_url: "http://127.0.0.1:8787",
  poll_interval_ms: 5000,
  throttle_sec: 30,
  mention: {
    enabled: true,
    tokens: ["@shogun", "@karo", "@ashigaru", "@codex", "@chatgpt"],
    aliases: { "将軍": "@shogun", "家老": "@karo" },
    priority_throttle_sec: 5,
    normal_throttle_sec: 30,
  },
  hotkeys: {
    focus_chatgpt: "Ctrl+Alt+G",
    send_confirm: "Ctrl+Alt+S",
    capture_last: "Ctrl+Alt+C",
    focus_region: "Ctrl+Alt+R",
  },
};

const ROLE_COLORS: Record<string, string> = {
  shogun: "#f2a65a",
  karo: "#8bd3dd",
  ashigaru: "#95d67b",
  codex: "#77b9ff",
  chatgpt: "#8ce99a",
  claude: "#ffadad",
  gemini: "#ffd166",
  user: "#d0d4dd",
};

function isTrackerHistoryStatus(value: string): value is ExecutionTrackerHistoryStatus {
  return value === "success" || value === "failed" || value === "timeout" || value === "canceled";
}

function isValidInboxThreadKey(value: unknown): boolean {
  const s = String(value || "").trim().toLowerCase();
  return /^[a-z0-9:_-]{1,80}$/.test(s);
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = String(target.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!target.isContentEditable || !!target.closest('[contenteditable="true"]');
}

function readStoredStringArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || "").trim()).filter((item) => !!item);
  } catch {
    return [];
  }
}

function readStoredTargetEntries(key: string, maxItems = 8): CommandPaletteRecentItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const row = item as Record<string, unknown>;
        const id = String(row.id || "").trim();
        const title = String(row.title || "").trim();
        const subtitle = String(row.subtitle || "").trim();
        if (!id || !title) return null;
        return { id, title, subtitle };
      })
      .filter((item): item is CommandPaletteRecentItem => !!item)
      .slice(0, Math.max(1, maxItems));
  } catch {
    return [];
  }
}

function readStoredCommandPaletteRecent(storageKey: string, fallbackToLegacy = false): CommandPaletteRecentItem[] {
  const scoped = readStoredTargetEntries(storageKey, 8);
  if (scoped.length > 0 || !fallbackToLegacy) return scoped;
  return readStoredTargetEntries(RECENT_TARGETS_STORAGE_KEY, 8);
}

function sanitizeOfficeWorkspaceKey(value: unknown): string {
  const normalized = String(value || "").trim().replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || "default";
}

function resolveOfficeWorkspaceKey(): string {
  if (typeof window === "undefined") return "default";
  const searchParams = new URLSearchParams(window.location.search || "");
  const bodyDataset = typeof document !== "undefined" ? document.body?.dataset : undefined;
  const candidates = [
    searchParams.get("workspace"),
    searchParams.get("workspace_id"),
    searchParams.get("workspaceId"),
    searchParams.get("ws"),
    bodyDataset?.workspaceId,
    bodyDataset?.workspaceKey,
  ];
  const locationHints = [window.location.hash || "", window.location.pathname || ""];
  for (const hint of locationHints) {
    const matched = hint.match(/(?:workspace(?:_id|Id)?=|workspace[/:#-])([A-Za-z0-9_.-]+)/i);
    if (matched?.[1]) candidates.push(matched[1]);
  }
  for (const candidate of candidates) {
    const sanitized = sanitizeOfficeWorkspaceKey(candidate);
    if (sanitized !== "default" || String(candidate || "").trim()) return sanitized;
  }
  return "default";
}

function getOfficeLayoutStorageKey(workspaceKey: string): string {
  return `${OFFICE_LAYOUT_STORAGE_KEY}.${sanitizeOfficeWorkspaceKey(workspaceKey)}`;
}

function getRecentTargetsStorageKey(workspaceKey: string): string {
  return `${RECENT_TARGETS_STORAGE_KEY}.${sanitizeOfficeWorkspaceKey(workspaceKey)}`;
}

function getFavoriteTargetsStorageKey(workspaceKey: string): string {
  return `${FAVORITE_TARGETS_STORAGE_KEY}.${sanitizeOfficeWorkspaceKey(workspaceKey)}`;
}

function getQuickAccessModeStorageKey(workspaceKey: string): string {
  return `${QUICK_ACCESS_MODE_STORAGE_KEY}.${sanitizeOfficeWorkspaceKey(workspaceKey)}`;
}


function formatCompactTargetId(prefix: string, value: unknown, keep = 8): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.length > keep ? raw.slice(0, keep) : raw;
  return `${prefix}:${compact}`;
}

function buildContextBadge(prefix: string, value: unknown, keep = 8): { label: string; full: string } | null {
  const full = String(value || "").trim();
  if (!full) return null;
  return {
    label: formatCompactTargetId(prefix, full, keep),
    full,
  };
}

function buildRecentIssueSummary(input: {
  trackerStatus?: string;
  trackerError?: string;
  trackerId?: string;
  trackerRunId?: string;
  runStatus?: string;
  runId?: string;
  runError?: string;
  runCanResume?: boolean;
  queueStatus?: string;
  queueRunId?: string;
  queueNote?: string;
  heartbeatFailureCount?: number;
  suggestFailureCount?: number;
  consolidationResult?: string;
}): { text: string; detail?: string; badge?: { label: string; full: string } | null } {
  const trackerStatus = String(input.trackerStatus || "").trim().toLowerCase();
  if (trackerStatus === "failed" || trackerStatus === "timeout" || trackerStatus === "canceled") {
    return {
      text: `Recent issue: tracker ${trackerStatus}`,
      detail: String(input.trackerError || trackerStatus),
      badge: buildContextBadge("trk", input.trackerRunId || input.trackerId || ""),
    };
  }

  const runStatus = String(input.runStatus || "").trim().toLowerCase();
  if (runStatus === "failed" || runStatus === "canceled" || runStatus === "stopped") {
    const paused = runStatus !== "failed" && !!input.runCanResume;
    return {
      text: paused ? "Recent issue: autopilot paused" : `Recent issue: run ${runStatus}`,
      detail: String(input.runError || runStatus),
      badge: buildContextBadge("run", input.runId || ""),
    };
  }

  const queueStatus = String(input.queueStatus || "").trim().toLowerCase();
  if (queueStatus === "failed") {
    return {
      text: "Recent issue: queue item failed",
      detail: String(input.queueNote || queueStatus),
      badge: buildContextBadge("run", input.queueRunId || ""),
    };
  }

  if (Number(input.heartbeatFailureCount || 0) > 0) {
    return {
      text: "Recent issue: heartbeat failures detected",
      detail: `failure_count=${Number(input.heartbeatFailureCount || 0)}`,
      badge: buildContextBadge("trk", "heartbeat"),
    };
  }

  if (Number(input.suggestFailureCount || 0) > 0) {
    return {
      text: "Recent issue: suggest failures detected",
      detail: `failure_count=${Number(input.suggestFailureCount || 0)}`,
      badge: buildContextBadge("trk", "suggest"),
    };
  }

  const consolidationResult = String(input.consolidationResult || "").trim().toLowerCase();
  if (consolidationResult && consolidationResult !== "ok" && consolidationResult !== "success") {
    return {
      text: "Recent issue: consolidation not healthy",
      detail: consolidationResult,
      badge: buildContextBadge("trk", "consolidation"),
    };
  }

  return {
    text: "Recent issue: no recent failures",
  };
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function mergeStoredOrder(savedIds: string[], currentIds: string[]): string[] {
  const allowed = new Set(currentIds);
  const merged: string[] = [];
  for (const id of savedIds) {
    if (!id || !allowed.has(id) || merged.includes(id)) continue;
    merged.push(id);
  }
  for (const id of currentIds) {
    if (!id || merged.includes(id)) continue;
    merged.push(id);
  }
  return merged;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (typeof moved === "undefined") return items;
  next.splice(toIndex, 0, moved);
  return next;
}

function normalizeChainStatus(status: string): "idle" | "writing" | "running" | "error" {
  if (status === "error") return "error";
  if (status === "writing") return "writing";
  if (status === "researching" || status === "executing" || status === "syncing" || status === "polling" || status === "running") {
    return "running";
  }
  return "idle";
}

function normalizeTrackerHistoryEntry(input: unknown): ExecutionTrackerHistoryItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const id = String(row.id || "").trim();
  const kind = String(row.kind || "").trim();
  const startedAt = String(row.started_at || "").trim();
  const endedAt = String(row.ended_at || "").trim();
  const status = String(row.status || "").trim();
  if (!id || !kind || !startedAt || !endedAt || !isTrackerHistoryStatus(status)) return null;
  const requestId = String(row.request_id || "").trim();
  const runId = String(row.run_id || "").trim();
  const threadKeyRaw = String(row.thread_key || "").trim().toLowerCase();
  const threadKey = isValidInboxThreadKey(threadKeyRaw) ? threadKeyRaw : "";
  const elapsedCandidate = Number(row.elapsed_ms);
  const summary = String(row.last_summary || "").replace(/\s+/g, " ").trim().slice(0, 200);
  let payloadSample: Record<string, unknown> | null | undefined = undefined;
  if (row.last_payload_sample && typeof row.last_payload_sample === "object" && !Array.isArray(row.last_payload_sample)) {
    payloadSample = row.last_payload_sample as Record<string, unknown>;
  }
  return {
    id,
    kind,
    started_at: startedAt,
    ended_at: endedAt,
    status,
    request_id: requestId || undefined,
    run_id: runId || undefined,
    thread_key: threadKey || undefined,
    elapsed_ms: Number.isFinite(elapsedCandidate) ? elapsedCandidate : undefined,
    last_summary: summary || undefined,
    last_payload_sample: payloadSample,
  };
}

function normalizeTrackerHistoryArray(input: unknown): { items: ExecutionTrackerHistoryItem[]; skipped: number } {
  if (!Array.isArray(input)) return { items: [], skipped: 0 };
  const items: ExecutionTrackerHistoryItem[] = [];
  let skipped = 0;
  for (const row of input) {
    const normalized = normalizeTrackerHistoryEntry(row);
    if (!normalized) {
      skipped += 1;
      continue;
    }
    items.push(normalized);
  }
  return { items, skipped };
}

function trackerHistoryDedupeKey(item: ExecutionTrackerHistoryItem): string {
  return `${item.id}|${item.kind}|${item.request_id || ""}|${item.run_id || ""}|${item.started_at}|${item.ended_at}`;
}

function mergeTrackerHistory(existing: ExecutionTrackerHistoryItem[], imported: ExecutionTrackerHistoryItem[]): ExecutionTrackerHistoryItem[] {
  const combined = [...existing, ...imported].map((row, idx) => ({ row, idx }));
  combined.sort((a, b) => {
    const aEnded = String(a.row.ended_at || "");
    const bEnded = String(b.row.ended_at || "");
    if (aEnded && bEnded && aEnded !== bEnded) return bEnded.localeCompare(aEnded);
    return a.idx - b.idx;
  });
  const seen = new Set<string>();
  const out: ExecutionTrackerHistoryItem[] = [];
  for (const wrapped of combined) {
    const key = trackerHistoryDedupeKey(wrapped.row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(wrapped.row);
    if (out.length >= 10) break;
  }
  return out;
}

function buildTrackerHistoryExportPayload(items: ExecutionTrackerHistoryItem[]): ExecutionTrackerHistoryExportPayload {
  const trimmed = items.slice(0, 10).map((row) => ({
    ...row,
    last_summary: String(row.last_summary || "").replace(/\s+/g, " ").slice(0, 200) || undefined,
  }));
  return {
    schema: TRACKER_HISTORY_EXPORT_SCHEMA_V1,
    exported_at: new Date().toISOString(),
    count: trimmed.length,
    items: trimmed,
  };
}

async function apiGet<T>(apiPath: string): Promise<T> {
  const res = await fetch(`${API_BASE}${apiPath}`);
  if (!res.ok) throw new Error(`GET ${apiPath} failed (${res.status})`);
  const json = (await res.json()) as ApiResp<T>;
  if (!json.ok) throw new Error(`GET ${apiPath} not ok`);
  return json.data;
}

async function apiPost<T>(apiPath: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${apiPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${apiPath} failed (${res.status})`);
  const json = (await res.json()) as ApiResp<T>;
  if (!json.ok) throw new Error(`POST ${apiPath} not ok`);
  return json.data;
}

async function apiDelete<T>(apiPath: string): Promise<T> {
  const res = await fetch(`${API_BASE}${apiPath}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${apiPath} failed (${res.status})`);
  const json = (await res.json()) as ApiResp<T>;
  if (!json.ok) throw new Error(`DELETE ${apiPath} not ok`);
  return json.data;
}

function roleColor(role: string): string {
  return ROLE_COLORS[role] || "#d0d4dd";
}

function roleInitial(role: string): string {
  return (role || "u").slice(0, 1).toUpperCase();
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function sourceBadge(msg: ChatMessage): string {
  const src = String(msg.links?.source || "");
  if (!src) return "";
  if (src.includes("desktop_capture_last")) return "capture-last";
  if (src.includes("desktop_capture")) return "capture";
  if (src.includes("desktop")) return "desktop";
  return src;
}

function formatForRole(role: string, text: string): string {
  if (role === "chatgpt") {
    return ["[Background]", "region_ai hub handoff", "", "[Body]", text].join("\n");
  }
  if (role === "codex") {
    return ["DoD:", "- implement requested delta", "", "Input:", text].join("\n");
  }
  return text;
}

function settingsToForm(settings: DesktopSettings): DesktopSettingsForm {
  const aliasesLines = Object.entries(settings.mention.aliases || {}).map(([k, v]) => `${k}:${v}`).join("\n");
  return {
    api_base_url: settings.api_base_url || "",
    poll_interval_ms: String(settings.poll_interval_ms ?? ""),
    throttle_sec: String(settings.throttle_sec ?? ""),
    mention_enabled: !!settings.mention?.enabled,
    mention_tokens_lines: (settings.mention?.tokens || []).join("\n"),
    mention_aliases_lines: aliasesLines,
    mention_priority_throttle_sec: String(settings.mention?.priority_throttle_sec ?? ""),
    hotkey_focus_chatgpt: settings.hotkeys?.focus_chatgpt || "",
    hotkey_send_confirm: settings.hotkeys?.send_confirm || "",
    hotkey_capture_last: settings.hotkeys?.capture_last || "",
    hotkey_focus_region: settings.hotkeys?.focus_region || "",
  };
}

function parseAliases(lines: string): Record<string, string> {
  const out: Record<string, string> = {};
  const rows = String(lines || "").split(/\r?\n/).map((x) => x.trim()).filter((x) => !!x);
  for (const row of rows) {
    const idx = row.indexOf(":");
    if (idx <= 0) continue;
    const k = row.slice(0, idx).trim();
    const v = row.slice(idx + 1).trim();
    if (!k || !v) continue;
    out[k] = v;
  }
  return out;
}

export function App(): JSX.Element {
  const [activeChannel, setActiveChannel] = useState<ChannelId>("general");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composerText, setComposerText] = useState("");
  const [composerRole, setComposerRole] = useState("user");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [runFilter, setRunFilter] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRunDetail, setSelectedRunDetail] = useState<any>(null);
  const [selectedArtifactPath, setSelectedArtifactPath] = useState("");
  const [artifactPreview, setArtifactPreview] = useState<any>(null);
  const [zipEntries, setZipEntries] = useState<any>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [designList, setDesignList] = useState<string[]>([]);
  const [designLatest, setDesignLatest] = useState("");
  const [selectedDesign, setSelectedDesign] = useState("");
  const [designText, setDesignText] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [clipboardRole, setClipboardRole] = useState("chatgpt");
  const [clipHistory, setClipHistory] = useState<any[]>([]);
  const [status, setStatus] = useState("ready");
  const [toast, setToast] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [commandPaletteRecent, setCommandPaletteRecent] = useState<CommandPaletteRecentItem[]>(() => readStoredCommandPaletteRecent(getRecentTargetsStorageKey(resolveOfficeWorkspaceKey()), true));
  const [commandPaletteFavorites, setCommandPaletteFavorites] = useState<CommandPaletteRecentItem[]>(() => readStoredTargetEntries(getFavoriteTargetsStorageKey(resolveOfficeWorkspaceKey()), 6));
  const [quickAccessMode, setQuickAccessMode] = useState<"favorites" | "recent">(() => {
    const raw = String(localStorage.getItem(getQuickAccessModeStorageKey(resolveOfficeWorkspaceKey())) || "").trim().toLowerCase();
    return raw === "recent" ? "recent" : "favorites";
  });
  const [quickAccessFavoritesExpanded, setQuickAccessFavoritesExpanded] = useState(false);
  const [quickAccessRecentExpanded, setQuickAccessRecentExpanded] = useState(false);
  const [uiTheme, setUiTheme] = useState<UiTheme>(() => (localStorage.getItem(UI_THEME_STORAGE_KEY) === "simple" ? "simple" : "staroffice"));
  const [uiEffects, setUiEffects] = useState<UiEffects>(() => {
    const raw = String(localStorage.getItem(UI_EFFECTS_STORAGE_KEY) || "").trim();
    if (raw === "off" || raw === "fun") return raw;
    return "minimal";
  });
  const [officeLayoutOrder, setOfficeLayoutOrder] = useState<string[]>([]);
  const [officeDragAgentId, setOfficeDragAgentId] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [pins, setPins] = useState<string[]>([]);
  const [readState, setReadState] = useState<ReadStateMap>({});
  const [unreadCount, setUnreadCount] = useState<Record<string, number>>({});
  const [mentionFlag, setMentionFlag] = useState<Record<string, boolean>>({});
  const [desktopSettingsForm, setDesktopSettingsForm] = useState<DesktopSettingsForm>(settingsToForm(DESKTOP_SETTINGS_DEFAULT));
  const [desktopNotifyState, setDesktopNotifyState] = useState<DesktopNotifyState | null>(null);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [inboxReadState, setInboxReadState] = useState<InboxReadState>({ global_last_read_ts: "", by_thread: {} });
  const [selectedInboxItem, setSelectedInboxItem] = useState<InboxItem | null>(null);
  const [inboxFilter, setInboxFilter] = useState(() => localStorage.getItem("region_ai_inbox_search") || "");
  const [inboxMentionsOnly, setInboxMentionsOnly] = useState(() => localStorage.getItem("region_ai_inbox_mentions_only") === "1");
  const [inboxThreadFilter, setInboxThreadFilter] = useState(() => localStorage.getItem("region_ai_inbox_thread_filter") || "all");
  const [inboxThreadKeyFilter, setInboxThreadKeyFilter] = useState(() => localStorage.getItem("region_ai_inbox_thread_key_filter") || "all");
  const [inboxSourceFilter, setInboxSourceFilter] = useState(() => localStorage.getItem("region_ai_inbox_source_filter") || "all");
  const [inboxHasLinksOnly, setInboxHasLinksOnly] = useState(() => localStorage.getItem("region_ai_inbox_has_links_only") === "1");
  const [inboxCompactMaxLines, setInboxCompactMaxLines] = useState("5000");
  const [inboxCompactResult, setInboxCompactResult] = useState<InboxCompactResult | null>(null);
  const [inboxThreadViewItems, setInboxThreadViewItems] = useState<InboxItem[]>([]);
  const [inboxThreadViewKey, setInboxThreadViewKey] = useState("");
  const [inboxThreadViewStatus, setInboxThreadViewStatus] = useState("");
  const [inboxThreadArchiveResult, setInboxThreadArchiveResult] = useState<InboxThreadArchiveResult | null>(null);
  const [evidenceMaxRuns, setEvidenceMaxRuns] = useState("20");
  const [evidenceIncludeArchives, setEvidenceIncludeArchives] = useState(false);
  const [evidenceExportResult, setEvidenceExportResult] = useState<EvidenceExportResult | null>(null);
  const [opsSnapshotInboxLimit, setOpsSnapshotInboxLimit] = useState("20");
  const [opsSnapshotRunsLimit, setOpsSnapshotRunsLimit] = useState("10");
  const [opsSnapshotResult, setOpsSnapshotResult] = useState<OpsSnapshotResult | null>(null);
  const [morningBriefBundleDate, setMorningBriefBundleDate] = useState("");
  const [morningBriefBundleIncludeOpsSnapshot, setMorningBriefBundleIncludeOpsSnapshot] = useState(true);
  const [morningBriefBundleResult, setMorningBriefBundleResult] = useState<MorningBriefBundleResult | null>(null);
  const [taskifyDrafts, setTaskifyDrafts] = useState<TaskifyDraft[]>([]);
  const [selectedTaskifyDraft, setSelectedTaskifyDraft] = useState<TaskifyDraft | null>(null);
  const [taskifyQueueResult, setTaskifyQueueResult] = useState<TaskifyQueueResult | null>(null);
  const [taskifyTrackingItem, setTaskifyTrackingItem] = useState<TaskifyQueueTrackingEntry | null>(null);
  const [orgAgents, setOrgAgents] = useState<OrgAgent[]>([]);
  const [orgGuests, setOrgGuests] = useState<GuestEntry[]>([]);
  const [guestKeys, setGuestKeys] = useState<GuestKeyEntry[]>([]);
  const [guestKeysLabel, setGuestKeysLabel] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState("");
  const [guestJoinId, setGuestJoinId] = useState("");
  const [guestJoinDisplayName, setGuestJoinDisplayName] = useState("");
  const [guestPushStatus, setGuestPushStatus] = useState<OrgAgentStatus>("idle");
  const [guestPushNote, setGuestPushNote] = useState("");
  const [guestJoinKeyInput, setGuestJoinKeyInput] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [characterSheetAgentId, setCharacterSheetAgentId] = useState("");
  const [characterSheetLastAgentId, setCharacterSheetLastAgentId] = useState(() => localStorage.getItem(CHARACTER_SHEET_LAST_AGENT_STORAGE_KEY) || "");
  const [characterSheetIncludeDerivedMemory, setCharacterSheetIncludeDerivedMemory] = useState(false);
  const [characterSheetMemoryEpisodes, setCharacterSheetMemoryEpisodes] = useState<MemoryEntry[]>([]);
  const [characterSheetMemoryKnowledge, setCharacterSheetMemoryKnowledge] = useState<MemoryEntry[]>([]);
  const [characterSheetMemoryProcedures, setCharacterSheetMemoryProcedures] = useState<MemoryEntry[]>([]);
  const [characterSheetLiveActivity, setCharacterSheetLiveActivity] = useState<ActivityEvent[]>([]);
  const [characterSheetActivityStatus, setCharacterSheetActivityStatus] = useState("idle");
  const [agentEditStatus, setAgentEditStatus] = useState<OrgAgentStatus>("idle");
  const [agentEditThreadId, setAgentEditThreadId] = useState("none");
  const [agentIdentityTagline, setAgentIdentityTagline] = useState("");
  const [agentIdentitySpeakingStyle, setAgentIdentitySpeakingStyle] = useState("");
  const [agentIdentityFocus, setAgentIdentityFocus] = useState("");
  const [agentIdentityValues, setAgentIdentityValues] = useState("");
  const [agentIdentityStrengths, setAgentIdentityStrengths] = useState("");
  const [agentIdentityWeaknesses, setAgentIdentityWeaknesses] = useState("");
  const [agentIdentityDo, setAgentIdentityDo] = useState("");
  const [agentIdentityDont, setAgentIdentityDont] = useState("");
  const [agentPresetItems, setAgentPresetItems] = useState<AgentPresetSummary[]>([]);
  const [agentPresetSelectedId, setAgentPresetSelectedId] = useState("standard");
  const [agentPresetScope, setAgentPresetScope] = useState<"council" | "agent">("council");
  const [agentPresetApplyResult, setAgentPresetApplyResult] = useState<ApplyPresetResult | null>(null);
  const [agentMemoryCategory, setAgentMemoryCategory] = useState<MemoryCategory>("episodes");
  const [agentMemoryItems, setAgentMemoryItems] = useState<MemoryEntry[]>([]);
  const [agentMemoryTruncatedNote, setAgentMemoryTruncatedNote] = useState("");
  const [agentMemorySearchQuery, setAgentMemorySearchQuery] = useState("");
  const [agentMemorySearchHits, setAgentMemorySearchHits] = useState<MemorySearchHit[]>([]);
  const [agentMemoryTitle, setAgentMemoryTitle] = useState("");
  const [agentMemoryBody, setAgentMemoryBody] = useState("");
  const [agentMemoryTags, setAgentMemoryTags] = useState("");
  const [activityItems, setActivityItems] = useState<ActivityEvent[]>([]);
  const [activityEventTypeFilter, setActivityEventTypeFilter] = useState("all");
  const [activitySearch, setActivitySearch] = useState("");
  const [workspaceBubbles, setWorkspaceBubbles] = useState<Record<string, WorkspaceBubble>>({});
  const [workspaceEditLayout, setWorkspaceEditLayout] = useState(false);
  const [workspaceAutoLayoutZones, setWorkspaceAutoLayoutZones] = useState(false);
  const [workspaceLayoutDraft, setWorkspaceLayoutDraft] = useState<Record<string, { x: number; y: number }>>({});
  const [workspaceDraggingAgentId, setWorkspaceDraggingAgentId] = useState("");
  const [councilTopic, setCouncilTopic] = useState("Council topic");
  const [councilConstraints, setCouncilConstraints] = useState("");
  const [councilMaxRounds, setCouncilMaxRounds] = useState("1");
  const [councilAutoBuild, setCouncilAutoBuild] = useState(false);
  const [councilAutoOpsSnapshot, setCouncilAutoOpsSnapshot] = useState(true);
  const [councilAutoEvidenceBundle, setCouncilAutoEvidenceBundle] = useState(false);
  const [councilAutoReleaseBundle, setCouncilAutoReleaseBundle] = useState(false);
  const [councilThreadId, setCouncilThreadId] = useState("general");
  const [councilRunId, setCouncilRunId] = useState("");
  const [councilStatus, setCouncilStatus] = useState<CouncilStatusResponse | null>(null);
  const [councilThreadKey, setCouncilThreadKey] = useState("");
  const [councilThreadKeySource, setCouncilThreadKeySource] = useState<"request_id" | "run_id" | "fallback" | "preview" | "">("");
  const [heartbeatAgentId, setHeartbeatAgentId] = useState("facilitator");
  const [heartbeatCategory, setHeartbeatCategory] = useState<MemoryCategory>("episodes");
  const [heartbeatActivityLimit, setHeartbeatActivityLimit] = useState("20");
  const [heartbeatInboxLimit, setHeartbeatInboxLimit] = useState("10");
  const [heartbeatRunsLimit, setHeartbeatRunsLimit] = useState("10");
  const [heartbeatResult, setHeartbeatResult] = useState<HeartbeatRunResult | null>(null);
  const [heartbeatSettings, setHeartbeatSettings] = useState<HeartbeatSettings | null>(null);
  const [heartbeatState, setHeartbeatState] = useState<HeartbeatState | null>(null);
  const [heartbeatSuggestSettings, setHeartbeatSuggestSettings] = useState<HeartbeatSuggestSettings | null>(null);
  const [heartbeatSuggestState, setHeartbeatSuggestState] = useState<HeartbeatSuggestState | null>(null);
  const [heartbeatSuggestAutoAcceptEnabled, setHeartbeatSuggestAutoAcceptEnabled] = useState(false);
  const [consolidationSettings, setConsolidationSettings] = useState<ConsolidationSettings | null>(null);
  const [consolidationState, setConsolidationState] = useState<ConsolidationState | null>(null);
  const [consolidationEnabled, setConsolidationEnabled] = useState(true);
  const [consolidationDailyTime, setConsolidationDailyTime] = useState("23:30");
  const [consolidationAgents, setConsolidationAgents] = useState<string[]>(["facilitator"]);
  const [consolidationResult, setConsolidationResult] = useState<any>(null);
  const [morningBriefSettings, setMorningBriefSettings] = useState<MorningBriefSettings | null>(null);
  const [morningBriefState, setMorningBriefState] = useState<MorningBriefState | null>(null);
  const [morningBriefEnabled, setMorningBriefEnabled] = useState(true);
  const [morningBriefDailyTime, setMorningBriefDailyTime] = useState("08:30");
  const [morningBriefResult, setMorningBriefResult] = useState<any>(null);
  const [threadArchiveSchedulerSettings, setThreadArchiveSchedulerSettings] = useState<ThreadArchiveSchedulerSettings | null>(null);
  const [threadArchiveSchedulerState, setThreadArchiveSchedulerState] = useState<ThreadArchiveSchedulerState | null>(null);
  const [threadArchiveSchedulerResult, setThreadArchiveSchedulerResult] = useState<ThreadArchiveSchedulerRunNowResult | null>(null);
  const [dashboardThreadArchiveScheduler, setDashboardThreadArchiveScheduler] = useState<DashboardThreadArchiveScheduler | null>(null);
  const [dashboardYesterdayMemo, setDashboardYesterdayMemo] = useState<DashboardYesterdayMemoResponse | null>(null);
  const [dashboardYesterdayMemoAgentId, setDashboardYesterdayMemoAgentId] = useState("facilitator");
  const [threadArchiveSchedEnabled, setThreadArchiveSchedEnabled] = useState(false);
  const [threadArchiveSchedDailyTime, setThreadArchiveSchedDailyTime] = useState("02:10");
  const [threadArchiveSchedThreadKeysText, setThreadArchiveSchedThreadKeysText] = useState("ops:auto_stabilize");
  const [threadArchiveSchedMaxItems, setThreadArchiveSchedMaxItems] = useState("200");
  const [threadArchiveSchedLimitScan, setThreadArchiveSchedLimitScan] = useState("5000");
  const [threadArchiveSchedMaxThreadsPerRun, setThreadArchiveSchedMaxThreadsPerRun] = useState("10");
  const [threadArchiveSchedCooldownSec, setThreadArchiveSchedCooldownSec] = useState("3600");
  const [threadArchiveSchedMaxPerDay, setThreadArchiveSchedMaxPerDay] = useState("1");
  const [threadArchiveSchedAuditSummary, setThreadArchiveSchedAuditSummary] = useState(true);
  const [threadArchiveSchedAuditPerThread, setThreadArchiveSchedAuditPerThread] = useState(false);
  const [threadArchiveSchedPerThreadTimeoutMs, setThreadArchiveSchedPerThreadTimeoutMs] = useState("5000");
  const [threadArchiveSchedTotalTimeoutMs, setThreadArchiveSchedTotalTimeoutMs] = useState("20000");
  const [threadArchiveSchedTailBytes, setThreadArchiveSchedTailBytes] = useState("1048576");
  const [dailyLoopDashboard, setDailyLoopDashboard] = useState<DailyLoopDashboard | null>(null);
  const [activeProfileState, setActiveProfileState] = useState<ActiveProfileState | null>(null);
  const [dailyLoopActionResult, setDailyLoopActionResult] = useState<any>(null);
  const [dashboardQuickActions, setDashboardQuickActions] = useState<DashboardQuickActionsResponse | null>(null);
  const [dashboardNextActions, setDashboardNextActions] = useState<DashboardNextActionsResponse | null>(null);
  const [dashboardQuickActionFocusId, setDashboardQuickActionFocusId] = useState("");
  const [dashboardQuickActionResult, setDashboardQuickActionResult] = useState<DashboardQuickActionRunResult | Record<string, unknown> | null>(null);
  const [activeProfileRevertModalOpen, setActiveProfileRevertModalOpen] = useState(false);
  const [activeProfileRevertPhrase, setActiveProfileRevertPhrase] = useState("");
  const [activeProfileRevertPreview, setActiveProfileRevertPreview] = useState<Record<string, unknown> | null>(null);
  const [activeProfileRevertResult, setActiveProfileRevertResult] = useState<Record<string, unknown> | null>(null);
  const [dashboardQuickExecuteModalOpen, setDashboardQuickExecuteModalOpen] = useState(false);
  const [dashboardQuickExecuteTarget, setDashboardQuickExecuteTarget] = useState<DashboardQuickAction | null>(null);
  const [dashboardQuickExecutePhrase, setDashboardQuickExecutePhrase] = useState("");
  const [dashboardQuickExecuteApplyPhrase, setDashboardQuickExecuteApplyPhrase] = useState("");
  const [dashboardQuickExecutePreflightResult, setDashboardQuickExecutePreflightResult] = useState<DashboardQuickActionRunResult | Record<string, unknown> | null>(null);
  const [activeExecutionTracker, setActiveExecutionTracker] = useState<ExecutionTrackerState | null>(null);
  const [trackerHistory, setTrackerHistory] = useState<ExecutionTrackerHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem(TRACKER_HISTORY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) {
        localStorage.setItem(TRACKER_HISTORY_STORAGE_KEY, "[]");
        return [];
      }
      const normalized = normalizeTrackerHistoryArray(parsed).items.slice(0, 10);
      if (normalized.length !== parsed.length) {
        localStorage.setItem(TRACKER_HISTORY_STORAGE_KEY, JSON.stringify(normalized));
      }
      return normalized;
    } catch {
      try { localStorage.setItem(TRACKER_HISTORY_STORAGE_KEY, "[]"); } catch {}
      return [];
    }
  });
  const [trackerAutoCloseOnSuccess, setTrackerAutoCloseOnSuccess] = useState(() => {
    try {
      const raw = localStorage.getItem(TRACKER_HISTORY_AUTO_CLOSE_STORAGE_KEY);
      if (raw === null || raw === undefined || raw === "") return true;
      return raw !== "0";
    } catch {
      return true;
    }
  });
  const [trackerHistoryImportOpen, setTrackerHistoryImportOpen] = useState(false);
  const [trackerHistoryImportText, setTrackerHistoryImportText] = useState("");
  const [trackerHistoryImportError, setTrackerHistoryImportError] = useState("");
  const [trackerHistoryImportReport, setTrackerHistoryImportReport] = useState("");
  const [trackerHistoryImportValidItems, setTrackerHistoryImportValidItems] = useState<ExecutionTrackerHistoryItem[] | null>(null);
  const [trackerHistoryImportSkipped, setTrackerHistoryImportSkipped] = useState(0);
  const [trackerHistoryClearOpen, setTrackerHistoryClearOpen] = useState(false);
  const [trackerHistoryClearPhrase, setTrackerHistoryClearPhrase] = useState("");
  const [trackerHistoryWorkspaceKeys, setTrackerHistoryWorkspaceKeys] = useState<Record<string, true>>({});
  const [opsQuickStatus, setOpsQuickStatus] = useState<OpsQuickActionsStatus | null>(null);
  const [opsQuickResult, setOpsQuickResult] = useState<any>(null);
  const [opsAutoStabilizeSettings, setOpsAutoStabilizeSettings] = useState<OpsAutoStabilizeSettings | null>(null);
  const [opsAutoStabilizeState, setOpsAutoStabilizeState] = useState<OpsAutoStabilizeState | null>(null);
  const [opsAutoEnabled, setOpsAutoEnabled] = useState(false);
  const [opsAutoCheckIntervalSec, setOpsAutoCheckIntervalSec] = useState("30");
  const [opsAutoCooldownSec, setOpsAutoCooldownSec] = useState("1800");
  const [opsAutoMaxPerDay, setOpsAutoMaxPerDay] = useState("3");
  const [opsAutoExecuteEnabled, setOpsAutoExecuteEnabled] = useState(false);
  const [opsAutoExecuteCooldownSec, setOpsAutoExecuteCooldownSec] = useState("3600");
  const [opsAutoExecuteMaxPerDay, setOpsAutoExecuteMaxPerDay] = useState("1");
  const [opsQuickConfirmOpen, setOpsQuickConfirmOpen] = useState(false);
  const [opsQuickPendingAction, setOpsQuickPendingAction] = useState<{ label: string; endpoint: string; payload: Record<string, unknown>; warning?: string } | null>(null);
  const [guardedActionOpen, setGuardedActionOpen] = useState(false);
  const [guardedActionPhrase, setGuardedActionPhrase] = useState("");
  const [guardedActionKind, setGuardedActionKind] = useState<GuardedActionKind | "">("");
  const [guardedActionTitle, setGuardedActionTitle] = useState("");
  const [guardedActionWarning, setGuardedActionWarning] = useState("");
  const [guardedActionPreflight, setGuardedActionPreflight] = useState<Record<string, unknown> | null>(null);
  const [dashboardSseConnected, setDashboardSseConnected] = useState(false);
  const [dashboardLastRefreshAt, setDashboardLastRefreshAt] = useState("");
  const [dashboardLastEventId, setDashboardLastEventId] = useState("");
  const [heartbeatScheduleEnabled, setHeartbeatScheduleEnabled] = useState(true);
  const [heartbeatDailyTime, setHeartbeatDailyTime] = useState("09:00");
  const [heartbeatTargetAgents, setHeartbeatTargetAgents] = useState<string[]>(["facilitator"]);
  const [heartbeatMaxPerDay, setHeartbeatMaxPerDay] = useState("1");
  const [heartbeatTickSec, setHeartbeatTickSec] = useState("15");
  const [heartbeatJitterSec, setHeartbeatJitterSec] = useState("30");
  const [heartbeatBackoffBaseSec, setHeartbeatBackoffBaseSec] = useState("30");
  const [heartbeatBackoffMaxSec, setHeartbeatBackoffMaxSec] = useState("600");
  const [heartbeatAdvancedOpen, setHeartbeatAdvancedOpen] = useState(false);
  const [heartbeatSuggestions, setHeartbeatSuggestions] = useState<HeartbeatSuggestion[]>([]);
  const [selectedHeartbeatSuggestion, setSelectedHeartbeatSuggestion] = useState<HeartbeatSuggestion | null>(null);
  const [heartbeatSuggestAcceptResult, setHeartbeatSuggestAcceptResult] = useState<HeartbeatSuggestionAcceptResult | null>(null);
  const seenWorkspaceEventsRef = useRef<Set<string>>(new Set());
  const prevAgentStatusRef = useRef<Record<string, string>>({});
  const orgAgentsRef = useRef<OrgAgent[]>([]);
  const workspaceRoomRef = useRef<HTMLDivElement | null>(null);
  const workspaceRollbackRef = useRef<Record<string, { x: number; y: number }> | null>(null);
  const activitySseRef = useRef<EventSource | null>(null);
  const activityFallbackTimerRef = useRef<number | null>(null);
  const activitySeenIdsRef = useRef<string[]>([]);
  const activitySseFailedRef = useRef<Record<string, boolean>>({ activity: false, workspace: false });
  const characterSheetActivitySseRef = useRef<EventSource | null>(null);
  const characterSheetActivityPollRef = useRef<number | null>(null);
  const characterSheetActivitySeenRef = useRef<string[]>([]);
  const dashboardSseRef = useRef<EventSource | null>(null);
  const dashboardPollTimerRef = useRef<number | null>(null);
  const dashboardDebounceTimerRef = useRef<number | null>(null);
  const dashboardActiveProfileCardRef = useRef<HTMLElement | null>(null);
  const dashboardQuickActionsCardRef = useRef<HTMLElement | null>(null);
  const dashboardLastRefreshMsRef = useRef(0);
  const dashboardRefreshInflightRef = useRef(false);
  const dashboardQuickActionInflightRef = useRef<Record<string, boolean>>({});
  const dashboardQuickActionDebounceRef = useRef<Record<string, number>>({});
  const dashboardQuickExecuteInflightRef = useRef<Record<string, boolean>>({});
  const dashboardQuickExecutePreflightDoneRef = useRef<Record<string, boolean>>({});
  const activeProfileRevertInflightRef = useRef(false);
  const executionTrackerTimerRef = useRef<number | null>(null);
  const executionTrackerPollInflightRef = useRef(false);
  const activeExecutionTrackerRef = useRef<ExecutionTrackerState | null>(null);
  const executionTrackerTerminalLoggedRef = useRef<string>("");
  const trackerHistorySaveTimerRef = useRef<number | null>(null);
  const trackerHistoryRestoreInflightRef = useRef(false);
  const trackerHistoryRestoreDoneRef = useRef(false);
  const officeLayoutSkipSaveRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const commandPaletteInputRef = useRef<HTMLInputElement | null>(null);

  const chatThreadId = useMemo(() => (CHAT_CHANNELS.includes(activeChannel) ? activeChannel : "general"), [activeChannel]);
  const currentArtifacts: string[] = selectedRunDetail?.artifacts?.files || [];

  async function refreshThreads(): Promise<void> {
    const data = await apiGet<{ threads: Thread[] }>("/api/chat/threads");
    setThreads(data.threads || []);
  }

  async function refreshReadState(): Promise<void> {
    const data = await apiGet<{ read_state: ReadStateMap }>("/api/chat/read_state");
    setReadState(data.read_state || {});
  }

  async function refreshMessages(): Promise<void> {
    const data = await apiGet<{ thread_id: string; messages: ChatMessage[] }>(`/api/chat/threads/${chatThreadId}/messages?limit=200`);
    setMessages(data.messages || []);
  }

  async function refreshPins(): Promise<void> {
    const data = await apiGet<{ pins: string[] }>(`/api/chat/threads/${chatThreadId}/pins`);
    setPins(Array.isArray(data.pins) ? data.pins : []);
  }

  async function markRead(msgId: string): Promise<void> {
    if (!msgId) return;
    await apiPost(`/api/chat/threads/${chatThreadId}/read_state`, { last_seen_msg_id: msgId, last_read_at: new Date().toISOString() });
    await refreshReadState();
  }

  async function refreshUnreadSummary(): Promise<void> {
    if (!threads.length) return;
    const counts: Record<string, number> = {};
    const mentions: Record<string, boolean> = {};
    await Promise.all(
      threads.map(async (t) => {
        const res = await apiGet<{ messages: ChatMessage[] }>(`/api/chat/threads/${t.id}/messages?limit=1`);
        const latest = Array.isArray(res.messages) && res.messages.length > 0 ? res.messages[res.messages.length - 1] : null;
        const seen = readState[t.id]?.last_seen_msg_id || "";
        counts[t.id] = latest && latest.id !== seen ? 1 : 0;
        mentions[t.id] = !!(latest && String(latest.text || "").includes("@"));
      }),
    );
    setUnreadCount(counts);
    setMentionFlag(mentions);
  }

  function computeInboxUnreadCount(items: InboxItem[], readState: InboxReadState): number {
    const globalTs = String(readState.global_last_read_ts || "");
    const globalMs = globalTs ? new Date(globalTs).getTime() : 0;
    if (!globalMs) return items.length;
    return items.filter((it) => {
      const tsMs = new Date(String(it.ts || "")).getTime();
      return Number.isFinite(tsMs) && tsMs > globalMs;
    }).length;
  }

  async function refreshRuns(): Promise<void> {
    const data = await apiGet<{ runs: RunRow[] }>("/api/runs?limit=80");
    setRuns(data.runs || []);
  }

  async function refreshRecipes(): Promise<void> {
    const data = await apiGet<{ recipes: Recipe[] }>("/api/ssot/recipes");
    setRecipes(data.recipes || []);
  }

  async function refreshDesigns(): Promise<void> {
    const data = await apiGet<{ latest?: string; files?: string[] }>("/api/designs");
    setDesignLatest(data.latest || "");
    setDesignList(data.files || []);
    if (!selectedDesign && data.files && data.files.length > 0) {
      setSelectedDesign(data.files[data.files.length - 1]);
    }
  }

  async function refreshClipboard(): Promise<void> {
    const data = await apiGet<{ items: any[] }>("/api/chat/clipboard");
    setClipHistory(data.items || []);
  }

  function showToast(message: string): void {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function loadDesktopSettingsUi(): Promise<void> {
    const out = await apiGet<{ settings: DesktopSettings }>("/api/desktop/settings");
    setDesktopSettingsForm(settingsToForm(out.settings || DESKTOP_SETTINGS_DEFAULT));
    const stateOut = await apiGet<{ notify_state: DesktopNotifyState }>("/api/desktop/notify_state");
    setDesktopNotifyState(stateOut.notify_state || null);
    setStatus("settings_loaded");
  }

  async function saveDesktopSettingsUi(): Promise<void> {
    const tokens = desktopSettingsForm.mention_tokens_lines
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter((x) => !!x);
    const payload = {
      api_base_url: desktopSettingsForm.api_base_url.trim(),
      poll_interval_ms: Number(desktopSettingsForm.poll_interval_ms || 0),
      throttle_sec: Number(desktopSettingsForm.throttle_sec || 0),
      mention: {
        enabled: !!desktopSettingsForm.mention_enabled,
        tokens,
        aliases: parseAliases(desktopSettingsForm.mention_aliases_lines),
        priority_throttle_sec: Number(desktopSettingsForm.mention_priority_throttle_sec || 0),
        normal_throttle_sec: Number(desktopSettingsForm.throttle_sec || 0),
      },
      hotkeys: {
        focus_chatgpt: desktopSettingsForm.hotkey_focus_chatgpt,
        send_confirm: desktopSettingsForm.hotkey_send_confirm,
        capture_last: desktopSettingsForm.hotkey_capture_last,
        focus_region: desktopSettingsForm.hotkey_focus_region,
      },
    };
    const out = await apiPost<{ settings: DesktopSettings }>("/api/desktop/settings", payload);
    setDesktopSettingsForm(settingsToForm(out.settings || DESKTOP_SETTINGS_DEFAULT));
    setStatus("settings_saved");
    showToast("Settings saved");
  }

  async function resetDesktopSettingsUi(): Promise<void> {
    const out = await apiPost<{ settings: DesktopSettings }>("/api/desktop/settings", DESKTOP_SETTINGS_DEFAULT);
    setDesktopSettingsForm(settingsToForm(out.settings || DESKTOP_SETTINGS_DEFAULT));
    setStatus("settings_reset");
    showToast("Settings reset to defaults");
  }

  async function refreshInbox(): Promise<void> {
    const out = await apiGet<{ items: InboxItem[] }>("/api/inbox?limit=200");
    setInboxItems(Array.isArray(out.items) ? out.items : []);
  }

  async function loadInboxThreadView(threadKeyInput: string, limit = 20): Promise<void> {
    const key = String(threadKeyInput || "").trim();
    if (!key) {
      setInboxThreadViewStatus("thread_key missing");
      setInboxThreadViewItems([]);
      setInboxThreadViewKey("");
      return;
    }
    setInboxThreadViewStatus("loading...");
    const out = await apiGet<{ thread_key: string; items: InboxItem[] }>(`/api/inbox/thread?key=${encodeURIComponent(key)}&limit=${Math.max(1, Math.min(100, Math.floor(limit) || 20))}`);
    setInboxThreadViewItems(Array.isArray(out.items) ? out.items : []);
    setInboxThreadViewKey(String(out.thread_key || key));
    setInboxThreadViewStatus(`loaded ${Array.isArray(out.items) ? out.items.length : 0}`);
  }

  async function refreshInboxReadState(): Promise<void> {
    const out = await apiGet<{ read_state: InboxReadState }>("/api/inbox/read_state");
    setInboxReadState(out.read_state || { global_last_read_ts: "", by_thread: {} });
  }

  async function refreshTaskifyDrafts(): Promise<void> {
    const out = await apiGet<{ items: TaskifyDraft[] }>("/api/taskify/drafts?limit=50");
    const items = Array.isArray(out.items) ? out.items : [];
    setTaskifyDrafts(items);
    if (!selectedTaskifyDraft && items.length > 0) {
      setSelectedTaskifyDraft(items[0]);
    }
  }

  async function refreshOrgAgents(): Promise<void> {
    const out = await apiGet<OrgAgentsSnapshot>("/api/org/agents");
    const items = Array.isArray(out.agents) ? out.agents : [];
    setOrgAgents(items);
    if (!selectedAgentId && items.length > 0) {
      const first = items[0];
      setSelectedAgentId(first.id);
      setAgentEditStatus(first.status);
      setAgentEditThreadId(first.assigned_thread_id || "none");
    }
  }

  async function refreshOrgGuests(): Promise<void> {
    const out = await apiGet<GuestsDoc>("/api/org/guests");
    const items = Array.isArray(out.guests) ? out.guests : [];
    setOrgGuests(items);
    if (!selectedGuestId && items.length > 0) {
      setSelectedGuestId(items[0].id);
    }
  }

  async function refreshGuestKeys(): Promise<void> {
    const out = await apiGet<GuestKeysDoc>("/api/org/guest_keys");
    setGuestKeys(Array.isArray(out.keys) ? out.keys : []);
  }

  async function createGuestKey(): Promise<void> {
    const out = await apiPost<GuestKeyEntry>("/api/org/guest_keys/new", { label: guestKeysLabel.trim() });
    await refreshGuestKeys();
    setGuestJoinKeyInput(String(out.join_key || ""));
    showToast("Guest key created");
  }

  async function revokeGuestKey(joinKey: string): Promise<void> {
    const key = String(joinKey || "").trim();
    if (!key) return;
    await apiPost("/api/org/guest_keys/revoke", { join_key: key });
    await refreshGuestKeys();
    showToast("Guest key revoked");
  }

  async function guestJoin(): Promise<void> {
    const joinKey = String(guestJoinKeyInput || "").trim();
    const guestId = String(guestJoinId || "").trim();
    const displayName = String(guestJoinDisplayName || "").trim();
    if (!joinKey || !guestId || !displayName) return;
    await apiPost("/api/org/guests/join", {
      join_key: joinKey,
      guest_id: guestId,
      display_name: displayName,
    });
    await Promise.all([refreshOrgGuests(), refreshActivity()]);
    setSelectedGuestId(guestId);
    showToast("Guest joined");
  }

  async function guestPush(): Promise<void> {
    const guestId = String(selectedGuestId || "").trim();
    const joinKey = String(guestJoinKeyInput || "").trim();
    if (!guestId || !joinKey) return;
    await apiPost("/api/org/guests/push", {
      join_key: joinKey,
      guest_id: guestId,
      status: guestPushStatus,
      note: guestPushNote,
    });
    await Promise.all([refreshOrgGuests(), refreshActivity()]);
    showToast("Guest status pushed");
  }

  async function guestLeave(): Promise<void> {
    const guestId = String(selectedGuestId || "").trim();
    const joinKey = String(guestJoinKeyInput || "").trim();
    if (!guestId || !joinKey) return;
    await apiPost("/api/org/guests/leave", {
      join_key: joinKey,
      guest_id: guestId,
    });
    await Promise.all([refreshOrgGuests(), refreshActivity()]);
    showToast("Guest left");
  }

  async function refreshDashboardYesterdayMemo(agentIdInput?: string): Promise<void> {
    const agentId = String(agentIdInput || dashboardYesterdayMemoAgentId || "facilitator").trim() || "facilitator";
    const out = await apiGet<DashboardYesterdayMemoResponse>(`/api/dashboard/yesterday_memo?agent_id=${encodeURIComponent(agentId)}&category=episodes&limit=1`);
    setDashboardYesterdayMemo(out);
  }

  async function refreshAgentPresets(): Promise<void> {
    const out = await apiGet<AgentPresetsListResponse>("/api/org/agent_presets");
    const items = Array.isArray(out.presets) ? out.presets : [];
    setAgentPresetItems(items);
    if (!items.find((x) => x.preset_set_id === agentPresetSelectedId)) {
      setAgentPresetSelectedId(items[0]?.preset_set_id || "standard");
    }
  }

  async function applyAgentPreset(dryRun: boolean): Promise<void> {
    const preset_set_id = String(agentPresetSelectedId || "").trim();
    if (!preset_set_id) return;
    const payload: Record<string, unknown> = {
      preset_set_id,
      scope: agentPresetScope,
      dry_run: dryRun,
      actor_id: "ui_discord",
    };
    if (agentPresetScope === "agent") payload.agent_id = selectedAgentId;
    const out = await apiPost<ApplyPresetResult>("/api/org/agents/apply_preset", payload);
    setAgentPresetApplyResult(out);
    if (!dryRun) {
      await Promise.all([refreshOrgAgents(), refreshActivity()]);
    }
    showToast(dryRun ? "Preset dry-run completed" : "Preset applied");
  }

  async function saveSelectedAgent(): Promise<void> {
    const id = String(selectedAgentId || "").trim();
    if (!id) return;
    const toList = (text: string): string[] =>
      String(text || "")
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter((x) => !!x)
        .slice(0, 5);
    await apiPost<OrgAgentsSnapshot>("/api/org/agents", {
      agents: [{
        id,
        status: agentEditStatus,
        assigned_thread_id: agentEditThreadId === "none" ? null : agentEditThreadId,
        identity: {
          tagline: agentIdentityTagline,
          speaking_style: agentIdentitySpeakingStyle,
          focus: agentIdentityFocus,
          values: toList(agentIdentityValues),
          strengths: toList(agentIdentityStrengths),
          weaknesses: toList(agentIdentityWeaknesses),
          do: toList(agentIdentityDo),
          dont: toList(agentIdentityDont),
        },
      }],
      actor_id: "ui_discord",
    });
    await Promise.all([refreshOrgAgents(), refreshActivity()]);
    showToast("Member saved");
  }

  async function refreshAgentMemory(agentIdInput?: string, categoryInput?: MemoryCategory): Promise<void> {
    const agentId = String(agentIdInput || selectedAgentId || "").trim();
    const category = (categoryInput || agentMemoryCategory) as MemoryCategory;
    if (!agentId) {
      setAgentMemoryItems([]);
      setAgentMemoryTruncatedNote("");
      return;
    }
    const out = await apiGet<{ agent_id: string; category: MemoryCategory; items: MemoryEntry[]; truncated?: boolean; note?: string }>(
      `/api/memory/${encodeURIComponent(agentId)}/${encodeURIComponent(category)}?limit=50`,
    );
    setAgentMemoryItems(Array.isArray(out.items) ? out.items : []);
    setAgentMemoryTruncatedNote(String(out.note || ""));
  }

  async function searchAgentMemory(): Promise<void> {
    const q = agentMemorySearchQuery.trim();
    if (!q) {
      setAgentMemorySearchHits([]);
      return;
    }
    const out = await apiGet<{ hits: MemorySearchHit[] }>(`/api/memory/search?q=${encodeURIComponent(q)}&limit=50`);
    setAgentMemorySearchHits(Array.isArray(out.hits) ? out.hits : []);
  }

  async function appendAgentMemory(category: MemoryCategory): Promise<void> {
    const agentId = String(selectedAgentId || "").trim();
    if (!agentId) return;
    const tags = String(agentMemoryTags || "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => !!x)
      .slice(0, 10);
    await apiPost<MemoryEntry>(`/api/memory/${encodeURIComponent(agentId)}/${encodeURIComponent(category)}`, {
      title: agentMemoryTitle,
      body: agentMemoryBody,
      tags,
      source: "ui",
      refs: { thread_id: selectedAgent?.assigned_thread_id || undefined },
    });
    setAgentMemoryTitle("");
    setAgentMemoryBody("");
    setAgentMemoryTags("");
    await Promise.all([refreshAgentMemory(agentId, category), refreshActivity()]);
    showToast(`Memory saved: ${category}`);
  }

  async function refreshActivity(): Promise<void> {
    const out = await apiGet<{ items: ActivityEvent[] }>("/api/activity?limit=200");
    const items = Array.isArray(out.items) ? out.items : [];
    setActivityItems(items);
    activitySeenIdsRef.current = items.map((x) => String(x.id || "")).slice(0, 200);
  }

  function ingestActivityItems(newItems: ActivityEvent[]): void {
    if (!newItems.length) return;
    const dedupe = new Set(activitySeenIdsRef.current);
    const merged: ActivityEvent[] = [];
    for (const item of newItems) {
      const id = String(item.id || "").trim();
      if (!id || dedupe.has(id)) continue;
      dedupe.add(id);
      merged.push(item);
    }
    if (!merged.length) return;
    setActivityItems((prev) => {
      const map = new Map<string, ActivityEvent>();
      for (const item of merged) map.set(String(item.id || ""), item);
      for (const item of prev) {
        const id = String(item.id || "");
        if (!id || map.has(id)) continue;
        map.set(id, item);
      }
      const list = Array.from(map.values())
        .sort((a, b) => (String(a.ts || "") < String(b.ts || "") ? 1 : -1))
        .slice(0, 200);
      activitySeenIdsRef.current = list.map((x) => String(x.id || "")).slice(0, 200);
      return list;
    });
  }

  function addWorkspaceBubble(agentId: string, title: string, summary: string, refs?: { run_id?: string; thread_id?: string }, eventId?: string): void {
    const id = String(agentId || "").trim();
    if (!id) return;
    setWorkspaceBubbles((prev) => ({
      ...prev,
      [id]: {
        event_id: eventId || `local_${Date.now()}_${id}`,
        title: String(title || "").slice(0, 80),
        summary: String(summary || "").slice(0, 180),
        expires_at: Date.now() + 4500,
        run_id: refs?.run_id || "",
        thread_id: refs?.thread_id || "",
      },
    }));
  }

  function parseChangedAgentIds(summary: string): string[] {
    const s = String(summary || "");
    const m = s.match(/changed_ids=([A-Za-z0-9_,-]+)/i);
    if (!m || !m[1]) return [];
    return m[1].split(",").map((x) => x.trim()).filter((x) => !!x);
  }

  function ingestWorkspaceActivity(items: ActivityEvent[]): void {
    const seen = seenWorkspaceEventsRef.current;
    if (seen.size === 0) {
      for (const item of items) seen.add(String(item.id || ""));
      return;
    }
    const knownAgentIds = new Set(orgAgentsRef.current.map((a) => a.id));
    const orderedNew = items.slice().reverse().filter((item) => !seen.has(String(item.id || "")));
    for (const item of orderedNew) {
      const eid = String(item.id || "");
      if (eid) seen.add(eid);
      const actorId = String(item.actor_id || "").trim();
      if (actorId && knownAgentIds.has(actorId)) {
        addWorkspaceBubble(actorId, item.title, item.summary, { run_id: item.refs?.run_id, thread_id: item.refs?.thread_id }, eid);
      }
      if (item.event_type === "agents_updated") {
        const changedIds = parseChangedAgentIds(item.summary);
        for (const changedId of changedIds) {
          if (!knownAgentIds.has(changedId)) continue;
          addWorkspaceBubble(changedId, item.title || "Agents updated", item.summary || "status changed", { run_id: item.refs?.run_id, thread_id: item.refs?.thread_id }, eid);
        }
      }
    }
  }

  async function createTaskifyDraft(payload: {
    source: { thread_id?: string; msg_id?: string; inbox_id?: string };
    title?: string;
    text: string;
    links?: ChatLinks;
    notes?: string;
  }): Promise<TaskifyDraft> {
    const out = await apiPost<TaskifyDraft>("/api/taskify/drafts", payload);
    await refreshTaskifyDrafts();
    setSelectedTaskifyDraft(out);
    return out;
  }

  async function copyTaskifyYaml(yamlText: string): Promise<void> {
    await navigator.clipboard.writeText(yamlText);
    showToast("Task YAML copied");
  }

  async function taskifyFromMessage(msg: ChatMessage, copyOnly: boolean): Promise<void> {
    const draft = await createTaskifyDraft({
      source: { thread_id: msg.thread_id, msg_id: msg.id },
      title: `${msg.thread_id}: ${msg.text.slice(0, 60)}`,
      text: msg.text || "",
      links: msg.links || {},
    });
    if (copyOnly) {
      await copyTaskifyYaml(draft.task_yaml);
      return;
    }
    setActiveChannel("drafts");
    showToast("Task draft created");
  }

  async function taskifyFromInbox(item: InboxItem, copyOnly: boolean): Promise<void> {
    const draft = await createTaskifyDraft({
      source: { thread_id: item.thread_id, msg_id: item.msg_id, inbox_id: item.id },
      title: `${item.thread_id || "inbox"}: ${(item.title || item.body || "").slice(0, 60)}`,
      text: `${item.title || ""}\n${item.body || ""}`.trim(),
      links: item.links || {},
    });
    if (copyOnly) {
      await copyTaskifyYaml(draft.task_yaml);
      return;
    }
    setActiveChannel("drafts");
    showToast("Task draft created");
  }

  async function deleteTaskifyDraft(id: string): Promise<void> {
    await apiDelete(`/api/taskify/drafts/${encodeURIComponent(id)}`);
    await refreshTaskifyDrafts();
    if (selectedTaskifyDraft?.id === id) {
      setSelectedTaskifyDraft(null);
    }
    showToast("Task draft deleted");
  }

  async function refreshTaskifyTrackingByDraft(draftId: string): Promise<void> {
    if (!draftId) {
      setTaskifyTrackingItem(null);
      return;
    }
    const out = await apiGet<{ item?: TaskifyQueueTrackingEntry | null }>(`/api/taskify/queue/status?draft_id=${encodeURIComponent(draftId)}`);
    setTaskifyTrackingItem((out.item || null) as TaskifyQueueTrackingEntry | null);
  }

  async function queueTaskifyDraft(draft: TaskifyDraft): Promise<void> {
    try {
      const out = await apiPost<TaskifyQueueResult>("/api/taskify/queue", { draft_id: draft.id });
      setTaskifyQueueResult(out);
      await refreshTaskifyTrackingByDraft(draft.id);
      if (out.queued) {
        showToast("Task draft queued");
        setActiveChannel("runs");
        await refreshRuns();
      } else {
        showToast("Task queue failed");
      }
    } catch (e: any) {
      showToast(`Task queue failed: ${String(e?.message || e)}`);
    }
  }

  async function markInboxAllRead(): Promise<void> {
    const latestTs = inboxItems.length > 0 ? String(inboxItems[0].ts || new Date().toISOString()) : new Date().toISOString();
    await apiPost("/api/inbox/read_state", { last_read_ts: latestTs });
    await refreshInboxReadState();
    showToast("Inbox marked as read");
  }

  function inboxHasLinks(item: InboxItem): boolean {
    const links = item.links || {};
    return !!(links.run_id || links.design_id || (Array.isArray(links.artifact_paths) && links.artifact_paths.length > 0));
  }

  async function markInboxReadForItems(items: InboxItem[], label: string): Promise<void> {
    if (!items.length) {
      showToast(`No items for ${label}`);
      return;
    }
    const maxTs = items
      .map((it) => String(it.ts || ""))
      .filter((x) => !!x)
      .sort()
      .slice(-1)[0] || new Date().toISOString();
    await apiPost("/api/inbox/read_state", { last_read_ts: maxTs });
    await refreshInboxReadState();
    showToast(`Marked read: ${label} (${items.length})`);
  }

  async function markInboxReadForThread(threadKeyInput: string, estimateCount: number): Promise<void> {
    const threadKey = String(threadKeyInput || "").trim();
    if (!threadKey) {
      showToast("thread_key missing");
      return;
    }
    const ok = window.confirm(`Mark read this thread?\nthread_key=${threadKey}\nestimated_items=${Math.max(0, Number(estimateCount || 0))}`);
    if (!ok) return;
    const out = await apiPost<{ thread_key: string; marked_read: number; scanned: number; exit_code: number }>("/api/inbox/thread/read_state", {
      thread_key: threadKey,
      mode: "mark_read",
    });
    showToast(`Thread marked read: ${out.thread_key} (+${Number(out.marked_read || 0)})`);
    await refreshInboxReadState();
    await refreshInbox();
    await loadInboxThreadView(threadKey, 20);
  }

  async function archiveInboxThread(dryRun: boolean): Promise<void> {
    const threadKey = String(inboxThreadViewKey || selectedInboxItem?.thread_key || "").trim();
    if (!threadKey) {
      showToast("thread_key missing");
      return;
    }
    const confirmText = [
      dryRun ? "Archive this thread (dry-run)?" : "Archive this thread?",
      `thread_key=${threadKey}`,
      "since_ts=(server default from archive state)",
      "max_items=200, limit_scan=5000",
      "This does NOT delete or compact inbox.jsonl.",
    ].join("\n");
    if (!window.confirm(confirmText)) return;
    const out = await apiPost<InboxThreadArchiveResult>("/api/inbox/thread/archive", {
      thread_key: threadKey,
      dry_run: dryRun,
      max_items: 200,
      limit_scan: 5000,
    });
    setInboxThreadArchiveResult(out);
    showToast(dryRun ? `Archive dry-run: ${Number(out.archived || 0)}` : `Thread archived: ${Number(out.archived || 0)}`);
    await refreshInbox();
    await loadInboxThreadView(threadKey, 20);
  }

  async function runInboxCompact(dryRun: boolean): Promise<void> {
    const maxLinesNum = Number(inboxCompactMaxLines || 5000);
    const out = await apiPost<InboxCompactResult>("/api/inbox/compact", {
      max_lines: Number.isFinite(maxLinesNum) && maxLinesNum > 0 ? Math.floor(maxLinesNum) : 5000,
      dry_run: dryRun,
    });
    setInboxCompactResult(out);
    if (out.exit_code === 0) {
      showToast(dryRun ? "Inbox compact dry-run ok" : "Inbox compact completed");
      if (!dryRun) {
        await refreshInbox();
      }
    } else {
      showToast("Inbox compact failed");
    }
  }

  async function runEvidenceExport(dryRun: boolean): Promise<void> {
    const maxRunsNum = Number(evidenceMaxRuns || 20);
    const out = await apiPost<EvidenceExportResult>("/api/export/evidence_bundle", {
      max_runs: Number.isFinite(maxRunsNum) && maxRunsNum > 0 ? Math.floor(maxRunsNum) : 20,
      include_archives: evidenceIncludeArchives,
      dry_run: dryRun,
    });
    setEvidenceExportResult(out);
    if (out.queued) {
      showToast(`Evidence export queued: ${out.request_id || out.task_id || ""}`);
      setActiveChannel("runs");
      await refreshRuns();
      return;
    }
    showToast(dryRun ? "Evidence export dry-run ok" : "Evidence export done");
  }

  async function refreshOpsSnapshotStatus(requestId: string): Promise<void> {
    const id = String(requestId || "").trim();
    if (!id) return;
    const out = await apiGet<OpsSnapshotResult>(`/api/export/ops_snapshot/status?request_id=${encodeURIComponent(id)}`);
    setOpsSnapshotResult((prev) => ({ ...(prev || {}), ...out }));
  }

  async function runOpsSnapshot(dryRun: boolean): Promise<void> {
    const inboxLimitNum = Number(opsSnapshotInboxLimit || 20);
    const runsLimitNum = Number(opsSnapshotRunsLimit || 10);
    const out = await apiPost<OpsSnapshotResult>("/api/export/ops_snapshot", {
      inbox_limit: Number.isFinite(inboxLimitNum) && inboxLimitNum > 0 ? Math.floor(inboxLimitNum) : 20,
      runs_limit: Number.isFinite(runsLimitNum) && runsLimitNum > 0 ? Math.floor(runsLimitNum) : 10,
      dry_run: dryRun,
    });
    setOpsSnapshotResult(out);
    if (out.queued) {
      showToast(`Ops snapshot queued: ${out.request_id || out.task_id || ""}`);
      setActiveChannel("runs");
      await refreshRuns();
      return;
    }
    showToast(dryRun ? "Ops snapshot dry-run ok" : "Ops snapshot done");
  }

  async function refreshMorningBriefBundleStatus(requestId: string): Promise<void> {
    const id = String(requestId || "").trim();
    if (!id) return;
    const out = await apiGet<MorningBriefBundleResult>(`/api/export/morning_brief_bundle/status?request_id=${encodeURIComponent(id)}`);
    setMorningBriefBundleResult((prev) => ({ ...(prev || {}), ...out }));
  }

  async function runMorningBriefBundle(dryRun: boolean): Promise<void> {
    const payload: Record<string, unknown> = {
      dry_run: dryRun,
      include_ops_snapshot: morningBriefBundleIncludeOpsSnapshot,
    };
    const date = String(morningBriefBundleDate || "").trim();
    if (date) payload.date = date;
    const out = await apiPost<MorningBriefBundleResult>("/api/export/morning_brief_bundle", payload);
    setMorningBriefBundleResult(out);
    if (out.queued) {
      showToast(`Morning brief bundle queued: ${out.request_id || out.task_id || ""}`);
      setActiveChannel("runs");
      await refreshRuns();
      return;
    }
    showToast(dryRun ? "Morning brief bundle dry-run ok" : "Morning brief bundle done");
  }

  async function refreshCouncilStatus(runIdInput?: string): Promise<void> {
    const rid = String(runIdInput || councilRunId || "").trim();
    if (!rid) return;
    const out = await apiGet<CouncilStatusResponse>(`/api/council/run/status?run_id=${encodeURIComponent(rid)}&log_limit=20`);
    setCouncilStatus(out);
    setCouncilRunId(String(out.run?.run_id || rid));
    setCouncilThreadKey(isValidInboxThreadKey(out.run?.thread_key) ? String(out.run?.thread_key || "").trim().toLowerCase() : "");
    setCouncilThreadKeySource((out.run?.thread_key_source || "") as "request_id" | "run_id" | "fallback" | "preview" | "");
    setStatus(`council:${String(out.run?.status || "unknown")}`);
  }

  async function startCouncilRun(): Promise<void> {
    const maxRounds = Number(councilMaxRounds || "1");
    const out = await apiPost<CouncilRunRecord>("/api/council/run", {
      topic: councilTopic,
      constraints: councilConstraints,
      max_rounds: Number.isFinite(maxRounds) ? maxRounds : 1,
      auto_build: councilAutoBuild,
      auto_ops_snapshot: councilAutoOpsSnapshot,
      auto_evidence_bundle: councilAutoEvidenceBundle,
      auto_release_bundle: councilAutoReleaseBundle,
      thread_id: councilThreadId || "general",
    });
    setCouncilRunId(String(out.run_id || ""));
    setCouncilStatus({ run: out, logs: [], skipped_invalid: 0 });
    setCouncilThreadKey(isValidInboxThreadKey(out.thread_key) ? String(out.thread_key || "").trim().toLowerCase() : "");
    setCouncilThreadKeySource((out.thread_key_source || "") as "request_id" | "run_id" | "fallback" | "preview" | "");
    setStatus(`council_started:${out.run_id}`);
    showToast("Council autopilot started");
  }

  async function cancelCouncilRun(): Promise<void> {
    const rid = String(councilRunId || "").trim();
    if (!rid) return;
    const out = await apiPost<{ run: CouncilRunRecord }>("/api/council/run/cancel", { run_id: rid });
    setCouncilStatus((prev) => ({ run: out.run, logs: prev?.logs || [], skipped_invalid: prev?.skipped_invalid || 0 }));
    setStatus(`council_cancel_requested:${rid}`);
    showToast("Council cancel requested");
  }

  async function resumeCouncilRun(): Promise<void> {
    const rid = String(councilRunId || "").trim();
    if (!rid) return;
    const out = await apiPost<CouncilRunRecord>("/api/council/run", {
      resume: true,
      run_id: rid,
      auto_ops_snapshot: councilAutoOpsSnapshot,
      auto_evidence_bundle: councilAutoEvidenceBundle,
      auto_release_bundle: councilAutoReleaseBundle,
    });
    setCouncilStatus((prev) => ({ run: out, logs: prev?.logs || [], skipped_invalid: prev?.skipped_invalid || 0 }));
    setCouncilThreadKey(isValidInboxThreadKey(out.thread_key) ? String(out.thread_key || "").trim().toLowerCase() : "");
    setCouncilThreadKeySource((out.thread_key_source || "") as "request_id" | "run_id" | "fallback" | "preview" | "");
    setStatus(`council_resumed:${rid}`);
    showToast("Council resumed");
  }

  function openCouncilThreadByKey(): void {
    const key = String(councilThreadKey || councilStatus?.run?.thread_key || "").trim().toLowerCase();
    if (!isValidInboxThreadKey(key)) {
      showToast("thread_key missing");
      return;
    }
    openTrackerThread(key);
  }

  async function copyCouncilThreadKey(): Promise<void> {
    const key = String(councilThreadKey || councilStatus?.run?.thread_key || "").trim().toLowerCase();
    if (!isValidInboxThreadKey(key)) {
      showToast("thread_key missing");
      return;
    }
    await navigator.clipboard.writeText(key);
    showToast("thread_key copied");
  }

  async function runSearch(): Promise<void> {
    const q = searchQuery.trim();
    if (!q) {
      setSearchHits([]);
      return;
    }
    const data = await apiGet<{ hits: SearchHit[] }>(`/api/chat/search?q=${encodeURIComponent(q)}`);
    setSearchHits(Array.isArray(data.hits) ? data.hits : []);
  }

  async function runHeartbeat(dryRun: boolean, override?: { agentId?: string; category?: MemoryCategory }): Promise<HeartbeatRunResult | null> {
    const agentId = String(override?.agentId || heartbeatAgentId || "facilitator").trim() || "facilitator";
    const category = (override?.category || heartbeatCategory) as MemoryCategory;
    const activityLimit = Number(heartbeatActivityLimit || "20");
    const inboxLimit = Number(heartbeatInboxLimit || "10");
    const runsLimit = Number(heartbeatRunsLimit || "10");
    const out = await apiPost<HeartbeatRunResult>("/api/heartbeat/run", {
      agent_id: agentId,
      category,
      activity_limit: Number.isFinite(activityLimit) ? activityLimit : 20,
      inbox_limit: Number.isFinite(inboxLimit) ? inboxLimit : 10,
      runs_limit: Number.isFinite(runsLimit) ? runsLimit : 10,
      dry_run: dryRun,
    });
    setHeartbeatResult(out);
    if (!dryRun) {
      await Promise.all([refreshActivity(), refreshInbox()]);
    }
    return out;
  }

  async function runWorkspaceHeartbeat(agent: OrgAgent): Promise<void> {
    const out = await runHeartbeat(false, { agentId: agent.id, category: "episodes" });
    if (!out || !out.created_entry) {
      showToast("Heartbeat run finished (no entry)");
      return;
    }
    showToast("Heartbeat appended");
    openAgentMemory(agent.id, "episodes");
    await refreshAgentMemory(agent.id, "episodes");
  }

  async function refreshHeartbeatSettings(): Promise<void> {
    const out = await apiGet<HeartbeatSettings>("/api/heartbeat/settings");
    setHeartbeatSettings(out);
    setHeartbeatScheduleEnabled(!!out.enabled);
    setHeartbeatDailyTime(String(out.schedule?.daily_time || "09:00"));
    setHeartbeatCategory(out.targets?.category || "episodes");
    setHeartbeatTargetAgents(Array.isArray(out.targets?.agent_ids) && out.targets.agent_ids.length ? out.targets.agent_ids : ["facilitator"]);
    setHeartbeatMaxPerDay(String(out.limits?.max_per_day ?? 1));
    setHeartbeatActivityLimit(String(out.limits?.activity_limit ?? 20));
    setHeartbeatInboxLimit(String(out.limits?.inbox_limit ?? 10));
    setHeartbeatRunsLimit(String(out.limits?.runs_limit ?? 10));
    setHeartbeatTickSec(String(out.schedule?.tick_interval_sec ?? 15));
    setHeartbeatJitterSec(String(out.schedule?.jitter_sec ?? 30));
    setHeartbeatBackoffBaseSec(String(out.safety?.backoff_base_sec ?? 30));
    setHeartbeatBackoffMaxSec(String(out.safety?.backoff_max_sec ?? 600));
  }

  async function refreshHeartbeatState(): Promise<void> {
    const out = await apiGet<HeartbeatState>("/api/heartbeat/state");
    setHeartbeatState(out);
  }

  async function refreshHeartbeatSuggestSettings(): Promise<void> {
    const out = await apiGet<HeartbeatSuggestSettings>("/api/heartbeat/autopilot_suggest_settings");
    setHeartbeatSuggestSettings(out);
    setHeartbeatSuggestAutoAcceptEnabled(!!out.auto_accept_enabled);
  }

  async function saveHeartbeatSuggestSettings(): Promise<void> {
    const out = await apiPost<HeartbeatSuggestSettings>("/api/heartbeat/autopilot_suggest_settings", {
      auto_accept_enabled: heartbeatSuggestAutoAcceptEnabled,
    });
    setHeartbeatSuggestSettings(out);
    await refreshHeartbeatSuggestState();
    showToast("Auto-accept settings saved");
  }

  async function refreshHeartbeatSuggestState(): Promise<void> {
    const out = await apiGet<HeartbeatSuggestState>("/api/heartbeat/autopilot_suggest_state");
    setHeartbeatSuggestState(out);
  }

  async function refreshConsolidationSettings(): Promise<void> {
    const out = await apiGet<ConsolidationSettings>("/api/consolidation/settings");
    setConsolidationSettings(out);
    setConsolidationEnabled(!!out.enabled);
    setConsolidationDailyTime(String(out.schedule?.daily_time || "23:30"));
    setConsolidationAgents(Array.isArray(out.targets?.agent_ids) && out.targets.agent_ids.length ? out.targets.agent_ids : ["facilitator"]);
  }

  async function refreshConsolidationState(): Promise<void> {
    const out = await apiGet<ConsolidationState>("/api/consolidation/state");
    setConsolidationState(out);
  }

  async function saveConsolidationSettings(): Promise<void> {
    const out = await apiPost<ConsolidationSettings>("/api/consolidation/settings", {
      enabled: consolidationEnabled,
      schedule: { daily_time: consolidationDailyTime },
      targets: { agent_ids: consolidationAgents },
    });
    setConsolidationSettings(out);
    await refreshConsolidationState();
    showToast("Consolidation settings saved");
  }

  async function runConsolidationNow(dryRun: boolean): Promise<void> {
    const agentId = consolidationAgents[0] || "facilitator";
    const out = await apiPost<any>("/api/consolidation/run_now", { agent_id: agentId, dry_run: dryRun });
    setConsolidationResult(out);
    await refreshConsolidationState();
    if (out?.skipped_reason) showToast(`Consolidation skipped: ${out.skipped_reason}`);
    else showToast(dryRun ? "Consolidation dry-run ok" : "Consolidation run done");
    if (!dryRun) {
      openAgentMemory(agentId, "knowledge");
      await refreshAgentMemory(agentId, "knowledge");
    }
  }

  async function refreshMorningBriefSettings(): Promise<void> {
    const out = await apiGet<MorningBriefSettings>("/api/routines/morning_brief/settings");
    setMorningBriefSettings(out);
    setMorningBriefEnabled(!!out.enabled);
    setMorningBriefDailyTime(String(out.daily_time || "08:30"));
  }

  async function saveMorningBriefSettings(): Promise<void> {
    const out = await apiPost<MorningBriefSettings>("/api/routines/morning_brief/settings", {
      enabled: morningBriefEnabled,
      daily_time: morningBriefDailyTime,
    });
    setMorningBriefSettings(out);
    await refreshMorningBriefState();
    showToast("Morning brief settings saved");
  }

  async function refreshMorningBriefState(): Promise<void> {
    const out = await apiGet<MorningBriefState>("/api/routines/morning_brief/state");
    setMorningBriefState(out);
  }

  async function runMorningBriefNow(dryRun: boolean): Promise<void> {
    const out = await apiPost<any>("/api/routines/morning_brief/run_now", { dry_run: dryRun });
    setMorningBriefResult(out);
    await refreshMorningBriefState();
    if (out?.skipped_reason) showToast(`Morning brief skipped: ${out.skipped_reason}`);
    else showToast(dryRun ? "Morning brief dry-run ok" : "Morning brief run done");
    if (!dryRun && out?.local_date) {
      await refreshInbox();
    }
  }

  async function refreshThreadArchiveSchedulerSettings(): Promise<void> {
    const out = await apiGet<ThreadArchiveSchedulerSettings>("/api/inbox/thread_archive_scheduler/settings");
    setThreadArchiveSchedulerSettings(out);
    setThreadArchiveSchedEnabled(!!out.enabled);
    setThreadArchiveSchedDailyTime(String(out.daily_time || "02:10"));
    setThreadArchiveSchedThreadKeysText((out.thread_keys || []).join("\n"));
    setThreadArchiveSchedMaxItems(String(out.max_items ?? 200));
    setThreadArchiveSchedLimitScan(String(out.limit_scan ?? 5000));
    setThreadArchiveSchedMaxThreadsPerRun(String(out.max_threads_per_run ?? 10));
    setThreadArchiveSchedCooldownSec(String(out.cooldown_sec ?? 3600));
    setThreadArchiveSchedMaxPerDay(String(out.max_per_day ?? 1));
    setThreadArchiveSchedAuditSummary(out.audit_summary !== false);
    setThreadArchiveSchedAuditPerThread(!!out.audit_per_thread);
    setThreadArchiveSchedPerThreadTimeoutMs(String(out.safety?.per_thread_timeout_ms ?? 5000));
    setThreadArchiveSchedTotalTimeoutMs(String(out.safety?.total_timeout_ms ?? 20000));
    setThreadArchiveSchedTailBytes(String(out.scan?.tail_bytes ?? 1048576));
  }

  async function refreshThreadArchiveSchedulerState(): Promise<void> {
    const out = await apiGet<ThreadArchiveSchedulerState>("/api/inbox/thread_archive_scheduler/state");
    setThreadArchiveSchedulerState(out);
  }

  async function saveThreadArchiveSchedulerSettings(): Promise<void> {
    const threadKeys = threadArchiveSchedThreadKeysText
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter((x) => !!x);
    const out = await apiPost<ThreadArchiveSchedulerSettings>("/api/inbox/thread_archive_scheduler/settings", {
      enabled: threadArchiveSchedEnabled,
      daily_time: threadArchiveSchedDailyTime,
      thread_keys: threadKeys,
      max_items: Number(threadArchiveSchedMaxItems || "200"),
      limit_scan: Number(threadArchiveSchedLimitScan || "5000"),
      max_threads_per_run: Number(threadArchiveSchedMaxThreadsPerRun || "10"),
      cooldown_sec: Number(threadArchiveSchedCooldownSec || "3600"),
      max_per_day: Number(threadArchiveSchedMaxPerDay || "1"),
      audit_summary: threadArchiveSchedAuditSummary,
      audit_per_thread: threadArchiveSchedAuditPerThread,
      safety: {
        per_thread_timeout_ms: Number(threadArchiveSchedPerThreadTimeoutMs || "5000"),
        total_timeout_ms: Number(threadArchiveSchedTotalTimeoutMs || "20000"),
      },
      scan: {
        tail_bytes: Number(threadArchiveSchedTailBytes || "1048576"),
      },
    });
    setThreadArchiveSchedulerSettings(out);
    await refreshThreadArchiveSchedulerState();
    showToast("Thread archive scheduler settings saved");
  }

  async function runThreadArchiveSchedulerNow(dryRun: boolean): Promise<void> {
    if (!dryRun) {
      const ok = window.confirm("Run thread archive scheduler now? This writes archive files and appends one summary inbox audit.");
      if (!ok) return;
    }
    const out = await apiPost<ThreadArchiveSchedulerRunNowResult>("/api/inbox/thread_archive_scheduler/run_now", { dry_run: dryRun });
    setThreadArchiveSchedulerResult(out);
    await Promise.all([refreshThreadArchiveSchedulerState(), refreshInbox(), refreshDashboardThreadArchiveScheduler()]);
    showToast(dryRun ? "Thread archive scheduler dry-run done" : "Thread archive scheduler run done");
  }

  async function refreshDashboardThreadArchiveScheduler(): Promise<void> {
    const out = await apiGet<DashboardThreadArchiveScheduler>("/api/dashboard/thread_archive_scheduler");
    setDashboardThreadArchiveScheduler(out);
  }

  async function runDashboardThreadArchiveSchedulerDryRun(): Promise<void> {
    const out = await apiPost<ThreadArchiveSchedulerRunNowResult>("/api/dashboard/thread_archive_scheduler/run_now", { dry_run: true });
    setThreadArchiveSchedulerResult(out);
    setDailyLoopActionResult(out);
    await Promise.all([refreshThreadArchiveSchedulerState(), refreshDashboardThreadArchiveScheduler()]);
    showToast("Thread archive scheduler dry-run done");
  }

  async function refreshDashboardQuickActions(): Promise<void> {
    const out = await apiGet<DashboardQuickActionsResponse>("/api/dashboard/quick_actions");
    setDashboardQuickActions(out);
  }

  function getQuickExecuteId(item: DashboardQuickAction): string {
    const explicit = String(item.execute_id || "").trim();
    if (explicit) return explicit;
    const raw = String(item.id || "").trim();
    if (raw === "morning_brief_autopilot_start_dry") return "morning_brief_autopilot_start";
    if (raw === "thread_archive_scheduler_dry") return "thread_archive_scheduler";
    if (raw === "ops_snapshot_dry") return "ops_snapshot";
    if (raw === "evidence_bundle_dry") return "evidence_bundle";
    return "";
  }

  function requiresApplyConfirm(executeId: string): boolean {
    return String(executeId || "").trim() === "morning_brief_autopilot_start";
  }

  async function apiPostWithTimeout<T>(apiPath: string, body: unknown, timeoutMs: number): Promise<T> {
    return await Promise.race([
      apiPost<T>(apiPath, body),
      new Promise<T>((_, reject) => {
        window.setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
  }

  function clearExecutionTrackerTimer(): void {
    if (executionTrackerTimerRef.current !== null) {
      window.clearTimeout(executionTrackerTimerRef.current);
      executionTrackerTimerRef.current = null;
    }
  }

  function detectTrackerTerminal(
    payload: Record<string, unknown>,
    terminalValues: string[],
  ): { terminal: boolean; success: boolean } {
    const data = payload;
    const statusRaw = String((data as any)?.status || "").trim().toLowerCase();
    const actionRaw = String((data as any)?.action || "").trim().toLowerCase();
    const runId = String((data as any)?.run_id || "").trim();
    const notified = (data as any)?.notified === true;
    if (actionRaw === "inbox_thread") {
      return { terminal: true, success: true };
    }
    if (statusRaw && terminalValues.includes(statusRaw)) {
      return { terminal: true, success: statusRaw === "success" || statusRaw === "completed" };
    }
    if (runId && statusRaw && terminalValues.includes(statusRaw)) {
      return { terminal: true, success: statusRaw === "success" || statusRaw === "completed" };
    }
    if (notified && statusRaw && terminalValues.includes(statusRaw)) {
      return { terminal: true, success: statusRaw === "success" || statusRaw === "completed" };
    }
    const stateCandidate = (data as any)?.state;
    const stateObj = stateCandidate && typeof stateCandidate === "object" && !Array.isArray(stateCandidate)
      ? stateCandidate
      : null;
    if (stateObj) {
      const hasRunAt = String((stateObj as any).last_run_at || "").trim().length > 0;
      const resultOk = (stateObj as any).last_result_ok;
      if (hasRunAt && (resultOk === true || resultOk === false)) {
        return { terminal: true, success: resultOk === true };
      }
    }
    return { terminal: false, success: false };
  }

  function summarizeTrackerPayload(
    payload: Record<string, unknown> | null | undefined,
    fallbackStatus: string,
    fallbackError: string,
  ): string {
    const data = payload || {};
    const result = ((data as any).result && typeof (data as any).result === "object") ? (data as any).result : {};
    const candidates = [
      (result as any).summary,
      (data as any).summary,
      (data as any).result_status,
      (data as any).failure_reason,
      fallbackError,
      fallbackStatus,
    ];
    const raw = candidates.map((x) => String(x || "").trim()).find((x) => !!x) || fallbackStatus;
    return raw.replace(/\s+/g, " ").slice(0, 200);
  }

  function makeTrackerPayloadSample(payload: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
    if (!payload || typeof payload !== "object") return null;
    const sample: Record<string, unknown> = {};
    const keys = ["status", "run_id", "request_id", "notified", "result_status", "summary", "failure_reason"];
    for (const key of keys) {
      const value = (payload as any)[key];
      if (value !== undefined) sample[key] = value;
    }
    const result = (payload as any).result;
    if (result && typeof result === "object" && !Array.isArray(result)) {
      const resultSummary = String((result as any).summary || "").trim();
      if (resultSummary) sample.result_summary = resultSummary.slice(0, 200);
    }
    return Object.keys(sample).length ? sample : null;
  }

  function trackerPollUrlFromHistoryItem(item: ExecutionTrackerHistoryItem): string {
    const kind = String(item.kind || "");
    if (kind === "export_ops_snapshot") {
      const requestId = String(item.request_id || "").trim();
      if (!requestId) return "";
      return `/api/export/ops_snapshot/status?request_id=${encodeURIComponent(requestId)}`;
    }
    if (kind === "export_evidence_bundle") {
      const requestId = String(item.request_id || "").trim();
      if (!requestId) return "";
      return `/api/export/evidence_bundle/status?request_id=${encodeURIComponent(requestId)}`;
    }
    if (kind === "thread_archive_scheduler") {
      return "/api/inbox/thread_archive_scheduler/state";
    }
    if (kind === "inbox_thread") {
      const threadKey = String(item.thread_key || "").trim().toLowerCase();
      if (!isValidInboxThreadKey(threadKey)) return "";
      return `/api/inbox/thread?key=${encodeURIComponent(threadKey)}&limit=20`;
    }
    return "";
  }

  async function pollExecutionTrackerOnce(forceImmediate = false): Promise<void> {
    const tracker = activeExecutionTrackerRef.current;
    if (!tracker) return;
    if (tracker.status !== "polling") return;
    if (executionTrackerPollInflightRef.current) return;
    const elapsed = Date.now() - tracker.startedAt;
    if (elapsed > tracker.maxDurationMs) {
      clearExecutionTrackerTimer();
      setActiveExecutionTracker((prev) => prev ? { ...prev, status: "timeout", lastError: "max_duration_exceeded" } : prev);
      showToast("Execution tracker timeout");
      return;
    }
    executionTrackerPollInflightRef.current = true;
    try {
      const payload = await apiGet<Record<string, unknown>>(tracker.pollUrl);
      const terminal = detectTrackerTerminal(payload, tracker.terminalValues);
      if (terminal.terminal) {
        clearExecutionTrackerTimer();
        setActiveExecutionTracker((prev) => {
          if (!prev) return prev;
          if (prev.status === "canceled") return prev;
          return {
            ...prev,
            status: terminal.success ? "success" : "failed",
            lastPayload: payload,
            pollCount: prev.pollCount + 1,
            nextDelayMs: 5000,
            runId: String((payload as any).run_id || prev.runId || ""),
          };
        });
        showToast(terminal.success ? "Execution tracker completed" : "Execution tracker failed");
        return;
      }
      setActiveExecutionTracker((prev) => {
        if (!prev) return prev;
        if (prev.status === "canceled") return prev;
        const nextDelay = prev.pollCount + 1 >= 2 ? 5000 : 2000;
        return {
          ...prev,
          status: "polling",
          lastPayload: payload,
          lastError: "",
          pollCount: prev.pollCount + 1,
          nextDelayMs: nextDelay,
          runId: String((payload as any).run_id || prev.runId || ""),
        };
      });
    } catch (e: any) {
      setActiveExecutionTracker((prev) => {
        if (!prev) return prev;
        if (prev.status === "canceled") return prev;
        return {
          ...prev,
          status: "failed",
          lastError: String(e?.message || e || "poll_failed"),
        };
      });
      clearExecutionTrackerTimer();
      showToast(`Execution tracker error: ${String(e?.message || e)}`);
      return;
    } finally {
      executionTrackerPollInflightRef.current = false;
    }
    if (!forceImmediate) {
      const nextPollCount = Number((activeExecutionTrackerRef.current?.pollCount || 0));
      const nextDelay = nextPollCount >= 2 ? 5000 : 2000;
      clearExecutionTrackerTimer();
      executionTrackerTimerRef.current = window.setTimeout(() => {
        void pollExecutionTrackerOnce();
      }, nextDelay);
    }
  }

  function startExecutionTrackerFromResult(out: DashboardQuickActionRunResult): void {
    const plan = out.tracking_plan;
    if (!plan || !plan.status_endpoint) return;
    const tracking = out.tracking || null;
    const requestId = String(tracking?.request_id || "").trim();
    const runId = String(tracking?.run_id || "").trim();
    let pollUrl = String(tracking?.poll_url || plan.status_endpoint || "").trim();
    if (requestId && (plan.kind === "export_ops_snapshot" || plan.kind === "export_evidence_bundle")) {
      pollUrl = `${pollUrl}?request_id=${encodeURIComponent(requestId)}`;
    }
    if (!pollUrl.startsWith("/")) pollUrl = `/${pollUrl}`;
    const tracker: ExecutionTrackerState = {
      id: String(plan.id || out.id || ""),
      kind: String(plan.kind || ""),
      startedAt: Date.now(),
      pollUrl,
      requestId: requestId || undefined,
      runId: runId || undefined,
      threadKey: isValidInboxThreadKey(tracking?.thread_key)
        ? String(tracking?.thread_key || "").trim().toLowerCase()
        : (isValidInboxThreadKey(out.thread_key) ? String(out.thread_key || "").trim().toLowerCase() : undefined),
      status: "polling",
      lastPayload: null,
      lastError: "",
      pollCount: 0,
      nextDelayMs: Math.max(500, Number(plan.poll_hint_ms || 2000)),
      maxDurationMs: Math.max(1000, Number(plan.max_duration_ms || 60000)),
      terminalValues: Array.isArray(plan.fields_hint?.terminal_status_values)
        ? plan.fields_hint?.terminal_status_values.map((x) => String(x || "").toLowerCase()).filter((x) => !!x)
        : ["success", "failed", "error", "completed"],
    };
    setActiveExecutionTracker(tracker);
    clearExecutionTrackerTimer();
    executionTrackerTimerRef.current = window.setTimeout(() => {
      void pollExecutionTrackerOnce();
    }, tracker.nextDelayMs);
    showToast("Tracking started");
  }

  function cancelExecutionTracker(): void {
    clearExecutionTrackerTimer();
    setActiveExecutionTracker((prev) => prev ? { ...prev, status: "canceled" } : prev);
  }

  function goTrackerRequestToInbox(): void {
    const requestId = String(activeExecutionTracker?.requestId || "").trim();
    if (!requestId) return;
    setInboxFilter(requestId);
    setActiveChannel("inbox");
  }

  function openTrackerThread(threadKeyInput?: string): void {
    const key = String(threadKeyInput || activeExecutionTracker?.threadKey || "").trim().toLowerCase();
    if (!isValidInboxThreadKey(key)) {
      showToast("thread_key missing");
      return;
    }
    recordRecentTarget({
      id: `thread_${key}`,
      title: `Thread: ${formatCompactTargetId("thr", key)}`,
      subtitle: "Open current thread in the right pane",
    });
    setInboxThreadKeyFilter(key);
    setInboxFilter("");
    setActiveChannel("inbox");
    void loadInboxThreadView(key, 20);
  }

  async function copyTrackerValue(value: string): Promise<void> {
    const v = String(value || "").trim();
    if (!v) return;
    await navigator.clipboard.writeText(v);
    showToast("Copied");
  }

  async function copyActiveProfileValue(value: string, label: string): Promise<void> {
    const v = String(value || "").trim();
    if (!v) return;
    await navigator.clipboard.writeText(v);
    showToast(`${label} copied`);
  }

  function scrollDashboardCard(ref: { current: HTMLElement | null }): void {
    if (activeChannel !== "dashboard") {
      setActiveChannel("dashboard");
      window.setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
      return;
    }
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function openPrimaryAutopilot(): void {
    recordRecentTarget({ id: "autopilot", title: "View: Autopilot", subtitle: "Open dashboard autopilot actions" });
    setDashboardQuickActionFocusId("morning_brief_autopilot_start");
    setActiveChannel("dashboard");
    scrollDashboardCard(dashboardQuickActionsCardRef);
    setStatus("navigate:autopilot");
  }

  function openPrimaryDashboard(): void {
    recordRecentTarget({ id: "dashboard", title: "View: Dashboard", subtitle: "Open daily loop dashboard" });
    setActiveChannel("dashboard");
    setStatus("navigate:dashboard");
  }

  function openPrimaryWorkspace(): void {
    recordRecentTarget({ id: "workspace", title: "View: Workspace", subtitle: "Open workspace room" });
    setActiveChannel("workspace");
    setStatus("navigate:workspace");
  }

  function openPrimaryOffice(): void {
    recordRecentTarget({ id: "office", title: "View: Office", subtitle: "Open control room office view" });
    setActiveChannel("office");
    setStatus("navigate:office");
  }

  function openPrimaryDebate(): void {
    recordRecentTarget({ id: "debate", title: "View: Debate", subtitle: "Open discussion stage view" });
    setActiveChannel("debate");
    setStatus("navigate:debate");
  }

  function openGuardedAction(kind: GuardedActionKind, title: string, warning: string, preflight: Record<string, unknown>): void {
    setGuardedActionKind(kind);
    setGuardedActionTitle(title);
    setGuardedActionWarning(warning);
    setGuardedActionPreflight(preflight);
    setGuardedActionPhrase("");
    setGuardedActionOpen(true);
  }

  async function executeGuardedActionConfirmed(): Promise<void> {
    if (guardedActionPhrase.trim() !== "APPLY") {
      showToast("Type APPLY to continue");
      return;
    }
    try {
      if (guardedActionKind === "autopilot_pause" || guardedActionKind === "cancel_run") {
        await cancelCouncilRun();
      } else if (guardedActionKind === "autopilot_resume") {
        await resumeCouncilRun();
      } else if (guardedActionKind === "retry_failed_items") {
        const token = String(opsQuickStatus?.confirm_token || "").trim();
        if (!token) {
          showToast("confirm_token missing");
          return;
        }
        const out = await apiPost<Record<string, unknown>>("/api/ops/quick_actions/stabilize", {
          mode: "safe_run",
          include_run_now: false,
          confirm_token: token,
          dry_run: false,
        });
        setOpsQuickResult(out);
        setDailyLoopActionResult(out);
        await Promise.all([refreshOpsQuickActionsStatus(), refreshDailyLoopDashboard(), refreshInbox()]);
      }
      setGuardedActionOpen(false);
      showToast(`${guardedActionTitle} done`);
    } catch (e: any) {
      showToast(`${guardedActionTitle} failed: ${String(e?.message || e)}`);
    }
  }

  function openDashboardNextActionThread(threadKeyInput: string): void {
    const key = String(threadKeyInput || "").trim().toLowerCase();
    if (!isValidInboxThreadKey(key)) {
      showToast("thread_key missing");
      return;
    }
    openTrackerThread(key);
  }

  function openDashboardNextActionQuickAction(actionIdInput: string): void {
    const actionId = String(actionIdInput || "").trim();
    if (!actionId) return;
    const target = (dashboardQuickActions?.actions || []).find((qa) =>
      String(qa.id || "").trim() === actionId || getQuickExecuteId(qa) === actionId,
    );
    if (target) {
      viewDashboardQuickActionLast(target);
      setDashboardQuickActionFocusId(String(target.id || "").trim() || getQuickExecuteId(target));
    } else {
      setDashboardQuickActionFocusId(actionId);
    }
    scrollDashboardCard(dashboardQuickActionsCardRef);
  }

  function openDashboardNextActionRevertConfirm(): void {
    openActiveProfileRevertModal();
  }

  function viewTrackerHistoryDetails(item: ExecutionTrackerHistoryItem): void {
    const out = {
      action: "tracker_history_detail",
      id: item.id,
      kind: item.kind,
      started_at: item.started_at,
      ended_at: item.ended_at,
      status: item.status,
      request_id: item.request_id || null,
      run_id: item.run_id || null,
      thread_key: item.thread_key || null,
      elapsed_ms: item.elapsed_ms || null,
      last_summary: item.last_summary || null,
      last_payload_sample: item.last_payload_sample || null,
    };
    setDashboardQuickActionResult(out);
    setDailyLoopActionResult(out);
  }

  function goTrackerHistoryToInbox(item: ExecutionTrackerHistoryItem): void {
    const key = String(item.request_id || item.run_id || "").trim();
    if (!key) return;
    setInboxFilter(key);
    setActiveChannel("inbox");
  }

  function goTrackerHistoryToThread(item: ExecutionTrackerHistoryItem): void {
    const key = String(item.thread_key || "").trim().toLowerCase();
    if (!isValidInboxThreadKey(key)) {
      showToast("thread_key missing");
      return;
    }
    openTrackerThread(key);
  }

  async function copyTrackerHistoryIds(item: ExecutionTrackerHistoryItem): Promise<void> {
    const ids = [String(item.request_id || "").trim(), String(item.run_id || "").trim()].filter((x) => !!x);
    if (!ids.length) return;
    await navigator.clipboard.writeText(ids.join(" "));
    showToast("IDs copied");
  }

  function reopenTrackerFromHistory(item: ExecutionTrackerHistoryItem): void {
    const pollUrl = trackerPollUrlFromHistoryItem(item);
    if (!pollUrl) {
      showToast(item.kind === "thread_archive_scheduler" ? "Tracker endpoint missing" : "no request_id");
      return;
    }
    const started = Date.now();
    const tracker: ExecutionTrackerState = {
      id: String(item.id || ""),
      kind: String(item.kind || ""),
      startedAt: started,
      pollUrl,
      requestId: String(item.request_id || "").trim() || undefined,
      runId: String(item.run_id || "").trim() || undefined,
      threadKey: isValidInboxThreadKey(item.thread_key) ? String(item.thread_key || "").trim().toLowerCase() : undefined,
      status: "polling",
      lastPayload: item.last_payload_sample || null,
      lastError: "",
      pollCount: 0,
      nextDelayMs: 2000,
      maxDurationMs: 30000,
      terminalValues: ["success", "failed", "error", "completed"],
    };
    setActiveExecutionTracker(tracker);
    clearExecutionTrackerTimer();
    executionTrackerTimerRef.current = window.setTimeout(() => {
      void pollExecutionTrackerOnce();
    }, tracker.nextDelayMs);
    showToast("Tracking re-opened");
  }

  function trackerHistoryItemToWorkspacePayload(item: ExecutionTrackerHistoryItem): Record<string, unknown> {
    return {
      id: item.id,
      kind: item.kind,
      started_at: item.started_at,
      ended_at: item.ended_at,
      status: item.status,
      request_id: item.request_id || undefined,
      run_id: item.run_id || undefined,
      thread_key: item.thread_key || undefined,
      elapsed_ms: Number.isFinite(Number(item.elapsed_ms)) ? Number(item.elapsed_ms) : undefined,
      last_summary: String(item.last_summary || "").replace(/\s+/g, " ").slice(0, 200) || undefined,
    };
  }

  async function appendTrackerHistoryToWorkspace(item: ExecutionTrackerHistoryItem): Promise<void> {
    try {
      const payload = { item: trackerHistoryItemToWorkspacePayload(item), dry_run: false };
      const out = await apiPost<DashboardTrackerHistoryAppendResponse>("/api/dashboard/tracker_history/append", payload);
      if (!out || out.exit_code !== 0) {
        // best-effort append only
      }
    } catch {
      // best-effort append only
    }
  }

  async function restoreTrackerHistoryFromWorkspace(force = false): Promise<void> {
    if (trackerHistoryRestoreInflightRef.current) return;
    if (!force && trackerHistoryRestoreDoneRef.current) return;
    trackerHistoryRestoreInflightRef.current = true;
    try {
      const out = await apiGet<DashboardTrackerHistoryResponse>("/api/dashboard/tracker_history?limit=10");
      const workspaceItems = normalizeTrackerHistoryArray(Array.isArray(out.items) ? out.items : []).items.slice(0, 10);
      const workspaceKeyMap: Record<string, true> = {};
      for (const row of workspaceItems) workspaceKeyMap[trackerHistoryDedupeKey(row)] = true;
      setTrackerHistoryWorkspaceKeys(workspaceKeyMap);
      setTrackerHistory((prev) => mergeTrackerHistory(workspaceItems, prev));
      trackerHistoryRestoreDoneRef.current = true;
    } catch {
      // fallback to existing local-only history
    } finally {
      trackerHistoryRestoreInflightRef.current = false;
    }
  }

  function showTrackerHistoryExportInPane(): ExecutionTrackerHistoryExportPayload {
    const payload = buildTrackerHistoryExportPayload(trackerHistory);
    const out = {
      action: "tracker_history_export",
      ...payload,
    };
    setDashboardQuickActionResult(out);
    setDailyLoopActionResult(out);
    return payload;
  }

  async function copyTrackerHistoryExportJson(): Promise<void> {
    const payload = showTrackerHistoryExportInPane();
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    showToast("Export JSON copied");
  }

  function validateTrackerHistoryImportText(): { validItems: ExecutionTrackerHistoryItem[]; skipped: number } | null {
    setTrackerHistoryImportError("");
    setTrackerHistoryImportReport("");
    setTrackerHistoryImportValidItems(null);
    setTrackerHistoryImportSkipped(0);
    let parsed: any = null;
    try {
      parsed = JSON.parse(String(trackerHistoryImportText || ""));
    } catch {
      setTrackerHistoryImportError("Import JSON parse failed");
      return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setTrackerHistoryImportError("Import payload must be object");
      return null;
    }
    const schema = String(parsed.schema || "").trim();
    if (schema !== TRACKER_HISTORY_EXPORT_SCHEMA_V1) {
      setTrackerHistoryImportError(`Unsupported schema: ${schema || "(empty)"}`);
      return null;
    }
    const normalized = normalizeTrackerHistoryArray(parsed.items);
    setTrackerHistoryImportValidItems(normalized.items);
    setTrackerHistoryImportSkipped(normalized.skipped);
    const report = `validated: accepted=${normalized.items.length}, skipped=${normalized.skipped}`;
    setTrackerHistoryImportReport(report);
    const out = {
      action: "tracker_history_import_validate",
      schema,
      accepted: normalized.items.length,
      skipped: normalized.skipped,
      items_sample: normalized.items.slice(0, 3),
    };
    setDashboardQuickActionResult(out);
    setDailyLoopActionResult(out);
    return { validItems: normalized.items, skipped: normalized.skipped };
  }

  function applyTrackerHistoryImport(): void {
    const validated = trackerHistoryImportValidItems;
    if (!validated) {
      const validation = validateTrackerHistoryImportText();
      if (!validation) return;
      const merged = mergeTrackerHistory(trackerHistory, validation.validItems);
      setTrackerHistory(merged);
      showToast(`Imported ${validation.validItems.length}, skipped ${validation.skipped}, total ${merged.length}`);
      setTrackerHistoryImportOpen(false);
      return;
    }
    const merged = mergeTrackerHistory(trackerHistory, validated);
    setTrackerHistory(merged);
    showToast(`Imported ${validated.length}, skipped ${trackerHistoryImportSkipped}, total ${merged.length}`);
    setTrackerHistoryImportOpen(false);
  }

  function openTrackerHistoryImport(): void {
    setTrackerHistoryImportText("");
    setTrackerHistoryImportError("");
    setTrackerHistoryImportReport("");
    setTrackerHistoryImportValidItems(null);
    setTrackerHistoryImportSkipped(0);
    setTrackerHistoryImportOpen(true);
  }

  function openTrackerHistoryClearConfirm(): void {
    setTrackerHistoryClearPhrase("");
    setTrackerHistoryClearOpen(true);
  }

  function clearTrackerHistoryConfirmed(): void {
    if (trackerHistoryClearPhrase.trim() !== "CLEAR") return;
    setTrackerHistory([]);
    try {
      localStorage.removeItem(TRACKER_HISTORY_STORAGE_KEY);
    } catch {
      // best-effort local storage only
    }
    setTrackerHistoryClearOpen(false);
    showToast("History cleared");
  }

  async function runDashboardQuickAction(item: DashboardQuickAction): Promise<void> {
    const id = String(item.id || "").trim();
    if (!id || !item.enabled) return;
    const now = Date.now();
    const prevMs = Number(dashboardQuickActionDebounceRef.current[id] || 0);
    if (now - prevMs < 600) return;
    dashboardQuickActionDebounceRef.current[id] = now;
    if (dashboardQuickActionInflightRef.current[id]) return;
    dashboardQuickActionInflightRef.current[id] = true;
    try {
      const out = await apiPost<DashboardQuickActionRunResult>("/api/dashboard/quick_actions/run", { id });
      setDashboardQuickActionResult(out);
      setDailyLoopActionResult(out);
      await refreshDashboardQuickActions();
      if (out.ok) showToast(`${item.title} done`);
      else showToast(`${item.title} failed: ${String(out.failure_reason || "unknown")}`);
    } finally {
      dashboardQuickActionInflightRef.current[id] = false;
    }
  }

  function openDashboardQuickExecuteModal(item: DashboardQuickAction): void {
    if (!item.execute_supported) return;
    const executeId = getQuickExecuteId(item);
    if (!executeId) return;
    setDashboardQuickExecuteTarget(item);
    setDashboardQuickExecutePhrase("");
    setDashboardQuickExecuteApplyPhrase("");
    setDashboardQuickExecutePreflightResult(null);
    dashboardQuickExecutePreflightDoneRef.current[executeId] = false;
    setDashboardQuickExecuteModalOpen(true);
  }

  async function runDashboardQuickExecutePreflight(): Promise<void> {
    const item = dashboardQuickExecuteTarget;
    if (!item) return;
    const executeId = getQuickExecuteId(item);
    if (!executeId) return;
    if (dashboardQuickExecuteInflightRef.current[executeId]) return;
    dashboardQuickExecuteInflightRef.current[executeId] = true;
    try {
      const payload: Record<string, unknown> = {
        id: executeId,
        confirm_phrase: "EXECUTE",
        dry_run: true,
      };
      if (requiresApplyConfirm(executeId)) payload.apply_confirm_phrase = "APPLY";
      const out = await apiPostWithTimeout<DashboardQuickActionRunResult>(
        "/api/dashboard/quick_actions/execute",
        payload,
        11000,
      );
      setDashboardQuickExecutePreflightResult(out);
      setDashboardQuickActionResult(out);
      setDailyLoopActionResult(out);
      dashboardQuickExecutePreflightDoneRef.current[executeId] = true;
      await refreshDashboardQuickActions();
      showToast(out.ok ? "Preflight done" : `Preflight failed: ${String(out.failure_reason || "unknown")}`);
    } catch (e: any) {
      const synthetic = {
        action: "dashboard_quick_actions_execute",
        id: executeId,
        dry_run: true,
        ok: false,
        status_code: 500,
        result: {},
        elapsed_ms: 11000,
        exit_code: 1,
        failure_reason: String(e?.message || e || "timeout"),
      };
      setDashboardQuickExecutePreflightResult(synthetic);
      setDashboardQuickActionResult(synthetic);
      setDailyLoopActionResult(synthetic);
      showToast(`Preflight failed: ${String(e?.message || e)}`);
    } finally {
      dashboardQuickExecuteInflightRef.current[executeId] = false;
    }
  }

  async function executeDashboardQuickActionConfirmed(): Promise<void> {
    const item = dashboardQuickExecuteTarget;
    if (!item) return;
    const executeId = getQuickExecuteId(item);
    if (!executeId) return;
    if (dashboardQuickExecuteInflightRef.current[executeId]) return;
    const preflightDone = dashboardQuickExecutePreflightDoneRef.current[executeId] === true;
    if (!preflightDone) {
      showToast("Run preflight first");
      return;
    }
    if (dashboardQuickExecutePhrase.trim() !== "EXECUTE") {
      showToast("Type EXECUTE to continue");
      return;
    }
    if (requiresApplyConfirm(executeId) && dashboardQuickExecuteApplyPhrase.trim() !== "APPLY") {
      showToast("Type APPLY to continue");
      return;
    }
    dashboardQuickExecuteInflightRef.current[executeId] = true;
    try {
      const payload: Record<string, unknown> = {
        id: executeId,
        confirm_phrase: "EXECUTE",
        dry_run: false,
      };
      if (requiresApplyConfirm(executeId)) payload.apply_confirm_phrase = "APPLY";
      const out = await apiPostWithTimeout<DashboardQuickActionRunResult>(
        "/api/dashboard/quick_actions/execute",
        payload,
        11000,
      );
      setDashboardQuickActionResult(out);
      setDailyLoopActionResult(out);
      await refreshDashboardQuickActions();
      setDashboardQuickExecuteModalOpen(false);
      setDashboardQuickExecuteTarget(null);
      if (out.ok) {
        startExecutionTrackerFromResult(out);
      } else if (out.tracking_plan) {
        let pollUrl = String(out.tracking?.poll_url || out.tracking_plan.status_endpoint || "").trim();
        const requestId = String(out.tracking?.request_id || "").trim();
        if (requestId && (out.tracking_plan.kind === "export_ops_snapshot" || out.tracking_plan.kind === "export_evidence_bundle")) {
          pollUrl = `${pollUrl}?request_id=${encodeURIComponent(requestId)}`;
        }
        setActiveExecutionTracker({
          id: String(out.tracking_plan.id || executeId),
          kind: String(out.tracking_plan.kind || ""),
          startedAt: Date.now(),
          pollUrl,
          requestId: requestId || undefined,
          runId: String(out.tracking?.run_id || "").trim() || undefined,
          threadKey: isValidInboxThreadKey(out.thread_key) ? String(out.thread_key || "").trim().toLowerCase() : undefined,
          status: "failed",
          lastPayload: out.result || {},
          lastError: String(out.failure_reason || "execute_failed"),
          pollCount: 0,
          nextDelayMs: Math.max(500, Number(out.tracking_plan.poll_hint_ms || 2000)),
          maxDurationMs: Math.max(1000, Number(out.tracking_plan.max_duration_ms || 60000)),
          terminalValues: Array.isArray(out.tracking_plan.fields_hint?.terminal_status_values)
            ? out.tracking_plan.fields_hint?.terminal_status_values.map((x) => String(x || "").toLowerCase()).filter((x) => !!x)
            : ["success", "failed", "error", "completed"],
        });
        showToast(`Execute failed: ${String(out.failure_reason || "unknown")}`);
      } else {
        showToast(`Execute failed: ${String(out.failure_reason || "unknown")}`);
      }
    } catch (e: any) {
      const synthetic = {
        action: "dashboard_quick_actions_execute",
        id: executeId,
        dry_run: false,
        ok: false,
        status_code: 500,
        result: {},
        elapsed_ms: 11000,
        exit_code: 1,
        failure_reason: String(e?.message || e || "timeout"),
      };
      setDashboardQuickActionResult(synthetic);
      setDailyLoopActionResult(synthetic);
      showToast(`Execute failed: ${String(e?.message || e)}`);
    } finally {
      dashboardQuickExecuteInflightRef.current[executeId] = false;
    }
  }

  async function refreshExecutionTrackerNow(): Promise<void> {
    clearExecutionTrackerTimer();
    await pollExecutionTrackerOnce(true);
    if (activeExecutionTrackerRef.current?.status === "polling") {
      executionTrackerTimerRef.current = window.setTimeout(() => {
        void pollExecutionTrackerOnce();
      }, Number(activeExecutionTrackerRef.current?.nextDelayMs || 2000));
    }
  }

  function viewDashboardQuickActionLast(item: DashboardQuickAction): void {
    const id = String(item.id || "").trim();
    if (!id) return;
    const out = {
      action: "dashboard_quick_actions_last",
      id,
      last: item.last || null,
    };
    setDashboardQuickActionResult(out);
    setDailyLoopActionResult(out);
  }

  function openDashboardQuickActionSettings(item: DashboardQuickAction): void {
    const h = String(item.open_settings || "").trim();
    setActiveChannel("settings");
    if (h.startsWith("#")) {
      window.location.hash = h;
    }
  }

  async function refreshDailyLoopDashboard(): Promise<void> {
    if (dashboardRefreshInflightRef.current) return;
    dashboardRefreshInflightRef.current = true;
    try {
      const [daily, nextActions, threadSched, quickActions, activeProfile, yesterdayMemo] = await Promise.all([
        apiGet<DailyLoopDashboard>("/api/dashboard/daily_loop?limit_inbox_items=10"),
        apiGet<DashboardNextActionsResponse>("/api/dashboard/next_actions?limit=5"),
        apiGet<DashboardThreadArchiveScheduler>("/api/dashboard/thread_archive_scheduler"),
        apiGet<DashboardQuickActionsResponse>("/api/dashboard/quick_actions"),
        apiGet<ActiveProfileState>("/api/org/active_profile"),
        apiGet<DashboardYesterdayMemoResponse>(`/api/dashboard/yesterday_memo?agent_id=${encodeURIComponent(String(dashboardYesterdayMemoAgentId || "facilitator"))}&category=episodes&limit=1`),
      ]);
      setDailyLoopDashboard(daily);
      setDashboardNextActions(nextActions);
      setDashboardThreadArchiveScheduler(threadSched);
      setDashboardQuickActions(quickActions);
      setActiveProfileState(activeProfile);
      setDashboardYesterdayMemo(yesterdayMemo);
      const now = Date.now();
      dashboardLastRefreshMsRef.current = now;
      setDashboardLastRefreshAt(new Date(now).toISOString());
    } finally {
      dashboardRefreshInflightRef.current = false;
    }
  }

  async function refreshOpsQuickActionsStatus(): Promise<void> {
    const out = await apiGet<OpsQuickActionsStatus>("/api/ops/quick_actions/status");
    setOpsQuickStatus(out);
  }

  async function refreshOpsAutoStabilize(): Promise<void> {
    const [settings, state] = await Promise.all([
      apiGet<OpsAutoStabilizeSettings>("/api/ops/auto_stabilize/settings"),
      apiGet<OpsAutoStabilizeState>("/api/ops/auto_stabilize/state"),
    ]);
    setOpsAutoStabilizeSettings(settings);
    setOpsAutoStabilizeState(state);
    setOpsAutoEnabled(!!settings.enabled);
    setOpsAutoCheckIntervalSec(String(settings.check_interval_sec ?? 30));
    setOpsAutoCooldownSec(String(settings.cooldown_sec ?? 1800));
    setOpsAutoMaxPerDay(String(settings.max_per_day ?? 3));
    setOpsAutoExecuteEnabled(!!settings.auto_execute?.enabled);
    setOpsAutoExecuteCooldownSec(String(settings.auto_execute?.cooldown_sec ?? 3600));
    setOpsAutoExecuteMaxPerDay(String(settings.auto_execute?.max_per_day ?? 1));
  }

  async function saveOpsAutoStabilizeSettings(): Promise<void> {
    const out = await apiPost<OpsAutoStabilizeSettings>("/api/ops/auto_stabilize/settings", {
      enabled: opsAutoEnabled,
      check_interval_sec: Number(opsAutoCheckIntervalSec || "30"),
      cooldown_sec: Number(opsAutoCooldownSec || "1800"),
      max_per_day: Number(opsAutoMaxPerDay || "3"),
      auto_execute: {
        enabled: opsAutoExecuteEnabled,
        max_per_day: Number(opsAutoExecuteMaxPerDay || "1"),
        cooldown_sec: Number(opsAutoExecuteCooldownSec || "3600"),
      },
    });
    setOpsAutoStabilizeSettings(out);
    await refreshOpsAutoStabilize();
    showToast("Auto-stabilize settings saved");
  }

  function openOpsQuickConfirm(label: string, endpoint: string, payload: Record<string, unknown>, warning = ""): void {
    setOpsQuickPendingAction({ label, endpoint, payload, warning });
    setOpsQuickConfirmOpen(true);
  }

  async function executeOpsQuickAction(): Promise<void> {
    if (!opsQuickPendingAction) return;
    try {
      const out = await apiPost<any>(opsQuickPendingAction.endpoint, opsQuickPendingAction.payload);
      setOpsQuickResult(out);
      setDailyLoopActionResult(out);
      await Promise.all([refreshOpsQuickActionsStatus(), refreshDailyLoopDashboard(), refreshInbox()]);
      showToast(`${opsQuickPendingAction.label} done`);
    } catch (e: any) {
      showToast(`${opsQuickPendingAction.label} failed: ${String(e?.message || e)}`);
    } finally {
      setOpsQuickConfirmOpen(false);
      setOpsQuickPendingAction(null);
    }
  }

  async function prepareOpsAutoStabilizeExecuteFromInbox(includeRunNow: boolean, item: InboxItem): Promise<void> {
    const status = await apiGet<OpsQuickActionsStatus>("/api/ops/quick_actions/status");
    setOpsQuickStatus(status);
    const token = String(status.confirm_token || "").trim();
    if (!token) {
      showToast("confirm_token missing");
      return;
    }
    openOpsQuickConfirm(
      includeRunNow ? "Stabilize now (safe + run_now)" : "Stabilize now (safe, no exec)",
      "/api/ops/auto_stabilize/execute_safe_run",
      {
        confirm_token: token,
        include_run_now: includeRunNow,
        dry_run: false,
        source_inbox_id: String(item.id || ""),
      },
      includeRunNow ? "This executes facilitator run_now. Confirm carefully." : "This executes safe mode without run_now execution.",
    );
  }

  async function runDashboardHeartbeatNow(): Promise<void> {
    const out = await apiPost<any>("/api/heartbeat/run_now", {
      agent_id: "facilitator",
      category: "episodes",
      dry_run: false,
      limits: { activity_limit: 20, inbox_limit: 10, runs_limit: 10 },
    });
    setDailyLoopActionResult(out);
    await Promise.all([refreshDailyLoopDashboard(), refreshHeartbeatState(), refreshInbox(), refreshActivity()]);
    if (out?.skipped_reason) showToast(`Heartbeat skipped: ${out.skipped_reason}`);
    else showToast("Heartbeat run_now done");
  }

  async function runDashboardConsolidationNow(): Promise<void> {
    const out = await apiPost<any>("/api/consolidation/run_now", { agent_id: "facilitator", dry_run: false });
    setDailyLoopActionResult(out);
    await Promise.all([refreshDailyLoopDashboard(), refreshConsolidationState(), refreshInbox(), refreshActivity()]);
    if (out?.skipped_reason) showToast(`Consolidation skipped: ${out.skipped_reason}`);
    else showToast("Consolidation run_now done");
  }

  async function runDashboardMorningBriefNow(): Promise<void> {
    const out = await apiPost<any>("/api/routines/morning_brief/run_now", { dry_run: false });
    setDailyLoopActionResult(out);
    await Promise.all([refreshDailyLoopDashboard(), refreshMorningBriefState(), refreshInbox(), refreshActivity()]);
    if (out?.skipped_reason) showToast(`Morning brief skipped: ${out.skipped_reason}`);
    else showToast("Morning brief run_now done");
  }

  async function runDashboardRecommendedProfilePreflight(): Promise<void> {
    const out = await apiPost<DashboardRecommendedProfilePreflight>("/api/dashboard/recommended_profile/preflight", { dry_run: true });
    setDailyLoopActionResult(out);
    await Promise.all([refreshDailyLoopDashboard(), refreshOrgAgents()]);
    showToast(out?.ok ? "Recommended profile preflight done" : `Preflight failed: ${String(out?.reason || "unknown")}`);
  }

  async function runDashboardRecommendedProfileApply(): Promise<void> {
    const confirmLine = window.prompt("Apply recommended profile to council roles.\nType APPLY to continue.", "");
    if (String(confirmLine || "").trim() !== "APPLY") {
      showToast("Apply canceled");
      return;
    }
    const out = await apiPost<DashboardRecommendedProfileApply>("/api/dashboard/recommended_profile/apply", { confirm_phrase: "APPLY" });
    setDailyLoopActionResult(out);
    await Promise.all([refreshDailyLoopDashboard(), refreshOrgAgents(), refreshActivity()]);
    showToast(out?.ok ? "Recommended profile applied" : `Apply failed: ${String(out?.reason || "unknown")}`);
  }

  function openActiveProfileRevertModal(): void {
    setActiveProfileRevertModalOpen(true);
    setActiveProfileRevertPhrase("");
    setActiveProfileRevertPreview(null);
    setActiveProfileRevertResult(null);
  }

  async function runActiveProfileRevertPreview(): Promise<void> {
    if (activeProfileRevertInflightRef.current) return;
    activeProfileRevertInflightRef.current = true;
    try {
      const out = await apiPost<Record<string, unknown>>("/api/org/active_profile/revert", { dry_run: true, target_preset_set_id: "standard" });
      setActiveProfileRevertPreview(out);
      setDailyLoopActionResult(out);
      showToast("Revert preview done");
    } catch (e: any) {
      const synthetic = { ok: false, dry_run: true, reason: String(e?.message || e || "preview_failed"), exit_code: 1 };
      setActiveProfileRevertPreview(synthetic);
      setDailyLoopActionResult(synthetic);
      showToast(`Revert preview failed: ${String(e?.message || e)}`);
    } finally {
      activeProfileRevertInflightRef.current = false;
    }
  }

  async function runActiveProfileRevertExecute(): Promise<void> {
    if (activeProfileRevertInflightRef.current) return;
    if (activeProfileRevertPhrase.trim() !== "REVERT") {
      showToast("Type REVERT to continue");
      return;
    }
    activeProfileRevertInflightRef.current = true;
    try {
      const out = await apiPost<Record<string, unknown>>("/api/org/active_profile/revert", {
        dry_run: false,
        confirm_phrase: "REVERT",
        target_preset_set_id: "standard",
      });
      setActiveProfileRevertResult(out);
      setDailyLoopActionResult(out);
      await Promise.all([refreshDailyLoopDashboard(), refreshOrgAgents(), refreshInbox(), refreshActivity()]);
      if ((out as any)?.ok === true) {
        showToast("Active profile reverted");
        setActiveProfileRevertModalOpen(false);
      } else {
        showToast(`Revert failed: ${String((out as any)?.reason || "unknown")}`);
      }
    } catch (e: any) {
      const synthetic = { ok: false, dry_run: false, reason: String(e?.message || e || "revert_failed"), exit_code: 1 };
      setActiveProfileRevertResult(synthetic);
      setDailyLoopActionResult(synthetic);
      showToast(`Revert failed: ${String(e?.message || e)}`);
    } finally {
      activeProfileRevertInflightRef.current = false;
    }
  }

  async function refreshHeartbeatSuggestions(): Promise<void> {
    const out = await apiGet<{ items: HeartbeatSuggestion[] }>("/api/heartbeat/autopilot_suggestions?limit=50");
    const items = Array.isArray(out.items) ? out.items : [];
    setHeartbeatSuggestions(items);
  }

  function presetForSuggestionRank(suggestion: HeartbeatSuggestion | null | undefined, rank: 1 | 2 | 3): { preset_set_id: string; display_name: string } | null {
    if (!suggestion || !Array.isArray(suggestion.preset_candidates)) return null;
    const row = suggestion.preset_candidates.find((p) => p.rank === rank);
    if (!row || !String(row.preset_set_id || "").trim()) return null;
    return {
      preset_set_id: String(row.preset_set_id || "").trim(),
      display_name: String(row.display_name || row.preset_set_id || "").trim(),
    };
  }

  function presetSourceForSuggestionRank(suggestion: HeartbeatSuggestion | null | undefined, rank: 1 | 2 | 3): "recommended_profile" | "static" | "" {
    if (!suggestion || !Array.isArray(suggestion.preset_candidates)) return "";
    const row = suggestion.preset_candidates.find((p) => p.rank === rank);
    return row?.source === "recommended_profile" || row?.source === "static" ? row.source : "";
  }

  async function saveHeartbeatSettings(): Promise<void> {
    const out = await apiPost<HeartbeatSettings>("/api/heartbeat/settings", {
      enabled: heartbeatScheduleEnabled,
      schedule: {
        mode: "daily_time",
        daily_time: heartbeatDailyTime,
        jitter_sec: Number(heartbeatJitterSec || "30"),
        tick_interval_sec: Number(heartbeatTickSec || "15"),
      },
      targets: {
        agent_ids: heartbeatTargetAgents,
        category: heartbeatCategory,
      },
      limits: {
        max_per_day: Number(heartbeatMaxPerDay || "1"),
        activity_limit: Number(heartbeatActivityLimit || "20"),
        inbox_limit: Number(heartbeatInboxLimit || "10"),
        runs_limit: Number(heartbeatRunsLimit || "10"),
      },
      safety: {
        backoff_base_sec: Number(heartbeatBackoffBaseSec || "30"),
        backoff_max_sec: Number(heartbeatBackoffMaxSec || "600"),
      },
    });
    setHeartbeatSettings(out);
    await refreshHeartbeatState();
    showToast("Heartbeat settings saved");
  }

  async function runHeartbeatNow(dryRun: boolean): Promise<void> {
    const agentId = heartbeatAgentId === "all" ? (heartbeatTargetAgents[0] || "facilitator") : heartbeatAgentId;
    const out = await apiPost<{ ok: boolean; request_id: string; skipped_reason?: string; result?: HeartbeatRunResult }>("/api/heartbeat/run_now", {
      agent_id: agentId,
      category: heartbeatCategory,
      dry_run: dryRun,
      limits: {
        activity_limit: Number(heartbeatActivityLimit || "20"),
        inbox_limit: Number(heartbeatInboxLimit || "10"),
        runs_limit: Number(heartbeatRunsLimit || "10"),
      },
    });
    if (out.result) setHeartbeatResult(out.result);
    await Promise.all([refreshHeartbeatState(), refreshActivity(), refreshInbox(), refreshHeartbeatSuggestState()]);
    if (out.skipped_reason) {
      showToast(`Heartbeat run_now skipped: ${out.skipped_reason}`);
      return;
    }
    showToast(dryRun ? "Heartbeat run_now dry-run ok" : "Heartbeat run_now queued");
    await Promise.all([refreshHeartbeatSuggestions(), refreshHeartbeatSuggestState()]);
  }

  function toggleHeartbeatTargetAgent(agentId: string): void {
    const id = String(agentId || "").trim();
    if (!id) return;
    setHeartbeatTargetAgents((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next.length ? next : [id];
      }
      return [...prev, id];
    });
  }

  function toggleConsolidationAgent(agentId: string): void {
    const id = String(agentId || "").trim();
    if (!id) return;
    setConsolidationAgents((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next.length ? next : [id];
      }
      return [...prev, id];
    });
  }

  async function acceptHeartbeatSuggestionById(id: string, rank?: 1 | 2 | 3, explicitPresetSetId?: string): Promise<void> {
    const sid = String(id || "").trim();
    if (!sid) return;
    const selectedRank: 1 | 2 | 3 = rank || 1;
    const current = heartbeatSuggestions.find((s) => s.id === sid) || selectedHeartbeatSuggestion;
    const mappedPreset = presetForSuggestionRank(current, selectedRank);
    const presetSetId = String(explicitPresetSetId || mappedPreset?.preset_set_id || "").trim();
    const endpoint = `/api/heartbeat/autopilot_suggestions/${encodeURIComponent(sid)}/accept`;

    const preflightPayload: Record<string, unknown> = { rank: selectedRank, dry_run: true };
    if (presetSetId) preflightPayload.preset_set_id = presetSetId;
    const preflight = await apiPost<HeartbeatSuggestionAcceptResult>(endpoint, preflightPayload);
    setHeartbeatSuggestAcceptResult(preflight);
    if (preflight?.suggestion) setSelectedHeartbeatSuggestion(preflight.suggestion);
    await Promise.all([refreshHeartbeatSuggestions(), refreshInbox()]);
    if (preflight?.ok !== true) {
      showToast(`Preflight failed: ${String(preflight?.reason || "ERR_PRESET_APPLY_FAILED")}`);
      return;
    }

    const confirmLine = window.prompt(
      `This will overwrite council identity_traits before Autopilot start.\nrank=${selectedRank}\npreset=${presetSetId || "(none)"}\nType APPLY to continue.`,
      "",
    );
    if (String(confirmLine || "").trim() !== "APPLY") {
      showToast("Start canceled");
      return;
    }

    const startPayload: Record<string, unknown> = { rank: selectedRank, dry_run: false };
    if (presetSetId) startPayload.preset_set_id = presetSetId;
    const out = await apiPost<HeartbeatSuggestionAcceptResult>(endpoint, startPayload);
    setHeartbeatSuggestAcceptResult(out);
    await Promise.all([refreshHeartbeatSuggestions(), refreshInbox(), refreshRuns(), refreshOrgAgents(), refreshActivity()]);
    if (out?.suggestion) setSelectedHeartbeatSuggestion(out.suggestion);
    if (out?.autopilot_run_id) {
      showToast(`Autopilot started: ${out.autopilot_run_id}${selectedRank ? ` (rank ${selectedRank})` : ""}`);
      jumpToRun(String(out.autopilot_run_id));
      return;
    }
    if (out?.ok !== true) {
      showToast(`Start blocked: ${String(out?.reason || "ERR_PRESET_APPLY_FAILED")}`);
      return;
    }
    showToast("Suggestion accepted");
  }

  async function dismissHeartbeatSuggestionById(id: string): Promise<void> {
    const sid = String(id || "").trim();
    if (!sid) return;
    const out = await apiPost<{ suggestion: HeartbeatSuggestion }>(`/api/heartbeat/autopilot_suggestions/${encodeURIComponent(sid)}/dismiss`, {});
    await Promise.all([refreshHeartbeatSuggestions(), refreshInbox()]);
    if (out?.suggestion) setSelectedHeartbeatSuggestion(out.suggestion);
    showToast("Suggestion dismissed");
  }

  function clamp01(n: number): number {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function defaultSeatPosition(index: number): { x: number; y: number } {
    const col = index % 2;
    const row = Math.floor(index / 2);
    return {
      x: col === 0 ? 0.28 : 0.72,
      y: [0.2, 0.5, 0.8][row] ?? 0.8,
    };
  }

  function stateZoneOrder(status: OrgAgentStatus): number {
    if (status === "idle") return 0;
    if (status === "writing") return 1;
    if (status === "researching") return 2;
    if (status === "executing") return 3;
    if (status === "syncing") return 4;
    return 5;
  }

  function stateZoneLabel(status: OrgAgentStatus): string {
    if (status === "idle") return "Idle Zone";
    if (status === "writing") return "Writing Zone";
    if (status === "researching") return "Research Zone";
    if (status === "executing") return "Execute Zone";
    if (status === "syncing") return "Sync Zone";
    return "Error Zone";
  }

  function seatPositionForAgent(agent: OrgAgent, index: number): { x: number; y: number } {
    if (workspaceAutoLayoutZones) {
      const zone = stateZoneOrder(agent.status);
      const lane = Math.floor(index / 6);
      const col = zone % 3;
      const row = Math.floor(zone / 3);
      return {
        x: clamp01(0.18 + (col * 0.32) + (lane * 0.04)),
        y: clamp01(0.24 + (row * 0.42)),
      };
    }
    const draft = workspaceLayoutDraft[agent.id];
    if (draft) return { x: clamp01(draft.x), y: clamp01(draft.y) };
    if (agent.layout && Number.isFinite(agent.layout.x) && Number.isFinite(agent.layout.y)) {
      return { x: clamp01(Number(agent.layout.x)), y: clamp01(Number(agent.layout.y)) };
    }
    return defaultSeatPosition(index);
  }

  function roomEventToNormalized(ev: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const room = workspaceRoomRef.current;
    if (!room) return null;
    const rect = room.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = clamp01((ev.clientX - rect.left) / rect.width);
    const y = clamp01((ev.clientY - rect.top) / rect.height);
    return { x, y };
  }

  async function persistAgentLayout(agentId: string, next: { x: number; y: number }): Promise<void> {
    const rollback = workspaceRollbackRef.current ? { ...workspaceRollbackRef.current } : {};
    try {
      await apiPost<OrgAgentsSnapshot>("/api/org/agents", {
        agents: [{ id: agentId, layout: { x: clamp01(next.x), y: clamp01(next.y) } }],
        actor_id: "ui_discord",
      });
      await Promise.all([refreshOrgAgents(), refreshActivity()]);
      showToast("Layout saved");
    } catch (e: any) {
      if (rollback && rollback[agentId]) {
        setWorkspaceLayoutDraft((prev) => ({ ...prev, [agentId]: rollback[agentId] }));
      } else {
        setWorkspaceLayoutDraft((prev) => {
          const { [agentId]: _removed, ...rest } = prev;
          return rest;
        });
      }
      showToast(`Layout save failed: ${String(e?.message || e)}`);
    }
  }

  useEffect(() => {
    Promise.all([
      refreshThreads(),
      refreshReadState(),
      refreshRuns(),
      refreshRecipes(),
      refreshDesigns(),
      refreshClipboard(),
      refreshMessages(),
      refreshPins(),
      loadDesktopSettingsUi(),
      refreshInbox(),
      refreshInboxReadState(),
      refreshTaskifyDrafts(),
      refreshOrgAgents(),
      refreshOrgGuests(),
      refreshGuestKeys(),
      refreshAgentPresets(),
      refreshActivity(),
      refreshHeartbeatSettings(),
      refreshHeartbeatState(),
      refreshHeartbeatSuggestSettings(),
      refreshHeartbeatSuggestState(),
      refreshHeartbeatSuggestions(),
      refreshConsolidationSettings(),
      refreshConsolidationState(),
      refreshMorningBriefSettings(),
      refreshMorningBriefState(),
      refreshThreadArchiveSchedulerSettings(),
      refreshThreadArchiveSchedulerState(),
      refreshDailyLoopDashboard(),
      refreshDashboardYesterdayMemo("facilitator"),
      refreshOpsQuickActionsStatus(),
      refreshOpsAutoStabilize(),
    ])
      .then(() => setStatus("loaded"))
      .catch((e: any) => setStatus(String(e?.message || e)));
  }, []);

  useEffect(() => {
    void restoreTrackerHistoryFromWorkspace(false);
  }, []);

  useEffect(() => {
    if (!CHAT_CHANNELS.includes(activeChannel)) return;
    Promise.all([refreshMessages(), refreshPins()])
      .then(() => setStatus("thread_loaded"))
      .catch((e: any) => setStatus(String(e?.message || e)));
  }, [activeChannel]);

  useEffect(() => {
    if (activeChannel !== "settings") return;
    Promise.all([
      loadDesktopSettingsUi(),
      refreshHeartbeatSettings(),
      refreshHeartbeatState(),
      refreshHeartbeatSuggestSettings(),
      refreshHeartbeatSuggestState(),
      refreshHeartbeatSuggestions(),
      refreshConsolidationSettings(),
      refreshConsolidationState(),
      refreshMorningBriefSettings(),
      refreshMorningBriefState(),
      refreshThreadArchiveSchedulerSettings(),
      refreshThreadArchiveSchedulerState(),
      refreshOrgGuests(),
      refreshGuestKeys(),
    ])
      .catch((e: any) => setStatus(String(e?.message || e)));
  }, [activeChannel]);

  useEffect(() => {
    orgAgentsRef.current = orgAgents;
  }, [orgAgents]);

  useEffect(() => {
    if (!orgGuests.length) {
      if (selectedGuestId) setSelectedGuestId("");
      return;
    }
    if (!orgGuests.find((g) => g.id === selectedGuestId)) {
      setSelectedGuestId(orgGuests[0].id);
    }
  }, [orgGuests, selectedGuestId]);

  useEffect(() => {
    if (!orgAgents.length) return;
    const ids = new Set(orgAgents.map((a) => a.id));
    if (heartbeatAgentId === "all") return;
    if (!ids.has(heartbeatAgentId)) {
      const fallback = orgAgents.find((a) => a.id === "facilitator")?.id || orgAgents[0].id;
      setHeartbeatAgentId(fallback);
    }
  }, [orgAgents, heartbeatAgentId]);

  useEffect(() => {
    const selected = orgAgents.find((x) => x.id === selectedAgentId);
    if (!selected) return;
    setAgentEditStatus(selected.status);
    setAgentEditThreadId(selected.assigned_thread_id || "none");
    setAgentIdentityTagline(String(selected.identity?.tagline || ""));
    setAgentIdentitySpeakingStyle(String(selected.identity?.speaking_style || ""));
    setAgentIdentityFocus(String(selected.identity?.focus || ""));
    setAgentIdentityValues((selected.identity?.values || []).join("\n"));
    setAgentIdentityStrengths((selected.identity?.strengths || []).join("\n"));
    setAgentIdentityWeaknesses((selected.identity?.weaknesses || []).join("\n"));
    setAgentIdentityDo((selected.identity?.do || []).join("\n"));
    setAgentIdentityDont((selected.identity?.dont || []).join("\n"));
  }, [selectedAgentId, orgAgents]);

  useEffect(() => {
    if (activeChannel === "members") {
      Promise.all([refreshOrgAgents(), refreshAgentPresets(), refreshAgentMemory()])
        .catch((e: any) => setStatus(String(e?.message || e)));
    }
    if (activeChannel === "activity") {
      refreshActivity().catch((e: any) => setStatus(String(e?.message || e)));
    }
    if (activeChannel === "workspace") {
      Promise.all([refreshOrgAgents(), refreshOrgGuests(), refreshActivity()])
        .catch((e: any) => setStatus(String(e?.message || e)));
    }
    if (activeChannel === "dashboard") {
      Promise.all([refreshDailyLoopDashboard(), refreshDashboardYesterdayMemo(), refreshOpsQuickActionsStatus(), refreshOpsAutoStabilize()]).catch((e: any) => setStatus(String(e?.message || e)));
      void restoreTrackerHistoryFromWorkspace(true);
    }
    if (activeChannel === "office") {
      Promise.all([refreshOrgAgents(), refreshOrgGuests(), refreshActivity(), refreshDailyLoopDashboard(), refreshDashboardYesterdayMemo(), refreshCouncilStatus(), refreshOpsQuickActionsStatus()])
        .catch((e: any) => setStatus(String(e?.message || e)));
    }
    if (activeChannel === "debate") {
      Promise.all([refreshCouncilStatus(), refreshInbox(), refreshOrgAgents(), refreshDailyLoopDashboard()])
        .catch((e: any) => setStatus(String(e?.message || e)));
    }
  }, [activeChannel]);

  useEffect(() => {
    if (activeChannel !== "members") return;
    refreshAgentMemory().catch((e: any) => setStatus(String(e?.message || e)));
  }, [activeChannel, selectedAgentId, agentMemoryCategory]);

  useEffect(() => {
    if (activeChannel !== "dashboard") return;
    let disposed = false;
    const relevantTypes = new Set<string>([
      "heartbeat",
      "heartbeat_scheduler",
      "memory_append",
      "consolidation",
      "autopilot_auto_start",
      "agents_updated",
      "agent_state_changed",
      "guest_joined",
      "guest_pushed",
      "guest_left",
      "inbox_append",
      "export_request",
      "export_done",
    ]);
    const clearDebounce = () => {
      if (dashboardDebounceTimerRef.current !== null) {
        window.clearTimeout(dashboardDebounceTimerRef.current);
        dashboardDebounceTimerRef.current = null;
      }
    };
    const clearPoll = () => {
      if (dashboardPollTimerRef.current !== null) {
        window.clearInterval(dashboardPollTimerRef.current);
        dashboardPollTimerRef.current = null;
      }
    };
    const startPoll = () => {
      clearPoll();
      dashboardPollTimerRef.current = window.setInterval(() => {
        if (disposed) return;
        refreshDailyLoopDashboard().catch(() => {});
      }, 5000);
    };
    const stopPoll = () => clearPoll();
    const scheduleRefresh = () => {
      clearDebounce();
      dashboardDebounceTimerRef.current = window.setTimeout(() => {
        if (disposed) return;
        const now = Date.now();
        if (now - dashboardLastRefreshMsRef.current < 2000) return;
        refreshDailyLoopDashboard().catch(() => {});
      }, 300);
    };
    const handleRawEvent = (raw: string): void => {
      let parsed: any = null;
      try {
        parsed = JSON.parse(String(raw || ""));
      } catch {
        return;
      }
      const eventId = String(parsed?.id || "").trim();
      if (eventId) setDashboardLastEventId(eventId);
      const eventType = String(parsed?.event_type || "").trim();
      if (!eventType || relevantTypes.has(eventType)) {
        scheduleRefresh();
      }
    };

    setDashboardSseConnected(false);
    setDashboardLastEventId("");
    refreshDailyLoopDashboard().catch(() => {});
    startPoll();

    try {
      const es = new EventSource(`${API_BASE}/api/activity/stream?limit=20`);
      dashboardSseRef.current = es;
      es.addEventListener("hello", () => {
        setDashboardSseConnected(true);
        stopPoll();
      });
      es.addEventListener("activity", (ev: Event) => {
        const me = ev as MessageEvent;
        handleRawEvent(String(me.data || ""));
      });
      es.onopen = () => {
        setDashboardSseConnected(true);
        stopPoll();
      };
      es.onerror = () => {
        setDashboardSseConnected(false);
        startPoll();
      };
    } catch {
      setDashboardSseConnected(false);
      startPoll();
    }

    return () => {
      disposed = true;
      setDashboardSseConnected(false);
      clearDebounce();
      clearPoll();
      if (dashboardSseRef.current) {
        dashboardSseRef.current.close();
        dashboardSseRef.current = null;
      }
    };
  }, [activeChannel]);

  useEffect(() => {
    if (activeChannel === "dashboard") return;
    clearExecutionTrackerTimer();
  }, [activeChannel]);

  useEffect(() => {
    activeExecutionTrackerRef.current = activeExecutionTracker;
  }, [activeExecutionTracker]);

  useEffect(() => {
    const tracker = activeExecutionTracker;
    if (!tracker) return;
    const status = tracker.status;
    if (!(status === "success" || status === "failed" || status === "timeout" || status === "canceled")) return;
    const logKey = `${tracker.id}|${tracker.kind}|${tracker.startedAt}|${status}`;
    if (executionTrackerTerminalLoggedRef.current === logKey) return;
    executionTrackerTerminalLoggedRef.current = logKey;
    const endedAtIso = new Date().toISOString();
    const entry: ExecutionTrackerHistoryItem = {
      id: tracker.id,
      kind: tracker.kind,
      started_at: new Date(tracker.startedAt).toISOString(),
      ended_at: endedAtIso,
      status,
      request_id: tracker.requestId || undefined,
      run_id: tracker.runId || undefined,
      thread_key: tracker.threadKey || undefined,
      elapsed_ms: Math.max(0, Date.now() - tracker.startedAt),
      last_summary: summarizeTrackerPayload(tracker.lastPayload || null, status, String(tracker.lastError || "")),
      last_payload_sample: makeTrackerPayloadSample(tracker.lastPayload || null),
    };
    void appendTrackerHistoryToWorkspace(entry);
    setTrackerHistory((prev) => [entry, ...prev].slice(0, 10));
    if (status === "success" && trackerAutoCloseOnSuccess) {
      setActiveExecutionTracker(null);
      showToast("Completed (saved to history)");
    }
  }, [activeExecutionTracker, trackerAutoCloseOnSuccess]);

  useEffect(() => {
    if (trackerHistorySaveTimerRef.current !== null) {
      window.clearTimeout(trackerHistorySaveTimerRef.current);
      trackerHistorySaveTimerRef.current = null;
    }
    trackerHistorySaveTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(TRACKER_HISTORY_STORAGE_KEY, JSON.stringify(trackerHistory.slice(0, 10)));
      } catch {
        // best-effort local storage only
      }
    }, 200);
    return () => {
      if (trackerHistorySaveTimerRef.current !== null) {
        window.clearTimeout(trackerHistorySaveTimerRef.current);
        trackerHistorySaveTimerRef.current = null;
      }
    };
  }, [trackerHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(TRACKER_HISTORY_AUTO_CLOSE_STORAGE_KEY, trackerAutoCloseOnSuccess ? "1" : "0");
    } catch {
      // best-effort local storage only
    }
  }, [trackerAutoCloseOnSuccess]);

  useEffect(() => {
    return () => {
      if (trackerHistorySaveTimerRef.current !== null) {
        window.clearTimeout(trackerHistorySaveTimerRef.current);
        trackerHistorySaveTimerRef.current = null;
      }
      clearExecutionTrackerTimer();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CHARACTER_SHEET_LAST_AGENT_STORAGE_KEY, characterSheetLastAgentId || "");
    } catch {
      // best-effort local storage only
    }
  }, [characterSheetLastAgentId]);

  useEffect(() => {
    if (!characterSheetAgentId) return;
    setCharacterSheetLiveActivity([]);
    characterSheetActivitySeenRef.current = [];
    refreshCharacterSheetMemory(characterSheetAgentId).catch(() => {});
  }, [characterSheetAgentId, characterSheetIncludeDerivedMemory]);

  useEffect(() => {
    const agentId = String(characterSheetAgentId || "").trim();
    if (!agentId) return;
    const clearPoll = () => {
      if (characterSheetActivityPollRef.current !== null) {
        window.clearInterval(characterSheetActivityPollRef.current);
        characterSheetActivityPollRef.current = null;
      }
    };
    const closeSse = () => {
      if (characterSheetActivitySseRef.current) {
        characterSheetActivitySseRef.current.close();
        characterSheetActivitySseRef.current = null;
      }
    };
    const runPollOnce = () => {
      apiGet<{ items: ActivityEvent[] }>("/api/activity?limit=80")
        .then((out) => ingestCharacterSheetActivityItems(Array.isArray(out.items) ? out.items : [], agentId))
        .catch(() => {});
    };
    const startPoll = () => {
      clearPoll();
      setCharacterSheetActivityStatus("polling");
      runPollOnce();
      characterSheetActivityPollRef.current = window.setInterval(runPollOnce, 5000);
    };
    setCharacterSheetActivityStatus("connecting");
    runPollOnce();
    clearPoll();
    closeSse();
    try {
      const es = new EventSource(`${API_BASE}/api/activity/stream?limit=20`);
      characterSheetActivitySseRef.current = es;
      es.addEventListener("activity", (ev: Event) => {
        try {
          const me = ev as MessageEvent;
          const item = JSON.parse(String(me.data || "")) as ActivityEvent;
          ingestCharacterSheetActivityItems([item], agentId);
        } catch {
          // parse failure: ignore event only
        }
      });
      es.onopen = () => setCharacterSheetActivityStatus("sse");
      es.onerror = () => {
        closeSse();
        startPoll();
      };
    } catch {
      startPoll();
    }
    return () => {
      clearPoll();
      closeSse();
      setCharacterSheetActivityStatus("idle");
    };
  }, [characterSheetAgentId]);

  useEffect(() => {
    if (!(activeChannel === "activity" || activeChannel === "workspace")) return;
    const mode = activeChannel;
    const clearFallback = () => {
      if (activityFallbackTimerRef.current !== null) {
        window.clearInterval(activityFallbackTimerRef.current);
        activityFallbackTimerRef.current = null;
      }
    };
    const closeSse = () => {
      if (activitySseRef.current) {
        activitySseRef.current.close();
        activitySseRef.current = null;
      }
    };
    const runFallbackOnce = () => {
      if (mode === "workspace") {
        Promise.all([refreshOrgAgents(), refreshOrgGuests(), apiGet<{ items: ActivityEvent[] }>("/api/activity?limit=20")])
          .then(([, , out]) => {
            const items = Array.isArray(out.items) ? out.items : [];
            ingestActivityItems(items);
            ingestWorkspaceActivity(items);
          })
          .catch(() => {});
        return;
      }
      apiGet<{ items: ActivityEvent[] }>("/api/activity?limit=200")
        .then((out) => ingestActivityItems(Array.isArray(out.items) ? out.items : []))
        .catch(() => {});
    };
    const startFallback = () => {
      clearFallback();
      runFallbackOnce();
      activityFallbackTimerRef.current = window.setInterval(runFallbackOnce, 2000);
    };

    clearFallback();
    closeSse();
    if (activitySseFailedRef.current[mode]) {
      startFallback();
      return () => {
        clearFallback();
        closeSse();
      };
    }
    try {
      const es = new EventSource(`${API_BASE}/api/activity/stream?limit=20`);
      activitySseRef.current = es;
      es.addEventListener("activity", (ev: Event) => {
        try {
          const me = ev as MessageEvent;
          const item = JSON.parse(String(me.data || "")) as ActivityEvent;
          ingestActivityItems([item]);
          if (mode === "workspace") {
            ingestWorkspaceActivity([item]);
            if (item.event_type === "agents_updated") {
              refreshOrgAgents().catch(() => {});
            }
            if (item.event_type === "guest_joined" || item.event_type === "guest_pushed" || item.event_type === "guest_left") {
              refreshOrgGuests().catch(() => {});
            }
          }
        } catch {
          // parse failure: ignore event only
        }
      });
      es.onerror = () => {
        activitySseFailedRef.current[mode] = true;
        closeSse();
        startFallback();
      };
    } catch {
      activitySseFailedRef.current[mode] = true;
      startFallback();
    }
    return () => {
      clearFallback();
      closeSse();
    };
  }, [activeChannel]);

  useEffect(() => {
    const prev = prevAgentStatusRef.current;
    const next: Record<string, string> = {};
    for (const agent of orgAgents) next[agent.id] = agent.status;
    if (Object.keys(prev).length === 0) {
      prevAgentStatusRef.current = next;
      return;
    }
    for (const agent of orgAgents) {
      const from = prev[agent.id];
      if (from && from !== agent.status) {
        addWorkspaceBubble(agent.id, "Status changed", `${from} -> ${agent.status}`, { thread_id: agent.assigned_thread_id || "" }, `status_${agent.id}_${agent.last_updated_at}`);
      }
    }
    prevAgentStatusRef.current = next;
  }, [orgAgents]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setWorkspaceBubbles((prev) => {
        const next: Record<string, WorkspaceBubble> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (Number(v.expires_at || 0) > now) next[k] = v;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const ids = new Set(orgAgents.map((a) => a.id));
    setWorkspaceLayoutDraft((prev) => {
      const next: Record<string, { x: number; y: number }> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (ids.has(k)) next[k] = v;
      }
      return next;
    });
  }, [orgAgents]);

  useEffect(() => {
    if (!workspaceEditLayout || !workspaceDraggingAgentId) return;
    const onMove = (ev: PointerEvent) => {
      const pos = roomEventToNormalized(ev);
      if (!pos) return;
      setWorkspaceLayoutDraft((prev) => ({ ...prev, [workspaceDraggingAgentId]: pos }));
    };
    const onUp = () => {
      const draggingId = workspaceDraggingAgentId;
      setWorkspaceDraggingAgentId("");
      if (!draggingId) return;
      const next = workspaceLayoutDraft[draggingId];
      if (!next) return;
      void persistAgentLayout(draggingId, next);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [workspaceEditLayout, workspaceDraggingAgentId, workspaceLayoutDraft]);

  useEffect(() => {
    if (activeChannel !== "inbox") return;
    Promise.all([refreshInbox(), refreshInboxReadState()])
      .catch((e: any) => setStatus(String(e?.message || e)));
  }, [activeChannel]);

  useEffect(() => {
    if (activeChannel !== "drafts") return;
    refreshTaskifyDrafts()
      .catch((e: any) => setStatus(String(e?.message || e)));
  }, [activeChannel]);

  useEffect(() => {
    if (!selectedRunId) return;
    apiGet<any>(`/api/runs/${selectedRunId}`)
      .then((data) => setSelectedRunDetail(data))
      .catch((e: any) => setStatus(String(e?.message || e)));
  }, [selectedRunId]);

  useEffect(() => {
    const requestId = String(opsSnapshotResult?.request_id || "").trim();
    const status = String(opsSnapshotResult?.status || "").trim();
    if (!requestId) return;
    if (!(status === "queued" || status === "running" || !status)) return;
    const id = setInterval(() => {
      refreshOpsSnapshotStatus(requestId).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [opsSnapshotResult?.request_id, opsSnapshotResult?.status]);

  useEffect(() => {
    const rid = String(councilRunId || "").trim();
    const st = String(councilStatus?.run?.status || "").trim();
    if (!rid) return;
    if (st === "completed" || st === "failed" || st === "stopped") return;
    refreshCouncilStatus(rid).catch(() => {});
    const id = setInterval(() => {
      refreshCouncilStatus(rid).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [councilRunId, councilStatus?.run?.status]);

  useEffect(() => {
    if (!selectedDesign) return;
    apiGet<{ text: string }>(`/api/designs/${selectedDesign}`)
      .then((data) => setDesignText(data.text || ""))
      .catch((e: any) => setStatus(String(e?.message || e)));
  }, [selectedDesign]);

  useEffect(() => {
    const draftId = String(selectedTaskifyDraft?.id || "");
    if (!draftId) {
      setTaskifyTrackingItem(null);
      return;
    }
    refreshTaskifyTrackingByDraft(draftId).catch(() => {});
    const id = setInterval(() => {
      refreshTaskifyTrackingByDraft(draftId).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [selectedTaskifyDraft?.id]);

  useEffect(() => {
    if (!selectedMessage) return;
    const payload = {
      thread_id: selectedMessage.thread_id,
      msg_id: selectedMessage.id,
      role: selectedMessage.role,
      text: selectedMessage.text,
      links: selectedMessage.links || {},
      created_at: selectedMessage.created_at,
    };
    window.postMessage({ type: "regionai:selected", payload }, "*");
  }, [selectedMessage]);

  useEffect(() => {
    if (!messages.length) return;
    markRead(messages[messages.length - 1].id).catch(() => {});
  }, [chatThreadId, messages.length]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!CHAT_CHANNELS.includes(activeChannel)) return;
      const lastId = messages.length ? messages[messages.length - 1].id : "";
      apiGet<{ messages: ChatMessage[] }>(`/api/chat/threads/${chatThreadId}/messages?limit=50&after=${encodeURIComponent(lastId)}`)
        .then((data) => {
          const next = data.messages || [];
          if (!next.length) return;
          setMessages((prev) => [...prev, ...next].slice(-200));
        })
        .catch(() => {});
      refreshUnreadSummary().catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, [activeChannel, chatThreadId, messages]);

  useEffect(() => {
    const id = setInterval(() => {
      refreshInbox().catch(() => {});
      refreshInboxReadState().catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
        setCommandPaletteQuery("");
      }
      if (e.key === "Escape" && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    window.setTimeout(() => {
      commandPaletteInputRef.current?.focus();
    }, 10);
  }, [commandPaletteOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, uiTheme);
    } catch {}
    document.documentElement.setAttribute("data-ui-theme", uiTheme);
  }, [uiTheme]);

  useEffect(() => {
    try {
      localStorage.setItem(UI_EFFECTS_STORAGE_KEY, uiEffects);
    } catch {}
    document.documentElement.setAttribute("data-ui-effects", uiEffects);
  }, [uiEffects]);

  useEffect(() => {
    const nextRecent = readStoredCommandPaletteRecent(recentTargetsStorageKey, true);
    setCommandPaletteRecent((prev) => {
      const prevJson = JSON.stringify(prev);
      const nextJson = JSON.stringify(nextRecent);
      return prevJson === nextJson ? prev : nextRecent;
    });
  }, [recentTargetsStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(recentTargetsStorageKey, JSON.stringify(commandPaletteRecent.slice(0, 8)));
    } catch {}
  }, [commandPaletteRecent, recentTargetsStorageKey]);

  useEffect(() => {
    const nextFavorites = readStoredTargetEntries(favoriteTargetsStorageKey, 6);
    setCommandPaletteFavorites((prev) => {
      const prevJson = JSON.stringify(prev);
      const nextJson = JSON.stringify(nextFavorites);
      return prevJson === nextJson ? prev : nextFavorites;
    });
  }, [favoriteTargetsStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(favoriteTargetsStorageKey, JSON.stringify(commandPaletteFavorites.slice(0, 6)));
    } catch {}
  }, [commandPaletteFavorites, favoriteTargetsStorageKey]);

  useEffect(() => {
    const raw = String(localStorage.getItem(getQuickAccessModeStorageKey(officeWorkspaceKey)) || "").trim().toLowerCase();
    setQuickAccessMode(raw === "recent" ? "recent" : "favorites");
    setQuickAccessFavoritesExpanded(false);
    setQuickAccessRecentExpanded(false);
  }, [officeWorkspaceKey]);

  useEffect(() => {
    try {
      localStorage.setItem(getQuickAccessModeStorageKey(officeWorkspaceKey), quickAccessMode);
    } catch {}
  }, [officeWorkspaceKey, quickAccessMode]);


  useEffect(() => {
    const handleQuickAccessFavoriteKeydown = (ev: KeyboardEvent): void => {
      if (activeChannel !== "office" || quickAccessMode !== "favorites") return;
      if (!ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      if (isEditableElement(ev.target)) return;
      const index = Number(ev.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= 3) return;
      const item = visibleQuickAccessFavorites[index];
      if (!item) return;
      ev.preventDefault();
      item.run();
    };
    window.addEventListener("keydown", handleQuickAccessFavoriteKeydown);
    return () => window.removeEventListener("keydown", handleQuickAccessFavoriteKeydown);
  }, [activeChannel, quickAccessMode, visibleQuickAccessFavorites]);

  useEffect(() => {
    const defaultIds = defaultOrderedAgents.map((agent) => agent.id);
    const scopedOrder = readStoredStringArray(officeLayoutStorageKey);
    const legacyOrder = readStoredStringArray(OFFICE_LAYOUT_STORAGE_KEY);
    const seed = scopedOrder.length > 0 ? scopedOrder : legacyOrder;
    const normalized = mergeStoredOrder(seed, defaultIds);
    setOfficeLayoutOrder((prev) => {
      if (arraysEqual(prev, normalized)) return prev;
      officeLayoutSkipSaveRef.current = true;
      return normalized;
    });
  }, [officeLayoutStorageKey, orgAgents]);

  useEffect(() => {
    if (officeLayoutSkipSaveRef.current) {
      officeLayoutSkipSaveRef.current = false;
      return;
    }
    try {
      if (officeLayoutOrder.length < 1) {
        localStorage.removeItem(officeLayoutStorageKey);
      } else {
        localStorage.setItem(officeLayoutStorageKey, JSON.stringify(officeLayoutOrder));
      }
    } catch {}
  }, [officeLayoutOrder]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || typeof data !== "object") return;
      if (String((data as any).type || "") !== "regionai:navigate") return;
      const payload = (((data as any).payload && typeof (data as any).payload === "object")
        ? (data as any).payload
        : {}) as RegionNavigatePayload;
      const runId = String(payload.run_id || "").trim();
      const threadId = String(payload.thread_id || "").trim();
      const inboxId = String(payload.inbox_id || "").trim();
      const msgId = String(payload.msg_id || "").trim();

      if (runId) {
        setActiveChannel("runs");
        setSelectedRunId(runId);
        setStatus("navigate:runs");
      } else if (threadId && CHAT_CHANNELS.includes(threadId as ChannelId)) {
        setActiveChannel(threadId as ChannelId);
        setStatus("navigate:thread");
      } else {
        setActiveChannel("inbox");
        setStatus("navigate:inbox");
      }

      if (inboxId) {
        const hit = inboxItems.find((x) => String(x.id || "") === inboxId);
        if (hit) setSelectedInboxItem(hit);
      }
      if (msgId && threadId && CHAT_CHANNELS.includes(threadId as ChannelId)) {
        const hit = messages.find((x) => String(x.id || "") === msgId);
        if (hit) setSelectedMessage(hit);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [inboxItems, messages]);

  useEffect(() => {
    refreshUnreadSummary().catch(() => {});
  }, [threads, readState]);

  useEffect(() => {
    const inboxUnread = computeInboxUnreadCount(inboxItems, inboxReadState);
    setUnreadCount((prev) => ({ ...prev, inbox: inboxUnread }));
    const globalTs = String(inboxReadState.global_last_read_ts || "");
    const globalMs = globalTs ? new Date(globalTs).getTime() : 0;
    const hasMention = inboxItems.some((it) => {
      if (!it.mention) return false;
      if (!globalMs) return true;
      const tsMs = new Date(String(it.ts || "")).getTime();
      return Number.isFinite(tsMs) && tsMs > globalMs;
    });
    setMentionFlag((prev) => ({ ...prev, inbox: hasMention }));
  }, [inboxItems, inboxReadState]);

  useEffect(() => {
    localStorage.setItem("region_ai_inbox_search", inboxFilter);
  }, [inboxFilter]);
  useEffect(() => {
    localStorage.setItem("region_ai_inbox_mentions_only", inboxMentionsOnly ? "1" : "0");
  }, [inboxMentionsOnly]);
  useEffect(() => {
    localStorage.setItem("region_ai_inbox_thread_filter", inboxThreadFilter);
  }, [inboxThreadFilter]);
  useEffect(() => {
    localStorage.setItem("region_ai_inbox_thread_key_filter", inboxThreadKeyFilter);
  }, [inboxThreadKeyFilter]);
  useEffect(() => {
    localStorage.setItem("region_ai_inbox_source_filter", inboxSourceFilter);
  }, [inboxSourceFilter]);
  useEffect(() => {
    localStorage.setItem("region_ai_inbox_has_links_only", inboxHasLinksOnly ? "1" : "0");
  }, [inboxHasLinksOnly]);
  useEffect(() => {
    const key = String(selectedInboxItem?.thread_key || "").trim();
    if (!key) return;
    setInboxThreadViewKey(key);
    setInboxThreadViewStatus("idle");
    setInboxThreadArchiveResult(null);
  }, [selectedInboxItem?.id, selectedInboxItem?.thread_key]);

  async function sendMessage(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!composerText.trim()) return;
    const payload = { role: composerRole, kind: "note", text: composerText, links: {} };
    await apiPost(`/api/chat/threads/${chatThreadId}/messages`, payload);
    setComposerText("");
    await refreshThreads();
    await refreshMessages();
  }

  async function copyBus(targetRole: string): Promise<void> {
    const text = formatForRole(targetRole, composerText || (selectedMessage?.text || ""));
    await navigator.clipboard.writeText(text);
    await apiPost("/api/chat/clipboard", { role: targetRole, text });
    await refreshClipboard();
    setStatus(`copied_for_${targetRole}`);
  }

  async function pasteFromClipboard(): Promise<void> {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) return;
    await apiPost(`/api/chat/threads/${chatThreadId}/messages`, {
      role: composerRole,
      kind: "note",
      text,
      links: {},
    });
    await refreshMessages();
    setStatus("pasted_as_message");
  }

  async function togglePin(msgId: string): Promise<void> {
    const isPinned = pins.includes(msgId);
    const data = await apiPost<{ pins: string[] }>(`/api/chat/threads/${chatThreadId}/pins`, {
      op: isPinned ? "remove" : "add",
      msg_id: msgId,
    });
    setPins(data.pins || []);
  }

  function quoteMessage(msg: ChatMessage): void {
    const q = msg.text.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
    setComposerText((prev) => `${prev ? `${prev}\n\n` : ""}${q}\n\n`);
  }

  function jumpToRun(runId: string): void {
    const id = String(runId || "").trim();
    if (!id) return;
    recordRecentTarget({
      id: `run_${id}`,
      title: `Run: ${formatCompactTargetId("run", id)}`,
      subtitle: "Open current operational run",
    });
    setActiveChannel("runs");
    setSelectedRunId(id);
  }

  function jumpToDesign(designId: string): void {
    setActiveChannel("designs");
    setSelectedDesign(designId.endsWith(".md") ? designId : `${designId}.md`);
  }

  function jumpToThread(threadId: string): void {
    const tid = String(threadId || "").trim();
    if (!tid) return;
    if (CHAT_CHANNELS.includes(tid as ChannelId)) {
      setActiveChannel(tid as ChannelId);
      return;
    }
    setActiveChannel("general");
    setStatus(`thread_not_mapped:${tid}`);
  }

  function openAgentMemory(agentId: string, category: MemoryCategory = "episodes"): void {
    const id = String(agentId || "").trim();
    if (!id) return;
    setActiveChannel("members");
    setSelectedAgentId(id);
    setAgentMemoryCategory(category);
  }

  function openCharacterSheet(agentId: string): void {
    const id = String(agentId || "").trim();
    if (!id) return;
    const agent = orgAgents.find((item) => String(item.id || "").trim() === id) || null;
    recordRecentTarget({
      id: `agent_${id}`,
      title: `Agent: ${agent?.display_name || id}`,
      subtitle: agent?.role ? `${agent.role} | ${agent.status || "idle"}` : "Open right-pane Character Sheet",
    });
    setCharacterSheetAgentId(id);
    setCharacterSheetLastAgentId(id);
    try {
      localStorage.setItem(CHARACTER_SHEET_LAST_AGENT_STORAGE_KEY, id);
    } catch {
      // best-effort local storage only
    }
  }

  function closeCharacterSheet(): void {
    setCharacterSheetAgentId("");
    setCharacterSheetLiveActivity([]);
    setCharacterSheetActivityStatus("idle");
  }

  function reorderOfficeLayoutByIds(dragAgentId: string, targetAgentId: string): void {
    const dragId = String(dragAgentId || "").trim();
    const targetId = String(targetAgentId || "").trim();
    if (!dragId || !targetId || dragId === targetId) return;
    setOfficeLayoutOrder((prev) => {
      const currentIds = mergeStoredOrder(prev, orderedAgents.map((agent) => agent.id));
      const fromIndex = currentIds.indexOf(dragId);
      const toIndex = currentIds.indexOf(targetId);
      if (fromIndex < 0 || toIndex < 0) return currentIds;
      return moveItem(currentIds, fromIndex, toIndex);
    });
  }

  function resetOfficeLayout(): void {
    setOfficeLayoutOrder([]);
    setOfficeDragAgentId("");
  }

  function openDebateEvidence(kind: "thread" | "tracker" | "memory", row: {
    threadKey?: string;
    runId?: string;
    memoryAgentId?: string;
  }): void {
    if (kind === "thread") {
      if (!row.threadKey) {
        showToast("thread_key missing");
        return;
      }
      openTrackerThread(row.threadKey);
      return;
    }
    if (kind === "tracker") {
      if (!row.runId) {
        showToast("run_id missing");
        return;
      }
      recordRecentTarget({
        id: `tracker_${row.runId}`,
        title: `Tracker: ${formatCompactTargetId("trk", row.runId)}`,
        subtitle: `Open tracked run ${formatCompactTargetId("run", row.runId)}`,
      });
      jumpToRun(row.runId);
      return;
    }
    if (!row.memoryAgentId) {
      showToast("memory target missing");
      return;
    }
    openCharacterSheet(row.memoryAgentId);
  }

  function openCharacterSheetInboxThread(agent: OrgAgent | null): void {
    const key = String(agent?.thread_key || "").trim().toLowerCase();
    if (!key) return;
    setActiveChannel("inbox");
    void loadInboxThreadView(key, 20);
  }

  async function refreshCharacterSheetMemory(agentIdInput?: string): Promise<void> {
    const agentId = String(agentIdInput || characterSheetAgentId || "").trim();
    if (!agentId) {
      setCharacterSheetMemoryEpisodes([]);
      setCharacterSheetMemoryKnowledge([]);
      setCharacterSheetMemoryProcedures([]);
      return;
    }
    const episodesRes = await apiGet<{ items: MemoryEntry[] }>(`/api/memory/${encodeURIComponent(agentId)}/episodes?limit=3`);
    setCharacterSheetMemoryEpisodes((Array.isArray(episodesRes.items) ? episodesRes.items : []).slice(0, 3));
    if (!characterSheetIncludeDerivedMemory) {
      setCharacterSheetMemoryKnowledge([]);
      setCharacterSheetMemoryProcedures([]);
      return;
    }
    const [knowledgeRes, proceduresRes] = await Promise.all([
      apiGet<{ items: MemoryEntry[] }>(`/api/memory/${encodeURIComponent(agentId)}/knowledge?limit=3`),
      apiGet<{ items: MemoryEntry[] }>(`/api/memory/${encodeURIComponent(agentId)}/procedures?limit=3`),
    ]);
    setCharacterSheetMemoryKnowledge((Array.isArray(knowledgeRes.items) ? knowledgeRes.items : []).slice(0, 3));
    setCharacterSheetMemoryProcedures((Array.isArray(proceduresRes.items) ? proceduresRes.items : []).slice(0, 3));
  }

  function ingestCharacterSheetActivityItems(items: ActivityEvent[], agentIdInput?: string): void {
    const agentId = String(agentIdInput || characterSheetAgentId || "").trim();
    if (!agentId || !items.length) return;
    const seen = new Set(characterSheetActivitySeenRef.current);
    const merged: ActivityEvent[] = [];
    for (const item of items) {
      if (String(item.actor_id || "").trim() !== agentId) continue;
      const id = String(item.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(item);
    }
    if (!merged.length) return;
    setCharacterSheetLiveActivity((prev) => {
      const map = new Map<string, ActivityEvent>();
      for (const item of merged) map.set(String(item.id || ""), item);
      for (const item of prev) {
        const id = String(item.id || "").trim();
        if (!id || map.has(id)) continue;
        map.set(id, item);
      }
      const list = Array.from(map.values())
        .sort((a, b) => (String(a.ts || "") < String(b.ts || "") ? 1 : -1))
        .slice(0, 10);
      characterSheetActivitySeenRef.current = list.map((x) => String(x.id || "")).filter((x) => !!x);
      return list;
    });
  }

  async function runCharacterSheetHeartbeatNow(agentIdInput: string, dryRun: boolean): Promise<void> {
    const agentId = String(agentIdInput || "").trim();
    if (!agentId) return;
    const out = await apiPost<{ ok: boolean; request_id: string; skipped_reason?: string; result?: HeartbeatRunResult }>("/api/heartbeat/run_now", {
      agent_id: agentId,
      category: "episodes",
      dry_run: dryRun,
      limits: {
        activity_limit: Number(heartbeatActivityLimit || "20"),
        inbox_limit: Number(heartbeatInboxLimit || "10"),
        runs_limit: Number(heartbeatRunsLimit || "10"),
      },
    });
    if (out.result) setHeartbeatResult(out.result);
    await Promise.all([refreshHeartbeatState(), refreshActivity(), refreshInbox(), refreshHeartbeatSuggestState()]);
    if (out.skipped_reason) {
      showToast(`Heartbeat run_now skipped: ${out.skipped_reason}`);
      return;
    }
    showToast(dryRun ? "Heartbeat run_now dry-run ok" : "Heartbeat run_now queued");
  }

  function openInboxItem(item: InboxItem): void {
    setSelectedInboxItem(item);
    const suggestionId = String(item.links?.suggestion_id || "").trim();
    if (suggestionId) {
      const found = heartbeatSuggestions.find((x) => x.id === suggestionId) || null;
      setSelectedHeartbeatSuggestion(found);
    }
    const tid = String(item.thread_id || "");
    if (CHAT_CHANNELS.includes(tid as ChannelId)) {
      setActiveChannel(tid as ChannelId);
    }
  }

  function openActivityRef(item: ActivityEvent): void {
    if (item.refs?.run_id) {
      jumpToRun(String(item.refs.run_id));
      return;
    }
    if (item.refs?.thread_id) {
      jumpToThread(String(item.refs.thread_id));
    }
  }

  function statusClassFromBool(ok: boolean): DailyLoopDashboardCardStatus {
    return ok ? "ok" : "warn";
  }

  function statusClassFromResult(result: string): DailyLoopDashboardCardStatus {
    const key = String(result || "").toLowerCase();
    if (key === "fail") return "err";
    if (key === "skipped") return "warn";
    return "ok";
  }

  function roleIdFromAgentRole(role: string): string {
    const key = String(role || "").trim();
    if (key === "司会") return "facilitator";
    if (key === "設計担当") return "design";
    if (key === "実装担当") return "impl";
    if (key === "検証担当") return "qa";
    if (key === "道化師") return "jester";
    return "facilitator";
  }

  function focusDesktopRole(agent: OrgAgent): void {
    const roleId = roleIdFromAgentRole(agent.role);
    window.postMessage({ type: "regionai:focusRole", role: roleId }, "*");
    showToast(`focus role: ${roleId}`);
  }

  function insertRoundStartTemplate(agent: OrgAgent): void {
    const threadId = agent.assigned_thread_id || "general";
    const template = [
      "[Round Start]",
      `facilitator=${agent.id}`,
      `thread=${threadId}`,
      "",
      "- Goal:",
      "- Constraints:",
      "- Done when:",
    ].join("\n");
    if (CHAT_CHANNELS.includes(threadId as ChannelId)) {
      setActiveChannel(threadId as ChannelId);
    } else {
      setActiveChannel("general");
    }
    setComposerRole("user");
    setComposerText(template);
    showToast("Round start template inserted");
  }

  function startWorkspaceDrag(agent: OrgAgent, index: number, ev: ReactPointerEvent<HTMLElement>): void {
    if (!workspaceEditLayout || workspaceAutoLayoutZones) return;
    ev.preventDefault();
    ev.stopPropagation();
    const initial = seatPositionForAgent(agent, index);
    workspaceRollbackRef.current = { ...workspaceLayoutDraft, [agent.id]: initial };
    const next = roomEventToNormalized(ev);
    setWorkspaceDraggingAgentId(agent.id);
    if (next) {
      setWorkspaceLayoutDraft((prev) => ({ ...prev, [agent.id]: next }));
    }
  }

  async function loadArtifact(runId: string, relPath: string): Promise<void> {
    setSelectedArtifactPath(relPath);
    setArtifactPreview(null);
    setZipEntries(null);
    const out = await apiGet<any>(`/api/runs/${runId}/artifacts/file?path=${encodeURIComponent(relPath)}`);
    setArtifactPreview(out);
  }

  async function loadZipEntries(runId: string, relPath: string): Promise<void> {
    const out = await apiGet<any>(`/api/runs/${runId}/artifacts/zip_entries?path=${encodeURIComponent(relPath)}`);
    setZipEntries(out);
  }

  async function runRecipe(recipeId: string): Promise<void> {
    const out = await apiPost<{ task_id: string }>("/api/recipes/run", { recipe_id: recipeId });
    setStatus(`queued:${out.task_id}`);
    setActiveChannel("runs");
    await refreshRuns();
  }

  function renderMessageText(msg: ChatMessage): ReactNode {
    const runRe = /\b(run_[A-Za-z0-9\-._:]+)\b/g;
    const designRe = /\b(design_[A-Za-z0-9_.-]+)\b/g;
    const text = msg.text || "";
    const parts: ReactNode[] = [];
    let cursor = 0;
    const matches: Array<{ start: number; end: number; kind: "run" | "design"; value: string }> = [];
    for (const m of text.matchAll(runRe)) {
      if (m.index !== undefined) matches.push({ start: m.index, end: m.index + m[0].length, kind: "run", value: m[0] });
    }
    for (const m of text.matchAll(designRe)) {
      if (m.index !== undefined) matches.push({ start: m.index, end: m.index + m[0].length, kind: "design", value: m[0] });
    }
    matches.sort((a, b) => a.start - b.start);
    matches.forEach((m, i) => {
      if (m.start > cursor) parts.push(<span key={`t-${i}`}>{text.slice(cursor, m.start)}</span>);
      if (m.kind === "run") {
        parts.push(<button key={`r-${i}`} className="inline-link" type="button" onClick={() => jumpToRun(m.value)}>{m.value}</button>);
      } else {
        parts.push(<button key={`d-${i}`} className="inline-link" type="button" onClick={() => jumpToDesign(m.value)}>{m.value}</button>);
      }
      cursor = m.end;
    });
    if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);
    return <span className="msg-text">{parts.length ? parts : text}</span>;
  }

  const officeWorkspaceKey = resolveOfficeWorkspaceKey();
  const officeLayoutStorageKey = getOfficeLayoutStorageKey(officeWorkspaceKey);
  const recentTargetsStorageKey = getRecentTargetsStorageKey(officeWorkspaceKey);
  const favoriteTargetsStorageKey = getFavoriteTargetsStorageKey(officeWorkspaceKey);

  const filteredRuns = runs.filter((r) => r.run_id.includes(runFilter));
  const pinnedMessages = messages.filter((m) => pins.includes(m.id));
  const selectedAgent = orgAgents.find((x) => x.id === selectedAgentId) || null;
  const selectedCharacterSheetAgent = orgAgents.find((x) => x.id === characterSheetAgentId) || null;
  const recordRecentTarget = (item: Pick<CommandPaletteRecentItem, "id" | "title" | "subtitle">): void => {
    setCommandPaletteRecent((prev) => [
      { id: item.id, title: item.title, subtitle: item.subtitle },
      ...prev.filter((row) => row.id !== item.id),
    ].slice(0, 8));
  };
  const toggleFavoriteTarget = (item: Pick<CommandPaletteRecentItem, "id" | "title" | "subtitle">): void => {
    setCommandPaletteFavorites((prev) => {
      const exists = prev.some((row) => row.id === item.id);
      if (exists) return prev.filter((row) => row.id !== item.id);
      return [
        { id: item.id, title: item.title, subtitle: item.subtitle },
        ...prev.filter((row) => row.id !== item.id),
      ].slice(0, 6);
    });
  };
  const moveFavoriteTarget = (itemId: string, direction: -1 | 1): void => {
    setCommandPaletteFavorites((prev) => {
      const index = prev.findIndex((row) => row.id === itemId);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  };
  const buildFavoriteViewTarget = (id: string, title: string, subtitle: string): CommandPaletteRecentItem | null => {
    const targetId = String(id || "").trim();
    if (!targetId) return null;
    return { id: targetId, title, subtitle };
  };
  const buildFavoriteAgentTarget = (agentId: string, displayName?: string, role?: string, status?: string): CommandPaletteRecentItem | null => {
    const targetId = String(agentId || "").trim();
    if (!targetId) return null;
    return {
      id: "agent_" + targetId,
      title: "Agent: " + (displayName || targetId),
      subtitle: (role || "Character Sheet") + " | " + (status || "idle"),
    };
  };
  const buildFavoriteThreadTarget = (threadKey: string): CommandPaletteRecentItem | null => {
    const targetId = String(threadKey || "").trim().toLowerCase();
    if (!isValidInboxThreadKey(targetId)) return null;
    return {
      id: "thread_" + targetId,
      title: "Thread: " + formatCompactTargetId("thr", targetId),
      subtitle: "Open current thread in the right pane",
    };
  };
  const buildFavoriteTrackerTarget = (targetId: string, runId?: string): CommandPaletteRecentItem | null => {
    const stableId = String(targetId || "").trim();
    const stableRunId = String(runId || "").trim();
    if (!stableId) return null;
    return {
      id: "tracker_" + stableId,
      title: "Tracker: " + formatCompactTargetId("trk", stableId),
      subtitle: stableRunId ? "Open tracked run " + formatCompactTargetId("run", stableRunId) : "Open current tracker thread",
    };
  };
  const buildFavoriteRunTarget = (runId: string): CommandPaletteRecentItem | null => {
    const targetId = String(runId || "").trim();
    if (!targetId) return null;
    return {
      id: "run_" + targetId,
      title: "Run: " + formatCompactTargetId("run", targetId),
      subtitle: "Open current operational run",
    };
  };
  const commandPaletteItems = useMemo(() => {
    const rows: CommandPaletteItem[] = [];
    const seen = new Set<string>();
    const pushRow = (row: CommandPaletteItem | null): void => {
      if (!row || seen.has(row.id)) return;
      seen.add(row.id);
      rows.push(row);
    };
    pushRow({
      id: "autopilot",
      title: "View: Autopilot",
      subtitle: "Open dashboard autopilot actions",
      run: () => openPrimaryAutopilot(),
    });
    pushRow({
      id: "dashboard",
      title: "View: Dashboard",
      subtitle: "Open daily loop dashboard",
      run: () => openPrimaryDashboard(),
    });
    pushRow({
      id: "workspace",
      title: "View: Workspace",
      subtitle: "Open workspace room",
      run: () => openPrimaryWorkspace(),
    });
    pushRow({
      id: "office",
      title: "View: Office",
      subtitle: "Open control room office view",
      run: () => openPrimaryOffice(),
    });
    pushRow({
      id: "control_room",
      title: "View: ControlRoom",
      subtitle: "Alias for the current office control room",
      run: () => openPrimaryOffice(),
    });
    pushRow({
      id: "debate",
      title: "View: Debate",
      subtitle: "Open discussion stage view",
      run: () => openPrimaryDebate(),
    });
    const reopenTarget = String(characterSheetAgentId || characterSheetLastAgentId || "").trim();
    if (reopenTarget) {
      const reopenAgent = orgAgents.find((agent) => String(agent.id || "").trim() === reopenTarget) || null;
      pushRow({
        id: `character_sheet_${reopenTarget}`,
        title: `Agent: ${reopenAgent?.display_name || reopenTarget}`,
        subtitle: "Reopen right-pane Character Sheet",
        run: () => openCharacterSheet(reopenTarget),
      });
    }
    orgAgents.slice(0, 6).forEach((agent) => {
      const agentId = String(agent.id || "").trim();
      if (!agentId) return;
      pushRow({
        id: `agent_${agentId}`,
        title: `Agent: ${agent.display_name || agentId}`,
        subtitle: `${agent.role || "Character Sheet"} | ${agent.status || "idle"}`,
        run: () => openCharacterSheet(agentId),
      });
    });
    const activeThreadKey = [
      String(activeExecutionTracker?.threadKey || "").trim().toLowerCase(),
      String(councilThreadKey || councilStatus?.run?.thread_key || "").trim().toLowerCase(),
    ].find((item) => isValidInboxThreadKey(item)) || "";
    if (activeThreadKey) {
      pushRow({
        id: `thread_${activeThreadKey}`,
        title: `Thread: ${formatCompactTargetId("thr", activeThreadKey)}`,
        subtitle: "Open current thread in the right pane",
        run: () => openTrackerThread(activeThreadKey),
      });
    }
    const activeTrackerThreadKey = isValidInboxThreadKey(String(activeExecutionTracker?.threadKey || "").trim().toLowerCase())
      ? String(activeExecutionTracker?.threadKey || "").trim().toLowerCase()
      : activeThreadKey;
    const activeTrackerRunId = String(activeExecutionTracker?.runId || taskifyTrackingItem?.run_id || "").trim();
    const activeTrackerRecentKey = String(activeTrackerRunId || activeExecutionTracker?.id || activeTrackerThreadKey || "").trim();
    if (activeTrackerRecentKey && (activeTrackerRunId || activeTrackerThreadKey)) {
      pushRow({
        id: `tracker_${activeTrackerRecentKey}`,
        title: `Tracker: ${formatCompactTargetId("trk", activeTrackerRecentKey)}`,
        subtitle: activeTrackerRunId ? `Open tracked run ${formatCompactTargetId("run", activeTrackerRunId)}` : "Open current tracker thread",
        run: () => {
          recordRecentTarget({
            id: `tracker_${activeTrackerRecentKey}`,
            title: `Tracker: ${formatCompactTargetId("trk", activeTrackerRecentKey)}`,
            subtitle: activeTrackerRunId ? `Open tracked run ${formatCompactTargetId("run", activeTrackerRunId)}` : "Open current tracker thread",
          });
          if (activeTrackerRunId) {
            jumpToRun(activeTrackerRunId);
            return;
          }
          openTrackerThread(activeTrackerThreadKey);
        },
      });
    }
    const activeRunId = String(activeExecutionTracker?.runId || councilStatus?.run?.run_id || taskifyTrackingItem?.run_id || "").trim();
    if (activeRunId) {
      pushRow({
        id: `run_${activeRunId}`,
        title: `Run: ${formatCompactTargetId("run", activeRunId)}`,
        subtitle: "Open current operational run",
        run: () => jumpToRun(activeRunId),
      });
    }
    return rows;
  }, [
    activeExecutionTracker?.id,
    activeExecutionTracker?.runId,
    activeExecutionTracker?.threadKey,
    characterSheetAgentId,
    characterSheetLastAgentId,
    councilStatus?.run?.run_id,
    councilStatus?.run?.thread_key,
    councilThreadKey,
    orgAgents,
    taskifyTrackingItem?.run_id,
  ]);
  const favoriteTargetIds = useMemo(() => new Set(commandPaletteFavorites.map((item) => item.id)), [commandPaletteFavorites]);
  const resolveStoredFavoriteItem = (item: CommandPaletteRecentItem, itemMap: Map<string, CommandPaletteItem>): CommandPaletteItem | null => {
    const direct = itemMap.get(item.id);
    if (direct) return direct;
    if (item.id === "autopilot") return { ...item, run: () => openPrimaryAutopilot() };
    if (item.id === "dashboard") return { ...item, run: () => openPrimaryDashboard() };
    if (item.id === "workspace") return { ...item, run: () => openPrimaryWorkspace() };
    if (item.id === "office" || item.id === "control_room") return { ...item, run: () => openPrimaryOffice() };
    if (item.id === "debate" || item.id.startsWith("debate_badge_")) return { ...item, run: () => openPrimaryDebate() };
    if (item.id.startsWith("character_sheet_") || item.id.startsWith("agent_")) {
      const agentId = String(item.id.replace(/^character_sheet_/, "").replace(/^agent_/, "") || "").trim();
      if (!agentId || !orgAgents.some((agent) => String(agent.id || "").trim() === agentId)) return null;
      return { ...item, run: () => openCharacterSheet(agentId) };
    }
    if (item.id.startsWith("thread_")) {
      const threadKey = String(item.id.slice("thread_".length) || "").trim().toLowerCase();
      if (!isValidInboxThreadKey(threadKey)) return null;
      return { ...item, run: () => openTrackerThread(threadKey) };
    }
    if (item.id.startsWith("tracker_")) {
      const trackerTarget = String(item.id.slice("tracker_".length) || "").trim();
      if (!trackerTarget) return null;
      return {
        ...item,
        run: () => {
          recordRecentTarget(item);
          if (isValidInboxThreadKey(trackerTarget)) {
            openTrackerThread(trackerTarget);
            return;
          }
          jumpToRun(trackerTarget);
        },
      };
    }
    if (item.id.startsWith("run_")) {
      const runId = String(item.id.slice("run_".length) || "").trim();
      if (!runId) return null;
      return { ...item, run: () => jumpToRun(runId) };
    }
    return null;
  };
  const workspaceFavoriteItems = useMemo(() => {
    const itemMap = new Map(commandPaletteItems.map((item) => [item.id, item]));
    return commandPaletteFavorites
      .map((item) => resolveStoredFavoriteItem(item, itemMap))
      .filter((item): item is CommandPaletteItem => !!item)
      .filter((item, idx, items) => items.findIndex((row) => row.id === item.id) === idx)
      .slice(0, 6);
  }, [commandPaletteFavorites, commandPaletteItems, orgAgents]);
  const commandPaletteFavoriteItems = useMemo(() => {
    const q = commandPaletteQuery.trim().toLowerCase();
    return workspaceFavoriteItems
      .filter((item) => !q || ((item.title + " " + item.subtitle).toLowerCase().includes(q)))
      .slice(0, 6);
  }, [commandPaletteQuery, workspaceFavoriteItems]);
  const isFavoriteTarget = (itemId: string): boolean => favoriteTargetIds.has(itemId);
  const renderFavoriteToggleButton = (item: CommandPaletteRecentItem | null, label: string): JSX.Element | null => {
    if (!item) return null;
    const isFavorite = isFavoriteTarget(item.id);
    return (
      <button
        type="button"
        className="inline-link"
        title={isFavorite ? "Unpin " + label.toLowerCase() : label}
        aria-pressed={isFavorite}
        onClick={(ev) => {
          ev.stopPropagation();
          toggleFavoriteTarget(item);
        }}
        onPointerDown={(ev) => ev.stopPropagation()}
      >
        {isFavorite ? "Unpin" : "Pin"}
      </button>
    );
  };
  const formatWorkspaceFavoriteLabel = (item: Pick<CommandPaletteItem, "title">): string => {
    const match = String(item.title || "").match(/^[^:]+:\s*(.+)$/);
    return match ? match[1] : String(item.title || "");
  };
  const renderWorkspaceFavoriteChip = (item: CommandPaletteItem, index: number, total: number): JSX.Element => (
    <span
      key={"workspace_favorite_" + item.id}
      className="so-kbd"
      title={"Slot " + (index + 1) + " | Alt+" + (index + 1) + " | " + item.title + " | " + item.subtitle}
    >
      <span className="so-muted" title={"Alt+" + (index + 1)}>{index + 1}</span>
      <button type="button" className="inline-link" onClick={() => item.run()}>
        {formatWorkspaceFavoriteLabel(item)}
      </button>
      <button
        type="button"
        className="inline-link"
        disabled={index <= 0}
        title={"Move left " + item.title}
        onClick={(ev) => {
          ev.stopPropagation();
          moveFavoriteTarget(item.id, -1);
        }}
        onPointerDown={(ev) => ev.stopPropagation()}
      >
        {"<"}
      </button>
      <button
        type="button"
        className="inline-link"
        disabled={index >= total - 1}
        title={"Move right " + item.title}
        onClick={(ev) => {
          ev.stopPropagation();
          moveFavoriteTarget(item.id, 1);
        }}
        onPointerDown={(ev) => ev.stopPropagation()}
      >
        {">"}
      </button>
      <button
        type="button"
        className="inline-link"
        title={"Unpin " + item.title}
        onClick={(ev) => {
          ev.stopPropagation();
          toggleFavoriteTarget(item);
        }}
        onPointerDown={(ev) => ev.stopPropagation()}
      >
        x
      </button>
    </span>
  );
  const workspaceRecentItems = useMemo(() => {
    const itemMap = new Map(commandPaletteItems.map((item) => [item.id, item]));
    return commandPaletteRecent
      .map((item) => itemMap.get(item.id))
      .filter((item): item is CommandPaletteItem => !!item)
      .filter((item, idx, items) => items.findIndex((row) => row.id === item.id) === idx)
      .slice(0, 8);
  }, [commandPaletteItems, commandPaletteRecent]);
  const visibleQuickAccessItems = quickAccessMode === "recent" ? workspaceRecentItems : workspaceFavoriteItems;
  const visibleQuickAccessFavorites = quickAccessFavoritesExpanded ? workspaceFavoriteItems : workspaceFavoriteItems.slice(0, 3);
  const hiddenQuickAccessFavoritesCount = Math.max(0, workspaceFavoriteItems.length - visibleQuickAccessFavorites.length);
  const visibleQuickAccessRecent = quickAccessRecentExpanded ? workspaceRecentItems : workspaceRecentItems.slice(0, 3);
  const hiddenQuickAccessRecentCount = Math.max(0, workspaceRecentItems.length - visibleQuickAccessRecent.length);
  const quickAccessEmptyText = quickAccessMode === "recent" ? "No recent targets in this workspace" : "No favorites pinned in this workspace";
  const renderQuickAccessOverflowButton = (expanded: boolean, hiddenCount: number, onToggle: () => void): JSX.Element => (
    <div className="composer-actions">
      <button type="button" className="inline-link" onClick={onToggle}>
        {expanded ? "Collapse" : ("+" + hiddenCount + " more")}
      </button>
    </div>
  );
  const renderWorkspaceRecentChip = (item: CommandPaletteItem, index: number): JSX.Element => (
    <span
      key={"workspace_recent_" + item.id}
      className="so-kbd"
      title={"Recent " + (index + 1) + " | " + item.title + " | " + item.subtitle}
    >
      <span className="so-muted">{index + 1}</span>
      <button type="button" className="inline-link" onClick={() => item.run()}>
        {formatWorkspaceFavoriteLabel(item)}
      </button>
    </span>
  );
  const commandPaletteRecentItems = useMemo(() => {
    const q = commandPaletteQuery.trim().toLowerCase();
    const itemMap = new Map(commandPaletteItems.map((item) => [item.id, item]));
    return commandPaletteRecent
      .map((item) => itemMap.get(item.id))
      .filter((item): item is CommandPaletteItem => !!item)
      .filter((item, idx, items) => items.findIndex((row) => row.id === item.id) === idx)
      .filter((item) => !favoriteTargetIds.has(item.id))
      .filter((item) => !q || `${item.title} ${item.subtitle}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [commandPaletteItems, commandPaletteQuery, commandPaletteRecent, favoriteTargetIds]);
  const commandPaletteFiltered = useMemo(() => {
    const q = commandPaletteQuery.trim().toLowerCase();
    const hiddenIds = new Set([...commandPaletteFavoriteItems.map((item) => item.id), ...commandPaletteRecentItems.map((item) => item.id)]);
    const visibleItems = commandPaletteItems.filter((item) => !hiddenIds.has(item.id));
    if (!q) return visibleItems;
    return visibleItems.filter((item) => `${item.title} ${item.subtitle}`.toLowerCase().includes(q));
  }, [commandPaletteFavoriteItems, commandPaletteItems, commandPaletteQuery, commandPaletteRecentItems]);
  const renderCommandPaletteItem = (item: CommandPaletteItem, keyPrefix = "", slotLabel = ""): JSX.Element => {
    const isFavorite = favoriteTargetIds.has(item.id);
    return (
      <div
        key={`${keyPrefix}${item.id}`}
        role="button"
        tabIndex={0}
        className="list-item so-card"
        onClick={() => {
          setCommandPaletteOpen(false);
          item.run();
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            setCommandPaletteOpen(false);
            item.run();
          }
        }}
      >
        <div>{slotLabel ? (slotLabel + " " + item.title) : item.title}</div>
        <small>{item.subtitle}</small>
        <div className="composer-actions" onClick={(ev) => ev.stopPropagation()} onPointerDown={(ev) => ev.stopPropagation()}>
          <button
            type="button"
            className="inline-link"
            title={isFavorite ? "Remove favorite" : "Pin as favorite"}
            onClick={() => toggleFavoriteTarget(item)}
          >
            {isFavorite ? "Unpin" : "Pin"}
          </button>
        </div>
      </div>
    );
  };
  const characterSheetMemoryItems = [
    ...characterSheetMemoryEpisodes,
    ...(characterSheetIncludeDerivedMemory ? characterSheetMemoryKnowledge : []),
    ...(characterSheetIncludeDerivedMemory ? characterSheetMemoryProcedures : []),
  ]
    .sort((a, b) => (String(a.ts || "") < String(b.ts || "") ? 1 : -1))
    .slice(0, 3);
  const activityEventTypeOptions = Array.from(new Set(activityItems.map((x) => String(x.event_type || "").trim()).filter((x) => !!x))).sort();
  const filteredActivity = activityItems.filter((x) => {
    if (activityEventTypeFilter !== "all" && String(x.event_type || "") !== activityEventTypeFilter) return false;
    const q = activitySearch.trim().toLowerCase();
    if (!q) return true;
    return `${x.title || ""} ${x.summary || ""} ${x.actor_id || ""} ${x.event_type || ""}`.toLowerCase().includes(q);
  });
  const workspaceOrder = ["facilitator", "designer", "implementer", "verifier", "joker"];
  const defaultOrderedAgents = [...orgAgents].sort((a, b) => {
    const ai = workspaceOrder.indexOf(a.id);
    const bi = workspaceOrder.indexOf(b.id);
    const ax = ai < 0 ? 999 : ai;
    const bx = bi < 0 ? 999 : bi;
    const zoneCmp = stateZoneOrder(a.status) - stateZoneOrder(b.status);
    if (zoneCmp !== 0) return zoneCmp;
    return ax - bx;
  });
  const orderedAgents = mergeStoredOrder(officeLayoutOrder, defaultOrderedAgents.map((agent) => agent.id))
    .map((id) => defaultOrderedAgents.find((agent) => agent.id === id))
    .filter((agent): agent is OrgAgent => !!agent);
  const orderedGuests = [...orgGuests].sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
  const officeConnectionMode = dashboardSseConnected ? "LIVE" : (dashboardHeartbeatStatus === "err" ? "DISCONNECTED" : "POLL");
  const officeRunStatus = String(councilStatus?.run?.status || "-");
  const officeRunId = String(councilStatus?.run?.run_id || councilRunId || "").trim();
  const officeQueueLabel = String(taskifyTrackingItem?.status || "-");
  const officeAutopilotLabel = String(dailyLoopDashboard?.morning_brief?.last_autopilot_run_id || "-");
  const officeRoutinesLabel = [
    `heartbeat:${String(dailyLoopDashboard?.heartbeat?.last_ok_at || "-")}`,
    `suggest:${String(dailyLoopDashboard?.suggest?.last_auto_accept_at || "-")}`,
    `consolidation:${String(dailyLoopDashboard?.consolidation?.facilitator?.last_run_at || "-")}`,
  ].join(" | ");
  const controlRoomRecentIssue = buildRecentIssueSummary({
    trackerStatus: activeExecutionTracker?.status,
    trackerError: activeExecutionTracker?.lastError,
    trackerId: activeExecutionTracker?.id,
    trackerRunId: activeExecutionTracker?.runId,
    runStatus: councilStatus?.run?.status,
    runId: officeRunId,
    runError: councilStatus?.run?.last_error,
    runCanResume: councilStatus?.run?.can_resume,
    queueStatus: taskifyTrackingItem?.status,
    queueRunId: taskifyTrackingItem?.run_id,
    queueNote: taskifyTrackingItem?.note,
    heartbeatFailureCount: dailyLoopDashboard?.heartbeat?.failure_count,
    suggestFailureCount: dailyLoopDashboard?.suggest?.failure_count,
    consolidationResult: dailyLoopDashboard?.consolidation?.facilitator?.last_result,
  });
  const controlRoomThreadKey = String(councilThreadKey || councilStatus?.run?.thread_key || activeExecutionTracker?.threadKey || "").trim().toLowerCase();
  const controlRoomTrackerThreadKey = String(activeExecutionTracker?.threadKey || councilThreadKey || councilStatus?.run?.thread_key || "").trim().toLowerCase();
  const controlRoomIssueRunId = String(controlRoomRecentIssue.badge?.label.startsWith("run:") ? (officeRunId || taskifyTrackingItem?.run_id || activeExecutionTracker?.runId || "") : "").trim();
  const controlRoomIssueThreadKey = String(controlRoomRecentIssue.badge?.label.startsWith("trk:") || controlRoomRecentIssue.badge?.label.startsWith("thr:") ? controlRoomTrackerThreadKey : "").trim().toLowerCase();
  const latestDebateRound = inboxItems.find((x) => String(x.source || "").trim() === "council_autopilot_round")
    || inboxItems.find((x) => String(x.title || "").toLowerCase().includes("round"));
  const debateBody = String(latestDebateRound?.body || "").trim();
  const debateLines = debateBody ? debateBody.split(/\r?\n/).map((x) => x.trim()).filter((x) => !!x) : [];
  const debateBubble = (prefix: string, fallback: string): string => {
    const line = debateLines.find((x) => x.startsWith(prefix));
    if (line) return line;
    return fallback;
  };
  const debateRoleSpecs = [
    { role: "司会", agentId: "facilitator", prefix: "司会:" },
    { role: "批判役", agentId: "designer", prefix: "批判役:" },
    { role: "実務", agentId: "implementer", prefix: "実務:" },
    { role: "道化師", agentId: "joker", prefix: "道化師:" },
  ];
  const debateBubbles = debateRoleSpecs.map((spec) => {
    const agent = orgAgents.find((item) => item.id === spec.agentId) || null;
    const threadKeyCandidates = [
      String(agent?.thread_key || "").trim().toLowerCase(),
      String(latestDebateRound?.thread_key || "").trim().toLowerCase(),
      String(councilThreadKey || councilStatus?.run?.thread_key || "").trim().toLowerCase(),
      String(activeExecutionTracker?.threadKey || "").trim().toLowerCase(),
    ];
    const runIdCandidates = [
      String(latestDebateRound?.links?.autopilot_run_id || "").trim(),
      String(latestDebateRound?.links?.run_id || "").trim(),
      String(officeRunId || "").trim(),
      String(activeExecutionTracker?.runId || "").trim(),
    ];
    const threadKey = threadKeyCandidates.find((item) => isValidInboxThreadKey(item)) || "";
    const runId = runIdCandidates.find((item) => !!item) || "";
    const memoryAgentId = agent?.id || "";
    return {
      role: spec.role,
      agentId: spec.agentId,
      text: debateBubble(spec.prefix, `${spec.prefix} data not available`),
      threadKey,
      runId,
      memoryAgentId,
      threadLabel: formatCompactTargetId("thr", threadKey),
      runLabel: formatCompactTargetId("run", runId),
      memoryLabel: formatCompactTargetId("mem", memoryAgentId),
      status: normalizeChainStatus(String(agent?.status || (officeRunStatus === "running" ? "running" : "idle"))),
    };
  });
  const activeDebateChain = latestDebateRound ? debateBubbles : [];
  const debateChainBadges = [
    buildContextBadge("thr", String(councilThreadKey || latestDebateRound?.thread_key || activeExecutionTracker?.threadKey || "").trim().toLowerCase()),
    buildContextBadge("run", String(officeRunId || latestDebateRound?.links?.autopilot_run_id || latestDebateRound?.links?.run_id || activeExecutionTracker?.runId || "").trim()),
    buildContextBadge("trk", String(activeExecutionTracker?.id || activeExecutionTracker?.threadKey || "").trim()),
    buildContextBadge("mem", String(characterSheetAgentId || "").trim()),
  ].filter((row): row is { label: string; full: string } => !!row);
  const workspaceEmptySeatCount = Math.max(0, 6 - (orderedAgents.length + orderedGuests.length));
  const workspaceEmptySeats = Array.from({ length: workspaceEmptySeatCount }, (_, i) => i);
  const workspaceZoneCounts = orderedAgents.reduce<Record<string, number>>((acc, a) => {
    const key = stateZoneLabel(a.status);
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});
  const latestActivityByActor: Record<string, ActivityEvent> = {};
  for (const item of activityItems) {
    const actor = String(item.actor_id || "").trim();
    if (!actor || latestActivityByActor[actor]) continue;
    latestActivityByActor[actor] = item;
  }
  const inboxThreadOptions = Array.from(new Set(inboxItems.map((it) => String(it.thread_id || "").trim()).filter((x) => !!x))).sort();
  const inboxThreadKeyOptions = Array.from(new Set(inboxItems.map((it) => String(it.thread_key || "").trim()).filter((x) => !!x))).sort();
  const inboxSourceOptions = Array.from(new Set(inboxItems.map((it) => String(it.source || "").trim()).filter((x) => !!x))).sort();
  const filteredInbox = inboxItems.filter((it) => {
    if (inboxMentionsOnly && !it.mention) return false;
    if (inboxThreadFilter !== "all" && String(it.thread_id || "") !== inboxThreadFilter) return false;
    if (inboxThreadKeyFilter !== "all" && String(it.thread_key || "") !== inboxThreadKeyFilter) return false;
    if (inboxSourceFilter !== "all" && String(it.source || "") !== inboxSourceFilter) return false;
    if (inboxHasLinksOnly && !inboxHasLinks(it)) return false;
    const q = inboxFilter.trim().toLowerCase();
    if (!q) return true;
    return `${it.title || ""} ${it.body || ""} ${it.thread_id || ""} ${it.thread_key || ""} ${it.role || ""} ${it.source || ""}`.toLowerCase().includes(q);
  });
  const mentionOnlyInbox = inboxItems.filter((it) => !!it.mention);
  const dashboardHeartbeatStatus = dailyLoopDashboard
    ? (dailyLoopDashboard.heartbeat.enabled_effective
      ? statusClassFromBool(!!dailyLoopDashboard.heartbeat.enabled)
      : "err")
    : "warn";
  const dashboardSuggestStatus = dailyLoopDashboard
    ? (dailyLoopDashboard.suggest.auto_accept_enabled_effective
      ? statusClassFromBool(!!dailyLoopDashboard.suggest.auto_accept_enabled)
      : "err")
    : "warn";
  const dashboardConsolidationStatus = dailyLoopDashboard
    ? (dailyLoopDashboard.consolidation.enabled_effective
      ? statusClassFromResult(String(dailyLoopDashboard.consolidation.facilitator?.last_result || "ok"))
      : "err")
    : "warn";
  const dashboardMorningBriefStatus = dailyLoopDashboard
    ? (dailyLoopDashboard.morning_brief.enabled_effective
      ? statusClassFromResult(String(dailyLoopDashboard.morning_brief.last_result || "ok"))
      : "err")
    : "warn";
  const dashboardInboxStatus: DailyLoopDashboardCardStatus = dailyLoopDashboard
    ? (Number(dailyLoopDashboard.inbox.mention_count || 0) > 0 ? "warn" : "ok")
    : "warn";
  const dashboardThreadArchiveStatus: DailyLoopDashboardCardStatus = dashboardThreadArchiveScheduler
    ? (!dashboardThreadArchiveScheduler.settings.enabled
      ? "warn"
      : (dashboardThreadArchiveScheduler.state.enabled_effective
        ? ((dashboardThreadArchiveScheduler.state.last_result_ok === false || dashboardThreadArchiveScheduler.state.last_timed_out) ? "err" : "ok")
        : "err"))
    : "warn";

  return (
    <div className="app-root">
      <aside className="pane pane-left">
        <div className="brand">region_ai hub</div>
        <div className="section-title">Primary</div>
        <nav className="primary-nav">
          {PRIMARY_NAVS.map((item) => {
            const isAutopilotActive = activeChannel === "dashboard" && dashboardQuickActionFocusId === "morning_brief_autopilot_start";
            const isActive = item.id === "autopilot"
              ? isAutopilotActive
              : item.id === "dashboard"
                ? (activeChannel === "dashboard" && !isAutopilotActive)
                : activeChannel === "workspace";
            const onClick = item.id === "autopilot"
              ? openPrimaryAutopilot
              : item.id === "dashboard"
                ? openPrimaryDashboard
                : openPrimaryWorkspace;
            return (
              <button key={item.id} className={`primary-btn ${isActive ? "active" : ""}`} onClick={onClick} type="button" title={item.description}>
                <span className="primary-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="section-title">Office + Debate</div>
        <nav className="primary-nav">
          <button className={`primary-btn ${activeChannel === "office" ? "active" : ""}`} onClick={() => openPrimaryOffice()} type="button" title="Open control room office view">
            <span className="primary-icon">O</span>
            <span>Office</span>
          </button>
          <button className={`primary-btn ${activeChannel === "debate" ? "active" : ""}`} onClick={() => openPrimaryDebate()} type="button" title="Open discussion stage view">
            <span className="primary-icon">B</span>
            <span>Debate</span>
          </button>
        </nav>
        <div className="section-title">Channels</div>
        <nav className="channel-list">
          {CHANNELS.map((c) => (
            <button key={c.id} className={`channel-btn ${activeChannel === c.id ? "active" : ""}`} onClick={() => setActiveChannel(c.id)} type="button">
              <span className="hash">#</span>{c.label}
              {unreadCount[c.id] ? <span className="badge">{unreadCount[c.id]}</span> : null}
              {mentionFlag[c.id] ? <span className="mention-dot" /> : null}
            </button>
          ))}
        </nav>
        <div className="status">{status}</div>
      </aside>

      <main className="pane pane-main">
        <div className="top-bar so-panel">
          <div className="channel-title">#{activeChannel}</div>
          <div className="search-wrap">
            <input ref={searchInputRef} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }} placeholder="Search (Enter) / Palette Ctrl+K" />
            <button type="button" onClick={() => { setCommandPaletteOpen(true); setCommandPaletteQuery(""); }} title="Open command palette">⌘K</button>
            <button type="button" onClick={() => void runSearch()}>Search</button>
          </div>
          <div className="bus">
            <button type="button" onClick={() => copyBus("chatgpt")}>Copy for ChatGPT</button>
            <button type="button" onClick={() => copyBus("codex")}>Copy for CODEX</button>
            <button type="button" onClick={() => pasteFromClipboard()}>Paste</button>
            <select value={uiTheme} onChange={(e) => setUiTheme((e.target.value === "simple" ? "simple" : "staroffice"))}>
              <option value="staroffice">Theme: StarOffice</option>
              <option value="simple">Theme: Simple</option>
            </select>
            <select value={uiEffects} onChange={(e) => setUiEffects((e.target.value === "off" || e.target.value === "fun") ? e.target.value : "minimal")}>
              <option value="off">Effects: OFF</option>
              <option value="minimal">Effects: Minimal</option>
              <option value="fun">Effects: Fun</option>
            </select>
            <select value={composerRole} onChange={(e) => setComposerRole(e.target.value)}>
              {Object.keys(ROLE_COLORS).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {toast ? <div className="status">{toast}</div> : null}
        </div>

        {CHAT_CHANNELS.includes(activeChannel) && (
          <>
            <div className="thread-hint">thread: {chatThreadId}</div>
            <div className="timeline so-panel">
              {messages.map((m) => (
                <div key={m.id} className="msg-row so-card" onClick={() => setSelectedMessage(m)}>
                  <div className="avatar" style={{ backgroundColor: roleColor(m.role) }}>{roleInitial(m.role)}</div>
                  <div className="msg-content">
                    <div className="msg-meta">
                      <strong>{m.role}</strong>
                      <span>{formatTs(m.created_at)}</span>
                      {sourceBadge(m) ? <span className="source-badge">{sourceBadge(m)}</span> : null}
                    </div>
                    <div className="msg-line">{renderMessageText(m)}</div>
                    {m.links?.run_id ? <button type="button" className="inline-link" onClick={() => jumpToRun(String(m.links?.run_id || ""))}>open run</button> : null}
                    {m.links?.design_id ? <button type="button" className="inline-link" onClick={() => jumpToDesign(String(m.links?.design_id || ""))}>open design</button> : null}
                    {(m.links?.artifact_paths || []).map((p) => (
                      <button key={p} type="button" className="inline-link" onClick={() => { if (selectedRunId) void loadArtifact(selectedRunId, p); }}>{p}</button>
                    ))}
                    <div className="msg-actions">
                      <button type="button" onClick={() => quoteMessage(m)}>Quote</button>
                      <button type="button" onClick={() => void togglePin(m.id)}>{pins.includes(m.id) ? "Unpin" : "Pin"}</button>
                      <button type="button" onClick={() => navigator.clipboard.writeText(m.text)}>Copy</button>
                      <button type="button" onClick={() => void taskifyFromMessage(m, false)}>Taskify (draft)</button>
                      <button type="button" onClick={() => void taskifyFromMessage(m, true)}>Taskify (copy YAML)</button>
                    </div>
                  </div>
                </div>
              ))}
              {!messages.length ? <div className="empty">No messages</div> : null}
            </div>
            <form className="composer so-panel" onSubmit={(e) => { void sendMessage(e); }}>
              <textarea value={composerText} onChange={(e) => setComposerText(e.target.value)} placeholder="message" rows={5} />
              <div className="composer-actions">
                <select value={clipboardRole} onChange={(e) => setClipboardRole(e.target.value)}>
                  <option value="chatgpt">chatgpt format</option>
                  <option value="codex">codex format</option>
                  <option value="raw">raw format</option>
                </select>
                <button type="button" onClick={() => copyBus(clipboardRole)}>Copy</button>
                <button type="submit">Send</button>
              </div>
            </form>
          </>
        )}

        {activeChannel === "runs" && (
          <div className="grid2">
            <section>
              <div className="row-head"><strong>Runs</strong><input placeholder="filter run_id" value={runFilter} onChange={(e) => setRunFilter(e.target.value)} /></div>
              <div className="list">
                {filteredRuns.map((r) => (
                  <button key={r.run_id} className={`list-item ${selectedRunId === r.run_id ? "active" : ""}`} onClick={() => setSelectedRunId(r.run_id)} type="button">
                    <div>{r.run_id}</div><small>{formatTs(r.updated_at)}</small>
                  </button>
                ))}
              </div>
            </section>
            <section>
              <div className="row-head"><strong>Run detail</strong></div>
              {selectedRunDetail ? (
                <>
                  <pre className="jsonOutput">{JSON.stringify(selectedRunDetail.result, null, 2)}</pre>
                  <div className="row-head"><strong>Artifacts</strong></div>
                  <div className="list">
                    {currentArtifacts.map((p) => (
                      <div key={p} className="artifact-row">
                        <button type="button" onClick={() => void loadArtifact(selectedRunId, p)}>{p}</button>
                        {p.endsWith(".zip") ? <button type="button" onClick={() => void loadZipEntries(selectedRunId, p)}>entries</button> : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : <div className="empty">Select run</div>}
            </section>
          </div>
        )}

        {activeChannel === "recipes" && (
          <div className="cards">
            {recipes.map((r) => (
              <article key={r.id} className="recipe-card">
                <h3>{r.title || r.id}</h3>
                <p><code>{r.file}</code></p>
                <p>{(r.uses || []).join(", ")}</p>
                <button type="button" onClick={() => void runRecipe(r.id)}>Run Recipe</button>
              </article>
            ))}
          </div>
        )}

        {activeChannel === "designs" && (
          <div className="grid2">
            <section>
              <div className="row-head"><strong>Latest: {designLatest || "-"}</strong></div>
              <div className="list">
                {designList.map((d) => <button key={d} className={`list-item ${selectedDesign === d ? "active" : ""}`} type="button" onClick={() => setSelectedDesign(d)}>{d}</button>)}
              </div>
            </section>
            <section><div className="row-head"><strong>Design preview</strong></div><pre className="md-box">{designText}</pre></section>
          </div>
        )}

        {activeChannel === "dashboard" && (
          <div className="dashboard-root">
            <div className="row-head">
              <strong className="dashboardTitle">🛰 Daily Loop Dashboard <small>Agent HQ</small></strong>
              <div className="composer-actions">
                <button type="button" onClick={() => void refreshDailyLoopDashboard()}>Refresh</button>
                <button type="button" onClick={() => { void refreshOpsQuickActionsStatus(); void refreshOpsAutoStabilize(); }}>Refresh ops</button>
              </div>
            </div>
            <div className="dashboardMeta wrapAnywhere">
              <span className={dashboardSseConnected ? "liveBadge" : "pollBadge"}>{dashboardSseConnected ? "LIVE" : "POLL"}</span>
              <span>last updated: {dashboardLastRefreshAt ? new Date(dashboardLastRefreshAt).toLocaleTimeString() : "-"}</span>
              <span>last_event_id: {dashboardLastEventId ? String(dashboardLastEventId).slice(0, 48) : "-"}</span>
            </div>
            <div className="empty">
              health:
              {" "}
              <span className={`dashboard-badge ${`status-${dailyLoopDashboard?.health?.status || "warn"}`}`}>
                {String(dailyLoopDashboard?.health?.status || "warn").toUpperCase()}
              </span>
              {" "}
              {dailyLoopDashboard?.health?.reasons?.join(", ") || "-"}
            </div>
            <div className="dashboard-grid">
              <article className="dashboard-card">
                <div className="row-head">
                  <strong>Next Actions</strong>
                  <span className="dashboard-badge status-warn">PRIORITY</span>
                </div>
                <div className="list">
                  {(dashboardNextActions?.items || []).map((it, idx) => {
                    const kind = String(it.kind || "").trim();
                    const severity = String(it.severity || "").trim().toLowerCase();
                    const severityClass = severity === "high" ? "status-err" : (severity === "medium" ? "status-warn" : "status-ok");
                    const threadKey = String(it.thread_key || "").trim().toLowerCase();
                    const quickActionId = String(it.quick_action_id || "").trim();
                    return (
                      <div key={`${kind}_${idx}`} className="dashboardQuickActionItem">
                        <div className="row-head">
                          <strong>{String(it.title || kind || "next_action")}</strong>
                          <span className={`dashboard-badge ${severityClass}`}>{(severity || "info").toUpperCase()}</span>
                        </div>
                        {kind === "revert_suggestion" ? (
                          <>
                            <div className="empty wrapAnywhere">thread_key: {threadKey || "-"}</div>
                            <div className="empty wrapAnywhere">created_at: {String(it.created_at || "-")}</div>
                            <div className="empty wrapAnywhere">active: {String(it.active_preset_set_id || "-")} / target: {String(it.target_preset_set_id || "standard")}</div>
                            <div className="composer-actions">
                              <button type="button" disabled={!threadKey} onClick={() => openDashboardNextActionThread(threadKey)}>Open thread</button>
                              <button type="button" onClick={() => openDashboardNextActionQuickAction(quickActionId || "revert_active_profile_standard")}>Open Quick Actions</button>
                              <button type="button" className="dangerAction" onClick={() => openDashboardNextActionRevertConfirm()}>Revert (confirm)</button>
                            </div>
                          </>
                        ) : null}
                        {kind === "profile_misalignment" ? (
                          <>
                            <div className="empty wrapAnywhere">active: {String(it.active_preset_set_id || "-")} / recommended: {String(it.recommended_preset_set_id || "-")}</div>
                            <div className="composer-actions">
                              <button type="button" onClick={() => scrollDashboardCard(dashboardActiveProfileCardRef)}>Open Active Profile</button>
                              <button type="button" onClick={() => void runDashboardRecommendedProfileApply()}>Apply recommended (confirm)</button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                  {(dashboardNextActions?.items || []).length < 1 ? <div className="empty">No next actions</div> : null}
                </div>
              </article>
              <article className="dashboard-card">
                <div className="row-head">
                  <strong>Yesterday memo</strong>
                  <span className="dashboard-badge status-ok">DIGEST</span>
                </div>
                <div className="list">
                  <label>
                    agent
                    <select
                      value={dashboardYesterdayMemoAgentId}
                      onChange={(e) => {
                        const id = String(e.target.value || "").trim();
                        setDashboardYesterdayMemoAgentId(id);
                        void refreshDashboardYesterdayMemo(id);
                      }}
                    >
                      {orgAgents.map((a) => <option key={`memo_${a.id}`} value={a.id}>{a.display_name} ({a.id})</option>)}
                    </select>
                  </label>
                  <div className="composer-actions">
                    <button type="button" onClick={() => void refreshDashboardYesterdayMemo()}>Refresh memo</button>
                    <button type="button" onClick={() => openAgentMemory(dashboardYesterdayMemoAgentId || "facilitator", "episodes")}>Open Memory</button>
                  </div>
                  {dashboardYesterdayMemo?.item ? (
                    <div className="memory-item">
                      <div><strong>{dashboardYesterdayMemo.item.title}</strong></div>
                      <small>{formatTs(dashboardYesterdayMemo.item.ts)}</small>
                      <div className="memory-snippet wrapAnywhere">{dashboardYesterdayMemo.item.body}</div>
                    </div>
                  ) : (
                    <div className="empty">No memo</div>
                  )}
                </div>
              </article>
              <article className="dashboard-card">
                <div className="row-head">
                  <strong>Heartbeat</strong>
                  <span className={`dashboard-badge ${`status-${dashboardHeartbeatStatus}`}`}>{dashboardHeartbeatStatus.toUpperCase()}</span>
                </div>
                <div className="empty">enabled={dailyLoopDashboard?.heartbeat?.enabled ? "true" : "false"} / effective={dailyLoopDashboard?.heartbeat?.enabled_effective ? "true" : "false"}</div>
                <div className="empty wrapAnywhere">next_run_at: {dailyLoopDashboard?.heartbeat?.next_run_at || "-"}</div>
                <div className="empty wrapAnywhere">last_ok_at: {dailyLoopDashboard?.heartbeat?.last_ok_at || "-"}</div>
                <div className="empty">failure_count: {Number(dailyLoopDashboard?.heartbeat?.failure_count || 0)}</div>
                <div className="composer-actions">
                  <button type="button" onClick={() => void runDashboardHeartbeatNow()}>Run now</button>
                </div>
              </article>
              <article className="dashboard-card">
                <div className="row-head">
                  <strong>Suggest Auto-accept</strong>
                  <span className={`dashboard-badge ${`status-${dashboardSuggestStatus}`}`}>{dashboardSuggestStatus.toUpperCase()}</span>
                </div>
                <div className="empty">enabled={dailyLoopDashboard?.suggest?.auto_accept_enabled ? "true" : "false"} / effective={dailyLoopDashboard?.suggest?.auto_accept_enabled_effective ? "true" : "false"}</div>
                <div className="empty">count_today: {Number(dailyLoopDashboard?.suggest?.auto_accept_count_today || 0)}</div>
                <div className="empty">failure_count: {Number(dailyLoopDashboard?.suggest?.failure_count || 0)}</div>
                <div className="empty wrapAnywhere">last_auto_accept_at: {dailyLoopDashboard?.suggest?.last_auto_accept_at || "-"}</div>
                <div className="composer-actions">
                  <button type="button" onClick={() => setActiveChannel("settings")}>Open settings</button>
                </div>
              </article>
              <article className="dashboard-card">
                <div className="row-head">
                  <strong>Night Consolidation</strong>
                  <span className={`dashboard-badge ${`status-${dashboardConsolidationStatus}`}`}>{dashboardConsolidationStatus.toUpperCase()}</span>
                </div>
                <div className="empty">enabled={dailyLoopDashboard?.consolidation?.enabled ? "true" : "false"} / effective={dailyLoopDashboard?.consolidation?.enabled_effective ? "true" : "false"}</div>
                <div className="empty wrapAnywhere">next_run_at: {dailyLoopDashboard?.consolidation?.next_run_at || "-"}</div>
                <div className="empty">facilitator.last_result: {dailyLoopDashboard?.consolidation?.facilitator?.last_result || "-"}</div>
                <div className="empty wrapAnywhere">facilitator.last_run_at: {dailyLoopDashboard?.consolidation?.facilitator?.last_run_at || "-"}</div>
                <div className="composer-actions">
                  <button type="button" onClick={() => void runDashboardConsolidationNow()}>Run now</button>
                  {dailyLoopDashboard?.consolidation?.facilitator?.last_outputs?.knowledge_id ? (
                    <button type="button" onClick={() => openAgentMemory("facilitator", "knowledge")}>Open Memory</button>
                  ) : null}
                </div>
              </article>
              <article className="dashboard-card">
                <div className="row-head">
                  <strong>Morning Brief</strong>
                  <span className={`dashboard-badge ${`status-${dashboardMorningBriefStatus}`}`}>{dashboardMorningBriefStatus.toUpperCase()}</span>
                </div>
                <div className="empty">enabled={dailyLoopDashboard?.morning_brief?.enabled ? "true" : "false"} / effective={dailyLoopDashboard?.morning_brief?.enabled_effective ? "true" : "false"}</div>
                <div className="empty wrapAnywhere">next_run_at: {dailyLoopDashboard?.morning_brief?.next_run_at || "-"}</div>
                <div className="empty">last_result: {dailyLoopDashboard?.morning_brief?.last_result || "-"}</div>
                <div className="empty wrapAnywhere">last_written_path: {dailyLoopDashboard?.morning_brief?.last_written_path || "-"}</div>
                <div className="composer-actions">
                  <button type="button" onClick={() => void runDashboardMorningBriefNow()}>Run now</button>
                  {dailyLoopDashboard?.morning_brief?.last_autopilot_run_id ? (
                    <button type="button" onClick={() => jumpToRun(String(dailyLoopDashboard?.morning_brief?.last_autopilot_run_id || ""))}>Open run</button>
                  ) : null}
                </div>
              </article>
              <article className="dashboard-card" ref={dashboardActiveProfileCardRef}>
                <div className="row-head">
                  <strong>Active Profile</strong>
                  <span className="dashboard-badge status-ok">{String(activeProfileState?.display_name || "standard")}</span>
                </div>
                <div className="empty wrapAnywhere">preset_set_id: {String(activeProfileState?.preset_set_id || "standard")}</div>
                <div className="empty wrapAnywhere">applied_at: {String(activeProfileState?.applied_at || "-")}</div>
                <div className="empty wrapAnywhere">applied_by: {String(activeProfileState?.applied_by || "-")} / reason: {String(activeProfileState?.reason || "-")}</div>
                <div className="empty wrapAnywhere">
                  {(() => {
                    const activeId = String(activeProfileState?.preset_set_id || "").trim();
                    const recId = String(dailyLoopDashboard?.recommended_profile?.preset_set_id || "").trim();
                    if (!activeId || !recId) return "status: -";
                    return activeId === recId
                      ? `status: ACTIVE=RECOMMENDED (${activeId})`
                      : `status: ACTIVE≠RECOMMENDED (active=${activeId}, recommended=${recId})`;
                  })()}
                </div>
                <div className="composer-actions">
                  <button type="button" onClick={() => void refreshDailyLoopDashboard()}>Refresh</button>
                  <button type="button" onClick={() => void copyActiveProfileValue(String(activeProfileState?.preset_set_id || ""), "preset_set_id")}>Copy preset_set_id</button>
                  <button type="button" onClick={() => void copyActiveProfileValue(String(activeProfileState?.reason || ""), "reason")}>Copy reason</button>
                  <button type="button" className="dangerAction" onClick={() => openActiveProfileRevertModal()}>Revert to standard (confirm)</button>
                </div>
              </article>
              <article className="dashboard-card">
                <div className="row-head">
                  <strong>Recommended Profile</strong>
                  <span className="dashboard-badge status-ok">{String(dailyLoopDashboard?.recommended_profile?.display_name || "standard")}</span>
                </div>
                <div className="empty wrapAnywhere">preset_set_id: {String(dailyLoopDashboard?.recommended_profile?.preset_set_id || "standard")}</div>
                <div className="empty wrapAnywhere">rationale: {String(dailyLoopDashboard?.recommended_profile?.rationale || "-").slice(0, 180)}</div>
                <div className="empty wrapAnywhere">computed_at: {String(dailyLoopDashboard?.recommended_profile?.computed_at || "-")}</div>
                <div className="empty wrapAnywhere">
                  {(() => {
                    const recId = String(dailyLoopDashboard?.recommended_profile?.preset_set_id || "").trim();
                    const openSug = heartbeatSuggestions.find((x) => x.status === "open");
                    const rank1 = presetForSuggestionRank(openSug, 1);
                    if (!recId || !rank1?.preset_set_id) return "alignment: -";
                    return `alignment: ${recId === rank1.preset_set_id ? "Aligned" : "Not aligned"} (suggest rank1=${rank1.preset_set_id})`;
                  })()}
                </div>
                <div className="composer-actions">
                  <button type="button" onClick={() => void refreshDailyLoopDashboard()}>Refresh</button>
                  <button type="button" onClick={() => void runDashboardRecommendedProfilePreflight()}>Preflight Apply</button>
                  <button type="button" onClick={() => void runDashboardRecommendedProfileApply()}>Apply (confirm)</button>
                </div>
              </article>
              <article className="dashboard-card">
                <div className="row-head">
                  <strong>Thread Archive Scheduler</strong>
                  <span className={`dashboard-badge ${`status-${dashboardThreadArchiveStatus}`}`}>{dashboardThreadArchiveStatus.toUpperCase()}</span>
                </div>
                <div className="empty">enabled={dashboardThreadArchiveScheduler?.settings?.enabled ? "true" : "false"} / effective={dashboardThreadArchiveScheduler?.state?.enabled_effective ? "true" : "false"}</div>
                <div className="empty wrapAnywhere">next_run_local: {dashboardThreadArchiveScheduler?.state?.next_run_local || "-"}</div>
                <div className="empty wrapAnywhere">last_run_at: {dashboardThreadArchiveScheduler?.state?.last_run_at || "-"}</div>
                <div className="empty">last_result_ok: {dashboardThreadArchiveScheduler?.state?.last_result_ok === false ? "false" : "true"} / timed_out: {dashboardThreadArchiveScheduler?.state?.last_timed_out ? "true" : "false"}</div>
                <div className="empty">last_elapsed_ms: {Number(dashboardThreadArchiveScheduler?.state?.last_elapsed_ms || 0)}</div>
                <div className="empty">failure_count: {Number(dashboardThreadArchiveScheduler?.state?.failure_count || 0)} / backoff_ms: {Number(dashboardThreadArchiveScheduler?.state?.backoff_ms || 0)}</div>
                <div className="empty">thread_keys_count: {Number(dashboardThreadArchiveScheduler?.settings?.thread_keys_count || 0)}</div>
                <div className="empty wrapAnywhere">thread_keys_sample: {(dashboardThreadArchiveScheduler?.settings?.thread_keys_sample || []).join(", ") || "-"}</div>
                <div className="empty wrapAnywhere">last_failed_thread_keys: {(dashboardThreadArchiveScheduler?.state?.last_failed_thread_keys || []).join(", ") || "-"}</div>
                <div className="empty wrapAnywhere">summary: {dashboardThreadArchiveScheduler?.state?.last_result_summary || "-"}</div>
                <div className="composer-actions">
                  <button type="button" onClick={() => void refreshDashboardThreadArchiveScheduler()}>Refresh</button>
                  <button type="button" onClick={() => void runDashboardThreadArchiveSchedulerDryRun()}>Run dry-run now</button>
                  <button type="button" onClick={() => setActiveChannel("settings")}>Open settings</button>
                </div>
              </article>
              <article className="dashboard-card opsCard" ref={dashboardQuickActionsCardRef}>
                <div className="row-head">
                  <strong>🧭 Quick Actions</strong>
                  <span className="dashboard-badge status-warn">DRY-RUN</span>
                  <label className="trackerAutocloseToggle">
                    <input
                      type="checkbox"
                      checked={trackerAutoCloseOnSuccess}
                      onChange={(e) => setTrackerAutoCloseOnSuccess(e.target.checked)}
                    />
                    Auto-close on success
                  </label>
                </div>
                <div className="empty">Dry-run is one-click. Execute is allowlisted and confirm-gated.</div>
                <div className="list">
                  {(dashboardQuickActions?.actions || []).map((qa) => {
                    const inflight = !!dashboardQuickActionInflightRef.current[String(qa.id || "")];
                    const disabled = !qa.enabled || inflight;
                    const executeInflight = !!dashboardQuickExecuteInflightRef.current[getQuickExecuteId(qa)];
                    const focused = !!dashboardQuickActionFocusId
                      && (String(qa.id || "").trim() === dashboardQuickActionFocusId || getQuickExecuteId(qa) === dashboardQuickActionFocusId);
                    return (
                      <div key={qa.id} className={`dashboardQuickActionItem ${focused ? "focusedAction" : ""}`}>
                        <div className="row-head">
                          <strong>{qa.title || qa.id}</strong>
                          <span className={`dashboard-badge ${qa.enabled ? "status-ok" : "status-err"}`}>{qa.enabled ? "ENABLED" : "DISABLED"}</span>
                        </div>
                        <div className="empty wrapAnywhere">{qa.hint || "-"}</div>
                        <div className="empty wrapAnywhere">
                          last: {qa.last?.last_run_at ? formatTs(String(qa.last.last_run_at)) : "-"}
                          {" / "}
                          ok={qa.last?.ok === false ? "false" : (qa.last?.ok === true ? "true" : "-")}
                          {" / "}
                          elapsed_ms={Number(qa.last?.elapsed_ms || 0)}
                        </div>
                        {qa.last?.result_summary ? (
                          <div className="empty wrapAnywhere">summary: {qa.last.result_summary}</div>
                        ) : null}
                        {qa.execute_supported ? (
                          <div className="empty wrapAnywhere">
                            last_execute: {qa.last?.last_execute_at ? formatTs(String(qa.last.last_execute_at)) : "-"}
                            {" / "}
                            ok={qa.last?.last_execute_ok === false ? "false" : (qa.last?.last_execute_ok === true ? "true" : "-")}
                            {" / "}
                            hint={qa.execute_endpoint_hint || "-"}
                          </div>
                        ) : null}
                        {qa.last?.last_execute_result_summary ? (
                          <div className="empty wrapAnywhere">execute_summary: {qa.last.last_execute_result_summary}</div>
                        ) : null}
                        <div className="composer-actions">
                          <button type="button" disabled={disabled} onClick={() => void runDashboardQuickAction(qa)}>
                            {inflight ? "Running..." : "Run (dry-run)"}
                          </button>
                          <button type="button" disabled={!qa.last} onClick={() => viewDashboardQuickActionLast(qa)}>View last</button>
                          {qa.execute_supported ? (
                            <button type="button" disabled={!qa.enabled || executeInflight} onClick={() => openDashboardQuickExecuteModal(qa)}>Execute (confirm)</button>
                          ) : null}
                          <button type="button" onClick={() => openDashboardQuickActionSettings(qa)}>Open settings</button>
                        </div>
                      </div>
                    );
                  })}
                  {(dashboardQuickActions?.actions || []).length < 1 ? (
                    <div className="empty">No quick actions available</div>
                  ) : null}
                </div>
              </article>
              <article className="dashboard-card">
                <div className="row-head">
                  <strong>Inbox (latest)</strong>
                  <span className={`dashboard-badge ${`status-${dashboardInboxStatus}`}`}>{dashboardInboxStatus.toUpperCase()}</span>
                </div>
                <div className="empty">unread_count: {Number(dailyLoopDashboard?.inbox?.unread_count || 0)}</div>
                <div className="empty">mention_count: {Number(dailyLoopDashboard?.inbox?.mention_count || 0)}</div>
                <div className="list">
                  {(dailyLoopDashboard?.inbox?.items || []).slice(0, 8).map((it) => (
                    <button key={it.id} type="button" className="list-item" onClick={() => openInboxItem(it)}>
                      <div>{it.title || "(no title)"}</div>
                      <small>{formatTs(String(it.ts || ""))} | {it.source || "-"}</small>
                    </button>
                  ))}
                  {!dailyLoopDashboard?.inbox?.items?.length ? <div className="empty">No inbox items</div> : null}
                </div>
              </article>
              <article className="dashboard-card opsCard">
                <div className="row-head">
                  <strong>🛠 Ops Quick Actions</strong>
                  <span className="dashboard-badge status-warn">OPS</span>
                </div>
                <div className="empty wrapAnywhere">confirm_token: {opsQuickStatus?.confirm_token ? `${String(opsQuickStatus.confirm_token).slice(0, 24)}...` : "-"}</div>
                <div className="empty">locks</div>
                <div className="list">
                  {(opsQuickStatus?.locks || []).map((lk) => (
                    <div key={lk.name} className="empty wrapAnywhere">{lk.name}: exists={lk.exists ? "true" : "false"} age={Number(lk.age_sec || -1)}s threshold={Number(lk.stale_threshold_sec || 0)} path={lk.path || "-"}</div>
                  ))}
                </div>
                <div className="empty">brakes</div>
                <div className="list">
                  {(opsQuickStatus?.brakes || []).map((b) => (
                    <div key={b.name} className="empty wrapAnywhere">{b.name}: enabled={b.enabled ? "true" : "false"} / effective={b.enabled_effective ? "true" : "false"} {b.reason ? `reason=${b.reason}` : ""}</div>
                  ))}
                </div>
                <div className="empty">logs</div>
                <div className="list">
                  {(opsQuickStatus?.logs || []).map((lg) => (
                    <div key={lg.name} className="empty wrapAnywhere">{lg.name}: {lg.path || "-"}</div>
                  ))}
                </div>
                <details>
                  <summary>Auto-stabilize (dry-run only)</summary>
                  <div className="empty">Dry-run suggestions only. safe_run remains manual with confirm.</div>
                  <div className="empty">Auto execute can run <strong>safe(no exec)</strong> only. run_now execution is always manual.</div>
                  <div className="list">
                    <label><input type="checkbox" checked={opsAutoEnabled} onChange={(e) => setOpsAutoEnabled(e.target.checked)} /> enabled</label>
                    <label>check_interval_sec<input value={opsAutoCheckIntervalSec} onChange={(e) => setOpsAutoCheckIntervalSec(e.target.value)} /></label>
                    <label>cooldown_sec<input value={opsAutoCooldownSec} onChange={(e) => setOpsAutoCooldownSec(e.target.value)} /></label>
                    <label>max_per_day<input value={opsAutoMaxPerDay} onChange={(e) => setOpsAutoMaxPerDay(e.target.value)} /></label>
                  </div>
                  <div className="empty">Auto execute safe(no exec)</div>
                  <div className="list">
                    <label><input type="checkbox" checked={opsAutoExecuteEnabled} onChange={(e) => setOpsAutoExecuteEnabled(e.target.checked)} /> auto_execute.enabled</label>
                    <label>auto_execute.cooldown_sec<input value={opsAutoExecuteCooldownSec} onChange={(e) => setOpsAutoExecuteCooldownSec(e.target.value)} /></label>
                    <label>auto_execute.max_per_day<input value={opsAutoExecuteMaxPerDay} onChange={(e) => setOpsAutoExecuteMaxPerDay(e.target.value)} /></label>
                  </div>
                  <div className="composer-actions">
                    <button type="button" onClick={() => void saveOpsAutoStabilizeSettings()}>Save auto-stabilize</button>
                    <button type="button" onClick={() => { void refreshOpsAutoStabilize(); void refreshDailyLoopDashboard(); }}>Refresh auto state</button>
                    <button
                      type="button"
                      onClick={() => openOpsQuickConfirm(
                        "Run auto-stabilize now (dry-run)",
                        "/api/ops/auto_stabilize/run_now",
                        { dry_run: true },
                      )}
                    >
                      Run auto-stabilize now
                    </button>
                  </div>
                  <div className="empty">enabled_effective: {opsAutoStabilizeState?.enabled_effective ? "true" : "false"}</div>
                  <div className="empty wrapAnywhere">last_check_at: {opsAutoStabilizeState?.last_check_at || "-"}</div>
                  <div className="empty wrapAnywhere">last_trigger_at: {opsAutoStabilizeState?.last_trigger_at || "-"}</div>
                  <div className="empty">trigger_count_today: {Number(opsAutoStabilizeState?.trigger_count_today || 0)} / failure_count: {Number(opsAutoStabilizeState?.failure_count || 0)}</div>
                  <div className="empty wrapAnywhere">last_reason: {opsAutoStabilizeState?.last_reason || "-"}</div>
                  <div className="empty wrapAnywhere">last_result_summary: {opsAutoStabilizeState?.last_result_summary || "-"}</div>
                  <div className="empty wrapAnywhere">last_auto_execute_at: {opsAutoStabilizeState?.last_auto_execute_at || "-"}</div>
                  <div className="empty">auto_execute_count_today: {Number(opsAutoStabilizeState?.auto_execute_count_today || 0)} / last_auto_execute_ok: {opsAutoStabilizeState?.last_auto_execute_ok === false ? "false" : "true"}</div>
                  <div className="empty wrapAnywhere">last_auto_execute_note: {opsAutoStabilizeState?.last_auto_execute_note || "-"}</div>
                </details>
                <div className="composer-actions">
                  <button type="button" onClick={() => openOpsQuickConfirm("Clear stale locks (dry-run)", "/api/ops/quick_actions/clear_stale_locks", { dry_run: true })}>Clear stale locks (dry-run)</button>
                  <button type="button" onClick={() => openOpsQuickConfirm("Clear stale locks", "/api/ops/quick_actions/clear_stale_locks", { dry_run: false })}>Clear stale locks</button>
                </div>
                <div className="composer-actions">
                  <button type="button" onClick={() => openOpsQuickConfirm("Reset brakes (dry-run)", "/api/ops/quick_actions/reset_brakes", { dry_run: true })}>Reset brakes (dry-run)</button>
                  <button type="button" onClick={() => openOpsQuickConfirm("Reset brakes", "/api/ops/quick_actions/reset_brakes", { dry_run: false })}>Reset brakes</button>
                </div>
                <div className="composer-actions">
                  <button type="button" onClick={() => openOpsQuickConfirm("Stabilize (dry-run)", "/api/ops/quick_actions/stabilize", { mode: "dry_run", include_run_now: false, confirm_token: String(opsQuickStatus?.confirm_token || "") })}>Stabilize (dry-run)</button>
                  <button
                    type="button"
                    className="dangerAction"
                    onClick={() => openOpsQuickConfirm(
                      "Stabilize (safe run)",
                      "/api/ops/quick_actions/stabilize",
                      { mode: "safe_run", include_run_now: true, confirm_token: String(opsQuickStatus?.confirm_token || "") },
                      "This runs actual facilitator run_now sequence. Confirm carefully.",
                    )}
                  >
                    Stabilize (safe run)
                  </button>
                </div>
              </article>
            </div>
            {dailyLoopActionResult ? (
              <pre className="jsonOutput">{JSON.stringify(dailyLoopActionResult, null, 2)}</pre>
            ) : null}
            {dashboardQuickActionResult ? (
              <>
                <pre className="jsonOutput">{JSON.stringify(dashboardQuickActionResult, null, 2)}</pre>
                <div className="composer-actions">
                  {String((dashboardQuickActionResult as any)?.result?.run_id || "") ? (
                    <button type="button" onClick={() => jumpToRun(String((dashboardQuickActionResult as any)?.result?.run_id || ""))}>Open run</button>
                  ) : null}
                  {String((dashboardQuickActionResult as any)?.result?.request_id || "") ? (
                    <button type="button" onClick={() => setActiveChannel("settings")}>Open settings (request)</button>
                  ) : null}
                </div>
              </>
            ) : null}
            {activeExecutionTracker ? (
              <article className="dashboard-card trackerPanel opsCard">
                <div className="row-head">
                  <strong>📡 Execution Tracker</strong>
                  <span className={`dashboard-badge ${`status-${activeExecutionTracker.status === "success" ? "ok" : (activeExecutionTracker.status === "polling" ? "warn" : "err")}`}`}>
                    {activeExecutionTracker.status.toUpperCase()}
                  </span>
                </div>
                <div className="empty wrapAnywhere">id={activeExecutionTracker.id} / kind={activeExecutionTracker.kind}</div>
                <div className="empty wrapAnywhere">started_at={new Date(activeExecutionTracker.startedAt).toISOString()} / poll_count={activeExecutionTracker.pollCount} / next_delay_ms={activeExecutionTracker.nextDelayMs}</div>
                <div className="empty wrapAnywhere">poll_url={activeExecutionTracker.pollUrl}</div>
                <div className="empty wrapAnywhere">request_id={activeExecutionTracker.requestId || "-"}</div>
                <div className="empty wrapAnywhere">run_id={activeExecutionTracker.runId || "-"}</div>
                <div className="empty wrapAnywhere">thread_key={activeExecutionTracker.threadKey || "-"}</div>
                {activeExecutionTracker.lastError ? <div className="empty dangerText wrapAnywhere">error: {activeExecutionTracker.lastError}</div> : null}
                <div className="composer-actions">
                  <button
                    type="button"
                    disabled={activeExecutionTracker.status !== "polling" || executionTrackerPollInflightRef.current}
                    onClick={() => void refreshExecutionTrackerNow()}
                  >
                    Refresh now
                  </button>
                  {activeExecutionTracker.runId ? (
                    <button type="button" onClick={() => jumpToRun(String(activeExecutionTracker.runId || ""))}>Open run</button>
                  ) : null}
                  {activeExecutionTracker.requestId ? (
                    <button type="button" onClick={() => goTrackerRequestToInbox()}>Go to #inbox</button>
                  ) : null}
                  {activeExecutionTracker.threadKey ? (
                    <button type="button" onClick={() => openTrackerThread()}>Open thread</button>
                  ) : null}
                  {activeExecutionTracker.requestId ? (
                    <button type="button" onClick={() => void copyTrackerValue(String(activeExecutionTracker.requestId || ""))}>Copy request_id</button>
                  ) : null}
                  {activeExecutionTracker.runId ? (
                    <button type="button" onClick={() => void copyTrackerValue(String(activeExecutionTracker.runId || ""))}>Copy run_id</button>
                  ) : null}
                  {activeExecutionTracker.threadKey ? (
                    <button type="button" onClick={() => void copyTrackerValue(String(activeExecutionTracker.threadKey || ""))}>Copy thread_key</button>
                  ) : null}
                  <button type="button" className="dangerAction" onClick={() => cancelExecutionTracker()}>Cancel tracking</button>
                </div>
                {activeExecutionTracker.lastPayload ? (
                  <pre className="jsonOutput">{JSON.stringify(activeExecutionTracker.lastPayload, null, 2)}</pre>
                ) : (
                  <div className="empty">No tracker payload yet</div>
                )}
              </article>
            ) : null}
            <article className="dashboard-card trackerHistoryPanel opsCard">
                <div className="row-head">
                  <strong>🗂 Tracker History</strong>
                  <div className="trackerHistoryToolbar">
                    <span className="dashboard-badge status-warn">LATEST 10</span>
                    <button type="button" onClick={() => showTrackerHistoryExportInPane()}>Export</button>
                    <button type="button" onClick={() => void copyTrackerHistoryExportJson()}>Copy JSON</button>
                    <button type="button" onClick={() => openTrackerHistoryImport()}>Import</button>
                    <button type="button" className="dangerAction" onClick={() => openTrackerHistoryClearConfirm()}>Clear</button>
                  </div>
                </div>
                {trackerHistory.length < 1 ? (
                  <div className="empty">No history yet</div>
                ) : (
                  <div className="list trackerHistoryList">
                    {trackerHistory.map((item, idx) => {
                      const source = trackerHistoryWorkspaceKeys[trackerHistoryDedupeKey(item)] ? "workspace" : "local";
                      return (
                        <div key={`${item.id}_${item.ended_at}_${idx}`} className="dashboardQuickActionItem trackerHistoryItem">
                          <div className="row-head">
                            <strong className="wrapAnywhere">{item.id}</strong>
                            <div className="trackerHistoryBadgeRow">
                              <span className="dashboard-badge status-warn trackerSourceBadge">{source}</span>
                              <span className={`dashboard-badge ${`status-${item.status === "success" ? "ok" : "err"}`}`}>
                                {item.status.toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="empty wrapAnywhere">kind={item.kind}</div>
                          <div className="empty wrapAnywhere">thread_key={item.thread_key || "-"}</div>
                          <div className="empty wrapAnywhere">
                            ended_at={formatTs(item.ended_at)}
                            {" / "}
                            elapsed_ms={Number(item.elapsed_ms || 0)}
                          </div>
                          <div className="empty wrapAnywhere">summary: {item.last_summary || "-"}</div>
                          <div className="composer-actions trackerHistoryActions">
                            <button type="button" onClick={() => viewTrackerHistoryDetails(item)}>View details</button>
                            <button type="button" onClick={() => reopenTrackerFromHistory(item)}>Re-open tracker</button>
                            {item.run_id ? (
                              <button type="button" onClick={() => jumpToRun(String(item.run_id || ""))}>Open run</button>
                            ) : null}
                            {item.thread_key ? (
                              <button type="button" onClick={() => goTrackerHistoryToThread(item)}>Open thread</button>
                            ) : null}
                            {(item.request_id || item.run_id) ? (
                              <button type="button" onClick={() => goTrackerHistoryToInbox(item)}>Go to #inbox</button>
                            ) : null}
                            {(item.request_id || item.run_id) ? (
                              <button type="button" onClick={() => void copyTrackerHistoryIds(item)}>Copy IDs</button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            {trackerHistoryImportOpen ? (
              <div className="confirmOverlay">
                <div className="confirmDialog">
                  <div className="row-head"><strong>Import Tracker History</strong></div>
                  <div className="empty">Paste export JSON (schema must be regionai.tracker_history.export.v1) and validate before import.</div>
                  <textarea
                    className="trackerHistoryImportTextarea"
                    value={trackerHistoryImportText}
                    onChange={(e) => setTrackerHistoryImportText(e.target.value)}
                    placeholder="{\"schema\":\"regionai.tracker_history.export.v1\",\"items\":[...]}"
                  />
                  {trackerHistoryImportError ? <div className="empty dangerText wrapAnywhere">{trackerHistoryImportError}</div> : null}
                  {trackerHistoryImportReport ? <div className="empty wrapAnywhere">{trackerHistoryImportReport}</div> : null}
                  <div className="composer-actions">
                    <button type="button" onClick={() => validateTrackerHistoryImportText()}>Validate</button>
                    <button type="button" disabled={!trackerHistoryImportValidItems} onClick={() => applyTrackerHistoryImport()}>Import</button>
                    <button type="button" onClick={() => setTrackerHistoryImportOpen(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            ) : null}
            {trackerHistoryClearOpen ? (
              <div className="confirmOverlay">
                <div className="confirmDialog">
                  <div className="row-head"><strong>Clear Tracker History</strong></div>
                  <div className="empty dangerText">Type CLEAR to remove all tracker history.</div>
                  <label className="quickExecuteInputLabel">
                    Confirm phrase
                    <input value={trackerHistoryClearPhrase} onChange={(e) => setTrackerHistoryClearPhrase(e.target.value)} />
                  </label>
                  <div className="composer-actions">
                    <button type="button" onClick={() => setTrackerHistoryClearOpen(false)}>Cancel</button>
                    <button type="button" className="dangerAction" disabled={trackerHistoryClearPhrase.trim() !== "CLEAR"} onClick={() => clearTrackerHistoryConfirmed()}>Clear history</button>
                  </div>
                </div>
              </div>
            ) : null}
            {activeProfileRevertModalOpen ? (
              <div className="confirmOverlay">
                <div className="confirmDialog">
                  <div className="row-head"><strong>Revert Active Profile</strong></div>
                  <div className="empty">Target: standard</div>
                  <div className="empty">Side effects: apply preset traits (council), update active profile, append audit.</div>
                  <label className="quickExecuteInputLabel">
                    Type REVERT to confirm
                    <input value={activeProfileRevertPhrase} onChange={(e) => setActiveProfileRevertPhrase(e.target.value)} />
                  </label>
                  <div className="composer-actions">
                    <button type="button" disabled={activeProfileRevertInflightRef.current} onClick={() => void runActiveProfileRevertPreview()}>Run preview</button>
                    <button type="button" onClick={() => setActiveProfileRevertModalOpen(false)}>Cancel</button>
                    <button
                      type="button"
                      className="dangerAction"
                      disabled={activeProfileRevertInflightRef.current || activeProfileRevertPhrase.trim() !== "REVERT"}
                      onClick={() => void runActiveProfileRevertExecute()}
                    >
                      Revert
                    </button>
                  </div>
                  {activeProfileRevertPreview ? (
                    <pre className="jsonOutput">{JSON.stringify(activeProfileRevertPreview, null, 2)}</pre>
                  ) : null}
                  {activeProfileRevertResult ? (
                    <pre className="jsonOutput">{JSON.stringify(activeProfileRevertResult, null, 2)}</pre>
                  ) : null}
                </div>
              </div>
            ) : null}
            {opsQuickResult ? (
              <pre className="jsonOutput">{JSON.stringify(opsQuickResult, null, 2)}</pre>
            ) : null}
            {dashboardQuickExecuteModalOpen && dashboardQuickExecuteTarget ? (
              <div className="confirmOverlay">
                <div className="confirmDialog">
                  <div className="row-head"><strong>Execute Quick Action</strong></div>
                  <div className="empty">{dashboardQuickExecuteTarget.title}</div>
                  <div className="empty">Preflight (dry-run) is recommended before execute.</div>
                  <div className="empty">Side effects:</div>
                  <ul className="dangerList">
                    {(dashboardQuickExecuteTarget.execute_side_effects || []).map((row) => (
                      <li key={row}>{row}</li>
                    ))}
                    {(dashboardQuickExecuteTarget.execute_side_effects || []).length < 1 ? <li>none listed</li> : null}
                  </ul>
                  <label className="quickExecuteInputLabel">
                    Type EXECUTE to confirm
                    <input value={dashboardQuickExecutePhrase} onChange={(e) => setDashboardQuickExecutePhrase(e.target.value)} />
                  </label>
                  {requiresApplyConfirm(getQuickExecuteId(dashboardQuickExecuteTarget)) ? (
                    <label className="quickExecuteInputLabel">
                      Type APPLY to confirm profile apply
                      <input value={dashboardQuickExecuteApplyPhrase} onChange={(e) => setDashboardQuickExecuteApplyPhrase(e.target.value)} />
                    </label>
                  ) : null}
                  <div className="composer-actions">
                    <button type="button" disabled={dashboardQuickExecuteInflightRef.current[getQuickExecuteId(dashboardQuickExecuteTarget)]} onClick={() => void runDashboardQuickExecutePreflight()}>Run preflight</button>
                    <button type="button" onClick={() => { setDashboardQuickExecuteModalOpen(false); setDashboardQuickExecuteTarget(null); }}>Cancel</button>
                    <button
                      type="button"
                      className="dangerAction"
                      disabled={
                        dashboardQuickExecuteInflightRef.current[getQuickExecuteId(dashboardQuickExecuteTarget)]
                        || dashboardQuickExecutePhrase.trim() !== "EXECUTE"
                        || (requiresApplyConfirm(getQuickExecuteId(dashboardQuickExecuteTarget)) && dashboardQuickExecuteApplyPhrase.trim() !== "APPLY")
                        || !dashboardQuickExecutePreflightDoneRef.current[getQuickExecuteId(dashboardQuickExecuteTarget)]
                      }
                      onClick={() => void executeDashboardQuickActionConfirmed()}
                    >
                      Execute
                    </button>
                  </div>
                  {dashboardQuickExecutePreflightResult ? (
                    <pre className="jsonOutput">{JSON.stringify(dashboardQuickExecutePreflightResult, null, 2)}</pre>
                  ) : null}
                </div>
              </div>
            ) : null}
            {opsQuickConfirmOpen && opsQuickPendingAction ? (
              <div className="confirmOverlay">
                <div className="confirmDialog">
                  <div className="row-head"><strong>Confirm action</strong></div>
                  <div className="empty">{opsQuickPendingAction.label}</div>
                  {opsQuickPendingAction.warning ? <div className="empty dangerText">{opsQuickPendingAction.warning}</div> : null}
                  <pre className="jsonOutput">{JSON.stringify({ endpoint: opsQuickPendingAction.endpoint, payload: opsQuickPendingAction.payload }, null, 2)}</pre>
                  <div className="composer-actions">
                    <button type="button" onClick={() => { setOpsQuickConfirmOpen(false); setOpsQuickPendingAction(null); }}>Cancel</button>
                    <button type="button" className="dangerAction" onClick={() => void executeOpsQuickAction()}>Confirm</button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {activeChannel === "workspace" && (
          <div className="workspace-root">
            <div className="workspace-toolbar">
              <label>
                <input type="checkbox" checked={workspaceEditLayout} onChange={(e) => setWorkspaceEditLayout(e.target.checked)} />
                配置編集
              </label>
              <label>
                <input type="checkbox" checked={workspaceAutoLayoutZones} onChange={(e) => setWorkspaceAutoLayoutZones(e.target.checked)} />
                state zone auto-layout
              </label>
            </div>
            <div className="workspace-zones">
              {Object.entries(workspaceZoneCounts).map(([zone, count]) => (
                <span key={zone} className="workspace-zone-chip">{zone}: {count}</span>
              ))}
            </div>
            <div ref={workspaceRoomRef} className={`workspace-room ${workspaceEditLayout ? "is-editing" : ""}`}>
              {orderedAgents.map((agent, idx) => {
                const pos = seatPositionForAgent(agent, idx);
                const isDragging = workspaceDraggingAgentId === agent.id;
                return (
                  <article
                    key={agent.id}
                    className={`workspace-seat ${`status-${agent.status}`} ${isDragging ? "is-dragging" : ""}`}
                    style={{ left: `${(pos.x * 100).toFixed(2)}%`, top: `${(pos.y * 100).toFixed(2)}%` }}
                    onPointerDown={(ev) => startWorkspaceDrag(agent, idx, ev)}
                  >
                    <div className="workspace-seat-head">
                      <div className="workspace-agent-name">{agent.icon} {agent.display_name}</div>
                      <span className={`workspace-status-badge status-${agent.status}`}>{agent.status}</span>
                    </div>
                    <div className="workspace-zone-label">{stateZoneLabel(agent.status)}</div>
                    <div className="workspace-agent-role">{agent.role}</div>
                    <div className="workspace-agent-thread">thread: {agent.assigned_thread_id || "-"}</div>
                    <div className="workspace-office-line">state route: {agent.status} → {stateZoneLabel(agent.status)}</div>
                    <div className="workspace-office-line">office desk: {agent.assigned_thread_id ? `thread/${agent.assigned_thread_id}` : "unassigned"}</div>
                    <div className="workspace-actions" onPointerDown={(e) => e.stopPropagation()}>
                      <button type="button" title="Open right pane Character Sheet" onClick={() => openCharacterSheet(agent.id)}>キャラシート</button>
                      <button type="button" onClick={() => focusDesktopRole(agent)}>ChatGPTへフォーカス</button>
                      <button type="button" onClick={() => openAgentMemory(agent.id, "episodes")}>Memory</button>
                      <button type="button" onClick={() => void runWorkspaceHeartbeat(agent)}>Heartbeat</button>
                      {agent.assigned_thread_id ? (
                        <button type="button" onClick={() => jumpToThread(String(agent.assigned_thread_id || ""))}>Go to thread</button>
                      ) : null}
                      <button type="button" onClick={() => setActiveChannel("drafts")}>Taskify draft</button>
                      {agent.id === "facilitator" ? (
                        <button type="button" onClick={() => insertRoundStartTemplate(agent)}>Round start template</button>
                      ) : null}
                    </div>
                    {latestActivityByActor[agent.id] ? (
                      <div className="workspace-seat-meta">
                        latest: {latestActivityByActor[agent.id].title}
                      </div>
                    ) : null}
                    {workspaceBubbles[agent.id] ? (
                      <div className="workspace-bubble">
                        <strong>{workspaceBubbles[agent.id].title}</strong>
                        <div>{workspaceBubbles[agent.id].summary}</div>
                        <div className="workspace-actions" onPointerDown={(e) => e.stopPropagation()}>
                          {workspaceBubbles[agent.id].run_id ? (
                            <button type="button" onClick={() => jumpToRun(String(workspaceBubbles[agent.id].run_id || ""))}>Open run</button>
                          ) : null}
                          {workspaceBubbles[agent.id].thread_id ? (
                            <button type="button" onClick={() => jumpToThread(String(workspaceBubbles[agent.id].thread_id || ""))}>Open thread</button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {orderedGuests.map((guest, idx) => {
                const row = Math.floor(idx / 2);
                const col = idx % 2;
                const left = col === 0 ? 0.12 : 0.88;
                const top = 0.2 + (row * 0.2);
                return (
                  <article
                    key={`guest_${guest.id}`}
                    className={`workspace-seat guest-seat status-${guest.status}`}
                    style={{ left: `${(left * 100).toFixed(2)}%`, top: `${(top * 100).toFixed(2)}%` }}
                  >
                    <div className="workspace-seat-head">
                      <div className="workspace-agent-name">🙂 {guest.display_name}</div>
                      <span className={`workspace-status-badge status-${guest.status}`}>{guest.status}</span>
                    </div>
                    <div className="workspace-agent-role">Guest</div>
                    <div className="workspace-agent-thread">last_seen: {formatTs(guest.last_seen_at)}</div>
                    <div className="workspace-actions">
                      <button type="button" onClick={() => { setActivityEventTypeFilter("guest_pushed"); setActiveChannel("activity"); }}>Open #アクティビティ</button>
                    </div>
                  </article>
                );
              })}
              {workspaceEmptySeats.map((i) => (
                <div key={`empty-${i}`} className="workspace-empty">empty seat</div>
              ))}
            </div>
          </div>
        )}

        {activeChannel === "office" && (
          <div className="office-root">
            <section className="so-panel office-control">
              <div className="so-header">
                <strong>Control Room</strong>
                <span className={`dashboard-badge ${officeConnectionMode === "LIVE" ? "status-ok" : (officeConnectionMode === "POLL" ? "status-warn" : "status-err")}`}>{officeConnectionMode}</span>
              </div>
              <div className="so-card">
                <div className="row-head">
                  <strong>Quick Access</strong>
                  <div className="composer-actions">
                    <button type="button" className={quickAccessMode === "favorites" ? "inline-link" : undefined} aria-pressed={quickAccessMode === "favorites"} onClick={() => setQuickAccessMode("favorites")}>Favorites</button>
                    <button type="button" className={quickAccessMode === "recent" ? "inline-link" : undefined} aria-pressed={quickAccessMode === "recent"} onClick={() => setQuickAccessMode("recent")}>Recent</button>
                  </div>
                </div>
                {visibleQuickAccessItems.length ? (
                  <>
                    <div className="composer-actions">
                      {quickAccessMode === "recent"
                        ? visibleQuickAccessRecent.map((item, index) => renderWorkspaceRecentChip(item, index))
                        : visibleQuickAccessFavorites.map((item, index) => renderWorkspaceFavoriteChip(item, index, workspaceFavoriteItems.length))}
                    </div>
                    {quickAccessMode === "favorites" && workspaceFavoriteItems.length > 3
                      ? renderQuickAccessOverflowButton(quickAccessFavoritesExpanded, hiddenQuickAccessFavoritesCount, () => setQuickAccessFavoritesExpanded((prev) => !prev))
                      : null}
                    {quickAccessMode === "recent" && workspaceRecentItems.length > 3
                      ? renderQuickAccessOverflowButton(quickAccessRecentExpanded, hiddenQuickAccessRecentCount, () => setQuickAccessRecentExpanded((prev) => !prev))
                      : null}
                  </>
                ) : (
                  <div className="so-muted">{quickAccessEmptyText}</div>
                )}
              </div>
              <div className="office-grid">
                <div className="so-card">
                  <div className="so-muted">Run</div>
                  <div className="wrapAnywhere">status: {officeRunStatus}</div>
                  <div className="wrapAnywhere">run_id: {officeRunId || "-"}</div>
                  <div className="composer-actions">
                    {officeRunId ? <button type="button" onClick={() => jumpToRun(officeRunId)}>Open</button> : null}
                    {officeRunId ? renderFavoriteToggleButton(buildFavoriteRunTarget(officeRunId), "Pin run") : null}
                    {isValidInboxThreadKey(controlRoomThreadKey) ? <button type="button" onClick={() => openTrackerThread(controlRoomThreadKey)}>Thread</button> : null}
                    {isValidInboxThreadKey(controlRoomThreadKey) ? renderFavoriteToggleButton(buildFavoriteThreadTarget(controlRoomThreadKey), "Pin thread") : null}
                  </div>
                </div>
                <div className="so-card">
                  <div className="so-muted">Queue</div>
                  <div className="wrapAnywhere">{officeQueueLabel}</div>
                  <div className="composer-actions">
                    {taskifyTrackingItem?.run_id ? <button type="button" onClick={() => jumpToRun(String(taskifyTrackingItem.run_id || ""))}>Open</button> : null}
                    {taskifyTrackingItem?.run_id ? renderFavoriteToggleButton(buildFavoriteRunTarget(String(taskifyTrackingItem.run_id || "")), "Pin run") : null}
                  </div>
                </div>
                <div className="so-card">
                  <div className="so-muted">Autopilot</div>
                  <div className="wrapAnywhere">{officeAutopilotLabel}</div>
                  <div className="composer-actions">
                    {isValidInboxThreadKey(controlRoomThreadKey) ? <button type="button" onClick={() => openTrackerThread(controlRoomThreadKey)}>Open</button> : null}
                    {isValidInboxThreadKey(controlRoomThreadKey) ? renderFavoriteToggleButton(buildFavoriteThreadTarget(controlRoomThreadKey), "Pin thread") : null}
                  </div>
                </div>
                <div className="so-card">
                  <div className="so-muted">Routines</div>
                  <div className="wrapAnywhere">{officeRoutinesLabel}</div>
                  <div className="composer-actions">
                    {isValidInboxThreadKey(controlRoomTrackerThreadKey) ? <button type="button" onClick={() => { const trackerRecentKey = String(activeExecutionTracker?.runId || controlRoomTrackerThreadKey || "").trim(); recordRecentTarget({ id: `tracker_${trackerRecentKey}`, title: `Tracker: ${formatCompactTargetId("trk", trackerRecentKey)}`, subtitle: activeExecutionTracker?.runId ? `Open tracked run ${formatCompactTargetId("run", activeExecutionTracker.runId)}` : "Open current tracker thread" }); openTrackerThread(controlRoomTrackerThreadKey); }}>Tracker</button> : null}
                    {isValidInboxThreadKey(controlRoomTrackerThreadKey) ? renderFavoriteToggleButton(buildFavoriteTrackerTarget(String(activeExecutionTracker?.runId || controlRoomTrackerThreadKey || "").trim(), activeExecutionTracker?.runId ? String(activeExecutionTracker.runId || "").trim() : undefined), "Pin tracker") : null}
                  </div>
                </div>
              </div>
              <div className="so-muted wrapAnywhere" title={controlRoomRecentIssue.detail || controlRoomRecentIssue.text}>
                {controlRoomRecentIssue.text}
                {controlRoomRecentIssue.badge ? <span className="so-kbd">{controlRoomRecentIssue.badge.label}</span> : null}
                {controlRoomIssueRunId ? <button type="button" className="inline-link" onClick={() => jumpToRun(controlRoomIssueRunId)}>Open</button> : null}
                {controlRoomIssueRunId ? renderFavoriteToggleButton(buildFavoriteRunTarget(controlRoomIssueRunId), "Pin run") : null}
                {!controlRoomIssueRunId && isValidInboxThreadKey(controlRoomIssueThreadKey) ? <button type="button" className="inline-link" onClick={() => openTrackerThread(controlRoomIssueThreadKey)}>Open</button> : null}
                {!controlRoomIssueRunId && isValidInboxThreadKey(controlRoomIssueThreadKey) ? renderFavoriteToggleButton(buildFavoriteThreadTarget(controlRoomIssueThreadKey), "Pin thread") : null}
              </div>
              <div className="composer-actions">
                <button
                  type="button"
                  disabled={!officeRunId}
                  onClick={() => openGuardedAction(
                    "autopilot_pause",
                    "Autopilot Pause",
                    "Cancels active run to pause autoplay loop.",
                    { run_id: officeRunId || null, channel: activeChannel, impact: "council_run_cancel" },
                  )}
                >
                  Autopilot Pause (guarded)
                </button>
                <button
                  type="button"
                  disabled={!officeRunId}
                  onClick={() => openGuardedAction(
                    "autopilot_resume",
                    "Autopilot Resume",
                    "Resumes paused council run.",
                    { run_id: officeRunId || null, channel: activeChannel, impact: "council_run_resume" },
                  )}
                >
                  Resume (guarded)
                </button>
                <button
                  type="button"
                  className="dangerAction"
                  disabled={!officeRunId}
                  onClick={() => openGuardedAction(
                    "cancel_run",
                    "Cancel Active Run",
                    "Cancels active run immediately.",
                    { run_id: officeRunId || null, channel: activeChannel, impact: "council_run_cancel" },
                  )}
                >
                  Cancel Run (guarded)
                </button>
                <button
                  type="button"
                  onClick={() => openGuardedAction(
                    "retry_failed_items",
                    "Retry Failed Items",
                    "Runs safe retry for failed items (no run_now).",
                    { workspace: "default", mode: "safe_run", include_run_now: false },
                  )}
                >
                  Retry Failed (guarded)
                </button>
              </div>
            </section>
            <section className="so-panel office-canvas">
              <div className="so-header">
                <strong>Office Canvas</strong>
                <div className="composer-actions">
                  <span className="so-muted">workspace={officeWorkspaceKey}</span>
                  <span className="so-muted">drag to reorder seats</span>
                  <button type="button" onClick={() => resetOfficeLayout()}>Reset layout</button>
                </div>
              </div>
              <div className="office-seats">
                {orderedAgents.length < 1 ? <div className="so-card so-muted">No agents</div> : null}
                {orderedAgents.map((agent) => {
                  const officeSeatThreadKeyCandidates = [
                    String(agent.thread_key || "").trim().toLowerCase(),
                    String(councilThreadKey || councilStatus?.run?.thread_key || "").trim().toLowerCase(),
                    String(activeExecutionTracker?.threadKey || "").trim().toLowerCase(),
                  ];
                  const officeSeatThreadKey = officeSeatThreadKeyCandidates.find((item) => isValidInboxThreadKey(item)) || "";
                  const officeSeatTrackerRunId = String(
                    workspaceBubbles[agent.id]?.run_id
                    || officeRunId
                    || activeExecutionTracker?.runId
                    || ""
                  ).trim();
                  return (
                    <div
                      key={`office_${agent.id}`}
                      role="button"
                      tabIndex={0}
                      draggable={orderedAgents.length > 1}
                      className={`office-seat so-card status-${agent.status} ${officeDragAgentId === agent.id ? "is-dragging" : ""}`}
                      onClick={() => openCharacterSheet(agent.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          openCharacterSheet(agent.id);
                        }
                      }}
                      onDragStart={(ev) => {
                        ev.dataTransfer.effectAllowed = "move";
                        ev.dataTransfer.setData("text/plain", agent.id);
                        setOfficeDragAgentId(agent.id);
                      }}
                      onDragOver={(ev) => {
                        if (!officeDragAgentId || officeDragAgentId === agent.id) return;
                        ev.preventDefault();
                        ev.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(ev) => {
                        ev.preventDefault();
                        const dragId = ev.dataTransfer.getData("text/plain") || officeDragAgentId;
                        reorderOfficeLayoutByIds(dragId, agent.id);
                        setOfficeDragAgentId("");
                      }}
                      onDragEnd={() => setOfficeDragAgentId("")}
                    >
                      <div className="office-seat-head">
                        <strong>{agent.icon} {agent.display_name}</strong>
                        <span className={`workspace-status-badge status-${agent.status}`}>{agent.status}</span>
                      </div>
                      <div className="so-muted wrapAnywhere">{agent.role}</div>
                      <div className="so-muted wrapAnywhere">thread: {agent.assigned_thread_id || "-"}</div>
                      <div
                        className="composer-actions"
                        onClick={(ev) => ev.stopPropagation()}
                        onPointerDown={(ev) => ev.stopPropagation()}
                      >
                        <button
                          type="button"
                          title={`Open Character Sheet: ${agent.id}`}
                          onClick={() => openCharacterSheet(agent.id)}
                        >
                          Character
                        </button>
                        {renderFavoriteToggleButton(buildFavoriteAgentTarget(agent.id, agent.display_name, agent.role, agent.status), "Pin character")}
                        {officeSeatThreadKey ? (
                          <>
                            <button
                              type="button"
                              title={`Open Thread: ${officeSeatThreadKey}`}
                              onClick={() => openTrackerThread(officeSeatThreadKey)}
                            >
                              Thread
                            </button>
                            {renderFavoriteToggleButton(buildFavoriteThreadTarget(officeSeatThreadKey), "Pin thread")}
                          </>
                        ) : null}
                        {officeSeatTrackerRunId ? (
                          <>
                            <button
                              type="button"
                              title={`Open Tracker/Run: ${officeSeatTrackerRunId}`}
                              onClick={() => {
                                recordRecentTarget({
                                  id: `tracker_${officeSeatTrackerRunId}`,
                                  title: `Tracker: ${formatCompactTargetId("trk", officeSeatTrackerRunId)}`,
                                  subtitle: `Open tracked run ${formatCompactTargetId("run", officeSeatTrackerRunId)}`,
                                });
                                jumpToRun(officeSeatTrackerRunId);
                              }}
                            >
                              Tracker
                            </button>
                            {renderFavoriteToggleButton(buildFavoriteTrackerTarget(officeSeatTrackerRunId, officeSeatTrackerRunId), "Pin tracker")}
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="so-panel office-life">
              <div className="so-header">
                <strong>Life Cards</strong>
                <span className="so-muted">guest / memo / activity</span>
              </div>
              <div className="office-grid">
                <div className="so-card">
                  <div className="so-muted">Guests</div>
                  <div>{orderedGuests.length} active</div>
                </div>
                <div className="so-card">
                  <div className="so-muted">Yesterday memo</div>
                  <div className="so-muted">No data</div>
                </div>
                <div className="so-card">
                  <div className="so-muted">Latest activity</div>
                  <div className="so-muted">No data</div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeChannel === "debate" && (
          <div className="debate-root">
            <section className="so-panel debate-stage">
              <div className="so-header">
                <strong>Debate Stage</strong>
                <span className="so-muted">latest 4-role summary</span>
              </div>
              <div className="agent-chain-mini so-card">
                <div className="row-head">
                  <strong>Sub-agent chain</strong>
                  <span className="so-muted">lightweight route view</span>
                </div>
                {debateChainBadges.length ? (
                  <div className="composer-actions">
                    {debateChainBadges.map((badge) => {
                      const debateBadgeItem = buildFavoriteViewTarget(`debate_badge_${badge.full}`, `Debate: ${badge.label}`, badge.full);
                      return (
                        <span key={badge.label} className="so-kbd" title={badge.full}>
                          {badge.label}
                          {renderFavoriteToggleButton(debateBadgeItem, "Pin debate context")}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                {activeDebateChain.length ? (
                  <div className="agent-chain-mini-row">
                    {activeDebateChain.map((row, idx) => (
                      <div key={`chain_${row.role}`} className="agent-chain-mini-step">
                        <span className={`workspace-status-badge status-${row.status}`}>{row.status}</span>
                        <span>{row.role}</span>
                        {idx < activeDebateChain.length - 1 ? <span className="agent-chain-arrow">-&gt;</span> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="so-muted">No active chain</div>
                )}
              </div>
              <div className="debate-grid">
                {debateBubbles.map((row) => (
                  <article key={`debate_${row.role}`} className="so-card debate-bubble">
                    <div className="row-head">
                      <strong>{row.role}</strong>
                      <button type="button" onClick={() => openCharacterSheet(row.agentId)}>Character Sheet</button>
                    </div>
                    <div className="wrapAnywhere">{row.text}</div>
                    <div className="debate-evidence-links">
                      <button type="button" disabled={!row.threadKey} onClick={() => openDebateEvidence("thread", row)} title={row.threadKey || undefined}>
                        Thread
                        {row.threadLabel ? <span className="so-kbd">{row.threadLabel}</span> : null}
                      </button>
                      {row.threadKey ? renderFavoriteToggleButton(buildFavoriteThreadTarget(row.threadKey), "Pin thread") : null}
                      <button type="button" disabled={!row.runId} onClick={() => openDebateEvidence("tracker", row)} title={row.runId || undefined}>
                        Tracker
                        {row.runLabel ? <span className="so-kbd">{row.runLabel}</span> : null}
                      </button>
                      {row.runId ? renderFavoriteToggleButton(buildFavoriteTrackerTarget(row.runId, row.runId), "Pin tracker") : null}
                      <button type="button" disabled={!row.memoryAgentId} onClick={() => openDebateEvidence("memory", row)} title={row.memoryAgentId || undefined}>
                        Memory
                        {row.memoryLabel ? <span className="so-kbd">{row.memoryLabel}</span> : null}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="so-panel">
              <div className="so-header">
                <strong>Evidence Links</strong>
                <span className="so-muted">memory / traits / thread / tracker</span>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => { setActiveChannel("members"); setSelectedAgentId("facilitator"); }}>Traits</button>
                <button type="button" onClick={() => openAgentMemory("facilitator", "episodes")}>Memory</button>
                <button type="button" disabled={!isValidInboxThreadKey(councilThreadKey)} onClick={() => openCouncilThreadByKey()}>Thread</button>
                {isValidInboxThreadKey(councilThreadKey) ? renderFavoriteToggleButton(buildFavoriteThreadTarget(councilThreadKey), "Pin thread") : null}
                <button type="button" disabled={!officeRunId} onClick={() => { recordRecentTarget({ id: `tracker_${officeRunId}`, title: `Tracker: ${formatCompactTargetId("trk", officeRunId)}`, subtitle: `Open tracked run ${formatCompactTargetId("run", officeRunId)}` }); jumpToRun(officeRunId); }}>Tracker/Run</button>
                {officeRunId ? renderFavoriteToggleButton(buildFavoriteTrackerTarget(officeRunId, officeRunId), "Pin tracker") : null}
              </div>
              <div className="composer-actions">
                <button
                  type="button"
                  className="dangerAction"
                  disabled={!officeRunId}
                  onClick={() => openGuardedAction(
                    "cancel_run",
                    "Cancel Active Run",
                    "Cancels active council run from debate stage.",
                    { run_id: officeRunId || null, channel: activeChannel, impact: "council_run_cancel" },
                  )}
                >
                  Cancel Run (guarded)
                </button>
              </div>
              <div className="so-muted">Round source: {latestDebateRound ? (latestDebateRound.id || latestDebateRound.source || "available") : "data not available"}</div>
            </section>
          </div>
        )}

        {activeChannel === "members" && (
          <div className="grid2">
            <section>
              <div className="row-head">
                <strong>Members</strong>
                <small>{orgAgents.length} agents</small>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void refreshOrgAgents()}>Reload</button>
              </div>
              <div className="list">
                {orgAgents.map((agent) => (
                  <div key={agent.id} className={`list-item ${selectedAgentId === agent.id ? "active" : ""}`}>
                    <button type="button" className="inline-link" onClick={() => setSelectedAgentId(agent.id)}>
                      {agent.icon} {agent.display_name}
                    </button>
                    <small>{agent.role} | status={agent.status}</small>
                    <small className="wrapAnywhere">thread={agent.assigned_thread_id || "-"}</small>
                    <div className="composer-actions">
                      <button type="button" onClick={() => setSelectedAgentId(agent.id)}>編集</button>
                      <button type="button" title="Open right pane Character Sheet" onClick={() => openCharacterSheet(agent.id)}>キャラシート</button>
                    </div>
                  </div>
                ))}
                {!orgAgents.length ? <div className="empty">No members</div> : null}
              </div>
            </section>
            <section>
              <div className="row-head"><strong>Member edit</strong></div>
              <div className="list">
                <div className="row-head"><strong>Identity Presets</strong></div>
                <label>
                  preset
                  <select value={agentPresetSelectedId} onChange={(e) => setAgentPresetSelectedId(e.target.value)}>
                    {agentPresetItems.map((p) => (
                      <option key={p.preset_set_id} value={p.preset_set_id}>
                        {p.display_name} ({p.preset_set_id})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  scope
                  <select value={agentPresetScope} onChange={(e) => setAgentPresetScope(e.target.value as "council" | "agent")}>
                    <option value="council">Apply to council</option>
                    <option value="agent">Apply to selected agent</option>
                  </select>
                </label>
                <div className="composer-actions">
                  <button type="button" onClick={() => void refreshAgentPresets()}>Reload presets</button>
                  <button type="button" onClick={() => void applyAgentPreset(true)}>Dry-run</button>
                  <button
                    type="button"
                    onClick={() => {
                      const ok = window.confirm(`Apply preset?\nset=${agentPresetSelectedId}\nscope=${agentPresetScope}${agentPresetScope === "agent" ? `\nagent=${selectedAgentId || "-"}` : ""}`);
                      if (!ok) return;
                      void applyAgentPreset(false);
                    }}
                  >
                    Apply
                  </button>
                </div>
                {agentPresetApplyResult ? (
                  <pre className="jsonOutput">{JSON.stringify(agentPresetApplyResult, null, 2)}</pre>
                ) : null}
              </div>
              {selectedAgent ? (
                <>
                  <div><strong>{selectedAgent.icon} {selectedAgent.display_name}</strong></div>
                  <div className="empty">role: {selectedAgent.role}</div>
                  <div className="list">
                    <label>
                      status
                      <select value={agentEditStatus} onChange={(e) => setAgentEditStatus(e.target.value as OrgAgentStatus)}>
                        {ORG_AGENT_STATUS_OPTIONS.map((statusOption) => (
                          <option key={statusOption} value={statusOption}>{statusOption}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      assigned_thread
                      <select value={agentEditThreadId} onChange={(e) => setAgentEditThreadId(e.target.value)}>
                        <option value="none">(none)</option>
                        {threads.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}
                      </select>
                    </label>
                    <label>
                      last_message (read-only)
                      <textarea rows={4} value={selectedAgent.last_message || ""} readOnly />
                    </label>
                  </div>
                  <div className="empty">last_updated_at: {formatTs(selectedAgent.last_updated_at)}</div>
                  <details>
                    <summary>人格</summary>
                    <div className="list">
                      <label>
                        tagline
                        <input value={agentIdentityTagline} onChange={(e) => setAgentIdentityTagline(e.target.value)} />
                      </label>
                      <label>
                        speaking_style
                        <textarea rows={3} value={agentIdentitySpeakingStyle} onChange={(e) => setAgentIdentitySpeakingStyle(e.target.value)} />
                      </label>
                      <label>
                        focus
                        <textarea rows={2} value={agentIdentityFocus} onChange={(e) => setAgentIdentityFocus(e.target.value)} />
                      </label>
                      <label>
                        values (newline, max5)
                        <textarea rows={3} value={agentIdentityValues} onChange={(e) => setAgentIdentityValues(e.target.value)} />
                      </label>
                      <label>
                        strengths (newline, max5)
                        <textarea rows={3} value={agentIdentityStrengths} onChange={(e) => setAgentIdentityStrengths(e.target.value)} />
                      </label>
                      <label>
                        weaknesses (newline, max5)
                        <textarea rows={3} value={agentIdentityWeaknesses} onChange={(e) => setAgentIdentityWeaknesses(e.target.value)} />
                      </label>
                      <label>
                        do (newline, max5)
                        <textarea rows={3} value={agentIdentityDo} onChange={(e) => setAgentIdentityDo(e.target.value)} />
                      </label>
                      <label>
                        dont (newline, max5)
                        <textarea rows={3} value={agentIdentityDont} onChange={(e) => setAgentIdentityDont(e.target.value)} />
                      </label>
                    </div>
                  </details>
                  <details open>
                    <summary>Memory</summary>
                    <div className="memory-tabs">
                      {MEMORY_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          className={`memory-tab ${agentMemoryCategory === cat ? "active" : ""}`}
                          onClick={() => setAgentMemoryCategory(cat)}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    <div className="composer-actions">
                      <button type="button" onClick={() => void refreshAgentMemory()}>Reload memory</button>
                    </div>
                    <div className="list">
                      <label>
                        search
                        <div className="memory-search-row">
                          <input
                            value={agentMemorySearchQuery}
                            onChange={(e) => setAgentMemorySearchQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void searchAgentMemory(); }}
                            placeholder="substring across all agents/categories"
                          />
                          <button type="button" onClick={() => void searchAgentMemory()}>Search</button>
                        </div>
                      </label>
                    </div>
                    {agentMemorySearchHits.length > 0 ? (
                      <div className="list">
                        {agentMemorySearchHits.slice(0, 50).map((hit) => (
                          <button
                            key={`${hit.agent_id}_${hit.category}_${hit.id}`}
                            type="button"
                            className="list-item"
                            onClick={() => {
                              setSelectedAgentId(hit.agent_id);
                              setAgentMemoryCategory(hit.category);
                            }}
                          >
                            <div>{hit.title}</div>
                            <small>{formatTs(hit.ts)} | {hit.agent_id}/{hit.category}</small>
                            <small>{hit.snippet}</small>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {agentMemoryTruncatedNote ? <div className="empty">{agentMemoryTruncatedNote}</div> : null}
                    <div className="list">
                      {agentMemoryItems.map((item) => (
                        <div key={item.id} className="memory-item">
                          <div><strong>{item.title}</strong></div>
                          <small>{formatTs(item.ts)} {item.tags && item.tags.length ? `| tags=${item.tags.join(", ")}` : ""}</small>
                          <div className="memory-snippet">{String(item.body || "").slice(0, 220)}</div>
                        </div>
                      ))}
                      {!agentMemoryItems.length ? <div className="empty">No memory entries</div> : null}
                    </div>
                    <div className="list">
                      <label>
                        title
                        <input value={agentMemoryTitle} onChange={(e) => setAgentMemoryTitle(e.target.value)} />
                      </label>
                      <label>
                        body
                        <textarea rows={4} value={agentMemoryBody} onChange={(e) => setAgentMemoryBody(e.target.value)} />
                      </label>
                      <label>
                        tags (comma, optional)
                        <input value={agentMemoryTags} onChange={(e) => setAgentMemoryTags(e.target.value)} />
                      </label>
                    </div>
                    <div className="composer-actions">
                      <button type="button" onClick={() => void appendAgentMemory(agentMemoryCategory)}>
                        Add to {agentMemoryCategory}
                      </button>
                    </div>
                  </details>
                  <div className="composer-actions">
                    <button type="button" onClick={() => void saveSelectedAgent()}>Save</button>
                  </div>
                </>
              ) : <div className="empty">Select member</div>}
            </section>
          </div>
        )}

        {activeChannel === "activity" && (
          <div className="grid2">
            <section>
              <div className="row-head">
                <strong>Activity</strong>
                <small>{filteredActivity.length} filtered / {activityItems.length} total</small>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void refreshActivity()}>Reload</button>
              </div>
              <div className="list">
                {filteredActivity.map((item) => (
                  <button key={item.id} className="list-item" type="button" onClick={() => openActivityRef(item)}>
                    <div>{item.title}</div>
                    <small>{formatTs(item.ts)} | {item.event_type} | actor={item.actor_id || "-"}</small>
                    <small>{item.summary}</small>
                  </button>
                ))}
                {!filteredActivity.length ? <div className="empty">No activity</div> : null}
              </div>
            </section>
            <section>
              <div className="row-head"><strong>Activity filters</strong></div>
              <div className="list">
                <label>
                  event_type
                  <select value={activityEventTypeFilter} onChange={(e) => setActivityEventTypeFilter(e.target.value)}>
                    <option value="all">all</option>
                    {activityEventTypeOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label>
                  quick search
                  <input value={activitySearch} onChange={(e) => setActivitySearch(e.target.value)} placeholder="title/summary substring" />
                </label>
              </div>
            </section>
          </div>
        )}

        {activeChannel === "settings" && (
          <div className="grid2">
            <section>
              <div className="row-head"><strong>Council Autopilot</strong></div>
              <div className="empty">Start role-turn debate and persist messages to selected thread.</div>
              <div className="list">
                <label>topic<input value={councilTopic} onChange={(e) => setCouncilTopic(e.target.value)} /></label>
                <label>constraints<textarea rows={3} value={councilConstraints} onChange={(e) => setCouncilConstraints(e.target.value)} /></label>
                <label>max_rounds<input value={councilMaxRounds} onChange={(e) => setCouncilMaxRounds(e.target.value)} /></label>
                <label>
                  thread_id
                  <select value={councilThreadId} onChange={(e) => setCouncilThreadId(e.target.value)}>
                    {threads.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}
                  </select>
                </label>
                <label><input type="checkbox" checked={councilAutoBuild} onChange={(e) => setCouncilAutoBuild(e.target.checked)} /> auto_build (safe taskify queue)</label>
                <label><input type="checkbox" checked={councilAutoOpsSnapshot} onChange={(e) => setCouncilAutoOpsSnapshot(e.target.checked)} /> auto_ops_snapshot (recommended)</label>
                <label><input type="checkbox" checked={councilAutoEvidenceBundle} onChange={(e) => setCouncilAutoEvidenceBundle(e.target.checked)} /> auto_evidence_bundle (optional)</label>
                <label><input type="checkbox" checked={councilAutoReleaseBundle} onChange={(e) => setCouncilAutoReleaseBundle(e.target.checked)} /> auto_release_bundle (submission pack)</label>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void startCouncilRun()}>Start</button>
                <button type="button" onClick={() => void cancelCouncilRun()}>Cancel</button>
                <button type="button" onClick={() => void resumeCouncilRun()}>Resume</button>
                <button type="button" onClick={() => void refreshCouncilStatus()}>Status</button>
                <button type="button" onClick={() => openCouncilThreadByKey()}>Open thread</button>
                <button type="button" onClick={() => void copyCouncilThreadKey()}>Copy thread_key</button>
                <button type="button" onClick={() => jumpToThread(councilThreadId || "general")}>Open chat thread</button>
              </div>
              <div className="empty wrapAnywhere">run_id: {councilRunId || "-"}</div>
              <div className="empty wrapAnywhere">thread_key: {councilThreadKey || String(councilStatus?.run?.thread_key || "-")} / source={councilThreadKeySource || String(councilStatus?.run?.thread_key_source || "-")}</div>
              <div className="empty">state: {String(councilStatus?.run?.status || "-")} / can_resume: {councilStatus?.run?.can_resume ? "yes" : "no"}</div>
              <div className="empty">step: {Number(councilStatus?.run?.current_step || 0)} / role: {String(councilStatus?.run?.current_role || "-")} / retries: {Number(councilStatus?.run?.retries || 0)}</div>
              <div className="empty">reflection: {Number(councilStatus?.run?.reflection?.attempts || 0)}/{Number(councilStatus?.run?.reflection?.max_attempts || 1)}</div>
              <div className="empty">finalization: {String(councilStatus?.run?.finalization?.mode || "-")} / version={Number(councilStatus?.run?.finalization?.final_answer_version || 1)}</div>
              <div className="empty">quality: {councilStatus?.run?.quality_check?.passed ? "pass" : "fail"} / failures={Number(councilStatus?.run?.quality_check?.failures?.length || 0)}</div>
              {String(councilStatus?.run?.finalization?.mode || "") === "failed_quality" ? (
                <div className="empty">failure_keys: {(councilStatus?.run?.quality_check?.failures || []).map((x) => x.key).slice(0, 5).join(", ") || "-"}</div>
              ) : null}
              <div className="empty wrapAnywhere">exports.ops_snapshot: {String(councilStatus?.run?.exports?.status?.ops_snapshot || "-")} / request_id={String(councilStatus?.run?.exports?.ops_snapshot_request_id || "-")}</div>
              <div className="empty wrapAnywhere">exports.evidence_bundle: {String(councilStatus?.run?.exports?.status?.evidence_bundle || "-")} / request_id={String(councilStatus?.run?.exports?.evidence_bundle_request_id || "-")}</div>
              <div className="empty wrapAnywhere">exports.release_bundle: {String(councilStatus?.run?.exports?.release_bundle_status || "-")} / request_id={String(councilStatus?.run?.exports?.release_bundle_request_id || "-")}</div>
              {councilStatus?.run?.exports?.release_bundle_run_id ? (
                <button type="button" className="inline-link" onClick={() => jumpToRun(String(councilStatus?.run?.exports?.release_bundle_run_id || ""))}>open release bundle run</button>
              ) : null}
              <div className="empty">#inbox notified by existing export tracking when done</div>
              <div className="empty wrapAnywhere">artifact: {String(councilStatus?.run?.artifact_path || "-")}</div>
              <div className="empty wrapAnywhere">bundle: {String(councilStatus?.run?.bundle_path || "-")}</div>
              <div className="row-head"><strong>Agent Heartbeat</strong></div>
              <div className="empty">v0 manual run + v1 scheduler (max-per-day/lock/backoff)</div>
              <div className="list">
                <label>
                  agent_id
                  <select value={heartbeatAgentId} onChange={(e) => setHeartbeatAgentId(e.target.value)}>
                    <option value="all">all</option>
                    {orgAgents.map((a) => <option key={a.id} value={a.id}>{a.id}</option>)}
                  </select>
                </label>
                <label>
                  category
                  <select value={heartbeatCategory} onChange={(e) => setHeartbeatCategory(e.target.value as MemoryCategory)}>
                    <option value="episodes">episodes</option>
                    <option value="knowledge">knowledge</option>
                    <option value="procedures">procedures</option>
                  </select>
                </label>
                <label>activity_limit<input value={heartbeatActivityLimit} onChange={(e) => setHeartbeatActivityLimit(e.target.value)} /></label>
                <label>inbox_limit<input value={heartbeatInboxLimit} onChange={(e) => setHeartbeatInboxLimit(e.target.value)} /></label>
                <label>runs_limit<input value={heartbeatRunsLimit} onChange={(e) => setHeartbeatRunsLimit(e.target.value)} /></label>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void runHeartbeat(true)}>Dry-run</button>
                <button type="button" onClick={() => void runHeartbeat(false)}>Run heartbeat</button>
                <button type="button" onClick={() => void runHeartbeatNow(true)}>Run now (dry)</button>
                <button type="button" onClick={() => void runHeartbeatNow(false)}>Run now</button>
                <button type="button" onClick={() => void refreshHeartbeatState()}>Refresh state</button>
              </div>
              <div className="row-head"><strong>Heartbeat Schedule</strong></div>
              <div className="list">
                <label><input type="checkbox" checked={heartbeatScheduleEnabled} onChange={(e) => setHeartbeatScheduleEnabled(e.target.checked)} /> enable schedule</label>
                <label>daily_time (HH:mm)<input value={heartbeatDailyTime} onChange={(e) => setHeartbeatDailyTime(e.target.value)} placeholder="09:00" /></label>
                <label>category<select value={heartbeatCategory} onChange={(e) => setHeartbeatCategory(e.target.value as MemoryCategory)}>
                  <option value="episodes">episodes</option>
                  <option value="knowledge">knowledge</option>
                  <option value="procedures">procedures</option>
                </select></label>
                <label>
                  target agents
                  <div className="row">
                    {orgAgents.map((a) => (
                      <label key={`hb_target_${a.id}`} className="row">
                        <input type="checkbox" checked={heartbeatTargetAgents.includes(a.id)} onChange={() => toggleHeartbeatTargetAgent(a.id)} />
                        <span>{a.id}</span>
                      </label>
                    ))}
                  </div>
                </label>
                <label>max_per_day<input value={heartbeatMaxPerDay} onChange={(e) => setHeartbeatMaxPerDay(e.target.value)} /></label>
                <details open={heartbeatAdvancedOpen} onToggle={(e) => setHeartbeatAdvancedOpen((e.target as HTMLDetailsElement).open)}>
                  <summary>Advanced</summary>
                  <div className="list">
                    <label>tick_interval_sec<input value={heartbeatTickSec} onChange={(e) => setHeartbeatTickSec(e.target.value)} /></label>
                    <label>jitter_sec<input value={heartbeatJitterSec} onChange={(e) => setHeartbeatJitterSec(e.target.value)} /></label>
                    <label>backoff_base_sec<input value={heartbeatBackoffBaseSec} onChange={(e) => setHeartbeatBackoffBaseSec(e.target.value)} /></label>
                    <label>backoff_max_sec<input value={heartbeatBackoffMaxSec} onChange={(e) => setHeartbeatBackoffMaxSec(e.target.value)} /></label>
                  </div>
                </details>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void refreshHeartbeatSettings()}>Reload settings</button>
                <button type="button" onClick={() => void saveHeartbeatSettings()}>Save settings</button>
              </div>
              <div className="empty wrapAnywhere">enabled_effective={heartbeatState?.enabled_effective ? "true" : "false"} / next_run_at={String(heartbeatState?.next_run_at || "-")}</div>
              <div className="empty wrapAnywhere">last_tick_at={String(heartbeatState?.last_tick_at || "-")} / lock={heartbeatState?.lock?.held ? "held" : "free"} owner={Number(heartbeatState?.lock?.owner_pid || 0)}</div>
              <div className="row-head"><strong>Auto-accept (v2)</strong></div>
              <div className="empty wrapAnywhere">facilitator + episodes + rank1 only, once/day + cooldown, default OFF</div>
              <div className="list">
                <label><input type="checkbox" checked={heartbeatSuggestAutoAcceptEnabled} onChange={(e) => setHeartbeatSuggestAutoAcceptEnabled(e.target.checked)} /> auto_accept_enabled</label>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void refreshHeartbeatSuggestSettings()}>Refresh auto-accept settings</button>
                <button type="button" onClick={() => void saveHeartbeatSuggestSettings()}>Save auto-accept settings</button>
                <button type="button" onClick={() => void refreshHeartbeatSuggestState()}>Refresh auto-accept state</button>
              </div>
              <div className="empty wrapAnywhere">
                effective={heartbeatSuggestState?.auto_accept_enabled_effective ? "true" : "false"} /
                last_auto_accept_at={String(heartbeatSuggestState?.last_auto_accept_at || "-")} /
                failure_count={Number(heartbeatSuggestState?.failure_count || 0)}
              </div>
              <div className="row-head"><strong>Autopilot Suggestions</strong></div>
              <div className="composer-actions">
                <button type="button" onClick={() => void refreshHeartbeatSuggestions()}>Reload suggestions</button>
              </div>
              <div className="list">
                {heartbeatSuggestions.filter((s) => s.status === "open").slice(0, 20).map((s) => (
                  <div key={s.id} className="memory-item">
                    <div className="wrapAnywhere"><strong>{s.topic}</strong></div>
                    <small>{formatTs(s.ts)} | {s.agent_id}/{s.category} | {s.status}</small>
                    <div className="memory-snippet wrapAnywhere">{s.context}</div>
                    <div className="list">
                      {(Array.isArray(s.candidates) ? s.candidates : []).slice(0, 3).map((c) => (
                        <div key={`${s.id}_cand_${c.rank}`} className={`memory-item ${s.selected_rank === c.rank ? "active" : ""}`}>
                          <div className="wrapAnywhere"><strong>#{c.rank}</strong> {c.topic}</div>
                          <small className="wrapAnywhere">{c.rationale}</small>
                          <small className="wrapAnywhere">
                            profile: {(() => {
                              const p = presetForSuggestionRank(s, c.rank);
                              return p ? `${p.display_name} (${p.preset_set_id})` : "(none)";
                            })()}
                            {presetSourceForSuggestionRank(s, c.rank) === "recommended_profile" ? " / 推奨" : ""}
                          </small>
                          <div className="composer-actions">
                            <button type="button" onClick={() => void acceptHeartbeatSuggestionById(s.id, c.rank)}>Select &amp; Start</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="composer-actions">
                      <button type="button" onClick={() => void acceptHeartbeatSuggestionById(s.id, 1)}>Start default</button>
                      <button type="button" onClick={() => void dismissHeartbeatSuggestionById(s.id)}>Dismiss</button>
                    </div>
                    {selectedHeartbeatSuggestion?.id === s.id && heartbeatSuggestAcceptResult ? (
                      <pre className="jsonOutput">{JSON.stringify(heartbeatSuggestAcceptResult, null, 2)}</pre>
                    ) : null}
                  </div>
                ))}
                {!heartbeatSuggestions.some((s) => s.status === "open") ? <div className="empty">No open suggestions</div> : null}
              </div>
              <div className="row-head"><strong>Night Consolidation</strong></div>
              <div className="empty wrapAnywhere">episodes -> knowledge/procedures (deterministic, append-only)</div>
              <div className="list">
                <label><input type="checkbox" checked={consolidationEnabled} onChange={(e) => setConsolidationEnabled(e.target.checked)} /> enabled</label>
                <label>daily_time (HH:mm)<input value={consolidationDailyTime} onChange={(e) => setConsolidationDailyTime(e.target.value)} placeholder="23:30" /></label>
                <label>
                  target agents
                  <div className="row">
                    {orgAgents.map((a) => (
                      <label key={`cons_target_${a.id}`} className="row">
                        <input type="checkbox" checked={consolidationAgents.includes(a.id)} onChange={() => toggleConsolidationAgent(a.id)} />
                        <span>{a.id}</span>
                      </label>
                    ))}
                  </div>
                </label>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void refreshConsolidationSettings()}>Reload consolidation settings</button>
                <button type="button" onClick={() => void saveConsolidationSettings()}>Save consolidation settings</button>
                <button type="button" onClick={() => void refreshConsolidationState()}>Refresh consolidation state</button>
                <button type="button" onClick={() => void runConsolidationNow(true)}>Consolidation dry-run</button>
                <button type="button" onClick={() => void runConsolidationNow(false)}>Consolidation run_now</button>
              </div>
              <div className="empty wrapAnywhere">
                enabled_effective={consolidationState?.enabled_effective ? "true" : "false"} /
                next_run_at={String(consolidationState?.next_run_at || "-")} /
                failure_count={Number(consolidationState?.failure_count || 0)}
              </div>
              <div className="row-head"><strong>Routines: Morning Brief</strong></div>
              <div className="empty wrapAnywhere">daily routine: heartbeat -> suggest -> autopilot -> brief artifact (safe)</div>
              <div className="list">
                <label><input type="checkbox" checked={morningBriefEnabled} onChange={(e) => setMorningBriefEnabled(e.target.checked)} /> enabled</label>
                <label>daily_time (HH:mm)<input value={morningBriefDailyTime} onChange={(e) => setMorningBriefDailyTime(e.target.value)} placeholder="08:30" /></label>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void refreshMorningBriefSettings()}>Reload morning brief settings</button>
                <button type="button" onClick={() => void saveMorningBriefSettings()}>Save morning brief settings</button>
                <button type="button" onClick={() => void refreshMorningBriefState()}>Refresh morning brief state</button>
                <button type="button" onClick={() => void runMorningBriefNow(true)}>Morning brief dry-run</button>
                <button type="button" onClick={() => void runMorningBriefNow(false)}>Morning brief run_now</button>
              </div>
              <div className="empty wrapAnywhere">
                enabled_effective={morningBriefState?.enabled_effective ? "true" : "false"} /
                next_run_at={String(morningBriefState?.next_run_at || "-")} /
                last_result={String(morningBriefState?.last_result || "-")} /
                last_run={String(morningBriefState?.last_run_at || "-")}
              </div>
              <div className="row-head"><strong>Thread Archive Scheduler</strong></div>
              <div className="empty wrapAnywhere">Non-destructive archive only. inbox.jsonl is never deleted/compacted by scheduler.</div>
              <div className="list">
                <label><input type="checkbox" checked={threadArchiveSchedEnabled} onChange={(e) => setThreadArchiveSchedEnabled(e.target.checked)} /> enabled</label>
                <label>daily_time (HH:mm)<input value={threadArchiveSchedDailyTime} onChange={(e) => setThreadArchiveSchedDailyTime(e.target.value)} placeholder="02:10" /></label>
                <label>thread_keys (one per line)<textarea rows={4} value={threadArchiveSchedThreadKeysText} onChange={(e) => setThreadArchiveSchedThreadKeysText(e.target.value)} /></label>
                <label>max_threads_per_run<input value={threadArchiveSchedMaxThreadsPerRun} onChange={(e) => setThreadArchiveSchedMaxThreadsPerRun(e.target.value)} /></label>
                <label>max_items<input value={threadArchiveSchedMaxItems} onChange={(e) => setThreadArchiveSchedMaxItems(e.target.value)} /></label>
                <label>limit_scan<input value={threadArchiveSchedLimitScan} onChange={(e) => setThreadArchiveSchedLimitScan(e.target.value)} /></label>
                <label>cooldown_sec<input value={threadArchiveSchedCooldownSec} onChange={(e) => setThreadArchiveSchedCooldownSec(e.target.value)} /></label>
                <label>max_per_day<input value={threadArchiveSchedMaxPerDay} onChange={(e) => setThreadArchiveSchedMaxPerDay(e.target.value)} /></label>
                <label><input type="checkbox" checked={threadArchiveSchedAuditSummary} onChange={(e) => setThreadArchiveSchedAuditSummary(e.target.checked)} /> audit_summary</label>
                <label><input type="checkbox" checked={threadArchiveSchedAuditPerThread} onChange={(e) => setThreadArchiveSchedAuditPerThread(e.target.checked)} /> audit_per_thread</label>
                <label>per_thread_timeout_ms<input value={threadArchiveSchedPerThreadTimeoutMs} onChange={(e) => setThreadArchiveSchedPerThreadTimeoutMs(e.target.value)} /></label>
                <label>total_timeout_ms<input value={threadArchiveSchedTotalTimeoutMs} onChange={(e) => setThreadArchiveSchedTotalTimeoutMs(e.target.value)} /></label>
                <label>tail_bytes<input value={threadArchiveSchedTailBytes} onChange={(e) => setThreadArchiveSchedTailBytes(e.target.value)} /></label>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void refreshThreadArchiveSchedulerSettings()}>Reload settings</button>
                <button type="button" onClick={() => void saveThreadArchiveSchedulerSettings()}>Save settings</button>
                <button type="button" onClick={() => void refreshThreadArchiveSchedulerState()}>Refresh state</button>
                <button type="button" onClick={() => void runThreadArchiveSchedulerNow(true)}>Dry-run</button>
                <button type="button" onClick={() => void runThreadArchiveSchedulerNow(false)}>Run now</button>
              </div>
              <div className="empty wrapAnywhere">
                enabled_effective={threadArchiveSchedulerState?.enabled_effective ? "true" : "false"} /
                last_run_at={String(threadArchiveSchedulerState?.last_run_at || "-")} /
                run_count_today={Number(threadArchiveSchedulerState?.run_count_today || 0)} /
                failure_count={Number(threadArchiveSchedulerState?.failure_count || 0)}
              </div>
              <div className="empty wrapAnywhere">last_result_summary={String(threadArchiveSchedulerState?.last_result_summary || "-")}</div>
              <div className="row-head"><strong>Guest Keys</strong></div>
              <div className="empty wrapAnywhere">safe-by-default: join key required / local API only / capped guests</div>
              <div className="list">
                <label>
                  label
                  <input value={guestKeysLabel} onChange={(e) => setGuestKeysLabel(e.target.value)} placeholder="optional label" />
                </label>
                <div className="composer-actions">
                  <button type="button" onClick={() => void refreshGuestKeys()}>Reload keys</button>
                  <button type="button" onClick={() => void createGuestKey()}>Create key</button>
                </div>
                {guestKeys.map((k) => (
                  <div key={k.join_key} className="memory-item">
                    <div className="wrapAnywhere"><strong>{k.label || "(no label)"}</strong></div>
                    <small className="wrapAnywhere">{k.join_key}</small>
                    <small>created: {formatTs(k.created_at)} / revoked: {k.revoked ? "true" : "false"}</small>
                    <div className="composer-actions">
                      <button type="button" onClick={() => { setGuestJoinKeyInput(k.join_key); void navigator.clipboard.writeText(k.join_key); }}>Copy</button>
                      {!k.revoked ? <button type="button" onClick={() => void revokeGuestKey(k.join_key)}>Revoke</button> : null}
                    </div>
                  </div>
                ))}
                {!guestKeys.length ? <div className="empty">No guest keys</div> : null}
              </div>
              <div className="row-head"><strong>Guests</strong></div>
              <div className="list">
                <label>
                  join_key
                  <input value={guestJoinKeyInput} onChange={(e) => setGuestJoinKeyInput(e.target.value)} placeholder="gjk_..." />
                </label>
                <label>
                  guest_id (join)
                  <input value={guestJoinId} onChange={(e) => setGuestJoinId(e.target.value)} placeholder="guest_alpha" />
                </label>
                <label>
                  display_name (join)
                  <input value={guestJoinDisplayName} onChange={(e) => setGuestJoinDisplayName(e.target.value)} placeholder="Guest Alpha" />
                </label>
                <label>
                  guest
                  <select value={selectedGuestId} onChange={(e) => setSelectedGuestId(e.target.value)}>
                    <option value="">(select)</option>
                    {orgGuests.map((g) => <option key={g.id} value={g.id}>{g.display_name} ({g.id})</option>)}
                  </select>
                </label>
                <label>
                  status
                  <select value={guestPushStatus} onChange={(e) => setGuestPushStatus(e.target.value as OrgAgentStatus)}>
                    {GUEST_PUSH_STATUS_OPTIONS.map((statusOption) => <option key={statusOption} value={statusOption}>{statusOption}</option>)}
                  </select>
                </label>
                <label>
                  note
                  <input value={guestPushNote} onChange={(e) => setGuestPushNote(e.target.value)} />
                </label>
                <div className="composer-actions">
                  <button type="button" onClick={() => void refreshOrgGuests()}>Reload guests</button>
                  <button type="button" onClick={() => void guestJoin()}>Join</button>
                  <button type="button" onClick={() => void guestPush()}>Push status</button>
                  <button type="button" onClick={() => void guestLeave()}>Leave</button>
                </div>
                {orgGuests.map((g) => (
                  <div key={`g_${g.id}`} className={`memory-item ${selectedGuestId === g.id ? "active" : ""}`} onClick={() => setSelectedGuestId(g.id)}>
                    <div><strong>{g.display_name}</strong> <span className="dashboard-badge status-warn">Guest</span></div>
                    <small>{g.id} | status={g.status} | last_seen={formatTs(g.last_seen_at)}</small>
                    {g.note ? <div className="memory-snippet">{g.note}</div> : null}
                  </div>
                ))}
                {!orgGuests.length ? <div className="empty">No guests</div> : null}
              </div>

              <div className="row-head"><strong>Desktop Settings</strong></div>
              <div className="empty">Changes are saved immediately. Some desktop shell settings may require restart to take full effect.</div>
              <div className="list">
                <label>api_base_url<input value={desktopSettingsForm.api_base_url} onChange={(e) => setDesktopSettingsForm((p) => ({ ...p, api_base_url: e.target.value }))} /></label>
                <label>poll_interval_ms<input value={desktopSettingsForm.poll_interval_ms} onChange={(e) => setDesktopSettingsForm((p) => ({ ...p, poll_interval_ms: e.target.value }))} /></label>
                <label>throttle_sec<input value={desktopSettingsForm.throttle_sec} onChange={(e) => setDesktopSettingsForm((p) => ({ ...p, throttle_sec: e.target.value }))} /></label>
                <label><input type="checkbox" checked={desktopSettingsForm.mention_enabled} onChange={(e) => setDesktopSettingsForm((p) => ({ ...p, mention_enabled: e.target.checked }))} /> mention.enabled</label>
                <label>mention.tokens (one per line)<textarea rows={5} value={desktopSettingsForm.mention_tokens_lines} onChange={(e) => setDesktopSettingsForm((p) => ({ ...p, mention_tokens_lines: e.target.value }))} /></label>
                <label>mention.aliases (key:value per line)<textarea rows={5} value={desktopSettingsForm.mention_aliases_lines} onChange={(e) => setDesktopSettingsForm((p) => ({ ...p, mention_aliases_lines: e.target.value }))} /></label>
                <label>mention.priority_throttle_sec<input value={desktopSettingsForm.mention_priority_throttle_sec} onChange={(e) => setDesktopSettingsForm((p) => ({ ...p, mention_priority_throttle_sec: e.target.value }))} /></label>
                <label>hotkeys.focus_chatgpt<input value={desktopSettingsForm.hotkey_focus_chatgpt} onChange={(e) => setDesktopSettingsForm((p) => ({ ...p, hotkey_focus_chatgpt: e.target.value }))} /></label>
                <label>hotkeys.send_confirm<input value={desktopSettingsForm.hotkey_send_confirm} onChange={(e) => setDesktopSettingsForm((p) => ({ ...p, hotkey_send_confirm: e.target.value }))} /></label>
                <label>hotkeys.capture_last<input value={desktopSettingsForm.hotkey_capture_last} onChange={(e) => setDesktopSettingsForm((p) => ({ ...p, hotkey_capture_last: e.target.value }))} /></label>
                <label>hotkeys.focus_region<input value={desktopSettingsForm.hotkey_focus_region} onChange={(e) => setDesktopSettingsForm((p) => ({ ...p, hotkey_focus_region: e.target.value }))} /></label>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void loadDesktopSettingsUi()}>Load</button>
                <button type="button" onClick={() => void saveDesktopSettingsUi()}>Save</button>
                <button type="button" onClick={() => void resetDesktopSettingsUi()}>Reset to defaults</button>
              </div>
              <div className="row-head">
                <strong>Evidence Export Bundle</strong>
                <input value={evidenceMaxRuns} onChange={(e) => setEvidenceMaxRuns(e.target.value)} />
              </div>
              <div className="empty">Completion notifications are appended to #inbox (`source=export_evidence_bundle`). Failure uses mention-priority token.</div>
              <div className="list">
                <label><input type="checkbox" checked={evidenceIncludeArchives} onChange={(e) => setEvidenceIncludeArchives(e.target.checked)} /> include desktop/archive</label>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void runEvidenceExport(true)}>Dry-run</button>
                <button type="button" onClick={() => void runEvidenceExport(false)}>Export Evidence Bundle</button>
              </div>
              <div className="row-head">
                <strong>Ops Snapshot</strong>
              </div>
              <div className="empty">Completion notifications are appended to #inbox (`source=export_ops_snapshot`).</div>
              <div className="list">
                <label>inbox_limit<input value={opsSnapshotInboxLimit} onChange={(e) => setOpsSnapshotInboxLimit(e.target.value)} /></label>
                <label>runs_limit<input value={opsSnapshotRunsLimit} onChange={(e) => setOpsSnapshotRunsLimit(e.target.value)} /></label>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void runOpsSnapshot(true)}>Dry-run</button>
                <button type="button" onClick={() => void runOpsSnapshot(false)}>Generate Ops Snapshot</button>
                {opsSnapshotResult?.request_id ? (
                  <button type="button" onClick={() => void refreshOpsSnapshotStatus(String(opsSnapshotResult.request_id || ""))}>Refresh status</button>
                ) : null}
                {opsSnapshotResult?.run_id ? (
                  <button type="button" onClick={() => jumpToRun(String(opsSnapshotResult.run_id || ""))}>Open run</button>
                ) : null}
              </div>
              <div className="row-head">
                <strong>Morning Brief Bundle</strong>
              </div>
              <div className="empty">Creates `bundles/morning_brief_bundle_YYYYMMDD.zip` + manifest and notifies #inbox (`source=export_morning_brief_bundle`).</div>
              <div className="list">
                <label>date (YYYY-MM-DD, optional)<input value={morningBriefBundleDate} onChange={(e) => setMorningBriefBundleDate(e.target.value)} placeholder="today(local)" /></label>
                <label><input type="checkbox" checked={morningBriefBundleIncludeOpsSnapshot} onChange={(e) => setMorningBriefBundleIncludeOpsSnapshot(e.target.checked)} /> include_ops_snapshot</label>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void runMorningBriefBundle(true)}>Dry-run</button>
                <button type="button" onClick={() => void runMorningBriefBundle(false)}>Generate Morning Brief Bundle</button>
                {morningBriefBundleResult?.request_id ? (
                  <button type="button" onClick={() => void refreshMorningBriefBundleStatus(String(morningBriefBundleResult.request_id || ""))}>Refresh status</button>
                ) : null}
                {morningBriefBundleResult?.run_id ? (
                  <button type="button" onClick={() => jumpToRun(String(morningBriefBundleResult.run_id || ""))}>Open run</button>
                ) : null}
              </div>
            </section>
            <section>
              <div className="row-head"><strong>Council status</strong></div>
              <pre className="jsonOutput">{councilStatus ? JSON.stringify(councilStatus, null, 2) : "No council run yet"}</pre>
              <div className="row-head"><strong>notify_state.json (read-only)</strong></div>
              <pre className="jsonOutput">{desktopNotifyState ? JSON.stringify(desktopNotifyState, null, 2) : "No notify state"}</pre>
              <div className="row-head"><strong>Ops Snapshot Result</strong></div>
              <pre className="jsonOutput">{opsSnapshotResult ? JSON.stringify(opsSnapshotResult, null, 2) : "No ops snapshot result"}</pre>
              <div className="row-head"><strong>Heartbeat Result</strong></div>
              <pre className="jsonOutput">{heartbeatResult ? JSON.stringify(heartbeatResult, null, 2) : "No heartbeat result"}</pre>
              <div className="row-head"><strong>Heartbeat Settings</strong></div>
              <pre className="jsonOutput">{heartbeatSettings ? JSON.stringify(heartbeatSettings, null, 2) : "No heartbeat settings"}</pre>
              <div className="row-head"><strong>Heartbeat State</strong></div>
              <pre className="jsonOutput">{heartbeatState ? JSON.stringify(heartbeatState, null, 2) : "No heartbeat state"}</pre>
              <div className="row-head"><strong>Heartbeat Suggest Settings</strong></div>
              <pre className="jsonOutput">{heartbeatSuggestSettings ? JSON.stringify(heartbeatSuggestSettings, null, 2) : "No heartbeat suggest settings"}</pre>
              <div className="row-head"><strong>Heartbeat Suggest State</strong></div>
              <pre className="jsonOutput">{heartbeatSuggestState ? JSON.stringify(heartbeatSuggestState, null, 2) : "No heartbeat suggest state"}</pre>
              <div className="row-head"><strong>Consolidation Settings</strong></div>
              <pre className="jsonOutput">{consolidationSettings ? JSON.stringify(consolidationSettings, null, 2) : "No consolidation settings"}</pre>
              <div className="row-head"><strong>Consolidation State</strong></div>
              <pre className="jsonOutput">{consolidationState ? JSON.stringify(consolidationState, null, 2) : "No consolidation state"}</pre>
              <div className="row-head"><strong>Consolidation Result</strong></div>
              <pre className="jsonOutput">{consolidationResult ? JSON.stringify(consolidationResult, null, 2) : "No consolidation result"}</pre>
              <div className="row-head"><strong>Morning Brief Settings</strong></div>
              <pre className="jsonOutput">{morningBriefSettings ? JSON.stringify(morningBriefSettings, null, 2) : "No morning brief settings"}</pre>
              <div className="row-head"><strong>Morning Brief State</strong></div>
              <pre className="jsonOutput">{morningBriefState ? JSON.stringify(morningBriefState, null, 2) : "No morning brief state"}</pre>
              <div className="row-head"><strong>Morning Brief Result</strong></div>
              <pre className="jsonOutput">{morningBriefResult ? JSON.stringify(morningBriefResult, null, 2) : "No morning brief result"}</pre>
              <div className="row-head"><strong>Morning Brief Bundle Result</strong></div>
              <pre className="jsonOutput">{morningBriefBundleResult ? JSON.stringify(morningBriefBundleResult, null, 2) : "No morning brief bundle result"}</pre>
              <div className="row-head"><strong>Thread Archive Scheduler Settings</strong></div>
              <pre className="jsonOutput">{threadArchiveSchedulerSettings ? JSON.stringify(threadArchiveSchedulerSettings, null, 2) : "No thread archive scheduler settings"}</pre>
              <div className="row-head"><strong>Thread Archive Scheduler State</strong></div>
              <pre className="jsonOutput">{threadArchiveSchedulerState ? JSON.stringify(threadArchiveSchedulerState, null, 2) : "No thread archive scheduler state"}</pre>
              <div className="row-head"><strong>Thread Archive Scheduler Result</strong></div>
              <pre className="jsonOutput">{threadArchiveSchedulerResult ? JSON.stringify(threadArchiveSchedulerResult, null, 2) : "No thread archive scheduler result"}</pre>
            </section>
          </div>
        )}

        {activeChannel === "inbox" && (
          <div className="grid2">
            <section>
              <div className="row-head">
                <strong>Inbox</strong>
                <small>{filteredInbox.length} filtered / {inboxItems.length} total</small>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void refreshInbox()}>Reload</button>
                <button type="button" onClick={() => void markInboxReadForItems(filteredInbox, "current filter")}>Mark read (current filter)</button>
                <button type="button" onClick={() => void markInboxReadForItems(mentionOnlyInbox, "mentions only")}>Mark read (mentions only)</button>
                <button type="button" onClick={() => void markInboxAllRead()}>Mark all read</button>
              </div>
              <div className="row-head">
                <strong>Compact</strong>
                <input value={inboxCompactMaxLines} onChange={(e) => setInboxCompactMaxLines(e.target.value)} />
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void runInboxCompact(true)}>Dry-run</button>
                <button type="button" onClick={() => void runInboxCompact(false)}>Compact now</button>
              </div>
              <div className="list">
                {filteredInbox.map((it) => (
                  <button key={it.id} className="list-item" type="button" onClick={() => openInboxItem(it)}>
                    <div>{it.mention ? "[MENTION] " : ""}{it.title || "(no title)"}</div>
                    <small>{formatTs(it.ts)} | {it.thread_id || "-"} | {it.role || "-"}</small>
                    <small>{(it.body || "").slice(0, 160)}</small>
                  </button>
                ))}
                {!filteredInbox.length ? <div className="empty">No inbox items</div> : null}
              </div>
            </section>
            <section>
              <div className="row-head"><strong>Inbox detail</strong></div>
              {selectedInboxItem ? (
                <>
                  <div><strong>{selectedInboxItem.title || "(no title)"}</strong></div>
                  <div className="empty">{formatTs(selectedInboxItem.ts)} / thread={selectedInboxItem.thread_id || "-"}</div>
                  <div className="empty wrapAnywhere">thread_key={String(selectedInboxItem.thread_key || "-")}</div>
                  {String(selectedInboxItem.source || "") === "council_autopilot_round" ? (
                    <div className="inbox-round-role-body">{selectedInboxItem.body || ""}</div>
                  ) : (
                    <pre className="jsonOutput">{selectedInboxItem.body || ""}</pre>
                  )}
                  <div className="composer-actions">
                    {selectedInboxItem.thread_id ? <button type="button" onClick={() => openInboxItem(selectedInboxItem)}>Open thread</button> : null}
                    {selectedInboxItem.links?.run_id ? <button type="button" onClick={() => jumpToRun(String(selectedInboxItem.links?.run_id || ""))}>Open run</button> : null}
                    {selectedInboxItem.links?.design_id ? <button type="button" onClick={() => jumpToDesign(String(selectedInboxItem.links?.design_id || ""))}>Open design</button> : null}
                    <button type="button" onClick={() => void taskifyFromInbox(selectedInboxItem, false)}>Taskify (draft)</button>
                    <button type="button" onClick={() => void taskifyFromInbox(selectedInboxItem, true)}>Taskify (copy YAML)</button>
                    {selectedInboxItem.thread_key ? <button type="button" onClick={() => void navigator.clipboard.writeText(String(selectedInboxItem.thread_key || ""))}>Copy thread_key</button> : null}
                  </div>
                  <div className="list">
                    <div className="row-head"><strong>Thread view</strong></div>
                    <div className="composer-actions">
                      <button type="button" disabled={!selectedInboxItem.thread_key} onClick={() => void loadInboxThreadView(String(selectedInboxItem.thread_key || ""), 20)}>Show thread (last 20)</button>
                      <button type="button" disabled={!inboxThreadViewKey} onClick={() => void loadInboxThreadView(inboxThreadViewKey, 20)}>Refresh</button>
                      <button type="button" disabled={!inboxThreadViewKey} onClick={() => void markInboxReadForThread(inboxThreadViewKey, inboxThreadViewItems.length)}>Mark read (this thread)</button>
                      <button type="button" disabled={!inboxThreadViewKey} onClick={() => void archiveInboxThread(true)}>Archive this thread (dry-run)</button>
                      <button type="button" disabled={!inboxThreadViewKey} onClick={() => void archiveInboxThread(false)}>Archive this thread</button>
                    </div>
                    <div className="empty wrapAnywhere">key: {inboxThreadViewKey || String(selectedInboxItem.thread_key || "-")} / {inboxThreadViewStatus || "idle"}</div>
                    {inboxThreadArchiveResult ? (
                      <div className="list">
                        <div className="composer-actions">
                          {inboxThreadArchiveResult.archive_path ? (
                            <button type="button" onClick={() => void navigator.clipboard.writeText(String(inboxThreadArchiveResult.archive_path || ""))}>Copy archive_path</button>
                          ) : null}
                        </div>
                        <pre className="jsonOutput">{JSON.stringify(inboxThreadArchiveResult, null, 2)}</pre>
                      </div>
                    ) : null}
                    <div className="list">
                      {inboxThreadViewItems.map((it) => (
                        <button
                          key={`thread_view_${it.id}`}
                          className={`list-item ${selectedInboxItem.id === it.id ? "active" : ""}`}
                          type="button"
                          onClick={() => {
                            const hit = inboxItems.find((x) => x.id === it.id) || it;
                            setSelectedInboxItem(hit);
                          }}
                        >
                          <div>{it.title || "(no title)"}</div>
                          <small>{formatTs(it.ts)} | {it.source || "-"} | {it.thread_key || "-"}</small>
                          {String(it.source || "") === "council_autopilot_round" ? (
                            <div className="inbox-round-role-body thread-item">{String(it.body || "")}</div>
                          ) : (
                            <small>{String(it.body || "").slice(0, 140)}</small>
                          )}
                        </button>
                      ))}
                      {!inboxThreadViewItems.length ? <div className="empty">No thread items loaded</div> : null}
                    </div>
                  </div>
                  {String(selectedInboxItem.source || "") === "heartbeat_suggest" ? (
                    <div className="list">
                      <div className="row-head"><strong>Suggestion</strong></div>
                      <div className="empty wrapAnywhere">suggestion_id: {String(selectedInboxItem.links?.suggestion_id || "-")}</div>
                      {selectedHeartbeatSuggestion ? (
                        <div className="memory-item">
                          <div className="wrapAnywhere"><strong>{selectedHeartbeatSuggestion.topic}</strong></div>
                          <small>{selectedHeartbeatSuggestion.agent_id}/{selectedHeartbeatSuggestion.category} | {selectedHeartbeatSuggestion.status} | selected_rank={String(selectedHeartbeatSuggestion.selected_rank || "-")}</small>
                          <div className="memory-snippet wrapAnywhere">{selectedHeartbeatSuggestion.context}</div>
                          <div className="list">
                            {(Array.isArray(selectedHeartbeatSuggestion.candidates) ? selectedHeartbeatSuggestion.candidates : []).slice(0, 3).map((c) => (
                              <div key={`${selectedHeartbeatSuggestion.id}_detail_${c.rank}`} className={`memory-item ${selectedHeartbeatSuggestion.selected_rank === c.rank ? "active" : ""}`}>
                                <div className="wrapAnywhere"><strong>#{c.rank}</strong> {c.topic}</div>
                                <small className="wrapAnywhere">{c.rationale}</small>
                                <small className="wrapAnywhere">
                                  profile: {(() => {
                                    const p = presetForSuggestionRank(selectedHeartbeatSuggestion, c.rank);
                                    return p ? `${p.display_name} (${p.preset_set_id})` : "(none)";
                                  })()}
                                  {presetSourceForSuggestionRank(selectedHeartbeatSuggestion, c.rank) === "recommended_profile" ? " / 推奨" : ""}
                                </small>
                                <div className="composer-actions">
                                  <button type="button" onClick={() => void acceptHeartbeatSuggestionById(String(selectedInboxItem.links?.suggestion_id || ""), c.rank)}>Select &amp; Start</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="composer-actions">
                        <button type="button" onClick={() => void acceptHeartbeatSuggestionById(String(selectedInboxItem.links?.suggestion_id || ""), 1)}>Start default</button>
                        <button type="button" onClick={() => void dismissHeartbeatSuggestionById(String(selectedInboxItem.links?.suggestion_id || ""))}>Dismiss</button>
                      </div>
                      {heartbeatSuggestAcceptResult ? (
                        <pre className="jsonOutput">{JSON.stringify(heartbeatSuggestAcceptResult, null, 2)}</pre>
                      ) : null}
                    </div>
                  ) : null}
                  {String(selectedInboxItem.source || "").startsWith("ops_auto_stabilize") ? (
                    <div className="list">
                      <div className="row-head"><strong>{String(selectedInboxItem.source || "") === "ops_auto_stabilize_auto_execute" ? "Auto-stabilize auto execute" : "Auto-stabilize suggestion"}</strong></div>
                      <div className="empty wrapAnywhere">source_inbox_id: {String(selectedInboxItem.id || "-")}</div>
                      <div className="composer-actions">
                        <button type="button" onClick={() => void prepareOpsAutoStabilizeExecuteFromInbox(false, selectedInboxItem)}>Stabilize now (safe, no exec)</button>
                        <button type="button" className="dangerAction" onClick={() => void prepareOpsAutoStabilizeExecuteFromInbox(true, selectedInboxItem)}>Stabilize now (safe + run_now)</button>
                        <button type="button" onClick={() => setActiveChannel("dashboard")}>Open #ダッシュボード</button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : <div className="empty">Select inbox item</div>}
            </section>
          </div>
        )}

        {activeChannel === "drafts" && (
          <div className="grid2">
            <section>
              <div className="row-head">
                <strong>Taskify Drafts</strong>
                <small>{taskifyDrafts.length} items</small>
              </div>
              <div className="composer-actions">
                <button type="button" onClick={() => void refreshTaskifyDrafts()}>Reload</button>
              </div>
              <div className="list">
                {taskifyDrafts.map((d) => (
                  <button key={d.id} className={`list-item ${selectedTaskifyDraft?.id === d.id ? "active" : ""}`} type="button" onClick={() => setSelectedTaskifyDraft(d)}>
                    <div>{d.title || d.id}</div>
                    <small>{formatTs(d.ts)} | {d.safe ? "safe" : "unsafe"} | {d.notes || "-"}</small>
                  </button>
                ))}
                {!taskifyDrafts.length ? <div className="empty">No drafts</div> : null}
              </div>
            </section>
            <section>
              <div className="row-head"><strong>Draft detail</strong></div>
              {selectedTaskifyDraft ? (
                <>
                  <div><code>{selectedTaskifyDraft.id}</code></div>
                  <div className="empty">{selectedTaskifyDraft.title}</div>
                  <div className="empty">generated_by: {selectedTaskifyDraft.generated_by || "-"}</div>
                  <div className="empty">safe: {selectedTaskifyDraft.safe ? "yes" : "no"}</div>
                  <div className="empty">tracking: {taskifyTrackingItem ? taskifyTrackingItem.status : "none"}</div>
                  {taskifyTrackingItem?.run_id ? (
                    <button type="button" className="inline-link" onClick={() => jumpToRun(String(taskifyTrackingItem.run_id || ""))}>open tracked run</button>
                  ) : null}
                  {!selectedTaskifyDraft.safe && (selectedTaskifyDraft.unsafe_reasons || []).length > 0 ? (
                    <pre className="jsonOutput">{JSON.stringify(selectedTaskifyDraft.unsafe_reasons, null, 2)}</pre>
                  ) : null}
                  <pre className="jsonOutput">{selectedTaskifyDraft.task_yaml}</pre>
                  <div className="composer-actions">
                    <button type="button" onClick={() => void copyTaskifyYaml(selectedTaskifyDraft.task_yaml)}>Copy YAML</button>
                    {selectedTaskifyDraft.safe ? <button type="button" onClick={() => void queueTaskifyDraft(selectedTaskifyDraft)}>Queue</button> : null}
                    <button type="button" onClick={() => void deleteTaskifyDraft(selectedTaskifyDraft.id)}>Delete</button>
                  </div>
                </>
              ) : <div className="empty">Select draft</div>}
            </section>
          </div>
        )}
        {guardedActionOpen && guardedActionKind ? (
          <div className="confirmOverlay">
            <div className="confirmDialog">
              <div className="row-head"><strong>{guardedActionTitle || "Confirm action"}</strong></div>
              <div className="empty">Preflight and impact scope are shown below. Execute only if expected.</div>
              {guardedActionWarning ? <div className="empty dangerText wrapAnywhere">{guardedActionWarning}</div> : null}
              <pre className="jsonOutput">{JSON.stringify(guardedActionPreflight || {}, null, 2)}</pre>
              <label className="quickExecuteInputLabel">
                Type APPLY to confirm
                <input value={guardedActionPhrase} onChange={(e) => setGuardedActionPhrase(e.target.value)} />
              </label>
              <div className="composer-actions">
                <button
                  type="button"
                  onClick={() => {
                    setGuardedActionOpen(false);
                    setGuardedActionKind("");
                    setGuardedActionPhrase("");
                  }}
                >
                  Cancel
                </button>
                <button type="button" className="dangerAction" disabled={guardedActionPhrase.trim() !== "APPLY"} onClick={() => void executeGuardedActionConfirmed()}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      <aside className="pane pane-right">
        <div className="section-title">Context</div>
        <section className="character-sheet-panel raPanel so-panel">
          <div className="so-header">
            <div>
              <strong>Character Sheet</strong>
              <div className="so-muted">Right pane / StarOffice panel</div>
            </div>
            <div className="composer-actions">
              {characterSheetLastAgentId && !characterSheetAgentId ? (
                <button type="button" title="Reopen last sheet" onClick={() => openCharacterSheet(characterSheetLastAgentId)}>↺</button>
              ) : null}
              {characterSheetAgentId ? (
                <button type="button" title="Edit in members" onClick={() => { setActiveChannel("members"); setSelectedAgentId(characterSheetAgentId); }}>✎</button>
              ) : null}
              {characterSheetAgentId ? <button type="button" title="Close sheet" onClick={() => closeCharacterSheet()}>✕</button> : null}
            </div>
          </div>
          {selectedCharacterSheetAgent ? (
            <div className="character-sheet-body">
              <div className="character-sheet-card so-card">
                <div className="character-sheet-header">
                  <div className="character-sheet-title">{selectedCharacterSheetAgent.icon} {selectedCharacterSheetAgent.display_name}</div>
                  <span className={`workspace-status-badge status-${selectedCharacterSheetAgent.status}`}>{selectedCharacterSheetAgent.status}</span>
                </div>
                <div className="raKvRow">
                  <span className="raKvKey">role</span>
                  <span className="raKvVal raWrapAnywhere">{selectedCharacterSheetAgent.role}</span>
                </div>
                <div className="raKvRow">
                  <span className="raKvKey">thread</span>
                  <code className="raKvVal raMonoBox raWrapAnywhere">{selectedCharacterSheetAgent.assigned_thread_id || "-"}</code>
                </div>
                <div className="raKvRow">
                  <span className="raKvKey">agent_id</span>
                  <code className="raKvVal raMonoBox raWrapAnywhere">{selectedCharacterSheetAgent.id}</code>
                </div>
              </div>

              <div className="character-sheet-card so-card">
                <div className="row-head"><strong>Memory</strong></div>
                <label><input type="checkbox" checked={characterSheetIncludeDerivedMemory} onChange={(e) => setCharacterSheetIncludeDerivedMemory(e.target.checked)} /> include knowledge/procedures</label>
                <div className="composer-actions">
                  <button type="button" onClick={() => void refreshCharacterSheetMemory(selectedCharacterSheetAgent.id)}>Reload</button>
                  <button type="button" onClick={() => openAgentMemory(selectedCharacterSheetAgent.id, "episodes")}>Open Memory</button>
                </div>
                <div className="list">
                  {characterSheetMemoryItems.map((item) => (
                    <div key={`sheet_mem_${item.category}_${item.id}`} className="memory-item">
                      <div className="wrapAnywhere"><strong>{item.title}</strong></div>
                      <small>{formatTs(item.ts)} | {item.category}</small>
                      <div className="memory-snippet raMonoBox raWrapAnywhere">{String(item.body || "").slice(0, 300)}</div>
                    </div>
                  ))}
                  {!characterSheetMemoryItems.length ? <div className="empty">No memory entries</div> : null}
                </div>
              </div>

              <div className="character-sheet-card so-card">
                <div className="row-head"><strong>Tools</strong></div>
                <div className="composer-actions">
                  {selectedCharacterSheetAgent.assigned_thread_id ? (
                    <button type="button" onClick={() => jumpToThread(String(selectedCharacterSheetAgent.assigned_thread_id || ""))}>Go to thread</button>
                  ) : null}
                  {selectedCharacterSheetAgent.thread_key ? (
                    <button type="button" onClick={() => openCharacterSheetInboxThread(selectedCharacterSheetAgent)}>Open #inbox thread</button>
                  ) : null}
                  <button type="button" onClick={() => void runHeartbeat(true, { agentId: selectedCharacterSheetAgent.id, category: "episodes" })}>Heartbeat (dry-run)</button>
                  <button type="button" onClick={() => void runCharacterSheetHeartbeatNow(selectedCharacterSheetAgent.id, false)}>Run now</button>
                </div>
                {heartbeatResult ? <pre className="jsonOutput raMonoBox raWrapAnywhere">{JSON.stringify(heartbeatResult, null, 2)}</pre> : null}
              </div>

              <div className="character-sheet-card so-card">
                <div className="row-head">
                  <strong>Notes</strong>
                  <small>mode={characterSheetActivityStatus}</small>
                </div>
                <ul className="character-sheet-list">
                  {[
                    selectedCharacterSheetAgent.identity?.tagline,
                    selectedCharacterSheetAgent.identity?.focus ? `Focus: ${selectedCharacterSheetAgent.identity?.focus}` : "",
                    selectedCharacterSheetAgent.identity?.speaking_style ? `Style: ${selectedCharacterSheetAgent.identity?.speaking_style}` : "",
                    ...(selectedCharacterSheetAgent.identity?.values || []).map((v) => `Value: ${v}`),
                    ...(selectedCharacterSheetAgent.identity?.strengths || []).map((v) => `Strength: ${v}`),
                    ...(selectedCharacterSheetAgent.identity?.weaknesses || []).map((v) => `Weakness: ${v}`),
                  ].filter((x) => !!String(x || "").trim()).slice(0, 6).map((row, idx) => (
                    <li key={`trait_${idx}`} className="raWrapAnywhere">{String(row || "")}</li>
                  ))}
                </ul>
                <div className="raKvRow">
                  <span className="raKvKey">Active Profile</span>
                  <code className="raKvVal raMonoBox raWrapAnywhere">{selectedCharacterSheetAgent.active_preset_set_id || activeProfileState?.preset_set_id || "-"}</code>
                </div>
                <div className="list">
                  {characterSheetLiveActivity.map((item) => (
                    <div key={`sheet_activity_${item.id}`} className="memory-item">
                      <div className="wrapAnywhere"><strong>{item.title}</strong></div>
                      <small>{formatTs(item.ts)} | {item.event_type}</small>
                      <div className="memory-snippet raMonoBox raWrapAnywhere">{String(item.summary || "").slice(0, 220)}</div>
                    </div>
                  ))}
                  {!characterSheetLiveActivity.length ? <div className="empty">No live activity for this agent yet</div> : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty">Select ステータス from #ワークスペース or #メンバー</div>
          )}
        </section>
        {activeChannel === "inbox" && (
          <section>
            <h4>Inbox Filters</h4>
            <div className="list">
              <label><input type="checkbox" checked={inboxMentionsOnly} onChange={(e) => setInboxMentionsOnly(e.target.checked)} /> mentions only</label>
              <label>
                thread_id
                <select value={inboxThreadFilter} onChange={(e) => setInboxThreadFilter(e.target.value)}>
                  <option value="all">all</option>
                  {inboxThreadOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label>
                thread_key
                <select value={inboxThreadKeyFilter} onChange={(e) => setInboxThreadKeyFilter(e.target.value)}>
                  <option value="all">all</option>
                  {inboxThreadKeyOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label>
                source
                <select value={inboxSourceFilter} onChange={(e) => setInboxSourceFilter(e.target.value)}>
                  <option value="all">all</option>
                  {inboxSourceOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label><input type="checkbox" checked={inboxHasLinksOnly} onChange={(e) => setInboxHasLinksOnly(e.target.checked)} /> has links only</label>
              <label>quick search<input value={inboxFilter} onChange={(e) => setInboxFilter(e.target.value)} placeholder="title/body substring" /></label>
            </div>
          </section>
        )}
        <section>
          <h4>Search Results</h4>
          <div className="list">
            {searchHits.slice(0, 40).map((h, i) => (
              <button
                key={`${h.scope}-${h.msg_id || h.run_id || h.recipe_id || h.design_id || i}`}
                className="list-item"
                type="button"
                onClick={() => {
                  if (h.scope === "message" && h.thread_id) {
                    setActiveChannel(h.thread_id as ChannelId);
                    return;
                  }
                  if (h.scope === "run" && h.run_id) jumpToRun(h.run_id);
                  if (h.scope === "design" && h.design_id) jumpToDesign(h.design_id);
                  if (h.scope === "recipe") setActiveChannel("recipes");
                }}
              >
                <div>{h.scope}</div>
                <small>{h.text || h.run_id || h.recipe_id || h.design_id || ""}</small>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h4>Pins</h4>
          <div className="list">
            {pinnedMessages.map((m) => (
              <button key={m.id} className="list-item" type="button" onClick={() => setSelectedMessage(m)}>
                <div>{m.role}</div>
                <small>{m.text.slice(0, 80)}</small>
              </button>
            ))}
            {!pinnedMessages.length ? <div className="empty">No pins</div> : null}
          </div>
        </section>
        <section>
          <h4>Selected Message</h4>
          {selectedMessage ? (
            <div>
              <div><code>{selectedMessage.id}</code></div>
              <div>role: {selectedMessage.role}</div>
              <div>run: {selectedMessage.links?.run_id || "-"}</div>
              <div>design: {selectedMessage.links?.design_id || "-"}</div>
            </div>
          ) : <div className="empty">No message selected</div>}
        </section>
        <section>
          <h4>Selected Inbox</h4>
          {selectedInboxItem ? (
            <div>
              <div><code>{selectedInboxItem.id}</code></div>
              <div>thread: {selectedInboxItem.thread_id || "-"}</div>
              <div>thread_key: {selectedInboxItem.thread_key || "-"}</div>
              <div>mention: {selectedInboxItem.mention ? "yes" : "no"}</div>
              <div className="composer-actions">
                {selectedInboxItem.links?.run_id ? <button type="button" onClick={() => jumpToRun(String(selectedInboxItem.links?.run_id || ""))}>Open run</button> : null}
                {selectedInboxItem.links?.design_id ? <button type="button" onClick={() => jumpToDesign(String(selectedInboxItem.links?.design_id || ""))}>Open design</button> : null}
              </div>
            </div>
          ) : <div className="empty">No inbox item selected</div>}
        </section>
        <section>
          <h4>Selected Draft</h4>
          {selectedTaskifyDraft ? (
            <div>
              <div><code>{selectedTaskifyDraft.id}</code></div>
              <div>{selectedTaskifyDraft.title}</div>
              <div>safe: {selectedTaskifyDraft.safe ? "yes" : "no"}</div>
              <div>track: {taskifyTrackingItem?.status || "-"}</div>
              <div>source.thread: {selectedTaskifyDraft.source?.thread_id || "-"}</div>
              <div className="composer-actions">
                <button type="button" onClick={() => setActiveChannel("drafts")}>Open drafts</button>
                <button type="button" onClick={() => void copyTaskifyYaml(selectedTaskifyDraft.task_yaml)}>Copy YAML</button>
                {selectedTaskifyDraft.safe ? <button type="button" onClick={() => void queueTaskifyDraft(selectedTaskifyDraft)}>Queue</button> : null}
                {taskifyTrackingItem?.run_id ? <button type="button" onClick={() => jumpToRun(String(taskifyTrackingItem.run_id || ""))}>Open tracked run</button> : null}
              </div>
            </div>
          ) : <div className="empty">No draft selected</div>}
        </section>
        <section>
          <h4>Taskify Queue Result</h4>
          {taskifyQueueResult ? (
            <pre className="jsonOutput">{JSON.stringify(taskifyQueueResult, null, 2)}</pre>
          ) : <div className="empty">No queue run yet</div>}
        </section>
        <section>
          <h4>Inbox Compact Result</h4>
          {inboxCompactResult ? (
            <pre className="jsonOutput">{JSON.stringify(inboxCompactResult, null, 2)}</pre>
          ) : <div className="empty">No compact run yet</div>}
        </section>
        <section>
          <h4>Evidence Export Result</h4>
          {evidenceExportResult ? (
            <pre className="jsonOutput">{JSON.stringify(evidenceExportResult, null, 2)}</pre>
          ) : <div className="empty">No export run yet</div>}
        </section>
        <section>
          <h4>Artifact preview</h4>
          {selectedArtifactPath ? <div><code>{selectedArtifactPath}</code></div> : null}
          {artifactPreview ? <pre className="jsonOutput">{artifactPreview.text}</pre> : <div className="empty">No artifact preview</div>}
        </section>
        <section>
          <h4>ZIP entries</h4>
          {zipEntries ? <pre className="jsonOutput">{JSON.stringify(zipEntries.entries || [], null, 2)}</pre> : <div className="empty">No zip entries</div>}
        </section>
        <section>
          <h4>Clipboard history</h4>
          <div className="list">
            {clipHistory.slice().reverse().map((c) => (
              <button key={c.id} className="list-item" type="button" onClick={() => { setComposerText(String(c.text || "")); setComposerRole(String(c.role || "user")); }}>
                <div>{c.role}</div>
                <small>{formatTs(c.created_at || "")}</small>
              </button>
            ))}
          </div>
        </section>
      </aside>

      {commandPaletteOpen ? (
        <div className="commandPaletteOverlay" onClick={() => setCommandPaletteOpen(false)}>
          <div className="commandPalette" onClick={(e) => e.stopPropagation()}>
            <div className="so-header">
              <strong>Command Palette</strong>
              <span className="so-kbd">Ctrl+K</span>
            </div>
            <input
              ref={commandPaletteInputRef}
              value={commandPaletteQuery}
              placeholder="autopilot / dashboard / workspace / character sheet"
              onChange={(e) => setCommandPaletteQuery(e.target.value)}
            />
            {commandPaletteFavoriteItems.length ? (
              <div className="list">
                <div className="so-muted">Favorites</div>
                {commandPaletteFavoriteItems.map((item, index) => renderCommandPaletteItem(item, "favorite_", String(index + 1) + "."))}
              </div>
            ) : null}
            {commandPaletteRecentItems.length ? (
              <div className="list">
                <div className="so-muted">Recent</div>
                {commandPaletteRecentItems.map((item) => renderCommandPaletteItem(item, "recent_"))}
              </div>
            ) : null}
            <div className="list">
              {commandPaletteFiltered.map((item) => renderCommandPaletteItem(item))}
              {!commandPaletteFavoriteItems.length && !commandPaletteRecentItems.length && !commandPaletteFiltered.length ? <div className="empty">No command matched</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


