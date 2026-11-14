# Full-stack local Docker design

Run the backend and admin dashboard as a Compose stack. Flutter remains a native mobile client. Use the Spring gateway by default; the alternative Nest gateway must not compete for port 8080.

| Service | Host port | Container port |
| --- | --- | --- |
| Spring gateway | 8080 | 8080 |
| Auth | 8000 | 8000 |
| User | 8081 | 8081 |
| Admin | 8086 | 8086 |
| Payment | 8085 | 8085 |
| Post | 8087 | 8087 |
| Admin dashboard | 3005 | 3000 |
| PostgreSQL IAM | 5433 | 5432 |
| PostgreSQL posts | 5434 | 5432 |
| MySQL | 3307 | 3306 |
| Redis | 6379 | 6379 |
| Kafka external | 9092 | 9092 |
| Kafka UI | 9080 | 9080 |

Use service DNS names for container-to-container communication and internal ports: db:5432, post-db:5432, mysql:3306, redis:6379, kafka:19092. Host/browser requests use localhost and published ports. Android emulator uses 10.0.2.2:8080. Bind published ports to loopback by default; physical-device LAN access is an explicit configuration override.

Preserve the existing infrastructure Compose configuration; add a dedicated full-stack Compose file with a separate project name and named persistent volumes. Reuse available postgres:16-alpine, redis:8-alpine and apache/kafka:4.1.1 images for this local stack. Pull missing MySQL, Java build/runtime, Node and Kafka UI images. MongoDB is not required by the current services.

Build Spring services with Java 21 multi-stage images. Build Nest services from the pnpm workspace, including libs/common and native argon2 dependencies. Build the Next dashboard with its browser API URL pointing to port 8080. Exclude .env, secrets, node_modules, build outputs and Git metadata from Docker build contexts. Mount required JWT keys read-only at runtime; do not bake keys or PayOS credentials into images.

Use environment configuration for credentials. Do not overwrite existing secrets. Resolve initial PostgreSQL roles/databases, run Auth/User migrations before application startup, and initialize a separate post database. Correct the MySQL bootstrap ordering so admin_db.tiers exists before seed inserts. Use dependency health checks and startup ordering; retain data on ordinary stop/restart.

Verification: validate rendered Compose without printing secrets; build images; start stack; inspect health/logs; check gateway routes and post creation/deletion; verify dashboard response. PayOS external payment/webhook verification requires valid credentials and a public callback and is outside the local container smoke test. Document startup, shutdown, ports, mobile access and destructive volume-reset behavior.
