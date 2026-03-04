# Reviewer Response: design_20260228_agent_heartbeat_v1_scheduler

- Scheduler in ui_api aligns with desktop-optional requirement.
- Safety controls (max_per_day, lock+stale recovery, backoff, failure stop) are appropriate for v1.
- API additions are additive and reuse existing heartbeat run path.
- Verdict: approved.
