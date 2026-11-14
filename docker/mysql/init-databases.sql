-- MySQL Init Script for LocCoc Admin & Payment Services
CREATE DATABASE IF NOT EXISTS `admin_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `payment_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'admin_user'@'%' IDENTIFIED BY 'admin_password';
GRANT ALL PRIVILEGES ON `admin_db`.* TO 'admin_user'@'%';

CREATE USER IF NOT EXISTS 'payment_user'@'%' IDENTIFIED BY 'payment_password';
GRANT ALL PRIVILEGES ON `payment_db`.* TO 'payment_user'@'%';

FLUSH PRIVILEGES;

-- Use payment_db for core schema setup
USE `payment_db`;

CREATE TABLE IF NOT EXISTS `tiers` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(50) NOT NULL UNIQUE,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT,
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `duration_days` INT NOT NULL DEFAULT 30,
    `limits_json` JSON NULL,
    `features_json` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `user_subscriptions` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `user_id` BIGINT NOT NULL,
    `tier_id` BIGINT NOT NULL,
    `status` VARCHAR(30) NOT NULL,
    `start_date` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `end_date` TIMESTAMP NOT NULL,
    `auto_renew` BOOLEAN NOT NULL DEFAULT FALSE,
    `updated_by_admin_id` BIGINT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_sub_tier` FOREIGN KEY (`tier_id`) REFERENCES `tiers`(`id`),
    INDEX `idx_user_status` (`user_id`, `status`)
);

CREATE TABLE IF NOT EXISTS `payment_transactions` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `order_code` BIGINT NOT NULL UNIQUE,
    `user_id` BIGINT NOT NULL,
    `tier_id` BIGINT NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `provider` VARCHAR(30) NOT NULL DEFAULT 'PAYOS',
    `payment_reference` VARCHAR(100) NULL,
    `status` VARCHAR(30) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_order_code` (`order_code`),
    INDEX `idx_user_id` (`user_id`)
);

-- Use admin_db for audit logging & replicated view
USE `admin_db`;

CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `admin_id` BIGINT NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `target_user_id` BIGINT NULL,
    `details_json` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_admin_action` (`admin_id`, `action`)
);

CREATE TABLE IF NOT EXISTS `system_reports` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `reporter_id` BIGINT NOT NULL,
    `target_type` VARCHAR(50) NOT NULL,
    `target_id` BIGINT NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    `action_taken` VARCHAR(50) NULL,
    `resolved_by_admin_id` BIGINT NULL,
    `admin_note` VARCHAR(500) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_report_status` (`status`),
    INDEX `idx_report_target` (`target_type`, `target_id`)
);

-- Seed initial tiers in payment_db and admin_db
USE `payment_db`;
INSERT IGNORE INTO `tiers` (`id`, `code`, `name`, `description`, `price`, `duration_days`, `is_active`) 
VALUES 
(1, 'FREE', 'Gói Miễn Phí', 'Gói mặc định cho người dùng mới', 0.00, 3650, TRUE),
(2, 'PRO', 'Gói Pro', 'Nâng cao hạn mức và tính năng đặc quyền', 1000.00, 30, TRUE),
(3, 'VIP', 'Gói VIP', 'Không giới hạn tính năng và ưu tiên hỗ trợ 24/7', 2000.00, 30, TRUE);

USE `admin_db`;
INSERT IGNORE INTO `tiers` (`id`, `code`, `name`, `description`, `price`, `duration_days`, `is_active`) 
VALUES 
(1, 'FREE', 'Gói Miễn Phí', 'Gói mặc định cho người dùng mới', 0.00, 3650, TRUE),
(2, 'PRO', 'Gói Pro', 'Nâng cao hạn mức và tính năng đặc quyền', 1000.00, 30, TRUE),
(3, 'VIP', 'Gói VIP', 'Không giới hạn tính năng và ưu tiên hỗ trợ 24/7', 2000.00, 30, TRUE);


