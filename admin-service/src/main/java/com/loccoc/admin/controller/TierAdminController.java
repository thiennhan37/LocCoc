package com.loccoc.admin.controller;

import com.loccoc.admin.model.dto.ApiResponse;
import com.loccoc.admin.model.dto.CreateTierRequest;
import com.loccoc.admin.model.dto.UpdateTierRequest;
import com.loccoc.admin.model.entity.Tier;
import com.loccoc.admin.service.TierAdminService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/admin/tiers")
@RequiredArgsConstructor
public class TierAdminController {

    private final TierAdminService tierAdminService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<Tier>>> getAllTiers() {
        return ResponseEntity.ok(ApiResponse.ok(tierAdminService.getAllTiers()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Tier>> getTierById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(tierAdminService.getTierById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Tier>> createTier(
            @RequestHeader(value = "x-user-id", required = false, defaultValue = "1") Long adminId,
            @Valid @RequestBody CreateTierRequest request,
            HttpServletRequest httpRequest) {
        Tier created = tierAdminService.createTier(adminId, request, httpRequest.getRemoteAddr());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(created, "Tier created successfully"));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<Tier>> updateTier(
            @RequestHeader(value = "x-user-id", required = false, defaultValue = "1") Long adminId,
            @PathVariable Long id,
            @RequestBody UpdateTierRequest request,
            HttpServletRequest httpRequest) {
        Tier updated = tierAdminService.updateTier(adminId, id, request, httpRequest.getRemoteAddr());
        return ResponseEntity.ok(ApiResponse.ok(updated, "Tier updated successfully"));
    }
}
