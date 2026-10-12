# AI-First Software Engineering Workflow

## 1. Mục tiêu

AI-first không có nghĩa là "để AI code tất cả".

Mục tiêu là thiết kế toàn bộ vòng đời phát triển phần mềm để AI trở thành một thành phần kỹ thuật xuyên suốt:

```text
Product Idea
    ↓
Requirements
    ↓
Domain Analysis
    ↓
Architecture
    ↓
Technical Specification
    ↓
AI Implementation
    ↓
Automated Testing
    ↓
AI Review
    ↓
CI/CD
    ↓
Observability
    ↓
AI-assisted Maintenance
    ↓
Feedback → Product
```

Nguyên tắc cốt lõi:

> Human owns decisions.  
> AI owns execution.  
> Automation owns verification.

---

# 2. Tổng quan quy trình

```text
                    PRODUCT IDEA
                         │
                         ▼
                ┌─────────────────┐
                │  Product Spec   │
                │ PRD / User Flow │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │ Domain Analysis │
                │ Bounded Context │
                │ Service Boundary│
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │ Architecture    │
                │ ADR / C4 / ERD  │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │ Technical Spec  │
                │ API / DB / Event│
                └────────┬────────┘
                         │
                         ▼
             ┌────────────────────────┐
             │     AI IMPLEMENTATION  │
             │                        │
             │ Agent → Subagents      │
             │ Context → Skills       │
             │ Tools → MCP            │
             └───────────┬────────────┘
                         │
                         ▼
                ┌─────────────────┐
                │ Automated Tests │
                │ Unit/Integration│
                │ E2E/Load        │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │ AI Code Review  │
                │ Security Review │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │ CI/CD           │
                │ Build → Deploy  │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │ Observability   │
                │ Logs/Metrics    │
                │ Tracing/Errors  │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │ AI Maintenance  │
                │ Analyze → Fix   │
                │ Optimize        │
                └─────────────────┘
```

---

# 3. Phase 0 — Chuẩn hóa AI Workspace

Trước khi viết feature đầu tiên, tạo một repository mà AI có thể hiểu được.

Ví dụ:

```text
project/
│
├── apps/
│   ├── api/
│   ├── web/
│   └── worker/
│
├── packages/
│   ├── config/
│   ├── database/
│   ├── logger/
│   ├── types/
│   └── shared/
│
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   ├── adr/
│   └── specs/
│
├── tests/
│
├── .ai/
│   ├── agents/
│   ├── skills/
│   ├── rules/
│   ├── workflows/
│   └── context/
│
├── AGENTS.md
├── ARCHITECTURE.md
├── CONTRIBUTING.md
├── DEVELOPMENT.md
└── README.md
```

Thay vì:

```text
AI → đọc vài file → đoán architecture → code
```

nên hướng tới:

```text
AI
 │
 ├── AGENTS.md
 ├── Architecture
 ├── Domain rules
 ├── Coding rules
 ├── API spec
 ├── Database spec
 └── Feature spec
       ↓
    Implement
```

AI càng có context có cấu trúc, output càng ổn định.

---

# 4. Phase 1 — Product Discovery

Không cho AI code ngay từ requirement thô.

AI trước tiên đóng vai Product Analyst.

Ví dụ:

> Tôi muốn làm hệ thống quản lý phòng trọ.

AI phân tích thành:

```text
Rental Management
│
├── User
│   ├── Admin
│   ├── Landlord
│   └── Tenant
│
├── Property
│   ├── Building
│   ├── Room
│   └── Asset
│
├── Contract
├── Invoice
├── Payment
└── Notification
```

Sau đó chuyển:

```text
Requirement
    ↓
User Story
    ↓
Acceptance Criteria
    ↓
Business Rules
    ↓
Edge Cases
```

Ví dụ:

```text
Feature:
Create Contract

Actor:
Landlord

Preconditions:
- User must own property
- Room must be available

Rules:
- Contract cannot overlap another active contract
- Deposit must be >= 0
- Start date < End date

Success:
Contract CREATED

Failure:
409 CONTRACT_OVERLAPPING
```

---

# 5. Phase 2 — Domain-first Architecture

Với Microservices, không nên bắt đầu bằng danh sách service theo database table.

Không nên:

```text
Admin Service
User Service
Room Service
Invoice Service
...
```

Nên bắt đầu bằng business capability / bounded context:

```text
Rental Management
│
├── Identity
├── Property Management
├── Contract Management
├── Billing
├── Payment
├── Notification
└── Reporting
```

Sau đó:

```text
Bounded Context
        ↓
Service
        ↓
Database
        ↓
API / Event
```

Ví dụ:

