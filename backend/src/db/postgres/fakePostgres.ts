type Row = Record<string, unknown>;

type State = {
  workbook_meta: Map<string, string>;
  planning: Row[];
  planning_revision: Row[];
  planning_scope_item: Row[];
  planning_item: Row[];
  planning_allocation: Row[];
  execucoes: Row[];
  falhas: Row[];
  seq: Record<string, number>;
};

function emptyState(): State {
  return {
    workbook_meta: new Map(),
    planning: [],
    planning_revision: [],
    planning_scope_item: [],
    planning_item: [],
    planning_allocation: [],
    execucoes: [],
    falhas: [],
    seq: {
      planning: 1,
      planning_revision: 1,
      planning_scope_item: 1,
      planning_item: 1,
      planning_allocation: 1,
      execucoes: 1,
      falhas: 1,
    },
  };
}

function cloneState(state: State): State {
  return {
    workbook_meta: new Map(state.workbook_meta),
    planning: state.planning.map((row) => ({ ...row })),
    planning_revision: state.planning_revision.map((row) => ({ ...row })),
    planning_scope_item: state.planning_scope_item.map((row) => ({ ...row })),
    planning_item: state.planning_item.map((row) => ({ ...row })),
    planning_allocation: state.planning_allocation.map((row) => ({ ...row })),
    execucoes: state.execucoes.map((row) => ({ ...row })),
    falhas: state.falhas.map((row) => ({ ...row })),
    seq: { ...state.seq },
  };
}

function columnsOf(sql: string): string[] {
  const match = sql.match(/\(([^)]+)\)\s+VALUES/i);
  if (!match?.[1]) throw new Error("INSERT sem colunas");
  return match[1].split(",").map((column) => column.trim());
}

function rowFrom(columns: string[], params: unknown[]): Row {
  const row: Row = {};
  columns.forEach((column, index) => {
    row[column] = params[index] ?? null;
  });
  return row;
}

