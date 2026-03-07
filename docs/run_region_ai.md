# region_ai Runbook

## Specification SSOT
- Platform-level spec SSOT: `docs/spec_region_ai.md`
- Task/Result detail spec: `docs/spec_task_result.md`
- Recipes catalog SSOT: `docs/recipes_region_ai.json`
- Contract index SSOT: `docs/contract_index_region_ai.json`
- UI hub API smoke: `tools/ui_smoke.ps1`
- Use runbook for execution commands; use spec docs for contract decisions.

## Design-first workflow
1. Create design doc from `docs/design/TEMPLATE.md`.
2. Generate review pack: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/make_review_pack.ps1`.
3. Collect multi-role review (`Reviewer`, `QA`, `Researcher`) in design/memo files.
4. Optional external AI replies are stored as `docs/design/<design_id>__claude*.md` or `docs/design/<design_id>__gemini*.md`.
5. Finalize decisions with `Final:` markers.
6. Update whiteboard from design: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/whiteboard_update.ps1`.
7. Keep `docs/design/LATEST.txt` as SSOT pointer to the active design path.
8. Run gate: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/design_gate.ps1` (uses `docs/design/LATEST.txt` when `-DesignPath` is omitted).
9. Implement only after `gate_passed`.

## Commands (Standard vs Dev)
- Standard path (gate required): `npm.cmd run ci:smoke:gate:json` (preferred wrapper)
- Fallback direct call: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/ci_smoke_gate.ps1 -Json`
- Standard JSON expectation: `gate_required=true, gate_passed=true, whiteboard_passed=true, ui_passed=true`
- Dev escape hatch (explicit): `cd apps/orchestrator && npm.cmd run e2e:auto:dev:json`
- Dev JSON expectation: `gate_phase="skipped", gate_required=false, gate_passed=null`
- Operational rule: dev escape hatch is local-only; CI/shared operation uses the standard path.
- Report shorthand: Standard=`npm run ci:smoke:gate:json` (gate required), Dev=`cd apps/orchestrator && npm run e2e:auto:dev:json` (`gate_phase=skipped`).
- Round label rule: use `Round1 (negative / parallel contention reproduction)` when intentionally reproducing contention.
- Operation rule: do not run `ci:smoke:gate` and `e2e:auto:dev` in parallel (workspace/lock contention); if parallel is required, use isolated workspace mode (see `## Concurrency rule`).

## 普段の開発ゲート
1. `npm.cmd run docs:check:json`
2. `powershell -NoProfile -ExecutionPolicy Bypass -File tools/ui_smoke.ps1 -Json`
3. `node tools/ci_smoke_gate_runner.cjs`

## Git不要の公開フロー（bundle経由）
- 正式手順の入口は `tools/publish.ps1` のみを使う（内部で `publish_*` を呼ぶ）。
- `artifacts/` と `data/` 配下の実行記録は運用ログとして保持し、repo には commit しない（`.gitignore` 管理）。
- A) オフライン端末で bundle 作成（repo root）
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/publish.ps1 -Mode export -Json`
  - 最終行JSONの `bundle` を控える。
- B) 443到達可能端末で dry-run プレビュー（pushしない）
  - `$RepoUrl = "https://github.com/hyugauru0206-ai/region_ai.git"`
  - `$BundlePath = "C:\work\region_ai\artifacts\push_export_YYYYMMDD_HHmmss\region_ai_head.bundle"`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/publish.ps1 -Mode from_bundle -RepoUrl $RepoUrl -BundlePath $BundlePath -BranchName from_bundle -RemoteBranch main -DryRun -Json`
- C) 問題なければ push 実行
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/publish.ps1 -Mode from_bundle -RepoUrl $RepoUrl -BundlePath $BundlePath -BranchName from_bundle -RemoteBranch main -ConfirmPhrase "PUSH" -Json`
- 補足（実装上の正規ref）:
  - `git fetch "<bundle>" "HEAD:refs/heads/<branch>"` を使用する。
  - **`git fetch "<bundle>" "HEAD:refs/heads/<branch>"` が正。`bundle/HEAD` は使わない。**
- ハング回避:
  - gate再実行は `node tools/ci_smoke_gate_runner.cjs` を優先する（PowerShell直呼びより安定）。

## 作業ツリー復旧（安全版）
- 危険な `git clean -fdx` は通常運用で推奨しない（ignore された生成物まで消すため）。
- 異常を感じたら最初に実行:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/repo_sanity.ps1 -Json`
- 推奨手順:
  1) `git status --porcelain`
  2) 追跡ファイルの戻し: `git restore .`
  3) 未追跡の確認: `git clean -fdn`（dry-run）
  4) 問題なければ `git clean -fd`（`-x` は基本使わない）
- `git clean` 実行直後は必ず `tools/repo_sanity.ps1 -Json` を再実行してから smoke/gate/publish を回す。

## Recipes (Golden templates)
- Location: `templates/tasks/recipes/`
- Machine-readable catalog SSOT: `docs/recipes_region_ai.json`
- Catalog update tool:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/recipes_update.ps1 -DryRun -Json`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/recipes_update.ps1 -Json`
- Drift meaning:
  - `changed=true` in dry-run means recipe YAML metadata and `docs/recipes_region_ai.json` are out of sync.
  - `ci:smoke:gate:json` fails when this drift is detected.
- Purpose: production-ready task templates that can be copied and queued directly.

## Contract Index SSOT
- Machine-readable contract index: `docs/contract_index_region_ai.json`
- Update tool:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/contract_index_update.ps1 -Write -Json`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/contract_index_update.ps1 -DryRun -Json`
- Drift meaning:
  - `changed=true` in dry-run means schema-derived contract index and committed SSOT are out of sync.
  - `ci:smoke:gate:json` fails when contract index drift is detected.
