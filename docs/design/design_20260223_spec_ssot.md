# Design: design_20260223_spec_ssot

- Status: Reviewed
- Owner: Codex
- Created: 2026-02-23
- Updated: 2026-02-23
- Scope: Region AI spec SSOT

## Context
- Problem:
  - Operational knowledge is spread across runbook, task/result spec, and scripts, causing drift and onboarding friction.
  - Contracts are implemented but not centralized for humans/other AI sessions.
- Goal:
  - Create `docs/spec_region_ai.md` as SSOT for region_ai contracts and flows.
  - Keep existing behavior unchanged and improve discoverability.
  - Add lightweight smoke entrypoint for repeatable local validation.
- Non-goals:
  - No runtime behavior change in orchestrator/executor.
  - No new acceptance semantics.

## Design diagram
```mermaid
flowchart LR
  A[Create design_20260223_spec_ssot] --> B[Generate review pack]
  B --> C[Reviewer/QA/Researcher memos]
  C --> D[Finalize decisions]
  D --> E[design_gate]
  E --> F[Write spec_region_ai.md]
  F --> G[verify + e2e:auto:dev:json]
```

## Whiteboard impact
- Now: Region AI contracts are centralized in docs/spec_region_ai.md and linked from runbook.
- DoD: Humans/AI can determine workflow and error contracts from one SSOT doc plus linked details.
- Blockers: None.
- Risks: Doc drift over time; mitigated by explicitly naming SSOT ownership and smoke verification path.

## Multi-AI participation plan
- Reviewer:
  - Request: Validate structure completeness and link hygiene with existing runbook.
  - Expected output format: approved/noted + risks + compatibility notes.
- QA:
  - Request: Validate no contract behavior changes and smoke path still deterministic.
  - Expected output format: approved/noted + test coverage gaps + flake risks.
- Researcher:
  - Request: Validate extensibility and SSOT boundaries for future spec growth.
  - Expected output format: noted/approved + extension guidance + migration cautions.
- External AI:
  - Request: Optional independent critique using prompt_external_claude/gemini.
  - Expected output format: approved/noted + alternative doc structures + risks.

## Open Decisions
- [x] Where should region_ai SSOT live?
- [x] Should this task include CI workflow or local smoke only?

### Open Decisions checklist
- [x] Add "Decision 1 Final:" entry with final choice.
- [x] Add "Decision 2 Final:" entry with final choice.

## Final Decisions
- Decision 1 Final: Create `docs/spec_region_ai.md` as SSOT and link to `docs/spec_task_result.md` for schema detail.
- Decision 2 Final: Add lightweight local smoke script (`tools/ci_smoke.ps1`) to run verify + e2e:auto:dev:json.

## Discussion summary
- Change 1: Central SSOT document chosen to reduce repeated contract explanations.
- Change 2: Keep implementation changes minimal and documentation-first to avoid regressions.
- Change 3: Prefer local smoke script over mandatory GitHub workflow for immediate portability.

## Plan
1. Design
2. Review
3. Implement
4. Verify

## Risks
- Risk:
  - Mitigation:

## Test Plan
- Unit:
  - Not required; this is docs/tooling orchestration change.
- E2E:
  - `cd apps/orchestrator && npm.cmd run verify`
  - `cd apps/orchestrator && npm.cmd run e2e:auto:dev:json` (expect `gate_phase=skipped`)
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/design_gate.ps1 -DesignPath docs/design/design_20260223_spec_ssot.md`

## Reviewed-by
- Reviewer / codex-review / 2026-02-23 / approved
- QA / codex-qa / 2026-02-23 / approved
- Researcher / codex-research / 2026-02-23 / noted

## External Reviews
- docs/design/design_20260223_spec_ssot__reviewer.md / approved
- docs/design/design_20260223_spec_ssot__qa.md / approved
- docs/design/design_20260223_spec_ssot__researcher.md / noted
