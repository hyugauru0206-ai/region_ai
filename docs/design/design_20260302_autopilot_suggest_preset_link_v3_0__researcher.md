# Researcher Notes: design_20260302_autopilot_suggest_preset_link_v3_0

- verdict: noted
- key_findings:
  - deterministic rank->preset mapping is simple and auditable.
  - storing apply status in suggestion item improves traceability.
- risks:
  - stale preset catalog can reduce candidate coverage.
- alternatives:
  - future: policy-driven mapping by category/signal.
- missing_tests:
  - migration read-path test for legacy suggestion rows.
