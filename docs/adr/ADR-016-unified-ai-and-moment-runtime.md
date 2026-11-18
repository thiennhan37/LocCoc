> Historical runtime document: the Nest Moments deployment is superseded by [Java Post/Moments](../specs/unified-post-moments.md).

# ADR-016: Unified AI service and durable moment search runtime

Date: 2026-11-14. Status: runtime implemented, tested and activated locally after
user approval; production gates remain open. Evidence: [runtime report](../specs/moments/reports/2026-11-14-runtime.md).

User decision: consolidate `ai-service-2` into `ai-service`, remove the local
embedding provider completely, and implement Gemini-backed smart moment search.
This supersedes the directory choice in ADR-015; its ownership/privacy contracts
still apply. Existing ignored `.env` files are not overwritten.

## Runtime decisions

- `ai-service` is the only Python AI runtime. Gemini Embedding 2, 768 dimensions,
  a dedicated versioned cosine collection, async SDK/Qdrant and Redis quota gates.
  No public embed/index route, URL fetch, local model, GPU dependency or raw vector
  response. Service authentication plus short-lived audience/operation/owner-bound
  signed actor capabilities protect all AI operations.
- New NestJS `moment-service` owns a separate PostgreSQL database and private S3
  bucket. JWT and live AuthService authority protect every public operation.
  `/moments` is routed by both gateways; the legacy public `/ai` route is removed.
- The first runtime uses a transactional PostgreSQL job/outbox table and bounded
  polling worker colocated with MomentService. `FOR UPDATE SKIP LOCKED`, expiring
  leases, compare-and-set completion, bounded retries and retained failed jobs
  provide durable delivery without a cross-service callback protocol. This is an
  intentional simplification of ADR-015's proposed Kafka/AI-worker topology;
  Kafka transport can be added later without changing metadata or API authority.
  AI never reads another service's database or object-store credentials.
- Upload stores an immutable, validated, orientation-corrected JPEG derivative
  with metadata removed; activate + index job commit together. Index failure does
  not roll back the uploaded image. Deletion commits a tombstone + cleanup job
  before external cleanup. Search hydration always checks current owner/lifecycle
  and version in PostgreSQL. Stale or orphan vectors never grant image access.
- Search fuses bounded metadata/vector candidates with RRF; explicit date/place/
  album filters remain authoritative. Provider failures return a visible
  metadata-only mode, or 503 when semantic results are required.
- UI remains behind explicit build/runtime feature flags. Live API quality/load,
  quota, budget and provider data terms are separate acceptance gates; deterministic
  transport tests do not close them.

## Verification work

1. Provider/auth/vector/input/collection/quota regression tests (F01–F15).
2. Moment upload/job/retry/delete/filter/final ACL and gateway tests.
3. Flutter upload/search/pending/failure/fallback/session handling.
4. Isolated integration checks, dependency builds, rollout/runbook and honest
   status report. No changes to existing databases, collections, buckets or secrets.
