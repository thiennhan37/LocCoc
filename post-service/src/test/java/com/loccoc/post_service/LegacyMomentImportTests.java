package com.loccoc.post_service;
import com.loccoc.post_service.dto.*;
import com.loccoc.post_service.entity.Post;
import com.loccoc.post_service.repository.*;
import com.loccoc.post_service.service.*;
import java.util.*;
import java.time.Instant;
import java.io.ByteArrayOutputStream;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:legacy-import", "spring.datasource.username=sa", "spring.datasource.password=", "spring.jpa.hibernate.ddl-auto=create-drop"})
class LegacyMomentImportTests {
  @Autowired LegacyMomentImport importer;
  @Autowired PostAccounts accounts;
  @Autowired PostRepository posts;
  @Autowired MediaJobRepository jobs;
  @MockitoBean PhotoStorage storage;
  Map<UUID,byte[]> objects=new HashMap<>();byte[] jpeg;
  @BeforeEach void setup() throws Exception {
    jobs.deleteAll();posts.deleteAll();objects.clear();
    var buffer=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(16,16,BufferedImage.TYPE_INT_RGB),"jpeg",buffer);jpeg=buffer.toByteArray();
    when(storage.save(any(),any(),any(),any())).thenAnswer(c->{objects.put(c.getArgument(0),c.getArgument(1));return true;});
    when(storage.read(any())).thenAnswer(c->objects.get(c.getArgument(0)));
  }
  LegacyMomentImport.Source source() { return new LegacyMomentImport.Source(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),3,"active","Old photo",List.of("old"),Instant.parse("2025-01-01T00:00:00Z"),null,"Hue","moments/old.jpg",PhotoPostService.digest(jpeg),Instant.parse("2025-01-02T00:00:00Z")); }
  @Test void dryRunDoesNotWriteAndApplyPreservesIdentityAndPrivacyThenReconciles() {
    var row=source();assertThat(importer.migrate(row,k->jpeg,false)).isEqualTo("would_copy");assertThat(posts.count()).isZero();verifyNoInteractions(storage);
    assertThat(importer.migrate(row,k->jpeg,true)).isEqualTo("copied");var post=posts.findById(row.id()).orElseThrow();
    assertThat(post.getVisibility()).isEqualTo("PRIVATE");assertThat(post.asset()).isEqualTo(row.asset());assertThat(post.getAssetVersion()).isEqualTo(3);
    assertThat(post.getCreatedAt()).isEqualTo(row.created());assertThat(post.captured()).isEqualTo(row.captured());
    assertThat(jobs.findByPostIdAndOperation(row.id(),"index")).isPresent();
    assertThat(importer.migrate(row,k->jpeg,true)).isEqualTo("identical");assertThat(posts.count()).isEqualTo(1);
  }
  @Test void corruptSourceAndIdCollisionStopWithoutOverwriting() {
    var row=source();assertThatThrownBy(()->importer.migrate(row,k->new byte[]{0},true)).isInstanceOf(IllegalStateException.class);assertThat(posts.count()).isZero();
    posts.saveAndFlush(Post.create(row.id(),new CreatePostRequest(UUID.randomUUID(),"other",0,null,"other",1,1)));
    assertThatThrownBy(()->importer.migrate(row,k->jpeg,true)).isInstanceOf(IllegalStateException.class);verifyNoInteractions(storage);
  }  @Test void deletedAccountImportRetainsTombstonesAndCanBeRerun() {
    var active=source();accounts.delete(active.owner(),2);
    var deleted=new LegacyMomentImport.Source(active.id(),active.owner(),active.asset(),active.version(),"deleted",active.caption(),active.tags(),active.captured(),active.album(),active.place(),null,null,active.created());
    assertThat(importer.migrate(deleted,k->{throw new AssertionError("Deleted source must not read image");},true)).isEqualTo("copied");
    assertThat(importer.migrate(deleted,k->{throw new AssertionError();},true)).isEqualTo("identical");
    assertThat(posts.findById(deleted.id()).orElseThrow().getDeletedAt()).isNotNull();verifyNoInteractions(storage);
  }

}
