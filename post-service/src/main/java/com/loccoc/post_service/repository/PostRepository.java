package com.loccoc.post_service.repository;

import com.loccoc.post_service.entity.Post;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface PostRepository extends JpaRepository<Post, UUID> {
  @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
  @Query("select p from Post p where p.id = :id")
  java.util.Optional<Post> lockById(@Param("id") UUID id);
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Post p set p.deletedAt = :now where p.id = :id and p.ownerId = :ownerId and p.deletedAt is null")
  int softDelete(@Param("id") UUID id, @Param("ownerId") UUID ownerId, @Param("now") Instant now);

  @Query("select p.id from Post p where p.state='draft' and p.deletedAt is null and p.createdAt<:cutoff order by p.createdAt limit 100")
  java.util.List<UUID> expiredDrafts(@Param("cutoff") Instant cutoff);
  java.util.List<Post> findByOwnerIdAndDeletedAtIsNull(UUID ownerId);
  long countByOwnerIdAndDeletedAtIsNull(UUID ownerId);
  boolean existsByIdAndOwnerId(UUID id, UUID ownerId);
}
