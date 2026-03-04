const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  app,
  BrowserView,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  shell,
} = require("electron");

const TOP_BAR_HEIGHT = 52;
const CHATGPT_ORIGIN = "https://chatgpt.com";
const OPENAI_HOSTS = new Set(["chatgpt.com", "chat.openai.com", "openai.com"]);
const DEFAULT_UI_URL = process.env.REGION_AI_UI_URL || "http://127.0.0.1:5173";
const DEFAULT_UI_API_BASE = "http://127.0.0.1:8787";
const CAPTURE_MAX_CHARS = 8192;
const CAPTURE_LAST_MAX_CHARS = 16 * 1024;
const INBOX_TITLE_MAX_CHARS = 256;
const INBOX_BODY_MAX_CHARS = 2000;
const INBOX_ENTRY_MAX_CHARS = 8 * 1024;
const DEFAULT_NOTIFY_POLL_MS = 5000;
const DEFAULT_NOTIFY_THROTTLE_SEC = 30;
const DEFAULT_MENTION_PRIORITY_THROTTLE_SEC = 5;
const DEFAULT_SETTINGS_RELOAD_POLL_MS = 10000;
const BACKOFF_MAX_MS = 60000;
const COUNCIL_TOPIC_MAX_CHARS = 2000;
const COUNCIL_CONSTRAINTS_MAX_CHARS = 4000;
const COUNCIL_SUMMARY_MAX_CHARS = 2000;
const COUNCIL_LOG_LINE_MAX_CHARS = 16 * 1024;
const COUNCIL_MAX_ROUNDS = 8;
const COUNCIL_POLL_INTERVAL_MS = 1500;
const COUNCIL_WAIT_ASSISTANT_TIMEOUT_MS = 20000;
const COUNCIL_WAIT_ASSISTANT_INTERVAL_MS = 700;
const COUNCIL_MAX_REFLECTION_ATTEMPTS = 1;
const DEFAULT_HOTKEYS = Object.freeze({
  focus_chatgpt: "Ctrl+Alt+G",
  send_confirm: "Ctrl+Alt+S",
  capture_last: "Ctrl+Alt+C",
  focus_region: "Ctrl+Alt+R",
});
const DEFAULT_NOTIFY_STATE = Object.freeze({
  last_notified: {},
  last_poll_ok_at: "",
  failure_count: 0,
  backoff_ms: DEFAULT_NOTIFY_POLL_MS,
  inbox_last_written_ts: "",
});
const ROLE_CONFIGS = Object.freeze([
  { id: "facilitator", label: "司会", partition: "persist:chatgpt_facilitator" },
  { id: "design", label: "設計", partition: "persist:chatgpt_design" },
  { id: "impl", label: "実装", partition: "persist:chatgpt_impl" },
  { id: "qa", label: "検証", partition: "persist:chatgpt_qa" },
  { id: "jester", label: "道化師", partition: "persist:chatgpt_jester" },
]);
const DEFAULT_ACTIVE_ROLE_ID = "facilitator";
const ROLE_IDS = new Set(ROLE_CONFIGS.map((x) => x.id));
const isSmoke = process.env.REGION_AI_DESKTOP_SMOKE === "1" || process.argv.includes("--smoke");

let mainWindow = null;
let regionView = null;
let chatViewsByRole = new Map();
let activeRoleId = DEFAULT_ACTIVE_ROLE_ID;
let selectedPayload = null;
let tray = null;
let isQuitting = false;
let notifyTimer = null;
let settingsPollTimer = null;
let councilPollTimer = null;
let settingsLastMtimeMs = 0;
let lastNotifyAt = 0;
let hotkeysRegistered = 0;
let hotkeysDisabled = [];
let hotkeyRegisteredByAction = new Map();
let councilRunnerBusy = false;
let councilActiveRunId = "";
let settingsLoaded = false;
let notifyStateLoaded = false;
let notifyStateSavedAtLeastOnce = false;
let settingsHotReloadedAtLeastOnce = false;
let lastNotificationPayload = null;
let runtimeConfig = {
  uiApiBase: String(process.env.REGION_AI_UI_API_BASE || DEFAULT_UI_API_BASE).trim() || DEFAULT_UI_API_BASE,
  notifyPollMs: Math.max(1000, Number(process.env.REGION_AI_NOTIFY_POLL_MS || DEFAULT_NOTIFY_POLL_MS)),
  notifyThrottleMs: Math.max(5000, Number(process.env.REGION_AI_NOTIFY_THROTTLE_MS || (DEFAULT_NOTIFY_THROTTLE_SEC * 1000))),
  hotkeys: {
    focus_chatgpt: String(process.env.REGION_AI_HOTKEY_FOCUS_CHATGPT || DEFAULT_HOTKEYS.focus_chatgpt).trim(),
    send_confirm: String(process.env.REGION_AI_HOTKEY_SEND_CONFIRM || DEFAULT_HOTKEYS.send_confirm).trim(),
    capture_last: String(process.env.REGION_AI_HOTKEY_CAPTURE_LAST || DEFAULT_HOTKEYS.capture_last).trim(),
    focus_region: String(process.env.REGION_AI_HOTKEY_FOCUS_REGION || DEFAULT_HOTKEYS.focus_region).trim(),
  },
  mention: {
    enabled: true,
    tokens: ["@shogun", "@karo", "@ashigaru", "@codex", "@chatgpt"],
    aliases: { "将軍": "@shogun", "家老": "@karo" },
    priorityThrottleMs: DEFAULT_MENTION_PRIORITY_THROTTLE_SEC * 1000,
  },
  settingsReloadPollMs: Math.max(1000, Number(process.env.REGION_AI_SETTINGS_RELOAD_POLL_MS || DEFAULT_SETTINGS_RELOAD_POLL_MS)),
};
let notifyState = {
  last_notified: {},
  last_poll_ok_at: "",
  failure_count: 0,
  backoff_ms: DEFAULT_NOTIFY_POLL_MS,
  inbox_last_written_ts: "",
};

function resolveWorkspaceRoot() {
  const fromEnv = String(process.env.REGION_AI_WORKSPACE || "").trim();
  if (fromEnv) return path.resolve(fromEnv);
  const localAppData = String(process.env.LOCALAPPDATA || "").trim();
  if (localAppData) return path.join(localAppData, "region_ai", "workspace");
  return path.join(os.tmpdir(), "region_ai", "workspace");
}

function desktopUiDir() {
  return path.join(resolveWorkspaceRoot(), "ui", "desktop");
}

function notifyStatePath() {
  return path.join(desktopUiDir(), "notify_state.json");
}

function inboxPath() {
  return path.join(desktopUiDir(), "inbox.jsonl");
}

function settingsPath() {
  return path.join(desktopUiDir(), "desktop_settings.json");
}

function councilDir() {
  return path.join(resolveWorkspaceRoot(), "ui", "council");
}

function orgAgentsPath() {
  return path.join(resolveWorkspaceRoot(), "ui", "org", "agents.json");
}

function councilRunsDir() {
  return path.join(councilDir(), "runs");
}

function councilLogsDir() {
  return path.join(councilDir(), "logs");
}

function councilRequestsDir() {
  return path.join(councilDir(), "requests");
}

function readJsonFileSafe(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmpPath, filePath);
}

function clipText(input, maxLen) {
  const s = String(input || "");
  if (s.length <= maxLen) return { value: s, truncated: false };
  return { value: s.slice(0, maxLen), truncated: true };
}

function appendInboxEntry(entryInput) {
  try {
    const entry = entryInput && typeof entryInput === "object" ? entryInput : {};
    const titleClip = clipText(entry.title, INBOX_TITLE_MAX_CHARS);
    const bodyClip = clipText(entry.body, INBOX_BODY_MAX_CHARS);
    const links = entry.links && typeof entry.links === "object" ? entry.links : {};
    const row = {
      id: `inbox_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      ts: new Date().toISOString(),
      thread_id: String(entry.thread_id || ""),
      msg_id: String(entry.msg_id || ""),
      role: String(entry.role || "unknown"),
      mention: !!entry.mention,
      title: titleClip.value,
      body: bodyClip.value,
      source: String(entry.source || "desktop_notify"),
      links: {
        run_id: links.run_id ? String(links.run_id) : undefined,
        design_id: links.design_id ? String(links.design_id) : undefined,
        request_id: links.request_id ? String(links.request_id) : undefined,
        artifact_paths: Array.isArray(links.artifact_paths) ? links.artifact_paths.map((x) => String(x)).slice(0, 50) : [],
      },
      ...(titleClip.truncated || bodyClip.truncated ? { note: "truncated" } : {}),
    };
    const encoded = `${JSON.stringify(row)}\n`;
    if (encoded.length > INBOX_ENTRY_MAX_CHARS) {
      const over = encoded.length - INBOX_ENTRY_MAX_CHARS;
      const bodyCap = Math.max(64, row.body.length - over - 32);
      row.body = row.body.slice(0, bodyCap);
      row.note = "truncated";
    }
    const line = `${JSON.stringify(row)}\n`;
    fs.mkdirSync(path.dirname(inboxPath()), { recursive: true });
    const fd = fs.openSync(inboxPath(), "a");
    try {
      fs.writeSync(fd, line, undefined, "utf8");
    } finally {
      fs.closeSync(fd);
    }
    notifyState.inbox_last_written_ts = row.ts;
    saveNotifyState();
    return { ok: true, id: row.id };
  } catch (e) {
    console.log(`[desktop_inbox] append_failed reason=${String(e && e.message ? e.message : e)}`);
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

function councilRunPath(runId) {
  return path.join(councilRunsDir(), `${String(runId || "").trim()}.json`);
}

function councilLogPath(runId) {
  return path.join(councilLogsDir(), `${String(runId || "").trim()}.jsonl`);
}

function readCouncilRun(runId) {
  const p = councilRunPath(runId);
  if (!fs.existsSync(p)) return null;
  const obj = readJsonFileSafe(p, null);
  return obj && typeof obj === "object" ? obj : null;
}

function saveCouncilRun(runObj) {
  if (!runObj || typeof runObj !== "object") return false;
  const runId = String(runObj.run_id || "").trim();
  if (!runId) return false;
  const prev = readCouncilRun(runId) || {};
  const next = { ...prev, ...runObj, run_id: runId, updated_at: new Date().toISOString() };
  writeJsonAtomic(councilRunPath(runId), next);
  return true;
}

function appendCouncilLog(runId, rowInput) {
  try {
    const row = rowInput && typeof rowInput === "object" ? rowInput : {};
    const out = {
      ts: new Date().toISOString(),
      run_id: String(runId || ""),
      type: String(row.type || "log"),
      role: String(row.role || ""),
      round: Number.isFinite(Number(row.round)) ? Number(row.round) : 0,
      title: String(row.title || "").slice(0, 256),
      summary: String(row.summary || "").slice(0, COUNCIL_SUMMARY_MAX_CHARS),
      details: String(row.details || "").slice(0, COUNCIL_SUMMARY_MAX_CHARS),
    };
    const line = `${JSON.stringify(out)}\n`;
    const clipped = line.length > COUNCIL_LOG_LINE_MAX_CHARS ? `${line.slice(0, COUNCIL_LOG_LINE_MAX_CHARS - 2)}\n` : line;
    fs.mkdirSync(councilLogsDir(), { recursive: true });
    const fd = fs.openSync(councilLogPath(runId), "a");
    try {
      fs.writeSync(fd, clipped, undefined, "utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // best effort
  }
}

function councilRoleOrder() {
  return ["facilitator", "design", "impl", "qa", "jester"];
}

function councilRoleAgentId(roleId) {
  if (roleId === "facilitator") return "facilitator";
  if (roleId === "design") return "designer";
  if (roleId === "impl") return "implementer";
  if (roleId === "qa") return "verifier";
  if (roleId === "jester") return "joker";
  return "";
}

function councilRoleLabel(roleId) {
  if (roleId === "facilitator") return "司会";
  if (roleId === "design") return "設計担当";
  if (roleId === "impl") return "実装担当";
  if (roleId === "qa") return "検証担当";
  if (roleId === "jester") return "道化師";
  return roleId;
}

function councilChatRole(roleId) {
  if (roleId === "facilitator") return "facilitator";
  if (roleId === "design") return "designer";
  if (roleId === "impl") return "implementer";
  if (roleId === "qa") return "verifier";
  if (roleId === "jester") return "joker";
  return String(roleId || "assistant");
}

function loadOrgAgentsIdentityMap() {
  const out = {};
  try {
    const raw = readJsonFileSafe(orgAgentsPath(), {});
    const rows = Array.isArray(raw && raw.agents) ? raw.agents : [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const id = String(row.id || "").trim();
      if (!id) continue;
      const identity = row.identity && typeof row.identity === "object" ? row.identity : null;
      if (!identity) continue;
      out[id] = identity;
    }
  } catch {
    // best effort
  }
  return out;
}

function formatIdentityBlock(roleId) {
  const agentId = councilRoleAgentId(roleId);
  if (!agentId) return "";
  const map = loadOrgAgentsIdentityMap();
  const idn = map[agentId];
  if (!idn || typeof idn !== "object") return "";
  const listLine = (arr) => {
    if (!Array.isArray(arr) || arr.length < 1) return "";
    return arr.map((x) => String(x || "").trim()).filter((x) => !!x).slice(0, 5).join(", ");
  };
  const rows = [];
  rows.push("[IDENTITY]");
  rows.push(`- tagline: ${String(idn.tagline || "").slice(0, 200)}`);
  rows.push(`- values: ${listLine(idn.values)}`);
  rows.push(`- speaking_style: ${String(idn.speaking_style || "").slice(0, 400)}`);
  rows.push(`- strengths: ${listLine(idn.strengths)}`);
  rows.push(`- weaknesses: ${listLine(idn.weaknesses)}`);
  rows.push(`- do: ${listLine(idn.do)}`);
  rows.push(`- dont: ${listLine(idn.dont)}`);
  rows.push(`- focus: ${String(idn.focus || "").slice(0, 400)}`);
  const nonEmpty = rows.filter((line, idx) => idx === 0 || !line.endsWith(": "));
  return nonEmpty.length > 1 ? nonEmpty.join("\n") : "";
}

async function postUiApiJson(apiPath, bodyObj) {
  try {
    const resp = await fetch(`${runtimeConfig.uiApiBase}${apiPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj || {}),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: !!resp.ok && !!data?.ok, status: resp.status, data: data?.data || {} };
  } catch (e) {
    return { ok: false, status: 0, data: {}, reason: String(e && e.message ? e.message : e) };
  }
}

