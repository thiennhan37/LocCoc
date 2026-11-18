package com.loccoc.post_service;

import com.loccoc.post_service.dto.MomentSearch;
import com.loccoc.post_service.service.MomentAiClient;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;

class MomentAiAvailabilityTests {
  private MomentSearch query() { return new MomentSearch("people",20,null,null,null,null,false); }
  @Test void disabledAndMissingCredentialsHaveExplicitSafeReasons() {
    assertThatThrownBy(()->new MomentAiClient(new MockEnvironment()).search(UUID.randomUUID(),query()))
      .isInstanceOf(MomentAiClient.Unavailable.class).hasMessage("SEMANTIC_DISABLED");
    assertThatThrownBy(()->new MomentAiClient(new MockEnvironment().withProperty("post.semantic-enabled","true")).search(UUID.randomUUID(),query()))
      .isInstanceOf(MomentAiClient.Unavailable.class).hasMessage("SEMANTIC_CONFIGURATION_ERROR");
  }
  @Test void onlyKnownUpstreamCodesSurviveAndProviderDetailsNeverEscape() throws Exception {
    for(String code:new String[]{"PROVIDER_QUOTA_EXHAUSTED","unexpected-private-provider-detail"}) {
      var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
      server.createContext("/internal/search",exchange->{
        var data=("{\"code\":\""+code+"\",\"message\":\"private-provider-detail\"}").getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(503,data.length);exchange.getResponseBody().write(data);exchange.close();
      });server.start();
      try {
        var env=new MockEnvironment().withProperty("post.semantic-enabled","true")
          .withProperty("post.ai-token","s".repeat(40)).withProperty("post.ai-actor-secret","a".repeat(40))
          .withProperty("post.ai-url","http://127.0.0.1:"+server.getAddress().getPort());
        assertThatThrownBy(()->new MomentAiClient(env).search(UUID.randomUUID(),query()))
          .hasMessage(code.equals("PROVIDER_QUOTA_EXHAUSTED")?code:"SEMANTIC_UNAVAILABLE");
      } finally { server.stop(0); }
    }
  }
}
