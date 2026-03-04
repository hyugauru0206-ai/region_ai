# Review Request: design_20260302_dashboard_tracker_history_workspace_v1

## Goal Summary
- Tracker history workspace persistence v1

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?

## QA Response
- DoD checks are deterministic via dry-run append + GET + existing smoke/build/gate suite.
- Flakiness risk remains low; no new long-running async loops were introduced.
- Negative checks to keep:
  - append dry-run returns appended=false and exit_code=0.
  - GET tracker history returns action and exit_code=0 under empty/non-empty states.
- Missing tests:
  - append invalid payload returns non-success outcome.
  - restore fallback path when workspace API is unreachable.
