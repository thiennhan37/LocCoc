package com.loccoc.admin.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TierDistributionResponse {

    private String tierCode;
    private String tierName;
    private BigDecimal price;
    private long userCount;
    private double percentage;
}
