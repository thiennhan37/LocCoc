package com.loccoc.payment.service;

import com.loccoc.payment.model.dto.CheckoutResponse;
import com.loccoc.payment.model.entity.PaymentTransaction;
import com.loccoc.payment.model.entity.Tier;
import com.loccoc.payment.repository.PaymentTransactionRepository;
import com.loccoc.payment.repository.TierRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.payos.PayOS;
import vn.payos.model.v2.paymentRequests.CreatePaymentLinkRequest;
import vn.payos.model.v2.paymentRequests.CreatePaymentLinkResponse;
import vn.payos.model.v2.paymentRequests.PaymentLinkItem;

import java.math.BigDecimal;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class PayOSPaymentService {

    private final PayOS payOS;
    private final TierRepository tierRepository;
    private final PaymentTransactionRepository paymentRepo;

    @Value("${payos.return-url:http://localhost:8080/payments/success}")
    private String returnUrl;

    @Value("${payos.cancel-url:http://localhost:8080/payments/cancel}")
    private String cancelUrl;

    @Transactional
    public CheckoutResponse createCheckout(Long userId, Long tierId) {
        Tier tier = tierRepository.findById(tierId)
                .orElseThrow(() -> new IllegalArgumentException("Tier not found with ID: " + tierId));

        if (!Boolean.TRUE.equals(tier.getIsActive())) {
            throw new IllegalArgumentException("Selected tier is not active");
        }

        // Generate unique order code (numeric timestamp in seconds)
        long orderCode = System.currentTimeMillis() / 1000L;
        long amount = tier.getPrice().longValue();
        String description = "LOCCOC " + tier.getCode();
        if (description.length() > 25) {
            description = description.substring(0, 25);
        }

        PaymentLinkItem item = PaymentLinkItem.builder()
                .name("Tier " + tier.getCode())
                .quantity(1)
                .price(amount)
                .build();

        CreatePaymentLinkRequest paymentData = CreatePaymentLinkRequest.builder()
                .orderCode(orderCode)
                .amount(amount)
                .description(description)
                .returnUrl(returnUrl)
                .cancelUrl(cancelUrl)
                .items(List.of(item))
                .build();

        // 1. Save Transaction to DB with PENDING status
        PaymentTransaction tx = PaymentTransaction.builder()
                .orderCode(orderCode)
                .userId(userId)
                .tierId(tierId)
                .amount(BigDecimal.valueOf(amount))
                .status("PENDING")
                .provider("PAYOS")
                .build();
        paymentRepo.save(tx);

        try {
            // 2. Call PayOS SDK to generate VietQR / checkout link
            CreatePaymentLinkResponse responseData = payOS.paymentRequests().create(paymentData);
            log.info("Created PayOS link for orderCode: {}, checkoutUrl: {}", orderCode, responseData.getCheckoutUrl());

            return CheckoutResponse.builder()
                    .orderCode(orderCode)
                    .checkoutUrl(responseData.getCheckoutUrl())
                    .qrCode(responseData.getQrCode())
                    .amount((int) amount)
                    .description(description)
                    .build();
        } catch (Exception e) {
            log.error("Failed to create PayOS payment link: {}", e.getMessage(), e);
            tx.setStatus("FAILED");
            paymentRepo.save(tx);
            throw new RuntimeException("Failed to initiate payment with PayOS: " + e.getMessage());
        }
    }
}
