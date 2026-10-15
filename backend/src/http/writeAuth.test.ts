import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideWriteAuth } from "./writeAuth.js";

describe("escrita autenticada", () => {
  it("aceita o bearer configurado", () => {
    assert.equal(
      decideWriteAuth({ configuredToken: "segredo", allowOpenWrites: false, authorizationHeader: "Bearer segredo" }),
      "allow",
    );
  });

  it("nega token ausente ou diferente", () => {
    assert.equal(decideWriteAuth({ configuredToken: "segredo", allowOpenWrites: false, authorizationHeader: undefined }), "unauthorized");
    assert.equal(decideWriteAuth({ configuredToken: "segredo", allowOpenWrites: false, authorizationHeader: "Bearer outro" }), "unauthorized");
  });

  it("sem token no servidor fica fechado, salvo opt-in explícito", () => {
    assert.equal(decideWriteAuth({ configuredToken: "  ", allowOpenWrites: false, authorizationHeader: undefined }), "unconfigured");
    assert.equal(decideWriteAuth({ configuredToken: "", allowOpenWrites: true, authorizationHeader: undefined }), "allow");
  });
});
