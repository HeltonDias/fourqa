package com.fourqa.api.persistence;

import com.fourqa.api.util.Py;
import java.util.Map;
import java.util.Set;

/** Per-request {@code workbook_meta} scope and actor name (Python contextvars). */
public final class MetaScope {
  public static final Set<String> SCOPED_META_KEYS = Set.of(
      "data_inicio",
      "data_fim",
      "data_fim_linha",
      "cabecalho_titulo",
      "cabecalho_subtitulo",
      "title",
      "sync_parameters",
      "sync_job",
      "kpi_plan_key",
      "ultima_sincronizacao_azure",
      "planejamento_legado_plan_key");

  private static final ThreadLocal<String> SCOPE = new ThreadLocal<>();
  private static final ThreadLocal<String> ACTOR = new ThreadLocal<>();

  private MetaScope() {}

  public static String currentActorName() {
    return ACTOR.get();
  }

  public static void setActorName(String name) {
    if (name == null) ACTOR.remove();
    else ACTOR.set(name);
  }

  public static String currentMetaScope() {
    return SCOPE.get();
  }

  public static void setMetaScope(String scope) {
    if (scope == null) SCOPE.remove();
    else SCOPE.set(scope);
  }

  public static Object snapshot() {
    return new String[] {SCOPE.get(), ACTOR.get()};
  }

  public static void restore(Object snapshot) {
    String[] values = snapshot instanceof String[] s ? s : new String[2];
    setMetaScope(values[0]);
    setActorName(values[1]);
  }

  public static void clear() {
    SCOPE.remove();
    ACTOR.remove();
  }

  public static String connectionScope(Map<String, Object> connection) {
    if (connection == null || connection.isEmpty() || Py.truthy(connection.get("legacy"))) return null;
    return "conn:" + Py.str(connection.get("id"));
  }

  public static String scopedMetaKey(String key) {
    String scope = SCOPE.get();
    if (scope == null || scope.isEmpty() || !SCOPED_META_KEYS.contains(key)) return key;
    return scope + ":" + key;
  }
}
