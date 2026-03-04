# Review Request: design_20260228_inbox_thread_archive_scheduler_v1_1_timeout_tailcap

## Goal Summary
- Inbox Thread Archive Scheduler v1.1: nightly non-destructive archive + timeouts + tail-bytes cap

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
  - scheduler settings/state/run_now(dry) API checks are deterministic and automatable in ui_smoke.
  - dry-run only policy avoids write side effects in smoke environments.
- flakiness_risks:
  - scheduler run_now dry depends on inbox content shape; implementation handles empty targets safely.
- missing_tests:
  - malformed `thread_keys` and timeout bound violations should be covered in additional negative API tests.
