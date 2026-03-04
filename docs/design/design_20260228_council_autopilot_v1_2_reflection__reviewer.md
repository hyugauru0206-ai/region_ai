# Review Request: design_20260228_council_autopilot_v1_2_reflection

## Goal Summary
- Council Autopilot v1.2 one-shot reflection loop on quality failure

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## Reviewer Checklist
- Is reflection strictly capped at one attempt and loop-free?
- Are cancel/resume semantics preserved with additive reflection state?
- Is failed_quality finalization explicit and observable in status/output?
