package com.loccoc.admin.service;

import com.loccoc.admin.model.entity.AuditLog;
import com.loccoc.admin.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    public void logAction(Long adminId, String action, Long targetUserId, String detailsJson, String ipAddress) {
        AuditLog logEntry = AuditLog.builder()
                .adminId(adminId != null ? adminId : 0L)
                .action(action)
                .targetUserId(targetUserId)
                .detailsJson(detailsJson)
                .ipAddress(ipAddress)
                .build();
        auditLogRepository.save(logEntry);
        log.info("AUDIT: Admin {} executed {} on target user {}", adminId, action, targetUserId);
    }

    public Page<AuditLog> getLogsByAdmin(Long adminId, Pageable pageable) {
        return auditLogRepository.findByAdminId(adminId, pageable);
    }

    public Page<AuditLog> getLogsByTargetUser(Long targetUserId, Pageable pageable) {
        return auditLogRepository.findByTargetUserId(targetUserId, pageable);
    }

    public Page<AuditLog> getAllLogs(Pageable pageable) {
        return auditLogRepository.findAll(pageable);
    }
}
