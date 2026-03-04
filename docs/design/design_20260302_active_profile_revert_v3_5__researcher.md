# Review Request: design_20260302_active_profile_revert_v3_5

## Goal Summary
- Active profile revert to standard with confirm + dashboard/quick action

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?

- Research note: endpoint schema is additive and backward-compatible.
- Migration concern: none; default dry_run preserves safety.