function normalizeHotkeys(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    focus_chatgpt: String(src.focus_chatgpt || DEFAULT_HOTKEYS.focus_chatgpt).trim(),
    send_confirm: String(src.send_confirm || DEFAULT_HOTKEYS.send_confirm).trim(),
    capture_last: String(src.capture_last || DEFAULT_HOTKEYS.capture_last).trim(),
    focus_region: String(src.focus_region || DEFAULT_HOTKEYS.focus_region).trim(),
  };
}

function defaultDesktopSettingsObj() {
  return {
    hotkeys: { ...DEFAULT_HOTKEYS },
    poll_interval_ms: DEFAULT_NOTIFY_POLL_MS,
    throttle_sec: DEFAULT_NOTIFY_THROTTLE_SEC,
    api_base_url: DEFAULT_UI_API_BASE,
    mention: {
      enabled: true,
      tokens: ["@shogun", "@karo", "@ashigaru", "@codex", "@chatgpt"],
      aliases: { "将軍": "@shogun", "家老": "@karo" },
      priority_throttle_sec: DEFAULT_MENTION_PRIORITY_THROTTLE_SEC,
      normal_throttle_sec: DEFAULT_NOTIFY_THROTTLE_SEC,
    },
    settings_reload_interval_ms: DEFAULT_SETTINGS_RELOAD_POLL_MS,
  };
}

function validateDesktopSettingsRaw(rawInput, baseConfig) {
  const defaults = defaultDesktopSettingsObj();
  const raw = rawInput && typeof rawInput === "object" ? rawInput : {};
  const mentionObj = raw.mention && typeof raw.mention === "object" ? raw.mention : {};
  const normalThrottleFromMention = Number(mentionObj.normal_throttle_sec || 0);
  const pollMsRaw = raw.poll_interval_ms ?? defaults.poll_interval_ms;
  const throttleSecRaw = raw.throttle_sec ?? (normalThrottleFromMention || defaults.throttle_sec);
  const apiBaseRaw = raw.api_base_url ?? defaults.api_base_url;
  const fileHotkeys = normalizeHotkeys(raw.hotkeys);
  const mentionEnabled = mentionObj.enabled !== false;
  const mentionTokensRaw = Array.isArray(mentionObj.tokens) ? mentionObj.tokens : defaults.mention.tokens;
  if (!Array.isArray(mentionTokensRaw) || mentionTokensRaw.some((x) => typeof x !== "string")) {
    throw new Error("settings.mention.tokens_invalid");
  }
  const mentionTokens = mentionTokensRaw.map((x) => String(x || "").trim()).filter((x) => !!x);
  const mentionAliasesRaw = mentionObj.aliases && typeof mentionObj.aliases === "object" ? mentionObj.aliases : {};
  const mentionAliases = {};
  for (const [k, v] of Object.entries(mentionAliasesRaw)) {
    const key = String(k || "").trim();
    const val = String(v || "").trim();
    if (!key || !val) continue;
    mentionAliases[key] = val;
  }
  const mentionPrioritySecRaw = mentionObj.priority_throttle_sec ?? defaults.mention.priority_throttle_sec;
  const settingsReloadRaw = raw.settings_reload_interval_ms ?? baseConfig.settingsReloadPollMs ?? DEFAULT_SETTINGS_RELOAD_POLL_MS;

  const pollMs = Number(pollMsRaw);
  const throttleSec = Number(throttleSecRaw);
  const mentionPrioritySec = Number(mentionPrioritySecRaw);
  const settingsReloadMs = Number(settingsReloadRaw);
  if (!Number.isFinite(pollMs) || pollMs < 1) throw new Error("settings.poll_interval_ms_invalid");
  if (!Number.isFinite(throttleSec) || throttleSec < 1) throw new Error("settings.throttle_sec_invalid");
  if (!Number.isFinite(mentionPrioritySec) || mentionPrioritySec < 1) throw new Error("settings.mention.priority_throttle_sec_invalid");
  if (!Number.isFinite(settingsReloadMs) || settingsReloadMs < 1) throw new Error("settings.settings_reload_interval_ms_invalid");

  const apiBase = String(apiBaseRaw || "").trim() || DEFAULT_UI_API_BASE;
  return {
    uiApiBase: String(process.env.REGION_AI_UI_API_BASE || apiBase).trim() || DEFAULT_UI_API_BASE,
    notifyPollMs: Math.max(1000, Number(process.env.REGION_AI_NOTIFY_POLL_MS || pollMs)),
    notifyThrottleMs: Math.max(5000, Number(process.env.REGION_AI_NOTIFY_THROTTLE_MS || (throttleSec * 1000))),
    hotkeys: {
      focus_chatgpt: String(process.env.REGION_AI_HOTKEY_FOCUS_CHATGPT || fileHotkeys.focus_chatgpt).trim(),
      send_confirm: String(process.env.REGION_AI_HOTKEY_SEND_CONFIRM || fileHotkeys.send_confirm).trim(),
      capture_last: String(process.env.REGION_AI_HOTKEY_CAPTURE_LAST || fileHotkeys.capture_last).trim(),
      focus_region: String(process.env.REGION_AI_HOTKEY_FOCUS_REGION || fileHotkeys.focus_region).trim(),
    },
    mention: {
      enabled: mentionEnabled,
      tokens: mentionTokens,
      aliases: mentionAliases,
      priorityThrottleMs: mentionPrioritySec * 1000,
    },
    settingsReloadPollMs: Math.max(1000, Number(process.env.REGION_AI_SETTINGS_RELOAD_POLL_MS || settingsReloadMs)),
  };
}

function loadDesktopSettings() {
  const filePath = settingsPath();
  const defaults = defaultDesktopSettingsObj();
  const raw = readJsonFileSafe(filePath, defaults);
  if (!fs.existsSync(filePath)) {
    writeJsonAtomic(filePath, defaults);
  }
  const next = validateDesktopSettingsRaw(raw, runtimeConfig);
  runtimeConfig = next;
  settingsLoaded = true;
  return { ok: true, path: filePath };
}

function loadNotifyState() {
  const filePath = notifyStatePath();
  const raw = readJsonFileSafe(filePath, DEFAULT_NOTIFY_STATE);
  const lastNotified = raw.last_notified && typeof raw.last_notified === "object" ? raw.last_notified : {};
  notifyState = {
    last_notified: lastNotified,
    last_poll_ok_at: String(raw.last_poll_ok_at || ""),
    failure_count: Math.max(0, Number(raw.failure_count || 0)),
    backoff_ms: Math.max(1000, Number(raw.backoff_ms || DEFAULT_NOTIFY_POLL_MS)),
    inbox_last_written_ts: String(raw.inbox_last_written_ts || ""),
  };
  if (!fs.existsSync(filePath)) {
    writeJsonAtomic(filePath, notifyState);
    notifyStateSavedAtLeastOnce = true;
  }
  notifyStateLoaded = true;
  return { ok: true, path: filePath };
}

