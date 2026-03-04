# Review Request: design_20260228_role_chatgpt_views_v1

## Goal Summary
- role-based ChatGPT views with partition isolation and workspace focus route

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Is keeping all role BrowserViews alive acceptable for local desktop footprint?
- Are partition names stable and future-compatible?
- Any constraints around preload message relay for `regionai:focusRole`?
