# Review Request: design_20260228_inbox_thread_actions_v1

## Goal Summary
- Inbox Thread Actions v1: mark read by thread_key (+ optional archive/compact by thread)

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.

## Response
- verdict: approved
- deterministic_checks:
  - `/api/inbox/thread/read_state` が `action/thread_key/marked_read/scanned/exit_code` を返すことを機械判定できる。
  - smoke で thread_key を見つけた場合に mark read API 成功を確認できる。
- flakiness_risks:
  - inbox 空時は skip 条件を入れないと false-negative になる。
- missing_tests:
  - `limit_scan` が極端値のとき cap 正規化されることの検証。
