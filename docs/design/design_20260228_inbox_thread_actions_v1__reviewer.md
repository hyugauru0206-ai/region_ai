# Review Request: design_20260228_inbox_thread_actions_v1

## Goal Summary
- Inbox Thread Actions v1: mark read by thread_key (+ optional archive/compact by thread)

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## Response
- verdict: approved
- key_findings:
  - thread_key 単位既読を additive API で実装する方針は既存 read_state 互換を維持しやすい。
  - `limit_scan` と `max_items` cap により負荷上限を制御できる。
- risks:
  - fallback hash key に依存するケースで厳密一意性が弱い。
- missing_tests:
  - `thread_key` 不正入力（文字種/長さ）時の 400 応答確認。
