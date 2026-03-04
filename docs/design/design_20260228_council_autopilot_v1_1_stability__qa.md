# Review Request: design_20260228_council_autopilot_v1_1_stability

## Goal Summary
- Council Autopilot v1.1 stability (cancel/resume + auto artifact + quality checks)

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## QA Checklist
- Does run start/status/cancel/resume behave correctly from UI and API?
- Does canceled run become resumable (`can_resume=true`) without corrupting progress?
- On completion, is answer artifact queued and quality-fail mention appended to inbox?
