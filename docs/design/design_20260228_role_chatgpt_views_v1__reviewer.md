# Review Request: design_20260228_role_chatgpt_views_v1

## Goal Summary
- role-based ChatGPT views with partition isolation and workspace focus route

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Reviewer Checklist
- Are role partitions fixed and deterministic?
- Is active view switching additive and non-destructive?
- Do bridge operations correctly target only the active role view?