function saveNotifyState() {
  try {
    writeJsonAtomic(notifyStatePath(), notifyState);
    notifyStateSavedAtLeastOnce = true;
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

function initializeDesktopPersistence() {
  try {
    const s = loadDesktopSettings();
    const n = loadNotifyState();
    const persisted = saveNotifyState();
    try {
      settingsLastMtimeMs = fs.statSync(settingsPath()).mtimeMs;
    } catch {
      settingsLastMtimeMs = 0;
    }
    return { settings_ok: !!s.ok, notify_state_ok: !!n.ok, notify_state_saved: !!persisted.ok };
  } catch (e) {
    console.log(`[desktop_config] init_failed reason=${String(e && e.message ? e.message : e)}`);
    return { settings_ok: false, notify_state_ok: false, notify_state_saved: false };
  }
}

function unregisterManagedHotkeys() {
  for (const key of hotkeyRegisteredByAction.values()) {
    try {
      if (key) globalShortcut.unregister(key);
    } catch {
      // best effort
    }
  }
  hotkeyRegisteredByAction = new Map();
}

function appendCapturedSelection(text) {
  if (!text || !text.trim()) return;
  const workspace = resolveWorkspaceRoot();
  const chatDir = path.join(workspace, "ui", "chat");
  const outPath = path.join(chatDir, "external.jsonl");
  fs.mkdirSync(chatDir, { recursive: true });
  const row = {
    id: `msg_capture_${Date.now()}`,
    thread_id: "external",
    role: "chatgpt",
    kind: "note",
    text: text.slice(0, CAPTURE_MAX_CHARS),
    links: { source: "desktop_capture_fallback" },
    created_at: new Date().toISOString(),
  };
  fs.appendFileSync(outPath, JSON.stringify(row) + "\n", "utf8");
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function normalizeChatUrl() {
  const fromEnv = String(process.env.REGION_AI_CHAT_URL || "").trim();
  if (!fromEnv) return CHATGPT_ORIGIN;
  if (/^[A-Za-z]:[\\/]/.test(fromEnv) || fromEnv.startsWith("\\\\")) {
    return pathToFileURL(path.resolve(fromEnv)).toString();
  }
  return fromEnv;
}

const CHAT_VIEW_URL = normalizeChatUrl();
const LOCAL_TEST_CHAT_FILE_URL = pathToFileURL(path.resolve(__dirname, "test_chat.html")).toString();

function isAllowedChatTarget(urlText) {
  try {
    const u = new URL(urlText);
    if (u.protocol === "file:") {
      return u.href === LOCAL_TEST_CHAT_FILE_URL;
    }
    const host = u.hostname.toLowerCase();
    if (OPENAI_HOSTS.has(host)) return true;
    for (const base of OPENAI_HOSTS) {
      if (host.endsWith(`.${base}`)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function normalizeRoleId(input) {
  const candidate = String(input || "").trim().toLowerCase();
  if (!candidate || !ROLE_IDS.has(candidate)) return DEFAULT_ACTIVE_ROLE_ID;
  return candidate;
}

function getActiveChatView() {
  return chatViewsByRole.get(activeRoleId) || null;
}

function configureChatView(view) {
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedChatTarget(url)) {
      return { action: "allow" };
    }
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  view.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedChatTarget(url)) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });
}

function emitActiveRoleChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("bridge:active_role_changed", {
    role: activeRoleId,
    label: ROLE_CONFIGS.find((x) => x.id === activeRoleId)?.label || activeRoleId,
  });
}

function setActiveRole(roleInput, options) {
  const roleId = normalizeRoleId(roleInput);
  const shouldFocus = !(options && options.focus === false);
  activeRoleId = roleId;
  if (mainWindow && !mainWindow.isDestroyed()) {
    const view = getActiveChatView();
    if (view) {
      for (const [id, child] of chatViewsByRole.entries()) {
        if (!child) continue;
        if (id === roleId) {
          try {
            mainWindow.contentView.addChildView(child);
          } catch {
            // best effort
          }
        } else {
          try {
            mainWindow.contentView.removeChildView(child);
          } catch {
            // best effort
          }
        }
      }
      layoutViews();
      if (shouldFocus) {
        view.webContents.focus();
      }
    }
  }
  emitActiveRoleChanged();
  return { ok: true, role: activeRoleId };
}

function layoutViews() {
  if (!mainWindow || !regionView) return;
  const chatView = getActiveChatView();
  if (!chatView) return;
  const [w, h] = mainWindow.getContentSize();
  const bodyH = Math.max(120, h - TOP_BAR_HEIGHT);
  const leftW = clamp(Math.floor(w * 0.52), 380, w - 380);
  regionView.setBounds({ x: 0, y: TOP_BAR_HEIGHT, width: leftW, height: bodyH });
  chatView.setBounds({ x: leftW, y: TOP_BAR_HEIGHT, width: Math.max(380, w - leftW), height: bodyH });
}

function formatForTarget(text, target) {
  const body = String(text || "");
  if (target === "chatgpt") {
    return ["[Background]", "region_ai desktop bridge", "", "[Body]", body].join("\n");
  }
  if (target === "codex") {
    return ["DoD:", "- implement requested delta", "", "Input:", body].join("\n");
  }
  return body;
}

async function readClipboardBusLatest(target) {
  try {
    const resp = await fetch(`${runtimeConfig.uiApiBase}/api/chat/clipboard`, { method: "GET" });
    if (!resp.ok) return "";
    const obj = await resp.json();
    const items = Array.isArray(obj?.data?.items) ? obj.data.items : [];
    if (!items.length) return "";
    const roleKey = target === "codex" ? "codex" : "chatgpt";
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const it = items[i];
      if (String(it?.role || "").toLowerCase() === roleKey) {
        return String(it?.text || "");
      }
    }
    return String(items[items.length - 1]?.text || "");
  } catch {
    return "";
  }
}

async function readRegionSelectionText() {
  if (!regionView) return "";
  try {
    const text = await regionView.webContents.executeJavaScript(
      "(window.getSelection && window.getSelection().toString()) || ''",
      true,
    );
    return String(text || "").trim();
  } catch {
    return "";
  }
}

async function resolveOutgoingText(target, manualText) {
  const normalizedTarget = String(target || "").toLowerCase() === "codex" ? "codex" : "chatgpt";
  const manual = String(manualText || "").trim();
  const selectedText = String(selectedPayload?.text || "").trim();
  const domSelected = selectedText ? "" : await readRegionSelectionText();
  const bus = selectedText || domSelected ? "" : await readClipboardBusLatest(normalizedTarget);
  const raw = manual || selectedText || domSelected || bus || clipboard.readText();
  const text = manual ? raw : formatForTarget(raw, normalizedTarget);
  const source = manual ? "manual" : (selectedText ? "selected_payload" : (domSelected ? "selected_dom" : (bus ? "clipboard_bus" : "clipboard")));
  return { ok: true, target: normalizedTarget, text, source };
}

async function persistCapturedSelection(text) {
  const clipped = String(text || "").slice(0, CAPTURE_MAX_CHARS);
  if (!clipped.trim()) return { ok: true, saved: false };
  try {
    const resp = await fetch(`${runtimeConfig.uiApiBase}/api/chat/threads/external/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "chatgpt",
        kind: "note",
        text: clipped,
        links: { source: "desktop_capture" },
      }),
    });
    if (resp.ok) return { ok: true, saved: true };
  } catch {
    // fallback below
  }
  appendCapturedSelection(clipped);
  return { ok: true, saved: true, fallback: true };
}

async function persistCapturedResult(text, url, mode) {
  const raw = String(text || "");
  if (!raw.trim()) return { ok: true, saved: false, reason: "empty_text" };
  const truncated = raw.length > CAPTURE_LAST_MAX_CHARS;
  const clipped = truncated ? raw.slice(0, CAPTURE_LAST_MAX_CHARS) : raw;
  const links = {
    source: "desktop_capture_last",
    url: String(url || ""),
    ts: new Date().toISOString(),
    ...(truncated ? { note: "truncated" } : {}),
    ...(mode ? { mode } : {}),
  };
  try {
    const resp = await fetch(`${runtimeConfig.uiApiBase}/api/chat/threads/external/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "chatgpt",
        kind: "result",
        text: clipped,
        links,
      }),
    });
    if (resp.ok) return { ok: true, saved: true, truncated };
  } catch {
    // fallback below
  }

  const workspace = resolveWorkspaceRoot();
  const chatDir = path.join(workspace, "ui", "chat");
  const outPath = path.join(chatDir, "external.jsonl");
  fs.mkdirSync(chatDir, { recursive: true });
  const row = {
    id: `msg_capture_last_${Date.now()}`,
    thread_id: "external",
    role: "chatgpt",
    kind: "result",
    text: clipped,
    links: { ...links, source: "desktop_capture_last_fallback" },
    created_at: new Date().toISOString(),
  };
  fs.appendFileSync(outPath, JSON.stringify(row) + "\n", "utf8");
  return { ok: true, saved: true, truncated, fallback: true };
}

function emitSelectedPayload(payload) {
  selectedPayload = payload && typeof payload === "object" ? payload : null;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("bridge:selected_payload", selectedPayload);
  }
}

function focusTarget(target) {
  const normalized = String(target || "").toLowerCase();
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  if (normalized === "left" || normalized === "region" || normalized === "region_ui") {
    if (regionView) regionView.webContents.focus();
    return { ok: true, target: "left" };
  }
  if (normalized.startsWith("role:")) {
    const rolePart = normalized.slice("role:".length);
    const switched = setActiveRole(rolePart, { focus: true });
    return { ok: true, target: "chatgpt", role: switched.role };
  }
  const chatView = getActiveChatView();
  if (chatView) chatView.webContents.focus();
  return { ok: true, target: "chatgpt", role: activeRoleId };
}

function resolveDeepLinkTarget(payloadInput) {
  const payload = payloadInput && typeof payloadInput === "object" ? payloadInput : {};
  const runId = String(payload.run_id || "").trim();
  const threadId = String(payload.thread_id || "").trim();
  if (runId) return "runs";
  if (threadId) return "thread";
  return "inbox";
}

