package com.loccoc.post_service.service;

import com.loccoc.post_service.dto.*;
import com.loccoc.post_service.entity.Post;
import com.loccoc.post_service.exception.*;
import com.loccoc.post_service.repository.PostRepository;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class PhotoPostService {
  private final PostRepository repository;
  private final PhotoStorage storage;
  private final PhotoDecoder decoder;
  private final UserIdentityClient identity;
  private final TransactionTemplate transactions;
  public PhotoPostService(PostRepository repository, PhotoStorage storage, PhotoDecoder decoder, UserIdentityClient identity, PlatformTransactionManager manager) {
    this.repository=repository; this.storage=storage; this.decoder=decoder; this.identity=identity; transactions=new TransactionTemplate(manager);
  }
  // Local single-instance publishing: hold the lock through commit so duplicate retries see the row.
  public synchronized PostResponse publish(PhotoPostRequest request, String authorization) {
    UUID owner=identity.resolve(authorization);
    if(!owner.equals(request.ownerId())) throw new AppException(ErrorCode.ACCESS_DENIED);
    var photo=decoder.decode(request.imageBase64());
    var existing=repository.findById(request.requestId());
    if(existing.isPresent()) {
      var post=existing.get();
      if(post.getDeletedAt()!=null || !post.getOwnerId().equals(request.ownerId()) ||
          !Objects.equals(post.getCaption(),request.caption()) ||
          !post.getMediaKey().equals(mediaKey(request.requestId())) ||
          !Arrays.equals(storage.read(request.requestId()),photo.bytes())) throw new AppException(ErrorCode.CONFLICT);
      return PostResponse.from(post);
    }
    boolean created=storage.save(request.requestId(), photo.bytes(), owner, request.caption());
    try {
      return transactions.execute(status -> {
        var metadata=new CreatePostRequest(owner,mediaKey(request.requestId()),0,null,request.caption(),photo.width(),photo.height());
        return PostResponse.from(repository.saveAndFlush(Post.create(request.requestId(),metadata)));
      });
    } catch(RuntimeException error) {
      try { if(created) storage.discard(request.requestId()); } catch(RuntimeException cleanup) { error.addSuppressed(cleanup); }
      throw error;
    }
  }
  public byte[] read(UUID id) {
    var post=repository.findById(id).orElseThrow(() -> new AppException(ErrorCode.ROUTE_NOT_FOUND));
    if(post.getDeletedAt()!=null || !post.getMediaKey().equals(mediaKey(id))) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
    return storage.read(id);
  }
  private String mediaKey(UUID id) { return "/posts/media/"+id; }
}
