import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const GATE_COMMANDS = {
  typecheck: ["npm", "run", "typecheck"],
  test: ["npm", "run", "test"],
  build: ["npm", "run", "build"],
  test_agents: ["npm", "run", "test:agents"],
};

export function runGate(name, cwd = root) {
  const args = GATE_COMMANDS[name];
  if (!args) throw new Error(`Gate desconhecido: ${name}`);
  const [cmd, ...rest] = args;
  const r = spawnSync(cmd, rest, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: process.env,
  });
  const tail = `${r.stdout || ""}${r.stderr || ""}`.slice(-2000);
  return {
    status: r.status === 0 ? "pass" : "fail",
    command: args.join(" "),
    exit_code: r.status,
    output_tail: tail,
  };
}

export function runAllGates(cwd = root) {
  const out = {};
  for (const name of Object.keys(GATE_COMMANDS)) {
    out[name] = runGate(name, cwd);
    if (out[name].status === "fail") break;
  }
  return out;
}

export function runGateDry(name) {
  if (!GATE_COMMANDS[name]) throw new Error(`Gate desconhecido: ${name}`);
  return { status: "pass", command: GATE_COMMANDS[name].join(" "), exit_code: 0, output_tail: "dry-run" };
}