- Added release bundle recipe:
  - `templates/tasks/recipes/recipe_release_bundle.yaml`
  - Flow: `file_write -> archive_zip -> acceptance(artifact_exists + artifact_zip_entry_* + artifact_json_pointer_*)`
- Recipe guard commands (sequential only):
  - `cd apps/orchestrator && npm.cmd run e2e:auto:recipe_generate_validate_json:json`
  - `cd apps/orchestrator && npm.cmd run e2e:auto:recipe_patch_apply_end_to_end:json`
  - `cd apps/orchestrator && npm.cmd run e2e:auto:recipe_release_bundle:json`
  - `cd apps/orchestrator && npm.cmd run e2e:auto:recipe_evidence_export_bundle:json`
  - `cd apps/orchestrator && npm.cmd run e2e:auto:recipe_ops_snapshot:json`
  - `cd apps/orchestrator && npm.cmd run e2e:auto:recipe_morning_brief_bundle:json`
  - `cd apps/orchestrator && npm.cmd run e2e:auto:recipe_pipeline_exec_fail_ng`
  - `cd apps/orchestrator && npm.cmd run recipes:all`
- stdout-safe execution note:
  - `e2e:auto:recipe_morning_brief_bundle:json` and `recipes:all` are routed to `tools/run_e2e.ps1` / `tools/recipes_all.ps1` from repo root (`Set-Location (Resolve-Path '..\\..')`) to avoid npm stdout-related false exits.
- `recipes:all` breakdown:
  - success: 6 (`recipe_generate_validate_json`, `recipe_patch_apply_end_to_end`, `recipe_release_bundle`, `recipe_evidence_export_bundle`, `recipe_ops_snapshot`, `recipe_morning_brief_bundle`)
  - expected NG: 1 (`recipe_pipeline_exec_fail_ng`)
- Concurrency rule for recipes: do not run recipe checks in parallel; run `recipes:all` sequentially.

## Discord-like UI hub
- Backend API:
  - `cd apps/orchestrator && npm.cmd run ui:api`
- UI (Vite):
  - `cd apps/ui_discord && npm.cmd run ui:dev`
- Combined helper:
  - `cd apps/orchestrator && npm.cmd run ui:dev`
- Build:
  - `cd apps/ui_discord && npm.cmd run ui:build`
- Build smoke (reproducible install/build):
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/ui_build_smoke.ps1 -Json`
  - uses `npm ci --no-audit --no-fund --prefer-offline`
  - set `REGION_AI_SKIP_UI_BUILD=1` to skip in low-speed/offline environment
- Offline deps pack (network-available environment):
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/ui_deps_pack.ps1 -Json`
  - outputs:
    - `artifacts/ui_discord_node_modules.zip`
    - `artifacts/ui_discord_deps_pack_manifest.json`
- Offline build smoke (registry unreachable environment):
  - `set REGION_AI_UI_DEPS_PACK=1` (or `$env:REGION_AI_UI_DEPS_PACK='1'` in PowerShell)
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/ui_build_smoke.ps1 -Json`
  - If pack files are missing, `ui_build_smoke` fails with `deps_pack_missing`.
- Smoke check:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/ui_smoke.ps1 -Json`
  - On restricted local machines, `node tools/ci_smoke_gate_runner.cjs` may explicitly pin offline mode for that run so `ui_smoke` and gate logs stay consistent.
  - Network-limited mode (443 blocked):
    - PowerShell: `$env:REGION_AI_SMOKE_OFFLINE="1"`
    - cmd.exe: `set REGION_AI_SMOKE_OFFLINE=1`
    - `ui_smoke` adds `offline_mode=true` and `skipped_steps=[...]` in JSON while keeping legacy `*_ok` keys.
    - After moving to a machine that can reach `github.com:443`, rerun smoke/gate without offline mode for full validation.
- UI channels (additive):
  - `#メンバー`: org agents registry (status / assigned thread edit)
    - includes `Memory` panel (episodes/knowledge/procedures browse/search/append)
  - `#アクティビティ`: global activity timeline
  - `#ワークスペース`: 2.5D room view for agents/activity with drag-drop seat layout editing
    - each agent seat has one-click `Heartbeat` action (append + jump to member memory)
    - each agent seat also has one-click `ステータス` to open right-pane `キャラシート`
  - `#ダッシュボード`: daily loop single-screen status (heartbeat/suggest/consolidation/morning_brief/inbox) + run-now controls
    - refresh model: SSE `LIVE` via `/api/activity/stream` on relevant events; fallback `POLL` (5s) on stream failure
  - Character Sheet v1 (`キャラシート`, right pane):
    - open from `#ワークスペース` seat action `ステータス` or `#メンバー` list action `ステータス`
    - shows selected agent header/status/thread + traits summary + memory snapshot (episodes, optional knowledge/procedures) + live activity (last 10, actor-filtered)
    - live activity subscription policy: active only while sheet is open; on stream failure fallback is `/api/activity` polling every 5s
    - ops shortcuts: `Heartbeat (dry-run)`, `Run now`, and `Open #inbox thread` (only when agent `thread_key` exists)
  - UI Polish v1 (Star Office + Agent HQ inspirations, UI-only):
    - Discord-like IA is preserved; chat remains primary and the right pane remains the detail surface.
    - `Office` (Control Room) and `Debate` are stable primary navigation surfaces in the current UI.
    - Control Room owns the visible quick-access strip for the current workspace.
    - quick access modes are `Favorites` and `Recent`: both are workspace-scoped, share the same compact shell, and only the selected mode persists per workspace.
    - favorites are pinned from command palette / office / debate / control room action points; favorites keep manual order + slot numbering and feed both the quick-access strip and palette favorites.
    - visual unification: shared tokens/cards/badges/mono-wrap rules across dashboard, right pane, character-sheet, office, and debate.
    - one-click routes are preserved and emphasized: workspace seat -> Character Sheet, members list -> Character Sheet, sheet -> thread/inbox/memory.
