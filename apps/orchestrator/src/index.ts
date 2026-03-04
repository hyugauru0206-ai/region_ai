import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import YAML from "yaml";
import { execa, execaCommand } from "execa";

type Task = {
  apiVersion: "v1";
  kind: "Task" | "pipeline";
  metadata: {
    id: string;
    role: string;
    assignee: string;
    created_at: string;
    title: string;
    priority?: "low" | "normal" | "high" | "urgent";
    category?: string;
    persona?: string;
    parent_task_id?: string;
    tags?: string[];
  };
  spec: {
    command: "create_file" | "apply_patch" | "run_command" | "patch_apply" | "file_write" | "archive_zip" | "pipeline";
    args: Record<string, any>;
    patch?: {
      format?: "unified";
      text?: string;
    };
    files?: Array<{
      path?: string;
      text?: string;
      mode?: "overwrite" | "append";
    }>;
    inputs?: string[];
    output?: {
      zip_path?: string;
      manifest_path?: string;
    };
    options?: {
      follow_symlinks?: boolean;
    };
    limits?: {
      max_files?: number;
      max_total_bytes?: number;
    };
    runtime?: {
      timeout_ms?: number;
      timeout_expected?: boolean;
      timeout_expected_acceptance?: "skip" | "strict";
    };
    context?: {
      repo_path?: string;
      paths?: string[];
      diff_path?: string;
      log_tail_path?: string;
      summary_path?: string;
    };
    acceptance?: any[];
    artifact?: {
      mirror_run_meta?: boolean;
      mirror_run_meta_include?: Array<"task_yaml" | "result_pre_acceptance_json" | "result_final_json">;
    };
    safety?: {
      requires_approval?: boolean;
      risk?: "low" | "medium" | "high";
      reason?: string;
    };
  };
  runtime?: {
    timeout_ms?: number;
    timeout_expected?: boolean;
    timeout_expected_acceptance?: "skip" | "strict";
  };
  acceptance?: any[];
  artifact?: {
    mirror_run_meta?: boolean;
    mirror_run_meta_include?: Array<"task_yaml" | "result_pre_acceptance_json" | "result_final_json">;
  };
  steps?: Array<{
    id?: string;
    task?: {
      kind?: "run_command" | "patch_apply" | "create_file" | "apply_patch" | "file_write" | "archive_zip" | "pipeline";
      args?: Record<string, any>;
      patch?: { format?: "unified"; text?: string };
      files?: Array<{
        path?: string;
        text?: string;
        mode?: "overwrite" | "append";
      }>;
      inputs?: string[];
      output?: {
        zip_path?: string;
        manifest_path?: string;
      };
      options?: {
        follow_symlinks?: boolean;
      };
      limits?: {
        max_files?: number;
        max_total_bytes?: number;
      };
      runtime?: {
        timeout_ms?: number;
        timeout_expected?: boolean;
        timeout_expected_acceptance?: "skip" | "strict";
      };
      context?: {
        repo_path?: string;
      };
    };
  }>;
};

type Result = {
  apiVersion: "v1";
  kind: "Result";
  metadata: {
    id: string;
    task_id: string;
    assignee: string;
    started_at: string;
    finished_at: string;
    status: "success" | "failed" | "skipped";
    run_id?: string;
  };
  outcome: {
    summary: string;
    artifacts?: {
      diff_path?: string;
      stdout_path?: string;
      stderr_path?: string;
      files?: string[];
    };
    metrics?: {
      duration_ms?: number;
    };
    errors?: Array<{
      code?: string;
      message?: string;
      stack_tail_path?: string;
      details?: Record<string, any>;
    }>;
  };
};

type AcceptanceResult = { type: string; ok: boolean; detail: string; details?: Record<string, any> };
type AcceptanceContext = {
  stdout?: string;
  stderr?: string;
  commandExitCode?: number;
  runId?: string;
  artifactsFiles?: string[];
  runFilesDir?: string;
};
type CommandRunResult = { command: string; cwd: string; exitCode: number; stdout: string; stderr: string; timedOut: boolean; timeoutMs: number };
type PipelineStepSummary = {
  step_id: string;
  step_index: number;
  status: "success" | "failed" | "skipped";
  error_code: string;
  run_id: string;
};
type PipelineExecutionResult = {
  ok: boolean;
  errorCode: string;
  summary: string;
  stdout: string;
  stderr: string;
  stepsSummary: PipelineStepSummary[];
  failedStepId: string;
  failedStepIndex: number;
  note: string;
};

type HistoryEntry = {
  timestamp: string;
  task_id: string;
  command: string;
  category: string;
  persona: string;
  repo_path: string;
  arg_keys: string[];
  acceptance_types: string[];
  status: "success" | "failed" | "skipped";
  duration_ms: number;
  target_key: string;
};

type ProposalIndexItem = {
  key: string;
  proposal_id: string;
  skill_id: string;
  status: "proposed" | "accepted" | "rejected";
  created_at: string;
  updated_at: string;
};

type ProposalIndexFile = { items: ProposalIndexItem[] };

const ASSIGNEE_ID = process.env.ASSIGNEE_ID || "implementer_01";
const ROOT = path.resolve(process.cwd(), "..", "..");
const REPROPOSE_HOURS = 24;
const HISTORY_CACHE_MAX = 500;
const DEFAULT_RUN_COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_RUN_COMMAND_TIMEOUT_MS = 30 * 60 * 1000;
const STALE_RUNNING_GRACE_MS = 2 * 60 * 1000;
const PIPELINE_SAMPLE_MAX = 512;
const FILE_WRITE_MAX_FILES = 20;
const FILE_WRITE_MAX_FILE_BYTES = 256 * 1024;
const FILE_WRITE_MAX_TOTAL_BYTES = 1024 * 1024;
const ARCHIVE_ZIP_DEFAULT_MAX_FILES = 200;
const ARCHIVE_ZIP_DEFAULT_MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const ACCEPTANCE_ARTIFACT_FILE_MAX_BYTES = 256 * 1024;
const ACCEPTANCE_ZIP_ENTRY_MAX_ENTRIES = 5000;
const ACCEPTANCE_ZIP_ENTRY_MAX_ENTRY_CHARS = 512;
const ACCEPTANCE_ZIP_ENTRY_SAMPLE_MAX_ITEMS = 200;
const ACCEPTANCE_ZIP_ENTRY_SAMPLE_MAX_CHARS = 8192;
const RUN_META_MAX_BYTES = 256 * 1024;

