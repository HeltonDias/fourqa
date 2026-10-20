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

const RELEASE_GATES = ["typecheck", "test", "build", "test_agents"];

/** Gates baratos durante iteração; release = paridade CI (obrigatório antes do PR). */
export function gatesForTier(tier = "N2", phase = "release") {
  if (phase === "release") return RELEASE_GATES;
  switch (tier) {
    case "N0":
      return [];
    case "N1":
      return ["typecheck"];
    case "N2":
      return ["typecheck", "test_agents"];
    case "N3":
      return ["typecheck", "test"];
    default:
      return ["typecheck", "test_agents"];
  }
}

export function runGateNames(names, cwd = root) {
  const out = {};
  for (const name of names) {
    out[name] = runGate(name, cwd);
    if (out[name].status === "fail") break;
  }
  return out;
}

export function runAllGates(cwd = root) {
  return runGateNames(RELEASE_GATES, cwd);
}

export function allReleaseGatesPassed(run) {
  return RELEASE_GATES.every((g) => run.gates[g]?.status === "pass");
}

export function runGateDry(name) {
  if (!GATE_COMMANDS[name]) throw new Error(`Gate desconhecido: ${name}`);
  return { status: "pass", command: GATE_COMMANDS[name].join(" "), exit_code: 0, output_tail: "dry-run" };
}
