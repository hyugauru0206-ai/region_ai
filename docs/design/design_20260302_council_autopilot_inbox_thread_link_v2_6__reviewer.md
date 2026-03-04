# Review Request: design_20260302_council_autopilot_inbox_thread_link_v2_6

## Goal Summary
- Council Autopilot v2.6: inbox thread debate log

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Reviewer Checklist
- Is decision rationale coherent and minimal?
- Any architectural regressions?
- Any compatibility risk with existing E2E contracts?

## Reviewer Response
- Decision rationale is coherent and additive; start API extension and inbox append are backward compatible.
- Architectural regression risk is low because append path is best-effort and isolated from core run control.
- Compatibility risk: council log schema is external, so round summary extraction can degrade to generic text.
- Missing tests:
  - deterministic `ap:*` fallback behavior when `request_id`/`run_id` are absent in legacy rows.
  - start/resume response consistency for `thread_key` and `thread_key_source`.
