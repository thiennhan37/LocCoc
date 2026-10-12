package com.loccoc.payment.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CheckoutResponse {
    private Long orderCode;
    private String checkoutUrl;
    private String qrCode;
    private Integer amount;
    private String description;
}
