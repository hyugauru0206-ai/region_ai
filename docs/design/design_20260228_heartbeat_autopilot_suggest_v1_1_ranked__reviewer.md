# Reviewer Notes: design_20260228_heartbeat_autopilot_suggest_v1_1_ranked

- Additive model is sound; legacy single-topic suggestions remain readable.
- Optional `rank` on accept preserves v1 API behavior.
- Risk: candidate selection mismatch if rank missing in malformed items.
- Missing test: invalid rank (`0`/`4`) should return `ERR_BAD_REQUEST`.

Decision: approved.
