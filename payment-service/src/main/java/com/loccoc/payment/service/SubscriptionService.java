package com.loccoc.payment.service;

import com.loccoc.payment.model.entity.PaymentTransaction;
import com.loccoc.payment.model.entity.Tier;
import com.loccoc.payment.model.entity.UserSubscription;
import com.loccoc.payment.repository.PaymentTransactionRepository;
import com.loccoc.payment.repository.TierRepository;
import com.loccoc.payment.repository.UserSubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class SubscriptionService {

    private final UserSubscriptionRepository subscriptionRepository;
    private final TierRepository tierRepository;
    private final PaymentTransactionRepository paymentRepo;
    private final StringRedisTemplate redisTemplate;
    private final KafkaTemplate<String, String> kafkaTemplate;

    public List<UserSubscription> getUserSubscriptions(Long userId) {
        return subscriptionRepository.findByUserId(userId);
    }

    public Optional<UserSubscription> getActiveSubscription(Long userId) {
        Optional<UserSubscription> subOpt = subscriptionRepository.findFirstByUserIdAndStatusOrderByCreatedAtDesc(userId, "ACTIVE");
        if (subOpt.isPresent()) {
            UserSubscription sub = subOpt.get();
            if (sub.getEndDate() != null && sub.getEndDate().isBefore(LocalDateTime.now())) {
                log.info("Subscription id: {} for user: {} has expired. Marking as EXPIRED.", sub.getId(), userId);
                sub.setStatus("EXPIRED");
                subscriptionRepository.save(sub);
                try {
                    redisTemplate.opsForValue().set("user:" + userId + ":tier", "FREE");
                } catch (Exception ignored) {}
                return Optional.empty();
            }
        }
        return subOpt;
    }

    @Transactional
    public void processSuccessfulPayment(Long orderCode, String reference) {
        Optional<PaymentTransaction> txOpt = paymentRepo.findByOrderCode(orderCode);
        if (txOpt.isEmpty()) {
            log.info("Order {} not found in database (PayOS test webhook confirmation). Returning success.", orderCode);
            return;
        }

        PaymentTransaction tx = txOpt.get();

        // Idempotency check: avoid double processing
        if ("SUCCESS".equalsIgnoreCase(tx.getStatus())) {
            log.info("Order {} already processed as SUCCESS. Skipping.", orderCode);
            return;
        }

        tx.setStatus("SUCCESS");
        tx.setPaymentReference(reference);
        paymentRepo.save(tx);

        Tier tier = tierRepository.findById(tx.getTierId())
                .orElseThrow(() -> new IllegalArgumentException("Tier not found: " + tx.getTierId()));

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime endDate = now.plusDays(tier.getDurationDays());

        UserSubscription subscription = subscriptionRepository
                .findFirstByUserIdAndStatusOrderByCreatedAtDesc(tx.getUserId(), "ACTIVE")
                .map(sub -> {
                    sub.setTier(tier);
                    sub.setEndDate(sub.getEndDate().isAfter(now) ? sub.getEndDate().plusDays(tier.getDurationDays()) : endDate);
                    return sub;
                })
                .orElseGet(() -> UserSubscription.builder()
                        .userId(tx.getUserId())
                        .tier(tier)
                        .status("ACTIVE")
                        .startDate(now)
                        .endDate(endDate)
                        .autoRenew(false)
                        .build());

        UserSubscription saved = subscriptionRepository.save(subscription);

        // Update Redis cache
        try {
            redisTemplate.opsForValue().set("user:" + tx.getUserId() + ":tier", tier.getCode());
        } catch (Exception e) {
            log.warn("Failed to update Redis cache for user {}: {}", tx.getUserId(), e.getMessage());
        }

        // Publish Kafka Event
        try {
            String eventPayload = String.format(
                    "{\"eventType\":\"SUBSCRIPTION_TIER_UPGRADED\",\"userId\":%d,\"tierCode\":\"%s\",\"orderCode\":%d,\"endDate\":\"%s\"}",
                    tx.getUserId(), tier.getCode(), orderCode, saved.getEndDate());
            kafkaTemplate.send("subscription.events", "user-" + tx.getUserId(), eventPayload);
            log.info("Published subscription.events for user: {}", tx.getUserId());
        } catch (Exception e) {
            log.warn("Failed to publish Kafka event for user {}: {}", tx.getUserId(), e.getMessage());
        }
    }
}
