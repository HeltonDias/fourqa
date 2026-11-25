package com.fourqa.api.connector;

import com.fourqa.api.azure.Report;
import java.util.Map;

/**
 * Porta mínima de uma fonte de dados de teste (ADR 009, etapa E1).
 *
 * <p>Fronteira entre o orquestrador de sync e o fornecedor: recebe a configuração de sync e devolve o
 * rascunho já normalizado no formato legado, sem DTO novo.
 */
public interface TestDataSource {

  /**
   * Busca e normaliza os dados do fornecedor.
   *
   * @return par {@code [draft, artifacts]}, no mesmo formato de {@code AzureDataRefresh.buildAzureRefreshDraft}
   */
  Map<String, Object>[] refresh(Map<String, Object> cfg, Report report);
}
