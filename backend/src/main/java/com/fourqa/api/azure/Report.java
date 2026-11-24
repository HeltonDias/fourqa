package com.fourqa.api.azure;

/** Sync progress callback: step text plus optional done/total counters. */
@FunctionalInterface
public interface Report {
  void step(String step, Integer done, Integer total);

  Report NONE = (s, d, t) -> {};
}
