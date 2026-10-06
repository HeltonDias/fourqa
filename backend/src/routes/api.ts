import { Router } from "express";
import { envValue } from "../azure/config.js";
import { dbReady, getMeta, parsePageQuery, queryExecucoes, queryFalhas } from "../db.js";
import { DEFAULT_PLAN_KEY } from "../domain/formulas.js";
import { PlanningPeriodError } from "../domain/planPeriod.js";
import { confirmOrRevise, getPlanningView, savePlanningCell } from "../services/planningService.js";
import {
  getHome,
  getStatusPorFrente,
  setCabecalho,
  setPeriodoPlano,
} from "../services/reportService.js";
import { getSyncState, startSync, SyncConfigError } from "../services/syncService.js";

export const apiRouter = Router();

function respondPlanningPeriodError(
  res: { status(code: number): { json(body: unknown): void } },
  err: unknown,
): boolean {
  if (err instanceof PlanningPeriodError) {
    res.status(400).json({ error: err.message });
    return true;
  }
  return false;
}

function planKeyFromQuery(q: unknown): string {
  if (typeof q === "string" && q.trim()) return q.trim();
  try {
    return getMeta("kpi_plan_key") || DEFAULT_PLAN_KEY;
  } catch {
    return DEFAULT_PLAN_KEY;
  }
}

/** Se MOTOR_QA_API_TOKEN estiver vazio, escrita fica aberta (desenvolvimento local). */
function requireWriteAuth(req: { header(name: string): string | undefined }, res: { status(code: number): { json(body: unknown): void } }, next: () => void): void {
  const token = envValue("MOTOR_QA_API_TOKEN");
  if (!token) {
    next();
    return;
  }
  if (req.header("authorization") === `Bearer ${token}`) {
    next();
    return;
  }
  res.status(401).json({ error: "Não autorizado." });
}

apiRouter.get("/health", (_req, res) => {
  const ready = dbReady();
  res.json({ ok: ready, database: ready ? "ready" : "unavailable" });
});

apiRouter.get("/meta", (_req, res) => {
  if (!dbReady()) {
    res.status(503).json({
      error: "Banco não inicializado. Execute: npm run import:planilha",
    });
    return;
  }
  try {
    res.json(getHome().periodo);
  } catch (err) {
    if (respondPlanningPeriodError(res, err)) return;
    throw err;
  }
});

apiRouter.get("/home", (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  try {
    res.json(getHome(planKeyFromQuery(req.query.planKey)));
  } catch (err) {
    if (respondPlanningPeriodError(res, err)) return;
    throw err;
  }
});

apiRouter.put("/cabecalho", requireWriteAuth, (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  const { title, subtitle } = (req.body ?? {}) as { title?: unknown; subtitle?: unknown };
  if (typeof title !== "string" || !title.trim() || typeof subtitle !== "string") {
    res.status(400).json({ error: "Informe o título (obrigatório) e o subtítulo." });
    return;
  }
  if (title.length > 200 || subtitle.length > 300) {
    res.status(400).json({ error: "Título até 200 e subtítulo até 300 caracteres." });
    return;
  }
  res.json(setCabecalho(title, subtitle));
});

apiRouter.put("/periodo", requireWriteAuth, (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  const { inicio, fim } = (req.body ?? {}) as { inicio?: unknown; fim?: unknown };
  if (typeof inicio !== "string" || typeof fim !== "string") {
    res.status(400).json({ error: "Informe início e fim." });
    return;
  }
  try {
    res.json(setPeriodoPlano(inicio, fim));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Não foi possível gravar o período." });
  }
});

apiRouter.get("/planejamento", (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  const version = Number(req.query.version);
  try {
    res.json(
      getPlanningView(
        planKeyFromQuery(req.query.planKey),
        Number.isFinite(version) && version > 0 ? version : undefined,
      ),
    );
  } catch (err) {
    if (respondPlanningPeriodError(res, err)) return;
    throw err;
  }
});

apiRouter.post("/planejamento/revisao", requireWriteAuth, (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  const body = (req.body ?? {}) as { reason?: unknown; adoptSource?: unknown };
  try {
    res.json(
      confirmOrRevise(planKeyFromQuery(req.query.planKey), {
        reason: typeof body.reason === "string" ? body.reason : "",
        adoptSource: body.adoptSource !== false,
      }),
    );
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Não foi possível gravar a revisão." });
  }
});

apiRouter.put("/planejamento/celula", requireWriteAuth, (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  const body = (req.body ?? {}) as {
    suiteId?: unknown;
    field?: unknown;
    date?: unknown;
    quantity?: unknown;
  };
  const field = body.field === "start" || body.field === "end" || body.field === "day" ? body.field : null;
  if (!field) {
    res.status(400).json({ error: "Campo inválido." });
    return;
  }
  try {
    res.json(
      savePlanningCell(planKeyFromQuery(req.query.planKey), {
        suiteId: typeof body.suiteId === "number" ? body.suiteId : null,
        field,
        date: typeof body.date === "string" ? body.date : undefined,
        quantity: typeof body.quantity === "number" ? body.quantity : undefined,
      }),
    );
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Não foi possível gravar a célula." });
  }
});

apiRouter.get("/status-frente", (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  res.json(getStatusPorFrente(planKeyFromQuery(req.query.planKey)));
});

apiRouter.post("/sync", requireWriteAuth, (_req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  try {
    const { started, state } = startSync();
    res.status(started ? 202 : 200).json({ started, state });
  } catch (err) {
    if (err instanceof SyncConfigError) {
      res.status(400).json({ error: err.message, missing: err.missing });
      return;
    }
    console.error("[sync] erro ao iniciar:", err instanceof Error ? err.name : "desconhecido");
    res.status(500).json({ error: "Falha ao iniciar a sincronização." });
  }
});

apiRouter.get("/sync/status", (_req, res) => {
  res.json(getSyncState());
});

apiRouter.get("/execucoes", (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  const page = parsePageQuery(req.query);
  const planKey = typeof req.query.planKey === "string" ? req.query.planKey : planKeyFromQuery(undefined);
  res.json(queryExecucoes({ ...page, planKey }));
});

apiRouter.get("/falhas", (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  const page = parsePageQuery(req.query);
  const planKey = typeof req.query.planKey === "string" ? req.query.planKey : planKeyFromQuery(undefined);
  res.json(queryFalhas({ ...page, planKey }));
});
