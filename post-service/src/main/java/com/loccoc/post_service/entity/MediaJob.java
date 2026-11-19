package com.loccoc.post_service.entity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
@Entity @Table(name="post_media_jobs", uniqueConstraints=@UniqueConstraint(columnNames={"post_id","operation"})) @Getter
public class MediaJob {
  @Id private UUID id;
  @Column(name="post_id",nullable=false) private UUID postId;
  @Column(nullable=false) private String operation;
  @Column(nullable=false) private int attempts;
  @Column(name="available_at",nullable=false) private Instant availableAt;
  @Column(nullable=false) private boolean done;
  private UUID lease;
  @Column(name="lease_until") private Instant leaseUntil;
  public UUID claim() { lease=UUID.randomUUID();leaseUntil=Instant.now().plusSeconds(120);return lease; }
  public void release() { lease=null;leaseUntil=null; }
  public boolean available() { return !done && !availableAt.isAfter(Instant.now()) && (leaseUntil==null || leaseUntil.isBefore(Instant.now())); }
  public void defer() { release();availableAt=Instant.now().plusSeconds(60); }

  protected MediaJob() {}
  public MediaJob(UUID postId,String operation) { id=UUID.randomUUID(); this.postId=postId;this.operation=operation;availableAt=Instant.now(); }
  public void complete() { done=true;release(); }
  public void retry() { release();attempts=Math.min(30,attempts+1); availableAt=Instant.now().plusSeconds(Math.min(3600,5L << Math.min(attempts,10))); }
  public void reset() { release();done=false;attempts=0;availableAt=Instant.now(); }
}
