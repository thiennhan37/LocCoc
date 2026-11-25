package com.loccoc.post_service.repository;
import com.loccoc.post_service.entity.AiPreviewAttempt;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
public interface AiPreviewAttemptRepository extends JpaRepository<AiPreviewAttempt,UUID> {
  long countByOwnerIdAndCreatedAtAfter(UUID ownerId, Instant after);
}
