#!/usr/bin/env node
/**
 * Hook `stop`: impede encerramento falso quando agent-run.json indica protocolo incompleto.
 * Entrada: JSON do Cursor (stdin). Saída: { "followup_message": "..." } ou {}.
 */
import { verifyProtocolCompletion } from "../../scripts/lib/agent-protocol/verify-completion.mjs";

const root = process.cwd();

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const input = await readStdin();
const status = input.status ?? "completed";
if (status !== "completed") {
  process.stdout.write("{}\n");
  process.exit(0);
}

const result = verifyProtocolCompletion(root);
if (result.ok) {
  process.stdout.write("{}\n");
  process.exit(0);
}

const loop = input.loop_count ?? 0;
const msg = `[protocolo] Encerramento bloqueado (tentativa ${loop + 1}): ${result.reason}. ${result.followup ?? ""} Evidência: ${result.evidence ?? "n/a"}`;
process.stdout.write(`${JSON.stringify({ followup_message: msg })}\n`);
process.exit(0);
