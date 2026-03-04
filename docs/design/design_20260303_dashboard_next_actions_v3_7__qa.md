# Review Request: design_20260303_dashboard_next_actions_v3_7

## Goal Summary
- Dashboard Next Actions: surface revert_suggestion + misalignment

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?

## Notes
- Deterministic checks: endpoint status 200, `action` equals `dashboard_next_actions`, `items` is array.
- Conditional checks prevent flakiness: validate revert fields only when `kind=="revert_suggestion"` exists.
- Negative tests: invalid `limit` fallback to default and max-cap at 10.
- UI verification: confirm open-thread and quick-action jump are no-op safe when target data missing.
