package com.loccoc.admin.repository;

import com.loccoc.admin.model.entity.Tier;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TierRepository extends JpaRepository<Tier, Long> {
    Optional<Tier> findByCode(String code);
    boolean existsByCode(String code);
}
