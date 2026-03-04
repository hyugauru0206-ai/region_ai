# QA Notes: design_20260228_heartbeat_autopilot_suggest_v1

- DoD checks are deterministic if smoke validates create -> list -> accept API sequence.
- Flakiness risk is low because no SSE/UI timing dependency is required for API checks.
- Missing negative tests: invalid suggestion id on accept/dismiss and malformed payload handling.
- Recommended smoke scope: assert boolean flags for suggestion create/accept only (no council completion wait).

Decision: approved.
