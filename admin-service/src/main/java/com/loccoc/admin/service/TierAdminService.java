package com.loccoc.admin.service;

import com.loccoc.admin.model.dto.CreateTierRequest;
import com.loccoc.admin.model.dto.UpdateTierRequest;
import com.loccoc.admin.model.entity.Tier;
import com.loccoc.admin.repository.TierRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class TierAdminService {

    private final TierRepository tierRepository;
    private final AuditLogService auditLogService;

    public List<Tier> getAllTiers() {
        return tierRepository.findAll();
    }

    public Tier getTierById(Long id) {
        return tierRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Tier not found with ID: " + id));
    }

    @Transactional
    public Tier createTier(Long adminId, CreateTierRequest request, String ipAddress) {
        if (tierRepository.existsByCode(request.getCode())) {
            throw new IllegalArgumentException("Tier with code already exists: " + request.getCode());
        }

        Tier tier = Tier.builder()
                .code(request.getCode().toUpperCase())
                .name(request.getName())
                .description(request.getDescription())
                .price(request.getPrice())
                .durationDays(request.getDurationDays())
                .limitsJson(request.getLimitsJson())
                .featuresJson(request.getFeaturesJson())
                .isActive(true)
                .build();

        Tier saved = tierRepository.save(tier);
        auditLogService.logAction(adminId, "CREATE_TIER", null, "{\"tierCode\":\"" + saved.getCode() + "\"}", ipAddress);
        return saved;
    }

    @Transactional
    public Tier updateTier(Long adminId, Long id, UpdateTierRequest request, String ipAddress) {
        Tier tier = getTierById(id);

        if (request.getName() != null) tier.setName(request.getName());
        if (request.getDescription() != null) tier.setDescription(request.getDescription());
        if (request.getPrice() != null) tier.setPrice(request.getPrice());
        if (request.getDurationDays() != null) tier.setDurationDays(request.getDurationDays());
        if (request.getLimitsJson() != null) tier.setLimitsJson(request.getLimitsJson());
        if (request.getFeaturesJson() != null) tier.setFeaturesJson(request.getFeaturesJson());
        if (request.getIsActive() != null) tier.setIsActive(request.getIsActive());

        Tier updated = tierRepository.save(tier);
        auditLogService.logAction(adminId, "UPDATE_TIER", null, "{\"tierId\":" + id + "}", ipAddress);
        return updated;
    }
}
