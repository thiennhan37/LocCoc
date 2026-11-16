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
  @Test void removesOnlyNewObjectWhenDatabaseCommitFails() throws Exception {
    var repository=mock(PostRepository.class);
    var manager=mock(PlatformTransactionManager.class);
    when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
    when(repository.findById(any())).thenReturn(Optional.empty());
    when(repository.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    doThrow(new IllegalStateException("commit failed")).when(manager).commit(any());
    var storage=mock(PhotoStorage.class);
    when(storage.save(any(),any(),any(),any())).thenReturn(true);
    var identity=mock(UserIdentityClient.class);
    var service=new PhotoPostService(repository,storage,new PhotoDecoder(),identity,manager);
    var id=UUID.randomUUID();
    var request=new PhotoPostRequest(id,UUID.randomUUID(),Base64.getEncoder().encodeToString(PhotoPostApiTests.png(8)),"Hello");
    when(identity.resolve("Bearer valid")).thenReturn(request.ownerId());
    assertThatThrownBy(() -> service.publish(request,"Bearer valid")).isInstanceOf(IllegalStateException.class);
    verify(storage).discard(id);
    clearInvocations(storage);
    when(storage.save(any(),any(),any(),any())).thenReturn(false);
    assertThatThrownBy(() -> service.publish(request,"Bearer valid")).isInstanceOf(IllegalStateException.class);
    verify(storage,never()).discard(any());
  }
}
