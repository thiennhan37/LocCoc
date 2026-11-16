package com.loccoc.post_service;

import com.loccoc.post_service.repository.PostRepository;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:photo-tests", "spring.datasource.username=sa", "spring.datasource.password=", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class PhotoPostApiTests {
  @TempDir static Path directory;
  @DynamicPropertySource static void properties(DynamicPropertyRegistry r) { r.add("post.media-dir", () -> directory.toString()); }
  @Autowired MockMvc mvc;
  @Autowired PostRepository repository;
  final UUID owner = UUID.randomUUID();
  @BeforeEach void clean() { repository.deleteAll(); }

  static byte[] png(int size) throws Exception {
    var out = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(size,size,BufferedImage.TYPE_INT_RGB),"png",out);
    return out.toByteArray();
  }
  String body(UUID id, String base64) {
    return "{\"requestId\":\"%s\",\"ownerId\":\"%s\",\"imageBase64\":\"%s\",\"caption\":\"Hello\"}".formatted(id,owner,base64);
  }
  @Test void publishReadsBackAndRetryDoesNotDuplicate() throws Exception {
    UUID id=UUID.randomUUID(); String body=body(id,Base64.getEncoder().encodeToString(png(16)));
    for(int i=0;i<2;i++) mvc.perform(post("/posts/photos").contentType("application/json").content(body))
      .andExpect(status().isCreated()).andExpect(jsonPath("id").value(id.toString()))
      .andExpect(jsonPath("width").value(16)).andExpect(jsonPath("caption").value("Hello"));
    assertThat(repository.count()).isEqualTo(1);
    assertThat(Files.exists(directory.resolve(id+".png"))).isTrue();
    mvc.perform(get("/posts/media/{id}",id)).andExpect(status().isOk())
      .andExpect(content().contentType("image/png"));
    mvc.perform(post("/posts/photos").contentType("application/json").content(body.replace("Hello","changed")))
      .andExpect(status().isConflict());
    mvc.perform(delete("/posts/{id}",id).param("ownerId",owner.toString())).andExpect(status().isNoContent());
    mvc.perform(get("/posts/media/{id}",id)).andExpect(status().isNotFound());
    assertThat(Files.exists(directory.resolve(id+".png"))).isTrue();
  }
  @Test void rejectsCorruptOversizeAndMissingImagesWithoutRows() throws Exception {
    for(String image:List.of("!not-base64",Base64.getEncoder().encodeToString("not a PNG".getBytes()), Base64.getEncoder().encodeToString(png(2049)))) {
      mvc.perform(post("/posts/photos").contentType("application/json").content(body(UUID.randomUUID(),image)))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("code").exists());
    }
    mvc.perform(post("/posts/photos").contentType("application/json").content("{}"))
      .andExpect(status().isBadRequest());
    assertThat(repository.count()).isZero();
  }
  @Test void limitsRawBodyBeforeJsonParsing() throws Exception {
    mvc.perform(post("/posts/photos").contentType("application/json").content("x".repeat(8*1024*1024+1)))
      .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("code").value(1102));
    assertThat(repository.count()).isZero();
  }
}
