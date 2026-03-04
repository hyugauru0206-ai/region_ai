# Researcher Notes: design_20260224_regex_acceptance_safety

- status: noted
- risks:
  - Future localization of error messages could reduce machine readability if details keys are not preserved.
- missing tests:
  - Keep one cross-version compatibility test on details keys: kind/target/expected/note.
- alternative:
  - Consider structured `notes:[...]` array in future, keep current string note for backward compatibility now.
