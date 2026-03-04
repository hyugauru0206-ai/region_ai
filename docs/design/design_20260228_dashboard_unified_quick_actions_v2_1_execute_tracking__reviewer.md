# Review Request: design_20260228_dashboard_unified_quick_actions_v2_1_execute_tracking

## Goal Summary
- Add execute tracking panel with safe polling and status integration.

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## Response
- verdict: approved
- key_findings:
  - additive response metadata (`tracking_plan/tracking`) keeps v2 compatibility.
  - timeout/cancel/inflight guards constrain polling risk.
- risks:
  - terminal heuristics can under-detect for heterogeneous endpoints.
- missing_tests:
  - dedicated UI test for channel-switch cleanup of tracker timer is still missing.
