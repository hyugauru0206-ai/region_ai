# Review Request: design_20260228_inbox_threadification_v1

## Goal Summary
- Inbox Threadification v1: thread_key grouping + one-click thread history

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
  - `/api/inbox?limit=1` で item があれば `thread_key` 非空を確認可能。
  - `/api/inbox/thread?key=...&limit=5` の key 一致性検証は機械判定しやすい。
- flakiness_risks:
  - inbox 空環境では thread API 検証が不能なため skip 条件を smoke で明示する必要がある。
- missing_tests:
  - 不正 key（長すぎ/文字種違反）で 400 を返す入力バリデーション確認。
