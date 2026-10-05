import { Router } from "express";
import { dbReady, getDbPath, listExecucoes, listFalhas } from "../db.js";
import { DEFAULT_PLAN_KEY } from "../domain/formulas.js";
import {
  getHome,
  getPlanejamento,
  getStatusPorFrente,
} from "../services/reportService.js";

export const apiRouter = Router();

function planKeyFromQuery(q: unknown): string {
  return typeof q === "string" && q.trim() ? q.trim() : DEFAULT_PLAN_KEY;
}

apiRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    db: getDbPath(),
    ready: dbReady(),
  });
});

apiRouter.get("/meta", (_req, res) => {
  if (!dbReady()) {
    res.status(503).json({
      error: "Banco não inicializado. Execute: npm run import:planilha",
    });
    return;
  }
  res.json(getHome().periodo);
});

apiRouter.get("/home", (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  res.json(getHome(planKeyFromQuery(req.query.planKey)));
});

apiRouter.get("/planejamento", (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  res.json(getPlanejamento(planKeyFromQuery(req.query.planKey)));
});

apiRouter.get("/status-frente", (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  res.json(getStatusPorFrente(planKeyFromQuery(req.query.planKey)));
});

apiRouter.get("/execucoes", (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  const planKey = req.query.planKey as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 500, 5000);
  const rows = listExecucoes(planKey, limit);
  res.json({ total: rows.length, rows });
});

apiRouter.get("/falhas", (req, res) => {
  if (!dbReady()) {
    res.status(503).json({ error: "Execute npm run import:planilha" });
    return;
  }
  const planKey = req.query.planKey as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 500, 10000);
  const rows = listFalhas(planKey, limit);
  res.json({ total: rows.length, rows });
});
