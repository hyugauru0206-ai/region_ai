# Review Request: design_20260228_agent_identity_traits_v1

## Goal Summary
- Agent Identity Traits v1 (profile + style + autopilot injection)

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## QA Checklist
- Can identity fields be saved and reloaded via GET/POST `/api/org/agents`?
- Does `#メンバー` expose editable identity fields and save partial updates?
- Is identity reflected in autopilot prompt text without breaking existing flow?
