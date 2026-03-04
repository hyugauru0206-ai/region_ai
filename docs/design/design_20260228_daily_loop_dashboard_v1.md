# Design: design_20260228_daily_loop_dashboard_v1

- Status: Ready
- Owner: Codex
- Created: 2026-02-28
- Updated: 2026-02-28
- Scope: Daily Loop Dashboard v1: heartbeat/suggest/consolidation/morning_brief status + run-now

## Context
- Problem: operation status is distributed across multiple panels/APIs and hard to scan quickly.
- Goal: add one-screen dashboard view and one aggregate API for daily loop operations.
- Non-goals: no new automation scheduler logic; no SSE-specific dashboard stream.

## Design diagram
```mermaid
flowchart LR
  UI[#ダッシュボード] --> API[/api/dashboard/daily_loop]
  API --> HB[heartbeat settings/state]
  API --> SG[suggest settings/state]
  API --> NC[consolidation settings/state]
  API --> MB[morning_brief settings/state]
  API --> INB[inbox latest + unread/mention]
```

```mermaid
flowchart TD
  A[run-now click] --> H[/api/heartbeat/run_now facilitator/episodes]
  A --> C[/api/consolidation/run_now facilitator]
  A --> M[/api/routines/morning_brief/run_now]
  H --> R[refresh dashboard]
  C --> R
  M --> R
```

## Whiteboard impact
- Now: Before: daily loop status required manual cross-check in multiple channels. After: `#ダッシュボード` provides consolidated status and actions.
- DoD: Before: no aggregate endpoint for daily loop. After: `/api/dashboard/daily_loop` + dashboard UI + smoke check.
- Blockers: none.
- Risks: aggregate health heuristics may be interpreted differently by operators.

## Multi-AI participation plan
- Reviewer:
  - Request: validate additive safety and run-now wiring.
  - Expected output format: concise bullets.
- QA:
  - Request: validate deterministic smoke checks and missing tests.
  - Expected output format: concise bullets.
- Researcher:
  - Request: validate response schema extensibility and migration safety.
  - Expected output format: concise bullets.
- External AI:
  - Request: optional.
  - Expected output format: n/a.
- external_participation: optional
- external_not_required: true

## Open Decisions
- [x] Decision 1
- [x] Decision 2

### Open Decisions checklist
- [x] Add "Decision 1 Final:" entry with final choice.
- [x] Add "Decision 2 Final:" entry with final choice.

## Final Decisions
- Decision 1 Final: add `GET /api/dashboard/daily_loop` as best-effort aggregate endpoint with capped inbox items.
- Decision 2 Final: dashboard refresh uses 3s polling only while active; no new stream transport in v1.

## Discussion summary
- Change 1: aggregate heartbeat/suggest/consolidation/morning_brief/inbox into one payload with deterministic health.
- Change 2: add `#ダッシュボード` cards with OK/WARN/ERR badges and safe run-now actions.
- Change 3: add smoke assertion for dashboard endpoint and minimum keys.

## Plan
1. Implement aggregate API endpoint.
2. Implement dashboard channel UI + polling + run-now controls.
3. Update smoke/docs.
4. Run gate/smoke verification.

## Risks
- Risk: best-effort aggregation may hide partial data-source failures.
  - Mitigation: include `health.reasons` and `note` in payload.

## Test Plan
- API smoke: `/api/dashboard/daily_loop` returns 200 and key fields.
- Build/gate: docs check, design gate, ui_smoke, ui_build_smoke, desktop_smoke, ci_smoke_gate.

## Reviewed-by
- Reviewer / Codex / 2026-02-28 / approved
- QA / Codex / 2026-02-28 / approved
- Researcher / Codex / 2026-02-28 / approved

## External Reviews
- n/a / skipped
