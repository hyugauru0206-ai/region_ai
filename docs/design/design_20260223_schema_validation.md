# Design: design_20260223_schema_validation

- Status: Reviewed
- Owner: Codex
- Created: 2026-02-23
- Updated: 2026-02-23
- Scope: Schema validation hardening + SSOT whiteboard + design gate + invalid-spec E2E stabilization.

## Context
- Problem:
  - Task schema failures are detected, but failure artifacts and filename stability are inconsistent in invalid-spec flows.
  - E2E helper sometimes depends on summary/log patterns instead of strict status/error contracts.
  - No repo-tracked design gate exists to enforce reviewed decisions before implementation.
- Goal:
  - Make schema-validation outcomes machine-readable and deterministic.
  - Stabilize result naming for missing `metadata.id`.
  - Add SSOT whiteboard and review gate workflow in-repo.
- Non-goals:
  - Replacing existing queue architecture.
  - Full JSON-Schema implementation for every field in one change.

## Open Decisions
- [x] For ERR_TASK pre-validation failures: allocate `run_id` and `runs/<run_id>/artifacts.json` or not.
- [x] Stable task key fallback when `metadata.id` missing.
- [x] Exact `errors[0].details.schema_errors` payload format.

## Proposed Decisions
- Decision A (pre-validation failure contract):
  - Choose **Option A**: allocate `run_id`, but **do not** create `runs/<run_id>/artifacts.json`.
  - Rationale: preserves traceability while keeping contract clear that execution never happened.
- Decision B (fallback task key):
  - Use `taskKey = sanitize(<sourceFileStem>) + "_" + shortHash(<originalPathOrRawId>)`.
  - Sanitize rules:
    - remove extension like `.yaml`/`.yml`
    - keep `[A-Za-z0-9_.-]`, replace others with `_`
    - max length 80 before hash suffix
    - suffix hash length 8
- Decision C (schema error details format):
  - `errors[0].details.schema_errors` is array of:
    - `instancePath` (string)
    - `schemaPath` (string)
    - `keyword` (string)
    - `message` (string)

## Final Decisions
- Decision 1 Final: Option A selected. Allocate `run_id`; do not create `runs/<run_id>/artifacts.json` on pre-validation `ERR_TASK`.
- Decision 2 Final: Stable fallback task key uses sanitized source stem + 8-char hash when `metadata.id` is missing.
- Decision 3 Final: `errors[0].details.schema_errors[]` fields are `instancePath`, `schemaPath`, `keyword`, `message`.

## Plan
1. Add SSOT whiteboard + design gate scripts and review-request generator.
2. Generate role prompts (Reviewer/QA/Researcher).
3. Consolidate review notes and finalize decisions in this doc.
4. Implement orchestrator/tooling updates after gate passes.
5. Verify E2E contracts and invalid-spec regressions.

## Risks
- Risk: Invalid task without `metadata.id` may collide in result names.
  - Mitigation: hashed fallback suffix.
- Risk: E2E helper may misassociate event files under concurrency.
  - Mitigation: keep strict task-id match; allow fallback only for explicit invalid-id flow.
- Risk: Gate bypass by stale Reviewed-by block.
  - Mitigation: gate checks required role entries with accepted markers.

## Test Plan
- `npm run verify`
- invalid-spec E2E (2 rounds):
  - `e2e:auto:invalid_missing_id_ng`
  - `e2e:auto:invalid_bad_acceptance_ng`
- Confirm:
  - `Result.status=failed`
  - `errors[0].code=ERR_TASK`
  - `errors[0].details.schema_errors` exists and non-empty
  - result filename has stable taskKey and no `.yaml` embedded in taskKey

## Review Notes (Consolidated)
- Reviewer notes:
  - Keep invalid-spec behavior deterministic by separating "schema invalid" from "acceptance failed".
  - Fallback task key must be stable and filesystem-safe.
  - Do not over-tighten schema beyond current acceptance types in this change.
- QA notes:
  - invalid_missing_id should not depend on exact task-id filename patterns.
  - E2E should assert `status + errors[0].code + schema_errors[]` rather than summary text.
  - Ensure previous timeout/artifact suites are non-regressed.
- Researcher notes (optional):
  - Prefer machine-readable schema error arrays and keep human summary as secondary.
  - Reserve migration path for stricter schema in future versions.

## Reviewed-by
- Reviewer / codex-review / 2026-02-23 / approved
- QA / codex-qa / 2026-02-23 / approved
- Researcher / codex-research / 2026-02-23 / noted
