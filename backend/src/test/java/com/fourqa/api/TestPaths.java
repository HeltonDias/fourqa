package com.fourqa.api;

import java.nio.file.Files;
import java.nio.file.Path;

public final class TestPaths {
  private TestPaths() {}

  /** Locates a repo file by walking up from the working directory. */
  public static Path find(String... candidates) {
    for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
      for (String c : candidates) {
        Path p = dir.resolve(c);
        if (Files.exists(p)) return p;
      }
    }
    throw new IllegalStateException("Arquivo não encontrado: " + String.join(", ", candidates));
  }
}
