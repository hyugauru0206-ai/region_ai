# Review Request: design_20260228_dashboard_unified_quick_actions_v1

## Goal Summary
- Add a unified dashboard Quick Actions card for one-click dry-run routines/exports.

## Request
- Reply with bullets.
- Focus on deterministic verification.

## Response
- verdict: approved
- deterministic_checks:
  - GET `/api/dashboard/quick_actions` can assert action field and non-empty actions list.
  - POST `/api/dashboard/quick_actions/run` can assert structured JSON response even when `ok=false`.
- flakiness_risks:
  - run result content may vary by workspace state; checks should target shape and non-hang behavior.
- missing_tests:
  - UI-level debounce/inflight behavior is not directly asserted in automation.
