package com.loccoc.post_service.service;
import com.loccoc.post_service.dto.CreatePostRequest;
import com.loccoc.post_service.entity.Post;
import com.loccoc.post_service.repository.PostRepository;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
/** Source objects and database are always read-only. Safe to rerun after partial import. */
@Service
public class LegacyMomentImport {
  public record Source(UUID id,UUID owner,UUID asset,int version,String state,String caption,List<String> tags,
      Instant captured,UUID album,String place,String key,String checksum,Instant created) {}
  public interface SourceImages { byte[] read(String key); }
  public record Result(long checked,long copied,long identical) {}
  private final PostRepository posts;
  private final PostAccounts accounts;
  private final PhotoStorage storage;
  private final MomentImages images;
  private final MediaJobs jobs;
  private final TransactionTemplate tx;
  private final JsonMapper json=JsonMapper.builder().build();
  public LegacyMomentImport(PostRepository posts,PostAccounts accounts,PhotoStorage storage,MomentImages images,MediaJobs jobs,PlatformTransactionManager manager) {
    this.posts=posts;this.accounts=accounts;this.storage=storage;this.images=images;this.jobs=jobs;tx=new TransactionTemplate(manager);
  }
  public String migrate(Source source,SourceImages sourceImages,boolean apply) {
    if(!Set.of("draft","active","deleted").contains(source.state()) || source.version()<1 || source.caption().length()>1000 || source.tags().size()>20 || source.tags().stream().anyMatch(t->t==null || t.length()>50) || (source.place()!=null && source.place().length()>120)) throw new IllegalArgumentException("Invalid legacy metadata");
    String fingerprint=PhotoPostService.digest(json.writeValueAsBytes(source));
    var existing=posts.findById(source.id());
    if(existing.isPresent() && !fingerprint.equals(existing.get().getLegacySourceHash())) throw new IllegalStateException("Legacy ID collision; stop and resolve before importing");
    if(existing.isPresent() && source.state().equals("deleted") && existing.get().getDeletedAt()!=null) return "identical";
    PhotoDecoder.Photo photo=null;
    if(source.state().equals("active")) {
      byte[] raw=sourceImages.read(source.key());
      if(source.checksum()==null || !source.checksum().equals(PhotoPostService.digest(raw))) throw new IllegalStateException("Legacy object checksum mismatch");
      photo=images.normalize(raw,"image/jpeg");
      if(existing.isPresent() && "active".equals(existing.get().getState())) {
        if(!Arrays.equals(storage.read(source.id()),photo.bytes())) throw new IllegalStateException("Destination checksum mismatch");
        return "identical";
      }
      if(existing.isPresent() && existing.get().getDeletedAt()!=null) throw new IllegalStateException("Destination deleted after migration; never resurrect");
    }
    if(!apply) return "would_copy";
    accounts.ensure(source.owner());final var normalized=photo;
    tx.executeWithoutResult(s->{
      accounts.lockForImport(source.owner(),source.state().equals("deleted"));
      var found=posts.findById(source.id());
      if(found.isPresent()) {
        if(!fingerprint.equals(found.get().getLegacySourceHash())) throw new IllegalStateException("Legacy ID collision");return;
      }
      var p=Post.create(source.id(),new CreatePostRequest(source.owner(),PhotoPostService.mediaKey(source.id()),0,null,source.caption(),null,null));
      p.draft("PRIVATE",source.captured(),source.album(),source.place(),json.writeValueAsString(source.tags()));
      p.importIdentity(source.asset(),source.version(),source.created(),fingerprint);
      if(normalized!=null) p.reserve(PhotoPostService.digest(normalized.bytes()));
      posts.saveAndFlush(p);
    });
    tx.executeWithoutResult(s->{
      accounts.lockForImport(source.owner(),source.state().equals("deleted"));var p=posts.lockById(source.id()).orElseThrow();
      if(!fingerprint.equals(p.getLegacySourceHash())) throw new IllegalStateException("Legacy ID collision");
      if(source.state().equals("deleted")) { p.tombstone();jobs.erase(p); }
      else if(normalized!=null) {
        if(p.getDeletedAt()!=null) throw new IllegalStateException("Destination deleted; never resurrect");
        storage.save(p.getId(),normalized.bytes(),p.getOwnerId(),p.getCaption());
        if(!Arrays.equals(storage.read(p.getId()),normalized.bytes())) throw new IllegalStateException("Destination checksum mismatch");
        p.activate(normalized.width(),normalized.height());jobs.enqueue(p,"index");
      }
    });return "copied";
  }
  public Result run(Connection source,SourceImages images,boolean apply) throws SQLException {
    source.setReadOnly(true);source.setAutoCommit(false);long checked=0,copied=0,identical=0;
    try(var statement=source.prepareStatement("select id,owner_id,asset_id,asset_version,state,caption,tags,captured_at,album_id,place,object_key,checksum,created_at from moments order by created_at,id")) {
      statement.setFetchSize(100);
      try(var rows=statement.executeQuery()) {
        while(rows.next()) {
          var row=new Source(rows.getObject("id",UUID.class),rows.getObject("owner_id",UUID.class),rows.getObject("asset_id",UUID.class),rows.getInt("asset_version"),rows.getString("state"),rows.getString("caption"),Arrays.asList((String[])rows.getArray("tags").getArray()),rows.getTimestamp("captured_at").toInstant(),rows.getObject("album_id",UUID.class),rows.getString("place"),rows.getString("object_key"),rows.getString("checksum"),rows.getTimestamp("created_at").toInstant());
          String outcome=migrate(row,images,apply);checked++;if(outcome.equals("copied")) copied++;if(outcome.equals("identical")) identical++;
        }
      }
      // Preserve deleted-account fences, including owners with no remaining records.
      try(var deleted=source.prepareStatement("select owner_id,version from moment_deleted_accounts");var rows=deleted.executeQuery()) {
        while(rows.next()) if(apply) accounts.delete(rows.getObject("owner_id",UUID.class),rows.getLong("version"));
      }
    } finally { source.rollback(); }
    return new Result(checked,copied,identical);
  }
}
