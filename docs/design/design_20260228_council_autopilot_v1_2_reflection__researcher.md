# Review Request: design_20260228_council_autopilot_v1_2_reflection

## Goal Summary
- Council Autopilot v1.2 one-shot reflection loop on quality failure

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## Researcher Checklist
- Are quality/reflection/finalization state fields additive and bounded by caps?
- Any operational race concerns between cancel and reflection wait/capture?
- Is artifact generation still best-effort and preserved on failed_quality?