async function postRegionNavigate(payloadInput) {
  if (!regionView || !regionView.webContents || regionView.webContents.isDestroyed()) {
    return { ok: false, reason: "region_view_missing" };
  }
  const payload = payloadInput && typeof payloadInput === "object" ? payloadInput : {};
  const envelope = { type: "regionai:navigate", payload };
  const script = `window.postMessage(${JSON.stringify(envelope)}, '*'); true;`;
  try {
    await regionView.webContents.executeJavaScript(script, true);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

async function handleDeepLink(payloadInput) {
  const payload = payloadInput && typeof payloadInput === "object" ? payloadInput : {};
  const target = resolveDeepLinkTarget(payload);
  lastNotificationPayload = payload;
  focusTarget("region");
  const posted = await postRegionNavigate(payload);
  if (!posted.ok) {
    console.log(`[desktop_notify] deeplink_post_failed target=${target} reason=${String(posted.reason || "unknown")}`);
  }
  return { ok: true, target, post_ok: !!posted.ok };
}

async function pasteToChat(preferredText) {
  const chatView = getActiveChatView();
  if (!chatView) return { ok: false, mode: "no_view" };
  const text = String(preferredText || clipboard.readText() || "");
  chatView.webContents.focus();
  try {
    if (text) {
      await chatView.webContents.insertText(text);
      return { ok: true, mode: "insertText", length: text.length };
    }
  } catch {
    // fallback
  }
  try {
    if (text) clipboard.writeText(text);
    chatView.webContents.paste();
    return { ok: true, mode: "paste" };
  } catch {
    return { ok: true, mode: "focus_only" };
  }
}

async function captureSelectionFromChat() {
  const chatView = getActiveChatView();
  if (!chatView) return { ok: false, captured: "" };
  const captured = await chatView.webContents.executeJavaScript(
    "(window.getSelection && window.getSelection().toString()) || ''",
    true,
  );
  const text = String(captured || "");
  if (!text.trim()) return { ok: true, captured: "", saved: false };
  const saved = await persistCapturedSelection(text);
  return { ok: true, captured: text.slice(0, 200), saved: !!saved.saved, fallback: !!saved.fallback };
}

async function extractLastAssistantFromChat() {
  const chatView = getActiveChatView();
  if (!chatView) return { ok: false, mode: "no_view", text: "" };
  const script = `
    (() => {
      const out = { ok: false, mode: "none", text: "" };
      const test = Array.from(document.querySelectorAll(".assistant-msg[data-role='assistant']"));
      if (test.length > 0) {
        const last = test[test.length - 1];
        out.ok = true;
        out.mode = "test_harness_assistant";
        out.text = String(last.innerText || last.textContent || "");
        return out;
      }
      const c1 = Array.from(document.querySelectorAll("[data-message-author-role='assistant']"));
      if (c1.length > 0) {
        const last = c1[c1.length - 1];
        out.ok = true;
        out.mode = "chatgpt_role_selector";
        out.text = String(last.innerText || last.textContent || "");
        return out;
      }
      const c2 = Array.from(document.querySelectorAll("article[data-testid^='conversation-turn-'] .markdown"));
      if (c2.length > 0) {
        const last = c2[c2.length - 1];
        out.ok = true;
        out.mode = "chatgpt_markdown_selector";
        out.text = String(last.innerText || last.textContent || "");
        return out;
      }
      const c3 = Array.from(document.querySelectorAll("main .prose"));
      if (c3.length > 0) {
        const last = c3[c3.length - 1];
        out.ok = true;
        out.mode = "chatgpt_prose_selector";
        out.text = String(last.innerText || last.textContent || "");
        return out;
      }
      return out;
    })();
  `;
  try {
    const extracted = await chatView.webContents.executeJavaScript(script, true);
    const text = String(extracted && extracted.text ? extracted.text : "").trim();
    return {
      ok: !!(extracted && extracted.ok && text),
      mode: String(extracted && extracted.mode ? extracted.mode : "none"),
      text,
    };
  } catch (e) {
    return { ok: false, mode: "exception", text: "", reason: String(e && e.message ? e.message : e) };
  }
}

async function captureLastAssistantFromChat() {
  const chatView = getActiveChatView();
  if (!chatView) return { ok: false, mode: "no_view", text_len: 0, saved: false, reason: "chat_view_missing" };
  focusTarget("chatgpt");
  const extracted = await extractLastAssistantFromChat();
  const text = String(extracted.text || "").trim();
  if (!extracted.ok || !text) {
    return { ok: false, mode: "fallback_selection", text_len: 0, saved: false, reason: "assistant_last_not_found" };
  }
  const currentUrl = chatView.webContents.getURL();
  const saved = await persistCapturedResult(text, currentUrl, String(extracted.mode || "capture_last"));
  return {
    ok: true,
    mode: String(extracted.mode || "capture_last"),
    text_len: text.length,
    saved: !!saved.saved,
    reason: "",
    ...(saved.truncated ? { note: "truncated" } : {}),
    ...(saved.fallback ? { fallback: true } : {}),
  };
}

async function safeDomSendHook(expectedText) {
  const chatView = getActiveChatView();
  if (!chatView) return { ok: false, mode: "no_view", reason: "chat_view_missing" };
  const expected = JSON.stringify(String(expectedText || ""));
  const script = `
    (() => {
      const expectedText = ${expected};
      const out = { ok: false, mode: "none", reason: "" };
      const sendBtn = document.getElementById("sendBtn");
      if (sendBtn) {
        sendBtn.click();
        const log = document.getElementById("sentLog");
        const sentOk = !!(log && String(log.innerText || "").includes(expectedText));
        return { ok: sentOk, mode: "test_harness_send_btn", reason: sentOk ? "" : "harness_log_missing" };
      }
      const active = document.activeElement;
      if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT" || active.isContentEditable)) {
        const ev = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true });
        active.dispatchEvent(ev);
        return { ok: true, mode: "enter_key", reason: "" };
      }
      const selectorBtn = document.querySelector("button[data-testid='send-button'],button[aria-label*='Send'],button[aria-label*='送信']");
      if (selectorBtn) {
        selectorBtn.click();
        return { ok: true, mode: "selector_button", reason: "" };
      }
      out.reason = "no_send_hook";
      return out;
    })();
  `;
  try {
    const result = await chatView.webContents.executeJavaScript(script, true);
    return result && typeof result === "object" ? result : { ok: false, mode: "invalid_result", reason: "hook_result_invalid" };
  } catch (e) {
    return { ok: false, mode: "hook_exception", reason: String(e && e.message ? e.message : e) };
  }
}

async function sendToChat(text) {
  const body = String(text || "");
  if (!body.trim()) return { ok: false, mode: "empty", reason: "empty_text" };
  const chatView = getActiveChatView();
  if (!chatView) return { ok: false, mode: "no_view", reason: "chat_view_missing" };
  focusTarget("chatgpt");
  let insertOk = false;
  try {
    await chatView.webContents.insertText(body);
    insertOk = true;
  } catch (e) {
    insertOk = false;
    const fb = await pasteToChat(body);
    return { ok: false, mode: "fallback", reason: `insert_failed:${String(e && e.message ? e.message : e)}`, fallback: fb };
  }

  const dom = await safeDomSendHook(body);
  if (dom.ok) {
    return { ok: true, mode: dom.mode || (insertOk ? "insert_dom_send" : "dom_send"), reason: "" };
  }

  const fb = await pasteToChat(body);
  return { ok: false, mode: "fallback", reason: dom.reason || "dom_send_failed", fallback: fb };
}

function summarizeCouncilContributions(contribByRole) {
  const rows = [];
  for (const roleId of councilRoleOrder()) {
    const text = String(contribByRole[roleId] || "").trim();
    if (!text) continue;
    rows.push(`- ${councilRoleLabel(roleId)}: ${text.slice(0, 320).replace(/\s+/g, " ")}`);
  }
  return rows.join("\n");
}

function makeCouncilRolePrompt(run, roleId, roundNo, contribByRole) {
  const topic = String(run.topic || "").slice(0, COUNCIL_TOPIC_MAX_CHARS);
  const constraints = String(run.constraints || "").slice(0, COUNCIL_CONSTRAINTS_MAX_CHARS);
  const history = summarizeCouncilContributions(contribByRole);
  const identityBlock = formatIdentityBlock(roleId);
  return [
    "[Council Autopilot]",
    `role=${councilRoleLabel(roleId)} (${roleId})`,
    `round=${roundNo}/${Number(run.max_rounds || 1)}`,
    "",
    identityBlock || "",
    identityBlock ? "" : "",
    "[Topic]",
    topic,
    "",
    "[Constraints]",
    constraints || "(none)",
    "",
    "[Current discussion snapshot]",
    history || "(none yet)",
    "",
    "[Instruction]",
    "Output concise actionable points in Japanese. Keep it practical and role-specific.",
  ].join("\n");
}

function makeCouncilFinalPrompt(run, contribByRole) {
  const topic = String(run.topic || "").slice(0, COUNCIL_TOPIC_MAX_CHARS);
  const constraints = String(run.constraints || "").slice(0, COUNCIL_CONSTRAINTS_MAX_CHARS);
  const history = summarizeCouncilContributions(contribByRole);
  const identityBlock = formatIdentityBlock("facilitator");
  return [
    "[Council Final Synthesis]",
    "role=facilitator",
    "",
    identityBlock || "",
    identityBlock ? "" : "",
    "[Topic]",
    topic,
    "",
    "[Constraints]",
    constraints || "(none)",
    "",
    "[Role outputs]",
    history || "(none)",
    "",
    "[Instruction]",
    "Produce final answer with: 1) decision, 2) execution steps, 3) risks/checks. Japanese, concise.",
  ].join("\n");
}

function makeCouncilReflectionPrompt(previousAnswer, failures) {
  const failRows = Array.isArray(failures) && failures.length > 0
    ? failures.map((f, idx) => `- ${idx + 1}. ${String(f.key || "")}: ${String(f.note || "")}`).join("\n")
    : "- (none)";
  return [
    "[Council Reflection Fix]",
    "role=facilitator",
    "",
    "[前回最終回答]",
    String(previousAnswer || "").slice(0, FILE_CAP),
    "",
    "[品質NGポイント]",
    failRows,
    "",
    "[修正ルール]",
    "- 見出し「決定事項」「未決事項」「次アクション」を必ず含める",
    "- 次アクションは担当（司会/設計/実装/検証/道化師）と確認方法を必ず書く",
    "- 道化師の指摘があれば対応した旨を1行で明記",
    "- 余計な前置きは禁止、本文だけ出力",
  ].join("\n");
}

function councilGroundWordSection(finalText) {
  const text = String(finalText || "");
  const hit = text.match(/地雷ワード[\s\S]{0,800}/);
  return hit ? hit[0] : "";
}

function evaluateCouncilQuality(finalText) {
  const text = String(finalText || "");
  const failures = [];
  if (!text.includes("決定事項")) failures.push({ key: "missing_heading_決定事項", note: "見出し「決定事項」がありません" });
  if (!text.includes("未決事項")) failures.push({ key: "missing_heading_未決事項", note: "見出し「未決事項」がありません" });
  if (!text.includes("次アクション")) failures.push({ key: "missing_heading_次アクション", note: "見出し「次アクション」がありません" });
  const ground = councilGroundWordSection(text);
  if (ground && !/(空|なし|対応済|対応しました|対応完了)/.test(ground)) {
    failures.push({ key: "地雷ワード_section_not_resolved", note: "地雷ワードの対応済み記載がありません" });
  }
  return { ok: failures.length === 0, reasons: failures.map((x) => x.key), failures };
}

function buildCouncilAnswerMarkdown(run, finalText, quality, contributions, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const generatedBy = String(options.generated_by || "council_autopilot_v1.2");
  const reflected = options.reflected === true;
  const reflectionAttempts = Math.max(0, Math.min(COUNCIL_MAX_REFLECTION_ATTEMPTS, Number(options.reflection_attempts || 0)));
  const finalAnswerVersion = Number(options.final_answer_version) === 2 ? 2 : 1;
  const finalMode = String(options.finalization_mode || "normal");
  const failures = Array.isArray(options.failures) ? options.failures : [];
  const rows = [];
  rows.push(`# Council Answer`);
  rows.push("");
  rows.push(`- generated_by: ${generatedBy}`);
  rows.push(`- reflected: ${reflected ? "true" : "false"} attempts=${reflectionAttempts}`);
  rows.push(`- final_answer_version: ${finalAnswerVersion}`);
  rows.push(`- finalization_mode: ${finalMode}`);
  rows.push(`- run_id: ${String(run.run_id || "")}`);
  rows.push(`- thread_id: ${String(run.thread_id || "")}`);
  rows.push(`- generated_at: ${new Date().toISOString()}`);
  rows.push("");
  if (finalMode === "failed_quality") {
    rows.push("## FAILED_QUALITY");
    if (failures.length < 1) {
      rows.push("- unknown_quality_failure");
    } else {
      for (const f of failures) {
        if (!f || typeof f !== "object") continue;
        rows.push(`- ${String(f.key || "quality_failure")}: ${String(f.note || "")}`);
      }
    }
    rows.push("");
  }
  rows.push(`## 議題`);
  rows.push(String(run.topic || ""));
  rows.push("");
  rows.push(`## 制約`);
  rows.push(String(run.constraints || "(none)"));
  rows.push("");
  rows.push("## 決定事項");
  rows.push(String(finalText || ""));
  rows.push("");
  rows.push("## 未決事項");
  rows.push("- (必要なら追記)");
  rows.push("");
  rows.push("## 次アクション");
  rows.push("- [ ] 担当を割り当てる");
  rows.push("- [ ] 期限を設定する");
  rows.push("");
  rows.push("## 品質チェック");
  rows.push(`- result: ${quality.ok ? "pass" : "fail"}`);
  if (!quality.ok) {
    for (const r of quality.reasons) rows.push(`- reason: ${r}`);
  }
  rows.push("");
  rows.push("## 役割別メモ");
  for (const roleId of councilRoleOrder()) {
    const msg = String(contributions[roleId] || "").trim();
    if (!msg) continue;
    rows.push(`### ${councilRoleLabel(roleId)}`);
    rows.push(msg.slice(0, 1200));
    rows.push("");
  }
  return rows.join("\n").slice(0, FILE_CAP);
}

function councilTotalSteps(run) {
  const rounds = Math.max(1, Math.min(COUNCIL_MAX_ROUNDS, Number(run.max_rounds || 1)));
  return rounds * councilRoleOrder().length;
}

function councilStepToRoundRole(step) {
  const roles = councilRoleOrder();
  const idx = Math.max(0, Number(step || 0));
  return {
    round: Math.floor(idx / roles.length) + 1,
    roleId: roles[idx % roles.length],
  };
}

function getCouncilMentionToken() {
  const tokens = runtimeConfig.mention && Array.isArray(runtimeConfig.mention.tokens)
    ? runtimeConfig.mention.tokens
    : [];
  for (const t of tokens) {
    const v = String(t || "").trim();
    if (v) return v;
  }
  return "@shogun";
}

async function waitForAssistantChange(roleId, prevText, timeoutMs, runId) {
  const timeout = Math.max(1000, Number(timeoutMs || COUNCIL_WAIT_ASSISTANT_TIMEOUT_MS));
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (runId) {
      const snap = readCouncilRun(runId);
      if (snap && (snap.stop_requested || String(snap.status || "") === "canceled")) {
        return { ok: false, text: "", mode: "canceled" };
      }
    }
    setActiveRole(roleId, { focus: true });
    const out = await extractLastAssistantFromChat();
    const text = String(out.text || "").trim();
    if (out.ok && text && text !== String(prevText || "")) {
      return { ok: true, text, mode: out.mode || "assistant_changed" };
    }
    await new Promise((resolve) => setTimeout(resolve, COUNCIL_WAIT_ASSISTANT_INTERVAL_MS));
  }
  return { ok: false, text: "", mode: "timeout" };
}

function readCouncilRequestFiles() {
  try {
    fs.mkdirSync(councilRequestsDir(), { recursive: true });
    const files = fs.readdirSync(councilRequestsDir())
      .filter((name) => name.endsWith(".json"))
      .sort();
    return files;
  } catch {
    return [];
  }
}

function claimCouncilRequestFile(name) {
  try {
    const src = path.join(councilRequestsDir(), name);
    const dst = path.join(councilRequestsDir(), `${name}.processing`);
    fs.renameSync(src, dst);
    return dst;
  } catch {
    return "";
  }
}

async function postCouncilActivity(eventType, run, summary, refsExtra) {
  await postUiApiJson("/api/activity/emit", {
    event_type: eventType,
    actor_id: "council_autopilot",
    title: `Council ${eventType.replace("council_", "")}`,
    summary: String(summary || "").slice(0, COUNCIL_SUMMARY_MAX_CHARS),
    refs: {
      thread_id: String(run.thread_id || ""),
      run_id: String(run.run_id || ""),
      request_id: String(run.request_id || ""),
      ...(refsExtra && typeof refsExtra === "object" ? refsExtra : {}),
    },
  });
}

async function runCouncilAutopilot(run) {
  const runId = String(run.run_id || "").trim();
  if (!runId) return { ok: false, reason: "missing_run_id" };
  councilActiveRunId = runId;
  const roleLastText = {};
  const contributions = {};
  try {
    const existing = readCouncilRun(runId) || run;
    const totalSteps = councilTotalSteps(existing);
    let stepCursor = Math.max(0, Number(existing.current_step || existing.step_count || 0));
    let reflectionAttempts = Math.max(0, Math.min(COUNCIL_MAX_REFLECTION_ATTEMPTS, Number(existing?.reflection?.attempts || 0)));
    saveCouncilRun({
      run_id: runId,
      status: "running",
      started_at: String(existing.started_at || new Date().toISOString()),
      step_count: Math.max(0, Number(existing.step_count || 0)),
      current_step: stepCursor,
      retries: Number(existing.retries || 0),
      current_role: "",
      last_error: "",
      can_resume: false,
      stop_requested: false,
      reflection: {
        attempts: reflectionAttempts,
        max_attempts: COUNCIL_MAX_REFLECTION_ATTEMPTS,
        last_reflection_at: existing?.reflection?.last_reflection_at || null,
      },
      quality_check: existing?.quality_check || { passed: false, failures: [] },
      finalization: existing?.finalization || { mode: "normal", final_answer_version: 1 },
    });
    appendCouncilLog(runId, { type: "run_start", title: "Council run started", summary: `thread=${run.thread_id}` });
    await postCouncilActivity("council_step", run, "run_started");

    while (stepCursor < totalSteps) {
      const { round, roleId } = councilStepToRoundRole(stepCursor);
        const fresh = readCouncilRun(runId);
        if (fresh && (fresh.stop_requested || String(fresh.status || "") === "canceled")) {
          saveCouncilRun({ run_id: runId, status: "canceled", finished_at: new Date().toISOString(), can_resume: true });
          appendCouncilLog(runId, { type: "canceled", round, role: roleId, title: "Cancel requested" });
          await postCouncilActivity("council_finished", { ...run, ...fresh }, "canceled_by_request");
          return { ok: true, stopped: true };
        }
        saveCouncilRun({ run_id: runId, current_role: roleId, current_step: stepCursor });
        setActiveRole(roleId, { focus: true });
        const prompt = makeCouncilRolePrompt(run, roleId, round, contributions);
        const sent = await sendToChat(prompt);
        if (!sent || !sent.ok) {
          const retries = Number((readCouncilRun(runId) || {}).retries || 0) + 1;
          saveCouncilRun({ run_id: runId, retries, last_error: `send_failed:${roleId}` });
          throw new Error(`send_failed:${roleId}`);
        }
        const waited = await waitForAssistantChange(roleId, roleLastText[roleId] || "", COUNCIL_WAIT_ASSISTANT_TIMEOUT_MS, runId);
        if (!waited.ok) {
          if (waited.mode === "canceled") {
            saveCouncilRun({ run_id: runId, status: "canceled", finished_at: new Date().toISOString(), can_resume: true });
            return { ok: true, stopped: true };
          }
          const retries = Number((readCouncilRun(runId) || {}).retries || 0) + 1;
          saveCouncilRun({ run_id: runId, retries, last_error: `assistant_timeout:${roleId}` });
          throw new Error(`assistant_timeout:${roleId}`);
        }
        roleLastText[roleId] = waited.text;
        contributions[roleId] = waited.text;
        const posted = await postUiApiJson(`/api/chat/threads/${encodeURIComponent(String(run.thread_id || "general"))}/messages`, {
          role: councilChatRole(roleId),
          kind: "message",
          text: waited.text.slice(0, FILE_CAP),
          links: { source: "council_autopilot", run_id: runId },
        });
        if (!posted.ok) throw new Error(`chat_post_failed:${roleId}`);
        stepCursor += 1;
        saveCouncilRun({ run_id: runId, step_count: stepCursor, current_step: stepCursor, last_captured_msg: waited.text.slice(0, 1000) });
        appendCouncilLog(runId, {
          type: "role_message",
          role: roleId,
          round,
          title: `${councilRoleLabel(roleId)} response`,
          summary: waited.text.slice(0, 320),
        });
        await postCouncilActivity("council_step", run, `round=${round} role=${roleId}`);
    }

    setActiveRole("facilitator", { focus: true });
    const finalPrompt = makeCouncilFinalPrompt(run, contributions);
    const finalSent = await sendToChat(finalPrompt);
    if (!finalSent || !finalSent.ok) throw new Error("final_send_failed");
    const finalWait = await waitForAssistantChange("facilitator", roleLastText.facilitator || "", COUNCIL_WAIT_ASSISTANT_TIMEOUT_MS, runId);
    if (!finalWait.ok) throw new Error("final_timeout");
    const finalPosted = await postUiApiJson(`/api/chat/threads/${encodeURIComponent(String(run.thread_id || "general"))}/messages`, {
      role: "facilitator",
      kind: "message",
      text: finalWait.text.slice(0, FILE_CAP),
      links: { source: "council_autopilot_final", run_id: runId },
    });
    if (!finalPosted.ok) throw new Error("final_chat_post_failed");
    let finalText = String(finalWait.text || "");
    let finalMessageId = String((finalPosted.data && finalPosted.data.id) || "");
    let finalAnswerVersion = 1;
    let finalizationMode = "normal";
    let quality = evaluateCouncilQuality(finalText);

    saveCouncilRun({
      run_id: runId,
      quality_check: { passed: quality.ok, failures: quality.failures },
      reflection: { attempts: reflectionAttempts, max_attempts: COUNCIL_MAX_REFLECTION_ATTEMPTS, last_reflection_at: existing?.reflection?.last_reflection_at || null },
      finalization: { mode: "normal", final_answer_version: 1 },
    });

    if (!quality.ok && reflectionAttempts < COUNCIL_MAX_REFLECTION_ATTEMPTS) {
      reflectionAttempts += 1;
      const reflectedAt = new Date().toISOString();
      saveCouncilRun({
        run_id: runId,
        reflection: { attempts: reflectionAttempts, max_attempts: COUNCIL_MAX_REFLECTION_ATTEMPTS, last_reflection_at: reflectedAt },
        quality_check: { passed: false, failures: quality.failures },
        finalization: { mode: "normal", final_answer_version: 1 },
      });
      appendCouncilLog(runId, {
        type: "reflection_start",
        role: "facilitator",
        title: "Council reflection started",
        summary: quality.reasons.join(", ").slice(0, 320),
      });
      await postCouncilActivity("council_step", run, `reflection_attempt=${reflectionAttempts}`);

      setActiveRole("facilitator", { focus: true });
      const reflectPrompt = makeCouncilReflectionPrompt(finalText, quality.failures);
      const reflectSent = await sendToChat(reflectPrompt);
      if (!reflectSent || !reflectSent.ok) throw new Error("reflection_send_failed");
      const reflectWait = await waitForAssistantChange("facilitator", roleLastText.facilitator || finalText, COUNCIL_WAIT_ASSISTANT_TIMEOUT_MS, runId);
      if (!reflectWait.ok) {
        if (reflectWait.mode === "canceled") {
          saveCouncilRun({ run_id: runId, status: "canceled", finished_at: new Date().toISOString(), can_resume: true });
          return { ok: true, stopped: true };
        }
        throw new Error("reflection_timeout");
      }
      roleLastText.facilitator = reflectWait.text;
      const reflectedPosted = await postUiApiJson(`/api/chat/threads/${encodeURIComponent(String(run.thread_id || "general"))}/messages`, {
        role: "facilitator",
        kind: "message",
        text: reflectWait.text.slice(0, FILE_CAP),
        links: { source: "council_autopilot_reflection", run_id: runId },
      });
      if (!reflectedPosted.ok) throw new Error("reflection_chat_post_failed");
      finalText = String(reflectWait.text || "");
      finalMessageId = String((reflectedPosted.data && reflectedPosted.data.id) || finalMessageId);
      finalAnswerVersion = 2;
      finalizationMode = "reflected";
      quality = evaluateCouncilQuality(finalText);
      saveCouncilRun({
        run_id: runId,
        quality_check: { passed: quality.ok, failures: quality.failures },
        reflection: { attempts: reflectionAttempts, max_attempts: COUNCIL_MAX_REFLECTION_ATTEMPTS, last_reflection_at: reflectedAt },
        finalization: { mode: quality.ok ? "reflected" : "failed_quality", final_answer_version: 2 },
      });
    }
    if (!quality.ok) {
      finalizationMode = "failed_quality";
    }
    const answerMarkdown = buildCouncilAnswerMarkdown(run, finalText, quality, contributions, {
      generated_by: "council_autopilot_v1.2",
      reflected: finalizationMode === "reflected",
      reflection_attempts: reflectionAttempts,
      final_answer_version: finalAnswerVersion,
      finalization_mode: finalizationMode,
      failures: quality.failures,
    });
    let taskifyDraftId = "";
    let taskifyRequestId = "";
    let artifactRunId = "";
    let artifactStatus = "";
    let artifactPath = "";
    let bundlePath = "";
    const artifactOut = await postUiApiJson("/api/council/artifact/queue", {
      run_id: runId,
      thread_id: String(run.thread_id || "general"),
      answer_markdown: answerMarkdown,
      include_bundle: true,
    });
    if (artifactOut.ok) {
      artifactStatus = "queued";
      artifactPath = String(artifactOut.data.answer_path || "");
      bundlePath = String(artifactOut.data.bundle_path || "");
      artifactRunId = String(artifactOut.data.task_id || "");
    }
    if (run.auto_build === true) {
      const draftOut = await postUiApiJson("/api/taskify/drafts", {
        source: { thread_id: String(run.thread_id || "general"), msg_id: "" },
        title: `Council build ${runId}`,
        text: answerMarkdown.slice(0, 12000),
        links: { run_id: runId, source: "council_autopilot" },
      });
      if (draftOut.ok && draftOut.data && draftOut.data.id) {
        taskifyDraftId = String(draftOut.data.id || "");
        const queueOut = await postUiApiJson("/api/taskify/queue", { draft_id: taskifyDraftId });
        if (queueOut.ok && queueOut.data && queueOut.data.request_id) {
          taskifyRequestId = String(queueOut.data.request_id || "");
        }
      }
    }
    const artifactPaths = [artifactPath, bundlePath].filter((x) => !!String(x || "").trim());
    if (finalizationMode === "failed_quality") {
      const mentionToken = getCouncilMentionToken();
      appendInboxEntry({
        thread_id: String(run.thread_id || "general"),
        msg_id: finalMessageId,
        role: "facilitator",
        mention: true,
        title: "Council failed quality",
        body: `${mentionToken} run_id=${runId} failures=${quality.reasons.join(", ")}`,
        source: "council_autopilot",
        links: { run_id: runId, request_id: String(run.request_id || ""), artifact_paths: artifactPaths },
      });
    }
    saveCouncilRun({
      run_id: runId,
      status: finalizationMode === "failed_quality" ? "failed" : "completed",
      finished_at: new Date().toISOString(),
      step_count: stepCursor + 1,
      current_step: totalSteps,
      current_role: "facilitator",
      final_message_id: finalMessageId,
      taskify_draft_id: taskifyDraftId,
      taskify_request_id: taskifyRequestId,
      artifact_run_id: artifactRunId,
      artifact_status: artifactStatus || (artifactOut.ok ? "queued" : "failed"),
      artifact_path: artifactPath,
      bundle_path: bundlePath,
      can_resume: finalizationMode === "failed_quality",
      last_error: finalizationMode === "failed_quality" ? `failed_quality:${quality.reasons.join(",")}` : "",
      quality_check: { passed: quality.ok, failures: quality.failures },
      reflection: {
        attempts: reflectionAttempts,
        max_attempts: COUNCIL_MAX_REFLECTION_ATTEMPTS,
        last_reflection_at: reflectionAttempts > 0 ? new Date().toISOString() : (existing?.reflection?.last_reflection_at || null),
      },
      finalization: {
        mode: finalizationMode,
        final_answer_version: finalAnswerVersion === 2 ? 2 : 1,
      },
    });
    if (finalizationMode === "failed_quality") {
      appendCouncilLog(runId, { type: "failed_quality", title: "Council run failed quality", summary: quality.reasons.join(", ").slice(0, 320) });
      await postCouncilActivity("council_finished", run, `failed_quality run_id=${runId}`, { request_id: String(run.request_id || "") });
      return { ok: false, reason: "failed_quality" };
    }

    appendCouncilLog(runId, { type: "completed", title: "Council run completed", summary: finalText.slice(0, 320) });
    appendInboxEntry({
      thread_id: String(run.thread_id || "general"),
      msg_id: finalMessageId,
      role: "facilitator",
      mention: false,
      title: finalizationMode === "reflected" ? "Council complete (reflected)" : "Council autopilot completed",
      body: `run_id=${runId} thread_id=${run.thread_id || "general"} reflected=${finalizationMode === "reflected" ? "true" : "false"}`,
      source: "council_autopilot",
      links: {
        run_id: runId,
        request_id: String(run.request_id || ""),
        artifact_paths: artifactPaths,
      },
    });
    await postCouncilActivity("council_finished", run, `completed run_id=${runId} mode=${finalizationMode}`, { request_id: String(run.request_id || "") });
    return { ok: true, reflected: finalizationMode === "reflected" };
  } catch (e) {
    const reason = String(e && e.message ? e.message : e);
    saveCouncilRun({ run_id: runId, status: "failed", finished_at: new Date().toISOString(), last_error: reason, can_resume: true });
    appendCouncilLog(runId, { type: "failed", title: "Council run failed", summary: reason });
    await postCouncilActivity("council_finished", run, `failed:${reason}`);
    return { ok: false, reason };
  } finally {
    councilActiveRunId = "";
  }
}

async function processCouncilRequestsOnce() {
  if (councilRunnerBusy) return;
  councilRunnerBusy = true;
  try {
    const names = readCouncilRequestFiles();
    for (const name of names) {
      const claimed = claimCouncilRequestFile(name);
      if (!claimed) continue;
      let reqObj = null;
      try {
        reqObj = readJsonFileSafe(claimed, null);
      } catch {
        reqObj = null;
      }
      try {
        if (reqObj && typeof reqObj === "object") {
          const run = readCouncilRun(reqObj.run_id);
          if (run && String(run.status || "") === "queued") {
            await runCouncilAutopilot(run);
          }
        }
      } finally {
        try {
          if (fs.existsSync(claimed)) fs.unlinkSync(claimed);
        } catch {
          // best effort
        }
      }
    }
  } finally {
    councilRunnerBusy = false;
  }
}

function startCouncilPolling() {
  if (councilPollTimer) return { ok: true, started: false };
  councilPollTimer = setInterval(() => {
    processCouncilRequestsOnce().catch(() => {});
  }, COUNCIL_POLL_INTERVAL_MS);
  if (councilPollTimer && typeof councilPollTimer.unref === "function") councilPollTimer.unref();
  processCouncilRequestsOnce().catch(() => {});
  return { ok: true, started: true };
}

function stopCouncilPolling() {
  if (!councilPollTimer) return;
  clearInterval(councilPollTimer);
  councilPollTimer = null;
}

function firstLine(input) {
  const line = String(input || "").split(/\r?\n/)[0] || "";
  return line.trim().slice(0, 180);
}

function detectMentionMeta(text, role) {
  const body = String(text || "");
  const roleText = String(role || "").trim() || "unknown";
  if (!runtimeConfig.mention.enabled) {
    return { mention: false, token: "", role: roleText };
  }
  const tokens = Array.isArray(runtimeConfig.mention.tokens) ? runtimeConfig.mention.tokens : [];
  for (const token of tokens) {
    if (!token) continue;
    if (body.includes(token)) {
      return { mention: true, token, role: roleText };
    }
  }
  const aliases = runtimeConfig.mention.aliases && typeof runtimeConfig.mention.aliases === "object"
    ? runtimeConfig.mention.aliases
    : {};
  for (const [alias, mapped] of Object.entries(aliases)) {
    if (!alias) continue;
    if (body.includes(alias)) {
      return { mention: true, token: String(mapped || alias), role: roleText };
    }
  }
  return { mention: false, token: "", role: roleText };
}

async function fetchJson(url) {
  try {
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

async function fetchJsonOrThrow(url) {
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) throw new Error(`http_${resp.status}`);
  return await resp.json();
}

function pickThreadNotificationMessage(rows, lastNotifiedId) {
  if (!Array.isArray(rows) || rows.length < 1) return null;
  const notified = String(lastNotifiedId || "");
  if (!notified) return rows[rows.length - 1];
  const idx = rows.findIndex((r) => String(r?.id || "") === notified);
  if (idx >= 0) {
    if (idx >= rows.length - 1) return null;
    return rows[idx + 1];
  }
  const latest = rows[rows.length - 1];
  if (String(latest?.id || "") === notified) return null;
  return latest;
}

async function loadUnreadSnapshot() {
  const threadsResp = await fetchJsonOrThrow(`${runtimeConfig.uiApiBase}/api/chat/threads`);
  const readResp = await fetchJsonOrThrow(`${runtimeConfig.uiApiBase}/api/chat/read_state`);
  const threads = Array.isArray(threadsResp?.data?.threads) ? threadsResp.data.threads : [];
  const readState = readResp?.data?.read_state && typeof readResp.data.read_state === "object"
    ? readResp.data.read_state
    : {};
  const counts = new Map();
  let candidate = null;

  for (const t of threads) {
    const threadId = String(t?.id || "");
    if (!threadId) continue;
    const title = String(t?.title || threadId);
    const state = readState[threadId] && typeof readState[threadId] === "object" ? readState[threadId] : {};
    const unreadAfterId = String(state.last_seen_msg_id || "");
    const msgsResp = await fetchJsonOrThrow(`${runtimeConfig.uiApiBase}/api/chat/threads/${encodeURIComponent(threadId)}/messages?limit=200&after=${encodeURIComponent(unreadAfterId)}`);
    const rows = Array.isArray(msgsResp?.data?.messages) ? msgsResp.data.messages : [];
    const unread = Math.max(0, rows.length);
    counts.set(threadId, unread);
    if (unread <= 0) continue;
    const msg = pickThreadNotificationMessage(rows, notifyState.last_notified[threadId]);
    if (!msg || !String(msg.id || "").trim()) continue;
    const mentionMeta = detectMentionMeta(msg.text || "", msg.role || "");
    const next = {
      thread_id: threadId,
      msg_id: String(msg.id),
      title,
      body: firstLine(msg.text || ""),
      role: String(msg.role || "unknown"),
      mention: !!mentionMeta.mention,
      mention_token: String(mentionMeta.token || ""),
      links: msg.links && typeof msg.links === "object" ? msg.links : {},
      unread,
    };
    if (!candidate || (next.mention && !candidate.mention) || (next.mention === candidate.mention && unread > candidate.unread)) {
      candidate = next;
    }
  }

  return { counts, candidate };
}

function showUnreadNotification(item, deepLinkPayload) {
  if (!Notification.isSupported()) return { ok: false, reason: "notification_not_supported" };
  const isMention = !!item?.mention;
  const titleCore = String(item?.title || "region_ai");
  const title = isMention ? `[MENTION] ${titleCore}` : titleCore;
  const bodyBase = String(item?.body || "").trim();
  const unread = Number(item?.unread || 0);
  const roleText = String(item?.role || "unknown");
  const mentionText = isMention ? ` mention=${String(item?.mention_token || "token")}` : "";
  const body = bodyBase
    ? `[${roleText}]${mentionText} ${bodyBase}`
    : `[${roleText}]${mentionText} ${unread} unread message(s)`;
  try {
    lastNotificationPayload = deepLinkPayload && typeof deepLinkPayload === "object" ? deepLinkPayload : null;
    const n = new Notification({
      title,
      body,
      silent: false,
      urgency: "normal",
    });
    n.on("click", () => {
      handleDeepLink(deepLinkPayload || {}).catch(() => {});
    });
    n.show();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

async function pollUnreadAndNotify() {
  const snapshot = await loadUnreadSnapshot();
  if (!snapshot || !(snapshot.counts instanceof Map)) return { ok: false, reason: "invalid_snapshot" };

  notifyState.last_poll_ok_at = new Date().toISOString();
  notifyState.failure_count = 0;
  notifyState.backoff_ms = DEFAULT_NOTIFY_POLL_MS;

  if (!snapshot.candidate) {
    saveNotifyState();
    return { ok: true, notified: false };
  }

  const already = String(notifyState.last_notified[snapshot.candidate.thread_id] || "");
  if (already && already === snapshot.candidate.msg_id) {
    saveNotifyState();
    return { ok: true, notified: false };
  }

  const now = Date.now();
  const throttleMs = snapshot.candidate.mention
    ? Math.max(1000, Number(runtimeConfig.mention.priorityThrottleMs || 1000))
    : runtimeConfig.notifyThrottleMs;
  if (now - lastNotifyAt < throttleMs) {
    saveNotifyState();
    return { ok: true, notified: false, throttled: true };
  }
  const deepLinkPayload = {
    type: "notify_click",
    ts: new Date().toISOString(),
    thread_id: String(snapshot.candidate.thread_id || ""),
    msg_id: String(snapshot.candidate.msg_id || ""),
    inbox_id: "",
    run_id: String(snapshot.candidate?.links?.run_id || ""),
    design_id: String(snapshot.candidate?.links?.design_id || ""),
    source: "desktop_notify",
    mention: !!snapshot.candidate.mention,
  };
  const shown = showUnreadNotification(snapshot.candidate, deepLinkPayload);
  if (shown.ok) {
    const inboxAdded = appendInboxEntry({
      thread_id: snapshot.candidate.thread_id,
      msg_id: snapshot.candidate.msg_id,
      role: snapshot.candidate.role,
      mention: snapshot.candidate.mention,
      title: snapshot.candidate.title,
      body: snapshot.candidate.body,
      links: snapshot.candidate.links || {},
    });
    if (inboxAdded && inboxAdded.ok && inboxAdded.id) {
      deepLinkPayload.inbox_id = String(inboxAdded.id);
      lastNotificationPayload = deepLinkPayload;
    }
    lastNotifyAt = now;
    notifyState.last_notified[snapshot.candidate.thread_id] = snapshot.candidate.msg_id;
  }
  saveNotifyState();
  return { ok: true, notified: !!shown.ok };
}

function scheduleUnreadPoll(delayMs) {
  if (isQuitting) return;
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    runUnreadPollingCycle().catch(() => {});
  }, Math.max(0, Number(delayMs || 0)));
  if (notifyTimer && typeof notifyTimer.unref === "function") notifyTimer.unref();
}

async function runUnreadPollingCycle() {
  try {
    await pollUnreadAndNotify();
    scheduleUnreadPoll(runtimeConfig.notifyPollMs);
  } catch (e) {
    const prevBackoff = Math.max(1000, Number(notifyState.backoff_ms || DEFAULT_NOTIFY_POLL_MS));
    notifyState.failure_count = Math.max(0, Number(notifyState.failure_count || 0)) + 1;
    notifyState.backoff_ms = Math.min(prevBackoff * 2, BACKOFF_MAX_MS);
    saveNotifyState();
    console.log(`[desktop_notify] poll_failed count=${notifyState.failure_count} backoff_ms=${notifyState.backoff_ms} reason=${String(e && e.message ? e.message : e)}`);
    scheduleUnreadPoll(notifyState.backoff_ms);
  }
}

function startUnreadPolling() {
  if (notifyTimer) return { ok: true, started: false, backoff_ms: notifyState.backoff_ms };
  scheduleUnreadPoll(0);
  return { ok: true, started: true };
}

function stopUnreadPolling() {
  if (!notifyTimer) return;
  clearTimeout(notifyTimer);
  notifyTimer = null;
}

function reconnectApiPollingNow() {
  notifyState.failure_count = 0;
  notifyState.backoff_ms = DEFAULT_NOTIFY_POLL_MS;
  saveNotifyState();
  scheduleUnreadPoll(0);
  return { ok: true };
}

function scheduleSettingsPoll(delayMs) {
  if (isQuitting) return;
  if (settingsPollTimer) clearTimeout(settingsPollTimer);
  settingsPollTimer = setTimeout(() => {
    settingsPollTimer = null;
    checkSettingsHotReloadOnce("timer").catch(() => {});
  }, Math.max(0, Number(delayMs || 0)));
  if (settingsPollTimer && typeof settingsPollTimer.unref === "function") settingsPollTimer.unref();
}

function stopSettingsPolling() {
  if (!settingsPollTimer) return;
  clearTimeout(settingsPollTimer);
  settingsPollTimer = null;
}

function applyRuntimeConfigReload(nextConfig, reason) {
  runtimeConfig = nextConfig;
  registerGlobalHotkeys();
  createTrayMenu();
  // notify polling loop uses runtimeConfig dynamically; reschedule for faster application of new poll interval
  scheduleUnreadPoll(0);
  console.log(`[desktop_settings] reloaded reason=${reason} poll_ms=${runtimeConfig.notifyPollMs} reload_poll_ms=${runtimeConfig.settingsReloadPollMs}`);
}

function reloadSettings(reason) {
  try {
    const raw = readJsonFileSafe(settingsPath(), defaultDesktopSettingsObj());
    const next = validateDesktopSettingsRaw(raw, runtimeConfig);
    applyRuntimeConfigReload(next, reason);
    settingsHotReloadedAtLeastOnce = true;
    return { ok: true };
  } catch (e) {
    console.log(`[desktop_settings] reload_failed reason=${reason} error=${String(e && e.message ? e.message : e)}`);
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

async function checkSettingsHotReloadOnce(reason) {
  try {
    const st = fs.statSync(settingsPath());
    const nextMtime = Number(st.mtimeMs || 0);
    if (nextMtime > settingsLastMtimeMs) {
      settingsLastMtimeMs = nextMtime;
      reloadSettings(reason);
    }
  } catch {
    // keep previous settings
  } finally {
    scheduleSettingsPoll(runtimeConfig.settingsReloadPollMs);
  }
}

function startSettingsPolling() {
  if (settingsPollTimer) return { ok: true, started: false };
  scheduleSettingsPoll(0);
  return { ok: true, started: true };
}

async function runSendConfirmAction() {
  const resolved = await resolveOutgoingText("chatgpt", "");
  const text = String(resolved.text || "");
  if (!text.trim()) return { ok: false, mode: "empty", reason: "empty_text" };
  const preview = text.length > 1500 ? `${text.slice(0, 1500)}\n...(truncated)...` : text;
  const confirm = await dialog.showMessageBox(mainWindow || null, {
    type: "question",
    buttons: ["Send", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: "Send to ChatGPT",
    message: "Send resolved text to ChatGPT?",
    detail: preview,
  });
  if (confirm.response !== 0) return { ok: false, mode: "canceled", reason: "user_canceled" };
  const sent = await sendToChat(text);
  return { ...sent, source: resolved.source, length: text.length };
}

function registerGlobalHotkeys() {
  hotkeysDisabled = [];
  unregisterManagedHotkeys();
  const bindings = [
    { id: "focus_chatgpt", key: runtimeConfig.hotkeys.focus_chatgpt, handler: () => { focusTarget("chatgpt"); } },
    { id: "send_confirm", key: runtimeConfig.hotkeys.send_confirm, handler: () => { runSendConfirmAction().catch(() => {}); } },
    { id: "capture_last", key: runtimeConfig.hotkeys.capture_last, handler: () => { captureLastAssistantFromChat().catch(() => {}); } },
    { id: "focus_region", key: runtimeConfig.hotkeys.focus_region, handler: () => { focusTarget("region"); } },
  ];
  let registered = 0;
  for (const b of bindings) {
    if (!b.key) continue;
    try {
      const ok = globalShortcut.register(b.key, b.handler);
      if (ok) {
        registered += 1;
        hotkeyRegisteredByAction.set(b.id, b.key);
      } else {
        hotkeysDisabled.push({ id: b.id, key: b.key, reason: "register_returned_false" });
        console.log(`[desktop_hotkey] disabled id=${b.id} key=${b.key} reason=register_returned_false`);
      }
    } catch (e) {
      hotkeysDisabled.push({ id: b.id, key: b.key, reason: "register_exception" });
      console.log(`[desktop_hotkey] disabled id=${b.id} key=${b.key} reason=${String(e && e.message ? e.message : e)}`);
    }
  }
  hotkeysRegistered = registered;
  return { ok: true, requested: bindings.filter((b) => !!b.key).length, registered, disabled: hotkeysDisabled.slice() };
}

function createTrayImage() {
  const pngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAkFBMVEUAAABRVmJrvf9jsf9grf9Zpv9VpP9Qof9Ln/9GnP9Cmf89lv84k/8zj/8ujP8piP8khP8fgP8afP8VeP8QdP8LcP8GbP8BaP8AZf8AYv8AX/8AXP8AWf8AVv8AU/8AUP8ATf8ASv8AR/8ARP8AQf89PP84OP8zNP8uMP8pLP8jKP8eJP8ZIP8UHf8PGf8KFf8FEP8BDEP8AAnYAAAAKXRSTlMAAQIFCAsQExgbHSAjJi0wMzY5PD9CRUhLTlFUV1pdYGNmaWxvcnXfVRFlAAAAbUlEQVQY02NgYGBkYmVjZ2Dg4uHl4+fgFhAUEhYRFROPkIhYJ8QhKiYuISklLSMrJy8gqKSsoq6hr6BopKikrqGvoGAA0RZnZWNrY+fgFxAWERYRFxCUkZeQlJKWkp6RlpGVk5eSlQwA6jEHfdG8Q0cAAAAASUVORK5CYII=";
  return nativeImage.createFromDataURL(pngDataUrl);
}

function createTrayMenu() {
  const menu = Menu.buildFromTemplate([
    { label: "Show/Hide", click: () => toggleMainWindowVisibility() },
    { label: "Focus ChatGPT", accelerator: runtimeConfig.hotkeys.focus_chatgpt || undefined, click: () => focusTarget("chatgpt") },
    { label: "Send (confirm)", accelerator: runtimeConfig.hotkeys.send_confirm || undefined, click: () => { runSendConfirmAction().catch(() => {}); } },
    { label: "Capture last", accelerator: runtimeConfig.hotkeys.capture_last || undefined, click: () => { captureLastAssistantFromChat().catch(() => {}); } },
    {
      label: "Open last notification target",
      click: () => {
        if (lastNotificationPayload) {
          handleDeepLink(lastNotificationPayload).catch(() => {});
          return;
        }
        focusTarget("region");
      },
    },
    { label: "Reconnect API", click: () => reconnectApiPollingNow() },
    { type: "separator" },
    { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
  ]);
  if (tray) {
    tray.setContextMenu(menu);
    return { ok: true, created: false };
  }
  try {
    tray = new Tray(createTrayImage());
    tray.setToolTip("region_ai desktop");
    tray.setContextMenu(menu);
    tray.on("double-click", () => {
      if (mainWindow && !mainWindow.isVisible()) {
        focusTarget("chatgpt");
      } else {
        toggleMainWindowVisibility();
      }
    });
    return { ok: true, created: true };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e), created: false };
  }
}

function destroyTray() {
  if (!tray) return;
  try {
    tray.destroy();
  } catch {
    // best effort
  }
  tray = null;
}

function toggleMainWindowVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function initDesktopShellServices() {
  const trayState = createTrayMenu();
  const hotkeyState = registerGlobalHotkeys();
  const notifyState = startUnreadPolling();
  const settingsWatcherState = startSettingsPolling();
  const councilState = startCouncilPolling();
  return {
    tray_ok: !!trayState.ok,
    tray_created: !!trayState.created,
    hotkeys_registered: hotkeyState.registered,
    hotkeys_requested: hotkeyState.requested,
    hotkeys_disabled: hotkeyState.disabled ? hotkeyState.disabled.length : 0,
    notify_started: !!notifyState.ok,
    settings_watch_started: !!settingsWatcherState.ok,
    council_poll_started: !!councilState.ok,
    settings_loaded: settingsLoaded,
    notify_state_loaded: notifyStateLoaded,
    notify_state_saved: notifyStateSavedAtLeastOnce,
  };
}

async function runSmokeSelfTest() {
  try {
    let hotReloadOk = false;
    let roleTabsOk = false;
    let councilCycleOk = false;
    try {
      const p = settingsPath();
      const original = readJsonFileSafe(p, defaultDesktopSettingsObj());
      const mentionObj = original.mention && typeof original.mention === "object" ? original.mention : {};
      const toggled = {
        ...original,
        mention: {
          ...mentionObj,
          enabled: mentionObj.enabled === false ? true : false,
        },
      };
      writeJsonAtomic(p, toggled);
      await checkSettingsHotReloadOnce("smoke_touch");
      hotReloadOk = settingsHotReloadedAtLeastOnce;
      writeJsonAtomic(p, original);
      await checkSettingsHotReloadOnce("smoke_restore");
    } catch {
      hotReloadOk = false;
    }
    try {
      let switched = 0;
      for (const cfg of ROLE_CONFIGS) {
        const out = setActiveRole(cfg.id, { focus: false });
        if (out && out.role === cfg.id) switched += 1;
      }
      setActiveRole(DEFAULT_ACTIVE_ROLE_ID, { focus: false });
      roleTabsOk = switched === ROLE_CONFIGS.length;
    } catch {
      roleTabsOk = false;
    }

    const seed = "desktop_smoke_v3_send_text";
    clipboard.writeText(seed);
    const sent = await sendToChat(seed);
    const capturedLast = await captureLastAssistantFromChat();
    const mentionProbe = detectMentionMeta("desktop smoke @shogun mention probe", "user");
    const inboxProbe = appendInboxEntry({
      thread_id: "external",
      msg_id: `smoke_${Date.now()}`,
      role: "chatgpt",
      mention: true,
      title: "desktop_smoke inbox probe",
      body: "smoke generated inbox probe event",
      links: {},
    });
    const deepRun = await handleDeepLink({
      type: "notify_click",
      ts: new Date().toISOString(),
      run_id: "run_smoke_deeplink",
      thread_id: "external",
      msg_id: "msg_smoke_run",
      inbox_id: "",
      source: "desktop_notify",
      mention: false,
    });
    const deepThread = await handleDeepLink({
      type: "notify_click",
      ts: new Date().toISOString(),
      thread_id: "external",
      msg_id: "msg_smoke_thread",
      inbox_id: "",
      source: "desktop_notify",
      mention: false,
    });
    const deepInbox = await handleDeepLink({
      type: "notify_click",
      ts: new Date().toISOString(),
      source: "desktop_notify",
      mention: false,
    });
    const deepLinkOk = deepRun.target === "runs" && deepThread.target === "thread" && deepInbox.target === "inbox";
    try {
      setActiveRole("facilitator", { focus: true });
      const prompt = "[Council Smoke]\\nrole=facilitator\\nPlease reply one line.";
      const sentCouncil = await sendToChat(prompt);
      const waitedCouncil = await waitForAssistantChange("facilitator", "", 5000);
      councilCycleOk = !!(sentCouncil && sentCouncil.ok && waitedCouncil && waitedCouncil.ok);
    } catch {
      councilCycleOk = false;
    }
    const passed = !!sent.ok && !!capturedLast.ok;
    console.log(`[desktop_smoke] ${JSON.stringify({ passed, mode: "test_harness_capture_last", chat_url: CHAT_VIEW_URL, send_mode: sent.mode, capture_mode: capturedLast.mode, text_len: capturedLast.text_len || 0, tray_ready: !!tray, hotkeys_registered: hotkeysRegistered, notify_polling: !!notifyTimer, mention_probe: !!mentionProbe.mention, mention_token: mentionProbe.token || "", hot_reload_ok: hotReloadOk, role_tabs_ok: roleTabsOk, council_cycle_ok: councilCycleOk, inbox_probe_ok: !!inboxProbe.ok, deep_link_ok: deepLinkOk, deep_link_target: deepRun.target, deep_link_post_ok: !!(deepRun.post_ok && deepThread.post_ok && deepInbox.post_ok) })}`);
  } catch (e) {
    console.log(`[desktop_smoke] ${JSON.stringify({ passed: false, mode: "test_harness_capture_last", hot_reload_ok: false, role_tabs_ok: false, council_cycle_ok: false, deep_link_ok: false, error: String(e && e.message ? e.message : e) })}`);
  }
}

function createViews(win) {
  regionView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: "persist:region_ui",
      preload: path.join(__dirname, "preload_region.cjs"),
    },
  });
  win.contentView.addChildView(regionView);
  regionView.webContents.loadURL(DEFAULT_UI_URL).catch(() => {});
  chatViewsByRole = new Map();
  for (const cfg of ROLE_CONFIGS) {
    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: cfg.partition,
      },
    });
    configureChatView(view);
    view.webContents.loadURL(CHAT_VIEW_URL).catch(() => {});
    chatViewsByRole.set(cfg.id, view);
  }
  setActiveRole(DEFAULT_ACTIVE_ROLE_ID, { focus: false });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#1e1f22",
    title: "region_ai desktop hub",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "shell.html")).catch(() => {});
  createViews(mainWindow);
  mainWindow.on("resize", layoutViews);
  mainWindow.on("close", (event) => {
    if (isQuitting || isSmoke) return;
    event.preventDefault();
    mainWindow.hide();
  });

  if (isSmoke) {
    setTimeout(() => {
      runSmokeSelfTest().finally(() => {
        isQuitting = true;
        setTimeout(() => app.quit(), 2500);
      });
    }, 400);
  }
}

