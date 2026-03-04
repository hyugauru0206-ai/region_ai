# Review: design_20260224_e2e_forbidden_parallel_guard (QA)

- verdict: approved
- key_findings:
  - reproduction test + isolated path provide deterministic evidence.
  - JSON diagnostics are concrete enough for triage.
- risks:
  - timing-dependent race in manual parallel reproduction.
- alternatives:
  - lock marker fixture helper for deterministic simulation.
- missing_tests:
  - optional AutoIsolate case when WorkspaceRoot is explicit.
