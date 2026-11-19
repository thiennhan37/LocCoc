package com.loccoc.post_service;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:ai-preview", "spring.datasource.username=sa", "spring.datasource.password=", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class AiPreviewApiTests {
  static HttpServer upstream;
  static final AtomicInteger calls=new AtomicInteger();
  static int aiStatus=200;
  static String multipart;
  static UUID owner=UUID.randomUUID();
  @Autowired MockMvc mvc;
  @DynamicPropertySource static void properties(DynamicPropertyRegistry r) throws Exception {
    upstream=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
    upstream.createContext("/users/me", e -> {
      boolean valid="Bearer valid".equals(e.getRequestHeaders().getFirst("Authorization"));
      byte[] body=("{\"id\":\""+owner+"\"}").getBytes();
      e.sendResponseHeaders(valid?200:401,body.length); e.getResponseBody().write(body); e.close();
    });
    upstream.createContext("/ai/images/enhance", e -> {
      calls.incrementAndGet(); multipart=new String(e.getRequestBody().readAllBytes(),java.nio.charset.StandardCharsets.ISO_8859_1);
      byte[] bytes;
      try { bytes=PhotoPostApiTests.png(8); } catch(Exception ex) { throw new java.io.IOException(ex); }
      e.getResponseHeaders().set("Content-Type","image/png");
      e.sendResponseHeaders(aiStatus,bytes.length); e.getResponseBody().write(bytes); e.close();
    });
    upstream.start();
    r.add("post.user-service-url",()->"http://127.0.0.1:"+upstream.getAddress().getPort());
    r.add("post.ai-service-url",()->"http://127.0.0.1:"+upstream.getAddress().getPort());
  }
  @AfterAll static void stop() { upstream.stop(0); }
  @BeforeEach void reset() { calls.set(0); aiStatus=200; owner=UUID.randomUUID(); }
  String body(UUID id,String filter) throws Exception {
    return "{\"requestId\":\"%s\",\"imageBase64\":\"%s\",\"filterId\":\"%s\"}".formatted(id,Base64.getEncoder().encodeToString(PhotoPostApiTests.png(8)),filter);
  }
  @Test void authenticatesBeforeAnyPaidCall() throws Exception {
    mvc.perform(post("/posts/photos/enhance").contentType("application/json").content(body(UUID.randomUUID(),"handwritten_diary"))).andExpect(status().isUnauthorized());
    assertThat(calls.get()).isZero();
  }
  @Test void sendsMultipartAndNeverCallsAgainForDuplicateId() throws Exception {
    var body=body(UUID.randomUUID(),"subject_sticker");
    mvc.perform(post("/posts/photos/enhance").header("Authorization","Bearer valid").contentType("application/json").content(body))
      .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
      .andExpect(jsonPath("mimeType").value("image/png")).andExpect(jsonPath("imageBase64").isString());
    assertThat(multipart).contains("name=\"filterId\"", "subject_sticker", "name=\"image\"", "Content-Type: image/png");
    mvc.perform(post("/posts/photos/enhance").header("Authorization","Bearer valid").contentType("application/json").content(body)).andExpect(status().isConflict());
    assertThat(calls.get()).isEqualTo(1);
  }
  @Test void invalidFilterDoesNotCallAi() throws Exception {
    mvc.perform(post("/posts/photos/enhance").header("Authorization","Bearer valid").contentType("application/json").content(body(UUID.randomUUID(),"custom"))).andExpect(status().isBadRequest());
    assertThat(calls.get()).isZero();
  }
  @Test void providerFailureDoesNotRetryAndAttemptStaysConsumed() throws Exception {
    aiStatus=504; var body=body(UUID.randomUUID(),"handwritten_diary");
    mvc.perform(post("/posts/photos/enhance").header("Authorization","Bearer valid").contentType("application/json").content(body)).andExpect(status().isGatewayTimeout());
    mvc.perform(post("/posts/photos/enhance").header("Authorization","Bearer valid").contentType("application/json").content(body)).andExpect(status().isConflict());
    assertThat(calls.get()).isEqualTo(1);
  }
  @Test void limitsAttemptsPerAuthenticatedUser() throws Exception {
    for(int i=0;i<5;i++)
      mvc.perform(post("/posts/photos/enhance").header("Authorization","Bearer valid").contentType("application/json")
          .content(body(UUID.randomUUID(),"handwritten_diary"))).andExpect(status().isOk());
    mvc.perform(post("/posts/photos/enhance").header("Authorization","Bearer valid").contentType("application/json")
        .content(body(UUID.randomUUID(),"handwritten_diary"))).andExpect(status().isTooManyRequests());
    assertThat(calls.get()).isEqualTo(5);
  }
  @Test void corruptInputNeverCallsProvider() throws Exception {
    mvc.perform(post("/posts/photos/enhance").header("Authorization","Bearer valid").contentType("application/json")
        .content("{\"requestId\":\""+UUID.randomUUID()+"\",\"imageBase64\":\"broken\",\"filterId\":\"subject_sticker\"}"))
        .andExpect(status().isBadRequest());
    assertThat(calls.get()).isZero();
  }
}