function canWriteWorkspace(candidate: string): { ok: boolean; reason?: string } {
  const pendingDir = path.join(candidate, "queue", "pending");
  const testFile = path.join(pendingDir, `.write_test_${process.pid}_${Date.now()}.tmp`);
  try {
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(testFile, "ok", "utf8");
    fs.unlinkSync(testFile);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

function resolveWorkspaceRoot(repoRoot: string): { workspace: string; logs: string[] } {
  const logs: string[] = [];
  const candidates: Array<{ label: string; path: string }> = [];
  const fromEnv = String(process.env.REGION_AI_WORKSPACE || "").trim();
  if (fromEnv) candidates.push({ label: "REGION_AI_WORKSPACE", path: path.resolve(fromEnv) });
  candidates.push({ label: "repo_workspace", path: path.join(repoRoot, "workspace") });

  const localAppData = String(process.env.LOCALAPPDATA || "").trim();
  if (localAppData) {
    candidates.push({ label: "localappdata_workspace", path: path.join(localAppData, "region_ai", "workspace") });
  }
  const tempDir = os.tmpdir();
  if (tempDir) {
    candidates.push({ label: "temp_workspace", path: path.join(tempDir, "region_ai", "workspace") });
  }

  const seen = new Set<string>();
  for (const c of candidates) {
    const key = process.platform === "win32" ? c.path.toLowerCase() : c.path;
    if (seen.has(key)) continue;
    seen.add(key);
    const r = canWriteWorkspace(c.path);
    if (r.ok) {
      logs.push(`selected ${c.label}: ${c.path}`);
      return { workspace: c.path, logs };
    }
    logs.push(`failed ${c.label}: ${c.path} (${r.reason || "unknown error"})`);
  }

  const details = logs.map((x) => `  - ${x}`).join(os.EOL);
  console.error("[orchestrator] unable to resolve writable workspace.");
  if (details) console.error(details);
  console.error(`[orchestrator] hint: set REGION_AI_WORKSPACE to a writable path.`);
  process.exit(1);
}

function canWriteExecRoot(candidate: string): { ok: boolean; reason?: string } {
  const requestsDir = path.join(candidate, "requests");
  const resultsDir = path.join(candidate, "results");
  const testFile = path.join(requestsDir, `.write_test_${process.pid}_${Date.now()}.tmp`);
  try {
    fs.mkdirSync(requestsDir, { recursive: true });
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(testFile, "ok", "utf8");
    fs.unlinkSync(testFile);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

function resolveExecRoot(repoRoot: string, workspaceRoot: string): { execRoot: string; logs: string[] } {
  const logs: string[] = [];
  const candidates: Array<{ label: string; path: string }> = [];

  const fromEnv = String(process.env.REGION_AI_EXEC_ROOT || "").trim();
  if (fromEnv) candidates.push({ label: "REGION_AI_EXEC_ROOT", path: path.resolve(fromEnv) });
  candidates.push({ label: "legacy_repo_exec", path: path.join(repoRoot, "workspace", "exec") });
  candidates.push({ label: "workspace_exec", path: path.join(workspaceRoot, "exec") });

  const localAppData = String(process.env.LOCALAPPDATA || "").trim();
  if (localAppData) {
    candidates.push({ label: "localappdata_exec", path: path.join(localAppData, "region_ai", "exec") });
  }
  const tempDir = os.tmpdir();
  if (tempDir) {
    candidates.push({ label: "temp_exec", path: path.join(tempDir, "region_ai", "exec") });
  }

  const seen = new Set<string>();
  for (const c of candidates) {
    const key = process.platform === "win32" ? c.path.toLowerCase() : c.path;
    if (seen.has(key)) continue;
    seen.add(key);
    const r = canWriteExecRoot(c.path);
    if (r.ok) {
      logs.push(`selected ${c.label}: ${c.path}`);
      return { execRoot: c.path, logs };
    }
    logs.push(`failed ${c.label}: ${c.path} (${r.reason || "unknown error"})`);
  }

  const details = logs.map((x) => `  - ${x}`).join(os.EOL);
  console.error("[orchestrator] unable to resolve writable exec_root.");
  if (details) console.error(details);
  console.error(`[orchestrator] hint: set REGION_AI_EXEC_ROOT to a writable path.`);
  process.exit(1);
}

const WORKSPACE_RESOLUTION = resolveWorkspaceRoot(ROOT);
const WORKSPACE = WORKSPACE_RESOLUTION.workspace;
const QUEUE = path.join(WORKSPACE, "queue");
const EXEC_RESOLUTION = resolveExecRoot(ROOT, WORKSPACE);
const EXEC_ROOT = EXEC_RESOLUTION.execRoot;
const LEGACY_EXEC_ROOT = path.join(ROOT, "workspace", "exec");
const LEGACY_EXEC_REQUESTS = path.join(LEGACY_EXEC_ROOT, "requests");
const LEGACY_EXEC_RESULTS = path.join(LEGACY_EXEC_ROOT, "results");

function isSamePath(a: string, b: string): boolean {
  const aa = path.resolve(a);
  const bb = path.resolve(b);
  return process.platform === "win32" ? aa.toLowerCase() === bb.toLowerCase() : aa === bb;
}

const DIRS = {
  workspace: WORKSPACE,
  pending: path.join(QUEUE, "pending"),
  running: path.join(QUEUE, "running"),
  waiting: path.join(QUEUE, "waiting"),
  done: path.join(QUEUE, "done"),
  failed: path.join(QUEUE, "failed"),
  approvals: path.join(QUEUE, "approvals"),
  events: path.join(QUEUE, "events"),
  status: path.join(WORKSPACE, "status"),
  personas: path.join(WORKSPACE, "personas"),
  runs: path.join(WORKSPACE, "runs"),
  skills: path.join(WORKSPACE, "skills"),
  execRequests: path.join(EXEC_ROOT, "requests"),
  execResults: path.join(EXEC_ROOT, "results"),
};

const HISTORY_PATH = path.join(DIRS.skills, "_history.jsonl");
const PROPOSALS_INDEX_PATH = path.join(DIRS.skills, "_proposals_index.json");
const TASK_SCHEMA_PATH = path.join(ROOT, "schemas", "task.schema.json");
type SchemaErrorDetail = { instancePath: string; schemaPath: string; keyword: string; message: string };

function nowIsoJst(): string {
  const d = new Date();
  const tz = 9 * 60;
  const local = new Date(d.getTime() + (tz - d.getTimezoneOffset()) * 60000);
  return local.toISOString().replace("Z", "+09:00");
}

function ensureDirs(): void {
  for (const p of Object.values(DIRS)) fs.mkdirSync(p, { recursive: true });
  const dash = path.join(DIRS.status, "dashboard.md");
  if (!fs.existsSync(dash)) fs.writeFileSync(dash, "# Dashboard\n", "utf8");
  if (!fs.existsSync(HISTORY_PATH)) fs.writeFileSync(HISTORY_PATH, "", "utf8");
  if (!fs.existsSync(PROPOSALS_INDEX_PATH)) {
    fs.writeFileSync(PROPOSALS_INDEX_PATH, JSON.stringify({ items: [] }, null, 2), "utf8");
  }
}

function readYamlFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return YAML.parse(raw) as T;
}

function writeYamlFile(filePath: string, obj: any): void {
  const doc = new YAML.Document(obj);
  (doc as any).options.indent = 2;
  fs.writeFileSync(filePath, doc.toString(), "utf8");
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

const TASK_SCHEMA = readJsonFile<any>(TASK_SCHEMA_PATH);

function schemaTypeMatches(value: any, type: string): boolean {
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "boolean") return typeof value === "boolean";
  return true;
}

function toJsonPointer(instancePath: string): string {
  const parts = instancePath.replace(/^task\.?/, "").split(".").filter(Boolean);
  if (!parts.length) return "";
  return "/" + parts.map((p) => p.replace(/\[(\d+)\]/g, "/$1")).join("/").replaceAll("//", "/");
}

function pushSchemaError(errors: SchemaErrorDetail[], instancePath: string, schemaPath: string, keyword: string, message: string): void {
  errors.push({ instancePath: toJsonPointer(instancePath), schemaPath, keyword, message });
}

function validateAgainstSchema(value: any, schema: any, atPath: string, schemaAt: string, errors: SchemaErrorDetail[]): boolean {
  if (!schema || typeof schema !== "object") return true;

  if (schema.const !== undefined && value !== schema.const) {
    pushSchemaError(errors, atPath, `${schemaAt}/const`, "const", `must be constant '${String(schema.const)}'`);
    return false;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    pushSchemaError(errors, atPath, `${schemaAt}/enum`, "enum", `must be one of [${schema.enum.join(", ")}]`);
    return false;
  }

  if (schema.type && !schemaTypeMatches(value, schema.type)) {
    pushSchemaError(errors, atPath, `${schemaAt}/type`, "type", `must be type '${schema.type}'`);
    return false;
  }

  if (schema.type === "string" && typeof schema.minLength === "number" && String(value).length < schema.minLength) {
    pushSchemaError(errors, atPath, `${schemaAt}/minLength`, "minLength", `string length must be >= ${schema.minLength}`);
    return false;
  }
  if (schema.type === "string" && typeof schema.maxLength === "number" && String(value).length > schema.maxLength) {
    pushSchemaError(errors, atPath, `${schemaAt}/maxLength`, "maxLength", `string length must be <= ${schema.maxLength}`);
    return false;
  }
  if (schema.type === "string" && typeof schema.pattern === "string") {
    try {
      const re = new RegExp(schema.pattern);
      if (!re.test(String(value))) {
        pushSchemaError(errors, atPath, `${schemaAt}/pattern`, "pattern", `must match pattern ${schema.pattern}`);
        return false;
      }
    } catch {
      // ignore invalid schema pattern; schema file is trusted source
    }
  }

  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    const subErrors: SchemaErrorDetail[][] = [];
    for (let i = 0; i < schema.oneOf.length; i += 1) {
      const sub = schema.oneOf[i];
      const errs: SchemaErrorDetail[] = [];
      if (validateAgainstSchema(value, sub, atPath, `${schemaAt}/oneOf/${i}`, errs)) {
        return true;
      }
      subErrors.push(errs);
    }
    pushSchemaError(errors, atPath, `${schemaAt}/oneOf`, "oneOf", "does not match any allowed schema");
    for (const se of subErrors.slice(0, 2)) {
      for (const e of se.slice(0, 2)) {
        errors.push(e);
      }
    }
    return false;
  }

  if (schema.type === "object") {
    if (Array.isArray(schema.required)) {
      for (const reqKey of schema.required) {
        if (!(reqKey in (value || {}))) {
          pushSchemaError(errors, `${atPath}.${reqKey}`, `${schemaAt}/required`, "required", "required");
        }
      }
    }
    if (schema.properties && typeof schema.properties === "object") {
      for (const [k, childSchema] of Object.entries<any>(schema.properties)) {
        if (value && Object.prototype.hasOwnProperty.call(value, k)) {
          validateAgainstSchema(value[k], childSchema, `${atPath}.${k}`, `${schemaAt}/properties/${k}`, errors);
        }
      }
    }
  }

  if (schema.type === "array" && schema.items && Array.isArray(value)) {
    value.forEach((item, idx) => {
      validateAgainstSchema(item, schema.items, `${atPath}[${idx}]`, `${schemaAt}/items`, errors);
    });
  }

  return errors.length === 0;
}

function validateTaskBySchema(task: any): { ok: boolean; errors: SchemaErrorDetail[] } {
  if (!TASK_SCHEMA) {
    return { ok: false, errors: [{ instancePath: "", schemaPath: "/schema", keyword: "load", message: `schema load failed: ${TASK_SCHEMA_PATH}` }] };
  }
  const errors: SchemaErrorDetail[] = [];
  validateAgainstSchema(task, TASK_SCHEMA, "task", "#", errors);
  return { ok: errors.length === 0, errors };
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

function sanitizeTaskKey(raw: string): string {
  const noExt = raw.replace(/\.(yaml|yml)$/i, "");
  const sanitized = noExt.replace(/[^A-Za-z0-9_.-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return (sanitized || "task").slice(0, 80);
}

function stableTaskKey(taskPath: string, metadataId?: string): string {
  const fromId = sanitizeTaskKey(String(metadataId || ""));
  if (fromId && String(metadataId || "").trim().length > 0) {
    return fromId;
  }
  const source = String(path.basename(taskPath));
  const base = sanitizeTaskKey(source);
  const hash = crypto.createHash("sha1").update(`${taskPath}|${source}`).digest("hex").slice(0, 8);
  return `${base}_${hash}`;
}

function loadPersonaPreset(personaId?: string, category?: string): { id?: string; displayName?: string; checklist: string[]; outputContract: string[] } {
  try {
    const presetsPath = path.join(DIRS.personas, "presets.yaml");
    if (!fs.existsSync(presetsPath)) return { checklist: [], outputContract: [] };
    const presets = readYamlFile<any>(presetsPath);
    const all = Array.isArray(presets?.presets) ? presets.presets : [];
    let hit = null;
    if (personaId) hit = all.find((p: any) => p.id === personaId);
    if (!hit && category) hit = all.find((p: any) => p.category === category);
    if (!hit) return { checklist: [], outputContract: [] };
    return {
      id: hit.id,
      displayName: hit.display_name,
      checklist: Array.isArray(hit.checklist) ? hit.checklist : [],
      outputContract: Array.isArray(hit.output_contract) ? hit.output_contract : [],
    };
  } catch {
    return { checklist: [], outputContract: [] };
  }
}

function validateTaskLight(task: any): { ok: boolean; reason?: string } {
  if (!task || typeof task !== "object") return { ok: false, reason: "task is not object" };
  if (task.apiVersion !== "v1") return { ok: false, reason: "apiVersion must be v1" };
  if (task.kind !== "Task" && task.kind !== "pipeline") return { ok: false, reason: "kind must be Task|pipeline" };
  if (!task.metadata?.id) return { ok: false, reason: "metadata.id missing" };
  if (!task.metadata?.assignee) return { ok: false, reason: "metadata.assignee missing" };
  if (task.kind === "pipeline") {
    const steps = Array.isArray(task.steps) ? task.steps : [];
    if (steps.length < 1) return { ok: false, reason: "pipeline requires steps" };
    if (steps.length > 10) return { ok: false, reason: "pipeline steps exceed max(10)" };
    for (let i = 0; i < steps.length; i += 1) {
      const s = steps[i];
      const stepKind = String(s?.task?.kind || "");
      if (!stepKind) return { ok: false, reason: `pipeline step[${i}] task.kind missing` };
      if (!["run_command", "patch_apply", "create_file", "apply_patch", "file_write", "archive_zip"].includes(stepKind)) {
        return { ok: false, reason: `pipeline step[${i}] unknown task.kind: ${stepKind}` };
      }
      if (stepKind === "pipeline") return { ok: false, reason: `pipeline nesting is not allowed at step[${i}]` };
      if (stepKind === "patch_apply") {
        const fmt = String(s?.task?.patch?.format || "").toLowerCase();
        const text = String(s?.task?.patch?.text || "");
        if (fmt !== "unified") return { ok: false, reason: `pipeline step[${i}] patch_apply requires patch.format=unified` };
        if (!text.trim()) return { ok: false, reason: `pipeline step[${i}] patch_apply requires non-empty patch.text` };
        const pathPolicy = validatePatchApplyPathPolicy(text);
        if (!pathPolicy.ok) return { ok: false, reason: pathPolicy.reason || `pipeline step[${i}] patch path policy violation` };
      }
      if (stepKind === "file_write") {
        const files = Array.isArray(s?.task?.files) ? s.task.files : [];
        if (files.length < 1) return { ok: false, reason: `pipeline step[${i}] file_write requires files` };
        if (files.length > FILE_WRITE_MAX_FILES) return { ok: false, reason: `pipeline step[${i}] file_write files exceed max(${FILE_WRITE_MAX_FILES})` };
        let totalBytes = 0;
        for (let j = 0; j < files.length; j += 1) {
          const row = files[j] || {};
          const relPath = String(row.path || "");
          const mode = String(row.mode || "overwrite").toLowerCase();
          if (!relPath.trim()) return { ok: false, reason: `pipeline step[${i}] file_write files[${j}].path missing` };
          if (!["overwrite", "append"].includes(mode)) return { ok: false, reason: `pipeline step[${i}] file_write files[${j}].mode invalid` };
          const pathCheck = normalizePatchTargetForValidation(relPath);
          if (!pathCheck.ok) return { ok: false, reason: pathCheck.reason || `pipeline step[${i}] file_write path policy violation` };
          const text = String(row.text ?? "");
          if (text.includes("\u0000")) return { ok: false, reason: `pipeline step[${i}] file_write files[${j}] text contains NUL` };
          const bytes = Buffer.byteLength(text, "utf8");
          if (bytes > FILE_WRITE_MAX_FILE_BYTES) return { ok: false, reason: `pipeline step[${i}] file_write files[${j}] exceeds max bytes` };
          totalBytes += bytes;
          if (totalBytes > FILE_WRITE_MAX_TOTAL_BYTES) return { ok: false, reason: `pipeline step[${i}] file_write total bytes exceed max` };
        }
      }
      if (stepKind === "archive_zip") {
        const inputs = Array.isArray(s?.task?.inputs) ? s.task.inputs : [];
        if (inputs.length < 1) return { ok: false, reason: `pipeline step[${i}] archive_zip requires inputs` };
        const out = s?.task?.output || {};
        const zipPath = String(out?.zip_path || "");
        const manifestPath = String(out?.manifest_path || "");
        const zipCheck = normalizePatchTargetForValidation(zipPath);
        if (!zipCheck.ok) return { ok: false, reason: `pipeline step[${i}] archive_zip output.zip_path invalid: ${zipCheck.reason}` };
        const manifestCheck = normalizePatchTargetForValidation(manifestPath);
        if (!manifestCheck.ok) return { ok: false, reason: `pipeline step[${i}] archive_zip output.manifest_path invalid: ${manifestCheck.reason}` };
        for (let j = 0; j < inputs.length; j += 1) {
          const inCheck = normalizePatchTargetForValidation(String(inputs[j] || ""));
          if (!inCheck.ok) return { ok: false, reason: `pipeline step[${i}] archive_zip inputs[${j}] invalid: ${inCheck.reason}` };
        }
        const limits = s?.task?.limits || {};
        const maxFiles = Number(limits?.max_files ?? ARCHIVE_ZIP_DEFAULT_MAX_FILES);
        const maxTotal = Number(limits?.max_total_bytes ?? ARCHIVE_ZIP_DEFAULT_MAX_TOTAL_BYTES);
        if (!Number.isFinite(maxFiles) || maxFiles < 1) return { ok: false, reason: `pipeline step[${i}] archive_zip limits.max_files invalid` };
        if (!Number.isFinite(maxTotal) || maxTotal < 1) return { ok: false, reason: `pipeline step[${i}] archive_zip limits.max_total_bytes invalid` };
      }
    }
    const pipelineAcceptance = validateAcceptanceLight(Array.isArray(task.acceptance) ? task.acceptance : []);
    if (!pipelineAcceptance.ok) return pipelineAcceptance;
    return { ok: true };
  }
  if (!task.spec?.command) return { ok: false, reason: "spec.command missing" };
  if (!task.spec?.args) return { ok: false, reason: "spec.args missing" };
  const mirror = Boolean(task.spec?.artifact?.mirror_run_meta);
  const include = task.spec?.artifact?.mirror_run_meta_include;
  if (include !== undefined && !Array.isArray(include)) return { ok: false, reason: "artifact.mirror_run_meta_include must be array" };
  if (Array.isArray(include)) {
    const allowed = new Set(["task_yaml", "result_pre_acceptance_json", "result_final_json"]);
    for (let i = 0; i < include.length; i += 1) {
      if (!allowed.has(String(include[i] || ""))) return { ok: false, reason: `artifact.mirror_run_meta_include[${i}] invalid` };
    }
  }
  if (mirror && Array.isArray(include) && include.length === 0) return { ok: false, reason: "artifact.mirror_run_meta_include must not be empty when mirror_run_meta=true" };
  if (task.spec.command === "patch_apply") {
    const fmt = String(task.spec?.patch?.format || "").toLowerCase();
    const text = String(task.spec?.patch?.text || "");
    if (fmt !== "unified") return { ok: false, reason: "patch_apply requires spec.patch.format=unified" };
    if (!text.trim()) return { ok: false, reason: "patch_apply requires non-empty spec.patch.text" };
    if (text.length > 262144) return { ok: false, reason: "patch_apply spec.patch.text exceeds max length" };
    const pathPolicy = validatePatchApplyPathPolicy(text);
    if (!pathPolicy.ok) return { ok: false, reason: pathPolicy.reason || "patch_apply path policy violation" };
  }
  if (task.spec.command === "file_write") {
    const files = Array.isArray(task.spec?.files) ? task.spec.files : [];
    if (files.length < 1) return { ok: false, reason: "file_write requires spec.files" };
    if (files.length > FILE_WRITE_MAX_FILES) return { ok: false, reason: `file_write spec.files exceeds max(${FILE_WRITE_MAX_FILES})` };
    let totalBytes = 0;
    for (let i = 0; i < files.length; i += 1) {
      const row = files[i] || {};
      const relPath = String(row.path || "");
      const mode = String(row.mode || "overwrite").toLowerCase();
      if (!relPath.trim()) return { ok: false, reason: `file_write files[${i}].path missing` };
      if (!["overwrite", "append"].includes(mode)) return { ok: false, reason: `file_write files[${i}].mode invalid` };
      const pathCheck = normalizePatchTargetForValidation(relPath);
      if (!pathCheck.ok) return { ok: false, reason: pathCheck.reason || `file_write files[${i}] path policy violation` };
      const text = String(row.text ?? "");
      if (text.includes("\u0000")) return { ok: false, reason: `file_write files[${i}] text contains NUL` };
      const bytes = Buffer.byteLength(text, "utf8");
      if (bytes > FILE_WRITE_MAX_FILE_BYTES) return { ok: false, reason: `file_write files[${i}] exceeds max bytes` };
      totalBytes += bytes;
      if (totalBytes > FILE_WRITE_MAX_TOTAL_BYTES) return { ok: false, reason: "file_write total bytes exceed max" };
    }
  }
  if (task.spec.command === "archive_zip") {
    const inputs = Array.isArray(task.spec?.inputs) ? task.spec.inputs : [];
    if (inputs.length < 1) return { ok: false, reason: "archive_zip requires spec.inputs" };
    for (let i = 0; i < inputs.length; i += 1) {
      const inCheck = normalizePatchTargetForValidation(String(inputs[i] || ""));
      if (!inCheck.ok) return { ok: false, reason: inCheck.reason || `archive_zip inputs[${i}] path policy violation` };
    }
    const zipPath = String(task.spec?.output?.zip_path || "");
    const manifestPath = String(task.spec?.output?.manifest_path || "");
    const zipCheck = normalizePatchTargetForValidation(zipPath);
    if (!zipCheck.ok) return { ok: false, reason: zipCheck.reason || "archive_zip output.zip_path invalid" };
    const manifestCheck = normalizePatchTargetForValidation(manifestPath);
    if (!manifestCheck.ok) return { ok: false, reason: manifestCheck.reason || "archive_zip output.manifest_path invalid" };
    const limits = task.spec?.limits || {};
    const maxFiles = Number(limits?.max_files ?? ARCHIVE_ZIP_DEFAULT_MAX_FILES);
    const maxTotal = Number(limits?.max_total_bytes ?? ARCHIVE_ZIP_DEFAULT_MAX_TOTAL_BYTES);
    if (!Number.isFinite(maxFiles) || maxFiles < 1) return { ok: false, reason: "archive_zip limits.max_files invalid" };
    if (!Number.isFinite(maxTotal) || maxTotal < 1) return { ok: false, reason: "archive_zip limits.max_total_bytes invalid" };
  }
  const acceptanceCheck = validateAcceptanceLight(Array.isArray(task.spec?.acceptance) ? task.spec.acceptance : []);
  if (!acceptanceCheck.ok) return acceptanceCheck;
  return { ok: true };
}

function validateAndNormalizeFileWriteSpec(task: Task): { ok: boolean; files?: Array<{ path: string; text: string; mode: "overwrite" | "append" }>; errors: SchemaErrorDetail[] } {
  const errors: SchemaErrorDetail[] = [];
  if (task.spec?.command !== "file_write") return { ok: true, files: [], errors };
  const files = Array.isArray(task.spec?.files) ? task.spec.files : [];
  if (files.length < 1) {
    pushSchemaError(errors, "task.spec.files", "#/properties/spec/properties/files/minItems", "minItems", "file_write requires at least one file");
    return { ok: false, errors };
  }
  if (files.length > FILE_WRITE_MAX_FILES) {
    pushSchemaError(errors, "task.spec.files", "#/properties/spec/properties/files/maxItems", "maxItems", `file_write files must be <= ${FILE_WRITE_MAX_FILES}`);
  }
  let totalBytes = 0;
  const normalized: Array<{ path: string; text: string; mode: "overwrite" | "append" }> = [];
  for (let i = 0; i < files.length; i += 1) {
    const row = files[i] || {};
    const relPath = String(row.path || "");
    const pathCheck = normalizePatchTargetForValidation(relPath);
    if (!pathCheck.ok || !pathCheck.normalized) {
      pushSchemaError(errors, `task.spec.files[${i}].path`, "#/properties/spec/properties/files/items/properties/path", "pattern", pathCheck.reason || "invalid file path");
      continue;
    }
    const modeRaw = String(row.mode || "overwrite").toLowerCase();
    if (!["overwrite", "append"].includes(modeRaw)) {
      pushSchemaError(errors, `task.spec.files[${i}].mode`, "#/properties/spec/properties/files/items/properties/mode/enum", "enum", "mode must be overwrite|append");
      continue;
    }
    const text = String(row.text ?? "");
    if (text.includes("\u0000")) {
      pushSchemaError(errors, `task.spec.files[${i}].text`, "#/properties/spec/properties/files/items/properties/text", "format", "text must not include NUL");
      continue;
    }
    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes > FILE_WRITE_MAX_FILE_BYTES) {
      pushSchemaError(errors, `task.spec.files[${i}].text`, "#/properties/spec/properties/files/items/properties/text/maxLength", "maxLength", `text bytes must be <= ${FILE_WRITE_MAX_FILE_BYTES}`);
      continue;
    }
    totalBytes += bytes;
    normalized.push({ path: pathCheck.normalized, text, mode: modeRaw as "overwrite" | "append" });
  }
  if (totalBytes > FILE_WRITE_MAX_TOTAL_BYTES) {
    pushSchemaError(errors, "task.spec.files", "#/properties/spec/properties/files", "maxBytes", `total text bytes must be <= ${FILE_WRITE_MAX_TOTAL_BYTES}`);
  }
  return { ok: errors.length === 0, files: normalized, errors };
}

function validateAndNormalizeArchiveZipSpec(task: Task): {
  ok: boolean;
  spec?: {
    inputs: string[];
    output: { zip_path: string; manifest_path: string };
    options: { follow_symlinks: boolean };
    limits: { max_files: number; max_total_bytes: number };
  };
  errors: SchemaErrorDetail[];
} {
  const errors: SchemaErrorDetail[] = [];
  if (task.spec?.command !== "archive_zip") return { ok: true, errors };

  const inputs = Array.isArray(task.spec?.inputs) ? task.spec.inputs : [];
  if (inputs.length < 1) {
    pushSchemaError(errors, "task.spec.inputs", "#/properties/spec/properties/inputs/minItems", "minItems", "archive_zip requires at least one input");
  }
  const normalizedInputs: string[] = [];
  for (let i = 0; i < inputs.length; i += 1) {
    const c = normalizePatchTargetForValidation(String(inputs[i] || ""));
    if (!c.ok || !c.normalized) {
      pushSchemaError(errors, `task.spec.inputs[${i}]`, "#/properties/spec/properties/inputs/items/pattern", "pattern", c.reason || "invalid input path");
    } else {
      normalizedInputs.push(c.normalized);
    }
  }

  const zipPathRaw = String(task.spec?.output?.zip_path || "");
  const manifestPathRaw = String(task.spec?.output?.manifest_path || "");
  const zipCheck = normalizePatchTargetForValidation(zipPathRaw);
  if (!zipCheck.ok || !zipCheck.normalized) {
    pushSchemaError(errors, "task.spec.output.zip_path", "#/properties/spec/properties/output/properties/zip_path/pattern", "pattern", zipCheck.reason || "invalid zip_path");
  }
  const manifestCheck = normalizePatchTargetForValidation(manifestPathRaw);
  if (!manifestCheck.ok || !manifestCheck.normalized) {
    pushSchemaError(errors, "task.spec.output.manifest_path", "#/properties/spec/properties/output/properties/manifest_path/pattern", "pattern", manifestCheck.reason || "invalid manifest_path");
  }

  const followSymlinks = Boolean(task.spec?.options?.follow_symlinks);
  const maxFiles = Number(task.spec?.limits?.max_files ?? ARCHIVE_ZIP_DEFAULT_MAX_FILES);
  const maxTotal = Number(task.spec?.limits?.max_total_bytes ?? ARCHIVE_ZIP_DEFAULT_MAX_TOTAL_BYTES);
  if (!Number.isFinite(maxFiles) || maxFiles < 1) {
    pushSchemaError(errors, "task.spec.limits.max_files", "#/properties/spec/properties/limits/properties/max_files/minimum", "minimum", "max_files must be >= 1");
  }
  if (!Number.isFinite(maxTotal) || maxTotal < 1) {
    pushSchemaError(errors, "task.spec.limits.max_total_bytes", "#/properties/spec/properties/limits/properties/max_total_bytes/minimum", "minimum", "max_total_bytes must be >= 1");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors,
    spec: {
      inputs: normalizedInputs,
      output: { zip_path: zipCheck.normalized!, manifest_path: manifestCheck.normalized! },
      options: { follow_symlinks: followSymlinks },
      limits: { max_files: Math.floor(maxFiles), max_total_bytes: Math.floor(maxTotal) },
    },
  };
}

function normalizePatchTargetForValidation(raw: string): { ok: boolean; normalized?: string; reason?: string } {
  let p = String(raw || "").trim();
  if (!p) return { ok: false, reason: "empty patch target path" };
  if (p.startsWith("a/") || p.startsWith("b/")) p = p.slice(2);
  p = p.replace(/\\/g, "/").trim();
  if (!p) return { ok: false, reason: "empty patch target path" };
  if (p.startsWith("//")) return { ok: false, reason: `UNC path rejected: ${p}` };
  if (/^[A-Za-z]:/.test(p)) return { ok: false, reason: `absolute drive path rejected: ${p}` };
  if (p.startsWith("/")) return { ok: false, reason: `absolute path rejected: ${p}` };
  const parts = p.split("/").filter((x) => x.length > 0 && x !== ".");
  if (parts.some((x) => x === "..")) return { ok: false, reason: `traversal path rejected: ${p}` };
  return { ok: true, normalized: parts.join("/") };
}

function validatePatchApplyPathPolicy(text: string): { ok: boolean; reason?: string } {
  const lines = String(text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] || "";
    if (!line.startsWith("--- ")) continue;
    const oldPathRaw = line.slice(4).trim().split("\t")[0].trim();
    const next = i + 1 < lines.length ? lines[i + 1] : "";
    if (!next.startsWith("+++ ")) continue;
    const newPathRaw = next.slice(4).trim().split("\t")[0].trim();

    if (oldPathRaw !== "/dev/null") {
      const n = normalizePatchTargetForValidation(oldPathRaw);
      if (!n.ok) return { ok: false, reason: n.reason };
    }
    if (newPathRaw !== "/dev/null") {
      const n = normalizePatchTargetForValidation(newPathRaw);
      if (!n.ok) return { ok: false, reason: n.reason };
    }
  }
  return { ok: true };
}

function validateJsonPointerSyntax(pointer: string): { ok: boolean; reason?: string } {
  const p = String(pointer ?? "");
  if (p === "") return { ok: true };
  if (!p.startsWith("/")) return { ok: false, reason: "pointer must start with '/'" };
  const segments = p.slice(1).split("/");
  for (const seg of segments) {
    for (let i = 0; i < seg.length; i += 1) {
      if (seg[i] !== "~") continue;
      if (i + 1 >= seg.length) return { ok: false, reason: "invalid pointer escape '~'" };
      const n = seg[i + 1];
      if (n !== "0" && n !== "1") return { ok: false, reason: `invalid pointer escape '~${n}'` };
      i += 1;
    }
  }
  return { ok: true };
}

function jsonPointerTypeName(value: any): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "boolean") return "bool";
  if (t === "number") return "number";
  if (t === "string") return "string";
  if (t === "object") return "object";
  return t;
}

function resolveJsonPointer(doc: any, pointer: string): { found: boolean; value?: any; note?: string } {
  const p = String(pointer ?? "");
  const syntax = validateJsonPointerSyntax(p);
  if (!syntax.ok) return { found: false, note: `pointer_invalid:${syntax.reason || "invalid"}` };
  if (p === "") return { found: true, value: doc };

  const unescape = (s: string): string => s.replace(/~1/g, "/").replace(/~0/g, "~");
  const parts = p.slice(1).split("/").map(unescape);
  let cur: any = doc;
  for (const rawPart of parts) {
    if (Array.isArray(cur)) {
      if (rawPart === "length") {
        cur = cur.length;
        continue;
      }
      if (!/^(0|[1-9]\d*)$/.test(rawPart)) return { found: false, note: "pointer_not_found" };
      const idx = Number(rawPart);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return { found: false, note: "pointer_not_found" };
      cur = cur[idx];
      continue;
    }
    if (cur && typeof cur === "object" && Object.prototype.hasOwnProperty.call(cur, rawPart)) {
      cur = cur[rawPart];
      continue;
    }
    return { found: false, note: "pointer_not_found" };
  }
  return { found: true, value: cur };
}

function validateAcceptanceLight(items: any[]): { ok: boolean; reason?: string } {
  const list = Array.isArray(items) ? items : [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i] || {};
    const type = String(item.type || "");
    if ([
      "artifact_file_contains",
      "artifact_file_not_contains",
      "artifact_file_regex",
      "artifact_file_not_regex",
      "artifact_json_pointer_equals",
      "artifact_json_pointer_regex",
      "artifact_json_pointer_exists",
      "artifact_json_pointer_not_exists",
      "artifact_json_pointer_gt",
      "artifact_json_pointer_gte",
      "artifact_json_pointer_lt",
      "artifact_json_pointer_lte",
    ].includes(type)) {
      const rawPath = String(item.path || "");
      if (!rawPath.trim()) return { ok: false, reason: `acceptance[${i}] path missing` };
      const normalized = normalizePatchTargetForValidation(rawPath);
      if (!normalized.ok) return { ok: false, reason: `acceptance[${i}] ${normalized.reason || "invalid artifact file path"}` };
    }
    if ([
      "artifact_json_pointer_equals",
      "artifact_json_pointer_regex",
      "artifact_json_pointer_exists",
      "artifact_json_pointer_not_exists",
      "artifact_json_pointer_gt",
      "artifact_json_pointer_gte",
      "artifact_json_pointer_lt",
      "artifact_json_pointer_lte",
    ].includes(type)) {
      const pointer = String(item.pointer ?? "");
      const p = validateJsonPointerSyntax(pointer);
      if (!p.ok) return { ok: false, reason: `acceptance[${i}] ${p.reason || "invalid pointer"}` };
    }
    if (["artifact_zip_entry_exists", "artifact_zip_entry_not_exists", "artifact_zip_entry_regex", "artifact_zip_entry_not_regex"].includes(type)) {
      const rawPath = String(item.zip_path || "");
      if (!rawPath.trim()) return { ok: false, reason: `acceptance[${i}] zip_path missing` };
      const normalized = normalizePatchTargetForValidation(rawPath);
      if (!normalized.ok) return { ok: false, reason: `acceptance[${i}] ${normalized.reason || "invalid artifact zip path"}` };
    }
    if (type === "stdout_regex" || type === "artifact_file_regex" || type === "artifact_file_not_regex" || type === "artifact_json_pointer_regex" || type === "artifact_zip_entry_regex" || type === "artifact_zip_entry_not_regex") {
      const flags = String(item.flags || "");
      if (!/^[imsu]*$/.test(flags)) return { ok: false, reason: `acceptance[${i}] invalid regex flags` };
      if (new Set(flags.split("")).size !== flags.length) return { ok: false, reason: `acceptance[${i}] duplicate regex flags` };
      if (flags.length > 4) return { ok: false, reason: `acceptance[${i}] regex flags too long` };
    }
    if ((type === "artifact_zip_entry_exists" || type === "artifact_zip_entry_not_exists") && String(item.entry ?? "").length < 1) {
      return { ok: false, reason: `acceptance[${i}] entry missing` };
    }
    if ((type === "artifact_zip_entry_regex" || type === "artifact_zip_entry_not_regex") && String(item.pattern ?? "").length < 1) {
      return { ok: false, reason: `acceptance[${i}] pattern missing` };
    }
    if (type === "artifact_json_pointer_equals" && !Object.prototype.hasOwnProperty.call(item, "equals")) {
      return { ok: false, reason: `acceptance[${i}] equals missing` };
    }
    if (["artifact_json_pointer_gt", "artifact_json_pointer_gte", "artifact_json_pointer_lt", "artifact_json_pointer_lte"].includes(type)) {
      if (!Object.prototype.hasOwnProperty.call(item, "value")) return { ok: false, reason: `acceptance[${i}] value missing` };
      const valueNum = Number(item.value);
      if (!Number.isFinite(valueNum)) return { ok: false, reason: `acceptance[${i}] value must be finite number` };
    }
  }
  return { ok: true };
}

