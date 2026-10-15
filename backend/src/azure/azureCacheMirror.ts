import { envValue } from "./config.js";

/** Espelha o lote validado no cache em memória após persistência no banco. Padrão: desligado. */
export function isAzureCacheMirrorEnabled(): boolean {
  return envValue("AZURE_CACHE_MIRROR") === "1";
}
