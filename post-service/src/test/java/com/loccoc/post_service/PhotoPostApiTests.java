package com.loccoc.post_service;

import com.loccoc.post_service.repository.PostRepository;
import com.loccoc.post_service.service.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
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
  @MockitoBean PhotoStorage storage;
  @MockitoBean UserIdentityClient identity;
  @MockitoBean FeedAudienceClient audience;
  final Map<UUID,byte[]> objects=new HashMap<>();
  final UUID owner = UUID.randomUUID();
  @BeforeEach void clean() {
    repository.deleteAll(); objects.clear();
    when(identity.resolve("Bearer valid")).thenReturn(owner);
    when(audience.resolve("Bearer valid")).thenReturn(new FeedAudienceClient.Audience(owner,Map.of(owner,new FeedAudienceClient.Author(owner,"owner",null))));
    doAnswer(c->{ objects.put(c.getArgument(0),c.getArgument(1)); return true; }).when(storage).save(any(),any(),any(),any());
    when(storage.read(any())).thenAnswer(c->objects.get(c.getArgument(0)));
  }

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
    for(int i=0;i<2;i++) mvc.perform(post("/posts/photos").header("Authorization","Bearer valid").contentType("application/json").content(body))
      .andExpect(status().isCreated()).andExpect(jsonPath("id").value(id.toString()))
      .andExpect(jsonPath("width").value(16)).andExpect(jsonPath("caption").value("Hello"));
    assertThat(repository.count()).isEqualTo(1);
    assertThat(objects).containsKey(id);
    mvc.perform(get("/posts/media/{id}",id).header("Authorization","Bearer valid")).andExpect(status().isOk())
      .andExpect(content().contentType("image/png"));
    mvc.perform(post("/posts/photos").header("Authorization","Bearer valid").contentType("application/json").content(body.replace("Hello","changed")))
      .andExpect(status().isConflict());
    mvc.perform(delete("/posts/{id}",id).header("Authorization","Bearer valid").param("ownerId",owner.toString())).andExpect(status().isNoContent());
    mvc.perform(get("/posts/media/{id}",id).header("Authorization","Bearer valid")).andExpect(status().isNotFound());
    assertThat(objects).containsKey(id);
  }
  @Test void rejectsCorruptOversizeAndMissingImagesWithoutRows() throws Exception {
    for(String image:List.of("!not-base64",Base64.getEncoder().encodeToString("not a PNG".getBytes()), Base64.getEncoder().encodeToString(png(2049)))) {
      mvc.perform(post("/posts/photos").header("Authorization","Bearer valid").contentType("application/json").content(body(UUID.randomUUID(),image)))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("code").exists());
    }
    mvc.perform(post("/posts/photos").header("Authorization","Bearer valid").contentType("application/json").content("{}"))
      .andExpect(status().isBadRequest());
    assertThat(repository.count()).isZero();
  }
  @Test void limitsRawBodyBeforeJsonParsing() throws Exception {
    mvc.perform(post("/posts/photos").header("Authorization","Bearer valid").contentType("application/json").content("x".repeat(8*1024*1024+1)))
      .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("code").value(1102));
    assertThat(repository.count()).isZero();
  }
  @Test void feedPreviewIsSmallerWhileOriginalAndAuthorizationArePreserved() throws Exception {
    var source=new BufferedImage(1024,1024,BufferedImage.TYPE_INT_RGB);
    var random=new Random(42);
    for(int y=0;y<1024;y++) for(int x=0;x<1024;x++) source.setRGB(x,y,random.nextInt());
    var buffer=new ByteArrayOutputStream();ImageIO.write(source,"png",buffer);
    UUID id=UUID.randomUUID();
    mvc.perform(post("/posts/photos").header("Authorization","Bearer valid").contentType("application/json")
        .content(body(id,Base64.getEncoder().encodeToString(buffer.toByteArray())))).andExpect(status().isCreated());
    var original=objects.get(id).clone();
    clearInvocations(audience);
    var preview=mvc.perform(get("/posts/media/{id}",id).param("preview","true").header("Authorization","Bearer valid"))
        .andExpect(status().isOk()).andExpect(content().contentType("image/jpeg"))
        .andExpect(header().string("Cache-Control","no-store")).andReturn().getResponse().getContentAsByteArray();
    var decoded=ImageIO.read(new java.io.ByteArrayInputStream(preview));
    assertThat(decoded.getWidth()).isEqualTo(960);assertThat(decoded.getHeight()).isEqualTo(960);
    assertThat(preview.length).isLessThan(original.length/3);
    verify(audience,times(2)).resolve("Bearer valid");
    mvc.perform(get("/posts/media/{id}",id).header("Authorization","Bearer valid"))
        .andExpect(content().contentType("image/png")).andExpect(content().bytes(original));
    assertThat(objects.get(id)).isEqualTo(original);
    // A former friend cannot obtain a rendition, either.
    UUID stranger=UUID.randomUUID();
    when(audience.resolve("Bearer valid")).thenReturn(new FeedAudienceClient.Audience(stranger,
        Map.of(stranger,new FeedAudienceClient.Author(stranger,"stranger",null))));
    clearInvocations(storage);
    mvc.perform(get("/posts/media/{id}",id).param("preview","true").header("Authorization","Bearer valid"))
        .andExpect(status().isNotFound());
    verify(storage,never()).read(any());
    when(audience.resolve(null)).thenThrow(new com.loccoc.post_service.exception.AppException(
        com.loccoc.post_service.exception.ErrorCode.UNAUTHENTICATED));
    mvc.perform(get("/posts/media/{id}",id).param("preview","true")).andExpect(status().isUnauthorized());
  }
}
