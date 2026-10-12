package com.loccoc.admin.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateReportRequest {

    @NotNull(message = "Reporter ID is required")
    private Long reporterId;

    @NotBlank(message = "Target type is required (USER, POST, COMMENT, CHAT)")
    private String targetType;

    @NotNull(message = "Target ID is required")
    private Long targetId;

    @NotBlank(message = "Reason is required")
    private String reason;

    private String description;
}
