package com.loccoc.post_service.repository;

import com.loccoc.post_service.dto.FeedItem;
import com.loccoc.post_service.service.FeedAudienceClient.Audience;
import com.loccoc.post_service.service.FeedCursor;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class FeedRepository {
  private final NamedParameterJdbcTemplate jdbc;
  public FeedRepository(NamedParameterJdbcTemplate jdbc) { this.jdbc=jdbc; }
  public List<FeedItem> page(Audience audience, Instant snapshot, long hours, FeedCursor cursor, int limit) {
    var params=new HashMap<String,Object>();
    params.put("viewer",audience.viewerId()); params.put("authors",audience.authors().keySet());
    params.put("snapshot",Timestamp.from(snapshot)); params.put("cutoff",Timestamp.from(snapshot.minusSeconds(hours*3600)));
    params.put("limit",limit);
    String after="";
    if(cursor!=null) {
      params.put("rank",cursor.priority()); params.put("created",Timestamp.from(cursor.createdAt())); params.put("id",cursor.id());
      after="WHERE priority > :rank OR (priority = :rank AND (created_at < :created OR (created_at = :created AND id < :id)))";
    }
    return jdbc.query("""
      WITH ranked AS (
        SELECT p.*, CASE
          WHEN v.seen_at IS NOT NULL AND v.seen_at <= :snapshot THEN 3
          WHEN p.owner_id = :viewer AND p.created_at >= :cutoff THEN 0
          WHEN p.owner_id <> :viewer THEN 1 ELSE 2 END AS priority
        FROM moments p LEFT JOIN post_views v ON v.post_id=p.id AND v.viewer_id=:viewer
        WHERE p.owner_id IN (:authors) AND p.deleted_at IS NULL AND p.created_at <= :snapshot
      ) SELECT * FROM ranked
      """+after+" ORDER BY priority ASC, created_at DESC, id DESC LIMIT :limit",params,(rs,n)-> {
        var owner=rs.getObject("owner_id",UUID.class); var author=audience.authors().get(owner);
        String label=author.displayName()==null || author.displayName().isBlank() ? author.username() : author.displayName();
        return new FeedItem(rs.getObject("id",UUID.class),owner,rs.getString("media_key"),rs.getShort("media_type"),rs.getString("caption"),rs.getTimestamp("created_at").toInstant(),label,owner.equals(audience.viewerId()),rs.getInt("priority")==3,rs.getInt("priority"));
      });
  }
}
