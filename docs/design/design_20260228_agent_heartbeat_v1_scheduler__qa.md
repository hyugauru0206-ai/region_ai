# QA Response: design_20260228_agent_heartbeat_v1_scheduler

- Smoke checks for settings/state/run_now are deterministic and environment-safe.
- Scheduler real-time execution is intentionally excluded from smoke; API-level checks are sufficient.
- UI should expose state and next_run_at for operational verification.
- Verdict: approved.
