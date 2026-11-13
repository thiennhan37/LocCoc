package com.loccoc.admin.controller;

import com.loccoc.admin.model.dto.ApiResponse;
import com.loccoc.admin.model.entity.AuditLog;
import com.loccoc.admin.service.AuditLogService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/admin/audit-logs")
@RequiredArgsConstructor
public class AuditLogController {

    private final AuditLogService auditLogService;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<AuditLog>>> getAllAuditLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<AuditLog> logs = auditLogService.getAllLogs(PageRequest.of(page, size, Sort.by("createdAt").descending()));
        return ResponseEntity.ok(ApiResponse.ok(logs));
    }

    @GetMapping("/user/{targetUserId}")
    public ResponseEntity<ApiResponse<Page<AuditLog>>> getAuditLogsByTargetUser(
            @PathVariable Long targetUserId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<AuditLog> logs = auditLogService.getLogsByTargetUser(targetUserId, PageRequest.of(page, size, Sort.by("createdAt").descending()));
        return ResponseEntity.ok(ApiResponse.ok(logs));
    }
}
