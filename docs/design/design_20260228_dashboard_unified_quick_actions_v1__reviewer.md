# Review Request: design_20260228_dashboard_unified_quick_actions_v1

## Goal Summary
- Add a unified dashboard Quick Actions card for one-click dry-run routines/exports.

## Request
- Reply with bullets.
- Focus on regression risks and missing tests.

## Response
- verdict: approved
- key_findings:
  - additive APIs and UI card keep existing dashboard/ops flows intact.
  - explicit dry-run-only policy reduces side-effect risk for v1.
- risks:
  - fixed action ID list may drift if endpoints are renamed without updating the map.
- missing_tests:
  - direct API negative test for unsupported `id` is not explicitly covered in smoke.
