# QA Notes: design_20260224_run_meta_artifacts

- Verdict: approved
- Planned coverage:
  - success: `_meta/task.yaml`, `_meta/result_pre_acceptance.json`, `_meta/result.json` を artifact checks で確認
  - expected NG: acceptance mismatch で `ERR_ACCEPTANCE`
  - invalid NG: include enum invalid で `ERR_TASK`
- Expected stability:
  - `e2e:auto`/`e2e:auto:strict` 既存ケースとの互換を確認する。
