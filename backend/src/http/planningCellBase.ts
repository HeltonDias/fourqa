export type CellBaseRead = { guard: boolean; expectedText: string | null; expectedQuantity: number };

/** null quando a base veio com tipo inválido. Ausente mantém o contrato anterior (sem guarda). */
export function parsePlanningCellBase(
  body: Record<string, unknown>,
  field: "start" | "end" | "day" | "responsavel" | "prioridade",
): CellBaseRead | null {
  switch (field) {
    case "day": {
      if (!Object.prototype.hasOwnProperty.call(body, "baseQuantity")) {
        return { guard: false, expectedText: null, expectedQuantity: 0 };
      }
      const q = body.baseQuantity;
      if (typeof q !== "number" || !Number.isFinite(q) || q < 0) return null;
      return { guard: true, expectedText: null, expectedQuantity: q };
    }
    case "start":
    case "end": {
      if (!Object.prototype.hasOwnProperty.call(body, "baseDate")) {
        return { guard: false, expectedText: null, expectedQuantity: 0 };
      }
      const d = body.baseDate;
      if (d !== null && typeof d !== "string") return null;
      return { guard: true, expectedText: d as string | null, expectedQuantity: 0 };
    }
    default: {
      if (!Object.prototype.hasOwnProperty.call(body, "baseValue")) {
        return { guard: false, expectedText: null, expectedQuantity: 0 };
      }
      const v = body.baseValue;
      if (v !== null && typeof v !== "string") return null;
      return { guard: true, expectedText: v as string | null, expectedQuantity: 0 };
    }
  }
}
