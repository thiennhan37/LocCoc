package com.loccoc.post_service.configuration;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.*;

/** Same local protocol defaults as start-post.mjs, including IDE/Maven launches. */
public class LocalAiEnvironment implements EnvironmentPostProcessor, Ordered {
  private static final Set<String> KEYS=Set.of("SEMANTIC_SEARCH_ENABLED","AI_SERVICE_TOKEN","AI_ACTOR_SECRET","EMBEDDING_DIM");
  @Override public int getOrder() { return ConfigDataEnvironmentPostProcessor.ORDER+1; }
  @Override public void postProcessEnvironment(ConfigurableEnvironment env,SpringApplication application) {
    loadDefaults(env,Path.of(System.getProperty("user.dir")));
  }
  static void loadDefaults(ConfigurableEnvironment env,Path cwd) {
    if(!env.getProperty("post.local-ai-config-enabled",Boolean.class,true) ||
        Arrays.stream(env.getActiveProfiles()).anyMatch(p->p.equals("prod") || p.equals("production"))) return;
    Path source=null;
    for(Path candidate:List.of(cwd.resolve("ai-service/.env"),cwd.resolve("../ai-service/.env"))) {
      if(Files.isRegularFile(candidate)) { source=candidate;break; }
    }
    if(source==null) return;
    var defaults=new HashMap<String,Object>();
    try {
      for(String line:Files.readAllLines(source)) {
        String entry=line.strip().replaceFirst("^export\\s+","");int at=entry.indexOf('=');
        if(at<1) continue;
        String key=entry.substring(0,at).strip();
        if(!KEYS.contains(key) || env.containsProperty(key)) continue;
        String value=entry.substring(at+1).strip();
        if(value.startsWith("\"") || value.startsWith("'")) {
          int end=value.indexOf(value.charAt(0),1);if(end<1) continue;value=value.substring(1,end);
        } else { value=value.replaceFirst("\\s+#.*$","").strip(); }
        defaults.put(key,value);
      }
    } catch(IOException e) { throw new IllegalStateException("Cannot read local AI protocol defaults"); }
    // Explicit process, command-line, Post config and even blank values win.
    if(!defaults.isEmpty()) env.getPropertySources().addLast(new MapPropertySource("local-ai-protocol-defaults",defaults));
  }
}
