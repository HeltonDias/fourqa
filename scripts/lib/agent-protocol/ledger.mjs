import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { LEDGER_PATH } from "./constants.mjs";

const SECRET_PATTERNS = [
  /password\s*=\s*\S+/i,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /postgresql:\/\/\S+@\S+/i,
  /AZURE_DEVOPS_PAT/i,
  /sk-[A-Za-z0-9]{20,}/,
];

const REQUIRED_FIELDS = [
  "id",
  "description",
  "acceptance_criteria",
  "before",
  "after",
  "files",
  "tests",
  "decisions",
  "status",
  "recorded_at",
];

export function ledgerPath(root) {
  return path.join(root, LEDGER_PATH);
}

export function readLedger(root) {
  const p = ledgerPath(root);
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      entries.push({ line: i + 1, raw: lines[i], data: JSON.parse(lines[i]) });
    } catch {
      entries.push({ line: i + 1, raw: lines[i], error: "JSON_INVALIDO" });
    }
  }
  return entries;
}

export function validateLedger(root) {
  const entries = readLedger(root);
  const errors = [];
  for (const e of entries) {
    if (e.error) {
      errors.push(`linha ${e.line}: ${e.error}`);
      continue;
    }
    for (const f of REQUIRED_FIELDS) {
      if (e.data[f] === undefined || e.data[f] === null) errors.push(`linha ${e.line}: campo ausente ${f}`);
    }
    const blob = JSON.stringify(e.data);
    for (const re of SECRET_PATTERNS) {
      if (re.test(blob)) errors.push(`linha ${e.line}: possível segredo no registro`);
    }
  }
  return { ok: errors.length === 0, errors, count: entries.length };
}

export function appendLedger(root, entry) {
  const v = validateLedgerEntry(entry);
  if (!v.ok) throw new Error(v.errors.join("; "));
  const p = ledgerPath(root);
  mkdirSync(path.dirname(p), { recursive: true });
  appendFileSync(p, `${JSON.stringify(entry)}\n`, "utf8");
}

export function validateLedgerEntry(entry) {
  const errors = [];
  for (const f of REQUIRED_FIELDS) {
    if (entry[f] === undefined || entry[f] === null) errors.push(`campo ausente ${f}`);
  }
  const blob = JSON.stringify(entry);
  for (const re of SECRET_PATTERNS) {
    if (re.test(blob)) errors.push("possível segredo no registro");
  }
  return { ok: errors.length === 0, errors };
}

export function findLedgerById(root, id) {
  return readLedger(root).find((e) => e.data?.id === id);
}