export function createFakePostgres() {
  let state = emptyState();
  let checkpoint: State | null = null;
  const log: string[] = [];

  function nextId(table: string): number {
    const id = state.seq[table] ?? 1;
    state.seq[table] = id + 1;
    return id;
  }

  function requireRow(rows: Row[], id: unknown, label: string): void {
    if (!rows.some((row) => row.id === id)) throw new Error(`vínculo ausente: ${label}`);
  }

  function revisionsOf(planKey: unknown): Row[] {
    const ids = new Set(state.planning.filter((row) => row.plan_key === planKey).map((row) => row.id));
    return state.planning_revision.filter((row) => ids.has(row.planning_id));
  }

  function page(table: "execucoes" | "falhas", sql: string, params: unknown[]): Row[] {
    const matched = state[table].filter((row) => row.plan_key === params[0]);
    if (sql.startsWith("SELECT COUNT(*)")) return [{ n: matched.length }];
    matched.sort((a, b) => Number(a.id) - Number(b.id));
    if (!sql.includes(" LIMIT ")) return matched;
    const limit = Number(params[params.length - 2]);
    const offset = Number(params[params.length - 1]);
    return matched.slice(offset, offset + limit);
  }

  function exec(raw: string, params: unknown[]): unknown[] {
    const sql = raw.replace(/\s+/g, " ").trim();
    log.push(sql);
    if (sql === "BEGIN") {
      checkpoint = cloneState(state);
      return [];
    }
    if (sql === "COMMIT") {
      checkpoint = null;
      return [];
    }
    if (sql === "ROLLBACK") {
      if (checkpoint) {
        const seq = state.seq;
        state = checkpoint;
        state.seq = seq;
      }
      checkpoint = null;
      return [];
    }
    if (sql.startsWith("LOCK TABLE")) return [];
    if (sql.startsWith("SELECT value FROM workbook_meta")) {
      const value = state.workbook_meta.get(String(params[0]));
      return value === undefined ? [] : [{ value }];
    }
    if (sql.startsWith("INSERT INTO workbook_meta")) {
      state.workbook_meta.set(String(params[0]), String(params[1]));
      return [];
    }
    if (sql.startsWith("SELECT id FROM planning")) {
      return state.planning.filter((row) => row.plan_key === params[0]).map((row) => ({ id: row.id }));
    }
    if (sql.startsWith("INSERT INTO planning (")) {
      const row = rowFrom(columnsOf(sql), params);
      row.id = nextId("planning");
      state.planning.push(row);
      return [{ id: row.id }];
    }
    if (sql.startsWith("INSERT INTO planning_revision")) {
      requireRow(state.planning, params[0], "planning");
      const row = rowFrom(columnsOf(sql), params);
      row.id = nextId("planning_revision");
      state.planning_revision.push(row);
      return [{ id: row.id }];
    }
    if (sql.startsWith("INSERT INTO planning_scope_item")) {
      requireRow(state.planning_revision, params[0], "planning_revision");
      const row = rowFrom(columnsOf(sql), params);
      row.id = nextId("planning_scope_item");
      state.planning_scope_item.push(row);
      return [];
    }
    if (sql.startsWith("INSERT INTO planning_item")) {
      requireRow(state.planning_revision, params[0], "planning_revision");
      const row = rowFrom(columnsOf(sql), params);
      const sameRevision = state.planning_item.filter((item) => item.revision_id === row.revision_id);
      if (row.suite_id != null && sameRevision.some((item) => item.suite_id === row.suite_id)) {
        throw new Error("identidade duplicada: planning_item suite");
      }
      if (
        row.suite_id == null &&
        row.test_point_id != null &&
        sameRevision.some((item) => item.suite_id == null && item.test_point_id === row.test_point_id)
      ) {
        throw new Error("identidade duplicada: planning_item point");
      }
      row.id = nextId("planning_item");
      state.planning_item.push(row);
      return [{ id: row.id }];
    }
    if (sql.startsWith("INSERT INTO planning_allocation")) {
      requireRow(state.planning_item, params[0], "planning_item");
      const row = rowFrom(columnsOf(sql), params);
      row.id = nextId("planning_allocation");
      state.planning_allocation.push(row);
      return [];
    }
    if (sql.startsWith("DELETE FROM planning_allocation")) {
      state.planning_allocation = state.planning_allocation.filter(
        (row) => !(row.item_id === params[0] && row.alloc_date === params[1]),
      );
      return [];
    }
    if (
      sql.startsWith("UPDATE planning_item SET planned_start") ||
      sql.startsWith("UPDATE planning_item SET planned_end") ||
      sql.startsWith("UPDATE planning_item SET responsavel") ||
      sql.startsWith("UPDATE planning_item SET prioridade")
    ) {
      const column = sql.includes("planned_start")
        ? "planned_start"
        : sql.includes("planned_end")
          ? "planned_end"
          : sql.includes("responsavel")
            ? "responsavel"
            : "prioridade";
      const row = state.planning_item.find((item) => item.id === params[1]);
      if (row) row[column] = params[0];
      return [];
    }
    if (sql.startsWith("SELECT r.id, r.version")) {
      let rows = revisionsOf(params[0]);
      if (sql.includes("r.version = $2")) rows = rows.filter((row) => row.version === params[1]);
      rows = [...rows].sort((a, b) => Number(b.version) - Number(a.version));
      return sql.includes("LIMIT 1") ? rows.slice(0, 1) : rows;
    }
    if (sql.startsWith("SELECT r.version, r.created_at, r.reason")) {
      return [...revisionsOf(params[0])].sort((a, b) => Number(a.version) - Number(b.version));
    }
    if (sql.startsWith("SELECT plan_id, suite_id")) {
      return state.planning_scope_item.filter((row) => row.revision_id === params[0]);
    }
    if (sql.startsWith("SELECT id, suite_id, suite_name")) {
      return state.planning_item.filter((row) => row.revision_id === params[0]);
    }
    if (sql.startsWith("SELECT a.item_id")) {
      const itemIds = new Set(state.planning_item.filter((row) => row.revision_id === params[0]).map((row) => row.id));
      return state.planning_allocation.filter((row) => itemIds.has(row.item_id));
    }
    if (sql === "DELETE FROM execucoes") {
      state.execucoes = [];
      return [];
    }
    if (sql === "DELETE FROM falhas") {
      state.falhas = [];
      return [];
    }
    if (sql.startsWith("INSERT INTO execucoes")) {
      const row = rowFrom(columnsOf(sql), params);
      row.id = nextId("execucoes");
      state.execucoes.push(row);
      return [];
    }
    if (sql.startsWith("INSERT INTO falhas")) {
      const row = rowFrom(columnsOf(sql), params);
      row.id = nextId("falhas");
      state.falhas.push(row);
      return [];
    }
    if (sql.includes("FROM execucoes")) return page("execucoes", sql, params);
    if (sql.includes("FROM falhas")) return page("falhas", sql, params);
    throw new Error(`SQL não suportado no fake: ${sql.slice(0, 96)}`);
  }

  const query = async (sql: string, params?: unknown[]) => ({ rows: exec(sql, params ?? []) });
  return {
    log,
    counts: () => ({
      planning: state.planning.length,
      revisions: state.planning_revision.length,
      scope: state.planning_scope_item.length,
      items: state.planning_item.length,
      allocations: state.planning_allocation.length,
      execucoes: state.execucoes.length,
      falhas: state.falhas.length,
      nextRevision: state.seq.planning_revision,
    }),
    pool: {
      query,
      async connect() {
        return { query, release() {} };
      },
    },
  };
}
