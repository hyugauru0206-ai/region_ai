const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const gateScript = path.join(repoRoot, "tools", "ci_smoke_gate.ps1");
const args = [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  gateScript,
  "-Json",
];

console.log(`[ci_smoke_gate_runner] repoRoot=${repoRoot} script=${gateScript}`);

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

function printOfflineSummaryFromUiSmokeLog(uiSmokeLogPath) {
  if (!uiSmokeLogPath) return;
  try {
    const raw = fs.readFileSync(uiSmokeLogPath, "utf8");
    const uiSmoke = tryParseLastJsonLine(raw);
    if (!uiSmoke || uiSmoke.action !== "ui_smoke") return;
    if (Object.prototype.hasOwnProperty.call(uiSmoke, "offline_mode")) {
      console.log(`[ci_smoke_gate_runner] ui_smoke offline_mode=${Boolean(uiSmoke.offline_mode)}`);
    }
    if (Array.isArray(uiSmoke.skipped_steps) && uiSmoke.skipped_steps.length > 0) {
      const total = uiSmoke.skipped_steps.length;
      const preview = uiSmoke.skipped_steps.slice(0, 10).join(", ");
      const suffix = total > 10 ? ` ... (+${total - 10} more)` : "";
      console.log(`[ci_smoke_gate_runner] ui_smoke skipped_steps(${total}): ${preview}${suffix}`);
    }
  } catch {
    // best-effort only
  }
}

function runGateWith(psExe) {
  return spawnSync(psExe, args, {
    cwd: repoRoot,
    stdio: "inherit",
    windowsHide: true,
  });
}

const psCandidates = [
  "powershell.exe",
  path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
];

let result = null;
let usedPsExe = "";
for (const candidate of psCandidates) {
  const attempt = runGateWith(candidate);
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
  const logsRoot = path.join(repoRoot, "data", "logs");
  if (fs.existsSync(logsRoot)) {
    const dirs = fs.readdirSync(logsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith("ci_smoke_gate_"))
      .map((d) => {
        const full = path.join(logsRoot, d.name);
        const st = fs.statSync(full);
        return { full, mtimeMs: st.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (dirs.length > 0) {
      const uiSmokeLogPath = path.join(dirs[0].full, "ui_smoke.log");
      printOfflineSummaryFromUiSmokeLog(uiSmokeLogPath);
    }
  }
} catch {
  // best-effort only
}

process.exit(Number.isInteger(result.status) ? result.status : 1);