```text
Identity Service
    ↓
PostgreSQL

Property Service
    ↓
PostgreSQL

Contract Service
    ↓
PostgreSQL

Billing Service
    ↓
PostgreSQL
```

Nguyên tắc:

> Service boundary follows business boundary, not database tables.

---

# 6. Phase 3 — Architecture Decision Records

Mỗi quyết định kiến trúc quan trọng nên được ghi thành ADR.

Ví dụ:

```text
docs/adr/

ADR-001-microservices.md
ADR-002-postgresql.md
ADR-003-grpc.md
ADR-004-kafka.md
ADR-005-redis.md
ADR-006-authentication.md
```

Cấu trúc ADR:

```text
# ADR-004: Use Kafka for Domain Events

Status:
Accepted

Context:
Services need asynchronous communication.

Decision:
Kafka is used for domain events.

Why:
- High throughput
- Durable events
- Replay capability

Trade-offs:
- Operational complexity
- Eventual consistency

Rejected:
RabbitMQ for domain event streaming.
```

ADR tạo ra project memory để AI hiểu tại sao hệ thống được thiết kế như hiện tại.

---

# 7. Phase 4 — Technical Specification

Sau architecture mới tạo spec cho từng feature.

Ví dụ:

```text
docs/specs/contract/create-contract.md
```

Nội dung:

```text
# Create Contract

## Endpoint

POST /contracts

## Request

{
    tenantId,
    roomId,
    startDate,
    endDate,
    deposit
}

## Validation

tenantId → UUID
roomId → UUID
deposit >= 0

## Business Rules

BR-001
Room must be AVAILABLE

BR-002
Contract dates cannot overlap

BR-003
Only LANDLORD can create contract

## Transaction

1. Validate room
2. Check overlapping contract
3. Create contract
4. Update room status
5. Publish ContractCreated

## Events

ContractCreated
```

Khi spec đủ rõ, AI có thể implement gần deterministic hơn.

---

# 8. Phase 5 — Agent Architecture

Không nên dùng một agent khổng lồ để làm mọi thứ.

Nên chia theo trách nhiệm:

```text
                    ORCHESTRATOR
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   Architect          Backend           Frontend
     Agent             Agent              Agent
        │                │                │
        ▼                ▼                ▼
   DB Agent          Test Agent       UI Agent
                         │
                         ▼
                   Review Agent
                         │
                         ▼
                  Security Agent
```

Ví dụ task:

```text
Implement Create Contract
```

Orchestrator chia:

```text
Architect Agent
    ↓
Check architecture

Database Agent
    ↓
Schema / migration

Backend Agent
    ↓
Controller
Service
Repository
DTO

Test Agent
    ↓
Unit
Integration
E2E

Review Agent
    ↓
Review implementation
```

---

# 9. Context Engineering

Không nên đưa toàn bộ repository cho agent.

Dùng:

```text
Task
 ↓
Relevant Context
 ↓
Agent
```

Ví dụ backend agent:

```text
AGENTS.md

docs/specs/contract/create-contract.md

apps/contract-service/

packages/database/

docs/architecture/contract.md

ADR-003
ADR-007
```

Không cần đọc:

```text
frontend/
marketing/
unrelated-service/
```

Context tốt giúp giảm:

- Hallucination
- Sửa nhầm file
- Architecture drift
- Token usage
- Thời gian reasoning

---

# 10. Skills

Agent không nên phụ thuộc hoàn toàn vào prompt.

Tạo skill theo công nghệ:

```text
.ai/skills/

nestjs/
prisma/
postgres/
redis/
kafka/
grpc/
testing/
security/
docker/
```

Ví dụ:

```text
nestjs.skill.md

Rules:

- Strict TypeScript
- Dependency injection
- DTO validation
- No business logic in controller
- Use service layer
- Use Result/Error pattern
- Pino logging
```

Workflow:

```text
Task
 ↓
Load NestJS skill
 ↓
Implement
```

---

# 11. MCP và Tools

Agent hiện đại không chỉ đọc code mà còn sử dụng tools.

Có thể tích hợp:

```text
Agent
 │
 ├── Git
 ├── GitHub
 ├── PostgreSQL
 ├── Redis
 ├── Docker
 ├── Kubernetes
 ├── Browser
 ├── Jira / Linear
 ├── Sentry
 └── CI
```

Ví dụ debugging:

```text
Sentry
 ↓
Error
 ↓
Agent
 ↓
GitHub
 ↓
Inspect code
 ↓
Write fix
 ↓
Run test
 ↓
Create PR
```

---

# 12. Coding Workflow

Workflow chuẩn:

```text
Issue
 ↓
Spec
 ↓
Plan
 ↓
Implementation
 ↓
Test
 ↓
Review
 ↓
PR
```

