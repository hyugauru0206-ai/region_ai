# Review: design_20260224_patch_apply_apply_fail_contract (QA)

- verdict: approved
- key_findings:
  - new apply-failure NG E2E is deterministic and verifies ERR_EXEC explicitly.
  - existing invalid-format/path tests remain available for ERR_TASK regression checks.
- risks:
  - lock contention can hide expected NG assertions if tests are parallelized.
- alternatives:
  - add isolated-workspace variant for heavier suites.
- missing_tests:
  - optional stderr truncation/note assertion case.
