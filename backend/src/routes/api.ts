import { Router, type NextFunction, type Request, type Response } from "express";
import { AzureCacheUnavailableError } from "../azure/azureCacheReadSource.js";
import { envValue } from "../azure/config.js";
import { decideReadAuth, decideWriteAuth, openWritesAllowed } from "../http/writeAuth.js";
import { parsePageQuery } from "../http/pageQuery.js";
import { planKeyFromRaw } from "../persistence/planKey.js";
import { getStores, persistenceReady } from "../persistence/provider.js";
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

function readsAreProtected(): boolean {
  return process.env.VERCEL === "1" && envValue("FOURQA_PROTECT_READS") !== "0";
}

function writeDecision(req: { header(name: string): string | undefined }) {
  return decideWriteAuth({
    configuredToken: envValue("FOURQA_API_TOKEN"),
    allowOpenWrites: openWritesAllowed({
      vercel: process.env.VERCEL === "1",
      allowOpenWritesFlag: envValue("FOURQA_ALLOW_OPEN_WRITES"),
    }),
    authorizationHeader: req.header("authorization"),
  });
}

apiRouter.use((req, res, next) => {
  if (!readsAreProtected() || req.path === "/health") {
    next();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }
  const decision = decideReadAuth({
    protectReads: true,
    configuredToken: envValue("FOURQA_API_TOKEN"),
    authorizationHeader: req.header("authorization"),
  });
  if (decision === "allow") {
    next();
    return;
  }
  if (decision === "unconfigured") {
    res.status(503).json({ error: "Acesso desabilitado. Configure FOURQA_API_TOKEN neste ambiente." });
    return;
  }
  res.status(401).json({ error: "Não autorizado." });
});

const stores = await getStores();
const getMeta = async (key: string) => stores.meta.get(key);

async function ready(res: { status(code: number): { json(body: unknown): void } }): Promise<boolean> {
  if (await persistenceReady()) return true;
  res.status(503).json({ error: "Banco indisponível." });
  return false;
}

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

async function planKeyFromQuery(q: unknown): Promise<string> {
  let fallback = DEFAULT_PLAN_KEY;
  try {
    fallback = (await getMeta("kpi_plan_key")) || DEFAULT_PLAN_KEY;
  } catch {
    fallback = DEFAULT_PLAN_KEY;
  }
  return planKeyFromRaw(q, fallback);
}

/** Escrita fechada sem FOURQA_API_TOKEN, salvo FOURQA_ALLOW_OPEN_WRITES=1. */
function requireWriteAuth(req: { header(name: string): string | undefined }, res: { status(code: number): { json(body: unknown): void } }, next: () => void): void {
  const decision = writeDecision(req);
  if (decision === "allow") {
    next();
    return;
  }
  if (decision === "unconfigured") {
    res.status(503).json({ error: "Escrita desabilitada. Configure FOURQA_API_TOKEN ou FOURQA_ALLOW_OPEN_WRITES=1 neste ambiente." });
    return;
  }
  res.status(401).json({ error: "Não autorizado." });
}

apiRouter.get("/health", async (_req, res) => {
  const ok = await persistenceReady();
  res.json({ ok, database: ok ? "ready" : "unavailable" });
});

apiRouter.get("/meta", async (_req, res) => {
  if (!(await ready(res))) return;
  try {
    res.json((await getHome()).periodo);
  } catch (err) {
    if (respondPlanningPeriodError(res, err)) return;
    throw err;
  }
});

apiRouter.get("/home", async (req, res) => {
  if (!(await ready(res))) return;
  try {
    res.json(await getHome(await planKeyFromQuery(req.query.planKey)));
  } catch (err) {
    if (respondPlanningPeriodError(res, err)) return;
    throw err;
  }
});

apiRouter.put("/cabecalho", requireWriteAuth, async (req, res) => {
  if (!(await ready(res))) return;
  const { title, subtitle } = (req.body ?? {}) as { title?: unknown; subtitle?: unknown };
  if (typeof title !== "string" || !title.trim() || typeof subtitle !== "string") {
    res.status(400).json({ error: "Informe o título (obrigatório) e o subtítulo." });
    return;
  }
  if (title.length > 200 || subtitle.length > 300) {
    res.status(400).json({ error: "Título até 200 e subtítulo até 300 caracteres." });
    return;
  }
  res.json(await setCabecalho(title, subtitle));
});

