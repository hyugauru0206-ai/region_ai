# Review Request: design_20260228_activity_sse_v1

## Goal Summary
- Activity SSE v1 with polling fallback

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Reviewer Checklist
- Is SSE endpoint additive and backwards-compatible with existing REST API?
- Any resource leak risk from subscriber handling?
- Is broadcast path best-effort and non-fatal?
