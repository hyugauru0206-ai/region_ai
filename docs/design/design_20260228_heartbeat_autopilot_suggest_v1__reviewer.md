# Reviewer Notes: design_20260228_heartbeat_autopilot_suggest_v1

- Additive design is coherent: heartbeat success is independent from suggestion append failures.
- Idempotent accept behavior is appropriate for repeated UI clicks.
- Safety boundaries are preserved with fixed-path storage and bounded list size.
- Risk: stale open suggestions can accumulate in UX; storage prune cap mitigates disk growth.
- Missing test (non-blocking): explicit re-accept idempotency check should assert same run id.

Decision: approved.
