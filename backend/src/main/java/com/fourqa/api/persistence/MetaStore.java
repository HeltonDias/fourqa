package com.fourqa.api.persistence;

import java.util.Map;

public interface MetaStore {
  String get(String key);

  Map<String, String> getMany(java.util.List<String> keys);

  void set(String key, String value);

  void setMany(Map<String, String> entries);

  void replaceHeaderIf(
      String expectedTitle, String expectedSubtitle, String title, String subtitle, String defaultTitle, String defaultSubtitle);

  void replacePeriodIf(String expectedInicio, String expectedFim, String inicio, String fim);
}
