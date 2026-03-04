# Review Request: design_20260302_council_autopilot_round_role_format_v2_7

## Goal Summary
- Autopilot round log role format v2.7

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?

## Researcher Response
- Fixed label lines provide a lightweight textual contract without requiring schema migration for existing inbox rows.
- Additive dry-run preview/version fields are sufficient for forward compatibility and contract probing.
- Migration concern is minimal: historical rows remain readable and new rows become structured from v2.7 onward.
- Missing tests:
  - ensure preview remains stable across refactors (golden-text style check in smoke).
  - validate role labels remain in fixed order.
