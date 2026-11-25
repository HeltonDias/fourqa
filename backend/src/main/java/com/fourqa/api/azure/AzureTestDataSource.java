package com.fourqa.api.azure;

import com.fourqa.api.connector.TestDataSource;
import java.util.Map;

/**
 * Adapter Azure DevOps da porta {@link TestDataSource} (ADR 009, etapa E1). Delega para
 * {@link AzureDataRefresh#buildAzureRefreshDraft} sem alterar o comportamento. Erros do cliente, como
 * {@link AzureHttpError}, propagam sem tradução.
 */
public final class AzureTestDataSource implements TestDataSource {
  private final AzureClient client;

  /** Constrói o cliente a partir de {@code cfg.azure}, no mesmo ponto em que o sync o criava antes. */
  @SuppressWarnings("unchecked")
  public AzureTestDataSource(Map<String, Object> cfg) {
    this.client = new AzureClient((Map<String, Object>) cfg.get("azure"));
  }

  @Override
  public Map<String, Object>[] refresh(Map<String, Object> cfg, Report report) {
    return AzureDataRefresh.buildAzureRefreshDraft(client, cfg, report);
  }
}
