# Review Request: design_20260302_council_autopilot_identity_memory_assist_v2_8

## Goal Summary
- Autopilot v2.8: identity/memory assisted role lines

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?

## QA Response
- DoD checks are deterministic through `dry_run=true` preview assertions (`v2_8`, labels present, effective non-empty).
- Flakiness risk is limited because smoke does not depend on live council round progression.
- Missing negative tests:
  - malformed agents/memory files to confirm best-effort fallback path.
  - edge case where all hints are absent and fallback templates must still satisfy non-empty checks.
