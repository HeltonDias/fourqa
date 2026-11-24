#!/usr/bin/env node
// Runs the Maven Wrapper of the Java API in backend/ with the given arguments.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dir = join(root, "backend");
if (!existsSync(join(dir, "pom.xml"))) {
  console.error("pom.xml não encontrado em backend/.");
  process.exit(1);
}
const win = process.platform === "win32";
const env = { ...process.env };
if (!env.JAVA_HOME) {
  const probe = spawnSync("java", ["-XshowSettings:properties", "-version"], { encoding: "utf8", shell: win });
  const home = /java\.home = (.+)/.exec(`${probe.stderr ?? ""}${probe.stdout ?? ""}`)?.[1]?.trim();
  if (home) env.JAVA_HOME = home;
}
const args = process.argv.slice(2);
const res = spawnSync(win ? "mvnw.cmd" : "./mvnw", args.length ? args : ["-q", "-B", "verify"], {
  cwd: dir,
  env,
  stdio: "inherit",
  shell: win,
});
process.exit(res.status ?? 1);
