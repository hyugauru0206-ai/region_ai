# Review Request: design_20260228_council_autopilot_v1_4_auto_release_bundle

## Goal Summary
- Council Autopilot v1.4 auto kick recipe_release_bundle

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## Reviewer Checklist
- Is release bundle kick idempotent per council run?
- Is cancel behavior respected (no kick when canceled before kick)?
- Is execution path constrained to existing recipe allowlist route?
