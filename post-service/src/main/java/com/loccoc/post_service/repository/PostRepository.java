package com.loccoc.post_service.repository;

import com.loccoc.post_service.entity.Post;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface PostRepository extends JpaRepository<Post, UUID> {
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Post p set p.deletedAt = :now where p.id = :id and p.ownerId = :ownerId and p.deletedAt is null")
  int softDelete(@Param("id") UUID id, @Param("ownerId") UUID ownerId, @Param("now") Instant now);

  boolean existsByIdAndOwnerId(UUID id, UUID ownerId);
}