function atomicMove(src: string, dst: string): void {
  fs.renameSync(src, dst);
}

function appendDashboard(line: string): void {
  const dash = path.join(DIRS.status, "dashboard.md");
  fs.appendFileSync(dash, line + os.EOL, "utf8");
}

function writeExecRequest(runId: string, req: any): void {
  const payload = JSON.stringify(req, null, 2);
  fs.writeFileSync(path.join(DIRS.execRequests, `${runId}.json`), payload, "utf8");
  if (!isSamePath(DIRS.execRequests, LEGACY_EXEC_REQUESTS)) {
    try {
      fs.mkdirSync(LEGACY_EXEC_REQUESTS, { recursive: true });
      fs.mkdirSync(LEGACY_EXEC_RESULTS, { recursive: true });
      fs.writeFileSync(path.join(LEGACY_EXEC_REQUESTS, `${runId}.json`), payload, "utf8");
    } catch (e: any) {
      console.log(`[orchestrator] exec_root_mirror_failed run_id=${runId} path=${LEGACY_EXEC_REQUESTS} reason=${String(e?.message || e)}`);
    }
  }
}

function resolveExecResultPath(runId: string): string | null {
  const primary = path.join(DIRS.execResults, `${runId}.json`);
  if (fs.existsSync(primary)) return primary;
  if (!isSamePath(DIRS.execResults, LEGACY_EXEC_RESULTS)) {
    const legacy = path.join(LEGACY_EXEC_RESULTS, `${runId}.json`);
    if (fs.existsSync(legacy)) return legacy;
  }
  return null;
}

function resolveTaskPath(task: Task, p: string): string {
  const base = task.spec.context?.repo_path || ROOT;
  return path.isAbsolute(p) ? p : path.join(base, p);
}

function collectRunArtifactFiles(runDir: string): string[] {
  const filesDir = path.join(runDir, "files");
  if (!fs.existsSync(filesDir)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        const rel = path.relative(filesDir, abs);
        out.push(rel.split(path.sep).join("/"));
      }
    }
  };
  walk(filesDir);
  out.sort();
  return out;
}

function normalizeMetaInclude(task: Task): Set<string> {
  const includeDefault = ["task_yaml", "result_pre_acceptance_json", "result_final_json"];
  const enabled = Boolean(task.spec?.artifact?.mirror_run_meta);
  if (!enabled) return new Set<string>();
  const raw = Array.isArray(task.spec?.artifact?.mirror_run_meta_include) ? task.spec?.artifact?.mirror_run_meta_include : includeDefault;
  return new Set(raw.map((x) => String(x || "")));
}

