# Review Request: design_20260302_dashboard_quick_actions_thread_link_v2_5

## Goal Summary
- Quick Actions v2.5: inbox thread linkage

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?

## QA Response
- Deterministic checks are automatable via preview execute and inbox thread lookup in ui_smoke.
- Flakiness risk is low; no long polling behavior changes were introduced.
- Negative tests still needed:
  - invalid thread_key pattern guard.
  - fallback thread_key generation when request_id/run_id are absent.
  - inbox thread API with derived-only rows (no explicit thread_key).
