# Review Request: design_20260228_activity_sse_v1

## Goal Summary
- Activity SSE v1 with polling fallback

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Do #アクティビティ and #ワークスペース receive realtime updates when stream is available?
- On stream error, does 2s polling fallback continue updates?
- Are channel-switch cleanups (SSE close / timer clear) verified?
