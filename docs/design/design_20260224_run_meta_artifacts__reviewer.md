# Reviewer Notes: design_20260224_run_meta_artifacts

- Verdict: approved
- Scope check: optional flag (`mirror_run_meta`) で既存タスクの既定挙動を不変に維持できる。
- Contract check: include enum を schema と light validation の二段で担保し、invalid は `ERR_TASK` で統一。
- Runtime check: `_meta` 書き込み失敗を `ERR_EXEC` (`RUN_META_WRITE_FAILED`) に統一する方針は妥当。
- Regression risk:
  - `_meta/result.json` を acceptance 前に placeholder 生成し最終で上書きするため、同名ファイルの参照タイミング依存に注意。
