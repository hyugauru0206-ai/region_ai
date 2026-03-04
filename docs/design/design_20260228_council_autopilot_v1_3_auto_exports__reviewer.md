# Review Request: design_20260228_council_autopilot_v1_3_auto_exports

## Goal Summary
- Council Autopilot v1.3 auto ops_snapshot + evidence_bundle on completion

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## Reviewer Checklist
- Is export kick idempotency guaranteed via persisted request IDs?
- Are canceled runs prevented from auto export kick?
- Is safety preserved by reusing existing export allowlist/caps logic?
