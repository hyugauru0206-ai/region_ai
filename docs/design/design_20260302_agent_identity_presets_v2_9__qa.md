# Review Request: design_20260302_agent_identity_presets_v2_9

## Goal Summary
- Agent Identity Presets v2.9: one-click preset sets for council roles

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?

## QA Response
- DoD checks are deterministic with API-only smoke (`GET presets`, `POST apply_preset dry_run`).
- Flakiness risk is low because dry-run avoids filesystem mutation and side-effect races.
- Missing negative tests:
  - unknown preset id (`ERR_PRESET_NOT_FOUND`) behavior.
  - dry_run=false apply activity emission assertions.
