#!/usr/bin/env node
/**
 * Smoke tests for agent infrastructure (BMAD Python helpers).
 * CI gate — does not replace npm test (product).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const pythonTests = [
  ".agents/skills/bmad-party-mode/scripts/tests/test_resolve_party.py",
  ".agents/skills/bmad-forge-idea/scripts/tests/test_resolve_personas.py",
  ".agents/skills/bmad-customize/scripts/tests/test_list_customizable_skills.py",
  ".agents/skills/bmad-review/scripts/tests/test_word_metrics.py",
  ".agents/skills/bmad-deep-recon/scripts/tests/test_recon_kit.py",
];

const bmadScripts = [
  "_bmad/scripts/render_skill.py",
  "_bmad/scripts/resolve_config.py",
  "_bmad/scripts/resolve_customization.py",
  "_bmad/_config/bmad-help.csv",
];

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || "");
    process.stdout.write(r.stdout || "");
    return false;
  }
  return true;
}

function pythonCmd() {
  if (process.env.PYTHON) return process.env.PYTHON;
  for (const cmd of ["python3", "python"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status === 0) return cmd;
  }
  return "python3";
}

let failed = 0;

for (const rel of bmadScripts) {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) {
    console.error(`MISSING ${rel}`);
    failed++;
  }
}

const py = pythonCmd();
for (const rel of pythonTests) {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) {
    console.error(`MISSING ${rel}`);
    failed++;
    continue;
  }
  console.log(`> ${py} ${rel}`);
  if (!run(py, [abs])) {
    console.error(`FAIL ${rel}`);
    failed++;
  }
}

console.log(`> ${py} _bmad/scripts/resolve_config.py --project-root .`);
if (!run(py, ["_bmad/scripts/resolve_config.py", "--project-root", root])) {
  console.error("FAIL resolve_config.py");
  failed++;
}

if (failed > 0) {
  console.error(`agents-smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log("agents-smoke: OK");
