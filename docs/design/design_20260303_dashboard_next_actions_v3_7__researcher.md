# Review Request: design_20260303_dashboard_next_actions_v3_7

## Goal Summary
- Dashboard Next Actions: surface revert_suggestion + misalignment

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?

## Notes
- Keep a fixed `kind` discriminator plus stable core fields to preserve forward compatibility.
- Best-effort 200 response with `items: []` is appropriate for dashboard UX resilience.
- Migration concern is low because this is additive and does not alter inbox item structure.
- Recommend documenting optional fields per kind in `spec_region_ai.md`.
