package com.loccoc.admin.repository;

import com.loccoc.admin.model.entity.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    Page<AuditLog> findByAdminId(Long adminId, Pageable pageable);
    Page<AuditLog> findByTargetUserId(Long targetUserId, Pageable pageable);
}
