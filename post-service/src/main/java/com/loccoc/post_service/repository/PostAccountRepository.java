package com.loccoc.post_service.repository;
import com.loccoc.post_service.entity.PostAccount;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface PostAccountRepository extends JpaRepository<PostAccount,UUID> {
  @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
  @Query("select a from PostAccount a where a.id=:id")
  Optional<PostAccount> lockById(@Param("id") UUID id);
}
