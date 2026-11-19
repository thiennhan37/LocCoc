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
  public List<FeedItem> authorPage(Audience audience, UUID owner, Instant snapshot, FeedCursor cursor, int limit) {
    var params=new HashMap<String,Object>();
    params.put("viewer",audience.viewerId()); params.put("owner",owner);
    params.put("snapshot",Timestamp.from(snapshot)); params.put("limit",limit);
    String after="";
    if(cursor!=null) {
      params.put("created",Timestamp.from(cursor.capturedAt())); params.put("id",cursor.id());
      after=" AND (p.created_at, p.id) < (:created, :id)";
    }
    var author=audience.authors().get(owner);
    String label=author.displayName()==null || author.displayName().isBlank() ? author.username() : author.displayName();
    return jdbc.query("""
        SELECT p.*, coalesce(p.captured_at,p.created_at) AS feed_at, v.seen_at FROM moments p
        LEFT JOIN post_views v ON v.post_id=p.id AND v.viewer_id=:viewer
        WHERE p.owner_id=:owner AND p.deleted_at IS NULL AND p.state='active' AND (p.owner_id=:viewer OR p.visibility='FRIENDS') AND p.created_at<=:snapshot
        """+after+" ORDER BY p.created_at DESC, p.id DESC LIMIT :limit",params,(rs,n)->
        new FeedItem(rs.getObject("id",UUID.class),owner,rs.getString("media_key"),rs.getShort("media_type"),
            rs.getString("caption"),rs.getTimestamp("created_at").toInstant(),rs.getTimestamp("feed_at").toInstant(),label,
            owner.equals(audience.viewerId()),rs.getTimestamp("seen_at")!=null,0));
  }
  public List<FeedItem> page(Audience audience, Instant snapshot, FeedCursor cursor, int limit) {
    var params=new HashMap<String,Object>();
    params.put("viewer",audience.viewerId()); params.put("authors",audience.authors().keySet());
    params.put("snapshot",Timestamp.from(snapshot));
    params.put("limit",limit);
    String after="";
    if(cursor!=null) {
      params.put("captured",Timestamp.from(cursor.capturedAt())); params.put("id",cursor.id());
      after=" AND (coalesce(p.captured_at,p.created_at) < :captured OR (coalesce(p.captured_at,p.created_at) = :captured AND p.id < :id))";
    }
    return jdbc.query("""
        SELECT p.*, coalesce(p.captured_at,p.created_at) AS feed_at,
          CASE WHEN v.seen_at IS NOT NULL THEN 1 ELSE 0 END AS already_seen
        FROM moments p LEFT JOIN post_views v ON v.post_id=p.id AND v.viewer_id=:viewer
        WHERE p.owner_id IN (:authors) AND p.deleted_at IS NULL AND p.state='active' AND (p.owner_id=:viewer OR p.visibility='FRIENDS') AND p.created_at <= :snapshot
      """+after+" ORDER BY coalesce(p.captured_at,p.created_at) DESC, p.id DESC LIMIT :limit",params,(rs,n)-> {
        var owner=rs.getObject("owner_id",UUID.class); var author=audience.authors().get(owner);
        String label=author.displayName()==null || author.displayName().isBlank() ? author.username() : author.displayName();
        return new FeedItem(rs.getObject("id",UUID.class),owner,rs.getString("media_key"),rs.getShort("media_type"),rs.getString("caption"),rs.getTimestamp("created_at").toInstant(),rs.getTimestamp("feed_at").toInstant(),label,owner.equals(audience.viewerId()),rs.getInt("already_seen")==1,0);
      });
  }
}
