# Design: design_20260224_regex_acceptance_safety

- Status: Final
- Owner: Codex
- Created: 2026-02-24
- Updated: 2026-02-24
- Scope: acceptance regex/stderr/not_contains safety hardening for sample cap, regex input truncation, and details target.

## Context
- Problem: acceptance failure details can become noisy for large stdout/stderr and regex evaluation can process unbounded input.
- Goal: keep boundary contracts stable while adding safe, deterministic limits and machine-readable details.
- Non-goals: no behavior change for existing success/NG decision contracts, no new acceptance types.

## Design diagram
```mermaid
flowchart LR
  A[Task Result stdout/stderr] --> B[evaluateAcceptance]
  B --> C[sampleText cap=200]
  B --> D[truncateRegexInput max=10000]
  D --> E{truncated?}
  E -- yes --> F[details.note includes input_truncated]
  E -- no --> G[no truncation note]
  C --> H[details.actual_sample]
  B --> I[details.target stdout|stderr]
  I --> J[Result errors details]
```

## Whiteboard impact
- Now: Acceptance edge-case contracts include runtime safety limits for details and regex input handling.
- DoD: Sample cap, truncation note, and target field are documented in SSOT and locked by E2E.
- Blockers: none.
- Risks: template producing too-small payload to trigger truncation test.

## Multi-AI participation plan
- Reviewer:
  - Request: validate compatibility with existing ERR_ACCEPTANCE/ERR_TASK contracts.
  - Expected output format: approved/noted + risks + missing tests.
- QA:
  - Request: validate deterministic E2E for truncation note and target key.
  - Expected output format: approved/noted + flakiness risk + missing tests.
- Researcher:
  - Request: validate payload shape for long-term interoperability.
  - Expected output format: noted/approved + migration concerns.
- External AI:
  - Request: optional prompt review on diagnostics ergonomics.
  - Expected output format: noted + alternative payload fields.

## Open Decisions
- [x] Decision 1: actual_sample cap value and regex input max.
- [x] Decision 2: note format when truncation occurs.

### Open Decisions checklist
- [x] Add "Decision 1 Final:" entry with final choice.
- [x] Add "Decision 2 Final:" entry with final choice.

## Final Decisions
- Decision 1 Final: set `actual_sample` cap to 200 chars and regex evaluation input cap to 10000 chars.
- Decision 2 Final: add `details.target` always; append `input_truncated` to `details.note` only when truncation occurs.

## Discussion summary
- Change 1: keep compile-fail and invalid-flags contracts unchanged while introducing bounded diagnostics.
- Change 2: use shared helper functions for sample/truncation to avoid divergence across acceptance types.

## Plan
1. Design and review completion.
2. Gate pass and whiteboard sync.
3. Implement acceptance helper + details fields.
4. Add E2E modes and validate docs_check/ci_smoke.

## Risks
- Risk: truncation marker may regress if acceptance paths diverge later.
  - Mitigation: add dedicated E2E for truncation and target.

## Test Plan
- Unit: internal helper behavior covered by orchestrator verify path.
- E2E: regex_truncation success path + stderr_target expected NG + existing regex edge tests.

## Reviewed-by
- Reviewer / codex-review / 2026-02-24 / approved
- QA / codex-qa / 2026-02-24 / approved
- Researcher / codex-research / 2026-02-24 / noted

## External Reviews
- docs/design/packs/design_20260224_regex_acceptance_safety/prompt_external_claude.md / noted
- docs/design/packs/design_20260224_regex_acceptance_safety/prompt_external_gemini.md / noted
