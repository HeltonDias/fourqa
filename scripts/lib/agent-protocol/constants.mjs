/** Estados obrigatórios do protocolo FourQA (ordem total). */
export const STATES = [
  "RECEBIDO",
  "CONTEXTO_VALIDADO",
  "EXISTENCIA_VERIFICADA",
  "ESCOPO_DEFINIDO",
  "IMPLEMENTADO",
  "TESTADO",
  "REVISADO",
  "ENTREGA_VERIFICADA",
  "REGISTRADO",
];

export const TERMINAL_STATES = new Set(["REGISTRADO", "BLOQUEADO"]);

export const ACCEPTANCE_STATUS = new Set(["JA_IMPLEMENTADO", "PARCIAL", "PENDENTE"]);

export const GATE_NAMES = ["typecheck", "test", "build", "test_agents"];

export const MAX_FAILURE_RETRIES = 2;

export const RUN_FILE = ".cursor/agent-run.json";

export const LEDGER_PATH = ".cursor/docs/CHANGE_LEDGER.jsonl";

export const FAILURE_CAUSES = new Set([
  "codigo",
  "teste",
  "ambiente",
  "dependencia",
  "contrato",
  "autorizacao",
  "entrega",
]);
