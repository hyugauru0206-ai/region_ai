const { spawnSync } = require("child_process");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const gateScript = path.join(repoRoot, "tools", "ci_smoke_gate.ps1");
const psExe = "powershell.exe";
const args = [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  gateScript,
  "-Json",
];

console.log(`[ci_smoke_gate_runner] repoRoot=${repoRoot} script=${gateScript}`);

const result = spawnSync(psExe, args, {
  cwd: repoRoot,
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  console.error(`[ci_smoke_gate_runner] failed to spawn ${psExe}: ${result.error && result.error.message ? result.error.message : result.error}`);
  process.exit(1);
}

if (result.signal) {
  console.error(`[ci_smoke_gate_runner] process terminated by signal: ${result.signal}`);
  process.exit(1);
}

process.exit(Number.isInteger(result.status) ? result.status : 1);
