# External Review: design_20260225_acceptance_zip_entry_checks (Claude)

- verdict: noted
- key_findings:
  - Error split (`ERR_TASK` vs `ERR_ACCEPTANCE`) is clear and implementable.
  - Entry cap and sample cap reduce payload blow-up risk.
- risks:
  - ZIP64 archives are likely out of scope in the current parser plan.
- alternatives:
  - Add a library reader later if ZIP compatibility requirements expand.
- missing_tests:
  - Optional: add non-zip file path case returning `ERR_ACCEPTANCE`.
