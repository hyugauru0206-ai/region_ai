# Review Request: design_20260228_dashboard_unified_quick_actions_v2_3_tracker_history_portability

## Goal Summary
- Unified Quick Actions v2.3: tracker history export/import/clear with validation + caps

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?

## QA Response
- Deterministic checks remain automatable via existing smoke/build/gate flow because this is UI-only and no API contract changed.
- Flakiness risk is low; main timing-sensitive area remains tracker polling (unchanged from v2.2).
- Negative checks to retain:
  - execute preview tracking_plan validation still passes.
  - confirm-required negative path still returns expected error in ui_smoke.
- Missing tests:
  - import parse failure and schema mismatch errors.
  - skip-count correctness when mixed valid/invalid entries are imported.
  - clear history blocked when phrase is not `CLEAR`.
