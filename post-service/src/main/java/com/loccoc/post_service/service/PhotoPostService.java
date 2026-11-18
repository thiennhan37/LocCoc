package com.loccoc.post_service.service;
import com.loccoc.post_service.dto.*;
import com.loccoc.post_service.entity.Post;
import com.loccoc.post_service.exception.*;
import com.loccoc.post_service.repository.PostRepository;
import java.util.*;
import java.security.MessageDigest;
import org.springframework.stereotype.Service;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
@Service
public class PhotoPostService {
  private final PostRepository repository;
  private final PhotoStorage storage;
  private final PhotoDecoder decoder;
  private final MomentImages images;
  private final UserIdentityClient identity;
  private final FeedAudienceClient audience;
  private final MediaJobs jobs;
  private final PostAccounts accounts;
  private final TransactionTemplate transactions;
  public PhotoPostService(PostRepository repository,PhotoStorage storage,PhotoDecoder decoder,UserIdentityClient identity,
      FeedAudienceClient audience,MediaJobs jobs,PostAccounts accounts,MomentImages images,PlatformTransactionManager manager) {
    this.repository=repository;this.storage=storage;this.decoder=decoder;this.identity=identity;this.audience=audience;this.jobs=jobs;this.accounts=accounts;
    transactions=new TransactionTemplate(manager);
    this.images=images;
  }
  public PostResponse publish(PhotoPostRequest request,String authorization) {
    UUID owner=identity.resolve(authorization);
    if(!owner.equals(request.ownerId())) throw new AppException(ErrorCode.ACCESS_DENIED);
    var photo=decoder.decode(request.imageBase64());
    String hash=digest(photo.bytes());accounts.ensure(owner);
    // Durable intent precedes S3: a process crash cannot create an untracked object.
    if(!repository.existsById(request.requestId())) {
      try { transactions.executeWithoutResult(status->{
        accounts.lock(owner);
        if(repository.existsById(request.requestId())) return;
        accounts.reserve(owner);
        var post=Post.create(request.requestId(),new CreatePostRequest(owner,mediaKey(request.requestId()),0,null,request.caption(),null,null));
        post.draft("FRIENDS",post.getCreatedAt(),null,null,"[]");post.reserve(hash);repository.saveAndFlush(post);
      }); } catch(DataIntegrityViolationException collision) {
        if(!repository.existsById(request.requestId())) throw collision;
      }
    }
    return transactions.execute(status->{
      accounts.lock(owner);
      var post=repository.lockById(request.requestId()).orElseThrow(()->new AppException(ErrorCode.CONFLICT));
      if(post.getDeletedAt()!=null || !post.getOwnerId().equals(owner) || !"FRIENDS".equals(post.getVisibility()) ||
          !Objects.equals(post.getCaption(),request.caption()) || !post.getMediaKey().equals(mediaKey(post.getId())) ||
          (post.getUploadHash()!=null && !post.getUploadHash().equals(hash))) throw new AppException(ErrorCode.CONFLICT);
      if("active".equals(post.getState())) {
        if(post.getUploadHash()==null && !Arrays.equals(storage.read(post.getId()),photo.bytes())) throw new AppException(ErrorCode.CONFLICT);
        return PostResponse.from(post);
      }
      storage.save(post.getId(),photo.bytes(),owner,post.getCaption());
      post.activate(photo.width(),photo.height());jobs.enqueue(post,"index");repository.saveAndFlush(post);
      // Never discard here: an ambiguous DB commit may already have published the image.
      return PostResponse.from(post);
    });
  }
  public byte[] read(UUID id,String token) {
    var auth=audience.resolve(token);
    var post=repository.findById(id).orElseThrow(()->new AppException(ErrorCode.ROUTE_NOT_FOUND));
    PostAccess.require(post,auth);
    if(!post.getMediaKey().equals(mediaKey(id))) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
    var bytes=storage.read(id);
    // Recheck database and current friend/block relation after storage I/O.
    PostAccess.require(repository.findById(id).orElseThrow(()->new AppException(ErrorCode.ROUTE_NOT_FOUND)),audience.resolve(token));
    return bytes;
  }
  public static String mediaKey(UUID id) { return "/posts/media/"+id; }
  public byte[] preview(UUID id,String token) {
    return images.preview(read(id,token));
  }
  public static String digest(byte[] bytes) {
    try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
    catch(java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
  }
}
