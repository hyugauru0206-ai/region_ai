# Review Request: design_20260302_council_autopilot_inbox_thread_link_v2_6

## Goal Summary
- Council Autopilot v2.6: inbox thread debate log

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?

## Researcher Response
- `ap:*` namespace aligns with existing `qa:*` strategy and keeps thread derivation simple/portable.
- Error payload shape is acceptable; additive `thread_key_source` improves client-side explainability.
- Migration concern is limited to legacy rows without explicit key; derive fallback from `request_id/run_id` preserves practical continuity.
- Missing tests:
  - long token truncation with hash suffix near 80-char boundary.
  - mixed legacy/new inbox rows grouped under same `ap:*` key.
