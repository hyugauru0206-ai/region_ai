# Review Request: design_20260302_autopilot_final_revert_suggestion_v3_6

## Goal Summary
- Autopilot final -> inbox revert suggestion (no auto exec)

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Reviewer Checklist
- Is decision rationale coherent and minimal?
- Any architectural regressions?
- Any compatibility risk with existing E2E contracts?

## Reviewer Notes
- Design is additive and keeps existing autopilot final flow intact; no behavior regression for standard profile runs.
- Dedupe strategy is coherent: state-first (`revert_suggest_state.json`) with inbox tail fallback when state is stale/corrupt.
- Compatibility risk is low; new `source="revert_suggestion"` and dry-run preview field are additive.
- Missing test risk: non-dry-run final path dedupe across same-day repeated final sweeps is not directly covered by smoke.
