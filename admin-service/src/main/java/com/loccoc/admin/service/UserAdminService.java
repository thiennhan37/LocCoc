package com.loccoc.admin.service;

import com.loccoc.admin.model.dto.OverrideTierRequest;
import com.loccoc.admin.model.entity.Tier;
import com.loccoc.admin.model.entity.UserSubscription;
import com.loccoc.admin.repository.TierRepository;
import com.loccoc.admin.repository.UserSubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserAdminService {

    private final UserSubscriptionRepository subscriptionRepository;
    private final TierRepository tierRepository;
    private final AuditLogService auditLogService;
    private final StringRedisTemplate redisTemplate;
    private final KafkaTemplate<String, String> kafkaTemplate;

    public List<UserSubscription> getUserSubscriptions(Long userId) {
        return subscriptionRepository.findByUserId(userId);
    }

    @Transactional
    public UserSubscription overrideUserTier(Long adminId, Long userId, OverrideTierRequest request, String ipAddress) {
        Tier tier = tierRepository.findById(request.getTierId())
                .orElseThrow(() -> new IllegalArgumentException("Tier not found with ID: " + request.getTierId()));

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime endDate = now.plusDays(request.getDurationDays());

        UserSubscription subscription = subscriptionRepository
                .findFirstByUserIdAndStatusOrderByCreatedAtDesc(userId, "ACTIVE")
                .map(sub -> {
                    sub.setTier(tier);
                    sub.setEndDate(sub.getEndDate().isAfter(now) ? sub.getEndDate().plusDays(request.getDurationDays()) : endDate);
                    sub.setUpdatedByAdminId(adminId);
                    return sub;
                })
                .orElseGet(() -> UserSubscription.builder()
                        .userId(userId)
                        .tier(tier)
                        .status("ACTIVE")
                        .startDate(now)
                        .endDate(endDate)
                        .autoRenew(false)
                        .updatedByAdminId(adminId)
                        .build());

        UserSubscription saved = subscriptionRepository.save(subscription);

        // Invalidate Redis cache
        try {
            redisTemplate.opsForValue().set("user:" + userId + ":tier", tier.getCode());
        } catch (Exception e) {
            log.warn("Failed to update Redis cache for user {}: {}", userId, e.getMessage());
        }

        // Audit Log
        String details = String.format("{\"tierCode\":\"%s\",\"addedDays\":%d,\"reason\":\"%s\"}",
                tier.getCode(), request.getDurationDays(), request.getReason());
        auditLogService.logAction(adminId, "OVERRIDE_USER_TIER", userId, details, ipAddress);

        // Publish Kafka Event
        try {
            kafkaTemplate.send("subscription.events", "user-" + userId,
                    String.format("{\"eventType\":\"TIER_OVERRIDDEN\",\"userId\":%d,\"tierCode\":\"%s\",\"endDate\":\"%s\"}",
                            userId, tier.getCode(), saved.getEndDate()));
        } catch (Exception e) {
            log.warn("Failed to publish Kafka event for user {}: {}", userId, e.getMessage());
        }

        return saved;
    }
}
