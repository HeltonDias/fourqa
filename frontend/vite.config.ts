import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type ViteDevServer } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Só o servidor de desenvolvimento local lê o token. O valor não entra no bundle. */
function localApiToken(): string {
  const file = path.join(repoRoot, ".env");
  if (!fs.existsSync(file)) return "";
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*FOURQA_API_TOKEN\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[1] ?? "";
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    return value.trim();
  }
  return "";
}

function localTokenPlugin() {
  return {
    name: "fourqa-local-token",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== "/__fourqa_local_token") return next();
        const host = req.headers.host ?? "";
        if (!host.startsWith("localhost:") && !host.startsWith("127.0.0.1:")) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.end(localApiToken());
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localTokenPlugin()],
  server: {
    port: 5173,
    fs: {
      allow: [repoRoot],
    },
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
