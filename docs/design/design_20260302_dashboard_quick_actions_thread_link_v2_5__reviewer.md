# Review Request: design_20260302_dashboard_quick_actions_thread_link_v2_5

## Goal Summary
- Quick Actions v2.5: inbox thread linkage

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Reviewer Checklist
- Is decision rationale coherent and minimal?
- Any architectural regressions?
- Any compatibility risk with existing E2E contracts?

## Reviewer Response
- Rationale is coherent and additive; no break to existing quick action flow.
- Architectural regression risk is low because linkage is layered onto existing inbox derive path.
- Compatibility risk: legacy rows without request_id stay on old fallback keys, which is acceptable.
- Missing tests:
  - deterministic key generation under long request_id/run_id values.
  - same request_id maps execute + completion into identical thread key.