ipcMain.on("bridge:selected_payload", (_event, payload) => {
  emitSelectedPayload(payload);
});

ipcMain.on("bridge:focus_role", (_event, payload) => {
  const role = payload && typeof payload === "object" ? payload.role : "";
  setActiveRole(role, { focus: true });
});

ipcMain.handle("bridge:set_selected_payload", (_event, payload) => {
  emitSelectedPayload(payload);
  return { ok: true };
});

ipcMain.handle("bridge:get_selected_payload", () => {
  return { ok: true, payload: selectedPayload };
});

ipcMain.handle("bridge:copy_for", async (_event, payload) => {
  const resolved = await resolveOutgoingText(payload?.target, payload?.text);
  const text = String(resolved.text || "");
  clipboard.writeText(text);
  return {
    ok: true,
    target: resolved.target,
    length: text.length,
    source: resolved.source,
  };
});

ipcMain.handle("bridge:resolve_text", async (_event, payload) => {
  const resolved = await resolveOutgoingText(payload?.target, payload?.text);
  return {
    ok: true,
    target: resolved.target,
    source: resolved.source,
    text: String(resolved.text || ""),
  };
});

ipcMain.handle("bridge:focus", (_event, payload) => {
  const target = String(payload?.target || "").toLowerCase();
  return focusTarget(target);
});

