# Review Request: design_20260228_thread_archive_scheduler_dashboard_v1

## Goal Summary
- Dashboard integration v1 for thread archive scheduler: status card + richer state (additive)

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?

## Response
- verdict: noted
- maintainability_notes:
  - additive observability fields with strict caps are suitable for long-lived JSON state files.
  - computed `next_run_local` in API response avoids persistence coupling.
- migration_concerns:
  - none; legacy state files remain readable with defaults.
