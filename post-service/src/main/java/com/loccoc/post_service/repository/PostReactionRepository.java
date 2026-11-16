package com.loccoc.post_service.repository;

import com.loccoc.post_service.entity.PostReaction;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PostReactionRepository extends JpaRepository<PostReaction,String> {
  interface EmojiCount { String getEmoji(); long getTotal(); }
  @Query("select r.emoji as emoji, count(r) as total from PostReaction r where r.postId=:postId group by r.emoji")
  List<EmojiCount> counts(@Param("postId") UUID postId);
}
