# Review Request: design_20260228_council_autopilot_v1_2_reflection

## Goal Summary
- Council Autopilot v1.2 one-shot reflection loop on quality failure

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## QA Checklist
- On first quality failure, does reflection run exactly once?
- On second quality failure, does run end as failed_quality with mention notification?
- Is best-effort artifact generated in both reflected success and failed_quality cases?
