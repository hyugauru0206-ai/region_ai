# Review Request: design_20260302_council_autopilot_round_role_format_v2_7

## Goal Summary
- Autopilot round log role format v2.7

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Reviewer Checklist
- Is decision rationale coherent and minimal?
- Any architectural regressions?
- Any compatibility risk with existing E2E contracts?

## Reviewer Response
- Decision rationale is coherent: format-only change on round body with fixed labels and additive dry-run preview field.
- Architectural regression risk is low because append remains best-effort and thread-key flow is unchanged from v2.6.
- Compatibility risk: legacy round entries remain old free-form text, which is acceptable.
- Missing tests:
  - explicit truncation marker assertion for over-cap synthetic round summary.
  - round append links carrying `round_index`/`round_id`.
