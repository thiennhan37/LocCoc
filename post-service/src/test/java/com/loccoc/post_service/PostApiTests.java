package com.loccoc.post_service;

import com.loccoc.post_service.repository.PostRepository;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:posts-test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa", "spring.datasource.password=",
    "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class PostApiTests {
  @Autowired MockMvc mvc;
  @Autowired PostRepository repository;
  private final UUID owner = UUID.randomUUID();

  @BeforeEach void clean() { repository.deleteAll(); }

  private String body(int type) {
    return """
        {"ownerId":"%s","mediaKey":"moments/photo.jpg","mediaType":%d,
         "caption":"Xin chào","width":1080,"height":1920}
        """.formatted(owner, type);
  }

  @Test void createPersistsImageAndReturnsLocationWithoutToken() throws Exception {
    mvc.perform(post("/posts").contentType(MediaType.APPLICATION_JSON).content(body(0)))
        .andExpect(status().isCreated()).andExpect(header().exists("Location"))
        .andExpect(jsonPath("ownerId").value(owner.toString()))
        .andExpect(jsonPath("caption").value("Xin chào"))
        .andExpect(jsonPath("mediaType").value(0)).andExpect(jsonPath("createdAt").isNotEmpty());
    var post = repository.findAll().getFirst();
    assertThat(post.getMediaKey()).isEqualTo("moments/photo.jpg");
    assertThat(post.getDeletedAt()).isNull();
  }

  @Test void videoIsAccepted() throws Exception {
    mvc.perform(post("/posts").contentType(MediaType.APPLICATION_JSON).content(body(1)))
        .andExpect(status().isCreated()).andExpect(jsonPath("mediaType").value(1));
  }

  @Test void invalidRequestsDoNotPersist() throws Exception {
    for (String invalid : new String[]{"{}", body(2), body(0).replace("1080", "0"),
        body(0).replace("moments/photo.jpg", " "), body(0).replace(owner.toString(), "invalid"),
        body(0).replace("Xin chào", "a".repeat(201)), "{"}) {
      mvc.perform(post("/posts").contentType(MediaType.APPLICATION_JSON).content(invalid))
          .andExpect(status().isBadRequest());
    }
    assertThat(repository.count()).isZero();
  }

  @Test void deleteIsOwnerScopedAndIdempotent() throws Exception {
    mvc.perform(post("/posts").contentType(MediaType.APPLICATION_JSON).content(body(0)))
        .andExpect(status().isCreated());
    UUID id = repository.findAll().getFirst().getId();
    mvc.perform(delete("/posts/{id}", id).param("ownerId", UUID.randomUUID().toString()))
        .andExpect(status().isNotFound());
    assertThat(repository.findById(id).orElseThrow().getDeletedAt()).isNull();
    mvc.perform(delete("/posts/{id}", id).param("ownerId", owner.toString()))
        .andExpect(status().isNoContent()).andExpect(content().string(""));
    var deletedAt = repository.findById(id).orElseThrow().getDeletedAt();
    assertThat(deletedAt).isNotNull();
    mvc.perform(delete("/posts/{id}", id).param("ownerId", owner.toString()))
        .andExpect(status().isNoContent());
    assertThat(repository.findById(id).orElseThrow().getDeletedAt()).isEqualTo(deletedAt);
  }

  @Test void deleteUnknownOrMalformedRequests() throws Exception {
    mvc.perform(delete("/posts/{id}", UUID.randomUUID()).param("ownerId", owner.toString()))
        .andExpect(status().isNotFound());
    mvc.perform(delete("/posts/{id}", UUID.randomUUID())).andExpect(status().isBadRequest());
    mvc.perform(delete("/posts/invalid").param("ownerId", owner.toString()))
        .andExpect(status().isBadRequest());
  }
}
