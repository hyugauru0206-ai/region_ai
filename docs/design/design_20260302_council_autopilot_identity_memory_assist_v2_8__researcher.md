# Review Request: design_20260302_council_autopilot_identity_memory_assist_v2_8

## Goal Summary
- Autopilot v2.8: identity/memory assisted role lines

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?

## Researcher Response
- Current approach is suitable: textual role-format contract remains stable while hint enrichment is additive and optional.
- Additional booleans (`identity_hints_used`, `memory_hints_used`) improve observability without schema churn.
- Migration concerns are minimal; old logs remain valid and new logs become richer under v2.8.
- Missing tests:
  - verify legacy rows and v2.8 rows coexist cleanly in thread view.
  - verify per-line and global caps prevent payload growth under noisy memory data.
