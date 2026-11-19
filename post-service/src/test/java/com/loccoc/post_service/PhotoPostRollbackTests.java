package com.loccoc.post_service;
import com.loccoc.post_service.dto.PhotoPostRequest;
import com.loccoc.post_service.entity.Post;
import com.loccoc.post_service.repository.*;
import com.loccoc.post_service.service.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:upload-recovery", "spring.datasource.username=sa", "spring.datasource.password=", "spring.jpa.hibernate.ddl-auto=create-drop"})
class PhotoPostRollbackTests {
  @Autowired PhotoPostService service;
  @Autowired jakarta.persistence.EntityManager em;
  @Autowired MediaJobRepository jobs;
  @MockitoSpyBean PostRepository posts;
  @MockitoBean PhotoStorage storage;
  @MockitoBean UserIdentityClient identity;
  @Test void failedActivationRetainsDurableIntentAndRetryPublishesWithoutDeletingObject() throws Exception {
    UUID owner=UUID.randomUUID(),id=UUID.randomUUID();when(identity.resolve("Bearer valid")).thenReturn(owner);
    when(storage.save(any(),any(),any(),any())).thenReturn(true,false);
    var request=new PhotoPostRequest(id,owner,Base64.getEncoder().encodeToString(PhotoPostApiTests.png(8)),"Hello");
    doAnswer(call->{ Post p=call.getArgument(0);if("active".equals(p.getState())) throw new IllegalStateException("DB unavailable");var saved=em.merge(p);em.flush();return saved; }).when(posts).saveAndFlush(any());
    assertThatThrownBy(()->service.publish(request,"Bearer valid")).isInstanceOf(IllegalStateException.class);
    assertThat(posts.findById(id).orElseThrow().getState()).isEqualTo("draft");verify(storage,never()).discard(any());
    doAnswer(call->{ var saved=em.merge(call.<Post>getArgument(0));em.flush();return saved; }).when(posts).saveAndFlush(any());
    service.publish(request,"Bearer valid");
    assertThat(posts.findById(id).orElseThrow().getState()).isEqualTo("active");
    assertThat(jobs.findByPostIdAndOperation(id,"index")).isPresent();verify(storage,never()).discard(any());
  }
}