ipcMain.handle("bridge:set_active_role", (_event, payload) => {
  const role = payload && typeof payload === "object" ? payload.role : "";
  return setActiveRole(role, { focus: false });
});

ipcMain.handle("bridge:get_active_role", () => {
  return { ok: true, role: activeRoleId };
});

ipcMain.handle("bridge:paste_chatgpt", async () => {
  return pasteToChat();
});

ipcMain.handle("bridge:send_chatgpt", async (_event, payload) => {
  const resolved = await resolveOutgoingText("chatgpt", payload?.text);
  const result = await sendToChat(resolved.text);
  return {
    ...result,
    source: resolved.source,
    length: String(resolved.text || "").length,
  };
});

ipcMain.handle("bridge:capture_selection", async () => {
  return captureSelectionFromChat();
});

ipcMain.handle("bridge:capture_last_assistant", async () => {
  return captureLastAssistantFromChat();
});

app.whenReady().then(() => {
  const persistedState = initializeDesktopPersistence();
  createMainWindow();
  const shellInit = initDesktopShellServices();
  if (isSmoke) {
    console.log(`[desktop_smoke] ${JSON.stringify({ passed: true, mode: "shell_init", mention_enabled: !!runtimeConfig.mention.enabled, mention_tokens: Array.isArray(runtimeConfig.mention.tokens) ? runtimeConfig.mention.tokens.length : 0, mention_priority_throttle_ms: Number(runtimeConfig.mention.priorityThrottleMs || 0), settings_reload_poll_ms: Number(runtimeConfig.settingsReloadPollMs || 0), hot_reload_enabled: true, ...persistedState, ...shellInit })}`);
  }
});

app.on("will-quit", () => {
  stopUnreadPolling();
  stopSettingsPolling();
  stopCouncilPolling();
  saveNotifyState();
  unregisterManagedHotkeys();
  globalShortcut.unregisterAll();
  destroyTray();
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (!isQuitting) return;
  app.quit();
});
