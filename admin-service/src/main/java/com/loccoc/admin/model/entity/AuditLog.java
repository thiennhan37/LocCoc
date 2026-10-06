package com.loccoc.admin.model.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "audit_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long adminId;

    @Column(nullable = false, length = 50)
    private String action;

    private Long targetUserId;

    @Column(columnDefinition = "JSON")
    private String detailsJson;

    @Column(length = 45)
    private String ipAddress;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;
}
