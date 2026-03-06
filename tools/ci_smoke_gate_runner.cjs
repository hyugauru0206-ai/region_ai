const { spawnSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const gateScript = path.join(repoRoot, "tools", "ci_smoke_gate.ps1");
console.log(`[ci_smoke_gate_runner] repoRoot=${repoRoot} script=${gateScript}`);

function isOfflineEnvEnabled(value) {
  return ["1", "true", "TRUE"].includes(String(value || ""));
}

function resolveOpenAiHost() {
  const raw = String(process.env.OPENAI_BASE_URL || "").trim();
  if (!raw) return "api.openai.com";
  try {
    const url = new URL(raw);
    return url.hostname || "api.openai.com";
  } catch {
    return "api.openai.com";
  }
}

function testHost443Reachable(hostName) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: hostName, port: 443 });
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(Boolean(ok));
    };
    socket.setTimeout(1500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function resolveOfflineDecision() {
  if (isOfflineEnvEnabled(process.env.REGION_AI_SMOKE_OFFLINE)) {
    return { offlineMode: true, offlineReason: "forced_by_env" };
  }
  const hosts = [...new Set(["github.com", resolveOpenAiHost()].filter(Boolean))];
  for (const host of hosts) {
    // Determine once here and pin the same decision into the child gate run.
    const ok = await testHost443Reachable(host);
    if (!ok) {
      return { offlineMode: true, offlineReason: `auto_detect_host_unreachable:${host}:443` };
    }
  }
  return { offlineMode: false, offlineReason: "" };
}

function tryParseJsonLine(line) {
  const text = String(line || "").trim();
  if (!text.startsWith("{") || !text.endsWith("}")) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function tryParseLastJsonLine(text) {
  const lines = String(text || "").split(/\r?\n/).reverse();
  for (const line of lines) {
    const obj = tryParseJsonLine(line);
    if (obj) return obj;
  }
  return null;
}

function printOfflineSummary(uiSmoke) {
  if (!uiSmoke || uiSmoke.action !== "ui_smoke") return;
  const offlineMode = Object.prototype.hasOwnProperty.call(uiSmoke, "offline_mode") ? Boolean(uiSmoke.offline_mode) : false;
  const offlineReason = String(uiSmoke.offline_reason || "") || "-";
  const skippedSteps = Array.isArray(uiSmoke.skipped_steps) ? uiSmoke.skipped_steps : [];
  const preview = skippedSteps.slice(0, 10).join(", ");
  const suffix = skippedSteps.length > 10 ? ` ... (+${skippedSteps.length - 10} more)` : "";
  console.log(`[ci_smoke_gate_runner] ui_smoke offline_mode=${offlineMode} offline_reason=${offlineReason} skipped_steps=${skippedSteps.length}`);
  if (skippedSteps.length > 0) {
    console.log(`[ci_smoke_gate_runner] ui_smoke skipped_steps(${skippedSteps.length}): ${preview}${suffix}`);
  }
}

function readUiSmokeFromLog(uiSmokeLogPath) {
  if (!uiSmokeLogPath) return null;
  try {
    const raw = fs.readFileSync(uiSmokeLogPath, "utf8");
    const uiSmoke = tryParseLastJsonLine(raw);
    if (!uiSmoke || uiSmoke.action !== "ui_smoke") return null;
    return uiSmoke;
  } catch {
    return null;
  }
}

function findLatestGateRunDir() {
  try {
    const logsRoot = path.join(repoRoot, "data", "logs");
    const dirs = fs.readdirSync(logsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith("ci_smoke_gate_"))
      .map((d) => {
        const full = path.join(logsRoot, d.name);
        const st = fs.statSync(full);
        return { full, mtimeMs: st.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    return dirs.length > 0 ? dirs[0].full : "";
  } catch {
    return "";
  }
}

function buildGateCommand(outputPath) {
  const gateScriptPs = gateScript.replace(/'/g, "''");
  const outputPathPs = String(outputPath || "").replace(/'/g, "''");
  return `& '${gateScriptPs}' -Json 2>&1 | Tee-Object -FilePath '${outputPathPs}'`;
}

function runGateWith(psExe, decision, outputPath) {
  const env = { ...process.env };
  if (decision.offlineMode) {
    env.REGION_AI_SMOKE_OFFLINE = "1";
    env.REGION_AI_SMOKE_OFFLINE_REASON = decision.offlineReason || "forced_by_env";
  } else {
    delete env.REGION_AI_SMOKE_OFFLINE;
    delete env.REGION_AI_SMOKE_OFFLINE_REASON;
  }
  return spawnSync(psExe, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    buildGateCommand(outputPath),
  ], {
    cwd: repoRoot,
    stdio: "inherit",
    windowsHide: true,
    env,
  });
}

const psCandidates = [
  "powershell.exe",
  path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
];

async function main() {
  const decision = await resolveOfflineDecision();
  if (decision.offlineMode) {
    console.log(`[ci_smoke_gate_runner] pinned offline_mode=true offline_reason=${decision.offlineReason}`);
  } else {
    console.log("[ci_smoke_gate_runner] pinned offline_mode=false offline_reason=-");
  }

  const gateOutputPath = path.join(repoRoot, "data", "logs", "ci_smoke_gate_runner_current.out");
  try { fs.mkdirSync(path.dirname(gateOutputPath), { recursive: true }); } catch {}
  try { fs.rmSync(gateOutputPath, { force: true }); } catch {}

  let result = null;
  let usedPsExe = "";
  for (const candidate of psCandidates) {
    const attempt = runGateWith(candidate, decision, gateOutputPath);
    if (attempt.error) {
      result = attempt;
      continue;
    }
    result = attempt;
    usedPsExe = candidate;
    break;
  }
  if (!usedPsExe) usedPsExe = psCandidates[0];

  if (result.error) {
    console.error(`[ci_smoke_gate_runner] failed to spawn ${usedPsExe}: ${result.error && result.error.message ? result.error.message : result.error}`);
    process.exit(1);
  }

  if (result.signal) {
    console.error(`[ci_smoke_gate_runner] process terminated by signal: ${result.signal}`);
    process.exit(1);
  }

  try {
    const gateOutput = fs.existsSync(gateOutputPath) ? fs.readFileSync(gateOutputPath, "utf8") : "";
    const gateResult = tryParseLastJsonLine(gateOutput);
    let uiSmoke = null;
    if (gateResult && gateResult.action === "ci_smoke_gate") {
      const uiSmokeLogPath = gateResult.step_logs && gateResult.step_logs.ui_smoke ? String(gateResult.step_logs.ui_smoke) : "";
      uiSmoke = readUiSmokeFromLog(uiSmokeLogPath);
    }
    if (!uiSmoke) {
      const latestRunDir = findLatestGateRunDir();
      uiSmoke = readUiSmokeFromLog(latestRunDir ? path.join(latestRunDir, "ui_smoke.log") : "");
    }
    if (uiSmoke) {
      printOfflineSummary(uiSmoke);
    } else {
      console.log(`[ci_smoke_gate_runner] ui_smoke offline_mode=${decision.offlineMode} offline_reason=${decision.offlineReason || "-"} skipped_steps=0`);
    }
  } catch {
    console.log(`[ci_smoke_gate_runner] ui_smoke offline_mode=${decision.offlineMode} offline_reason=${decision.offlineReason || "-"} skipped_steps=0`);
  }

  process.exit(Number.isInteger(result.status) ? result.status : 1);
}

main().catch((err) => {
  console.error(`[ci_smoke_gate_runner] unexpected failure: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
