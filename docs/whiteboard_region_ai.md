# Region AI Whiteboard (SSOT)

## Reporting Header Template
- design_id
- Reviewed-by
- gate_passed
- whiteboard Now/DoD diff
- verification summary
- evidence paths

## Now
- Before: agent operators jump between multiple channels to assess one agent. After: one click from seat/member opens a consolidated Character Sheet side panel with links back to existing edit/memory/preset/inbox views.

## DoD
- Before: no dedicated status panel and no scoped live feed per agent. After: panel exists, uses existing APIs only, loads SSE/polling only while visible, and passes docs/design/ui/desktop/ci smoke gates.

## Next
- Expand schema coverage gradually without breaking existing templates.
- Add optional runtime validation for Result against `schemas/result.schema.json`.
- Wire whiteboard role lanes to active design status updates.

## Decisions
- Decisions tracked in active design docs under `docs/design/`.
- Active design: docs/design/design_20260304_character_sheet_v1.md

## Role Lanes
- Reviewer:
  - Reviewed `design_20260223_schema_validation` (approved).
- QA:
  - Reviewed `design_20260223_schema_validation` (approved).
- Researcher:
  - Reviewed `design_20260223_schema_validation` (noted).

- last_design_id: design_20260304_character_sheet_v1
- last_updated: 2026-03-04T19:13:42.2527530+09:00




- Design link: docs/design/design_20260223_spec_ssot.md


- Design link: docs/design/design_20260223_docs_drift_and_smoke_entry.md


- Design link: docs/design/design_20260223_docs_check_diagnostics.md


- Design link: docs/design/design_20260223_acceptance_regex_stderr_not_contains.md


- Design link: docs/design/design_20260224_acceptance_edge_cases_regex_compile_flags.md


- Design link: docs/design/design_20260224_regex_acceptance_safety.md


- Design link: docs/design/design_20260224_e2e_parallel_safety.md


- Design link: docs/design/design_20260224_design_flow_hardening.md


- Design link: docs/design/design_20260224_task_patch_apply.md


- Design link: docs/design/design_20260224_patch_apply_apply_fail_contract.md


- Design link: docs/design/design_20260224_task_pipeline.md


- Design link: docs/design/design_20260224_task_file_write.md


- Design link: docs/design/design_20260224_acceptance_artifact_file_checks.md


- Design link: docs/design/design_20260224_e2e_forbidden_parallel_guard.md


- Design link: docs/design/design_20260224_acceptance_artifact_json_pointer.md


- Design link: docs/design/design_20260224_run_meta_artifacts.md


- Design link: docs/design/design_20260225_golden_recipes.md


- Design link: docs/design/design_20260225_task_archive_zip.md


- Design link: docs/design/design_20260225_acceptance_zip_entry_checks.md


- Design link: docs/design/design_20260225_recipe_release_bundle.md


- Design link: docs/design/design_20260225_acceptance_json_pointer_numeric_compare.md


- Design link: docs/design/design_20260225_recipes_catalog_ssot.md


- Design link: docs/design/design_20260225_contract_index_ssot.md


- Design link: docs/design/design_20260225_discord_ui_hub.md


- Design link: docs/design/design_20260225_ui_discord_build_hardening.md

- Design link: docs/design/design_20260226_desktop_shell_chatgpt_bridge.md


- Design link: docs/design/design_20260226_desktop_bridge_v1.md



- Design link: docs/design/design_20260226_desktop_bridge_v2_test_harness.md


- Design link: docs/design/design_20260226_desktop_bridge_v3_confirm_send.md


- Design link: docs/design/design_20260226_desktop_bridge_v4_capture_last.md


- Design link: docs/design/design_20260226_ui_discord_productivity_pack_v1.md


- Design link: docs/design/design_20260226_inbox_integration_v1.md


- Design link: docs/design/design_20260226_inbox_compact_v1.md


- Design link: docs/design/design_20260226_inbox_compact_api_v1.md


- Design link: docs/design/design_20260226_inbox_filters_bulk_v1.md


- Design link: docs/design/design_20260226_taskify_v1.md



- Design link: docs/design/design_20260226_taskify_v1_1_safe_queue.md


- Design link: docs/design/design_20260226_taskify_queue_tracking_v1.md


- Design link: docs/design/design_20260226_desktop_notify_deeplink_v1.md


- Design link: docs/design/design_20260226_one_command_dev_launcher.md


- Design link: docs/design/design_20260226_one_command_dev_launcher_v1_1_deps_resolve.md


- Design link: docs/design/design_20260226_one_command_dev_launcher_partial_ready.md


