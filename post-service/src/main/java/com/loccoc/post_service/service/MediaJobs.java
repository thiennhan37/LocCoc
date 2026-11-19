package com.loccoc.post_service.service;
import com.loccoc.post_service.entity.*;
import com.loccoc.post_service.repository.MediaJobRepository;
import org.springframework.stereotype.Service;
@Service
public class MediaJobs {
  private final MediaJobRepository jobs;
  public MediaJobs(MediaJobRepository jobs) { this.jobs=jobs; }
  // Call only inside the transaction holding the owning Post row lock.
  public void enqueue(Post post,String operation) {
    var job=jobs.findByPostIdAndOperation(post.getId(),operation).orElseGet(()->new MediaJob(post.getId(),operation));
    if(operation.equals("index") && job.getLeaseUntil()!=null && job.getLeaseUntil().isAfter(java.time.Instant.now())) return;
    job.reset(); jobs.save(job);
  }
  public void erase(Post post) { enqueue(post,"object_cleanup");enqueue(post,"delete"); }
}
