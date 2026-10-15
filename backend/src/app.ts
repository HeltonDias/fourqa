import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertVercelCacheMode } from "./azure/azureCacheReadSource.js";
import { envValue } from "./azure/config.js";
import { assertOperationalProvider } from "./persistence/operationalProvider.js";

assertOperationalProvider(envValue("DB_PROVIDER"));
assertVercelCacheMode();

const { apiRouter } = await import("./routes/api.js");

function allowedOrigins(): string[] {
  const configured = envValue("FRONTEND_ORIGIN");
  const origins = configured
    ? configured.split(",").map((item) => item.trim()).filter(Boolean)
    : ["http://localhost:5173", "http://localhost:3001"];
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host) origins.push(`https://${host}`);
  }
  return origins;
}

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(cors({ origin: allowedOrigins() }));
app.use(express.json());

/** A Function da Vercel pode entregar só o trecho depois de /api. O app local já recebe /api. */
if (process.env.VERCEL === "1") {
  app.use((req, _res, next) => {
    const raw = req.url ?? "/";
    const pathOnly = raw.split("?")[0] ?? "/";
    if (pathOnly === "/api" || pathOnly.startsWith("/api/")) {
      next();
      return;
    }
    const query = raw.includes("?") ? `?${raw.slice(raw.indexOf("?") + 1)}` : "";
    const suffix = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
    req.url = `/api${suffix}${query}`;
    next();
  });
}

app.use("/api", apiRouter);

if (process.env.VERCEL !== "1") {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const frontendDist = path.join(rootDir, "frontend", "dist");
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"), (err) => {
      if (err) res.status(404).json({ message: "Frontend não buildado. Use npm run dev na pasta frontend." });
    });
  });
}

export default app;
