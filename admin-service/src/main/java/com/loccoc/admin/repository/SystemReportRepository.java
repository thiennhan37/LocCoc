package com.loccoc.admin.repository;

import com.loccoc.admin.model.entity.SystemReport;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SystemReportRepository extends JpaRepository<SystemReport, Long> {

    Page<SystemReport> findByStatus(String status, Pageable pageable);

    Page<SystemReport> findByTargetType(String targetType, Pageable pageable);

    Page<SystemReport> findByStatusAndTargetType(String status, String targetType, Pageable pageable);

    long countByStatus(String status);
}
