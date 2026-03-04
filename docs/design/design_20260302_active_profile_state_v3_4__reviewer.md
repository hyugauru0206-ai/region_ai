# Review Request: design_20260302_active_profile_state_v3_4

## Goal Summary
- Active profile SSOT + dashboard display v3.4

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Reviewer Checklist
- Is decision rationale coherent and minimal?
- Any architectural regressions?
- Any compatibility risk with existing E2E contracts?

- Review result: approved (additive API fields and fallback behavior are coherent).
- Risk: state-write drift is surfaced via active_profile_updated.