Không nên:

```text
Prompt
 ↓
"Build this feature"
 ↓
5000 lines code
```

Agent nên tạo implementation plan trước:

```text
Implementation Plan

1. Modify Prisma schema
2. Create migration
3. Add ContractRepository
4. Add ContractService
5. Add DTO
6. Add Controller
7. Add domain event
8. Add tests
9. Update API docs
```

Sau khi plan được xác nhận mới implement.

---

# 13. Git Strategy cho AI

AI nên làm việc trên branch riêng:

```text
main
 │
 ├── feat/contract
 ├── feat/payment
 └── fix/invoice
```

Workflow:

```text
main
 ↓
Create branch
 ↓
Implement
 ↓
Test
 ↓
Commit
 ↓
Pull Request
 ↓
Review
 ↓
Merge
```

Không nên cho agent tự ý:

```text
git push origin main
```

Đặc biệt đối với production.

---

# 14. Test-first / Verification-first

AI có khả năng tạo code trông đúng nhưng logic sai.

Vì vậy verification phải là một phần bắt buộc.

```text
Implementation
 ↓
Unit Test
 ↓
Integration Test
 ↓
Contract Test
 ↓
E2E Test
 ↓
Load Test
 ↓
Security Test
```

Ví dụ Create Contract:

```text
Unit
 ├── validation
 ├── overlap detection
 └── permission

Integration
 ├── database
 └── transaction

E2E
 └── POST /contracts

Load
 └── concurrent requests
```

---

# 15. AI Code Review

Sau khi code xong:

```text
Developer Agent
       ↓
   Pull Request
       ↓
 ┌───────────────┐
 │ Review Agents │
 └───────────────┘
       │
       ├── Architecture
       ├── Security
       ├── Performance
       ├── Database
       ├── Testing
       └── Code Quality
```

Ví dụ Security Agent:

```text
Potential IDOR

GET /contracts/:id

Current:
Any authenticated user can access contract.

Expected:
Only landlord owner or tenant can access.
```

---

# 16. CI/CD

Pipeline:

```text
Pull Request
     │
     ▼
Lint
     │
     ▼
Type Check
     │
     ▼
Unit Test
     │
     ▼
Integration Test
     │
     ▼
Build
     │
     ▼
Security Scan
     │
     ▼
AI Review
     │
     ▼
Deploy Staging
     │
     ▼
E2E
     │
     ▼
Production
```

AI có thể tham gia:

- PR analysis
- Test generation
- Failure diagnosis
- Log analysis
- Release notes
- Incident response

---

# 17. Observability

Production nên có:

```text
Logs
Metrics
Traces
Errors
```

Ví dụ:

```text
Application
    │
    ├── Pino
    ├── OpenTelemetry
    └── Prometheus
          │
          ▼
       Grafana

Errors
    │
    ▼
   Sentry
```

AI có thể phân tích:

```text
Error
+
Trace
+
Logs
+
Recent deployment
+
Git diff
```

và đưa ra:

```text
Root cause:
Database connection pool exhausted.

Likely change:
Recent deployment / commit

Affected:
Billing Service

Recommendation:
Investigate transaction duration and connection pool usage.
```

---

# 18. Database phải AI-readable

Không chỉ code cần documentation.

Nên có:

```text
docs/database/

ERD.md
DATA-DICTIONARY.md
INDEXES.md
TRANSACTIONS.md
```

Ví dụ:

```text
Contract

id
tenant_id
room_id
start_date
end_date
deposit
status
```

Business invariant:

```text
ACTIVE contracts
cannot overlap
for the same room.
```

AI cần hiểu database theo business semantics, không chỉ column names.

---

# 19. API Contract

Nên chuẩn hóa API bằng:

```text
OpenAPI
```

hoặc:

```text
gRPC Proto
```

hoặc event schema.

Ví dụ:

```text
contract.proto
```

và:

```text
events/
    ContractCreated.avsc
    ContractTerminated.avsc
```

Từ contract có thể tự động hỗ trợ:

```text
Backend
Frontend client
Tests
Documentation
Mock
```

---

# 20. Event-driven Architecture

Với hệ thống lớn:

```text
Contract Service
      │
      │ ContractCreated
      ▼
    Kafka
      │
 ┌────┼──────────┐
 ▼    ▼          ▼
Billing Notification Analytics
```

AI có thể hỗ trợ kiểm tra:

```text
Producer schema
        ↓
Consumer compatibility
        ↓
Versioning
        ↓
Backward compatibility
```

---

# 21. AI trong Debugging

Workflow:

