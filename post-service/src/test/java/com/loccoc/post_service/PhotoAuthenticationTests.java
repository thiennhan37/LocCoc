package com.loccoc.post_service;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import com.loccoc.post_service.repository.PostRepository;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:photo-auth", "spring.datasource.username=sa", "spring.datasource.password=", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class PhotoAuthenticationTests {
  static final UUID OWNER=UUID.randomUUID();
  @TempDir static Path directory;
  static HttpServer upstream;
  @Autowired MockMvc mvc;
  @Autowired PostRepository repository;
  @DynamicPropertySource static void properties(DynamicPropertyRegistry r) throws Exception {
    upstream=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
    upstream.createContext("/users/me", e -> {
      String auth=e.getRequestHeaders().getFirst("Authorization");
      int status="Bearer valid".equals(auth)?200:"Bearer disabled".equals(auth)?403:"Bearer outage".equals(auth)?503:401;
      byte[] body=("{\"id\":\""+OWNER+"\"}").getBytes(java.nio.charset.StandardCharsets.UTF_8);
      e.sendResponseHeaders(status,body.length); e.getResponseBody().write(body); e.close();
    });
    upstream.start();
    r.add("post.user-service-url",()->"http://127.0.0.1:"+upstream.getAddress().getPort());
    r.add("post.media-dir",()->directory.toString());
  }
  @AfterAll static void stop() { upstream.stop(0); }
  @BeforeEach void clean() { repository.deleteAll(); }
  String body(UUID owner) throws Exception {
    return "{\"requestId\":\"%s\",\"ownerId\":\"%s\",\"imageBase64\":\"%s\"}".formatted(UUID.randomUUID(),owner,Base64.getEncoder().encodeToString(PhotoPostApiTests.png(8)));
  }
  @Test void rejectsMissingInvalidExpiredAndRevokedBearerDespiteSpoofedHeaders() throws Exception {
    for(String token:List.of("", "Basic valid", "Bearer invalid", "Bearer expired", "Bearer revoked")) {
      mvc.perform(post("/posts/photos").header("Authorization",token).header("X-User-Id",OWNER.toString()).contentType("application/json").content(body(OWNER)))
        .andExpect(status().isUnauthorized());
    }
    assertThat(repository.count()).isZero();
  }
  @Test void rejectsForgedOwnerAndDisabledAccount() throws Exception {
    mvc.perform(post("/posts/photos").header("Authorization","Bearer valid").contentType("application/json").content(body(UUID.randomUUID())))
      .andExpect(status().isForbidden());
    mvc.perform(post("/posts/photos").header("Authorization","Bearer disabled").contentType("application/json").content(body(OWNER)))
      .andExpect(status().isForbidden());
    assertThat(repository.count()).isZero();
  }
  @Test void identityOutageFailsClosed() throws Exception {
    mvc.perform(post("/posts/photos").header("Authorization","Bearer outage").contentType("application/json").content(body(OWNER)))
      .andExpect(status().isServiceUnavailable());
    assertThat(repository.count()).isZero();
  }
}
