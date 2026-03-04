# Review Request: design_20260228_inbox_threadification_v1

## Goal Summary
- Inbox Threadification v1: thread_key grouping + one-click thread history

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
  - `thread_key` additive + derive 補完なので既存行互換を維持できる。
  - `/api/inbox/thread` は既存 `/api/inbox` と独立導線で回帰影響を局所化できる。
- risks:
  - writer 追加箇所で共通 append ヘルパを通さないと thread_key 抜けが発生し得る。
- missing_tests:
  - 旧行（thread_keyなし）を含む混在データで `/api/inbox/thread` が期待 key のみ返す確認。