```text
Bug Report
    ↓
AI Triage
    ↓
Search Logs
    ↓
Search Code
    ↓
Search Git History
    ↓
Identify Root Cause
    ↓
Create Fix Plan
    ↓
Implement
    ↓
Regression Test
    ↓
Pull Request
```

Ví dụ:

```text
User:
Invoice is duplicated.

AI:
1. Search invoice creation
2. Inspect transaction
3. Inspect retry logic
4. Inspect idempotency
5. Inspect queue consumer
6. Reproduce
7. Fix
8. Add regression test
```

---

# 22. AI Documentation Loop

Documentation không nên làm vào cuối project.

Mỗi PR kiểm tra:

```text
Code Change
 ↓
API change?
 ↓
DB change?
 ↓
Architecture change?
 ↓
Update docs
```

AI có thể phát hiện:

```text
API endpoint changed
but OpenAPI is outdated.
```

---

# 23. AI Project Memory

Project lớn cần persistent memory.

Ví dụ:

```text
.ai/context/

architecture.md
business-rules.md
decisions.md
known-issues.md
common-patterns.md
anti-patterns.md
```

Sau nhiều tháng:

```text
New Agent
     ↓
Read Project Memory
     ↓
Understand Architecture
     ↓
Work Consistently
```

Mục tiêu là tránh:

> Agent A code một kiểu, Agent B code một kiểu.

---

# 24. Feature Workflow hoàn chỉnh

Ví dụ:

> Thêm chức năng thanh toán hóa đơn.

AI-first workflow:

```text
1. User Requirement
        ↓
2. Product Agent
        ↓
3. Feature Spec
        ↓
4. Architecture Agent
        ↓
5. ADR nếu cần
        ↓
6. DB Agent
        ↓
7. API Contract
        ↓
8. Backend Agent
        ↓
9. Frontend Agent
        ↓
10. Test Agent
        ↓
11. Security Agent
        ↓
12. Review Agent
        ↓
13. CI
        ↓
14. Staging
        ↓
15. E2E
        ↓
16. Production
        ↓
17. Observability
        ↓
18. AI Monitoring
```

---

# 25. Recommended Modern Stack

## Development

```text
VS Code / Cursor / Antigravity
        +
AI Coding Agent
        +
GitHub
```

## Monorepo

```text
Turborepo
pnpm
```

## Backend

```text
NestJS
TypeScript
Prisma
PostgreSQL
Redis
Kafka / RabbitMQ
gRPC
```

## Frontend

```text
Next.js
React
Tailwind CSS
TanStack Query
```

## API

```text
REST
OpenAPI
gRPC
```

## Testing

```text
Vitest / Jest
Supertest
Playwright
k6
```

## Infrastructure

```text
Docker
Docker Compose
GitHub Actions
Nginx
```

## Observability

```text
OpenTelemetry
Prometheus
Grafana
Sentry
Pino
```

## AI Engineering

```text
Coding Agent
        +
Subagents
        +
MCP
        +
Skills
        +
Project Memory
        +
AI Code Review
        +
AI Debugging
```

---

# 26. AI-native Software Engineering

Có thể nâng architecture lên mức:

```text
                    HUMAN
                      │
                      ▼
                PRODUCT AGENT
                      │
                      ▼
              ARCHITECT AGENT
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
      Backend       Frontend     Data
       Agent         Agent       Agent
          │           │           │
          └───────────┼───────────┘
                      ▼
                  TEST AGENT
                      │
                      ▼
                SECURITY AGENT
                      │
                      ▼
                 REVIEW AGENT
                      │
                      ▼
                 CI/CD AGENT
                      │
                      ▼
              OBSERVABILITY AGENT
                      │
                      ▼
              PRODUCTION SYSTEM
                      │
                      ▼
                FEEDBACK LOOP
                      │
                      └──────────────► PRODUCT AGENT
```

Khi đó project trở thành một **closed-loop engineering system**:

```text
Requirement
    ↓
Design
    ↓
Build
    ↓
Test
    ↓
Deploy
    ↓
Observe
    ↓
Learn
    ↓
Improve
    ↓
Build next version
```

---

# 27. Nguyên tắc cuối cùng

Không xây:

```text
AI-first
=
AI làm tất cả
```

Mà xây:

```text
Human
  │
  │ defines
  ▼
Intent / Requirements
  │
  ▼
AI
  │
  │ generates
  ▼
Plan / Code / Tests
  │
  ▼
Automated Verification
  │
  ▼
Human Approval
  │
  ▼
Production
```

Ba nguyên tắc:

1. **Human owns decisions**
2. **AI owns execution**
3. **Automation owns verification**

Đây là nền tảng để xây một quy trình phát triển phần mềm AI-first hiện đại, có khả năng mở rộng từ project cá nhân đến hệ thống production lớn.
