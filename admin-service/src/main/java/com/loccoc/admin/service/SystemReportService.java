package com.loccoc.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loccoc.admin.model.dto.CreateReportRequest;
import com.loccoc.admin.model.dto.ResolveReportRequest;
import com.loccoc.admin.model.entity.SystemReport;
import com.loccoc.admin.repository.SystemReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class SystemReportService {

    private final SystemReportRepository reportRepository;
    private final AuditLogService auditLogService;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    public Page<SystemReport> getReports(String status, String targetType, Pageable pageable) {
        if (status != null && !status.isBlank() && targetType != null && !targetType.isBlank()) {
            return reportRepository.findByStatusAndTargetType(status, targetType, pageable);
        } else if (status != null && !status.isBlank()) {
            return reportRepository.findByStatus(status, pageable);
        } else if (targetType != null && !targetType.isBlank()) {
            return reportRepository.findByTargetType(targetType, pageable);
        }
        return reportRepository.findAll(pageable);
    }

    public SystemReport getReportById(Long id) {
        return reportRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Report not found with id: " + id));
    }

    @Transactional
    public SystemReport createReport(CreateReportRequest request) {
        SystemReport report = SystemReport.builder()
                .reporterId(request.getReporterId())
                .targetType(request.getTargetType().toUpperCase())
                .targetId(request.getTargetId())
                .reason(request.getReason())
                .description(request.getDescription())
                .status("PENDING")
                .build();
        return reportRepository.save(report);
    }

    @Transactional
    public SystemReport resolveReport(Long adminId, Long reportId, ResolveReportRequest request, String ipAddress) {
        SystemReport report = getReportById(reportId);

        report.setStatus(request.getStatus().toUpperCase());
        report.setActionTaken(request.getActionTaken().toUpperCase());
        report.setAdminNote(request.getAdminNote());
        report.setResolvedByAdminId(adminId);

        SystemReport saved = reportRepository.save(report);

        // 1. Log to AuditLog
        String details = String.format("{\"reportId\":%d,\"targetType\":\"%s\",\"targetId\":%d,\"actionTaken\":\"%s\",\"adminNote\":\"%s\"}",
                saved.getId(), saved.getTargetType(), saved.getTargetId(), saved.getActionTaken(), saved.getAdminNote());
        auditLogService.logAction(adminId, "RESOLVE_REPORT", saved.getTargetId(), details, ipAddress);

        // 2. Publish Event to Kafka for downstream services (Post Service, User Service, Notification Service)
        try {
            Map<String, Object> event = Map.of(
                    "eventType", "ADMIN_MODERATION_ACTION",
                    "reportId", saved.getId(),
                    "targetType", saved.getTargetType(),
                    "targetId", saved.getTargetId(),
                    "actionTaken", saved.getActionTaken(),
                    "adminId", adminId,
                    "timestamp", System.currentTimeMillis()
            );
            String payload = objectMapper.writeValueAsString(event);
            kafkaTemplate.send("admin.moderation.events", saved.getTargetType() + "-" + saved.getTargetId(), payload);
            log.info("Published moderation event: {}", payload);
        } catch (Exception e) {
            log.warn("Failed to publish moderation Kafka event: {}", e.getMessage());
        }

        return saved;
    }
}
