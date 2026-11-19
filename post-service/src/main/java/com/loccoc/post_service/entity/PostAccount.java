package com.loccoc.post_service.entity;
import jakarta.persistence.*;
import java.util.UUID;
import lombok.Getter;
@Entity @Table(name="post_accounts") @Getter
public class PostAccount {
  @Id private UUID id;
  @Column(nullable=false) private boolean deleted;
  @Column(nullable=false) private long eventVersion;
  private long uploadHour;
  private int uploadCount;
  protected PostAccount() {}
  public PostAccount(UUID id) { this.id=id; }
  public void delete(long version) { deleted=true;eventVersion=Math.max(version,eventVersion); }
  public boolean consumeUpload(long hour,int max) {
    if(hour!=uploadHour) { uploadHour=hour;uploadCount=0; }
    if(uploadCount>=max) return false;uploadCount++;return true;
  }
}
