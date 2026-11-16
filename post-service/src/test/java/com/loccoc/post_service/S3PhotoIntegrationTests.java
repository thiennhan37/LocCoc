package com.loccoc.post_service;
import com.loccoc.post_service.service.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:s3-photo", "spring.datasource.username=sa", "spring.datasource.password=", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="POST_S3_TEST_ENDPOINT", matches=".+")
class S3PhotoIntegrationTests {
 static final String BUCKET="post-test-"+UUID.randomUUID();
 @TempDir static Path legacy;
 @Autowired MockMvc mvc;
 @Autowired S3Client client;
 @Autowired PhotoStorage storage;
 @MockitoBean UserIdentityClient identity;
 @DynamicPropertySource static void configure(DynamicPropertyRegistry r) {
  r.add("post.s3.endpoint",()->System.getenv("POST_S3_TEST_ENDPOINT"));
  r.add("post.s3.bucket",()->BUCKET);
  r.add("post.s3.access-key",()->System.getenv("POST_S3_TEST_ACCESS_KEY"));
  r.add("post.s3.secret-key",()->System.getenv("POST_S3_TEST_SECRET_KEY"));
  r.add("post.legacy-read-enabled",()->true);
  r.add("post.media-dir",()->legacy.toString());
 }
 @Test void publishesAndReadsRealPrivateS3ObjectsAndPreservesLegacy() throws Exception {
  UUID id=UUID.randomUUID(),old=UUID.randomUUID(),owner=UUID.randomUUID();
  client.createBucket(CreateBucketRequest.builder().bucket(BUCKET).build());
  try {
   when(identity.resolve("Bearer verified")).thenReturn(owner);
   byte[] png=PhotoPostApiTests.png(8);
   String body="{\"requestId\":\"%s\",\"ownerId\":\"%s\",\"imageBase64\":\"%s\"}".formatted(id,owner,Base64.getEncoder().encodeToString(png));
   for(int i=0;i<2;i++) mvc.perform(post("/posts/photos").header("Authorization","Bearer verified").contentType("application/json").content(body)).andExpect(status().isCreated()).andExpect(jsonPath("ownerId").value(owner.toString()));
   mvc.perform(get("/posts/media/{id}",id)).andExpect(status().isOk()).andExpect(content().bytes(png));
   assertThatThrownBy(()->storage.save(id,new byte[]{9},owner,null)).isInstanceOf(com.loccoc.post_service.exception.AppException.class);
   assertThat(storage.read(id)).isEqualTo(png);
   assertThat(storage.save(id,png,owner,null)).isFalse();
   var unsigned=java.net.http.HttpRequest.newBuilder(java.net.URI.create(System.getenv("POST_S3_TEST_ENDPOINT")+"/"+BUCKET+"/posts/"+id+".png")).GET().build();
   assertThat(java.net.http.HttpClient.newHttpClient().send(unsigned,java.net.http.HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(403);
   assertThat(Files.exists(legacy.resolve(id+".png"))).isFalse();
   Files.write(legacy.resolve(old+".png"),png);
   assertThat(storage.read(old)).isEqualTo(png);
   assertThat(Files.readAllBytes(legacy.resolve(old+".png"))).isEqualTo(png);
  } finally {
   client.deleteObject(DeleteObjectRequest.builder().bucket(BUCKET).key("posts/"+id+".png").build());
   client.deleteBucket(DeleteBucketRequest.builder().bucket(BUCKET).build());
  }
 }
}
