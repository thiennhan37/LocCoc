package com.loccoc.post_service.service;
import com.loccoc.post_service.repository.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.core.env.Environment;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
@Component
public class MediaWorker {
  private final PostRepository posts;
  private final MediaJobRepository jobs;
  private final MediaJobs queue;
  private final PhotoStorage storage;
  private final MomentImages images;
  private final MomentAiClient ai;
  private final Environment env;
  private final TransactionTemplate tx;
  public MediaWorker(PostRepository posts,MediaJobRepository jobs,MediaJobs queue,PhotoStorage storage,MomentImages images,MomentAiClient ai,Environment env,PlatformTransactionManager manager) {
    this.posts=posts;this.jobs=jobs;this.queue=queue;this.storage=storage;this.images=images;this.ai=ai;this.env=env;tx=new TransactionTemplate(manager);
  }
  @Scheduled(fixedDelayString="${post.worker-delay-ms:2000}") public void tick() {
    if(!env.getProperty("post.worker-enabled",Boolean.class,true)) return;
    expireDrafts();for(int i=0;i<10 && runOne();i++) { }
  }
  private record Work(UUID jobId,UUID lease,com.loccoc.post_service.entity.Post post,String operation) {}
  public boolean runOne() {
    var candidates=jobs.candidates();if(candidates.isEmpty()) return false;
    UUID id=candidates.getFirst();var candidate=jobs.findById(id).orElse(null);if(candidate==null) return true;
    Work work=tx.execute(status->{
      var post=posts.lockById(candidate.getPostId()).orElse(null);
      var job=jobs.lockById(id).orElse(null);
      if(job==null || !job.available()) return null;
      if(post==null) { job.complete();return null; }
      if(job.getOperation().equals("index") && (post.getDeletedAt()!=null || !"active".equals(post.getState()))) {
        // A crashed/expired index worker may have sent its PUT before deletion.
        if(post.getDeletedAt()!=null) queue.enqueue(post,"delete");
        job.complete();return null;
      }
      if(!job.getOperation().equals("index") && post.getDeletedAt()==null) { job.complete();return null; }
      if(!job.getOperation().equals("object_cleanup") && !ai.enabled()) { job.defer();return null; }
      return new Work(id,job.claim(),post,job.getOperation());
    });
    if(work==null) return true;
    boolean succeeded=false;
    // Network I/O runs outside DB transactions. Leases survive process death.
    try {
      switch(work.operation()) {
        case "index" -> ai.index(work.post(),images.jpeg(storage.read(work.post().getId())));
        case "object_cleanup" -> storage.discard(work.post().getId());
        case "delete" -> ai.delete(work.post());
        default -> throw new IllegalStateException("Invalid media operation");
      }
      succeeded=true;
    } catch(RuntimeException ignored) { }
    final boolean success=succeeded;
    tx.executeWithoutResult(status->{
      var post=posts.lockById(work.post().getId()).orElse(null);
      var job=jobs.lockById(work.jobId()).orElse(null);
      if(job==null || !Objects.equals(job.getLease(),work.lease())) return;
      if(post==null) { job.complete();return; }
      if(work.operation().equals("index") && post.getDeletedAt()!=null) {
        // Erasure may have finished while indexing was in flight: always erase again.
        queue.enqueue(post,"delete");job.complete();return;
      }
      if(success) {
        job.complete();if(work.operation().equals("index")) post.indexStatus("ready");
      } else {
        job.retry();
        if(work.operation().equals("index")) { post.indexStatus("failed");if(job.getAttempts()>=8) job.complete(); }
      }
    });return true;
  }
  public void expireDrafts() {
    for(UUID id:posts.expiredDrafts(Instant.now().minusSeconds(86400))) tx.executeWithoutResult(status->{
      var p=posts.lockById(id).orElse(null);
      if(p!=null && p.getDeletedAt()==null && "draft".equals(p.getState()) && p.getCreatedAt().isBefore(Instant.now().minusSeconds(86400))) {
        p.tombstone();queue.erase(p);
      }
    });
  }
}
