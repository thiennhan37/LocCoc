package com.loccoc.api_gateway.configuration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/** Inherits local service-to-service tokens from sibling .env files during non-prod development. */
public class LocalGatewayEnvironment implements EnvironmentPostProcessor, Ordered {
  private static final Map<String, Set<String>> FILE_KEYS =
      Map.of(
          "ai-service/.env", Set.of("AI_SERVICE_TOKEN"),
          "auth-service/.env", Set.of("INTERNAL_SERVICE_TOKEN"));

  @Override
  public int getOrder() {
    return ConfigDataEnvironmentPostProcessor.ORDER + 1;
  }

  @Override
  public void postProcessEnvironment(
      ConfigurableEnvironment env, SpringApplication application) {
    loadDefaults(env, Path.of(System.getProperty("user.dir")));
  }

  static void loadDefaults(ConfigurableEnvironment env, Path cwd) {
    if (!env.getProperty("gateway.local-config-enabled", Boolean.class, true)
        || Arrays.stream(env.getActiveProfiles())
            .anyMatch(p -> p.equals("prod") || p.equals("production"))) {
      return;
    }
    var defaults = new HashMap<String, Object>();
    FILE_KEYS.forEach(
        (relPath, allowedKeys) -> {
          Path source = null;
          for (Path candidate : List.of(cwd.resolve(relPath), cwd.resolve("../" + relPath))) {
            if (Files.isRegularFile(candidate)) {
              source = candidate;
              break;
            }
          }
          if (source == null) return;
          try {
            for (String line : Files.readAllLines(source)) {
              String entry = line.replace("\uFEFF", "").strip().replaceFirst("^export\\s+", "");
              int at = entry.indexOf('=');
              if (at < 1) continue;
              String key = entry.substring(0, at).strip();
              if (!allowedKeys.contains(key) || env.containsProperty(key) || defaults.containsKey(key))
                continue;
              String value = entry.substring(at + 1).strip();
              if (value.startsWith("\"") || value.startsWith("'")) {
                int end = value.indexOf(value.charAt(0), 1);
                if (end < 1) continue;
                value = value.substring(1, end);
              } else {
                value = value.replaceFirst("\\s+#.*$", "").strip();
              }
              defaults.put(key, value);
            }
          } catch (IOException e) {
            throw new IllegalStateException("Cannot read local gateway token defaults", e);
          }
        });
    if (!defaults.isEmpty()) {
      env.getPropertySources().addLast(new MapPropertySource("local-gateway-defaults", defaults));
    }
  }
}
