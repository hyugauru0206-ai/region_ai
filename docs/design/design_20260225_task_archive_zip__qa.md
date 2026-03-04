# QA Notes: design_20260225_task_archive_zip

- Verdict: approved.
- Coverage plan:
  - success: zip + manifest created and manifest pointer check passes.
  - expected NG path policy: traversal input rejected with `ERR_TASK`.
  - invalid schema: malformed output/limits rejected with `ERR_TASK`.
- Regression checks include `e2e:auto` and `e2e:auto:strict`.
