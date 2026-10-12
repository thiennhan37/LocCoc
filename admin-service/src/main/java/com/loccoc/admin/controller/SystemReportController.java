package com.loccoc.admin.controller;

import com.loccoc.admin.model.dto.ApiResponse;
import com.loccoc.admin.model.dto.CreateReportRequest;
import com.loccoc.admin.model.dto.ResolveReportRequest;
import com.loccoc.admin.model.entity.SystemReport;
import com.loccoc.admin.service.SystemReportService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/admin/reports")
@RequiredArgsConstructor
public class SystemReportController {

    private final SystemReportService reportService;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<SystemReport>>> getReports(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String targetType,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<SystemReport> reports = reportService.getReports(status, targetType,
                PageRequest.of(page, size, Sort.by("createdAt").descending()));
        return ResponseEntity.ok(ApiResponse.ok(reports));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<SystemReport>> getReportById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(reportService.getReportById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<SystemReport>> createReport(@Valid @RequestBody CreateReportRequest request) {
        SystemReport created = reportService.createReport(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(created, "Report submitted successfully"));
    }

    @PutMapping("/{id}/resolve")
    public ResponseEntity<ApiResponse<SystemReport>> resolveReport(
            @RequestHeader(value = "x-user-id", required = false, defaultValue = "1") Long adminId,
            @PathVariable Long id,
            @Valid @RequestBody ResolveReportRequest request,
            HttpServletRequest httpRequest) {
        SystemReport resolved = reportService.resolveReport(adminId, id, request, httpRequest.getRemoteAddr());
        return ResponseEntity.ok(ApiResponse.ok(resolved, "Report resolved successfully"));
    }
}
