# Review: design_20260223_acceptance_regex_stderr_not_contains (Researcher)

## Verdict
- noted

## Findings
- Flag allow-list is a pragmatic guard with low complexity.
- Keeping checks inside acceptance layer avoids protocol churn.

## Risks
- Future demand for capture-group assertions may push beyond current scope.
- Mitigation: keep this phase focused on pass/fail regex presence only.

## Missing tests
- None blocking.
