# Review Request: design_20260302_dashboard_tracker_history_workspace_v1

## Goal Summary
- Tracker history workspace persistence v1

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?

## Researcher Response
- Schema parity with v2.3 entry shape is good for forward compatibility.
- Versioning can remain in export schema; workspace JSONL can stay entry-only for append simplicity.
- Migration concern: local-only history may contain payload_sample fields; sanitization should ignore unknown fields.
- Risk: timestamp ordering by string assumes ISO shape.
- Missing tests:
  - merge ordering when ended_at is malformed/non-ISO.
