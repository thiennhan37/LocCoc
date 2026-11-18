package com.loccoc.post_service;
import com.loccoc.post_service.dto.*;
import com.loccoc.post_service.entity.*;
import com.loccoc.post_service.exception.*;
import com.loccoc.post_service.repository.*;
import com.loccoc.post_service.service.*;
import java.util.*;
import java.util.concurrent.*;
import java.time.Instant;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:unified;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "spring.datasource.username=sa", "spring.datasource.password=", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class UnifiedMomentsTests {
  @org.springframework.test.context.DynamicPropertySource
  static void database(org.springframework.test.context.DynamicPropertyRegistry r) {
    if(System.getenv("POST_TEST_DB_URL")!=null) {
      r.add("spring.datasource.url",()->System.getenv("POST_TEST_DB_URL"));
      r.add("spring.datasource.username",()->"postgres");r.add("spring.datasource.password",()->System.getenv("POST_TEST_DB_PASSWORD"));
      r.add("spring.jpa.hibernate.ddl-auto",()->"validate");
    }
  }
  @Autowired MockMvc mvc;
  @Autowired MomentService moments;
  @Autowired PhotoPostService photos;
  @Autowired PostRepository posts;
  @Autowired MediaJobRepository jobs;
  @Autowired MediaWorker worker;
  @Autowired PostAccountEvents accounts;
  @MockitoBean UserIdentityClient identity;
  @MockitoBean FeedAudienceClient audience;
  @MockitoBean MomentAiClient ai;
  @MockitoBean PhotoStorage storage;
  UUID owner,friend,stranger;
  final Map<UUID,byte[]> objects=new ConcurrentHashMap<>();
  @BeforeEach void setup() throws Exception {
    jobs.deleteAll();posts.deleteAll();objects.clear();owner=UUID.randomUUID();friend=UUID.randomUUID();stranger=UUID.randomUUID();
    when(identity.resolve(null)).thenThrow(new AppException(ErrorCode.UNAUTHENTICATED));
    when(identity.resolve("Bearer owner")).thenReturn(owner);when(identity.resolve("Bearer friend")).thenReturn(friend);
    when(audience.resolve(null)).thenThrow(new AppException(ErrorCode.UNAUTHENTICATED));
    var authors=Map.of(owner,new FeedAudienceClient.Author(owner,"owner",null),friend,new FeedAudienceClient.Author(friend,"friend",null));
    when(audience.resolve("Bearer owner")).thenReturn(new FeedAudienceClient.Audience(owner,authors));
    when(audience.resolve("Bearer friend")).thenReturn(new FeedAudienceClient.Audience(friend,authors));
    when(audience.resolve("Bearer stranger")).thenReturn(new FeedAudienceClient.Audience(stranger,Map.of(stranger,new FeedAudienceClient.Author(stranger,"stranger",null))));
    when(storage.save(any(),any(),any(),any())).thenAnswer(c->{objects.put(c.getArgument(0),c.getArgument(1));return true;});
    when(storage.read(any())).thenAnswer(c->objects.get(c.getArgument(0)));
    doAnswer(c->{objects.remove(c.getArgument(0));return null;}).when(storage).discard(any());
    when(ai.enabled()).thenReturn(true);
    when(ai.search(any(),any())).thenThrow(new IllegalStateException("offline"));
  }
  UUID privatePhoto(String caption) throws Exception {
    UUID id=(UUID)moments.create("Bearer owner",new MomentRequest(caption,List.of("tag"),Instant.now(),null,"Hanoi")).get("id");
    moments.upload("Bearer owner",id,PhotoPostApiTests.png(16),"image/png");return id;
  }
  @Test void privateGalleryCannotLeakThroughMediaFeedReactionsOrSearch() throws Exception {
    UUID id=privatePhoto("Coffee Hanoi");
    mvc.perform(get("/posts/media/{id}",id)).andExpect(status().isUnauthorized());
    mvc.perform(get("/posts/media/{id}",id).header("Authorization","Bearer friend")).andExpect(status().isNotFound());
    mvc.perform(get("/posts/media/{id}",id).header("Authorization","Bearer owner")).andExpect(status().isOk());
    mvc.perform(get("/posts/feed").header("Authorization","Bearer friend")).andExpect(jsonPath("data").isEmpty());
    mvc.perform(get("/posts/{id}/reactions",id).header("Authorization","Bearer friend")).andExpect(status().isNotFound());
    mvc.perform(put("/posts/{id}/seen",id).header("Authorization","Bearer friend")).andExpect(status().isNotFound());
    mvc.perform(get("/moments/{id}",id).header("Authorization","Bearer friend")).andExpect(status().isNotFound());
    mvc.perform(post("/moments/search").header("Authorization","Bearer friend").contentType("application/json").content("{\"query\":\"Coffee\"}"))
      .andExpect(status().isOk()).andExpect(jsonPath("items").isEmpty());
  }
  @Test void socialMediaUsesLiveFriendAndBlockAudience() throws Exception {
    UUID id=UUID.randomUUID();photos.publish(new PhotoPostRequest(id,owner,Base64.getEncoder().encodeToString(PhotoPostApiTests.png(8)),"Social"),"Bearer owner");
    mvc.perform(get("/posts/media/{id}",id).header("Authorization","Bearer friend")).andExpect(status().isOk());
    mvc.perform(get("/posts/media/{id}",id).header("Authorization","Bearer stranger")).andExpect(status().isNotFound());
    when(audience.resolve("Bearer friend")).thenReturn(new FeedAudienceClient.Audience(friend,Map.of(friend,new FeedAudienceClient.Author(friend,"friend",null))));
    mvc.perform(get("/posts/media/{id}",id).header("Authorization","Bearer friend")).andExpect(status().isNotFound());
  }
  @Test void metadataFallbackFiltersAndCursorWorkWithoutAi() throws Exception {
    privatePhoto("Coffee Hanoi");privatePhoto("Rain");
    var result=moments.search("Bearer owner",new MomentSearch("Coffee",20,null,"Hanoi",null,null,false));
    assertThat((List<?>)result.get("items")).hasSize(1);assertThat(result.get("mode")).isEqualTo("metadata_only");
    assertThatThrownBy(()->moments.search("Bearer owner",new MomentSearch("Coffee",20,null,null,null,null,true))).isInstanceOf(AppException.class);
    var page=moments.list("Bearer owner",1,null);assertThat(page.get("nextCursor")).isNotNull();
    assertThat((List<?>)moments.list("Bearer owner",1,(String)page.get("nextCursor")).get("items")).hasSize(1);
    mvc.perform(post("/moments/search").header("Authorization","Bearer owner").contentType("application/json").content("{\"query\":\"x\",\"limit\":51}")).andExpect(status().isBadRequest());
  }
  @Test void fuzzyCaptionUsesOriginalQueryAndNeverGrantsAnotherOwnerAccess() throws Exception {
    UUID id=privatePhoto("Cà phê cùng bạn");
    var query=new MomentSearch("ca phee",20,null,"Hanoi",null,null,false);
    var result=moments.search("Bearer owner",query);
    assertThat((List<?>)result.get("items")).hasSize(1);
    assertThat(result.get("mode")).isEqualTo("metadata_only");
    var captor=org.mockito.ArgumentCaptor.forClass(MomentSearch.class);
    verify(ai).search(eq(owner),captor.capture());
    assertThat(captor.getValue().query()).isEqualTo("ca phee");
    assertThat((List<?>)moments.search("Bearer friend",query).get("items")).isEmpty();
    assertThat((List<?>)moments.search("Bearer owner",new MomentSearch("ca phee",20,null,"Elsewhere",null,null,false)).get("items")).isEmpty();
    assertThat((List<?>)moments.search("Bearer owner",new MomentSearch("ca phee",20,null,null,Instant.now().plusSeconds(60),null,false)).get("items")).isEmpty();
    moments.remove("Bearer owner",id);
    assertThat((List<?>)moments.search("Bearer owner",query).get("items")).isEmpty();
  }
  @Test void disabledSemanticReportsCaptionOnlyInsteadOfImplyingThereAreNoMatchingPhotos() throws Exception {
    privatePhoto("Người anh em");
    doThrow(new MomentAiClient.Unavailable("SEMANTIC_DISABLED")).when(ai).search(any(),any());
    var vi=moments.search("Bearer owner",new MomentSearch("người",20,null,null,null,null,false));
    var en=moments.search("Bearer owner",new MomentSearch("people",20,null,null,null,null,false));
    assertThat((List<?>)vi.get("items")).hasSize(1);assertThat((List<?>)en.get("items")).isEmpty();
    assertThat(en.get("mode")).isEqualTo("metadata_only");assertThat(en.get("reason")).isEqualTo("SEMANTIC_DISABLED");
  }
  @Test void fuzzySearchFindsOlderCaptionBeyondFirstMetadataPage() {
    UUID wanted=UUID.randomUUID();
    posts.saveAndFlush(Post.create(wanted,new CreatePostRequest(owner,PhotoPostService.mediaKey(wanted),0,null,"Cà phê cùng bạn",8,8)));
    var newer=new ArrayList<Post>();
    for(int i=0;i<205;i++) {
      UUID id=UUID.randomUUID();
      newer.add(Post.create(id,new CreatePostRequest(owner,PhotoPostService.mediaKey(id),0,null,"Mountain "+i,8,8)));
    }
    posts.saveAllAndFlush(newer);
    var result=moments.search("Bearer owner",new MomentSearch("ca phee",20,null,null,null,null,false));
    assertThat((List<?>)result.get("items")).hasSize(1);
    assertThat(((Map<?,?>)((List<?>)result.get("items")).getFirst()).get("id")).isEqualTo(wanted);
  }
  @Test void deletionBlocksImmediatelyAndObjectCleanupSurvivesAiFailure() throws Exception {
    UUID id=privatePhoto("Delete");moments.remove("Bearer owner",id);
    doThrow(new IllegalStateException("AI offline")).when(ai).delete(any());
    for(int i=0;i<5;i++) worker.runOne();
    assertThat(objects).doesNotContainKey(id);
    assertThat(jobs.findByPostIdAndOperation(id,"object_cleanup").orElseThrow().isDone()).isTrue();
    assertThat(jobs.findByPostIdAndOperation(id,"delete").orElseThrow().isDone()).isFalse();
    mvc.perform(get("/posts/media/{id}",id).header("Authorization","Bearer owner")).andExpect(status().isNotFound());
    verify(ai,never()).index(any(),any());
  }
  @Test void semanticHitsNeedCurrentOwnerStateAndVersion() throws Exception {
    UUID own=privatePhoto("own");worker.runOne();
    UUID other=UUID.randomUUID();posts.saveAndFlush(Post.create(other,new CreatePostRequest(friend,PhotoPostService.mediaKey(other),0,null,"other",8,8)));
    doReturn(List.of(new MomentAiClient.Hit(own,99),new MomentAiClient.Hit(other,1))).when(ai).search(any(),any());
    assertThat((List<?>)moments.search("Bearer owner",new MomentSearch("nomatch",20,null,null,null,null,false)).get("items")).isEmpty();
    doReturn(List.of(new MomentAiClient.Hit(own,1))).when(ai).search(any(),any());
    assertThat((List<?>)moments.search("Bearer owner",new MomentSearch("nomatch",20,null,null,null,null,false)).get("items")).hasSize(1);
    moments.remove("Bearer owner",own);
    assertThat((List<?>)moments.search("Bearer owner",new MomentSearch("nomatch",20,null,null,null,null,false)).get("items")).isEmpty();
  }
  @Test void parallelIdenticalPublishProducesOnePostAndOneJob() throws Exception {
    UUID id=UUID.randomUUID();var request=new PhotoPostRequest(id,owner,Base64.getEncoder().encodeToString(PhotoPostApiTests.png(8)),"retry");
    try(var executor=Executors.newFixedThreadPool(2)) {
      var a=executor.submit(()->photos.publish(request,"Bearer owner"));var b=executor.submit(()->photos.publish(request,"Bearer owner"));
      assertThat(a.get(15,TimeUnit.SECONDS).id()).isEqualTo(id);assertThat(b.get(15,TimeUnit.SECONDS).id()).isEqualTo(id);
    }
    assertThat(posts.count()).isEqualTo(1);assertThat(jobs.count()).isEqualTo(1);verify(storage,times(1)).save(eq(id),any(),eq(owner),eq("retry"));
  }
  @Test void legacyWritesRequireIdentityAndCannotSpoofOwner() throws Exception {
    String body="{\"ownerId\":\"%s\",\"mediaKey\":\"a.png\",\"mediaType\":0}".formatted(owner);
    mvc.perform(post("/posts").contentType("application/json").content(body)).andExpect(status().isUnauthorized());
    mvc.perform(post("/posts").header("Authorization","Bearer friend").contentType("application/json").content(body)).andExpect(status().isForbidden());
    UUID id=privatePhoto("keep");
    mvc.perform(delete("/posts/{id}",id).param("ownerId",owner.toString())).andExpect(status().isUnauthorized());
    mvc.perform(delete("/posts/{id}",id).param("ownerId",owner.toString()).header("Authorization","Bearer friend")).andExpect(status().isForbidden());
  }
  @Test void deletedAccountIsDurablyFencedAgainstLateUploads() throws Exception {
    UUID id=privatePhoto("erase");
    String event="{\"eventType\":\"ACCOUNT_CHANGED\",\"aggregateId\":\"%s\",\"version\":2,\"data\":{\"id\":\"%s\",\"version\":2,\"status\":\"deleted\"}}".formatted(owner,owner);
    accounts.apply(event);accounts.apply(event);
    assertThat(posts.findById(id).orElseThrow().getDeletedAt()).isNotNull();
    assertThatThrownBy(()->moments.create("Bearer owner",new MomentRequest("late",null,null,null,null))).isInstanceOf(AppException.class);
    assertThat(jobs.findByPostIdAndOperation(id,"object_cleanup")).isPresent();
  }  @Test void deletionDuringInFlightIndexQueuesAnotherVectorErasure() throws Exception {
    UUID id=privatePhoto("race");var started=new CountDownLatch(1);var finish=new CountDownLatch(1);
    doAnswer(c->{started.countDown();if(!finish.await(10,TimeUnit.SECONDS)) throw new IllegalStateException();return null;}).when(ai).index(any(),any());
    try(var executor=Executors.newSingleThreadExecutor()) {
      var running=executor.submit(()->worker.runOne());assertThat(started.await(10,TimeUnit.SECONDS)).isTrue();
      moments.remove("Bearer owner",id);
      worker.runOne();worker.runOne(); // Object and first vector cleanup, while index is still running.
      finish.countDown();running.get(10,TimeUnit.SECONDS);
      assertThat(jobs.findByPostIdAndOperation(id,"delete").orElseThrow().isDone()).isFalse();
      worker.runOne();verify(ai,times(2)).delete(any());
    } finally { finish.countDown(); }
  }

}
