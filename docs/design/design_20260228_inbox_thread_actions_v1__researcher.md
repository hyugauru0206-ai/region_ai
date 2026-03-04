# Review Request: design_20260228_inbox_thread_actions_v1

## Goal Summary
- Inbox Thread Actions v1: mark read by thread_key (+ optional archive/compact by thread)

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## Response
- verdict: noted
- maintainability_notes:
  - `thread_keys` を read_state に additive 追加する案は既存クライアント互換を保ちやすい。
  - stable key 生成ロジックは関数化して一箇所で管理するのが望ましい。
- migration_concerns:
  - 既存データの再書換え不要で導入コストは低い。
