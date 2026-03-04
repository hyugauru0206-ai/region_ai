# Review Request: design_20260228_dashboard_unified_quick_actions_v2_1_execute_tracking

## Goal Summary
- Add execute tracking panel with safe polling and status integration.

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## Response
- verdict: approved
- deterministic_checks:
  - execute dry-run response includes `tracking_plan.status_endpoint` and `tracking_plan.max_duration_ms`.
  - smoke keeps side effects zero by validating preview path only.
- flakiness_risks:
  - none significant for preview checks; runtime status payload variance is tolerated by best-effort logic.
- missing_tests:
  - automated timeout-path UI assertion is not present.
