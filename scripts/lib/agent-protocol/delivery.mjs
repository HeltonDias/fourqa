import { spawnSync } from "node:child_process";

function gitCredentialToken() {
  const input = "protocol=https\nhost=github.com\n\n";
  const opts = { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] };
  let r = spawnSync("git", ["credential", "fill"], opts);
  if (r.status !== 0 && process.platform === "win32") {
    r = spawnSync("git.exe", ["credential", "fill"], opts);
  }
  if (r.status !== 0) return null;
  const m = (r.stdout || "").match(/^password=(.+)$/m);
  return m ? m[1].trim() : null;
}

function parseRepo(remoteUrl) {
  const m = (remoteUrl || "").match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

export function currentBranch(root) {
  const r = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function remoteOrigin(root) {
  const r = spawnSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Verifica PR aberto para a branch atual. Sem token: retorna verified=false, checks=unknown. */
export async function verifyPullRequest(root) {
  const branch = currentBranch(root);
  const repo = parseRepo(remoteOrigin(root));
  if (!branch || !repo) {
    return { branch, pr_url: null, pr_verified: false, remote_checks: "unknown", detail: "sem branch ou origin github" };
  }
  const token = gitCredentialToken();
  if (!token) {
    return { branch, pr_url: null, pr_verified: false, remote_checks: "unknown", detail: "sem credencial git para API" };
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const head = `${repo.owner}:${branch}`;
  const listUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/pulls?head=${encodeURIComponent(head)}&state=open`;
  const res = await fetch(listUrl, { headers });
  if (!res.ok) {
    return { branch, pr_url: null, pr_verified: false, remote_checks: "unknown", detail: `API list ${res.status}` };
  }
  const pulls = await res.json();
  if (!Array.isArray(pulls) || pulls.length === 0) {
    return { branch, pr_url: null, pr_verified: false, remote_checks: "missing", detail: "nenhum PR aberto" };
  }
  const pr = pulls[0];
  const checksUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits/${encodeURIComponent(branch)}/check-runs`;
  const checksRes = await fetch(checksUrl, { headers });
  let remote_checks = "unknown";
  if (checksRes.ok) {
    const body = await checksRes.json();
    const runs = body.check_runs ?? [];
    if (runs.length === 0) remote_checks = "pending";
    else if (runs.some((c) => c.status !== "completed")) remote_checks = "pending";
    else if (runs.every((c) => c.conclusion === "success" || c.conclusion === "skipped")) remote_checks = "success";
    else remote_checks = "failure";
  }
  return {
    branch,
    pr_url: pr.html_url,
    pr_number: pr.number,
    pr_verified: true,
    remote_checks,
    detail: "ok",
  };
}