function writeRunMetaJson(runDir: string, relPath: string, payload: any): { relPath: string; truncated: boolean } {
  const filesDir = path.join(runDir, "files");
  const abs = path.join(filesDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  let out = payload;
  let serialized = JSON.stringify(out, null, 2);
  let truncated = false;
  if (Buffer.byteLength(serialized, "utf8") > RUN_META_MAX_BYTES) {
    const sample = serialized.slice(0, 2000);
    out = {
      note: "meta_truncated",
      original_bytes: Buffer.byteLength(serialized, "utf8"),
      sample,
    };
    serialized = JSON.stringify(out, null, 2);
    truncated = true;
  }
  fs.writeFileSync(abs, serialized, "utf8");
  return { relPath: relPath.replaceAll("\\", "/"), truncated };
}

function writeRunMetaYaml(runDir: string, relPath: string, payload: any): { relPath: string; truncated: boolean } {
  const filesDir = path.join(runDir, "files");
  const abs = path.join(filesDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const doc = new YAML.Document(payload);
  (doc as any).options.indent = 2;
  let text = doc.toString();
  let truncated = false;
  if (Buffer.byteLength(text, "utf8") > RUN_META_MAX_BYTES) {
    text = text.slice(0, 4000) + "\n# note: meta_truncated\n";
    truncated = true;
  }
  fs.writeFileSync(abs, text, "utf8");
  return { relPath: relPath.replaceAll("\\", "/"), truncated };
}

function boundedTimeoutMs(raw: any, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1000, Math.min(MAX_RUN_COMMAND_TIMEOUT_MS, Math.floor(n)));
}

function getRunCommandTimeoutMs(task: Task): number {
  const fromTaskRuntime = task.spec.runtime?.timeout_ms;
  if (Number.isFinite(Number(fromTaskRuntime)) && Number(fromTaskRuntime) > 0) {
    return boundedTimeoutMs(fromTaskRuntime, DEFAULT_RUN_COMMAND_TIMEOUT_MS);
  }
  return boundedTimeoutMs(task.spec.args?.timeout_ms, DEFAULT_RUN_COMMAND_TIMEOUT_MS);
}

function isTimeoutExpected(task: Task): boolean {
  return Boolean(task.spec.runtime?.timeout_expected);
}

function getTimeoutExpectedAcceptancePolicy(task: Task): "skip" | "strict" {
  const raw = String(task.spec.runtime?.timeout_expected_acceptance || "skip").toLowerCase();
  return raw === "strict" ? "strict" : "skip";
}

function waitingPathFor(runningPath: string, runId: string): string {
  const base = path.basename(runningPath, path.extname(runningPath));
  const ext = path.extname(runningPath) || ".yaml";
  return path.join(DIRS.waiting, `${base}__runid__${runId}${ext}`);
}

function parseWaitingPath(waitingPath: string): { runId: string; baseName: string; ext: string } | null {
  const ext = path.extname(waitingPath) || ".yaml";
  const base = path.basename(waitingPath, ext);
  const marker = "__runid__";
  const i = base.lastIndexOf(marker);
  if (i < 0) return null;
  const baseName = base.slice(0, i);
  const runId = base.slice(i + marker.length);
  if (!runId) return null;
  return { runId, baseName, ext };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestExecutorAndWait(payload: any, waitTimeoutMs: number): Promise<any> {
  const runId = String(payload?.run_id || randomId("exec"));
  const reqPath = path.join(DIRS.execRequests, `${runId}.json`);
  const resPath = path.join(DIRS.execResults, `${runId}.json`);

  fs.writeFileSync(reqPath, JSON.stringify(payload, null, 2), "utf8");
  const deadline = Date.now() + Math.max(waitTimeoutMs, 1000);

  while (Date.now() <= deadline) {
    if (fs.existsSync(resPath)) {
      try {
        const raw = fs.readFileSync(resPath, "utf8");
        const obj = JSON.parse(raw);
        fs.unlinkSync(resPath);
        return obj;
      } catch {
        return { run_id: runId, exitCode: 1, timedOut: false, stdout: "", stderr: "invalid executor result json" };
      }
    }
    await sleep(200);
  }

  return { run_id: runId, exitCode: 124, timedOut: true, stdout: "", stderr: "executor result wait timeout" };
}

function getJsonPathValue(obj: any, jsonPath: string): any {
  if (!jsonPath.startsWith("$.")) return undefined;
  const keys = jsonPath.slice(2).split(".").filter(Boolean);
  let cur: any = obj;
  for (const k of keys) {
    if (cur && typeof cur === "object" && k in cur) cur = cur[k];
    else return undefined;
  }
  return cur;
}

function readProposalIndex(): ProposalIndexFile {
  try {
    const raw = fs.readFileSync(PROPOSALS_INDEX_PATH, "utf8");
    const obj = JSON.parse(raw);
    if (Array.isArray(obj?.items)) return { items: obj.items };
    return { items: [] };
  } catch {
    return { items: [] };
  }
}

function writeProposalIndex(index: ProposalIndexFile): void {
  fs.writeFileSync(PROPOSALS_INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
}

function taskCommandLabel(task: Task): string {
  if (task.kind === "pipeline" || task.spec?.command === "pipeline") return "pipeline";
  return String(task.spec?.command || "");
}

function taskAcceptanceList(task: Task): any[] {
  if (task.kind === "pipeline") return Array.isArray(task.acceptance) ? task.acceptance : [];
  return Array.isArray(task.spec?.acceptance) ? task.spec?.acceptance : [];
}

function proposalKey(task: Task): string {
  const command = taskCommandLabel(task);
  const category = task.metadata.category || "";
  const acceptanceTypes = taskAcceptanceList(task)
    .map((a: any) => String(a?.type || ""))
    .sort()
    .join(",");
  return `${command}|${category}|${acceptanceTypes}`;
}

function shouldSuppressProposal(key: string, index: ProposalIndexFile): boolean {
  const candidates = index.items
    .filter((i) => i.key === key && (i.status === "proposed" || i.status === "accepted"))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  if (!candidates.length) return false;

  const latest = candidates[0];
  const latestMs = Date.parse(latest.updated_at || latest.created_at || "");
  if (!Number.isFinite(latestMs)) return true;

  const elapsedHours = (Date.now() - latestMs) / (1000 * 60 * 60);
  return elapsedHours < REPROPOSE_HOURS;
}

function upsertProposalIndexOnCreate(key: string, proposalId: string, skillId: string): void {
  const index = readProposalIndex();
  const now = nowIsoJst();
  index.items.push({
    key,
    proposal_id: proposalId,
    skill_id: skillId,
    status: "proposed",
    created_at: now,
    updated_at: now,
  });
  writeProposalIndex(index);
}

function upsertProposalIndexOnAccept(proposalId: string): void {
  const index = readProposalIndex();
  const now = nowIsoJst();
  const hit = index.items.find((i) => i.proposal_id === proposalId);
  if (hit) {
    hit.status = "accepted";
    hit.updated_at = now;
  }
  writeProposalIndex(index);
}

async function evaluateAcceptance(task: Task, ctx: AcceptanceContext = {}): Promise<{ ok: boolean; results: AcceptanceResult[] }> {
  const items = Array.isArray(task.spec.acceptance) ? task.spec.acceptance : [];
  const results: AcceptanceResult[] = [];
  const SAMPLE_CAP_CHARS = 200;
  const MAX_REGEX_INPUT_CHARS = 10000;
  const sampleText = (s: string, max = SAMPLE_CAP_CHARS): string => String(s || "").slice(0, max);
  const truncateRegexInput = (s: string, max = MAX_REGEX_INPUT_CHARS): { text: string; truncated: boolean } => {
    const text = String(s || "");
    if (text.length <= max) return { text, truncated: false };
    return { text: text.slice(0, max), truncated: true };
  };
  const withTruncationNote = (baseNote: string, truncated: boolean): string =>
    truncated ? (baseNote ? `${baseNote};input_truncated` : "input_truncated") : baseNote;
  const normalizeValue = (item: any): string => {
    const fromValue = String(item?.value ?? "");
    if (fromValue.length > 0) return fromValue;
    return String(item?.text ?? "");
  };
  const validateRegexFlags = (flags: string): { ok: boolean; reason?: string } => {
    if (!/^[imsu]*$/.test(flags)) return { ok: false, reason: "unsupported_flags" };
    const unique = new Set(flags.split(""));
    if (unique.size !== flags.length) return { ok: false, reason: "duplicate_flags" };
    if (flags.length > 4) return { ok: false, reason: "flags_too_long" };
    return { ok: true };
  };
  const withPlaceholders = (p: string): string =>
    p
      .replaceAll("<run_id>", String(ctx.runId || ""))
      .replaceAll("<workspace_root>", WORKSPACE)
      .replaceAll("<exec_root>", EXEC_ROOT);
  const artifactFileSet = new Set((ctx.artifactsFiles || []).map((f) => String(f || "").replaceAll("\\", "/")));
  const runFilesDir = String(ctx.runFilesDir || "");
  const resolveArtifactFileRead = (rawPath: string): { ok: boolean; normalized?: string; abs?: string; note?: string } => {
    const p = String(rawPath || "").replaceAll("\\", "/").trim();
    if (!p) return { ok: false, note: "missing_path" };
    const normalizedPath = normalizePatchTargetForValidation(p);
    if (!normalizedPath.ok || !normalizedPath.normalized) {
      return { ok: false, note: normalizedPath.reason || "invalid_path" };
    }
    if (!runFilesDir) return { ok: false, note: "run_files_dir_missing" };
    const abs = path.resolve(runFilesDir, normalizedPath.normalized);
    const base = path.resolve(runFilesDir);
    const relToBase = path.relative(base, abs);
    const inside = relToBase !== "" && !relToBase.startsWith("..") && !path.isAbsolute(relToBase);
    if (!inside) return { ok: false, note: "outside_run_files_dir" };
    return { ok: true, normalized: normalizedPath.normalized, abs };
  };
  const readArtifactText = (rawPath: string): { ok: boolean; normalized: string; text: string; sample: string; truncated: boolean; note: string } => {
    const resolved = resolveArtifactFileRead(rawPath);
    if (!resolved.ok || !resolved.normalized || !resolved.abs) {
      return { ok: false, normalized: "", text: "", sample: "", truncated: false, note: resolved.note || "path_error" };
    }
    const listed = artifactFileSet.has(resolved.normalized);
    if (!listed) return { ok: false, normalized: resolved.normalized, text: "", sample: "", truncated: false, note: "not_listed_in_artifacts_files" };
    if (!fs.existsSync(resolved.abs)) {
      return { ok: false, normalized: resolved.normalized, text: "", sample: "", truncated: false, note: "file_missing" };
    }
    try {
      const raw = fs.readFileSync(resolved.abs);
      const truncated = raw.length > ACCEPTANCE_ARTIFACT_FILE_MAX_BYTES;
      const clipped = truncated ? raw.subarray(0, ACCEPTANCE_ARTIFACT_FILE_MAX_BYTES) : raw;
      const text = clipped.toString("utf8");
      const sample = sampleText(text);
      return { ok: true, normalized: resolved.normalized, text, sample, truncated, note: truncated ? "artifact_input_truncated" : "" };
    } catch (e: any) {
      return { ok: false, normalized: resolved.normalized, text: "", sample: "", truncated: false, note: `read_error:${String(e?.message || e)}` };
    }
  };
  const artifactJsonCache = new Map<string, { ok: boolean; normalized: string; parsed?: any; sample: string; truncated: boolean; note: string }>();
  const readArtifactJson = (rawPath: string): { ok: boolean; normalized: string; parsed?: any; sample: string; truncated: boolean; note: string } => {
    const read = readArtifactText(rawPath);
    const cacheKey = read.normalized || String(rawPath || "");
    if (artifactJsonCache.has(cacheKey)) return artifactJsonCache.get(cacheKey)!;
    if (!read.ok) {
      const fail = { ok: false, normalized: read.normalized || "", sample: read.sample || "", truncated: read.truncated, note: read.note || "read_failed" };
      artifactJsonCache.set(cacheKey, fail);
      return fail;
    }
    try {
      const parsed = JSON.parse(read.text);
      const ok = { ok: true, normalized: read.normalized, parsed, sample: read.sample, truncated: read.truncated, note: read.note || "" };
      artifactJsonCache.set(cacheKey, ok);
      return ok;
    } catch (e: any) {
      const parseNote = `json_parse_error:${String(e?.message || e)}`;
      const fail = {
        ok: false,
        normalized: read.normalized,
        sample: read.sample,
        truncated: read.truncated,
        note: withTruncationNote(parseNote, read.truncated),
      };
      artifactJsonCache.set(cacheKey, fail);
      return fail;
    }
  };
  const sampleJsonValue = (v: any): { sample: string; truncated: boolean } => {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    const normalized = String(s ?? "");
    if (normalized.length <= SAMPLE_CAP_CHARS) return { sample: normalized, truncated: false };
    return { sample: normalized.slice(0, SAMPLE_CAP_CHARS), truncated: true };
  };
  const joinNotes = (...parts: Array<string | undefined>): string => parts.map((x) => String(x || "").trim()).filter(Boolean).join(";");
  const clipEntry = (entry: string): { value: string; clipped: boolean } => {
    const raw = String(entry || "");
    if (raw.length <= ACCEPTANCE_ZIP_ENTRY_MAX_ENTRY_CHARS) return { value: raw, clipped: false };
    return { value: raw.slice(0, ACCEPTANCE_ZIP_ENTRY_MAX_ENTRY_CHARS), clipped: true };
  };
  const buildEntriesSample = (entries: string[]): { sample: string[]; truncated: boolean } => {
    const sample: string[] = [];
    let totalChars = 0;
    for (const entry of entries) {
      if (sample.length >= ACCEPTANCE_ZIP_ENTRY_SAMPLE_MAX_ITEMS) return { sample, truncated: true };
      const clipped = clipEntry(entry).value;
      if (totalChars + clipped.length > ACCEPTANCE_ZIP_ENTRY_SAMPLE_MAX_CHARS) return { sample, truncated: true };
      sample.push(clipped);
      totalChars += clipped.length;
    }
    return { sample, truncated: false };
  };
  const readZipEntriesFromFile = (zipAbsPath: string): {
    ok: boolean;
    entries: string[];
    totalEntries?: number;
    truncated: boolean;
    note: string;
    error?: string;
  } => {
    let raw: Buffer;
    try {
      raw = fs.readFileSync(zipAbsPath);
    } catch (e: any) {
      return { ok: false, entries: [], truncated: false, note: "zip_open_error", error: String(e?.message || e) };
    }
    if (raw.length < 22) {
      return { ok: false, entries: [], truncated: false, note: "zip_open_error:invalid_zip_too_small", error: "zip_too_small" };
    }

    const EOCD_SIG = 0x06054b50;
    const CEN_SIG = 0x02014b50;
    const eocdMin = 22;
    const eocdSearchStart = Math.max(0, raw.length - (0xffff + eocdMin));
    let eocdOffset = -1;
    for (let i = raw.length - eocdMin; i >= eocdSearchStart; i -= 1) {
      if (raw.readUInt32LE(i) === EOCD_SIG) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset < 0) {
      return { ok: false, entries: [], truncated: false, note: "zip_open_error:eocd_not_found", error: "eocd_not_found" };
    }
    if (eocdOffset + eocdMin > raw.length) {
      return { ok: false, entries: [], truncated: false, note: "zip_open_error:eocd_out_of_bounds", error: "eocd_out_of_bounds" };
    }

    const totalEntriesEocd = raw.readUInt16LE(eocdOffset + 10);
    const centralDirOffset = raw.readUInt32LE(eocdOffset + 16);
    if (totalEntriesEocd === 0xffff || centralDirOffset === 0xffffffff) {
      return { ok: false, entries: [], truncated: false, note: "zip_open_error:zip64_not_supported", error: "zip64_not_supported" };
    }
    if (centralDirOffset >= raw.length) {
      return { ok: false, entries: [], truncated: false, note: "zip_open_error:central_directory_invalid", error: "central_directory_invalid" };
    }

    const entries: string[] = [];
    let entryNameClipped = false;
    let entriesTruncated = false;
    let parsedCount = 0;
    let pos = centralDirOffset;
    while (pos + 46 <= raw.length) {
      const sig = raw.readUInt32LE(pos);
      if (sig !== CEN_SIG) break;
      const flags = raw.readUInt16LE(pos + 8);
      const nameLen = raw.readUInt16LE(pos + 28);
      const extraLen = raw.readUInt16LE(pos + 30);
      const commentLen = raw.readUInt16LE(pos + 32);
      const recordLen = 46 + nameLen + extraLen + commentLen;
      if (pos + recordLen > raw.length) {
        return { ok: false, entries: [], truncated: false, note: "zip_open_error:central_directory_truncated", error: "central_directory_truncated" };
      }
      const nameStart = pos + 46;
      const nameEnd = nameStart + nameLen;
      const useUtf8 = (flags & 0x0800) !== 0;
      let entryName = "";
      try {
        entryName = raw.subarray(nameStart, nameEnd).toString(useUtf8 ? "utf8" : "latin1");
      } catch {
        entryName = raw.subarray(nameStart, nameEnd).toString("utf8");
      }
      const clipped = clipEntry(entryName);
      if (clipped.clipped) entryNameClipped = true;
      if (entries.length < ACCEPTANCE_ZIP_ENTRY_MAX_ENTRIES) {
        entries.push(clipped.value);
      } else {
        entriesTruncated = true;
      }
      parsedCount += 1;
      pos += recordLen;
      if (parsedCount >= totalEntriesEocd) break;
    }

    const note = joinNotes(
      entriesTruncated ? "entries_truncated:max_entries_cap" : "",
      entryNameClipped ? "entry_name_truncated" : ""
    );
    return {
      ok: true,
      entries,
      totalEntries: totalEntriesEocd,
      truncated: entriesTruncated || entryNameClipped,
      note,
    };
  };
  const artifactZipCache = new Map<string, {
    ok: boolean;
    normalized: string;
    entries: string[];
    entrySet: Set<string>;
    entriesSample: string[];
    totalEntries?: number;
    truncated: boolean;
    note: string;
    error?: string;
  }>();
  const readArtifactZipEntries = (rawZipPath: string): {
    ok: boolean;
    normalized: string;
    entries: string[];
    entrySet: Set<string>;
    entriesSample: string[];
    totalEntries?: number;
    truncated: boolean;
    note: string;
    error?: string;
  } => {
    const resolved = resolveArtifactFileRead(rawZipPath);
    const cacheKey = resolved.normalized || String(rawZipPath || "");
    if (artifactZipCache.has(cacheKey)) return artifactZipCache.get(cacheKey)!;
    if (!resolved.ok || !resolved.normalized || !resolved.abs) {
      const fail = {
        ok: false,
        normalized: resolved.normalized || "",
        entries: [],
        entrySet: new Set<string>(),
        entriesSample: [],
        truncated: false,
        note: resolved.note || "zip_open_error:path_error",
      };
      artifactZipCache.set(cacheKey, fail);
      return fail;
    }
    if (!artifactFileSet.has(resolved.normalized)) {
      const fail = {
        ok: false,
        normalized: resolved.normalized,
        entries: [],
        entrySet: new Set<string>(),
        entriesSample: [],
        truncated: false,
        note: "zip_open_error:not_listed_in_artifacts_files",
      };
      artifactZipCache.set(cacheKey, fail);
      return fail;
    }
    if (!fs.existsSync(resolved.abs)) {
      const fail = {
        ok: false,
        normalized: resolved.normalized,
        entries: [],
        entrySet: new Set<string>(),
        entriesSample: [],
        truncated: false,
        note: "zip_open_error:file_missing",
      };
      artifactZipCache.set(cacheKey, fail);
      return fail;
    }

    const listed = readZipEntriesFromFile(resolved.abs);
    if (!listed.ok) {
      const fail = {
        ok: false,
        normalized: resolved.normalized,
        entries: [],
        entrySet: new Set<string>(),
        entriesSample: [],
        truncated: false,
        note: listed.note || "zip_open_error",
        error: listed.error,
      };
      artifactZipCache.set(cacheKey, fail);
      return fail;
    }
    const sample = buildEntriesSample(listed.entries);
    const ok = {
      ok: true,
      normalized: resolved.normalized,
      entries: listed.entries,
      entrySet: new Set(listed.entries),
      entriesSample: sample.sample,
      totalEntries: listed.totalEntries,
      truncated: listed.truncated || sample.truncated,
      note: joinNotes(listed.note, sample.truncated ? "entries_sample_truncated" : ""),
    };
    artifactZipCache.set(cacheKey, ok);
    return ok;
  };

  for (const item of items) {
    const type = String(item?.type || "");
    try {
      if (type === "file_exists") {
        const pathRaw = withPlaceholders(String(item.path || ""));
        const filePath = resolveTaskPath(task, pathRaw);
        const ok = !!item.path && fs.existsSync(filePath);
        results.push({ type, ok, detail: ok ? `exists: ${filePath}` : `missing: ${filePath}` });
      } else if (type === "contains_text") {
        const pathRaw = withPlaceholders(String(item.path || ""));
        const filePath = resolveTaskPath(task, pathRaw);
        const text = String(item.text || "");
        const ok = fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8").includes(text);
        results.push({ type, ok, detail: ok ? `contains_text ok: ${filePath}` : `contains_text ng: ${filePath}` });
      } else if (type === "command_exit_code") {
        const cmd = String(item.command || "");
        const expected = Number(item.exit_code);
        const reuseExit = Number(ctx.commandExitCode);
        if (Number.isFinite(reuseExit)) {
          const ok = Number.isFinite(expected) && reuseExit === expected;
          results.push({
            type,
            ok,
            detail: ok
              ? `command_exit_code ok: exit=${reuseExit}`
              : `command_exit_code ng: got=${reuseExit} expected=${expected}`,
          });
          continue;
        }

        const cwd = task.spec.context?.repo_path || ROOT;
        const timeoutMsRaw = Number(item.timeout_ms ?? 300000);
        const timeoutMs = Math.min(Math.max(timeoutMsRaw, 1000), 1800000);
        const reqRunId = randomId("acc");
        const res = await requestExecutorAndWait(
          {
            run_id: reqRunId,
            task_id: task.metadata.id,
            mode: "command",
            command: cmd,
            cwd,
            timeout_ms: timeoutMs,
          },
          timeoutMs + 5000
        );
        const actual = Number(res?.exitCode);
        const ok = Number.isFinite(expected) && Number.isFinite(actual) && actual === expected;
        results.push({
          type,
          ok,
          detail: ok
            ? `command_exit_code ok: ${cmd}`
            : `command_exit_code ng: got=${actual} expected=${expected}\n  stderr=${String(res?.stderr ?? "").slice(0, 200)}`,
        });
      } else if (type === "json_path_equals") {
        const pathRaw = withPlaceholders(String(item.path || ""));
        const filePath = resolveTaskPath(task, pathRaw);
        const jsonPath = String(item.json_path || "");
        const expected = String(item.equals ?? "");
        let actual = "";
        let ok = false;
        if (fs.existsSync(filePath)) {
          const obj = JSON.parse(fs.readFileSync(filePath, "utf8"));
          const v = getJsonPathValue(obj, jsonPath);
          actual = String(v ?? "");
          ok = actual === expected;
        }
        results.push({ type, ok, detail: ok ? `json_path_equals ok: ${jsonPath}` : `json_path_equals ng: ${jsonPath}=${actual}` });
      } else if (type === "stdout_contains") {
        const text = String(item.text || "");
        const ok = text.length > 0 && String(ctx.stdout || "").includes(text);
        results.push({ type, ok, detail: ok ? `stdout_contains ok: ${text}` : `stdout_contains ng: ${text}` });
      } else if (type === "stdout_regex") {
        const pattern = String(item.pattern || "");
        const flags = String(item.flags || "");
        const stdout = String(ctx.stdout || "");
        const stdoutWindow = truncateRegexInput(stdout);
        if (!pattern || pattern.length > 1024) {
          results.push({
            type,
            ok: false,
            detail: "stdout_regex ng: invalid pattern length",
            details: {
              kind: "stdout_regex",
              target: "stdout",
              expected: { pattern, flags },
              actual_sample: sampleText(stdout),
              note: withTruncationNote("invalid_pattern_length", stdoutWindow.truncated),
            },
          });
          continue;
        }
        const flagsValidation = validateRegexFlags(flags);
        if (!flagsValidation.ok) {
          results.push({
            type,
            ok: false,
            detail: `stdout_regex ng: invalid flags: ${flags}`,
            details: {
              kind: "stdout_regex",
              target: "stdout",
              expected: { pattern, flags },
              actual_sample: sampleText(stdout),
              note: withTruncationNote(`regex_flags_error:${flagsValidation.reason || "invalid"}`, stdoutWindow.truncated),
            },
          });
          continue;
        }
        let re: RegExp;
        try {
          re = new RegExp(pattern, flags);
        } catch (e: any) {
          results.push({
            type,
            ok: false,
            detail: `stdout_regex ng: regex compile error: ${String(e?.message || e)}`,
            details: {
              kind: "stdout_regex",
              target: "stdout",
              expected: { pattern, flags },
              actual_sample: sampleText(stdout),
              note: withTruncationNote(`regex_compile_error:${String(e?.message || e)}`, stdoutWindow.truncated),
            },
          });
          continue;
        }
        const ok = re.test(stdoutWindow.text);
        const note = withTruncationNote("", stdoutWindow.truncated);
        results.push({
          type,
          ok,
          detail: ok ? `stdout_regex ok: /${pattern}/${flags}` : `stdout_regex ng: /${pattern}/${flags}`,
          ...(ok
            ? {}
            : {
              details: {
                kind: "stdout_regex",
                target: "stdout",
                expected: { pattern, flags },
                actual_sample: sampleText(stdout),
                ...(note ? { note } : {}),
              },
            }),
        });
      } else if (type === "stderr_contains") {
        const value = normalizeValue(item);
        const stderr = String(ctx.stderr || "");
        const ok = value.length > 0 && value.length <= 1024 && stderr.includes(value);
        results.push({
          type,
          ok,
          detail: ok ? `stderr_contains ok: ${value}` : `stderr_contains ng: ${value}`,
          ...(ok
            ? {}
            : { details: { kind: "stderr_contains", target: "stderr", expected: value, actual_sample: sampleText(stderr) } }),
        });
      } else if (type === "stdout_not_contains") {
        const value = normalizeValue(item);
        const stdout = String(ctx.stdout || "");
        const ok = value.length > 0 && value.length <= 1024 && !stdout.includes(value);
        results.push({
          type,
          ok,
          detail: ok ? `stdout_not_contains ok: ${value}` : `stdout_not_contains ng: ${value}`,
          ...(ok
            ? {}
            : { details: { kind: "stdout_not_contains", target: "stdout", expected: value, actual_sample: sampleText(stdout) } }),
        });
      } else if (type === "artifact_exists") {
        const p = String(item.path || "").replaceAll("\\", "/");
        if (!p) {
          results.push({ type, ok: false, detail: "artifact_exists ng: missing path" });
          continue;
        }
        if (path.isAbsolute(p)) {
          results.push({ type, ok: false, detail: `artifact_exists ng: absolute path rejected: ${p}` });
          continue;
        }
        const normalized = path.posix.normalize(p);
        if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../") || normalized.startsWith("/")) {
          results.push({ type, ok: false, detail: `artifact_exists ng: traversal rejected: ${p}` });
          continue;
        }
        if (!runFilesDir) {
          results.push({ type, ok: false, detail: "artifact_exists ng: runFilesDir missing" });
          continue;
        }
        const abs = path.resolve(runFilesDir, normalized);
        const base = path.resolve(runFilesDir);
        const relToBase = path.relative(base, abs);
        const inside = relToBase !== "" && !relToBase.startsWith("..") && !path.isAbsolute(relToBase);
        if (!inside) {
          results.push({ type, ok: false, detail: `artifact_exists ng: outside run files dir: ${p}` });
          continue;
        }
        const listed = artifactFileSet.has(normalized);
        const exists = fs.existsSync(abs);
        const ok = listed && exists;
        const reason = !listed ? "not listed in artifacts.files" : "file missing";
        results.push({ type, ok, detail: ok ? `artifact_exists ok: ${normalized}` : `artifact_exists ng: ${reason}: ${normalized}` });
      } else if (type === "artifact_file_contains") {
        const expected = String(item.contains ?? "");
        const read = readArtifactText(String(item.path || ""));
        const ok = read.ok && expected.length > 0 && read.text.includes(expected);
        const note = read.ok ? read.note : read.note || "read_failed";
        results.push({
          type,
          ok,
          detail: ok ? `artifact_file_contains ok: ${read.normalized}` : `artifact_file_contains ng: ${read.normalized || String(item.path || "")}`,
          ...(ok ? {} : {
            details: {
              target_path: read.normalized || String(item.path || ""),
              check_type: "contains",
              pattern_or_text: expected,
              actual_sample: read.sample || "",
              ...(note ? { note } : {}),
            },
          }),
        });
      } else if (type === "artifact_file_not_contains") {
        const expected = String(item.not_contains ?? "");
        const read = readArtifactText(String(item.path || ""));
        const ok = read.ok && expected.length > 0 && !read.text.includes(expected);
        const note = read.ok ? read.note : read.note || "read_failed";
        results.push({
          type,
          ok,
          detail: ok ? `artifact_file_not_contains ok: ${read.normalized}` : `artifact_file_not_contains ng: ${read.normalized || String(item.path || "")}`,
          ...(ok ? {} : {
            details: {
              target_path: read.normalized || String(item.path || ""),
              check_type: "not_contains",
              pattern_or_text: expected,
              actual_sample: read.sample || "",
              ...(note ? { note } : {}),
            },
          }),
        });
      } else if (type === "artifact_file_regex" || type === "artifact_file_not_regex") {
        const pattern = String(item.pattern || "");
        const flags = String(item.flags || "");
        const checkType = type === "artifact_file_regex" ? "regex" : "not_regex";
        const read = readArtifactText(String(item.path || ""));
        const noteBase = read.ok ? read.note : read.note || "read_failed";
        if (!read.ok) {
          results.push({
            type,
            ok: false,
            detail: `${type} ng: ${read.normalized || String(item.path || "")}`,
            details: {
              target_path: read.normalized || String(item.path || ""),
              check_type: checkType,
              pattern_or_text: pattern,
              flags,
              actual_sample: read.sample || "",
              ...(noteBase ? { note: noteBase } : {}),
            },
          });
          continue;
        }
        const flagsValidation = validateRegexFlags(flags);
        if (!flagsValidation.ok) {
          results.push({
            type,
            ok: false,
            detail: `${type} ng: invalid flags ${flags}`,
            details: {
              target_path: read.normalized,
              check_type: checkType,
              pattern_or_text: pattern,
              flags,
              actual_sample: read.sample,
              note: withTruncationNote(`regex_flags_error:${flagsValidation.reason || "invalid"}`, read.truncated),
            },
          });
          continue;
        }
        let re: RegExp;
        try {
          re = new RegExp(pattern, flags);
        } catch (e: any) {
          results.push({
            type,
            ok: false,
            detail: `${type} ng: regex compile error`,
            details: {
              target_path: read.normalized,
              check_type: checkType,
              pattern_or_text: pattern,
              flags,
              actual_sample: read.sample,
              note: withTruncationNote(`regex_compile_error:${String(e?.message || e)}`, read.truncated),
            },
          });
          continue;
        }
        const matched = re.test(read.text);
        const ok = type === "artifact_file_regex" ? matched : !matched;
        const note = withTruncationNote("", read.truncated);
        results.push({
          type,
          ok,
          detail: ok ? `${type} ok: ${read.normalized}` : `${type} ng: ${read.normalized}`,
          ...(ok ? {} : {
            details: {
              target_path: read.normalized,
              check_type: checkType,
              pattern_or_text: pattern,
              flags,
              actual_sample: read.sample,
              ...(note ? { note } : {}),
            },
          }),
        });
      } else if (
        type === "artifact_json_pointer_equals" ||
        type === "artifact_json_pointer_regex" ||
        type === "artifact_json_pointer_exists" ||
        type === "artifact_json_pointer_not_exists" ||
        type === "artifact_json_pointer_gt" ||
        type === "artifact_json_pointer_gte" ||
        type === "artifact_json_pointer_lt" ||
        type === "artifact_json_pointer_lte"
      ) {
        const pointer = String(item.pointer ?? "");
        const checkType = type;
        const normalizedCheckType = checkType.replace("artifact_", "");
        const jsonRead = readArtifactJson(String(item.path || ""));
        const isNumericCompare =
          type === "artifact_json_pointer_gt" ||
          type === "artifact_json_pointer_gte" ||
          type === "artifact_json_pointer_lt" ||
          type === "artifact_json_pointer_lte";
        if (!jsonRead.ok || jsonRead.parsed === undefined) {
          results.push({
            type,
            ok: false,
            detail: `${type} ng: ${jsonRead.normalized || String(item.path || "")}`,
            details: {
              target_path: jsonRead.normalized || String(item.path || ""),
              check_type: isNumericCompare ? normalizedCheckType : checkType,
              pointer,
              ...(isNumericCompare
                ? { expected_value: Number(item.value) }
                : { expected: item.equals ?? item.pattern ?? "" }),
              flags: String(item.flags || ""),
              actual_value_type: "undefined",
              actual_value_sample: jsonRead.sample || "",
              note: jsonRead.note || "json_read_failed",
            },
          });
          continue;
        }

        const resolved = resolveJsonPointer(jsonRead.parsed, pointer);
        const expected = item.equals;
        const pattern = String(item.pattern || "");
        const flags = String(item.flags || "");
        const expectedValue = Number(item.value);

        if (type === "artifact_json_pointer_exists") {
          const ok = resolved.found;
          results.push({
            type,
            ok,
            detail: ok ? `${type} ok: ${jsonRead.normalized}#${pointer}` : `${type} ng: ${jsonRead.normalized}#${pointer}`,
            ...(ok ? {} : {
              details: {
                target_path: jsonRead.normalized,
                check_type: checkType,
                pointer,
                expected: "exists",
                actual_value_type: "undefined",
                actual_value_sample: "",
                note: resolved.note || "pointer_not_found",
              },
            }),
          });
          continue;
        }
        if (type === "artifact_json_pointer_not_exists") {
          const ok = !resolved.found;
          results.push({
            type,
            ok,
            detail: ok ? `${type} ok: ${jsonRead.normalized}#${pointer}` : `${type} ng: ${jsonRead.normalized}#${pointer}`,
            ...(ok ? {} : {
              details: {
                target_path: jsonRead.normalized,
                check_type: checkType,
                pointer,
                expected: "not_exists",
                actual_value_type: jsonPointerTypeName(resolved.value),
                actual_value_sample: sampleJsonValue(resolved.value).sample,
                note: "pointer_found",
              },
            }),
          });
          continue;
        }

        if (!resolved.found) {
          results.push({
            type,
            ok: false,
            detail: `${type} ng: ${jsonRead.normalized}#${pointer}`,
            details: {
              target_path: jsonRead.normalized,
              check_type: isNumericCompare ? normalizedCheckType : checkType,
              pointer,
              ...(isNumericCompare
                ? { expected_value: expectedValue }
                : { expected: type === "artifact_json_pointer_equals" ? expected : pattern }),
              flags: type === "artifact_json_pointer_regex" ? flags : "",
              actual_value_type: "undefined",
              actual_value_sample: "",
              note: resolved.note || "pointer_not_found",
            },
          });
          continue;
        }

        if (type === "artifact_json_pointer_equals") {
          const ok = JSON.stringify(resolved.value) === JSON.stringify(expected);
          const valueSample = sampleJsonValue(resolved.value);
          const note = valueSample.truncated ? "actual_value_truncated" : "";
          results.push({
            type,
            ok,
            detail: ok ? `${type} ok: ${jsonRead.normalized}#${pointer}` : `${type} ng: ${jsonRead.normalized}#${pointer}`,
            ...(ok ? {} : {
              details: {
                target_path: jsonRead.normalized,
                check_type: checkType,
                pointer,
                expected,
                actual_value_type: jsonPointerTypeName(resolved.value),
                actual_value_sample: valueSample.sample,
                ...(note ? { note } : {}),
              },
            }),
          });
          continue;
        }
        if (
          type === "artifact_json_pointer_gt" ||
          type === "artifact_json_pointer_gte" ||
          type === "artifact_json_pointer_lt" ||
          type === "artifact_json_pointer_lte"
        ) {
          const valueSample = sampleJsonValue(resolved.value);
          const note = valueSample.truncated ? "actual_value_truncated" : "";
          if (typeof resolved.value !== "number" || !Number.isFinite(resolved.value)) {
            results.push({
              type,
              ok: false,
              detail: `${type} ng: value not number`,
              details: {
                target_path: jsonRead.normalized,
                check_type: normalizedCheckType,
                pointer,
                expected_value: expectedValue,
                actual_value_type: jsonPointerTypeName(resolved.value),
                actual_value_sample: valueSample.sample,
                note: note ? `non_number;${note}` : "non_number",
              },
            });
            continue;
          }
          const actual = resolved.value;
          const ok = type === "artifact_json_pointer_gt"
            ? actual > expectedValue
            : type === "artifact_json_pointer_gte"
              ? actual >= expectedValue
              : type === "artifact_json_pointer_lt"
                ? actual < expectedValue
                : actual <= expectedValue;
          results.push({
            type,
            ok,
            detail: ok ? `${type} ok: ${jsonRead.normalized}#${pointer}` : `${type} ng: ${jsonRead.normalized}#${pointer}`,
            ...(ok ? {} : {
              details: {
                target_path: jsonRead.normalized,
                check_type: normalizedCheckType,
                pointer,
                expected_value: expectedValue,
                actual_value_type: "number",
                actual_value_sample: valueSample.sample,
                ...(note ? { note } : {}),
              },
            }),
          });
          continue;
        }

        const flagsValidation = validateRegexFlags(flags);
        if (!flagsValidation.ok) {
          results.push({
            type,
            ok: false,
            detail: `${type} ng: invalid flags ${flags}`,
            details: {
              target_path: jsonRead.normalized,
              check_type: checkType,
              pointer,
              expected: pattern,
              flags,
              actual_value_type: jsonPointerTypeName(resolved.value),
              actual_value_sample: sampleJsonValue(resolved.value).sample,
              note: `regex_flags_error:${flagsValidation.reason || "invalid"}`,
            },
          });
          continue;
        }
        if (typeof resolved.value !== "string") {
          results.push({
            type,
            ok: false,
            detail: `${type} ng: value not string`,
            details: {
              target_path: jsonRead.normalized,
              check_type: checkType,
              pointer,
              expected: pattern,
              flags,
              actual_value_type: jsonPointerTypeName(resolved.value),
              actual_value_sample: sampleJsonValue(resolved.value).sample,
              note: "value_not_string",
            },
          });
          continue;
        }
        let re: RegExp;
        try {
          re = new RegExp(pattern, flags);
        } catch (e: any) {
          results.push({
            type,
            ok: false,
            detail: `${type} ng: regex compile error`,
            details: {
              target_path: jsonRead.normalized,
              check_type: checkType,
              pointer,
              expected: pattern,
              flags,
              actual_value_type: "string",
              actual_value_sample: sampleJsonValue(resolved.value).sample,
              note: `regex_compile_error:${String(e?.message || e)}`,
            },
          });
          continue;
        }
        const ok = re.test(resolved.value);
        results.push({
          type,
          ok,
          detail: ok ? `${type} ok: ${jsonRead.normalized}#${pointer}` : `${type} ng: ${jsonRead.normalized}#${pointer}`,
          ...(ok ? {} : {
            details: {
              target_path: jsonRead.normalized,
              check_type: checkType,
              pointer,
              expected: pattern,
              flags,
              actual_value_type: "string",
              actual_value_sample: sampleJsonValue(resolved.value).sample,
            },
          }),
        });
      } else if (type === "artifact_zip_entry_exists" || type === "artifact_zip_entry_not_exists" || type === "artifact_zip_entry_regex" || type === "artifact_zip_entry_not_regex") {
        const zipPath = String(item.zip_path || "");
        const zipRead = readArtifactZipEntries(zipPath);
        const checkType = type === "artifact_zip_entry_exists"
          ? "zip_entry_exists"
          : type === "artifact_zip_entry_not_exists"
            ? "zip_entry_not_exists"
            : type === "artifact_zip_entry_regex"
              ? "zip_entry_regex"
              : "zip_entry_not_regex";
        const baseDetails: Record<string, any> = {
          target_zip_path: zipRead.normalized || zipPath,
          check_type: checkType,
          entries_sample: zipRead.entriesSample,
          ...(zipRead.totalEntries !== undefined ? { total_entries: zipRead.totalEntries } : {}),
          ...(zipRead.note ? { note: zipRead.note } : {}),
        };
        if (!zipRead.ok) {
          results.push({
            type,
            ok: false,
            detail: `${type} ng: ${zipRead.normalized || zipPath || "<missing>"}`,
            details: {
              ...baseDetails,
              ...(zipRead.error ? { zip_open_error: zipRead.error } : {}),
            },
          });
          continue;
        }

        if (type === "artifact_zip_entry_exists" || type === "artifact_zip_entry_not_exists") {
          const entry = String(item.entry || "");
          const exists = zipRead.entrySet.has(entry);
          const ok = type === "artifact_zip_entry_exists" ? exists : !exists;
          results.push({
            type,
            ok,
            detail: ok
              ? `${type} ok: ${zipRead.normalized}`
              : `${type} ng: ${zipRead.normalized}`,
            ...(ok ? {} : {
              details: {
                ...baseDetails,
                entry,
                note: joinNotes(
                  zipRead.note,
                  type === "artifact_zip_entry_exists" ? "entry_not_found" : "entry_found"
                ),
              },
            }),
          });
          continue;
        }

        const pattern = String(item.pattern || "");
        const flags = String(item.flags || "");
        const flagsValidation = validateRegexFlags(flags);
        if (!flagsValidation.ok) {
          results.push({
            type,
            ok: false,
            detail: `${type} ng: invalid flags ${flags}`,
            details: {
              ...baseDetails,
              pattern,
              flags,
              note: joinNotes(zipRead.note, `regex_flags_error:${flagsValidation.reason || "invalid"}`),
            },
          });
          continue;
        }

        let re: RegExp;
        try {
          re = new RegExp(pattern, flags);
        } catch (e: any) {
          results.push({
            type,
            ok: false,
            detail: `${type} ng: regex compile error`,
            details: {
              ...baseDetails,
              pattern,
              flags,
              compile_error: String(e?.message || e),
              note: joinNotes(zipRead.note, "regex_compile_error"),
            },
          });
          continue;
        }
        const matched = zipRead.entries.some((entry) => re.test(entry));
        const ok = type === "artifact_zip_entry_regex" ? matched : !matched;
        results.push({
          type,
          ok,
          detail: ok
            ? `${type} ok: ${zipRead.normalized}`
            : `${type} ng: ${zipRead.normalized}`,
          ...(ok ? {} : {
            details: {
              ...baseDetails,
              pattern,
              flags,
              note: joinNotes(
                zipRead.note,
                type === "artifact_zip_entry_regex" ? "regex_not_matched" : "regex_matched"
              ),
            },
          }),
        });
      } else if (type === "stderr_not_contains") {
        const value = normalizeValue(item);
        const stderr = String(ctx.stderr || "");
        const ok = value.length > 0 && value.length <= 1024 && !stderr.includes(value);
        results.push({
          type,
          ok,
          detail: ok ? `stderr_not_contains ok: ${value}` : `stderr_not_contains ng: ${value}`,
          ...(ok
            ? {}
            : { details: { kind: "stderr_not_contains", target: "stderr", expected: value, actual_sample: sampleText(stderr) } }),
        });
      } else if (type === "file_recent") {
        const pathRaw = withPlaceholders(String(item.path || ""));
        const filePath = resolveTaskPath(task, pathRaw);
        const minutes = Number(item.minutes);
        let ok = false;
        if (fs.existsSync(filePath) && Number.isFinite(minutes) && minutes >= 0) {
          const stat = fs.statSync(filePath);
          ok = (Date.now() - stat.mtimeMs) <= minutes * 60 * 1000;
        }
        results.push({ type, ok, detail: ok ? `file_recent ok: ${filePath}` : `file_recent ng: ${filePath}` });
      } else if (type === "json_path_exists") {
        const pathRaw = withPlaceholders(String(item.path || ""));
        const filePath = resolveTaskPath(task, pathRaw);
        const jsonPath = String(item.json_path || "");
        let ok = false;
        if (fs.existsSync(filePath)) {
          const obj = JSON.parse(fs.readFileSync(filePath, "utf8"));
          ok = getJsonPathValue(obj, jsonPath) !== undefined;
        }
        results.push({ type, ok, detail: ok ? `json_path_exists ok: ${jsonPath}` : `json_path_exists ng: ${jsonPath}` });
      } else {
        results.push({ type: type || "unknown", ok: false, detail: `unsupported acceptance type: ${type}` });
      }
    } catch (e: any) {
      results.push({ type: type || "unknown", ok: false, detail: `${type} error: ${String(e?.message || e)}` });
    }
  }

  return { ok: results.every((r) => r.ok), results };
}

function templateArgs(args: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (typeof v === "string") {
      if (path.isAbsolute(v) || /run_\d{4}-\d{2}-\d{2}/.test(v) || /\d{4}-\d{2}-\d{2}T/.test(v)) out[k] = `<${k}>`;
      else out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function readHistory(): HistoryEntry[] {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  const lines = fs.readFileSync(HISTORY_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  const items: HistoryEntry[] = [];
  for (const line of lines) {
    try {
      items.push(JSON.parse(line));
    } catch {
      // ignore invalid history line
    }
  }
  return items;
}

function appendHistory(entry: HistoryEntry): void {
  fs.appendFileSync(HISTORY_PATH, JSON.stringify(entry) + os.EOL, "utf8");
}

function pushHistoryCache(historyCache: HistoryEntry[], entry: HistoryEntry): void {
  historyCache.push(entry);
  if (historyCache.length > HISTORY_CACHE_MAX) {
    historyCache.splice(0, historyCache.length - HISTORY_CACHE_MAX);
  }
}

function maybeEmitSkillProposal(task: Task, history: HistoryEntry[]): void {
  const recent = history.slice(-50);
  if (!recent.length) return;

  const command = taskCommandLabel(task);
  const category = task.metadata.category || "";
  const acceptanceTypes = taskAcceptanceList(task).map((a: any) => String(a?.type || ""));
  const signature = `${command}|${acceptanceTypes.slice().sort().join(",")}`;
  const targetKey = command === "create_file"
    ? String(task.spec?.args?.target || "")
    : command === "apply_patch"
      ? String(task.spec?.args?.patch_path || "")
      : "";

  const c1 = recent.filter((h) => h.command === command && h.category === category).length;
  const c2 = recent.filter((h) => `${h.command}|${(h.acceptance_types || []).slice().sort().join(",")}` === signature).length;
  const c3 = targetKey ? recent.filter((h) => h.target_key === targetKey).length : 0;

  let pattern = "";
  let occ = 0;
  if (c1 >= 3) {
    pattern = `${command} + ${category} が ${c1} 回発生`;
    occ = c1;
  } else if (c2 >= 2) {
    pattern = `${command} + acceptance(${acceptanceTypes.join(",") || "none"}) が ${c2} 回発生`;
    occ = c2;
  } else if (c3 >= 2) {
    pattern = `${targetKey} が ${c3} 回発生`;
    occ = c3;
  }

  if (!pattern) return;

  const key = proposalKey(task);
  const index = readProposalIndex();
  if (shouldSuppressProposal(key, index)) return;

  const propId = `skillprop_${crypto.randomBytes(4).toString("hex")}`;
  const skillId = `${command}_${crypto.randomBytes(2).toString("hex")}`;
  const proposal = {
    apiVersion: "v1",
    kind: "SkillProposal",
    metadata: {
      id: propId,
      created_at: nowIsoJst(),
      status: "proposed",
    },
    proposal: {
      skill_id: skillId,
      title: `${command} ワークフローのSkill提案`,
      context: {
        category: task.metadata.category || "",
        persona: task.metadata.persona || "",
      },
      rationale: {
        pattern_detected: pattern,
        occurrences: occ,
        expected_benefit: "手順の再利用と品質安定",
        overlap_check: "未確認（重複チェック未実装）",
        value_judgement: "提案: 繰り返し頻度が高い",
      },
      generalized_steps: [
        {
          command,
          args: templateArgs(task.spec.args || {}),
          acceptance: Array.isArray(task.spec.acceptance) ? task.spec.acceptance : [],
        },
      ],
    },
  };

  writeYamlFile(path.join(DIRS.events, `${propId}.yaml`), proposal);
  upsertProposalIndexOnCreate(key, propId, skillId);
}

function findProposalById(proposalId: string): { filePath: string; proposal: any } | null {
  const directPath = path.join(DIRS.events, `${proposalId}.yaml`);
  if (fs.existsSync(directPath)) return { filePath: directPath, proposal: readYamlFile<any>(directPath) };

  const files = fs.readdirSync(DIRS.events)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => path.join(DIRS.events, f));

  for (const f of files) {
    try {
      const obj = readYamlFile<any>(f);
      if (obj?.kind === "SkillProposal" && obj?.metadata?.id === proposalId) {
        return { filePath: f, proposal: obj };
      }
    } catch {
      // ignore invalid yaml
    }
  }
  return null;
}

function buildPromptMd(category: string, personaId: string): string {
  const preset = loadPersonaPreset(personaId, category);
  const lines: string[] = [];
  lines.push("# Skill Prompt");
  lines.push("");
  lines.push(`Category: ${category || "(unknown)"}`);
  lines.push(`Persona: ${preset.displayName || personaId || "(unknown)"}`);
  lines.push("");
  lines.push("## Checklist");
  if (preset.checklist.length) {
    for (const c of preset.checklist) lines.push(`- ${c}`);
  } else {
    lines.push("- (none)");
  }
  lines.push("");
  lines.push("## Output Contract");
  if (preset.outputContract.length) {
    for (const c of preset.outputContract) lines.push(`- ${c}`);
  } else {
    lines.push("- (none)");
  }
  lines.push("");
  return lines.join("\n");
}

function processOneApproval(): void {
  const files = fs.readdirSync(DIRS.approvals)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();

  if (!files.length) return;

  const approvalFile = files[0];
  const approvalPath = path.join(DIRS.approvals, approvalFile);

  try {
    const accept = readYamlFile<any>(approvalPath);
    if (accept?.apiVersion !== "v1" || accept?.kind !== "SkillAccept") {
      throw new Error("invalid SkillAccept payload");
    }

    const proposalId = String(accept?.spec?.proposal_id || "");
    if (!proposalId) throw new Error("spec.proposal_id missing");

    const found = findProposalById(proposalId);
    if (!found) throw new Error(`proposal not found: ${proposalId}`);

    const proposal = found.proposal;
    const skillIdRaw = String(proposal?.proposal?.skill_id || "");
    if (!skillIdRaw) throw new Error("proposal.skill_id missing");

    const skillDirName = skillIdRaw.replace(/^skills[\\/]/, "");
    const skillDir = path.join(DIRS.skills, skillDirName);
    const examplesDir = path.join(skillDir, "examples");
    fs.mkdirSync(examplesDir, { recursive: true });

    const category = String(proposal?.proposal?.context?.category || "");
    const persona = String(proposal?.proposal?.context?.persona || "");

    const skillJson = {
      title: String(proposal?.proposal?.title || skillDirName),
      tags: [
        String(proposal?.proposal?.generalized_steps?.[0]?.command || ""),
        category,
        persona,
      ].filter(Boolean),
      created_at: nowIsoJst(),
      source_proposal_id: proposalId,
    };

    fs.writeFileSync(path.join(skillDir, "skill.json"), JSON.stringify(skillJson, null, 2), "utf8");
    writeYamlFile(path.join(skillDir, "steps.yaml"), {
      generalized_steps: Array.isArray(proposal?.proposal?.generalized_steps) ? proposal.proposal.generalized_steps : [],
    });
    fs.writeFileSync(path.join(skillDir, "prompt.md"), buildPromptMd(category, persona), "utf8");
    fs.copyFileSync(found.filePath, path.join(examplesDir, `${proposalId}.yaml`));

    proposal.metadata = proposal.metadata || {};
    proposal.metadata.status = "accepted";
    proposal.decision = {
      decided_at: nowIsoJst(),
      decided_by: ASSIGNEE_ID,
      comment: `accepted by ${ASSIGNEE_ID}`,
    };

    writeYamlFile(path.join(DIRS.events, `${proposalId}_accepted.yaml`), proposal);
    upsertProposalIndexOnAccept(proposalId);

    atomicMove(approvalPath, path.join(DIRS.done, approvalFile));
    appendDashboard(`- [OK] ${approvalFile} / accepted ${proposalId} -> skills/${skillDirName}`);
  } catch (e: any) {
    appendDashboard(`- [NG] ${approvalFile} / ${String(e?.message || e)}`);
    try {
      atomicMove(approvalPath, path.join(DIRS.failed, approvalFile));
    } catch {
      // ignore move failure
    }
  }
}

async function commandCreateFile(task: Task): Promise<{ files: string[]; targetPath: string; repoPath: string }> {
  const repo = task.spec.context?.repo_path;
  if (!repo) throw new Error("context.repo_path is required");
  const target = String(task.spec.args.target || "");
  const content = String(task.spec.args.content ?? "");
  if (!target) throw new Error("args.target is required");

  const outPath = path.isAbsolute(target) ? target : path.join(repo, target);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, "utf8");
  return { files: [outPath], targetPath: outPath, repoPath: repo };
}

async function commandApplyPatch(task: Task): Promise<{ diffPath: string; repoPath: string; exitCode: number; stdout: string; stderr: string }> {
  const repo = task.spec.context?.repo_path;
  if (!repo) throw new Error("context.repo_path is required");
  const patchPathRaw = String(task.spec.args.patch_path || "");
  if (!patchPathRaw) throw new Error("args.patch_path is required");

  const patchPath = path.isAbsolute(patchPathRaw) ? patchPathRaw : path.join(ROOT, patchPathRaw);
  if (!fs.existsSync(patchPath)) throw new Error(`patch not found: ${patchPath}`);

  const res = await execa("git", ["apply", patchPath], { cwd: repo, reject: false });
  if (res.exitCode !== 0) throw new Error(`git apply failed (exit=${res.exitCode}): ${res.stderr || res.stdout}`);

  return { diffPath: patchPath, repoPath: repo, exitCode: res.exitCode ?? 0, stdout: res.stdout, stderr: res.stderr };
}

async function commandRunCommand(task: Task): Promise<CommandRunResult> {
  const repo = task.spec.context?.repo_path;
  if (!repo) throw new Error("context.repo_path is required");
  const cmd = String(task.spec.args.command || "");
  if (!cmd) throw new Error("args.command is required");
  const timeoutMs = getRunCommandTimeoutMs(task);

  try {
    const res = await execaCommand(cmd, {
      cwd: repo,
      reject: false,
      timeout: timeoutMs,
      stdio: "pipe",
      shell: false,
      forceKillAfterDelay: 2000,
      cleanup: true,
    });
    if ((res as any).failed) {
      const failedRes: any = res;
      const timedOut = Boolean(failedRes?.timedOut);
      return {
        command: cmd,
        cwd: repo,
        exitCode: Number.isFinite(failedRes?.exitCode) ? failedRes.exitCode : (timedOut ? 124 : 1),
        stdout: String(failedRes?.stdout || ""),
        stderr: String(failedRes?.stderr || failedRes?.shortMessage || failedRes?.originalMessage || ""),
        timedOut,
        timeoutMs,
      };
    }
    return {
      command: cmd,
      cwd: repo,
      exitCode: res.exitCode ?? 0,
      stdout: res.stdout || "",
      stderr: res.stderr || "",
      timedOut: false,
      timeoutMs,
    };
  } catch (e: any) {
    const timedOut = Boolean(e?.timedOut);
    if (!timedOut) throw e;
    return {
      command: cmd,
      cwd: repo,
      exitCode: -1,
      stdout: String(e?.stdout || ""),
      stderr: String(e?.stderr || ""),
      timedOut: true,
      timeoutMs,
    };
  }
}

function toCommandString(raw: any): string {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => String(x ?? ""))
      .map((x) => (/\s|"/.test(x) ? `"${x.replaceAll('"', '\\"')}"` : x))
      .join(" ")
      .trim();
  }
  return String(raw || "").trim();
}

function sampleWithNote(text: string, maxLen: number): { sample: string; truncated: boolean } {
  const src = String(text || "");
  if (src.length <= maxLen) return { sample: src, truncated: false };
  return { sample: src.slice(0, maxLen), truncated: true };
}

async function waitExecResult(runId: string, timeoutMs: number): Promise<any> {
  const timeout = Math.max(1000, Math.min(timeoutMs, MAX_RUN_COMMAND_TIMEOUT_MS));
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const resultPath = resolveExecResultPath(runId);
    if (resultPath && fs.existsSync(resultPath)) {
      const raw = JSON.parse(fs.readFileSync(resultPath, "utf8"));
      try { fs.unlinkSync(resultPath); } catch {}
      return raw;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    exitCode: 124,
    timedOut: true,
    stdout: "",
    stderr: "pipeline step timeout while waiting executor result",
    error_code: "ERR_TIMEOUT",
    reason_key: "STEP_TIMEOUT",
  };
}

async function runPipelineTask(task: Task, runId: string): Promise<PipelineExecutionResult> {
  const steps = Array.isArray(task.steps) ? task.steps : [];
  const startedMs = Date.now();
  const pipelineTimeout = boundedTimeoutMs(task.runtime?.timeout_ms, DEFAULT_RUN_COMMAND_TIMEOUT_MS);
  const stepsSummary: PipelineStepSummary[] = [];
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  let failedStepId = "";
  let failedStepIndex = -1;
  let failedCode = "";
  let failedReason = "";
  let failedNote = "";
  let failedToolExitCode = 0;

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i] || {};
    const stepTask = step.task || {};
    const stepId = String(step.id || `step_${i + 1}`);
    const stepKind = String(stepTask.kind || "");
    const elapsed = Date.now() - startedMs;
    const remaining = Math.max(1, pipelineTimeout - elapsed);
    const stepTimeout = boundedTimeoutMs(stepTask.runtime?.timeout_ms, remaining);

    if (remaining <= 0) {
      failedStepId = stepId;
      failedStepIndex = i;
      failedCode = "ERR_TIMEOUT";
      failedReason = "PIPELINE_TIMEOUT";
      failedNote = "pipeline_timeout";
      stepsSummary.push({ step_id: stepId, step_index: i, status: "failed", error_code: failedCode, run_id: runId });
      break;
    }

    if (stepKind === "patch_apply") {
      const patchFormat = String(stepTask.patch?.format || "").toLowerCase();
      const patchText = String(stepTask.patch?.text || "").replaceAll("__PIPELINE_RUN_ID__", runId);
      const reqRunId = `${runId}_step${i + 1}`;
      writeExecRequest(reqRunId, {
        mode: "patch_apply",
        run_id: reqRunId,
        task_id: task.metadata.id,
        cwd: DIRS.workspace,
        timeout_ms: stepTimeout,
        patch_format: patchFormat,
        patch_text: patchText,
        workspace_root: DIRS.workspace,
      });
      const raw = await waitExecResult(reqRunId, stepTimeout);
      const exitCode = Number.isFinite(Number(raw?.exitCode)) ? Number(raw.exitCode) : 1;
      const stdout = String(raw?.stdout || "");
      const stderr = String(raw?.stderr || "");
      stdoutChunks.push(stdout);
      stderrChunks.push(stderr);
      if (exitCode !== 0) {
        failedStepId = stepId;
        failedStepIndex = i;
        failedCode = String(raw?.error_code || "ERR_EXEC");
        failedReason = String(raw?.reason_key || "PATCH_APPLY_FAILED");
        failedNote = String(raw?.note || "");
        failedToolExitCode = Number.isFinite(Number(raw?.tool_exit_code)) ? Number(raw.tool_exit_code) : exitCode;
        stepsSummary.push({ step_id: stepId, step_index: i, status: "failed", error_code: failedCode, run_id: reqRunId });
        break;
      }
      stepsSummary.push({ step_id: stepId, step_index: i, status: "success", error_code: "", run_id: reqRunId });
      continue;
    }

    if (stepKind === "file_write") {
      const reqRunId = `${runId}_step${i + 1}`;
      const rawFiles = Array.isArray(stepTask.files) ? stepTask.files : [];
      const files = rawFiles.map((row: any) => ({
        path: String(row?.path || "").replaceAll("__PIPELINE_RUN_ID__", runId),
        text: String(row?.text ?? "").replaceAll("__PIPELINE_RUN_ID__", runId),
        mode: String(row?.mode || "overwrite").toLowerCase() === "append" ? "append" : "overwrite",
      }));
      writeExecRequest(reqRunId, {
        mode: "file_write",
        run_id: reqRunId,
        task_id: task.metadata.id,
        cwd: DIRS.workspace,
        timeout_ms: stepTimeout,
        files,
        workspace_root: DIRS.workspace,
        run_files_dir: path.join(DIRS.runs, runId, "files"),
      });
      const raw = await waitExecResult(reqRunId, stepTimeout + 5000);
      const exitCode = Number.isFinite(Number(raw?.exitCode)) ? Number(raw.exitCode) : 1;
      const stdout = String(raw?.stdout || "");
      const stderr = String(raw?.stderr || "");
      stdoutChunks.push(stdout);
      stderrChunks.push(stderr);
      if (exitCode !== 0) {
        failedStepId = stepId;
        failedStepIndex = i;
        failedCode = String(raw?.error_code || "ERR_EXEC");
        failedReason = String(raw?.reason_key || "FILE_WRITE_FAILED");
        failedNote = String(raw?.note || "");
        failedToolExitCode = Number.isFinite(Number(raw?.tool_exit_code)) ? Number(raw.tool_exit_code) : exitCode;
        stepsSummary.push({ step_id: stepId, step_index: i, status: "failed", error_code: failedCode, run_id: reqRunId });
        break;
      }
      stepsSummary.push({ step_id: stepId, step_index: i, status: "success", error_code: "", run_id: reqRunId });
      continue;
    }

    if (stepKind === "archive_zip") {
      const reqRunId = `${runId}_step${i + 1}`;
      const rawInputs = Array.isArray(stepTask.inputs) ? stepTask.inputs : [];
      const inputs = rawInputs.map((x: any) => String(x || "").replaceAll("__PIPELINE_RUN_ID__", runId));
      const output = {
        zip_path: String(stepTask.output?.zip_path || "").replaceAll("__PIPELINE_RUN_ID__", runId),
        manifest_path: String(stepTask.output?.manifest_path || "").replaceAll("__PIPELINE_RUN_ID__", runId),
      };
      const options = {
        follow_symlinks: Boolean(stepTask.options?.follow_symlinks),
      };
      const limits = {
        max_files: Number(stepTask.limits?.max_files ?? ARCHIVE_ZIP_DEFAULT_MAX_FILES),
        max_total_bytes: Number(stepTask.limits?.max_total_bytes ?? ARCHIVE_ZIP_DEFAULT_MAX_TOTAL_BYTES),
      };
      writeExecRequest(reqRunId, {
        mode: "archive_zip",
        run_id: reqRunId,
        task_id: task.metadata.id,
        cwd: DIRS.workspace,
        timeout_ms: stepTimeout,
        inputs,
        output,
        options,
        limits,
        workspace_root: DIRS.workspace,
        run_files_dir: path.join(DIRS.runs, runId, "files"),
      });
      const raw = await waitExecResult(reqRunId, stepTimeout + 5000);
      const exitCode = Number.isFinite(Number(raw?.exitCode)) ? Number(raw.exitCode) : 1;
      const stdout = String(raw?.stdout || "");
      const stderr = String(raw?.stderr || "");
      stdoutChunks.push(stdout);
      stderrChunks.push(stderr);
      if (exitCode !== 0) {
        failedStepId = stepId;
        failedStepIndex = i;
        failedCode = String(raw?.error_code || "ERR_EXEC");
        failedReason = String(raw?.reason_key || "ARCHIVE_ZIP_FAILED");
        failedNote = String(raw?.note || "");
        failedToolExitCode = Number.isFinite(Number(raw?.tool_exit_code)) ? Number(raw.tool_exit_code) : exitCode;
        stepsSummary.push({ step_id: stepId, step_index: i, status: "failed", error_code: failedCode, run_id: reqRunId });
        break;
      }
      stepsSummary.push({ step_id: stepId, step_index: i, status: "success", error_code: "", run_id: reqRunId });
      continue;
    }

    if (stepKind === "run_command") {
      const cmd = toCommandString(stepTask.args?.command ?? (stepTask as any).command)
        .replaceAll("__PIPELINE_RUN_ID__", runId)
        .replaceAll("__WORKSPACE_ROOT__", DIRS.workspace.replaceAll("\\", "/"));
      const repoPath = String(stepTask.context?.repo_path || task.spec.context?.repo_path || ROOT);
      const reqRunId = `${runId}_step${i + 1}`;
      writeExecRequest(reqRunId, {
        run_id: reqRunId,
        task_id: task.metadata.id,
        mode: "command",
        command: cmd,
        cwd: repoPath,
        timeout_ms: stepTimeout,
      });
      const raw = await waitExecResult(reqRunId, stepTimeout + 5000);
      const exitCode = Number.isFinite(Number(raw?.exitCode)) ? Number(raw.exitCode) : 1;
      const timedOut = Boolean(raw?.timedOut) || exitCode === 124;
      const stdout = String(raw?.stdout || "");
      const stderr = String(raw?.stderr || "");
      stdoutChunks.push(stdout);
      stderrChunks.push(stderr);
      if (timedOut) {
        failedStepId = stepId;
        failedStepIndex = i;
        failedCode = "ERR_TIMEOUT";
        failedReason = "STEP_TIMEOUT";
        failedNote = "pipeline_step_timeout";
        failedToolExitCode = exitCode;
        stepsSummary.push({ step_id: stepId, step_index: i, status: "failed", error_code: failedCode, run_id: reqRunId });
        break;
      }
      if (exitCode !== 0) {
        failedStepId = stepId;
        failedStepIndex = i;
        failedCode = String(raw?.error_code || "ERR_EXEC");
        failedReason = String(raw?.reason_key || "STEP_COMMAND_FAILED");
        failedNote = String(raw?.note || "");
        failedToolExitCode = exitCode;
        stepsSummary.push({ step_id: stepId, step_index: i, status: "failed", error_code: failedCode, run_id: reqRunId });
        break;
      }
      stepsSummary.push({ step_id: stepId, step_index: i, status: "success", error_code: "", run_id: reqRunId });
      continue;
    }

    failedStepId = stepId;
    failedStepIndex = i;
    failedCode = "ERR_TASK";
    failedReason = "STEP_KIND_UNSUPPORTED";
    failedNote = "";
    stepsSummary.push({ step_id: stepId, step_index: i, status: "failed", error_code: failedCode, run_id: runId });
    break;
  }

  const aggregatedStdout = stdoutChunks.join("\n");
  const aggregatedStderr = stderrChunks.join("\n");
  const stdoutSample = sampleWithNote(aggregatedStdout, PIPELINE_SAMPLE_MAX);
  const stderrSample = sampleWithNote(aggregatedStderr, PIPELINE_SAMPLE_MAX);
  const notes: string[] = [];
  if (stdoutSample.truncated) notes.push("stdout_truncated");
  if (stderrSample.truncated) notes.push("stderr_truncated");
  if (failedNote) notes.push(failedNote);

  if (failedStepIndex >= 0) {
    return {
      ok: false,
      errorCode: failedCode || "ERR_EXEC",
      summary: `pipeline failed at step ${failedStepId}(${failedStepIndex}) reason=${failedReason}`,
      stdout: aggregatedStdout,
      stderr: aggregatedStderr,
      stepsSummary,
      failedStepId,
      failedStepIndex,
      note: notes.join(","),
    };
  }

  const acceptanceCarrier: Task = {
    apiVersion: "v1",
    kind: "Task",
    metadata: task.metadata,
    spec: {
      command: "run_command",
      args: {},
      acceptance: Array.isArray(task.acceptance) ? task.acceptance : [],
    },
  };
  const runDir = path.join(DIRS.runs, runId);
  const runFilesDir = path.join(runDir, "files");
  const runFiles = collectRunArtifactFiles(runDir);
  const acceptanceEval = await evaluateAcceptance(acceptanceCarrier, {
    stdout: aggregatedStdout,
    stderr: aggregatedStderr,
    runId,
    artifactsFiles: runFiles,
    runFilesDir,
  });
  if (!acceptanceEval.ok) {
    const ng = acceptanceEval.results.find((x) => !x.ok);
    return {
      ok: false,
      errorCode: "ERR_ACCEPTANCE",
      summary: `pipeline acceptance NG: ${ng?.detail || "unknown"}`,
      stdout: aggregatedStdout,
      stderr: aggregatedStderr,
      stepsSummary,
      failedStepId: "",
      failedStepIndex: -1,
      note: notes.join(","),
    };
  }

  return {
    ok: true,
    errorCode: "",
    summary: `success: pipeline / steps OK(${stepsSummary.length}/${stepsSummary.length})`,
    stdout: aggregatedStdout,
    stderr: aggregatedStderr,
    stepsSummary,
    failedStepId: "",
    failedStepIndex: -1,
    note: notes.join(","),
  };
}

async function runOneTask(taskPath: string, historyCache: HistoryEntry[]): Promise<void> {
  const startedAt = nowIsoJst();
  const startedMs = Date.now();

  let task: Task | null = null;
  let movedPath = taskPath;

  const runId = `run_${new Date().toISOString().replace(/[:.]/g, "-")}_${crypto.randomBytes(3).toString("hex")}`;
  const runDir = path.join(DIRS.runs, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const stdoutPath = path.join(runDir, "stdout.log");
  const stderrPath = path.join(runDir, "stderr.log");

  const writeStdout = (s: string) => fs.appendFileSync(stdoutPath, s + os.EOL, "utf8");
  const writeStderr = (s: string) => fs.appendFileSync(stderrPath, s + os.EOL, "utf8");

  try {
    task = readYamlFile<Task>(taskPath);
    if (task && task.kind === "pipeline" && (!task.spec || typeof task.spec !== "object")) {
      task.spec = {
        command: "pipeline",
        args: {},
        runtime: task.runtime,
        acceptance: task.acceptance,
        artifact: (task as any).artifact,
        context: {},
      };
    }
    const schemaValidation = validateTaskBySchema(task);
    if (!schemaValidation.ok) {
      const msg = `schema validation failed: ${schemaValidation.errors.map((x) => `${x.instancePath || "/"} ${x.message}`).join(" | ")}`;
      const err: any = new Error(msg);
      err.schemaErrors = schemaValidation.errors;
      throw err;
    }
    const v = validateTaskLight(task);
    if (!v.ok) throw new Error(`task validation failed: ${v.reason}`);
    const fileWritePrecheck = validateAndNormalizeFileWriteSpec(task);
    if (!fileWritePrecheck.ok) {
      const err: any = new Error("task validation failed: file_write contract violation");
      err.schemaErrors = fileWritePrecheck.errors;
      throw err;
    }
    const fileWriteFiles = fileWritePrecheck.files || [];
    const archiveZipPrecheck = validateAndNormalizeArchiveZipSpec(task);
    if (!archiveZipPrecheck.ok) {
      const err: any = new Error("task validation failed: archive_zip contract violation");
      err.schemaErrors = archiveZipPrecheck.errors;
      throw err;
    }
    const archiveZipSpec = archiveZipPrecheck.spec;
    const metaInclude = normalizeMetaInclude(task);
    const writeMetaGuarded = (kind: "json" | "yaml", relPath: string, payload: any): void => {
      try {
        if (kind === "json") writeRunMetaJson(runDir, relPath, payload);
        else writeRunMetaYaml(runDir, relPath, payload);
      } catch (e: any) {
        const err: any = new Error(`run meta write failed: ${relPath}: ${String(e?.message || e)}`);
        err.errorCode = "ERR_EXEC";
        err.reasonKey = "RUN_META_WRITE_FAILED";
        err.failedPath = relPath;
        throw err;
      }
    };

    if (task.metadata.assignee !== ASSIGNEE_ID) {
      const finishedAt = nowIsoJst();
      const result: Result = {
        apiVersion: "v1",
        kind: "Result",
        metadata: {
          id: randomId("result"),
          task_id: task.metadata.id,
          assignee: ASSIGNEE_ID,
          started_at: startedAt,
          finished_at: finishedAt,
          status: "skipped",
          run_id: runId,
        },
        outcome: {
          summary: `skipped: assignee mismatch (task=${task.metadata.assignee}, me=${ASSIGNEE_ID})`,
          artifacts: { stdout_path: stdoutPath, stderr_path: stderrPath, files: [] },
          metrics: { duration_ms: Date.now() - startedMs },
          errors: [],
        },
      };
      writeYamlFile(path.join(DIRS.events, `result_${task.metadata.id}_${runId}.yaml`), result);
      appendDashboard(`- [SKIP] ${task.metadata.id} / ${task.metadata.title} / ${result.outcome.summary}`);

      const h: HistoryEntry = {
        timestamp: finishedAt,
        task_id: task.metadata.id,
        command: taskCommandLabel(task),
        category: task.metadata.category || "",
        persona: task.metadata.persona || "",
        repo_path: task.spec?.context?.repo_path || "",
        arg_keys: Object.keys(task.spec?.args || {}),
        acceptance_types: taskAcceptanceList(task).map((a: any) => String(a?.type || "")),
        status: "skipped",
        duration_ms: Date.now() - startedMs,
        target_key: String(taskCommandLabel(task) === "patch_apply" ? "patch_apply" : (taskCommandLabel(task) === "file_write" ? "file_write" : (taskCommandLabel(task) === "archive_zip" ? "archive_zip" : (task.spec?.args?.target || task.spec?.args?.patch_path || task.spec?.args?.command || "")))),
      };
      appendHistory(h);
      pushHistoryCache(historyCache, h);
      maybeEmitSkillProposal(task, historyCache);
      return;
    }

    const runningPath = path.join(DIRS.running, path.basename(taskPath));
    atomicMove(taskPath, runningPath);
    movedPath = runningPath;

    if (metaInclude.has("task_yaml")) {
      writeMetaGuarded("yaml", "_meta/task.yaml", task);
    }

    const topCommand = task.kind === "pipeline" ? "pipeline" : String(task.spec?.command || "");
    writeStdout(`Task: ${task.metadata.id} ${task.metadata.title}`);
    writeStdout(`Command: ${topCommand}`);

    const persona = loadPersonaPreset(task.metadata.persona, task.metadata.category);
    if (persona.displayName) {
      writeStdout(`Persona: ${persona.displayName}`);
      if (persona.checklist.length) writeStdout(`Checklist: ${persona.checklist.join(" / ")}`);
    }

    let diffPath: string | undefined;
    let commandArtifacts: any = {};
    let lastStdout = "";
    let lastStderr = "";
    let runCommandExitCode: number | null = null;
    let runCommandTimedOut = false;
    let runCommandTimeoutMs = 0;

    if (task.kind === "pipeline" || task.spec?.command === "pipeline") {
      if (metaInclude.has("result_final_json")) {
        writeMetaGuarded("json", "_meta/result.json", {
          apiVersion: "v1",
          kind: "Result",
          metadata: {
            task_id: task.metadata.id,
            run_id: runId,
            assignee: ASSIGNEE_ID,
            started_at: startedAt,
            finished_at: nowIsoJst(),
            status: "running",
          },
          outcome: {
            summary: "pre_acceptance_placeholder",
            artifacts: { stdout_path: stdoutPath, stderr_path: stderrPath, files: [] },
            metrics: { duration_ms: Date.now() - startedMs },
            errors: [],
          },
        });
      }
      const p = await runPipelineTask(task, runId);
      lastStdout = p.stdout || "";
      lastStderr = p.stderr || "";
      writeStdout(lastStdout);
      writeStderr(lastStderr);
      const files = collectRunArtifactFiles(runDir);
      commandArtifacts = {
        command: "pipeline",
        run_id: runId,
        task_id: task.metadata.id,
        exitCode: p.ok ? 0 : 1,
        timedOut: false,
        stdout: lastStdout,
        stderr: lastStderr,
        files,
        pipeline: {
          steps_summary: p.stepsSummary,
          failed_step_id: p.failedStepId,
          failed_step_index: p.failedStepIndex,
          error_code: p.errorCode,
          note: p.note,
        },
      };
      if (metaInclude.has("result_pre_acceptance_json")) {
        writeMetaGuarded("json", "_meta/result_pre_acceptance.json", {
          apiVersion: "v1",
          kind: "Result",
          metadata: {
            task_id: task.metadata.id,
            run_id: runId,
            assignee: ASSIGNEE_ID,
            started_at: startedAt,
            finished_at: nowIsoJst(),
            status: "success",
          },
          outcome: {
            summary: "pre_acceptance_snapshot",
            artifacts: { stdout_path: stdoutPath, stderr_path: stderrPath, files },
            metrics: { duration_ms: Date.now() - startedMs },
            errors: [],
          },
          note: "pipeline acceptance is evaluated inside pipeline execution",
        });
      }
      fs.writeFileSync(path.join(runDir, "artifacts.json"), JSON.stringify(commandArtifacts, null, 2), "utf8");
      const stdoutSample = sampleWithNote(lastStdout, PIPELINE_SAMPLE_MAX);
      const stderrSample = sampleWithNote(lastStderr, PIPELINE_SAMPLE_MAX);
      const pipelineDetails: Record<string, any> = {
        steps_summary: p.stepsSummary,
        failed_step_id: p.failedStepId,
        failed_step_index: p.failedStepIndex,
        aggregated_stdout_sample: stdoutSample.sample,
        aggregated_stderr_sample: stderrSample.sample,
        note: p.note,
      };
      const finishedAt = nowIsoJst();
      const result: Result = {
        apiVersion: "v1",
        kind: "Result",
        metadata: {
          id: randomId("result"),
          task_id: task.metadata.id,
          assignee: ASSIGNEE_ID,
          started_at: startedAt,
          finished_at: finishedAt,
          status: p.ok ? "success" : "failed",
          run_id: runId,
        },
        outcome: {
          summary: p.summary,
          artifacts: { stdout_path: stdoutPath, stderr_path: stderrPath, files },
          metrics: { duration_ms: Date.now() - startedMs },
          errors: p.ok ? [] : [{ code: p.errorCode || "ERR_EXEC", message: p.summary, details: pipelineDetails }],
        },
      };
      if (metaInclude.has("result_final_json")) {
        writeMetaGuarded("json", "_meta/result.json", result);
      }
      writeYamlFile(path.join(DIRS.events, `result_${task.metadata.id}_${runId}.yaml`), result);
      if (!p.ok) {
        atomicMove(movedPath, path.join(DIRS.failed, path.basename(movedPath)));
        appendDashboard(`- [NG] ${task.metadata.id} / ${p.summary}`);
      } else {
        atomicMove(movedPath, path.join(DIRS.done, path.basename(movedPath)));
        appendDashboard(`- [OK] ${task.metadata.id} / ${task.metadata.title} / ${p.summary}`);
      }
      const h: HistoryEntry = {
        timestamp: finishedAt,
        task_id: task.metadata.id,
        command: "pipeline",
        category: task.metadata.category || "",
        persona: task.metadata.persona || "",
        repo_path: task.spec?.context?.repo_path || "",
        arg_keys: [],
        acceptance_types: Array.isArray(task.acceptance) ? task.acceptance.map((a: any) => String(a?.type || "")) : [],
        status: p.ok ? "success" : "failed",
        duration_ms: Date.now() - startedMs,
        target_key: "pipeline",
      };
      appendHistory(h);
      pushHistoryCache(historyCache, h);
      maybeEmitSkillProposal(task, historyCache);
      return;
    } else if (task.spec?.command === "create_file") {
      const r = await commandCreateFile(task);
      commandArtifacts = {
        command: "create_file",
        repo_path: r.repoPath,
        target_path: r.targetPath,
      };
    } else if (task.spec?.command === "apply_patch") {
      const r = await commandApplyPatch(task);
      diffPath = r.diffPath;
      lastStdout = r.stdout || "";
      lastStderr = r.stderr || "";
      commandArtifacts = {
        command: "git apply",
        repo_path: r.repoPath,
        patchPath: r.diffPath,
        exitCode: r.exitCode,
        stdout: r.stdout,
        stderr: r.stderr,
      };
    } else if (task.spec?.command === "run_command" || task.spec?.command === "patch_apply" || task.spec?.command === "file_write" || task.spec?.command === "archive_zip") {
      const args: any = task.spec.args || {};
      const mode = task.spec?.command === "patch_apply"
        ? "patch_apply"
        : (task.spec?.command === "file_write"
          ? "file_write"
          : (task.spec?.command === "archive_zip" ? "archive_zip" : String(args.mode || "command")));
      const cwd = task.spec.context?.repo_path || ROOT;
      const timeoutMs = getRunCommandTimeoutMs(task);

      const req: any = { ...args, run_id: runId, task_id: task.metadata.id, cwd, timeout_ms: timeoutMs, mode };
      if (mode === "patch_apply") {
        const patchFormat = String(task.spec.patch?.format || "unified").toLowerCase();
        const patchText = String(task.spec.patch?.text || "");
        if (patchFormat !== "unified") throw new Error("spec.patch.format must be unified");
        if (!patchText.trim()) throw new Error("spec.patch.text is required");
        req.patch_format = patchFormat;
        req.patch_text = patchText;
        req.workspace_root = DIRS.workspace;
        req.command = "";
      } else if (mode === "file_write") {
        req.files = fileWriteFiles;
        req.workspace_root = DIRS.workspace;
        req.run_files_dir = path.join(runDir, "files");
        req.command = "";
      } else if (mode === "archive_zip") {
        if (!archiveZipSpec) throw new Error("archive_zip normalized spec missing");
        req.inputs = archiveZipSpec.inputs;
        req.output = archiveZipSpec.output;
        req.options = archiveZipSpec.options;
        req.limits = archiveZipSpec.limits;
        req.workspace_root = DIRS.workspace;
        req.run_files_dir = path.join(runDir, "files");
        req.command = "";
      } else if (mode === "python_inproc") {
        const mod = String(args.module || "");
        const code = String(args.code || "");
        if (!mod && !code) throw new Error("run_command python_inproc requires args.module or args.code");
        req.command = "";
      } else {
        const cmd = String(args.command || "");
        if (!cmd) throw new Error("args.command is required");
        req.command = cmd;
      }

      writeExecRequest(runId, req);
      fs.writeFileSync(
        path.join(runDir, "deferred_state.json"),
        JSON.stringify({ run_id: runId, started_at: startedAt, started_ms: startedMs, waiting: true }, null, 2),
        "utf8"
      );

      const waitPath = waitingPathFor(movedPath, runId);
      atomicMove(movedPath, waitPath);
      movedPath = waitPath;
      appendDashboard(`- [WAIT] ${task.metadata.id} / delegated executor mode=${mode} / run_id=${runId}`);
      return;
    } else {
      throw new Error(`unsupported command: ${task.spec.command}`);
    }

    if (metaInclude.has("result_pre_acceptance_json")) {
      writeMetaGuarded("json", "_meta/result_pre_acceptance.json", {
        apiVersion: "v1",
        kind: "Result",
        metadata: {
          task_id: task.metadata.id,
          run_id: runId,
          assignee: ASSIGNEE_ID,
          started_at: startedAt,
          finished_at: nowIsoJst(),
          status: "success",
        },
        outcome: {
          summary: "pre_acceptance_snapshot",
          artifacts: { stdout_path: stdoutPath, stderr_path: stderrPath, files: [] },
          metrics: { duration_ms: Date.now() - startedMs },
          errors: [],
        },
        command_artifacts: commandArtifacts,
      });
    }
    if (metaInclude.has("result_final_json")) {
      writeMetaGuarded("json", "_meta/result.json", {
        apiVersion: "v1",
        kind: "Result",
        metadata: {
          task_id: task.metadata.id,
          run_id: runId,
          assignee: ASSIGNEE_ID,
          started_at: startedAt,
          finished_at: nowIsoJst(),
          status: "running",
        },
        outcome: {
          summary: "pre_acceptance_placeholder",
          artifacts: { stdout_path: stdoutPath, stderr_path: stderrPath, files: [] },
          metrics: { duration_ms: Date.now() - startedMs },
          errors: [],
        },
      });
    }

    const acceptanceEval = runCommandTimedOut
      ? { ok: true, results: [] as AcceptanceResult[] }
      : await evaluateAcceptance(task, { stdout: lastStdout, stderr: lastStderr, runId });
    const accTotal = acceptanceEval.results.length;
    const accOkCount = acceptanceEval.results.filter((r) => r.ok).length;
    const hasAcceptance = accTotal > 0;
    const timeoutFailed = false;
    const commandFailed = false;

    const files = collectRunArtifactFiles(runDir);
    fs.writeFileSync(
      path.join(runDir, "artifacts.json"),
      JSON.stringify(
        {
          ...commandArtifacts,
          run_id: runId,
          task_id: task.metadata.id,
          acceptance: acceptanceEval,
        },
        null,
        2
      ),
      "utf8"
    );
    const finishedAt = nowIsoJst();
    const acceptanceFailed = hasAcceptance && !acceptanceEval.ok;
    const finalFailed = timeoutFailed || acceptanceFailed || commandFailed;
    const personaSuffix = persona.displayName ? ` / Persona: ${persona.displayName}` : "";
    const summary = timeoutFailed
      ? `run_command timeout: ${runCommandTimeoutMs}ms`
      : commandFailed
      ? `run_command failed: exitCode=${runCommandExitCode}`
      : acceptanceFailed
      ? `acceptance NG: ${(acceptanceEval.results.find((r) => !r.ok)?.detail || "unknown")}`
      : (accTotal > 0 ? `success: ${task.spec?.command} / acceptance OK(${accOkCount}/${accTotal})${personaSuffix}` : `success: ${task.spec?.command}${personaSuffix}`);
    const firstAcceptanceNg = acceptanceEval.results.find((r) => !r.ok);
    const acceptanceErrorDetails = firstAcceptanceNg
      ? {
        ...(firstAcceptanceNg.details || {}),
        kind: firstAcceptanceNg.details?.kind || firstAcceptanceNg.type,
      }
      : undefined;

    const result: Result = {
      apiVersion: "v1",
      kind: "Result",
      metadata: {
        id: randomId("result"),
        task_id: task.metadata.id,
        assignee: ASSIGNEE_ID,
        started_at: startedAt,
        finished_at: finishedAt,
        status: finalFailed ? "failed" : "success",
        run_id: runId,
      },
      outcome: {
        summary,
        artifacts: { stdout_path: stdoutPath, stderr_path: stderrPath, files, diff_path: diffPath },
        metrics: { duration_ms: Date.now() - startedMs },
        errors: finalFailed
          ? [
            {
              code: timeoutFailed ? "ERR_TIMEOUT" : (commandFailed ? "ERR_TASK" : "ERR_ACCEPTANCE"),
              message: summary,
              ...(acceptanceFailed && acceptanceErrorDetails ? { details: acceptanceErrorDetails } : {}),
            },
          ]
          : [],
      },
    };
    if (metaInclude.has("result_final_json")) {
      writeMetaGuarded("json", "_meta/result.json", result);
    }

    writeYamlFile(path.join(DIRS.events, `result_${task.metadata.id}_${runId}.yaml`), result);

    if (finalFailed) {
      atomicMove(movedPath, path.join(DIRS.failed, path.basename(movedPath)));
      appendDashboard(`- [NG] ${task.metadata.id} / ${summary}`);
    } else {
      atomicMove(movedPath, path.join(DIRS.done, path.basename(movedPath)));
      appendDashboard(`- [OK] ${task.metadata.id} / ${task.metadata.title} / ${summary}`);
    }

    const h: HistoryEntry = {
      timestamp: finishedAt,
      task_id: task.metadata.id,
      command: taskCommandLabel(task),
      category: task.metadata.category || "",
      persona: task.metadata.persona || "",
      repo_path: task.spec?.context?.repo_path || "",
      arg_keys: Object.keys(task.spec?.args || {}),
        acceptance_types: taskAcceptanceList(task).map((a: any) => String(a?.type || "")),
        status: finalFailed ? "failed" : "success",
        duration_ms: Date.now() - startedMs,
      target_key: String(task.spec?.args?.target || task.spec?.args?.patch_path || task.spec?.args?.command || ""),
    };
    appendHistory(h);
    pushHistoryCache(historyCache, h);
    maybeEmitSkillProposal(task, historyCache);
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e);
    writeStderr(msg);

    const finishedAt = nowIsoJst();
    const taskId = stableTaskKey(taskPath, task?.metadata?.id);
    const schemaErrors: SchemaErrorDetail[] = Array.isArray(e?.schemaErrors) ? e.schemaErrors : [];
    const schemaErrorsLenSuffix = schemaErrors.length > 0 ? ` / schema_errors_len=${schemaErrors.length}` : "";
    const rawErrorCode = String(e?.errorCode || "").toUpperCase();
    const normalizedErrorCode = (["ERR_TASK", "ERR_EXEC", "ERR_TIMEOUT", "ERR_ACCEPTANCE"].includes(rawErrorCode) ? rawErrorCode : "ERR_TASK");
    const details = schemaErrors.length > 0
      ? { schema_errors: schemaErrors }
      : (e?.reasonKey || e?.failedPath || e?.note
        ? {
          reason_key: String(e?.reasonKey || ""),
          failed_path: String(e?.failedPath || ""),
          note: String(e?.note || ""),
        }
        : undefined);
    const result: Result = {
      apiVersion: "v1",
      kind: "Result",
      metadata: {
        id: randomId("result"),
        task_id: taskId,
        assignee: ASSIGNEE_ID,
        started_at: startedAt,
        finished_at: finishedAt,
        status: "failed",
        run_id: runId,
      },
      outcome: {
        summary: `failed: ${msg}${schemaErrorsLenSuffix}`,
        artifacts: { stdout_path: stdoutPath, stderr_path: stderrPath, files: [] },
        metrics: { duration_ms: Date.now() - startedMs },
        errors: [{ code: normalizedErrorCode, message: msg, ...(details ? { details } : {}) }],
      },
    };

    writeYamlFile(path.join(DIRS.events, `result_${taskId}_${runId}.yaml`), result);

    try {
      const failedPath = path.join(DIRS.failed, path.basename(movedPath));
      if (fs.existsSync(movedPath)) atomicMove(movedPath, failedPath);
      else if (fs.existsSync(taskPath)) atomicMove(taskPath, failedPath);
    } catch {
      // ignore move failure
    }

    appendDashboard(`- [NG] ${taskId} / ${result.outcome.summary}`);

    if (task) {
      const h: HistoryEntry = {
        timestamp: finishedAt,
        task_id: task?.metadata?.id || taskId,
        command: taskCommandLabel(task),
        category: task.metadata.category || "",
        persona: task.metadata.persona || "",
        repo_path: task.spec?.context?.repo_path || "",
        arg_keys: Object.keys(task.spec?.args || {}),
        acceptance_types: taskAcceptanceList(task).map((a: any) => String(a?.type || "")),
        status: "failed",
        duration_ms: Date.now() - startedMs,
        target_key: String(taskCommandLabel(task) === "patch_apply" ? "patch_apply" : (taskCommandLabel(task) === "file_write" ? "file_write" : (taskCommandLabel(task) === "archive_zip" ? "archive_zip" : (task.spec?.args?.target || task.spec?.args?.patch_path || task.spec?.args?.command || "")))),
      };
      appendHistory(h);
      pushHistoryCache(historyCache, h);
      maybeEmitSkillProposal(task, historyCache);
    }
  }
}

function listPendingTasks(): string[] {
  return fs
    .readdirSync(DIRS.pending)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => path.join(DIRS.pending, f))
    .sort();
}

