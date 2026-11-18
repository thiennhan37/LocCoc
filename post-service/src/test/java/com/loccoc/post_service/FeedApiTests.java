package com.loccoc.post_service;

import org.junit.jupiter.api.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:feed-test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "spring.datasource.driver-class-name=org.h2.Driver", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class FeedApiTests {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  static final UUID SELF=UUID.randomUUID(), FRIEND=UUID.randomUUID(), STRANGER=UUID.randomUUID();
  static volatile boolean friends=true;
  static HttpServer upstream;
  static String postgresSchema;
  @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) throws Exception {
    String db=System.getenv("FEED_TEST_DB_URL");
    if(db!=null) {
      postgresSchema="feed_test_"+UUID.randomUUID().toString().replace("-","");
      try(var connection=java.sql.DriverManager.getConnection(db,System.getenv("FEED_TEST_DB_USER"),System.getenv("FEED_TEST_DB_PASSWORD"));var statement=connection.createStatement()) {
        statement.execute("CREATE SCHEMA "+postgresSchema);
      }
      registry.add("spring.datasource.url",()->db+"?currentSchema="+postgresSchema);
      registry.add("spring.datasource.username",()->System.getenv("FEED_TEST_DB_USER"));
      registry.add("spring.datasource.password",()->System.getenv("FEED_TEST_DB_PASSWORD"));
      registry.add("spring.datasource.driver-class-name",()->"org.postgresql.Driver");
    }
    upstream=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
    upstream.createContext("/users/me/feed-audience",exchange->{
      boolean valid="Bearer valid".equals(exchange.getRequestHeaders().getFirst("Authorization"));
      String body="{\"viewerId\":\""+SELF+"\",\"authors\":[{\"id\":\""+SELF+"\",\"username\":\"me\"}"+(friends ? ",{\"id\":\""+FRIEND+"\",\"username\":\"friend\"}" : "")+"]}";
      byte[] bytes=body.getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(valid ? 200:401,bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
    });
    upstream.start();
    registry.add("post.user-service-url",()->"http://127.0.0.1:"+upstream.getAddress().getPort());
  }
  @AfterAll static void close() throws Exception {
    upstream.stop(0);
    if(postgresSchema!=null) {
      try(var connection=java.sql.DriverManager.getConnection(System.getenv("FEED_TEST_DB_URL"),System.getenv("FEED_TEST_DB_USER"),System.getenv("FEED_TEST_DB_PASSWORD"));var statement=connection.createStatement()) {
        statement.execute("DROP SCHEMA "+postgresSchema+" CASCADE");
      }
    }
  }
  @BeforeEach void reset() { jdbc.update("DELETE FROM post_views"); jdbc.update("DELETE FROM moments"); friends=true; }
  UUID seed(UUID owner,int hours) {
    UUID id=UUID.randomUUID();
    jdbc.update("INSERT INTO moments(id,owner_id,media_key,media_type,created_at) VALUES(?,?,?,0,?)",id,owner,"/posts/media/"+id,Timestamp.from(Instant.now().minusSeconds(hours*3600L+10)));
    return id;
  }
  tools.jackson.databind.JsonNode page(String cursor,int limit) throws Exception {
    var request=get("/posts/feed").header("Authorization","Bearer valid").param("limit",""+limit);
    if(cursor!=null) request.param("cursor",cursor);
    return JsonMapper.builder().build().readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
  }
  @Test void feedRequiresAuthenticatedViewer() throws Exception {
    mvc.perform(get("/posts/feed")).andExpect(status().isUnauthorized());
    mvc.perform(put("/posts/11111111-1111-4111-8111-111111111111/seen")).andExpect(status().isUnauthorized());
  }
  tools.jackson.databind.JsonNode authorPage(UUID owner, String cursor, int limit) throws Exception {
    var request=get("/posts/feed").header("Authorization","Bearer valid")
        .param("ownerId",owner.toString()).param("limit",""+limit);
    if(cursor!=null) request.param("cursor",cursor);
    return JsonMapper.builder().build().readTree(mvc.perform(request).andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString());
  }
  @Test void authorPagesAreChronologicalBoundedAndStableAcrossSeenAndNewPosts() throws Exception {
    seed(SELF,0); seed(STRANGER,0);
    UUID newest=seed(FRIEND,1), middle=seed(FRIEND,2), oldest=seed(FRIEND,3);
    UUID deleted=seed(FRIEND,0);
    jdbc.update("UPDATE moments SET deleted_at=? WHERE id=?",Timestamp.from(Instant.now()),deleted);
    mvc.perform(put("/posts/{id}/seen",newest).header("Authorization","Bearer valid")).andExpect(status().isNoContent());
    var first=authorPage(FRIEND,null,2);
    assertThat(first.get("data").size()).isEqualTo(2);
    assertThat(first.get("data").get(0).get("id").asText()).isEqualTo(newest.toString());
    assertThat(first.get("data").get(1).get("id").asText()).isEqualTo(middle.toString());
    UUID inserted=seed(FRIEND,0);
    var last=authorPage(FRIEND,first.get("nextCursor").asText(),2);
    assertThat(last.get("data").size()).isEqualTo(1);
    assertThat(last.get("data").get(0).get("id").asText()).isEqualTo(oldest.toString());
    assertThat(last.get("nextCursor").isNull()).isTrue();
    assertThat(authorPage(FRIEND,null,2).get("data").get(0).get("id").asText()).isEqualTo(inserted.toString());
  }
  @Test void authorPaginationChecksAudienceCursorScopeAndTies() throws Exception {
    UUID a=seed(FRIEND,1),b=seed(FRIEND,1),c=seed(FRIEND,1);
    jdbc.update("UPDATE moments SET created_at=?",Timestamp.from(Instant.now().minusSeconds(7200)));
    var ids=new HashSet<String>(); String cursor=null;
    do {
      var response=authorPage(FRIEND,cursor,1);
      assertThat(response.get("data").size()).isEqualTo(1);
      assertThat(ids.add(response.get("data").get(0).get("id").asText())).isTrue();
      cursor=response.get("nextCursor").isNull()?null:response.get("nextCursor").asText();
    } while(cursor!=null);
    assertThat(ids).containsExactlyInAnyOrder(a.toString(),b.toString(),c.toString());
    var first=authorPage(FRIEND,null,1); String next=first.get("nextCursor").asText();
    mvc.perform(get("/posts/feed").header("Authorization","Bearer valid").param("ownerId",SELF.toString()).param("cursor",next)).andExpect(status().isBadRequest());
    mvc.perform(get("/posts/feed").header("Authorization","Bearer valid").param("ownerId",STRANGER.toString())).andExpect(status().isNotFound());
    friends=false;
    mvc.perform(get("/posts/feed").header("Authorization","Bearer valid").param("ownerId",FRIEND.toString()).param("cursor",next)).andExpect(status().isNotFound());
    mvc.perform(get("/posts/feed").param("ownerId",FRIEND.toString())).andExpect(status().isUnauthorized());
    for(String limit:List.of("0","51")) mvc.perform(get("/posts/feed").header("Authorization","Bearer valid").param("ownerId",SELF.toString()).param("limit",limit)).andExpect(status().isBadRequest());
    assertThat(authorPage(SELF,null,10).get("data").isEmpty()).isTrue();
  }
  @Test void ranksOwnFreshFriendsOwnOldThenSeenAndExcludesStrangersAndDeleted() throws Exception {
    UUID self=seed(SELF,2),friend=seed(FRIEND,1),old=seed(SELF,25),seen=seed(FRIEND,0);
    seed(STRANGER,0); UUID deleted=seed(FRIEND,0); jdbc.update("UPDATE moments SET deleted_at=? WHERE id=?",Timestamp.from(Instant.now()),deleted);
    mvc.perform(put("/posts/{id}/seen",seen).header("Authorization","Bearer valid")).andExpect(status().isNoContent());
    mvc.perform(put("/posts/{id}/seen",seen).header("Authorization","Bearer valid")).andExpect(status().isNoContent());
    var data=page(null,20).get("data");
    assertThat(data.size()).isEqualTo(4);
    assertThat(data.get(0).get("id").asText()).isEqualTo(self.toString());
    assertThat(data.get(1).get("id").asText()).isEqualTo(friend.toString());
    assertThat(data.get(2).get("id").asText()).isEqualTo(old.toString());
    assertThat(data.get(3).get("id").asText()).isEqualTo(seen.toString());
    assertThat(data.get(3).get("seen").asBoolean()).isTrue();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM post_views",Integer.class)).isEqualTo(1);
  }
  @Test void stablePaginationDoesNotRepeatSeenItemsAndRefreshDemotesThem() throws Exception {
    UUID first=seed(SELF,0); seed(FRIEND,1); seed(SELF,26);
    var a=page(null,1); var cursor=a.get("nextCursor").asText();
    mvc.perform(put("/posts/{id}/seen",first).header("Authorization","Bearer valid")).andExpect(status().isNoContent());
    var rest=page(cursor,20).get("data");
    assertThat(rest.size()).isEqualTo(2);
    for(var item:rest) assertThat(item.get("id").asText()).isNotEqualTo(first.toString());
    assertThat(page(null,20).get("data").get(2).get("id").asText()).isEqualTo(first.toString());
  }
  @Test void rechecksFriendshipAndRejectsInvalidCursorAndSeenOutsideAudience() throws Exception {
    UUID id=seed(FRIEND,0); seed(SELF,1);
    friends=false;
    assertThat(page(null,20).get("data").size()).isEqualTo(1);
    mvc.perform(put("/posts/{id}/seen",id).header("Authorization","Bearer valid")).andExpect(status().isNotFound());
    mvc.perform(get("/posts/feed").header("Authorization","Bearer bad")).andExpect(status().isUnauthorized());
    mvc.perform(get("/posts/feed").header("Authorization","Bearer valid").param("cursor","bad")).andExpect(status().isBadRequest());
    mvc.perform(get("/posts/feed").header("Authorization","Bearer valid").param("limit","51")).andExpect(status().isBadRequest());
  }
  @Test void tiesPaginateWithoutDuplicatesAndExpiredCursorsFail() throws Exception {
    UUID a=seed(FRIEND,1),b=seed(FRIEND,1),c=seed(FRIEND,1);
    Timestamp same=Timestamp.from(Instant.now().minusSeconds(7200));
    jdbc.update("UPDATE moments SET created_at=?",same);
    var ids=new HashSet<String>(); String cursor=null;
    do {
      var response=page(cursor,1); assertThat(response.get("data").size()).isEqualTo(1);
      assertThat(ids.add(response.get("data").get(0).get("id").asText())).isTrue();
      cursor=response.get("nextCursor").isNull()?null:response.get("nextCursor").asText();
    } while(cursor!=null);
    assertThat(ids).containsExactlyInAnyOrder(a.toString(),b.toString(),c.toString());
    var expired=new com.loccoc.post_service.service.FeedCursor(Instant.now().minusSeconds(7200),1,Instant.now().minusSeconds(8000),a).encode();
    mvc.perform(get("/posts/feed").header("Authorization","Bearer valid").param("cursor",expired)).andExpect(status().isBadRequest());
  }
}
