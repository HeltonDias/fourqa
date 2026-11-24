package com.fourqa.api.web;

import com.fourqa.api.config.Env;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/** CORS of {@code fourqa.app} and, off the hosted runtime, the built SPA with index.html fallback. */
@Configuration
public class WebConfig implements WebMvcConfigurer {

  static List<String> allowedOrigins() {
    String configured = Env.value("FRONTEND_ORIGIN");
    List<String> origins = new ArrayList<>();
    if (!configured.isEmpty()) {
      for (String item : configured.split(",")) if (!item.strip().isEmpty()) origins.add(item.strip());
    } else {
      origins.add("http://localhost:5173");
      origins.add("http://localhost:3001");
    }
    for (String name : List.of("VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL")) {
      String host = System.getenv(name);
      if (host != null && !host.isEmpty()) origins.add("https://" + host);
    }
    return origins;
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/**")
        .allowedOrigins(allowedOrigins().toArray(String[]::new))
        .allowCredentials(true)
        .allowedMethods("*")
        .allowedHeaders("*");
  }

  static Path frontendDist() {
    String configured = Env.value("FOURQA_FRONTEND_DIST");
    if (!configured.isEmpty()) return Path.of(configured);
    Path dir = Path.of("").toAbsolutePath();
    for (int i = 0; i < 4 && dir != null; i++, dir = dir.getParent()) {
      Path candidate = dir.resolve("frontend").resolve("dist");
      if (Files.isDirectory(candidate)) return candidate;
    }
    return null;
  }

  @Override
  public void addResourceHandlers(ResourceHandlerRegistry registry) {
    if (Env.hosted()) return;
    Path dist = frontendDist();
    if (dist == null || !Files.isDirectory(dist)) return;
    Path index = dist.resolve("index.html");
    registry.addResourceHandler("/**")
        .addResourceLocations(new FileSystemResource(dist.toString() + "/"))
        .resourceChain(false)
        .addResolver(new PathResourceResolver() {
          @Override
          protected Resource getResource(String resourcePath, Resource location) throws IOException {
            if (resourcePath.startsWith("api/")) return null;
            Resource found = super.getResource(resourcePath.isEmpty() ? "index.html" : resourcePath, location);
            if (found != null) return found;
            return Files.isRegularFile(index) ? new FileSystemResource(index) : null;
          }
        });
  }
}
