# Review Request: design_20260228_activity_sse_v1

## Goal Summary
- Activity SSE v1 with polling fallback

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Is replay cap strategy (default 20, max 50) reasonable?
- Is heartbeat cadence (15s) appropriate for local desktop usage?
- Any concerns with subscriber cap and best-effort delivery semantics?