- Design link: docs/design/design_20260227_desktop_dev_all_smoke_repo_root_fix.md


- Design link: docs/design/design_20260227_one_command_dev_launcher_desktop_optional_smoke.md


- Design link: docs/design/design_20260227_desktop_dev_all_status_api_consistency.md


- Design link: docs/design/design_20260227_evidence_export_bundle_v1.md


- Design link: docs/design/design_20260227_evidence_export_inbox_notify_v1.md


- Design link: docs/design/design_20260227_ops_snapshot_v1.md


- Design link: docs/design/design_20260227_ops_snapshot_inbox_notify_v1.md















- Design link: docs/design/design_20260228_agent_memory_v1.md


- Design link: docs/design/design_20260228_agent_heartbeat_v0_one_click.md


- Design link: docs/design/design_20260228_agent_heartbeat_v1_scheduler.md


- Design link: docs/design/design_20260228_heartbeat_autopilot_suggest_v1.md


- Design link: docs/design/design_20260228_heartbeat_autopilot_suggest_v1_1_ranked.md


- Design link: docs/design/design_20260228_heartbeat_autopilot_suggest_v2_auto_accept.md


- Design link: docs/design/design_20260228_night_consolidation_v1.md


- Design link: docs/design/design_20260228_morning_brief_v1.md


- Design link: docs/design/design_20260228_daily_loop_dashboard_v1.md


- Design link: docs/design/design_20260228_daily_loop_dashboard_v2_sse_refresh.md


- Design link: docs/design/design_20260228_daily_loop_dashboard_v3_ops_quick_actions.md


- Design link: docs/design/design_20260228_daily_loop_dashboard_v4_auto_stabilize_dryrun.md


- Design link: docs/design/design_20260228_daily_loop_dashboard_v5_auto_stabilize_execute_safe_run.md


- Design link: docs/design/design_20260228_daily_loop_dashboard_v6_auto_safe_no_exec.md


- Design link: docs/design/design_20260228_morning_brief_bundle_v1.md


- Design link: docs/design/design_20260228_e2e_scripts_hardening_v1.md



- Design link: docs/design/design_20260228_inbox_threadification_v1.md


- Design link: docs/design/design_20260228_inbox_thread_actions_v1.md


- Design link: docs/design/design_20260228_inbox_thread_archive_v1.md


- Design link: docs/design/design_20260228_inbox_thread_archive_scheduler_v1.md

- Design link: docs/design/design_20260228_inbox_thread_archive_scheduler_v1_1_timeout_tailcap.md


- Design link: docs/design/design_20260228_thread_archive_scheduler_dashboard_v1.md



- Design link: docs/design/design_20260228_dashboard_unified_quick_actions_v2_selective_execute.md


- Design link: docs/design/design_20260228_dashboard_unified_quick_actions_v2_1_execute_tracking.md


- Design link: docs/design/design_20260228_dashboard_unified_quick_actions_v2_2_tracker_history.md


- Design link: docs/design/design_20260228_dashboard_unified_quick_actions_v2_3_tracker_history_portability.md


- Design link: docs/design/design_20260302_dashboard_tracker_history_workspace_v1.md


- Design link: docs/design/design_20260302_dashboard_quick_actions_thread_link_v2_5.md


- Design link: docs/design/design_20260302_council_autopilot_inbox_thread_link_v2_6.md


- Design link: docs/design/design_20260302_council_autopilot_round_role_format_v2_7.md


- Design link: docs/design/design_20260302_council_autopilot_identity_memory_assist_v2_8.md


- Design link: docs/design/design_20260302_agent_identity_presets_v2_9.md


- Design link: docs/design/design_20260302_autopilot_suggest_preset_link_v3_0.md


- Design link: docs/design/design_20260302_morning_brief_dashboard_recommended_profile_v3_1.md


- Design link: docs/design/design_20260302_recommended_profile_autopilot_suggest_alignment_v3_2.md



- Design link: docs/design/design_20260302_dashboard_quick_action_morning_brief_autopilot_start_v3_3.md


- Design link: docs/design/design_20260302_active_profile_state_v3_4.md


- Design link: docs/design/design_20260302_active_profile_revert_v3_5.md


- Design link: docs/design/design_20260302_autopilot_final_revert_suggestion_v3_6.md


- Design link: docs/design/design_20260303_dashboard_next_actions_v3_7.md


- Design link: docs/design/design_20260304_inspire_star_office_claw_v1.md


- Design link: docs/design/design_20260304_character_sheet_v1.md

