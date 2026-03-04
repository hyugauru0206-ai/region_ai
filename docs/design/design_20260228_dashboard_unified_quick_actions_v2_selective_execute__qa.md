# Review Request: design_20260228_dashboard_unified_quick_actions_v2_selective_execute

## Goal Summary
- Extend unified quick actions with selective execute and confirm/preflight guards.

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## Response
- verdict: approved
- deterministic_checks:
  - execute preview (`dry_run=true`) validates endpoint shape without side effects.
  - confirm-negative check validates `ERR_CONFIRM_REQUIRED` with expected 400 response.
- flakiness_risks:
  - queued execute success can depend on runtime templates, so smoke should stay preview-first.
- missing_tests:
  - UI timeout path (>10s) is not directly automated.