function listWaitingTasks(): string[] {
  return fs
    .readdirSync(DIRS.waiting)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => path.join(DIRS.waiting, f))
    .sort();
}

async function processOneWaiting(historyCache: HistoryEntry[]): Promise<void> {
  const waiting = listWaitingTasks();
  if (!waiting.length) return;

  let waitingPath = "";
  let info: ReturnType<typeof parseWaitingPath> = null;
  let resultPath = "";
  for (const candidate of waiting) {
    const parsed = parseWaitingPath(candidate);
    if (!parsed) continue;
    const resolved = resolveExecResultPath(parsed.runId);
    if (!resolved) continue;
    waitingPath = candidate;
    info = parsed;
    resultPath = resolved;
    break;
  }
  if (!waitingPath || !info || !resultPath) return;

  const runDir = path.join(DIRS.runs, info.runId);
  const stdoutPath = path.join(runDir, "stdout.log");
  const stderrPath = path.join(runDir, "stderr.log");
  const startedAtFallback = nowIsoJst();
  const startedMsFallback = Date.now();
  let startedAt = startedAtFallback;
  let startedMs = startedMsFallback;

  try {
    const statePath = path.join(runDir, "deferred_state.json");
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      startedAt = String(state?.started_at || startedAtFallback);
      startedMs = Number.isFinite(Number(state?.started_ms)) ? Number(state.started_ms) : startedMsFallback;
    }
  } catch {
    // ignore bad state
  }

  const task = readYamlFile<Task>(waitingPath);
  const metaInclude = normalizeMetaInclude(task);
  const writeMetaGuarded = (kind: "json" | "yaml", relPath: string, payload: any): void => {
    try {
      if (kind === "json") writeRunMetaJson(runDir, relPath, payload);
      else writeRunMetaYaml(runDir, relPath, payload);
    } catch (e: any) {
      const err: any = new Error(`run meta write failed: ${relPath}: ${String(e?.message || e)}`);
      err.errorCode = "ERR_EXEC";
      err.reasonKey = "RUN_META_WRITE_FAILED";
      err.failedPath = relPath;
      throw err;
    }
  };
  const raw = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  const commandLabel = String(task.spec.command || "run_command");
  const runCommandExitCode = Number.isFinite(Number(raw?.exitCode)) ? Number(raw.exitCode) : 1;
  const runCommandTimedOut = Boolean(raw?.timedOut);
  const runCommandTimeoutObserved = runCommandTimedOut || runCommandExitCode === 124;
  const timeoutExpected = isTimeoutExpected(task);
  const timeoutExpectedAcceptancePolicy = getTimeoutExpectedAcceptancePolicy(task);
  const timeoutAsExpected = timeoutExpected && runCommandTimeoutObserved;
  const lastStdout = String(raw?.stdout || "");
  const lastStderr = String(raw?.stderr || "");
  const runCommandTimeoutMs = getRunCommandTimeoutMs(task);

  fs.appendFileSync(stdoutPath, lastStdout, "utf8");
  fs.appendFileSync(stderrPath, lastStderr, "utf8");
  let files = collectRunArtifactFiles(runDir);

  if (metaInclude.has("result_pre_acceptance_json")) {
    writeMetaGuarded("json", "_meta/result_pre_acceptance.json", {
      apiVersion: "v1",
      kind: "Result",
      metadata: {
        task_id: task.metadata.id,
        run_id: info.runId,
        assignee: ASSIGNEE_ID,
        started_at: startedAt,
        finished_at: nowIsoJst(),
        status: "success",
      },
      outcome: {
        summary: "pre_acceptance_snapshot",
        artifacts: { stdout_path: stdoutPath, stderr_path: stderrPath, files },
        metrics: { duration_ms: Date.now() - startedMs },
        errors: [],
      },
      command_artifacts: {
        command: commandLabel === "run_command" ? String(task.spec.args?.command || "") : commandLabel,
        cwd: task.spec.context?.repo_path || ROOT,
        exitCode: runCommandExitCode,
        timedOut: runCommandTimedOut,
        timeout_ms: runCommandTimeoutMs,
        stdout: lastStdout,
        stderr: lastStderr,
      },
    });
  }
  if (metaInclude.has("result_final_json")) {
    writeMetaGuarded("json", "_meta/result.json", {
      apiVersion: "v1",
      kind: "Result",
      metadata: {
        task_id: task.metadata.id,
        run_id: info.runId,
        assignee: ASSIGNEE_ID,
        started_at: startedAt,
        finished_at: nowIsoJst(),
        status: "running",
      },
      outcome: {
        summary: "pre_acceptance_placeholder",
        artifacts: { stdout_path: stdoutPath, stderr_path: stderrPath, files },
        metrics: { duration_ms: Date.now() - startedMs },
        errors: [],
      },
    });
  }
  files = collectRunArtifactFiles(runDir);

  const shouldEvaluateAcceptance =
    !runCommandTimeoutObserved ||
    (timeoutExpected && runCommandTimeoutObserved && timeoutExpectedAcceptancePolicy === "strict");
  const acceptanceEval = shouldEvaluateAcceptance
    ? await evaluateAcceptance(task, {
      stdout: lastStdout,
      stderr: lastStderr,
      commandExitCode: runCommandExitCode,
      runId: info.runId,
      artifactsFiles: files,
      runFilesDir: path.join(runDir, "files"),
    })
    : { ok: true, results: [] as AcceptanceResult[] };
  const accTotal = acceptanceEval.results.length;
  const accOkCount = acceptanceEval.results.filter((r) => r.ok).length;
  const hasAcceptance = accTotal > 0;
  const timeoutFailed = runCommandTimeoutObserved && !timeoutExpected;
  const commandFailed = runCommandExitCode !== 0 && !runCommandTimeoutObserved;
  const rawErrorCode = String(raw?.error_code || "").trim();
  const normalizedExecErrorCode = (["ERR_TASK", "ERR_EXEC", "ERR_TIMEOUT", "ERR_ACCEPTANCE"].includes(rawErrorCode.toUpperCase())
    ? rawErrorCode.toUpperCase()
    : "");
  const defaultExecCode = commandLabel === "run_command" ? "ERR_TASK" : "ERR_EXEC";
  const commandErrorCode = commandFailed ? (normalizedExecErrorCode || defaultExecCode) : "";
  const commandReasonKey = String(raw?.reason_key || "").trim();
  const commandErrorDetails = commandFailed
    ? {
      reason_key: commandReasonKey || "EXEC_COMMAND_FAILED",
      failed_path: String(raw?.failed_path || ""),
      stderr_sample: String(raw?.stderr_sample || ""),
      tool_exit_code: Number.isFinite(Number(raw?.tool_exit_code)) ? Number(raw.tool_exit_code) : runCommandExitCode,
      note: String(raw?.note || ""),
    }
    : undefined;
  const acceptanceFailed = hasAcceptance && !acceptanceEval.ok;
  const finalFailed = timeoutFailed || acceptanceFailed || commandFailed;

  const commandArtifacts = {
    command: commandLabel === "run_command" ? String(task.spec.args?.command || "") : commandLabel,
    cwd: task.spec.context?.repo_path || ROOT,
    exitCode: runCommandExitCode,
    timedOut: runCommandTimedOut,
    timeout_ms: runCommandTimeoutMs,
    stdout: lastStdout,
    stderr: lastStderr,
    run_id: info.runId,
    task_id: task.metadata.id,
    files,
    acceptance: acceptanceEval,
  };
  fs.writeFileSync(path.join(runDir, "artifacts.json"), JSON.stringify(commandArtifacts, null, 2), "utf8");

  const finishedAt = nowIsoJst();
  const summary = timeoutAsExpected && timeoutExpectedAcceptancePolicy === "skip"
    ? `success: ${commandLabel} timeout expected: ${runCommandTimeoutMs}ms (acceptance skipped)`
    : timeoutAsExpected && timeoutExpectedAcceptancePolicy === "strict" && acceptanceFailed
    ? `acceptance NG: ${(acceptanceEval.results.find((r) => !r.ok)?.detail || "unknown")} (${commandLabel} timeout expected: ${runCommandTimeoutMs}ms)`
    : timeoutAsExpected && timeoutExpectedAcceptancePolicy === "strict"
    ? `success: ${commandLabel} timeout expected: ${runCommandTimeoutMs}ms / acceptance OK(${accOkCount}/${accTotal})`
    : timeoutFailed
    ? `${commandLabel} timeout: ${runCommandTimeoutMs}ms`
    : commandFailed
      ? `${commandLabel} failed: exitCode=${runCommandExitCode}${commandReasonKey ? " reason=" + commandReasonKey : ""}`
      : acceptanceFailed
      ? `acceptance NG: ${(acceptanceEval.results.find((r) => !r.ok)?.detail || "unknown")}`
        : (accTotal > 0 ? `success: ${task.spec.command} / acceptance OK(${accOkCount}/${accTotal})` : `success: ${task.spec.command}`);
  const firstAcceptanceNg = acceptanceEval.results.find((r) => !r.ok);
  const acceptanceErrorDetails = firstAcceptanceNg
    ? {
      ...(firstAcceptanceNg.details || {}),
      kind: firstAcceptanceNg.details?.kind || firstAcceptanceNg.type,
    }
    : undefined;
  const finalErrorCode = timeoutFailed ? "ERR_TIMEOUT" : (commandFailed ? commandErrorCode : "ERR_ACCEPTANCE");
  const finalErrorDetails =
    commandFailed ? commandErrorDetails :
    (acceptanceFailed ? acceptanceErrorDetails : undefined);

  const result: Result = {
    apiVersion: "v1",
    kind: "Result",
    metadata: {
      id: randomId("result"),
      task_id: task.metadata.id,
      assignee: ASSIGNEE_ID,
      started_at: startedAt,
      finished_at: finishedAt,
      status: finalFailed ? "failed" : "success",
      run_id: info.runId,
    },
    outcome: {
      summary,
      artifacts: { stdout_path: stdoutPath, stderr_path: stderrPath, files },
      metrics: { duration_ms: Date.now() - startedMs },
      errors: finalFailed
        ? [
          {
            code: finalErrorCode,
            message: summary,
            ...(finalErrorDetails ? { details: finalErrorDetails } : {}),
          },
        ]
        : [],
    },
  };
  if (metaInclude.has("result_final_json")) {
    writeMetaGuarded("json", "_meta/result.json", result);
  }
  writeYamlFile(path.join(DIRS.events, `result_${task.metadata.id}_${info.runId}.yaml`), result);

  const finalName = `${info.baseName}${info.ext}`;
  if (finalFailed) {
    atomicMove(waitingPath, path.join(DIRS.failed, finalName));
    appendDashboard(`- [NG] ${task.metadata.id} / ${summary}`);
  } else {
    atomicMove(waitingPath, path.join(DIRS.done, finalName));
    appendDashboard(`- [OK] ${task.metadata.id} / ${task.metadata.title} / ${summary}`);
  }

  const h: HistoryEntry = {
    timestamp: finishedAt,
    task_id: task.metadata.id,
    command: task.spec.command,
    category: task.metadata.category || "",
    persona: task.metadata.persona || "",
    repo_path: task.spec.context?.repo_path || "",
    arg_keys: Object.keys(task.spec.args || {}),
    acceptance_types: (task.spec.acceptance || []).map((a: any) => String(a?.type || "")),
    status: finalFailed ? "failed" : "success",
    duration_ms: Date.now() - startedMs,
    target_key: String(task.spec.command === "patch_apply" ? "patch_apply" : (task.spec.command === "file_write" ? "file_write" : (task.spec.command === "archive_zip" ? "archive_zip" : (task.spec.args?.target || task.spec.args?.patch_path || task.spec.args?.command || "")))),
  };
  appendHistory(h);
  pushHistoryCache(historyCache, h);
  maybeEmitSkillProposal(task, historyCache);

  try {
    fs.unlinkSync(resultPath);
  } catch {
    // ignore cleanup error
  }
}

