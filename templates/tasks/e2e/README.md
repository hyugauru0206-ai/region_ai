# E2E Task Templates

Use these templates with `tools/queue_task_from_template.ps1`.

## Templates

- `task_e2e_timeout_expected_pwsh.yaml`
  - Expected-timeout case (`runtime.timeout_expected: true`, default acceptance policy = `skip`)
- `task_e2e_timeout_expected_strict_pwsh.yaml`
  - Strict OK template: timeout is expected and acceptance is evaluated; expected result is `success` with `acceptance OK`.
- `task_e2e_timeout_expected_notimedout_pwsh.yaml`
  - `timeout_expected: true` but command exits quickly (no timeout observed; `timeout_expected_acceptance` policy has no effect in this case)
- `task_e2e_timeout_expected_no_done_pwsh.yaml`
  - Strict NG template: `timeout_expected: true` + `timeout_expected_acceptance: strict` and no `DONE`; expected result is `failed` with `ERR_ACCEPTANCE`.
  - Validation criteria are defined in `apps/orchestrator/README.md` (`runtime.timeout_expected` / `timeout_expected_acceptance` section).

Optional legacy sample:

- `task_e2e_timeout_normal_pwsh.yaml`
  - Normal timeout case (`timeout_expected` omitted, should fail with timeout)

## Queue examples

```powershell
powershell -ExecutionPolicy Bypass -File tools/queue_task_from_template.ps1 `
  -TemplatePath templates\tasks\e2e\task_e2e_timeout_expected_pwsh.yaml `
  -TaskId task_e2e_timeout_expected_pwsh_v5 -TitleSuffix v5 -Wait
```

```powershell
powershell -ExecutionPolicy Bypass -File tools/queue_task_from_template.ps1 `
  -TemplatePath templates\tasks\e2e\task_e2e_timeout_normal_pwsh.yaml `
  -TaskId task_e2e_timeout_normal_pwsh_v2 -TitleSuffix v2 -Wait
```

```powershell
powershell -ExecutionPolicy Bypass -File tools/queue_task_from_template.ps1 `
  -TemplatePath templates\tasks\e2e\task_e2e_timeout_expected_notimedout_pwsh.yaml `
  -TaskId task_e2e_timeout_expected_notimedout_pwsh_v1 -TitleSuffix v1 -Wait
```

```powershell
powershell -ExecutionPolicy Bypass -File tools/queue_task_from_template.ps1 `
  -TemplatePath templates\tasks\e2e\task_e2e_timeout_expected_strict_pwsh.yaml `
  -TaskId task_e2e_timeout_expected_strict_pwsh_v1 -TitleSuffix v1 -Wait
```

Policy note:
- `timeout_expected_acceptance` defaults to `skip` for backward compatibility.
- Use `strict` when you want acceptance checks (for example `stdout_contains`) to be enforced even if timeout is expected/observed.
