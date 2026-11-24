package com.fourqa.api.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Environment lookup equivalent to {@code fourqa.azure.config.env_value}: process env first, then the repo {@code .env}. */
public final class Env {
  private static final Pattern LINE =
      Pattern.compile("^\\s*(?:export\\s+)?([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.*?)\\s*$");
  private static final Map<String, String> OVERRIDES = new ConcurrentHashMap<>();
  private static final String UNSET = "\u0000unset";

  private Env() {}

  /** Stripped value or empty string. */
  public static String value(String name) {
    String raw = raw(name);
    return raw == null ? "" : raw.strip();
  }

  /** Raw value (not stripped) or null when undefined, like {@code os.environ.get}. */
  public static String raw(String name) {
    String override = OVERRIDES.get(name);
    if (override != null) return UNSET.equals(override) ? null : override;
    String env = System.getenv(name);
    if (env != null) return env;
    return fileEnv().get(name);
  }

  public static boolean isSet(String name) {
    return raw(name) != null;
  }

  /**
   * Hosted runtime (Python: {@code VERCEL=1}). The Java host sets {@code FOURQA_HOSTED=1}; both enable the production
   * rules: protected reads, no open writes, secure cookies, no {@code .env} file, no local SQLite.
   */
  public static boolean hosted() {
    return "1".equals(raw("VERCEL")) || "1".equals(raw("FOURQA_HOSTED"));
  }

  /** Test hook: {@code null} value hides the variable. */
  public static void override(String name, String value) {
    OVERRIDES.put(name, value == null ? UNSET : value);
  }

  public static void clearOverrides() {
    OVERRIDES.clear();
  }

  private static Map<String, String> fileEnv() {
    for (String flag : new String[] {"VERCEL", "FOURQA_HOSTED"}) {
      String v = OVERRIDES.containsKey(flag) ? OVERRIDES.get(flag) : System.getenv(flag);
      if ("1".equals(v)) return Map.of();
    }
    String ignore = OVERRIDES.containsKey("FOURQA_IGNORE_ENV_FILE")
        ? OVERRIDES.get("FOURQA_IGNORE_ENV_FILE")
        : System.getenv("FOURQA_IGNORE_ENV_FILE");
    if ("1".equals(ignore)) return Map.of();
    Path file = envFile();
    if (file == null) return Map.of();
    Map<String, String> out = new HashMap<>();
    try {
      for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
        if (line.stripLeading().startsWith("#")) continue;
        Matcher m = LINE.matcher(line);
        if (!m.matches()) continue;
        String value = m.group(2);
        if (value.length() >= 2
            && value.charAt(0) == value.charAt(value.length() - 1)
            && (value.charAt(0) == '"' || value.charAt(0) == '\'')) {
          value = value.substring(1, value.length() - 1);
        }
        out.put(m.group(1), value);
      }
    } catch (IOException e) {
      return Map.of();
    }
    return out;
  }

  private static Path envFile() {
    String explicit = System.getenv("FOURQA_ENV_FILE");
    if (explicit != null && !explicit.isBlank()) {
      Path p = Path.of(explicit);
      return Files.isRegularFile(p) ? p : null;
    }
    Path cwd = Path.of("").toAbsolutePath();
    for (Path dir = cwd; dir != null; dir = dir.getParent()) {
      Path candidate = dir.resolve(".env");
      if (Files.isRegularFile(candidate) && Files.exists(dir.resolve("package.json"))) return candidate;
    }
    return null;
  }
}
