package com.loccoc.post_service.service;
import com.loccoc.post_service.dto.*;
import com.loccoc.post_service.entity.Post;
import com.loccoc.post_service.repository.PostRepository;
import com.loccoc.post_service.exception.*;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class PostService {
  private final PostRepository repository;
  private final UserIdentityClient identity;
  private final MediaJobs jobs;
  private final PostAccounts accounts;
  public PostService(PostRepository repository,UserIdentityClient identity,MediaJobs jobs,PostAccounts accounts) { this.repository=repository;this.identity=identity;this.jobs=jobs;this.accounts=accounts; }
  @Transactional public PostResponse create(CreatePostRequest request,String token) {
    UUID owner=identity.resolve(token);
    if(!owner.equals(request.ownerId())) throw new AppException(ErrorCode.ACCESS_DENIED);
    accounts.ensure(owner);accounts.reserve(owner);
    return PostResponse.from(repository.save(Post.create(request)));
  }
  @Transactional public void delete(UUID id,UUID claimedOwner,String token) {
    UUID owner=identity.resolve(token);
    if(claimedOwner!=null && !owner.equals(claimedOwner)) throw new AppException(ErrorCode.ACCESS_DENIED);
    var post=repository.lockById(id).orElseThrow(()->new AppException(ErrorCode.ROUTE_NOT_FOUND));
    if(!owner.equals(post.getOwnerId())) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
    if(post.getDeletedAt()==null) { post.tombstone();jobs.erase(post); }
  }
}
