# Review Request: design_20260303_dashboard_next_actions_v3_7

## Goal Summary
- Dashboard Next Actions: surface revert_suggestion + misalignment

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Reviewer Checklist
- Is decision rationale coherent and minimal?
- Any architectural regressions?
- Any compatibility risk with existing E2E contracts?

## Notes
- Additive API endpoint and card are low regression if existing dashboard refresh pipeline is reused.
- Confirm gating stays unchanged by reusing existing quick execute/revert confirm flows.
- Contract risk: keep `items` stable as array even on parse failures.
- Missing tests: endpoint cap/default behavior and conditional validation when revert item is absent.
