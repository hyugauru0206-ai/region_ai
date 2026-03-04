# Review Request: design_20260302_autopilot_final_revert_suggestion_v3_6

## Goal Summary
- Autopilot final -> inbox revert suggestion (no auto exec)

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?

## QA Notes
- DoD checks are deterministic in smoke via `dry_run=true` preview assertions (shape, ids, regex, boolean type).
- Flakiness risk is low because no live autopilot execution is required; checks are API response based.
- Expected negative coverage remains outside smoke: runtime append failure should not break autopilot finalization (best-effort path).
- Additional nice-to-have: test for `should_suggest=false` when active profile is already `standard`.