- UI hub API (additive):
  - `GET /api/org/agents`
  - `POST /api/org/agents`
  - `GET /api/org/agent_presets`
  - `GET /api/org/agent_presets/:id`
  - `GET /api/org/active_profile`
  - `POST /api/org/active_profile/revert`
  - `POST /api/org/agents/apply_preset` (`dry_run` preview + apply)
  - `GET /api/memory/:agent_id/:category?limit=...`
  - `POST /api/memory/:agent_id/:category`
  - `GET /api/memory/search?q=...&limit=...`
  - `POST /api/heartbeat/run` (manual deterministic digest append)
  - `GET /api/heartbeat/settings`
  - `POST /api/heartbeat/settings`
  - `GET /api/heartbeat/state`
  - `POST /api/heartbeat/run_now`
  - `GET /api/heartbeat/autopilot_suggestions?limit=...`
  - `POST /api/heartbeat/autopilot_suggestions/:id/accept` (`{ rank?: 1|2|3, preset_rank?:1|2|3, preset_set_id?:string, dry_run?:boolean }`)
  - `POST /api/heartbeat/autopilot_suggestions/:id/dismiss`
  - `GET /api/heartbeat/autopilot_suggest_settings`
  - `POST /api/heartbeat/autopilot_suggest_settings`
  - `GET /api/heartbeat/autopilot_suggest_state`
  - `GET /api/consolidation/settings`
  - `POST /api/consolidation/settings`
  - `GET /api/consolidation/state`
  - `POST /api/consolidation/run_now`
  - `GET /api/routines/morning_brief/settings`
  - `POST /api/routines/morning_brief/settings`
  - `GET /api/routines/morning_brief/state`
  - `POST /api/routines/morning_brief/run_now`
    - returns additive `recommended_profile` in dry-run and run modes
  - `POST /api/export/morning_brief_bundle`
  - `GET /api/export/morning_brief_bundle/status`
  - `GET /api/dashboard/daily_loop?limit_inbox_items=...`
    - returns additive `recommended_profile`
  - `GET /api/dashboard/next_actions?limit=...`
    - returns normalized next-action list (`revert_suggestion`, `profile_misalignment`) for dashboard card.
    - best-effort contract: always HTTP 200 with `items` array (can be empty).
  - `POST /api/dashboard/recommended_profile/preflight`
  - `POST /api/dashboard/recommended_profile/apply` (`confirm_phrase="APPLY"`)
  - `GET /api/dashboard/quick_actions`
  - `GET /api/dashboard/tracker_history?limit=...`
  - `POST /api/dashboard/tracker_history/append`
  - `POST /api/dashboard/quick_actions/run` (v1 dry-run only)
  - `POST /api/dashboard/quick_actions/execute` (v2 selective execute + confirm)
  - `GET /api/dashboard/thread_archive_scheduler`
  - `POST /api/dashboard/thread_archive_scheduler/run_now` (dry-run only)
  - `GET /api/ops/quick_actions/status`
  - `POST /api/ops/quick_actions/clear_stale_locks`
  - `POST /api/ops/quick_actions/reset_brakes`
  - `POST /api/ops/quick_actions/stabilize`
  - `GET /api/ops/auto_stabilize/settings`
  - `POST /api/ops/auto_stabilize/settings`
  - `GET /api/ops/auto_stabilize/state`
  - `POST /api/ops/auto_stabilize/run_now`
  - `POST /api/ops/auto_stabilize/execute_safe_run`
  - `GET /api/inbox/thread_archive_scheduler/settings`
  - `POST /api/inbox/thread_archive_scheduler/settings`
  - `GET /api/inbox/thread_archive_scheduler/state`
  - `POST /api/inbox/thread_archive_scheduler/run_now`
  - `GET /api/activity?limit=200&after=...`
  - `GET /api/activity/stream?limit=20` (SSE, best-effort)
  - `POST /api/council/run` (`resume=true` with `run_id` to continue, `dry_run=true` for preview/no-side-effect)
    - accepts optional `auto_ops_snapshot` / `auto_evidence_bundle` / `auto_release_bundle` flags
    - response includes additive `thread_key` / `thread_key_source` and `inbox_thread_hint.open_thread_endpoint`
  - `GET /api/council/run/status?run_id=...`
  - `POST /api/council/run/cancel`
  - `POST /api/council/artifact/queue` (internal-safe artifact queue API used by desktop runner)
  - v1.2 quality reflection:
    - one-shot reflection loop on quality failure (`max_reflection_attempts=1`)
    - no infinite retry; second quality failure finalizes as `failed_quality`
  - v1.3 completion exports:
    - on terminal council finalization, optional auto-kick for:
      - ops snapshot (`auto_ops_snapshot`)
      - evidence bundle (`auto_evidence_bundle`)
    - request IDs are persisted in run state to prevent duplicate kicks
    - completion notifications are emitted by existing export tracking into `#inbox`
  - v1.4 release bundle:
    - optional auto-kick of `recipe_release_bundle` on council finalization
    - status integration includes request_id / run_id / queued|running|done|failed
  - Dashboard Quick Actions v1:
    - one-click actions are dry-run focused (Heartbeat / Morning Brief / Thread Archive Scheduler / Ops Snapshot / Evidence Bundle).
    - actual execution paths remain manual in `#settings`.
    - run failures are returned as JSON (`ok=false`) and should not break dashboard rendering.
  - Dashboard Quick Actions v2:
    - execute path is allowlisted to `thread_archive_scheduler`, `ops_snapshot`, `evidence_bundle` only.
    - execute requires `confirm_phrase="EXECUTE"` server-side.
    - recommended flow: run preflight (`dry_run=true`) in confirm modal, then execute (`dry_run=false`).
  - Dashboard Quick Actions v2.1 tracker:
    - after execute, dashboard shows `Execution Tracker` panel and polls status endpoint automatically.
    - polling safety: backoff `2s -> 5s`, max duration `60s`, in-flight guard, user-cancel supported.
    - tracker failure/timeout are shown as status and JSON payload; UI remains responsive.
  - Dashboard Quick Actions v2.2 tracker history:
    - terminal tracker results are stored in browser localStorage (`regionai.tracker_history.v1`), latest-first cap `10`.
    - history row actions: `View details`, `Re-open tracker`, `Copy IDs`, `Open run`, `Go to #inbox`.
    - auto-close toggle (`regionai.tracker_autoclose_success.v1`, default `true`) hides active tracker after success and keeps history entry.
  - Dashboard Quick Actions v2.3 tracker history portability:
    - export shows versioned payload in right pane (`schema=regionai.tracker_history.export.v1`) and supports copy.
    - import validates schema + entry shape, skips broken rows, merges with dedupe, sorts by `ended_at` desc, and caps to latest `10`.
    - clear history requires confirm phrase `CLEAR` before deleting local history.
  - Dashboard Quick Actions v2.4 tracker history workspace persistence:
    - tracker history is dual-write: localStorage + workspace JSONL (`workspace/ui/dashboard/tracker_history.jsonl`) on terminal events.
    - restore order on UI start/dashboard open: workspace history first, then local merge with dedupe and cap 10.
    - workspace append is best-effort; UI continues local-only if API is unavailable.
  - Dashboard Quick Actions v2.5 inbox thread linkage:
    - execute response includes deterministic `thread_key` (`request_id` preferred, then `run_id`, else fallback/preview).
    - execute start audit uses `source=quick_actions_execute` with explicit `thread_key`, so `#inbox` thread view is grouped per execution unit.
    - tracker panel/history provide `Open thread` to jump directly to `#inbox` thread view by `thread_key`.
  - Dashboard Quick Actions v3.3 morning one-button:
    - new execute id `morning_brief_autopilot_start` supports preview (`dry_run=true`) that bundles:
      - morning brief dry-run with `recommended_profile`
      - council preset preflight (`apply_preset dry_run`)
      - council autopilot start preview (`/api/council/run dry_run`)
    - execute (`dry_run=false`) requires dual confirm phrases: `EXECUTE` and `APPLY`.
    - on execute, flow is `morning_brief dry-run -> apply preflight -> apply preset -> autopilot start`; if apply fails, autopilot start is blocked.
    - execute tracking uses `kind=inbox_thread` and poll URL `/api/inbox/thread?key=...` for direct thread view tracking.
