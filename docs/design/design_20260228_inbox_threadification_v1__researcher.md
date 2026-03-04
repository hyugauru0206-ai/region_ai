# Review Request: design_20260228_inbox_threadification_v1

## Goal Summary
- Inbox Threadification v1: thread_key grouping + one-click thread history

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
  - source ベース derive は v1 として妥当で、append-only 制約と両立している。
  - ルールは関数に集約し、将来 mapping を追加しやすい構造にするのがよい。
- migration_concerns:
  - 既存 reader が `thread_key` を無視しても動作するため移行リスクは低い。
