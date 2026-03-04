# Review Request: design_20260228_dashboard_unified_quick_actions_v2_2_tracker_history

## Goal Summary
- Unified Quick Actions v2.2: tracker history, auto-close on success, and re-open

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Reviewer Checklist
- Is decision rationale coherent and minimal?
- Any architectural regressions?
- Any compatibility risk with existing E2E contracts?

## Reviewer Response
- Rationale is coherent: UI-only additive scope avoids backend/API contract churn.
- No architectural regression found; tracker polling path remains v2.1-compatible and reuse is clear.
- Main risk is duplicate history append on terminal transitions; dedup key guard is required.
- Main compatibility note: keep `ui_smoke` API-only assertions unchanged for side-effect safety.
- Missing tests:
  - localStorage invalid JSON reset behavior.
  - history cap10 trimming and latest-first ordering.
  - re-open flow with missing `request_id` toast path.
