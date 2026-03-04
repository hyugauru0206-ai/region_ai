# Review Request: design_20260228_council_autopilot_v1_1_stability

## Goal Summary
- Council Autopilot v1.1 stability (cancel/resume + auto artifact + quality checks)

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## Reviewer Checklist
- Are cancel/resume state transitions coherent across ui_api and desktop runner?
- Is `POST /api/council/run` resume mode additive and backward compatible?
- Are partial progress fields (`current_step/current_role/retries/last_error/can_resume`) sufficient for operational debugging?