- Runtime state paths (additive):
  - `workspace/ui/org/agents.json`
  - `workspace/ui/activity/activity.jsonl`
  - `workspace/ui/memory/<agent_id>/episodes.jsonl`
  - `workspace/ui/memory/<agent_id>/knowledge.jsonl`
  - `workspace/ui/memory/<agent_id>/procedures.jsonl`
  - `workspace/ui/heartbeat/heartbeat_settings.json`
  - `workspace/ui/heartbeat/heartbeat_state.json`
  - `workspace/ui/heartbeat/heartbeat.lock`
  - `workspace/ui/heartbeat/autopilot_suggestions.json`
  - `workspace/ui/heartbeat/autopilot_suggest_settings.json`
  - `workspace/ui/heartbeat/autopilot_suggest_state.json`
  - `workspace/ui/consolidation/consolidation_settings.json`
  - `workspace/ui/consolidation/consolidation_state.json`
  - `workspace/ui/consolidation/consolidation.lock`
  - `workspace/ui/routines/morning_brief_settings.json`
  - `workspace/ui/routines/morning_brief_state.json`
  - `workspace/ui/routines/morning_brief.lock`
  - `workspace/ui/routines/morning_brief_bundle_requests.json`
  - `workspace/ui/routines/morning_brief_bundle_tracking.json`
  - `workspace/ui/dashboard/tracker_history.jsonl`
  - `workspace/ui/desktop/archive/thread_archive_scheduler_settings.json`
  - `workspace/ui/desktop/archive/thread_archive_scheduler_state.json`
  - `workspace/ui/desktop/archive/thread_archive_scheduler.lock`
  - `workspace/ui/org/agents.json` includes optional `agents[].layout = { x, y }` (normalized 0..1), persisted after workspace drag-drop save
  - `workspace/ui/org/agents.json` includes optional `agents[].identity`:
    - `tagline`, `values[]`, `speaking_style`, `strengths[]`, `weaknesses[]`, `do[]`, `dont[]`, `focus`
  - `workspace/ui/org/agent_presets.json` stores fixed preset sets (`standard|harsh_critic|strong_jester|ops_first|research_first`)
  - `#メンバー` channel supports identity editing and save via `POST /api/org/agents`
  - identity presets v2.9:
    - `GET /api/org/agent_presets` lists preset sets
    - `GET /api/org/active_profile` returns current council active profile state (workspace SSOT, fail-closed to default)
    - `POST /api/org/agents/apply_preset` supports dry-run preview (`diff_sample`) and apply
      - dry-run additive: `active_profile_preview`
      - apply additive: `active_profile_updated`, `active_profile`
    - apply updates identity fields only (other agent fields unchanged) and emits `activity.event_type=agents_updated`
  - Active Profile v3.4:
    - dashboard shows current `Active Profile` and compares with `Recommended Profile`
    - status line indicates `ACTIVE=RECOMMENDED` or `ACTIVE≠RECOMMENDED`
  - Active Profile Revert v3.5:
    - `POST /api/org/active_profile/revert` provides safe revert to `standard`
    - dry-run preview is side-effect free; execute requires `confirm_phrase=REVERT`
    - dashboard active-profile card has `Revert to standard (confirm)` with preview and execute
    - quick action `revert_active_profile_standard` supports preflight/execute flow
  - Autopilot final revert suggestion v3.6:
    - when council autopilot reaches final and active profile is non-standard, `#inbox` appends `source=revert_suggestion` (no auto-exec)
    - suggestion is grouped by autopilot `thread_key` and deduped per thread/day
    - council dry-run preview includes additive `revert_suggestion_preview`
  - Dashboard Next Actions v3.7:
    - dashboard card surfaces latest `revert_suggestion` with immediate `Open thread` / `Open Quick Actions` guidance.
    - when `ACTIVE≠RECOMMENDED`, card also surfaces `profile_misalignment` with direct jump to Active Profile and apply-recommended flow.
    - no automatic revert execution; execution remains confirm-gated via existing modal/quick-action paths.
  - heartbeat appends deterministic memory digest and emits `activity.event_type=heartbeat`
  - heartbeat success (`dry_run=false`) creates deterministic Autopilot suggestions (dedup per local_date+agent+category) and appends `#inbox` item (`source=heartbeat_suggest`)
  - suggestion v1.1 includes up to 3 ranked candidates (`topic/context/rationale`) and `accept` can pick rank (`1..3`)
  - suggestion v3.0 adds preset linkage:
    - candidates may include `preset_candidates` (ranked profile suggestions)
    - safe flow is `dry_run preview -> APPLY confirm -> apply + start`
    - if preset apply fails, autopilot start is blocked
  - suggestion v3.2 alignment:
    - rank1 preset is always aligned with dashboard/morning-brief `recommended_profile`
    - rank1 may be marked as `source=recommended_profile`; rank2/3 are static fallbacks
  - `Start Autopilot` is manual approval only; heartbeat never auto-starts council in v1.x
  - v2 auto-accept is default OFF; enable in `#settings`
  - v2 auto-accept strict guards: facilitator + episodes + rank1 only, once/day + cooldown, failure brake with mention notify
  - Night Consolidation v1 distills daily episodes into knowledge/procedures deterministically (no LLM), append-only
  - `#settings` supports consolidation schedule and `run_now`/dry-run
  - Morning Brief v1 orchestrates morning routine (heartbeat -> suggest/auto -> autopilot link -> brief artifact) with safe guards
  - Morning Brief/Dashboard recommended profile v3.1:
    - deterministic profile (`standard|harsh_critic|ops_first`) is shown in dashboard card
    - dashboard flow: `Preflight Apply (dry-run)` -> `Apply(confirm)`
    - apply uses existing `apply_preset` council-scope path (identity traits only)
  - Morning Brief Bundle v1 adds deterministic bundle generation (`zip + manifest`) with tracking and #inbox notify (`source=export_morning_brief_bundle`)
  - Heartbeat v1 schedule can be configured from `#settings` (enable/disable, daily time, targets, max_per_day, run_now)
  - Dashboard health badges are deterministic: `OK/WARN/ERR` from brake/failure/mention/disabled signals
  - Dashboard Ops Quick Actions:
    - `Reset brakes` resets only effective brakes/counters (does not flip settings.enabled)
    - `Clear stale locks` deletes only stale allowlisted lock files
    - every ops action appends audit entry to `#inbox` (`source=ops_quick_actions`)
  - Auto-stabilize (v4):
    - monitor executes `stabilize(dry_run)` only and appends suggestion to `#inbox`
    - never auto-runs `safe_run`; actual execution remains manual from dashboard confirm flow
    - dedup by cooldown/max_per_day and auto-stop by consecutive failures (`enabled_effective=false`)
  - Auto-stabilize execute (v5):
    - from `#inbox` suggestion (`source=ops_auto_stabilize*`), operator can run:
      - safe mode (no exec)
      - safe + run_now (explicit)
    - requires UI confirm + server confirm_token
    - every execution appends audit to `#inbox` (`source=ops_auto_stabilize_execute`)
  - Auto-stabilize v6:
    - optional auto execute runs only `safe(no exec)` (clear stale locks + reset brakes + run_now dry checks)
    - auto execute never runs `safe+run_now`; execution path remains manual from dashboard/inbox actions
    - monitor still posts suggestion and can append dedicated auto-exec audit (`source=ops_auto_stabilize_auto_execute`)
    - guards: brake/stale-lock trigger only, cooldown/max_per_day, idempotency, failure brake
  - Dashboard Thread Archive Scheduler card:
    - displays enabled/effective, next run(local), last result summary, elapsed/timed_out, failure_count/backoff, and failed thread keys.
    - supports one-click `Run dry-run now` from dashboard while settings edits remain in `#settings`.
  - UI uses SSE for activity realtime updates and falls back to 2s polling when stream is unavailable
  - council autopilot:
    - `workspace/ui/council/runs/<run_id>.json`
    - `workspace/ui/council/logs/<run_id>.jsonl`
    - `workspace/ui/council/requests/<run_id>.json`
    - `workspace/ui/council/inbox_tracking.json` (best-effort start/round/final append state)
    - completion auto-queues safe artifact pipeline:
      - `written/council_answer_<ts>.md`
      - optional `bundles/council_<ts>.zip`
    - `#inbox` thread linkage (v2.6):
      - deterministic `ap:*` thread key (`request_id` preferred, then `run_id`, fallback token/hash; preview uses `thread_key_source=preview`)
      - start/round/final append with same thread key (`source=council_autopilot*`, round cap max 5, append best-effort)
      - Settings panel provides `Open thread` and `Copy thread_key` for direct thread-view navigation
    - round log role format (v2.7):
      - `council_autopilot_round` body is fixed 4-line role format:
        - `司会: 決定=... / 次=...`
        - `批判役: リスク=... / 反例=...`
        - `実務: 実装案=... / 手順=...`
        - `道化師: 前提崩し=... / うっかり=...`
      - `POST /api/council/run` with `dry_run=true` returns additive preview fields:
        - `round_log_format_preview`
        - `round_log_format_version=v2_8`
    - identity/memory assist (v2.8):
      - role lines are assisted by agent identity (`org/agents.json.identity`) and recent memory (`knowledge/procedures`) in best-effort mode
      - each role line has minimum non-empty guarantee fallback even when source summary is sparse
    - run status includes additive fields:
      - `quality_check` (`passed`, `failures[]`)
      - `reflection` (`attempts`, `max_attempts=1`, `last_reflection_at`)
      - `finalization` (`mode=normal|reflected|failed_quality`, `final_answer_version=1|2`)
      - `exports`:
        - `auto_ops_snapshot`, `auto_evidence_bundle`
        - `ops_snapshot_request_id`, `evidence_bundle_request_id`
        - `status.ops_snapshot|status.evidence_bundle` (`disabled|queued|done|failed`)
        - `auto_release_bundle`, `release_bundle_request_id`
        - `release_bundle_status` (`disabled|queued|running|done|failed`)
        - `release_bundle_run_id`

