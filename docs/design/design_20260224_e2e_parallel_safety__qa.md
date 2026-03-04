# QA Response: design_20260224_e2e_parallel_safety

- status: approved
- risks:
  - parallel test itself can become flaky if both runners share lock fixture unexpectedly.
- missing tests:
  - isolated workspace should emit lock_mode=isolated and lock_acquired=true.
