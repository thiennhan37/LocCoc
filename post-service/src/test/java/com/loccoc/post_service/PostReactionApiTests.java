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

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:reaction-test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "spring.datasource.driver-class-name=org.h2.Driver", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class PostReactionApiTests {
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
  JsonNode set(String viewer,String emoji) throws Exception {
    return json(mvc.perform(put("/posts/{id}/reaction",post).header("Authorization","Bearer "+viewer).contentType("application/json").content("{\"emoji\":\""+emoji+"\"}")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andReturn().getResponse().getContentAsString());
  }
  JsonNode json(String body) { return JsonMapper.builder().build().readTree(body); }
  @Test void persistsCountsSelectionReplacementAndIdempotentRetries() throws Exception {
    var empty=json(mvc.perform(get("/posts/{id}/reactions",post).header("Authorization","Bearer self")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    assertThat(empty.get("counts").size()).isZero(); assertThat(empty.get("myReaction").isNull()).isTrue();
    set("self","💛"); var same=set("self","💛");
    assertThat(same.get("counts").get("💛").asInt()).isEqualTo(1);
    var two=set("other","💛"); assertThat(two.get("counts").get("💛").asInt()).isEqualTo(2);
    var changed=set("self","🔥"); assertThat(changed.get("myReaction").asText()).isEqualTo("🔥");
    assertThat(changed.get("counts").get("💛").asInt()).isEqualTo(1);
    assertThat(changed.get("counts").get("🔥").asInt()).isEqualTo(1);
    for(int i=0;i<2;i++) {
      var removed=json(mvc.perform(delete("/posts/{id}/reaction",post).header("Authorization","Bearer self")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
      assertThat(removed.get("myReaction").isNull()).isTrue(); assertThat(removed.get("counts").has("🔥")).isFalse();
      assertThat(removed.get("counts").get("💛").asInt()).isEqualTo(1);
    }
    assertThat(jdbc.queryForObject("SELECT count(*) FROM post_reactions WHERE post_id=?",Integer.class,post)).isEqualTo(1);
  }
  @Test void authenticatesEveryOperation() throws Exception {
    mvc.perform(get("/posts/{id}/reactions",post)).andExpect(status().isUnauthorized());
    mvc.perform(delete("/posts/{id}/reaction",post)).andExpect(status().isUnauthorized());
    mvc.perform(put("/posts/{id}/reaction",post).contentType("application/json").content("{\"emoji\":\"💛\"}")).andExpect(status().isUnauthorized());
    for(String token:List.of("", "Bearer invalid")) for(var request:List.of(get("/posts/{id}/reactions",post),put("/posts/{id}/reaction",post).contentType("application/json").content("{\"emoji\":\"💛\"}"),delete("/posts/{id}/reaction",post)))
      mvc.perform(request.header("Authorization",token)).andExpect(status().isUnauthorized());
  }
  @Test void rejectsMissingDeletedAndCurrentlyInvisiblePosts() throws Exception {
    set("self","💛");
    visible=false; assertUnavailable(); visible=true;
    jdbc.update("UPDATE moments SET deleted_at=? WHERE id=?",Timestamp.from(Instant.now()),post); assertUnavailable();
    post=UUID.randomUUID(); assertUnavailable();
  }
  void assertUnavailable() throws Exception {
    for(var request:List.of(get("/posts/{id}/reactions",post),put("/posts/{id}/reaction",post).contentType("application/json").content("{\"emoji\":\"💛\"}"),delete("/posts/{id}/reaction",post)))
      mvc.perform(request.header("Authorization","Bearer self")).andExpect(status().isNotFound());
  }
  @Test void rejectsInvalidEmojiAndAcceptsEntireAllowlist() throws Exception {
    for(String body:List.of("{}","{\"emoji\":null}","{\"emoji\":\"❤️\"}","{\"emoji\":\"💛🔥\"}","{\"emoji\":\" 💛\"}"))
      mvc.perform(put("/posts/{id}/reaction",post).header("Authorization","Bearer self").contentType("application/json").content(body)).andExpect(status().isBadRequest());
    for(String emoji:List.of("💛","🔥","😍","😂","👏")) assertThat(set("self",emoji).get("myReaction").asText()).isEqualTo(emoji);
  }
  @Test void ownerCannotAddChangeOrRemoveReactionsOnOwnPost() throws Exception {
    jdbc.update("UPDATE moments SET owner_id=? WHERE id=?",SELF,post);
    for(var request:List.of(put("/posts/{id}/reaction",post).contentType("application/json").content("{\"emoji\":\"💛\"}"),delete("/posts/{id}/reaction",post)))
      mvc.perform(request.header("Authorization","Bearer self")).andExpect(status().isForbidden());
    assertThat(jdbc.queryForObject("SELECT count(*) FROM post_reactions WHERE post_id=?",Integer.class,post)).isZero();
    var summary=json(mvc.perform(get("/posts/{id}/reactions",post).header("Authorization","Bearer self")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    assertThat(summary.get("counts").size()).isZero();
  }
  @Test void legacySelfReactionsAreNotCountedButOtherPeoplesReactionsRemain() throws Exception {
    jdbc.update("UPDATE moments SET owner_id=? WHERE id=?",SELF,post);
    for(var viewer:List.of(SELF,OTHER)) jdbc.update("INSERT INTO post_reactions(id,viewer_id,post_id,emoji) VALUES(?,?,?,?)",viewer+":"+post,viewer,post,"💛");
    var summary=json(mvc.perform(get("/posts/{id}/reactions",post).header("Authorization","Bearer self")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    assertThat(summary.get("counts").get("💛").asInt()).isEqualTo(1);
    assertThat(summary.get("myReaction").isNull()).isTrue();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM post_reactions WHERE post_id=?",Integer.class,post)).isEqualTo(2);
  }
  @Test void concurrentRetriesCreateExactlyOneReaction() throws Exception {
    try(var executor=Executors.newFixedThreadPool(4)) {
      var start=new CountDownLatch(1); var tasks=new ArrayList<Future<JsonNode>>();
      for(int i=0;i<8;i++) tasks.add(executor.submit(()->{start.await(); return set("self","💛");}));
      start.countDown();
      for(var task:tasks) assertThat(task.get(20,TimeUnit.SECONDS).get("counts").get("💛").asInt()).isEqualTo(1);
    }
    assertThat(jdbc.queryForObject("SELECT count(*) FROM post_reactions WHERE post_id=?",Integer.class,post)).isEqualTo(1);
  }
}
