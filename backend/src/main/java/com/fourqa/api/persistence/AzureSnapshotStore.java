package com.fourqa.api.persistence;

import java.util.List;
import java.util.Map;

public interface AzureSnapshotStore {
  /** snapshot: execucoes, falhas, meta (Map&lt;String,String&gt;), optional plan_keys. */
  void replaceSnapshot(Map<String, Object> snapshot);

  List<Map<String, Object>> listExecucoes(String planKey);

  List<Map<String, Object>> listFalhas(String planKey);

  /** params: plan_key, limit, offset, q. Result: total, limit, offset, rows. */
  Map<String, Object> queryExecucoes(Map<String, Object> params);

  Map<String, Object> queryFalhas(Map<String, Object> params);
}
