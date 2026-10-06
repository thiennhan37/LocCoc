package com.loccoc.payment.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.loccoc.payment.service.SubscriptionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import vn.payos.PayOS;
import vn.payos.model.webhooks.Webhook;
import vn.payos.model.webhooks.WebhookData;

import java.util.Map;

@RestController
@RequestMapping("/payments/webhook")
@RequiredArgsConstructor
@Slf4j
public class PayOSWebhookController {

    private final PayOS payOS;
    private final SubscriptionService subscriptionService;
    private final ObjectMapper objectMapper;

    @GetMapping("/payos")
    public ResponseEntity<Map<String, Object>> getWebhookHealth() {
        return ResponseEntity.ok(Map.of("status", "ok", "message", "PayOS Webhook endpoint is live"));
    }

    @PostMapping("/payos")
    public ResponseEntity<Map<String, Object>> handlePayOSWebhook(@RequestBody ObjectNode webhookPayload) {
        log.info("Incoming PayOS Webhook raw payload: {}", webhookPayload);
        try {
            // 1. Parse into PayOS Webhook model
            Webhook webhook = objectMapper.treeToValue(webhookPayload, Webhook.class);

            // 2. Verify HMAC SHA256 Signature using PayOS SDK 2.x
            WebhookData verifiedData = null;
            try {
                verifiedData = payOS.webhooks().verify(webhook);
                log.info("PayOS Webhook signature verified successfully. OrderCode: {}, Code: {}", verifiedData.getOrderCode(), webhook.getCode());
            } catch (Exception sigEx) {
                log.warn("PayOS Webhook signature verification note: {}. Payload: {}", sigEx.getMessage(), webhookPayload);
            }

            // 3. Process payment status (00 = success in PayOS) only if verified
            if (verifiedData != null && "00".equals(webhook.getCode())) {
                subscriptionService.processSuccessfulPayment(verifiedData.getOrderCode(), verifiedData.getReference());
            }

            // Always return HTTP 200 OK so PayOS confirms the webhook URL
            return ResponseEntity.ok(Map.of("success", true, "message", "Webhook received successfully"));
        } catch (Exception e) {
            log.error("PayOS Webhook parsing error: {}", e.getMessage(), e);
            return ResponseEntity.ok(Map.of("success", false, "error", e.getMessage()));
        }
    }

    @PostMapping("/confirm")
    public ResponseEntity<Map<String, Object>> confirmWebhookUrl(@RequestBody Map<String, String> body) {
        String webhookUrl = body.get("webhookUrl");
        if (webhookUrl == null || webhookUrl.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "error", "webhookUrl is required"));
        }
        try {
            log.info("Sending Webhook confirmation to PayOS for URL: {}", webhookUrl);
            var response = payOS.webhooks().confirm(webhookUrl);
            return ResponseEntity.ok(Map.of("success", true, "message", "Webhook confirmed successfully", "data", response));
        } catch (Exception e) {
            log.error("Failed to confirm webhook with PayOS: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("success", false, "error", e.getMessage()));
        }
    }
}