## Desktop shell (Electron MVP)
- App path: `apps/ui_desktop_electron`
- Dev:
  - `cd apps/ui_desktop_electron && npm.cmd run desktop:dev`
- Build:
  - `cd apps/ui_desktop_electron && npm.cmd run desktop:build`
- Smoke:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/desktop_smoke.ps1 -Json`
  - set `REGION_AI_SKIP_DESKTOP=1` to skip when GUI/deps are not available
  - when Electron runtime deps are available, smoke exercises desktop shell checks plus Region UI assertions for quick access, command palette, and Office/Debate navigation
  - when smoke falls back to `local_static_fallback`, it still syntax-checks Electron entrypoints and verifies stable Region UI markers for quick access, command palette, and Office/Debate/ControlRoom from built output when available (source markers are the last fallback)
  - runtime-only assertions such as quick-access mode localStorage restore and favorite slot shortcut dispatch remain Electron-path only
- Bridge usage:
  - `Copy for ChatGPT` / `Copy for CODEX`
    - source priority: selected message payload (`regionai:selected`) -> left-pane text selection -> Clipboard Bus latest -> OS clipboard
  - `Focus ChatGPT`: right pane to active focus
  - Role tabs (right pane):
    - tabs: `facilitator/design/impl/qa/jester`
    - each tab keeps independent ChatGPT session storage via dedicated partition
    - bridge actions (`copy/send/capture`) always apply to the active role tab
    - role focus from UI workspace: `window.postMessage({ type: "regionai:focusRole", role }, "*")`
  - `Paste`: `insertText` first, fallback to `focus + paste` (no send)
  - `Send (confirm)`:
    - confirm modal shows outgoing text preview before send
    - send strategy: `insertText -> safe DOM hook -> success check`
    - on failure: immediate `focus + paste` fallback with status message (manual send remains available)
  - `Capture selection`: ChatGPT selection -> `/api/chat/threads/external/messages`
    (`role=chatgpt`, `kind=note`, `links.source=desktop_capture`)
  - `Capture last`:
    - best-effort extract of the latest assistant reply (`test_harness` first, ChatGPT selectors next)
    - save to `/api/chat/threads/external/messages` as `kind=result`
    - on extraction failure, status indicates fallback to `Capture selection`
  - `#inbox` notification history:
    - desktop notifications are persisted at `workspace/ui/desktop/inbox.jsonl`
    - UI channel `#inbox` shows latest-first entries with mention badge, thread id, and quick jump actions
    - each inbox item has additive `thread_key` (legacy rows are derived on read), and right pane supports one-click `Show thread (last 20)` via `/api/inbox/thread`
    - Thread view action: `Mark read (this thread)` calls `/api/inbox/thread/read_state` to mark same `thread_key` notifications as read in one operation
    - Thread view archive: `Archive this thread (dry-run)` / `Archive this thread` calls `/api/inbox/thread/archive` and writes non-destructive JSONL under `workspace/ui/desktop/archive/threads`
    - Scheduler (`#settings > Thread Archive Scheduler`): `Dry-run` returns plan only, `Run now` appends archive files and writes one summary audit (`source=inbox_thread_archive_scheduler`)
    - Scheduler safety: timeout guards (`per_thread_timeout_ms` / `total_timeout_ms`) and `tail_bytes` capped scan prevent long blocking runs
    - read state is stored at `workspace/ui/desktop/inbox_read_state.json` and can be marked from UI (`Mark all read`)
  - Evidence export bundle:
    - UI `#settings` has `Export Evidence Bundle` / `Dry-run` buttons
    - API endpoint: `POST /api/export/evidence_bundle` (`max_runs`, `include_archives`, `dry_run`)
    - status endpoint: `GET /api/export/evidence_bundle/status?request_id=...`
  - Notification click deep-link:
    - clicking desktop notification foregrounds app and routes ui_discord automatically
    - routing priority is fixed: `run_id -> #runs` (open run) -> `thread_id -> thread channel` -> fallback `#inbox`
  - Test harness (network-free):
    - `REGION_AI_CHAT_URL=file://.../apps/ui_desktop_electron/test_chat.html`
    - `tools/desktop_smoke.ps1` sets this automatically

