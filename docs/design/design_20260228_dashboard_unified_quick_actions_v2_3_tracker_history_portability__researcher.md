# Review Request: design_20260228_dashboard_unified_quick_actions_v2_3_tracker_history_portability

## Goal Summary
- Unified Quick Actions v2.3: tracker history export/import/clear with validation + caps

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?

## Researcher Response
- Versioned schema (`regionai.tracker_history.export.v1`) is appropriate and keeps future migration explicit.
- Current shape is sufficient for interoperability; retaining `id/kind/status/request_id/run_id/timestamps` is enough for re-open workflows.
- Migration concern is manageable if import keeps strict schema check and trims optional fields.
- Risk:
  - importing legacy payloads with different key names will be rejected.
- Missing tests:
  - forward-compat fallback behavior when schema version changes.
