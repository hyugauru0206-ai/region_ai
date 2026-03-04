# Review Request: design_20260228_e2e_scripts_hardening_v1

## Goal Summary
- E2E scripts hardening v1: route recipes/e2e scripts via tools/run_e2e.ps1 for stdout-safe execution

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Reviewer Checklist
- Is decision rationale coherent and minimal?
- Any architectural regressions?
- Any compatibility risk with existing E2E contracts?

## Response
- verdict: approved
- key_findings:
  - tools 経由に寄せる判断は既存 `run_e2e.ps1` 契約を再利用でき、変更面積が小さい。
  - `Set-Location (Resolve-Path '..\\..')` を scripts に入れることで cwd 依存を排除できる。
- risks:
  - `recipes:all` mode をハードコードするため、将来の追加時に更新漏れリスクがある。
- missing_tests:
  - `cd apps/orchestrator` 起点で対象2コマンドが連続実行でも exit 0 維持する確認を継続運用に入れるべき。
