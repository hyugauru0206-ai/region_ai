# Review Request: design_20260228_dashboard_unified_quick_actions_v2_selective_execute

## Goal Summary
- Extend unified quick actions with selective execute and confirm/preflight guards.

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## Response
- verdict: approved
- key_findings:
  - execute path remains tightly scoped with server-side allowlist and explicit confirm phrase.
  - v1 dry-run behavior is preserved; new fields are additive.
- risks:
  - UI-side preflight gating can regress if modal state logic is changed later.
- missing_tests:
  - explicit unsupported-id 400 assertion for execute endpoint is still not covered in smoke.
