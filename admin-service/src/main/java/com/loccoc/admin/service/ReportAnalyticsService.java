package com.loccoc.admin.service;

import com.loccoc.admin.model.dto.DashboardOverviewResponse;
import com.loccoc.admin.model.dto.TierDistributionResponse;
import com.loccoc.admin.model.entity.Tier;
import com.loccoc.admin.model.entity.UserSubscription;
import com.loccoc.admin.repository.AuditLogRepository;
import com.loccoc.admin.repository.SystemReportRepository;
import com.loccoc.admin.repository.TierRepository;
import com.loccoc.admin.repository.UserSubscriptionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ReportAnalyticsService {

    private final TierRepository tierRepository;
    private final UserSubscriptionRepository subscriptionRepository;
    private final SystemReportRepository reportRepository;
    private final AuditLogRepository auditLogRepository;

    public DashboardOverviewResponse getDashboardOverview() {
        List<Tier> allTiers = tierRepository.findAll();
        long activeTiers = allTiers.stream().filter(t -> Boolean.TRUE.equals(t.getIsActive())).count();

        List<UserSubscription> allSubs = subscriptionRepository.findAll();
        long activeSubs = allSubs.stream().filter(s -> "ACTIVE".equalsIgnoreCase(s.getStatus())).count();

        long pendingReports = reportRepository.countByStatus("PENDING");
        long totalLogs = auditLogRepository.count();

        Map<String, Long> subsByTier = new HashMap<>();
        BigDecimal estimatedRevenue = BigDecimal.ZERO;

        for (UserSubscription sub : allSubs) {
            if ("ACTIVE".equalsIgnoreCase(sub.getStatus()) && sub.getTier() != null) {
                String code = sub.getTier().getCode();
                subsByTier.put(code, subsByTier.getOrDefault(code, 0L) + 1);
                if (sub.getTier().getPrice() != null) {
                    estimatedRevenue = estimatedRevenue.add(sub.getTier().getPrice());
                }
            }
        }

        return DashboardOverviewResponse.builder()
                .totalTiers(allTiers.size())
                .activeTiers(activeTiers)
                .totalSubscriptions(allSubs.size())
                .activeSubscriptions(activeSubs)
                .pendingReports(pendingReports)
                .totalAuditLogs(totalLogs)
                .estimatedMonthlyRevenue(estimatedRevenue)
                .subscriptionsByTier(subsByTier)
                .build();
    }

    public List<TierDistributionResponse> getTierDistribution() {
        List<Tier> tiers = tierRepository.findAll();
        List<UserSubscription> activeSubs = subscriptionRepository.findAll().stream()
                .filter(s -> "ACTIVE".equalsIgnoreCase(s.getStatus()))
                .collect(Collectors.toList());

        long totalActive = activeSubs.size();
        List<TierDistributionResponse> result = new ArrayList<>();

        for (Tier tier : tiers) {
            long count = activeSubs.stream()
                    .filter(s -> s.getTier() != null && s.getTier().getId().equals(tier.getId()))
                    .count();

            double percentage = totalActive > 0 ? ((double) count / totalActive) * 100.0 : 0.0;

            result.add(TierDistributionResponse.builder()
                    .tierCode(tier.getCode())
                    .tierName(tier.getName())
                    .price(tier.getPrice())
                    .userCount(count)
                    .percentage(Math.round(percentage * 100.0) / 100.0)
                    .build());
        }

        return result;
    }
}
