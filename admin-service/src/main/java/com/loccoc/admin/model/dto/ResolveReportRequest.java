package com.loccoc.admin.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResolveReportRequest {

    @NotBlank(message = "Status is required (RESOLVED, REJECTED)")
    private String status;

    @NotBlank(message = "Action taken is required (BAN_USER, DELETE_POST, DISMISS, WARNING)")
    private String actionTaken;

    private String adminNote;
}
