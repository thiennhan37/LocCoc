package com.loccoc.admin.model.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class UpdateTierRequest {
    private String name;
    private String description;
    private BigDecimal price;
    private Integer durationDays;
    private String limitsJson;
    private String featuresJson;
    private Boolean isActive;
}
