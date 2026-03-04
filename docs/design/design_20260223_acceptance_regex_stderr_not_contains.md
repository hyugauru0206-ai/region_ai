# Design: design_20260223_acceptance_regex_stderr_not_contains

- Status: Reviewed
- Owner: Codex
- Created: 2026-02-24
- Updated: 2026-02-24
- Scope: acceptance regex/stderr/not_contains

## Context
- Problem:
  - Existing acceptance types are too limited for practical stderr and regex-based checks.
  - Teams currently need template-level command workarounds for negative/assertive matching.
- Goal:
  - Add four acceptance types: `stdout_regex`, `stderr_contains`, `stdout_not_contains`, `stderr_not_contains`.
  - Keep backward compatibility with existing acceptance/runtime contracts.
  - Maintain gate/docs/smoke contracts unchanged.
- Non-goals:
  - No changes to queue/executor protocol.
  - No expansion of docs_check scope beyond current minimal philosophy.

## Design diagram
```mermaid
flowchart LR
  A[Task YAML acceptance[]] --> B[schema validation]
  B --> C[orchestrator evaluateAcceptance]
  C --> D[result success/failed]
  D --> E[queue/events + dashboard]
```

## Decision diagram
```mermaid
flowchart TD
  A[acceptance item] --> B{type}
  B -->|stdout_regex| C[compile regex with guarded flags]
  C --> D{compile ok?}
  D -- no --> E[ERR_ACCEPTANCE + details.note=regex_compile_error]
  D -- yes --> F[test stdout]
  B -->|stderr_contains| G[stderr.includes(value)]
  B -->|stdout_not_contains| H[!stdout.includes(value)]
  B -->|stderr_not_contains| I[!stderr.includes(value)]
  F --> J{pass?}
  G --> J
  H --> J
  I --> J
  J -- no --> K[ERR_ACCEPTANCE]
  J -- yes --> L[continue / success]
```

## Whiteboard impact
- Now: Acceptance supports regex/stderr/not_contains with stable ERR_ACCEPTANCE reporting.
- DoD: New acceptance contracts are schema-validated, documented in SSOT, and covered by E2E success+expected-NG.
- Blockers: None.
- Risks: Regex misuse can cause false expectations; mitigate with compile guard and bounded pattern/flags.

## Multi-AI participation plan
- Reviewer:
  - Request: Check compatibility with existing acceptance evaluation and result error semantics.
  - Expected output format: approved/noted + regression risks + alternatives.
- QA:
  - Request: Check expected-NG assertions (`ERR_ACCEPTANCE`) and template coverage balance.
  - Expected output format: approved/noted + missing tests + flake risks.
- Researcher:
  - Request: Check regex guard minimality and false-positive/false-negative risk.
  - Expected output format: noted/approved + extension cautions.
- External AI:
  - Request: Validate missing corner cases (regex flags, stderr empty handling, timeout strict/skip interplay).
  - Expected output format: approved/noted + risks + alternatives.

## Open Decisions
- [x] Which regex flags are allowed for `stdout_regex`?
- [x] How should regex compile errors be reported?

### Open Decisions checklist
- [x] Add "Decision 1 Final:" entry with final choice.
- [x] Add "Decision 2 Final:" entry with final choice.

## Final Decisions
- Decision 1 Final: Allow only `i`, `m`, `s`, `u` flags; reject other flags via schema+runtime guard.
- Decision 2 Final: Regex compile failure is acceptance NG (`ERR_ACCEPTANCE`) with machine-readable details (`kind`, `expected`, `note`).

## Discussion summary
- Change 1: Added four acceptance types without changing existing item semantics.
- Change 2: Chosen minimal regex guard (length bounds + flag allow-list + compile try/catch) to keep behavior predictable.
- Change 3: Added E2E templates for success and expected-NG flows; status tooling remains non-breaking.

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
  - Not required; validation will be through schema + orchestrator verify + E2E.
- E2E:
  - `npm run e2e:auto:regex` (success)
  - `npm run e2e:auto:regex_ng` (expected NG)
  - `npm run e2e:auto:stderr` (success)
  - `npm run e2e:auto:not_contains` (success)
  - `npm run e2e:auto:stderr_not_contains_ng` (expected NG)
  - `npm run docs:check:json`
  - `npm run ci:smoke:gate:json`

## Reviewed-by
- Reviewer / codex-review / 2026-02-24 / approved
- QA / codex-qa / 2026-02-24 / approved
- Researcher / codex-research / 2026-02-24 / noted

## External Reviews
- docs/design/design_20260223_acceptance_regex_stderr_not_contains__reviewer.md / approved
- docs/design/design_20260223_acceptance_regex_stderr_not_contains__qa.md / approved
- docs/design/design_20260223_acceptance_regex_stderr_not_contains__researcher.md / noted
