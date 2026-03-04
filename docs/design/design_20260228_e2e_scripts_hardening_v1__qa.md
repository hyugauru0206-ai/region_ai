# Review Request: design_20260228_e2e_scripts_hardening_v1

## Goal Summary
- E2E scripts hardening v1: route recipes/e2e scripts via tools/run_e2e.ps1 for stdout-safe execution

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## QA Checklist
- Are DoD checks deterministic and automatable?
- What flakiness risks remain?
- Which negative tests are still missing?

## Response
- verdict: approved
- deterministic_checks:
  - `-Json` 実行時の最終1行JSONを機械判定対象にする方針は妥当。
  - `recipes_all.ps1` の fail-fast で途中失敗を即時検知できる。
- flakiness_risks:
  - npm stdout の揺れは tools 経由に置換することで大きく低減見込み。
- missing_tests:
  - `Modes` 引数指定時の任意 subset 実行と失敗 mode の JSON 反映確認を追加するとよい。
