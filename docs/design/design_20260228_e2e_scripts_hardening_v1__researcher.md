# Review Request: design_20260228_e2e_scripts_hardening_v1

## Goal Summary
- E2E scripts hardening v1: route recipes/e2e scripts via tools/run_e2e.ps1 for stdout-safe execution

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?

## Response
- verdict: noted
- maintainability_notes:
  - v1 で mode 固定配列とする判断は実装コストが低く、短期安定化に適している。
  - 将来は recipes カタログから mode 抽出する自動同期方式に拡張余地がある。
- migration_concerns:
  - 既存 `run_e2e.ps1` mode 名に依存するため、mode rename 時は `recipes_all.ps1` と docs 更新が必要。
