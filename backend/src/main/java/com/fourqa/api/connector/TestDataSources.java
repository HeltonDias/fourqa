package com.fourqa.api.connector;

import com.fourqa.api.azure.AzureTestDataSource;
import java.util.Map;
import java.util.function.Function;

/**
 * Registro estático da fonte de dados usada pelo sync (ADR 009, etapa E1). O padrão é o Azure DevOps; a fábrica só pode
 * ser trocada por testes.
 */
public final class TestDataSources {
  private static final Function<Map<String, Object>, TestDataSource> DEFAULT_FACTORY = AzureTestDataSource::new;
  private static volatile Function<Map<String, Object>, TestDataSource> factory = DEFAULT_FACTORY;

  private TestDataSources() {}

  /** Resolve a fonte para a configuração de sync informada. */
  public static TestDataSource forConfig(Map<String, Object> cfg) {
    return factory.apply(cfg);
  }

  /** Apenas para testes: substitui a fábrica. Chame {@link #reset()} ao final. */
  public static void setFactoryForTesting(Function<Map<String, Object>, TestDataSource> testFactory) {
    factory = testFactory;
  }

  /** Restaura a fábrica padrão (Azure). */
  public static void reset() {
    factory = DEFAULT_FACTORY;
  }
}
