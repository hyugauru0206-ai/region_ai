# QA Notes: design_20260225_golden_recipes

- Verdict: approved.
- Required coverage:
  - recipe success A (`generate_validate_json`)
  - recipe success B (`patch_apply_end_to_end`)
  - recipe expected NG C (`pipeline_exec_fail_ng`, `ERR_EXEC`)
- Regression checks:
  - `e2e:auto`
  - `e2e:auto:strict`
  - docs and smoke gates
