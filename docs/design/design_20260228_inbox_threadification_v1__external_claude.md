# External Review: design_20260228_inbox_threadification_v1

- verdict: noted
- key_findings:
  - thread_key additive 導入は既存 JSONL append-only 運用と整合する。
  - UI 右ペインでスレッド履歴を直接見られる導線は運用上の追跡コストを下げる。
- risks:
  - source 由来の derive ルールは新規 source 追加時に見直しが必要。
- suggestion:
  - 将来 `GET /api/inbox/threads` summary 追加でフィルタUIを強化可能。
