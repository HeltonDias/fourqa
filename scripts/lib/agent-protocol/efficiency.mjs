/** Métricas enxutas — sem inventar tokens que o Cursor não expõe. */
export function initEfficiency() {
  return {
    subagent_invocations: 0,
    recovery_attempts: 0,
    human_interventions: 0,
    gate_runs_iterate: 0,
    gate_runs_release: 0,
    started_at: new Date().toISOString(),
    cursor_session_tokens: null,
  };
}

export function bumpEfficiency(run, field, delta = 1) {
  if (!run.efficiency) run.efficiency = initEfficiency();
  run.efficiency[field] = (run.efficiency[field] ?? 0) + delta;
  run.efficiency.updated_at = new Date().toISOString();
  return run;
}

/** Só preenche se variáveis de ambiente existirem (Cloud/local). */
export function captureCursorTelemetry(run) {
  if (!run.efficiency) run.efficiency = initEfficiency();
  const tokens = process.env.CURSOR_USAGE_TOTAL_TOKENS ?? process.env.CURSOR_SESSION_TOKENS;
  if (tokens) run.efficiency.cursor_session_tokens = Number(tokens);
  return run;
}
