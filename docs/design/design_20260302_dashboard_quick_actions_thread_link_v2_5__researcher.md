# Review Request: design_20260302_dashboard_quick_actions_thread_link_v2_5

## Goal Summary
- Quick Actions v2.5: inbox thread linkage

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?

## Researcher Response
- `thread_key` + `thread_key_source` additive response fields are a good compatibility pattern.
- Deterministic key namespace (`qa:<kind>:...`) keeps migration understandable.
- Migration concern: older inbox rows may still map to source-based keys when request/run metadata is missing.
- Missing tests:
  - derive precedence (`explicit thread_key` > request_id mapping > run_id mapping > source fallback).
