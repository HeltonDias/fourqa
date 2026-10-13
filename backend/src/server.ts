import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { envValue } from "./azure/config.js";
import { getStores } from "./persistence/provider.js";
import { apiRouter } from "./routes/api.js";

const app = express();
const port = Number(process.env.PORT) || 3001;
await getStores();

const configuredOrigin = envValue("FRONTEND_ORIGIN");
const origins = configuredOrigin
  ? configuredOrigin.split(",").map((s) => s.trim()).filter(Boolean)
  : ["http://localhost:5173", "http://localhost:3001"];

app.use(cors({ origin: origins }));
app.use(express.json());
app.use("/api", apiRouter);

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const frontendDist = path.join(rootDir, "frontend", "dist");
app.use(express.static(frontendDist));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"), (err) => {
    if (err) res.status(404).json({ message: "Frontend não buildado. Use npm run dev na pasta frontend." });
  });
});

app.listen(port, () => {
  console.log(`FourQA API em http://localhost:${port}`);
});
