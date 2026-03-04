# Reviewer Notes: design_20260225_golden_recipes

- Verdict: approved.
- `pipeline` extension with `file_write` is minimal and scoped.
- Acceptance context update in pipeline (`runFilesDir` + `artifactsFiles`) is necessary for artifact checks and does not change existing acceptance types.
- Recipe scripts are additive and keep existing `e2e:auto:*` behavior unchanged.
