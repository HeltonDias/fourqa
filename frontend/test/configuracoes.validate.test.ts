import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultConfig } from "../src/configuracoes/defaults.ts";
import { loadConfig, saveConfig } from "../src/configuracoes/store.ts";
import { blocking, validate } from "../src/configuracoes/validate.ts";

describe("central de configurações", () => {
  it("aceita o exemplo inicial sem erro bloqueante", () => {
    const issues = validate(defaultConfig());
    assert.equal(blocking(issues).length, 0);
    assert.equal(issues.some((issue) => issue.section === "azure" && issue.severity === "pendente"), true);
  });

  it("recusa PlanKey duplicado e plano ativo sem identificador", () => {
    const config = defaultConfig();
    config.planos.push({ ...config.planos[0], id: "outro" });
    assert.equal(blocking(validate(config)).some((issue) => issue.message.includes("PlanKey")), true);

    const semId = defaultConfig();
    semId.planos[0].planId = "";
    assert.equal(blocking(validate(semId)).some((issue) => issue.section === "planos"), true);
  });

  it("recusa categoria repetida e versão de API inválida", () => {
    const config = defaultConfig();
    config.categorias.push({ ...config.categorias[0], id: "extra", categoria: "01. dev. backend" });
    assert.equal(blocking(validate(config)).some((issue) => issue.section === "categorias"), true);

    config.azure.apiVersion = "preview";
    assert.equal(blocking(validate(config)).some((issue) => issue.message.includes("versão")), true);
  });

  it("não grava credencial", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
    };
    const config = defaultConfig();
    const polluted = config as unknown as { pat?: string; azure: { pat?: string } };
    polluted.pat = "segredo-raiz";
    polluted.azure.pat = "segredo-azure";
    saveConfig(config, storage);
    const raw = [...mem.values()].join("");
    assert.equal(raw.includes("segredo"), false);
    assert.equal(JSON.stringify(loadConfig(storage)).includes("segredo"), false);
    assert.equal(loadConfig(storage).azure.apiVersion, "7.1");
  });
});
