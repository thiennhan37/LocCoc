package com.loccoc.admin.controller;

import com.loccoc.admin.model.dto.ApiResponse;
import com.loccoc.admin.model.dto.OverrideTierRequest;
import com.loccoc.admin.model.entity.UserSubscription;
import com.loccoc.admin.service.UserAdminService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/admin/users")
@RequiredArgsConstructor
public class UserAdminController {

    private final UserAdminService userAdminService;

    @GetMapping("/{userId}/subscriptions")
    public ResponseEntity<ApiResponse<List<UserSubscription>>> getUserSubscriptions(@PathVariable Long userId) {
        return ResponseEntity.ok(ApiResponse.ok(userAdminService.getUserSubscriptions(userId)));
    }

    @PostMapping("/{userId}/override-tier")
    public ResponseEntity<ApiResponse<UserSubscription>> overrideUserTier(
            @RequestHeader(value = "x-user-id", required = false, defaultValue = "1") Long adminId,
            @PathVariable Long userId,
            @Valid @RequestBody OverrideTierRequest request,
            HttpServletRequest httpRequest) {
        UserSubscription updated = userAdminService.overrideUserTier(adminId, userId, request, httpRequest.getRemoteAddr());
        return ResponseEntity.ok(ApiResponse.ok(updated, "User subscription overridden successfully"));
    }
}
