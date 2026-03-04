# Review Request: design_20260302_agent_identity_presets_v2_9

## Goal Summary
- Agent Identity Presets v2.9: one-click preset sets for council roles

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?

## Researcher Response
- Preset-set allowlist with fixed workspace path is suitable for operational safety in v2.9.
- Hash-based diff preview is a good low-cost interoperability choice without exposing full trait payload.
- Migration concern is minimal: presets are additive and auto-created; existing agents remain valid until apply.
- Missing tests:
  - preset file corruption fallback to defaults.
  - council mapping fallback correctness across custom agent registries.
