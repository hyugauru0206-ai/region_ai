# Review Request: design_20260302_council_autopilot_round_role_format_v2_7

## Goal Summary
- Autopilot round log role format v2.7

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?

## QA Response
- DoD checks are deterministic via `dry_run=true` response inspection for role labels and `round_log_format_version=v2_7`.
- Flakiness risk is low because preview validation avoids runtime council execution side effects.
- Missing negative tests:
  - malformed response payload fallback when preview fields are absent.
  - long text truncation edge case around exact 4KB boundary.
