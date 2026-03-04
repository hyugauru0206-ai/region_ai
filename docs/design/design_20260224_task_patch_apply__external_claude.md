# External Review: design_20260224_task_patch_apply (Claude)

- verdict: noted
- key_findings:
  - executor-side apply is appropriate because it keeps patch effects inside workspace runtime boundaries.
  - requiring explicit path rejection (`abs/UNC/..`) is necessary to avoid sandbox breakout vectors.
- risks:
  - unified parser should stay intentionally narrow to reduce ambiguous behavior.
- alternatives:
  - optionally support file-create only first, then expand to full hunk support later.
- missing_tests:
  - add one multi-file patch success scenario after baseline rollout.