## One-command dev
- Start all (ui_api + ui_discord + desktop):
  - `npm.cmd run desktop:dev:all`
  - can be launched from any current directory (script resolves repo root internally)
  - full mode (desktop required): default `REGION_AI_DESKTOP_OPTIONAL=0`
  - limited/smoke mode (desktop optional): set `REGION_AI_DESKTOP_OPTIONAL=1`
  - deps pack preferred in no-node_modules env: set `REGION_AI_UI_DEPS_PACK=1`
  - optional explicit auto install: set `REGION_AI_UI_AUTO_NPM_CI=1` (not default)
- Stop all:
  - `npm.cmd run desktop:dev:stop`
- Status (machine-readable):
  - `npm.cmd run desktop:dev:status:json`
- Readiness semantics:
  - `ready`: `api_ok=true`, `desktop_ok=true`, `ui_ok=true`
  - `partial_ready`: `api_ok=true`, desktop or UI is not ready but allowed by optional flags
  - `not_ready`: API not ready, or desktop required and desktop not ready
  - If `partial_ready` due to UI, run `powershell -NoProfile -ExecutionPolicy Bypass -File tools/ui_deps_unpack.ps1 -Json` (deps-pack) or install UI deps, then retry.
  - To force desktop required in smoke: `tools/desktop_dev_all_smoke.ps1 -RequireDesktop -Json`
