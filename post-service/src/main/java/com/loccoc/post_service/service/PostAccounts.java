package com.loccoc.post_service.service;
import com.loccoc.post_service.entity.PostAccount;
import com.loccoc.post_service.exception.*;
import com.loccoc.post_service.repository.*;
import java.time.Instant;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
@Service
public class PostAccounts {
  private final PostAccountRepository accounts;
  private final PostRepository posts;
  private final MediaJobs jobs;
  private final TransactionTemplate tx;
  private final int maxPosts,uploadsPerHour;
  public PostAccounts(PostAccountRepository accounts,PostRepository posts,MediaJobs jobs,PlatformTransactionManager manager,org.springframework.core.env.Environment env) {
    this.maxPosts=env.getProperty("post.max-per-owner",Integer.class,1000);this.uploadsPerHour=env.getProperty("post.uploads-per-hour",Integer.class,30);
    if(maxPosts<1 || maxPosts>100000 || uploadsPerHour<1 || uploadsPerHour>1000) throw new IllegalArgumentException("Invalid post limits");
    this.accounts=accounts;this.posts=posts;this.jobs=jobs;tx=new TransactionTemplate(manager);tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }
  public void ensure(UUID owner) {
    if(!accounts.existsById(owner)) try { tx.executeWithoutResult(s->accounts.saveAndFlush(new PostAccount(owner))); }
    catch(DataIntegrityViolationException race) { if(!accounts.existsById(owner)) throw race; }
  }
  public PostAccount lock(UUID owner) {
    var a=accounts.lockById(owner).orElseThrow(()->new AppException(ErrorCode.SERVICE_UNAVAILABLE));
    if(a.isDeleted()) throw new AppException(ErrorCode.ACCESS_DENIED);return a;
  }
  public void lockForImport(UUID owner,boolean tombstone) {
    var a=accounts.lockById(owner).orElseThrow(()->new AppException(ErrorCode.SERVICE_UNAVAILABLE));
    if(a.isDeleted() && !tombstone) throw new AppException(ErrorCode.ACCESS_DENIED);
  }
  public void reserve(UUID owner) {
    var a=lock(owner);
    if(posts.countByOwnerIdAndDeletedAtIsNull(owner)>=maxPosts || !a.consumeUpload(Instant.now().getEpochSecond()/3600,uploadsPerHour)) throw new AppException(ErrorCode.TOO_MANY_REQUESTS);
  }
  public void delete(UUID owner,long version) {
    ensure(owner);tx.executeWithoutResult(s->{
      var a=accounts.lockById(owner).orElseThrow();a.delete(version);
      for(var p:posts.findByOwnerIdAndDeletedAtIsNull(owner)) {
        var locked=posts.lockById(p.getId()).orElseThrow();
        if(locked.getDeletedAt()==null) { locked.tombstone();jobs.erase(locked); }
      }
    });
  }
}
