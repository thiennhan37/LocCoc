package com.loccoc.post_service;

import com.loccoc.post_service.dto.PhotoPostRequest;
import com.loccoc.post_service.repository.PostRepository;
import com.loccoc.post_service.service.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;

class PhotoPostRollbackTests {
  @TempDir Path directory;
  @Test void removesNewFileWhenDatabaseCommitFails() throws Exception {
    var repository=mock(PostRepository.class);
    var manager=mock(PlatformTransactionManager.class);
    when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
    when(repository.findById(any())).thenReturn(Optional.empty());
    when(repository.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    doThrow(new IllegalStateException("commit failed")).when(manager).commit(any());
    var service=new PhotoPostService(repository,new LocalPhotoStorage(directory.toString()),manager);
    var id=UUID.randomUUID();
    var request=new PhotoPostRequest(id,UUID.randomUUID(),Base64.getEncoder().encodeToString(PhotoPostApiTests.png(8)),"Hello");
    assertThatThrownBy(() -> service.publish(request)).isInstanceOf(IllegalStateException.class);
    assertThat(Files.exists(directory.resolve(id+".png"))).isFalse();
  }
}
