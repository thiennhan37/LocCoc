package com.loccoc.admin.model.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "system_reports", indexes = {
        @Index(name = "idx_report_status", columnList = "status"),
        @Index(name = "idx_target", columnList = "target_type, target_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SystemReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "reporter_id", nullable = false)
    private Long reporterId;

    @Column(name = "target_type", nullable = false, length = 50)
    private String targetType; // USER, POST, COMMENT, CHAT

    @Column(name = "target_id", nullable = false)
    private Long targetId;

    @Column(name = "reason", nullable = false, length = 255)
    private String reason;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "status", nullable = false, length = 30)
    @Builder.Default
    private String status = "PENDING"; // PENDING, RESOLVED, REJECTED

    @Column(name = "action_taken", length = 50)
    private String actionTaken; // BAN_USER, DELETE_POST, DISMISS, WARNING

    @Column(name = "resolved_by_admin_id")
    private Long resolvedByAdminId;

    @Column(name = "admin_note", length = 500)
    private String adminNote;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
