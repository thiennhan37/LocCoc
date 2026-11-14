package com.loccoc.admin.controller;

import com.loccoc.admin.model.dto.ApiResponse;
import com.loccoc.admin.model.dto.DashboardOverviewResponse;
import com.loccoc.admin.model.dto.TierDistributionResponse;
import com.loccoc.admin.service.ReportAnalyticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/admin/reports")
@RequiredArgsConstructor
public class ReportAnalyticsController {

    private final ReportAnalyticsService reportAnalyticsService;

    @GetMapping("/overview")
    public ResponseEntity<ApiResponse<DashboardOverviewResponse>> getDashboardOverview() {
        return ResponseEntity.ok(ApiResponse.ok(reportAnalyticsService.getDashboardOverview()));
    }

    @GetMapping("/tiers-distribution")
    public ResponseEntity<ApiResponse<List<TierDistributionResponse>>> getTierDistribution() {
        return ResponseEntity.ok(ApiResponse.ok(reportAnalyticsService.getTierDistribution()));
    }
}
