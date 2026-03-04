# QA Notes: design_20260228_heartbeat_autopilot_suggest_v1_1_ranked

- Smoke checks are deterministic with API-only flow (no DOM dependency required).
- Candidate-length assertion (`>=1`) is stable and sufficient for v1.1 gate.
- Missing negative checks: accept unknown suggestion id and invalid rank body.

Decision: approved.
