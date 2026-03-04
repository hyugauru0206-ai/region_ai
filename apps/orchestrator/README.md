# region-ai orchestrator

## Build and generated files

- Source of truth is `src/index.ts`.
- `dist/index.js` is generated output. Do not edit `dist` manually.
- To regenerate `dist`, run:

```bash
npm run build
```

Verification commands:

```bash
npm run verify
```

```bash
npm run start:dist
```

```bash
npm run e2e:timeout_expected
```

```bash
npm run e2e:timeout_expected_strict
```

```bash
npm run e2e:timeout_expected_strict_ng
```

Run these commands from `apps/orchestrator`.
Prefer `npm run start:dist` in another terminal before executing E2E scripts (non-elevated friendly).
`npm run start` is a development path (`tsx`) and may fail with `EPERM`/spawn errors in restricted environments.
If the watcher is not running, `-Wait` flows can time out while waiting for `result_<task_id>_run_*.yaml`.

For E2E task creation/queuing, use `tools/queue_task_from_template.ps1` as the entrypoint instead of manually writing files into `workspace/queue/pending`.
In some environments, writing to `workspace/queue/pending` may be denied without elevation; rerun with elevated privileges if needed.

## Workspace resolution

Workspace root is resolved in this priority order:
1. `REGION_AI_WORKSPACE` (if set)
2. `<repo_root>/workspace` (backward compatible default)
3. `%LOCALAPPDATA%/region_ai/workspace` (Windows fallback)
4. `%TEMP%/region_ai/workspace` (last fallback)

Both orchestrator and `tools/queue_task_from_template.ps1` use the same order and a write test (queue/pending temp file).  
At startup, orchestrator logs:
- `[orchestrator] workspace=<resolved_path>`
- `[orchestrator] watching: <resolved_path>\queue\pending`

Exec root is resolved independently in this priority order:
1. `REGION_AI_EXEC_ROOT` (if set)
2. `<repo_root>/workspace/exec` (legacy-compatible default)
3. `<workspace_root>/exec`
4. `%LOCALAPPDATA%/region_ai/exec`
5. `%TEMP%/region_ai/exec`

At startup, orchestrator logs:
- `[orchestrator] exec_root=<resolved_exec_root>`
- `[orchestrator] exec_root_resolve ...`

For non-elevated E2E, `tools/run_e2e.ps1` sets `REGION_AI_EXEC_ROOT=<workspace_root>\exec` automatically to avoid `exec/requests` EPERM.

Optional override example (Windows):
```powershell
set REGION_AI_WORKSPACE=C:\Users\<you>\AppData\Local\region_ai\workspace
```

Non-elevated TEMP workspace example (Windows):
```powershell
set REGION_AI_WORKSPACE=%TEMP%\region_ai\workspace
npm.cmd run start:dist
```

Then in another non-elevated terminal (same `REGION_AI_WORKSPACE`):
```powershell
set REGION_AI_WORKSPACE=%TEMP%\region_ai\workspace
npm.cmd run e2e:timeout_expected
```

## `runtime.timeout_expected`

You can mark a `run_command` task timeout as an expected success.

```yaml
spec:
  command: run_command
  runtime:
    timeout_ms: 2000
    timeout_expected: true
    timeout_expected_acceptance: skip # optional: skip|strict (default: skip)
```

Behavior:

- When `runtime.timeout_expected: true`:
  - If executor returns `timedOut: true` **or** `exitCode: 124`, it is treated as expected timeout success.
  - `runtime.timeout_expected_acceptance` controls acceptance behavior:
    - `skip` (default, backward compatible): acceptance checks are skipped and treated as OK.
      - Summary example: `success: run_command timeout expected: <timeout_ms>ms (acceptance skipped)`
    - `strict`: acceptance checks run even on expected timeout.
      - Acceptance OK summary example: `success: run_command timeout expected: <timeout_ms>ms / acceptance OK(x/y)`
      - Acceptance NG summary example: `acceptance NG: <detail> (timeout expected: <timeout_ms>ms)`
- When `runtime.timeout_expected` is missing or `false`:
  - Timeout remains failure (`ERR_TIMEOUT`) as before.

How to verify from artifacts:

- `workspace/queue/events/result_<task_id>_<run_id>.yaml`
  - `metadata.status` is `success` for expected timeout.
  - `outcome.summary` is `success: run_command timeout expected: ...`.
  - `outcome.errors` is empty (`[]`).
- `workspace/runs/<run_id>/artifacts.json`
  - Timeout evidence is `timedOut: true` or `exitCode: 124`.
  - `stdout` may still contain early output (for example `DONE\n`).

Strict mode NG example:
- If `timeout_expected=true` + `timeout_expected_acceptance=strict` and acceptance requires `stdout_contains: DONE` but command never prints `DONE`,
  result becomes `failed` with `ERR_ACCEPTANCE`.
- `npm run e2e:timeout_expected_strict_ng` treats this as expected behavior using:
  - `Result.metadata.status=failed`
  - `Result.outcome.errors[0].code=ERR_ACCEPTANCE`
  - If `errors` is empty/missing, strict NG expectation is not satisfied (unexpected).
  - Summary text match is auxiliary only.

Implementation references:
- `apps/orchestrator/src/index.ts:228` (`getTimeoutExpectedAcceptancePolicy`, default `skip`)
- `apps/orchestrator/src/index.ts:1130` (`shouldEvaluateAcceptance` branch for `timeout_expected_acceptance`)
- `apps/orchestrator/src/index.ts:1159` (summary branch for `skip`/`strict`/acceptance NG)
