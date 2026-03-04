import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import zlib from "node:zlib";
import YAML from "yaml";

type Thread = { id: string; title: string; updated_at: string };
type ChatMessage = {
  id: string;
  thread_id: string;
  role: string;
  kind: string;
  text: string;
  links?: { run_id?: string; design_id?: string; artifact_paths?: string[] };
  created_at: string;
};
type PinState = Record<string, string[]>;
type ReadState = Record<string, { last_read_at?: string; last_seen_msg_id?: string }>;
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
  links?: { run_id?: string; design_id?: string; request_id?: string; artifact_paths?: string[] };
  note?: string;
};
type InboxReadState = {
  global_last_read_ts?: string;
  by_thread?: Record<string, { last_read_ts?: string; last_read_id?: string }>;
  thread_keys?: Record<string, { last_read_ts?: string; last_read_key?: string; read_keys?: string[] }>;
};
type InboxThreadArchiveState = {
  last_archived_ts_by_thread_key?: Record<string, string>;
  last_archived_count_by_thread_key?: Record<string, number>;
  last_run_at?: string;
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
  last_run_at: string | null;
  last_run_local_date: string | null;
  run_count_today: number;
  last_result_ok: boolean;
  last_result_summary: string;
  failure_count: number;
  backoff_ms: number;
  last_error: string;
  last_inbox_id: string | null;
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
};
type TaskifyDraft = {
  id: string;
  ts: string;
  source: { thread_id?: string; msg_id?: string; inbox_id?: string };
  title: string;
  task_yaml: string;
  generated_by?: string;
  notes?: string;
};
type TaskifySafety = {
  safe: boolean;
  reasons: string[];
  details: Record<string, unknown>;
};
type TaskifyQueueTrackingEntry = {
  request_id: string;
  draft_id: string;
  queued_at: string;
  status: "queued" | "started" | "completed" | "failed";
  run_id?: string;
  last_checked_at?: string;
  inbox_notified_at?: string;
  done_at?: string;
  note?: string;
};

type RecipeCatalogItem = {
  id: string;
  file: string;
  title?: string;
  expect?: string;
  uses?: string[];
  notes?: string;
  e2e_guard?: string;
};

type RecipeCatalog = { recipes?: RecipeCatalogItem[] };
type EvidenceExportRequestRecord = {
  request_id: string;
  task_id: string;
  queued_path: string;
  created_at: string;
  max_runs: number;
  include_archives: boolean;
};
type EvidenceExportTrackingEntry = {
  request_id: string;
  queued_at: string;
  status: "queued" | "running" | "completed" | "failed";
  run_id?: string;
  notified: boolean;
  bundle_zip_path?: string;
  bundle_manifest_path?: string;
  task_id?: string;
  last_checked_at?: string;
  notified_at?: string;
};
type OpsSnapshotRequestRecord = {
  request_id: string;
  task_id: string;
  queued_path: string;
  created_at: string;
  inbox_limit: number;
  runs_limit: number;
};
type OpsSnapshotTrackingEntry = {
  request_id: string;
  queued_at: string;
  status: "queued" | "running" | "completed" | "failed";
  run_id?: string;
  notified: boolean;
  snapshot_path?: string;
  note?: string;
  last_checked_at?: string;
  notified_at?: string;
  task_id?: string;
};
type MorningBriefBundleRequestRecord = {
  request_id: string;
  task_id: string;
  queued_path: string;
  created_at: string;
  date: string;
  include_ops_snapshot: boolean;
};
type MorningBriefBundleTrackingEntry = {
  request_id: string;
  queued_at: string;
  status: "queued" | "running" | "success" | "failed";
  run_id?: string;
  notified: boolean;
  zip_path?: string;
  manifest_path?: string;
  task_id?: string;
  date?: string;
  last_checked_at?: string;
  notified_at?: string;
};
type RecommendedProfile = {
  preset_set_id: string;
  display_name: string;
  rationale: string;
  computed_at: string;
  inputs_sample?: Record<string, unknown>;
};
type ActiveProfileState = {
  preset_set_id: string;
  display_name: string;
  applied_at: string;
  applied_by: string;
  reason: string;
  thread_key: string;
  version: 1;
};
type OrgAgentRole = "司会" | "設計担当" | "実装担当" | "検証担当" | "道化師";
type OrgAgentStatus = "idle" | "writing" | "researching" | "executing" | "syncing" | "error";
type OrgAgent = {
  id: string;
  display_name: string;
  role: OrgAgentRole;
  icon: string;
  status: OrgAgentStatus;
  assigned_thread_id: string | null;
  last_message: string | null;
  identity?: {
    tagline: string;
    values: string[];
    speaking_style: string;
    strengths: string[];
    weaknesses: string[];
    do: string[];
    dont: string[];
    focus: string;
  };
  layout?: { x: number; y: number };
  last_updated_at: string;
};
type OrgAgentsSnapshot = {
  version: 1;
  updated_at: string;
  agents: OrgAgent[];
};
type AgentPresetRoleKey = "facilitator" | "critic" | "operator" | "jester";
type AgentPresetRoleSpec = {
  identity_traits: Record<string, unknown>;
};
type AgentPresetSet = {
  preset_set_id: string;
  display_name: string;
  description: string;
  roles: Record<AgentPresetRoleKey, AgentPresetRoleSpec>;
};
type AgentPresetsDoc = {
  version: 1;
  presets: AgentPresetSet[];
};
type ActivityEventType =
  | "agents_updated"
  | "agent_state_changed"
  | "agents_created"
  | "memory_append"
  | "heartbeat"
  | "heartbeat_scheduler"
  | "autopilot_auto_start"
  | "consolidation"
  | "taskify_draft"
  | "taskify_queue"
  | "export_request"
  | "export_done"
  | "ops_snapshot_done"
  | "inbox_append"
  | "guest_joined"
  | "guest_pushed"
  | "guest_left"
  | "council_started"
  | "council_step"
  | "council_finished";
type ActivityEvent = {
  id: string;
  ts: string;
  event_type: ActivityEventType;
  actor_id: string | null;
  title: string;
  summary: string;
  refs: { thread_id?: string; run_id?: string; request_id?: string };
  source: "ui_api";
};
type MemoryCategory = "episodes" | "knowledge" | "procedures";
type MemorySource = "ui" | "autopilot" | "taskify" | "system";
type MemoryEntry = {
  id: string;
  ts: string;
  agent_id: string;
  category: MemoryCategory;
  title: string;
  body: string;
  tags: string[];
  source: MemorySource;
  refs: { thread_id?: string; run_id?: string; request_id?: string };
};
type MemorySearchHit = {
  agent_id: string;
  category: MemoryCategory;
  id: string;
  ts: string;
  title: string;
  snippet: string;
};
type GuestStatus = OrgAgentStatus | "offline";
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
type HeartbeatParams = {
  agent_id: string;
  category: MemoryCategory;
  activity_limit: number;
  inbox_limit: number;
  runs_limit: number;
  dry_run: boolean;
};
type HeartbeatScheduleSettings = {
  mode: "daily_time";
  daily_time: string;
  jitter_sec: number;
  tick_interval_sec: number;
};
type HeartbeatTargetsSettings = {
  agent_ids: string[];
  category: MemoryCategory;
};
type HeartbeatLimitsSettings = {
  max_per_day: number;
  activity_limit: number;
  inbox_limit: number;
  runs_limit: number;
};
type HeartbeatSafetySettings = {
  lock_stale_sec: number;
  global_timeout_sec: number;
  max_consecutive_failures: number;
  backoff_base_sec: number;
  backoff_max_sec: number;
};
type HeartbeatSettings = {
  version: 1;
  enabled: boolean;
  timezone: string;
  schedule: HeartbeatScheduleSettings;
  targets: HeartbeatTargetsSettings;
  limits: HeartbeatLimitsSettings;
  safety: HeartbeatSafetySettings;
};
type HeartbeatPerTargetState = {
  last_run_local_date: string | null;
  run_count_today: number;
  last_ok_at: string | null;
  last_fail_at: string | null;
  failure_count: number;
  backoff_until: string | null;
  last_request_id: string;
  last_result: "ok" | "fail" | "skipped";
  last_note: string;
};
type HeartbeatState = {
  version: 1;
  enabled_effective: boolean;
  last_tick_at: string | null;
  next_run_at: string | null;
  lock: { held: boolean; owner_pid: number; started_at: string | null; note: string };
  per_target: Record<string, HeartbeatPerTargetState>;
};
type HeartbeatLockRecord = {
  owner_pid: number;
  started_at: string;
  purpose: string;
};
type HeartbeatSuggestionStatus = "open" | "accepted" | "dismissed";
type HeartbeatSuggestionRank = 1 | 2 | 3;
type HeartbeatAutopilotSuggestionCandidate = {
  rank: HeartbeatSuggestionRank;
  topic: string;
  context: string;
  rationale: string;
  tags: string[];
};
type HeartbeatSuggestionPresetCandidate = {
  rank: HeartbeatSuggestionRank;
  preset_set_id: string;
  display_name?: string;
  source?: "recommended_profile" | "static";
};
type HeartbeatSuggestionPresetApplyStatus = "not_applied" | "preview_ok" | "applied" | "failed";
type HeartbeatAutopilotSuggestionItem = {
  id: string;
  ts: string;
  local_date: string;
  agent_id: string;
  category: MemoryCategory;
  heartbeat_memory_id: string;
  topic: string;
  context: string;
  candidates: HeartbeatAutopilotSuggestionCandidate[];
  selected_rank: HeartbeatSuggestionRank | null;
  preset_candidates?: HeartbeatSuggestionPresetCandidate[];
  recommended_profile_snapshot?: { preset_set_id: string; display_name: string; rationale: string; computed_at: string };
  selected_preset_set_id?: string | null;
  preset_apply_status?: HeartbeatSuggestionPresetApplyStatus;
  preset_apply_error?: { reason: string; details?: string };
  status: HeartbeatSuggestionStatus;
  accepted_at: string | null;
  dismissed_at: string | null;
  autopilot_run_id: string | null;
};
type HeartbeatAutopilotSuggestionStore = {
  version: 1;
  items: HeartbeatAutopilotSuggestionItem[];
};
type HeartbeatAutopilotSuggestSettings = {
  version: 2;
  auto_accept_enabled: boolean;
  facilitator_only: boolean;
  category_allowlist: MemoryCategory[];
  rank_allowlist: HeartbeatSuggestionRank[];
  max_per_day: number;
  cooldown_sec: number;
  max_consecutive_failures: number;
};
type HeartbeatAutopilotSuggestState = {
  version: 2;
  auto_accept_enabled_effective: boolean;
  last_auto_accept_at: string | null;
  last_auto_accept_local_date: string | null;
  auto_accept_count_today: number;
  failure_count: number;
  last_error: string;
  last_suggestion_id: string | null;
  last_autopilot_run_id: string | null;
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
type ConsolidationPerAgentState = {
  last_run_local_date: string | null;
  last_run_at: string | null;
  last_result: "ok" | "fail" | "skipped";
  last_note: string;
  last_outputs: { knowledge_id: string | null; procedures_id: string | null };
};
type ConsolidationState = {
  version: 1;
  enabled_effective: boolean;
  last_tick_at: string | null;
  next_run_at: string | null;
  failure_count: number;
  backoff_until: string | null;
  per_agent: Record<string, ConsolidationPerAgentState>;
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
  heartbeat: {
    activity_limit: number;
    inbox_limit: number;
    runs_limit: number;
  };
};
type MorningBriefState = {
  version: 1;
  enabled_effective: boolean;
  last_tick_at: string | null;
  next_run_at: string | null;
  last_run_local_date: string | null;
  last_run_at: string | null;
  last_result: "ok" | "fail" | "skipped";
  last_note: string;
  failure_count: number;
  backoff_until: string | null;
  last_heartbeat_request_id: string | null;
  last_suggestion_id: string | null;
  last_autopilot_run_id: string | null;
  last_brief_memory_id: string | null;
  last_brief_written_path: string | null;
};
type OpsAutoStabilizeSettings = {
  version: 1;
  enabled: boolean;
  check_interval_sec: number;
  cooldown_sec: number;
  max_per_day: number;
  mention_on_trigger: boolean;
  auto_execute: {
    enabled: boolean;
    mode: "safe_no_exec";
    confirm_policy: "server_only";
    max_per_day: number;
    cooldown_sec: number;
  };
  trigger_rules: {
    brake_detect: boolean;
    stale_lock_detect: boolean;
    failure_detect: boolean;
  };
  thresholds: {
    failure_count_warn: number;
    stale_lock_sec: number;
  };
  safety: {
    max_consecutive_failures: number;
    lock_stale_sec: number;
  };
};
type OpsAutoStabilizeState = {
  version: 1;
  enabled_effective: boolean;
  last_check_at: string | null;
  last_trigger_at: string | null;
  last_trigger_local_date: string | null;
  trigger_count_today: number;
  failure_count: number;
  last_reason: string;
  last_result_ok: boolean;
  last_result_summary: string;
  last_inbox_id: string | null;
  last_auto_execute_at: string | null;
  auto_execute_count_today: number;
  last_auto_execute_ok: boolean;
  last_auto_execute_note: string;
};
type OpsAutoStabilizeExecuteState = {
  version: 1;
  last_execute_at: string | null;
  last_local_date: string | null;
  execute_count_today: number;
  last_source_inbox_id: string | null;
  executed_source_inbox_ids: string[];
  last_result_ok: boolean;
  last_result_summary: string;
};
type CouncilRunStatus = "queued" | "running" | "completed" | "failed" | "stopped" | "canceled";
type CouncilQualityFailure = { key: string; note: string };
type CouncilQualityCheck = {
  passed: boolean;
  failures: CouncilQualityFailure[];
};
type CouncilReflectionState = {
  attempts: number;
  max_attempts: 1;
  last_reflection_at?: string | null;
};
type CouncilFinalizationState = {
  mode: "normal" | "reflected" | "failed_quality";
  final_answer_version: 1 | 2;
};
type CouncilExportsState = {
  auto_ops_snapshot: boolean;
  auto_evidence_bundle: boolean;
  auto_release_bundle: boolean;
  ops_snapshot_request_id: string | null;
  evidence_bundle_request_id: string | null;
  release_bundle_request_id: string | null;
  release_bundle_status: "disabled" | "queued" | "running" | "done" | "failed";
  release_bundle_run_id: string | null;
  release_bundle_note?: string;
  kicked_at: {
    ops_snapshot?: string;
    evidence_bundle?: string;
    release_bundle?: string;
  };
  status: {
    ops_snapshot?: "disabled" | "queued" | "done" | "failed";
    evidence_bundle?: "disabled" | "queued" | "done" | "failed";
  };
  note?: string;
};
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
  final_message_id?: string;
  taskify_draft_id?: string;
  taskify_request_id?: string;
  artifact_run_id?: string;
  artifact_status?: string;
  artifact_path?: string;
  bundle_path?: string;
  last_error?: string;
  quality_check?: CouncilQualityCheck;
  reflection?: CouncilReflectionState;
  finalization?: CouncilFinalizationState;
  exports?: CouncilExportsState;
  thread_key?: string;
  thread_key_source?: "request_id" | "run_id" | "fallback" | "preview";
};

const API_PORT = Number(process.env.UI_API_PORT || 8787);
const API_HOST = process.env.UI_API_HOST || "127.0.0.1";
const FILE_CAP = 256 * 1024;
const ZIP_ENTRIES_CAP = 5000;
const ZIP_ENTRY_MAX = 512;
const CHAT_LIMIT_MAX = 500;
const CLIPBOARD_MAX = 20;
const INBOX_LIMIT_MAX = 200;
const INBOX_ENTRY_TEXT_MAX = 8 * 1024;
const INBOX_THREAD_KEY_MAX = 80;
const INBOX_THREAD_LIMIT_MAX = 100;
const INBOX_THREAD_KEY_RE = /^[a-z0-9:_-]+$/;
const INBOX_THREAD_READ_SCAN_DEFAULT = 2000;
const INBOX_THREAD_READ_SCAN_MAX = 20000;
const INBOX_THREAD_READ_ITEMS_MAX = 200;
const INBOX_THREAD_ARCHIVE_ITEMS_DEFAULT = 200;
const INBOX_THREAD_ARCHIVE_ITEMS_MAX = 500;
const INBOX_THREAD_ARCHIVE_SCAN_DEFAULT = 5000;
const INBOX_THREAD_ARCHIVE_SCAN_MAX = 50000;
const INBOX_THREAD_ARCHIVE_LINE_BYTES_MAX = 64 * 1024;
const INBOX_THREAD_ARCHIVE_TAIL_BYTES_DEFAULT = 1024 * 1024;
const INBOX_THREAD_ARCHIVE_TAIL_BYTES_MIN = 64 * 1024;
const INBOX_THREAD_ARCHIVE_TAIL_BYTES_MAX = 5 * 1024 * 1024;
const THREAD_ARCHIVE_SCHED_MAX_KEYS = 50;
const THREAD_ARCHIVE_SCHED_MAX_THREADS_PER_RUN_MIN = 1;
const THREAD_ARCHIVE_SCHED_MAX_THREADS_PER_RUN_MAX = 50;
const THREAD_ARCHIVE_SCHED_COOLDOWN_SEC_MIN = 60;
const THREAD_ARCHIVE_SCHED_COOLDOWN_SEC_MAX = 21600;
const THREAD_ARCHIVE_SCHED_MAX_PER_DAY_MIN = 1;
const THREAD_ARCHIVE_SCHED_MAX_PER_DAY_MAX = 10;
const THREAD_ARCHIVE_SCHED_LOCK_STALE_SEC_MIN = 60;
const THREAD_ARCHIVE_SCHED_LOCK_STALE_SEC_MAX = 3600;
const THREAD_ARCHIVE_SCHED_MAX_FAILURES_MIN = 1;
const THREAD_ARCHIVE_SCHED_MAX_FAILURES_MAX = 10;
const THREAD_ARCHIVE_SCHED_PER_THREAD_TIMEOUT_MS_MIN = 500;
const THREAD_ARCHIVE_SCHED_PER_THREAD_TIMEOUT_MS_MAX = 30000;
const THREAD_ARCHIVE_SCHED_TOTAL_TIMEOUT_MS_MIN = 1000;
const THREAD_ARCHIVE_SCHED_TOTAL_TIMEOUT_MS_MAX = 120000;
const THREAD_ARCHIVE_SCHED_BACKOFF_MS_DEFAULT = 5000;
const THREAD_ARCHIVE_SCHED_BACKOFF_MS_MAX = 60000;
const THREAD_ARCHIVE_SCHED_TICK_SEC_DEFAULT = 30;
const TASKIFY_DRAFTS_LIMIT_MAX = 200;
const TASKIFY_TRACKING_LIMIT_MAX = 1000;
const EVIDENCE_EXPORT_TRACKING_LIMIT_MAX = 1000;
const OPS_SNAPSHOT_LIMIT_MAX = 200;
const OPS_SNAPSHOT_TRACKING_LIMIT_MAX = 1000;
const TASKIFY_TRACKER_INTERVAL_MS = 5000;
const EVIDENCE_EXPORT_MAX_RUNS = 50;
const ORG_AGENTS_LIMIT_MAX = 50;
const ACTIVITY_LIMIT_MAX = 200;
const ACTIVITY_TITLE_MAX = 256;
const ACTIVITY_SUMMARY_MAX = 2000;
const ORG_AGENT_TEXT_MAX = 2000;
const ORG_AGENT_IDENTITY_STRING_MAX = 200;
const ORG_AGENT_IDENTITY_STYLE_MAX = 400;
const ORG_AGENT_IDENTITY_LIST_MAX = 5;
const YESTERDAY_MEMO_BODY_MAX = 2 * 1024;
const GUEST_KEYS_MAX = 50;
const GUESTS_MAX = 30;
const GUEST_ID_MAX = 40;
const GUEST_DISPLAY_NAME_MAX = 80;
const GUEST_LABEL_MAX = 60;
const GUEST_NOTE_MAX = 400;
const GUEST_PUSH_MIN_INTERVAL_MS = 1500;
const ORG_PRESET_ROLE_TRAITS_MAX_BYTES = 8 * 1024;
const ORG_PRESET_MAX_DEPTH = 6;
const ORG_PRESET_SET_ALLOWLIST = new Set(["standard", "harsh_critic", "strong_jester", "ops_first", "research_first"]);
const MEMORY_TITLE_MAX = 200;
const MEMORY_BODY_MAX = 4000;
const MEMORY_TAG_MAX = 40;
const MEMORY_TAGS_MAX = 10;
const MEMORY_LIMIT_MAX = 200;
const MEMORY_SEARCH_FILES_LINE_SCAN_MAX = 200;
const MEMORY_SNIPPET_MAX = 260;
const HEARTBEAT_ACTIVITY_LIMIT_DEFAULT = 20;
const HEARTBEAT_INBOX_LIMIT_DEFAULT = 10;
const HEARTBEAT_RUNS_LIMIT_DEFAULT = 10;
const HEARTBEAT_ACTIVITY_LIMIT_MAX = 50;
const HEARTBEAT_INBOX_LIMIT_MAX = 50;
const HEARTBEAT_RUNS_LIMIT_MAX = 20;
const HEARTBEAT_JITTER_SEC_MAX = 300;
const HEARTBEAT_TICK_SEC_MIN = 5;
const HEARTBEAT_TICK_SEC_MAX = 60;
const HEARTBEAT_MAX_PER_DAY_MIN = 1;
const HEARTBEAT_MAX_PER_DAY_MAX = 5;
const HEARTBEAT_LOCK_STALE_SEC_DEFAULT = 600;
const HEARTBEAT_BACKOFF_BASE_DEFAULT = 30;
const HEARTBEAT_BACKOFF_MAX_DEFAULT = 600;
const HEARTBEAT_SUGGESTIONS_LIMIT_MAX = 200;
const HEARTBEAT_SUGGESTION_TOPIC_MAX = 200;
const HEARTBEAT_SUGGESTION_CONTEXT_MAX = 2000;
const HEARTBEAT_SUGGESTION_RATIONALE_MAX = 300;
const HEARTBEAT_SUGGESTION_CANDIDATES_MAX = 3;
const HEARTBEAT_SUGGESTION_PRESET_CANDIDATES_MAX = 3;
const HEARTBEAT_SUGGESTION_TAGS_MAX = 5;
const HEARTBEAT_SUGGESTION_KEYWORDS_MAX = 10;
const HEARTBEAT_SUGGEST_MAX_PER_DAY_MIN = 1;
const HEARTBEAT_SUGGEST_MAX_PER_DAY_MAX = 3;
const HEARTBEAT_SUGGEST_COOLDOWN_SEC_MIN = 60;
const HEARTBEAT_SUGGEST_COOLDOWN_SEC_MAX = 24 * 60 * 60;
const HEARTBEAT_SUGGEST_MAX_FAILURES_MIN = 1;
const HEARTBEAT_SUGGEST_MAX_FAILURES_MAX = 10;
const CONSOLIDATION_TICK_SEC_MIN = 5;
const CONSOLIDATION_TICK_SEC_MAX = 60;
const CONSOLIDATION_JITTER_SEC_MAX = 300;
const CONSOLIDATION_MAX_EPISODES_MAX = 100;
const CONSOLIDATION_MAX_LINES_MAX = 100;
const CONSOLIDATION_MAX_BODY_CHARS_MAX = 4000;
const MORNING_BRIEF_TICK_SEC_MIN = 5;
const MORNING_BRIEF_TICK_SEC_MAX = 60;
const MORNING_BRIEF_JITTER_SEC_MAX = 300;
const ACTIVITY_STREAM_REPLAY_DEFAULT = 20;
const ACTIVITY_STREAM_REPLAY_MAX = 50;
const ACTIVITY_STREAM_SUBSCRIBERS_MAX = 20;
const ACTIVITY_STREAM_HEARTBEAT_MS = 15000;
const COUNCIL_TOPIC_MAX = 2000;
const COUNCIL_CONSTRAINTS_MAX = 4000;
const COUNCIL_MAX_ROUNDS_MAX = 8;
const COUNCIL_RUN_ID_MAX = 160;
const COUNCIL_LOG_LIMIT_MAX = 500;
const COUNCIL_INBOX_ROUND_LOG_CAP = 5;
const COUNCIL_INBOX_BODY_MAX = 4 * 1024;

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");
const WORKSPACE = resolveWorkspaceRoot();
const RUNS_DIR = path.join(WORKSPACE, "runs");
const QUEUE_PENDING_DIR = path.join(WORKSPACE, "queue", "pending");
const UI_DIR = path.join(WORKSPACE, "ui");
const CHAT_DIR = path.join(UI_DIR, "chat");
const DESKTOP_DIR = path.join(UI_DIR, "desktop");
const TASKIFY_DIR = path.join(UI_DIR, "taskify");
const ORG_DIR = path.join(UI_DIR, "org");
const ACTIVITY_DIR = path.join(UI_DIR, "activity");
const MEMORY_DIR = path.join(UI_DIR, "memory");
const HEARTBEAT_DIR = path.join(UI_DIR, "heartbeat");
const CONSOLIDATION_DIR = path.join(UI_DIR, "consolidation");
const ROUTINES_DIR = path.join(UI_DIR, "routines");
const OPS_DIR = path.join(UI_DIR, "ops");
const COUNCIL_DIR = path.join(UI_DIR, "council");
const COUNCIL_RUNS_DIR = path.join(COUNCIL_DIR, "runs");
const COUNCIL_LOGS_DIR = path.join(COUNCIL_DIR, "logs");
const COUNCIL_REQUESTS_DIR = path.join(COUNCIL_DIR, "requests");
const COUNCIL_INBOX_TRACKING_PATH = path.join(COUNCIL_DIR, "inbox_tracking.json");
const DASHBOARD_DIR = path.join(UI_DIR, "dashboard");
const EVIDENCE_EXPORT_REQUESTS_PATH = path.join(UI_DIR, "evidence_export_requests.json");
const EVIDENCE_EXPORT_TRACKING_LEGACY_PATH = path.join(UI_DIR, "export_tracking.json");
const EVIDENCE_EXPORT_TRACKING_PATH = fs.existsSync(EVIDENCE_EXPORT_TRACKING_LEGACY_PATH)
  ? EVIDENCE_EXPORT_TRACKING_LEGACY_PATH
  : path.join(TASKIFY_DIR, "export_tracking.json");
const OPS_SNAPSHOT_REQUESTS_PATH = path.join(UI_DIR, "ops_snapshot_requests.json");
const OPS_SNAPSHOT_TRACKING_PATH = path.join(TASKIFY_DIR, "ops_snapshot_tracking.json");
const TASKIFY_DRAFTS_PATH = path.join(TASKIFY_DIR, "drafts.jsonl");
const ORG_AGENTS_PATH = path.join(ORG_DIR, "agents.json");
const ORG_AGENT_PRESETS_PATH = path.join(ORG_DIR, "agent_presets.json");
const ORG_ACTIVE_PROFILE_PATH = path.join(ORG_DIR, "active_profile.json");
const ORG_REVERT_SUGGEST_STATE_PATH = path.join(ORG_DIR, "revert_suggest_state.json");
const ORG_GUEST_KEYS_PATH = path.join(ORG_DIR, "guest_keys.json");
const ORG_GUESTS_PATH = path.join(ORG_DIR, "guests.json");
const ACTIVITY_PATH = path.join(ACTIVITY_DIR, "activity.jsonl");
const HEARTBEAT_SETTINGS_PATH = path.join(HEARTBEAT_DIR, "heartbeat_settings.json");
const HEARTBEAT_STATE_PATH = path.join(HEARTBEAT_DIR, "heartbeat_state.json");
const HEARTBEAT_LOCK_PATH = path.join(HEARTBEAT_DIR, "heartbeat.lock");
const HEARTBEAT_SUGGESTIONS_PATH = path.join(HEARTBEAT_DIR, "autopilot_suggestions.json");
const HEARTBEAT_SUGGEST_SETTINGS_PATH = path.join(HEARTBEAT_DIR, "autopilot_suggest_settings.json");
const HEARTBEAT_SUGGEST_STATE_PATH = path.join(HEARTBEAT_DIR, "autopilot_suggest_state.json");
const CONSOLIDATION_SETTINGS_PATH = path.join(CONSOLIDATION_DIR, "consolidation_settings.json");
const CONSOLIDATION_STATE_PATH = path.join(CONSOLIDATION_DIR, "consolidation_state.json");
const CONSOLIDATION_LOCK_PATH = path.join(CONSOLIDATION_DIR, "consolidation.lock");
const MORNING_BRIEF_SETTINGS_PATH = path.join(ROUTINES_DIR, "morning_brief_settings.json");
const MORNING_BRIEF_STATE_PATH = path.join(ROUTINES_DIR, "morning_brief_state.json");
const MORNING_BRIEF_LOCK_PATH = path.join(ROUTINES_DIR, "morning_brief.lock");
const MORNING_BRIEF_BUNDLE_REQUESTS_PATH = path.join(ROUTINES_DIR, "morning_brief_bundle_requests.json");
const MORNING_BRIEF_BUNDLE_TRACKING_PATH = path.join(ROUTINES_DIR, "morning_brief_bundle_tracking.json");
const OPS_AUTO_STABILIZE_SETTINGS_PATH = path.join(OPS_DIR, "auto_stabilize_settings.json");
const OPS_AUTO_STABILIZE_STATE_PATH = path.join(OPS_DIR, "auto_stabilize_state.json");
const OPS_AUTO_STABILIZE_LOCK_PATH = path.join(OPS_DIR, "auto_stabilize.lock");
const OPS_AUTO_STABILIZE_EXECUTE_STATE_PATH = path.join(OPS_DIR, "auto_stabilize_execute_state.json");
const TASKIFY_QUEUE_TRACKING_PATH = path.join(TASKIFY_DIR, "queue_tracking.json");
const DESKTOP_SETTINGS_PATH = path.join(DESKTOP_DIR, "desktop_settings.json");
const DESKTOP_NOTIFY_STATE_PATH = path.join(DESKTOP_DIR, "notify_state.json");
const INBOX_PATH = path.join(DESKTOP_DIR, "inbox.jsonl");
const INBOX_READ_STATE_PATH = path.join(DESKTOP_DIR, "inbox_read_state.json");
const INBOX_THREAD_ARCHIVE_DIR = path.join(DESKTOP_DIR, "archive", "threads");
const INBOX_THREAD_ARCHIVE_STATE_PATH = path.join(DESKTOP_DIR, "archive", "thread_archive_state.json");
const THREAD_ARCHIVE_SCHEDULER_SETTINGS_PATH = path.join(DESKTOP_DIR, "archive", "thread_archive_scheduler_settings.json");
const THREAD_ARCHIVE_SCHEDULER_STATE_PATH = path.join(DESKTOP_DIR, "archive", "thread_archive_scheduler_state.json");
const THREAD_ARCHIVE_SCHEDULER_LOCK_PATH = path.join(DESKTOP_DIR, "archive", "thread_archive_scheduler.lock");
const CLIPBOARD_PATH = path.join(UI_DIR, "clipboard.json");
const THREADS_PATH = path.join(CHAT_DIR, "threads.json");
const PINS_PATH = path.join(CHAT_DIR, "pins.json");
const UNREAD_PATH = path.join(CHAT_DIR, "unread.json");
const BOOKMARKS_PATH = path.join(CHAT_DIR, "bookmarks.json");
const RECIPES_SSOT_PATH = path.join(REPO_ROOT, "docs", "recipes_region_ai.json");
const CONTRACT_SSOT_PATH = path.join(REPO_ROOT, "docs", "contract_index_region_ai.json");
const DESIGN_DIR = path.join(REPO_ROOT, "docs", "design");
const DESIGN_LATEST_PATH = path.join(DESIGN_DIR, "LATEST.txt");
const RECIPES_TEMPLATE_DIR = path.join(REPO_ROOT, "templates", "tasks", "recipes");
const WHITEBOARD_PATH = path.join(REPO_ROOT, "docs", "whiteboard_region_ai.md");
const OPS_QUICK_ACTIONS_LOCK_STALE_DEFAULT = 600;
const OPS_QUICK_ACTIONS_CONFIRM_TTL_MS = 60 * 1000;
const OPS_SERVER_CONFIRM_TTL_MS = 10 * 1000;
const DASHBOARD_QUICK_ACTIONS_TIMEOUT_MS = 5000;
const DASHBOARD_QUICK_ACTIONS_EXECUTE_TIMEOUT_MS = 10000;
const DASHBOARD_QUICK_ACTIONS_EXECUTE_CONFIRM = "EXECUTE";
const DASHBOARD_RECOMMENDED_PROFILE_APPLY_CONFIRM = "APPLY";
const DASHBOARD_QUICK_ACTIONS_LAST_PATH = path.join(DASHBOARD_DIR, "quick_actions_last.json");
const DASHBOARD_TRACKER_HISTORY_PATH = path.join(DASHBOARD_DIR, "tracker_history.jsonl");
const DASHBOARD_TRACKER_HISTORY_TAIL_BYTES = 256 * 1024;
const DASHBOARD_TRACKER_HISTORY_LINE_CAP = 64 * 1024;
const DASHBOARD_TRACKER_HISTORY_LIMIT_DEFAULT = 10;
const DASHBOARD_TRACKER_HISTORY_LIMIT_MAX = 50;
let opsQuickActionsConfirm: { token: string; expires_at_ms: number } = { token: "", expires_at_ms: 0 };
let opsServerConfirm: { token: string; expires_at_ms: number } = { token: "", expires_at_ms: 0 };
const guestPushRateLimitByGuestId: Record<string, number> = {};

function resolveWorkspaceRoot(): string {
  const fromEnv = String(process.env.REGION_AI_WORKSPACE || "").trim();
  if (fromEnv) return path.resolve(fromEnv);
  const localAppData = String(process.env.LOCALAPPDATA || "").trim();
  if (localAppData) return path.join(localAppData, "region_ai", "workspace");
  return path.join(os.tmpdir(), "region_ai", "workspace");
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

function ensureDirs(): void {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.mkdirSync(QUEUE_PENDING_DIR, { recursive: true });
  fs.mkdirSync(CHAT_DIR, { recursive: true });
  fs.mkdirSync(DESKTOP_DIR, { recursive: true });
  fs.mkdirSync(TASKIFY_DIR, { recursive: true });
  fs.mkdirSync(ORG_DIR, { recursive: true });
  fs.mkdirSync(ACTIVITY_DIR, { recursive: true });
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.mkdirSync(HEARTBEAT_DIR, { recursive: true });
  fs.mkdirSync(CONSOLIDATION_DIR, { recursive: true });
  fs.mkdirSync(ROUTINES_DIR, { recursive: true });
  fs.mkdirSync(OPS_DIR, { recursive: true });
  fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(INBOX_THREAD_ARCHIVE_STATE_PATH), { recursive: true });
  fs.mkdirSync(COUNCIL_RUNS_DIR, { recursive: true });
  fs.mkdirSync(COUNCIL_LOGS_DIR, { recursive: true });
  fs.mkdirSync(COUNCIL_REQUESTS_DIR, { recursive: true });
  if (!fs.existsSync(THREADS_PATH)) {
    const now = nowIso();
    const defaults: Thread[] = [
      { id: "general", title: "General", updated_at: now },
      { id: "codex", title: "Codex", updated_at: now },
      { id: "chatgpt", title: "ChatGPT", updated_at: now },
      { id: "external", title: "External", updated_at: now },
      { id: "runs", title: "Runs", updated_at: now },
      { id: "recipes", title: "Recipes", updated_at: now },
      { id: "designs", title: "Designs", updated_at: now },
    ];
    writeJson(THREADS_PATH, defaults);
  }
  if (!fs.existsSync(CLIPBOARD_PATH)) {
    writeJson(CLIPBOARD_PATH, { items: [] });
  }
  if (!fs.existsSync(PINS_PATH)) writeJson(PINS_PATH, {});
  if (!fs.existsSync(UNREAD_PATH)) writeJson(UNREAD_PATH, {});
  if (!fs.existsSync(BOOKMARKS_PATH)) writeJson(BOOKMARKS_PATH, {});
  if (!fs.existsSync(INBOX_READ_STATE_PATH)) writeJsonAtomic(INBOX_READ_STATE_PATH, defaultInboxReadState());
}

function clipText(v: unknown, cap: number): string {
  const s = String(v || "");
  return s.length > cap ? s.slice(0, cap) : s;
}

function containsCodeBlock(text: string): boolean {
  return /```[\s\S]*?```/.test(text);
}

function cleanTaskifySource(input: unknown): TaskifyDraft["source"] {
  if (!isRecord(input)) return {};
  return {
    thread_id: clipText(input.thread_id, 120),
    msg_id: clipText(input.msg_id, 120),
    inbox_id: clipText(input.inbox_id, 120),
  };
}

function cleanLinks(input: unknown): { run_id?: string; design_id?: string; artifact_paths?: string[] } {
  const linksInput = isRecord(input) ? input : {};
  return {
    run_id: clipText(linksInput.run_id, 120),
    design_id: clipText(linksInput.design_id, 120),
    artifact_paths: Array.isArray(linksInput.artifact_paths) ? linksInput.artifact_paths.map((x) => clipText(x, 240)).slice(0, 20) : [],
  };
}

function makeTaskifyTitle(inputTitle: unknown, text: string): string {
  const explicit = clipText(inputTitle, 160).trim();
  if (explicit) return explicit;
  const line = String(text || "").replace(/\s+/g, " ").trim();
  if (!line) return "Taskify draft";
  return clipText(line, 80);
}

function toSafeRelPath(id: string, ext: "md" | "json"): string {
  const safeId = String(id || "").replace(/[^A-Za-z0-9_.-]/g, "_");
  return `taskify/${safeId}.${ext}`;
}

function buildTaskifyTaskYaml(input: { id: string; title: string; text: string; source: TaskifyDraft["source"]; links: { run_id?: string; design_id?: string; artifact_paths?: string[] } }): { task_yaml: string; notes: string; generated_by: string } {
  const created = nowIso();
  const runId = String(input.links.run_id || "").trim();
  const text = clipText(input.text, 12000);
  const hasCode = containsCodeBlock(text);
  const taskId = `task_taskify_${String(input.id || "").replace(/[^A-Za-z0-9_.-]/g, "_")}`;

  let relPath = "";
  let fileText = "";
  let notes = "";
  const acceptance: any[] = [];
  if (runId) {
    relPath = toSafeRelPath(input.id, "md");
    fileText = [
      "# Review Run Result",
      "",
      `- run_id: ${runId}`,
      `- source_thread: ${input.source.thread_id || ""}`,
      `- source_msg_id: ${input.source.msg_id || ""}`,
      `- source_inbox_id: ${input.source.inbox_id || ""}`,
      "",
      "## Checklist",
      "- [ ] verify outcome.summary",
      "- [ ] verify acceptance details",
      "- [ ] capture follow-up actions",
    ].join("\n");
    notes = "template=review_run";
    acceptance.push({ type: "artifact_file_contains", path: `written/${relPath}`, contains: runId });
  } else if (hasCode) {
    relPath = toSafeRelPath(input.id, "json");
    const payload = {
      generated_by: "taskify_v1_safe",
      template: "code_block",
      source: input.source,
      title: input.title,
      text_excerpt: clipText(text, 3000),
    };
    fileText = JSON.stringify(payload, null, 2) + "\n";
    notes = "template=code_block";
    acceptance.push({ type: "artifact_file_contains", path: `written/${relPath}`, contains: "\"generated_by\": \"taskify_v1_safe\"" });
    acceptance.push({ type: "artifact_json_pointer_exists", path: `written/${relPath}`, pointer: "/source/thread_id" });
  } else {
    relPath = toSafeRelPath(input.id, "md");
    fileText = [
      "# Taskify Note",
      "",
      `title: ${input.title}`,
      `thread_id: ${input.source.thread_id || ""}`,
      `msg_id: ${input.source.msg_id || ""}`,
      `inbox_id: ${input.source.inbox_id || ""}`,
      "",
      text || "(empty)",
    ].join("\n");
    notes = "template=note";
    acceptance.push({ type: "artifact_file_contains", path: `written/${relPath}`, contains: "Taskify Note" });
  }
  acceptance.unshift({ type: "artifact_exists", path: `written/${relPath}` });

  const doc = {
    apiVersion: "v1",
    kind: "pipeline",
    metadata: {
      id: taskId,
      role: "implementer",
      assignee: "implementer_01",
      created_at: created,
      title: `Taskify: ${clipText(input.title, 120)}`,
      category: "implementer",
      tags: ["taskify", "taskify_v1_safe"],
    },
    artifact: { mirror_run_meta: true },
    runtime: { timeout_ms: 30000, timeout_expected: false },
    steps: [
      {
        id: "step1_file_write",
        task: {
          kind: "file_write",
          files: [{ path: relPath, text: fileText, mode: "overwrite" }],
        },
      },
    ],
    acceptance,
  };
  return { task_yaml: YAML.stringify(doc), notes, generated_by: "taskify_v1_safe" };
}

function appendJsonlAtomic(p: string, line: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const raw = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, raw + line, "utf8");
  fs.renameSync(tmp, p);
}

const activitySubscribers = new Set<http.ServerResponse>();
let activityHeartbeatTimer: NodeJS.Timeout | null = null;

function formatSseEvent(eventName: string, payload: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function ensureActivityHeartbeat(): void {
  if (activityHeartbeatTimer) return;
  activityHeartbeatTimer = setInterval(() => {
    for (const res of Array.from(activitySubscribers)) {
      try {
        res.write(": ping\n\n");
      } catch {
        activitySubscribers.delete(res);
      }
    }
    if (activitySubscribers.size === 0 && activityHeartbeatTimer) {
      clearInterval(activityHeartbeatTimer);
      activityHeartbeatTimer = null;
    }
  }, ACTIVITY_STREAM_HEARTBEAT_MS);
  if (activityHeartbeatTimer && typeof activityHeartbeatTimer.unref === "function") activityHeartbeatTimer.unref();
}

function broadcastActivityEvent(event: ActivityEvent): void {
  const payload = sanitizeActivityEvent(event) || event;
  const chunk = formatSseEvent("activity", payload);
  for (const res of Array.from(activitySubscribers)) {
    try {
      res.write(chunk);
    } catch {
      activitySubscribers.delete(res);
    }
  }
}

function registerActivitySubscriber(req: http.IncomingMessage, res: http.ServerResponse, replayLimitInput: number): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(formatSseEvent("hello", { ts: nowIso(), version: 1 }));

  const replayLimit = Math.max(1, Math.min(Number(replayLimitInput || ACTIVITY_STREAM_REPLAY_DEFAULT), ACTIVITY_STREAM_REPLAY_MAX));
  const replay = readActivityEvents(replayLimit, { ts: "", id: "" }).items.slice().reverse();
  for (const item of replay) {
    try {
      res.write(formatSseEvent("activity", item));
    } catch {
      return;
    }
  }

  if (activitySubscribers.size >= ACTIVITY_STREAM_SUBSCRIBERS_MAX) {
    try {
      res.write(formatSseEvent("error", { reason: "subscriber_limit_reached" }));
    } catch {
      // best-effort only
    }
    res.end();
    return;
  }
  activitySubscribers.add(res);
  ensureActivityHeartbeat();

  const cleanup = () => {
    activitySubscribers.delete(res);
    if (activitySubscribers.size === 0 && activityHeartbeatTimer) {
      clearInterval(activityHeartbeatTimer);
      activityHeartbeatTimer = null;
    }
  };
  req.on("close", cleanup);
  req.on("aborted", cleanup);
  res.on("close", cleanup);
  res.on("error", cleanup);
}

function defaultOrgAgentsSnapshot(): OrgAgentsSnapshot {
  const now = nowIso();
  const agents: OrgAgent[] = [
    {
      id: "facilitator",
      display_name: "司会",
      role: "司会",
      icon: "🎙️",
      status: "idle",
      assigned_thread_id: null,
      last_message: null,
      identity: {
        tagline: "議論を前に進める進行役",
        values: ["合意形成", "時間厳守"],
        speaking_style: "簡潔で丁寧、要点先行",
        strengths: ["整理", "論点抽出"],
        weaknesses: ["細部実装の深掘り"],
        do: ["論点の明確化", "決定事項の確定"],
        dont: ["脱線の放置", "曖昧な締め"],
        focus: "決定事項と次アクションの明確化",
      },
      last_updated_at: now,
    },
    {
      id: "designer",
      display_name: "設計担当",
      role: "設計担当",
      icon: "🧭",
      status: "idle",
      assigned_thread_id: null,
      last_message: null,
      identity: {
        tagline: "構造と整合性を守る設計役",
        values: ["一貫性", "保守性"],
        speaking_style: "理由とトレードオフを明示",
        strengths: ["設計分解", "境界定義"],
        weaknesses: ["短期最適の判断"],
        do: ["前提整理", "設計判断の根拠提示"],
        dont: ["根拠のない主張", "責務混在"],
        focus: "拡張容易性と依存関係の健全性",
      },
      last_updated_at: now,
    },
    {
      id: "implementer",
      display_name: "実装担当",
      role: "実装担当",
      icon: "🛠️",
      status: "idle",
      assigned_thread_id: null,
      last_message: null,
      identity: {
        tagline: "動く成果物を仕上げる実装役",
        values: ["実行可能性", "安全性"],
        speaking_style: "具体的で手順中心",
        strengths: ["実装速度", "不具合修正"],
        weaknesses: ["抽象議論の長期化"],
        do: ["最小変更で実装", "検証可能な出力"],
        dont: ["破壊的変更", "未検証の断言"],
        focus: "実装完了までの最短経路",
      },
      last_updated_at: now,
    },
    {
      id: "verifier",
      display_name: "検証担当",
      role: "検証担当",
      icon: "✅",
      status: "idle",
      assigned_thread_id: null,
      last_message: null,
      identity: {
        tagline: "品質と再現性を担保する検証役",
        values: ["再現性", "網羅性"],
        speaking_style: "客観的でチェックリスト志向",
        strengths: ["検証設計", "回帰検知"],
        weaknesses: ["仕様変更の主導"],
        do: ["失敗条件の明示", "証跡確認"],
        dont: ["推測での合格判定", "曖昧な結果"],
        focus: "DoD達成と証跡の明確化",
      },
      last_updated_at: now,
    },
    {
      id: "joker",
      display_name: "道化師（ツッコミ役）",
      role: "道化師",
      icon: "🤡",
      status: "idle",
      assigned_thread_id: null,
      last_message: null,
      identity: {
        tagline: "盲点を突いて事故を防ぐツッコミ役",
        values: ["現実性", "リスク意識"],
        speaking_style: "軽妙だが要点は鋭く",
        strengths: ["リスク検知", "矛盾指摘"],
        weaknesses: ["長文ドキュメント作成"],
        do: ["地雷ワードの指摘", "見落とし警告"],
        dont: ["人格攻撃", "根拠のない煽り"],
        focus: "失敗シナリオの先回り",
      },
      last_updated_at: now,
    },
  ];
  return { version: 1, updated_at: now, agents };
}

function isOrgAgentRole(v: unknown): v is OrgAgentRole {
  return v === "司会" || v === "設計担当" || v === "実装担当" || v === "検証担当" || v === "道化師";
}

function isOrgAgentStatus(v: unknown): v is OrgAgentStatus {
  return v === "idle" || v === "writing" || v === "researching" || v === "executing" || v === "syncing" || v === "error";
}

function isActivityEventType(v: unknown): v is ActivityEventType {
  return v === "agents_updated"
    || v === "agent_state_changed"
    || v === "agents_created"
    || v === "memory_append"
    || v === "heartbeat"
    || v === "heartbeat_scheduler"
    || v === "autopilot_auto_start"
    || v === "consolidation"
    || v === "taskify_draft"
    || v === "taskify_queue"
    || v === "export_request"
    || v === "export_done"
    || v === "ops_snapshot_done"
    || v === "inbox_append"
    || v === "guest_joined"
    || v === "guest_pushed"
    || v === "guest_left"
    || v === "council_started"
    || v === "council_step"
    || v === "council_finished";
}

function sanitizeIdentityString(v: unknown, cap: number): string {
  return clipText(v, cap).trim();
}

function sanitizeIdentityList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const row of v) {
    const s = sanitizeIdentityString(row, ORG_AGENT_IDENTITY_STRING_MAX);
    if (!s) continue;
    out.push(s);
    if (out.length >= ORG_AGENT_IDENTITY_LIST_MAX) break;
  }
  return out;
}

function sanitizeOrgAgentIdentity(input: unknown): OrgAgent["identity"] | undefined {
  if (!isRecord(input)) return undefined;
  const tagline = sanitizeIdentityString(input.tagline, ORG_AGENT_IDENTITY_STRING_MAX);
  const speaking_style = sanitizeIdentityString(input.speaking_style, ORG_AGENT_IDENTITY_STYLE_MAX);
  const focus = sanitizeIdentityString(input.focus, ORG_AGENT_IDENTITY_STYLE_MAX);
  const values = sanitizeIdentityList(input.values);
  const strengths = sanitizeIdentityList(input.strengths);
  const weaknesses = sanitizeIdentityList(input.weaknesses);
  const dos = sanitizeIdentityList(input.do);
  const dont = sanitizeIdentityList(input.dont);
  if (!tagline && !speaking_style && !focus && values.length < 1 && strengths.length < 1 && weaknesses.length < 1 && dos.length < 1 && dont.length < 1) {
    return undefined;
  }
  return {
    tagline,
    values,
    speaking_style,
    strengths,
    weaknesses,
    do: dos,
    dont,
    focus,
  };
}

function sanitizeOrgAgent(input: unknown): OrgAgent | null {
  if (!isRecord(input)) return null;
  const id = clipText(input.id, 80).trim();
  const display_name = clipText(input.display_name, 120).trim();
  const icon = clipText(input.icon, 32);
  const role = input.role;
  const status = input.status;
  const assigned_thread_id = input.assigned_thread_id === null || input.assigned_thread_id === undefined ? null : clipText(input.assigned_thread_id, 120).trim();
  const last_message = input.last_message === null || input.last_message === undefined ? null : clipText(input.last_message, ORG_AGENT_TEXT_MAX);
  const identity = sanitizeOrgAgentIdentity(input.identity);
  let layout: { x: number; y: number } | undefined;
  if (input.layout !== undefined && input.layout !== null && isRecord(input.layout)) {
    const x = Number(input.layout.x);
    const y = Number(input.layout.y);
    if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      layout = { x, y };
    }
  }
  const last_updated_at = clipText(input.last_updated_at, 80).trim();
  if (!id || !display_name || !icon || !last_updated_at) return null;
  if (!isOrgAgentRole(role)) return null;
  if (!isOrgAgentStatus(status)) return null;
  return { id, display_name, role, icon, status, assigned_thread_id, last_message, identity, layout, last_updated_at };
}

function sanitizeOrgAgentsSnapshot(input: unknown): OrgAgentsSnapshot | null {
  if (!isRecord(input)) return null;
  const version = Number(input.version || 0);
  const updated_at = clipText(input.updated_at, 80).trim();
  const agentsInput = Array.isArray(input.agents) ? input.agents : [];
  if (version !== 1 || !updated_at) return null;
  const agents: OrgAgent[] = [];
  const seen = new Set<string>();
  for (const row of agentsInput) {
    const agent = sanitizeOrgAgent(row);
    if (!agent || seen.has(agent.id)) continue;
    seen.add(agent.id);
    agents.push(agent);
    if (agents.length >= ORG_AGENTS_LIMIT_MAX) break;
  }
  return { version: 1, updated_at, agents };
}

function loadOrgAgentsSnapshot(): { snapshot: OrgAgentsSnapshot; created: boolean } {
  const defaults = defaultOrgAgentsSnapshot();
  if (!fs.existsSync(ORG_AGENTS_PATH)) {
    writeJsonAtomic(ORG_AGENTS_PATH, defaults);
    return { snapshot: defaults, created: true };
  }
  const raw = readJson<unknown>(ORG_AGENTS_PATH, defaults);
  const sanitized = sanitizeOrgAgentsSnapshot(raw);
  if (!sanitized || !sanitized.agents.length) {
    writeJsonAtomic(ORG_AGENTS_PATH, defaults);
    return { snapshot: defaults, created: true };
  }
  const requiredIds = new Set(defaults.agents.map((a) => a.id));
  const byId = new Map<string, OrgAgent>();
  for (const row of sanitized.agents.slice(0, ORG_AGENTS_LIMIT_MAX)) byId.set(row.id, row);
  let addedMissing = false;
  for (const req of defaults.agents) {
    if (requiredIds.has(req.id) && !byId.has(req.id)) {
      byId.set(req.id, req);
      addedMissing = true;
    }
  }
  const next: OrgAgentsSnapshot = {
    version: 1,
    updated_at: sanitized.updated_at || nowIso(),
    agents: Array.from(byId.values()).slice(0, ORG_AGENTS_LIMIT_MAX),
  };
  if (!next.agents.some((a) => a.id === "facilitator")) {
    const now = nowIso();
    const fallbackFacilitator: OrgAgent = {
      id: "facilitator",
      display_name: "司会",
      role: "司会",
      icon: "🎙️",
      status: "idle",
      assigned_thread_id: null,
      last_message: null,
      last_updated_at: now,
    };
    next.agents = [fallbackFacilitator, ...next.agents].slice(0, ORG_AGENTS_LIMIT_MAX);
    addedMissing = true;
  }
  if (addedMissing) {
    next.updated_at = nowIso();
    writeJsonAtomic(ORG_AGENTS_PATH, next);
  }
  return { snapshot: next, created: false };
}

function defaultAgentPresetsDoc(): AgentPresetsDoc {
  const mkRole = (input: Record<string, unknown>): AgentPresetRoleSpec => ({ identity_traits: input });
  return {
    version: 1,
    presets: [
      {
        preset_set_id: "standard",
        display_name: "標準",
        description: "バランス重視の標準セット",
        roles: {
          facilitator: mkRole({ speaking_style: "簡潔で丁寧、要点先行", values: ["合意形成", "時間厳守"], focus: "目的/DoD/安全装置" }),
          critic: mkRole({ speaking_style: "反例ベースで辛口", values: ["一貫性", "再現性"], focus: "失敗モード抽出" }),
          operator: mkRole({ speaking_style: "具体的で手順中心", values: ["実行可能性", "安全性"], focus: "最小差分と検証" }),
          jester: mkRole({ speaking_style: "軽妙だが鋭い", values: ["現実性", "盲点発見"], focus: "前提崩しと見落とし" }),
        },
      },
      {
        preset_set_id: "harsh_critic",
        display_name: "辛口批判強め",
        description: "批判役のリスク指摘を強める",
        roles: {
          facilitator: mkRole({ focus: "論点固定と意思決定速度", speaking_style: "中立・短文" }),
          critic: mkRole({ speaking_style: "厳密・辛口", values: ["反証優先", "悲観テスト"], strengths: ["反例3件提示", "失敗再現条件の明示"] }),
          operator: mkRole({ focus: "rollback可能な段階実装", do: ["証拠付きで進捗提示"] }),
          jester: mkRole({ focus: "都合の良い仮定を崩す", dont: ["無根拠な楽観"] }),
        },
      },
      {
        preset_set_id: "strong_jester",
        display_name: "道化師強め",
        description: "前提崩しと見落とし検知を強める",
        roles: {
          facilitator: mkRole({ focus: "議論の脱線防止", values: ["目的回帰"] }),
          critic: mkRole({ focus: "検証可能なリスク列挙" }),
          operator: mkRole({ focus: "実装影響の最小化" }),
          jester: mkRole({ speaking_style: "皮肉混じりで要点鋭く", strengths: ["前提崩し", "うっかり検知"], values: ["想定外歓迎", "逆張り検査"] }),
        },
      },
      {
        preset_set_id: "ops_first",
        display_name: "実務優先",
        description: "実行計画と手順の具体性を最優先",
        roles: {
          facilitator: mkRole({ focus: "今日やることを確定", values: ["締切順守"] }),
          critic: mkRole({ focus: "運用事故の予防", values: ["可観測性", "復旧性"] }),
          operator: mkRole({ speaking_style: "手順・コマンド中心", values: ["手戻り最小", "検証先行"], do: ["smoke->build->gate順を維持"] }),
          jester: mkRole({ focus: "運用で破綻する仮定を突く" }),
        },
      },
      {
        preset_set_id: "research_first",
        display_name: "研究寄り",
        description: "背景検討と仮説比較を重視",
        roles: {
          facilitator: mkRole({ focus: "論点整理と仮説比較", speaking_style: "丁寧で構造化" }),
          critic: mkRole({ values: ["検証可能性", "外部妥当性"], focus: "反証可能性の担保" }),
          operator: mkRole({ focus: "再現可能な実験手順", strengths: ["前提と結果の対応付け"] }),
          jester: mkRole({ focus: "暗黙前提の言語化", values: ["逆仮説"] }),
        },
      },
    ],
  };
}

function validatePresetIdentityTraitsObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("org_agent_presets.identity_traits_invalid");
  const maxDepth = ORG_PRESET_MAX_DEPTH;
  const walk = (node: unknown, depth: number): unknown => {
    if (depth > maxDepth) throw new Error("org_agent_presets.identity_traits_depth_too_deep");
    if (node === null || node === undefined) return "";
    if (typeof node === "string") return clipText(node, ORG_AGENT_IDENTITY_STYLE_MAX);
    if (typeof node === "number" || typeof node === "boolean") return node;
    if (Array.isArray(node)) return node.slice(0, ORG_AGENT_IDENTITY_LIST_MAX).map((x) => walk(x, depth + 1));
    if (isRecord(node)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        out[clipText(k, 64)] = walk(v, depth + 1);
      }
      return out;
    }
    return clipText(String(node), ORG_AGENT_IDENTITY_STYLE_MAX);
  };
  const sanitized = walk(value, 0);
  if (!isRecord(sanitized)) throw new Error("org_agent_presets.identity_traits_invalid");
  const bytes = Buffer.byteLength(JSON.stringify(sanitized), "utf8");
  if (bytes > ORG_PRESET_ROLE_TRAITS_MAX_BYTES) throw new Error("org_agent_presets.identity_traits_too_large");
  return sanitized;
}

function sanitizeAgentPresetSet(input: unknown): AgentPresetSet | null {
  if (!isRecord(input)) return null;
  const preset_set_id = clipText(input.preset_set_id, 80).trim().toLowerCase();
  const display_name = clipText(input.display_name, 120).trim();
  const description = clipText(input.description, 300).trim();
  if (!preset_set_id || !display_name) return null;
  if (!ORG_PRESET_SET_ALLOWLIST.has(preset_set_id)) return null;
  const rolesIn = isRecord(input.roles) ? input.roles : {};
  const keys: AgentPresetRoleKey[] = ["facilitator", "critic", "operator", "jester"];
  const roles: Record<AgentPresetRoleKey, AgentPresetRoleSpec> = {
    facilitator: { identity_traits: {} },
    critic: { identity_traits: {} },
    operator: { identity_traits: {} },
    jester: { identity_traits: {} },
  };
  try {
    for (const key of keys) {
      const roleVal = isRecord(rolesIn[key]) ? rolesIn[key] : {};
      roles[key] = {
        identity_traits: validatePresetIdentityTraitsObject(roleVal.identity_traits),
      };
    }
  } catch {
    return null;
  }
  return { preset_set_id, display_name, description, roles };
}

function loadAgentPresetsDoc(): AgentPresetsDoc {
  const defaults = defaultAgentPresetsDoc();
  if (!fs.existsSync(ORG_AGENT_PRESETS_PATH)) {
    writeJsonAtomic(ORG_AGENT_PRESETS_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(ORG_AGENT_PRESETS_PATH, defaults);
  const src = isRecord(raw) ? raw : {};
  const presetsRaw = Array.isArray(src.presets) ? src.presets : [];
  const presets: AgentPresetSet[] = [];
  for (const row of presetsRaw) {
    const item = sanitizeAgentPresetSet(row);
    if (!item) continue;
    presets.push(item);
  }
  if (!presets.length) {
    writeJsonAtomic(ORG_AGENT_PRESETS_PATH, defaults);
    return defaults;
  }
  const out: AgentPresetsDoc = { version: 1, presets };
  return out;
}

function summarizeAgentPresets(): Array<{ preset_set_id: string; display_name: string }> {
  const doc = loadAgentPresetsDoc();
  return doc.presets.map((p) => ({
    preset_set_id: p.preset_set_id,
    display_name: p.display_name,
  }));
}

function loadPresetIndex(): { ids: Set<string>; displayNameById: Map<string, string> } {
  const summary = summarizeAgentPresets();
  const ids = new Set<string>();
  const displayNameById = new Map<string, string>();
  for (const row of summary) {
    const id = clipText(row.preset_set_id, 80).trim().toLowerCase();
    if (!id) continue;
    ids.add(id);
    displayNameById.set(id, clipText(row.display_name, 120).trim() || id);
  }
  if (!ids.has("standard")) {
    ids.add("standard");
    displayNameById.set("standard", displayNameById.get("standard") || "standard");
  }
  return { ids, displayNameById };
}

function defaultActiveProfileState(): ActiveProfileState {
  const index = loadPresetIndex();
  const presetId = normalizeRecommendedPresetId("standard", index);
  return {
    preset_set_id: presetId,
    display_name: index.displayNameById.get(presetId) || presetId,
    applied_at: "",
    applied_by: "system",
    reason: "default",
    thread_key: "",
    version: 1,
  };
}

function sanitizeActiveProfileState(input: unknown): ActiveProfileState {
  const fallback = defaultActiveProfileState();
  const raw = isRecord(input) ? input : {};
  const index = loadPresetIndex();
  const preset_set_id = normalizeRecommendedPresetId(String(raw.preset_set_id || fallback.preset_set_id), index);
  const display_name = clipText(raw.display_name, 120).trim() || index.displayNameById.get(preset_set_id) || preset_set_id;
  const applied_at = clipText(raw.applied_at, 80).trim();
  const applied_by = clipText(raw.applied_by, 120).trim() || "apply_preset";
  const reason = clipText(raw.reason, 120).trim() || "manual";
  const thread_key = normalizeInboxThreadKey(raw.thread_key) || "";
  return {
    preset_set_id,
    display_name,
    applied_at,
    applied_by,
    reason,
    thread_key,
    version: 1,
  };
}

function loadActiveProfileState(): { state: ActiveProfileState; note: string } {
  const fallback = defaultActiveProfileState();
  if (!fs.existsSync(ORG_ACTIVE_PROFILE_PATH)) {
    return { state: fallback, note: "missing_default" };
  }
  try {
    const raw = readJson<unknown>(ORG_ACTIVE_PROFILE_PATH, fallback);
    return { state: sanitizeActiveProfileState(raw), note: "" };
  } catch {
    return { state: fallback, note: "parse_failed_default" };
  }
}

function writeActiveProfileState(input: {
  preset_set_id: string;
  display_name?: string;
  applied_by: string;
  reason: string;
  thread_key?: string;
}): { ok: boolean; state: ActiveProfileState; note?: string } {
  try {
    const index = loadPresetIndex();
    const preset_set_id = normalizeRecommendedPresetId(input.preset_set_id, index);
    const next = sanitizeActiveProfileState({
      preset_set_id,
      display_name: clipText(input.display_name, 120).trim() || index.displayNameById.get(preset_set_id) || preset_set_id,
      applied_at: nowIso(),
      applied_by: clipText(input.applied_by, 120).trim() || "apply_preset",
      reason: clipText(input.reason, 120).trim() || "manual",
      thread_key: normalizeInboxThreadKey(input.thread_key) || "",
      version: 1,
    });
    writeJsonAtomic(ORG_ACTIVE_PROFILE_PATH, next);
    return { ok: true, state: next };
  } catch (e: any) {
    return {
      ok: false,
      state: loadActiveProfileState().state,
      note: clipText(String(e?.message || "active_profile_write_failed"), 200) || "active_profile_write_failed",
    };
  }
}

function defaultRevertSuggestState(): { version: 1; by_thread_key: Record<string, { last_suggested_yyyymmdd: string }> } {
  return { version: 1, by_thread_key: {} };
}

function loadRevertSuggestState(): { version: 1; by_thread_key: Record<string, { last_suggested_yyyymmdd: string }> } {
  const defaults = defaultRevertSuggestState();
  if (!fs.existsSync(ORG_REVERT_SUGGEST_STATE_PATH)) return defaults;
  const raw = readJson<unknown>(ORG_REVERT_SUGGEST_STATE_PATH, defaults);
  if (!isRecord(raw)) return defaults;
  const byIn = isRecord(raw.by_thread_key) ? raw.by_thread_key : {};
  const by: Record<string, { last_suggested_yyyymmdd: string }> = {};
  for (const [k, v] of Object.entries(byIn)) {
    const key = normalizeInboxThreadKey(k);
    if (!key || !isRecord(v)) continue;
    const ymd = clipText(v.last_suggested_yyyymmdd, 8).trim();
    if (!/^\d{8}$/.test(ymd)) continue;
    by[key] = { last_suggested_yyyymmdd: ymd };
  }
  return { version: 1, by_thread_key: by };
}

function saveRevertSuggestState(state: { version: 1; by_thread_key: Record<string, { last_suggested_yyyymmdd: string }> }): void {
  writeJsonAtomic(ORG_REVERT_SUGGEST_STATE_PATH, state);
}

function inboxHasRevertSuggestionByThreadKey(threadKeyInput: unknown): boolean {
  const threadKey = normalizeInboxThreadKey(threadKeyInput);
  if (!threadKey || !fs.existsSync(INBOX_PATH)) return false;
  try {
    const tail = readFileTailUtf8(INBOX_PATH, 256 * 1024).text;
    const lines = tail.split(/\r?\n/).filter((x) => !!x);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (Buffer.byteLength(line, "utf8") > 64 * 1024) continue;
      try {
        const row = JSON.parse(line);
        if (!isRecord(row)) continue;
        if (String(row.source || "") !== "revert_suggestion") continue;
        if (normalizeInboxThreadKey(row.thread_key) !== threadKey) continue;
        return true;
      } catch {
        continue;
      }
    }
  } catch {
    // best-effort
  }
  return false;
}

function localYmdCompact(d = new Date()): string {
  return localDateYmd(d).replaceAll("-", "");
}

function buildCouncilRevertSuggestionPreview(threadKeyInput: unknown): {
  should_suggest: boolean;
  target_preset_set_id: "standard";
  quick_action_id: "revert_active_profile_standard";
  thread_key: string;
  reason: "autopilot_final";
} {
  const profile = loadActiveProfileState().state;
  const threadKey = normalizeInboxThreadKey(threadKeyInput) || makeCouncilAutopilotThreadKey({ mode: "preview" }).thread_key;
  return {
    should_suggest: profile.preset_set_id !== "standard",
    target_preset_set_id: "standard",
    quick_action_id: "revert_active_profile_standard",
    thread_key: threadKey,
    reason: "autopilot_final",
  };
}

function maybeAppendAutopilotRevertSuggestion(run: CouncilRunRecord): boolean {
  const threadKey = normalizeInboxThreadKey(run.thread_key);
  if (!threadKey) return false;
  const profile = loadActiveProfileState().state;
  if (profile.preset_set_id === "standard") return false;
  const today = localYmdCompact(new Date());
  const state = loadRevertSuggestState();
  const prev = state.by_thread_key[threadKey];
  if (prev && prev.last_suggested_yyyymmdd === today) return false;
  if (inboxHasRevertSuggestionByThreadKey(threadKey)) {
    state.by_thread_key[threadKey] = { last_suggested_yyyymmdd: today };
    try { saveRevertSuggestState(state); } catch {}
    return false;
  }
  try {
    appendInboxEntry({
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: run.thread_id || "general",
      msg_id: randomId("revert_suggestion"),
      role: "system",
      mention: false,
      title: "Profile revert suggestion",
      body: clipText(`議論が完了しました。Active Profile は現在 '${profile.preset_set_id}' です。必要なら標準(standard)へ戻してください。`, 512),
      source: "revert_suggestion",
      thread_key: threadKey,
      links: {
        quick_action_id: "revert_active_profile_standard",
        active_profile_preset_set_id: profile.preset_set_id,
        request_id: run.request_id,
        run_id: run.run_id,
        thread_key: threadKey,
      },
    });
    state.by_thread_key[threadKey] = { last_suggested_yyyymmdd: today };
    saveRevertSuggestState(state);
    return true;
  } catch {
    return false;
  }
}

function runActiveProfileRevertInternal(input: {
  dry_run: boolean;
  confirm_phrase?: string;
  target_preset_set_id?: string;
  thread_key?: string;
  reason?: string;
  source?: string;
  quick_action_id?: string;
}): Record<string, unknown> {
  const dryRun = input.dry_run !== false;
  const target = clipText(input.target_preset_set_id || "standard", 80).trim().toLowerCase() || "standard";
  if (target !== "standard") {
    return {
      ok: false,
      dry_run: dryRun,
      target_preset_set_id: target,
      reason: "ERR_NOT_ALLOWED",
      details: { field: "target_preset_set_id", allowlist: ["standard"] },
      exit_code: 1,
    };
  }
  if (!dryRun) {
    const phrase = clipText(input.confirm_phrase, 40).trim();
    if (phrase !== "REVERT") {
      return {
        ok: false,
        dry_run: false,
        target_preset_set_id: target,
        reason: "ERR_CONFIRM_REQUIRED",
        details: { which: "REVERT", field: "confirm_phrase", expected: "REVERT" },
        exit_code: 1,
      };
    }
  }
  const threadKey = normalizeInboxThreadKey(input.thread_key) || makeQuickActionsThreadKey(
    "active_profile_revert",
    "",
    "",
    dryRun ? "preview" : "execute",
  ).thread_key;
  const preflight = applyAgentPresetInternal({
    preset_set_id: target,
    scope: "council",
    dry_run: true,
    actor_id: "ui_discord",
    applied_by: "revert",
    reason: "revert",
    thread_key: threadKey,
  });
  if (!preflight.ok) {
    return {
      ok: false,
      dry_run: dryRun,
      target_preset_set_id: target,
      preflight,
      reason: preflight.note || "ERR_PRESET_APPLY_FAILED",
      exit_code: 1,
      thread_key: threadKey,
    };
  }
  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      target_preset_set_id: target,
      preflight,
      active_profile_preview: preflight.active_profile_preview || {
        preset_set_id: target,
        display_name: target,
        reason: "preview",
        computed_at: nowIso(),
      },
      thread_key: threadKey,
      exit_code: 0,
    };
  }
  const applyResult = applyAgentPresetInternal({
    preset_set_id: target,
    scope: "council",
    dry_run: false,
    actor_id: "ui_discord",
    applied_by: "revert",
    reason: "revert",
    thread_key: threadKey,
  });
  if (!applyResult.ok) {
    return {
      ok: false,
      dry_run: false,
      target_preset_set_id: target,
      preflight,
      apply_result: applyResult,
      reason: applyResult.note || "ERR_PRESET_APPLY_FAILED",
      exit_code: 1,
      thread_key: threadKey,
    };
  }
  const profileWrite = writeActiveProfileState({
    preset_set_id: target,
    display_name: String((applyResult.active_profile && (applyResult.active_profile as ActiveProfileState).display_name) || target),
    applied_by: "revert",
    reason: clipText(input.reason, 120).trim() || "revert",
    thread_key: threadKey,
  });
  try {
    appendInboxEntry({
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: "org",
      msg_id: randomId("active_profile_revert"),
      role: "system",
      mention: false,
      title: "Active profile reverted",
      body: clipText(`Reverted active profile to standard`, 300),
      source: "active_profile_revert",
      thread_key: threadKey,
      links: {
        preset_set_id: target,
        quick_action_id: clipText(input.quick_action_id, 80).trim(),
        source: clipText(input.source, 80).trim() || "api",
      },
    });
  } catch {
    // best-effort audit only
  }
  return {
    ok: true,
    dry_run: false,
    target_preset_set_id: target,
    preflight,
    apply_result: applyResult,
    active_profile: profileWrite.state,
    active_profile_updated: profileWrite.ok,
    thread_key: threadKey,
    exit_code: 0,
  };
}

function hasStaleOpsLock(staleSec: number): boolean {
  const lockPaths = [HEARTBEAT_LOCK_PATH, CONSOLIDATION_LOCK_PATH, MORNING_BRIEF_LOCK_PATH, OPS_AUTO_STABILIZE_LOCK_PATH];
  for (const p of lockPaths) {
    try {
      if (!fs.existsSync(p)) continue;
      const stat = fs.statSync(p);
      const ageSec = Math.max(0, Math.floor((Date.now() - stat.mtimeMs) / 1000));
      if (ageSec >= Math.max(60, staleSec)) return true;
    } catch {
      // best-effort
    }
  }
  return false;
}

function normalizeRecommendedPresetId(candidate: string, index: { ids: Set<string> }): string {
  const normalized = clipText(candidate, 80).trim().toLowerCase();
  if (normalized && index.ids.has(normalized)) return normalized;
  return index.ids.has("standard") ? "standard" : normalized || "standard";
}

function computeRecommendedProfile(input?: {
  unread_count?: number;
  mention_count?: number;
  recent_event_types?: string[];
  run_failures?: number;
  ops_failure_count?: number;
  ops_enabled_effective?: boolean;
  stale_lock_detected?: boolean;
  suggest_failure_count?: number;
}): RecommendedProfile {
  const computed_at = nowIso();
  const index = loadPresetIndex();
  let unreadCount = Math.max(0, Math.floor(Number(input?.unread_count || 0) || 0));
  let mentionCount = Math.max(0, Math.floor(Number(input?.mention_count || 0) || 0));
  let runFailures = Math.max(0, Math.floor(Number(input?.run_failures || 0) || 0));
  let opsFailureCount = Math.max(0, Math.floor(Number(input?.ops_failure_count || 0) || 0));
  let suggestFailureCount = Math.max(0, Math.floor(Number(input?.suggest_failure_count || 0) || 0));
  let opsEnabledEffective = input?.ops_enabled_effective !== undefined ? input.ops_enabled_effective !== false : true;
  let staleLockDetected = input?.stale_lock_detected === true;
  const recentEventTypes = Array.isArray(input?.recent_event_types)
    ? input!.recent_event_types!.map((x) => clipText(x, 80).trim()).filter((x) => !!x).slice(0, 10)
    : [];

  if (!Array.isArray(input?.recent_event_types) || input?.run_failures === undefined || input?.ops_failure_count === undefined) {
    try {
      const activity = readActivityEvents(20, { ts: "", id: "" });
      const tailTypes = activity.items.map((x) => clipText(x.event_type, 80).trim()).filter((x) => !!x);
      if (!recentEventTypes.length) recentEventTypes.push(...tailTypes.slice(0, 10));
    } catch {
      // best-effort
    }
    try {
      const runs = readRunsForHeartbeat(20);
      runFailures = Math.max(runFailures, runs.filter((x) => x.status === "failed" || !!x.error_code).length);
    } catch {
      // best-effort
    }
    try {
      const opsState = loadOpsAutoStabilizeState();
      const opsSettings = loadOpsAutoStabilizeSettings();
      opsFailureCount = Math.max(opsFailureCount, Math.max(0, Math.floor(Number(opsState.failure_count || 0) || 0)));
      opsEnabledEffective = opsEnabledEffective && opsState.enabled_effective !== false;
      staleLockDetected = staleLockDetected || hasStaleOpsLock(Math.max(60, Math.floor(Number(opsSettings.thresholds.stale_lock_sec || 600) || 600)));
    } catch {
      // best-effort
    }
    try {
      const suggestState = loadHeartbeatAutopilotSuggestState();
      suggestFailureCount = Math.max(suggestFailureCount, Math.max(0, Math.floor(Number(suggestState.failure_count || 0) || 0)));
    } catch {
      // best-effort
    }
    try {
      const inboxItems = readInboxItems(20, "");
      const readState = loadInboxReadState();
      unreadCount = Math.max(unreadCount, computeInboxUnreadCount(inboxItems.items, readState));
      mentionCount = Math.max(mentionCount, inboxItems.items.filter((x) => x.mention === true).length);
    } catch {
      // best-effort
    }
  }

  const recentFailureSignal = recentEventTypes.some((x) =>
    x === "council_finished" || x === "taskify_queue" || x === "export_done" || x === "ops_snapshot_done");
  const opsSignal = staleLockDetected || !opsEnabledEffective || opsFailureCount >= 2;
  const driftLikeSignal = runFailures >= 1 || suggestFailureCount >= 1 || recentFailureSignal;

  let candidate = "standard";
  let rationale = "normal_state";
  if (opsSignal) {
    candidate = "ops_first";
    rationale = `ops_signal: brake_or_stale_or_failures (ops_failure_count=${opsFailureCount}, stale_lock=${staleLockDetected ? "yes" : "no"})`;
  } else if (driftLikeSignal) {
    candidate = "harsh_critic";
    rationale = `quality_signal: run_failures=${runFailures}, suggest_failures=${suggestFailureCount}`;
  } else if (mentionCount > 0 || unreadCount > 10) {
    candidate = "standard";
    rationale = `triage_signal: unread=${unreadCount}, mentions=${mentionCount}`;
  }
  const preset_set_id = normalizeRecommendedPresetId(candidate, index);
  const display_name = index.displayNameById.get(preset_set_id) || preset_set_id;
  const inputs_sample = {
    unread_count: unreadCount,
    mention_count: mentionCount,
    run_failures: runFailures,
    ops_failure_count: opsFailureCount,
    suggest_failure_count: suggestFailureCount,
    ops_enabled_effective: opsEnabledEffective,
    stale_lock_detected: staleLockDetected,
    recent_event_types: recentEventTypes.slice(0, 5),
  };
  return {
    preset_set_id,
    display_name,
    rationale: clipText(rationale, 300),
    computed_at,
    inputs_sample,
  };
}

function toOrgIdentityFromTraits(traitsInput: unknown, fallback?: OrgAgent["identity"]): NonNullable<OrgAgent["identity"]> {
  const traits = isRecord(traitsInput) ? traitsInput : {};
  const current = fallback || {
    tagline: "",
    values: [],
    speaking_style: "",
    strengths: [],
    weaknesses: [],
    do: [],
    dont: [],
    focus: "",
  };
  const list = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((x) => sanitizeIdentityString(x, ORG_AGENT_IDENTITY_STRING_MAX))
      .filter((x) => !!x)
      .slice(0, ORG_AGENT_IDENTITY_LIST_MAX);
  };
  const speaking_style = sanitizeIdentityString(traits.speaking_style ?? traits.tone ?? current.speaking_style, ORG_AGENT_IDENTITY_STYLE_MAX);
  const focus = sanitizeIdentityString(traits.focus ?? traits.goals ?? current.focus, ORG_AGENT_IDENTITY_STYLE_MAX);
  const tagline = sanitizeIdentityString(traits.tagline ?? current.tagline, ORG_AGENT_IDENTITY_STRING_MAX);
  const values = list(traits.values ?? current.values);
  const strengths = list(traits.strengths ?? traits.quirks ?? current.strengths);
  const weaknesses = list(traits.weaknesses ?? current.weaknesses);
  const dos = list(traits.do ?? current.do);
  const dont = list(traits.dont ?? current.dont);
  return { tagline, speaking_style, focus, values, strengths, weaknesses, do: dos, dont };
}

function identityShortHash(identity: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(identity || {})).digest("hex").slice(0, 12);
}

function resolveCouncilPresetTargetIds(agents: OrgAgent[]): Record<AgentPresetRoleKey, string> {
  const byId = new Set(agents.map((a) => a.id));
  const fallbackByRole: Record<AgentPresetRoleKey, string> = {
    facilitator: "facilitator",
    critic: byId.has("critic") ? "critic" : (byId.has("qa") ? "qa" : "critic"),
    operator: byId.has("operator") ? "operator" : (byId.has("impl") ? "impl" : "operator"),
    jester: "jester",
  };
  return fallbackByRole;
}

function applyAgentPresetInternal(input: {
  preset_set_id: string;
  scope: "council" | "agent";
  agent_id?: string;
  dry_run: boolean;
  actor_id?: string;
  applied_by?: string;
  reason?: string;
  thread_key?: string;
}): {
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
} {
  const doc = loadAgentPresetsDoc();
  const presetId = clipText(input.preset_set_id, 80).trim().toLowerCase();
  const preset = doc.presets.find((p) => p.preset_set_id === presetId) || null;
  const presetDisplayName = preset?.display_name || presetId;
  const profileAppliedBy = clipText(input.applied_by, 120).trim() || "apply_preset";
  const profileReason = clipText(input.reason, 120).trim() || "manual";
  const profileThreadKey = normalizeInboxThreadKey(input.thread_key) || "";
  const preview = {
    preset_set_id: presetId || "standard",
    display_name: clipText(presetDisplayName, 120).trim() || (presetId || "standard"),
    reason: "preview",
    computed_at: nowIso(),
  };
  if (!preset) {
    return {
      action: "apply_preset",
      ok: false,
      dry_run: input.dry_run,
      preset_set_id: presetId,
      scope: input.scope,
      applied_ids: [],
      diff_sample: {},
      note: "ERR_PRESET_NOT_FOUND",
      exit_code: 1,
      active_profile_preview: input.dry_run ? preview : undefined,
    };
  }
  const loaded = loadOrgAgentsSnapshot();
  const byId = new Map<string, OrgAgent>();
  for (const a of loaded.snapshot.agents) byId.set(a.id, a);
  const councilMap = resolveCouncilPresetTargetIds(loaded.snapshot.agents);
  const targets: Array<{ role_key: AgentPresetRoleKey; agent_id: string }> = [];
  if (input.scope === "council") {
    for (const key of ["facilitator", "critic", "operator", "jester"] as AgentPresetRoleKey[]) {
      const id = councilMap[key];
      if (!id || !byId.has(id)) continue;
      targets.push({ role_key: key, agent_id: id });
    }
  } else {
    const aid = normalizeMemoryAgentId(input.agent_id);
    if (!aid) {
      return {
        action: "apply_preset",
        ok: false,
        dry_run: input.dry_run,
        preset_set_id: presetId,
        scope: input.scope,
        applied_ids: [],
        diff_sample: {},
        note: "agent_id_required",
        exit_code: 1,
        active_profile_preview: input.dry_run ? preview : undefined,
      };
    }
    const roleKey = (Object.entries(councilMap).find(([, id]) => id === aid)?.[0] || "") as AgentPresetRoleKey;
    if (!(roleKey === "facilitator" || roleKey === "critic" || roleKey === "operator" || roleKey === "jester")) {
      return {
        action: "apply_preset",
        ok: false,
        dry_run: input.dry_run,
        preset_set_id: presetId,
        scope: input.scope,
        applied_ids: [],
        diff_sample: {},
        note: "ERR_NOT_SUPPORTED",
        exit_code: 1,
        active_profile_preview: input.dry_run ? preview : undefined,
      };
    }
    if (!byId.has(aid)) {
      return {
        action: "apply_preset",
        ok: false,
        dry_run: input.dry_run,
        preset_set_id: presetId,
        scope: input.scope,
        applied_ids: [],
        diff_sample: {},
        note: "agent_not_found",
        exit_code: 1,
        active_profile_preview: input.dry_run ? preview : undefined,
      };
    }
    targets.push({ role_key: roleKey, agent_id: aid });
  }
  const applied_ids: string[] = [];
  const changed_ids: string[] = [];
  const diff_sample: Record<string, { before_hash: string; after_hash: string; changed: boolean }> = {};
  const now = nowIso();
  for (const t of targets) {
    const current = byId.get(t.agent_id);
    if (!current) continue;
    if (!applied_ids.includes(t.agent_id)) applied_ids.push(t.agent_id);
    const presetRole = preset.roles[t.role_key];
    if (!presetRole) continue;
    const nextIdentity = toOrgIdentityFromTraits(presetRole.identity_traits, current.identity);
    const beforeHash = identityShortHash(current.identity || {});
    const afterHash = identityShortHash(nextIdentity);
    const changed = beforeHash !== afterHash;
    diff_sample[t.agent_id] = { before_hash: beforeHash, after_hash: afterHash, changed };
    if (changed) {
      changed_ids.push(t.agent_id);
      if (!input.dry_run) {
        byId.set(t.agent_id, {
          ...current,
          identity: nextIdentity,
          last_updated_at: now,
        });
      }
    }
  }
  if (!input.dry_run && changed_ids.length > 0) {
    const updated: OrgAgentsSnapshot = {
      version: 1,
      updated_at: now,
      agents: Array.from(byId.values()).slice(0, ORG_AGENTS_LIMIT_MAX),
    };
    writeJsonAtomic(ORG_AGENTS_PATH, updated);
      appendActivity({
        event_type: "agents_updated",
        actor_id: input.actor_id ? clipText(input.actor_id, 120) : "system",
        title: "Agent preset applied",
        summary: `preset_set_id=${presetId} changed_ids=${changed_ids.join(",")}`,
      });
  }
  let activeProfileUpdated = false;
  let activeProfileState: ActiveProfileState | undefined;
  if (input.dry_run) {
    activeProfileState = undefined;
  } else {
    const write = writeActiveProfileState({
      preset_set_id: presetId,
      display_name: presetDisplayName,
      applied_by: profileAppliedBy,
      reason: profileReason,
      thread_key: profileThreadKey,
    });
    activeProfileUpdated = write.ok;
    activeProfileState = write.state;
  }
  return {
    action: "apply_preset",
    ok: true,
    dry_run: input.dry_run,
    preset_set_id: presetId,
    scope: input.scope,
    applied_ids,
    diff_sample,
    note: input.dry_run ? "dry_run" : "applied",
    exit_code: 0,
    active_profile_preview: input.dry_run ? preview : undefined,
    active_profile_updated: input.dry_run ? undefined : activeProfileUpdated,
    active_profile: input.dry_run ? undefined : activeProfileState,
  };
}

function isMemoryCategory(v: unknown): v is MemoryCategory {
  return v === "episodes" || v === "knowledge" || v === "procedures";
}

function isMemorySource(v: unknown): v is MemorySource {
  return v === "ui" || v === "autopilot" || v === "taskify" || v === "system";
}

function normalizeMemoryAgentId(v: unknown): string {
  const id = clipText(v, 40).trim();
  if (!/^[a-z0-9_-]{1,40}$/.test(id)) return "";
  return id;
}

function memoryCategoryPath(agentId: string, category: MemoryCategory): string {
  return path.join(MEMORY_DIR, agentId, `${category}.jsonl`);
}

function readFileTailUtf8(p: string, maxBytes: number): { text: string; truncated: boolean } {
  const cap = Math.max(1, Math.floor(maxBytes));
  if (!fs.existsSync(p)) return { text: "", truncated: false };
  const stat = fs.statSync(p);
  const size = Number(stat.size || 0);
  if (!Number.isFinite(size) || size <= 0) return { text: "", truncated: false };
  if (size <= cap) return { text: fs.readFileSync(p, "utf8"), truncated: false };
  const fd = fs.openSync(p, "r");
  try {
    const out = Buffer.alloc(cap);
    fs.readSync(fd, out, 0, cap, size - cap);
    return { text: out.toString("utf8"), truncated: true };
  } finally {
    fs.closeSync(fd);
  }
}

function memoryValueTooLong(v: unknown, cap: number): boolean {
  const s = String(v || "");
  return s.length > cap;
}

function memoryTagsFromBody(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error("memory.tags_type_invalid");
  if (v.length > MEMORY_TAGS_MAX) throw new Error("memory.tags_too_many");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of v) {
    if (memoryValueTooLong(row, MEMORY_TAG_MAX)) throw new Error("memory.tags_item_too_long");
    const tag = String(row || "").trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function sanitizeMemoryEntry(input: unknown): MemoryEntry | null {
  if (!isRecord(input)) return null;
  const id = clipText(input.id, 120).trim();
  const ts = clipText(input.ts, 80).trim();
  const agent_id = normalizeMemoryAgentId(input.agent_id);
  const category = input.category;
  if (!id || !ts || !agent_id || !isMemoryCategory(category)) return null;
  const sourceRaw = input.source;
  const source: MemorySource = isMemorySource(sourceRaw) ? sourceRaw : "system";
  const refsInput = isRecord(input.refs) ? input.refs : {};
  const tagsRaw = Array.isArray(input.tags) ? input.tags : [];
  const tags: string[] = [];
  for (const row of tagsRaw) {
    const tag = clipText(row, MEMORY_TAG_MAX).trim();
    if (!tag) continue;
    tags.push(tag);
    if (tags.length >= MEMORY_TAGS_MAX) break;
  }
  return {
    id,
    ts,
    agent_id,
    category,
    title: clipText(input.title, MEMORY_TITLE_MAX),
    body: clipText(input.body, MEMORY_BODY_MAX),
    tags,
    source,
    refs: {
      thread_id: clipText(refsInput.thread_id, 120),
      run_id: clipText(refsInput.run_id, 120),
      request_id: clipText(refsInput.request_id, 120),
    },
  };
}

function readMemoryItems(agentId: string, category: MemoryCategory, limitInput: number): { items: MemoryEntry[]; skipped_invalid: number; truncated: boolean; note?: string } {
  const limit = Math.max(1, Math.min(Number(limitInput || 50), MEMORY_LIMIT_MAX));
  const p = memoryCategoryPath(agentId, category);
  if (!fs.existsSync(p)) return { items: [], skipped_invalid: 0, truncated: false };
  const raw = readFileTailUtf8(p, FILE_CAP);
  let text = raw.text;
  if (raw.truncated) {
    const newline = text.indexOf("\n");
    if (newline >= 0) text = text.slice(newline + 1);
  }
  const lines = text.split(/\r?\n/).filter((x) => !!x);
  const out: MemoryEntry[] = [];
  let skipped = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const entry = sanitizeMemoryEntry(JSON.parse(lines[i]));
      if (!entry) {
        skipped += 1;
        continue;
      }
      if (entry.agent_id !== agentId || entry.category !== category) continue;
      out.push(entry);
      if (out.length >= limit) break;
    } catch {
      skipped += 1;
    }
  }
  return {
    items: out,
    skipped_invalid: skipped,
    truncated: raw.truncated,
    note: raw.truncated ? "memory_tail_truncated_to_256kb" : undefined,
  };
}

function appendMemoryEntry(agentId: string, category: MemoryCategory, body: Record<string, unknown>): MemoryEntry {
  if (memoryValueTooLong(body.title, MEMORY_TITLE_MAX)) throw new Error("memory.title_too_long");
  if (memoryValueTooLong(body.body, MEMORY_BODY_MAX)) throw new Error("memory.body_too_long");
  const title = String(body.title || "").trim();
  const text = String(body.body || "").trim();
  if (!title) throw new Error("memory.title_required");
  if (!text) throw new Error("memory.body_required");
  const tags = memoryTagsFromBody(body.tags);
  const sourceRaw = clipText(body.source, 40).trim();
  const source: MemorySource = isMemorySource(sourceRaw) ? sourceRaw : "ui";
  const refsIn = isRecord(body.refs) ? body.refs : {};

  const now = nowIso();
  const tsPart = now.replace(/[-:.TZ]/g, "");
  const entry: MemoryEntry = {
    id: `mem_${tsPart}_${crypto.randomBytes(3).toString("hex")}`,
    ts: now,
    agent_id: agentId,
    category,
    title: clipText(title, MEMORY_TITLE_MAX),
    body: clipText(text, MEMORY_BODY_MAX),
    tags,
    source,
    refs: {
      thread_id: clipText(refsIn.thread_id, 120),
      run_id: clipText(refsIn.run_id, 120),
      request_id: clipText(refsIn.request_id, 120),
    },
  };
  appendJsonlAtomic(memoryCategoryPath(agentId, category), `${JSON.stringify(entry)}\n`);
  appendActivity({
    event_type: "memory_append",
    actor_id: agentId,
    title: "Memory updated",
    summary: `${category}: ${entry.title}`,
    refs: entry.refs,
  });
  return entry;
}

function searchMemory(queryRaw: string, limitInput: number, allowedAgentIds: Set<string>): MemorySearchHit[] {
  const q = String(queryRaw || "").trim().toLowerCase();
  if (!q) return [];
  const limit = Math.max(1, Math.min(Number(limitInput || 20), MEMORY_LIMIT_MAX));
  const hits: MemorySearchHit[] = [];
  const categories: MemoryCategory[] = ["episodes", "knowledge", "procedures"];
  const agentIds = Array.from(allowedAgentIds);
  for (const agentId of agentIds) {
    for (const category of categories) {
      const p = memoryCategoryPath(agentId, category);
      if (!fs.existsSync(p)) continue;
      const raw = readFileTailUtf8(p, FILE_CAP);
      let text = raw.text;
      if (raw.truncated) {
        const newline = text.indexOf("\n");
        if (newline >= 0) text = text.slice(newline + 1);
      }
      const lines = text.split(/\r?\n/).filter((x) => !!x);
      let scanned = 0;
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        scanned += 1;
        if (scanned > MEMORY_SEARCH_FILES_LINE_SCAN_MAX) break;
        let entry: MemoryEntry | null = null;
        try { entry = sanitizeMemoryEntry(JSON.parse(lines[i])); } catch { entry = null; }
        if (!entry) continue;
        const hay = `${entry.title}\n${entry.body}\n${entry.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) continue;
        const idx = hay.indexOf(q);
        const sourceText = `${entry.title}\n${entry.body}`;
        const start = Math.max(0, idx - 40);
        const snippet = sourceText.slice(start, start + MEMORY_SNIPPET_MAX);
        hits.push({
          agent_id: entry.agent_id,
          category: entry.category,
          id: entry.id,
          ts: entry.ts,
          title: entry.title,
          snippet: clipText(snippet, MEMORY_SNIPPET_MAX),
        });
        if (hits.length >= limit) return hits;
      }
    }
  }
  hits.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return hits.slice(0, limit);
}

function normalizeGuestId(v: unknown): string {
  const raw = clipText(v, GUEST_ID_MAX).trim().toLowerCase();
  if (!raw) return "";
  if (!/^[a-z0-9_.-]{1,40}$/.test(raw)) return "";
  return raw;
}

function isGuestStatus(v: unknown): v is GuestStatus {
  return v === "offline" || isOrgAgentStatus(v);
}

function sanitizeGuestKeyEntry(input: unknown): GuestKeyEntry | null {
  if (!isRecord(input)) return null;
  const join_key = clipText(input.join_key, 120).trim();
  const created_at = clipText(input.created_at, 80).trim();
  const revoked = input.revoked === true;
  const revoked_at = clipText(input.revoked_at, 80).trim();
  const label = clipText(input.label, GUEST_LABEL_MAX).trim();
  if (!join_key || !created_at) return null;
  return {
    join_key,
    created_at,
    revoked,
    revoked_at: revoked_at || undefined,
    label: label || undefined,
  };
}

function sanitizeGuestKeysDoc(input: unknown): GuestKeysDoc | null {
  if (!isRecord(input)) return null;
  const version = Number(input.version || 0);
  const updated_at = clipText(input.updated_at, 80).trim();
  if (version !== 1 || !updated_at) return null;
  const keysIn = Array.isArray(input.keys) ? input.keys : [];
  const keys: GuestKeyEntry[] = [];
  const seen = new Set<string>();
  for (const row of keysIn) {
    const item = sanitizeGuestKeyEntry(row);
    if (!item || seen.has(item.join_key)) continue;
    seen.add(item.join_key);
    keys.push(item);
    if (keys.length >= GUEST_KEYS_MAX) break;
  }
  return { version: 1, updated_at, keys };
}

function defaultGuestKeysDoc(): GuestKeysDoc {
  return { version: 1, updated_at: nowIso(), keys: [] };
}

function loadGuestKeysDoc(): GuestKeysDoc {
  const defaults = defaultGuestKeysDoc();
  if (!fs.existsSync(ORG_GUEST_KEYS_PATH)) {
    writeJsonAtomic(ORG_GUEST_KEYS_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(ORG_GUEST_KEYS_PATH, defaults);
  const sanitized = sanitizeGuestKeysDoc(raw);
  if (!sanitized) {
    writeJsonAtomic(ORG_GUEST_KEYS_PATH, defaults);
    return defaults;
  }
  return sanitized;
}

function sanitizeGuestEntry(input: unknown): GuestEntry | null {
  if (!isRecord(input)) return null;
  const id = normalizeGuestId(input.id);
  const display_name = clipText(input.display_name, GUEST_DISPLAY_NAME_MAX).trim();
  const statusRaw = String(input.status || "").trim();
  const status: GuestStatus = isGuestStatus(statusRaw) ? statusRaw : "offline";
  const note = clipText(input.note, GUEST_NOTE_MAX).trim();
  const last_seen_at = clipText(input.last_seen_at, 80).trim();
  if (!id || !display_name || !last_seen_at) return null;
  return { id, display_name, status, note: note || undefined, last_seen_at };
}

function sanitizeGuestsDoc(input: unknown): GuestsDoc | null {
  if (!isRecord(input)) return null;
  const version = Number(input.version || 0);
  const updated_at = clipText(input.updated_at, 80).trim();
  if (version !== 1 || !updated_at) return null;
  const guestsIn = Array.isArray(input.guests) ? input.guests : [];
  const guests: GuestEntry[] = [];
  const seen = new Set<string>();
  for (const row of guestsIn) {
    const guest = sanitizeGuestEntry(row);
    if (!guest || seen.has(guest.id)) continue;
    seen.add(guest.id);
    guests.push(guest);
    if (guests.length >= GUESTS_MAX) break;
  }
  return { version: 1, updated_at, guests };
}

function defaultGuestsDoc(): GuestsDoc {
  return { version: 1, updated_at: nowIso(), guests: [] };
}

function loadGuestsDoc(): GuestsDoc {
  const defaults = defaultGuestsDoc();
  if (!fs.existsSync(ORG_GUESTS_PATH)) {
    writeJsonAtomic(ORG_GUESTS_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(ORG_GUESTS_PATH, defaults);
  const sanitized = sanitizeGuestsDoc(raw);
  if (!sanitized) {
    writeJsonAtomic(ORG_GUESTS_PATH, defaults);
    return defaults;
  }
  return sanitized;
}

function newJoinKey(): string {
  return `gjk_${crypto.randomBytes(10).toString("hex")}`;
}

function resolveGuestJoinKey(joinKeyInput: unknown, keysDoc: GuestKeysDoc): GuestKeyEntry | null {
  const joinKey = clipText(joinKeyInput, 120).trim();
  if (!joinKey) return null;
  const hit = keysDoc.keys.find((k) => k.join_key === joinKey);
  if (!hit || hit.revoked) return null;
  return hit;
}

function readLatestMemoryEntry(agentId: string, category: MemoryCategory): { item: MemoryEntry | null; skipped_invalid: number; truncated: boolean } {
  const p = memoryCategoryPath(agentId, category);
  if (!fs.existsSync(p)) return { item: null, skipped_invalid: 0, truncated: false };
  const raw = readFileTailUtf8(p, FILE_CAP);
  let text = raw.text;
  if (raw.truncated) {
    const newline = text.indexOf("\n");
    if (newline >= 0) text = text.slice(newline + 1);
  }
  const lines = text.split(/\r?\n/).filter((x) => !!x);
  let skipped = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const item = sanitizeMemoryEntry(JSON.parse(lines[i]));
      if (!item) {
        skipped += 1;
        continue;
      }
      if (item.agent_id === agentId && item.category === category) {
        return { item, skipped_invalid: skipped, truncated: raw.truncated };
      }
    } catch {
      skipped += 1;
    }
  }
  return { item: null, skipped_invalid: skipped, truncated: raw.truncated };
}

function parseHeartbeatParams(body: unknown, allowedAgentIds: Set<string>): HeartbeatParams {
  if (!isRecord(body)) throw new Error("heartbeat.payload_invalid");
  const agentRaw = String(body.agent_id || "").trim();
  const categoryRaw = String(body.category || "").trim();
  if (!agentRaw) throw new Error("heartbeat.agent_id_required");
  if (!(agentRaw === "all" || allowedAgentIds.has(agentRaw))) throw new Error("heartbeat.agent_id_invalid");
  if (!isMemoryCategory(categoryRaw)) throw new Error("heartbeat.category_invalid");

  const activityLimitRaw = Number(body.activity_limit ?? HEARTBEAT_ACTIVITY_LIMIT_DEFAULT);
  const inboxLimitRaw = Number(body.inbox_limit ?? HEARTBEAT_INBOX_LIMIT_DEFAULT);
  const runsLimitRaw = Number(body.runs_limit ?? HEARTBEAT_RUNS_LIMIT_DEFAULT);
  if (!Number.isFinite(activityLimitRaw)) throw new Error("heartbeat.activity_limit_invalid");
  if (!Number.isFinite(inboxLimitRaw)) throw new Error("heartbeat.inbox_limit_invalid");
  if (!Number.isFinite(runsLimitRaw)) throw new Error("heartbeat.runs_limit_invalid");

  return {
    agent_id: agentRaw,
    category: categoryRaw,
    activity_limit: Math.max(1, Math.min(HEARTBEAT_ACTIVITY_LIMIT_MAX, Math.floor(activityLimitRaw))),
    inbox_limit: Math.max(1, Math.min(HEARTBEAT_INBOX_LIMIT_MAX, Math.floor(inboxLimitRaw))),
    runs_limit: Math.max(1, Math.min(HEARTBEAT_RUNS_LIMIT_MAX, Math.floor(runsLimitRaw))),
    dry_run: body.dry_run === true,
  };
}

function readActivityEventsForHeartbeat(limitInput: number): { items: ActivityEvent[]; skipped_invalid: number; truncated: boolean } {
  const limit = Math.max(1, Math.min(Number(limitInput || HEARTBEAT_ACTIVITY_LIMIT_DEFAULT), HEARTBEAT_ACTIVITY_LIMIT_MAX));
  if (!fs.existsSync(ACTIVITY_PATH)) return { items: [], skipped_invalid: 0, truncated: false };
  const raw = readFileTailUtf8(ACTIVITY_PATH, FILE_CAP);
  let text = raw.text;
  if (raw.truncated) {
    const newline = text.indexOf("\n");
    if (newline >= 0) text = text.slice(newline + 1);
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  const out: ActivityEvent[] = [];
  let skipped = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const event = sanitizeActivityEvent(JSON.parse(lines[i]));
      if (!event) {
        skipped += 1;
        continue;
      }
      out.push(event);
      if (out.length >= limit) break;
    } catch {
      skipped += 1;
    }
  }
  return { items: out, skipped_invalid: skipped, truncated: raw.truncated };
}

function readInboxItemsForHeartbeat(limitInput: number): { items: InboxItem[]; skipped_invalid: number; truncated: boolean } {
  const limit = Math.max(1, Math.min(Number(limitInput || HEARTBEAT_INBOX_LIMIT_DEFAULT), HEARTBEAT_INBOX_LIMIT_MAX));
  if (!fs.existsSync(INBOX_PATH)) return { items: [], skipped_invalid: 0, truncated: false };
  const raw = readFileTailUtf8(INBOX_PATH, FILE_CAP);
  let text = raw.text;
  if (raw.truncated) {
    const newline = text.indexOf("\n");
    if (newline >= 0) text = text.slice(newline + 1);
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  const out: InboxItem[] = [];
  let skipped = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = sanitizeInboxItem(JSON.parse(lines[i]));
      if (!parsed || !parsed.id || !parsed.ts) {
        skipped += 1;
        continue;
      }
      out.push(parsed);
      if (out.length >= limit) break;
    } catch {
      skipped += 1;
    }
  }
  return { items: out, skipped_invalid: skipped, truncated: raw.truncated };
}

function readRunsForHeartbeat(limitInput: number): Array<{ run_id: string; status: string; error_code: string }> {
  const limit = Math.max(1, Math.min(Number(limitInput || HEARTBEAT_RUNS_LIMIT_DEFAULT), HEARTBEAT_RUNS_LIMIT_MAX));
  const rows = listRuns(limit).slice(0, limit);
  const out: Array<{ run_id: string; status: string; error_code: string }> = [];
  for (const row of rows) {
    const run_id = clipText(row.run_id, 160).trim();
    if (!run_id) continue;
    const result = loadRunResultYaml(run_id);
    const status = clipText(result?.metadata?.status, 40).trim() || "unknown";
    const error_code = clipText(result?.outcome?.errors?.[0]?.code, 80).trim();
    out.push({ run_id, status, error_code });
  }
  return out;
}

function formatHeartbeatTitle(now: Date): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `Heartbeat ${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function composeHeartbeatBody(input: {
  agent_id: string;
  category: MemoryCategory;
  activity: { items: ActivityEvent[]; skipped_invalid: number; truncated: boolean };
  inbox: { items: InboxItem[]; skipped_invalid: number; truncated: boolean };
  runs: Array<{ run_id: string; status: string; error_code: string }>;
  notes: string[];
}): string {
  const lines: string[] = [];
  lines.push("Summary");
  lines.push(`- agent_id=${input.agent_id}`);
  lines.push(`- category=${input.category}`);
  lines.push(`- activity_count=${input.activity.items.length} truncated=${input.activity.truncated ? "yes" : "no"} skipped_invalid=${input.activity.skipped_invalid}`);
  lines.push(`- inbox_count=${input.inbox.items.length} truncated=${input.inbox.truncated ? "yes" : "no"} skipped_invalid=${input.inbox.skipped_invalid}`);
  lines.push(`- runs_count=${input.runs.length}`);
  lines.push("");
  lines.push("Recent Activity");
  if (!input.activity.items.length) lines.push("- (none)");
  for (const a of input.activity.items) {
    lines.push(`- ${a.ts} | ${a.event_type} | ${clipText(a.title, 80)} | actor=${clipText(a.actor_id, 40) || "-"}`);
  }
  lines.push("");
  lines.push("Recent Inbox");
  if (!input.inbox.items.length) lines.push("- (none)");
  for (const i of input.inbox.items) {
    lines.push(`- ${i.ts} | ${clipText(i.title, 80) || "(no title)"} | source=${clipText(i.source, 40) || "-"} | mention=${i.mention ? "yes" : "no"}`);
  }
  lines.push("");
  lines.push("Recent Runs");
  if (!input.runs.length) lines.push("- (none)");
  for (const r of input.runs) {
    lines.push(`- ${r.run_id} | status=${r.status}${r.error_code ? ` | error_code=${r.error_code}` : ""}`);
  }
  lines.push("");
  lines.push("Notes");
  if (!input.notes.length) lines.push("- (none)");
  for (const n of input.notes) lines.push(`- ${n}`);
  return clipText(lines.join("\n"), MEMORY_BODY_MAX);
}

function appendHeartbeatInboxEntry(input: {
  agent_id: string;
  category: MemoryCategory;
  memory_id: string;
  request_id: string;
}): boolean {
  try {
    const item: Record<string, unknown> = {
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: "heartbeat",
      msg_id: clipText(input.memory_id, 120),
      role: "system",
      mention: false,
      title: "Heartbeat done",
      body: clipText(`Heartbeat done: agent_id=${input.agent_id} category=${input.category} memory_id=${input.memory_id}`, 2000),
      source: "heartbeat",
      links: {
        request_id: clipText(input.request_id, 120),
        run_id: "",
        design_id: "",
        artifact_paths: [],
      },
      note: "",
    };
    appendInboxEntry(item);
    appendActivity({
      event_type: "inbox_append",
      actor_id: "system",
      title: "Inbox appended",
      summary: `source=heartbeat request_id=${clipText(input.request_id, 120)}`,
      refs: { request_id: clipText(input.request_id, 120) },
    });
    return true;
  } catch {
    return false;
  }
}

function runHeartbeat(input: HeartbeatParams): {
  request_id: string;
  dry_run: boolean;
  planned_entry?: MemoryEntry;
  created_entry?: MemoryEntry;
  truncated: { activity: boolean; inbox: boolean };
  sources_counts: { activity: number; inbox: number; runs: number };
  notes: string[];
} {
  const request_id = randomId("heartbeat_request");
  const notes: string[] = [];
  const activity = readActivityEventsForHeartbeat(input.activity_limit);
  const inbox = readInboxItemsForHeartbeat(input.inbox_limit);
  const runs = readRunsForHeartbeat(input.runs_limit);
  if (activity.truncated) notes.push("activity_tail_truncated_to_256kb");
  if (inbox.truncated) notes.push("inbox_tail_truncated_to_256kb");

  const now = new Date();
  const title = formatHeartbeatTitle(now);
  const body = composeHeartbeatBody({
    agent_id: input.agent_id,
    category: input.category,
    activity,
    inbox,
    runs,
    notes,
  });
  const memoryAgentId = input.agent_id === "all" ? "facilitator" : input.agent_id;

  const plannedEntry: MemoryEntry = {
    id: `mem_planned_${now.getTime()}`,
    ts: now.toISOString(),
    agent_id: memoryAgentId,
    category: input.category,
    title,
    body,
    tags: ["heartbeat"],
    source: "system",
    refs: { request_id },
  };

  if (input.dry_run) {
    return {
      request_id,
      dry_run: true,
      planned_entry: plannedEntry,
      truncated: { activity: activity.truncated, inbox: inbox.truncated },
      sources_counts: { activity: activity.items.length, inbox: inbox.items.length, runs: runs.length },
      notes,
    };
  }

  let created: MemoryEntry | undefined;
  try {
    created = appendMemoryEntry(memoryAgentId, input.category, {
      title,
      body,
      tags: ["heartbeat"],
      source: "system",
      refs: { request_id },
    });
  } catch (e: any) {
    notes.push(`memory_append_failed:${String(e?.message || "unknown")}`);
  }

  if (created) {
    const suggested = upsertHeartbeatAutopilotSuggestion({
      agent_id: memoryAgentId,
      category: input.category,
      heartbeat_memory_id: created.id,
      memory_body: created.body,
      activity_items: activity.items,
      inbox_items: inbox.items,
      runs,
    });
    if (!suggested) notes.push("heartbeat_suggestion_failed");
    if (suggested) {
      try {
        const auto = maybeAutoAcceptSuggestion(suggested);
        if (auto.auto_started) {
          notes.push(`heartbeat_suggestion_auto_started:${auto.autopilot_run_id || ""}`);
        } else {
          notes.push(`heartbeat_suggestion_auto_skipped:${auto.reason}`);
        }
      } catch (e: any) {
        notes.push(`heartbeat_suggestion_auto_error:${String(e?.message || "unknown")}`);
      }
    }
  }

  try {
    appendActivity({
      event_type: "heartbeat",
      actor_id: input.agent_id === "all" ? "system" : input.agent_id,
      title: "Heartbeat appended",
      summary: `${input.agent_id}/${input.category}: ${title}`,
      refs: { request_id },
    });
  } catch {
    notes.push("heartbeat_activity_emit_failed");
  }

  if (created) {
    const inboxOk = appendHeartbeatInboxEntry({
      agent_id: input.agent_id,
      category: input.category,
      memory_id: created.id,
      request_id,
    });
    if (!inboxOk) notes.push("heartbeat_inbox_append_failed");
  } else {
    notes.push("heartbeat_inbox_skipped_no_memory_entry");
  }

  return {
    request_id,
    dry_run: false,
    created_entry: created,
    truncated: { activity: activity.truncated, inbox: inbox.truncated },
    sources_counts: { activity: activity.items.length, inbox: inbox.items.length, runs: runs.length },
    notes,
  };
}

function defaultHeartbeatSettings(): HeartbeatSettings {
  return {
    version: 1,
    enabled: true,
    timezone: "Asia/Tokyo",
    schedule: {
      mode: "daily_time",
      daily_time: "09:00",
      jitter_sec: 30,
      tick_interval_sec: 15,
    },
    targets: {
      agent_ids: ["facilitator"],
      category: "episodes",
    },
    limits: {
      max_per_day: 1,
      activity_limit: HEARTBEAT_ACTIVITY_LIMIT_DEFAULT,
      inbox_limit: HEARTBEAT_INBOX_LIMIT_DEFAULT,
      runs_limit: HEARTBEAT_RUNS_LIMIT_DEFAULT,
    },
    safety: {
      lock_stale_sec: HEARTBEAT_LOCK_STALE_SEC_DEFAULT,
      global_timeout_sec: 30,
      max_consecutive_failures: 5,
      backoff_base_sec: HEARTBEAT_BACKOFF_BASE_DEFAULT,
      backoff_max_sec: HEARTBEAT_BACKOFF_MAX_DEFAULT,
    },
  };
}

function defaultHeartbeatPerTargetState(): HeartbeatPerTargetState {
  return {
    last_run_local_date: null,
    run_count_today: 0,
    last_ok_at: null,
    last_fail_at: null,
    failure_count: 0,
    backoff_until: null,
    last_request_id: "",
    last_result: "skipped",
    last_note: "",
  };
}

function defaultHeartbeatState(): HeartbeatState {
  return {
    version: 1,
    enabled_effective: true,
    last_tick_at: null,
    next_run_at: null,
    lock: { held: false, owner_pid: 0, started_at: null, note: "" },
    per_target: {},
  };
}

function heartbeatTargetKey(agentId: string, category: MemoryCategory): string {
  return `${agentId}::${category}`;
}

function ensureHeartbeatPerTargetState(state: HeartbeatState, agentId: string, category: MemoryCategory): HeartbeatPerTargetState {
  const key = heartbeatTargetKey(agentId, category);
  const current = isRecord(state.per_target) && isRecord(state.per_target[key]) ? state.per_target[key] : null;
  if (!current) {
    state.per_target[key] = defaultHeartbeatPerTargetState();
    return state.per_target[key];
  }
  const next: HeartbeatPerTargetState = {
    last_run_local_date: current.last_run_local_date ? clipText(current.last_run_local_date, 20) : null,
    run_count_today: Math.max(0, Math.min(99, Number((current as any).run_count_today || 0))),
    last_ok_at: current.last_ok_at ? clipText(current.last_ok_at, 80) : null,
    last_fail_at: current.last_fail_at ? clipText(current.last_fail_at, 80) : null,
    failure_count: Math.max(0, Math.min(999, Number(current.failure_count || 0))),
    backoff_until: current.backoff_until ? clipText(current.backoff_until, 80) : null,
    last_request_id: clipText(current.last_request_id, 120),
    last_result: current.last_result === "ok" || current.last_result === "fail" ? current.last_result : "skipped",
    last_note: clipText(current.last_note, 400),
  };
  state.per_target[key] = next;
  return next;
}

function sanitizeHeartbeatSettings(input: unknown, allowedAgentIds: Set<string>): HeartbeatSettings {
  const defaults = defaultHeartbeatSettings();
  const src = isRecord(input) ? input : {};
  const out: HeartbeatSettings = JSON.parse(JSON.stringify(defaults));
  if (src.version !== undefined) out.version = 1;
  if (src.enabled !== undefined) out.enabled = src.enabled === true;
  if (src.timezone !== undefined) out.timezone = clipText(src.timezone, 64).trim() || defaults.timezone;

  const schedule = isRecord(src.schedule) ? src.schedule : {};
  const daily = clipText(schedule.daily_time, 5).trim() || defaults.schedule.daily_time;
  if (!/^\d{2}:\d{2}$/.test(daily)) throw new Error("heartbeat.settings.daily_time_invalid");
  const hh = Number(daily.slice(0, 2));
  const mm = Number(daily.slice(3, 5));
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    throw new Error("heartbeat.settings.daily_time_invalid");
  }
  out.schedule = {
    mode: "daily_time",
    daily_time: daily,
    jitter_sec: Math.max(0, Math.min(HEARTBEAT_JITTER_SEC_MAX, Math.floor(Number(schedule.jitter_sec ?? defaults.schedule.jitter_sec) || 0))),
    tick_interval_sec: Math.max(HEARTBEAT_TICK_SEC_MIN, Math.min(HEARTBEAT_TICK_SEC_MAX, Math.floor(Number(schedule.tick_interval_sec ?? defaults.schedule.tick_interval_sec) || defaults.schedule.tick_interval_sec))),
  };

  const targets = isRecord(src.targets) ? src.targets : {};
  const inIds = Array.isArray(targets.agent_ids) ? targets.agent_ids : defaults.targets.agent_ids;
  const cleanIds: string[] = [];
  for (const row of inIds) {
    const id = normalizeMemoryAgentId(row);
    if (!id || !allowedAgentIds.has(id)) continue;
    if (cleanIds.includes(id)) continue;
    cleanIds.push(id);
    if (cleanIds.length >= 20) break;
  }
  if (!cleanIds.length) cleanIds.push(defaults.targets.agent_ids[0]);
  const categoryRaw = String(targets.category || defaults.targets.category);
  if (!isMemoryCategory(categoryRaw)) throw new Error("heartbeat.settings.category_invalid");
  out.targets = { agent_ids: cleanIds, category: categoryRaw };

  const limits = isRecord(src.limits) ? src.limits : {};
  const maxPerDay = Number(limits.max_per_day ?? defaults.limits.max_per_day);
  if (!Number.isFinite(maxPerDay) || maxPerDay < HEARTBEAT_MAX_PER_DAY_MIN || maxPerDay > HEARTBEAT_MAX_PER_DAY_MAX) {
    throw new Error("heartbeat.settings.max_per_day_invalid");
  }
  out.limits = {
    max_per_day: Math.floor(maxPerDay),
    activity_limit: Math.max(1, Math.min(HEARTBEAT_ACTIVITY_LIMIT_MAX, Math.floor(Number(limits.activity_limit ?? defaults.limits.activity_limit) || defaults.limits.activity_limit))),
    inbox_limit: Math.max(1, Math.min(HEARTBEAT_INBOX_LIMIT_MAX, Math.floor(Number(limits.inbox_limit ?? defaults.limits.inbox_limit) || defaults.limits.inbox_limit))),
    runs_limit: Math.max(1, Math.min(HEARTBEAT_RUNS_LIMIT_MAX, Math.floor(Number(limits.runs_limit ?? defaults.limits.runs_limit) || defaults.limits.runs_limit))),
  };

  const safety = isRecord(src.safety) ? src.safety : {};
  out.safety = {
    lock_stale_sec: Math.max(30, Math.min(3600, Math.floor(Number(safety.lock_stale_sec ?? defaults.safety.lock_stale_sec) || defaults.safety.lock_stale_sec))),
    global_timeout_sec: Math.max(5, Math.min(300, Math.floor(Number(safety.global_timeout_sec ?? defaults.safety.global_timeout_sec) || defaults.safety.global_timeout_sec))),
    max_consecutive_failures: Math.max(1, Math.min(20, Math.floor(Number(safety.max_consecutive_failures ?? defaults.safety.max_consecutive_failures) || defaults.safety.max_consecutive_failures))),
    backoff_base_sec: Math.max(5, Math.min(3600, Math.floor(Number(safety.backoff_base_sec ?? defaults.safety.backoff_base_sec) || defaults.safety.backoff_base_sec))),
    backoff_max_sec: Math.max(5, Math.min(86400, Math.floor(Number(safety.backoff_max_sec ?? defaults.safety.backoff_max_sec) || defaults.safety.backoff_max_sec))),
  };
  if (out.safety.backoff_max_sec < out.safety.backoff_base_sec) out.safety.backoff_max_sec = out.safety.backoff_base_sec;
  return out;
}

function mergeHeartbeatSettings(current: HeartbeatSettings, patch: unknown, allowedAgentIds: Set<string>): HeartbeatSettings {
  if (!isRecord(patch)) throw new Error("heartbeat.settings_payload_invalid");
  const merged: Record<string, unknown> = JSON.parse(JSON.stringify(current));
  for (const [k, v] of Object.entries(patch)) merged[k] = v;
  if (isRecord(patch.schedule)) merged.schedule = { ...(isRecord(current.schedule) ? current.schedule : {}), ...patch.schedule };
  if (isRecord(patch.targets)) merged.targets = { ...(isRecord(current.targets) ? current.targets : {}), ...patch.targets };
  if (isRecord(patch.limits)) merged.limits = { ...(isRecord(current.limits) ? current.limits : {}), ...patch.limits };
  if (isRecord(patch.safety)) merged.safety = { ...(isRecord(current.safety) ? current.safety : {}), ...patch.safety };
  return sanitizeHeartbeatSettings(merged, allowedAgentIds);
}

function loadHeartbeatSettings(allowedAgentIds: Set<string>): HeartbeatSettings {
  const defaults = sanitizeHeartbeatSettings(defaultHeartbeatSettings(), allowedAgentIds);
  if (!fs.existsSync(HEARTBEAT_SETTINGS_PATH)) {
    writeJsonAtomic(HEARTBEAT_SETTINGS_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(HEARTBEAT_SETTINGS_PATH, defaults);
  try {
    const parsed = sanitizeHeartbeatSettings(raw, allowedAgentIds);
    writeJsonAtomic(HEARTBEAT_SETTINGS_PATH, parsed);
    return parsed;
  } catch {
    writeJsonAtomic(HEARTBEAT_SETTINGS_PATH, defaults);
    return defaults;
  }
}

function loadHeartbeatState(): HeartbeatState {
  const defaults = defaultHeartbeatState();
  if (!fs.existsSync(HEARTBEAT_STATE_PATH)) {
    writeJsonAtomic(HEARTBEAT_STATE_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(HEARTBEAT_STATE_PATH, defaults);
  if (!isRecord(raw)) {
    writeJsonAtomic(HEARTBEAT_STATE_PATH, defaults);
    return defaults;
  }
  const lockIn = isRecord(raw.lock) ? raw.lock : {};
  const out: HeartbeatState = {
    version: 1,
    enabled_effective: raw.enabled_effective !== false,
    last_tick_at: raw.last_tick_at ? clipText(raw.last_tick_at, 80) : null,
    next_run_at: raw.next_run_at ? clipText(raw.next_run_at, 80) : null,
    lock: {
      held: lockIn.held === true,
      owner_pid: Math.max(0, Math.floor(Number(lockIn.owner_pid || 0))),
      started_at: lockIn.started_at ? clipText(lockIn.started_at, 80) : null,
      note: clipText(lockIn.note, 200),
    },
    per_target: {},
  };
  const perTarget = isRecord(raw.per_target) ? raw.per_target : {};
  for (const [k, v] of Object.entries(perTarget)) {
    if (!isRecord(v)) continue;
    out.per_target[clipText(k, 120)] = {
      last_run_local_date: v.last_run_local_date ? clipText(v.last_run_local_date, 20) : null,
      run_count_today: Math.max(0, Math.min(99, Math.floor(Number((v as any).run_count_today || 0)))),
      last_ok_at: v.last_ok_at ? clipText(v.last_ok_at, 80) : null,
      last_fail_at: v.last_fail_at ? clipText(v.last_fail_at, 80) : null,
      failure_count: Math.max(0, Math.min(999, Math.floor(Number(v.failure_count || 0)))),
      backoff_until: v.backoff_until ? clipText(v.backoff_until, 80) : null,
      last_request_id: clipText(v.last_request_id, 120),
      last_result: v.last_result === "ok" || v.last_result === "fail" ? v.last_result : "skipped",
      last_note: clipText(v.last_note, 400),
    };
  }
  return out;
}

function saveHeartbeatState(state: HeartbeatState): void {
  writeJsonAtomic(HEARTBEAT_STATE_PATH, state);
}

function defaultHeartbeatAutopilotSuggestionStore(): HeartbeatAutopilotSuggestionStore {
  return { version: 1, items: [] };
}

function defaultHeartbeatAutopilotSuggestSettings(): HeartbeatAutopilotSuggestSettings {
  return {
    version: 2,
    auto_accept_enabled: false,
    facilitator_only: true,
    category_allowlist: ["episodes"],
    rank_allowlist: [1],
    max_per_day: 1,
    cooldown_sec: 1800,
    max_consecutive_failures: 3,
  };
}

function loadHeartbeatAutopilotSuggestSettings(): HeartbeatAutopilotSuggestSettings {
  const defaults = defaultHeartbeatAutopilotSuggestSettings();
  if (!fs.existsSync(HEARTBEAT_SUGGEST_SETTINGS_PATH)) {
    writeJsonAtomic(HEARTBEAT_SUGGEST_SETTINGS_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(HEARTBEAT_SUGGEST_SETTINGS_PATH, defaults);
  if (!isRecord(raw)) {
    writeJsonAtomic(HEARTBEAT_SUGGEST_SETTINGS_PATH, defaults);
    return defaults;
  }
  const categoryAllowIn = Array.isArray(raw.category_allowlist) ? raw.category_allowlist : defaults.category_allowlist;
  const category_allowlist: MemoryCategory[] = [];
  for (const row of categoryAllowIn) {
    if (isMemoryCategory(row)) category_allowlist.push(row);
  }
  const rankAllowIn = Array.isArray(raw.rank_allowlist) ? raw.rank_allowlist : defaults.rank_allowlist;
  const rank_allowlist: HeartbeatSuggestionRank[] = [];
  for (const row of rankAllowIn) {
    const n = Math.floor(Number(row));
    if (isHeartbeatSuggestionRank(n)) rank_allowlist.push(n);
  }
  return {
    version: 2,
    auto_accept_enabled: raw.auto_accept_enabled === true,
    facilitator_only: raw.facilitator_only !== false,
    category_allowlist: category_allowlist.length ? category_allowlist.slice(0, 3) : defaults.category_allowlist,
    rank_allowlist: rank_allowlist.length ? rank_allowlist.slice(0, 3) : defaults.rank_allowlist,
    max_per_day: Math.max(HEARTBEAT_SUGGEST_MAX_PER_DAY_MIN, Math.min(HEARTBEAT_SUGGEST_MAX_PER_DAY_MAX, Math.floor(Number(raw.max_per_day || defaults.max_per_day)))),
    cooldown_sec: Math.max(HEARTBEAT_SUGGEST_COOLDOWN_SEC_MIN, Math.min(HEARTBEAT_SUGGEST_COOLDOWN_SEC_MAX, Math.floor(Number(raw.cooldown_sec || defaults.cooldown_sec)))),
    max_consecutive_failures: Math.max(
      HEARTBEAT_SUGGEST_MAX_FAILURES_MIN,
      Math.min(HEARTBEAT_SUGGEST_MAX_FAILURES_MAX, Math.floor(Number(raw.max_consecutive_failures || defaults.max_consecutive_failures))),
    ),
  };
}

function mergeHeartbeatAutopilotSuggestSettings(
  current: HeartbeatAutopilotSuggestSettings,
  patchRaw: unknown,
): HeartbeatAutopilotSuggestSettings {
  if (!isRecord(patchRaw)) throw new Error("heartbeat_suggest.settings_invalid");
  const out: HeartbeatAutopilotSuggestSettings = {
    ...current,
    category_allowlist: [...current.category_allowlist],
    rank_allowlist: [...current.rank_allowlist],
  };
  if (patchRaw.auto_accept_enabled !== undefined) {
    if (typeof patchRaw.auto_accept_enabled !== "boolean") throw new Error("heartbeat_suggest.auto_accept_enabled_invalid");
    out.auto_accept_enabled = patchRaw.auto_accept_enabled;
  }
  if (patchRaw.facilitator_only !== undefined) {
    if (typeof patchRaw.facilitator_only !== "boolean") throw new Error("heartbeat_suggest.facilitator_only_invalid");
    out.facilitator_only = patchRaw.facilitator_only;
  }
  if (patchRaw.category_allowlist !== undefined) {
    if (!Array.isArray(patchRaw.category_allowlist)) throw new Error("heartbeat_suggest.category_allowlist_invalid");
    const categories: MemoryCategory[] = [];
    for (const row of patchRaw.category_allowlist) {
      if (!isMemoryCategory(row)) throw new Error("heartbeat_suggest.category_allowlist_invalid");
      categories.push(row);
    }
    if (!categories.length) throw new Error("heartbeat_suggest.category_allowlist_empty");
    out.category_allowlist = categories.slice(0, 3);
  }
  if (patchRaw.rank_allowlist !== undefined) {
    if (!Array.isArray(patchRaw.rank_allowlist)) throw new Error("heartbeat_suggest.rank_allowlist_invalid");
    const ranks: HeartbeatSuggestionRank[] = [];
    for (const row of patchRaw.rank_allowlist) {
      const n = Math.floor(Number(row));
      if (!isHeartbeatSuggestionRank(n)) throw new Error("heartbeat_suggest.rank_allowlist_invalid");
      ranks.push(n);
    }
    if (!ranks.length) throw new Error("heartbeat_suggest.rank_allowlist_empty");
    out.rank_allowlist = ranks.slice(0, 3);
  }
  if (patchRaw.max_per_day !== undefined) {
    const n = Number(patchRaw.max_per_day);
    if (!Number.isFinite(n)) throw new Error("heartbeat_suggest.max_per_day_invalid");
    out.max_per_day = Math.max(HEARTBEAT_SUGGEST_MAX_PER_DAY_MIN, Math.min(HEARTBEAT_SUGGEST_MAX_PER_DAY_MAX, Math.floor(n)));
  }
  if (patchRaw.cooldown_sec !== undefined) {
    const n = Number(patchRaw.cooldown_sec);
    if (!Number.isFinite(n)) throw new Error("heartbeat_suggest.cooldown_sec_invalid");
    out.cooldown_sec = Math.max(HEARTBEAT_SUGGEST_COOLDOWN_SEC_MIN, Math.min(HEARTBEAT_SUGGEST_COOLDOWN_SEC_MAX, Math.floor(n)));
  }
  if (patchRaw.max_consecutive_failures !== undefined) {
    const n = Number(patchRaw.max_consecutive_failures);
    if (!Number.isFinite(n)) throw new Error("heartbeat_suggest.max_consecutive_failures_invalid");
    out.max_consecutive_failures = Math.max(HEARTBEAT_SUGGEST_MAX_FAILURES_MIN, Math.min(HEARTBEAT_SUGGEST_MAX_FAILURES_MAX, Math.floor(n)));
  }
  out.version = 2;
  return out;
}

function defaultHeartbeatAutopilotSuggestState(): HeartbeatAutopilotSuggestState {
  return {
    version: 2,
    auto_accept_enabled_effective: true,
    last_auto_accept_at: null,
    last_auto_accept_local_date: null,
    auto_accept_count_today: 0,
    failure_count: 0,
    last_error: "",
    last_suggestion_id: null,
    last_autopilot_run_id: null,
  };
}

function loadHeartbeatAutopilotSuggestState(): HeartbeatAutopilotSuggestState {
  const defaults = defaultHeartbeatAutopilotSuggestState();
  if (!fs.existsSync(HEARTBEAT_SUGGEST_STATE_PATH)) {
    writeJsonAtomic(HEARTBEAT_SUGGEST_STATE_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(HEARTBEAT_SUGGEST_STATE_PATH, defaults);
  if (!isRecord(raw)) {
    writeJsonAtomic(HEARTBEAT_SUGGEST_STATE_PATH, defaults);
    return defaults;
  }
  return {
    version: 2,
    auto_accept_enabled_effective: raw.auto_accept_enabled_effective !== false,
    last_auto_accept_at: raw.last_auto_accept_at ? clipText(raw.last_auto_accept_at, 80).trim() : null,
    last_auto_accept_local_date: raw.last_auto_accept_local_date ? clipText(raw.last_auto_accept_local_date, 20).trim() : null,
    auto_accept_count_today: Math.max(0, Math.min(99, Math.floor(Number(raw.auto_accept_count_today || 0)))),
    failure_count: Math.max(0, Math.min(99, Math.floor(Number(raw.failure_count || 0)))),
    last_error: clipText(raw.last_error, 400),
    last_suggestion_id: raw.last_suggestion_id ? clipText(raw.last_suggestion_id, 120).trim() : null,
    last_autopilot_run_id: raw.last_autopilot_run_id ? clipText(raw.last_autopilot_run_id, 120).trim() : null,
  };
}

function saveHeartbeatAutopilotSuggestState(state: HeartbeatAutopilotSuggestState): void {
  writeJsonAtomic(HEARTBEAT_SUGGEST_STATE_PATH, state);
}

function isHeartbeatSuggestionRank(v: unknown): v is HeartbeatSuggestionRank {
  return v === 1 || v === 2 || v === 3;
}

function sanitizeHeartbeatSuggestionCandidate(input: unknown, fallbackRank: HeartbeatSuggestionRank): HeartbeatAutopilotSuggestionCandidate | null {
  if (!isRecord(input)) return null;
  const rankRaw = Number(input.rank);
  const rank: HeartbeatSuggestionRank = isHeartbeatSuggestionRank(rankRaw) ? rankRaw : fallbackRank;
  const topic = clipText(input.topic, HEARTBEAT_SUGGESTION_TOPIC_MAX).trim();
  const context = clipText(input.context, HEARTBEAT_SUGGESTION_CONTEXT_MAX).trim();
  const rationale = clipText(input.rationale, HEARTBEAT_SUGGESTION_RATIONALE_MAX).trim();
  if (!topic || !context || !rationale) return null;
  const tagsIn = Array.isArray(input.tags) ? input.tags : [];
  const tags: string[] = [];
  for (const row of tagsIn) {
    const t = clipText(row, MEMORY_TAG_MAX).trim();
    if (!t) continue;
    tags.push(t);
    if (tags.length >= HEARTBEAT_SUGGESTION_TAGS_MAX) break;
  }
  return { rank, topic, context, rationale, tags };
}

function buildHeartbeatSuggestionPresetCandidates(): {
  preset_candidates: HeartbeatSuggestionPresetCandidate[];
  recommended_profile_snapshot: { preset_set_id: string; display_name: string; rationale: string; computed_at: string };
} {
  const presetIndex = loadPresetIndex();
  const recommended = computeRecommendedProfile();
  const rank1Id = normalizeRecommendedPresetId(recommended.preset_set_id, presetIndex);
  const rankedFallbacks = ["harsh_critic", "ops_first", "standard"];
  const out: HeartbeatSuggestionPresetCandidate[] = [];
  out.push({
    rank: 1,
    preset_set_id: rank1Id,
    display_name: presetIndex.displayNameById.get(rank1Id) || rank1Id,
    source: "recommended_profile",
  });
  for (const idRaw of rankedFallbacks) {
    if (out.length >= HEARTBEAT_SUGGESTION_PRESET_CANDIDATES_MAX) break;
    const id = normalizeRecommendedPresetId(idRaw, presetIndex);
    if (!id || id === rank1Id || out.some((x) => x.preset_set_id === id)) continue;
    out.push({
      rank: (out.length + 1) as HeartbeatSuggestionRank,
      preset_set_id: id,
      display_name: presetIndex.displayNameById.get(id) || id,
      source: "static",
    });
    if (out.length >= HEARTBEAT_SUGGESTION_PRESET_CANDIDATES_MAX) break;
  }
  return {
    preset_candidates: out,
    recommended_profile_snapshot: {
      preset_set_id: rank1Id,
      display_name: presetIndex.displayNameById.get(rank1Id) || rank1Id,
      rationale: clipText(recommended.rationale, 300),
      computed_at: clipText(recommended.computed_at, 80),
    },
  };
}

function sanitizeHeartbeatSuggestionPresetCandidate(input: unknown, fallbackRank: HeartbeatSuggestionRank): HeartbeatSuggestionPresetCandidate | null {
  if (!isRecord(input)) return null;
  const rawRank = Number(input.rank);
  const rank = isHeartbeatSuggestionRank(Math.floor(rawRank)) ? (Math.floor(rawRank) as HeartbeatSuggestionRank) : fallbackRank;
  const preset_set_id = clipText(input.preset_set_id, 80).trim().toLowerCase();
  if (!preset_set_id) return null;
  const display_name = clipText(input.display_name, 120).trim();
  const sourceRaw = clipText(input.source, 40).trim();
  const source = sourceRaw === "recommended_profile" || sourceRaw === "static" ? sourceRaw : undefined;
  return { rank, preset_set_id, display_name: display_name || undefined, source };
}

function extractSuggestionKeywordsFromTitles(input: { activityTitles: string[]; inboxTitles: string[] }): string[] {
  const tally = new Map<string, number>();
  const tokenRe = /[A-Za-z0-9_]{3,}|[一-龠々〆〤ぁ-んァ-ヶー]{2,}/g;
  const pushTokens = (line: string) => {
    const src = String(line || "").trim();
    if (!src) return;
    const matches = src.match(tokenRe) || [];
    for (const m of matches) {
      const token = clipText(m, 64).trim().toLowerCase();
      if (!token) continue;
      tally.set(token, (tally.get(token) || 0) + 1);
    }
  };
  for (const t of input.activityTitles) pushTokens(t);
  for (const t of input.inboxTitles) pushTokens(t);
  const sorted = [...tally.entries()].sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
  return sorted.slice(0, HEARTBEAT_SUGGESTION_KEYWORDS_MAX).map(([k]) => k);
}

function buildHeartbeatSuggestionContext(memoryBody: string): string {
  const lines = String(memoryBody || "").split(/\r?\n/).map((x) => x.trim()).filter((x) => !!x);
  const picked: string[] = [];
  for (const ln of lines) {
    picked.push(ln);
    if (picked.length >= 12) break;
  }
  return clipText(picked.join("\n"), HEARTBEAT_SUGGESTION_CONTEXT_MAX);
}

function buildRankedHeartbeatSuggestionCandidates(input: {
  agent_id: string;
  category: MemoryCategory;
  memory_body: string;
  activity_items: ActivityEvent[];
  inbox_items: InboxItem[];
  runs: Array<{ run_id: string; status: string; error_code: string }>;
}): HeartbeatAutopilotSuggestionCandidate[] {
  const baseContext = buildHeartbeatSuggestionContext(input.memory_body);
  const activityTitles = input.activity_items.map((x) => clipText(x.title, 200));
  const inboxTitles = input.inbox_items.map((x) => clipText(x.title, 200));
  const keywords = extractSuggestionKeywordsFromTitles({ activityTitles, inboxTitles });
  const hasFailures = input.runs.some((r) => r.status === "failed" || !!r.error_code || String(r.status).toLowerCase().includes("fail"));
  const hasMentions = input.inbox_items.some((x) => x.mention === true);
  const summaryLine = `signals activity=${input.activity_items.length} inbox=${input.inbox_items.length} runs=${input.runs.length} failures=${hasFailures ? "yes" : "no"} mentions=${hasMentions ? "yes" : "no"} keywords=${keywords.join(",") || "-"}`;
  const tagsCommon = ["heartbeat", ...keywords.slice(0, 3)].slice(0, HEARTBEAT_SUGGESTION_TAGS_MAX);
  const contextFor = (focus: string): string => clipText(`${baseContext}\n\nFocus\n- ${focus}\n- ${summaryLine}`, HEARTBEAT_SUGGESTION_CONTEXT_MAX);
  const agentAndCategory = `${input.agent_id}/${input.category}`;

  const rank1: HeartbeatAutopilotSuggestionCandidate = {
    rank: 1,
    topic: clipText(`今日の状況確認と次の一手（${agentAndCategory}）`, HEARTBEAT_SUGGESTION_TOPIC_MAX),
    context: contextFor("今日の優先事項を3つに絞り、実行順を決める"),
    rationale: clipText("活動/通知/実行結果の要約から、今日の優先事項を確定する。", HEARTBEAT_SUGGESTION_RATIONALE_MAX),
    tags: tagsCommon,
  };
  const rank2: HeartbeatAutopilotSuggestionCandidate = hasFailures ? {
    rank: 2,
    topic: clipText(`失敗の原因究明と復旧計画（${agentAndCategory}）`, HEARTBEAT_SUGGESTION_TOPIC_MAX),
    context: contextFor("直近失敗の原因候補、暫定対処、恒久対策を切り分ける"),
    rationale: clipText("直近の失敗を放置すると後続が詰まるため。", HEARTBEAT_SUGGESTION_RATIONALE_MAX),
    tags: [...tagsCommon, "recovery"].slice(0, HEARTBEAT_SUGGESTION_TAGS_MAX),
  } : hasMentions ? {
    rank: 2,
    topic: clipText(`未読/mentionの整理と優先順位付け（${agentAndCategory}）`, HEARTBEAT_SUGGESTION_TOPIC_MAX),
    context: contextFor("未読項目を重要度で並べ替え、今日処理する範囲を決める"),
    rationale: clipText("重要通知の取りこぼしを防ぎ、対応順を明確化するため。", HEARTBEAT_SUGGESTION_RATIONALE_MAX),
    tags: [...tagsCommon, "triage"].slice(0, HEARTBEAT_SUGGESTION_TAGS_MAX),
  } : {
    rank: 2,
    topic: clipText(`明日の準備（release/evidence/ops確認）（${agentAndCategory}）`, HEARTBEAT_SUGGESTION_TOPIC_MAX),
    context: contextFor("次の提出/運用に向けた不足物と確認順序を決める"),
    rationale: clipText("事前確認で手戻りを減らし、明日の実行を安定化するため。", HEARTBEAT_SUGGESTION_RATIONALE_MAX),
    tags: [...tagsCommon, "prep"].slice(0, HEARTBEAT_SUGGESTION_TAGS_MAX),
  };
  const rank3: HeartbeatAutopilotSuggestionCandidate = {
    rank: 3,
    topic: clipText(`手順/知識の整理（Memory蒸留）（${agentAndCategory}）`, HEARTBEAT_SUGGESTION_TOPIC_MAX),
    context: contextFor("今日の発見を再利用可能な手順と知識へ要約する"),
    rationale: clipText("今日の発見を手順化して再現性を上げるため。", HEARTBEAT_SUGGESTION_RATIONALE_MAX),
    tags: [...tagsCommon, "memory"].slice(0, HEARTBEAT_SUGGESTION_TAGS_MAX),
  };
  return [rank1, rank2, rank3].slice(0, HEARTBEAT_SUGGESTION_CANDIDATES_MAX);
}

function sanitizeHeartbeatAutopilotSuggestionItem(input: unknown): HeartbeatAutopilotSuggestionItem | null {
  if (!isRecord(input)) return null;
  const statusRaw = String(input.status || "");
  const status: HeartbeatSuggestionStatus = statusRaw === "accepted" || statusRaw === "dismissed" ? statusRaw : "open";
  const categoryRaw = String(input.category || "");
  if (!isMemoryCategory(categoryRaw)) return null;
  const id = clipText(input.id, 120).trim();
  if (!id) return null;
  const selectedRankRaw = Number(input.selected_rank);
  const selected_rank: HeartbeatSuggestionRank | null = isHeartbeatSuggestionRank(selectedRankRaw) ? selectedRankRaw : null;
  const rawPresetCandidates = Array.isArray(input.preset_candidates) ? input.preset_candidates : [];
  const preset_candidates: HeartbeatSuggestionPresetCandidate[] = [];
  for (let i = 0; i < rawPresetCandidates.length; i += 1) {
    const candidate = sanitizeHeartbeatSuggestionPresetCandidate(rawPresetCandidates[i], ((i + 1) as HeartbeatSuggestionRank));
    if (!candidate) continue;
    const rank = Math.max(1, Math.min(HEARTBEAT_SUGGESTION_PRESET_CANDIDATES_MAX, candidate.rank)) as HeartbeatSuggestionRank;
    preset_candidates.push({ ...candidate, rank });
    if (preset_candidates.length >= HEARTBEAT_SUGGESTION_PRESET_CANDIDATES_MAX) break;
  }
  const selectedPresetSetId = clipText(input.selected_preset_set_id, 80).trim().toLowerCase();
  let recommended_profile_snapshot: { preset_set_id: string; display_name: string; rationale: string; computed_at: string } | undefined;
  if (isRecord(input.recommended_profile_snapshot)) {
    const preset_set_id = clipText(input.recommended_profile_snapshot.preset_set_id, 80).trim().toLowerCase();
    const display_name = clipText(input.recommended_profile_snapshot.display_name, 120).trim();
    const rationale = clipText(input.recommended_profile_snapshot.rationale, 300).trim();
    const computed_at = clipText(input.recommended_profile_snapshot.computed_at, 80).trim();
    if (preset_set_id) {
      recommended_profile_snapshot = {
        preset_set_id,
        display_name: display_name || preset_set_id,
        rationale,
        computed_at: computed_at || nowIso(),
      };
    }
  }
  const presetApplyStatusRaw = clipText(input.preset_apply_status, 40).trim();
  const preset_apply_status: HeartbeatSuggestionPresetApplyStatus =
    presetApplyStatusRaw === "preview_ok" || presetApplyStatusRaw === "applied" || presetApplyStatusRaw === "failed"
      ? presetApplyStatusRaw
      : "not_applied";
  let preset_apply_error: { reason: string; details?: string } | undefined;
  if (isRecord(input.preset_apply_error)) {
    const reason = clipText(input.preset_apply_error.reason, 120).trim();
    const details = clipText(input.preset_apply_error.details, 300).trim();
    if (reason) {
      preset_apply_error = { reason, details: details || undefined };
    }
  }
  const rawCandidates = Array.isArray(input.candidates) ? input.candidates : [];
  const candidates: HeartbeatAutopilotSuggestionCandidate[] = [];
  for (let i = 0; i < rawCandidates.length; i += 1) {
    const candidate = sanitizeHeartbeatSuggestionCandidate(rawCandidates[i], ((i + 1) as HeartbeatSuggestionRank));
    if (!candidate) continue;
    const rank = Math.max(1, Math.min(HEARTBEAT_SUGGESTION_CANDIDATES_MAX, candidate.rank)) as HeartbeatSuggestionRank;
    candidates.push({ ...candidate, rank });
    if (candidates.length >= HEARTBEAT_SUGGESTION_CANDIDATES_MAX) break;
  }
  const legacyTopic = clipText(input.topic, HEARTBEAT_SUGGESTION_TOPIC_MAX).trim();
  const legacyContext = clipText(input.context, HEARTBEAT_SUGGESTION_CONTEXT_MAX).trim();
  if (!candidates.length && legacyTopic && legacyContext) {
    candidates.push({
      rank: 1,
      topic: legacyTopic,
      context: legacyContext,
      rationale: "legacy_suggestion",
      tags: [],
    });
  }
  const fallback = candidates[0] || {
    rank: 1 as HeartbeatSuggestionRank,
    topic: legacyTopic || "今日の状況確認と次の一手",
    context: legacyContext || "Summary unavailable",
    rationale: "fallback",
    tags: [],
  };
  return {
    id,
    ts: clipText(input.ts, 80).trim() || nowIso(),
    local_date: clipText(input.local_date, 20).trim() || localDateYmd(new Date()),
    agent_id: clipText(input.agent_id, 80).trim(),
    category: categoryRaw,
    heartbeat_memory_id: clipText(input.heartbeat_memory_id, 120).trim(),
    topic: fallback.topic,
    context: fallback.context,
    candidates,
    selected_rank,
    preset_candidates,
    recommended_profile_snapshot,
    selected_preset_set_id: selectedPresetSetId || null,
    preset_apply_status,
    preset_apply_error,
    status,
    accepted_at: input.accepted_at ? clipText(input.accepted_at, 80).trim() : null,
    dismissed_at: input.dismissed_at ? clipText(input.dismissed_at, 80).trim() : null,
    autopilot_run_id: input.autopilot_run_id ? clipText(input.autopilot_run_id, 120).trim() : null,
  };
}

function loadHeartbeatAutopilotSuggestionStore(): HeartbeatAutopilotSuggestionStore {
  const defaults = defaultHeartbeatAutopilotSuggestionStore();
  if (!fs.existsSync(HEARTBEAT_SUGGESTIONS_PATH)) {
    writeJsonAtomic(HEARTBEAT_SUGGESTIONS_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(HEARTBEAT_SUGGESTIONS_PATH, defaults);
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    writeJsonAtomic(HEARTBEAT_SUGGESTIONS_PATH, defaults);
    return defaults;
  }
  const items: HeartbeatAutopilotSuggestionItem[] = [];
  for (const row of raw.items) {
    const item = sanitizeHeartbeatAutopilotSuggestionItem(row);
    if (!item) continue;
    items.push(item);
    if (items.length >= HEARTBEAT_SUGGESTIONS_LIMIT_MAX) break;
  }
  return { version: 1, items };
}

function saveHeartbeatAutopilotSuggestionStore(store: HeartbeatAutopilotSuggestionStore): void {
  const sorted = [...store.items].sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, HEARTBEAT_SUGGESTIONS_LIMIT_MAX);
  writeJsonAtomic(HEARTBEAT_SUGGESTIONS_PATH, { version: 1, items: sorted });
}

function appendHeartbeatSuggestionInboxEntry(item: HeartbeatAutopilotSuggestionItem): void {
  try {
    const short = item.candidates
      .slice(0, HEARTBEAT_SUGGESTION_CANDIDATES_MAX)
      .map((c) => `Pick ${c.rank}: ${clipText(c.rationale, 72)}`)
      .join(" / ");
    const entry = {
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: "heartbeat",
      msg_id: item.id,
      role: "system",
      mention: false,
      title: "Autopilot suggestion",
      body: clipText(`${item.agent_id}/${item.category} heartbeat done. Click to review/launch.\n${short}`, 2000),
      source: "heartbeat_suggest",
      links: {
        suggestion_id: item.id,
        agent_id: item.agent_id,
        category: item.category,
        heartbeat_memory_id: item.heartbeat_memory_id,
        artifact_paths: [],
      },
    };
    appendInboxEntry(entry);
  } catch {
    // best-effort
  }
}

function upsertHeartbeatAutopilotSuggestion(input: {
  agent_id: string;
  category: MemoryCategory;
  heartbeat_memory_id: string;
  memory_body: string;
  activity_items: ActivityEvent[];
  inbox_items: InboxItem[];
  runs: Array<{ run_id: string; status: string; error_code: string }>;
}): HeartbeatAutopilotSuggestionItem | null {
  try {
    const store = loadHeartbeatAutopilotSuggestionStore();
    const localDate = localDateYmd(new Date());
    const existing = store.items.find((x) => x.local_date === localDate && x.agent_id === input.agent_id && x.category === input.category && x.status === "open");
    if (existing) return existing;
    const candidates = buildRankedHeartbeatSuggestionCandidates({
      agent_id: input.agent_id,
      category: input.category,
      memory_body: input.memory_body,
      activity_items: input.activity_items,
      inbox_items: input.inbox_items,
      runs: input.runs,
    });
    const presetBundle = buildHeartbeatSuggestionPresetCandidates();
    const rank1 = candidates[0] || {
      rank: 1 as HeartbeatSuggestionRank,
      topic: clipText(`今日の状況確認と次の一手（${input.agent_id}/${input.category}）`, HEARTBEAT_SUGGESTION_TOPIC_MAX),
      context: buildHeartbeatSuggestionContext(input.memory_body),
      rationale: "fallback",
      tags: [],
    };
    const item: HeartbeatAutopilotSuggestionItem = {
      id: `sug_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      local_date: localDate,
      agent_id: clipText(input.agent_id, 80),
      category: input.category,
      heartbeat_memory_id: clipText(input.heartbeat_memory_id, 120),
      topic: rank1.topic,
      context: rank1.context,
      candidates,
      preset_candidates: presetBundle.preset_candidates,
      recommended_profile_snapshot: presetBundle.recommended_profile_snapshot,
      selected_rank: null,
      selected_preset_set_id: null,
      preset_apply_status: "not_applied",
      status: "open",
      accepted_at: null,
      dismissed_at: null,
      autopilot_run_id: null,
    };
    store.items.push(item);
    saveHeartbeatAutopilotSuggestionStore(store);
    appendHeartbeatSuggestionInboxEntry(item);
    return item;
  } catch {
    return null;
  }
}

function startCouncilRunInternal(input: {
  topic: string;
  constraints: string;
  thread_id?: string;
  max_rounds?: number;
  auto_build?: boolean;
  auto_ops_snapshot?: boolean;
  auto_evidence_bundle?: boolean;
  auto_release_bundle?: boolean;
  dry_run?: boolean;
}): CouncilRunRecord {
  const topic = clipText(input.topic, COUNCIL_TOPIC_MAX).trim();
  if (!topic) throw new Error("council_run.topic_required");
  const constraints = clipText(input.constraints, COUNCIL_CONSTRAINTS_MAX);
  const thread_id = clipText(input.thread_id, 120).trim() || "general";
  const maxRoundsInput = Number(input.max_rounds ?? 1);
  if (!Number.isFinite(maxRoundsInput)) throw new Error("council_run.max_rounds_invalid");
  const max_rounds = Math.max(1, Math.min(COUNCIL_MAX_ROUNDS_MAX, Math.floor(maxRoundsInput)));
  const auto_build = Boolean(input.auto_build === true);
  const autoOpsSnapshotFlag = input.auto_ops_snapshot === true;
  const autoEvidenceBundleFlag = input.auto_evidence_bundle === true;
  const autoReleaseBundleFlag = input.auto_release_bundle === true;
  const now = nowIso();
  const run_id = randomId("council");
  const request_id = randomId("council_request");
  const threadKey = makeCouncilAutopilotThreadKey({
    request_id,
    run_id,
    mode: input.dry_run === true ? "preview" : "execute",
  });
  const run: CouncilRunRecord = {
    run_id,
    request_id,
    topic,
    constraints,
    max_rounds,
    auto_build,
    thread_id,
    status: "queued",
    created_at: now,
    updated_at: now,
    step_count: 0,
    current_step: 0,
    current_role: "",
    retries: 0,
    last_captured_msg: "",
    stop_requested: false,
    can_resume: false,
    quality_check: { passed: false, failures: [] },
    reflection: { attempts: 0, max_attempts: 1, last_reflection_at: null },
    finalization: { mode: "normal", final_answer_version: 1 },
    exports: {
      auto_ops_snapshot: autoOpsSnapshotFlag,
      auto_evidence_bundle: autoEvidenceBundleFlag,
      auto_release_bundle: autoReleaseBundleFlag,
      ops_snapshot_request_id: null,
      evidence_bundle_request_id: null,
      release_bundle_request_id: null,
      release_bundle_status: autoReleaseBundleFlag ? "queued" : "disabled",
      release_bundle_run_id: null,
      kicked_at: {},
      status: {
        ops_snapshot: autoOpsSnapshotFlag ? "queued" : "disabled",
        evidence_bundle: autoEvidenceBundleFlag ? "queued" : "disabled",
      },
    },
    thread_key: threadKey.thread_key,
    thread_key_source: threadKey.source,
  };
  if (input.dry_run === true) return run;
  saveCouncilRunRecord(run);
  writeCouncilRunRequest(run);
  appendActivity({
    event_type: "council_started",
    actor_id: "council_autopilot",
    title: "Council autopilot started",
    summary: `run_id=${run_id} thread_id=${thread_id} rounds=${max_rounds}`,
    refs: { thread_id, run_id, request_id },
  });
  appendCouncilAutopilotInboxEntry({
    source: "council_autopilot",
    title: "Autopilot started",
    body: `topic=${clipText(topic, 240)} / max_rounds=${max_rounds} / actor=council_autopilot`,
    run,
  });
  return run;
}

function resolveSuggestionPresetSetId(input: {
  item: HeartbeatAutopilotSuggestionItem;
  selected_rank: HeartbeatSuggestionRank;
  requested_preset_rank?: HeartbeatSuggestionRank;
  requested_preset_set_id?: string;
}): { preset_set_id: string; reason: string } {
  const explicitPresetId = clipText(input.requested_preset_set_id, 80).trim().toLowerCase();
  if (explicitPresetId) return { preset_set_id: explicitPresetId, reason: "explicit" };
  const byPresetRank = input.requested_preset_rank
    ? (input.item.preset_candidates || []).find((p) => p.rank === input.requested_preset_rank)
    : null;
  if (byPresetRank?.preset_set_id) return { preset_set_id: byPresetRank.preset_set_id, reason: "preset_rank" };
  const bySelectedRank = (input.item.preset_candidates || []).find((p) => p.rank === input.selected_rank);
  if (bySelectedRank?.preset_set_id) return { preset_set_id: bySelectedRank.preset_set_id, reason: "rank" };
  return { preset_set_id: "", reason: "missing" };
}

function acceptHeartbeatSuggestionInternal(input: {
  suggestion_id: string;
  rank: HeartbeatSuggestionRank;
  dry_run?: boolean;
  preset_rank?: HeartbeatSuggestionRank;
  preset_set_id?: string;
  apply_preset?: boolean;
  actor_id?: string;
}): {
  ok: boolean;
  suggestion: HeartbeatAutopilotSuggestionItem | null;
  autopilot_run_id: string;
  idempotent: boolean;
  dry_run: boolean;
  autopilot_started: boolean;
  selected_preset_set_id?: string | null;
  preset_apply_status?: HeartbeatSuggestionPresetApplyStatus;
  preset_apply_result?: ReturnType<typeof applyAgentPresetInternal> | null;
  note?: string;
} {
  const dryRun = input.dry_run === true;
  const shouldApplyPreset = input.apply_preset !== false;
  const store = loadHeartbeatAutopilotSuggestionStore();
  const item = store.items.find((x) => x.id === input.suggestion_id);
  if (!item) return { ok: false, suggestion: null, autopilot_run_id: "", idempotent: false, dry_run: dryRun, autopilot_started: false, note: "suggestion_not_found" };
  const selectedCandidate =
    item.candidates.find((c) => c.rank === input.rank) ||
    item.candidates.find((c) => c.rank === 1) ||
    item.candidates[0];
  if (!selectedCandidate) return { ok: false, suggestion: item, autopilot_run_id: "", idempotent: false, dry_run: dryRun, autopilot_started: false, note: "candidate_missing" };
  if (!dryRun && item.status === "accepted" && item.autopilot_run_id) {
    return {
      ok: true,
      suggestion: item,
      autopilot_run_id: item.autopilot_run_id,
      idempotent: true,
      dry_run: false,
      autopilot_started: false,
      selected_preset_set_id: item.selected_preset_set_id || null,
      preset_apply_status: item.preset_apply_status || "not_applied",
      preset_apply_result: null,
    };
  }

  const rankForPreset = input.preset_rank && isHeartbeatSuggestionRank(input.preset_rank) ? input.preset_rank : undefined;
  const chosenPreset = shouldApplyPreset
    ? resolveSuggestionPresetSetId({
      item,
      selected_rank: selectedCandidate.rank,
      requested_preset_rank: rankForPreset,
      requested_preset_set_id: input.preset_set_id,
    })
    : { preset_set_id: "", reason: "skip_apply" };
  const selectedPresetSetId = chosenPreset.preset_set_id;
  let presetApplyResult: ReturnType<typeof applyAgentPresetInternal> | null = null;
  if (shouldApplyPreset && selectedPresetSetId) {
    presetApplyResult = applyAgentPresetInternal({
      preset_set_id: selectedPresetSetId,
      scope: "council",
      dry_run: dryRun,
      actor_id: input.actor_id || "ui_discord",
    });
    item.selected_preset_set_id = selectedPresetSetId;
    if (!presetApplyResult.ok) {
      item.preset_apply_status = "failed";
      item.preset_apply_error = { reason: clipText(presetApplyResult.note, 120).trim() || "ERR_PRESET_APPLY_FAILED" };
      saveHeartbeatAutopilotSuggestionStore(store);
      return {
        ok: false,
        suggestion: item,
        autopilot_run_id: "",
        idempotent: false,
        dry_run: dryRun,
        autopilot_started: false,
        selected_preset_set_id: selectedPresetSetId,
        preset_apply_status: "failed",
        preset_apply_result: presetApplyResult,
        note: "ERR_PRESET_APPLY_FAILED",
      };
    }
    item.preset_apply_error = undefined;
    item.preset_apply_status = dryRun ? "preview_ok" : "applied";
  } else if (dryRun) {
    item.preset_apply_status = "not_applied";
    item.preset_apply_error = undefined;
  }

  if (dryRun) {
    item.selected_rank = selectedCandidate.rank;
    saveHeartbeatAutopilotSuggestionStore(store);
    return {
      ok: true,
      suggestion: item,
      autopilot_run_id: "",
      idempotent: false,
      dry_run: true,
      autopilot_started: false,
      selected_preset_set_id: selectedPresetSetId || null,
      preset_apply_status: item.preset_apply_status || "not_applied",
      preset_apply_result: presetApplyResult,
      note: selectedPresetSetId ? "preview_ok" : "preset_skipped",
    };
  }
  try {
    const run = startCouncilRunInternal({
      topic: selectedCandidate.topic,
      constraints: selectedCandidate.context,
      thread_id: "general",
      max_rounds: 1,
      auto_build: false,
      auto_ops_snapshot: true,
      auto_evidence_bundle: false,
      auto_release_bundle: false,
    });
    item.topic = selectedCandidate.topic;
    item.context = selectedCandidate.context;
    item.selected_rank = selectedCandidate.rank;
    item.status = "accepted";
    item.accepted_at = nowIso();
    item.autopilot_run_id = run.run_id;
    saveHeartbeatAutopilotSuggestionStore(store);
    return {
      ok: true,
      suggestion: item,
      autopilot_run_id: run.run_id,
      idempotent: false,
      dry_run: false,
      autopilot_started: true,
      selected_preset_set_id: selectedPresetSetId || null,
      preset_apply_status: item.preset_apply_status || "not_applied",
      preset_apply_result: presetApplyResult,
    };
  } catch (e: any) {
    return {
      ok: false,
      suggestion: item,
      autopilot_run_id: "",
      idempotent: false,
      dry_run: false,
      autopilot_started: false,
      selected_preset_set_id: selectedPresetSetId || null,
      preset_apply_status: item.preset_apply_status || "not_applied",
      preset_apply_result: presetApplyResult,
      note: String(e?.message || "accept_failed"),
    };
  }
}

function appendHeartbeatSuggestAutoStopInboxEntry(note: string): void {
  try {
    const settings = loadDesktopSettings();
    const mentionToken = getMentionToken(settings);
    const item = {
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: "heartbeat",
      msg_id: randomId("heartbeat_suggest_auto_stop"),
      role: "system",
      mention: true,
      title: "Autopilot auto-accept stopped",
      body: clipText(`${mentionToken} heartbeat_suggest auto-accept stopped due to consecutive failures. ${note}`, 2000),
      source: "heartbeat_suggest_auto",
      links: { artifact_paths: [] },
    };
    appendInboxEntry(item);
  } catch {
    // best-effort
  }
}

function maybeAutoAcceptSuggestion(item: HeartbeatAutopilotSuggestionItem): {
  auto_started: boolean;
  reason: string;
  autopilot_run_id?: string;
} {
  const settings = loadHeartbeatAutopilotSuggestSettings();
  const state = loadHeartbeatAutopilotSuggestState();
  const now = new Date();
  const localDate = localDateYmd(now);
  if (state.last_auto_accept_local_date !== localDate) {
    state.auto_accept_count_today = 0;
    state.last_auto_accept_local_date = localDate;
  }
  const fail = (reason: string): { auto_started: false; reason: string } => {
    state.failure_count = Math.max(0, state.failure_count + 1);
    state.last_error = clipText(reason, 400);
    if (state.failure_count >= settings.max_consecutive_failures) {
      state.auto_accept_enabled_effective = false;
      appendHeartbeatSuggestAutoStopInboxEntry(`max_consecutive_failures=${settings.max_consecutive_failures} last_error=${state.last_error}`);
    }
    saveHeartbeatAutopilotSuggestState(state);
    return { auto_started: false, reason };
  };
  const skip = (reason: string): { auto_started: false; reason: string } => {
    state.last_error = clipText(reason, 400);
    saveHeartbeatAutopilotSuggestState(state);
    return { auto_started: false, reason };
  };

  if (!settings.auto_accept_enabled) return skip("auto_accept_disabled");
  if (!state.auto_accept_enabled_effective) return skip("auto_accept_disabled_effective");
  if (settings.facilitator_only !== true) return skip("facilitator_only_not_enabled");
  if (item.agent_id !== "facilitator") return skip("not_facilitator");
  if (item.category !== "episodes") return skip("category_not_episodes");
  if (!settings.category_allowlist.includes(item.category)) return skip("category_not_allowed");
  if (!settings.rank_allowlist.includes(1)) return skip("rank1_not_allowed");
  if (state.auto_accept_count_today >= settings.max_per_day) return skip("max_per_day_reached");
  if (state.last_auto_accept_at) {
    const prevMs = new Date(state.last_auto_accept_at).getTime();
    const nowMs = now.getTime();
    if (Number.isFinite(prevMs) && nowMs - prevMs < settings.cooldown_sec * 1000) return skip("cooldown_active");
  }

  const accepted = acceptHeartbeatSuggestionInternal({ suggestion_id: item.id, rank: 1, apply_preset: false });
  if (!accepted.ok || !accepted.suggestion || !accepted.autopilot_run_id) {
    return fail(`auto_accept_failed:${accepted.note || "unknown"}`);
  }

  state.auto_accept_count_today = Math.max(0, state.auto_accept_count_today + 1);
  state.last_auto_accept_at = nowIso();
  state.last_auto_accept_local_date = localDate;
  state.failure_count = 0;
  state.last_error = "";
  state.last_suggestion_id = item.id;
  state.last_autopilot_run_id = accepted.autopilot_run_id;
  state.auto_accept_enabled_effective = true;
  saveHeartbeatAutopilotSuggestState(state);

  try {
    const inbox = {
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: "heartbeat",
      msg_id: item.id,
      role: "system",
      mention: false,
      title: "Autopilot auto-started",
      body: clipText("Auto-accepted rank1 (facilitator/episodes) once/day", 2000),
      source: "heartbeat_suggest_auto",
      links: { suggestion_id: item.id, autopilot_run_id: accepted.autopilot_run_id, run_id: accepted.autopilot_run_id, artifact_paths: [] },
    };
    appendInboxEntry(inbox);
  } catch {
    // best-effort
  }
  try {
    appendActivity({
      event_type: "autopilot_auto_start",
      actor_id: "facilitator",
      title: "Autopilot auto-started",
      summary: `suggestion_id=${item.id} run_id=${accepted.autopilot_run_id}`,
      refs: { run_id: accepted.autopilot_run_id },
    });
  } catch {
    // best-effort
  }
  return { auto_started: true, reason: accepted.idempotent ? "idempotent" : "auto_started", autopilot_run_id: accepted.autopilot_run_id };
}

function defaultConsolidationSettings(): ConsolidationSettings {
  return {
    version: 1,
    enabled: true,
    schedule: { mode: "daily_time", daily_time: "23:30", tick_interval_sec: 30, jitter_sec: 60 },
    targets: {
      agent_ids: ["facilitator", "design", "impl", "qa", "jester"],
      source_category: "episodes",
      output_categories: ["knowledge", "procedures"],
    },
    limits: { max_episodes_per_day: 30, max_lines_per_output: 30, max_body_chars: 4000 },
    safety: {
      lock_stale_sec: 600,
      cooldown_sec: 600,
      max_per_day: 1,
      backoff_base_sec: 60,
      backoff_max_sec: 1800,
      max_consecutive_failures: 3,
    },
  };
}

function defaultConsolidationState(): ConsolidationState {
  return {
    version: 1,
    enabled_effective: true,
    last_tick_at: null,
    next_run_at: null,
    failure_count: 0,
    backoff_until: null,
    per_agent: {},
  };
}

function ensureConsolidationPerAgent(state: ConsolidationState, agentId: string): ConsolidationPerAgentState {
  const cur = isRecord(state.per_agent) && isRecord(state.per_agent[agentId]) ? state.per_agent[agentId] : null;
  if (!cur) {
    const next: ConsolidationPerAgentState = {
      last_run_local_date: null,
      last_run_at: null,
      last_result: "skipped",
      last_note: "",
      last_outputs: { knowledge_id: null, procedures_id: null },
    };
    state.per_agent[agentId] = next;
    return next;
  }
  const next: ConsolidationPerAgentState = {
    last_run_local_date: cur.last_run_local_date ? clipText(cur.last_run_local_date, 20) : null,
    last_run_at: cur.last_run_at ? clipText(cur.last_run_at, 80) : null,
    last_result: cur.last_result === "ok" || cur.last_result === "fail" ? cur.last_result : "skipped",
    last_note: clipText(cur.last_note, 400),
    last_outputs: {
      knowledge_id: cur.last_outputs?.knowledge_id ? clipText(cur.last_outputs.knowledge_id, 120) : null,
      procedures_id: cur.last_outputs?.procedures_id ? clipText(cur.last_outputs.procedures_id, 120) : null,
    },
  };
  state.per_agent[agentId] = next;
  return next;
}

function sanitizeConsolidationSettings(input: unknown, allowedAgentIds: Set<string>): ConsolidationSettings {
  const defaults = defaultConsolidationSettings();
  const src = isRecord(input) ? input : {};
  const out: ConsolidationSettings = JSON.parse(JSON.stringify(defaults));
  out.enabled = src.enabled !== undefined ? src.enabled === true : defaults.enabled;
  const schedule = isRecord(src.schedule) ? src.schedule : {};
  const daily = clipText(schedule.daily_time, 5).trim() || defaults.schedule.daily_time;
  if (!/^\d{2}:\d{2}$/.test(daily)) throw new Error("consolidation.settings.daily_time_invalid");
  const hh = Number(daily.slice(0, 2)); const mm = Number(daily.slice(3, 5));
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) throw new Error("consolidation.settings.daily_time_invalid");
  out.schedule = {
    mode: "daily_time",
    daily_time: daily,
    tick_interval_sec: Math.max(CONSOLIDATION_TICK_SEC_MIN, Math.min(CONSOLIDATION_TICK_SEC_MAX, Math.floor(Number(schedule.tick_interval_sec ?? defaults.schedule.tick_interval_sec) || defaults.schedule.tick_interval_sec))),
    jitter_sec: Math.max(0, Math.min(CONSOLIDATION_JITTER_SEC_MAX, Math.floor(Number(schedule.jitter_sec ?? defaults.schedule.jitter_sec) || 0))),
  };
  const targets = isRecord(src.targets) ? src.targets : {};
  const idsIn = Array.isArray(targets.agent_ids) ? targets.agent_ids : defaults.targets.agent_ids;
  const cleanIds: string[] = [];
  for (const row of idsIn) {
    const id = normalizeMemoryAgentId(row);
    if (!id || !allowedAgentIds.has(id) || cleanIds.includes(id)) continue;
    cleanIds.push(id);
    if (cleanIds.length >= 20) break;
  }
  if (!cleanIds.length) cleanIds.push("facilitator");
  out.targets = {
    agent_ids: cleanIds,
    source_category: "episodes",
    output_categories: ["knowledge", "procedures"],
  };
  const limits = isRecord(src.limits) ? src.limits : {};
  out.limits = {
    max_episodes_per_day: Math.max(1, Math.min(CONSOLIDATION_MAX_EPISODES_MAX, Math.floor(Number(limits.max_episodes_per_day ?? defaults.limits.max_episodes_per_day) || defaults.limits.max_episodes_per_day))),
    max_lines_per_output: Math.max(1, Math.min(CONSOLIDATION_MAX_LINES_MAX, Math.floor(Number(limits.max_lines_per_output ?? defaults.limits.max_lines_per_output) || defaults.limits.max_lines_per_output))),
    max_body_chars: Math.max(400, Math.min(CONSOLIDATION_MAX_BODY_CHARS_MAX, Math.floor(Number(limits.max_body_chars ?? defaults.limits.max_body_chars) || defaults.limits.max_body_chars))),
  };
  const safety = isRecord(src.safety) ? src.safety : {};
  out.safety = {
    lock_stale_sec: Math.max(30, Math.min(3600, Math.floor(Number(safety.lock_stale_sec ?? defaults.safety.lock_stale_sec) || defaults.safety.lock_stale_sec))),
    cooldown_sec: Math.max(60, Math.min(86400, Math.floor(Number(safety.cooldown_sec ?? defaults.safety.cooldown_sec) || defaults.safety.cooldown_sec))),
    max_per_day: Math.max(1, Math.min(5, Math.floor(Number(safety.max_per_day ?? defaults.safety.max_per_day) || defaults.safety.max_per_day))),
    backoff_base_sec: Math.max(5, Math.min(3600, Math.floor(Number(safety.backoff_base_sec ?? defaults.safety.backoff_base_sec) || defaults.safety.backoff_base_sec))),
    backoff_max_sec: Math.max(5, Math.min(86400, Math.floor(Number(safety.backoff_max_sec ?? defaults.safety.backoff_max_sec) || defaults.safety.backoff_max_sec))),
    max_consecutive_failures: Math.max(1, Math.min(20, Math.floor(Number(safety.max_consecutive_failures ?? defaults.safety.max_consecutive_failures) || defaults.safety.max_consecutive_failures))),
  };
  if (out.safety.backoff_max_sec < out.safety.backoff_base_sec) out.safety.backoff_max_sec = out.safety.backoff_base_sec;
  return out;
}

function mergeConsolidationSettings(current: ConsolidationSettings, patch: unknown, allowedAgentIds: Set<string>): ConsolidationSettings {
  if (!isRecord(patch)) throw new Error("consolidation.settings_payload_invalid");
  const merged: Record<string, unknown> = JSON.parse(JSON.stringify(current));
  for (const [k, v] of Object.entries(patch)) merged[k] = v;
  if (isRecord(patch.schedule)) merged.schedule = { ...(isRecord(current.schedule) ? current.schedule : {}), ...patch.schedule };
  if (isRecord(patch.targets)) merged.targets = { ...(isRecord(current.targets) ? current.targets : {}), ...patch.targets };
  if (isRecord(patch.limits)) merged.limits = { ...(isRecord(current.limits) ? current.limits : {}), ...patch.limits };
  if (isRecord(patch.safety)) merged.safety = { ...(isRecord(current.safety) ? current.safety : {}), ...patch.safety };
  return sanitizeConsolidationSettings(merged, allowedAgentIds);
}

function loadConsolidationSettings(allowedAgentIds: Set<string>): ConsolidationSettings {
  const defaults = sanitizeConsolidationSettings(defaultConsolidationSettings(), allowedAgentIds);
  if (!fs.existsSync(CONSOLIDATION_SETTINGS_PATH)) {
    writeJsonAtomic(CONSOLIDATION_SETTINGS_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(CONSOLIDATION_SETTINGS_PATH, defaults);
  try {
    const parsed = sanitizeConsolidationSettings(raw, allowedAgentIds);
    writeJsonAtomic(CONSOLIDATION_SETTINGS_PATH, parsed);
    return parsed;
  } catch {
    writeJsonAtomic(CONSOLIDATION_SETTINGS_PATH, defaults);
    return defaults;
  }
}

function loadConsolidationState(): ConsolidationState {
  const defaults = defaultConsolidationState();
  if (!fs.existsSync(CONSOLIDATION_STATE_PATH)) {
    writeJsonAtomic(CONSOLIDATION_STATE_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(CONSOLIDATION_STATE_PATH, defaults);
  if (!isRecord(raw)) {
    writeJsonAtomic(CONSOLIDATION_STATE_PATH, defaults);
    return defaults;
  }
  const out: ConsolidationState = {
    version: 1,
    enabled_effective: raw.enabled_effective !== false,
    last_tick_at: raw.last_tick_at ? clipText(raw.last_tick_at, 80) : null,
    next_run_at: raw.next_run_at ? clipText(raw.next_run_at, 80) : null,
    failure_count: Math.max(0, Math.min(99, Math.floor(Number(raw.failure_count || 0)))),
    backoff_until: raw.backoff_until ? clipText(raw.backoff_until, 80) : null,
    per_agent: {},
  };
  const per = isRecord(raw.per_agent) ? raw.per_agent : {};
  for (const [k, v] of Object.entries(per)) {
    if (!isRecord(v)) continue;
    out.per_agent[clipText(k, 80)] = {
      last_run_local_date: v.last_run_local_date ? clipText(v.last_run_local_date, 20) : null,
      last_run_at: v.last_run_at ? clipText(v.last_run_at, 80) : null,
      last_result: v.last_result === "ok" || v.last_result === "fail" ? v.last_result : "skipped",
      last_note: clipText(v.last_note, 400),
      last_outputs: {
        knowledge_id: v.last_outputs && isRecord(v.last_outputs) && v.last_outputs.knowledge_id ? clipText(v.last_outputs.knowledge_id, 120) : null,
        procedures_id: v.last_outputs && isRecord(v.last_outputs) && v.last_outputs.procedures_id ? clipText(v.last_outputs.procedures_id, 120) : null,
      },
    };
  }
  return out;
}

function saveConsolidationState(state: ConsolidationState): void {
  writeJsonAtomic(CONSOLIDATION_STATE_PATH, state);
}

function readConsolidationLock(): HeartbeatLockRecord | null {
  if (!fs.existsSync(CONSOLIDATION_LOCK_PATH)) return null;
  try {
    const raw = readJson<unknown>(CONSOLIDATION_LOCK_PATH, null);
    if (!isRecord(raw)) return null;
    return {
      owner_pid: Math.max(0, Math.floor(Number(raw.owner_pid || 0))),
      started_at: clipText(raw.started_at, 80).trim(),
      purpose: clipText(raw.purpose, 120).trim(),
    };
  } catch {
    return null;
  }
}

function tryAcquireConsolidationLock(purpose: string): boolean {
  const rec = { owner_pid: process.pid, started_at: nowIso(), purpose: clipText(purpose, 120) };
  const tmp = `${CONSOLIDATION_LOCK_PATH}.tmp_${process.pid}_${Date.now()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(rec, null, 2), { encoding: "utf8", flag: "wx" });
    if (fs.existsSync(CONSOLIDATION_LOCK_PATH)) {
      try { fs.unlinkSync(tmp); } catch {}
      return false;
    }
    fs.renameSync(tmp, CONSOLIDATION_LOCK_PATH);
    return true;
  } catch {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    return false;
  }
}

function isConsolidationLockStale(rec: HeartbeatLockRecord, staleSec: number): boolean {
  const ts = new Date(rec.started_at).getTime();
  if (!Number.isFinite(ts)) return true;
  return (Date.now() - ts) > Math.max(30, staleSec) * 1000;
}

function acquireConsolidationLockWithRecovery(staleSec: number, purpose: string): { acquired: boolean; note: string } {
  if (tryAcquireConsolidationLock(purpose)) return { acquired: true, note: "acquired" };
  const cur = readConsolidationLock();
  if (!cur) return { acquired: false, note: "locked_unknown" };
  if (!isConsolidationLockStale(cur, staleSec)) return { acquired: false, note: "locked" };
  try {
    if (fs.existsSync(CONSOLIDATION_LOCK_PATH)) fs.unlinkSync(CONSOLIDATION_LOCK_PATH);
  } catch {
    return { acquired: false, note: "stale_recovery_failed" };
  }
  if (tryAcquireConsolidationLock(purpose)) return { acquired: true, note: "stale_recovered" };
  return { acquired: false, note: "stale_recovered_but_locked" };
}

function releaseConsolidationLockIfOwned(): void {
  try {
    const rec = readConsolidationLock();
    if (!rec || rec.owner_pid !== process.pid) return;
    if (fs.existsSync(CONSOLIDATION_LOCK_PATH)) fs.unlinkSync(CONSOLIDATION_LOCK_PATH);
  } catch {
    // best-effort
  }
}

function parseEpisodeLine(raw: string): string {
  return clipText(String(raw || "").replace(/^\s*(?:[-*•]\s+|\d+\)\s+)/, "").trim(), 240);
}

function extractConsolidationItems(episodes: MemoryEntry[], maxLines: number): { knowledge: string[]; procedures: string[]; tags: string[]; source_ids: string[] } {
  const knowledge: string[] = [];
  const procedures: string[] = [];
  const fallback: string[] = [];
  const tags = new Set<string>();
  const source_ids: string[] = [];
  for (const ep of episodes) {
    if (ep.id && source_ids.length < 10) source_ids.push(ep.id);
    let section: "none" | "k" | "p" = "none";
    const lines = String(ep.body || "").split(/\r?\n/);
    for (const ln of lines) {
      const t = ln.trim();
      if (!t) continue;
      const lower = t.toLowerCase();
      if (/決定事項|決めたこと|decisions|学び|気づき|前提|knowledge|notes/.test(lower)) { section = "k"; continue; }
      if (/手順|やり方|手続き|steps|procedure/.test(lower)) { section = "p"; continue; }
      const item = parseEpisodeLine(t);
      if (!item) continue;
      const hashtagMatches = item.match(/#[A-Za-z0-9_\-ぁ-んァ-ヶ一-龠々]+/g) || [];
      for (const h of hashtagMatches) {
        tags.add(clipText(h.replace(/^#/, ""), 40));
        if (tags.size >= 5) break;
      }
      const isProcLike = /→|手順|確認|実行|チェック/.test(item);
      const isKnowLike = /気づき|学び|前提|事実|判明/.test(item);
      if (section === "k" || isKnowLike) {
        if (!knowledge.includes(item)) knowledge.push(item);
      } else if (section === "p" || isProcLike) {
        if (!procedures.includes(item)) procedures.push(item);
      } else {
        if (!fallback.includes(item)) fallback.push(item);
      }
      if (knowledge.length >= maxLines && procedures.length >= maxLines) break;
    }
  }
  if (!knowledge.length) knowledge.push(...fallback.slice(0, maxLines));
  if (!procedures.length) procedures.push(...fallback.slice(0, maxLines));
  return {
    knowledge: knowledge.slice(0, maxLines),
    procedures: procedures.slice(0, maxLines),
    tags: [...tags].slice(0, 5),
    source_ids,
  };
}

function buildConsolidationBody(lines: string[], bodyCap: number, sourceIds: string[]): string {
  const out: string[] = [];
  for (const ln of lines) out.push(`- ${ln}`);
  if (sourceIds.length) out.push(`\nsource_episode_ids=${sourceIds.join(",")}`);
  return clipText(out.join("\n"), bodyCap);
}

function appendConsolidationInbox(agentId: string, localDate: string, knowledgeId: string | null, proceduresId: string | null): void {
  try {
    const item = {
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: "heartbeat",
      msg_id: randomId("consolidation"),
      role: "system",
      mention: false,
      title: "Night consolidation done",
      body: clipText(`agent_id=${agentId} local_date=${localDate}`, 2000),
      source: "consolidation",
      links: { artifact_paths: [knowledgeId || "", proceduresId || ""].filter(Boolean) },
    };
    appendInboxEntry(item);
  } catch {}
}

function appendConsolidationStopInbox(note: string): void {
  try {
    const settings = loadDesktopSettings();
    const mentionToken = getMentionToken(settings);
    const item = {
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: "heartbeat",
      msg_id: randomId("consolidation_stop"),
      role: "system",
      mention: true,
      title: "Night consolidation stopped",
      body: clipText(`${mentionToken} consolidation stopped due to consecutive failures. ${note}`, 2000),
      source: "consolidation",
      links: { artifact_paths: [] },
    };
    appendInboxEntry(item);
  } catch {}
}

function getTodayEpisodes(agentId: string, maxEpisodes: number, localDate: string): MemoryEntry[] {
  const out = readMemoryItems(agentId, "episodes", Math.max(maxEpisodes, 1));
  const picked: MemoryEntry[] = [];
  for (const it of out.items) {
    const d = new Date(String(it.ts || ""));
    if (!Number.isFinite(d.getTime())) continue;
    if (localDateYmd(d) !== localDate) continue;
    picked.push(it);
    if (picked.length >= maxEpisodes) break;
  }
  return picked;
}

function consolidateAgent(input: {
  agent_id: string;
  local_date: string;
  settings: ConsolidationSettings;
  state: ConsolidationState;
  dry_run: boolean;
}): {
  skipped: boolean;
  skipped_reason?: string;
  outputs?: { knowledge?: MemoryEntry; procedures?: MemoryEntry; planned_knowledge?: string; planned_procedures?: string };
  note?: string;
} {
  const per = ensureConsolidationPerAgent(input.state, input.agent_id);
  const nowMs = Date.now();
  if (per.last_run_local_date === input.local_date) {
    const sameDayCount = input.settings.safety.max_per_day <= 1 ? 1 : 0;
    if (sameDayCount >= input.settings.safety.max_per_day) {
      per.last_result = "skipped";
      per.last_note = "max_per_day_reached";
      return { skipped: true, skipped_reason: "max_per_day_reached" };
    }
  }
  if (per.last_run_at) {
    const prevMs = new Date(per.last_run_at).getTime();
    if (Number.isFinite(prevMs) && nowMs - prevMs < input.settings.safety.cooldown_sec * 1000) {
      per.last_result = "skipped";
      per.last_note = "cooldown_active";
      return { skipped: true, skipped_reason: "cooldown_active" };
    }
  }
  const episodes = getTodayEpisodes(input.agent_id, input.settings.limits.max_episodes_per_day, input.local_date);
  const dist = extractConsolidationItems(episodes, input.settings.limits.max_lines_per_output);
  const knowledgeTitle = `Night consolidation ${input.local_date} (Knowledge)`;
  const proceduresTitle = `Night consolidation ${input.local_date} (Procedures)`;
  const tags = ["consolidation", "night", input.local_date, ...dist.tags].slice(0, 8);
  const knowledgeBody = buildConsolidationBody(dist.knowledge, input.settings.limits.max_body_chars, dist.source_ids);
  const proceduresBody = buildConsolidationBody(dist.procedures, input.settings.limits.max_body_chars, dist.source_ids);
  if (input.dry_run) {
    per.last_result = "skipped";
    per.last_note = "dry_run";
    return { skipped: true, skipped_reason: "dry_run", outputs: { planned_knowledge: knowledgeBody, planned_procedures: proceduresBody } };
  }
  let k: MemoryEntry | undefined;
  let p: MemoryEntry | undefined;
  try {
    k = appendMemoryEntry(input.agent_id, "knowledge", { title: knowledgeTitle, body: knowledgeBody, tags, source: "system", refs: {} });
    p = appendMemoryEntry(input.agent_id, "procedures", { title: proceduresTitle, body: proceduresBody, tags, source: "system", refs: {} });
  } catch (e: any) {
    per.last_result = "fail";
    per.last_note = clipText(`append_failed:${String(e?.message || "unknown")}`, 400);
    return { skipped: false, note: per.last_note };
  }
  per.last_run_local_date = input.local_date;
  per.last_run_at = nowIso();
  per.last_result = "ok";
  per.last_note = `episodes=${episodes.length}`;
  per.last_outputs = { knowledge_id: k?.id || null, procedures_id: p?.id || null };
  appendActivity({
    event_type: "consolidation",
    actor_id: input.agent_id,
    title: "Night consolidation",
    summary: "consolidated episodes -> knowledge/procedures",
    refs: {},
  });
  appendConsolidationInbox(input.agent_id, input.local_date, k?.id || null, p?.id || null);
  return { skipped: false, outputs: { knowledge: k, procedures: p } };
}

function runConsolidationNow(input: { agent_id: string; dry_run: boolean }): {
  ok: boolean;
  skipped_reason?: string;
  local_date: string;
  outputs?: unknown;
  note?: string;
} {
  const agents = loadOrgAgentsSnapshot().snapshot.agents;
  const allowed = new Set(agents.map((a) => a.id));
  const settings = loadConsolidationSettings(allowed);
  const state = loadConsolidationState();
  const localDate = localDateYmd(new Date());
  const targets = input.agent_id === "all" ? settings.targets.agent_ids : [input.agent_id];
  const lock = acquireConsolidationLockWithRecovery(settings.safety.lock_stale_sec, "run_now");
  if (!lock.acquired) {
    return { ok: true, skipped_reason: "locked", local_date: localDate, note: lock.note };
  }
  try {
    const rows: Array<Record<string, unknown>> = [];
    let skippedReason = "";
    for (const agentId of targets) {
      if (!allowed.has(agentId)) continue;
      const row = consolidateAgent({ agent_id: agentId, local_date: localDate, settings, state, dry_run: input.dry_run });
      rows.push({ agent_id: agentId, ...row });
      if (row.skipped && !skippedReason) skippedReason = row.skipped_reason || "";
    }
    saveConsolidationState(state);
    return { ok: true, skipped_reason: skippedReason || "", local_date: localDate, outputs: rows, note: "" };
  } finally {
    releaseConsolidationLockIfOwned();
  }
}

function runConsolidationSchedulerTick(): void {
  const agents = loadOrgAgentsSnapshot().snapshot.agents;
  const allowed = new Set(agents.map((a) => a.id));
  const settings = loadConsolidationSettings(allowed);
  const state = loadConsolidationState();
  state.last_tick_at = nowIso();
  const now = new Date();
  const localDate = localDateYmd(now);
  if (!settings.enabled || !state.enabled_effective) {
    const due = parseDailyTimeToToday(now, settings.schedule.daily_time);
    if (due.getTime() <= now.getTime()) due.setDate(due.getDate() + 1);
    state.next_run_at = due.toISOString();
    saveConsolidationState(state);
    return;
  }
  const backoffMs = state.backoff_until ? new Date(state.backoff_until).getTime() : 0;
  if (Number.isFinite(backoffMs) && backoffMs > now.getTime()) {
    state.next_run_at = new Date(backoffMs).toISOString();
    saveConsolidationState(state);
    return;
  }
  const due = parseDailyTimeToToday(now, settings.schedule.daily_time);
  const jitter = deterministicJitterSec(localDate, "consolidation", settings.schedule.jitter_sec);
  due.setSeconds(due.getSeconds() + jitter);
  if (due.getTime() > now.getTime()) {
    state.next_run_at = due.toISOString();
    saveConsolidationState(state);
    return;
  }
  const lock = acquireConsolidationLockWithRecovery(settings.safety.lock_stale_sec, "scheduler_tick");
  if (!lock.acquired) {
    state.next_run_at = new Date(Date.now() + 60 * 1000).toISOString();
    saveConsolidationState(state);
    return;
  }
  try {
    let hadFailure = false;
    for (const agentId of settings.targets.agent_ids) {
      if (!allowed.has(agentId)) continue;
      const out = consolidateAgent({ agent_id: agentId, local_date: localDate, settings, state, dry_run: false });
      if (!out.skipped && out.note && out.note.includes("failed")) hadFailure = true;
      const per = ensureConsolidationPerAgent(state, agentId);
      if (per.last_result === "fail") hadFailure = true;
    }
    if (hadFailure) {
      state.failure_count = Math.max(0, state.failure_count + 1);
      const backoffSec = computeHeartbeatBackoffSec(state.failure_count, settings.safety.backoff_base_sec, settings.safety.backoff_max_sec);
      state.backoff_until = new Date(Date.now() + backoffSec * 1000).toISOString();
      if (state.failure_count >= settings.safety.max_consecutive_failures) {
        state.enabled_effective = false;
        appendConsolidationStopInbox(`max_consecutive_failures=${settings.safety.max_consecutive_failures}`);
      }
    } else {
      state.failure_count = 0;
      state.backoff_until = null;
    }
    const nextDue = parseDailyTimeToToday(now, settings.schedule.daily_time);
    nextDue.setDate(nextDue.getDate() + 1);
    state.next_run_at = nextDue.toISOString();
    saveConsolidationState(state);
  } finally {
    releaseConsolidationLockIfOwned();
  }
}

function defaultMorningBriefSettings(): MorningBriefSettings {
  return {
    version: 1,
    enabled: true,
    daily_time: "08:30",
    tick_interval_sec: 30,
    jitter_sec: 60,
    cooldown_sec: 1800,
    max_per_day: 1,
    max_consecutive_failures: 3,
    autopilot: {
      max_rounds: 1,
      auto_ops_snapshot: true,
      auto_evidence_bundle: false,
      auto_release_bundle: false,
    },
    heartbeat: {
      activity_limit: HEARTBEAT_ACTIVITY_LIMIT_DEFAULT,
      inbox_limit: HEARTBEAT_INBOX_LIMIT_DEFAULT,
      runs_limit: HEARTBEAT_RUNS_LIMIT_DEFAULT,
    },
  };
}

function defaultMorningBriefState(): MorningBriefState {
  return {
    version: 1,
    enabled_effective: true,
    last_tick_at: null,
    next_run_at: null,
    last_run_local_date: null,
    last_run_at: null,
    last_result: "skipped",
    last_note: "",
    failure_count: 0,
    backoff_until: null,
    last_heartbeat_request_id: null,
    last_suggestion_id: null,
    last_autopilot_run_id: null,
    last_brief_memory_id: null,
    last_brief_written_path: null,
  };
}

function sanitizeMorningBriefSettings(input: unknown): MorningBriefSettings {
  const defaults = defaultMorningBriefSettings();
  const src = isRecord(input) ? input : {};
  const out: MorningBriefSettings = JSON.parse(JSON.stringify(defaults));
  out.enabled = src.enabled !== undefined ? src.enabled === true : defaults.enabled;
  const daily = clipText(src.daily_time, 5).trim() || defaults.daily_time;
  if (!/^\d{2}:\d{2}$/.test(daily)) throw new Error("morning_brief.settings.daily_time_invalid");
  const hh = Number(daily.slice(0, 2));
  const mm = Number(daily.slice(3, 5));
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    throw new Error("morning_brief.settings.daily_time_invalid");
  }
  out.daily_time = daily;
  out.tick_interval_sec = Math.max(MORNING_BRIEF_TICK_SEC_MIN, Math.min(MORNING_BRIEF_TICK_SEC_MAX, Math.floor(Number(src.tick_interval_sec ?? defaults.tick_interval_sec) || defaults.tick_interval_sec)));
  out.jitter_sec = Math.max(0, Math.min(MORNING_BRIEF_JITTER_SEC_MAX, Math.floor(Number(src.jitter_sec ?? defaults.jitter_sec) || 0)));
  out.cooldown_sec = Math.max(60, Math.min(86400, Math.floor(Number(src.cooldown_sec ?? defaults.cooldown_sec) || defaults.cooldown_sec)));
  out.max_per_day = Math.max(1, Math.min(3, Math.floor(Number(src.max_per_day ?? defaults.max_per_day) || defaults.max_per_day)));
  out.max_consecutive_failures = Math.max(1, Math.min(20, Math.floor(Number(src.max_consecutive_failures ?? defaults.max_consecutive_failures) || defaults.max_consecutive_failures)));
  const hb = isRecord(src.heartbeat) ? src.heartbeat : {};
  out.heartbeat = {
    activity_limit: Math.max(1, Math.min(HEARTBEAT_ACTIVITY_LIMIT_MAX, Math.floor(Number(hb.activity_limit ?? defaults.heartbeat.activity_limit) || defaults.heartbeat.activity_limit))),
    inbox_limit: Math.max(1, Math.min(HEARTBEAT_INBOX_LIMIT_MAX, Math.floor(Number(hb.inbox_limit ?? defaults.heartbeat.inbox_limit) || defaults.heartbeat.inbox_limit))),
    runs_limit: Math.max(1, Math.min(HEARTBEAT_RUNS_LIMIT_MAX, Math.floor(Number(hb.runs_limit ?? defaults.heartbeat.runs_limit) || defaults.heartbeat.runs_limit))),
  };
  out.autopilot = {
    max_rounds: 1,
    auto_ops_snapshot: true,
    auto_evidence_bundle: false,
    auto_release_bundle: false,
  };
  return out;
}

function mergeMorningBriefSettings(current: MorningBriefSettings, patch: unknown): MorningBriefSettings {
  if (!isRecord(patch)) throw new Error("morning_brief.settings_payload_invalid");
  const merged: Record<string, unknown> = JSON.parse(JSON.stringify(current));
  for (const [k, v] of Object.entries(patch)) merged[k] = v;
  if (isRecord(patch.heartbeat)) merged.heartbeat = { ...(isRecord(current.heartbeat) ? current.heartbeat : {}), ...patch.heartbeat };
  return sanitizeMorningBriefSettings(merged);
}

function loadMorningBriefSettings(): MorningBriefSettings {
  const defaults = sanitizeMorningBriefSettings(defaultMorningBriefSettings());
  if (!fs.existsSync(MORNING_BRIEF_SETTINGS_PATH)) {
    writeJsonAtomic(MORNING_BRIEF_SETTINGS_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(MORNING_BRIEF_SETTINGS_PATH, defaults);
  try {
    const parsed = sanitizeMorningBriefSettings(raw);
    writeJsonAtomic(MORNING_BRIEF_SETTINGS_PATH, parsed);
    return parsed;
  } catch {
    writeJsonAtomic(MORNING_BRIEF_SETTINGS_PATH, defaults);
    return defaults;
  }
}

function loadMorningBriefState(): MorningBriefState {
  const defaults = defaultMorningBriefState();
  if (!fs.existsSync(MORNING_BRIEF_STATE_PATH)) {
    writeJsonAtomic(MORNING_BRIEF_STATE_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(MORNING_BRIEF_STATE_PATH, defaults);
  if (!isRecord(raw)) {
    writeJsonAtomic(MORNING_BRIEF_STATE_PATH, defaults);
    return defaults;
  }
  return {
    version: 1,
    enabled_effective: raw.enabled_effective !== false,
    last_tick_at: raw.last_tick_at ? clipText(raw.last_tick_at, 80) : null,
    next_run_at: raw.next_run_at ? clipText(raw.next_run_at, 80) : null,
    last_run_local_date: raw.last_run_local_date ? clipText(raw.last_run_local_date, 20) : null,
    last_run_at: raw.last_run_at ? clipText(raw.last_run_at, 80) : null,
    last_result: raw.last_result === "ok" || raw.last_result === "fail" ? raw.last_result : "skipped",
    last_note: clipText(raw.last_note, 400),
    failure_count: Math.max(0, Math.min(99, Math.floor(Number(raw.failure_count || 0)))),
    backoff_until: raw.backoff_until ? clipText(raw.backoff_until, 80) : null,
    last_heartbeat_request_id: raw.last_heartbeat_request_id ? clipText(raw.last_heartbeat_request_id, 120) : null,
    last_suggestion_id: raw.last_suggestion_id ? clipText(raw.last_suggestion_id, 120) : null,
    last_autopilot_run_id: raw.last_autopilot_run_id ? clipText(raw.last_autopilot_run_id, 120) : null,
    last_brief_memory_id: raw.last_brief_memory_id ? clipText(raw.last_brief_memory_id, 120) : null,
    last_brief_written_path: raw.last_brief_written_path ? clipText(raw.last_brief_written_path, 240) : null,
  };
}

function saveMorningBriefState(state: MorningBriefState): void {
  writeJsonAtomic(MORNING_BRIEF_STATE_PATH, state);
}

function defaultOpsAutoStabilizeSettings(): OpsAutoStabilizeSettings {
  return {
    version: 1,
    enabled: false,
    check_interval_sec: 30,
    cooldown_sec: 1800,
    max_per_day: 3,
    mention_on_trigger: true,
    auto_execute: {
      enabled: false,
      mode: "safe_no_exec",
      confirm_policy: "server_only",
      max_per_day: 1,
      cooldown_sec: 3600,
    },
    trigger_rules: {
      brake_detect: true,
      stale_lock_detect: true,
      failure_detect: true,
    },
    thresholds: {
      failure_count_warn: 2,
      stale_lock_sec: 600,
    },
    safety: {
      max_consecutive_failures: 3,
      lock_stale_sec: 600,
    },
  };
}

function defaultOpsAutoStabilizeState(): OpsAutoStabilizeState {
  return {
    version: 1,
    enabled_effective: true,
    last_check_at: null,
    last_trigger_at: null,
    last_trigger_local_date: null,
    trigger_count_today: 0,
    failure_count: 0,
    last_reason: "",
    last_result_ok: true,
    last_result_summary: "",
    last_inbox_id: null,
    last_auto_execute_at: null,
    auto_execute_count_today: 0,
    last_auto_execute_ok: true,
    last_auto_execute_note: "",
  };
}

function loadOpsAutoStabilizeSettings(): OpsAutoStabilizeSettings {
  const defaults = defaultOpsAutoStabilizeSettings();
  if (!fs.existsSync(OPS_AUTO_STABILIZE_SETTINGS_PATH)) {
    writeJsonAtomic(OPS_AUTO_STABILIZE_SETTINGS_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(OPS_AUTO_STABILIZE_SETTINGS_PATH, defaults);
  if (!isRecord(raw)) {
    writeJsonAtomic(OPS_AUTO_STABILIZE_SETTINGS_PATH, defaults);
    return defaults;
  }
  const trig = isRecord(raw.trigger_rules) ? raw.trigger_rules : {};
  const thr = isRecord(raw.thresholds) ? raw.thresholds : {};
  const safety = isRecord(raw.safety) ? raw.safety : {};
  const autoExecute = isRecord(raw.auto_execute) ? raw.auto_execute : {};
  return {
    version: 1,
    enabled: raw.enabled === true,
    check_interval_sec: Math.max(10, Math.min(300, Math.floor(Number(raw.check_interval_sec || defaults.check_interval_sec) || defaults.check_interval_sec))),
    cooldown_sec: Math.max(60, Math.min(7200, Math.floor(Number(raw.cooldown_sec || defaults.cooldown_sec) || defaults.cooldown_sec))),
    max_per_day: Math.max(1, Math.min(10, Math.floor(Number(raw.max_per_day || defaults.max_per_day) || defaults.max_per_day))),
    mention_on_trigger: raw.mention_on_trigger !== false,
    auto_execute: {
      enabled: autoExecute.enabled === true,
      mode: "safe_no_exec",
      confirm_policy: "server_only",
      max_per_day: Math.max(1, Math.min(5, Math.floor(Number(autoExecute.max_per_day || defaults.auto_execute.max_per_day) || defaults.auto_execute.max_per_day))),
      cooldown_sec: Math.max(300, Math.min(21600, Math.floor(Number(autoExecute.cooldown_sec || defaults.auto_execute.cooldown_sec) || defaults.auto_execute.cooldown_sec))),
    },
    trigger_rules: {
      brake_detect: trig.brake_detect !== false,
      stale_lock_detect: trig.stale_lock_detect !== false,
      failure_detect: trig.failure_detect !== false,
    },
    thresholds: {
      failure_count_warn: Math.max(1, Math.min(10, Math.floor(Number(thr.failure_count_warn || defaults.thresholds.failure_count_warn) || defaults.thresholds.failure_count_warn))),
      stale_lock_sec: Math.max(60, Math.min(3600, Math.floor(Number(thr.stale_lock_sec || defaults.thresholds.stale_lock_sec) || defaults.thresholds.stale_lock_sec))),
    },
    safety: {
      max_consecutive_failures: Math.max(1, Math.min(10, Math.floor(Number(safety.max_consecutive_failures || defaults.safety.max_consecutive_failures) || defaults.safety.max_consecutive_failures))),
      lock_stale_sec: Math.max(60, Math.min(3600, Math.floor(Number(safety.lock_stale_sec || defaults.safety.lock_stale_sec) || defaults.safety.lock_stale_sec))),
    },
  };
}

function mergeOpsAutoStabilizeSettings(current: OpsAutoStabilizeSettings, patchInput: unknown): OpsAutoStabilizeSettings {
  if (!isRecord(patchInput)) return current;
  const next = JSON.parse(JSON.stringify(current)) as OpsAutoStabilizeSettings;
  const patch = patchInput;
  if (patch.enabled !== undefined) next.enabled = patch.enabled === true;
  if (patch.check_interval_sec !== undefined) next.check_interval_sec = Math.max(10, Math.min(300, Math.floor(Number(patch.check_interval_sec) || next.check_interval_sec)));
  if (patch.cooldown_sec !== undefined) next.cooldown_sec = Math.max(60, Math.min(7200, Math.floor(Number(patch.cooldown_sec) || next.cooldown_sec)));
  if (patch.max_per_day !== undefined) next.max_per_day = Math.max(1, Math.min(10, Math.floor(Number(patch.max_per_day) || next.max_per_day)));
  if (patch.mention_on_trigger !== undefined) next.mention_on_trigger = patch.mention_on_trigger === true;
  if (isRecord(patch.auto_execute)) {
    if (patch.auto_execute.enabled !== undefined) next.auto_execute.enabled = patch.auto_execute.enabled === true;
    if (patch.auto_execute.max_per_day !== undefined) next.auto_execute.max_per_day = Math.max(1, Math.min(5, Math.floor(Number(patch.auto_execute.max_per_day) || next.auto_execute.max_per_day)));
    if (patch.auto_execute.cooldown_sec !== undefined) next.auto_execute.cooldown_sec = Math.max(300, Math.min(21600, Math.floor(Number(patch.auto_execute.cooldown_sec) || next.auto_execute.cooldown_sec)));
    next.auto_execute.mode = "safe_no_exec";
    next.auto_execute.confirm_policy = "server_only";
  }
  if (isRecord(patch.trigger_rules)) {
    if (patch.trigger_rules.brake_detect !== undefined) next.trigger_rules.brake_detect = patch.trigger_rules.brake_detect === true;
    if (patch.trigger_rules.stale_lock_detect !== undefined) next.trigger_rules.stale_lock_detect = patch.trigger_rules.stale_lock_detect === true;
    if (patch.trigger_rules.failure_detect !== undefined) next.trigger_rules.failure_detect = patch.trigger_rules.failure_detect === true;
  }
  if (isRecord(patch.thresholds)) {
    if (patch.thresholds.failure_count_warn !== undefined) next.thresholds.failure_count_warn = Math.max(1, Math.min(10, Math.floor(Number(patch.thresholds.failure_count_warn) || next.thresholds.failure_count_warn)));
    if (patch.thresholds.stale_lock_sec !== undefined) next.thresholds.stale_lock_sec = Math.max(60, Math.min(3600, Math.floor(Number(patch.thresholds.stale_lock_sec) || next.thresholds.stale_lock_sec)));
  }
  if (isRecord(patch.safety)) {
    if (patch.safety.max_consecutive_failures !== undefined) next.safety.max_consecutive_failures = Math.max(1, Math.min(10, Math.floor(Number(patch.safety.max_consecutive_failures) || next.safety.max_consecutive_failures)));
    if (patch.safety.lock_stale_sec !== undefined) next.safety.lock_stale_sec = Math.max(60, Math.min(3600, Math.floor(Number(patch.safety.lock_stale_sec) || next.safety.lock_stale_sec)));
  }
  return next;
}

function loadOpsAutoStabilizeState(): OpsAutoStabilizeState {
  const defaults = defaultOpsAutoStabilizeState();
  if (!fs.existsSync(OPS_AUTO_STABILIZE_STATE_PATH)) {
    writeJsonAtomic(OPS_AUTO_STABILIZE_STATE_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(OPS_AUTO_STABILIZE_STATE_PATH, defaults);
  if (!isRecord(raw)) {
    writeJsonAtomic(OPS_AUTO_STABILIZE_STATE_PATH, defaults);
    return defaults;
  }
  return {
    version: 1,
    enabled_effective: raw.enabled_effective !== false,
    last_check_at: raw.last_check_at ? clipText(raw.last_check_at, 80) : null,
    last_trigger_at: raw.last_trigger_at ? clipText(raw.last_trigger_at, 80) : null,
    last_trigger_local_date: raw.last_trigger_local_date ? clipText(raw.last_trigger_local_date, 20) : null,
    trigger_count_today: Math.max(0, Math.floor(Number(raw.trigger_count_today || 0))),
    failure_count: Math.max(0, Math.floor(Number(raw.failure_count || 0))),
    last_reason: clipText(raw.last_reason, 300),
    last_result_ok: raw.last_result_ok !== false,
    last_result_summary: clipText(raw.last_result_summary, 600),
    last_inbox_id: raw.last_inbox_id ? clipText(raw.last_inbox_id, 120) : null,
    last_auto_execute_at: raw.last_auto_execute_at ? clipText(raw.last_auto_execute_at, 80) : null,
    auto_execute_count_today: Math.max(0, Math.floor(Number(raw.auto_execute_count_today || 0))),
    last_auto_execute_ok: raw.last_auto_execute_ok !== false,
    last_auto_execute_note: clipText(raw.last_auto_execute_note, 600),
  };
}

function saveOpsAutoStabilizeState(state: OpsAutoStabilizeState): void {
  writeJsonAtomic(OPS_AUTO_STABILIZE_STATE_PATH, state);
}

function defaultOpsAutoStabilizeExecuteState(): OpsAutoStabilizeExecuteState {
  return {
    version: 1,
    last_execute_at: null,
    last_local_date: null,
    execute_count_today: 0,
    last_source_inbox_id: null,
    executed_source_inbox_ids: [],
    last_result_ok: true,
    last_result_summary: "",
  };
}

function loadOpsAutoStabilizeExecuteState(): OpsAutoStabilizeExecuteState {
  const defaults = defaultOpsAutoStabilizeExecuteState();
  if (!fs.existsSync(OPS_AUTO_STABILIZE_EXECUTE_STATE_PATH)) {
    writeJsonAtomic(OPS_AUTO_STABILIZE_EXECUTE_STATE_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(OPS_AUTO_STABILIZE_EXECUTE_STATE_PATH, defaults);
  if (!isRecord(raw)) {
    writeJsonAtomic(OPS_AUTO_STABILIZE_EXECUTE_STATE_PATH, defaults);
    return defaults;
  }
  const ids = Array.isArray(raw.executed_source_inbox_ids)
    ? raw.executed_source_inbox_ids.map((x) => clipText(x, 120).trim()).filter((x) => !!x).slice(-200)
    : [];
  return {
    version: 1,
    last_execute_at: raw.last_execute_at ? clipText(raw.last_execute_at, 80) : null,
    last_local_date: raw.last_local_date ? clipText(raw.last_local_date, 20) : null,
    execute_count_today: Math.max(0, Math.floor(Number(raw.execute_count_today || 0))),
    last_source_inbox_id: raw.last_source_inbox_id ? clipText(raw.last_source_inbox_id, 120) : null,
    executed_source_inbox_ids: ids,
    last_result_ok: raw.last_result_ok !== false,
    last_result_summary: clipText(raw.last_result_summary, 600),
  };
}

function saveOpsAutoStabilizeExecuteState(state: OpsAutoStabilizeExecuteState): void {
  writeJsonAtomic(OPS_AUTO_STABILIZE_EXECUTE_STATE_PATH, state);
}

function readMorningBriefLock(): HeartbeatLockRecord | null {
  if (!fs.existsSync(MORNING_BRIEF_LOCK_PATH)) return null;
  try {
    const raw = readJson<unknown>(MORNING_BRIEF_LOCK_PATH, null);
    if (!isRecord(raw)) return null;
    return {
      owner_pid: Math.max(0, Math.floor(Number(raw.owner_pid || 0))),
      started_at: clipText(raw.started_at, 80).trim(),
      purpose: clipText(raw.purpose, 120).trim(),
    };
  } catch {
    return null;
  }
}

function tryAcquireMorningBriefLock(purpose: string): boolean {
  const rec: HeartbeatLockRecord = { owner_pid: process.pid, started_at: nowIso(), purpose: clipText(purpose, 120) };
  try {
    const fd = fs.openSync(MORNING_BRIEF_LOCK_PATH, "wx");
    fs.writeFileSync(fd, `${JSON.stringify(rec, null, 2)}\n`, "utf8");
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function acquireMorningBriefLockWithRecovery(staleSec: number, purpose: string): { acquired: boolean; note: string } {
  if (tryAcquireMorningBriefLock(purpose)) return { acquired: true, note: "acquired" };
  const cur = readMorningBriefLock();
  if (!cur) return { acquired: false, note: "locked_unknown" };
  const ts = new Date(cur.started_at).getTime();
  const stale = !Number.isFinite(ts) || (Date.now() - ts) > Math.max(30, staleSec) * 1000;
  if (!stale) return { acquired: false, note: "locked" };
  try {
    if (fs.existsSync(MORNING_BRIEF_LOCK_PATH)) fs.unlinkSync(MORNING_BRIEF_LOCK_PATH);
  } catch {
    return { acquired: false, note: "stale_recovery_failed" };
  }
  if (tryAcquireMorningBriefLock(purpose)) return { acquired: true, note: "stale_recovered" };
  return { acquired: false, note: "stale_recovered_but_locked" };
}

function releaseMorningBriefLockIfOwned(): void {
  try {
    const rec = readMorningBriefLock();
    if (!rec || rec.owner_pid !== process.pid) return;
    if (fs.existsSync(MORNING_BRIEF_LOCK_PATH)) fs.unlinkSync(MORNING_BRIEF_LOCK_PATH);
  } catch {
    // best-effort
  }
}

function appendMorningBriefInbox(title: string, body: string, links: Record<string, unknown>, mention = false): void {
  try {
    const item = {
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: "heartbeat",
      msg_id: randomId("morning_brief"),
      role: "system",
      mention,
      title: clipText(title, 256),
      body: clipText(body, 2000),
      source: "morning_brief",
      links: { ...links, artifact_paths: Array.isArray((links as any).artifact_paths) ? (links as any).artifact_paths : [] },
    };
    appendInboxEntry(item);
  } catch {
    // best-effort
  }
}

function runMorningBriefRoutine(state: MorningBriefState, settings: MorningBriefSettings, dryRun: boolean, recommendedProfile: RecommendedProfile): {
  ok: boolean;
  skipped_reason?: string;
  note?: string;
} {
  const now = new Date();
  const localDate = localDateYmd(now);
  const maxPerDayReached = state.last_run_local_date === localDate && settings.max_per_day <= 1;
  if (maxPerDayReached) return { ok: true, skipped_reason: "max_per_day_reached" };
  if (state.last_run_at) {
    const prevMs = new Date(state.last_run_at).getTime();
    if (Number.isFinite(prevMs) && (Date.now() - prevMs) < settings.cooldown_sec * 1000) {
      return { ok: true, skipped_reason: "cooldown_active" };
    }
  }
  if (dryRun) return { ok: true, skipped_reason: "", note: "would_run" };

  const hb = runHeartbeat({
    agent_id: "facilitator",
    category: "episodes",
    activity_limit: settings.heartbeat.activity_limit,
    inbox_limit: settings.heartbeat.inbox_limit,
    runs_limit: settings.heartbeat.runs_limit,
    dry_run: false,
  });
  state.last_heartbeat_request_id = hb.request_id;
  const store = loadHeartbeatAutopilotSuggestionStore();
  const suggestion = store.items.find((x) => x.local_date === localDate && x.agent_id === "facilitator" && x.category === "episodes");
  state.last_suggestion_id = suggestion?.id || null;
  const runId = suggestion?.autopilot_run_id ? String(suggestion.autopilot_run_id) : "";
  state.last_autopilot_run_id = runId || null;
  if (!runId) {
    state.last_result = "skipped";
    state.last_note = "autopilot_not_started";
    appendMorningBriefInbox(
      "Morning brief skipped (autopilot not started)",
      "Suggest auto-accept was disabled or skipped by guards.",
      { suggestion_id: state.last_suggestion_id || "", recommended_profile_preset_set_id: recommendedProfile.preset_set_id, artifact_paths: [] },
      false,
    );
    return { ok: true, skipped_reason: "autopilot_not_started" };
  }
  const run = loadCouncilRunRecord(runId);
  const stamp = localDate.replaceAll("-", "");
  const relPath = `written/morning_brief_${stamp}.md`;
  const absPath = path.join(WORKSPACE, relPath);
  const md = [
    `# Morning Brief ${localDate}`,
    "",
    `generated_by=routine_morning_brief_v1`,
    `autopilot_run_id=${runId}`,
    `heartbeat_request_id=${hb.request_id}`,
    "",
    "## Today Focus",
    `- ${clipText(run?.topic || "Autopilot run queued", 200)}`,
    "",
    "## Decisions",
    `- run_status=${clipText(run?.status || "queued", 80)}`,
    "",
    "## Next Actions",
    "- Review run detail and confirm top priority.",
    "",
    "## Recommended Profile",
    `- preset_set_id=${recommendedProfile.preset_set_id}`,
    `- display_name=${recommendedProfile.display_name}`,
    `- rationale=${clipText(recommendedProfile.rationale, 200)}`,
  ].join("\n");
  writeBinaryAtomic(absPath, Buffer.from(md, "utf8"));
  state.last_brief_written_path = relPath;
  state.last_result = "ok";
  state.last_note = "brief_written";
  appendMorningBriefInbox(
    "Morning brief ready",
    `Morning brief generated for ${localDate}`,
    { run_id: runId, recommended_profile_preset_set_id: recommendedProfile.preset_set_id, artifact_paths: [relPath] },
    false,
  );
  return { ok: true, note: "brief_written" };
}

function appendMorningBriefStopInbox(note: string): void {
  try {
    const settings = loadDesktopSettings();
    const mentionToken = getMentionToken(settings);
    appendMorningBriefInbox(
      "Morning brief stopped",
      `${mentionToken} morning brief stopped due to consecutive failures. ${note}`,
      { artifact_paths: [] },
      true,
    );
  } catch {}
}

function runMorningBriefNow(dryRun: boolean): { ok: boolean; skipped_reason?: string; note?: string; local_date: string; recommended_profile: RecommendedProfile } {
  const settings = loadMorningBriefSettings();
  const state = loadMorningBriefState();
  const localDate = localDateYmd(new Date());
  const recommendedProfile = computeRecommendedProfile();
  const lock = acquireMorningBriefLockWithRecovery(600, "run_now");
  if (!lock.acquired) return { ok: true, skipped_reason: "locked", note: lock.note, local_date: localDate, recommended_profile: recommendedProfile };
  try {
    const out = runMorningBriefRoutine(state, settings, dryRun, recommendedProfile);
    if (!dryRun && out.ok && !out.skipped_reason) {
      state.last_run_at = nowIso();
      state.last_run_local_date = localDate;
    }
    if (!dryRun && out.ok && !out.skipped_reason) {
      state.failure_count = 0;
      state.backoff_until = null;
    } else if (!dryRun && !out.ok) {
      state.failure_count = Math.max(0, state.failure_count + 1);
      const backoffSec = Math.max(60, Math.min(3600, settings.cooldown_sec * Math.max(1, Math.min(4, Math.pow(2, state.failure_count - 1)))));
      state.backoff_until = new Date(Date.now() + backoffSec * 1000).toISOString();
      state.last_result = "fail";
      state.last_note = clipText(out.note || "run_failed", 400);
      if (state.failure_count >= settings.max_consecutive_failures) {
        state.enabled_effective = false;
        appendMorningBriefStopInbox(`max_consecutive_failures=${settings.max_consecutive_failures}`);
      }
    } else if (!dryRun && out.skipped_reason) {
      state.last_result = "skipped";
      state.last_note = clipText(out.skipped_reason, 400);
    }
    saveMorningBriefState(state);
    return { ok: true, skipped_reason: out.skipped_reason || "", note: out.note || "", local_date: localDate, recommended_profile: recommendedProfile };
  } finally {
    releaseMorningBriefLockIfOwned();
  }
}

function runMorningBriefSchedulerTick(): void {
  const settings = loadMorningBriefSettings();
  const state = loadMorningBriefState();
  const now = new Date();
  const localDate = localDateYmd(now);
  state.last_tick_at = nowIso();
  if (!settings.enabled || !state.enabled_effective) {
    const due = parseDailyTimeToToday(now, settings.daily_time);
    if (due.getTime() <= now.getTime()) due.setDate(due.getDate() + 1);
    state.next_run_at = due.toISOString();
    saveMorningBriefState(state);
    return;
  }
  const backoffMs = state.backoff_until ? new Date(state.backoff_until).getTime() : 0;
  if (Number.isFinite(backoffMs) && backoffMs > now.getTime()) {
    state.next_run_at = new Date(backoffMs).toISOString();
    saveMorningBriefState(state);
    return;
  }
  const due = parseDailyTimeToToday(now, settings.daily_time);
  due.setSeconds(due.getSeconds() + deterministicJitterSec(localDate, "morning_brief", settings.jitter_sec));
  if (due.getTime() > now.getTime()) {
    state.next_run_at = due.toISOString();
    saveMorningBriefState(state);
    return;
  }
  const out = runMorningBriefNow(false);
  state.next_run_at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, Number(settings.daily_time.slice(0, 2)), Number(settings.daily_time.slice(3, 5)), 0, 0).toISOString();
  state.last_note = clipText(out.note || out.skipped_reason || "", 400);
  saveMorningBriefState(state);
}

function localDateYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDailyTimeToToday(now: Date, hhmm: string): Date {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(3, 5));
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
}

function deterministicJitterSec(localDate: string, agentId: string, maxSec: number): number {
  const cap = Math.max(0, Math.floor(maxSec || 0));
  if (cap < 1) return 0;
  const hex = crypto.createHash("sha1").update(`${localDate}:${agentId}`).digest("hex").slice(0, 8);
  const n = parseInt(hex, 16);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(cap, n % (cap + 1)));
}

function readHeartbeatLock(): HeartbeatLockRecord | null {
  if (!fs.existsSync(HEARTBEAT_LOCK_PATH)) return null;
  try {
    const raw = readJson<unknown>(HEARTBEAT_LOCK_PATH, null);
    if (!isRecord(raw)) return null;
    return {
      owner_pid: Math.max(0, Math.floor(Number(raw.owner_pid || 0))),
      started_at: clipText(raw.started_at, 80).trim(),
      purpose: clipText(raw.purpose, 120).trim(),
    };
  } catch {
    return null;
  }
}

function isHeartbeatLockStale(rec: HeartbeatLockRecord | null, staleSec: number): boolean {
  if (!rec || !rec.started_at) return true;
  const ms = new Date(rec.started_at).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return true;
  return (Date.now() - ms) > Math.max(1, staleSec) * 1000;
}

function tryAcquireHeartbeatLock(purpose: string): boolean {
  const payload: HeartbeatLockRecord = { owner_pid: process.pid, started_at: nowIso(), purpose: clipText(purpose, 120) };
  try {
    const fd = fs.openSync(HEARTBEAT_LOCK_PATH, "wx");
    fs.writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function releaseHeartbeatLockIfOwned(): void {
  try {
    const rec = readHeartbeatLock();
    if (!rec || rec.owner_pid !== process.pid) return;
    if (fs.existsSync(HEARTBEAT_LOCK_PATH)) fs.unlinkSync(HEARTBEAT_LOCK_PATH);
  } catch {
    // best-effort only
  }
}

function acquireHeartbeatLockWithRecovery(staleSec: number, purpose: string): { acquired: boolean; note: string } {
  if (tryAcquireHeartbeatLock(purpose)) return { acquired: true, note: "acquired" };
  const current = readHeartbeatLock();
  if (!current) {
    if (tryAcquireHeartbeatLock(purpose)) return { acquired: true, note: "acquired_after_missing" };
    return { acquired: false, note: "locked_unknown" };
  }
  if (!isHeartbeatLockStale(current, staleSec)) {
    return { acquired: false, note: "locked" };
  }
  try {
    if (fs.existsSync(HEARTBEAT_LOCK_PATH)) fs.unlinkSync(HEARTBEAT_LOCK_PATH);
  } catch {
    return { acquired: false, note: "stale_recovery_failed" };
  }
  if (tryAcquireHeartbeatLock(purpose)) return { acquired: true, note: "stale_recovered" };
  return { acquired: false, note: "stale_recovered_but_locked" };
}

function computeHeartbeatBackoffSec(failureCount: number, baseSec: number, maxSec: number): number {
  const fc = Math.max(0, Math.floor(failureCount));
  if (fc < 1) return 0;
  const raw = Math.floor(baseSec * Math.pow(2, Math.max(0, fc - 1)));
  return Math.max(baseSec, Math.min(maxSec, raw));
}

function appendHeartbeatSchedulerStopInboxEntry(note: string): void {
  try {
    const settings = loadDesktopSettings();
    const mentionToken = getMentionToken(settings);
    const item = {
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: "heartbeat",
      msg_id: randomId("heartbeat_stop"),
      role: "system",
      mention: true,
      title: "Heartbeat scheduler stopped",
      body: clipText(`${mentionToken} Heartbeat scheduler stopped due to consecutive failures. ${note}`, 2000),
      source: "heartbeat_scheduler",
      links: { artifact_paths: [] },
    };
    appendInboxEntry(item);
  } catch {
    // best-effort
  }
}

function runHeartbeatForTarget(state: HeartbeatState, settings: HeartbeatSettings, agentId: string, category: MemoryCategory, dryRun: boolean): {
  request_id: string;
  skipped: boolean;
  skipped_reason?: string;
} {
  const now = new Date();
  const keyState = ensureHeartbeatPerTargetState(state, agentId, category);
  const localDate = localDateYmd(now);
  const maxPerDay = settings.limits.max_per_day;
  const due = parseDailyTimeToToday(now, settings.schedule.daily_time);
  const jitter = deterministicJitterSec(localDate, agentId, settings.schedule.jitter_sec);
  due.setSeconds(due.getSeconds() + jitter);

  if (!dryRun && now.getTime() < due.getTime()) {
    keyState.last_result = "skipped";
    keyState.last_note = "before_due_time";
    return { request_id: "", skipped: true, skipped_reason: "before_due_time" };
  }
  const backoffMs = keyState.backoff_until ? new Date(keyState.backoff_until).getTime() : 0;
  if (!dryRun && Number.isFinite(backoffMs) && backoffMs > now.getTime()) {
    keyState.last_result = "skipped";
    keyState.last_note = "backoff_active";
    return { request_id: "", skipped: true, skipped_reason: "backoff_active" };
  }
  const alreadyToday = keyState.last_run_local_date === localDate;
  const runCountToday = alreadyToday ? Math.max(0, Number((keyState as any).run_count_today || 0)) : 0;
  if (!dryRun && runCountToday >= maxPerDay) {
    keyState.last_result = "skipped";
    keyState.last_note = "max_per_day_reached";
    return { request_id: "", skipped: true, skipped_reason: "max_per_day_reached" };
  }

  const out = runHeartbeat({
    agent_id: agentId,
    category,
    activity_limit: settings.limits.activity_limit,
    inbox_limit: settings.limits.inbox_limit,
    runs_limit: settings.limits.runs_limit,
    dry_run: dryRun,
  });
  const requestId = String(out.request_id || "");
  keyState.last_request_id = requestId;
  if (dryRun) {
    keyState.last_result = "skipped";
    keyState.last_note = "dry_run";
    return { request_id: requestId, skipped: true, skipped_reason: "dry_run" };
  }
  const failed = !out.created_entry;
  if (failed) {
    keyState.last_fail_at = nowIso();
    keyState.failure_count = Math.max(0, keyState.failure_count + 1);
    const backoffSec = computeHeartbeatBackoffSec(keyState.failure_count, settings.safety.backoff_base_sec, settings.safety.backoff_max_sec);
    keyState.backoff_until = new Date(Date.now() + backoffSec * 1000).toISOString();
    keyState.last_result = "fail";
    keyState.last_note = clipText((out.notes || []).join("; ") || "heartbeat_failed", 400);
    return { request_id: requestId, skipped: false };
  }
  keyState.last_run_local_date = localDate;
  (keyState as any).run_count_today = alreadyToday ? runCountToday + 1 : 1;
  keyState.last_ok_at = nowIso();
  keyState.failure_count = 0;
  keyState.backoff_until = null;
  keyState.last_result = "ok";
  keyState.last_note = "ok";
  return { request_id: requestId, skipped: false };
}

function computeHeartbeatNextRunAt(settings: HeartbeatSettings): string {
  const now = new Date();
  let bestMs = Number.POSITIVE_INFINITY;
  for (const agentId of settings.targets.agent_ids) {
    const localDate = localDateYmd(now);
    const dueToday = parseDailyTimeToToday(now, settings.schedule.daily_time);
    const jitter = deterministicJitterSec(localDate, agentId, settings.schedule.jitter_sec);
    dueToday.setSeconds(dueToday.getSeconds() + jitter);
    let dueMs = dueToday.getTime();
    if (dueMs <= now.getTime()) dueMs += 24 * 60 * 60 * 1000;
    if (dueMs < bestMs) bestMs = dueMs;
  }
  if (!Number.isFinite(bestMs) || bestMs <= 0) return "";
  return new Date(bestMs).toISOString();
}

function runHeartbeatSchedulerTick(): void {
  const agents = loadOrgAgentsSnapshot().snapshot.agents;
  const allowedAgentIds = new Set(agents.map((a) => a.id));
  const settings = loadHeartbeatSettings(allowedAgentIds);
  const state = loadHeartbeatState();
  state.last_tick_at = nowIso();
  state.next_run_at = computeHeartbeatNextRunAt(settings) || null;
  if (!settings.enabled) {
    state.enabled_effective = false;
    state.lock = { held: false, owner_pid: 0, started_at: null, note: "disabled" };
    saveHeartbeatState(state);
    return;
  }

  const lockRes = acquireHeartbeatLockWithRecovery(settings.safety.lock_stale_sec, "scheduler_tick");
  if (!lockRes.acquired) {
    const current = readHeartbeatLock();
    state.lock = {
      held: true,
      owner_pid: current?.owner_pid || 0,
      started_at: current?.started_at || null,
      note: lockRes.note,
    };
    state.enabled_effective = true;
    saveHeartbeatState(state);
    return;
  }

  const started = Date.now();
  state.lock = { held: true, owner_pid: process.pid, started_at: nowIso(), note: lockRes.note };
  try {
    const category = settings.targets.category;
    for (const agentId of settings.targets.agent_ids) {
      if ((Date.now() - started) > settings.safety.global_timeout_sec * 1000) {
        const keyState = ensureHeartbeatPerTargetState(state, agentId, category);
        keyState.last_result = "skipped";
        keyState.last_note = "global_timeout";
        break;
      }
      runHeartbeatForTarget(state, settings, agentId, category, false);
    }
    let stop = false;
    for (const agentId of settings.targets.agent_ids) {
      const s = ensureHeartbeatPerTargetState(state, agentId, category);
      if (s.failure_count >= settings.safety.max_consecutive_failures) {
        stop = true;
      }
    }
    state.enabled_effective = !stop;
    if (stop) {
      appendHeartbeatSchedulerStopInboxEntry(`max_consecutive_failures=${settings.safety.max_consecutive_failures}`);
      appendActivity({
        event_type: "heartbeat",
        actor_id: "system",
        title: "Heartbeat scheduler stopped",
        summary: `max_consecutive_failures=${settings.safety.max_consecutive_failures}`,
      });
    }
  } catch (e: any) {
    state.enabled_effective = true;
    state.lock.note = clipText(`tick_error:${String(e?.message || "unknown")}`, 180);
  } finally {
    releaseHeartbeatLockIfOwned();
    state.lock = { held: false, owner_pid: 0, started_at: null, note: "" };
    state.next_run_at = computeHeartbeatNextRunAt(settings) || null;
    saveHeartbeatState(state);
  }
}

function runHeartbeatNow(params: {
  agent_id: string;
  category: MemoryCategory;
  dry_run: boolean;
  activity_limit: number;
  inbox_limit: number;
  runs_limit: number;
}): { ok: boolean; request_id: string; skipped_reason?: string; result?: ReturnType<typeof runHeartbeat> } {
  const agents = loadOrgAgentsSnapshot().snapshot.agents;
  const allowedAgentIds = new Set(agents.map((a) => a.id));
  const settings = loadHeartbeatSettings(allowedAgentIds);
  const state = loadHeartbeatState();
  const agentId = params.agent_id;
  const category = params.category;
  const keyState = ensureHeartbeatPerTargetState(state, agentId, category);

  const lockRes = acquireHeartbeatLockWithRecovery(settings.safety.lock_stale_sec, "run_now");
  if (!lockRes.acquired) {
    state.lock = {
      held: true,
      owner_pid: readHeartbeatLock()?.owner_pid || 0,
      started_at: readHeartbeatLock()?.started_at || null,
      note: "run_now_locked",
    };
    saveHeartbeatState(state);
    return { ok: true, request_id: "", skipped_reason: "locked" };
  }
  try {
    const today = localDateYmd(new Date());
    if (!params.dry_run && keyState.last_run_local_date === today) {
      const runCountToday = Math.max(0, Number((keyState as any).run_count_today || 0));
      if (runCountToday >= settings.limits.max_per_day) {
        keyState.last_result = "skipped";
        keyState.last_note = "max_per_day_reached";
        saveHeartbeatState(state);
        return { ok: true, request_id: "", skipped_reason: "max_per_day_reached" };
      }
    }
    const out = runHeartbeat({
      agent_id: agentId,
      category,
      activity_limit: params.activity_limit,
      inbox_limit: params.inbox_limit,
      runs_limit: params.runs_limit,
      dry_run: params.dry_run,
    });
    keyState.last_request_id = clipText(out.request_id, 120);
    if (params.dry_run) {
      keyState.last_result = "skipped";
      keyState.last_note = "run_now_dry_run";
    } else if (out.created_entry) {
      keyState.last_result = "ok";
      keyState.last_note = "run_now_ok";
      keyState.last_ok_at = nowIso();
      const prevCount = keyState.last_run_local_date === today ? Math.max(0, Number((keyState as any).run_count_today || 0)) : 0;
      keyState.last_run_local_date = today;
      (keyState as any).run_count_today = prevCount + 1;
      keyState.failure_count = 0;
      keyState.backoff_until = null;
    } else {
      keyState.last_result = "fail";
      keyState.last_note = clipText((out.notes || []).join("; ") || "run_now_failed", 400);
      keyState.last_fail_at = nowIso();
      keyState.failure_count = Math.max(0, keyState.failure_count + 1);
      const backoffSec = computeHeartbeatBackoffSec(keyState.failure_count, settings.safety.backoff_base_sec, settings.safety.backoff_max_sec);
      keyState.backoff_until = new Date(Date.now() + backoffSec * 1000).toISOString();
    }
    state.enabled_effective = settings.enabled;
    state.last_tick_at = nowIso();
    state.next_run_at = computeHeartbeatNextRunAt(settings) || null;
    saveHeartbeatState(state);
    return { ok: true, request_id: out.request_id, result: out };
  } finally {
    releaseHeartbeatLockIfOwned();
    const latest = loadHeartbeatState();
    latest.lock = { held: false, owner_pid: 0, started_at: null, note: "" };
    saveHeartbeatState(latest);
  }
}

function parseCursorAfter(afterRaw: string, afterTsRaw: string, afterIdRaw: string): { ts: string; id: string } {
  const after = String(afterRaw || "").trim();
  if (after) {
    const parts = after.split(",");
    return { ts: clipText(parts[0] || "", 80).trim(), id: clipText(parts[1] || "", 120).trim() };
  }
  return { ts: clipText(afterTsRaw, 80).trim(), id: clipText(afterIdRaw, 120).trim() };
}

function sanitizeActivityEvent(input: unknown): ActivityEvent | null {
  if (!isRecord(input)) return null;
  const refsInput = isRecord(input.refs) ? input.refs : {};
  const event_type_raw = String(input.event_type || "");
  if (!isActivityEventType(event_type_raw)) return null;
  const event_type = event_type_raw as ActivityEventType;
  const id = clipText(input.id, 120).trim();
  const ts = clipText(input.ts, 80).trim();
  const actorRaw = input.actor_id;
  const actor_id = actorRaw === null || actorRaw === undefined || actorRaw === "" ? null : clipText(actorRaw, 120);
  if (!id || !ts) return null;
  return {
    id,
    ts,
    event_type,
    actor_id,
    title: clipText(input.title, ACTIVITY_TITLE_MAX),
    summary: clipText(input.summary, ACTIVITY_SUMMARY_MAX),
    refs: {
      thread_id: clipText(refsInput.thread_id, 120),
      run_id: clipText(refsInput.run_id, 120),
      request_id: clipText(refsInput.request_id, 120),
    },
    source: "ui_api",
  };
}

function appendActivity(input: {
  event_type: ActivityEventType;
  actor_id?: string | null;
  title: string;
  summary?: string;
  refs?: { thread_id?: string; run_id?: string; request_id?: string };
}): void {
  try {
    const now = nowIso();
    const tsPart = now.replace(/[-:.TZ]/g, "");
    const event: ActivityEvent = {
      id: `act_${tsPart}_${crypto.randomBytes(3).toString("hex")}`,
      ts: now,
      event_type: input.event_type,
      actor_id: input.actor_id ? clipText(input.actor_id, 120) : null,
      title: clipText(input.title, ACTIVITY_TITLE_MAX),
      summary: clipText(input.summary || "", ACTIVITY_SUMMARY_MAX),
      refs: {
        thread_id: clipText(input.refs?.thread_id, 120),
        run_id: clipText(input.refs?.run_id, 120),
        request_id: clipText(input.refs?.request_id, 120),
      },
      source: "ui_api",
    };
    appendJsonlAtomic(ACTIVITY_PATH, `${JSON.stringify(event)}\n`);
    try { broadcastActivityEvent(event); } catch { }
  } catch {
    // best-effort only
  }
}

function readActivityEvents(limitInput: number, afterCursor: { ts: string; id: string }): { items: ActivityEvent[]; skipped_invalid: number } {
  const limit = Math.max(1, Math.min(Number(limitInput || 50), ACTIVITY_LIMIT_MAX));
  if (!fs.existsSync(ACTIVITY_PATH)) return { items: [], skipped_invalid: 0 };
  const lines = fs.readFileSync(ACTIVITY_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  const out: ActivityEvent[] = [];
  let skipped = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const event = sanitizeActivityEvent(JSON.parse(lines[i]));
      if (!event) {
        skipped += 1;
        continue;
      }
      if (afterCursor.ts) {
        if (event.ts > afterCursor.ts) continue;
        if (event.ts === afterCursor.ts && afterCursor.id && event.id >= afterCursor.id) continue;
      }
      out.push(event);
      if (out.length >= limit) break;
    } catch {
      skipped += 1;
    }
  }
  return { items: out, skipped_invalid: skipped };
}

function normalizeCouncilRunId(input: unknown): string {
  const v = clipText(input, COUNCIL_RUN_ID_MAX).trim();
  if (!v) return "";
  if (!/^[A-Za-z0-9_.:-]+$/.test(v)) return "";
  return v;
}

function councilRunPath(runId: string): string {
  return path.join(COUNCIL_RUNS_DIR, `${runId}.json`);
}

function councilLogPath(runId: string): string {
  return path.join(COUNCIL_LOGS_DIR, `${runId}.jsonl`);
}

function councilRequestPath(runId: string): string {
  return path.join(COUNCIL_REQUESTS_DIR, `${runId}.json`);
}

function sanitizeCouncilRunStatus(v: unknown): CouncilRunStatus {
  const s = String(v || "").trim();
  if (s === "queued" || s === "running" || s === "completed" || s === "failed" || s === "stopped" || s === "canceled") return s;
  return "queued";
}

function sanitizeCouncilQualityCheck(input: unknown): CouncilQualityCheck {
  const src = isRecord(input) ? input : {};
  const failuresRaw = Array.isArray(src.failures) ? src.failures : [];
  const failures: CouncilQualityFailure[] = [];
  for (const row of failuresRaw) {
    if (!isRecord(row)) continue;
    const key = clipText(row.key, 120).trim();
    const note = clipText(row.note, 400).trim();
    if (!key) continue;
    failures.push({ key, note });
    if (failures.length >= 20) break;
  }
  return {
    passed: Boolean(src.passed),
    failures,
  };
}

function sanitizeCouncilReflectionState(input: unknown): CouncilReflectionState {
  const src = isRecord(input) ? input : {};
  const attemptsRaw = Number(src.attempts || 0);
  const attempts = Number.isFinite(attemptsRaw) ? Math.max(0, Math.min(1, Math.floor(attemptsRaw))) : 0;
  const last_reflection_at_raw = src.last_reflection_at;
  const last_reflection_at = last_reflection_at_raw === null
    ? null
    : (clipText(last_reflection_at_raw, 80).trim() || null);
  return {
    attempts,
    max_attempts: 1,
    last_reflection_at,
  };
}

function sanitizeCouncilFinalizationState(input: unknown): CouncilFinalizationState {
  const src = isRecord(input) ? input : {};
  const modeRaw = String(src.mode || "").trim();
  const mode: CouncilFinalizationState["mode"] =
    modeRaw === "reflected" || modeRaw === "failed_quality" ? modeRaw : "normal";
  const final_answer_version = Number(src.final_answer_version) === 2 ? 2 : 1;
  return { mode, final_answer_version };
}

function sanitizeCouncilExportsState(input: unknown): CouncilExportsState {
  const src = isRecord(input) ? input : {};
  const kicked = isRecord(src.kicked_at) ? src.kicked_at : {};
  const st = isRecord(src.status) ? src.status : {};
  const opsStatusRaw = String(st.ops_snapshot || "").trim();
  const evidenceStatusRaw = String(st.evidence_bundle || "").trim();
  const opsStatus: CouncilExportsState["status"]["ops_snapshot"] =
    opsStatusRaw === "queued" || opsStatusRaw === "done" || opsStatusRaw === "failed" || opsStatusRaw === "disabled"
      ? opsStatusRaw
      : "disabled";
  const evidenceStatus: CouncilExportsState["status"]["evidence_bundle"] =
    evidenceStatusRaw === "queued" || evidenceStatusRaw === "done" || evidenceStatusRaw === "failed" || evidenceStatusRaw === "disabled"
      ? evidenceStatusRaw
      : "disabled";
  const opsReq = clipText(src.ops_snapshot_request_id, 160).trim();
  const evidenceReq = clipText(src.evidence_bundle_request_id, 160).trim();
  const releaseReq = clipText(src.release_bundle_request_id, 160).trim();
  const releaseRunId = clipText(src.release_bundle_run_id, 160).trim();
  const releaseStatusRaw = String(src.release_bundle_status || "").trim();
  const releaseStatus: CouncilExportsState["release_bundle_status"] =
    releaseStatusRaw === "queued" || releaseStatusRaw === "running" || releaseStatusRaw === "done" || releaseStatusRaw === "failed" || releaseStatusRaw === "disabled"
      ? releaseStatusRaw
      : "disabled";
  return {
    auto_ops_snapshot: Boolean(src.auto_ops_snapshot),
    auto_evidence_bundle: Boolean(src.auto_evidence_bundle),
    auto_release_bundle: Boolean(src.auto_release_bundle),
    ops_snapshot_request_id: opsReq || null,
    evidence_bundle_request_id: evidenceReq || null,
    release_bundle_request_id: releaseReq || null,
    release_bundle_status: releaseStatus,
    release_bundle_run_id: releaseRunId || null,
    release_bundle_note: clipText(src.release_bundle_note, 400).trim() || undefined,
    kicked_at: {
      ops_snapshot: clipText(kicked.ops_snapshot, 80).trim() || undefined,
      evidence_bundle: clipText(kicked.evidence_bundle, 80).trim() || undefined,
      release_bundle: clipText(kicked.release_bundle, 80).trim() || undefined,
    },
    status: {
      ops_snapshot: opsStatus,
      evidence_bundle: evidenceStatus,
    },
    note: clipText(src.note, 400).trim() || undefined,
  };
}

function sanitizeCouncilRunRecord(input: unknown): CouncilRunRecord | null {
  if (!isRecord(input)) return null;
  const run_id = normalizeCouncilRunId(input.run_id);
  const request_id = clipText(input.request_id, 160).trim();
  const topic = clipText(input.topic, COUNCIL_TOPIC_MAX).trim();
  const constraints = clipText(input.constraints, COUNCIL_CONSTRAINTS_MAX);
  const thread_id = clipText(input.thread_id, 120).trim() || "general";
  const created_at = clipText(input.created_at, 80).trim();
  const updated_at = clipText(input.updated_at, 80).trim();
  const max_rounds_raw = Number(input.max_rounds);
  const max_rounds = Number.isFinite(max_rounds_raw) ? Math.max(1, Math.min(COUNCIL_MAX_ROUNDS_MAX, Math.floor(max_rounds_raw))) : 1;
  const step_count_raw = Number(input.step_count || 0);
  const step_count = Number.isFinite(step_count_raw) ? Math.max(0, Math.min(COUNCIL_LOG_LIMIT_MAX, Math.floor(step_count_raw))) : 0;
  const current_step_raw = Number(input.current_step || 0);
  const current_step = Number.isFinite(current_step_raw) ? Math.max(0, Math.min(COUNCIL_LOG_LIMIT_MAX, Math.floor(current_step_raw))) : 0;
  const retries_raw = Number(input.retries || 0);
  const retries = Number.isFinite(retries_raw) ? Math.max(0, Math.min(20, Math.floor(retries_raw))) : 0;
  if (!run_id || !request_id || !topic || !created_at || !updated_at) return null;
  const status = sanitizeCouncilRunStatus(input.status);
  const can_resume = status === "failed" || status === "stopped" || status === "canceled";
  const quality_check = sanitizeCouncilQualityCheck(input.quality_check);
  const reflection = sanitizeCouncilReflectionState(input.reflection);
  const finalization = sanitizeCouncilFinalizationState(input.finalization);
  const exports = sanitizeCouncilExportsState(input.exports);
  const threadKey = normalizeInboxThreadKey(input.thread_key);
  const threadKeySourceRaw = String(input.thread_key_source || "").trim();
  const threadKeySource: CouncilRunRecord["thread_key_source"] =
    threadKeySourceRaw === "request_id" || threadKeySourceRaw === "run_id" || threadKeySourceRaw === "fallback" || threadKeySourceRaw === "preview"
      ? threadKeySourceRaw
      : undefined;
  return {
    run_id,
    request_id,
    topic,
    constraints,
    max_rounds,
    auto_build: Boolean(input.auto_build),
    thread_id,
    status,
    created_at,
    updated_at,
    started_at: clipText(input.started_at, 80).trim() || undefined,
    finished_at: clipText(input.finished_at, 80).trim() || undefined,
    step_count,
    current_step,
    current_role: clipText(input.current_role, 80).trim() || undefined,
    retries,
    last_captured_msg: clipText(input.last_captured_msg, 1000) || undefined,
    stop_requested: Boolean(input.stop_requested),
    can_resume,
    final_message_id: clipText(input.final_message_id, 160).trim() || undefined,
    taskify_draft_id: clipText(input.taskify_draft_id, 160).trim() || undefined,
    taskify_request_id: clipText(input.taskify_request_id, 160).trim() || undefined,
    artifact_run_id: clipText(input.artifact_run_id, 160).trim() || undefined,
    artifact_status: clipText(input.artifact_status, 40).trim() || undefined,
    artifact_path: clipText(input.artifact_path, 240).trim() || undefined,
    bundle_path: clipText(input.bundle_path, 240).trim() || undefined,
    last_error: clipText(input.last_error, 500).trim() || undefined,
    quality_check,
    reflection,
    finalization,
    exports,
    thread_key: threadKey || undefined,
    thread_key_source: threadKeySource,
  };
}

function loadCouncilRunRecord(runIdInput: unknown): CouncilRunRecord | null {
  const runId = normalizeCouncilRunId(runIdInput);
  if (!runId) return null;
  const p = councilRunPath(runId);
  if (!fs.existsSync(p)) return null;
  const raw = readJson<unknown>(p, {});
  return sanitizeCouncilRunRecord(raw);
}

function saveCouncilRunRecord(run: CouncilRunRecord): void {
  writeJsonAtomic(councilRunPath(run.run_id), run);
}

function writeCouncilRunRequest(run: CouncilRunRecord): void {
  const payload = {
    run_id: run.run_id,
    request_id: run.request_id,
    topic: run.topic,
    constraints: run.constraints,
    max_rounds: run.max_rounds,
    auto_build: run.auto_build,
    thread_id: run.thread_id,
    thread_key: run.thread_key || makeCouncilAutopilotThreadKey({ request_id: run.request_id, run_id: run.run_id, mode: "execute" }).thread_key,
    thread_key_source: run.thread_key_source || makeCouncilAutopilotThreadKey({ request_id: run.request_id, run_id: run.run_id, mode: "execute" }).source,
    created_at: run.created_at,
  };
  writeJsonAtomic(councilRequestPath(run.run_id), payload);
}

function readCouncilLogTail(runIdInput: unknown, limitInput: number): { items: Record<string, unknown>[]; skipped_invalid: number } {
  const runId = normalizeCouncilRunId(runIdInput);
  const limit = Math.max(1, Math.min(Number(limitInput || 50), COUNCIL_LOG_LIMIT_MAX));
  if (!runId) return { items: [], skipped_invalid: 0 };
  const p = councilLogPath(runId);
  if (!fs.existsSync(p)) return { items: [], skipped_invalid: 0 };
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean);
  const items: Record<string, unknown>[] = [];
  let skipped = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const obj = JSON.parse(lines[i]);
      if (!isRecord(obj)) {
        skipped += 1;
        continue;
      }
      items.push(obj);
      if (items.length >= limit) break;
    } catch {
      skipped += 1;
    }
  }
  return { items, skipped_invalid: skipped };
}

type CouncilInboxTrackingRunState = {
  run_id: string;
  thread_key: string;
  started_notified: boolean;
  round_notified_count: number;
  final_notified: boolean;
  updated_at: string;
};

type CouncilInboxTrackingState = {
  version: 1;
  runs: Record<string, CouncilInboxTrackingRunState>;
};

function defaultCouncilInboxTrackingState(): CouncilInboxTrackingState {
  return { version: 1, runs: {} };
}

function loadCouncilInboxTrackingState(): CouncilInboxTrackingState {
  const raw = readJson<unknown>(COUNCIL_INBOX_TRACKING_PATH, defaultCouncilInboxTrackingState());
  const src = isRecord(raw) ? raw : {};
  const rows = isRecord(src.runs) ? src.runs : {};
  const runs: Record<string, CouncilInboxTrackingRunState> = {};
  for (const [runId, item] of Object.entries(rows)) {
    const run_id = normalizeCouncilRunId(runId);
    if (!run_id || !isRecord(item)) continue;
    const thread_key = normalizeInboxThreadKey(item.thread_key);
    if (!thread_key) continue;
    const roundRaw = Number(item.round_notified_count || 0);
    const round_notified_count = Number.isFinite(roundRaw) ? Math.max(0, Math.min(COUNCIL_INBOX_ROUND_LOG_CAP, Math.floor(roundRaw))) : 0;
    runs[run_id] = {
      run_id,
      thread_key,
      started_notified: item.started_notified === true,
      round_notified_count,
      final_notified: item.final_notified === true,
      updated_at: clipText(item.updated_at, 80).trim() || nowIso(),
    };
  }
  return { version: 1, runs };
}

function saveCouncilInboxTrackingState(state: CouncilInboxTrackingState): void {
  writeJsonAtomic(COUNCIL_INBOX_TRACKING_PATH, state);
}

function clipCouncilInboxBody(v: unknown): string {
  const base = String(v || "").replace(/\r/g, "").trim();
  if (!base) return "";
  if (base.length <= COUNCIL_INBOX_BODY_MAX) return base;
  const note = "…(truncated)";
  const keep = Math.max(0, COUNCIL_INBOX_BODY_MAX - note.length - 1);
  return `${base.slice(0, keep)}\n${note}`;
}

function summarizeForLine(s: unknown, maxChars: number): string {
  const cap = Math.max(8, Math.floor(Number(maxChars) || 0));
  const base = String(s || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "";
  if (base.length <= cap) return base;
  const note = "…(truncated)";
  const keep = Math.max(1, cap - note.length);
  return `${base.slice(0, keep)}${note}`;
}

type RoundRoleAssist = {
  identity_hint?: string;
  memory_hint?: string;
};

type RoundRoleAssistContext = {
  facilitator: RoundRoleAssist;
  critic: RoundRoleAssist;
  operator: RoundRoleAssist;
  jester: RoundRoleAssist;
  identity_hints_used: boolean;
  memory_hints_used: boolean;
};

function loadAgentsJson(): OrgAgent[] {
  try {
    const loaded = loadOrgAgentsSnapshot();
    return Array.isArray(loaded.snapshot.agents) ? loaded.snapshot.agents : [];
  } catch {
    return [];
  }
}

function getAgentIdentity(agent_id: string): {
  display_name: string;
  role: string;
  identity_traits?: Record<string, unknown>;
} {
  const id = normalizeMemoryAgentId(agent_id);
  if (!id) return { display_name: "", role: "" };
  const agents = loadAgentsJson();
  const found = agents.find((a) => a.id === id) || null;
  if (!found) return { display_name: "", role: "" };
  const identity_traits = found.identity ? {
    tagline: found.identity.tagline || "",
    speaking_style: found.identity.speaking_style || "",
    focus: found.identity.focus || "",
    values: Array.isArray(found.identity.values) ? found.identity.values.slice(0, 5) : [],
    strengths: Array.isArray(found.identity.strengths) ? found.identity.strengths.slice(0, 5) : [],
    weaknesses: Array.isArray(found.identity.weaknesses) ? found.identity.weaknesses.slice(0, 5) : [],
    do: Array.isArray(found.identity.do) ? found.identity.do.slice(0, 5) : [],
    dont: Array.isArray(found.identity.dont) ? found.identity.dont.slice(0, 5) : [],
  } : undefined;
  return {
    display_name: String(found.display_name || ""),
    role: String(found.role || ""),
    identity_traits,
  };
}

function identityTraitsHint(agent_id: string): string {
  try {
    const info = getAgentIdentity(agent_id);
    const tr = isRecord(info.identity_traits) ? info.identity_traits : {};
    const parts: string[] = [];
    if (info.display_name) parts.push(`名=${info.display_name}`);
    if (tr.speaking_style) parts.push(`口調=${summarizeForLine(tr.speaking_style, 80)}`);
    const values = Array.isArray(tr.values) ? tr.values.map((x) => summarizeForLine(x, 24)).filter((x) => !!x).slice(0, 2) : [];
    if (values.length) parts.push(`指針=${values.join("/")}`);
    if (tr.focus) parts.push(`焦点=${summarizeForLine(tr.focus, 50)}`);
    return summarizeForLine(parts.join(" / "), 200);
  } catch {
    return "";
  }
}

function loadAgentMemorySnippet(agent_id: string): { procedures?: string; knowledge?: string } {
  const id = normalizeMemoryAgentId(agent_id);
  if (!id) return {};
  const pick = (category: MemoryCategory): string => {
    try {
      const rows = readMemoryItems(id, category, 5).items;
      const parts: string[] = [];
      for (const row of rows) {
        const tags = Array.isArray(row.tags) && row.tags.length ? `#${row.tags.slice(0, 2).join("#")}` : "";
        const bodyFirst = summarizeForLine(String(row.body || "").split(/\r?\n/).find((x) => String(x || "").trim()) || "", 80);
        const token = summarizeForLine([row.title, tags, bodyFirst].filter((x) => !!x).join(" | "), 120);
        if (!token) continue;
        parts.push(token);
        if (parts.join(" ; ").length >= 180) break;
      }
      return summarizeForLine(parts.join(" ; "), 200);
    } catch {
      return "";
    }
  };
  const procedures = pick("procedures");
  const knowledge = pick("knowledge");
  return {
    procedures: procedures || undefined,
    knowledge: knowledge || undefined,
  };
}

function resolveRoundRoleAgentIds(agents: OrgAgent[]): { facilitator: string; critic: string; operator: string; jester: string } {
  const byId = new Set(agents.map((a) => String(a.id || "")));
  const pick = (preferred: string, fallback: string): string => {
    if (byId.has(preferred)) return preferred;
    if (byId.has(fallback)) return fallback;
    return preferred;
  };
  return {
    facilitator: pick("facilitator", "facilitator"),
    critic: pick("critic", "qa"),
    operator: pick("operator", "impl"),
    jester: pick("jester", "jester"),
  };
}

function buildRoundRoleAssistContext(): RoundRoleAssistContext {
  const agents = loadAgentsJson();
  const ids = resolveRoundRoleAgentIds(agents);
  const mk = (agentId: string): RoundRoleAssist => {
    const identity_hint = identityTraitsHint(agentId);
    const mem = loadAgentMemorySnippet(agentId);
    const memory_hint = summarizeForLine([mem.procedures, mem.knowledge].filter((x) => !!x).join(" / "), 200);
    return {
      identity_hint: identity_hint || undefined,
      memory_hint: memory_hint || undefined,
    };
  };
  const facilitator = mk(ids.facilitator);
  const critic = mk(ids.critic);
  const operator = mk(ids.operator);
  const jester = mk(ids.jester);
  const rows = [facilitator, critic, operator, jester];
  return {
    facilitator,
    critic,
    operator,
    jester,
    identity_hints_used: rows.some((x) => !!x.identity_hint),
    memory_hints_used: rows.some((x) => !!x.memory_hint),
  };
}

function appendAssistHint(base: string, assist: RoundRoleAssist | undefined, maxChars: number): string {
  const main = summarizeForLine(base, maxChars);
  if (!main) return "";
  const hintParts: string[] = [];
  if (assist?.identity_hint) hintParts.push(assist.identity_hint);
  if (assist?.memory_hint) hintParts.push(assist.memory_hint);
  if (!hintParts.length) return main;
  return summarizeForLine(`${main}（${hintParts.join(" / ")}）`, maxChars);
}

function buildRoleFormattedRoundBody(input: {
  facilitator_decision?: unknown;
  facilitator_next?: unknown;
  critic_risk?: unknown;
  critic_counterexample?: unknown;
  operator_plan?: unknown;
  operator_steps?: unknown;
  jester_break?: unknown;
  jester_oversight?: unknown;
  round_summary?: unknown;
  assist_context?: Partial<RoundRoleAssistContext>;
}): string {
  const fallbackSummary = summarizeForLine(input.round_summary, 1200);
  let facilitatorDecision = summarizeForLine(input.facilitator_decision || fallbackSummary, 700);
  let facilitatorNext = summarizeForLine(input.facilitator_next, 500);
  let criticRisk = summarizeForLine(input.critic_risk, 700);
  let criticCounter = summarizeForLine(input.critic_counterexample, 500);
  let operatorPlan = summarizeForLine(input.operator_plan, 700);
  let operatorSteps = summarizeForLine(input.operator_steps, 500);
  let jesterBreak = summarizeForLine(input.jester_break, 700);
  let jesterOversight = summarizeForLine(input.jester_oversight, 500);

  if (!facilitatorDecision && !facilitatorNext) {
    facilitatorNext = "(未確定) 次に決める: 目的/DoD/安全装置の確認";
  }
  if (!criticRisk && !criticCounter) {
    criticRisk = "(未提示) 想定失敗: 並列/ドリフト/パス逸脱";
  }
  if (!operatorPlan && !operatorSteps) {
    operatorPlan = "(未提示) 最小差分で実装→smoke→gate";
  }
  if (!jesterBreak && !jesterOversight) {
    jesterBreak = "(未提示) 前提: 入力/権限/環境が変わると破綻しない？";
  }

  const assist = isRecord(input.assist_context) ? input.assist_context : {};
  const lines = [
    `司会: 決定=${appendAssistHint(facilitatorDecision, assist.facilitator as RoundRoleAssist | undefined, 700)} / 次=${summarizeForLine(facilitatorNext, 500)}`,
    `批判役: リスク=${appendAssistHint(criticRisk, assist.critic as RoundRoleAssist | undefined, 700)} / 反例=${summarizeForLine(criticCounter, 500)}`,
    `実務: 実装案=${appendAssistHint(operatorPlan, assist.operator as RoundRoleAssist | undefined, 700)} / 手順=${summarizeForLine(operatorSteps, 500)}`,
    `道化師: 前提崩し=${appendAssistHint(jesterBreak, assist.jester as RoundRoleAssist | undefined, 700)} / うっかり=${summarizeForLine(jesterOversight, 500)}`,
  ];
  return clipCouncilInboxBody(lines.join("\n"));
}

function appendCouncilAutopilotInboxEntry(input: {
  source: "council_autopilot" | "council_autopilot_round" | "council_autopilot_final";
  title: string;
  body: string;
  mention?: boolean;
  run: CouncilRunRecord;
  links?: Record<string, unknown>;
}): void {
  try {
    const run = input.run;
    const thread_key = normalizeInboxThreadKey(run.thread_key) || makeCouncilAutopilotThreadKey({
      request_id: run.request_id,
      run_id: run.run_id,
      mode: "execute",
    }).thread_key;
    const entry: Record<string, unknown> = {
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: run.thread_id || "general",
      msg_id: run.request_id || run.run_id,
      role: "system",
      mention: input.mention === true,
      title: clipText(input.title, 256),
      body: clipCouncilInboxBody(input.body),
      source: input.source,
      thread_key,
      links: {
        request_id: run.request_id,
        run_id: run.run_id,
        thread_id: run.thread_id,
        design_id: readLatestDesignId(),
        ...(isRecord(input.links) ? input.links : {}),
        artifact_paths: [String(run.artifact_path || ""), String(run.bundle_path || "")]
          .map((x) => x.replaceAll("\\", "/").trim())
          .filter((x) => !!x)
          .slice(0, 20),
      },
    };
    appendInboxEntry(entry);
  } catch {
    // best-effort only
  }
}

function summarizeCouncilRoundFromLogs(run: CouncilRunRecord, round: number): string {
  const logs = readCouncilLogTail(run.run_id, 120).items;
  const toInt = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  };
  const textFrom = (obj: Record<string, unknown>): string => {
    const candidates = [
      obj.summary,
      obj.note,
      obj.message,
      obj.content,
      obj.text,
      obj.decision,
      obj.todo,
      obj.result,
      obj.output,
    ];
    for (const c of candidates) {
      const s = String(c || "").replace(/\s+/g, " ").trim();
      if (s) return clipText(s, 1000);
    }
    return "";
  };
  for (const row of logs) {
    const logRound = Math.max(toInt((row as any).round), toInt((row as any).current_step), toInt((row as any).step));
    if (logRound !== round) continue;
    const summary = textFrom(row);
    if (summary) return summary;
  }
  if (round === Math.max(0, Math.floor(Number(run.current_step || run.step_count || 0)))) {
    const fallback = String(run.last_captured_msg || "").replace(/\s+/g, " ").trim();
    if (fallback) return clipText(fallback, 1000);
  }
  return "";
}

function listCouncilRunRecords(limit = 200): CouncilRunRecord[] {
  if (!fs.existsSync(COUNCIL_RUNS_DIR)) return [];
  const files = fs.readdirSync(COUNCIL_RUNS_DIR)
    .filter((x) => x.toLowerCase().endsWith(".json"))
    .slice(-Math.max(1, Math.min(2000, limit)));
  const out: CouncilRunRecord[] = [];
  for (const name of files) {
    const runId = normalizeCouncilRunId(name.replace(/\.json$/i, ""));
    if (!runId) continue;
    const run = loadCouncilRunRecord(runId);
    if (!run) continue;
    out.push(run);
  }
  out.sort((a, b) => (String(a.updated_at || "") < String(b.updated_at || "") ? 1 : -1));
  return out.slice(0, Math.max(1, Math.min(500, limit)));
}

function runCouncilInboxTrackingSweep(): void {
  const state = loadCouncilInboxTrackingState();
  let changed = false;
  const assistContext = buildRoundRoleAssistContext();
  const runs = listCouncilRunRecords(300);
  for (const run of runs) {
    const thread_key = normalizeInboxThreadKey(run.thread_key) || makeCouncilAutopilotThreadKey({
      request_id: run.request_id,
      run_id: run.run_id,
      mode: "execute",
    }).thread_key;
    if (thread_key && run.thread_key !== thread_key) {
      run.thread_key = thread_key;
      if (!run.thread_key_source) run.thread_key_source = run.request_id ? "request_id" : (run.run_id ? "run_id" : "fallback");
      saveCouncilRunRecord(run);
    }
    if (!thread_key) continue;
    const tracked = state.runs[run.run_id] || {
      run_id: run.run_id,
      thread_key,
      started_notified: false,
      round_notified_count: 0,
      final_notified: false,
      updated_at: nowIso(),
    };
    tracked.thread_key = thread_key;

    if (!tracked.started_notified) {
      if (inboxHasRequestNotification("council_autopilot", run.request_id)) {
        tracked.started_notified = true;
        changed = true;
      } else {
        appendCouncilAutopilotInboxEntry({
          source: "council_autopilot",
          title: "Autopilot started",
          body: `topic=${clipText(run.topic, 240)} / max_rounds=${Math.max(1, Math.floor(Number(run.max_rounds || 1)))} / actor=council_autopilot`,
          run,
        });
        tracked.started_notified = true;
        changed = true;
      }
    }

    const stepCount = Math.max(0, Math.floor(Number(run.current_step || run.step_count || 0)));
    const targetRounds = Math.max(0, Math.min(COUNCIL_INBOX_ROUND_LOG_CAP, stepCount));
    while (tracked.round_notified_count < targetRounds) {
      const roundNo = tracked.round_notified_count + 1;
      const summary = summarizeCouncilRoundFromLogs(run, roundNo);
      const fallbackSummary = summary || `Round${roundNo}: status=${run.status} / role=${String(run.current_role || "-")} / decision=pending`;
      const body = buildRoleFormattedRoundBody({
        round_summary: fallbackSummary,
        assist_context: assistContext,
      });
      appendCouncilAutopilotInboxEntry({
        source: "council_autopilot_round",
        title: `Autopilot round ${roundNo}`,
        body,
        run,
        links: {
          round_index: roundNo,
          round_id: `${run.run_id}:round_${roundNo}`,
        },
      });
      tracked.round_notified_count = roundNo;
      changed = true;
    }

    const isFinal = run.status === "completed" || run.status === "failed" || run.status === "stopped" || run.status === "canceled";
    if (isFinal && !tracked.final_notified) {
      if (inboxHasRequestNotification("council_autopilot_final", run.request_id)) {
        tracked.final_notified = true;
        changed = true;
      } else {
        const failed = run.status !== "completed";
        const settings = loadDesktopSettings();
        const mentionToken = getMentionToken(settings);
        const failureKeys = (run.quality_check?.failures || []).map((x) => x.key).slice(0, 5).join(", ");
        const reason = clipText(run.last_error || failureKeys || run.status, 600);
        const successSummary = [
          run.artifact_path ? `artifact=${run.artifact_path}` : "",
          run.bundle_path ? `bundle=${run.bundle_path}` : "",
          `run_id=${run.run_id}`,
        ].filter((x) => !!x).join(" / ");
        appendCouncilAutopilotInboxEntry({
          source: "council_autopilot_final",
          title: failed ? "Autopilot FAILED" : "Autopilot completed",
          body: failed
            ? `${mentionToken} status=${run.status} / reason=${reason} / hint=check council logs and quality_check`
            : `status=completed / ${successSummary || `run_id=${run.run_id}`}`,
          mention: failed,
          run,
        });
        tracked.final_notified = true;
        changed = true;
      }
    }
    if (isFinal) {
      const appendedRevertSuggestion = maybeAppendAutopilotRevertSuggestion(run);
      if (appendedRevertSuggestion) changed = true;
    }

    tracked.updated_at = nowIso();
    state.runs[run.run_id] = tracked;
  }
  if (changed) saveCouncilInboxTrackingState(state);
}

function buildCouncilArtifactTaskYaml(input: {
  run_id: string;
  thread_id: string;
  answer_markdown: string;
  include_bundle: boolean;
}): { task_id: string; yaml_text: string; answer_path: string; bundle_path: string; manifest_path: string } {
  const stamp = ymdHmsStamp();
  const task_id = `task_ui_council_artifact_${stamp}`;
  const answer_path = `written/council_answer_${stamp}.md`;
  const bundle_path = `bundles/council_${stamp}.zip`;
  const manifest_path = `bundles/council_${stamp}_manifest.json`;
  const doc: Record<string, unknown> = {
    apiVersion: "v1",
    kind: "pipeline",
    metadata: {
      id: task_id,
      role: "implementer",
      assignee: "implementer_01",
      title: "Council artifact build",
      category: "implementer",
      tags: ["taskify", "taskify_v1_safe", "council_autopilot"],
    },
    artifact: { mirror_run_meta: true },
    runtime: { timeout_ms: 30000, timeout_expected: false },
    steps: [
      {
        id: "step1_file_write",
        task: {
          kind: "file_write",
          files: [{ path: answer_path, text: String(input.answer_markdown || "").slice(0, FILE_CAP), mode: "overwrite" }],
        },
      },
    ],
    acceptance: [
      { type: "artifact_exists", path: answer_path },
      { type: "artifact_file_contains", path: answer_path, contains: "## 決定事項" },
      { type: "artifact_file_contains", path: answer_path, contains: "## 未決事項" },
      { type: "artifact_file_contains", path: answer_path, contains: "## 次アクション" },
    ],
  };
  if (input.include_bundle) {
    (doc.steps as Array<Record<string, unknown>>).push({
      id: "step2_archive_zip",
      task: {
        kind: "archive_zip",
        inputs: [answer_path, `ui/council/logs/${input.run_id}.jsonl`],
        output: { zip_path: bundle_path, manifest_path },
      },
    });
    (doc.acceptance as Array<Record<string, unknown>>).push({ type: "artifact_exists", path: bundle_path });
  }
  return { task_id, yaml_text: YAML.stringify(doc), answer_path, bundle_path, manifest_path };
}

function applyOrgAgentPatch(current: OrgAgent, patch: Record<string, unknown>, now: string): OrgAgent {
  const next: OrgAgent = { ...current };
  let changed = false;
  if (patch.display_name !== undefined) {
    if (typeof patch.display_name !== "string") throw new Error("org_agents.display_name_type_invalid");
    const v = clipText(patch.display_name, 120).trim();
    if (!v) throw new Error("org_agents.display_name_required");
    if (next.display_name !== v) {
      next.display_name = v;
      changed = true;
    }
  }
  if (patch.role !== undefined) {
    if (!isOrgAgentRole(patch.role)) throw new Error("org_agents.role_invalid");
    if (next.role !== patch.role) {
      next.role = patch.role;
      changed = true;
    }
  }
  if (patch.icon !== undefined) {
    if (typeof patch.icon !== "string") throw new Error("org_agents.icon_type_invalid");
    const v = clipText(patch.icon, 32);
    if (!v) throw new Error("org_agents.icon_required");
    if (next.icon !== v) {
      next.icon = v;
      changed = true;
    }
  }
  if (patch.status !== undefined) {
    if (!isOrgAgentStatus(patch.status)) throw new Error("org_agents.status_invalid");
    if (next.status !== patch.status) {
      next.status = patch.status;
      changed = true;
    }
  }
  if (patch.assigned_thread_id !== undefined) {
    if (patch.assigned_thread_id !== null && typeof patch.assigned_thread_id !== "string") throw new Error("org_agents.assigned_thread_id_type_invalid");
    const v = patch.assigned_thread_id === null ? null : clipText(patch.assigned_thread_id, 120).trim();
    if (next.assigned_thread_id !== v) {
      next.assigned_thread_id = v;
      changed = true;
    }
  }
  if (patch.last_message !== undefined) {
    if (patch.last_message !== null && typeof patch.last_message !== "string") throw new Error("org_agents.last_message_type_invalid");
    const v = patch.last_message === null ? null : clipText(patch.last_message, ORG_AGENT_TEXT_MAX);
    if (next.last_message !== v) {
      next.last_message = v;
      changed = true;
    }
  }
  if (patch.identity !== undefined) {
    if (patch.identity === null) {
      if (next.identity !== undefined) {
        delete next.identity;
        changed = true;
      }
    } else {
      if (!isRecord(patch.identity)) throw new Error("org_agents.identity_type_invalid");
      const enforceList = (arr: unknown, field: string): string[] => {
        if (!Array.isArray(arr)) throw new Error(`org_agents.identity_${field}_type_invalid`);
        if (arr.length > ORG_AGENT_IDENTITY_LIST_MAX) throw new Error(`org_agents.identity_${field}_too_many`);
        const out: string[] = [];
        for (const row of arr) {
          if (typeof row !== "string") throw new Error(`org_agents.identity_${field}_item_type_invalid`);
          if (row.length > ORG_AGENT_IDENTITY_STRING_MAX) throw new Error(`org_agents.identity_${field}_item_too_long`);
          const s = row.trim();
          if (!s) continue;
          out.push(s);
        }
        return out;
      };
      const build = (src: Record<string, unknown>): NonNullable<OrgAgent["identity"]> => {
        const cur = next.identity || {
          tagline: "",
          values: [],
          speaking_style: "",
          strengths: [],
          weaknesses: [],
          do: [],
          dont: [],
          focus: "",
        };
        const tagline = src.tagline !== undefined
          ? (() => {
            if (typeof src.tagline !== "string") throw new Error("org_agents.identity_tagline_type_invalid");
            if (src.tagline.length > ORG_AGENT_IDENTITY_STRING_MAX) throw new Error("org_agents.identity_tagline_too_long");
            return src.tagline.trim();
          })()
          : cur.tagline;
        const speaking_style = src.speaking_style !== undefined
          ? (() => {
            if (typeof src.speaking_style !== "string") throw new Error("org_agents.identity_speaking_style_type_invalid");
            if (src.speaking_style.length > ORG_AGENT_IDENTITY_STYLE_MAX) throw new Error("org_agents.identity_speaking_style_too_long");
            return src.speaking_style.trim();
          })()
          : cur.speaking_style;
        const focus = src.focus !== undefined
          ? (() => {
            if (typeof src.focus !== "string") throw new Error("org_agents.identity_focus_type_invalid");
            if (src.focus.length > ORG_AGENT_IDENTITY_STYLE_MAX) throw new Error("org_agents.identity_focus_too_long");
            return src.focus.trim();
          })()
          : cur.focus;
        return {
          tagline,
          speaking_style,
          focus,
          values: src.values !== undefined ? enforceList(src.values, "values") : (cur.values || []),
          strengths: src.strengths !== undefined ? enforceList(src.strengths, "strengths") : (cur.strengths || []),
          weaknesses: src.weaknesses !== undefined ? enforceList(src.weaknesses, "weaknesses") : (cur.weaknesses || []),
          do: src.do !== undefined ? enforceList(src.do, "do") : (cur.do || []),
          dont: src.dont !== undefined ? enforceList(src.dont, "dont") : (cur.dont || []),
        };
      };
      const identity = build(patch.identity);
      const same = JSON.stringify(next.identity || null) === JSON.stringify(identity);
      if (!same) {
        next.identity = identity;
        changed = true;
      }
    }
  }
  if (patch.layout !== undefined) {
    if (patch.layout === null) {
      if (next.layout !== undefined) {
        delete next.layout;
        changed = true;
      }
    } else {
      if (!isRecord(patch.layout)) throw new Error("org_agents.layout_type_invalid");
      const x = Number(patch.layout.x);
      const y = Number(patch.layout.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("org_agents.layout_non_finite");
      if (x < 0 || x > 1 || y < 0 || y > 1) throw new Error("org_agents.layout_out_of_range");
      const same = !!next.layout && next.layout.x === x && next.layout.y === y;
      if (!same) {
        next.layout = { x, y };
        changed = true;
      }
    }
  }
  if (changed) next.last_updated_at = now;
  return next;
}

function sanitizeTaskifyDraft(input: unknown): TaskifyDraft | null {
  if (!isRecord(input)) return null;
  return {
    id: clipText(input.id, 160),
    ts: clipText(input.ts, 80),
    source: cleanTaskifySource(input.source),
    title: clipText(input.title, 200),
    task_yaml: clipText(input.task_yaml, FILE_CAP),
    generated_by: clipText(input.generated_by, 80),
    notes: clipText(input.notes, 400),
  };
}

function readTaskifyDrafts(limitInput: number): { items: TaskifyDraft[]; skipped_invalid: number } {
  const limit = Math.max(1, Math.min(Number(limitInput || 50), TASKIFY_DRAFTS_LIMIT_MAX));
  if (!fs.existsSync(TASKIFY_DRAFTS_PATH)) return { items: [], skipped_invalid: 0 };
  const lines = fs.readFileSync(TASKIFY_DRAFTS_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  const out: TaskifyDraft[] = [];
  let skipped = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const item = sanitizeTaskifyDraft(JSON.parse(lines[i]));
      if (!item || !item.id || !item.ts || !item.task_yaml) {
        skipped += 1;
        continue;
      }
      out.push(item);
      if (out.length >= limit) break;
    } catch {
      skipped += 1;
    }
  }
  return { items: out, skipped_invalid: skipped };
}

function readTaskifyDraftById(id: string): TaskifyDraft | null {
  const target = String(id || "").trim();
  if (!target || !fs.existsSync(TASKIFY_DRAFTS_PATH)) return null;
  const lines = fs.readFileSync(TASKIFY_DRAFTS_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const item = sanitizeTaskifyDraft(JSON.parse(lines[i]));
      if (item && item.id === target) return item;
    } catch {
      continue;
    }
  }
  return null;
}

function deleteTaskifyDraftById(id: string): boolean {
  const target = String(id || "").trim();
  if (!target || !fs.existsSync(TASKIFY_DRAFTS_PATH)) return false;
  const lines = fs.readFileSync(TASKIFY_DRAFTS_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  const kept: string[] = [];
  let removed = false;
  for (const line of lines) {
    try {
      const item = sanitizeTaskifyDraft(JSON.parse(line));
      if (item && item.id === target) {
        removed = true;
        continue;
      }
    } catch {
      // Keep malformed records to avoid destructive edits.
    }
    kept.push(line);
  }
  if (!removed) return false;
  const tmp = `${TASKIFY_DRAFTS_PATH}.tmp`;
  fs.writeFileSync(tmp, `${kept.join("\n")}${kept.length ? "\n" : ""}`, "utf8");
  fs.renameSync(tmp, TASKIFY_DRAFTS_PATH);
  return true;
}

function withTaskifySafety(draft: TaskifyDraft): TaskifyDraft & { safe: boolean; unsafe_reasons: string[]; unsafe_details: Record<string, unknown> } {
  const safety = evaluateTaskifyDraftSafety(draft);
  return {
    ...draft,
    safe: safety.safe,
    unsafe_reasons: safety.reasons,
    unsafe_details: safety.details,
  };
}

function loadTaskifyTrackingEntries(): TaskifyQueueTrackingEntry[] {
  const raw = readJson<{ items?: unknown[] }>(TASKIFY_QUEUE_TRACKING_PATH, { items: [] });
  const items = Array.isArray(raw.items) ? raw.items : [];
  const out: TaskifyQueueTrackingEntry[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const request_id = String(item.request_id || "").trim();
    const draft_id = String(item.draft_id || "").trim();
    const statusRaw = String(item.status || "queued");
    const status: TaskifyQueueTrackingEntry["status"] =
      statusRaw === "started" || statusRaw === "completed" || statusRaw === "failed" ? statusRaw : "queued";
    if (!request_id || !draft_id) continue;
    out.push({
      request_id,
      draft_id,
      queued_at: String(item.queued_at || ""),
      status,
      run_id: String(item.run_id || ""),
      last_checked_at: String(item.last_checked_at || ""),
      inbox_notified_at: String(item.inbox_notified_at || ""),
      done_at: String(item.done_at || ""),
      note: String(item.note || ""),
    });
    if (out.length >= TASKIFY_TRACKING_LIMIT_MAX) break;
  }
  return out;
}

function saveTaskifyTrackingEntries(items: TaskifyQueueTrackingEntry[]): void {
  const capped = items.slice(-TASKIFY_TRACKING_LIMIT_MAX);
  writeJsonAtomic(TASKIFY_QUEUE_TRACKING_PATH, { items: capped });
}

function addTaskifyTrackingEntry(entry: TaskifyQueueTrackingEntry): void {
  const items = loadTaskifyTrackingEntries();
  items.push(entry);
  saveTaskifyTrackingEntries(items);
}

function getTaskifyTrackingForRequest(requestId: string): TaskifyQueueTrackingEntry | null {
  const id = String(requestId || "").trim();
  if (!id) return null;
  const items = loadTaskifyTrackingEntries().filter((x) => x.request_id === id);
  if (!items.length) return null;
  items.sort((a, b) => (a.queued_at < b.queued_at ? 1 : -1));
  return items[0];
}

function getTaskifyTrackingForDraft(draftId: string): TaskifyQueueTrackingEntry[] {
  const id = String(draftId || "").trim();
  if (!id) return [];
  const items = loadTaskifyTrackingEntries().filter((x) => x.draft_id === id);
  items.sort((a, b) => (a.queued_at < b.queued_at ? 1 : -1));
  return items.slice(0, 50);
}

function parseTaskifyMetaFromTaskYaml(taskYamlPath: string): { request_id?: string; draft_id?: string } {
  if (!fs.existsSync(taskYamlPath)) return {};
  try {
    const parsed = YAML.parse(fs.readFileSync(taskYamlPath, "utf8"));
    if (!isRecord(parsed)) return {};
    let request_id = "";
    let draft_id = "";
    if (isRecord(parsed.runtime) && isRecord(parsed.runtime.meta)) {
      request_id = String(parsed.runtime.meta.taskify_request_id || "");
      draft_id = String(parsed.runtime.meta.taskify_draft_id || "");
    }
    if ((!request_id || !draft_id) && isRecord(parsed.metadata) && Array.isArray(parsed.metadata.tags)) {
      const tags = parsed.metadata.tags.map((x) => String(x));
      if (!request_id) {
        const rt = tags.find((t) => t.startsWith("taskify_request_id:"));
        request_id = rt ? rt.slice("taskify_request_id:".length) : "";
      }
      if (!draft_id) {
        const dt = tags.find((t) => t.startsWith("taskify_draft_id:"));
        draft_id = dt ? dt.slice("taskify_draft_id:".length) : "";
      }
    }
    return { request_id, draft_id };
  } catch {
    return {};
  }
}

function getMentionToken(settings: DesktopSettings): string {
  return (settings.mention?.tokens || []).find((x) => String(x || "").startsWith("@")) || "@shogun";
}

function appendTaskifyInboxEntry(input: { request_id: string; draft_id: string; run_id?: string; status: "completed" | "failed" }): void {
  const settings = loadDesktopSettings();
  const mentionToken = getMentionToken(settings);
  const failed = input.status === "failed";
  const title = failed ? "Taskify run failed" : "Taskify run completed";
  const body = failed
    ? `${mentionToken} Taskify queue request failed. request_id=${input.request_id} draft_id=${input.draft_id} run_id=${input.run_id || "-"}`
    : `Taskify queue request completed. request_id=${input.request_id} draft_id=${input.draft_id} run_id=${input.run_id || "-"}`;
  const entry = {
    id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    ts: nowIso(),
    thread_id: "taskify",
    msg_id: input.request_id,
    role: "system",
    mention: failed,
    title: clipText(title, 256),
    body: clipText(body, 2000),
    source: "taskify_queue",
    links: {
      run_id: String(input.run_id || ""),
      draft_id: String(input.draft_id || ""),
      request_id: String(input.request_id || ""),
      artifact_paths: [],
    },
  };
  appendInboxEntry(entry);
}

function inboxHasRequestNotification(source: string, requestId: string): boolean {
  const reqId = String(requestId || "").trim();
  const src = String(source || "").trim();
  if (!reqId || !src || !fs.existsSync(INBOX_PATH)) return false;
  try {
    const lines = fs.readFileSync(INBOX_PATH, "utf8").split(/\r?\n/).filter(Boolean);
    const maxScan = 2000;
    for (let i = lines.length - 1, scanned = 0; i >= 0 && scanned < maxScan; i -= 1, scanned += 1) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (!isRecord(parsed)) continue;
      if (String(parsed.source || "") !== src) continue;
      const msgId = String(parsed.msg_id || "").trim();
      const links = isRecord(parsed.links) ? parsed.links : {};
      const linkReqId = String(links.request_id || "").trim();
      if (msgId === reqId || linkReqId === reqId) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function appendEvidenceExportInboxEntry(input: {
  request_id: string;
  run_id?: string;
  status: "completed" | "failed";
  bundle_zip_path?: string;
  bundle_manifest_path?: string;
}): boolean {
  const requestId = String(input.request_id || "").trim();
  if (!requestId) return false;
  if (inboxHasRequestNotification("export_evidence_bundle", requestId)) return false;
  const settings = loadDesktopSettings();
  const mentionToken = getMentionToken(settings);
  const failed = input.status === "failed";
  const title = failed ? "Evidence bundle FAILED" : "Evidence bundle ready";
  const body = failed
    ? `${mentionToken} Evidence export FAILED. request_id=${requestId} run_id=${input.run_id || "-"}`
    : `Evidence export completed. request_id=${requestId} run_id=${input.run_id || "-"}`;
  const artifact_paths = [String(input.bundle_zip_path || ""), String(input.bundle_manifest_path || "")]
    .map((x) => x.replaceAll("\\", "/").trim())
    .filter((x) => !!x)
    .slice(0, 20)
    .map((x) => clipText(x, 240));
  const entry: Record<string, unknown> = {
    id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    ts: nowIso(),
    thread_id: "export",
    msg_id: requestId,
    role: "system",
    mention: failed,
    title: clipText(title, 256),
    body: clipText(body, 2000),
    source: "export_evidence_bundle",
    links: {
      request_id: requestId,
      run_id: clipText(input.run_id, 120),
      artifact_paths,
    },
  };
  let roughSize = 0;
  try {
    roughSize = JSON.stringify(entry).length;
  } catch {
    roughSize = 0;
  }
  if (roughSize > INBOX_ENTRY_TEXT_MAX) {
    entry.body = clipText(entry.body, 1000);
    entry.note = "trimmed";
  }
  appendInboxEntry(entry);
  return true;
}

function appendOpsSnapshotInboxEntry(input: {
  request_id: string;
  run_id?: string;
  status: "completed" | "failed";
  snapshot_path?: string;
}): boolean {
  const requestId = String(input.request_id || "").trim();
  if (!requestId) return false;
  if (inboxHasRequestNotification("export_ops_snapshot", requestId)) return false;
  const settings = loadDesktopSettings();
  const mentionToken = getMentionToken(settings);
  const failed = input.status === "failed";
  const title = failed ? "Ops snapshot FAILED" : "Ops snapshot ready";
  const body = failed
    ? `${mentionToken} Ops snapshot FAILED. request_id=${requestId} run_id=${input.run_id || "-"}`
    : `Ops snapshot completed. request_id=${requestId} run_id=${input.run_id || "-"}`;
  const artifact_paths = [String(input.snapshot_path || "")]
    .map((x) => x.replaceAll("\\", "/").trim())
    .filter((x) => !!x)
    .slice(0, 20)
    .map((x) => clipText(x, 240));
  const entry: Record<string, unknown> = {
    id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    ts: nowIso(),
    thread_id: "export",
    msg_id: requestId,
    role: "system",
    mention: failed,
    title: clipText(title, 256),
    body: clipText(body, 2000),
    source: "export_ops_snapshot",
    links: {
      request_id: requestId,
      run_id: clipText(input.run_id, 120),
      artifact_paths,
    },
  };
  let roughSize = 0;
  try {
    roughSize = JSON.stringify(entry).length;
  } catch {
    roughSize = 0;
  }
  if (roughSize > INBOX_ENTRY_TEXT_MAX) {
    entry.body = clipText(entry.body, 1000);
    entry.note = "trimmed";
  }
  appendInboxEntry(entry);
  return true;
}

function sendJson(res: http.ServerResponse, status: number, payload: any): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none';");
  res.end(JSON.stringify(payload));
}

function badRequest(res: http.ServerResponse, msg: string): void {
  sendJson(res, 400, { ok: false, reason: msg });
}

function badRequestWithDetails(res: http.ServerResponse, reason: string, details: Record<string, unknown>): void {
  sendJson(res, 400, { ok: false, reason, details });
}

function notFound(res: http.ServerResponse): void {
  sendJson(res, 404, { ok: false, reason: "not_found" });
}

function pathStartsWithOneOf(p: string, allowedPrefixes: string[]): boolean {
  const x = String(p || "").replaceAll("\\", "/");
  return allowedPrefixes.some((prefix) => x.startsWith(prefix));
}

function evaluateTaskifyDraftSafety(draft: TaskifyDraft): TaskifySafety {
  const reasons: string[] = [];
  const details: Record<string, unknown> = {};
  if (String(draft.generated_by || "") !== "taskify_v1_safe") {
    reasons.push("generated_by_invalid");
  }
  let parsed: any = null;
  try {
    parsed = YAML.parse(String(draft.task_yaml || ""));
  } catch {
    reasons.push("yaml_parse_failed");
    return { safe: false, reasons, details };
  }
  if (!isRecord(parsed)) {
    reasons.push("yaml_root_invalid");
    return { safe: false, reasons, details };
  }

  const kind = String(parsed.kind || "");
  if (kind !== "pipeline") reasons.push("kind_not_pipeline");

  const artifact = isRecord(parsed.artifact) ? parsed.artifact : {};
  if (artifact.mirror_run_meta !== true) reasons.push("mirror_run_meta_required");

  const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
  if (!steps.length) reasons.push("steps_missing");
  const allowedKinds = new Set(["file_write", "archive_zip"]);
  const stepKinds: string[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (!isRecord(step) || !isRecord(step.task)) {
      reasons.push(`step_${i}_task_missing`);
      continue;
    }
    const task = step.task as Record<string, unknown>;
    const stepKind = String(task.kind || "");
    stepKinds.push(stepKind);
    if (!allowedKinds.has(stepKind)) {
      reasons.push(`step_${i}_kind_forbidden:${stepKind || "missing"}`);
      continue;
    }
    if (stepKind === "file_write") {
      const files = Array.isArray(task.files) ? task.files : [];
      if (!files.length) reasons.push(`step_${i}_file_write_files_missing`);
      for (let j = 0; j < files.length; j += 1) {
        const f = files[j];
        if (!isRecord(f)) {
          reasons.push(`step_${i}_file_${j}_invalid`);
          continue;
        }
        const p = String(f.path || "");
        const normalized = normalizeRelPath(p);
        if (!normalized.ok || !normalized.normalized) {
          reasons.push(`step_${i}_file_${j}_path_invalid`);
        }
      }
    }
    if (stepKind === "archive_zip") {
      const output = isRecord(task.output) ? task.output : {};
      const zipPath = String(output.zip_path || "");
      const manifestPath = String(output.manifest_path || "");
      const zipNorm = normalizeRelPath(zipPath);
      const manifestNorm = normalizeRelPath(manifestPath);
      if (!zipNorm.ok || !zipNorm.normalized || !zipNorm.normalized.startsWith("bundles/")) {
        reasons.push(`step_${i}_archive_zip_path_invalid`);
      }
      if (!manifestNorm.ok || !manifestNorm.normalized || !manifestNorm.normalized.startsWith("bundles/")) {
        reasons.push(`step_${i}_archive_manifest_path_invalid`);
      }
    }
  }

  const acceptance = Array.isArray(parsed.acceptance) ? parsed.acceptance : [];
  const allowedArtifactPrefixes = ["written/", "bundles/", "_meta/"];
  for (let i = 0; i < acceptance.length; i += 1) {
    const acc = acceptance[i];
    if (!isRecord(acc)) {
      reasons.push(`acceptance_${i}_invalid`);
      continue;
    }
    if (acc.path !== undefined) {
      const p = String(acc.path || "");
      if (!pathStartsWithOneOf(p, allowedArtifactPrefixes)) {
        reasons.push(`acceptance_${i}_path_prefix_invalid`);
      }
    }
    if (acc.zip_path !== undefined) {
      const zp = String(acc.zip_path || "");
      if (!pathStartsWithOneOf(zp, ["bundles/"])) {
        reasons.push(`acceptance_${i}_zip_path_prefix_invalid`);
      }
    }
  }

  details.kind = kind;
  details.step_kinds = stepKinds;
  details.generated_by = String(draft.generated_by || "");
  details.reasons_count = reasons.length;
  return { safe: reasons.length === 0, reasons, details };
}

function runTaskifyTrackingSweep(): void {
  const entries = loadTaskifyTrackingEntries();
  if (!entries.length) return;
  const active = entries.filter((x) => x.status === "queued" || x.status === "started");
  if (!active.length) return;

  const runRows = listRuns(120);
  const requestToRun = new Map<string, string>();
  for (const row of runRows) {
    const runId = String(row.run_id || "");
    if (!runId) continue;
    const taskMetaPath = path.join(RUNS_DIR, runId, "files", "_meta", "task.yaml");
    const marker = parseTaskifyMetaFromTaskYaml(taskMetaPath);
    const request_id = String(marker.request_id || "");
    if (!request_id) continue;
    if (!requestToRun.has(request_id)) requestToRun.set(request_id, runId);
  }

  let changed = false;
  const now = nowIso();
  for (const entry of entries) {
    if (!(entry.status === "queued" || entry.status === "started")) continue;
    entry.last_checked_at = now;
    const matchedRunId = requestToRun.get(entry.request_id);
    if (!matchedRunId) continue;
    entry.run_id = matchedRunId;

    let terminal: "completed" | "failed" | "" = "";
    const result = loadRunResultYaml(matchedRunId);
    const status = String(result?.metadata?.status || "").toLowerCase();
    if (status === "success") terminal = "completed";
    if (status === "failed") terminal = "failed";
    if (!terminal) {
      if (entry.status !== "started") {
        entry.status = "started";
        changed = true;
      }
      continue;
    }

    entry.status = terminal;
    entry.done_at = nowIso();
    changed = true;
    if (!entry.inbox_notified_at) {
      try {
        appendTaskifyInboxEntry({
          request_id: entry.request_id,
          draft_id: entry.draft_id,
          run_id: entry.run_id,
          status: terminal,
        });
        entry.inbox_notified_at = nowIso();
        changed = true;
      } catch {
        // best-effort only; keep tracker alive
      }
    }
  }
  if (changed) saveTaskifyTrackingEntries(entries);
}

function readJson<T = any>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(p: string, payload: any): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function writeJsonAtomic(p: string, payload: any): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, p);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function defaultDesktopSettings(): DesktopSettings {
  return {
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
}

function defaultDesktopNotifyState(): DesktopNotifyState {
  return {
    last_notified: {},
    last_poll_ok_at: "",
    failure_count: 0,
    backoff_ms: 5000,
  };
}

function loadDesktopSettings(): DesktopSettings {
  const defaults = defaultDesktopSettings();
  const current = readJson<DesktopSettings>(DESKTOP_SETTINGS_PATH, defaults);
  if (!fs.existsSync(DESKTOP_SETTINGS_PATH)) {
    writeJsonAtomic(DESKTOP_SETTINGS_PATH, defaults);
    return defaults;
  }
  return mergeDesktopSettings(defaults, current);
}

function loadDesktopNotifyState(): DesktopNotifyState {
  const defaults = defaultDesktopNotifyState();
  const current = readJson<DesktopNotifyState>(DESKTOP_NOTIFY_STATE_PATH, defaults);
  return {
    last_notified: isRecord(current?.last_notified) ? Object.fromEntries(Object.entries(current.last_notified).map(([k, v]) => [k, String(v)])) : {},
    last_poll_ok_at: String(current?.last_poll_ok_at || ""),
    failure_count: Math.max(0, Number(current?.failure_count || 0)),
    backoff_ms: Math.max(0, Number(current?.backoff_ms || 0)),
  };
}

function defaultInboxReadState(): InboxReadState {
  return { global_last_read_ts: "", by_thread: {}, thread_keys: {} };
}

function loadInboxReadState(): InboxReadState {
  const raw = readJson<InboxReadState>(INBOX_READ_STATE_PATH, defaultInboxReadState());
  const byThreadInput = isRecord(raw?.by_thread) ? raw.by_thread : {};
  const byThreadKeyInput = isRecord(raw?.thread_keys) ? raw.thread_keys : {};
  const by_thread: Record<string, { last_read_ts?: string; last_read_id?: string }> = {};
  const thread_keys: Record<string, { last_read_ts?: string; last_read_key?: string; read_keys?: string[] }> = {};
  for (const [k, v] of Object.entries(byThreadInput)) {
    if (!isRecord(v)) continue;
    by_thread[String(k)] = {
      last_read_ts: String(v.last_read_ts || ""),
      last_read_id: String(v.last_read_id || ""),
    };
  }
  for (const [k, v] of Object.entries(byThreadKeyInput)) {
    if (!isRecord(v)) continue;
    const key = normalizeInboxThreadKey(k);
    if (!key) continue;
    const readKeys = Array.isArray(v.read_keys)
      ? v.read_keys.map((x) => clipText(x, 180).trim()).filter((x) => !!x).slice(-500)
      : [];
    thread_keys[key] = {
      last_read_ts: String(v.last_read_ts || ""),
      last_read_key: clipText(v.last_read_key, 180).trim(),
      read_keys: readKeys,
    };
  }
  return {
    global_last_read_ts: String(raw?.global_last_read_ts || ""),
    by_thread,
    thread_keys,
  };
}

function clipInboxText(v: unknown, cap: number): string {
  const s = String(v || "");
  return s.length > cap ? s.slice(0, cap) : s;
}

function normalizeInboxThreadKey(value: unknown): string {
  const s = clipText(value, INBOX_THREAD_KEY_MAX).trim().toLowerCase();
  if (!s) return "";
  if (!INBOX_THREAD_KEY_RE.test(s)) return "";
  return s;
}

function sanitizeThreadKeyToken(value: unknown, cap = 48): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const normalized = raw.replace(/[^a-z0-9:_-]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) return "";
  return clipText(normalized, Math.max(1, Math.floor(cap)));
}

function shortHashToken(value: unknown, len = 8): string {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, Math.max(4, Math.floor(len)));
}

function makeQuickActionsThreadKey(
  kindInput: unknown,
  requestIdInput: unknown,
  runIdInput: unknown,
  mode: "execute" | "preview" = "execute",
): { thread_key: string; source: "request_id" | "run_id" | "fallback" | "preview" } {
  const kind = sanitizeThreadKeyToken(kindInput, 24) || "unknown";
  const requestId = sanitizeThreadKeyToken(requestIdInput, 42);
  const runId = sanitizeThreadKeyToken(runIdInput, 42);
  if (mode === "preview") {
    const stamp = nowIso().replace(/[-:.TZ]/g, "").slice(0, 14);
    const keyPreview = normalizeInboxThreadKey(`qa:${kind}:preview_${stamp}`) || `qa:${kind}:preview_${shortHashToken(stamp)}`;
    return { thread_key: keyPreview, source: "preview" };
  }
  if (requestId) {
    let key = normalizeInboxThreadKey(`qa:${kind}:${requestId}`);
    if (!key) key = normalizeInboxThreadKey(`qa:${kind}:${clipText(requestId, 24)}_${shortHashToken(requestId)}`);
    return { thread_key: key || `qa:${kind}:${shortHashToken(requestId)}`, source: "request_id" };
  }
  if (runId) {
    let key = normalizeInboxThreadKey(`qa:${kind}:run_${runId}`);
    if (!key) key = normalizeInboxThreadKey(`qa:${kind}:run_${clipText(runId, 24)}_${shortHashToken(runId)}`);
    return { thread_key: key || `qa:${kind}:run_${shortHashToken(runId)}`, source: "run_id" };
  }
  const stamp = nowIso().replace(/[-:.TZ]/g, "").slice(0, 14);
  const nonce = shortHashToken(`${kind}_${stamp}_${Math.random()}`, 6);
  let key = normalizeInboxThreadKey(`qa:${kind}:ts_${stamp}_${nonce}`);
  if (!key) key = `qa:${kind}:fallback_${shortHashToken(`${kind}_${stamp}_${nonce}`)}`;
  return { thread_key: key, source: "fallback" };
}

function makeCouncilAutopilotThreadKey(params: {
  request_id?: unknown;
  run_id?: unknown;
  mode?: "execute" | "preview";
}): { thread_key: string; source: "request_id" | "run_id" | "fallback" | "preview" } {
  const mode = params.mode === "preview" ? "preview" : "execute";
  const requestId = sanitizeThreadKeyToken(params.request_id, 60);
  const runId = sanitizeThreadKeyToken(params.run_id, 56);
  const toFit = (base: string, seed: string): string => {
    let key = normalizeInboxThreadKey(base);
    if (key) return key;
    const hashed = shortHashToken(seed || base, 8);
    const maxTokenLen = Math.max(8, INBOX_THREAD_KEY_MAX - 1 - 3 - 1 - hashed.length);
    const head = sanitizeThreadKeyToken(seed || base, maxTokenLen) || "id";
    key = normalizeInboxThreadKey(`ap:${head}_${hashed}`);
    return key || `ap:fallback_${hashed}`;
  };
  if (mode === "preview") {
    const stamp = nowIso().replace(/[-:.TZ]/g, "").slice(0, 14);
    const nonce = shortHashToken(`${stamp}_${Math.random()}`, 6);
    const seed = `preview_${stamp}_${nonce}`;
    return { thread_key: toFit(`ap:${seed}`, seed), source: "preview" };
  }
  if (requestId) {
    return { thread_key: toFit(`ap:${requestId}`, requestId), source: "request_id" };
  }
  if (runId) {
    const seed = `run_${runId}`;
    return { thread_key: toFit(`ap:${seed}`, seed), source: "run_id" };
  }
  const seed = "fallback_unknown";
  return { thread_key: toFit(`ap:${seed}`, seed), source: "fallback" };
}

function deriveInboxThreadKeyFromSource(sourceInput: unknown): string {
  const source = clipText(sourceInput, 120).trim().toLowerCase();
  if (!source) return "misc:unknown";
  if (source.startsWith("ops_auto_stabilize")) return "ops:auto_stabilize";
  if (source.startsWith("ops_quick_actions")) return "ops:quick_actions";
  if (source === "morning_brief") return "routine:morning_brief";
  if (source === "export_morning_brief_bundle") return "export:morning_brief_bundle";
  if (source === "export_ops_snapshot") return "export:ops_snapshot";
  if (source === "export_evidence_bundle") return "export:evidence_bundle";
  return `source:${source}`;
}

function deriveInboxThreadKey(input: unknown): string {
  if (!isRecord(input)) return "misc:unknown";
  const explicit = normalizeInboxThreadKey(input.thread_key);
  if (explicit) return explicit;
  const source = clipText(input.source, 120).trim().toLowerCase();
  const links = isRecord(input.links) ? input.links : {};
  if (source.startsWith("council_autopilot")) {
    const apKey = makeCouncilAutopilotThreadKey({
      request_id: links.request_id,
      run_id: links.run_id,
      mode: "execute",
    }).thread_key;
    if (apKey) return apKey;
  }
  const reqId = sanitizeThreadKeyToken(links.request_id, 42);
  const runId = sanitizeThreadKeyToken(links.run_id, 42);
  const quickKind = sanitizeThreadKeyToken(links.kind || links.quick_action_id, 24);
  if (reqId) {
    if (source === "export_ops_snapshot" || (source === "quick_actions_execute" && quickKind === "ops_snapshot")) {
      return makeQuickActionsThreadKey("ops_snapshot", reqId, "", "execute").thread_key;
    }
    if (source === "export_evidence_bundle" || (source === "quick_actions_execute" && quickKind === "evidence_bundle")) {
      return makeQuickActionsThreadKey("evidence_bundle", reqId, "", "execute").thread_key;
    }
  }
  if (runId) {
    if (source === "quick_actions_execute" && quickKind === "thread_archive_scheduler") {
      return makeQuickActionsThreadKey("thread_archive_scheduler", "", runId, "execute").thread_key;
    }
    const keyRun = normalizeInboxThreadKey(`qa:run:${runId}`);
    if (keyRun) return keyRun;
  }
  return deriveInboxThreadKeyFromSource(input.source);
}

function appendInboxEntry(input: unknown): void {
  if (!isRecord(input)) return;
  const entry: Record<string, unknown> = { ...input };
  entry.thread_key = deriveInboxThreadKey(entry);
  appendJsonlAtomic(INBOX_PATH, `${JSON.stringify(entry)}\n`);
}

function sanitizeInboxItem(input: unknown): InboxItem | null {
  if (!isRecord(input)) return null;
  const linksInput = isRecord(input.links) ? input.links : {};
  return {
    id: String(input.id || ""),
    ts: String(input.ts || ""),
    thread_id: String(input.thread_id || ""),
    msg_id: String(input.msg_id || ""),
    role: String(input.role || ""),
    mention: !!input.mention,
    title: clipInboxText(input.title, 256),
    body: clipInboxText(input.body, 2000),
    source: String(input.source || ""),
    thread_key: deriveInboxThreadKey(input),
    links: {
      run_id: String(linksInput.run_id || ""),
      design_id: String(linksInput.design_id || ""),
      request_id: String(linksInput.request_id || ""),
      artifact_paths: Array.isArray(linksInput.artifact_paths) ? linksInput.artifact_paths.map((x) => String(x)).slice(0, 50) : [],
    },
    note: String(input.note || ""),
  };
}

function readInboxItems(limit: number, afterTs: string): { items: InboxItem[]; skipped_invalid: number } {
  if (!fs.existsSync(INBOX_PATH)) return { items: [], skipped_invalid: 0 };
  const raw = fs.readFileSync(INBOX_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const out: InboxItem[] = [];
  let skipped = 0;
  const afterMs = afterTs ? new Date(afterTs).getTime() : 0;
  const cappedLimit = Math.max(1, Math.min(limit, INBOX_LIMIT_MAX));
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i]);
      const item = sanitizeInboxItem(parsed);
      if (!item || !item.id || !item.ts) {
        skipped += 1;
        continue;
      }
      const tsMs = new Date(item.ts).getTime();
      if (afterMs > 0 && Number.isFinite(tsMs) && tsMs <= afterMs) continue;
      const roughSize = JSON.stringify(item).length;
      if (roughSize > INBOX_ENTRY_TEXT_MAX) {
        item.body = clipInboxText(item.body, 1000);
        item.note = item.note ? `${item.note};trimmed` : "trimmed";
      }
      out.push(item);
      if (out.length >= cappedLimit) break;
    } catch {
      skipped += 1;
    }
  }
  return { items: out, skipped_invalid: skipped };
}

function readInboxItemsByThreadKey(threadKeyInput: string, limitInput: number): { items: InboxItem[]; skipped_invalid: number } {
  if (!fs.existsSync(INBOX_PATH)) return { items: [], skipped_invalid: 0 };
  const key = normalizeInboxThreadKey(threadKeyInput);
  if (!key) return { items: [], skipped_invalid: 0 };
  const limit = Math.max(1, Math.min(INBOX_THREAD_LIMIT_MAX, Math.floor(Number(limitInput) || 20)));
  const raw = fs.readFileSync(INBOX_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const out: InboxItem[] = [];
  let skipped = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i]);
      const item = sanitizeInboxItem(parsed);
      if (!item || !item.id || !item.ts) {
        skipped += 1;
        continue;
      }
      if (String(item.thread_key || "") !== key) continue;
      const roughSize = JSON.stringify(item).length;
      if (roughSize > INBOX_ENTRY_TEXT_MAX) {
        item.body = clipInboxText(item.body, 1000);
        item.note = item.note ? `${item.note};trimmed` : "trimmed";
      }
      out.push(item);
      if (out.length >= limit) break;
    } catch {
      skipped += 1;
    }
  }
  return { items: out, skipped_invalid: skipped };
}

function makeInboxStableReadKey(item: InboxItem): string {
  const id = clipText(item.id, 120).trim();
  if (id) return `id:${id}`;
  const msgId = clipText(item.msg_id, 120).trim();
  if (msgId) return `msg:${msgId}`;
  const reqId = clipText(item.links?.request_id, 120).trim();
  if (reqId) return `req:${reqId}`;
  const raw = `${clipText(item.ts, 80)}|${clipText(item.source, 120)}|${clipText(item.title, 240)}|${clipText(item.body, 800)}`;
  const digest = crypto.createHash("sha1").update(raw).digest("hex").slice(0, 20);
  return `hash:${digest}`;
}

function markInboxThreadReadState(threadKeyInput: string, limitScanInput: number): { thread_key: string; marked_read: number; scanned: number } {
  if (!fs.existsSync(INBOX_PATH)) {
    return { thread_key: normalizeInboxThreadKey(threadKeyInput), marked_read: 0, scanned: 0 };
  }
  const threadKey = normalizeInboxThreadKey(threadKeyInput);
  const limitScan = Math.max(1, Math.min(INBOX_THREAD_READ_SCAN_MAX, Math.floor(Number(limitScanInput) || INBOX_THREAD_READ_SCAN_DEFAULT)));
  const raw = fs.readFileSync(INBOX_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const matchedItems: InboxItem[] = [];
  let scanned = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    scanned += 1;
    if (scanned > limitScan) break;
    try {
      const parsed = JSON.parse(lines[i]);
      const item = sanitizeInboxItem(parsed);
      if (!item || !item.ts) continue;
      if (String(item.thread_key || "") !== threadKey) continue;
      matchedItems.push(item);
      if (matchedItems.length >= INBOX_THREAD_READ_ITEMS_MAX) break;
    } catch {
      continue;
    }
  }
  const state = loadInboxReadState();
  const next: InboxReadState = {
    global_last_read_ts: state.global_last_read_ts || "",
    by_thread: { ...(state.by_thread || {}) },
    thread_keys: { ...(state.thread_keys || {}) },
  };
  const prev = isRecord(next.thread_keys) && isRecord(next.thread_keys[threadKey])
    ? (next.thread_keys[threadKey] as Record<string, unknown>)
    : {};
  const prevKeys = Array.isArray(prev.read_keys)
    ? prev.read_keys.map((x) => clipText(x, 180).trim()).filter((x) => !!x)
    : [];
  const known = new Set(prevKeys);
  let marked = 0;
  let lastTs = clipText(prev.last_read_ts, 80).trim();
  let lastKey = clipText(prev.last_read_key, 180).trim();
  for (const item of matchedItems) {
    const stableKey = makeInboxStableReadKey(item);
    if (!known.has(stableKey)) {
      known.add(stableKey);
      marked += 1;
    }
    const ts = clipText(item.ts, 80).trim();
    if (!lastTs || (new Date(ts).getTime() > new Date(lastTs).getTime())) {
      lastTs = ts;
      lastKey = stableKey;
    }
  }
  if (isRecord(next.thread_keys)) {
    next.thread_keys[threadKey] = {
      last_read_ts: lastTs,
      last_read_key: lastKey,
      read_keys: Array.from(known).slice(-500),
    };
  }
  writeJsonAtomic(INBOX_READ_STATE_PATH, next);
  return { thread_key: threadKey, marked_read: marked, scanned: Math.min(scanned, limitScan) };
}

function tokyoDateYmdCompact(input: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(input);
  const y = parts.find((p) => p.type === "year")?.value || "0000";
  const m = parts.find((p) => p.type === "month")?.value || "00";
  const d = parts.find((p) => p.type === "day")?.value || "00";
  return `${y}${m}${d}`;
}

function sanitizeThreadKeyForFile(threadKey: string): string {
  return normalizeInboxThreadKey(threadKey).replaceAll(":", "_");
}

function defaultInboxThreadArchiveState(): InboxThreadArchiveState {
  return {
    last_archived_ts_by_thread_key: {},
    last_archived_count_by_thread_key: {},
    last_run_at: "",
  };
}

function loadInboxThreadArchiveState(): InboxThreadArchiveState {
  const raw = readJson<InboxThreadArchiveState>(INBOX_THREAD_ARCHIVE_STATE_PATH, defaultInboxThreadArchiveState());
  const tsMapIn = isRecord(raw?.last_archived_ts_by_thread_key) ? raw.last_archived_ts_by_thread_key : {};
  const countMapIn = isRecord(raw?.last_archived_count_by_thread_key) ? raw.last_archived_count_by_thread_key : {};
  const tsMap: Record<string, string> = {};
  const countMap: Record<string, number> = {};
  for (const [k, v] of Object.entries(tsMapIn)) {
    const key = normalizeInboxThreadKey(k);
    if (!key) continue;
    const ts = clipText(v, 80).trim();
    if (ts) tsMap[key] = ts;
  }
  for (const [k, v] of Object.entries(countMapIn)) {
    const key = normalizeInboxThreadKey(k);
    if (!key) continue;
    const n = Math.max(0, Math.floor(Number(v) || 0));
    countMap[key] = n;
  }
  return {
    last_archived_ts_by_thread_key: tsMap,
    last_archived_count_by_thread_key: countMap,
    last_run_at: clipText(raw?.last_run_at, 80).trim(),
  };
}

function isExpiredDeadline(deadlineMs?: number): boolean {
  return Number.isFinite(Number(deadlineMs || 0)) && Number(deadlineMs) > 0 && Date.now() >= Number(deadlineMs);
}

function readJsonlTailLines(absPath: string, tailBytesInput: number): { lines: string[]; truncated: boolean } {
  const tailBytes = Math.max(INBOX_THREAD_ARCHIVE_TAIL_BYTES_MIN, Math.min(INBOX_THREAD_ARCHIVE_TAIL_BYTES_MAX, Math.floor(Number(tailBytesInput) || INBOX_THREAD_ARCHIVE_TAIL_BYTES_DEFAULT)));
  const raw = readFileTailUtf8(absPath, tailBytes);
  let text = raw.text;
  if (raw.truncated) {
    const newline = text.indexOf("\n");
    if (newline >= 0) text = text.slice(newline + 1);
  }
  return { lines: text.split(/\r?\n/).filter(Boolean), truncated: raw.truncated };
}

function collectInboxThreadItemsNewestFirst(input: {
  thread_key: string;
  since_ms: number;
  max_items: number;
  limit_scan: number;
  tail_bytes: number;
  deadline_ms?: number;
}): { picked_newest_first: InboxItem[]; scanned: number; skipped_invalid: number; mode: "tail_bytes" | "line_scan"; timed_out: boolean; note: string } {
  const threadKey = normalizeInboxThreadKey(input.thread_key);
  const maxItems = Math.max(1, Math.min(INBOX_THREAD_ARCHIVE_ITEMS_MAX, Math.floor(Number(input.max_items) || INBOX_THREAD_ARCHIVE_ITEMS_DEFAULT)));
  const limitScan = Math.max(1, Math.min(INBOX_THREAD_ARCHIVE_SCAN_MAX, Math.floor(Number(input.limit_scan) || INBOX_THREAD_ARCHIVE_SCAN_DEFAULT)));
  const pickedNewestFirst: InboxItem[] = [];
  let scanned = 0;
  let skippedInvalid = 0;
  let timedOut = false;
  const tail = readJsonlTailLines(INBOX_PATH, input.tail_bytes);
  for (let i = tail.lines.length - 1; i >= 0; i -= 1) {
    if (isExpiredDeadline(input.deadline_ms)) {
      timedOut = true;
      break;
    }
    scanned += 1;
    if (scanned > limitScan) break;
    try {
      const parsed = sanitizeInboxItem(JSON.parse(tail.lines[i]));
      if (!parsed || !parsed.ts) {
        skippedInvalid += 1;
        continue;
      }
      if (String(parsed.thread_key || "") !== threadKey) continue;
      const tsMs = new Date(String(parsed.ts || "")).getTime();
      if (input.since_ms > 0 && Number.isFinite(tsMs) && tsMs <= input.since_ms) continue;
      pickedNewestFirst.push(parsed);
      if (pickedNewestFirst.length >= maxItems) break;
    } catch {
      skippedInvalid += 1;
    }
  }
  if (pickedNewestFirst.length > 0 || timedOut || scanned >= limitScan) {
    return {
      picked_newest_first: pickedNewestFirst,
      scanned: Math.min(scanned, limitScan),
      skipped_invalid: skippedInvalid,
      mode: "tail_bytes",
      timed_out: timedOut,
      note: tail.truncated ? "tail_bytes_truncated" : "tail_bytes",
    };
  }
  const lines = fs.readFileSync(INBOX_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  scanned = 0;
  skippedInvalid = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (isExpiredDeadline(input.deadline_ms)) {
      timedOut = true;
      break;
    }
    scanned += 1;
    if (scanned > limitScan) break;
    try {
      const parsed = sanitizeInboxItem(JSON.parse(lines[i]));
      if (!parsed || !parsed.ts) {
        skippedInvalid += 1;
        continue;
      }
      if (String(parsed.thread_key || "") !== threadKey) continue;
      const tsMs = new Date(String(parsed.ts || "")).getTime();
      if (input.since_ms > 0 && Number.isFinite(tsMs) && tsMs <= input.since_ms) continue;
      pickedNewestFirst.push(parsed);
      if (pickedNewestFirst.length >= maxItems) break;
    } catch {
      skippedInvalid += 1;
    }
  }
  return {
    picked_newest_first: pickedNewestFirst,
    scanned: Math.min(scanned, limitScan),
    skipped_invalid: skippedInvalid,
    mode: "line_scan",
    timed_out: timedOut,
    note: "fallback_line_scan",
  };
}

function runInboxThreadArchive(input: {
  thread_key: string;
  dry_run: boolean;
  max_items: number;
  limit_scan: number;
  since_ts: string;
  tail_bytes?: number;
  audit_mode?: "default" | "none";
  deadline_ms?: number;
}): {
  action: string;
  thread_key: string;
  dry_run: boolean;
  archived: number;
  archive_path: string;
  since_ts: string;
  first_ts: string;
  last_ts: string;
  scanned: number;
  skipped_invalid: number;
  skipped_line_too_large: number;
  note: string;
  mode: "tail_bytes" | "line_scan";
  timed_out: boolean;
  elapsed_ms: number;
  exit_code: number;
} {
  const startedAtMs = Date.now();
  const now = new Date();
  const threadKey = normalizeInboxThreadKey(input.thread_key);
  const maxItems = Math.max(1, Math.min(INBOX_THREAD_ARCHIVE_ITEMS_MAX, Math.floor(Number(input.max_items) || INBOX_THREAD_ARCHIVE_ITEMS_DEFAULT)));
  const limitScan = Math.max(1, Math.min(INBOX_THREAD_ARCHIVE_SCAN_MAX, Math.floor(Number(input.limit_scan) || INBOX_THREAD_ARCHIVE_SCAN_DEFAULT)));
  const tailBytes = Math.max(INBOX_THREAD_ARCHIVE_TAIL_BYTES_MIN, Math.min(INBOX_THREAD_ARCHIVE_TAIL_BYTES_MAX, Math.floor(Number(input.tail_bytes) || INBOX_THREAD_ARCHIVE_TAIL_BYTES_DEFAULT)));
  const sinceTs = clipText(input.since_ts, 80).trim();
  const sinceMs = sinceTs ? new Date(sinceTs).getTime() : 0;
  const safeThread = sanitizeThreadKeyForFile(threadKey);
  const day = tokyoDateYmdCompact(now);
  const archivePathAbs = path.join(INBOX_THREAD_ARCHIVE_DIR, `thread_${safeThread}_${day}.jsonl`);
  const archivePath = archivePathAbs.replaceAll("\\", "/");
  const outBase = {
    action: "inbox_thread_archive",
    thread_key: threadKey,
    dry_run: input.dry_run === true,
    archived: 0,
    archive_path: archivePath,
    since_ts: sinceTs,
    first_ts: "",
    last_ts: "",
    scanned: 0,
    skipped_invalid: 0,
    skipped_line_too_large: 0,
    note: "",
    mode: "tail_bytes" as "tail_bytes" | "line_scan",
    timed_out: false,
    elapsed_ms: 0,
    exit_code: 0,
  };
  if (!fs.existsSync(INBOX_PATH)) {
    return { ...outBase, note: "inbox_missing", elapsed_ms: Date.now() - startedAtMs };
  }
  const collected = collectInboxThreadItemsNewestFirst({
    thread_key: threadKey,
    since_ms: sinceMs,
    max_items: maxItems,
    limit_scan: limitScan,
    tail_bytes: tailBytes,
    deadline_ms: input.deadline_ms,
  });
  const picked = [...collected.picked_newest_first].reverse();
  const firstTs = picked.length > 0 ? clipText(picked[0].ts, 80).trim() : "";
  const lastTs = picked.length > 0 ? clipText(picked[picked.length - 1].ts, 80).trim() : "";
  if (input.dry_run) {
    return {
      ...outBase,
      archived: picked.length,
      first_ts: firstTs,
      last_ts: lastTs,
      scanned: collected.scanned,
      skipped_invalid: collected.skipped_invalid,
      note: collected.timed_out ? "timeout" : "dry_run",
      mode: collected.mode,
      timed_out: collected.timed_out,
      elapsed_ms: Date.now() - startedAtMs,
    };
  }
  fs.mkdirSync(INBOX_THREAD_ARCHIVE_DIR, { recursive: true });
  let skippedLineTooLarge = 0;
  let archived = 0;
  let timedOut = collected.timed_out;
  for (const item of picked) {
    if (isExpiredDeadline(input.deadline_ms)) {
      timedOut = true;
      break;
    }
    const line = `${JSON.stringify(item)}\n`;
    const bytes = Buffer.byteLength(line, "utf8");
    if (bytes > INBOX_THREAD_ARCHIVE_LINE_BYTES_MAX) {
      skippedLineTooLarge += 1;
      continue;
    }
    appendJsonlAtomic(archivePathAbs, line);
    archived += 1;
  }
  const state = loadInboxThreadArchiveState();
  const nextState: InboxThreadArchiveState = {
    last_archived_ts_by_thread_key: { ...(state.last_archived_ts_by_thread_key || {}) },
    last_archived_count_by_thread_key: { ...(state.last_archived_count_by_thread_key || {}) },
    last_run_at: nowIso(),
  };
  if (archived > 0 && lastTs) {
    nextState.last_archived_ts_by_thread_key![threadKey] = lastTs;
  }
  const prevCount = Math.max(0, Math.floor(Number(nextState.last_archived_count_by_thread_key![threadKey] || 0)));
  nextState.last_archived_count_by_thread_key![threadKey] = prevCount + archived;
  writeJsonAtomic(INBOX_THREAD_ARCHIVE_STATE_PATH, nextState);
  return {
    ...outBase,
    archived,
    first_ts: firstTs,
    last_ts: lastTs,
    scanned: collected.scanned,
    skipped_invalid: collected.skipped_invalid,
    skipped_line_too_large: skippedLineTooLarge,
    note: timedOut ? "timeout" : (skippedLineTooLarge > 0 ? "line_size_skipped" : collected.note),
    mode: collected.mode,
    timed_out: timedOut,
    elapsed_ms: Date.now() - startedAtMs,
  };
}

type ThreadArchiveSchedulerLockRecord = {
  owner_pid: number;
  started_at: string;
  purpose: string;
};

type ThreadArchiveSchedulerRunResultItem = {
  thread_key: string;
  ok: boolean;
  archived: number;
  archive_path: string;
  mode: "tail_bytes" | "line_scan";
  elapsed_ms: number;
  reason?: string;
};

function normalizeDailyTime(input: unknown, fallback: string): string {
  const raw = clipText(input, 5).trim() || clipText(fallback, 5).trim() || "02:10";
  if (!/^\d{2}:\d{2}$/.test(raw)) return "02:10";
  const hh = Number(raw.slice(0, 2));
  const mm = Number(raw.slice(3, 5));
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return "02:10";
  return raw;
}

function defaultThreadArchiveSchedulerSettings(): ThreadArchiveSchedulerSettings {
  return {
    version: 1,
    enabled: false,
    daily_time: "02:10",
    thread_keys: ["ops:auto_stabilize", "export:morning_brief_bundle"],
    max_threads_per_run: 10,
    cooldown_sec: 3600,
    max_per_day: 1,
    limit_scan: INBOX_THREAD_ARCHIVE_SCAN_DEFAULT,
    max_items: INBOX_THREAD_ARCHIVE_ITEMS_DEFAULT,
    audit_summary: true,
    audit_per_thread: false,
    safety: {
      lock_stale_sec: 600,
      max_consecutive_failures: 3,
      per_thread_timeout_ms: 5000,
      total_timeout_ms: 20000,
    },
    scan: {
      tail_bytes: INBOX_THREAD_ARCHIVE_TAIL_BYTES_DEFAULT,
    },
  };
}

function normalizeThreadArchiveSchedulerSettings(input: unknown): ThreadArchiveSchedulerSettings {
  const defaults = defaultThreadArchiveSchedulerSettings();
  const raw = isRecord(input) ? input : {};
  const safetyRaw = isRecord(raw.safety) ? raw.safety : {};
  const scanRaw = isRecord(raw.scan) ? raw.scan : {};
  const threadKeysRaw = Array.isArray(raw.thread_keys) ? raw.thread_keys : defaults.thread_keys;
  const threadKeys: string[] = [];
  const seen = new Set<string>();
  for (const row of threadKeysRaw) {
    const key = normalizeInboxThreadKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    threadKeys.push(key);
    if (threadKeys.length >= THREAD_ARCHIVE_SCHED_MAX_KEYS) break;
  }
  const perThreadTimeoutMs = Math.max(
    THREAD_ARCHIVE_SCHED_PER_THREAD_TIMEOUT_MS_MIN,
    Math.min(
      THREAD_ARCHIVE_SCHED_PER_THREAD_TIMEOUT_MS_MAX,
      Math.floor(Number(safetyRaw.per_thread_timeout_ms ?? defaults.safety.per_thread_timeout_ms) || defaults.safety.per_thread_timeout_ms),
    ),
  );
  const totalTimeoutMsRaw = Math.max(
    THREAD_ARCHIVE_SCHED_TOTAL_TIMEOUT_MS_MIN,
    Math.min(
      THREAD_ARCHIVE_SCHED_TOTAL_TIMEOUT_MS_MAX,
      Math.floor(Number(safetyRaw.total_timeout_ms ?? defaults.safety.total_timeout_ms) || defaults.safety.total_timeout_ms),
    ),
  );
  const totalTimeoutMs = Math.max(totalTimeoutMsRaw, perThreadTimeoutMs);
  return {
    version: 1,
    enabled: raw.enabled === true,
    daily_time: normalizeDailyTime(raw.daily_time, defaults.daily_time),
    thread_keys: threadKeys,
    max_threads_per_run: Math.max(
      THREAD_ARCHIVE_SCHED_MAX_THREADS_PER_RUN_MIN,
      Math.min(
        THREAD_ARCHIVE_SCHED_MAX_THREADS_PER_RUN_MAX,
        Math.floor(Number(raw.max_threads_per_run ?? defaults.max_threads_per_run) || defaults.max_threads_per_run),
      ),
    ),
    cooldown_sec: Math.max(
      THREAD_ARCHIVE_SCHED_COOLDOWN_SEC_MIN,
      Math.min(
        THREAD_ARCHIVE_SCHED_COOLDOWN_SEC_MAX,
        Math.floor(Number(raw.cooldown_sec ?? defaults.cooldown_sec) || defaults.cooldown_sec),
      ),
    ),
    max_per_day: Math.max(
      THREAD_ARCHIVE_SCHED_MAX_PER_DAY_MIN,
      Math.min(
        THREAD_ARCHIVE_SCHED_MAX_PER_DAY_MAX,
        Math.floor(Number(raw.max_per_day ?? defaults.max_per_day) || defaults.max_per_day),
      ),
    ),
    limit_scan: Math.max(
      100,
      Math.min(
        INBOX_THREAD_ARCHIVE_SCAN_MAX,
        Math.floor(Number(raw.limit_scan ?? defaults.limit_scan) || defaults.limit_scan),
      ),
    ),
    max_items: Math.max(
      1,
      Math.min(
        INBOX_THREAD_ARCHIVE_ITEMS_MAX,
        Math.floor(Number(raw.max_items ?? defaults.max_items) || defaults.max_items),
      ),
    ),
    audit_summary: raw.audit_summary !== false,
    audit_per_thread: raw.audit_per_thread === true,
    safety: {
      lock_stale_sec: Math.max(
        THREAD_ARCHIVE_SCHED_LOCK_STALE_SEC_MIN,
        Math.min(
          THREAD_ARCHIVE_SCHED_LOCK_STALE_SEC_MAX,
          Math.floor(Number(safetyRaw.lock_stale_sec ?? defaults.safety.lock_stale_sec) || defaults.safety.lock_stale_sec),
        ),
      ),
      max_consecutive_failures: Math.max(
        THREAD_ARCHIVE_SCHED_MAX_FAILURES_MIN,
        Math.min(
          THREAD_ARCHIVE_SCHED_MAX_FAILURES_MAX,
          Math.floor(Number(safetyRaw.max_consecutive_failures ?? defaults.safety.max_consecutive_failures) || defaults.safety.max_consecutive_failures),
        ),
      ),
      per_thread_timeout_ms: perThreadTimeoutMs,
      total_timeout_ms: totalTimeoutMs,
    },
    scan: {
      tail_bytes: Math.max(
        INBOX_THREAD_ARCHIVE_TAIL_BYTES_MIN,
        Math.min(
          INBOX_THREAD_ARCHIVE_TAIL_BYTES_MAX,
          Math.floor(Number(scanRaw.tail_bytes ?? defaults.scan.tail_bytes) || defaults.scan.tail_bytes),
        ),
      ),
    },
  };
}

function patchThreadArchiveSchedulerSettings(current: ThreadArchiveSchedulerSettings, patch: unknown): ThreadArchiveSchedulerSettings {
  if (!isRecord(patch)) return current;
  const merged: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "safety" || k === "scan") continue;
    merged[k] = v;
  }
  const safety = isRecord(patch.safety) ? patch.safety : {};
  const scan = isRecord(patch.scan) ? patch.scan : {};
  merged.safety = { ...(isRecord(current.safety) ? current.safety : {}), ...safety };
  merged.scan = { ...(isRecord(current.scan) ? current.scan : {}), ...scan };
  return normalizeThreadArchiveSchedulerSettings(merged);
}

function loadThreadArchiveSchedulerSettings(): ThreadArchiveSchedulerSettings {
  const defaults = defaultThreadArchiveSchedulerSettings();
  if (!fs.existsSync(THREAD_ARCHIVE_SCHEDULER_SETTINGS_PATH)) {
    writeJsonAtomic(THREAD_ARCHIVE_SCHEDULER_SETTINGS_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(THREAD_ARCHIVE_SCHEDULER_SETTINGS_PATH, defaults);
  const normalized = normalizeThreadArchiveSchedulerSettings(raw);
  writeJsonAtomic(THREAD_ARCHIVE_SCHEDULER_SETTINGS_PATH, normalized);
  return normalized;
}

function defaultThreadArchiveSchedulerState(): ThreadArchiveSchedulerState {
  return {
    version: 1,
    enabled_effective: true,
    last_run_at: null,
    last_run_local_date: null,
    run_count_today: 0,
    last_result_ok: true,
    last_result_summary: "",
    failure_count: 0,
    backoff_ms: THREAD_ARCHIVE_SCHED_BACKOFF_MS_DEFAULT,
    last_error: "",
    last_inbox_id: null,
    last_elapsed_ms: 0,
    last_timed_out: false,
    last_results_sample: [],
    last_failed_thread_keys: [],
  };
}

function normalizeThreadArchiveSchedulerState(input: unknown): ThreadArchiveSchedulerState {
  const d = defaultThreadArchiveSchedulerState();
  const raw = isRecord(input) ? input : {};
  const sampleIn = Array.isArray(raw.last_results_sample) ? raw.last_results_sample : [];
  const failedIn = Array.isArray(raw.last_failed_thread_keys) ? raw.last_failed_thread_keys : [];
  const sample: ThreadArchiveSchedulerState["last_results_sample"] = [];
  for (const row of sampleIn) {
    if (!isRecord(row)) continue;
    const threadKey = normalizeInboxThreadKey(row.thread_key);
    if (!threadKey) continue;
    sample.push({
      thread_key: threadKey,
      ok: row.ok !== false,
      archived: Math.max(0, Math.floor(Number(row.archived || 0) || 0)),
      reason: clipText(row.reason, 180),
      elapsed_ms: Math.max(0, Math.floor(Number(row.elapsed_ms || 0) || 0)),
      mode: clipText(row.mode, 40),
    });
    if (sample.length >= 10) break;
  }
  const failedKeys: string[] = [];
  const seenFailed = new Set<string>();
  for (const row of failedIn) {
    const key = normalizeInboxThreadKey(row);
    if (!key || seenFailed.has(key)) continue;
    seenFailed.add(key);
    failedKeys.push(key);
    if (failedKeys.length >= 10) break;
  }
  return {
    version: 1,
    enabled_effective: raw.enabled_effective !== false,
    last_run_at: clipText(raw.last_run_at, 80).trim() || null,
    last_run_local_date: clipText(raw.last_run_local_date, 20).trim() || null,
    run_count_today: Math.max(0, Math.floor(Number(raw.run_count_today || 0) || 0)),
    last_result_ok: raw.last_result_ok !== false,
    last_result_summary: clipText(raw.last_result_summary, 500),
    failure_count: Math.max(0, Math.floor(Number(raw.failure_count || 0) || 0)),
    backoff_ms: Math.max(1000, Math.min(THREAD_ARCHIVE_SCHED_BACKOFF_MS_MAX, Math.floor(Number(raw.backoff_ms || d.backoff_ms) || d.backoff_ms))),
    last_error: clipText(raw.last_error, 500),
    last_inbox_id: clipText(raw.last_inbox_id, 120).trim() || null,
    last_elapsed_ms: Math.max(0, Math.floor(Number(raw.last_elapsed_ms || 0) || 0)),
    last_timed_out: raw.last_timed_out === true,
    last_results_sample: sample,
    last_failed_thread_keys: failedKeys,
  };
}

function loadThreadArchiveSchedulerState(): ThreadArchiveSchedulerState {
  const defaults = defaultThreadArchiveSchedulerState();
  if (!fs.existsSync(THREAD_ARCHIVE_SCHEDULER_STATE_PATH)) {
    writeJsonAtomic(THREAD_ARCHIVE_SCHEDULER_STATE_PATH, defaults);
    return defaults;
  }
  const raw = readJson<unknown>(THREAD_ARCHIVE_SCHEDULER_STATE_PATH, defaults);
  const normalized = normalizeThreadArchiveSchedulerState(raw);
  writeJsonAtomic(THREAD_ARCHIVE_SCHEDULER_STATE_PATH, normalized);
  return normalized;
}

function saveThreadArchiveSchedulerState(state: ThreadArchiveSchedulerState): void {
  writeJsonAtomic(THREAD_ARCHIVE_SCHEDULER_STATE_PATH, normalizeThreadArchiveSchedulerState(state));
}

function readThreadArchiveSchedulerLock(): ThreadArchiveSchedulerLockRecord | null {
  if (!fs.existsSync(THREAD_ARCHIVE_SCHEDULER_LOCK_PATH)) return null;
  try {
    const raw = readJson<unknown>(THREAD_ARCHIVE_SCHEDULER_LOCK_PATH, null);
    if (!isRecord(raw)) return null;
    return {
      owner_pid: Math.max(0, Math.floor(Number(raw.owner_pid || 0))),
      started_at: clipText(raw.started_at, 80).trim(),
      purpose: clipText(raw.purpose, 120).trim(),
    };
  } catch {
    return null;
  }
}

function isThreadArchiveSchedulerLockStale(rec: ThreadArchiveSchedulerLockRecord | null, staleSec: number): boolean {
  if (!rec || !rec.started_at) return true;
  const ms = new Date(rec.started_at).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return true;
  return (Date.now() - ms) > Math.max(1, staleSec) * 1000;
}

function tryAcquireThreadArchiveSchedulerLock(purpose: string): boolean {
  const payload: ThreadArchiveSchedulerLockRecord = { owner_pid: process.pid, started_at: nowIso(), purpose: clipText(purpose, 120) };
  try {
    const fd = fs.openSync(THREAD_ARCHIVE_SCHEDULER_LOCK_PATH, "wx");
    fs.writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function releaseThreadArchiveSchedulerLockIfOwned(): void {
  try {
    const rec = readThreadArchiveSchedulerLock();
    if (!rec || rec.owner_pid !== process.pid) return;
    if (fs.existsSync(THREAD_ARCHIVE_SCHEDULER_LOCK_PATH)) fs.unlinkSync(THREAD_ARCHIVE_SCHEDULER_LOCK_PATH);
  } catch {
    // best-effort
  }
}

function acquireThreadArchiveSchedulerLockWithRecovery(staleSec: number, purpose: string): { acquired: boolean; note: string } {
  if (tryAcquireThreadArchiveSchedulerLock(purpose)) return { acquired: true, note: "acquired" };
  const current = readThreadArchiveSchedulerLock();
  if (!current) {
    if (tryAcquireThreadArchiveSchedulerLock(purpose)) return { acquired: true, note: "acquired_after_missing" };
    return { acquired: false, note: "locked_unknown" };
  }
  if (!isThreadArchiveSchedulerLockStale(current, staleSec)) return { acquired: false, note: "locked" };
  try {
    if (fs.existsSync(THREAD_ARCHIVE_SCHEDULER_LOCK_PATH)) fs.unlinkSync(THREAD_ARCHIVE_SCHEDULER_LOCK_PATH);
  } catch {
    return { acquired: false, note: "stale_recover_failed" };
  }
  if (tryAcquireThreadArchiveSchedulerLock(purpose)) return { acquired: true, note: "stale_recovered" };
  return { acquired: false, note: "stale_recovered_but_locked" };
}

function appendInboxThreadArchivePerThreadAudit(input: {
  thread_key: string;
  archived: number;
  archive_path: string;
  since_ts: string;
  note: string;
  failed?: boolean;
  reason?: string;
}): void {
  const failed = input.failed === true;
  appendInboxEntry({
    id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    ts: nowIso(),
    thread_id: "inbox",
    thread_key: input.thread_key,
    msg_id: "",
    role: "system",
    mention: failed,
    title: failed ? "Thread archive failed" : "Thread archived",
    body: failed
      ? clipText(`thread_key=${input.thread_key} reason=${input.reason || "unknown"}`, 2000)
      : clipText(
        `thread_key=${input.thread_key} archived=${input.archived} archive_path=${input.archive_path} since_ts=${input.since_ts || "-"} note=${input.note || "-"}`,
        2000,
      ),
    source: "inbox_thread_archive",
    links: { artifact_paths: input.archive_path ? [input.archive_path] : [] },
  });
}

function summarizeThreadArchiveSchedulerResults(results: ThreadArchiveSchedulerRunResultItem[], timedOut: boolean): string {
  if (!results.length) return timedOut ? "timed_out:no_target_threads" : "no_target_threads";
  const okCount = results.filter((x) => x.ok).length;
  const failCount = results.length - okCount;
  const archivedTotal = results.reduce((acc, cur) => acc + Math.max(0, Math.floor(Number(cur.archived || 0) || 0)), 0);
  const timeoutText = timedOut ? " timed_out=true" : "";
  return `ok=${okCount} fail=${failCount} total=${results.length} archived=${archivedTotal}${timeoutText}`;
}

function toThreadArchiveSchedulerResultSample(results: ThreadArchiveSchedulerRunResultItem[]): NonNullable<ThreadArchiveSchedulerState["last_results_sample"]> {
  const out: NonNullable<ThreadArchiveSchedulerState["last_results_sample"]> = [];
  for (const row of results.slice(0, 10)) {
    out.push({
      thread_key: normalizeInboxThreadKey(row.thread_key),
      ok: row.ok,
      archived: Math.max(0, Math.floor(Number(row.archived || 0) || 0)),
      reason: clipText(row.reason, 180),
      elapsed_ms: Math.max(0, Math.floor(Number(row.elapsed_ms || 0) || 0)),
      mode: clipText(row.mode, 40),
    });
  }
  return out;
}

function toThreadArchiveSchedulerFailedKeys(results: ThreadArchiveSchedulerRunResultItem[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of results) {
    if (row.ok) continue;
    const key = normalizeInboxThreadKey(row.thread_key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= 10) break;
  }
  return out;
}

function formatNextRunLocalFromState(settings: ThreadArchiveSchedulerSettings, state: ThreadArchiveSchedulerState): string {
  if (!settings.enabled || !state.enabled_effective) return "";
  const now = new Date();
  const due = parseDailyTimeToToday(now, settings.daily_time);
  const lastLocal = clipText(state.last_run_local_date, 20).trim();
  const today = localDateYmd(now);
  if (lastLocal === today && now.getTime() >= due.getTime()) {
    due.setDate(due.getDate() + 1);
  } else if (now.getTime() > due.getTime() && lastLocal !== today) {
    // run overdue today; show current day schedule for observability.
  }
  const yyyy = due.getFullYear();
  const mm = String(due.getMonth() + 1).padStart(2, "0");
  const dd = String(due.getDate()).padStart(2, "0");
  const hh = String(due.getHours()).padStart(2, "0");
  const mi = String(due.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function appendThreadArchiveSchedulerSummaryAudit(input: {
  summary: string;
  results: ThreadArchiveSchedulerRunResultItem[];
  timed_out: boolean;
  mention: boolean;
}): string {
  const settings = loadDesktopSettings();
  const mentionToken = getMentionToken(settings);
  const detailRows: string[] = [];
  for (const row of input.results.slice(0, 10)) {
    if (row.ok) detailRows.push(`- ${row.thread_key}: archived=${row.archived} path=${row.archive_path || "-"} mode=${row.mode}`);
    else detailRows.push(`- ${row.thread_key}: FAILED reason=${row.reason || "unknown"} elapsed_ms=${row.elapsed_ms}`);
  }
  if (input.results.length > 10) detailRows.push(`- +${input.results.length - 10} more`);
  const bodyLines = [
    input.mention ? `${mentionToken} Thread archive scheduler run` : "Thread archive scheduler run",
    `summary=${input.summary}`,
    `timed_out=${input.timed_out ? "true" : "false"}`,
    ...detailRows,
  ];
  const inboxId = `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  appendInboxEntry({
    id: inboxId,
    ts: nowIso(),
    thread_id: "inbox",
    thread_key: "ops:auto_stabilize",
    msg_id: "",
    role: "system",
    mention: input.mention,
    title: "Thread archive scheduler run",
    body: clipText(bodyLines.join("\n"), 2000),
    source: "inbox_thread_archive_scheduler",
    links: { artifact_paths: input.results.map((x) => x.archive_path).filter((x) => !!x).slice(0, 10) },
  });
  return inboxId;
}

function appendThreadArchiveSchedulerStoppedAudit(note: string): void {
  const settings = loadDesktopSettings();
  const mentionToken = getMentionToken(settings);
  appendInboxEntry({
    id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    ts: nowIso(),
    thread_id: "inbox",
    thread_key: "ops:auto_stabilize",
    msg_id: "",
    role: "system",
    mention: true,
    title: "Thread archive scheduler stopped",
    body: clipText(`${mentionToken} Thread archive scheduler stopped due to consecutive failures. ${note}`, 2000),
    source: "inbox_thread_archive_scheduler_stopped",
    links: { artifact_paths: [] },
  });
}

function executeThreadArchiveSchedulerRun(input: {
  settings: ThreadArchiveSchedulerSettings;
  dry_run: boolean;
  override_thread_keys?: string[];
}): { ok: boolean; timed_out: boolean; summary: string; results: ThreadArchiveSchedulerRunResultItem[]; exit_code: number } {
  const settings = normalizeThreadArchiveSchedulerSettings(input.settings);
  const sourceKeys = Array.isArray(input.override_thread_keys) && input.override_thread_keys.length ? input.override_thread_keys : settings.thread_keys;
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of sourceKeys) {
    const key = normalizeInboxThreadKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
    if (keys.length >= settings.max_threads_per_run) break;
  }
  const archiveState = loadInboxThreadArchiveState();
  const results: ThreadArchiveSchedulerRunResultItem[] = [];
  const totalDeadlineMs = Date.now() + settings.safety.total_timeout_ms;
  let timedOut = false;
  let ok = true;
  for (const key of keys) {
    if (Date.now() >= totalDeadlineMs) {
      timedOut = true;
      ok = false;
      results.push({ thread_key: key, ok: false, archived: 0, archive_path: "", mode: "tail_bytes", elapsed_ms: 0, reason: "total_timeout" });
      break;
    }
    const perDeadlineMs = Math.min(totalDeadlineMs, Date.now() + settings.safety.per_thread_timeout_ms);
    const sinceTs = clipText(archiveState.last_archived_ts_by_thread_key?.[key], 80).trim();
    try {
      const out = runInboxThreadArchive({
        thread_key: key,
        dry_run: input.dry_run,
        max_items: settings.max_items,
        limit_scan: settings.limit_scan,
        since_ts: sinceTs,
        tail_bytes: settings.scan.tail_bytes,
        deadline_ms: perDeadlineMs,
      });
      const row: ThreadArchiveSchedulerRunResultItem = {
        thread_key: key,
        ok: out.timed_out ? false : true,
        archived: out.archived,
        archive_path: out.archive_path,
        mode: out.mode,
        elapsed_ms: out.elapsed_ms,
        reason: out.timed_out ? "timeout" : "",
      };
      if (!row.ok) ok = false;
      if (out.timed_out) timedOut = true;
      results.push(row);
      if (!input.dry_run && settings.audit_per_thread) {
        try {
          appendInboxThreadArchivePerThreadAudit({
            thread_key: key,
            archived: out.archived,
            archive_path: out.archive_path,
            since_ts: out.since_ts,
            note: out.note,
          });
        } catch {
          // best-effort
        }
      }
    } catch (e: any) {
      ok = false;
      results.push({
        thread_key: key,
        ok: false,
        archived: 0,
        archive_path: "",
        mode: "tail_bytes",
        elapsed_ms: Math.max(0, settings.safety.per_thread_timeout_ms),
        reason: clipText(String(e?.message || "unknown"), 180),
      });
    }
  }
  const summary = summarizeThreadArchiveSchedulerResults(results, timedOut);
  return { ok, timed_out: timedOut, summary, results, exit_code: ok ? 0 : 1 };
}

function updateThreadArchiveSchedulerStateAfterRun(input: {
  state: ThreadArchiveSchedulerState;
  settings: ThreadArchiveSchedulerSettings;
  local_date: string;
  ok: boolean;
  summary: string;
  timed_out: boolean;
  results: ThreadArchiveSchedulerRunResultItem[];
  elapsed_ms: number;
  increment_day_counter: boolean;
  inbox_id?: string | null;
}): ThreadArchiveSchedulerState {
  const st = normalizeThreadArchiveSchedulerState(input.state);
  if (st.last_run_local_date !== input.local_date) st.run_count_today = 0;
  st.last_run_at = nowIso();
  st.last_run_local_date = input.local_date;
  if (input.increment_day_counter) st.run_count_today += 1;
  st.last_result_ok = input.ok;
  st.last_result_summary = clipText(input.summary, 500);
  st.last_inbox_id = input.inbox_id || null;
  st.last_elapsed_ms = Math.max(0, Math.floor(Number(input.elapsed_ms || 0) || 0));
  st.last_timed_out = input.timed_out === true;
  st.last_results_sample = toThreadArchiveSchedulerResultSample(input.results);
  st.last_failed_thread_keys = toThreadArchiveSchedulerFailedKeys(input.results);
  if (input.ok) {
    st.failure_count = 0;
    st.backoff_ms = THREAD_ARCHIVE_SCHED_BACKOFF_MS_DEFAULT;
    st.last_error = "";
    return st;
  }
  st.failure_count += 1;
  st.backoff_ms = Math.min(THREAD_ARCHIVE_SCHED_BACKOFF_MS_MAX, Math.max(1000, st.backoff_ms * 2));
  st.last_error = clipText(input.timed_out ? "timeout" : input.summary, 500);
  if (st.failure_count >= input.settings.safety.max_consecutive_failures) {
    st.enabled_effective = false;
  }
  return st;
}

function runThreadArchiveSchedulerNow(input: { dry_run: boolean; override_thread_keys?: string[]; purpose: "run_now" | "scheduler_tick" }): {
  action: string;
  dry_run: boolean;
  ok: boolean;
  summary: string;
  results: ThreadArchiveSchedulerRunResultItem[];
  timed_out: boolean;
  exit_code: number;
} {
  const startedAtMs = Date.now();
  const settings = loadThreadArchiveSchedulerSettings();
  const lockRes = acquireThreadArchiveSchedulerLockWithRecovery(settings.safety.lock_stale_sec, input.purpose);
  if (!lockRes.acquired) {
    return {
      action: "thread_archive_scheduler_run_now",
      dry_run: input.dry_run,
      ok: true,
      summary: `locked:${lockRes.note}`,
      results: [],
      timed_out: false,
      exit_code: 0,
    };
  }
  try {
    const out = executeThreadArchiveSchedulerRun({
      settings,
      dry_run: input.dry_run,
      override_thread_keys: input.override_thread_keys,
    });
    if (input.dry_run) {
      const prevState = loadThreadArchiveSchedulerState();
      const localDate = localDateYmd(new Date());
      const nextState = updateThreadArchiveSchedulerStateAfterRun({
        state: prevState,
        settings,
        local_date: localDate,
        ok: out.ok,
        summary: `dry_run:${out.summary}`,
        timed_out: out.timed_out,
        results: out.results,
        elapsed_ms: Date.now() - startedAtMs,
        increment_day_counter: false,
        inbox_id: prevState.last_inbox_id,
      });
      saveThreadArchiveSchedulerState(nextState);
      return {
        action: "thread_archive_scheduler_run_now",
        dry_run: true,
        ok: out.ok,
        summary: out.summary,
        results: out.results,
        timed_out: out.timed_out,
        exit_code: out.exit_code,
      };
    }
    const localDate = localDateYmd(new Date());
    let inboxId: string | null = null;
    const mentionSummary = (!out.ok || out.timed_out);
    if (settings.audit_summary) {
      try {
        inboxId = appendThreadArchiveSchedulerSummaryAudit({
          summary: out.summary,
          results: out.results,
          timed_out: out.timed_out,
          mention: mentionSummary,
        });
      } catch {
        // best-effort
      }
    }
    const prevState = loadThreadArchiveSchedulerState();
    const nextState = updateThreadArchiveSchedulerStateAfterRun({
      state: prevState,
      settings,
      local_date: localDate,
      ok: out.ok,
      summary: out.summary,
      timed_out: out.timed_out,
      results: out.results,
      elapsed_ms: Date.now() - startedAtMs,
      increment_day_counter: input.purpose === "scheduler_tick",
      inbox_id: inboxId,
    });
    saveThreadArchiveSchedulerState(nextState);
    if (!nextState.enabled_effective && prevState.enabled_effective) {
      try {
        appendThreadArchiveSchedulerStoppedAudit(out.summary);
      } catch {
        // best-effort
      }
    }
    return {
      action: "thread_archive_scheduler_run_now",
      dry_run: false,
      ok: out.ok,
      summary: out.summary,
      results: out.results,
      timed_out: out.timed_out,
      exit_code: out.exit_code,
    };
  } finally {
    releaseThreadArchiveSchedulerLockIfOwned();
  }
}

function runThreadArchiveSchedulerTick(): void {
  const settings = loadThreadArchiveSchedulerSettings();
  let state = loadThreadArchiveSchedulerState();
  if (!settings.enabled || !state.enabled_effective) return;
  const now = new Date();
  const localDate = localDateYmd(now);
  if (state.last_run_local_date !== localDate) {
    state.run_count_today = 0;
    state.last_run_local_date = localDate;
    saveThreadArchiveSchedulerState(state);
  }
  const due = parseDailyTimeToToday(now, settings.daily_time);
  if (now.getTime() < due.getTime()) return;
  if (state.run_count_today >= settings.max_per_day) return;
  const lastRunMs = state.last_run_at ? new Date(state.last_run_at).getTime() : 0;
  if (Number.isFinite(lastRunMs) && lastRunMs > 0) {
    if ((Date.now() - lastRunMs) < settings.cooldown_sec * 1000) return;
  }
  runThreadArchiveSchedulerNow({ dry_run: false, purpose: "scheduler_tick" });
}

function computeInboxUnreadCount(items: InboxItem[], readState: InboxReadState): number {
  const globalTs = String(readState.global_last_read_ts || "");
  const globalMs = globalTs ? new Date(globalTs).getTime() : 0;
  if (!globalMs) return items.length;
  let count = 0;
  for (const item of items) {
    const tsMs = new Date(String(item.ts || "")).getTime();
    if (Number.isFinite(tsMs) && tsMs > globalMs) count += 1;
  }
  return count;
}

function buildDailyLoopDashboard(limitInboxItemsInput: number): Record<string, unknown> {
  const notes: string[] = [];
  const reasonsErr: string[] = [];
  const reasonsWarn: string[] = [];
  const limitInboxItems = Math.max(1, Math.min(30, Math.floor(Number(limitInboxItemsInput) || 10)));
  const ts = nowIso();
  const localDate = localDateYmd(new Date());
  const fallbackAgentIds = new Set<string>(["facilitator", "designer", "implementer", "verifier", "joker"]);
  let allowedAgentIds = fallbackAgentIds;
  try {
    const loaded = loadOrgAgentsSnapshot();
    const ids = new Set<string>();
    for (const agent of loaded.snapshot.agents) ids.add(String(agent.id || "").trim());
    if (ids.size > 0) allowedAgentIds = ids;
  } catch (e: any) {
    notes.push(`agents_load_failed:${String(e?.message || "unknown")}`);
  }

  let heartbeatSettings = defaultHeartbeatSettings();
  let heartbeatState = defaultHeartbeatState();
  try {
    heartbeatSettings = loadHeartbeatSettings(allowedAgentIds);
  } catch (e: any) {
    notes.push(`heartbeat_settings_load_failed:${String(e?.message || "unknown")}`);
  }
  try {
    heartbeatState = loadHeartbeatState();
  } catch (e: any) {
    notes.push(`heartbeat_state_load_failed:${String(e?.message || "unknown")}`);
  }
  const hbKey = "facilitator::episodes";
  const hbPerTarget = isRecord(heartbeatState.per_target) && isRecord(heartbeatState.per_target[hbKey])
    ? heartbeatState.per_target[hbKey] as Record<string, unknown>
    : {};
  const hbFailureCount = Math.max(0, Math.floor(Number(hbPerTarget.failure_count ?? 0) || 0));
  if (heartbeatSettings.enabled && !heartbeatState.enabled_effective) reasonsErr.push("heartbeat_brake_active");
  if (!heartbeatSettings.enabled) reasonsWarn.push("heartbeat_disabled");
  if (hbFailureCount >= heartbeatSettings.safety.max_consecutive_failures) reasonsErr.push("heartbeat_failures_threshold");
  const heartbeatSummary = {
    enabled: heartbeatSettings.enabled,
    enabled_effective: heartbeatState.enabled_effective,
    next_run_at: clipText(heartbeatState.next_run_at || "", 80),
    last_ok_at: clipText(hbPerTarget.last_ok_at || "", 80),
    failure_count: hbFailureCount,
    note: clipText(String(hbPerTarget.last_note || ""), 380),
  };

  let suggestSettings = defaultHeartbeatAutopilotSuggestSettings();
  let suggestState = defaultHeartbeatAutopilotSuggestState();
  try {
    suggestSettings = loadHeartbeatAutopilotSuggestSettings();
  } catch (e: any) {
    notes.push(`suggest_settings_load_failed:${String(e?.message || "unknown")}`);
  }
  try {
    suggestState = loadHeartbeatAutopilotSuggestState();
  } catch (e: any) {
    notes.push(`suggest_state_load_failed:${String(e?.message || "unknown")}`);
  }
  const suggestFailureCount = Math.max(0, Math.floor(Number(suggestState.failure_count || 0) || 0));
  if (suggestSettings.auto_accept_enabled && !suggestState.auto_accept_enabled_effective) reasonsErr.push("suggest_auto_accept_brake_active");
  if (!suggestSettings.auto_accept_enabled) reasonsWarn.push("suggest_auto_accept_disabled");
  if (suggestFailureCount >= suggestSettings.max_consecutive_failures) reasonsErr.push("suggest_failures_threshold");
  const suggestSummary = {
    auto_accept_enabled: suggestSettings.auto_accept_enabled,
    auto_accept_enabled_effective: suggestState.auto_accept_enabled_effective,
    auto_accept_count_today: Math.max(0, Math.floor(Number(suggestState.auto_accept_count_today || 0) || 0)),
    failure_count: suggestFailureCount,
    last_auto_accept_at: clipText(suggestState.last_auto_accept_at || "", 80),
    note: clipText(suggestState.last_error || "", 380),
  };

  let consolidationSettings = defaultConsolidationSettings();
  let consolidationState = defaultConsolidationState();
  try {
    consolidationSettings = loadConsolidationSettings(allowedAgentIds);
  } catch (e: any) {
    notes.push(`consolidation_settings_load_failed:${String(e?.message || "unknown")}`);
  }
  try {
    consolidationState = loadConsolidationState();
  } catch (e: any) {
    notes.push(`consolidation_state_load_failed:${String(e?.message || "unknown")}`);
  }
  const consPerAgent = isRecord(consolidationState.per_agent) && isRecord(consolidationState.per_agent.facilitator)
    ? consolidationState.per_agent.facilitator as Record<string, unknown>
    : {};
  const consLastOutputs = isRecord(consPerAgent.last_outputs) ? consPerAgent.last_outputs : {};
  if (consolidationSettings.enabled && !consolidationState.enabled_effective) reasonsErr.push("consolidation_brake_active");
  if (!consolidationSettings.enabled) reasonsWarn.push("consolidation_disabled");
  if (String(consPerAgent.last_result || "") === "fail") reasonsErr.push("consolidation_last_result_fail");
  if (Math.max(0, Math.floor(Number(consolidationState.failure_count || 0) || 0)) >= consolidationSettings.safety.max_consecutive_failures) {
    reasonsErr.push("consolidation_failures_threshold");
  }
  const consolidationSummary = {
    enabled: consolidationSettings.enabled,
    enabled_effective: consolidationState.enabled_effective,
    next_run_at: clipText(consolidationState.next_run_at || "", 80),
    facilitator: {
      last_result: clipText(consPerAgent.last_result || "", 40),
      last_run_at: clipText(consPerAgent.last_run_at || "", 80),
      last_outputs: {
        knowledge_id: clipText(consLastOutputs.knowledge_id || "", 120),
        procedures_id: clipText(consLastOutputs.procedures_id || "", 120),
      },
    },
    note: clipText(consPerAgent.last_note || "", 380),
  };

  let morningBriefSettings = defaultMorningBriefSettings();
  let morningBriefState = defaultMorningBriefState();
  try {
    morningBriefSettings = loadMorningBriefSettings();
  } catch (e: any) {
    notes.push(`morning_brief_settings_load_failed:${String(e?.message || "unknown")}`);
  }
  try {
    morningBriefState = loadMorningBriefState();
  } catch (e: any) {
    notes.push(`morning_brief_state_load_failed:${String(e?.message || "unknown")}`);
  }
  const mbFailureCount = Math.max(0, Math.floor(Number(morningBriefState.failure_count || 0) || 0));
  if (morningBriefSettings.enabled && !morningBriefState.enabled_effective) reasonsErr.push("morning_brief_brake_active");
  if (!morningBriefSettings.enabled) reasonsWarn.push("morning_brief_disabled");
  if (String(morningBriefState.last_result || "") === "fail") reasonsErr.push("morning_brief_last_result_fail");
  if (mbFailureCount >= morningBriefSettings.max_consecutive_failures) reasonsErr.push("morning_brief_failures_threshold");
  const morningBriefSummary = {
    enabled: morningBriefSettings.enabled,
    enabled_effective: morningBriefState.enabled_effective,
    next_run_at: clipText(morningBriefState.next_run_at || "", 80),
    last_result: clipText(morningBriefState.last_result || "", 40),
    last_run_at: clipText(morningBriefState.last_run_at || "", 80),
    last_written_path: clipText(morningBriefState.last_brief_written_path || "", 260),
    last_autopilot_run_id: clipText(morningBriefState.last_autopilot_run_id || "", 120),
    note: clipText(morningBriefState.last_note || "", 380),
  };

  let inboxOut = { items: [] as InboxItem[], skipped_invalid: 0 };
  try {
    inboxOut = readInboxItems(limitInboxItems, "");
  } catch (e: any) {
    notes.push(`inbox_load_failed:${String(e?.message || "unknown")}`);
  }
  let inboxReadState = defaultInboxReadState();
  try {
    inboxReadState = loadInboxReadState();
  } catch (e: any) {
    notes.push(`inbox_read_state_load_failed:${String(e?.message || "unknown")}`);
  }
  const unreadCount = computeInboxUnreadCount(inboxOut.items, inboxReadState);
  const mentionCount = inboxOut.items.filter((x) => !!x.mention).length;
  if (mentionCount > 0) reasonsWarn.push("inbox_mentions_pending");
  const inboxSummary = {
    unread_count: unreadCount,
    mention_count: mentionCount,
    items: inboxOut.items,
    skipped_invalid: inboxOut.skipped_invalid,
  };
  let runFailuresCount = 0;
  try {
    runFailuresCount = readRunsForHeartbeat(20).filter((x) => x.status === "failed" || !!x.error_code).length;
  } catch (e: any) {
    notes.push(`dashboard_runs_load_failed:${String(e?.message || "unknown")}`);
  }
  let opsFailureCount = 0;
  let opsEnabledEffective = true;
  try {
    const opsState = loadOpsAutoStabilizeState();
    opsFailureCount = Math.max(0, Math.floor(Number(opsState.failure_count || 0) || 0));
    opsEnabledEffective = opsState.enabled_effective !== false;
  } catch (e: any) {
    notes.push(`dashboard_ops_state_load_failed:${String(e?.message || "unknown")}`);
  }
  const recommendedProfile = computeRecommendedProfile({
    unread_count: unreadCount,
    mention_count: mentionCount,
    run_failures: runFailuresCount,
    ops_failure_count: opsFailureCount,
    ops_enabled_effective: opsEnabledEffective,
    stale_lock_detected: hasStaleOpsLock(600),
    suggest_failure_count: suggestFailureCount,
    recent_event_types: [],
  });

  let healthStatus: "ok" | "warn" | "err" = "ok";
  if (reasonsErr.length > 0) healthStatus = "err";
  else if (reasonsWarn.length > 0) healthStatus = "warn";
  const health = {
    status: healthStatus,
    reasons: [...reasonsErr, ...reasonsWarn].slice(0, 20),
  };

  return {
    action: "daily_loop_dashboard",
    ts,
    local_date: localDate,
    heartbeat: heartbeatSummary,
    suggest: suggestSummary,
    consolidation: consolidationSummary,
    morning_brief: morningBriefSummary,
    recommended_profile: recommendedProfile,
    inbox: inboxSummary,
    health,
    note: clipText(notes.join("; "), 1000),
  };
}

function loadLatestRevertSuggestionDashboardItem(): Record<string, unknown> | null {
  if (!fs.existsSync(INBOX_PATH)) return null;
  const profileFallback = loadActiveProfileState().state;
  const presetIndex = loadPresetIndex();
  try {
    const tail = readFileTailUtf8(INBOX_PATH, 256 * 1024).text;
    const lines = tail.split(/\r?\n/).filter((x) => !!x);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (Buffer.byteLength(lines[i], "utf8") > 64 * 1024) continue;
      let row: unknown = null;
      try {
        row = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (!isRecord(row)) continue;
      if (String(row.source || "") !== "revert_suggestion") continue;
      const threadKey = normalizeInboxThreadKey(row.thread_key);
      if (!threadKey) continue;
      const links = isRecord(row.links) ? row.links : {};
      const quickActionIdRaw = clipText(links.quick_action_id, 80).trim();
      const quickActionId = quickActionIdRaw === "revert_active_profile_standard"
        ? "revert_active_profile_standard"
        : "revert_active_profile_standard";
      const activeIdFromLinks = clipText(links.active_profile_preset_set_id, 80).trim().toLowerCase();
      const activePreset = activeIdFromLinks
        ? normalizeRecommendedPresetId(activeIdFromLinks, presetIndex)
        : profileFallback.preset_set_id;
      const targetRaw = clipText(links.target_preset_set_id, 80).trim().toLowerCase();
      const targetPreset = targetRaw ? normalizeRecommendedPresetId(targetRaw, presetIndex) : "standard";
      const createdAt = clipText(row.ts, 80).trim();
      return {
        kind: "revert_suggestion",
        title: "Revert Active Profile to standard",
        thread_key: threadKey,
        created_at: createdAt,
        active_preset_set_id: activePreset,
        target_preset_set_id: targetPreset || "standard",
        quick_action_id: quickActionId,
        severity: "high",
      };
    }
  } catch {
    // best-effort
  }
  return null;
}

function buildDashboardNextActions(limitInput: number): Record<string, unknown> {
  const parsed = Number(limitInput);
  const limit = Math.max(1, Math.min(10, Number.isFinite(parsed) ? Math.floor(parsed) : 5));
  const items: Record<string, unknown>[] = [];
  try {
    const revertItem = loadLatestRevertSuggestionDashboardItem();
    if (revertItem) items.push(revertItem);
  } catch {
    // best-effort
  }
  try {
    const active = loadActiveProfileState().state;
    const recommended = computeRecommendedProfile();
    const activeId = clipText(active.preset_set_id, 80).trim().toLowerCase();
    const recommendedId = clipText(recommended.preset_set_id, 80).trim().toLowerCase();
    if (activeId && recommendedId && activeId !== recommendedId) {
      items.push({
        kind: "profile_misalignment",
        title: "Active profile differs from recommended",
        active_preset_set_id: activeId,
        recommended_preset_set_id: recommendedId,
        severity: "medium",
      });
    }
  } catch {
    // best-effort
  }
  return {
    action: "dashboard_next_actions",
    items: items.slice(0, limit),
    exit_code: 0,
  };
}

function buildDashboardThreadArchiveScheduler(): Record<string, unknown> {
  const settings = loadThreadArchiveSchedulerSettings();
  const state = loadThreadArchiveSchedulerState();
  const threadKeys = Array.isArray(settings.thread_keys) ? settings.thread_keys : [];
  const failedKeys = Array.isArray(state.last_failed_thread_keys) ? state.last_failed_thread_keys : [];
  return {
    action: "dashboard_thread_archive_scheduler",
    settings: {
      enabled: settings.enabled,
      daily_time: settings.daily_time,
      thread_keys_count: threadKeys.length,
      thread_keys_sample: threadKeys.slice(0, 3),
      max_items: settings.max_items,
      limit_scan: settings.limit_scan,
      cooldown_sec: settings.cooldown_sec,
      max_per_day: settings.max_per_day,
      tail_bytes: settings.scan.tail_bytes,
      per_thread_timeout_ms: settings.safety.per_thread_timeout_ms,
      total_timeout_ms: settings.safety.total_timeout_ms,
    },
    state: {
      enabled_effective: state.enabled_effective,
      last_run_at: state.last_run_at || "",
      last_result_ok: state.last_result_ok,
      last_result_summary: state.last_result_summary || "",
      failure_count: state.failure_count,
      backoff_ms: state.backoff_ms,
      last_elapsed_ms: Math.max(0, Math.floor(Number(state.last_elapsed_ms || 0) || 0)),
      last_timed_out: state.last_timed_out === true,
      last_failed_thread_keys: failedKeys.slice(0, 10),
      next_run_local: formatNextRunLocalFromState(settings, state),
      last_results_sample: Array.isArray(state.last_results_sample) ? state.last_results_sample.slice(0, 10) : [],
    },
    exit_code: 0,
  };
}

function issueOpsQuickActionsConfirmToken(): string {
  const token = randomId("ops_confirm");
  opsQuickActionsConfirm = { token, expires_at_ms: Date.now() + OPS_QUICK_ACTIONS_CONFIRM_TTL_MS };
  return token;
}

function validateOpsQuickActionsConfirmToken(tokenInput: unknown): boolean {
  const token = String(tokenInput || "").trim();
  if (!token) return false;
  if (!opsQuickActionsConfirm.token) return false;
  if (Date.now() > Number(opsQuickActionsConfirm.expires_at_ms || 0)) return false;
  return token === opsQuickActionsConfirm.token;
}

function issueConfirmTokenForServer(): string {
  const token = randomId("ops_srv_confirm");
  opsServerConfirm = { token, expires_at_ms: Date.now() + OPS_SERVER_CONFIRM_TTL_MS };
  return token;
}

function validateConfirmTokenForServer(tokenInput: unknown): boolean {
  const token = String(tokenInput || "").trim();
  if (!token) return false;
  if (!opsServerConfirm.token) return false;
  if (Date.now() > Number(opsServerConfirm.expires_at_ms || 0)) return false;
  return token === opsServerConfirm.token;
}

function safeFileAgeSec(p: string): number {
  try {
    const st = fs.statSync(p);
    const ms = Date.now() - st.mtimeMs;
    if (!Number.isFinite(ms) || ms < 0) return -1;
    return Math.floor(ms / 1000);
  } catch {
    return -1;
  }
}

function getLatestLogDir(prefix: string): string {
  const logsRoot = path.join(REPO_ROOT, "data", "logs");
  if (!fs.existsSync(logsRoot)) return "";
  try {
    const dirs = fs.readdirSync(logsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith(prefix))
      .map((d) => d.name);
    if (!dirs.length) return "";
    dirs.sort();
    const latest = dirs[dirs.length - 1];
    return path.join(logsRoot, latest).replaceAll("\\", "/");
  } catch {
    return "";
  }
}

function appendOpsQuickActionsAuditInbox(params: { title: string; body: string; mention?: boolean; links?: Record<string, unknown> }): void {
  try {
    const entry = {
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: "ops",
      msg_id: "",
      role: "system",
      mention: params.mention === true,
      title: clipText(params.title, 256),
      body: clipText(params.body, 2000),
      source: "ops_quick_actions",
      links: isRecord(params.links) ? params.links : {},
    };
    appendInboxEntry(entry);
  } catch {
    // best-effort
  }
}

function buildOpsQuickActionsStatus(): Record<string, unknown> {
  const now = nowIso();
  const heartbeatSettings = loadHeartbeatSettings(new Set(loadOrgAgentsSnapshot().snapshot.agents.map((a) => a.id)));
  const heartbeatState = loadHeartbeatState();
  const suggestSettings = loadHeartbeatAutopilotSuggestSettings();
  const suggestState = loadHeartbeatAutopilotSuggestState();
  const consolidationSettings = loadConsolidationSettings(new Set(loadOrgAgentsSnapshot().snapshot.agents.map((a) => a.id)));
  const consolidationState = loadConsolidationState();
  const morningBriefSettings = loadMorningBriefSettings();
  const morningBriefState = loadMorningBriefState();

  const lockDefs = [
    { name: "heartbeat", path: HEARTBEAT_LOCK_PATH, stale_sec: Number(heartbeatSettings.safety.lock_stale_sec || OPS_QUICK_ACTIONS_LOCK_STALE_DEFAULT) },
    { name: "consolidation", path: CONSOLIDATION_LOCK_PATH, stale_sec: Number(consolidationSettings.safety.lock_stale_sec || OPS_QUICK_ACTIONS_LOCK_STALE_DEFAULT) },
    { name: "morning_brief", path: MORNING_BRIEF_LOCK_PATH, stale_sec: OPS_QUICK_ACTIONS_LOCK_STALE_DEFAULT },
    { name: "autopilot_suggest", path: path.join(HEARTBEAT_DIR, "autopilot_suggest.lock"), stale_sec: OPS_QUICK_ACTIONS_LOCK_STALE_DEFAULT },
  ];
  const locks = lockDefs.map((x) => {
    const exists = fs.existsSync(x.path);
    const age_sec = exists ? safeFileAgeSec(x.path) : -1;
    return {
      name: x.name,
      path: x.path.replaceAll("\\", "/"),
      exists,
      age_sec,
      stale_threshold_sec: x.stale_sec,
    };
  });
  const brakes = [
    {
      name: "heartbeat",
      enabled: Boolean(heartbeatSettings.enabled),
      enabled_effective: Boolean(heartbeatState.enabled_effective),
      reason: clipText(heartbeatState.per_target?.["facilitator::episodes"]?.last_note || "", 240),
    },
    {
      name: "suggest",
      enabled: Boolean(suggestSettings.auto_accept_enabled),
      enabled_effective: Boolean(suggestState.auto_accept_enabled_effective),
      reason: clipText(suggestState.last_error || "", 240),
    },
    {
      name: "consolidation",
      enabled: Boolean(consolidationSettings.enabled),
      enabled_effective: Boolean(consolidationState.enabled_effective),
      reason: clipText(consolidationState.per_agent?.facilitator?.last_note || "", 240),
    },
    {
      name: "morning_brief",
      enabled: Boolean(morningBriefSettings.enabled),
      enabled_effective: Boolean(morningBriefState.enabled_effective),
      reason: clipText(morningBriefState.last_note || "", 240),
    },
  ];
  const logs = [
    {
      name: "ci_smoke_gate_latest",
      path: getLatestLogDir("ci_smoke_gate_"),
      note: "latest ci smoke gate log dir",
    },
    {
      name: "dev_all_latest",
      path: getLatestLogDir("dev_all_"),
      note: "latest dev_all log dir",
    },
  ];
  return {
    action: "ops_quick_actions_status",
    ts: now,
    confirm_token: issueOpsQuickActionsConfirmToken(),
    confirm_token_ttl_sec: Math.floor(OPS_QUICK_ACTIONS_CONFIRM_TTL_MS / 1000),
    locks,
    brakes,
    logs,
  };
}

type DashboardQuickActionId =
  | "heartbeat_dry"
  | "morning_brief_dry"
  | "morning_brief_autopilot_start_dry"
  | "revert_active_profile_standard"
  | "thread_archive_scheduler_dry"
  | "ops_snapshot_dry"
  | "evidence_bundle_dry";

type DashboardQuickExecuteId =
  | "morning_brief_autopilot_start"
  | "revert_active_profile_standard"
  | "thread_archive_scheduler"
  | "ops_snapshot"
  | "evidence_bundle";

type DashboardQuickActionLast = {
  last_run_at: string;
  ok: boolean;
  status_code: number;
  elapsed_ms: number;
  result_summary: string;
  failure_reason?: string;
  last_execute_at?: string;
  last_execute_ok?: boolean;
  last_execute_result_summary?: string;
  last_execute_failure_reason?: string;
  last_tracking?: {
    id?: string;
    request_id?: string;
    run_id?: string;
    started_at?: string;
    kind?: string;
  };
};

type DashboardTrackerHistoryStatus = "success" | "failed" | "timeout" | "canceled";

type DashboardTrackerHistoryItem = {
  id: string;
  kind: string;
  started_at: string;
  ended_at: string;
  status: DashboardTrackerHistoryStatus;
  request_id?: string;
  run_id?: string;
  elapsed_ms?: number;
  last_summary?: string;
};

function isDashboardTrackerHistoryStatus(v: unknown): v is DashboardTrackerHistoryStatus {
  return v === "success" || v === "failed" || v === "timeout" || v === "canceled";
}

function sanitizeDashboardTrackerHistoryItem(input: unknown): DashboardTrackerHistoryItem | null {
  if (!isRecord(input)) return null;
  const id = clipText(input.id, 120).trim();
  const kind = clipText(input.kind, 120).trim();
  const startedAt = clipText(input.started_at, 80).trim();
  const endedAt = clipText(input.ended_at, 80).trim();
  const statusRaw = clipText(input.status, 32).trim();
  if (!id || !kind || !startedAt || !endedAt || !isDashboardTrackerHistoryStatus(statusRaw)) return null;
  const elapsedN = Number(input.elapsed_ms);
  const elapsed = Number.isFinite(elapsedN) && elapsedN >= 0 ? Math.floor(elapsedN) : undefined;
  const summary = clipText(String(input.last_summary || "").replace(/\s+/g, " ").trim(), 200);
  const requestId = clipText(input.request_id, 160).trim();
  const runId = clipText(input.run_id, 160).trim();
  return {
    id,
    kind,
    started_at: startedAt,
    ended_at: endedAt,
    status: statusRaw,
    request_id: requestId || undefined,
    run_id: runId || undefined,
    elapsed_ms: elapsed,
    last_summary: summary || undefined,
  };
}

function loadDashboardTrackerHistory(limitInput: unknown): {
  action: string;
  items: DashboardTrackerHistoryItem[];
  skipped_lines: number;
  truncated: boolean;
  exit_code: number;
} {
  const limit = Math.max(
    1,
    Math.min(
      DASHBOARD_TRACKER_HISTORY_LIMIT_MAX,
      Math.floor(Number(limitInput) || DASHBOARD_TRACKER_HISTORY_LIMIT_DEFAULT),
    ),
  );
  if (!fs.existsSync(DASHBOARD_TRACKER_HISTORY_PATH)) {
    return {
      action: "dashboard_tracker_history",
      items: [],
      skipped_lines: 0,
      truncated: false,
      exit_code: 0,
    };
  }
  const raw = readFileTailUtf8(DASHBOARD_TRACKER_HISTORY_PATH, DASHBOARD_TRACKER_HISTORY_TAIL_BYTES);
  let text = raw.text;
  if (raw.truncated) {
    const newline = text.indexOf("\n");
    if (newline >= 0) text = text.slice(newline + 1);
  }
  const lines = text.split(/\r?\n/).filter((x) => !!x);
  const items: DashboardTrackerHistoryItem[] = [];
  let skipped = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (Buffer.byteLength(line, "utf8") > DASHBOARD_TRACKER_HISTORY_LINE_CAP) {
      skipped += 1;
      continue;
    }
    try {
      const parsed = sanitizeDashboardTrackerHistoryItem(JSON.parse(line));
      if (!parsed) {
        skipped += 1;
        continue;
      }
      items.push(parsed);
      if (items.length >= limit) break;
    } catch {
      skipped += 1;
    }
  }
  return {
    action: "dashboard_tracker_history",
    items,
    skipped_lines: skipped,
    truncated: raw.truncated,
    exit_code: 0,
  };
}

function appendDashboardTrackerHistoryItem(input: {
  item: unknown;
  dry_run: boolean;
}): {
  action: string;
  appended: boolean;
  dry_run: boolean;
  exit_code: number;
  failure_reason?: string;
  item?: DashboardTrackerHistoryItem;
} {
  const sanitized = sanitizeDashboardTrackerHistoryItem(input.item);
  if (!sanitized) {
    return {
      action: "dashboard_tracker_history_append",
      appended: false,
      dry_run: input.dry_run,
      exit_code: 1,
      failure_reason: "item_invalid",
    };
  }
  if (input.dry_run) {
    return {
      action: "dashboard_tracker_history_append",
      appended: false,
      dry_run: true,
      exit_code: 0,
      item: sanitized,
    };
  }
  try {
    appendJsonlAtomic(DASHBOARD_TRACKER_HISTORY_PATH, `${JSON.stringify(sanitized)}\n`);
    return {
      action: "dashboard_tracker_history_append",
      appended: true,
      dry_run: false,
      exit_code: 0,
      item: sanitized,
    };
  } catch (e: any) {
    return {
      action: "dashboard_tracker_history_append",
      appended: false,
      dry_run: false,
      exit_code: 1,
      failure_reason: clipText(String(e?.message || "append_failed"), 200) || "append_failed",
      item: sanitized,
    };
  }
}

function loadDashboardQuickActionsLast(): Record<string, DashboardQuickActionLast> {
  const raw = readJson<Record<string, unknown>>(DASHBOARD_QUICK_ACTIONS_LAST_PATH, {});
  if (!isRecord(raw)) return {};
  const out: Record<string, DashboardQuickActionLast> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!isRecord(v)) continue;
    out[String(k)] = {
      last_run_at: clipText(v.last_run_at, 80),
      ok: v.ok === true,
      status_code: Math.max(0, Math.floor(Number(v.status_code || 0))),
      elapsed_ms: Math.max(0, Math.floor(Number(v.elapsed_ms || 0))),
      result_summary: clipText(v.result_summary, 1000),
      failure_reason: clipText(v.failure_reason, 400) || undefined,
      last_execute_at: clipText(v.last_execute_at, 80) || undefined,
      last_execute_ok: v.last_execute_ok === true,
      last_execute_result_summary: clipText(v.last_execute_result_summary, 1000) || undefined,
      last_execute_failure_reason: clipText(v.last_execute_failure_reason, 400) || undefined,
      last_tracking: isRecord(v.last_tracking) ? {
        id: clipText(v.last_tracking.id, 80) || undefined,
        request_id: clipText(v.last_tracking.request_id, 160) || undefined,
        run_id: clipText(v.last_tracking.run_id, 160) || undefined,
        started_at: clipText(v.last_tracking.started_at, 80) || undefined,
        kind: clipText(v.last_tracking.kind, 80) || undefined,
      } : undefined,
    };
  }
  return out;
}

function saveDashboardQuickActionsLast(next: Record<string, DashboardQuickActionLast>): void {
  writeJsonAtomic(DASHBOARD_QUICK_ACTIONS_LAST_PATH, next);
}

function summarizeDashboardQuickActionResult(result: unknown): string {
  if (!isRecord(result)) return clipText(JSON.stringify(result) || "", 800);
  const action = clipText(result.action, 120).trim();
  const queued = result.queued === true ? "queued=true" : (result.queued === false ? "queued=false" : "");
  const ok = result.ok === true ? "ok=true" : (result.ok === false ? "ok=false" : "");
  const status = clipText((result as any).status, 40).trim();
  const note = clipText((result as any).note, 160).trim();
  const exitCode = Number((result as any).exit_code);
  const parts = [
    action ? `action=${action}` : "",
    queued,
    ok,
    status ? `status=${status}` : "",
    Number.isFinite(exitCode) ? `exit_code=${Math.floor(exitCode)}` : "",
    note ? `note=${note}` : "",
  ].filter((x) => !!x);
  if (parts.length > 0) return clipText(parts.join("; "), 800);
  return clipText(JSON.stringify(result), 800);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(reason)), timeoutMs);
    promise
      .then((v) => resolve(v))
      .catch((e) => reject(e))
      .finally(() => clearTimeout(timer));
  });
}

function ensureDashboardQuickActionSupported(id: DashboardQuickActionId): void {
  if (id === "heartbeat_dry") {
    const loaded = loadOrgAgentsSnapshot();
    const allowed = new Set(loaded.snapshot.agents.map((a) => a.id));
    if (!allowed.has("facilitator")) throw new Error("heartbeat.facilitator_missing");
    loadHeartbeatSettings(allowed);
    return;
  }
  if (id === "morning_brief_dry") {
    loadMorningBriefSettings();
    return;
  }
  if (id === "morning_brief_autopilot_start_dry") {
    loadMorningBriefSettings();
    loadPresetIndex();
    return;
  }
  if (id === "revert_active_profile_standard") {
    loadPresetIndex();
    return;
  }
  if (id === "thread_archive_scheduler_dry") {
    loadThreadArchiveSchedulerSettings();
    return;
  }
  if (id === "ops_snapshot_dry") {
    buildOpsSnapshotMarkdown({ inbox_limit: 20, runs_limit: 10 });
    return;
  }
  if (id === "evidence_bundle_dry") {
    buildEvidenceExportInputs(20, false);
    return;
  }
}

function normalizeDashboardQuickExecuteId(input: unknown): DashboardQuickExecuteId | "" {
  const v = String(input || "").trim();
  if (v === "morning_brief_autopilot_start" || v === "revert_active_profile_standard" || v === "thread_archive_scheduler" || v === "ops_snapshot" || v === "evidence_bundle") return v;
  return "";
}

function mapDryIdToExecuteId(id: DashboardQuickActionId): DashboardQuickExecuteId | "" {
  if (id === "morning_brief_autopilot_start_dry") return "morning_brief_autopilot_start";
  if (id === "revert_active_profile_standard") return "revert_active_profile_standard";
  if (id === "thread_archive_scheduler_dry") return "thread_archive_scheduler";
  if (id === "ops_snapshot_dry") return "ops_snapshot";
  if (id === "evidence_bundle_dry") return "evidence_bundle";
  return "";
}

function mapExecuteIdToDryId(id: DashboardQuickExecuteId): DashboardQuickActionId {
  if (id === "morning_brief_autopilot_start") return "morning_brief_autopilot_start_dry";
  if (id === "revert_active_profile_standard") return "revert_active_profile_standard";
  if (id === "thread_archive_scheduler") return "thread_archive_scheduler_dry";
  if (id === "ops_snapshot") return "ops_snapshot_dry";
  return "evidence_bundle_dry";
}

function buildDashboardQuickActionTrackingPlan(id: DashboardQuickExecuteId): {
  id: DashboardQuickExecuteId;
  kind: "export_ops_snapshot" | "export_evidence_bundle" | "thread_archive_scheduler" | "inbox_thread";
  status_endpoint: string;
  poll_hint_ms: number;
  max_duration_ms: number;
  fields_hint: {
    terminal_status_values: string[];
    run_id_field: string;
    status_field: string;
    notified_field: string;
  };
} {
  const base = {
    id,
    poll_hint_ms: 2000,
    max_duration_ms: 60000,
    fields_hint: {
      terminal_status_values: ["success", "failed", "error", "completed"],
      run_id_field: "run_id",
      status_field: "status",
      notified_field: "notified",
    },
  };
  if (id === "morning_brief_autopilot_start" || id === "revert_active_profile_standard") {
    return {
      ...base,
      kind: "inbox_thread",
      status_endpoint: "/api/inbox/thread",
      max_duration_ms: 15000,
      fields_hint: {
        ...base.fields_hint,
        terminal_status_values: ["inbox_thread", "success", "completed"],
      },
    };
  }
  if (id === "ops_snapshot") {
    return {
      ...base,
      kind: "export_ops_snapshot",
      status_endpoint: "/api/export/ops_snapshot/status",
    };
  }
  if (id === "evidence_bundle") {
    return {
      ...base,
      kind: "export_evidence_bundle",
      status_endpoint: "/api/export/evidence_bundle/status",
    };
  }
  return {
    ...base,
    kind: "thread_archive_scheduler",
    status_endpoint: "/api/inbox/thread_archive_scheduler/state",
  };
}

function buildDashboardQuickActionTracking(
  id: DashboardQuickExecuteId,
  dryRun: boolean,
  result: Record<string, unknown>,
): Record<string, unknown> | null {
  if (dryRun) return null;
  const plan = buildDashboardQuickActionTrackingPlan(id);
  const requestId = clipText((result as any).request_id, 160).trim();
  const runId = clipText((result as any).run_id, 160).trim();
  const threadKey = normalizeInboxThreadKey((result as any).thread_key);
  if (!requestId && !runId && !threadKey && id !== "thread_archive_scheduler") return null;
  const startedAt = nowIso();
  const pollUrl = (id === "morning_brief_autopilot_start" || id === "revert_active_profile_standard") && threadKey
    ? `/api/inbox/thread?key=${encodeURIComponent(threadKey)}&limit=20`
    : plan.status_endpoint;
  const tracking: Record<string, unknown> = {
    started_at: startedAt,
    status_endpoint: plan.status_endpoint,
    poll_url: pollUrl,
    kind: plan.kind,
    note: id === "thread_archive_scheduler"
      ? "sync_execution_completed_or_in_progress"
      : ((id === "morning_brief_autopilot_start" || id === "revert_active_profile_standard") ? "track_inbox_thread" : "tracking_started"),
  };
  if (requestId) tracking.request_id = requestId;
  if (runId) tracking.run_id = runId;
  if (threadKey) tracking.thread_key = threadKey;
  return tracking;
}

async function runDashboardQuickAction(id: DashboardQuickActionId, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (id === "heartbeat_dry") {
    const loaded = loadOrgAgentsSnapshot();
    const allowed = new Set(loaded.snapshot.agents.map((a) => a.id));
    const settings = loadHeartbeatSettings(allowed);
    return runHeartbeatNow({
      agent_id: "facilitator",
      category: "episodes",
      dry_run: true,
      activity_limit: settings.limits.activity_limit,
      inbox_limit: settings.limits.inbox_limit,
      runs_limit: settings.limits.runs_limit,
    }) as unknown as Record<string, unknown>;
  }
  if (id === "morning_brief_dry") {
    return runMorningBriefNow(true) as unknown as Record<string, unknown>;
  }
  if (id === "morning_brief_autopilot_start_dry") {
    return runDashboardQuickActionExecute("morning_brief_autopilot_start", true, params);
  }
  if (id === "revert_active_profile_standard") {
    return runDashboardQuickActionExecute("revert_active_profile_standard", true, params);
  }
  if (id === "thread_archive_scheduler_dry") {
    return runThreadArchiveSchedulerNow({ dry_run: true, purpose: "run_now" }) as unknown as Record<string, unknown>;
  }
  if (id === "ops_snapshot_dry") {
    const inboxLimit = Math.max(1, Math.min(20, Math.floor(Number(params?.inbox_limit ?? 20))));
    const runsLimit = Math.max(1, Math.min(10, Math.floor(Number(params?.runs_limit ?? 10))));
    const built = buildOpsSnapshotMarkdown({ inbox_limit: inboxLimit, runs_limit: runsLimit });
    const stamp = ymdHmsStamp();
    const outputPath = `ops_snapshot_${stamp}.md`;
    const snapshotText = built.text.replace("# Ops Snapshot", `# Ops Snapshot\n\n- output_file: ${outputPath}`);
    return {
      action: "ops_snapshot",
      queued: false,
      dry_run: true,
      inbox_limit: inboxLimit,
      runs_limit: runsLimit,
      output_path: `written/${outputPath}`,
      missing_sections: built.missing_sections,
      preview: clipText(snapshotText, 2000),
      exit_code: 0,
    };
  }
  if (id === "evidence_bundle_dry") {
    const maxRuns = Math.max(1, Math.min(EVIDENCE_EXPORT_MAX_RUNS, Math.floor(Number(params?.max_runs ?? 20))));
    const includeArchives = params?.include_archives === true;
    const planned = buildEvidenceExportInputs(maxRuns, includeArchives);
    return {
      action: "evidence_export_bundle",
      queued: false,
      dry_run: true,
      max_runs: maxRuns,
      include_archives: includeArchives,
      run_ids: planned.run_ids,
      total_inputs: planned.inputs.length,
      caps: { max_files: 2000, max_total_bytes: 52428800, per_file_bytes: 524288 },
      exit_code: 0,
    };
  }
  throw new Error("dashboard.quick_actions.unsupported_id");
}

async function runDashboardQuickActionExecute(id: DashboardQuickExecuteId, dryRun: boolean, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (id === "revert_active_profile_standard") {
    const threadKey = normalizeInboxThreadKey(params?.thread_key) || makeQuickActionsThreadKey(
      "active_profile_revert",
      "",
      "",
      dryRun ? "preview" : "execute",
    ).thread_key;
    const reverted = runActiveProfileRevertInternal({
      dry_run: dryRun,
      confirm_phrase: dryRun ? "" : "REVERT",
      target_preset_set_id: "standard",
      thread_key: threadKey,
      reason: "revert",
      source: "quick_action",
      quick_action_id: "revert_active_profile_standard",
    });
    return {
      action: "active_profile_revert",
      ...reverted,
      thread_key: threadKey,
    };
  }
  if (id === "morning_brief_autopilot_start") {
    const stepResults: Record<string, unknown> = {};
    const stepTimeoutMs = dryRun ? 10000 : 15000;
    const norm = (value: unknown, cap: number): string => {
      const compact = String(value || "").replace(/\s+/g, " ").trim();
      return clipText(compact, cap);
    };
    const contextFrom = (
      brief: { local_date?: string; note?: string; skipped_reason?: string },
      profile: RecommendedProfile,
    ): string => {
      const lines = [
        `recommended_profile=${profile.preset_set_id} (${clipText(profile.display_name, 80)})`,
        `rationale=${clipText(profile.rationale, 180)}`,
        `brief_local_date=${clipText(brief.local_date || "", 20)}`,
        `brief_note=${norm(brief.note || brief.skipped_reason || "dry_run", 160)}`,
      ];
      return clipText(lines.filter((x) => !!x).join("\n"), 2000);
    };
    try {
      const morning = await withTimeout(
        Promise.resolve(runMorningBriefNow(true)),
        stepTimeoutMs,
        "quick_action_step_timeout:morning_brief",
      );
      stepResults.morning_brief_dry_run = morning;
      const recommendedProfile = isRecord(morning.recommended_profile)
        ? (morning.recommended_profile as RecommendedProfile)
        : computeRecommendedProfile();
      const presetSetId = normalizeRecommendedPresetId(recommendedProfile.preset_set_id, loadPresetIndex());

      const preflight = await withTimeout(
        Promise.resolve(applyAgentPresetInternal({
          preset_set_id: presetSetId,
          scope: "council",
          dry_run: true,
          actor_id: "ui_dashboard",
          applied_by: "quick_action",
          reason: "recommended_profile",
        })),
        stepTimeoutMs,
        "quick_action_step_timeout:apply_preflight",
      );
      stepResults.apply_preset_preflight = preflight;
      if (!preflight.ok) {
        return {
          action: "morning_brief_autopilot_start",
          ok: false,
          dry_run: dryRun,
          reason: "ERR_PRESET_APPLY_FAILED",
          details: { step: "apply_preset_preflight", note: preflight.note || "" },
          recommended_profile: recommendedProfile,
          preflight_preview: preflight,
          step_results: stepResults,
          exit_code: 1,
        };
      }

      const topic = clipText(
        String(params?.topic || "Morning Brief: 今日の優先度と次アクション"),
        COUNCIL_TOPIC_MAX,
      ).trim() || "Morning Brief: 今日の優先度と次アクション";
      const context = contextFrom(
        {
          local_date: String((morning as any).local_date || ""),
          note: String((morning as any).note || ""),
          skipped_reason: String((morning as any).skipped_reason || ""),
        },
        recommendedProfile,
      );
      const maxRounds = Math.max(1, Math.min(3, Math.floor(Number(params?.max_rounds ?? 1) || 1)));

      if (dryRun) {
        const autopilotPreview = await withTimeout(
          Promise.resolve(startCouncilRunInternal({
            topic,
            constraints: context,
            thread_id: "general",
            max_rounds: maxRounds,
            auto_build: false,
            auto_ops_snapshot: true,
            auto_evidence_bundle: false,
            auto_release_bundle: false,
            dry_run: true,
          }) as unknown as Record<string, unknown>),
          stepTimeoutMs,
          "quick_action_step_timeout:autopilot_preview",
        );
        stepResults.council_autopilot_preview = autopilotPreview;
        const previewThreadKey = normalizeInboxThreadKey((autopilotPreview as any).thread_key);
        const trackingPlan = buildDashboardQuickActionTrackingPlan(id);
        return {
          action: "morning_brief_autopilot_start",
          ok: true,
          dry_run: true,
          recommended_profile: recommendedProfile,
          preflight_preview: preflight,
          autopilot_preview: autopilotPreview,
          tracking_plan: {
            ...trackingPlan,
            kind: "inbox_thread",
            poll_url: previewThreadKey
              ? `/api/inbox/thread?key=${encodeURIComponent(previewThreadKey)}&limit=20`
              : "",
          },
          thread_key: previewThreadKey || "",
          step_results: stepResults,
          exit_code: 0,
        };
      }

      const preflightFinal = await withTimeout(
        Promise.resolve(applyAgentPresetInternal({
          preset_set_id: presetSetId,
          scope: "council",
          dry_run: true,
          actor_id: "ui_dashboard",
          applied_by: "quick_action",
          reason: "recommended_profile",
        })),
        stepTimeoutMs,
        "quick_action_step_timeout:apply_preflight_final",
      );
      stepResults.apply_preset_preflight_final = preflightFinal;
      if (!preflightFinal.ok) {
        return {
          action: "morning_brief_autopilot_start",
          ok: false,
          dry_run: false,
          reason: "ERR_PRESET_APPLY_FAILED",
          details: { step: "apply_preset_preflight_final", note: preflightFinal.note || "" },
          recommended_profile: recommendedProfile,
          preflight_preview: preflightFinal,
          step_results: stepResults,
          exit_code: 1,
        };
      }

      const applyReal = await withTimeout(
        Promise.resolve(applyAgentPresetInternal({
          preset_set_id: presetSetId,
          scope: "council",
          dry_run: false,
          actor_id: "ui_dashboard",
          applied_by: "quick_action",
          reason: "recommended_profile",
        })),
        stepTimeoutMs,
        "quick_action_step_timeout:apply_real",
      );
      stepResults.apply_preset = applyReal;
      if (!applyReal.ok) {
        return {
          action: "morning_brief_autopilot_start",
          ok: false,
          dry_run: false,
          reason: "ERR_PRESET_APPLY_FAILED",
          details: { step: "apply_preset", note: applyReal.note || "" },
          recommended_profile: recommendedProfile,
          apply_result: applyReal,
          step_results: stepResults,
          exit_code: 1,
        };
      }

      const run = await withTimeout(
        Promise.resolve(startCouncilRunInternal({
          topic,
          constraints: context,
          thread_id: "general",
          max_rounds: maxRounds,
          auto_build: false,
          auto_ops_snapshot: true,
          auto_evidence_bundle: false,
          auto_release_bundle: false,
          dry_run: false,
        })),
        stepTimeoutMs,
        "quick_action_step_timeout:autopilot_start",
      );
      stepResults.council_autopilot_start = {
        run_id: run.run_id,
        request_id: run.request_id,
        thread_key: run.thread_key,
        status: run.status,
      };
      const activeProfileAfterStart = writeActiveProfileState({
        preset_set_id: presetSetId,
        display_name: recommendedProfile.display_name,
        applied_by: "quick_action",
        reason: "recommended_profile",
        thread_key: normalizeInboxThreadKey(run.thread_key) || "",
      });
      return {
        action: "morning_brief_autopilot_start",
        ok: true,
        dry_run: false,
        recommended_profile: recommendedProfile,
        preflight_preview: preflightFinal,
        apply_result: applyReal,
        active_profile: activeProfileAfterStart.state,
        active_profile_updated: activeProfileAfterStart.ok,
        autopilot_start: {
          run_id: run.run_id,
          request_id: run.request_id,
          thread_key: run.thread_key,
          thread_key_source: run.thread_key_source,
          status: run.status,
        },
        request_id: run.request_id,
        run_id: run.run_id,
        thread_key: normalizeInboxThreadKey(run.thread_key) || "",
        step_results: stepResults,
        exit_code: 0,
      };
    } catch (e: any) {
      return {
        action: "morning_brief_autopilot_start",
        ok: false,
        dry_run: dryRun,
        reason: clipText(String(e?.message || "quick_action_execute_failed"), 200) || "quick_action_execute_failed",
        step_results: stepResults,
        exit_code: 1,
      };
    }
  }
  if (id === "thread_archive_scheduler") {
    return runThreadArchiveSchedulerNow({ dry_run: dryRun, purpose: "run_now" }) as unknown as Record<string, unknown>;
  }
  if (id === "ops_snapshot") {
    if (dryRun) return runDashboardQuickAction("ops_snapshot_dry", params);
    const inboxLimit = Math.max(1, Math.min(20, Math.floor(Number(params?.inbox_limit ?? 20))));
    const runsLimit = Math.max(1, Math.min(10, Math.floor(Number(params?.runs_limit ?? 10))));
    const q = queueOpsSnapshotInternal(inboxLimit, runsLimit);
    if (!q.ok) {
      return {
        action: "ops_snapshot",
        queued: false,
        dry_run: false,
        inbox_limit: inboxLimit,
        runs_limit: runsLimit,
        exit_code: 1,
        note: clipText(q.reason || "queue_failed", 200),
      };
    }
    return {
      action: "ops_snapshot",
      queued: true,
      dry_run: false,
      request_id: q.request_id || "",
      task_id: q.task_id || "",
      queued_path: q.queued_path || "",
      inbox_limit: inboxLimit,
      runs_limit: runsLimit,
      exit_code: 0,
    };
  }
  if (id === "evidence_bundle") {
    if (dryRun) return runDashboardQuickAction("evidence_bundle_dry", params);
    const maxRuns = Math.max(1, Math.min(EVIDENCE_EXPORT_MAX_RUNS, Math.floor(Number(params?.max_runs ?? 20))));
    const includeArchives = params?.include_archives === true;
    const q = queueEvidenceExportInternal(maxRuns, includeArchives);
    if (!q.ok) {
      return {
        action: "evidence_export_bundle",
        queued: false,
        dry_run: false,
        max_runs: maxRuns,
        include_archives: includeArchives,
        exit_code: 1,
        note: clipText(q.reason || "queue_failed", 200),
      };
    }
    return {
      action: "evidence_export_bundle",
      queued: true,
      dry_run: false,
      request_id: q.request_id || "",
      task_id: q.task_id || "",
      queued_path: q.queued_path || "",
      max_runs: maxRuns,
      include_archives: includeArchives,
      exit_code: 0,
    };
  }
  throw new Error("dashboard.quick_actions.execute_unsupported_id");
}

function buildDashboardQuickActions(): Record<string, unknown> {
  const defs: Array<{
    id: DashboardQuickActionId;
    title: string;
    hint: string;
    open_settings: string;
    execute_supported: boolean;
    execute_side_effects?: string[];
    execute_endpoint_hint?: string;
  }> = [
    { id: "heartbeat_dry", title: "Heartbeat (dry-run)", hint: "agent=facilitator / category=episodes", open_settings: "#settings?panel=heartbeat", execute_supported: false },
    { id: "morning_brief_dry", title: "Morning Brief (dry-run)", hint: "routine dry-run only", open_settings: "#settings?panel=morning_brief", execute_supported: false },
    {
      id: "morning_brief_autopilot_start_dry",
      title: "Morning Brief + Autopilot Start (dry-run)",
      hint: "recommended profile preflight + autopilot preview",
      open_settings: "#dashboard",
      execute_supported: true,
      execute_side_effects: ["apply preset traits (council)", "start council autopilot", "append inbox audit"],
      execute_endpoint_hint: "EXECUTE + APPLY required",
    },
    {
      id: "revert_active_profile_standard",
      title: "Revert Active Profile -> standard (dry-run)",
      hint: "active_profile revert preview",
      open_settings: "#dashboard",
      execute_supported: true,
      execute_side_effects: ["apply preset traits (council) -> standard", "update active profile", "append inbox audit"],
      execute_endpoint_hint: "EXECUTE confirm",
    },
    {
      id: "thread_archive_scheduler_dry",
      title: "Thread Archive Scheduler (dry-run)",
      hint: "dashboard wrapper",
      open_settings: "#settings?panel=thread_archive_scheduler",
      execute_supported: true,
      execute_side_effects: ["writes archive files", "appends one summary audit entry"],
      execute_endpoint_hint: "writes archive files",
    },
    {
      id: "ops_snapshot_dry",
      title: "Ops Snapshot (dry-run)",
      hint: "inbox_limit=20 / runs_limit=10",
      open_settings: "#settings?panel=ops_snapshot",
      execute_supported: true,
      execute_side_effects: ["queues task", "creates written/ops_snapshot_*.md after run"],
      execute_endpoint_hint: "queues task",
    },
    {
      id: "evidence_bundle_dry",
      title: "Evidence Bundle (dry-run)",
      hint: "max_runs=20 / include_archives=false",
      open_settings: "#settings?panel=evidence_bundle",
      execute_supported: true,
      execute_side_effects: ["queues task", "creates bundles/evidence_*.zip after run"],
      execute_endpoint_hint: "queues task",
    },
  ];
  const last = loadDashboardQuickActionsLast();
  const actions = defs.map((d) => {
    let enabled = true;
    let hint = d.hint;
    try {
      ensureDashboardQuickActionSupported(d.id);
    } catch (e: any) {
      enabled = false;
      hint = `disabled:${clipText(String(e?.message || "unsupported"), 200)}`;
    }
    const lastItem = isRecord(last[d.id] as unknown) ? (last[d.id] as unknown as DashboardQuickActionLast) : undefined;
    const executeId = mapDryIdToExecuteId(d.id);
    return {
      id: d.id,
      title: d.title,
      kind: "dry_run",
      enabled,
      hint,
      open_settings: d.open_settings,
      execute_id: executeId || "",
      execute_supported: d.execute_supported,
      execute_requires_confirm: d.execute_supported,
      execute_side_effects: d.execute_supported ? (d.execute_side_effects || []) : [],
      execute_endpoint_hint: d.execute_supported ? (d.execute_endpoint_hint || "") : "",
      last: lastItem ? {
        last_run_at: lastItem.last_run_at,
        ok: lastItem.ok,
        status_code: lastItem.status_code,
        elapsed_ms: lastItem.elapsed_ms,
        result_summary: lastItem.result_summary,
        failure_reason: lastItem.failure_reason || "",
        last_execute_at: lastItem.last_execute_at || "",
        last_execute_ok: lastItem.last_execute_ok === true,
        last_execute_result_summary: lastItem.last_execute_result_summary || "",
        last_execute_failure_reason: lastItem.last_execute_failure_reason || "",
      } : null,
    };
  });
  return {
    action: "dashboard_quick_actions",
    actions,
    exit_code: 0,
  };
}

async function runDashboardQuickActionsById(body: unknown): Promise<Record<string, unknown>> {
  const idRaw = isRecord(body) ? String(body.id || "").trim() : "";
  const params = isRecord(body) && isRecord(body.params) ? body.params : {};
  const allowed = new Set<DashboardQuickActionId>([
    "heartbeat_dry",
    "morning_brief_dry",
    "morning_brief_autopilot_start_dry",
    "revert_active_profile_standard",
    "thread_archive_scheduler_dry",
    "ops_snapshot_dry",
    "evidence_bundle_dry",
  ]);
  if (!idRaw || !allowed.has(idRaw as DashboardQuickActionId)) {
    return {
      action: "dashboard_quick_actions_run",
      id: idRaw || "",
      ok: false,
      status_code: 400,
      result: {},
      elapsed_ms: 0,
      exit_code: 1,
      failure_reason: "unsupported_id",
    };
  }
  const id = idRaw as DashboardQuickActionId;
  const started = Date.now();
  try {
    const result = await withTimeout(
      runDashboardQuickAction(id, params),
      DASHBOARD_QUICK_ACTIONS_TIMEOUT_MS,
      "quick_action_timeout",
    );
    const elapsed = Math.max(0, Date.now() - started);
    const resultOk = !(isRecord(result) && result.ok === false) && Math.floor(Number((result as any)?.exit_code ?? 0)) === 0;
    const payload = {
      action: "dashboard_quick_actions_run",
      id,
      ok: resultOk,
      status_code: 200,
      result,
      elapsed_ms: elapsed,
      exit_code: resultOk ? 0 : 1,
      failure_reason: resultOk ? "" : clipText((result as any)?.note || "quick_action_failed", 200),
    };
    const last = loadDashboardQuickActionsLast();
    last[id] = {
      last_run_at: nowIso(),
      ok: payload.ok,
      status_code: payload.status_code,
      elapsed_ms: payload.elapsed_ms,
      result_summary: summarizeDashboardQuickActionResult(result),
      failure_reason: payload.failure_reason || "",
    };
    saveDashboardQuickActionsLast(last);
    return payload;
  } catch (e: any) {
    const elapsed = Math.max(0, Date.now() - started);
    const reason = clipText(String(e?.message || "quick_action_failed"), 200) || "quick_action_failed";
    const statusCode = reason === "quick_action_timeout" ? 504 : 500;
    const payload = {
      action: "dashboard_quick_actions_run",
      id,
      ok: false,
      status_code: statusCode,
      result: {},
      elapsed_ms: elapsed,
      exit_code: 1,
      failure_reason: reason,
    };
    const last = loadDashboardQuickActionsLast();
    last[id] = {
      last_run_at: nowIso(),
      ok: false,
      status_code: statusCode,
      elapsed_ms: elapsed,
      result_summary: "failed",
      failure_reason: reason,
    };
    saveDashboardQuickActionsLast(last);
    return payload;
  }
}

async function runDashboardQuickActionsExecuteById(input: {
  id: DashboardQuickExecuteId;
  dry_run: boolean;
  params?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const trackingPlan = buildDashboardQuickActionTrackingPlan(input.id);
  const started = Date.now();
  try {
    const result = await withTimeout(
      runDashboardQuickActionExecute(input.id, input.dry_run, input.params),
      DASHBOARD_QUICK_ACTIONS_EXECUTE_TIMEOUT_MS,
      "quick_action_execute_timeout",
    );
    const elapsed = Math.max(0, Date.now() - started);
    const resultOk = !(isRecord(result) && result.ok === false) && Math.floor(Number((result as any)?.exit_code ?? 0)) === 0;
    const requestId = clipText((result as any)?.request_id, 160).trim();
    const runId = clipText((result as any)?.run_id, 160).trim();
    const resultThreadKey = normalizeInboxThreadKey((result as any)?.thread_key);
    const threadKeyMeta = makeQuickActionsThreadKey(
      input.id,
      requestId,
      runId,
      input.dry_run ? "preview" : "execute",
    );
    const payload = {
      action: "dashboard_quick_actions_execute",
      id: input.id,
      dry_run: input.dry_run,
      ok: resultOk,
      status_code: 200,
      result,
      elapsed_ms: elapsed,
      exit_code: resultOk ? 0 : 1,
      failure_reason: resultOk ? "" : clipText((result as any)?.note || "quick_action_execute_failed", 200),
      tracking_plan: trackingPlan,
      tracking: buildDashboardQuickActionTracking(input.id, input.dry_run, result),
      thread_key: resultThreadKey || threadKeyMeta.thread_key,
      thread_key_source: resultThreadKey ? "result" : threadKeyMeta.source,
    };
    if (!input.dry_run) {
      try {
        appendInboxEntry({
          id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
          ts: nowIso(),
          thread_id: "export",
          msg_id: requestId || runId || randomId("qa_exec"),
          role: "system",
          mention: false,
          title: clipText(`Execute ${resultOk ? "queued" : "failed"}: ${input.id}`, 256),
          body: clipText(`quick_action=${input.id} dry_run=false request_id=${requestId || "-"} run_id=${runId || "-"}`, 2000),
          source: "quick_actions_execute",
          thread_key: resultThreadKey || threadKeyMeta.thread_key,
          links: {
            quick_action_id: input.id,
            kind: input.id,
            request_id: requestId,
            run_id: runId,
            preset_set_id: clipText((result as any)?.recommended_profile?.preset_set_id, 80).trim(),
          },
        });
      } catch {
        // best-effort audit only
      }
    }
    const dryId = mapExecuteIdToDryId(input.id);
    const last = loadDashboardQuickActionsLast();
    const prev = last[dryId] || {
      last_run_at: "",
      ok: false,
      status_code: 0,
      elapsed_ms: 0,
      result_summary: "",
    };
    last[dryId] = {
      ...prev,
      last_execute_at: nowIso(),
      last_execute_ok: payload.ok,
      last_execute_result_summary: summarizeDashboardQuickActionResult(result),
      last_execute_failure_reason: payload.failure_reason || "",
      last_tracking: isRecord(payload.tracking) ? {
        id: input.id,
        request_id: clipText(payload.tracking.request_id, 160),
        run_id: clipText(payload.tracking.run_id, 160),
        started_at: clipText(payload.tracking.started_at, 80),
        kind: clipText(payload.tracking.kind, 80),
      } : undefined,
    };
    saveDashboardQuickActionsLast(last);
    return payload;
  } catch (e: any) {
    const elapsed = Math.max(0, Date.now() - started);
    const reason = clipText(String(e?.message || "quick_action_execute_failed"), 200) || "quick_action_execute_failed";
    const statusCode = reason === "quick_action_execute_timeout" ? 504 : 500;
    const payload = {
      action: "dashboard_quick_actions_execute",
      id: input.id,
      dry_run: input.dry_run,
      ok: false,
      status_code: statusCode,
      result: {},
      elapsed_ms: elapsed,
      exit_code: 1,
      failure_reason: reason,
      tracking_plan: trackingPlan,
      tracking: null,
      thread_key: makeQuickActionsThreadKey(input.id, "", "", input.dry_run ? "preview" : "execute").thread_key,
      thread_key_source: input.dry_run ? "preview" : "fallback",
    };
    const dryId = mapExecuteIdToDryId(input.id);
    const last = loadDashboardQuickActionsLast();
    const prev = last[dryId] || {
      last_run_at: "",
      ok: false,
      status_code: 0,
      elapsed_ms: 0,
      result_summary: "",
    };
    last[dryId] = {
      ...prev,
      last_execute_at: nowIso(),
      last_execute_ok: false,
      last_execute_result_summary: "failed",
      last_execute_failure_reason: reason,
      last_tracking: undefined,
    };
    saveDashboardQuickActionsLast(last);
    return payload;
  }
}

function runOpsClearStaleLocks(dryRun: boolean): Record<string, unknown> {
  const allowedAgentIds = new Set(loadOrgAgentsSnapshot().snapshot.agents.map((a) => a.id));
  const heartbeatSettings = loadHeartbeatSettings(allowedAgentIds);
  const consolidationSettings = loadConsolidationSettings(allowedAgentIds);
  const defs = [
    { name: "heartbeat", path: HEARTBEAT_LOCK_PATH, stale_sec: Number(heartbeatSettings.safety.lock_stale_sec || OPS_QUICK_ACTIONS_LOCK_STALE_DEFAULT) },
    { name: "consolidation", path: CONSOLIDATION_LOCK_PATH, stale_sec: Number(consolidationSettings.safety.lock_stale_sec || OPS_QUICK_ACTIONS_LOCK_STALE_DEFAULT) },
    { name: "morning_brief", path: MORNING_BRIEF_LOCK_PATH, stale_sec: OPS_QUICK_ACTIONS_LOCK_STALE_DEFAULT },
    { name: "autopilot_suggest", path: path.join(HEARTBEAT_DIR, "autopilot_suggest.lock"), stale_sec: OPS_QUICK_ACTIONS_LOCK_STALE_DEFAULT },
  ];
  const cleared: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];
  for (const d of defs) {
    const exists = fs.existsSync(d.path);
    if (!exists) {
      skipped.push({ name: d.name, path: d.path.replaceAll("\\", "/"), reason: "missing" });
      continue;
    }
    const ageSec = safeFileAgeSec(d.path);
    const stale = ageSec >= d.stale_sec;
    if (!stale) {
      skipped.push({ name: d.name, path: d.path.replaceAll("\\", "/"), reason: "not_stale", age_sec: ageSec, stale_threshold_sec: d.stale_sec });
      continue;
    }
    if (dryRun) {
      cleared.push({ name: d.name, path: d.path.replaceAll("\\", "/"), would_delete: true, age_sec: ageSec });
      continue;
    }
    try {
      fs.unlinkSync(d.path);
      cleared.push({ name: d.name, path: d.path.replaceAll("\\", "/"), deleted: true, age_sec: ageSec });
    } catch (e: any) {
      skipped.push({ name: d.name, path: d.path.replaceAll("\\", "/"), reason: `delete_failed:${String(e?.message || "unknown")}` });
    }
  }
  return {
    action: "ops_clear_stale_locks",
    dry_run: dryRun,
    cleared,
    skipped,
    exit_code: 0,
    note: "",
  };
}

function runOpsResetBrakes(targetsInput: unknown, dryRun: boolean): Record<string, unknown> {
  const requested = Array.isArray(targetsInput) ? new Set(targetsInput.map((x) => String(x || "").trim())) : new Set<string>(["heartbeat", "suggest", "consolidation", "morning_brief"]);
  const updated: Array<Record<string, unknown>> = [];
  const allowedAgentIds = new Set(loadOrgAgentsSnapshot().snapshot.agents.map((a) => a.id));
  if (requested.has("heartbeat")) {
    const settings = loadHeartbeatSettings(allowedAgentIds);
    const state = loadHeartbeatState();
    state.enabled_effective = Boolean(settings.enabled);
    state.lock = { held: false, owner_pid: 0, started_at: "", note: "" };
    const per = isRecord(state.per_target) ? state.per_target : {};
    for (const k of Object.keys(per)) {
      const v = per[k];
      if (!isRecord(v)) continue;
      v.failure_count = 0;
      v.backoff_until = null;
      v.last_note = "";
    }
    if (!dryRun) saveHeartbeatState(state);
    updated.push({ name: "heartbeat", enabled_effective: state.enabled_effective });
  }
  if (requested.has("suggest")) {
    const settings = loadHeartbeatAutopilotSuggestSettings();
    const state = loadHeartbeatAutopilotSuggestState();
    state.auto_accept_enabled_effective = Boolean(settings.auto_accept_enabled);
    state.failure_count = 0;
    state.last_error = "";
    if (!dryRun) saveHeartbeatAutopilotSuggestState(state);
    updated.push({ name: "suggest", enabled_effective: state.auto_accept_enabled_effective });
  }
  if (requested.has("consolidation")) {
    const settings = loadConsolidationSettings(allowedAgentIds);
    const state = loadConsolidationState();
    state.enabled_effective = Boolean(settings.enabled);
    state.failure_count = 0;
    state.backoff_until = null;
    if (!dryRun) saveConsolidationState(state);
    updated.push({ name: "consolidation", enabled_effective: state.enabled_effective });
  }
  if (requested.has("morning_brief")) {
    const settings = loadMorningBriefSettings();
    const state = loadMorningBriefState();
    state.enabled_effective = Boolean(settings.enabled);
    state.failure_count = 0;
    state.backoff_until = null;
    if (!dryRun) saveMorningBriefState(state);
    updated.push({ name: "morning_brief", enabled_effective: state.enabled_effective });
  }
  return {
    action: "ops_reset_brakes",
    dry_run: dryRun,
    updated,
    exit_code: 0,
    note: "",
  };
}

function runOpsStabilize(params: { mode: string; include_run_now: boolean }): Record<string, unknown> {
  const mode = params.mode === "safe_run" ? "safe_run" : "dry_run";
  const allowActualRun = mode === "safe_run" && params.include_run_now === true;
  const steps: Record<string, unknown> = {};
  let ok = true;
  try {
    steps.clear_locks = runOpsClearStaleLocks(false);
  } catch (e: any) {
    ok = false;
    steps.clear_locks = { ok: false, note: `clear_locks_failed:${String(e?.message || "unknown")}` };
  }
  try {
    steps.reset_brakes = runOpsResetBrakes(undefined, false);
  } catch (e: any) {
    ok = false;
    steps.reset_brakes = { ok: false, note: `reset_brakes_failed:${String(e?.message || "unknown")}` };
  }
  const heartbeatDry = !allowActualRun;
  const consolidationDry = !allowActualRun;
  const morningBriefDry = !allowActualRun;
  try {
    const hbSettings = loadHeartbeatSettings(new Set(loadOrgAgentsSnapshot().snapshot.agents.map((a) => a.id)));
    steps.heartbeat = runHeartbeatNow({
      agent_id: "facilitator",
      category: "episodes",
      dry_run: heartbeatDry,
      activity_limit: hbSettings.limits.activity_limit,
      inbox_limit: hbSettings.limits.inbox_limit,
      runs_limit: hbSettings.limits.runs_limit,
    });
  } catch (e: any) {
    ok = false;
    steps.heartbeat = { ok: false, note: `heartbeat_run_now_failed:${String(e?.message || "unknown")}` };
  }
  try {
    steps.consolidation = runConsolidationNow({ agent_id: "facilitator", dry_run: consolidationDry });
  } catch (e: any) {
    ok = false;
    steps.consolidation = { ok: false, note: `consolidation_run_now_failed:${String(e?.message || "unknown")}` };
  }
  try {
    steps.morning_brief = runMorningBriefNow(morningBriefDry);
  } catch (e: any) {
    ok = false;
    steps.morning_brief = { ok: false, note: `morning_brief_run_now_failed:${String(e?.message || "unknown")}` };
  }
  const summary = clipText(`mode=${mode}; actual=${allowActualRun}; steps=${Object.keys(steps).join(",")}; ok=${ok}`, 400);
  appendOpsQuickActionsAuditInbox({
    title: "Ops quick action executed",
    body: summary,
    mention: !ok,
    links: { mode, include_run_now: allowActualRun },
  });
  return {
    action: "ops_stabilize",
    mode,
    include_run_now: allowActualRun,
    steps,
    ok,
    note: "",
  };
}

function tryAcquireOpsAutoStabilizeLock(staleSec: number): { acquired: boolean; note: string } {
  try {
    const fd = fs.openSync(OPS_AUTO_STABILIZE_LOCK_PATH, "wx");
    const rec = { owner_pid: process.pid, started_at: nowIso(), purpose: "ops_auto_stabilize" };
    fs.writeFileSync(fd, `${JSON.stringify(rec)}\n`, "utf8");
    fs.closeSync(fd);
    return { acquired: true, note: "acquired" };
  } catch {}
  try {
    const raw = readJson<unknown>(OPS_AUTO_STABILIZE_LOCK_PATH, null);
    if (!isRecord(raw)) return { acquired: false, note: "locked_unknown" };
    const started = new Date(String(raw.started_at || "")).getTime();
    const stale = !Number.isFinite(started) || (Date.now() - started) > Math.max(1, staleSec) * 1000;
    if (!stale) return { acquired: false, note: "locked" };
    if (fs.existsSync(OPS_AUTO_STABILIZE_LOCK_PATH)) fs.unlinkSync(OPS_AUTO_STABILIZE_LOCK_PATH);
    const fd2 = fs.openSync(OPS_AUTO_STABILIZE_LOCK_PATH, "wx");
    const rec2 = { owner_pid: process.pid, started_at: nowIso(), purpose: "ops_auto_stabilize_recovered" };
    fs.writeFileSync(fd2, `${JSON.stringify(rec2)}\n`, "utf8");
    fs.closeSync(fd2);
    return { acquired: true, note: "stale_recovered" };
  } catch {
    return { acquired: false, note: "lock_error" };
  }
}

function releaseOpsAutoStabilizeLockIfOwned(): void {
  try {
    const raw = readJson<unknown>(OPS_AUTO_STABILIZE_LOCK_PATH, null);
    if (!isRecord(raw)) return;
    if (Math.floor(Number(raw.owner_pid || 0)) !== process.pid) return;
    if (fs.existsSync(OPS_AUTO_STABILIZE_LOCK_PATH)) fs.unlinkSync(OPS_AUTO_STABILIZE_LOCK_PATH);
  } catch {}
}

function runOpsAutoStabilizeDryRunNow(manualSource: string, opts?: { skip_lock?: boolean }): Record<string, unknown> {
  const settings = loadOpsAutoStabilizeSettings();
  const state = loadOpsAutoStabilizeState();
  const runOnce = (): Record<string, unknown> => {
    const token = issueOpsQuickActionsConfirmToken();
    const stabilize = runOpsStabilize({ mode: "dry_run", include_run_now: false });
    const ok = stabilize.ok === true;
    const summary = clipText(`source=${manualSource}; ok=${ok}; mode=dry_run`, 400);
    const mention = settings.mention_on_trigger && !ok;
    const entryId = `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    try {
      const suggestionId = randomId("ops_auto_stab_suggestion");
      const item = {
        id: entryId,
        ts: nowIso(),
        thread_id: "ops",
        msg_id: "",
        role: "system",
        mention,
        title: "Auto-stabilize suggestion",
        body: clipText(`${summary}\nOpen #ダッシュボード -> Ops -> Stabilize (safe run)`, 2000),
        source: manualSource,
        links: { dashboard: "dashboard", confirm_token: token, source_inbox_id: entryId, auto_stabilize_suggestion_id: suggestionId },
      };
      appendInboxEntry(item);
      state.last_inbox_id = entryId;
    } catch {}
    state.last_check_at = nowIso();
    state.last_trigger_at = nowIso();
    const localDate = localDateYmd(new Date());
    if (state.last_trigger_local_date !== localDate) {
      state.last_trigger_local_date = localDate;
      state.trigger_count_today = 0;
    }
    state.trigger_count_today += 1;
    state.last_result_ok = ok;
    state.last_result_summary = summary;
    state.last_reason = manualSource;
    if (ok) state.failure_count = 0;
    else state.failure_count += 1;
    if (state.failure_count >= settings.safety.max_consecutive_failures) {
      state.enabled_effective = false;
      appendOpsQuickActionsAuditInbox({
        title: "Auto-stabilize stopped",
        body: clipText(`auto-stabilize stopped due to consecutive failures (${state.failure_count})`, 500),
        mention: true,
        links: { source: "ops_auto_stabilize" },
      });
    }
    saveOpsAutoStabilizeState(state);
    return { ok: true, results: stabilize, inbox_appended: true, source_inbox_id: entryId, note: "" };
  };
  if (opts?.skip_lock === true) {
    return runOnce();
  }
  const lock = tryAcquireOpsAutoStabilizeLock(settings.safety.lock_stale_sec);
  if (!lock.acquired) return { ok: true, skipped_reason: "locked", note: lock.note };
  try {
    return runOnce();
  } finally {
    releaseOpsAutoStabilizeLockIfOwned();
  }
}

function appendOpsAutoStabilizeExecuteAudit(params: { ok: boolean; include_run_now: boolean; source_inbox_id?: string; summary: string }): void {
  try {
    const mention = !params.ok;
    let body = clipText(`mode=${params.include_run_now ? "safe_run+run_now" : "safe_run"} ok=${params.ok}; ${params.summary}`, 2000);
    if (mention) {
      const token = getMentionToken(loadDesktopSettings());
      body = clipText(`${token} ${body}`, 2000);
    }
    const item = {
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: "ops",
      msg_id: "",
      role: "system",
      mention,
      title: "Ops stabilize executed",
      body,
      source: "ops_auto_stabilize_execute",
      links: {
        dashboard: "dashboard",
        source_inbox_id: clipText(params.source_inbox_id, 120),
        logs_dir: getLatestLogDir("ci_smoke_gate_"),
      },
    };
    appendInboxEntry(item);
  } catch {
    // best-effort
  }
}

function appendOpsAutoStabilizeAutoExecuteAudit(params: { ok: boolean; reason: string; source_inbox_id?: string; summary: string; mention?: boolean }): void {
  try {
    const mention = params.mention === true || !params.ok;
    let body = clipText(`mode=safe_no_exec; reason=${params.reason}; ok=${params.ok}; ${params.summary}`, 2000);
    if (mention) {
      const token = getMentionToken(loadDesktopSettings());
      body = clipText(`${token} ${body}`, 2000);
    }
    const item = {
      id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      thread_id: "ops",
      msg_id: "",
      role: "system",
      mention,
      title: "Auto-stabilize executed (safe no-exec)",
      body,
      source: "ops_auto_stabilize_auto_execute",
      links: {
        dashboard: "dashboard",
        source_inbox_id: clipText(params.source_inbox_id, 120),
        logs_dir: getLatestLogDir("ci_smoke_gate_"),
      },
    };
    appendInboxEntry(item);
  } catch {
    // best-effort
  }
}

function runOpsAutoStabilizeExecuteSafeRun(params: { dry_run: boolean; include_run_now: boolean; source_inbox_id: string }): Record<string, unknown> {
  const executeState = loadOpsAutoStabilizeExecuteState();
  const autoSettings = loadOpsAutoStabilizeSettings();
  const now = new Date();
  const localDate = localDateYmd(now);
  if (executeState.last_local_date !== localDate) {
    executeState.last_local_date = localDate;
    executeState.execute_count_today = 0;
  }
  const sourceInboxId = clipText(params.source_inbox_id, 120).trim();
  if (sourceInboxId && executeState.executed_source_inbox_ids.includes(sourceInboxId)) {
    return {
      action: "ops_auto_stabilize_execute_safe_run",
      dry_run: params.dry_run,
      include_run_now: params.include_run_now,
      ok: true,
      skipped_reason: "idempotent_already_executed",
      results: {},
      note: "",
    };
  }
  if (!params.dry_run) {
    const lastMs = executeState.last_execute_at ? new Date(executeState.last_execute_at).getTime() : 0;
    if (lastMs > 0 && Date.now() - lastMs < autoSettings.cooldown_sec * 1000) {
      return {
        action: "ops_auto_stabilize_execute_safe_run",
        dry_run: false,
        include_run_now: params.include_run_now,
        ok: true,
        skipped_reason: "cooldown_active",
        results: {},
        note: "",
      };
    }
    if (executeState.execute_count_today >= autoSettings.max_per_day) {
      return {
        action: "ops_auto_stabilize_execute_safe_run",
        dry_run: false,
        include_run_now: params.include_run_now,
        ok: true,
        skipped_reason: "max_per_day_reached",
        results: {},
        note: "",
      };
    }
  }
  const results: Record<string, unknown> = {};
  let ok = true;
  if (params.dry_run) {
    results.plan = {
      clear_locks: "not_dry",
      reset_brakes: "not_dry",
      heartbeat: params.include_run_now ? "run_now" : "dry_run",
      consolidation: params.include_run_now ? "run_now" : "dry_run",
      morning_brief: params.include_run_now ? "run_now" : "dry_run",
    };
    return {
      action: "ops_auto_stabilize_execute_safe_run",
      dry_run: true,
      include_run_now: params.include_run_now,
      ok: true,
      skipped_reason: "",
      results,
      note: "",
    };
  }
  try { results.clear_locks = runOpsClearStaleLocks(false); } catch (e: any) { ok = false; results.clear_locks = { ok: false, note: String(e?.message || "unknown") }; }
  try { results.reset_brakes = runOpsResetBrakes(undefined, false); } catch (e: any) { ok = false; results.reset_brakes = { ok: false, note: String(e?.message || "unknown") }; }
  try {
    const hbSettings = loadHeartbeatSettings(new Set(loadOrgAgentsSnapshot().snapshot.agents.map((a) => a.id)));
    results.heartbeat = runHeartbeatNow({
      agent_id: "facilitator",
      category: "episodes",
      dry_run: !params.include_run_now,
      activity_limit: hbSettings.limits.activity_limit,
      inbox_limit: hbSettings.limits.inbox_limit,
      runs_limit: hbSettings.limits.runs_limit,
    });
  } catch (e: any) { ok = false; results.heartbeat = { ok: false, note: String(e?.message || "unknown") }; }
  try { results.consolidation = runConsolidationNow({ agent_id: "facilitator", dry_run: !params.include_run_now }); } catch (e: any) { ok = false; results.consolidation = { ok: false, note: String(e?.message || "unknown") }; }
  try { results.morning_brief = runMorningBriefNow(!params.include_run_now); } catch (e: any) { ok = false; results.morning_brief = { ok: false, note: String(e?.message || "unknown") }; }

  executeState.last_execute_at = nowIso();
  executeState.execute_count_today += 1;
  if (sourceInboxId) {
    executeState.last_source_inbox_id = sourceInboxId;
    executeState.executed_source_inbox_ids = [...executeState.executed_source_inbox_ids, sourceInboxId].slice(-200);
  }
  executeState.last_result_ok = ok;
  executeState.last_result_summary = clipText(`include_run_now=${params.include_run_now}; ok=${ok}`, 600);
  saveOpsAutoStabilizeExecuteState(executeState);
  appendOpsAutoStabilizeExecuteAudit({
    ok,
    include_run_now: params.include_run_now,
    source_inbox_id: sourceInboxId,
    summary: executeState.last_result_summary,
  });

  return {
    action: "ops_auto_stabilize_execute_safe_run",
    dry_run: false,
    include_run_now: params.include_run_now,
    ok,
    skipped_reason: "",
    results,
    note: "",
  };
}

function runOpsAutoStabilizeMonitorTick(): void {
  const settings = loadOpsAutoStabilizeSettings();
  const state = loadOpsAutoStabilizeState();
  state.last_check_at = nowIso();
  if (!settings.enabled) {
    saveOpsAutoStabilizeState(state);
    return;
  }
  if (!state.enabled_effective) {
    saveOpsAutoStabilizeState(state);
    return;
  }
  const lock = tryAcquireOpsAutoStabilizeLock(settings.safety.lock_stale_sec);
  if (!lock.acquired) return;
  try {
    const status = buildOpsQuickActionsStatus() as any;
    const reasons: string[] = [];
    if (settings.trigger_rules.brake_detect) {
      const brakes = Array.isArray(status.brakes) ? status.brakes : [];
      for (const b of brakes) {
        if (b && b.enabled_effective === false) reasons.push(`brake:${String(b.name || "")}`);
      }
    }
    if (settings.trigger_rules.stale_lock_detect) {
      const locks = Array.isArray(status.locks) ? status.locks : [];
      for (const l of locks) {
        if (!l || l.exists !== true) continue;
        const age = Math.floor(Number(l.age_sec || 0));
        if (age > settings.thresholds.stale_lock_sec) reasons.push(`stale_lock:${String(l.name || "")}`);
      }
    }
    if (settings.trigger_rules.failure_detect) {
      const hs = loadHeartbeatState();
      const cs = loadConsolidationState();
      const ms = loadMorningBriefState();
      const ss = loadHeartbeatAutopilotSuggestState();
      const hbFail = Math.floor(Number(hs.per_target?.["facilitator::episodes"]?.failure_count || 0));
      const csFail = Math.floor(Number(cs.failure_count || 0));
      const msFail = Math.floor(Number(ms.failure_count || 0));
      const ssFail = Math.floor(Number(ss.failure_count || 0));
      if (hbFail >= settings.thresholds.failure_count_warn) reasons.push("failure:heartbeat");
      if (csFail >= settings.thresholds.failure_count_warn) reasons.push("failure:consolidation");
      if (msFail >= settings.thresholds.failure_count_warn) reasons.push("failure:morning_brief");
      if (ssFail >= settings.thresholds.failure_count_warn) reasons.push("failure:suggest");
    }
    const hasBrakeOrStaleReason = reasons.some((r) => r.startsWith("brake:") || r.startsWith("stale_lock:"));
    if (!reasons.length) {
      state.last_reason = "";
      saveOpsAutoStabilizeState(state);
      return;
    }
    const nowMs = Date.now();
    const lastTriggerMs = state.last_trigger_at ? new Date(state.last_trigger_at).getTime() : 0;
    const localDate = localDateYmd(new Date());
    if (state.last_trigger_local_date !== localDate) {
      state.last_trigger_local_date = localDate;
      state.trigger_count_today = 0;
    }
    if (lastTriggerMs > 0 && nowMs - lastTriggerMs < settings.cooldown_sec * 1000) {
      state.last_reason = "cooldown_active";
      saveOpsAutoStabilizeState(state);
      return;
    }
    if (state.trigger_count_today >= settings.max_per_day) {
      state.last_reason = "max_per_day_reached";
      saveOpsAutoStabilizeState(state);
      return;
    }
    const out = runOpsAutoStabilizeDryRunNow("ops_auto_stabilize", { skip_lock: true });
    const sourceInboxId = clipText((out as any).source_inbox_id, 120).trim();
    Object.assign(state, loadOpsAutoStabilizeState());

    if (state.last_trigger_local_date !== localDate) {
      state.last_trigger_local_date = localDate;
      state.trigger_count_today = 0;
      state.auto_execute_count_today = 0;
    }
    state.last_trigger_at = nowIso();
    state.trigger_count_today += 1;

    let autoExecuteAttempted = false;
    if (settings.auto_execute.enabled && hasBrakeOrStaleReason) {
      const executeState = loadOpsAutoStabilizeExecuteState();
      const execDate = localDateYmd(new Date());
      if (executeState.last_local_date !== execDate) {
        executeState.last_local_date = execDate;
        executeState.execute_count_today = 0;
      }
      if (state.last_trigger_local_date !== execDate) {
        state.last_trigger_local_date = execDate;
        state.auto_execute_count_today = 0;
      }
      const lastAutoExecuteMs = state.last_auto_execute_at ? new Date(state.last_auto_execute_at).getTime() : 0;
      const autoCooldownActive = lastAutoExecuteMs > 0 && (Date.now() - lastAutoExecuteMs < settings.auto_execute.cooldown_sec * 1000);
      const autoMaxPerDayReached = state.auto_execute_count_today >= settings.auto_execute.max_per_day;
      const autoIdempotent = !!sourceInboxId && executeState.executed_source_inbox_ids.includes(sourceInboxId);
      const serverToken = issueConfirmTokenForServer();
      const serverTokenOk = validateConfirmTokenForServer(serverToken);
      if (!autoCooldownActive && !autoMaxPerDayReached && !autoIdempotent && serverTokenOk) {
        autoExecuteAttempted = true;
        const execOut = runOpsAutoStabilizeExecuteSafeRun({
          dry_run: false,
          include_run_now: false,
          source_inbox_id: sourceInboxId,
        });
        const execOk = execOut.ok === true && !String(execOut.skipped_reason || "");
        state.last_auto_execute_at = nowIso();
        state.auto_execute_count_today += 1;
        state.last_auto_execute_ok = execOk;
        state.last_auto_execute_note = clipText(
          execOk
            ? `auto_execute_ok:${reasons.join(",")}`
            : `auto_execute_failed:${String(execOut.skipped_reason || "unknown")}`,
          600,
        );
        if (execOk) {
          state.failure_count = 0;
          appendOpsAutoStabilizeAutoExecuteAudit({
            ok: true,
            reason: reasons.join(","),
            source_inbox_id: sourceInboxId,
            summary: clipText(JSON.stringify(execOut).slice(0, 400), 400),
            mention: false,
          });
        } else {
          state.failure_count += 1;
          appendOpsAutoStabilizeAutoExecuteAudit({
            ok: false,
            reason: reasons.join(","),
            source_inbox_id: sourceInboxId,
            summary: clipText(JSON.stringify(execOut).slice(0, 400), 400),
            mention: settings.mention_on_trigger,
          });
        }
      } else {
        const reason = autoCooldownActive
          ? "auto_execute_cooldown_active"
          : autoMaxPerDayReached
            ? "auto_execute_max_per_day_reached"
            : autoIdempotent
              ? "auto_execute_idempotent"
              : !serverTokenOk
                ? "auto_execute_confirm_unavailable"
                : "auto_execute_guard_blocked";
        state.last_auto_execute_ok = true;
        state.last_auto_execute_note = reason;
      }
    } else {
      state.last_auto_execute_note = settings.auto_execute.enabled
        ? "auto_execute_guard_missing_brake_or_stale_lock"
        : "auto_execute_disabled";
    }

    if (state.failure_count >= settings.safety.max_consecutive_failures) {
      state.enabled_effective = false;
      appendOpsQuickActionsAuditInbox({
        title: "Auto-stabilize stopped",
        body: clipText(`auto-stabilize stopped due to consecutive failures (${state.failure_count})`, 500),
        mention: true,
        links: { source: "ops_auto_stabilize" },
      });
    }
    state.last_reason = clipText(reasons.join(","), 300);
    state.last_result_ok = out.ok === true;
    state.last_result_summary = clipText(
      `${clipText(JSON.stringify(out).slice(0, 320), 320)}; auto_execute_attempted=${autoExecuteAttempted}`,
      600,
    );
    saveOpsAutoStabilizeState(state);
  } catch (e: any) {
    state.failure_count += 1;
    state.last_reason = clipText(`monitor_error:${String(e?.message || "unknown")}`, 300);
    if (state.failure_count >= settings.safety.max_consecutive_failures) {
      state.enabled_effective = false;
      appendOpsQuickActionsAuditInbox({
        title: "Auto-stabilize stopped",
        body: clipText(`auto-stabilize stopped due to monitor failures (${state.failure_count})`, 500),
        mention: true,
        links: { source: "ops_auto_stabilize" },
      });
    }
    saveOpsAutoStabilizeState(state);
  } finally {
    releaseOpsAutoStabilizeLockIfOwned();
  }
}

function writeBinaryAtomic(p: string, data: Buffer): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, p);
}

function runInboxCompact(maxLinesInput: number, dryRun: boolean, timeoutMs = 5000): { action: string; compacted: boolean; archived_lines: number; kept_lines: number; dry_run: boolean; exit_code: number; note?: string } {
  const started = Date.now();
  const maxLines = Math.max(1, Math.min(200000, Number(maxLinesInput || 5000)));
  const baseResult = {
    action: "inbox_compact",
    compacted: false,
    archived_lines: 0,
    kept_lines: 0,
    dry_run: !!dryRun,
    exit_code: 1,
  };

  if (!fs.existsSync(INBOX_PATH)) {
    return { ...baseResult, kept_lines: 0, exit_code: 0, note: "inbox_missing" };
  }

  const raw = fs.readFileSync(INBOX_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (Date.now() - started > timeoutMs) {
    return { ...baseResult, kept_lines: Math.min(lines.length, maxLines), exit_code: 1, note: "timeout" };
  }
  if (lines.length <= maxLines) {
    return { ...baseResult, kept_lines: lines.length, exit_code: 0, note: "within_limit" };
  }

  const archivedCount = lines.length - maxLines;
  const archived = lines.slice(0, archivedCount);
  const kept = lines.slice(archivedCount);
  if (dryRun) {
    return { ...baseResult, compacted: true, archived_lines: archivedCount, kept_lines: kept.length, exit_code: 0, note: "dry_run" };
  }

  if (Date.now() - started > timeoutMs) {
    return { ...baseResult, kept_lines: kept.length, archived_lines: archivedCount, exit_code: 1, note: "timeout" };
  }

  const archiveDir = path.join(DESKTOP_DIR, "archive");
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
  const archivePath = path.join(archiveDir, `inbox_${stamp}.jsonl.gz`);
  const archiveContent = `${archived.join("\n")}\n`;
  const gz = zlib.gzipSync(Buffer.from(archiveContent, "utf8"));
  writeBinaryAtomic(archivePath, gz);

  const inboxTmp = `${INBOX_PATH}.tmp`;
  fs.writeFileSync(inboxTmp, `${kept.join("\n")}\n`, "utf8");
  fs.renameSync(inboxTmp, INBOX_PATH);

  if (Date.now() - started > timeoutMs) {
    return { ...baseResult, compacted: true, archived_lines: archivedCount, kept_lines: kept.length, exit_code: 1, note: "timeout_after_write" };
  }
  return { ...baseResult, compacted: true, archived_lines: archivedCount, kept_lines: kept.length, exit_code: 0 };
}

function mergeDesktopSettings(base: DesktopSettings, patchInput: unknown): DesktopSettings {
  if (!isRecord(patchInput)) return base;
  const patch = patchInput as Record<string, unknown>;
  const next: DesktopSettings = JSON.parse(JSON.stringify(base));

  if (patch.api_base_url !== undefined) {
    if (typeof patch.api_base_url !== "string") throw new Error("settings.api_base_url_type_invalid");
    next.api_base_url = patch.api_base_url.trim();
  }
  if (patch.poll_interval_ms !== undefined) {
    if (typeof patch.poll_interval_ms !== "number" || !Number.isFinite(patch.poll_interval_ms)) throw new Error("settings.poll_interval_ms_type_invalid");
    next.poll_interval_ms = Math.max(1000, Math.floor(patch.poll_interval_ms));
  }
  if (patch.throttle_sec !== undefined) {
    if (typeof patch.throttle_sec !== "number" || !Number.isFinite(patch.throttle_sec)) throw new Error("settings.throttle_sec_type_invalid");
    next.throttle_sec = Math.max(1, Math.floor(patch.throttle_sec));
  }

  if (patch.mention !== undefined) {
    if (!isRecord(patch.mention)) throw new Error("settings.mention_type_invalid");
    const mention = patch.mention as Record<string, unknown>;
    if (mention.enabled !== undefined) {
      if (typeof mention.enabled !== "boolean") throw new Error("settings.mention.enabled_type_invalid");
      next.mention.enabled = mention.enabled;
    }
    if (mention.tokens !== undefined) {
      if (!Array.isArray(mention.tokens) || mention.tokens.some((x) => typeof x !== "string")) throw new Error("settings.mention.tokens_type_invalid");
      next.mention.tokens = mention.tokens.map((x) => String(x)).filter((x) => x.trim().length > 0);
    }
    if (mention.aliases !== undefined) {
      if (!isRecord(mention.aliases)) throw new Error("settings.mention.aliases_type_invalid");
      const aliases: Record<string, string> = {};
      for (const [k, v] of Object.entries(mention.aliases)) {
        if (typeof v !== "string") throw new Error("settings.mention.aliases_value_type_invalid");
        aliases[String(k)] = v;
      }
      next.mention.aliases = aliases;
    }
    if (mention.priority_throttle_sec !== undefined) {
      if (typeof mention.priority_throttle_sec !== "number" || !Number.isFinite(mention.priority_throttle_sec)) throw new Error("settings.mention.priority_throttle_sec_type_invalid");
      next.mention.priority_throttle_sec = Math.max(1, Math.floor(mention.priority_throttle_sec));
    }
    if (mention.normal_throttle_sec !== undefined) {
      if (typeof mention.normal_throttle_sec !== "number" || !Number.isFinite(mention.normal_throttle_sec)) throw new Error("settings.mention.normal_throttle_sec_type_invalid");
      next.mention.normal_throttle_sec = Math.max(1, Math.floor(mention.normal_throttle_sec));
    }
  }

  if (patch.hotkeys !== undefined) {
    if (!isRecord(patch.hotkeys)) throw new Error("settings.hotkeys_type_invalid");
    const hotkeys = patch.hotkeys as Record<string, unknown>;
    const keys: Array<keyof DesktopSettings["hotkeys"]> = ["focus_chatgpt", "send_confirm", "capture_last", "focus_region"];
    for (const key of keys) {
      if (hotkeys[key] === undefined) continue;
      if (typeof hotkeys[key] !== "string") throw new Error(`settings.hotkeys.${key}_type_invalid`);
      next.hotkeys[key] = String(hotkeys[key]);
    }
  }

  return next;
}

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
      const size = chunks.reduce((n, x) => n + x.length, 0);
      if (size > FILE_CAP) reject(new Error("payload_too_large"));
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        if (!raw) return resolve({});
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeRelPath(input: string): { ok: boolean; normalized?: string; reason?: string } {
  const p = String(input || "").replaceAll("\\", "/").trim();
  if (!p) return { ok: false, reason: "missing_path" };
  if (path.isAbsolute(p) || /^[A-Za-z]:/.test(p) || p.startsWith("//")) return { ok: false, reason: "absolute_path_rejected" };
  const normalized = path.posix.normalize(p);
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized === ".." || normalized.includes("/../") || normalized.startsWith("/")) {
    return { ok: false, reason: "traversal_rejected" };
  }
  return { ok: true, normalized };
}

function resolveRunFilesPath(runId: string, relPath: string): { ok: boolean; abs?: string; normalized?: string; reason?: string } {
  const runDir = path.join(RUNS_DIR, runId);
  const filesDir = path.join(runDir, "files");
  const n = normalizeRelPath(relPath);
  if (!n.ok || !n.normalized) return { ok: false, reason: n.reason || "invalid_path" };
  const abs = path.resolve(filesDir, n.normalized);
  const base = path.resolve(filesDir);
  const rel = path.relative(base, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return { ok: false, reason: "outside_run_files" };
  return { ok: true, abs, normalized: n.normalized };
}

function listRuns(limit: number): any[] {
  if (!fs.existsSync(RUNS_DIR)) return [];
  const dirs = fs.readdirSync(RUNS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  const rows = dirs.map((d) => {
    const runId = d.name;
    const runPath = path.join(RUNS_DIR, runId);
    const st = fs.statSync(runPath);
    return { run_id: runId, updated_at: new Date(st.mtimeMs).toISOString() };
  });
  rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return rows.slice(0, Math.max(1, Math.min(limit, 200)));
}

function loadRunArtifacts(runId: string): any {
  const p = path.join(RUNS_DIR, runId, "artifacts.json");
  return readJson(p, {});
}

function loadRunResultYaml(runId: string): any {
  const eventsDir = path.join(WORKSPACE, "queue", "events");
  if (!fs.existsSync(eventsDir)) return {};
  const names = fs.readdirSync(eventsDir).filter((x) => x.includes(runId) && x.startsWith("result_") && x.endsWith(".yaml"));
  if (!names.length) return {};
  names.sort();
  const full = path.join(eventsDir, names[names.length - 1]);
  try {
    return YAML.parse(fs.readFileSync(full, "utf8")) || {};
  } catch {
    return {};
  }
}

function readFilePreview(absPath: string): { text: string; truncated: boolean } {
  const raw = fs.readFileSync(absPath);
  const truncated = raw.length > FILE_CAP;
  const clipped = truncated ? raw.subarray(0, FILE_CAP) : raw;
  return { text: clipped.toString("utf8"), truncated };
}

function readZipEntries(absPath: string): { entries: string[]; truncated: boolean; total_entries?: number; note?: string } {
  const raw = fs.readFileSync(absPath);
  if (raw.length < 22) throw new Error("zip_too_small");
  const EOCD = 0x06054b50;
  const CEN = 0x02014b50;
  const searchStart = Math.max(0, raw.length - (0xffff + 22));
  let eocd = -1;
  for (let i = raw.length - 22; i >= searchStart; i -= 1) {
    if (raw.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("eocd_not_found");
  const total = raw.readUInt16LE(eocd + 10);
  const cenOffset = raw.readUInt32LE(eocd + 16);
  if (cenOffset >= raw.length) throw new Error("central_dir_invalid");

  let pos = cenOffset;
  let readCount = 0;
  const entries: string[] = [];
  let truncated = false;
  while (pos + 46 <= raw.length) {
    if (raw.readUInt32LE(pos) !== CEN) break;
    const flags = raw.readUInt16LE(pos + 8);
    const nameLen = raw.readUInt16LE(pos + 28);
    const extraLen = raw.readUInt16LE(pos + 30);
    const commentLen = raw.readUInt16LE(pos + 32);
    const recLen = 46 + nameLen + extraLen + commentLen;
    if (pos + recLen > raw.length) break;
    const name = raw.subarray(pos + 46, pos + 46 + nameLen).toString((flags & 0x0800) !== 0 ? "utf8" : "latin1");
    if (entries.length < ZIP_ENTRIES_CAP) {
      entries.push(name.slice(0, ZIP_ENTRY_MAX));
    } else {
      truncated = true;
    }
    readCount += 1;
    pos += recLen;
    if (readCount >= total) break;
  }
  return { entries, truncated, total_entries: total, note: truncated ? "entries_truncated" : "" };
}

function readThreads(): Thread[] {
  const rows = readJson<Thread[]>(THREADS_PATH, []);
  if (!Array.isArray(rows)) return [];
  return rows;
}

function writeThreads(rows: Thread[]): void {
  writeJson(THREADS_PATH, rows);
}

function threadMessagesPath(threadId: string): string {
  const safe = String(threadId || "").replace(/[^A-Za-z0-9_.-]/g, "_");
  return path.join(CHAT_DIR, `${safe}.jsonl`);
}

function appendMessage(msg: ChatMessage): void {
  const p = threadMessagesPath(msg.thread_id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(msg) + "\n", "utf8");
}

function readMessages(threadId: string, limit: number): ChatMessage[] {
  const p = threadMessagesPath(threadId);
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean);
  const rows: ChatMessage[] = [];
  for (const line of lines) {
    try { rows.push(JSON.parse(line)); } catch { }
  }
  return rows.slice(-Math.max(1, Math.min(limit, CHAT_LIMIT_MAX)));
}

function readMessagesAfter(threadId: string, limit: number, afterId: string): ChatMessage[] {
  const rows = readMessages(threadId, CHAT_LIMIT_MAX);
  if (!afterId) return rows.slice(-Math.max(1, Math.min(limit, CHAT_LIMIT_MAX)));
  const idx = rows.findIndex((r) => r.id === afterId);
  const start = idx >= 0 ? idx + 1 : Math.max(0, rows.length - Math.max(1, Math.min(limit, CHAT_LIMIT_MAX)));
  return rows.slice(start, start + Math.max(1, Math.min(limit, CHAT_LIMIT_MAX)));
}

function readPins(): PinState {
  const obj = readJson<PinState>(PINS_PATH, {});
  return obj && typeof obj === "object" ? obj : {};
}

function writePins(pins: PinState): void {
  writeJson(PINS_PATH, pins);
}

function readReadState(): ReadState {
  const obj = readJson<ReadState>(UNREAD_PATH, {});
  return obj && typeof obj === "object" ? obj : {};
}

function writeReadState(state: ReadState): void {
  writeJson(UNREAD_PATH, state);
}

function searchChatAll(q: string): any[] {
  const query = String(q || "").toLowerCase();
  if (!query) return [];
  const hits: any[] = [];
  const files = fs.existsSync(CHAT_DIR)
    ? fs.readdirSync(CHAT_DIR).filter((f) => f.endsWith(".jsonl"))
    : [];
  for (const name of files) {
    const threadId = name.replace(/\.jsonl$/i, "");
    const rows = readMessages(threadId, CHAT_LIMIT_MAX);
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const msg = rows[i];
      if (String(msg.text || "").toLowerCase().includes(query)) {
        hits.push({
          scope: "message",
          thread_id: threadId,
          msg_id: msg.id,
          role: msg.role,
          text: String(msg.text || "").slice(0, 240),
          created_at: msg.created_at,
        });
        if (hits.length >= 200) return hits;
      }
    }
  }
  return hits;
}

function updateThreadTimestamp(threadId: string): void {
  const now = nowIso();
  const threads = readThreads();
  const idx = threads.findIndex((t) => t.id === threadId);
  if (idx >= 0) {
    threads[idx].updated_at = now;
  } else {
    threads.push({ id: threadId, title: threadId, updated_at: now });
  }
  writeThreads(threads);
}

function loadClipboard(): any[] {
  const obj = readJson<{ items?: any[] }>(CLIPBOARD_PATH, { items: [] });
  return Array.isArray(obj.items) ? obj.items : [];
}

function saveClipboard(items: any[]): void {
  const clipped = items.slice(-CLIPBOARD_MAX);
  writeJson(CLIPBOARD_PATH, { items: clipped });
}

function parseUrl(req: http.IncomingMessage): URL {
  return new URL(req.url || "/", `http://${req.headers.host || `${API_HOST}:${API_PORT}`}`);
}

function jsonOk(data: any): any {
  return { ok: true, data };
}

function replaceMetadataIdInYaml(raw: string, taskId: string): string {
  return raw.replace(/(^\s*id\s*:\s*)([^\r\n]+)/m, `$1${taskId}`);
}

function loadEvidenceExportRequests(): EvidenceExportRequestRecord[] {
  const raw = readJson<{ items?: unknown[] }>(EVIDENCE_EXPORT_REQUESTS_PATH, { items: [] });
  const items = Array.isArray(raw.items) ? raw.items : [];
  const out: EvidenceExportRequestRecord[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const request_id = String(item.request_id || "").trim();
    const task_id = String(item.task_id || "").trim();
    const queued_path = String(item.queued_path || "").trim();
    const created_at = String(item.created_at || "").trim();
    const max_runs = Number(item.max_runs || 20);
    const include_archives = Boolean(item.include_archives);
    if (!request_id || !task_id || !queued_path || !created_at) continue;
    out.push({
      request_id,
      task_id,
      queued_path,
      created_at,
      max_runs: Number.isFinite(max_runs) ? Math.max(1, Math.min(EVIDENCE_EXPORT_MAX_RUNS, Math.floor(max_runs))) : 20,
      include_archives,
    });
  }
  return out.slice(-200);
}

function saveEvidenceExportRequests(items: EvidenceExportRequestRecord[]): void {
  writeJsonAtomic(EVIDENCE_EXPORT_REQUESTS_PATH, { items: items.slice(-200) });
}

function loadEvidenceExportTrackingEntries(): EvidenceExportTrackingEntry[] {
  const raw = readJson<{ items?: unknown[] }>(EVIDENCE_EXPORT_TRACKING_PATH, { items: [] });
  const items = Array.isArray(raw.items) ? raw.items : [];
  const out: EvidenceExportTrackingEntry[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const request_id = String(item.request_id || "").trim();
    const queued_at = String(item.queued_at || "").trim();
    const statusRaw = String(item.status || "queued").toLowerCase();
    const status: EvidenceExportTrackingEntry["status"] =
      statusRaw === "running" || statusRaw === "completed" || statusRaw === "failed"
        ? statusRaw
        : statusRaw === "started"
          ? "running"
          : "queued";
    if (!request_id || !queued_at) continue;
    out.push({
      request_id,
      queued_at,
      status,
      run_id: String(item.run_id || ""),
      notified: item.notified === true,
      bundle_zip_path: String(item.bundle_zip_path || ""),
      bundle_manifest_path: String(item.bundle_manifest_path || ""),
      task_id: String(item.task_id || ""),
      last_checked_at: String(item.last_checked_at || ""),
      notified_at: String(item.notified_at || ""),
    });
    if (out.length >= EVIDENCE_EXPORT_TRACKING_LIMIT_MAX) break;
  }
  return out;
}

function saveEvidenceExportTrackingEntries(items: EvidenceExportTrackingEntry[]): void {
  writeJsonAtomic(EVIDENCE_EXPORT_TRACKING_PATH, { items: items.slice(-EVIDENCE_EXPORT_TRACKING_LIMIT_MAX) });
}

function addEvidenceExportTrackingEntry(entry: EvidenceExportTrackingEntry): void {
  const items = loadEvidenceExportTrackingEntries();
  items.push(entry);
  saveEvidenceExportTrackingEntries(items);
}

function getEvidenceExportTrackingByRequest(requestId: string): EvidenceExportTrackingEntry | null {
  const id = String(requestId || "").trim();
  if (!id) return null;
  const items = loadEvidenceExportTrackingEntries().filter((x) => x.request_id === id);
  if (!items.length) return null;
  items.sort((a, b) => (a.queued_at < b.queued_at ? 1 : -1));
  return items[0];
}

function buildEvidenceExportInputs(maxRuns: number, includeArchives: boolean): { inputs: string[]; run_ids: string[] } {
  const runRows = listRuns(Math.max(1, Math.min(EVIDENCE_EXPORT_MAX_RUNS, maxRuns)));
  const run_ids = runRows.map((r) => String(r.run_id || "")).filter((x) => !!x);
  const fixedInputs = [
    "ui/chat/threads.json",
    "ui/chat/*.jsonl",
    "ui/chat/pins.json",
    "ui/chat/unread.json",
    "ui/chat/bookmarks.json",
    "ui/desktop/desktop_settings.json",
    "ui/desktop/notify_state.json",
    "ui/desktop/inbox.jsonl",
    "ui/desktop/inbox_read_state.json",
    "ui/taskify/drafts.jsonl",
    "ui/taskify/queue_tracking.json",
    "runs/**/files/written/generated/evidence_seed.txt",
  ];
  if (includeArchives) fixedInputs.push("ui/desktop/archive/**");
  for (const runId of run_ids) {
    fixedInputs.push(`runs/${runId}/_meta/**`);
    fixedInputs.push(`runs/${runId}/result.json`);
    fixedInputs.push(`runs/${runId}/artifacts.json`);
  }
  return { inputs: Array.from(new Set(fixedInputs)), run_ids };
}

function findEvidenceExportRun(
  taskId: string,
  requestId: string,
): { run_id: string; status: "running" | "completed" | "failed"; bundle_zip_path: string; bundle_manifest_path: string } | null {
  const runs = listRuns(120);
  for (const r of runs) {
    const runId = String(r.run_id || "");
    if (!runId) continue;
    const metaTask = path.join(RUNS_DIR, runId, "_meta", "task.yaml");
    let taskText = "";
    try { taskText = fs.readFileSync(metaTask, "utf8"); } catch { taskText = ""; }
    if (!taskText.includes(taskId) && !taskText.includes(requestId)) continue;
    const result = loadRunResultYaml(runId);
    const resultStatus = String((result as any)?.metadata?.status || "").toLowerCase();
    let status: "running" | "completed" | "failed" = "running";
    if (resultStatus === "success") status = "completed";
    if (resultStatus === "failed") status = "failed";
    const artifacts = loadRunArtifacts(runId);
    const files: string[] = Array.isArray(artifacts?.files) ? artifacts.files.map((x: unknown) => String(x)) : [];
    const bundle_zip_path = files.find((x: string) => /bundles\/evidence_.*\.zip$/i.test(x)) || "";
    const bundle_manifest_path = files.find((x: string) => /bundles\/evidence_.*_manifest\.json$/i.test(x)) || "";
    return { run_id: runId, status, bundle_zip_path, bundle_manifest_path };
  }
  return null;
}

function runEvidenceExportTrackingSweep(): void {
  const entries = loadEvidenceExportTrackingEntries();
  if (!entries.length) return;
  const reqRows = loadEvidenceExportRequests();
  const reqMap = new Map<string, EvidenceExportRequestRecord>();
  for (const item of reqRows) reqMap.set(item.request_id, item);

  let changed = false;
  for (const entry of entries) {
    const shouldCheck = entry.status === "queued" || entry.status === "running" || !entry.notified;
    if (!shouldCheck) continue;

    const req = reqMap.get(entry.request_id);
    if (!entry.task_id && req?.task_id) {
      entry.task_id = req.task_id;
      changed = true;
    }
    const taskId = String(entry.task_id || req?.task_id || "").trim();
    if (!taskId) continue;

    const run = findEvidenceExportRun(taskId, entry.request_id);
    if (!run) continue;
    if (entry.run_id !== run.run_id) {
      entry.run_id = run.run_id;
      changed = true;
    }
    if (entry.status !== run.status) {
      entry.status = run.status;
      changed = true;
    }
    if (entry.bundle_zip_path !== run.bundle_zip_path) {
      entry.bundle_zip_path = run.bundle_zip_path;
      changed = true;
    }
    if (entry.bundle_manifest_path !== run.bundle_manifest_path) {
      entry.bundle_manifest_path = run.bundle_manifest_path;
      changed = true;
    }

    if ((entry.status === "completed" || entry.status === "failed") && !entry.notified) {
      try {
        const appended = appendEvidenceExportInboxEntry({
          request_id: entry.request_id,
          run_id: entry.run_id,
          status: entry.status,
          bundle_zip_path: entry.bundle_zip_path,
          bundle_manifest_path: entry.bundle_manifest_path,
        });
        if (appended || inboxHasRequestNotification("export_evidence_bundle", entry.request_id)) {
          entry.notified = true;
          entry.notified_at = nowIso();
          changed = true;
        }
      } catch {
        // best-effort only; keep tracker alive
      }
    }
  }
  if (changed) saveEvidenceExportTrackingEntries(entries);
}

function ymdHmsStamp(d = new Date()): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

function loadOpsSnapshotRequests(): OpsSnapshotRequestRecord[] {
  const raw = readJson<{ items?: unknown[] }>(OPS_SNAPSHOT_REQUESTS_PATH, { items: [] });
  const items = Array.isArray(raw.items) ? raw.items : [];
  const out: OpsSnapshotRequestRecord[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const request_id = String(item.request_id || "").trim();
    const task_id = String(item.task_id || "").trim();
    const queued_path = String(item.queued_path || "").trim();
    const created_at = String(item.created_at || "").trim();
    const inbox_limit = Number(item.inbox_limit || 20);
    const runs_limit = Number(item.runs_limit || 10);
    if (!request_id || !task_id || !queued_path || !created_at) continue;
    out.push({
      request_id,
      task_id,
      queued_path,
      created_at,
      inbox_limit: Number.isFinite(inbox_limit) ? Math.max(1, Math.min(200, Math.floor(inbox_limit))) : 20,
      runs_limit: Number.isFinite(runs_limit) ? Math.max(1, Math.min(50, Math.floor(runs_limit))) : 10,
    });
    if (out.length >= OPS_SNAPSHOT_LIMIT_MAX) break;
  }
  return out.slice(-OPS_SNAPSHOT_LIMIT_MAX);
}

function saveOpsSnapshotRequests(items: OpsSnapshotRequestRecord[]): void {
  writeJsonAtomic(OPS_SNAPSHOT_REQUESTS_PATH, { items: items.slice(-OPS_SNAPSHOT_LIMIT_MAX) });
}

function loadOpsSnapshotTrackingEntries(): OpsSnapshotTrackingEntry[] {
  const raw = readJson<{ items?: unknown[] }>(OPS_SNAPSHOT_TRACKING_PATH, { items: [] });
  const items = Array.isArray(raw.items) ? raw.items : [];
  const out: OpsSnapshotTrackingEntry[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const request_id = String(item.request_id || "").trim();
    const queued_at = String(item.queued_at || "").trim();
    const statusRaw = String(item.status || "queued").toLowerCase();
    const status: OpsSnapshotTrackingEntry["status"] =
      statusRaw === "running" || statusRaw === "completed" || statusRaw === "failed"
        ? statusRaw
        : statusRaw === "started"
          ? "running"
          : "queued";
    if (!request_id || !queued_at) continue;
    out.push({
      request_id,
      queued_at,
      status,
      run_id: String(item.run_id || ""),
      notified: item.notified === true,
      snapshot_path: String(item.snapshot_path || ""),
      note: String(item.note || ""),
      last_checked_at: String(item.last_checked_at || ""),
      notified_at: String(item.notified_at || ""),
      task_id: String(item.task_id || ""),
    });
    if (out.length >= OPS_SNAPSHOT_TRACKING_LIMIT_MAX) break;
  }
  return out;
}

function saveOpsSnapshotTrackingEntries(items: OpsSnapshotTrackingEntry[]): void {
  writeJsonAtomic(OPS_SNAPSHOT_TRACKING_PATH, { items: items.slice(-OPS_SNAPSHOT_TRACKING_LIMIT_MAX) });
}

function addOpsSnapshotTrackingEntry(entry: OpsSnapshotTrackingEntry): void {
  const items = loadOpsSnapshotTrackingEntries();
  items.push(entry);
  saveOpsSnapshotTrackingEntries(items);
}

function getOpsSnapshotTrackingByRequest(requestId: string): OpsSnapshotTrackingEntry | null {
  const id = String(requestId || "").trim();
  if (!id) return null;
  const items = loadOpsSnapshotTrackingEntries().filter((x) => x.request_id === id);
  if (!items.length) return null;
  items.sort((a, b) => (a.queued_at < b.queued_at ? 1 : -1));
  return items[0];
}

function parseOpsSnapshotMetaFromTaskYaml(taskYamlPath: string): { request_id?: string } {
  if (!fs.existsSync(taskYamlPath)) return {};
  try {
    const parsed = YAML.parse(fs.readFileSync(taskYamlPath, "utf8"));
    if (!isRecord(parsed)) return {};
    let request_id = "";
    if (isRecord(parsed.runtime) && isRecord(parsed.runtime.meta)) {
      request_id = String(parsed.runtime.meta.ops_snapshot_request_id || "");
    }
    if (!request_id && isRecord(parsed.metadata) && Array.isArray(parsed.metadata.tags)) {
      const tags = parsed.metadata.tags.map((x) => String(x));
      const found = tags.find((t) => t.startsWith("ops_snapshot_request_id:"));
      request_id = found ? found.slice("ops_snapshot_request_id:".length) : "";
    }
    return { request_id };
  } catch {
    return {};
  }
}

function extractMarkdownSectionLine(text: string, header: string): string {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^##\\s*${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s+|$)`, "m").exec(text);
  if (!m) return "";
  const block = String(m[1] || "");
  const line = block.split(/\r?\n/).map((x) => x.trim()).find((x) => x.startsWith("- "));
  return line ? line.slice(2).trim() : "";
}

function readLatestDesignId(): string {
  try {
    const raw = fs.readFileSync(DESIGN_LATEST_PATH, "utf8").trim();
    if (!raw) return "";
    const rel = raw.split("|")[0].trim().replaceAll("\\", "/");
    const base = path.posix.basename(rel);
    return base.endsWith(".md") ? base.slice(0, -3) : base;
  } catch {
    return "";
  }
}

function summarizeRunArtifacts(files: string[]): string {
  const picked = files
    .filter((x) => /(^_meta\/result\.json$|^_meta\/task\.yaml$|^bundles\/|^written\/)/i.test(x))
    .slice(0, 3);
  return picked.join(", ");
}

function buildOpsSnapshotMarkdown(input: { inbox_limit: number; runs_limit: number }): { text: string; missing_sections: string[] } {
  const missing: string[] = [];
  const whiteboardRaw = fs.existsSync(WHITEBOARD_PATH) ? fs.readFileSync(WHITEBOARD_PATH, "utf8") : "";
  if (!whiteboardRaw) missing.push("whiteboard_file_missing");
  const whiteboardNow = extractMarkdownSectionLine(whiteboardRaw, "Now");
  const whiteboardDoD = extractMarkdownSectionLine(whiteboardRaw, "DoD");
  if (!whiteboardNow) missing.push("whiteboard_now_missing");
  if (!whiteboardDoD) missing.push("whiteboard_dod_missing");
  const mLastDesign = /^\s*-\s*last_design_id\s*:\s*(.+)\s*$/im.exec(whiteboardRaw);
  const whiteboardLastDesign = mLastDesign ? String(mLastDesign[1] || "").trim() : "";
  if (!whiteboardLastDesign) missing.push("whiteboard_last_design_id_missing");

  const latestDesignId = readLatestDesignId();
  if (!latestDesignId) missing.push("latest_design_id_missing");

  const inboxItems = readInboxItems(Math.max(1, Math.min(200, input.inbox_limit)), "").items;
  const inboxMentions = inboxItems.filter((x) => !!x.mention).slice(0, 10);

  const taskifyRows = loadTaskifyTrackingEntries()
    .slice()
    .sort((a, b) => (String(a.queued_at || "") < String(b.queued_at || "") ? 1 : -1))
    .slice(0, 10);

  const runRows = listRuns(Math.max(1, Math.min(50, input.runs_limit)));
  const runLines: string[] = [];
  for (const r of runRows.slice(0, input.runs_limit)) {
    const runId = String(r.run_id || "");
    const result = loadRunResultYaml(runId);
    const status = String(result?.metadata?.status || "");
    const errCode = Array.isArray(result?.outcome?.errors) && result.outcome.errors[0]
      ? String(result.outcome.errors[0].code || "")
      : "";
    const artifacts = loadRunArtifacts(runId);
    const files: string[] = Array.isArray(artifacts?.files) ? artifacts.files.map((x: unknown) => String(x)) : [];
    runLines.push(`- ${runId} | status=${status || "-"} | error_code=${errCode || "-"} | artifacts=${summarizeRunArtifacts(files) || "-"}`);
  }

  const lines: string[] = [
    "# Ops Snapshot",
    "",
    `- Timestamp: ${nowIso()}`,
    `- repo_root: ${REPO_ROOT.replaceAll("\\", "/")}`,
    `- workspace_root: ${WORKSPACE.replaceAll("\\", "/")}`,
    "",
    "## Whiteboard",
    `- Now: ${whiteboardNow || "-"}`,
    `- DoD: ${whiteboardDoD || "-"}`,
    `- last_design_id: ${whiteboardLastDesign || "-"}`,
    "",
    "## Latest Design",
    `- latest_design_id: ${latestDesignId || "-"}`,
    "",
    "## Inbox (Recent Top 20)",
    ...inboxItems.slice(0, 20).map((it) => `- ${it.ts || "-"} | mention=${it.mention ? "true" : "false"} | ${clipText(it.title || it.body || "-", 160)}`),
    "",
    "## Mentions (Top 10)",
    ...inboxMentions.map((it) => `- ${it.ts || "-"} | ${clipText(it.title || it.body || "-", 160)}`),
    "",
    "## Taskify Tracking (Top 10)",
    ...taskifyRows.map((it) => `- request_id=${it.request_id} | status=${it.status} | run_id=${it.run_id || "-"} | notified=${it.inbox_notified_at ? "true" : "false"}`),
    "",
    "## Runs (Top 10)",
    ...runLines,
    "",
    "## Notes",
    `- caps_applied: inbox_limit=${Math.min(20, Math.max(1, input.inbox_limit))}, mention_limit=10, taskify_limit=10, runs_limit=${Math.min(10, Math.max(1, input.runs_limit))}`,
    `- missing_sections: ${missing.length ? missing.join(", ") : "none"}`,
    "",
  ];
  return { text: lines.join("\n"), missing_sections: missing };
}

function findOpsSnapshotRun(taskId: string, requestId: string): { run_id: string; status: "running" | "completed" | "failed"; snapshot_path: string } | null {
  const runs = listRuns(120);
  for (const r of runs) {
    const runId = String(r.run_id || "");
    if (!runId) continue;
    const metaTask = path.join(RUNS_DIR, runId, "_meta", "task.yaml");
    let taskText = "";
    try { taskText = fs.readFileSync(metaTask, "utf8"); } catch { taskText = ""; }
    if (!taskText.includes(taskId) && !taskText.includes(requestId)) continue;
    const result = loadRunResultYaml(runId);
    const resultStatus = String((result as any)?.metadata?.status || "").toLowerCase();
    let status: "running" | "completed" | "failed" = "running";
    if (resultStatus === "success") status = "completed";
    if (resultStatus === "failed") status = "failed";
    const artifacts = loadRunArtifacts(runId);
    const files: string[] = Array.isArray(artifacts?.files) ? artifacts.files.map((x: unknown) => String(x)) : [];
    const snapshot_path = files.find((x: string) => /^written\/ops_snapshot_\d{8}_\d{6}\.md$/i.test(x)) || "";
    return { run_id: runId, status, snapshot_path };
  }
  return null;
}

function runOpsSnapshotTrackingSweep(): void {
  const entries = loadOpsSnapshotTrackingEntries();
  if (!entries.length) return;
  const reqRows = loadOpsSnapshotRequests();
  const reqMap = new Map<string, OpsSnapshotRequestRecord>();
  for (const item of reqRows) reqMap.set(item.request_id, item);

  const runRows = listRuns(120);
  const requestToRun = new Map<string, string>();
  for (const row of runRows) {
    const runId = String(row.run_id || "");
    if (!runId) continue;
    const taskMetaPath = path.join(RUNS_DIR, runId, "files", "_meta", "task.yaml");
    const marker = parseOpsSnapshotMetaFromTaskYaml(taskMetaPath);
    const request_id = String(marker.request_id || "");
    if (!request_id) continue;
    if (!requestToRun.has(request_id)) requestToRun.set(request_id, runId);
  }

  let changed = false;
  const now = nowIso();
  for (const entry of entries) {
    const shouldCheck = entry.status === "queued" || entry.status === "running" || !entry.notified;
    if (!shouldCheck) continue;
    entry.last_checked_at = now;

    const req = reqMap.get(entry.request_id);
    if (!entry.task_id && req?.task_id) {
      entry.task_id = req.task_id;
      changed = true;
    }

    let matchedRunId = requestToRun.get(entry.request_id) || "";
    if (!matchedRunId && entry.task_id) {
      const byTask = findOpsSnapshotRun(String(entry.task_id || ""), entry.request_id);
      matchedRunId = String(byTask?.run_id || "");
    }
    if (!matchedRunId) continue;

    if (entry.run_id !== matchedRunId) {
      entry.run_id = matchedRunId;
      changed = true;
    }

    let terminal: "completed" | "failed" | "" = "";
    const result = loadRunResultYaml(matchedRunId);
    const status = String(result?.metadata?.status || "").toLowerCase();
    if (status === "success") terminal = "completed";
    if (status === "failed") terminal = "failed";

    const artifacts = loadRunArtifacts(matchedRunId);
    const files: string[] = Array.isArray(artifacts?.files) ? artifacts.files.map((x: unknown) => String(x)) : [];
    const snapshotPath = files.find((x: string) => /^written\/ops_snapshot_\d{8}_\d{6}\.md$/i.test(x)) || "";
    if (entry.snapshot_path !== snapshotPath) {
      entry.snapshot_path = snapshotPath;
      changed = true;
    }

    if (!terminal) {
      if (entry.status !== "running") {
        entry.status = "running";
        changed = true;
      }
      continue;
    }

    if (entry.status !== terminal) {
      entry.status = terminal;
      changed = true;
    }
    if ((entry.status === "completed" || entry.status === "failed") && !entry.notified) {
      try {
        const appended = appendOpsSnapshotInboxEntry({
          request_id: entry.request_id,
          run_id: entry.run_id,
          status: entry.status,
          snapshot_path: entry.snapshot_path,
        });
        if (appended || inboxHasRequestNotification("export_ops_snapshot", entry.request_id)) {
          entry.notified = true;
          entry.notified_at = nowIso();
          changed = true;
        }
      } catch {
        // best-effort only
      }
    }
  }

  if (changed) saveOpsSnapshotTrackingEntries(entries);
}

function parseLocalDateInput(input: unknown, fallbackDate: string): string {
  const raw = String(input || "").trim();
  if (!raw) return fallbackDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallbackDate;
  const t = new Date(`${raw}T00:00:00`);
  return Number.isFinite(t.getTime()) ? raw : fallbackDate;
}

function loadMorningBriefBundleRequests(): MorningBriefBundleRequestRecord[] {
  const raw = readJson<{ items?: unknown[] }>(MORNING_BRIEF_BUNDLE_REQUESTS_PATH, { items: [] });
  const items = Array.isArray(raw.items) ? raw.items : [];
  const out: MorningBriefBundleRequestRecord[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const request_id = String(item.request_id || "").trim();
    const task_id = String(item.task_id || "").trim();
    const queued_path = String(item.queued_path || "").trim();
    const created_at = String(item.created_at || "").trim();
    const date = String(item.date || "").trim();
    if (!request_id || !task_id || !queued_path || !created_at || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({
      request_id,
      task_id,
      queued_path,
      created_at,
      date,
      include_ops_snapshot: item.include_ops_snapshot !== false,
    });
  }
  return out.slice(-OPS_SNAPSHOT_LIMIT_MAX);
}

function saveMorningBriefBundleRequests(items: MorningBriefBundleRequestRecord[]): void {
  writeJsonAtomic(MORNING_BRIEF_BUNDLE_REQUESTS_PATH, { items: items.slice(-OPS_SNAPSHOT_LIMIT_MAX) });
}

function loadMorningBriefBundleTrackingEntries(): MorningBriefBundleTrackingEntry[] {
  const raw = readJson<{ items?: unknown[] }>(MORNING_BRIEF_BUNDLE_TRACKING_PATH, { items: [] });
  const items = Array.isArray(raw.items) ? raw.items : [];
  const out: MorningBriefBundleTrackingEntry[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const request_id = String(item.request_id || "").trim();
    const queued_at = String(item.queued_at || "").trim();
    const statusRaw = String(item.status || "queued").toLowerCase();
    const status: MorningBriefBundleTrackingEntry["status"] =
      statusRaw === "running" || statusRaw === "failed" || statusRaw === "success"
        ? statusRaw
        : statusRaw === "completed"
          ? "success"
          : "queued";
    if (!request_id || !queued_at) continue;
    out.push({
      request_id,
      queued_at,
      status,
      run_id: String(item.run_id || ""),
      notified: item.notified === true,
      zip_path: String(item.zip_path || ""),
      manifest_path: String(item.manifest_path || ""),
      task_id: String(item.task_id || ""),
      date: String(item.date || ""),
      last_checked_at: String(item.last_checked_at || ""),
      notified_at: String(item.notified_at || ""),
    });
  }
  return out.slice(-OPS_SNAPSHOT_TRACKING_LIMIT_MAX);
}

function saveMorningBriefBundleTrackingEntries(items: MorningBriefBundleTrackingEntry[]): void {
  writeJsonAtomic(MORNING_BRIEF_BUNDLE_TRACKING_PATH, { items: items.slice(-OPS_SNAPSHOT_TRACKING_LIMIT_MAX) });
}

function addMorningBriefBundleTrackingEntry(entry: MorningBriefBundleTrackingEntry): void {
  const items = loadMorningBriefBundleTrackingEntries();
  items.push(entry);
  saveMorningBriefBundleTrackingEntries(items);
}

function getMorningBriefBundleTrackingByRequest(requestId: string): MorningBriefBundleTrackingEntry | null {
  const id = String(requestId || "").trim();
  if (!id) return null;
  const items = loadMorningBriefBundleTrackingEntries().filter((x) => x.request_id === id);
  if (!items.length) return null;
  items.sort((a, b) => (a.queued_at < b.queued_at ? 1 : -1));
  return items[0];
}

function findMorningBriefBundleRun(
  taskId: string,
  requestId: string,
): { run_id: string; status: "running" | "success" | "failed"; zip_path: string; manifest_path: string } | null {
  const runs = listRuns(120);
  for (const r of runs) {
    const runId = String(r.run_id || "");
    if (!runId) continue;
    const metaTask = path.join(RUNS_DIR, runId, "_meta", "task.yaml");
    let taskText = "";
    try { taskText = fs.readFileSync(metaTask, "utf8"); } catch { taskText = ""; }
    if (!taskText.includes(taskId) && !taskText.includes(requestId)) continue;
    const result = loadRunResultYaml(runId);
    const resultStatus = String((result as any)?.metadata?.status || "").toLowerCase();
    let status: "running" | "success" | "failed" = "running";
    if (resultStatus === "success") status = "success";
    if (resultStatus === "failed") status = "failed";
    const artifacts = loadRunArtifacts(runId);
    const files: string[] = Array.isArray(artifacts?.files) ? artifacts.files.map((x: unknown) => String(x)) : [];
    const zip_path = files.find((x: string) => /^bundles\/morning_brief_bundle_\d{8}\.zip$/i.test(x)) || "";
    const manifest_path = files.find((x: string) => /^bundles\/morning_brief_bundle_manifest_\d{8}\.json$/i.test(x)) || "";
    return { run_id: runId, status, zip_path, manifest_path };
  }
  return null;
}

function appendMorningBriefBundleInboxEntry(input: {
  request_id: string;
  run_id?: string;
  status: "success" | "failed";
  zip_path?: string;
  manifest_path?: string;
}): boolean {
  const requestId = String(input.request_id || "").trim();
  if (!requestId) return false;
  if (inboxHasRequestNotification("export_morning_brief_bundle", requestId)) return false;
  const settings = loadDesktopSettings();
  const mentionToken = getMentionToken(settings);
  const failed = input.status === "failed";
  const title = failed ? "Morning brief bundle FAILED" : "Morning brief bundle ready";
  const body = failed
    ? `${mentionToken} Morning brief bundle FAILED. request_id=${requestId} run_id=${input.run_id || "-"}`
    : `Morning brief bundle completed. request_id=${requestId} run_id=${input.run_id || "-"}`;
  const artifact_paths = [String(input.zip_path || ""), String(input.manifest_path || "")]
    .map((x) => x.replaceAll("\\", "/").trim())
    .filter((x) => !!x)
    .slice(0, 20)
    .map((x) => clipText(x, 240));
  const entry = {
    id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    ts: nowIso(),
    thread_id: "export",
    msg_id: requestId,
    role: "system",
    mention: failed,
    title: clipText(title, 256),
    body: clipText(body, 2000),
    source: "export_morning_brief_bundle",
    links: { request_id: requestId, run_id: clipText(input.run_id, 120), artifact_paths },
  };
  appendInboxEntry(entry);
  return true;
}

function runMorningBriefBundleTrackingSweep(): void {
  const entries = loadMorningBriefBundleTrackingEntries();
  if (!entries.length) return;
  const reqRows = loadMorningBriefBundleRequests();
  const reqMap = new Map<string, MorningBriefBundleRequestRecord>();
  for (const item of reqRows) reqMap.set(item.request_id, item);
  let changed = false;
  const now = nowIso();
  for (const entry of entries) {
    const shouldCheck = entry.status === "queued" || entry.status === "running" || !entry.notified;
    if (!shouldCheck) continue;
    entry.last_checked_at = now;
    const req = reqMap.get(entry.request_id);
    if (!entry.task_id && req?.task_id) {
      entry.task_id = req.task_id;
      changed = true;
    }
    if (!entry.date && req?.date) {
      entry.date = req.date;
      changed = true;
    }
    const taskId = String(entry.task_id || req?.task_id || "").trim();
    if (!taskId) continue;
    const run = findMorningBriefBundleRun(taskId, entry.request_id);
    if (!run) continue;
    if (entry.run_id !== run.run_id) {
      entry.run_id = run.run_id;
      changed = true;
    }
    if (entry.status !== run.status) {
      entry.status = run.status;
      changed = true;
    }
    if (entry.zip_path !== run.zip_path) {
      entry.zip_path = run.zip_path;
      changed = true;
    }
    if (entry.manifest_path !== run.manifest_path) {
      entry.manifest_path = run.manifest_path;
      changed = true;
    }
    if ((entry.status === "success" || entry.status === "failed") && !entry.notified) {
      try {
        const appended = appendMorningBriefBundleInboxEntry({
          request_id: entry.request_id,
          run_id: entry.run_id,
          status: entry.status,
          zip_path: entry.zip_path,
          manifest_path: entry.manifest_path,
        });
        if (appended || inboxHasRequestNotification("export_morning_brief_bundle", entry.request_id)) {
          entry.notified = true;
          entry.notified_at = nowIso();
          changed = true;
        }
      } catch {
        // best-effort only
      }
    }
  }
  if (changed) saveMorningBriefBundleTrackingEntries(entries);
}

function buildMorningBriefBundleMarkdown(input: { date: string; include_ops_snapshot: boolean }): string {
  const state = loadMorningBriefState();
  const dashboard = buildDailyLoopDashboard(10);
  const lines: string[] = [
    `# Morning Brief ${input.date}`,
    "",
    "- generated_by=export_morning_brief_bundle_v1",
    `- date=${input.date}`,
    `- generated_at=${nowIso()}`,
    `- include_ops_snapshot=${input.include_ops_snapshot ? "true" : "false"}`,
    "",
    "## Routine State",
    `- enabled_effective=${state.enabled_effective ? "true" : "false"}`,
    `- last_result=${clipText(state.last_result || "-", 80)}`,
    `- last_run_at=${clipText(state.last_run_at || "-", 80)}`,
    `- last_autopilot_run_id=${clipText(state.last_autopilot_run_id || "-", 120)}`,
    `- last_written_path=${clipText(state.last_brief_written_path || "-", 240)}`,
    "",
    "## Daily Loop Health",
    `- status=${clipText((dashboard as any)?.health?.status || "warn", 40)}`,
    `- reasons=${clipText((((dashboard as any)?.health?.reasons || []) as string[]).slice(0, 8).join(", ") || "-", 800)}`,
    "",
    "## Inbox Summary",
    `- unread_count=${Math.floor(Number((dashboard as any)?.inbox?.unread_count || 0))}`,
    `- mention_count=${Math.floor(Number((dashboard as any)?.inbox?.mention_count || 0))}`,
    "",
    "## Next Actions",
    "- Review top priority and confirm owner/action/checkpoint.",
  ];
  if (input.include_ops_snapshot) {
    lines.push("", "## Ops Snapshot Link", "- Trigger `/api/export/ops_snapshot` when needed for wider state capture.");
  }
  return clipText(lines.join("\n"), FILE_CAP);
}

function queueEvidenceExportInternal(maxRunsInput: number, includeArchivesInput: boolean): {
  ok: boolean;
  request_id?: string;
  task_id?: string;
  queued_path?: string;
  reason?: string;
} {
  try {
    const maxRuns = Math.max(1, Math.min(EVIDENCE_EXPORT_MAX_RUNS, Math.floor(Number(maxRunsInput || 20))));
    const includeArchives = Boolean(includeArchivesInput);
    const planned = buildEvidenceExportInputs(maxRuns, includeArchives);
    const templatePath = path.join(RECIPES_TEMPLATE_DIR, "recipe_evidence_export_bundle.yaml");
    if (!fs.existsSync(templatePath)) return { ok: false, reason: "template_not_found" };
    const parsed = YAML.parse(fs.readFileSync(templatePath, "utf8"));
    if (!isRecord(parsed)) return { ok: false, reason: "template_invalid" };
    const doc: Record<string, any> = { ...parsed };
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "_");
    const requestId = randomId("evidence_export");
    const taskId = `task_ui_evidence_export_${stamp}`;
    const metadata: Record<string, any> = isRecord(doc.metadata) ? { ...doc.metadata } : {};
    metadata.id = taskId;
    metadata.title = "Recipe: evidence export bundle";
    const tags = Array.isArray(metadata.tags) ? metadata.tags.map((x: unknown) => String(x)) : [];
    tags.push("evidence_export_bundle");
    tags.push(`evidence_request_id:${requestId}`);
    metadata.tags = Array.from(new Set(tags)).slice(-20);
    doc.metadata = metadata;
    const runtime: Record<string, any> = isRecord(doc.runtime) ? { ...doc.runtime } : {};
    const runtimeMeta: Record<string, any> = isRecord(runtime.meta) ? { ...runtime.meta } : {};
    runtimeMeta.evidence_request_id = requestId;
    runtimeMeta.evidence_max_runs = maxRuns;
    runtimeMeta.evidence_include_archives = includeArchives;
    runtime.meta = runtimeMeta;
    doc.runtime = runtime;
    const steps = Array.isArray(doc.steps) ? doc.steps.slice() : [];
    if (steps.length < 2 || !isRecord(steps[1]) || !isRecord((steps[1] as any).task)) return { ok: false, reason: "template_steps_invalid" };
    const archiveStep: Record<string, any> = { ...(steps[1] as Record<string, any>) };
    const archiveTask: Record<string, any> = { ...(archiveStep.task as Record<string, any>) };
    archiveTask.kind = "archive_zip";
    archiveTask.inputs = planned.inputs;
    archiveTask.output = {
      zip_path: `bundles/evidence_${stamp}.zip`,
      manifest_path: `bundles/evidence_${stamp}_manifest.json`,
    };
    archiveTask.options = { follow_symlinks: false };
    archiveTask.limits = { max_files: 2000, max_total_bytes: 52428800 };
    archiveStep.task = archiveTask;
    steps[1] = archiveStep;
    doc.steps = steps;
    const queuedPath = path.join(QUEUE_PENDING_DIR, `${taskId}.yaml`);
    fs.writeFileSync(queuedPath, YAML.stringify(doc), "utf8");
    const queuedAt = nowIso();
    const rec = loadEvidenceExportRequests();
    rec.push({
      request_id: requestId,
      task_id: taskId,
      queued_path: queuedPath.replaceAll("\\", "/"),
      created_at: queuedAt,
      max_runs: maxRuns,
      include_archives: includeArchives,
    });
    saveEvidenceExportRequests(rec);
    addEvidenceExportTrackingEntry({
      request_id: requestId,
      queued_at: queuedAt,
      status: "queued",
      run_id: "",
      notified: false,
      bundle_zip_path: "",
      bundle_manifest_path: "",
      task_id: taskId,
      last_checked_at: "",
      notified_at: "",
    });
    try { runEvidenceExportTrackingSweep(); } catch { }
    return { ok: true, request_id: requestId, task_id: taskId, queued_path: queuedPath.replaceAll("\\", "/") };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e || "queue_failed") };
  }
}

function queueOpsSnapshotInternal(inboxLimitInput: number, runsLimitInput: number): {
  ok: boolean;
  request_id?: string;
  task_id?: string;
  queued_path?: string;
  reason?: string;
} {
  try {
    const inboxLimit = Math.max(1, Math.min(20, Math.floor(Number(inboxLimitInput || 20))));
    const runsLimit = Math.max(1, Math.min(10, Math.floor(Number(runsLimitInput || 10))));
    const built = buildOpsSnapshotMarkdown({ inbox_limit: inboxLimit, runs_limit: runsLimit });
    const stamp = ymdHmsStamp();
    const outputPath = `ops_snapshot_${stamp}.md`;
    const snapshotText = built.text.replace("# Ops Snapshot", `# Ops Snapshot\n\n- output_file: ${outputPath}`);
    const templatePath = path.join(RECIPES_TEMPLATE_DIR, "recipe_ops_snapshot.yaml");
    if (!fs.existsSync(templatePath)) return { ok: false, reason: "template_not_found" };
    const parsed = YAML.parse(fs.readFileSync(templatePath, "utf8"));
    if (!isRecord(parsed)) return { ok: false, reason: "template_invalid" };
    const doc: Record<string, any> = { ...parsed };
    const requestId = randomId("ops_snapshot");
    const taskId = `task_ui_ops_snapshot_${stamp}`;
    const metadata: Record<string, any> = isRecord(doc.metadata) ? { ...doc.metadata } : {};
    metadata.id = taskId;
    metadata.title = "Recipe: ops snapshot";
    const tags = Array.isArray(metadata.tags) ? metadata.tags.map((x: unknown) => String(x)) : [];
    tags.push("ops_snapshot");
    tags.push(`ops_snapshot_request_id:${requestId}`);
    metadata.tags = Array.from(new Set(tags)).slice(-20);
    doc.metadata = metadata;
    const runtime: Record<string, any> = isRecord(doc.runtime) ? { ...doc.runtime } : {};
    const runtimeMeta: Record<string, any> = isRecord(runtime.meta) ? { ...runtime.meta } : {};
    runtimeMeta.ops_snapshot_request_id = requestId;
    runtimeMeta.ops_snapshot_inbox_limit = inboxLimit;
    runtimeMeta.ops_snapshot_runs_limit = runsLimit;
    runtime.meta = runtimeMeta;
    doc.runtime = runtime;
    const steps = Array.isArray(doc.steps) ? doc.steps.slice() : [];
    if (steps.length < 1 || !isRecord(steps[0]) || !isRecord((steps[0] as any).task)) return { ok: false, reason: "template_steps_invalid" };
    const writeStep: Record<string, any> = { ...(steps[0] as Record<string, any>) };
    const writeTask: Record<string, any> = { ...(writeStep.task as Record<string, any>) };
    writeTask.kind = "file_write";
    writeTask.files = [{ path: outputPath, text: snapshotText, mode: "overwrite" }];
    writeStep.task = writeTask;
    steps[0] = writeStep;
    doc.steps = steps;
    const acceptance = Array.isArray(doc.acceptance) ? doc.acceptance.slice() : [];
    for (const acc of acceptance) {
      if (!isRecord(acc)) continue;
      if (acc.path !== undefined) acc.path = `written/${outputPath}`;
    }
    doc.acceptance = acceptance;
    const queuedPath = path.join(QUEUE_PENDING_DIR, `${taskId}.yaml`);
    fs.writeFileSync(queuedPath, YAML.stringify(doc), "utf8");
    const queuedAt = nowIso();
    const rec = loadOpsSnapshotRequests();
    rec.push({
      request_id: requestId,
      task_id: taskId,
      queued_path: queuedPath.replaceAll("\\", "/"),
      created_at: queuedAt,
      inbox_limit: inboxLimit,
      runs_limit: runsLimit,
    });
    saveOpsSnapshotRequests(rec);
    addOpsSnapshotTrackingEntry({
      request_id: requestId,
      queued_at: queuedAt,
      status: "queued",
      run_id: "",
      notified: false,
      snapshot_path: "",
      note: "tracking_enabled",
      last_checked_at: "",
      notified_at: "",
      task_id: taskId,
    });
    try { runOpsSnapshotTrackingSweep(); } catch { }
    return { ok: true, request_id: requestId, task_id: taskId, queued_path: queuedPath.replaceAll("\\", "/") };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e || "queue_failed") };
  }
}

function resolveOpsSnapshotStatusByRequest(requestId: string): "queued" | "done" | "failed" | "disabled" {
  if (!requestId) return "disabled";
  try { runOpsSnapshotTrackingSweep(); } catch { }
  const items = loadOpsSnapshotRequests();
  const item = items.find((x) => x.request_id === requestId) || null;
  if (!item) return "failed";
  const tracked = getOpsSnapshotTrackingByRequest(item.request_id);
  const run = findOpsSnapshotRun(item.task_id, item.request_id);
  const queuedExists = fs.existsSync(path.join(QUEUE_PENDING_DIR, `${item.task_id}.yaml`));
  const status = String(tracked?.status || run?.status || (queuedExists ? "queued" : "unknown"));
  if (status === "completed") return "done";
  if (status === "failed") return "failed";
  return "queued";
}

function resolveEvidenceBundleStatusByRequest(requestId: string): "queued" | "done" | "failed" | "disabled" {
  if (!requestId) return "disabled";
  try { runEvidenceExportTrackingSweep(); } catch { }
  const items = loadEvidenceExportRequests();
  const item = items.find((x) => x.request_id === requestId) || null;
  if (!item) return "failed";
  const tracked = getEvidenceExportTrackingByRequest(item.request_id);
  const run = findEvidenceExportRun(item.task_id, item.request_id);
  const queuedExists = fs.existsSync(path.join(QUEUE_PENDING_DIR, `${item.task_id}.yaml`));
  const status = String(tracked?.status || run?.status || (queuedExists ? "queued" : "unknown"));
  if (status === "completed") return "done";
  if (status === "failed") return "failed";
  return "queued";
}

function queueRecipeReleaseBundleInternal(): {
  ok: boolean;
  request_id?: string;
  task_id?: string;
  queued_path?: string;
  reason?: string;
} {
  try {
    const catalog = readJson<RecipeCatalog>(RECIPES_SSOT_PATH, { recipes: [] });
    const item = (catalog.recipes || []).find((r) => r.id === "recipe_release_bundle");
    if (!item || !item.file) return { ok: false, reason: "recipe_release_bundle_not_found" };
    const templatePath = path.join(RECIPES_TEMPLATE_DIR, item.file);
    if (!fs.existsSync(templatePath)) return { ok: false, reason: "template_not_found" };
    const parsed = YAML.parse(fs.readFileSync(templatePath, "utf8"));
    if (!isRecord(parsed)) return { ok: false, reason: "template_invalid" };
    const doc: Record<string, any> = { ...parsed };
    const requestId = randomId("release_bundle");
    const taskId = `task_ui_recipe_release_bundle_${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const metadata: Record<string, any> = isRecord(doc.metadata) ? { ...doc.metadata } : {};
    metadata.id = taskId;
    const tags = Array.isArray(metadata.tags) ? metadata.tags.map((x: unknown) => String(x)) : [];
    tags.push("recipe_release_bundle");
    tags.push(`council_release_bundle_request_id:${requestId}`);
    metadata.tags = Array.from(new Set(tags)).slice(-30);
    doc.metadata = metadata;
    const runtime: Record<string, any> = isRecord(doc.runtime) ? { ...doc.runtime } : {};
    const runtimeMeta: Record<string, any> = isRecord(runtime.meta) ? { ...runtime.meta } : {};
    runtimeMeta.council_release_bundle_request_id = requestId;
    runtime.meta = runtimeMeta;
    doc.runtime = runtime;
    const outPath = path.join(QUEUE_PENDING_DIR, `${taskId}.yaml`);
    fs.writeFileSync(outPath, YAML.stringify(doc), "utf8");
    return { ok: true, request_id: requestId, task_id: taskId, queued_path: outPath.replaceAll("\\", "/") };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e || "queue_failed") };
  }
}

function parseReleaseBundleMetaFromTaskYaml(taskYamlPath: string): { request_id?: string } {
  if (!fs.existsSync(taskYamlPath)) return {};
  try {
    const parsed = YAML.parse(fs.readFileSync(taskYamlPath, "utf8"));
    if (!isRecord(parsed)) return {};
    let request_id = "";
    if (isRecord(parsed.runtime) && isRecord(parsed.runtime.meta)) {
      request_id = String(parsed.runtime.meta.council_release_bundle_request_id || "");
    }
    if (!request_id && isRecord(parsed.metadata) && Array.isArray(parsed.metadata.tags)) {
      const tags = parsed.metadata.tags.map((x) => String(x));
      const found = tags.find((t) => t.startsWith("council_release_bundle_request_id:"));
      request_id = found ? found.slice("council_release_bundle_request_id:".length) : "";
    }
    return { request_id };
  } catch {
    return {};
  }
}

function collectReleaseBundleArtifactPaths(runId: string): string[] {
  const artifacts = loadRunArtifacts(runId);
  const files: string[] = Array.isArray(artifacts?.files) ? artifacts.files.map((x: unknown) => String(x)) : [];
  return files
    .filter((x) => /^bundles\/.*\.(zip|json)$/i.test(x))
    .slice(0, 8);
}

function findReleaseBundleRunByRequest(requestId: string): {
  run_id: string;
  status: "running" | "done" | "failed";
  artifact_paths: string[];
} | null {
  if (!requestId) return null;
  const runs = listRuns(160);
  for (const r of runs) {
    const runId = String(r.run_id || "");
    if (!runId) continue;
    const metaTaskCandidates = [
      path.join(RUNS_DIR, runId, "_meta", "task.yaml"),
      path.join(RUNS_DIR, runId, "files", "_meta", "task.yaml"),
    ];
    let markerFound = false;
    for (const p of metaTaskCandidates) {
      const marker = parseReleaseBundleMetaFromTaskYaml(p);
      if (String(marker.request_id || "") === requestId) {
        markerFound = true;
        break;
      }
    }
    if (!markerFound) continue;
    const result = loadRunResultYaml(runId);
    const rs = String(result?.metadata?.status || "").toLowerCase();
    const status: "running" | "done" | "failed" =
      rs === "success" ? "done" : (rs === "failed" ? "failed" : "running");
    const artifact_paths = collectReleaseBundleArtifactPaths(runId);
    return { run_id: runId, status, artifact_paths };
  }
  return null;
}

function appendReleaseBundleInboxEntry(input: {
  request_id: string;
  run_id?: string;
  status: "done" | "failed";
  artifact_paths?: string[];
}): boolean {
  const requestId = String(input.request_id || "").trim();
  if (!requestId) return false;
  if (inboxHasRequestNotification("export_release_bundle", requestId)) return true;
  const isFailed = input.status === "failed";
  const settings = loadDesktopSettings();
  const mentionToken = isFailed ? getMentionToken(settings) : "";
  const body = isFailed
    ? `${mentionToken} Release bundle FAILED. request_id=${requestId} run_id=${input.run_id || "-"}`
    : `Release bundle completed. request_id=${requestId} run_id=${input.run_id || "-"}`;
  const artifact_paths = (Array.isArray(input.artifact_paths) ? input.artifact_paths : [])
    .map((x) => clipText(String(x || "").replaceAll("\\", "/").trim(), 240))
    .filter((x) => !!x)
    .slice(0, 20);
  const entry: Record<string, unknown> = {
    id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    ts: nowIso(),
    thread_id: "export",
    msg_id: requestId,
    role: "system",
    mention: isFailed,
    title: clipText(isFailed ? "Release bundle FAILED" : "Release bundle ready", 256),
    body: clipText(body, 2000),
    source: "export_release_bundle",
    links: {
      request_id: requestId,
      run_id: clipText(input.run_id, 120),
      artifact_paths,
    },
  };
  appendInboxEntry(entry);
  return true;
}

function reconcileCouncilAutoExports(run: CouncilRunRecord): CouncilRunRecord {
  const exportsState = sanitizeCouncilExportsState(run.exports);
  let changed = false;
  const now = nowIso();
  const finalMode = String(run.finalization?.mode || "");
  const isDoneForKick = run.status === "completed" || (run.status === "failed" && finalMode === "failed_quality");
  if (run.status === "canceled" || run.stop_requested) {
    return { ...run, exports: exportsState };
  }

  if (isDoneForKick) {
    if (exportsState.auto_ops_snapshot && !exportsState.ops_snapshot_request_id) {
      const q = queueOpsSnapshotInternal(20, 10);
      if (q.ok && q.request_id) {
        exportsState.ops_snapshot_request_id = q.request_id;
        exportsState.kicked_at.ops_snapshot = now;
        exportsState.status.ops_snapshot = "queued";
        changed = true;
        appendActivity({
          event_type: "export_request",
          actor_id: "council_autopilot",
          title: "Ops Snapshot queued",
          summary: `run_id=${run.run_id} request_id=${q.request_id}`,
          refs: { run_id: run.run_id, thread_id: run.thread_id, request_id: q.request_id },
        });
      } else {
        exportsState.status.ops_snapshot = "failed";
        exportsState.note = clipText(`ops_snapshot_queue_failed:${String(q.reason || "unknown")}`, 380);
        changed = true;
      }
    }
    if (exportsState.auto_evidence_bundle && !exportsState.evidence_bundle_request_id) {
      const q = queueEvidenceExportInternal(20, false);
      if (q.ok && q.request_id) {
        exportsState.evidence_bundle_request_id = q.request_id;
        exportsState.kicked_at.evidence_bundle = now;
        exportsState.status.evidence_bundle = "queued";
        changed = true;
        appendActivity({
          event_type: "export_request",
          actor_id: "council_autopilot",
          title: "Evidence bundle queued",
          summary: `run_id=${run.run_id} request_id=${q.request_id}`,
          refs: { run_id: run.run_id, thread_id: run.thread_id, request_id: q.request_id },
        });
      } else {
        exportsState.status.evidence_bundle = "failed";
        exportsState.note = clipText(`evidence_queue_failed:${String(q.reason || "unknown")}`, 380);
        changed = true;
      }
    }
    if (exportsState.auto_release_bundle && !exportsState.release_bundle_request_id) {
      const q = queueRecipeReleaseBundleInternal();
      if (q.ok && q.request_id) {
        exportsState.release_bundle_request_id = q.request_id;
        exportsState.kicked_at.release_bundle = now;
        exportsState.release_bundle_status = "queued";
        changed = true;
        appendActivity({
          event_type: "export_request",
          actor_id: "council_autopilot",
          title: "Release bundle queued",
          summary: `run_id=${run.run_id} request_id=${q.request_id}`,
          refs: { run_id: run.run_id, thread_id: run.thread_id, request_id: q.request_id },
        });
      } else {
        exportsState.release_bundle_status = "failed";
        exportsState.release_bundle_note = clipText(`release_bundle_queue_failed:${String(q.reason || "unknown")}`, 380);
        changed = true;
      }
    }
  }

  if (!exportsState.auto_ops_snapshot) {
    if (exportsState.status.ops_snapshot !== "disabled") changed = true;
    exportsState.status.ops_snapshot = "disabled";
  } else {
    if (exportsState.ops_snapshot_request_id) {
      const next = resolveOpsSnapshotStatusByRequest(String(exportsState.ops_snapshot_request_id || ""));
      if (exportsState.status.ops_snapshot !== next) changed = true;
      exportsState.status.ops_snapshot = next;
    } else {
      if (!exportsState.status.ops_snapshot || exportsState.status.ops_snapshot === "disabled") {
        exportsState.status.ops_snapshot = "queued";
        changed = true;
      }
    }
  }
  if (!exportsState.auto_evidence_bundle) {
    if (exportsState.status.evidence_bundle !== "disabled") changed = true;
    exportsState.status.evidence_bundle = "disabled";
  } else {
    if (exportsState.evidence_bundle_request_id) {
      const next = resolveEvidenceBundleStatusByRequest(String(exportsState.evidence_bundle_request_id || ""));
      if (exportsState.status.evidence_bundle !== next) changed = true;
      exportsState.status.evidence_bundle = next;
    } else {
      if (!exportsState.status.evidence_bundle || exportsState.status.evidence_bundle === "disabled") {
        exportsState.status.evidence_bundle = "queued";
        changed = true;
      }
    }
  }
  if (!exportsState.auto_release_bundle) {
    if (exportsState.release_bundle_status !== "disabled") changed = true;
    exportsState.release_bundle_status = "disabled";
    exportsState.release_bundle_run_id = null;
  } else {
    if (!exportsState.release_bundle_request_id) {
      if (exportsState.release_bundle_status === "disabled") {
        exportsState.release_bundle_status = "queued";
        changed = true;
      }
    } else {
      const hit = findReleaseBundleRunByRequest(String(exportsState.release_bundle_request_id || ""));
      if (!hit) {
        if (exportsState.release_bundle_status !== "queued") {
          exportsState.release_bundle_status = "queued";
          changed = true;
        }
      } else {
        if (exportsState.release_bundle_run_id !== hit.run_id) {
          exportsState.release_bundle_run_id = hit.run_id;
          changed = true;
        }
        if (exportsState.release_bundle_status !== hit.status) {
          exportsState.release_bundle_status = hit.status;
          changed = true;
        }
        if (hit.status === "done" || hit.status === "failed") {
          const notified = appendReleaseBundleInboxEntry({
            request_id: String(exportsState.release_bundle_request_id || ""),
            run_id: hit.run_id,
            status: hit.status,
            artifact_paths: hit.artifact_paths,
          });
          if (!notified) {
            exportsState.release_bundle_note = clipText("release_bundle_inbox_notify_failed", 380);
          }
        }
      }
    }
  }

  const nextRun: CouncilRunRecord = { ...run, exports: exportsState };
  if (changed) {
    saveCouncilRunRecord(nextRun);
    return loadCouncilRunRecord(run.run_id) || nextRun;
  }
  return nextRun;
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  const url = parseUrl(req);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, jsonOk({ status: "ok", workspace: WORKSPACE }));
  }

  if (req.method === "GET" && pathname === "/api/org/agent_presets") {
    const doc = loadAgentPresetsDoc();
    const presets = doc.presets.map((p) => ({
      preset_set_id: p.preset_set_id,
      display_name: p.display_name,
      description: p.description,
    }));
    return sendJson(res, 200, jsonOk({
      action: "agent_presets_get",
      version: doc.version,
      presets,
      exit_code: 0,
    }));
  }
  const presetDetailMatch = pathname.match(/^\/api\/org\/agent_presets\/([^/]+)$/);
  if (req.method === "GET" && presetDetailMatch) {
    const id = clipText(decodeURIComponent(presetDetailMatch[1] || ""), 80).trim().toLowerCase();
    const doc = loadAgentPresetsDoc();
    const preset = doc.presets.find((p) => p.preset_set_id === id) || null;
    if (!preset) return notFound(res);
    return sendJson(res, 200, jsonOk({
      action: "agent_presets_get_one",
      version: doc.version,
      preset,
      exit_code: 0,
    }));
  }
  if (req.method === "POST" && pathname === "/api/org/agents/apply_preset") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "org_agent_presets.apply_payload_invalid" });
    const scopeRaw = String(body.scope || "council").trim().toLowerCase();
    const scope: "council" | "agent" = scopeRaw === "agent" ? "agent" : "council";
    const result = applyAgentPresetInternal({
      preset_set_id: String(body.preset_set_id || ""),
      scope,
      agent_id: body.agent_id === undefined ? "" : String(body.agent_id || ""),
      dry_run: body.dry_run === true,
      actor_id: typeof body.actor_id === "string" ? body.actor_id : "ui_discord",
      applied_by: typeof body.applied_by === "string" ? body.applied_by : "apply_preset",
      reason: typeof body.reason === "string" ? body.reason : "manual",
      thread_key: typeof body.thread_key === "string" ? body.thread_key : "",
    });
    if (!result.ok) {
      const status = result.note === "ERR_PRESET_NOT_FOUND" ? 404 : 400;
      return sendJson(res, status, { ok: false, reason: result.note, details: result });
    }
    return sendJson(res, 200, jsonOk(result));
  }
  if (req.method === "GET" && pathname === "/api/org/active_profile") {
    const loaded = loadActiveProfileState();
    return sendJson(res, 200, jsonOk({
      action: "active_profile_get",
      ...loaded.state,
      note: loaded.note || "",
      exit_code: 0,
    }));
  }
  if (req.method === "POST" && pathname === "/api/org/active_profile/revert") {
    const bodyRaw = await parseBody(req);
    const body = isRecord(bodyRaw) ? bodyRaw : {};
    const out = runActiveProfileRevertInternal({
      dry_run: body.dry_run !== false,
      confirm_phrase: String(body.confirm_phrase || ""),
      target_preset_set_id: String(body.target_preset_set_id || "standard"),
      thread_key: String(body.thread_key || ""),
      reason: String(body.reason || "revert"),
      source: "api",
    });
    if (out.ok !== true && String(out.reason || "") === "ERR_CONFIRM_REQUIRED") {
      return sendJson(res, 400, { ok: false, reason: "ERR_CONFIRM_REQUIRED", details: (out as any).details || {} });
    }
    return sendJson(res, 200, jsonOk({ action: "active_profile_revert", ...out }));
  }

  if (req.method === "GET" && pathname === "/api/org/agents") {
    const loaded = loadOrgAgentsSnapshot();
    if (!loaded.snapshot.agents.some((a) => a.id === "facilitator")) {
      const now = nowIso();
      const fallbackFacilitator: OrgAgent = {
        id: "facilitator",
        display_name: "Facilitator",
        role: "司会",
        icon: "🎙️",
        status: "idle",
        assigned_thread_id: null,
        last_message: null,
        last_updated_at: now,
      };
      loaded.snapshot = {
        ...loaded.snapshot,
        updated_at: now,
        agents: [fallbackFacilitator, ...loaded.snapshot.agents].slice(0, ORG_AGENTS_LIMIT_MAX),
      };
      writeJsonAtomic(ORG_AGENTS_PATH, loaded.snapshot);
    }
    if (loaded.created) {
      appendActivity({
        event_type: "agents_created",
        title: "Agents initialized",
        summary: `Created default agents (${loaded.snapshot.agents.length})`,
      });
    }
    return sendJson(res, 200, jsonOk(loaded.snapshot));
  }
  if (req.method === "POST" && pathname === "/api/org/agents") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequest(res, "org_agents_payload_invalid");
    const loaded = loadOrgAgentsSnapshot();
    const now = nowIso();
    const byId = new Map<string, OrgAgent>();
    for (const agent of loaded.snapshot.agents.slice(0, ORG_AGENTS_LIMIT_MAX)) byId.set(agent.id, agent);

    const patches: Array<Record<string, unknown>> = [];
    if (Array.isArray(body.agents)) {
      for (const row of body.agents) {
        if (isRecord(row)) patches.push(row);
      }
    } else if (isRecord(body.agent)) {
      patches.push(body.agent);
    } else if (typeof body.id === "string") {
      patches.push(body);
    } else {
      return badRequest(res, "org_agents_patch_missing");
    }
    if (!patches.length) return badRequest(res, "org_agents_patch_empty");

    const changedIds: string[] = [];
    const changedStates: Array<{ id: string; from: OrgAgentStatus; to: OrgAgentStatus }> = [];
    for (const patch of patches) {
      const id = clipText(patch.id, 80).trim();
      if (!id) return badRequest(res, "org_agents.id_required");
      const current = byId.get(id);
      if (!current) return badRequest(res, `org_agents.id_not_found:${id}`);
      let next: OrgAgent;
      try {
        next = applyOrgAgentPatch(current, patch, now);
      } catch (e: any) {
        const reason = String(e?.message || "org_agents_patch_invalid");
        if (reason.startsWith("org_agents.layout_")) {
          return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason, id, field: "layout" });
        }
        if (reason.startsWith("org_agents.identity_")) {
          return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason, id, field: "identity" });
        }
        return badRequest(res, reason);
      }
      byId.set(id, next);
      if (JSON.stringify(current) !== JSON.stringify(next)) changedIds.push(id);
      if (current.status !== next.status) {
        changedStates.push({ id, from: current.status, to: next.status });
      }
    }

    const updated: OrgAgentsSnapshot = {
      version: 1,
      updated_at: now,
      agents: Array.from(byId.values()).slice(0, ORG_AGENTS_LIMIT_MAX),
    };
    writeJsonAtomic(ORG_AGENTS_PATH, updated);
    if (changedIds.length > 0) {
      appendActivity({
        event_type: "agents_updated",
        actor_id: typeof body.actor_id === "string" ? clipText(body.actor_id, 120) : null,
        title: "Agents updated",
        summary: `changed_ids=${changedIds.slice(0, 10).join(",")}`,
      });
      for (const state of changedStates.slice(0, 20)) {
        appendActivity({
          event_type: "agent_state_changed",
          actor_id: state.id,
          title: "Agent state changed",
          summary: `${state.id}: ${state.from} -> ${state.to} (state=${state.to})`,
        });
      }
    }
    return sendJson(res, 200, jsonOk(updated));
  }

  if (req.method === "GET" && pathname === "/api/org/guest_keys") {
    const doc = loadGuestKeysDoc();
    return sendJson(res, 200, jsonOk(doc));
  }
  if (req.method === "POST" && pathname === "/api/org/guest_keys/new") {
    const body = await parseBody(req);
    const doc = loadGuestKeysDoc();
    const activeCount = doc.keys.filter((k) => !k.revoked).length;
    if (activeCount >= GUEST_KEYS_MAX) {
      return badRequestWithDetails(res, "ERR_NOT_ALLOWED", { reason: "guest_keys.limit_reached", max: GUEST_KEYS_MAX });
    }
    const now = nowIso();
    const label = isRecord(body) ? clipText(body.label, GUEST_LABEL_MAX).trim() : "";
    const key: GuestKeyEntry = {
      join_key: newJoinKey(),
      created_at: now,
      revoked: false,
      label: label || undefined,
    };
    const next: GuestKeysDoc = {
      version: 1,
      updated_at: now,
      keys: [key, ...doc.keys].slice(0, GUEST_KEYS_MAX),
    };
    writeJsonAtomic(ORG_GUEST_KEYS_PATH, next);
    return sendJson(res, 200, jsonOk(key));
  }
  if (req.method === "POST" && pathname === "/api/org/guest_keys/revoke") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "guest_keys.revoke_payload_invalid" });
    const joinKey = clipText(body.join_key, 120).trim();
    if (!joinKey) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "guest_keys.join_key_required", field: "join_key" });
    const doc = loadGuestKeysDoc();
    const now = nowIso();
    let changed = false;
    const keys = doc.keys.map((k) => {
      if (k.join_key !== joinKey) return k;
      changed = true;
      return { ...k, revoked: true, revoked_at: now };
    });
    if (!changed) return notFound(res);
    const next: GuestKeysDoc = { version: 1, updated_at: now, keys };
    writeJsonAtomic(ORG_GUEST_KEYS_PATH, next);
    return sendJson(res, 200, jsonOk({ ok: true, join_key: joinKey, revoked_at: now }));
  }
  if (req.method === "GET" && pathname === "/api/org/guests") {
    const doc = loadGuestsDoc();
    return sendJson(res, 200, jsonOk(doc));
  }
  if (req.method === "POST" && pathname === "/api/org/guests/join") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "guests.join_payload_invalid" });
    const keysDoc = loadGuestKeysDoc();
    const key = resolveGuestJoinKey(body.join_key, keysDoc);
    if (!key) return badRequestWithDetails(res, "ERR_NOT_ALLOWED", { reason: "guests.join_key_invalid_or_revoked", field: "join_key" });
    const guestId = normalizeGuestId(body.guest_id);
    const displayName = clipText(body.display_name, GUEST_DISPLAY_NAME_MAX).trim();
    if (!guestId) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "guests.guest_id_invalid", field: "guest_id" });
    if (!displayName) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "guests.display_name_required", field: "display_name" });
    const now = nowIso();
    const guestsDoc = loadGuestsDoc();
    const byId = new Map<string, GuestEntry>();
    for (const row of guestsDoc.guests.slice(0, GUESTS_MAX)) byId.set(row.id, row);
    let current = byId.get(guestId) || null;
    if (!current && byId.size >= GUESTS_MAX) {
      return badRequestWithDetails(res, "ERR_NOT_ALLOWED", { reason: "guests.limit_reached", max: GUESTS_MAX });
    }
    current = {
      id: guestId,
      display_name: displayName,
      status: "idle",
      note: current?.note || undefined,
      last_seen_at: now,
    };
    byId.set(guestId, current);
    const next: GuestsDoc = {
      version: 1,
      updated_at: now,
      guests: Array.from(byId.values()).slice(0, GUESTS_MAX),
    };
    writeJsonAtomic(ORG_GUESTS_PATH, next);
    appendActivity({
      event_type: "guest_joined",
      actor_id: guestId,
      title: "Guest joined",
      summary: `${guestId} joined (status=idle)`,
    });
    const expiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString();
    return sendJson(res, 200, jsonOk({ ok: true, guest: current, expires_at: expiresAt }));
  }
  if (req.method === "POST" && pathname === "/api/org/guests/push") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "guests.push_payload_invalid" });
    const keysDoc = loadGuestKeysDoc();
    const key = resolveGuestJoinKey(body.join_key, keysDoc);
    if (!key) return badRequestWithDetails(res, "ERR_NOT_ALLOWED", { reason: "guests.join_key_invalid_or_revoked", field: "join_key" });
    const guestId = normalizeGuestId(body.guest_id);
    const status = clipText(body.status, 32).trim();
    if (!guestId) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "guests.guest_id_invalid", field: "guest_id" });
    if (!isOrgAgentStatus(status)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "guests.status_invalid", field: "status" });
    const nowMs = Date.now();
    const prevMs = Number(guestPushRateLimitByGuestId[guestId] || 0);
    if (Number.isFinite(prevMs) && nowMs - prevMs < GUEST_PUSH_MIN_INTERVAL_MS) {
      return sendJson(res, 429, { ok: false, reason: "ERR_RATE_LIMIT", details: { field: "guest_id", min_interval_ms: GUEST_PUSH_MIN_INTERVAL_MS } });
    }
    guestPushRateLimitByGuestId[guestId] = nowMs;
    const now = new Date(nowMs).toISOString();
    const note = clipText(body.note, GUEST_NOTE_MAX).trim();
    const guestsDoc = loadGuestsDoc();
    const byId = new Map<string, GuestEntry>();
    for (const row of guestsDoc.guests.slice(0, GUESTS_MAX)) byId.set(row.id, row);
    const current = byId.get(guestId);
    if (!current) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "guests.guest_not_joined", field: "guest_id" });
    const nextGuest: GuestEntry = {
      id: guestId,
      display_name: current.display_name,
      status,
      note: note || undefined,
      last_seen_at: now,
    };
    byId.set(guestId, nextGuest);
    const nextDoc: GuestsDoc = {
      version: 1,
      updated_at: now,
      guests: Array.from(byId.values()).slice(0, GUESTS_MAX),
    };
    writeJsonAtomic(ORG_GUESTS_PATH, nextDoc);
    appendActivity({
      event_type: "guest_pushed",
      actor_id: guestId,
      title: "Guest status pushed",
      summary: `${guestId}: state=${status}${note ? ` note=${clipText(note, 120)}` : ""}`,
    });
    return sendJson(res, 200, jsonOk({ ok: true, guest: nextGuest }));
  }
  if (req.method === "POST" && pathname === "/api/org/guests/leave") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "guests.leave_payload_invalid" });
    const keysDoc = loadGuestKeysDoc();
    const key = resolveGuestJoinKey(body.join_key, keysDoc);
    if (!key) return badRequestWithDetails(res, "ERR_NOT_ALLOWED", { reason: "guests.join_key_invalid_or_revoked", field: "join_key" });
    const guestId = normalizeGuestId(body.guest_id);
    if (!guestId) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "guests.guest_id_invalid", field: "guest_id" });
    const guestsDoc = loadGuestsDoc();
    const byId = new Map<string, GuestEntry>();
    for (const row of guestsDoc.guests.slice(0, GUESTS_MAX)) byId.set(row.id, row);
    const current = byId.get(guestId);
    if (!current) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "guests.guest_not_joined", field: "guest_id" });
    const now = nowIso();
    const nextGuest: GuestEntry = { ...current, status: "offline", last_seen_at: now };
    byId.set(guestId, nextGuest);
    const nextDoc: GuestsDoc = {
      version: 1,
      updated_at: now,
      guests: Array.from(byId.values()).slice(0, GUESTS_MAX),
    };
    writeJsonAtomic(ORG_GUESTS_PATH, nextDoc);
    appendActivity({
      event_type: "guest_left",
      actor_id: guestId,
      title: "Guest left",
      summary: `${guestId}: state=offline`,
    });
    return sendJson(res, 200, jsonOk({ ok: true, guest: nextGuest }));
  }

  if (req.method === "GET" && pathname === "/api/memory/search") {
    const loaded = loadOrgAgentsSnapshot();
    const allowedAgentIds = new Set(loaded.snapshot.agents.map((a) => a.id));
    const q = String(url.searchParams.get("q") || "");
    const limit = Number(url.searchParams.get("limit") || 20);
    const hits = searchMemory(q, limit, allowedAgentIds);
    return sendJson(res, 200, jsonOk({ q, hits }));
  }

  const memoryPathMatch = pathname.match(/^\/api\/memory\/([^/]+)\/([^/]+)$/);
  if (memoryPathMatch && (req.method === "GET" || req.method === "POST")) {
    const loaded = loadOrgAgentsSnapshot();
    const allowedAgentIds = new Set(loaded.snapshot.agents.map((a) => a.id));
    const agentId = normalizeMemoryAgentId(decodeURIComponent(memoryPathMatch[1] || ""));
    const categoryRaw = decodeURIComponent(memoryPathMatch[2] || "");
    if (!agentId || !allowedAgentIds.has(agentId)) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "memory.agent_id_invalid", field: "agent_id" });
    }
    if (!isMemoryCategory(categoryRaw)) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "memory.category_invalid", field: "category" });
    }
    const category: MemoryCategory = categoryRaw;

    if (req.method === "GET") {
      const limit = Number(url.searchParams.get("limit") || 50);
      const out = readMemoryItems(agentId, category, limit);
      return sendJson(res, 200, jsonOk({
        agent_id: agentId,
        category,
        items: out.items,
        truncated: out.truncated,
        note: out.note || "",
        skipped_invalid: out.skipped_invalid,
      }));
    }

    const body = await parseBody(req);
    if (!isRecord(body)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "memory.payload_invalid" });
    try {
      const created = appendMemoryEntry(agentId, category, body);
      return sendJson(res, 200, jsonOk(created));
    } catch (e: any) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: String(e?.message || "memory.append_invalid"), field: "memory" });
    }
  }

  if (req.method === "POST" && pathname === "/api/heartbeat/run") {
    const loaded = loadOrgAgentsSnapshot();
    const allowedAgentIds = new Set(loaded.snapshot.agents.map((a) => a.id));
    let params: HeartbeatParams;
    try {
      const body = await parseBody(req);
      params = parseHeartbeatParams(body, allowedAgentIds);
    } catch (e: any) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: String(e?.message || "heartbeat.invalid"), field: "heartbeat" });
    }
    let out: ReturnType<typeof runHeartbeat>;
    try {
      out = runHeartbeat(params);
    } catch (e: any) {
      out = {
        request_id: randomId("heartbeat_request"),
        dry_run: params.dry_run,
        truncated: { activity: false, inbox: false },
        sources_counts: { activity: 0, inbox: 0, runs: 0 },
        notes: [`heartbeat_failed:${String(e?.message || "unknown")}`],
      };
    }
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "GET" && pathname === "/api/heartbeat/settings") {
    const loaded = loadOrgAgentsSnapshot();
    const allowedAgentIds = new Set(loaded.snapshot.agents.map((a) => a.id));
    const settings = loadHeartbeatSettings(allowedAgentIds);
    return sendJson(res, 200, jsonOk(settings));
  }
  if (req.method === "POST" && pathname === "/api/heartbeat/settings") {
    const loaded = loadOrgAgentsSnapshot();
    const allowedAgentIds = new Set(loaded.snapshot.agents.map((a) => a.id));
    const current = loadHeartbeatSettings(allowedAgentIds);
    let next: HeartbeatSettings;
    try {
      const body = await parseBody(req);
      next = mergeHeartbeatSettings(current, body, allowedAgentIds);
    } catch (e: any) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: String(e?.message || "heartbeat.settings_invalid"), field: "heartbeat_settings" });
    }
    writeJsonAtomic(HEARTBEAT_SETTINGS_PATH, next);
    try { startHeartbeatSchedulerPoller(); } catch {}
    return sendJson(res, 200, jsonOk(next));
  }
  if (req.method === "GET" && pathname === "/api/heartbeat/state") {
    const state = loadHeartbeatState();
    return sendJson(res, 200, jsonOk(state));
  }
  if (req.method === "GET" && pathname === "/api/consolidation/settings") {
    const loaded = loadOrgAgentsSnapshot();
    const allowedAgentIds = new Set(loaded.snapshot.agents.map((a) => a.id));
    const settings = loadConsolidationSettings(allowedAgentIds);
    return sendJson(res, 200, jsonOk(settings));
  }
  if (req.method === "POST" && pathname === "/api/consolidation/settings") {
    const loaded = loadOrgAgentsSnapshot();
    const allowedAgentIds = new Set(loaded.snapshot.agents.map((a) => a.id));
    const current = loadConsolidationSettings(allowedAgentIds);
    let next: ConsolidationSettings;
    try {
      const body = await parseBody(req);
      next = mergeConsolidationSettings(current, body, allowedAgentIds);
    } catch (e: any) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: String(e?.message || "consolidation.settings_invalid"), field: "consolidation_settings" });
    }
    writeJsonAtomic(CONSOLIDATION_SETTINGS_PATH, next);
    try { startConsolidationSchedulerPoller(); } catch {}
    return sendJson(res, 200, jsonOk(next));
  }
  if (req.method === "GET" && pathname === "/api/consolidation/state") {
    const state = loadConsolidationState();
    return sendJson(res, 200, jsonOk(state));
  }
  if (req.method === "GET" && pathname === "/api/routines/morning_brief/settings") {
    const settings = loadMorningBriefSettings();
    return sendJson(res, 200, jsonOk(settings));
  }
  if (req.method === "POST" && pathname === "/api/routines/morning_brief/settings") {
    const current = loadMorningBriefSettings();
    let next: MorningBriefSettings;
    try {
      const body = await parseBody(req);
      next = mergeMorningBriefSettings(current, body);
    } catch (e: any) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: String(e?.message || "morning_brief.settings_invalid"), field: "morning_brief_settings" });
    }
    writeJsonAtomic(MORNING_BRIEF_SETTINGS_PATH, next);
    try { startMorningBriefSchedulerPoller(); } catch {}
    return sendJson(res, 200, jsonOk(next));
  }
  if (req.method === "GET" && pathname === "/api/routines/morning_brief/state") {
    const state = loadMorningBriefState();
    return sendJson(res, 200, jsonOk(state));
  }
  if (req.method === "GET" && pathname === "/api/ops/quick_actions/status") {
    const out = buildOpsQuickActionsStatus();
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/ops/quick_actions/clear_stale_locks") {
    const body = await parseBody(req);
    const dryRun = isRecord(body) && body.dry_run === true;
    const out = runOpsClearStaleLocks(dryRun);
    appendOpsQuickActionsAuditInbox({
      title: "Ops quick action executed",
      body: clipText(`action=clear_stale_locks dry_run=${dryRun} cleared=${Array.isArray((out as any).cleared) ? (out as any).cleared.length : 0}`, 400),
      mention: false,
      links: { action: "clear_stale_locks", dry_run: dryRun },
    });
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/ops/quick_actions/reset_brakes") {
    const body = await parseBody(req);
    const dryRun = isRecord(body) && body.dry_run === true;
    const targets = isRecord(body) ? body.targets : undefined;
    const out = runOpsResetBrakes(targets, dryRun);
    appendOpsQuickActionsAuditInbox({
      title: "Ops quick action executed",
      body: clipText(`action=reset_brakes dry_run=${dryRun} updated=${Array.isArray((out as any).updated) ? (out as any).updated.length : 0}`, 400),
      mention: false,
      links: { action: "reset_brakes", dry_run: dryRun },
    });
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/ops/quick_actions/stabilize") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "ops_stabilize_payload_invalid" });
    const mode = String(body.mode || "dry_run").trim();
    const includeRunNow = body.include_run_now === true;
    const confirmToken = String(body.confirm_token || "").trim();
    if (!validateOpsQuickActionsConfirmToken(confirmToken)) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "ops_stabilize_confirm_token_invalid_or_expired", field: "confirm_token" });
    }
    const out = runOpsStabilize({ mode, include_run_now: includeRunNow });
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "GET" && pathname === "/api/ops/auto_stabilize/settings") {
    const out = loadOpsAutoStabilizeSettings();
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/ops/auto_stabilize/settings") {
    const body = await parseBody(req);
    const current = loadOpsAutoStabilizeSettings();
    const next = mergeOpsAutoStabilizeSettings(current, body);
    writeJsonAtomic(OPS_AUTO_STABILIZE_SETTINGS_PATH, next);
    try { startOpsAutoStabilizeMonitorPoller(); } catch {}
    return sendJson(res, 200, jsonOk(next));
  }
  if (req.method === "GET" && pathname === "/api/ops/auto_stabilize/state") {
    const out = loadOpsAutoStabilizeState();
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/ops/auto_stabilize/run_now") {
    const body = await parseBody(req);
    const dryRun = !(isRecord(body) && body.dry_run === false);
    if (!dryRun) {
      return sendJson(res, 200, jsonOk({ ok: true, note: "forced_dry_run_only", results: {}, inbox_appended: false }));
    }
    const out = runOpsAutoStabilizeDryRunNow("ops_auto_stabilize_manual");
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/ops/auto_stabilize/execute_safe_run") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "ops_auto_stabilize_execute_payload_invalid" });
    const confirmToken = String(body.confirm_token || "").trim();
    if (!validateOpsQuickActionsConfirmToken(confirmToken)) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "confirm_token_invalid_or_expired", field: "confirm_token" });
    }
    const includeRunNow = body.include_run_now === true;
    const dryRun = body.dry_run !== false;
    const sourceInboxId = String(body.source_inbox_id || "").trim();
    const out = runOpsAutoStabilizeExecuteSafeRun({
      dry_run: dryRun,
      include_run_now: includeRunNow,
      source_inbox_id: sourceInboxId,
    });
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "GET" && pathname === "/api/dashboard/yesterday_memo") {
    const loaded = loadOrgAgentsSnapshot();
    const allowedAgentIds = new Set(loaded.snapshot.agents.map((a) => a.id));
    const agentId = normalizeMemoryAgentId(url.searchParams.get("agent_id") || "facilitator");
    const categoryRaw = String(url.searchParams.get("category") || "episodes").trim();
    const limit = Math.max(1, Math.min(10, Math.floor(Number(url.searchParams.get("limit") || 1) || 1)));
    if (!agentId || !allowedAgentIds.has(agentId)) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "dashboard_yesterday_memo.agent_id_invalid", field: "agent_id" });
    }
    if (!isMemoryCategory(categoryRaw)) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "dashboard_yesterday_memo.category_invalid", field: "category" });
    }
    const category: MemoryCategory = categoryRaw;
    const latest = readLatestMemoryEntry(agentId, category);
    const item = latest.item
      ? {
        id: latest.item.id,
        ts: latest.item.ts,
        title: clipText(latest.item.title, MEMORY_TITLE_MAX),
        body: clipText(latest.item.body, YESTERDAY_MEMO_BODY_MAX),
      }
      : null;
    return sendJson(res, 200, jsonOk({
      agent_id: agentId,
      category,
      limit,
      item,
      skipped_invalid: latest.skipped_invalid,
      truncated: latest.truncated,
    }));
  }
  if (req.method === "GET" && pathname === "/api/dashboard/daily_loop") {
    const limitInboxItems = Number(url.searchParams.get("limit_inbox_items") || 10);
    const dashboard = buildDailyLoopDashboard(limitInboxItems);
    return sendJson(res, 200, jsonOk(dashboard));
  }
  if (req.method === "GET" && pathname === "/api/dashboard/next_actions") {
    const limit = Number(url.searchParams.get("limit") || 5);
    const out = buildDashboardNextActions(limit);
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/dashboard/recommended_profile/preflight") {
    const profile = computeRecommendedProfile();
    const applyPreview = applyAgentPresetInternal({
      preset_set_id: profile.preset_set_id,
      scope: "council",
      dry_run: true,
      actor_id: "ui_dashboard",
    });
    return sendJson(res, 200, jsonOk({
      ok: applyPreview.ok,
      recommended_profile: profile,
      apply_preview: applyPreview,
      exit_code: applyPreview.exit_code,
      reason: applyPreview.ok ? "" : (applyPreview.note || "ERR_PRESET_APPLY_FAILED"),
    }));
  }
  if (req.method === "POST" && pathname === "/api/dashboard/recommended_profile/apply") {
    const body = await parseBody(req);
    if (!isRecord(body)) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", {
        action: "dashboard_recommended_profile_apply",
        field: "body",
        reason: "payload_invalid",
      });
    }
    const confirmPhrase = String(body.confirm_phrase || "").trim();
    if (confirmPhrase !== DASHBOARD_RECOMMENDED_PROFILE_APPLY_CONFIRM) {
      return badRequestWithDetails(res, "ERR_CONFIRM_REQUIRED", {
        action: "dashboard_recommended_profile_apply",
        field: "confirm_phrase",
        expected: DASHBOARD_RECOMMENDED_PROFILE_APPLY_CONFIRM,
      });
    }
    const profile = computeRecommendedProfile();
    const applyResult = applyAgentPresetInternal({
      preset_set_id: profile.preset_set_id,
      scope: "council",
      dry_run: false,
      actor_id: "ui_dashboard",
    });
    return sendJson(res, 200, jsonOk({
      ok: applyResult.ok,
      recommended_profile: profile,
      apply_result: applyResult,
      exit_code: applyResult.exit_code,
      reason: applyResult.ok ? "" : (applyResult.note || "ERR_PRESET_APPLY_FAILED"),
    }));
  }
  if (req.method === "GET" && pathname === "/api/dashboard/quick_actions") {
    const out = buildDashboardQuickActions();
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "GET" && pathname === "/api/dashboard/tracker_history") {
    const limit = Number(url.searchParams.get("limit") || DASHBOARD_TRACKER_HISTORY_LIMIT_DEFAULT);
    const out = loadDashboardTrackerHistory(limit);
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/dashboard/tracker_history/append") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "dashboard_tracker_history_append_payload_invalid" });
    const out = appendDashboardTrackerHistoryItem({
      item: body.item,
      dry_run: body.dry_run === true,
    });
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/dashboard/quick_actions/run") {
    const body = await parseBody(req);
    const out = await runDashboardQuickActionsById(body);
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/dashboard/quick_actions/execute") {
    const body = await parseBody(req);
    if (!isRecord(body)) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", {
        action: "dashboard_quick_actions_execute",
        field: "body",
        reason: "payload_invalid",
      });
    }
    const id = normalizeDashboardQuickExecuteId(body.id || body.execute_id);
    if (!id) {
      return badRequestWithDetails(res, "ERR_NOT_ALLOWED", {
        action: "dashboard_quick_actions_execute",
        field: "id",
        reason: "id_not_allowed",
      });
    }
    const dryRun = body.dry_run === true;
    const confirmPhrase = String(body.confirm_phrase || "").trim();
    const skipExecuteConfirm = dryRun && id === "revert_active_profile_standard";
    if (!skipExecuteConfirm && confirmPhrase !== DASHBOARD_QUICK_ACTIONS_EXECUTE_CONFIRM) {
      return badRequestWithDetails(res, "ERR_CONFIRM_REQUIRED", {
        action: "dashboard_quick_actions_execute",
        id,
        field: "confirm_phrase",
        expected: DASHBOARD_QUICK_ACTIONS_EXECUTE_CONFIRM,
      });
    }
    if (!dryRun && id === "morning_brief_autopilot_start") {
      const applyConfirm = String(body.apply_confirm_phrase || "").trim();
      if (applyConfirm !== "APPLY") {
        return badRequestWithDetails(res, "ERR_CONFIRM_REQUIRED", {
          action: "dashboard_quick_actions_execute",
          id,
          field: "apply_confirm_phrase",
          which: "APPLY",
          expected: "APPLY",
        });
      }
    }
    const params = isRecord(body.params) ? body.params : {};
    const out = await runDashboardQuickActionsExecuteById({ id, dry_run: dryRun, params });
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "GET" && pathname === "/api/dashboard/thread_archive_scheduler") {
    const out = buildDashboardThreadArchiveScheduler();
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/dashboard/thread_archive_scheduler/run_now") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "dashboard_thread_archive_scheduler.run_now_payload_invalid" });
    if (body.dry_run !== true) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "dashboard_thread_archive_scheduler.run_now_dry_run_only" });
    }
    const out = runThreadArchiveSchedulerNow({
      dry_run: true,
      purpose: "run_now",
    });
    return sendJson(res, out.ok ? 200 : 500, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/routines/morning_brief/run_now") {
    const body = await parseBody(req);
    const dryRun = isRecord(body) && body.dry_run === true;
    const out = runMorningBriefNow(dryRun);
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/consolidation/run_now") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "consolidation.run_now_payload_invalid", field: "consolidation_run_now" });
    const agentId = String(body.agent_id || "").trim();
    if (!agentId) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "consolidation.run_now_agent_required", field: "agent_id" });
    const loaded = loadOrgAgentsSnapshot();
    const allowedAgentIds = new Set(loaded.snapshot.agents.map((a) => a.id));
    if (!(agentId === "all" || allowedAgentIds.has(agentId))) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "consolidation.run_now_agent_invalid", field: "agent_id" });
    }
    const out = runConsolidationNow({ agent_id: agentId, dry_run: body.dry_run === true });
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "POST" && pathname === "/api/heartbeat/run_now") {
    const loaded = loadOrgAgentsSnapshot();
    const allowedAgentIds = new Set(loaded.snapshot.agents.map((a) => a.id));
    const settings = loadHeartbeatSettings(allowedAgentIds);
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "heartbeat.run_now_payload_invalid", field: "heartbeat_run_now" });
    const agentId = normalizeMemoryAgentId(body.agent_id);
    const categoryRaw = String(body.category || settings.targets.category || "episodes");
    if (!agentId || !allowedAgentIds.has(agentId)) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "heartbeat.run_now_agent_invalid", field: "agent_id" });
    }
    if (!isMemoryCategory(categoryRaw)) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "heartbeat.run_now_category_invalid", field: "category" });
    }
    const limitsPatch = isRecord(body.limits) ? body.limits : {};
    const out = runHeartbeatNow({
      agent_id: agentId,
      category: categoryRaw,
      dry_run: body.dry_run === true,
      activity_limit: Math.max(1, Math.min(HEARTBEAT_ACTIVITY_LIMIT_MAX, Math.floor(Number(limitsPatch.activity_limit ?? settings.limits.activity_limit) || settings.limits.activity_limit))),
      inbox_limit: Math.max(1, Math.min(HEARTBEAT_INBOX_LIMIT_MAX, Math.floor(Number(limitsPatch.inbox_limit ?? settings.limits.inbox_limit) || settings.limits.inbox_limit))),
      runs_limit: Math.max(1, Math.min(HEARTBEAT_RUNS_LIMIT_MAX, Math.floor(Number(limitsPatch.runs_limit ?? settings.limits.runs_limit) || settings.limits.runs_limit))),
    });
    return sendJson(res, 200, jsonOk(out));
  }
  if (req.method === "GET" && pathname === "/api/heartbeat/autopilot_suggest_settings") {
    const settings = loadHeartbeatAutopilotSuggestSettings();
    return sendJson(res, 200, jsonOk(settings));
  }
  if (req.method === "POST" && pathname === "/api/heartbeat/autopilot_suggest_settings") {
    const current = loadHeartbeatAutopilotSuggestSettings();
    let next: HeartbeatAutopilotSuggestSettings;
    let body: unknown = {};
    try {
      body = await parseBody(req);
      next = mergeHeartbeatAutopilotSuggestSettings(current, body);
    } catch (e: any) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: String(e?.message || "heartbeat_suggest.settings_invalid"), field: "heartbeat_autopilot_suggest_settings" });
    }
    writeJsonAtomic(HEARTBEAT_SUGGEST_SETTINGS_PATH, next);
    if (isRecord(body) && body.auto_accept_enabled === true) {
      const state = loadHeartbeatAutopilotSuggestState();
      state.auto_accept_enabled_effective = true;
      state.failure_count = 0;
      state.last_error = "";
      saveHeartbeatAutopilotSuggestState(state);
    }
    return sendJson(res, 200, jsonOk(next));
  }
  if (req.method === "GET" && pathname === "/api/heartbeat/autopilot_suggest_state") {
    const state = loadHeartbeatAutopilotSuggestState();
    return sendJson(res, 200, jsonOk(state));
  }
  if (req.method === "GET" && pathname === "/api/heartbeat/autopilot_suggestions") {
    const limit = Math.max(1, Math.min(HEARTBEAT_SUGGESTIONS_LIMIT_MAX, Number(url.searchParams.get("limit") || 50)));
    const store = loadHeartbeatAutopilotSuggestionStore();
    const items = [...store.items].sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, limit);
    return sendJson(res, 200, jsonOk({ items }));
  }
  const hbSugAcceptMatch = pathname.match(/^\/api\/heartbeat\/autopilot_suggestions\/([^/]+)\/accept$/);
  if (req.method === "POST" && hbSugAcceptMatch) {
    const id = clipText(decodeURIComponent(hbSugAcceptMatch[1] || ""), 120).trim();
    if (!id) return badRequest(res, "heartbeat_suggestion.id_required");
    const body = await parseBody(req);
    const rankRaw = isRecord(body) && body.rank !== undefined ? Number(body.rank) : 1;
    if (!Number.isFinite(rankRaw) || !isHeartbeatSuggestionRank(Math.floor(rankRaw))) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "heartbeat_suggestion.rank_invalid", field: "rank" });
    }
    const requestedRank = Math.floor(rankRaw) as HeartbeatSuggestionRank;
    const presetRankRaw = isRecord(body) && body.preset_rank !== undefined ? Number(body.preset_rank) : NaN;
    const requestedPresetRank = Number.isFinite(presetRankRaw) && isHeartbeatSuggestionRank(Math.floor(presetRankRaw))
      ? (Math.floor(presetRankRaw) as HeartbeatSuggestionRank)
      : undefined;
    const accepted = acceptHeartbeatSuggestionInternal({
      suggestion_id: id,
      rank: requestedRank,
      preset_rank: requestedPresetRank,
      preset_set_id: isRecord(body) ? String(body.preset_set_id || "") : "",
      dry_run: isRecord(body) && body.dry_run === true,
      apply_preset: true,
      actor_id: "ui_discord",
    });
    if (!accepted.suggestion) return notFound(res);
    if (!accepted.ok) {
      return sendJson(res, 200, jsonOk({
        ok: false,
        reason: accepted.note || "ERR_PRESET_APPLY_FAILED",
        suggestion: accepted.suggestion,
        dry_run: accepted.dry_run,
        autopilot_started: false,
        autopilot_run_id: "",
        selected_preset_set_id: accepted.selected_preset_set_id || null,
        preset_apply_status: accepted.preset_apply_status || "failed",
        preset_preview: accepted.preset_apply_result,
      }));
    }
    if (accepted.autopilot_started && accepted.autopilot_run_id) {
      try {
        const inbox = {
          id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
          ts: nowIso(),
          thread_id: "heartbeat",
          msg_id: accepted.suggestion.id,
          role: "system",
          mention: false,
          title: "Autopilot started",
          body: clipText(`Autopilot started from suggestion. run_id=${accepted.autopilot_run_id} rank=${accepted.suggestion.selected_rank || 1}`, 2000),
          source: "heartbeat_suggest",
          links: { suggestion_id: accepted.suggestion.id, autopilot_run_id: accepted.autopilot_run_id, run_id: accepted.autopilot_run_id, artifact_paths: [] },
        };
        appendInboxEntry(inbox);
      } catch {
        // best-effort
      }
    }
    return sendJson(res, 200, jsonOk({
      ok: true,
      suggestion: accepted.suggestion,
      dry_run: accepted.dry_run,
      autopilot_started: accepted.autopilot_started,
      autopilot_run_id: accepted.autopilot_run_id,
      idempotent: accepted.idempotent,
      selected_preset_set_id: accepted.selected_preset_set_id || null,
      preset_apply_status: accepted.preset_apply_status || "not_applied",
      preset_preview: accepted.preset_apply_result,
    }));
  }
  const hbSugDismissMatch = pathname.match(/^\/api\/heartbeat\/autopilot_suggestions\/([^/]+)\/dismiss$/);
  if (req.method === "POST" && hbSugDismissMatch) {
    const id = clipText(decodeURIComponent(hbSugDismissMatch[1] || ""), 120).trim();
    if (!id) return badRequest(res, "heartbeat_suggestion.id_required");
    const store = loadHeartbeatAutopilotSuggestionStore();
    const item = store.items.find((x) => x.id === id);
    if (!item) return notFound(res);
    if (item.status !== "dismissed") {
      item.status = "dismissed";
      item.dismissed_at = nowIso();
      saveHeartbeatAutopilotSuggestionStore(store);
      try {
        const inbox = {
          id: `inbox_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
          ts: nowIso(),
          thread_id: "heartbeat",
          msg_id: item.id,
          role: "system",
          mention: false,
          title: "Suggestion dismissed",
          body: clipText(`Suggestion dismissed: ${item.id}`, 2000),
          source: "heartbeat_suggest",
          links: { suggestion_id: item.id, artifact_paths: [] },
        };
        appendInboxEntry(inbox);
      } catch {
        // best-effort
      }
    }
    return sendJson(res, 200, jsonOk({ suggestion: item }));
  }

  if (req.method === "GET" && pathname === "/api/activity") {
    const limit = Number(url.searchParams.get("limit") || 50);
    const after = parseCursorAfter(
      String(url.searchParams.get("after") || ""),
      String(url.searchParams.get("after_ts") || ""),
      String(url.searchParams.get("after_id") || ""),
    );
    const out = readActivityEvents(limit, after);
    const next_cursor = out.items.length > 0 ? `${out.items[out.items.length - 1].ts},${out.items[out.items.length - 1].id}` : "";
    return sendJson(res, 200, jsonOk({ items: out.items, next_cursor, skipped_invalid: out.skipped_invalid }));
  }
  if (req.method === "GET" && pathname === "/api/activity/stream") {
    const limit = Number(url.searchParams.get("limit") || ACTIVITY_STREAM_REPLAY_DEFAULT);
    registerActivitySubscriber(req, res, limit);
    return;
  }
  if (req.method === "POST" && pathname === "/api/activity/emit") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequest(res, "activity_emit_payload_invalid");
    if (!isActivityEventType(body.event_type)) return badRequest(res, "activity_emit.event_type_invalid");
    appendActivity({
      event_type: body.event_type,
      actor_id: body.actor_id === undefined || body.actor_id === null ? null : clipText(body.actor_id, 120),
      title: clipText(body.title, ACTIVITY_TITLE_MAX) || "activity",
      summary: clipText(body.summary, ACTIVITY_SUMMARY_MAX),
      refs: isRecord(body.refs) ? {
        thread_id: clipText(body.refs.thread_id, 120),
        run_id: clipText(body.refs.run_id, 120),
        request_id: clipText(body.refs.request_id, 120),
      } : {},
    });
    return sendJson(res, 200, jsonOk({ emitted: true }));
  }

  if (req.method === "POST" && pathname === "/api/council/run") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequest(res, "council_run_payload_invalid");
    const dryRun = body.dry_run === true;
    const autoOpsSnapshotFlag = body.auto_ops_snapshot === true;
    const autoEvidenceBundleFlag = body.auto_evidence_bundle === true;
    const autoReleaseBundleFlag = body.auto_release_bundle === true;
    const resume = body.resume === true;
    const resumeRunId = normalizeCouncilRunId(body.run_id);
    if (resume) {
      if (!resumeRunId) return badRequest(res, "council_run.resume_run_id_required");
      const existing = loadCouncilRunRecord(resumeRunId);
      if (!existing) return notFound(res);
      if (!(existing.status === "failed" || existing.status === "stopped" || existing.status === "canceled")) {
        return badRequest(res, "council_run.resume_not_allowed");
      }
      const resumed: CouncilRunRecord = {
        ...existing,
        status: "queued",
        stop_requested: false,
        can_resume: false,
        last_error: "",
        request_id: randomId("council_request"),
        updated_at: nowIso(),
        exports: sanitizeCouncilExportsState({
          ...(existing.exports || {}),
          auto_ops_snapshot: body.auto_ops_snapshot === undefined
            ? Boolean(existing.exports?.auto_ops_snapshot)
            : autoOpsSnapshotFlag,
          auto_evidence_bundle: body.auto_evidence_bundle === undefined
            ? Boolean(existing.exports?.auto_evidence_bundle)
            : autoEvidenceBundleFlag,
          auto_release_bundle: body.auto_release_bundle === undefined
            ? Boolean(existing.exports?.auto_release_bundle)
            : autoReleaseBundleFlag,
        }),
        thread_key: normalizeInboxThreadKey(existing.thread_key) || makeCouncilAutopilotThreadKey({
          request_id: existing.request_id,
          run_id: existing.run_id,
          mode: "execute",
        }).thread_key,
        thread_key_source: existing.thread_key_source || makeCouncilAutopilotThreadKey({
          request_id: existing.request_id,
          run_id: existing.run_id,
          mode: "execute",
        }).source,
      };
      saveCouncilRunRecord(resumed);
      writeCouncilRunRequest(resumed);
      appendActivity({
        event_type: "council_started",
        actor_id: "council_autopilot",
        title: "Council autopilot resumed",
        summary: `run_id=${resumed.run_id} from_step=${Number(resumed.current_step || resumed.step_count || 0)}`,
        refs: { thread_id: resumed.thread_id, run_id: resumed.run_id, request_id: resumed.request_id },
      });
      return sendJson(res, 200, jsonOk({
        ...resumed,
        inbox_thread_hint: { open_thread_endpoint: `/api/inbox/thread?key=${encodeURIComponent(String(resumed.thread_key || ""))}` },
      }));
    }
    try {
      const run = startCouncilRunInternal({
        topic: clipText(body.topic, COUNCIL_TOPIC_MAX).trim(),
        constraints: clipText(body.constraints, COUNCIL_CONSTRAINTS_MAX),
        thread_id: clipText(body.thread_id, 120).trim() || "general",
        max_rounds: Number(body.max_rounds ?? 2),
        auto_build: body.auto_build === true,
        auto_ops_snapshot: autoOpsSnapshotFlag,
        auto_evidence_bundle: autoEvidenceBundleFlag,
        auto_release_bundle: autoReleaseBundleFlag,
        dry_run: dryRun,
      });
      const payload = {
        ...run,
        inbox_thread_hint: { open_thread_endpoint: `/api/inbox/thread?key=${encodeURIComponent(String(run.thread_key || ""))}` },
        ...(dryRun ? {
          ...(() => {
            const assist = buildRoundRoleAssistContext();
            return {
              round_log_format_preview: buildRoleFormattedRoundBody({
                facilitator_decision: "現状の方針を維持",
                facilitator_next: "次ラウンドで品質チェック",
                critic_risk: "入力不足で判断が偏る",
                critic_counterexample: "失敗ケースの再現条件が未確認",
                operator_plan: "実装差分を小さく分割",
                operator_steps: "1)修正 2)smoke 3)gate",
                jester_break: "前提の時刻依存を疑う",
                jester_oversight: "dry_runと本実行の分岐漏れ",
                assist_context: assist,
              }),
              round_log_format_version: "v2_8",
              identity_hints_used: assist.identity_hints_used,
              memory_hints_used: assist.memory_hints_used,
              revert_suggestion_preview: buildCouncilRevertSuggestionPreview(run.thread_key),
            };
          })(),
        } : {}),
      };
      return sendJson(res, 200, jsonOk(payload));
    } catch (e: any) {
      return badRequest(res, String(e?.message || "council_run.start_failed"));
    }
  }
  if (req.method === "GET" && pathname === "/api/council/run/status") {
    const run_id = normalizeCouncilRunId(url.searchParams.get("run_id") || "");
    if (!run_id) return badRequest(res, "council_run.run_id_required");
    const run = loadCouncilRunRecord(run_id);
    if (!run) return notFound(res);
    const reconciled = reconcileCouncilAutoExports(run);
    try { runCouncilInboxTrackingSweep(); } catch { }
    const logs = readCouncilLogTail(run_id, Number(url.searchParams.get("log_limit") || 50));
    return sendJson(res, 200, jsonOk({ run: reconciled, logs: logs.items, skipped_invalid: logs.skipped_invalid }));
  }
  if (req.method === "POST" && (pathname === "/api/council/run/stop" || pathname === "/api/council/run/cancel")) {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequest(res, "council_cancel_payload_invalid");
    const run_id = normalizeCouncilRunId(body.run_id);
    if (!run_id) return badRequest(res, "council_cancel.run_id_required");
    const run = loadCouncilRunRecord(run_id);
    if (!run) return notFound(res);
    run.stop_requested = true;
    run.updated_at = nowIso();
    if (run.status === "queued") {
      run.status = "canceled";
      run.finished_at = run.updated_at;
      run.can_resume = true;
    }
    saveCouncilRunRecord(run);
    appendActivity({
      event_type: "council_finished",
      actor_id: "council_autopilot",
      title: "Council canceled",
      summary: `run_id=${run.run_id}`,
      refs: { thread_id: run.thread_id, run_id: run.run_id, request_id: run.request_id },
    });
    return sendJson(res, 200, jsonOk({ run }));
  }
  if (req.method === "POST" && pathname === "/api/council/artifact/queue") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequest(res, "council_artifact_payload_invalid");
    const run_id = normalizeCouncilRunId(body.run_id);
    const thread_id = clipText(body.thread_id, 120).trim() || "general";
    const answer_markdown = clipText(body.answer_markdown, FILE_CAP);
    const include_bundle = body.include_bundle !== false;
    if (!run_id) return badRequest(res, "council_artifact.run_id_required");
    if (!answer_markdown.trim()) return badRequest(res, "council_artifact.answer_markdown_required");
    const built = buildCouncilArtifactTaskYaml({ run_id, thread_id, answer_markdown, include_bundle });
    const queuedPath = path.join(QUEUE_PENDING_DIR, `${built.task_id}.yaml`);
    fs.writeFileSync(queuedPath, built.yaml_text, "utf8");
    return sendJson(res, 200, jsonOk({
      queued: true,
      task_id: built.task_id,
      queued_path: queuedPath.replaceAll("\\", "/"),
      answer_path: built.answer_path,
      bundle_path: include_bundle ? built.bundle_path : "",
    }));
  }

  if (req.method === "GET" && pathname === "/api/desktop/settings") {
    const settings = loadDesktopSettings();
    return sendJson(res, 200, jsonOk({ settings }));
  }
  if (req.method === "POST" && pathname === "/api/desktop/settings") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequest(res, "settings_payload_invalid");
    try {
      const current = loadDesktopSettings();
      const merged = mergeDesktopSettings(current, body);
      writeJsonAtomic(DESKTOP_SETTINGS_PATH, merged);
      return sendJson(res, 200, jsonOk({ settings: merged }));
    } catch (e: any) {
      return badRequest(res, String(e?.message || "settings_validation_failed"));
    }
  }
  if (req.method === "GET" && pathname === "/api/desktop/notify_state") {
    const notify_state = loadDesktopNotifyState();
    return sendJson(res, 200, jsonOk({ notify_state }));
  }

  if (req.method === "GET" && pathname === "/api/inbox/thread_archive_scheduler/settings") {
    const settings = loadThreadArchiveSchedulerSettings();
    return sendJson(res, 200, jsonOk(settings));
  }
  if (req.method === "POST" && pathname === "/api/inbox/thread_archive_scheduler/settings") {
    const body = await parseBody(req);
    if (!isRecord(body)) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "thread_archive_scheduler.settings_payload_invalid" });
    }
    const current = loadThreadArchiveSchedulerSettings();
    const next = patchThreadArchiveSchedulerSettings(current, body);
    if (next.safety.total_timeout_ms < next.safety.per_thread_timeout_ms) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "thread_archive_scheduler.total_timeout_lt_per_thread_timeout" });
    }
    writeJsonAtomic(THREAD_ARCHIVE_SCHEDULER_SETTINGS_PATH, next);
    return sendJson(res, 200, jsonOk(next));
  }
  if (req.method === "GET" && pathname === "/api/inbox/thread_archive_scheduler/state") {
    const settings = loadThreadArchiveSchedulerSettings();
    const state = loadThreadArchiveSchedulerState();
    return sendJson(res, 200, jsonOk({
      ...state,
      next_run_local: formatNextRunLocalFromState(settings, state),
    }));
  }
  if (req.method === "POST" && pathname === "/api/inbox/thread_archive_scheduler/run_now") {
    const body = await parseBody(req);
    if (!isRecord(body)) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "thread_archive_scheduler.run_now_payload_invalid" });
    }
    const dryRun = body.dry_run !== false;
    let overrideKeys: string[] | undefined;
    if (Array.isArray(body.thread_keys)) {
      overrideKeys = body.thread_keys.map((x) => normalizeInboxThreadKey(x)).filter((x) => !!x).slice(0, THREAD_ARCHIVE_SCHED_MAX_KEYS);
    }
    const out = runThreadArchiveSchedulerNow({
      dry_run: dryRun,
      override_thread_keys: overrideKeys,
      purpose: "run_now",
    });
    return sendJson(res, out.ok ? 200 : 500, jsonOk(out));
  }

  if (req.method === "GET" && pathname === "/api/inbox") {
    const limit = Number(url.searchParams.get("limit") || INBOX_LIMIT_MAX);
    const after_ts = String(url.searchParams.get("after_ts") || "");
    const out = readInboxItems(limit, after_ts);
    const next_cursor = out.items.length > 0 ? String(out.items[out.items.length - 1].ts || "") : "";
    return sendJson(res, 200, jsonOk({ items: out.items, next_cursor, skipped_invalid: out.skipped_invalid }));
  }
  if (req.method === "GET" && pathname === "/api/inbox/thread") {
    const key = normalizeInboxThreadKey(url.searchParams.get("key") || "");
    if (!key) return badRequest(res, "inbox_thread.key_invalid");
    const limit = Math.max(1, Math.min(INBOX_THREAD_LIMIT_MAX, Math.floor(Number(url.searchParams.get("limit") || 20) || 20)));
    const out = readInboxItemsByThreadKey(key, limit);
    return sendJson(res, 200, jsonOk({
      action: "inbox_thread",
      thread_key: key,
      count: out.items.length,
      items: out.items,
      skipped_invalid: out.skipped_invalid,
      exit_code: 0,
    }));
  }
  if (req.method === "POST" && pathname === "/api/inbox/thread/read_state") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "inbox_thread_read_state_payload_invalid" });
    const mode = String(body.mode || "").trim() || "mark_read";
    if (mode !== "mark_read") {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "inbox_thread_read_state.mode_invalid", expected: "mark_read" });
    }
    const threadKey = normalizeInboxThreadKey(body.thread_key);
    if (!threadKey) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "inbox_thread_read_state.thread_key_invalid", rule: "^[a-z0-9:_-]+$,len=1..80" });
    }
    const limitScan = Math.max(
      1,
      Math.min(INBOX_THREAD_READ_SCAN_MAX, Math.floor(Number(body.limit_scan) || INBOX_THREAD_READ_SCAN_DEFAULT)),
    );
    try {
      const out = markInboxThreadReadState(threadKey, limitScan);
      return sendJson(res, 200, jsonOk({
        action: "inbox_thread_read_state",
        thread_key: out.thread_key,
        marked_read: out.marked_read,
        scanned: out.scanned,
        exit_code: 0,
      }));
    } catch (e: any) {
      return sendJson(res, 500, {
        ok: false,
        reason: "inbox_thread_read_state_failed",
        details: {
          thread_key: threadKey,
          limit_scan: limitScan,
          message: String(e?.message || "unknown"),
        },
      });
    }
  }
  if (req.method === "POST" && pathname === "/api/inbox/thread/archive") {
    const body = await parseBody(req);
    if (!isRecord(body)) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "inbox_thread_archive_payload_invalid" });
    }
    const threadKey = normalizeInboxThreadKey(body.thread_key);
    if (!threadKey) {
      return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "inbox_thread_archive.thread_key_invalid", rule: "^[a-z0-9:_-]+$,len=1..80" });
    }
    const dryRun = body.dry_run === true;
    const maxItems = Math.max(
      1,
      Math.min(INBOX_THREAD_ARCHIVE_ITEMS_MAX, Math.floor(Number(body.max_items) || INBOX_THREAD_ARCHIVE_ITEMS_DEFAULT)),
    );
    const limitScan = Math.max(
      1,
      Math.min(INBOX_THREAD_ARCHIVE_SCAN_MAX, Math.floor(Number(body.limit_scan) || INBOX_THREAD_ARCHIVE_SCAN_DEFAULT)),
    );
    const tailBytes = Math.max(
      INBOX_THREAD_ARCHIVE_TAIL_BYTES_MIN,
      Math.min(INBOX_THREAD_ARCHIVE_TAIL_BYTES_MAX, Math.floor(Number(body.tail_bytes) || INBOX_THREAD_ARCHIVE_TAIL_BYTES_DEFAULT)),
    );
    const auditMode = String(body.audit_mode || "default").trim() === "none" ? "none" : "default";
    let sinceTs = clipText(body.since_ts, 80).trim();
    if (sinceTs) {
      const sinceMs = new Date(sinceTs).getTime();
      if (!Number.isFinite(sinceMs)) {
        return badRequestWithDetails(res, "ERR_BAD_REQUEST", { reason: "inbox_thread_archive.since_ts_invalid", value: sinceTs });
      }
    } else {
      const st = loadInboxThreadArchiveState();
      sinceTs = clipText(st.last_archived_ts_by_thread_key?.[threadKey], 80).trim();
    }
    try {
      const out = runInboxThreadArchive({
        thread_key: threadKey,
        dry_run: dryRun,
        max_items: maxItems,
        limit_scan: limitScan,
        since_ts: sinceTs,
        tail_bytes: tailBytes,
        audit_mode: auditMode,
      });
      if (!dryRun && auditMode !== "none") {
        try {
          appendInboxThreadArchivePerThreadAudit({
            thread_key: threadKey,
            archived: out.archived,
            archive_path: out.archive_path,
            since_ts: out.since_ts,
            note: out.note,
          });
        } catch {
          // best-effort
        }
      }
      return sendJson(res, 200, jsonOk(out));
    } catch (e: any) {
      const reason = String(e?.message || "unknown");
      if (auditMode !== "none") {
        try {
          appendInboxThreadArchivePerThreadAudit({
            thread_key: threadKey,
            archived: 0,
            archive_path: "",
            since_ts: sinceTs,
            note: "",
            failed: true,
            reason,
          });
        } catch {
          // best-effort
        }
      }
      return sendJson(res, 500, {
        ok: false,
        reason: "inbox_thread_archive_failed",
        details: {
          thread_key: threadKey,
          dry_run: dryRun,
          max_items: maxItems,
          limit_scan: limitScan,
          tail_bytes: tailBytes,
          audit_mode: auditMode,
          since_ts: sinceTs,
          message: reason,
          exit_code: 1,
        },
      });
    }
  }
  if (req.method === "GET" && pathname === "/api/inbox/read_state") {
    return sendJson(res, 200, jsonOk({ read_state: loadInboxReadState() }));
  }
  if (req.method === "POST" && pathname === "/api/inbox/read_state") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequest(res, "inbox_read_state_payload_invalid");
    const current = loadInboxReadState();
    const next: InboxReadState = {
      global_last_read_ts: current.global_last_read_ts || "",
      by_thread: { ...(current.by_thread || {}) },
      thread_keys: { ...(current.thread_keys || {}) },
    };
    const threadId = String(body.thread_id || "").trim();
    if (body.last_read_ts !== undefined) {
      if (typeof body.last_read_ts !== "string") return badRequest(res, "inbox_read_state.last_read_ts_type_invalid");
      if (!threadId) {
        next.global_last_read_ts = body.last_read_ts;
      } else {
        next.by_thread![threadId] = { ...(next.by_thread![threadId] || {}), last_read_ts: body.last_read_ts };
      }
    }
    if (body.last_read_id !== undefined) {
      if (typeof body.last_read_id !== "string") return badRequest(res, "inbox_read_state.last_read_id_type_invalid");
      if (!threadId) return badRequest(res, "inbox_read_state.thread_id_required_for_last_read_id");
      next.by_thread![threadId] = { ...(next.by_thread![threadId] || {}), last_read_id: body.last_read_id };
    }
    writeJsonAtomic(INBOX_READ_STATE_PATH, next);
    return sendJson(res, 200, jsonOk({ read_state: next }));
  }
  if (req.method === "POST" && pathname === "/api/inbox/compact") {
    const body = await parseBody(req);
    const max_lines = Number(isRecord(body) && body.max_lines !== undefined ? body.max_lines : 5000);
    const dry_run = Boolean(isRecord(body) && body.dry_run === true);
    if (!Number.isFinite(max_lines) || max_lines < 1) return badRequest(res, "inbox_compact.max_lines_invalid");
    const out = runInboxCompact(max_lines, dry_run, 5000);
    const status = out.exit_code === 0 ? 200 : 500;
    return sendJson(res, status, jsonOk(out));
  }

  if (req.method === "POST" && pathname === "/api/taskify/drafts") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequest(res, "taskify_draft_payload_invalid");
    const source = cleanTaskifySource(body.source);
    const links = cleanLinks(body.links);
    const text = clipText(body.text, 12000);
    const id = randomId("draft");
    const title = makeTaskifyTitle(body.title, text);
    const built = buildTaskifyTaskYaml({ id, title, text, source, links });
    const item: TaskifyDraft = {
      id,
      ts: nowIso(),
      source,
      title,
      task_yaml: built.task_yaml,
      generated_by: built.generated_by,
      notes: clipText(body.notes || built.notes, 400),
    };
    appendJsonlAtomic(TASKIFY_DRAFTS_PATH, `${JSON.stringify(item)}\n`);
    return sendJson(res, 200, jsonOk(withTaskifySafety(item)));
  }
  if (req.method === "GET" && pathname === "/api/taskify/drafts") {
    const limit = Number(url.searchParams.get("limit") || 50);
    const out = readTaskifyDrafts(limit);
    return sendJson(res, 200, jsonOk({ items: out.items.map(withTaskifySafety), skipped_invalid: out.skipped_invalid }));
  }
  const taskifyMatch = pathname.match(/^\/api\/taskify\/drafts\/([^/]+)$/);
  if (taskifyMatch && req.method === "GET") {
    const id = decodeURIComponent(taskifyMatch[1]);
    const item = readTaskifyDraftById(id);
    if (!item) return notFound(res);
    return sendJson(res, 200, jsonOk(withTaskifySafety(item)));
  }
  if (taskifyMatch && req.method === "DELETE") {
    const id = decodeURIComponent(taskifyMatch[1]);
    const removed = deleteTaskifyDraftById(id);
    if (!removed) return notFound(res);
    return sendJson(res, 200, jsonOk({ id, deleted: true }));
  }
  if (req.method === "GET" && pathname === "/api/taskify/queue/status") {
    const requestId = String(url.searchParams.get("request_id") || "").trim();
    const draftId = String(url.searchParams.get("draft_id") || "").trim();
    if (requestId) {
      const item = getTaskifyTrackingForRequest(requestId);
      return sendJson(res, 200, jsonOk({ item, items: item ? [item] : [] }));
    }
    if (draftId) {
      const items = getTaskifyTrackingForDraft(draftId);
      return sendJson(res, 200, jsonOk({ item: items[0] || null, items }));
    }
    const items = loadTaskifyTrackingEntries().slice(-50).reverse();
    return sendJson(res, 200, jsonOk({ item: items[0] || null, items }));
  }
  if (req.method === "POST" && pathname === "/api/taskify/queue") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequest(res, "taskify_queue_payload_invalid");
    const draftId = String(body.draft_id || "").trim();
    if (!draftId) return badRequest(res, "taskify_queue.draft_id_required");
    const draft = readTaskifyDraftById(draftId);
    if (!draft) return notFound(res);
    const safety = evaluateTaskifyDraftSafety(draft);
    if (!safety.safe) {
      return badRequestWithDetails(res, "ERR_TASKIFY_UNSAFE", {
        draft_id: draftId,
        reasons: safety.reasons,
        ...safety.details,
      });
    }
    let parsedDoc: unknown;
    try {
      parsedDoc = YAML.parse(String(draft.task_yaml || ""));
    } catch {
      return badRequestWithDetails(res, "ERR_TASKIFY_UNSAFE", { draft_id: draftId, reasons: ["yaml_parse_failed"] });
    }
    if (!isRecord(parsedDoc)) {
      return badRequestWithDetails(res, "ERR_TASKIFY_UNSAFE", { draft_id: draftId, reasons: ["yaml_root_invalid"] });
    }
    const requestId = randomId("taskify_queue");
    const doc: Record<string, any> = { ...parsedDoc };
    const metadata: Record<string, any> = isRecord(doc.metadata) ? { ...doc.metadata } : {};
    doc.metadata = metadata;
    const baseTaskId = String(metadata.id || `task_taskify_${draftId}`);
    const uniqueTaskId = `${baseTaskId}_q_${new Date().toISOString().replace(/[:.]/g, "-")}`;
    metadata.id = uniqueTaskId;
    const tags = Array.isArray(metadata.tags) ? metadata.tags.map((x: unknown) => String(x)) : [];
    if (!tags.includes("taskify")) tags.push("taskify");
    tags.push(`taskify_request_id:${requestId}`);
    tags.push(`taskify_draft_id:${draftId}`);
    metadata.tags = tags.slice(-20);
    const runtime = isRecord(doc.runtime) ? { ...doc.runtime } : {};
    const runtimeMeta = isRecord(runtime.meta) ? { ...runtime.meta } : {};
    runtimeMeta.taskify_request_id = requestId;
    runtimeMeta.taskify_draft_id = draftId;
    runtime.meta = runtimeMeta;
    doc.runtime = runtime;

    const queuedYaml = YAML.stringify(doc);
    const queuedPath = path.join(QUEUE_PENDING_DIR, `${uniqueTaskId}.yaml`);
    fs.writeFileSync(queuedPath, queuedYaml, "utf8");
    addTaskifyTrackingEntry({
      request_id: requestId,
      draft_id: draftId,
      queued_at: nowIso(),
      status: "queued",
      run_id: "",
      last_checked_at: "",
      inbox_notified_at: "",
      done_at: "",
      note: "tracking_enabled",
    });
    try { runTaskifyTrackingSweep(); } catch {}
    return sendJson(res, 200, jsonOk({
      queued: true,
      request_id: requestId,
      task_id: uniqueTaskId,
      queued_path: queuedPath.replaceAll("\\", "/"),
      tracking_enabled: true,
      note: "taskify_safe_queue_ok",
    }));
  }

  if (req.method === "POST" && pathname === "/api/export/morning_brief_bundle") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequest(res, "morning_brief_bundle_payload_invalid");
    const localDate = localDateYmd(new Date());
    const targetDate = parseLocalDateInput(body.date, localDate);
    const includeOpsSnapshot = body.include_ops_snapshot !== false;
    const dryRun = body.dry_run === true;
    const dateStamp = targetDate.replaceAll("-", "");
    const briefRel = `written/morning_brief_${dateStamp}.md`;
    const briefTaskPath = `written/morning_brief_${dateStamp}.md`;
    const manifestRel = `bundles/morning_brief_bundle_manifest_${dateStamp}.json`;
    const manifestTaskPath = `bundles/morning_brief_bundle_manifest_${dateStamp}.json`;
    const zipRel = `bundles/morning_brief_bundle_${dateStamp}.zip`;
    const md = buildMorningBriefBundleMarkdown({ date: targetDate, include_ops_snapshot: includeOpsSnapshot });
    const manifest = {
      kind: "morning_brief_bundle",
      date: targetDate,
      generated_at: nowIso(),
      files: [briefRel, manifestRel],
      include_ops_snapshot: includeOpsSnapshot,
    };
    const manifestText = clipText(JSON.stringify(manifest, null, 2), FILE_CAP);
    if (dryRun) {
      return sendJson(res, 200, jsonOk({
        action: "morning_brief_bundle",
        queued: false,
        dry_run: true,
        plan: {
          steps: [
            { kind: "file_write", path: briefRel },
            { kind: "file_write", path: manifestRel },
            { kind: "archive_zip", zip_path: zipRel, inputs: [briefRel, manifestRel] },
          ],
          acceptances: [
            { type: "artifact_exists", path: zipRel },
            { type: "artifact_exists", path: manifestRel },
            { type: "artifact_zip_entry_exists", zip_path: zipRel, entry: briefRel },
            { type: "artifact_zip_entry_exists", zip_path: zipRel, entry: manifestRel },
            { type: "artifact_json_pointer_equals", path: `written/${manifestRel}`, pointer: "/date", equals: targetDate },
            { type: "artifact_json_pointer_gte", path: `written/${manifestRel}`, pointer: "/files/length", value: 2 },
          ],
        },
        would_enqueue: false,
        suggested_paths: { zip_path: zipRel, manifest_path: manifestRel, brief_path: briefRel },
        preview: clipText(md, 2000),
        exit_code: 0,
      }));
    }

    const stamp = ymdHmsStamp();
    const requestId = randomId("morning_brief_bundle");
    const taskId = `task_ui_morning_brief_bundle_${stamp}`;
    const doc: Record<string, any> = {
      apiVersion: "v1",
      kind: "pipeline",
      metadata: {
        id: taskId,
        role: "implementer",
        assignee: "implementer_01",
        created_at: nowIso(),
        title: "Recipe: morning brief bundle",
        category: "implementer",
        tags: ["morning_brief_bundle", `morning_brief_bundle_request_id:${requestId}`],
      },
      artifact: { mirror_run_meta: true },
      runtime: {
        timeout_ms: 120000,
        meta: {
          morning_brief_bundle_request_id: requestId,
          morning_brief_bundle_date: targetDate,
          morning_brief_bundle_include_ops_snapshot: includeOpsSnapshot,
        },
      },
      steps: [
        {
          id: "step1_write_brief",
          task: {
            kind: "file_write",
            files: [{ path: briefTaskPath, text: md, mode: "overwrite" }],
          },
        },
        {
          id: "step2_write_manifest",
          task: {
            kind: "file_write",
            files: [{ path: manifestTaskPath, text: manifestText, mode: "overwrite" }],
          },
        },
        {
          id: "step3_archive_bundle",
          task: {
            kind: "archive_zip",
            inputs: [briefRel, manifestRel],
            output: { zip_path: zipRel, manifest_path: manifestRel },
            options: { follow_symlinks: false },
            limits: { max_files: 50, max_total_bytes: FILE_CAP },
          },
        },
      ],
      acceptance: [
        { type: "artifact_exists", path: zipRel },
        { type: "artifact_exists", path: manifestRel },
        { type: "artifact_zip_entry_exists", zip_path: zipRel, entry: briefRel },
        { type: "artifact_zip_entry_exists", zip_path: zipRel, entry: manifestRel },
        { type: "artifact_json_pointer_equals", path: `written/${manifestRel}`, pointer: "/date", equals: targetDate },
        { type: "artifact_json_pointer_gte", path: `written/${manifestRel}`, pointer: "/files/length", value: 2 },
      ],
    };
    const queuedPath = path.join(QUEUE_PENDING_DIR, `${taskId}.yaml`);
    fs.writeFileSync(queuedPath, YAML.stringify(doc), "utf8");
    const queuedAt = nowIso();
    const reqRows = loadMorningBriefBundleRequests();
    reqRows.push({
      request_id: requestId,
      task_id: taskId,
      queued_path: queuedPath.replaceAll("\\", "/"),
      created_at: queuedAt,
      date: targetDate,
      include_ops_snapshot: includeOpsSnapshot,
    });
    saveMorningBriefBundleRequests(reqRows);
    addMorningBriefBundleTrackingEntry({
      request_id: requestId,
      queued_at: queuedAt,
      status: "queued",
      run_id: "",
      notified: false,
      zip_path: "",
      manifest_path: "",
      task_id: taskId,
      date: targetDate,
      last_checked_at: "",
      notified_at: "",
    });
    try { runMorningBriefBundleTrackingSweep(); } catch {}
    return sendJson(res, 200, jsonOk({
      action: "morning_brief_bundle",
      queued: true,
      request_id: requestId,
      task_id: taskId,
      queued_path: queuedPath.replaceAll("\\", "/"),
      tracking_enabled: true,
      suggested_paths: { zip_path: zipRel, manifest_path: manifestRel, brief_path: briefRel },
      include_ops_snapshot: includeOpsSnapshot,
      exit_code: 0,
    }));
  }

  if (req.method === "GET" && pathname === "/api/export/morning_brief_bundle/status") {
    const requestId = String(url.searchParams.get("request_id") || "").trim();
    if (!requestId) return badRequest(res, "morning_brief_bundle.request_id_required");
    const reqRows = loadMorningBriefBundleRequests();
    const req = reqRows.find((x) => x.request_id === requestId);
    if (!req) return notFound(res);
    try { runMorningBriefBundleTrackingSweep(); } catch {}
    const tracked = getMorningBriefBundleTrackingByRequest(requestId);
    const run = findMorningBriefBundleRun(req.task_id, requestId);
    const queuedExists = fs.existsSync(path.join(QUEUE_PENDING_DIR, `${req.task_id}.yaml`));
    const status = tracked?.status || run?.status || (queuedExists ? "queued" : "running");
    return sendJson(res, 200, jsonOk({
      request_id: requestId,
      status,
      run_id: tracked?.run_id || run?.run_id || "",
      notified: tracked?.notified === true,
      zip_path: tracked?.zip_path || run?.zip_path || "",
      manifest_path: tracked?.manifest_path || run?.manifest_path || "",
      queued_at: tracked?.queued_at || req.created_at,
      queued_path: req.queued_path,
      date: req.date,
      include_ops_snapshot: req.include_ops_snapshot,
    }));
  }

  if (req.method === "POST" && pathname === "/api/export/evidence_bundle") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequest(res, "evidence_export_payload_invalid");
    const maxRunsInput = Number(body.max_runs ?? 20);
    if (!Number.isFinite(maxRunsInput) || maxRunsInput < 1 || maxRunsInput > EVIDENCE_EXPORT_MAX_RUNS) {
      return badRequest(res, "evidence_export.max_runs_invalid");
    }
    const includeArchives = Boolean(body.include_archives === true);
    const dryRun = Boolean(body.dry_run === true);
    const maxRuns = Math.max(1, Math.min(EVIDENCE_EXPORT_MAX_RUNS, Math.floor(maxRunsInput)));
    const planned = buildEvidenceExportInputs(maxRuns, includeArchives);
    if (dryRun) {
      return sendJson(res, 200, jsonOk({
        action: "evidence_export_bundle",
        queued: false,
        dry_run: true,
        max_runs: maxRuns,
        include_archives: includeArchives,
        run_ids: planned.run_ids,
        total_inputs: planned.inputs.length,
        caps: { max_files: 2000, max_total_bytes: 52428800, per_file_bytes: 524288 },
        exit_code: 0,
      }));
    }

    const templatePath = path.join(RECIPES_TEMPLATE_DIR, "recipe_evidence_export_bundle.yaml");
    if (!fs.existsSync(templatePath)) return notFound(res);
    let doc: Record<string, any>;
    try {
      const parsed = YAML.parse(fs.readFileSync(templatePath, "utf8"));
      if (!isRecord(parsed)) return badRequest(res, "evidence_export.template_invalid");
      doc = { ...parsed };
    } catch {
      return badRequest(res, "evidence_export.template_parse_failed");
    }

    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "_");
    const requestId = randomId("evidence_export");
    const taskId = `task_ui_evidence_export_${stamp}`;
    const metadata: Record<string, any> = isRecord(doc.metadata) ? { ...doc.metadata } : {};
    metadata.id = taskId;
    metadata.title = "Recipe: evidence export bundle";
    const tags = Array.isArray(metadata.tags) ? metadata.tags.map((x: unknown) => String(x)) : [];
    tags.push("evidence_export_bundle");
    tags.push(`evidence_request_id:${requestId}`);
    metadata.tags = Array.from(new Set(tags)).slice(-20);
    doc.metadata = metadata;
    const runtime: Record<string, any> = isRecord(doc.runtime) ? { ...doc.runtime } : {};
    const runtimeMeta: Record<string, any> = isRecord(runtime.meta) ? { ...runtime.meta } : {};
    runtimeMeta.evidence_request_id = requestId;
    runtimeMeta.evidence_max_runs = maxRuns;
    runtimeMeta.evidence_include_archives = includeArchives;
    runtime.meta = runtimeMeta;
    doc.runtime = runtime;

    const steps = Array.isArray(doc.steps) ? doc.steps.slice() : [];
    if (steps.length < 2 || !isRecord(steps[1]) || !isRecord((steps[1] as any).task)) {
      return badRequest(res, "evidence_export.template_steps_invalid");
    }
    const archiveStep: Record<string, any> = { ...(steps[1] as Record<string, any>) };
    const archiveTask: Record<string, any> = { ...(archiveStep.task as Record<string, any>) };
    archiveTask.kind = "archive_zip";
    archiveTask.inputs = planned.inputs;
    archiveTask.output = {
      zip_path: `bundles/evidence_${stamp}.zip`,
      manifest_path: `bundles/evidence_${stamp}_manifest.json`,
    };
    archiveTask.options = { follow_symlinks: false };
    archiveTask.limits = { max_files: 2000, max_total_bytes: 52428800 };
    archiveStep.task = archiveTask;
    steps[1] = archiveStep;
    doc.steps = steps;

    const queuedPath = path.join(QUEUE_PENDING_DIR, `${taskId}.yaml`);
    fs.writeFileSync(queuedPath, YAML.stringify(doc), "utf8");

    const queuedAt = nowIso();
    const rec = loadEvidenceExportRequests();
    rec.push({
      request_id: requestId,
      task_id: taskId,
      queued_path: queuedPath.replaceAll("\\", "/"),
      created_at: queuedAt,
      max_runs: maxRuns,
      include_archives: includeArchives,
    });
    saveEvidenceExportRequests(rec);
    addEvidenceExportTrackingEntry({
      request_id: requestId,
      queued_at: queuedAt,
      status: "queued",
      run_id: "",
      notified: false,
      bundle_zip_path: "",
      bundle_manifest_path: "",
      task_id: taskId,
      last_checked_at: "",
      notified_at: "",
    });
    try { runEvidenceExportTrackingSweep(); } catch {}

    return sendJson(res, 200, jsonOk({
      action: "evidence_export_bundle",
      queued: true,
      request_id: requestId,
      task_id: taskId,
      queued_path: queuedPath.replaceAll("\\", "/"),
      max_runs: maxRuns,
      include_archives: includeArchives,
      run_ids: planned.run_ids,
      total_inputs: planned.inputs.length,
      caps: { max_files: 2000, max_total_bytes: 52428800, per_file_bytes: 524288 },
      exit_code: 0,
    }));
  }

  if (req.method === "GET" && pathname === "/api/export/evidence_bundle/status") {
    const requestId = String(url.searchParams.get("request_id") || "").trim();
    if (!requestId) return badRequest(res, "evidence_export.request_id_required");
    const items = loadEvidenceExportRequests();
    const item = items.find((x) => x.request_id === requestId) || null;
    if (!item) return notFound(res);
    try { runEvidenceExportTrackingSweep(); } catch {}
    const tracked = getEvidenceExportTrackingByRequest(item.request_id);
    const run = findEvidenceExportRun(item.task_id, item.request_id);
    const queuedExists = fs.existsSync(path.join(QUEUE_PENDING_DIR, `${item.task_id}.yaml`));
    const status = tracked?.status || (run ? run.status : (queuedExists ? "queued" : "unknown"));
    return sendJson(res, 200, jsonOk({
      request_id: item.request_id,
      task_id: item.task_id,
      status,
      run_id: tracked?.run_id || run?.run_id || "",
      notified: tracked?.notified === true,
      bundle_zip_path: tracked?.bundle_zip_path || run?.bundle_zip_path || "",
      bundle_manifest_path: tracked?.bundle_manifest_path || run?.bundle_manifest_path || "",
      queued_path: item.queued_path,
      queued_at: tracked?.queued_at || item.created_at,
      created_at: tracked?.queued_at || item.created_at,
      max_runs: item.max_runs,
      include_archives: item.include_archives,
    }));
  }

  if (req.method === "POST" && pathname === "/api/export/ops_snapshot") {
    const body = await parseBody(req);
    if (!isRecord(body)) return badRequest(res, "ops_snapshot_payload_invalid");
    const inboxLimitInput = Number(body.inbox_limit ?? 20);
    const runsLimitInput = Number(body.runs_limit ?? 10);
    if (!Number.isFinite(inboxLimitInput) || inboxLimitInput < 1 || inboxLimitInput > 200) {
      return badRequest(res, "ops_snapshot.inbox_limit_invalid");
    }
    if (!Number.isFinite(runsLimitInput) || runsLimitInput < 1 || runsLimitInput > 50) {
      return badRequest(res, "ops_snapshot.runs_limit_invalid");
    }
    const dryRun = Boolean(body.dry_run === true);
    const inboxLimit = Math.max(1, Math.min(20, Math.floor(inboxLimitInput)));
    const runsLimit = Math.max(1, Math.min(10, Math.floor(runsLimitInput)));
    const built = buildOpsSnapshotMarkdown({ inbox_limit: inboxLimit, runs_limit: runsLimit });
    const stamp = ymdHmsStamp();
    const outputPath = `ops_snapshot_${stamp}.md`;
    const snapshotText = built.text.replace("# Ops Snapshot", `# Ops Snapshot\n\n- output_file: ${outputPath}`);
    if (dryRun) {
      return sendJson(res, 200, jsonOk({
        action: "ops_snapshot",
        queued: false,
        dry_run: true,
        inbox_limit: inboxLimit,
        runs_limit: runsLimit,
        output_path: `written/${outputPath}`,
        missing_sections: built.missing_sections,
        preview: clipText(snapshotText, 2000),
        exit_code: 0,
      }));
    }

    const templatePath = path.join(RECIPES_TEMPLATE_DIR, "recipe_ops_snapshot.yaml");
    if (!fs.existsSync(templatePath)) return notFound(res);
    let doc: Record<string, any>;
    try {
      const parsed = YAML.parse(fs.readFileSync(templatePath, "utf8"));
      if (!isRecord(parsed)) return badRequest(res, "ops_snapshot.template_invalid");
      doc = { ...parsed };
    } catch {
      return badRequest(res, "ops_snapshot.template_parse_failed");
    }

    const requestId = randomId("ops_snapshot");
    const taskId = `task_ui_ops_snapshot_${stamp}`;
    const metadata: Record<string, any> = isRecord(doc.metadata) ? { ...doc.metadata } : {};
    metadata.id = taskId;
    metadata.title = "Recipe: ops snapshot";
    const tags = Array.isArray(metadata.tags) ? metadata.tags.map((x: unknown) => String(x)) : [];
    tags.push("ops_snapshot");
    tags.push(`ops_snapshot_request_id:${requestId}`);
    metadata.tags = Array.from(new Set(tags)).slice(-20);
    doc.metadata = metadata;
    const runtime: Record<string, any> = isRecord(doc.runtime) ? { ...doc.runtime } : {};
    const runtimeMeta: Record<string, any> = isRecord(runtime.meta) ? { ...runtime.meta } : {};
    runtimeMeta.ops_snapshot_request_id = requestId;
    runtimeMeta.ops_snapshot_inbox_limit = inboxLimit;
    runtimeMeta.ops_snapshot_runs_limit = runsLimit;
    runtime.meta = runtimeMeta;
    doc.runtime = runtime;

    const steps = Array.isArray(doc.steps) ? doc.steps.slice() : [];
    if (steps.length < 1 || !isRecord(steps[0]) || !isRecord((steps[0] as any).task)) {
      return badRequest(res, "ops_snapshot.template_steps_invalid");
    }
    const writeStep: Record<string, any> = { ...(steps[0] as Record<string, any>) };
    const writeTask: Record<string, any> = { ...(writeStep.task as Record<string, any>) };
    writeTask.kind = "file_write";
    writeTask.files = [{ path: outputPath, text: snapshotText, mode: "overwrite" }];
    writeStep.task = writeTask;
    steps[0] = writeStep;
    doc.steps = steps;

    const acceptance = Array.isArray(doc.acceptance) ? doc.acceptance.slice() : [];
    for (const acc of acceptance) {
      if (!isRecord(acc)) continue;
      if (acc.path !== undefined) acc.path = `written/${outputPath}`;
    }
    doc.acceptance = acceptance;

    const queuedPath = path.join(QUEUE_PENDING_DIR, `${taskId}.yaml`);
    fs.writeFileSync(queuedPath, YAML.stringify(doc), "utf8");
    const queuedAt = nowIso();
    const rec = loadOpsSnapshotRequests();
    rec.push({
      request_id: requestId,
      task_id: taskId,
      queued_path: queuedPath.replaceAll("\\", "/"),
      created_at: queuedAt,
      inbox_limit: inboxLimit,
      runs_limit: runsLimit,
    });
    saveOpsSnapshotRequests(rec);
    addOpsSnapshotTrackingEntry({
      request_id: requestId,
      queued_at: queuedAt,
      status: "queued",
      run_id: "",
      notified: false,
      snapshot_path: "",
      note: "tracking_enabled",
      last_checked_at: "",
      notified_at: "",
      task_id: taskId,
    });
    try { runOpsSnapshotTrackingSweep(); } catch {}

    return sendJson(res, 200, jsonOk({
      action: "ops_snapshot",
      queued: true,
      request_id: requestId,
      task_id: taskId,
      queued_path: queuedPath.replaceAll("\\", "/"),
      inbox_limit: inboxLimit,
      runs_limit: runsLimit,
      output_path: `written/${outputPath}`,
      missing_sections: built.missing_sections,
      exit_code: 0,
    }));
  }

  if (req.method === "GET" && pathname === "/api/export/ops_snapshot/status") {
    const requestId = String(url.searchParams.get("request_id") || "").trim();
    if (!requestId) return badRequest(res, "ops_snapshot.request_id_required");
    const items = loadOpsSnapshotRequests();
    const item = items.find((x) => x.request_id === requestId) || null;
    if (!item) return notFound(res);
    try { runOpsSnapshotTrackingSweep(); } catch {}
    const tracked = getOpsSnapshotTrackingByRequest(item.request_id);
    const run = findOpsSnapshotRun(item.task_id, item.request_id);
    const queuedExists = fs.existsSync(path.join(QUEUE_PENDING_DIR, `${item.task_id}.yaml`));
    const status = tracked?.status || (run ? run.status : (queuedExists ? "queued" : "unknown"));
    return sendJson(res, 200, jsonOk({
      request_id: item.request_id,
      task_id: item.task_id,
      status,
      run_id: tracked?.run_id || run?.run_id || "",
      notified: tracked?.notified === true,
      snapshot_path: tracked?.snapshot_path || run?.snapshot_path || "",
      queued_path: item.queued_path,
      queued_at: tracked?.queued_at || item.created_at,
      created_at: tracked?.queued_at || item.created_at,
      inbox_limit: item.inbox_limit,
      runs_limit: item.runs_limit,
    }));
  }

  if (req.method === "GET" && pathname === "/api/ssot/recipes") {
    const payload = readJson(RECIPES_SSOT_PATH, { recipes: [] });
    return sendJson(res, 200, jsonOk(payload));
  }
  if (req.method === "GET" && pathname === "/api/ssot/contract") {
    const payload = readJson(CONTRACT_SSOT_PATH, {});
    return sendJson(res, 200, jsonOk(payload));
  }

  if (req.method === "GET" && pathname === "/api/runs") {
    const limit = Number(url.searchParams.get("limit") || 50);
    return sendJson(res, 200, jsonOk({ runs: listRuns(limit) }));
  }

  const runMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (req.method === "GET" && runMatch) {
    const runId = runMatch[1];
    const artifacts = loadRunArtifacts(runId);
    const result = loadRunResultYaml(runId);
    const runDir = path.join(RUNS_DIR, runId);
    if (!fs.existsSync(runDir)) return notFound(res);
    return sendJson(res, 200, jsonOk({ run_id: runId, artifacts, result }));
  }

  const runArtifactsMatch = pathname.match(/^\/api\/runs\/([^/]+)\/artifacts$/);
  if (req.method === "GET" && runArtifactsMatch) {
    const runId = runArtifactsMatch[1];
    return sendJson(res, 200, jsonOk(loadRunArtifacts(runId)));
  }

  const runFileMatch = pathname.match(/^\/api\/runs\/([^/]+)\/artifacts\/file$/);
  if (req.method === "GET" && runFileMatch) {
    const runId = runFileMatch[1];
    const relPath = String(url.searchParams.get("path") || "");
    const resolved = resolveRunFilesPath(runId, relPath);
    if (!resolved.ok || !resolved.abs || !resolved.normalized) return badRequest(res, resolved.reason || "invalid_path");
    if (!fs.existsSync(resolved.abs) || !fs.statSync(resolved.abs).isFile()) return notFound(res);
    const preview = readFilePreview(resolved.abs);
    return sendJson(res, 200, jsonOk({ path: resolved.normalized, text: preview.text, truncated: preview.truncated }));
  }

  const runZipMatch = pathname.match(/^\/api\/runs\/([^/]+)\/artifacts\/zip_entries$/);
  if (req.method === "GET" && runZipMatch) {
    const runId = runZipMatch[1];
    const relPath = String(url.searchParams.get("path") || "");
    const resolved = resolveRunFilesPath(runId, relPath);
    if (!resolved.ok || !resolved.abs || !resolved.normalized) return badRequest(res, resolved.reason || "invalid_path");
    if (!fs.existsSync(resolved.abs) || !fs.statSync(resolved.abs).isFile()) return notFound(res);
    try {
      const z = readZipEntries(resolved.abs);
      return sendJson(res, 200, jsonOk({ path: resolved.normalized, entries: z.entries, total_entries: z.total_entries, truncated: z.truncated, note: z.note }));
    } catch (e: any) {
      return badRequest(res, `zip_read_error:${String(e?.message || e)}`);
    }
  }

  if (req.method === "GET" && pathname === "/api/chat/threads") {
    return sendJson(res, 200, jsonOk({ threads: readThreads() }));
  }
  if (req.method === "POST" && pathname === "/api/chat/threads") {
    const body = await parseBody(req);
    const id = String(body.id || "").trim();
    const title = String(body.title || id || "").trim();
    if (!id) return badRequest(res, "id_required");
    const threads = readThreads();
    if (!threads.find((t) => t.id === id)) {
      threads.push({ id, title: title || id, updated_at: nowIso() });
      writeThreads(threads);
    }
    return sendJson(res, 200, jsonOk({ id }));
  }

  const threadMsgMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)\/messages$/);
  if (threadMsgMatch && req.method === "GET") {
    const threadId = threadMsgMatch[1];
    const limit = Number(url.searchParams.get("limit") || 200);
    const after = String(url.searchParams.get("after") || "");
    const msgs = after ? readMessagesAfter(threadId, limit, after) : readMessages(threadId, limit);
    return sendJson(res, 200, jsonOk({ thread_id: threadId, messages: msgs }));
  }
  if (threadMsgMatch && req.method === "POST") {
    const threadId = threadMsgMatch[1];
    const body = await parseBody(req);
    const text = String(body.text || "");
    if (!text.trim()) return badRequest(res, "text_required");
    const msg: ChatMessage = {
      id: randomId("msg"),
      thread_id: threadId,
      role: String(body.role || "user"),
      kind: String(body.kind || "note"),
      text: text.slice(0, FILE_CAP),
      links: body.links && typeof body.links === "object" ? body.links : {},
      created_at: nowIso(),
    };
    appendMessage(msg);
    updateThreadTimestamp(threadId);
    return sendJson(res, 200, jsonOk(msg));
  }

  if (req.method === "GET" && pathname === "/api/chat/read_state") {
    return sendJson(res, 200, jsonOk({ read_state: readReadState() }));
  }

  const readStateMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)\/read_state$/);
  if (readStateMatch && req.method === "POST") {
    const threadId = readStateMatch[1];
    const body = await parseBody(req);
    const state = readReadState();
    const prev = state[threadId] || {};
    state[threadId] = {
      last_read_at: String(body.last_read_at || nowIso()),
      last_seen_msg_id: String(body.last_seen_msg_id || prev.last_seen_msg_id || ""),
    };
    writeReadState(state);
    return sendJson(res, 200, jsonOk({ thread_id: threadId, read_state: state[threadId] }));
  }

  const pinsMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)\/pins$/);
  if (pinsMatch && req.method === "GET") {
    const threadId = pinsMatch[1];
    const pins = readPins();
    return sendJson(res, 200, jsonOk({ thread_id: threadId, pins: pins[threadId] || [] }));
  }
  if (pinsMatch && req.method === "POST") {
    const threadId = pinsMatch[1];
    const body = await parseBody(req);
    const op = String(body.op || "add");
    const msgId = String(body.msg_id || "").trim();
    if (!msgId) return badRequest(res, "msg_id_required");
    const pins = readPins();
    const current = Array.isArray(pins[threadId]) ? pins[threadId] : [];
    const next = op === "remove"
      ? current.filter((x) => x !== msgId)
      : (current.includes(msgId) ? current : [msgId, ...current].slice(0, 200));
    pins[threadId] = next;
    writePins(pins);
    return sendJson(res, 200, jsonOk({ thread_id: threadId, pins: next }));
  }

  if (req.method === "GET" && pathname === "/api/chat/search") {
    const q = String(url.searchParams.get("q") || "").trim();
    if (!q) return sendJson(res, 200, jsonOk({ query: q, hits: [] }));
    const messageHits = searchChatAll(q);
    const runHits = listRuns(80)
      .filter((r) => String(r.run_id || "").toLowerCase().includes(q.toLowerCase()))
      .slice(0, 40)
      .map((r) => ({ scope: "run", run_id: r.run_id, updated_at: r.updated_at }));
    const recipes = (readJson<RecipeCatalog>(RECIPES_SSOT_PATH, { recipes: [] }).recipes || []);
    const recipeHits = recipes
      .filter((r) => `${r.id} ${r.title || ""} ${r.notes || ""}`.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 40)
      .map((r) => ({ scope: "recipe", recipe_id: r.id, title: r.title || r.id }));
    const designFiles = fs.existsSync(DESIGN_DIR)
      ? fs.readdirSync(DESIGN_DIR).filter((f) => f.endsWith(".md") && f.startsWith("design_"))
      : [];
    const designHits = designFiles
      .filter((f) => f.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 40)
      .map((f) => ({ scope: "design", design_id: f }));
    return sendJson(res, 200, jsonOk({ query: q, hits: [...messageHits, ...runHits, ...recipeHits, ...designHits].slice(0, 300) }));
  }

  if (pathname === "/api/chat/clipboard" && req.method === "GET") {
    return sendJson(res, 200, jsonOk({ items: loadClipboard() }));
  }
  if (pathname === "/api/chat/clipboard" && req.method === "POST") {
    const body = await parseBody(req);
    const items = loadClipboard();
    items.push({ id: randomId("clip"), text: String(body.text || "").slice(0, FILE_CAP), role: String(body.role || "user"), created_at: nowIso() });
    saveClipboard(items);
    return sendJson(res, 200, jsonOk({ count: loadClipboard().length }));
  }

  if (req.method === "POST" && pathname === "/api/recipes/run") {
    const body = await parseBody(req);
    const recipeId = String(body.recipe_id || "").trim();
    if (!recipeId) return badRequest(res, "recipe_id_required");
    const catalog = readJson<RecipeCatalog>(RECIPES_SSOT_PATH, { recipes: [] });
    const item = (catalog.recipes || []).find((r) => r.id === recipeId);
    if (!item || !item.file) return notFound(res);

    const templatePath = path.join(RECIPES_TEMPLATE_DIR, item.file);
    if (!fs.existsSync(templatePath)) return notFound(res);
    const taskId = `task_ui_recipe_${recipeId}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const raw = fs.readFileSync(templatePath, "utf8");
    const yamlText = replaceMetadataIdInYaml(raw, taskId);
    const outPath = path.join(QUEUE_PENDING_DIR, `${taskId}.yaml`);
    fs.writeFileSync(outPath, yamlText, "utf8");
    return sendJson(res, 200, jsonOk({ task_id: taskId, queued_path: outPath.replaceAll("\\", "/") }));
  }

  if (req.method === "GET" && pathname === "/api/designs") {
    const files = fs.existsSync(DESIGN_DIR)
      ? fs.readdirSync(DESIGN_DIR).filter((f) => f.endsWith(".md") && f.startsWith("design_")).sort()
      : [];
    let latest = "";
    try {
      const line = fs.readFileSync(DESIGN_LATEST_PATH, "utf8").trim();
      latest = line.split("|")[0].trim().replaceAll("\\", "/");
    } catch { }
    return sendJson(res, 200, jsonOk({ latest, files }));
  }

  const designMatch = pathname.match(/^\/api\/designs\/([^/]+)$/);
  if (req.method === "GET" && designMatch) {
    const name = String(designMatch[1] || "");
    if (!/^[A-Za-z0-9_.-]+\.md$/.test(name)) return badRequest(res, "invalid_design_name");
    const full = path.join(DESIGN_DIR, name);
    if (!fs.existsSync(full)) return notFound(res);
    const preview = readFilePreview(full);
    return sendJson(res, 200, jsonOk({ name, text: preview.text, truncated: preview.truncated }));
  }

  return notFound(res);
}

let taskifyTrackerBusy = false;
let taskifyTrackerTimer: NodeJS.Timeout | null = null;
let heartbeatSchedulerBusy = false;
let heartbeatSchedulerTimer: NodeJS.Timeout | null = null;
let heartbeatSchedulerTickSec = 0;
let consolidationSchedulerBusy = false;
let consolidationSchedulerTimer: NodeJS.Timeout | null = null;
let consolidationSchedulerTickSec = 0;
let morningBriefSchedulerBusy = false;
let morningBriefSchedulerTimer: NodeJS.Timeout | null = null;
let morningBriefSchedulerTickSec = 0;
let threadArchiveSchedulerBusy = false;
let threadArchiveSchedulerTimer: NodeJS.Timeout | null = null;
let threadArchiveSchedulerTickSec = 0;
let opsAutoStabilizeMonitorBusy = false;
let opsAutoStabilizeMonitorTimer: NodeJS.Timeout | null = null;
let opsAutoStabilizeMonitorTickSec = 0;

function startTaskifyTrackingPoller(): void {
  if (taskifyTrackerTimer) return;
  taskifyTrackerTimer = setInterval(() => {
    if (taskifyTrackerBusy) return;
    taskifyTrackerBusy = true;
    try {
      runTaskifyTrackingSweep();
      runEvidenceExportTrackingSweep();
      runOpsSnapshotTrackingSweep();
      runMorningBriefBundleTrackingSweep();
      runCouncilInboxTrackingSweep();
    } catch {
      // best-effort only
    } finally {
      taskifyTrackerBusy = false;
    }
  }, TASKIFY_TRACKER_INTERVAL_MS);
  if (typeof taskifyTrackerTimer.unref === "function") taskifyTrackerTimer.unref();
}

function startHeartbeatSchedulerPoller(): void {
  const agents = loadOrgAgentsSnapshot().snapshot.agents;
  const settings = loadHeartbeatSettings(new Set(agents.map((a) => a.id)));
  const tickSec = Math.max(HEARTBEAT_TICK_SEC_MIN, Math.min(HEARTBEAT_TICK_SEC_MAX, Number(settings.schedule.tick_interval_sec || 15)));
  if (heartbeatSchedulerTimer && heartbeatSchedulerTickSec === tickSec) return;
  if (heartbeatSchedulerTimer) {
    clearInterval(heartbeatSchedulerTimer);
    heartbeatSchedulerTimer = null;
  }
  heartbeatSchedulerTickSec = tickSec;
  heartbeatSchedulerTimer = setInterval(() => {
    if (heartbeatSchedulerBusy) return;
    heartbeatSchedulerBusy = true;
    try {
      runHeartbeatSchedulerTick();
    } catch {
      // best-effort only
    } finally {
      heartbeatSchedulerBusy = false;
    }
  }, tickSec * 1000);
  if (heartbeatSchedulerTimer && typeof heartbeatSchedulerTimer.unref === "function") heartbeatSchedulerTimer.unref();
}

function startConsolidationSchedulerPoller(): void {
  const agents = loadOrgAgentsSnapshot().snapshot.agents;
  const settings = loadConsolidationSettings(new Set(agents.map((a) => a.id)));
  const tickSec = Math.max(CONSOLIDATION_TICK_SEC_MIN, Math.min(CONSOLIDATION_TICK_SEC_MAX, Number(settings.schedule.tick_interval_sec || 30)));
  if (consolidationSchedulerTimer && consolidationSchedulerTickSec === tickSec) return;
  if (consolidationSchedulerTimer) {
    clearInterval(consolidationSchedulerTimer);
    consolidationSchedulerTimer = null;
  }
  consolidationSchedulerTickSec = tickSec;
  consolidationSchedulerTimer = setInterval(() => {
    if (consolidationSchedulerBusy) return;
    consolidationSchedulerBusy = true;
    try {
      runConsolidationSchedulerTick();
    } catch {
      // best-effort only
    } finally {
      consolidationSchedulerBusy = false;
    }
  }, tickSec * 1000);
  if (consolidationSchedulerTimer && typeof consolidationSchedulerTimer.unref === "function") consolidationSchedulerTimer.unref();
}

function startMorningBriefSchedulerPoller(): void {
  const settings = loadMorningBriefSettings();
  const tickSec = Math.max(MORNING_BRIEF_TICK_SEC_MIN, Math.min(MORNING_BRIEF_TICK_SEC_MAX, Number(settings.tick_interval_sec || 30)));
  if (morningBriefSchedulerTimer && morningBriefSchedulerTickSec === tickSec) return;
  if (morningBriefSchedulerTimer) {
    clearInterval(morningBriefSchedulerTimer);
    morningBriefSchedulerTimer = null;
  }
  morningBriefSchedulerTickSec = tickSec;
  morningBriefSchedulerTimer = setInterval(() => {
    if (morningBriefSchedulerBusy) return;
    morningBriefSchedulerBusy = true;
    try {
      runMorningBriefSchedulerTick();
    } catch {
      // best-effort only
    } finally {
      morningBriefSchedulerBusy = false;
    }
  }, tickSec * 1000);
  if (morningBriefSchedulerTimer && typeof morningBriefSchedulerTimer.unref === "function") morningBriefSchedulerTimer.unref();
}

function startThreadArchiveSchedulerPoller(): void {
  const tickSec = THREAD_ARCHIVE_SCHED_TICK_SEC_DEFAULT;
  if (threadArchiveSchedulerTimer && threadArchiveSchedulerTickSec === tickSec) return;
  if (threadArchiveSchedulerTimer) {
    clearInterval(threadArchiveSchedulerTimer);
    threadArchiveSchedulerTimer = null;
  }
  threadArchiveSchedulerTickSec = tickSec;
  threadArchiveSchedulerTimer = setInterval(() => {
    if (threadArchiveSchedulerBusy) return;
    threadArchiveSchedulerBusy = true;
    try {
      runThreadArchiveSchedulerTick();
    } catch {
      // best-effort only
    } finally {
      threadArchiveSchedulerBusy = false;
    }
  }, tickSec * 1000);
  if (threadArchiveSchedulerTimer && typeof threadArchiveSchedulerTimer.unref === "function") threadArchiveSchedulerTimer.unref();
}

function startOpsAutoStabilizeMonitorPoller(): void {
  const settings = loadOpsAutoStabilizeSettings();
  const tickSec = Math.max(10, Math.min(300, Number(settings.check_interval_sec || 30)));
  if (opsAutoStabilizeMonitorTimer && opsAutoStabilizeMonitorTickSec === tickSec) return;
  if (opsAutoStabilizeMonitorTimer) {
    clearInterval(opsAutoStabilizeMonitorTimer);
    opsAutoStabilizeMonitorTimer = null;
  }
  opsAutoStabilizeMonitorTickSec = tickSec;
  opsAutoStabilizeMonitorTimer = setInterval(() => {
    if (opsAutoStabilizeMonitorBusy) return;
    opsAutoStabilizeMonitorBusy = true;
    try {
      runOpsAutoStabilizeMonitorTick();
    } catch {
      // best-effort only
    } finally {
      opsAutoStabilizeMonitorBusy = false;
    }
  }, tickSec * 1000);
  if (opsAutoStabilizeMonitorTimer && typeof opsAutoStabilizeMonitorTimer.unref === "function") opsAutoStabilizeMonitorTimer.unref();
}

ensureDirs();

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((e: any) => {
    sendJson(res, 500, { ok: false, reason: String(e?.message || e || "internal_error") });
  });
});

server.listen(API_PORT, API_HOST, () => {
  startTaskifyTrackingPoller();
  startHeartbeatSchedulerPoller();
  startConsolidationSchedulerPoller();
  startMorningBriefSchedulerPoller();
  startThreadArchiveSchedulerPoller();
  startOpsAutoStabilizeMonitorPoller();
  try { runTaskifyTrackingSweep(); } catch {}
  try { runEvidenceExportTrackingSweep(); } catch {}
  try { runOpsSnapshotTrackingSweep(); } catch {}
  try { runMorningBriefBundleTrackingSweep(); } catch {}
  try { runCouncilInboxTrackingSweep(); } catch {}
  try { runHeartbeatSchedulerTick(); } catch {}
  try { runConsolidationSchedulerTick(); } catch {}
  try { runMorningBriefSchedulerTick(); } catch {}
  try { runThreadArchiveSchedulerTick(); } catch {}
  try { runOpsAutoStabilizeMonitorTick(); } catch {}
  // eslint-disable-next-line no-console
  console.log(`[ui_api] listening http://${API_HOST}:${API_PORT} workspace=${WORKSPACE}`);
});
