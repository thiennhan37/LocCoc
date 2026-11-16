# Moment service

NestJS authority for the current user's private photos. Controller -> service ->
repository/DTO boundaries, independent PostgreSQL database, private S3 storage,
durable job leases and live JWT/account-authority checks on every public route.

Build with `pnpm --filter @loccoc/common build` then
`pnpm --filter moment-service build`. Configure `.env` from `.env.example`, apply
the additive migration with `pnpm --filter moment-service db:migrate`, and run
`pnpm --filter moment-service start`. Runtime flag `MOMENTS_ENABLED` defaults false.

See [operations](../docs/specs/moments/operations.md) for credentials, storage,
API contracts, verification, retry/recovery and rollback. `node
scripts/verify-moments.mjs` from the repository root uses disposable dependencies
and a deterministic AI provider; it never calls Gemini or modifies existing data.
