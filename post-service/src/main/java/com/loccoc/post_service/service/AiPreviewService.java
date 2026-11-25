package com.loccoc.post_service.service;

import com.loccoc.post_service.dto.AiPreviewRequest;
import com.loccoc.post_service.entity.AiPreviewAttempt;
import com.loccoc.post_service.repository.AiPreviewAttemptRepository;
import com.loccoc.post_service.exception.*;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class AiPreviewService {
  private final UserIdentityClient identity;
  private final PhotoDecoder decoder;
  private final AiImageClient ai;
  private final AiPreviewAttemptRepository attempts;
  private final EntityManager entities;
  private final TransactionTemplate transactions;
  public AiPreviewService(UserIdentityClient identity,PhotoDecoder decoder,AiImageClient ai,
      AiPreviewAttemptRepository attempts,EntityManager entities,PlatformTransactionManager manager) {
    this.identity=identity; this.decoder=decoder; this.ai=ai; this.attempts=attempts;
    this.entities=entities; this.transactions=new TransactionTemplate(manager);
  }
  public AiImageClient.Result enhance(AiPreviewRequest request,String authorization) {
    UUID owner=identity.resolve(authorization);
    var image=decoder.decode(request.imageBase64());
    ai.ensureConfigured();
    claim(request.requestId(),owner);
    return ai.enhance(image.bytes(),request.filterId(),request.requestId());
  }
  // No network call under this lock or in a transaction. The PK is the cross-instance barrier.
  private synchronized void claim(UUID id,UUID owner) {
    if(attempts.existsById(id)) throw new AppException(ErrorCode.CONFLICT);
    if(attempts.countByOwnerIdAndCreatedAtAfter(owner,Instant.now().minusSeconds(60))>=5)
      throw new AppException(ErrorCode.TOO_MANY_REQUESTS);
    try {
      transactions.executeWithoutResult(status -> {
        entities.persist(new AiPreviewAttempt(id,owner));
        entities.flush();
      });
    } catch(RuntimeException e) {
      if(attempts.existsById(id)) throw new AppException(ErrorCode.CONFLICT);
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE);
    }
  }
}
