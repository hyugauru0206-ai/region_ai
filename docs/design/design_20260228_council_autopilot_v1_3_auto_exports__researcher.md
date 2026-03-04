# Review Request: design_20260228_council_autopilot_v1_3_auto_exports

## Goal Summary
- Council Autopilot v1.3 auto ops_snapshot + evidence_bundle on completion

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## Researcher Checklist
- Are new `exports` fields additive and backward compatible for old run records?
- Are queue defaults bounded (`max_runs=20`, `include_archives=false`, ops limits fixed)?
- Any risk that status polling frequency could overload tracking sweeps?
