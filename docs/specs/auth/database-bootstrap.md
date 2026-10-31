# Initial PostgreSQL schema bootstrap

Docker creates the accounts/users databases and service roles on a fresh volume; TypeORM migrations create their tables. Environment validation defaults TYPEORM_MIGRATIONS_RUN to false, so first startup intentionally does not provision tables. Add explicit db:migrate commands for auth and user services that reuse their migration lists, register their entities, enable migrations, disable SQL logging and never enable synchronize. The runner must close its application context, return a nonzero exit code on failure, and avoid logging credentials. Repeated runs apply only pending migrations via TypeORM's migration history. No volume deletion, secret changes or new API endpoints.

Verification: test explicit migration configuration with the normal startup flag disabled; build services and run existing authentication tests. If Docker is available, inspect tables and execute pending migrations; otherwise document the remaining local command.
