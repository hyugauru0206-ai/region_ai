# Design: design_20260223_reporting_polish

- Status: Reviewed
- Owner: Codex
- Created: 2026-02-23
- Updated: 2026-02-23
- Scope: Reporting SSOT cleanup and evidence ergonomics

## Context
- Problem:
- Whiteboard text still includes markdown styling noise for SSOT readers.
- Evidence reporting is missing dashboard line numbers + explicit task_id-focused extraction guidance.
- Option A proof is present but not standardized in reporting template.
- Goal:
- Clean SSOT whiteboard wording for human readability.
- Standardize evidence ergonomics for dashboard extraction with line numbers.
- Keep Option A proof explicit in reporting templates.
- Enforce design-first multi-role loop for future changes.
- Non-goals:
- No orchestrator behavior change for Option A.
- No schema model expansion in this task.

## Open Decisions
- [x] Should whiteboard DoD line keep markdown backticks?
- [x] Should reporting template require dashboard line numbers?

## Final Decisions
- Decision 1 Final: Remove backticks from the whiteboard DoD line to keep plain human-readable SSOT text.
- Decision 2 Final: Reporting template must include dashboard evidence with file path + task_id + line number.

## Plan
1. Design
2. Review
3. Implement
4. Verify

## Risks
- Risk:
- Formatting-only changes can drift from current report scripts.
  - Mitigation:
- Add explicit command example using `Select-String` to reduce interpretation variance.

## Test Plan
- Unit:
- Not required for docs-only/tooling text polish.
- E2E:
- `cd apps/orchestrator && npm run verify`
- Run 2 rounds:
  - `npm run e2e:auto:invalid_missing_id_ng`
  - `npm run e2e:auto:invalid_bad_acceptance_ng`
- Confirm dashboard lines include `schema_errors_len`.
- Confirm Option A proof: `artifacts.json` is absent for pre-validation `ERR_TASK`.

## Reviewed-by
- Reviewer / codex-review / 2026-02-23 / approved
- QA / codex-qa / 2026-02-23 / approved
- Researcher / codex-research / 2026-02-23 / noted
