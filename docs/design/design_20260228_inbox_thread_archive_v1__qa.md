# Review Request: design_20260228_inbox_thread_archive_v1

## Response
- verdict: approved
- deterministic_checks:
  - dry-runで `action/thread_key/archive_path/archived` を機械判定可能。
  - smokeは dry-run のみ実行し副作用を回避できる。
- missing_tests:
  - since_ts 指定時のフィルタ境界（equal / greater）。