- Logs/PIDs:
  - logs: `data/logs/dev_all_<timestamp>_api.log`, `data/logs/dev_all_<timestamp>_ui.log`, `data/logs/dev_all_<timestamp>_desktop.log`
  - pid snapshot: `data/logs/pids_dev_all_<timestamp>.txt`
  - current state pointer: `data/logs/desktop_dev_all_state.json`

### Gate failure quick examples
- `gate_failed_summary: design_not_found:<path>`  
  Cause: `-DesignPath` points to a missing file, or `docs/design/LATEST.txt` points to a missing design.
  Cause: required review files (`reviewer/qa/researcher`) are missing or misnamed.
  Cause: the design doc is missing required sections such as `Design diagram` or `Discussion summary`.
## Typical flow (gate required)
- Default `e2e:auto*` scripts run `tools/run_e2e.ps1` without `-SkipDesignGate`.
- `run_e2e.ps1` resolves design from `docs/design/LATEST.txt` unless `-DesignPath` is explicitly passed.
- If gate fails, e2e exits non-zero before task queueing/execution starts.
- `run_e2e.ps1` also enforces workspace lock by default, so same-workspace parallel runs are blocked deterministically.

## Concurrency rule
- Default: do not run `e2e:auto*` in parallel against the same workspace.
- Enforced by tooling: `tools/run_e2e.ps1` fails fast with `forbidden_parallel=true` unless explicit override (`-AllowForbiddenParallel`) is provided.
- If parallel execution is required, use isolated mode:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/run_e2e.ps1 -Mode timeout_expected -NoVerify -IsolatedWorkspace`
  - or `-AutoIsolate` to force isolated workspace selection when `-WorkspaceRoot` is not specified.
- Lock diagnostics are exposed in JSON: `lock_mode`, `lock_acquired`, `lock_path`, `lock_owner_pid`.

## Dev escape hatch (SkipDesignGate)
- `cd apps/orchestrator && npm.cmd run e2e:auto:dev` skips gate explicitly (`-SkipDesignGate`).
- `cd apps/orchestrator && npm.cmd run e2e:auto:dev:json` keeps one-line JSON output and marks gate as skipped (`gate_required=false`).
- Use only for local development; CI/regular operation should use gate-required paths.

## External AI participation
| mode | policy | gate expectation |
|---|---|---|
| `none` | external review is not used; only `Reviewer/QA/Researcher` files are required. | external evidence file is not required. |
| `optional` | optional external files such as `__external_claude.md` / `__external_gemini.md` may be added. | evidence optional; policy declaration required in design. |
| `required` | external evidence files are required. | missing evidence fails gate. |

## Review file naming rules
- Correct:
  - `docs/design/design_<id>__reviewer.md`
  - `docs/design/design_<id>__qa.md`
  - `docs/design/design_<id>__researcher.md`
- Incorrect examples:
  - `docs/design/design_<id>_reviewer.md` (single underscore)
  - `docs/design/design_<id>__reviewer.txt` (wrong extension)
- Gate behavior when broken:
  - `gate_failed_summary: missing_review_files:...`

## External AI participation example
1. Generate prompt pack:
   - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/make_review_pack.ps1`
2. Share prompt files manually with external AI:
   - `docs/design/packs/<design_id>/prompt_external_claude.md`
   - `docs/design/packs/<design_id>/prompt_external_gemini.md`
3. Save returned reviews under `docs/design/`:
   - `docs/design/<design_id>__reviewer.md`
   - `docs/design/<design_id>__qa.md`
   - `docs/design/<design_id>__researcher.md`
   - Optional external artifacts: `docs/design/<design_id>__claude_*.md`, `docs/design/<design_id>__gemini_*.md`
