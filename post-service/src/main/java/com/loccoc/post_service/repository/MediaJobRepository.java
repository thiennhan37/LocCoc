package com.loccoc.post_service.repository;
import com.loccoc.post_service.entity.MediaJob;
import java.util.*;
import org.springframework.data.jpa.repository.*;
public interface MediaJobRepository extends JpaRepository<MediaJob,UUID> {
  Optional<MediaJob> findByPostIdAndOperation(UUID postId,String operation);
  @Query("select j.id from MediaJob j where j.done=false and j.availableAt <= CURRENT_TIMESTAMP and (j.leaseUntil is null or j.leaseUntil < CURRENT_TIMESTAMP) order by j.availableAt limit 10")
  List<UUID> candidates();
  @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
  @Query("select j from MediaJob j where j.id=:id")
  Optional<MediaJob> lockById(@org.springframework.data.repository.query.Param("id") UUID id);
}
