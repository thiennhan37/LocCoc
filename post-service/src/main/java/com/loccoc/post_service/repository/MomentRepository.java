package com.loccoc.post_service.repository;
import com.loccoc.post_service.entity.Post;
import com.loccoc.post_service.dto.MomentSearch;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Repository;
@Repository
public class MomentRepository {
  private final EntityManager em;
  public MomentRepository(EntityManager em) { this.em=em; }
  public List<Post> list(UUID owner,Instant before,UUID id,int limit) {
    String after=before==null?"":" and (coalesce(p.capturedAt,p.createdAt)<:before or (coalesce(p.capturedAt,p.createdAt)=:before and p.id<:id))";
    var q=em.createQuery("select p from Post p where p.ownerId=:owner and p.deletedAt is null and p.state='active' and p.mediaType=0 and p.mediaKey=concat('/posts/media/',cast(p.id as string))"+after+" order by coalesce(p.capturedAt,p.createdAt) desc,p.id desc",Post.class).setParameter("owner",owner).setMaxResults(limit);
    if(before!=null) q.setParameter("before",before).setParameter("id",id);return q.getResultList();
  }
  public List<Post> textPage(UUID owner,MomentSearch dto,int offset) {
    return searchQuery(owner,dto,null).setFirstResult(offset).setMaxResults(200).getResultList();
  }
  public List<Post> search(UUID owner,MomentSearch dto,Collection<UUID> assets) {
    if(assets.isEmpty()) return List.of();
    return searchQuery(owner,dto,assets).setMaxResults(400).getResultList();
  }
  private TypedQuery<Post> searchQuery(UUID owner,MomentSearch dto,Collection<UUID> assets) {
    String where="p.ownerId=:owner and p.deletedAt is null and p.state='active' and p.mediaType=0 and p.mediaKey=concat('/posts/media/',cast(p.id as string))";
    if(dto.albumId()!=null) where+=" and p.albumId=:album";
    if(dto.place()!=null && !dto.place().isBlank()) where+=" and lower(p.place)=:place";
    if(dto.dateFrom()!=null) where+=" and coalesce(p.capturedAt,p.createdAt)>=:from";
    if(dto.dateTo()!=null) where+=" and coalesce(p.capturedAt,p.createdAt)<=:to";
    if(assets!=null) where+=" and coalesce(p.assetId,p.id) in :assets";
    var q=em.createQuery("select p from Post p where "+where+" order by coalesce(p.capturedAt,p.createdAt) desc,p.id desc",Post.class).setParameter("owner",owner);
    if(dto.albumId()!=null) q.setParameter("album",dto.albumId());
    if(dto.place()!=null && !dto.place().isBlank()) q.setParameter("place",dto.place().trim().toLowerCase(Locale.ROOT));
    if(dto.dateFrom()!=null) q.setParameter("from",dto.dateFrom());if(dto.dateTo()!=null) q.setParameter("to",dto.dateTo());
    if(assets!=null) q.setParameter("assets",assets);return q;
  }
}