function recoverStaleRunningTasks(): void {
  const entries = fs
    .readdirSync(DIRS.running)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => path.join(DIRS.running, f));

  for (const filePath of entries) {
    try {
      const stat = fs.statSync(filePath);
      const task = readYamlFile<Task>(filePath);
      const timeoutMs = task.spec.command === "run_command" ? getRunCommandTimeoutMs(task) : DEFAULT_RUN_COMMAND_TIMEOUT_MS;
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs <= timeoutMs + STALE_RUNNING_GRACE_MS) continue;

      const runId = `run_${new Date().toISOString().replace(/[:.]/g, "-")}_${crypto.randomBytes(3).toString("hex")}`;
      const result: Result = {
        apiVersion: "v1",
        kind: "Result",
        metadata: {
          id: randomId("result"),
          task_id: task.metadata.id,
          assignee: ASSIGNEE_ID,
          started_at: nowIsoJst(),
          finished_at: nowIsoJst(),
          status: "failed",
          run_id: runId,
        },
        outcome: {
          summary: `recovered stale running task: timeout age=${Math.floor(ageMs / 1000)}s`,
          artifacts: { files: [] },
          metrics: { duration_ms: 0 },
          errors: [{ code: "ERR_STALE_RUNNING", message: "task recovered from stale running state" }],
        },
      };
      writeYamlFile(path.join(DIRS.events, `result_${task.metadata.id}_${runId}.yaml`), result);
      atomicMove(filePath, path.join(DIRS.failed, path.basename(filePath)));
      appendDashboard(`- [NG] ${task.metadata.id} / recovered stale running task`);
    } catch (e: any) {
      appendDashboard(`- [NG] stale recovery error: ${path.basename(filePath)} / ${String(e?.message || e)}`);
    }
  }
}

async function main(): Promise<void> {
  ensureDirs();
  const historyCache = readHistory().slice(-HISTORY_CACHE_MAX);
  recoverStaleRunningTasks();
  console.log(`[orchestrator] start assignee=${ASSIGNEE_ID}`);
  console.log(`[orchestrator] workspace=${WORKSPACE}`);
  for (const line of WORKSPACE_RESOLUTION.logs) {
    console.log(`[orchestrator] workspace_resolve ${line}`);
  }
  console.log(`[orchestrator] exec_root=${EXEC_ROOT}`);
  for (const line of EXEC_RESOLUTION.logs) {
    console.log(`[orchestrator] exec_root_resolve ${line}`);
  }
  console.log(`[orchestrator] watching: ${DIRS.pending}`);

  let tickRunning = false;
  setInterval(async () => {
    if (tickRunning) return;
    tickRunning = true;
    try {
    processOneApproval();
    recoverStaleRunningTasks();
    await processOneWaiting(historyCache);

    const runningCount = fs.readdirSync(DIRS.running).length;
    if (runningCount >= 2) return;

    const pendings = listPendingTasks();
    if (!pendings.length) return;

    await runOneTask(pendings[0], historyCache);
    } finally {
      tickRunning = false;
    }
  }, 1000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
