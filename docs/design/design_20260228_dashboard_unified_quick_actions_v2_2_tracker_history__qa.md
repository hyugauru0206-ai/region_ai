# Review Request: design_20260228_dashboard_unified_quick_actions_v2_2_tracker_history

## Goal Summary
- Unified Quick Actions v2.2: tracker history, auto-close on success, and re-open

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?

## QA Response
- DoD checks are mostly deterministic via build/smoke/gate because this increment is UI-only and API contract unchanged.
- Flakiness risk: timer-driven polling/history append ordering; auto-close toast timing can mask prior toast text.
- Negative checks to keep:
  - execute preview still returns `tracking_plan` and `max_duration_ms`.
  - confirm negative path remains `400 ERR_CONFIRM_REQUIRED`.
- Missing tests:
  - cancel terminal state appends one history row.
  - timeout terminal state appends one history row.
  - auto-close toggle off keeps tracker visible on success.
