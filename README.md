# region_ai

E2E task queuing policy: use `tools/queue_task_from_template.ps1` as the single entrypoint for creating tasks from templates and pushing them to `workspace/queue/pending`. This keeps `metadata.id`, `created_at`, waiting/verification flow, and evidence output consistent across runs.
