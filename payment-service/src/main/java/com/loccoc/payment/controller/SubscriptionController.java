package com.loccoc.payment.controller;

import com.loccoc.payment.model.dto.ApiResponse;
import com.loccoc.payment.model.entity.UserSubscription;
import com.loccoc.payment.service.SubscriptionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/subscriptions")
@RequiredArgsConstructor
public class SubscriptionController {

    private final SubscriptionService subscriptionService;

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserSubscription>> getMySubscription(
            @RequestHeader(value = "x-user-id", required = false, defaultValue = "1") Long userId) {
        return subscriptionService.getActiveSubscription(userId)
                .map(sub -> ResponseEntity.ok(ApiResponse.ok(sub)))
                .orElseGet(() -> ResponseEntity.ok(ApiResponse.ok(null, "No active subscription found")));
    }

    @GetMapping("/history")
    public ResponseEntity<ApiResponse<List<UserSubscription>>> getMyHistory(
            @RequestHeader(value = "x-user-id", required = false, defaultValue = "1") Long userId) {
        return ResponseEntity.ok(ApiResponse.ok(subscriptionService.getUserSubscriptions(userId)));
    }
}
