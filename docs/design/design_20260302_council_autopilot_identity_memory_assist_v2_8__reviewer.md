# Review Request: design_20260302_council_autopilot_identity_memory_assist_v2_8

## Goal Summary
- Autopilot v2.8: identity/memory assisted role lines

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Reviewer Checklist
- Is decision rationale coherent and minimal?
- Any architectural regressions?
- Any compatibility risk with existing E2E contracts?

## Reviewer Response
- Rationale is coherent: additive hints and fallback guarantees without changing council control flow.
- Architectural regression risk is low because identity/memory reads are best-effort and formatter is isolated.
- Compatibility risk: environments with sparse agent memory may show mostly fallback text, but still satisfy format/readability requirements.
- Missing tests:
  - verify hint truncation when identity + memory hints are both long.
  - verify operator/critic id fallback mapping (`operator->impl`, `critic->qa`) when dedicated IDs are absent.