apiRouter.put("/periodo", requireWriteAuth, async (req, res) => {
  if (!(await ready(res))) return;
  const { inicio, fim } = (req.body ?? {}) as { inicio?: unknown; fim?: unknown };
  if (typeof inicio !== "string" || typeof fim !== "string") {
    res.status(400).json({ error: "Informe início e fim." });
    return;
  }
  try {
    res.json(await setPeriodoPlano(inicio, fim));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Não foi possível gravar o período." });
  }
});

apiRouter.get("/planejamento", async (req, res) => {
  if (!(await ready(res))) return;
  const version = Number(req.query.version);
  try {
    res.json(
      await getPlanningView(
        await planKeyFromQuery(req.query.planKey),
        Number.isFinite(version) && version > 0 ? version : undefined,
      ),
    );
  } catch (err) {
    if (respondPlanningPeriodError(res, err)) return;
    throw err;
  }
});

apiRouter.post("/planejamento/revisao", requireWriteAuth, async (req, res) => {
  if (!(await ready(res))) return;
  const body = (req.body ?? {}) as { reason?: unknown; adoptSource?: unknown };
  try {
    res.json(
      await confirmOrRevise(await planKeyFromQuery(req.query.planKey), {
        reason: typeof body.reason === "string" ? body.reason : "",
        adoptSource: body.adoptSource !== false,
      }),
    );
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Não foi possível gravar a revisão." });
  }
});

apiRouter.put("/planejamento/celula", requireWriteAuth, async (req, res) => {
  if (!(await ready(res))) return;
  const body = (req.body ?? {}) as {
    suiteId?: unknown;
    testPointId?: unknown;
    field?: unknown;
    date?: unknown;
    quantity?: unknown;
    value?: unknown;
  };
  const field =
    body.field === "start" ||
    body.field === "end" ||
    body.field === "day" ||
    body.field === "responsavel" ||
    body.field === "prioridade"
      ? body.field
      : null;
  if (!field) {
    res.status(400).json({ error: "Campo inválido." });
    return;
  }
  try {
    res.json(
      await savePlanningCell(await planKeyFromQuery(req.query.planKey), {
        suiteId: typeof body.suiteId === "number" ? body.suiteId : null,
        testPointId: typeof body.testPointId === "number" ? body.testPointId : null,
        field,
        date: typeof body.date === "string" ? body.date : undefined,
        quantity: typeof body.quantity === "number" ? body.quantity : undefined,
        value: typeof body.value === "string" ? body.value : undefined,
      }),
    );
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Não foi possível gravar a célula." });
  }
});

apiRouter.get("/status-frente", async (req, res) => {
  if (!(await ready(res))) return;
  res.json(await getStatusPorFrente(await planKeyFromQuery(req.query.planKey)));
});

apiRouter.post("/sync", requireWriteAuth, async (_req, res) => {
  if (!(await ready(res))) return;
  try {
    const { started, state } = await startSync();
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

apiRouter.get("/sync/status", async (_req, res) => {
  res.json(await getSyncState());
});

apiRouter.get("/execucoes", async (req, res) => {
  if (!(await ready(res))) return;
  const page = parsePageQuery(req.query);
  const planKey = await planKeyFromQuery(req.query.planKey);
  res.json(await stores.azureSnapshot.queryExecucoes({ ...page, planKey }));
});

apiRouter.get("/falhas", async (req, res) => {
  if (!(await ready(res))) return;
  const page = parsePageQuery(req.query);
  const planKey = await planKeyFromQuery(req.query.planKey);
  res.json(await stores.azureSnapshot.queryFalhas({ ...page, planKey }));
});

apiRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AzureCacheUnavailableError) {
    res.status(503).json({ error: err.message, unavailable: true });
    return;
  }
  next(err);
});
