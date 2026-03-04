# Review: design_20260224_patch_apply_apply_fail_contract (Reviewer)

- verdict: approved
- key_findings:
  - separating ERR_TASK and ERR_EXEC improves operational diagnosis without breaking existing task envelope.
  - keeping path violations at pre-validation maintains security fail-fast behavior.
- risks:
  - fallback path must stay explicit when executor does not provide error_code.
- alternatives:
  - optional future enum for reason_key values in spec.
- missing_tests:
  - add one hunk-mismatch variant in future.
