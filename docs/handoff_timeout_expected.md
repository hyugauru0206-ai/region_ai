# orchestrator timeout_expected E2E handoff

## Scope
- Repo: `C:\Users\hyuga\region_ai`
- Target app: `apps/orchestrator`
- Out of scope: `executor_py` (not changed)

E2E `-Wait` flows assume orchestrator is already running and watching the queue (`npm run start` in another terminal, from `apps/orchestrator`). If not running, the common symptom is timeout while waiting for `result_<task_id>_run_*.yaml`.

Workspace root is resolved consistently (orchestrator + tools) in this priority:
1) `REGION_AI_WORKSPACE`
2) `<repo_root>/workspace`
3) `%LOCALAPPDATA%/region_ai/workspace`
4) `%TEMP%/region_ai/workspace`
The startup `watching` path depends on the selected workspace.
Exec root is resolved with fallback too:
1) `REGION_AI_EXEC_ROOT`
2) `<repo_root>/workspace/exec` (legacy first)
3) `<workspace_root>/exec`
4) `%LOCALAPPDATA%/region_ai/exec`
5) `%TEMP%/region_ai/exec`
`tools/run_e2e.ps1` sets `REGION_AI_EXEC_ROOT=<workspace_root>\\exec` automatically for non-elevated stability.
Path ownership note:
- Selected workspace owns: `queue/*`, `runs/*`, `status/*`, `skills/*`
- Exec handshake uses resolved `exec_root`: `exec_root/{requests,results}` (legacy path is still first candidate).

Non-elevated quick triage (3 checks):
1) Write probe to `%TEMP%` path succeeds?
2) Write probe to `%LOCALAPPDATA%` path succeeds?
3) If either fails with Access denied, inspect ACL/CFA:
   - `icacls <path>`
   - Defender protection history (Controlled Folder Access blocks)

EPERM quick path (tsx/esbuild spawn):
- Symptom: `npm start` fails with `EPERM`/spawn.
- Workaround: run `npm.cmd run verify`, then start with `npm.cmd run start:dist`.
- Use `set REGION_AI_WORKSPACE=%TEMP%\region_ai\workspace` for both starter terminal and E2E terminal.
- If `start:dist` also fails, check `%TEMP%` execution policy and endpoint security controls (CFA/AppLocker).

## Goal
- Make `runtime.timeout_expected` verifiable end-to-end:
  - queue task
  - wait for Result
  - verify artifacts
  - verify dashboard line
- Standardize E2E task entrypoint to `tools/queue_task_from_template.ps1`.

## Shortest path (one command, non-elevated)
- (run in `apps/orchestrator`)
```powershell
npm.cmd run e2e:auto
```
- (run in `apps/orchestrator`)
```powershell
npm.cmd run e2e:auto:strict
```
- (run in `apps/orchestrator`)
```powershell
npm.cmd run e2e:auto:strict_ng
```

Notes:
- `tools/run_e2e.ps1` performs verify, starts `start:dist`, waits for `[orchestrator] watching:`, runs E2E, then cleans up process tree.
- `apps/orchestrator` npm `e2e:auto*` wrappers run with `-NoVerify` for faster/stabler loops; run `npm.cmd run verify` separately when needed.
- Workspace defaults to `%TEMP%\region_ai\workspace` unless overridden.
- `tools/run_e2e.ps1` options: `-ReuseRunning`, `-ReadyTimeoutSec <sec>`, `-E2eTimeoutSec <sec>`, `-Json`.
- If orchestrator is already running on the same workspace, `-ReuseRunning` allows reusing that process instead of restarting.
- Strict NG is evaluated by machine checks (`result_status=failed` and `errors[0].code=ERR_ACCEPTANCE`), not summary text.

JSON example:
- (run in repo root)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/run_e2e.ps1 -Mode timeout_expected -Json
```

## Runbook

### 1) Verify build output includes timeout_expected logic
- (run in `apps/orchestrator`)
```powershell
npm.cmd run verify
```

- (run in `apps/orchestrator`)
```powershell
rg -n "timeout_expected|runCommandTimeoutObserved|success: run_command timeout expected" dist\index.js -S
```

Expected:
- `timeout_expected` reference exists
- `runCommandTimeoutObserved` exists
- `success: run_command timeout expected` exists

### 2) Ensure orchestrator watcher is running
- Recommended non-elevated startup (run in `apps/orchestrator`)
```powershell
set REGION_AI_WORKSPACE=%TEMP%\region_ai\workspace
npm.cmd run start:dist
```

- Dev startup (run in `apps/orchestrator`)
```powershell
npm.cmd start
```

If dev startup fails with `EPERM`/spawn, switch to the recommended `start:dist` flow above.

Startup check (one-line):
- (run in repo root) `workspace/orchestrator.out.log` contains `[orchestrator] workspace=...` and `[orchestrator] watching: ...\queue\pending`.

Or process check:
- (run in repo root)
```powershell
Get-CimInstance Win32_Process |
  Where-Object {
    ($_.Name -in @('node.exe','cmd.exe')) -and
    (
      $_.CommandLine -match 'apps[\\/]+orchestrator' -or
      (($_.CommandLine -match '\btsx\b') -and ($_.CommandLine -match 'src[\\/]+index\.ts'))
    )
  } |
  Select-Object ProcessId,ParentProcessId,Name,CommandLine |
  Sort-Object Name,ProcessId
