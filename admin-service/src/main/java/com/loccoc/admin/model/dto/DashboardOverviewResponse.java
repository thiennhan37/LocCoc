package com.loccoc.admin.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardOverviewResponse {

    private long totalTiers;
    private long activeTiers;
    private long totalSubscriptions;
    private long activeSubscriptions;
    private long pendingReports;
    private long totalAuditLogs;
    private BigDecimal estimatedMonthlyRevenue;
    private Map<String, Long> subscriptionsByTier;
}
