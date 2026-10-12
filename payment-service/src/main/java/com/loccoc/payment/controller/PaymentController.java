package com.loccoc.payment.controller;

import com.loccoc.payment.model.dto.ApiResponse;
import com.loccoc.payment.model.dto.CheckoutResponse;
import com.loccoc.payment.model.dto.CreateCheckoutRequest;
import com.loccoc.payment.service.PayOSPaymentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PayOSPaymentService paymentService;

    @PostMapping("/create-checkout")
    public ResponseEntity<ApiResponse<CheckoutResponse>> createCheckout(
            @RequestHeader(value = "x-user-id", required = false, defaultValue = "1") Long userId,
            @Valid @RequestBody CreateCheckoutRequest request) {
        CheckoutResponse response = paymentService.createCheckout(userId, request.getTierId());
        return ResponseEntity.ok(ApiResponse.ok(response, "Checkout link created successfully"));
    }
}
