# ADR-002: Dual Database Strategy (PostgreSQL & MySQL)

## Status
Accepted

## Context
Hệ thống **LocCoc IAM & Subscription Platform** bao gồm cả các module kế thừa (Legacy / Base IAM viết bằng NestJS: `auth-service`, `user-service`) và các module mở rộng cấp doanh nghiệp (`admin-service`, `payment-service` viết bằng Java Spring Boot 3).
- `auth-service` và `user-service` đã sử dụng PostgreSQL 17 để lưu trữ Account, Profile, Identity và Refresh Token.
- `admin-service` và `payment-service` được thiết kế độc lập để quản lý Tier Catalog, User Subscriptions, Audit Logs và Transaction Ledger với yêu cầu ACID cao trên MySQL 8.0.

## Decision
Áp dụng chiến lược **Dual Database (Database-per-Service)**:
1. **PostgreSQL 17** (`loccoc-db`, Port: `5433` / Internal `5432`): Phục vụ riêng cho `auth-service` và `user-service` (`auth_db`, `user_db`).
2. **MySQL 8.0** (`loccoc-mysql`, Port: `3307` / Internal `3306`): Phục vụ riêng cho `admin-service` (`admin_db`) và `payment-service` (`payment_db`).
3. **Không chia sẻ database trực tiếp giữa các service**: Mọi giao tiếp giữa Auth/User và Admin/Payment thực hiện qua HTTP API Gateway hoặc Kafka Message Broker.

## Consequences
- **Ưu điểm:**
  - Độc lập dữ liệu (Data Isolation), giảm coupling giữa các microservices.
  - Phù hợp với năng lực tối ưu hóa và ORM riêng của từng công nghệ (TypeORM/Prisma trên NestJS, Hibernate/JPA trên Spring Boot).
  - Tối ưu hóa backup và scale riêng biệt theo tải nghiệp vụ (Payment/Admin vs IAM).
- **Nhược điểm & Thách thức:**
  - Không thể dùng Foreign Key qua lại giữa các database khác loại.
  - Tính nhất quán cuối cùng (Eventual Consistency) dựa trên Kafka Events (`subscription.events`, `payment.events`).
