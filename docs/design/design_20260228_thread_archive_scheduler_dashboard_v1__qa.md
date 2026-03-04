# Review Request: design_20260228_thread_archive_scheduler_dashboard_v1

## Goal Summary
- Dashboard integration v1 for thread archive scheduler: status card + richer state (additive)

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?

## Response
- verdict: approved
- deterministic_checks:
  - dashboard endpoint GET and key field type checks are deterministic in smoke.
  - card rendering uses additive fields with default fallbacks.
- flakiness_risks:
  - dashboard state may depend on recent scheduler activity; tests should assert type/presence, not exact values.
- missing_tests:
  - API negative cases for malformed state payload are not explicitly covered.
