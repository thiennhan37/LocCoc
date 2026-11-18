package com.loccoc.post_service.configuration;

import java.nio.file.*;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.*;
import static org.assertj.core.api.Assertions.*;

class LocalAiEnvironmentTests {
  @TempDir Path root;
  private StandardEnvironment environment() {
    var env=new StandardEnvironment();env.getPropertySources().remove("systemEnvironment");env.getPropertySources().remove("systemProperties");return env;
  }
  private void fixture() throws Exception {
    Files.createDirectories(root.resolve("ai-service"));Files.createDirectories(root.resolve("post-service"));
    Files.writeString(root.resolve("ai-service/.env"),"SEMANTIC_SEARCH_ENABLED=true\nAI_SERVICE_TOKEN='test-token'\nAI_ACTOR_SECRET=\"test-actor\"\nEMBEDDING_DIM=768 # local default\nGEMINI_EMBEDDING_API_KEY=never-copy\nGEMINI_API_KEY=never-copy-either\nGEMINI_DAILY_REQUEST_CAP=100\n");
  }
  @Test void ideAndRootLaunchesReceiveOnlyFourProtocolValues() throws Exception {
    fixture();
    for(Path cwd:java.util.List.of(root,root.resolve("post-service"))) {
      var env=environment();LocalAiEnvironment.loadDefaults(env,cwd);
      assertThat(env.getProperty("SEMANTIC_SEARCH_ENABLED")).isEqualTo("true");
      assertThat(env.getProperty("AI_SERVICE_TOKEN")).isEqualTo("test-token");
      assertThat(env.getProperty("AI_ACTOR_SECRET")).isEqualTo("test-actor");
      assertThat(env.getProperty("EMBEDDING_DIM")).isEqualTo("768");
      assertThat(env.getProperty("GEMINI_EMBEDDING_API_KEY")).isNull();
      assertThat(env.getProperty("GEMINI_API_KEY")).isNull();
      assertThat(env.getProperty("GEMINI_DAILY_REQUEST_CAP")).isNull();
    }
  }
  @Test void explicitDisabledBlankCredentialAndDimensionArePreserved() throws Exception {
    fixture();var env=environment();
    env.getPropertySources().addFirst(new MapPropertySource("explicit",Map.of("SEMANTIC_SEARCH_ENABLED","false","AI_SERVICE_TOKEN","","EMBEDDING_DIM","3072")));
    LocalAiEnvironment.loadDefaults(env,root);
    assertThat(env.getProperty("SEMANTIC_SEARCH_ENABLED")).isEqualTo("false");
    assertThat(env.getProperty("AI_SERVICE_TOKEN")).isEmpty();
    assertThat(env.getProperty("EMBEDDING_DIM")).isEqualTo("3072");
  }
  @Test void productionAndOptOutDoNotReadLocalFile() throws Exception {
    fixture();var env=environment();env.setActiveProfiles("production");LocalAiEnvironment.loadDefaults(env,root);
    assertThat(env.getProperty("AI_SERVICE_TOKEN")).isNull();
    env=environment();env.getPropertySources().addFirst(new MapPropertySource("explicit",Map.of("post.local-ai-config-enabled","false")));
    LocalAiEnvironment.loadDefaults(env,root);assertThat(env.getProperty("AI_SERVICE_TOKEN")).isNull();
  }
  @Test void missingLocalFileLeavesNormalDeploymentUnchanged() {
    var env=environment();LocalAiEnvironment.loadDefaults(env,root);assertThat(env.getProperty("SEMANTIC_SEARCH_ENABLED")).isNull();
  }
}
