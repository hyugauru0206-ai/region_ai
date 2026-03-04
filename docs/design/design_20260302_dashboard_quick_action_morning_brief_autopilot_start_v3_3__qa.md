# Review Request: design_20260302_dashboard_quick_action_morning_brief_autopilot_start_v3_3

## Goal Summary
- Dashboard quick action: morning brief + recommended profile apply + council autopilot start

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?

- QA result: approved.
- Determinism: preview path is dry-run only.
- Added checks: recommended_profile present, preflight dry_run true, APPLY欠落400.
