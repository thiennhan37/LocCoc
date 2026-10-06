package com.loccoc.payment.model.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CreateCheckoutRequest {
    @NotNull(message = "Tier ID is required")
    private Long tierId;
}
