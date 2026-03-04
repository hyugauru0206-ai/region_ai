# External Review: design_20260224_patch_apply_apply_fail_contract (Claude)

- verdict: noted
- key_findings:
  - runtime apply failure should be classified as execution error to keep task-contract errors distinct.
  - reason key and stderr sample are useful for operational triage.
- risks:
  - parser mismatch between pre-validation and runtime could blur boundaries.
- alternatives:
  - fallback policy documentation should remain explicit (`error_code` absent -> ERR_TASK).
- missing_tests:
  - optional hunk-context-mismatch case in addition to target-missing case.
