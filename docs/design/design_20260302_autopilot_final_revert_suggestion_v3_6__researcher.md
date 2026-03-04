# Review Request: design_20260302_autopilot_final_revert_suggestion_v3_6

## Goal Summary
- Autopilot final -> inbox revert suggestion (no auto exec)

## Request
- Reply with bullets.
- Include risks.
- Include missing tests.
## Researcher Checklist
- Any stronger schema strategy or standard to adopt?
- Any better error payload shape for long-term interoperability?
- Any migration concerns?

## Researcher Notes
- Schema strategy is acceptable as additive runtime state (`version:1`, `by_thread_key`) and additive inbox source.
- Interoperability is preserved by machine-readable `links` (`quick_action_id`, `active_profile_preset_set_id`, ids/thread_key).
- Migration concern is minimal: existing logs remain valid; dedupe state is independent and can be recreated from inbox tail if lost.
- Long-term suggestion: define `revert_suggestion_preview` in shared contract index as explicit typed object.