4. Run gate:
   - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/design_gate.ps1`
5. Run gate-required E2E:
   - `cd apps/orchestrator && npm.cmd run e2e:auto`

## Review pack manifest contract
- `tools/make_review_pack.ps1` creates `docs/design/packs/<design_id>/manifest.json`.
- Path policy is fixed: `design_path` and `prompts[].path` are repo-relative with `/` separators.
- `sha256` tracks prompt content changes for auditability.

## Whiteboard dry-run reading guide
- `powershell -NoProfile -ExecutionPolicy Bypass -File tools/whiteboard_update.ps1 -DryRun`
- `dry_run_changed: True` means Now/DoD would change if applied.
- `before/after` lines show which text is going to be replaced.
- Sample output:
  - `dry_run_changed: True` (sample)
  - `dry_run_diff_now: before=... after=...` (sample)

## Fast path
1. `npm.cmd run region_ai:start`
2. `npm.cmd run region_ai:status`
3. `cd apps/orchestrator && npm.cmd run e2e:auto`
4. `npm.cmd run region_ai:stop`

## One-command E2E (success path)
- `cmd /d /s /c "cd /d C:\Users\hyuga\region_ai && npm.cmd run region_ai:start && cd apps\orchestrator && npm.cmd run e2e:auto:success && cd /d C:\Users\hyuga\region_ai && npm.cmd run region_ai:status:json:check && npm.cmd run region_ai:stop"`

## One-command E2E (artifact path)
- `cmd /d /s /c "cd /d C:\Users\hyuga\region_ai && npm.cmd run region_ai:start && cd apps\orchestrator && npm.cmd run e2e:auto:artifact && cd /d C:\Users\hyuga\region_ai && npm.cmd run region_ai:status:json:check && npm.cmd run region_ai:stop"`

## Artifact reject E2E
- `cd apps/orchestrator && npm.cmd run e2e:auto:artifact_parent_ng`
- `cd apps/orchestrator && npm.cmd run e2e:auto:artifact_abs_ng`
- `cd apps/orchestrator && npm.cmd run e2e:auto:artifact_unc_ng`
- These are expected-NG tests. Judge by `Result.status=failed` and `errors[0].code=ERR_ACCEPTANCE` (do not rely on summary text).

## Invalid spec E2E
- `cd apps/orchestrator && npm.cmd run e2e:auto:invalid_missing_id_ng`
- `cd apps/orchestrator && npm.cmd run e2e:auto:invalid_bad_acceptance_ng`
- These are expected-NG tests. Judge by `Result.status=failed` and `errors[0].code=ERR_TASK` (do not rely on summary text).
- Option A: pre-validation `ERR_TASK` allocates `run_id` but `runs/<run_id>/artifacts.json` is not expected.
- Reporting note: when `duration_ms` exists and is short, treat it as supporting evidence that executor did not run (reporting aid only).

## Artifacts contract
- `artifacts.files` stores only relative paths from `<workspace>/runs/<run_id>/files/`.
- Example value: `artifact.txt` or `logs/output.txt` (absolute paths are not used).
- Artifact E2E validates file existence in acceptance with `type: artifact_exists` (path relative to run files dir).
- `tools/queue_task_from_template.ps1` keeps a compatibility fallback check for templates that do not declare artifact acceptance.

## JSON status
- `npm.cmd run region_ai:status:json`
- Output is one JSON line only.
- Parse check: `npm.cmd run region_ai:status:json:check`
  - Prints `OK` when stdout is valid one-line JSON.

## Expected failure note
- `strict_ng` scenarios are expected to end as `failed` with `ERR_ACCEPTANCE`.
- `region_ai:status` and `region_ai:status:json` include:
  - `latest_ok_result`: latest expected-good result
  - `latest_ok_result.files_count`: artifact file count in the run
  - `latest_failed_result`: latest failed result
  - `note_expected_failure`: true when failed result matches expected strict_ng pattern

## Workspace and exec root
- Default workspace: `%TEMP%\region_ai\workspace`
- Default exec root: `%TEMP%\region_ai\workspace\exec`
- Override in scripts:
  - `tools/start_region_ai.ps1 -WorkspaceRoot <path> -ExecRoot <path>`
  - `tools/stop_region_ai.ps1 -WorkspaceRoot <path>`
  - `tools/status_region_ai.ps1 -WorkspaceRoot <path>`

## Evidence paths
- PID record: `<workspace>\pids\region_ai.pids.json`
- Archived PID record on stop: `<workspace>\pids\region_ai.pids.stopped.<timestamp>.json`
- Orchestrator logs: `<workspace>\orchestrator.out.<guid>.log`, `<workspace>\orchestrator.err.<guid>.log`
- Executor logs: `<workspace>\executor.out.<guid>.log`, `<workspace>\executor.err.<guid>.log`
- Latest results: `<workspace>\queue\events\result_*.yaml`
- Dashboard: `<workspace>\queue\events\dashboard.log`

## Reporting evidence template
- Required order:
  1. `design_id / Reviewed-by / gate_passed`
  2. `whiteboard Now/DoD diff`
  3. `changed files (repo-relative paths)`
  4. `commands + exit codes (Round1/2)`
  5. `ci_smoke_gate:json` final line
- Standard vs Dev summary line (always include):
  - Standard: `npm.cmd run ci:smoke:gate:json` (`gate_required=true`)
  - Dev: `cd apps/orchestrator && npm.cmd run e2e:auto:dev:json` (`gate_phase=skipped`)
- Whiteboard diff wording rule:
  - `Now`: `<text> (Before/After duplicate prefix must not exist)`
  - `DoD`: `<text> (Before/After duplicate prefix must not exist)`
- Round1/Round2 command log rule:
  - Round1 must contain one negative test and a one-line causal note, for example:
    - `gate failed (discussion_summary_empty) -> ci_smoke_gate exit 1 (smoke_ok=false)`
  - Round2 must contain full restore-pass checks:
    - `npm.cmd run docs:check:json => 0`
    - `npm.cmd run ci:smoke:gate:json => 0`
    - `cd apps/orchestrator && npm.cmd run e2e:auto:dev:json => 0`
    - optional: `powershell -File tools/whiteboard_update.ps1 -DryRun -Json => 0 (changed=false)`
- Dashboard evidence format:
  - Include `file path`, `task_id`, and `line number`.
  - Example command:
    - `Select-String -Path <dashboard> -SimpleMatch <task_id> | Select-Object -First 3`
  - Example snippet format:
    - `<dashboard_path>:<line_number>: [NG] <task_id> ... schema_errors_len=<N>`

