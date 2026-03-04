# Review Request: design_20260228_dashboard_unified_quick_actions_v2_2_tracker_history

## Goal Summary
- Unified Quick Actions v2.2: tracker history, auto-close on success, and re-open

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?

## Researcher Response
- Schema strategy: keep history item structure aligned to execute/tracker payload keys (`id/kind/request_id/run_id/status`) for future backend persistence migration.
- Error shape: preserve current normalized execute payload; UI history should store summarized message only (`<=200`) and optional payload sample.
- Migration concern: v2.2 localStorage key includes version suffix (`.v1`) which is good; future migration can up-convert on load with fallback reset.
- Risk: storing full payload can exceed quotas; recommend payload sample only.
- Missing tests:
  - migration from malformed/legacy local history payload to normalized empty state.
