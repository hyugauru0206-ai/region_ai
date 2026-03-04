# External Review: design_20260228_inbox_thread_actions_v1

- verdict: noted
- key_findings:
  - Thread view 上での一括既読導線は運用 UX 改善効果が高い。
  - confirm を挟むことで誤操作リスクを下げられる。
- risks:
  - thread_key derive ルール更新漏れ時に期待グループから外れる可能性がある。
- suggestion:
  - v2 で thread summary API を追加すると対象件数の事前可視化がさらに明確になる。
