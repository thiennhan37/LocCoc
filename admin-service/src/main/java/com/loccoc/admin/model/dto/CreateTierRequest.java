package com.loccoc.admin.model.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class CreateTierRequest {

    @NotBlank(message = "Tier code is required")
    private String code;

    @NotBlank(message = "Tier name is required")
    private String name;

    private String description;

    @NotNull(message = "Price is required")
    @DecimalMin(value = "0.0", inclusive = true, message = "Price must be >= 0")
    private BigDecimal price;

    @NotNull(message = "Duration in days is required")
    @Min(value = 1, message = "Duration must be at least 1 day")
    private Integer durationDays;

    private String limitsJson;
    private String featuresJson;
}