```

### 3) Run timeout_expected E2E
Primary command:
- (run in `apps/orchestrator`)
```powershell
set REGION_AI_WORKSPACE=%TEMP%\region_ai\workspace
npm.cmd run e2e:timeout_expected
```

Branch for permission issue:
- If output contains `Access ... workspace\queue\pending ... is denied`, rerun elevated.
- Reference: see `apps/orchestrator/README.md` note about non-elevated write denial.
- If `tools/queue_task_from_template.ps1` prints:
  - `error: failed to write pending task. Access denied.`
  - `hint: run PowerShell as Administrator and retry.`
  rerun as Administrator.

### 3.1) `-Wait` expectation modes (single entrypoint)
- (run in repo root) success expectation:
```powershell
powershell -ExecutionPolicy Bypass -File tools/queue_task_from_template.ps1 `
  -TemplatePath templates\tasks\e2e\task_e2e_timeout_expected_pwsh.yaml `
  -TaskId task_e2e_timeout_expected_pwsh_vX -Wait `
  -ExpectStatus success
```
- (run in repo root) expected-NG example (strict):
```powershell
powershell -ExecutionPolicy Bypass -File tools/queue_task_from_template.ps1 `
  -TemplatePath templates\tasks\e2e\task_e2e_timeout_expected_no_done_pwsh.yaml `
  -TaskId task_e2e_timeout_expected_no_done_pwsh_vX -Wait `
  -ExpectStatus failed -ExpectErrorCode ERR_ACCEPTANCE
```

Notes:
- Expected-NG determination is **not** based on summary text.
- Primary checks are `result_status` and `result_error_code` (`errors[0].code`).

### 4) Evidence check (pattern + example)

Pattern:
- Result YAML: `workspace/queue/events/result_<TaskId>_run_*.yaml` (pick latest)
- Run ID source: `metadata.run_id` in Result YAML
- Artifacts: `workspace/runs/<run_id>/artifacts.json`
- Dashboard: `workspace/status/dashboard.md` line containing `<TaskId>`

Example from this run:
- `TaskId`: `task_e2e_timeout_expected_pwsh_20260222_121434`
- `run_id`: `run_2026-02-22T03-14-35-285Z_c813b1`
- Result: `workspace/queue/events/result_task_e2e_timeout_expected_pwsh_20260222_121434_run_2026-02-22T03-14-35-285Z_c813b1.yaml`
- Artifacts: `workspace/runs/run_2026-02-22T03-14-35-285Z_c813b1/artifacts.json`

Checks:
- Result:
  - `metadata.status: success`
  - `outcome.errors: []`
  - `outcome.summary` includes `success: run_command timeout expected: 2000ms`
- Artifacts:
  - `timedOut: true` or `exitCode: 124`
  - `stdout` contains `DONE`
- Dashboard:
  - line starts with `[OK]` for the same task id

Strict NG check pattern:
- `result_status: failed`
- `result_error_code: ERR_ACCEPTANCE`
- If `errors` is empty/missing, strict NG expectation fails.

Convenience commands:
- (run in repo root)
```powershell
$taskId = "task_e2e_timeout_expected_pwsh_20260222_121434"
$result = Get-ChildItem workspace\queue\events -File -Filter "result_${taskId}_run_*.yaml" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
Get-Content $result.FullName -Raw
```

- (run in repo root)
```powershell
$runId = "run_2026-02-22T03-14-35-285Z_c813b1"
Get-Content "workspace\runs\$runId\artifacts.json" -Raw
```

- (run in repo root)
```powershell
Select-String -Path "workspace\status\dashboard.md" -Pattern "task_e2e_timeout_expected_pwsh_20260222_121434" | Select-Object -Last 1
```

## Entrypoint policy
- E2E task creation/queueing must go through:
  - `tools/queue_task_from_template.ps1`
- Do not manually write task YAML into `workspace/queue/pending`.

## Git/status notes
- `git diff --stat` shows tracked-file diffs only.
- Always pair it with status to avoid confusion about untracked files.

Commands:
- (run in repo root)
```powershell
git status -sb
```

- (run in repo root)
```powershell
git diff --stat
```

- (run in repo root) existence check for expected changed files:
```powershell
Get-Item README.md, templates\tasks\e2e\README.md, tools\queue_task_from_template.ps1, apps\orchestrator\README.md, apps\orchestrator\package.json
```

## Step3 decision context (acceptance handling)
- Current behavior: when timeout is observed (`timedOut=true` or `exitCode=124`) with `runtime.timeout_expected=true`, acceptance is skipped and treated as OK.
- Next decision: should acceptance still be evaluated under `timeout_expected=true` (for example `stdout_contains`)?
- Observation templates added for this decision:
  - `templates/tasks/e2e/task_e2e_timeout_expected_notimedout_pwsh.yaml`
  - `templates/tasks/e2e/task_e2e_timeout_expected_no_done_pwsh.yaml`

## Ops report template

```text
[Change files]
- <file1>
- <file2>

[Change summary]
- <point 1>
- <point 2>
- <point 3>

[verify]
- command: (run in apps/orchestrator) npm.cmd run verify
- result: success|failed

[e2e]
- skip(default): status=<success|failed>, summary=<...>, errors=<...>
- strict OK: status=<success|failed>, summary=<...>, errors=<...>
- strict NG(expect failed): status=<success|failed>, errors[0].code=<...>, script_exit=<0|1>

[evidence paths]
- pattern:
  - Result: workspace/queue/events/result_<TaskId>_run_*.yaml
  - Artifacts: workspace/runs/<run_id>/artifacts.json
  - Dashboard: workspace/status/dashboard.md
- example:
  - Result: <path>
  - Artifacts: <path>
  - Dashboard line: <line>
```
