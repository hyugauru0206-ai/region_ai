# External Review: design_20260224_design_flow_hardening (Claude)

- verdict: noted
- key_findings:
  - policy key `external_participation` should be explicit in design text to avoid ambiguous gate behavior.
  - requiring `whiteboard_update -DryRun -RequireApplied` is a low-cost deterministic safeguard.
- risks:
  - strict enforcement may interrupt quick design drafts.
- alternatives:
  - optional external mode for low-risk docs-only changes.
- missing_tests:
  - add one regression case for `external_participation: required` with missing evidence file.
