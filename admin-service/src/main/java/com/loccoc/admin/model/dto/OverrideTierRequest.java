package com.loccoc.admin.model.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class OverrideTierRequest {

    @NotNull(message = "Tier ID is required")
    private Long tierId;

    @NotNull(message = "Days to add is required")
    @Min(value = 1, message = "Days must be at least 1")
    private Integer durationDays;

    @NotBlank(message = "Reason for override is required")
    private String reason;
}
