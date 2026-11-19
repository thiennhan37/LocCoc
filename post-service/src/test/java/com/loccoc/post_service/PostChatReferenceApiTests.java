package com.loccoc.post_service;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:chat-reference-test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "spring.datasource.driver-class-name=org.h2.Driver", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class PostChatReferenceApiTests {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  static final UUID SELF=UUID.randomUUID(), OTHER=UUID.randomUUID(), OWNER=UUID.randomUUID();
  static volatile boolean visible=true;
  static HttpServer upstream;
  UUID post;
  @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) throws Exception {
    upstream=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
    upstream.createContext("/users/me/feed-audience",exchange->{
      String token=exchange.getRequestHeaders().getFirst("Authorization");
      boolean valid="Bearer self".equals(token)||"Bearer other".equals(token);
      UUID viewer="Bearer other".equals(token)?OTHER:SELF;
      String body="{\"viewerId\":\""+viewer+"\",\"authors\":[{\"id\":\""+viewer+"\",\"username\":\"me\"}"+(visible?",{\"id\":\""+OWNER+"\",\"username\":\"owner\"}":"")+"]}";
      byte[] bytes=body.getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(valid?200:401,bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
    });
    upstream.start();
    registry.add("post.user-service-url",()->"http://127.0.0.1:"+upstream.getAddress().getPort());
  }
  @AfterAll static void close() { upstream.stop(0); }
  @BeforeEach void setup() {
    visible=true; post=UUID.randomUUID();
    jdbc.update("INSERT INTO moments(id,owner_id,media_key,media_type,created_at) VALUES(?,?,?,0,?)",post,OWNER,"/posts/media/"+post,Timestamp.from(Instant.now()));
  }
  @Test void returnsStableReferenceOnlyForAuthenticatedVisiblePeerPost() throws Exception {
    mvc.perform(get("/posts/{id}/chat-reference",post).header("Authorization","Bearer self"))
      .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
      .andExpect(jsonPath("$.postId").value(post.toString()))
      .andExpect(jsonPath("$.ownerId").value(OWNER.toString()))
      .andExpect(jsonPath("$.mediaKey").value("/posts/media/"+post));
    mvc.perform(get("/posts/{id}/chat-reference",post)).andExpect(status().isUnauthorized());
    mvc.perform(get("/posts/{id}/chat-reference",post).header("Authorization","Bearer invalid")).andExpect(status().isUnauthorized());
  }
  @Test void rejectsDeletedMissingInvisibleAndOwnPosts() throws Exception {
    visible=false; unavailable(post); visible=true;
    unavailable(UUID.randomUUID());
    jdbc.update("UPDATE moments SET deleted_at=? WHERE id=?",Timestamp.from(Instant.now()),post); unavailable(post);
    jdbc.update("UPDATE moments SET deleted_at=NULL,owner_id=? WHERE id=?",SELF,post);
    mvc.perform(get("/posts/{id}/chat-reference",post).header("Authorization","Bearer self")).andExpect(status().isForbidden());
  }
  @Test void rejectsUnsupportedMediaReference() throws Exception {
    jdbc.update("UPDATE moments SET media_key=? WHERE id=?","https://untrusted.example/image",post);
    unavailable(post);
  }
  void unavailable(UUID id) throws Exception {
    mvc.perform(get("/posts/{id}/chat-reference",id).header("Authorization","Bearer self")).andExpect(status().isNotFound());
  }
}
