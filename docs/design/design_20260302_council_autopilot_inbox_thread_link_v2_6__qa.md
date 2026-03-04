# Review Request: design_20260302_council_autopilot_inbox_thread_link_v2_6

## Goal Summary
- Council Autopilot v2.6: inbox thread debate log

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?

## QA Response
- DoD checks are deterministic: `dry_run=true` validates `thread_key` regex and `/api/inbox/thread` lookup without starting autopilot.
- Flakiness risk remains in live run round/final observation because external runner timing/log shape may vary.
- Negative-path coverage still missing:
  - invalid `thread_key` and malformed `dry_run` payload handling in council start.
  - forced append failure path ensuring run control remains unaffected.
