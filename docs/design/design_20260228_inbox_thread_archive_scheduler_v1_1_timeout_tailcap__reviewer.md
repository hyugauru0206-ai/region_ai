# Review Request: design_20260228_inbox_thread_archive_scheduler_v1_1_timeout_tailcap

## Goal Summary
- Inbox Thread Archive Scheduler v1.1: nightly non-destructive archive + timeouts + tail-bytes cap

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Reviewer Checklist
- Is decision rationale coherent and minimal?
- Any architectural regressions?
- Any compatibility risk with existing E2E contracts?

## Response
- verdict: approved
- key_findings:
  - additive API and runtime-state files keep backward compatibility.
  - scheduler lock + failure brake + summary audit align with existing operations pattern.
- risks:
  - tail-bytes window may miss older matching entries when fallback line scan is scan-capped.
- missing_tests:
  - invalid scheduler settings payload cases (timeout relation and malformed keys) could be expanded.
