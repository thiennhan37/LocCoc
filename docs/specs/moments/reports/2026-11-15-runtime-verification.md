# Local runtime verification — 2026-11-15

User scope: run and verify Moments (confirmed as the intended “post-service”),
AI and chat, minimizing real AI API requests. No application source changes,
branch merge, secret edits or production deployment were made.

## Current checkout: Moments and unified Python AI

Current branch: `feature/smartly-seeking-moments`. Existing changes were retained.
The `.agents/rules`, `.agents/skills` and `.agents/workflows` directories referenced
by AGENTS.md are absent in this checkout; available source, specs, migrations and
test contracts were inspected instead.

| Verification | Result |
| --- | --- |
| AI `python -m pytest -q` | 32 passed |
| AI `ruff check app tests integration scripts` | Passed |
| Common and MomentService TypeScript builds | Passed |
| MomentService unit tests | 13 passed |
| `node scripts/verify-moments.mjs` | 10 integration tests + 1 Redis quota concurrency test passed |
| Gateway `test/moment-routing.e2e-spec.ts` | 2 passed |
| Local Gateway → real Auth/JWT → Moments → private S3 → Gemini → Qdrant | Passed |

The isolated integration runner used disposable PostgreSQL, Redis, Qdrant and S3
containers with a deterministic provider: **zero Gemini requests**. Its containers
were removed on completion. The Python unit suite emits one expected warning
about payload indexes in embedded/local Qdrant; server Qdrant was additionally
covered by the integration runner.

### Live acceptance

Executed once:

```powershell
node scripts/verify-moments-local-live.mjs --live
```

Exactly **2 additional dedicated embedding API reservations** were observed:
one generated image embedding and one Vietnamese text query. No separate smoke,
canary or retry was performed. Only `GEMINI_EMBEDDING_API_KEY` was used; the legacy
key was not used. Cost in currency was not measured.

The live test verified:

- Real login/JWT sessions for two synthetic accounts.
- Rejection of missing authentication and client-supplied ownership.
- Private upload, durable indexing job and successful background indexing.
- Rejection of cross-account image read and delete.
- Semantic query retrieval through Gateway and final ownership checks.
- Authenticated owner image download.
- Immediate access revocation after deletion and completed external cleanup.

Fixture accounts were tombstoned through Auth's internal deletion authority.
The live report has `passed: true`, `additionalProviderReservations: 2` and no
pending fixture-cleanup flag:
`logs/moments-local/live-verification-07240d57-93db-422b-9c66-78d7849db042.json`.

Existing historical request counts are recorded in PROJECT_CONTEXT.md. This run
adds 2 dedicated-key requests: the recorded cumulative totals become legacy key
2 / dedicated key 6, or 8 requests overall, assuming no activity outside these
documented runs. This is not an account-wide usage/billing audit.

### Running processes

Started with the existing `scripts/start-moments-local.ps1`, using existing ignored
environment files. Services remain running after verification:

| Service | Local address | Evidence |
| --- | --- | --- |
| Auth | `127.0.0.1:8000` | Successful login, JWT and fixture account deletion |
| Gateway | `127.0.0.1:8080` | `GET /health` 200 and live routing |
| AI | `127.0.0.1:8087` | `GET /health/live` 200; signed readiness 200 after live test |
| Moments | `127.0.0.1:8088` | `GET /health/live` 200 and full live lifecycle |

AI readiness without service/actor credentials returned 401. AI readiness needs
a provider success within five minutes; it is intentionally not kept green by
periodic billable probes. Auth and Moments do not expose `GET /health`; their 404
responses there are not service failures. Moments liveness is `/health/live`.

PostgreSQL, Redis, Kafka and Qdrant containers reported healthy; S3 was running and
passed real upload/download/delete checks. A single `TimeoutNegativeWarning`
appeared in MomentService stderr. No test or lifecycle failure accompanied it;
its origin was not traced or repaired in this verification.

## Chat: separate branch verification

The current checkout has no tracked chat source/package/configuration, only old
ignored build output and dependencies. Its Gateway has no `/chat` route.
The complete chat source was located on local branch `chat-service`, commit
`e96410ad5cfe36c45d86f736dddbca5e6480d07d`.

A `git archive` snapshot was extracted to
`.codex-output/service-verification-2026-11-15/snapshot` without checking out or
merging that branch. Dependencies were installed from its frozen lockfile in that
snapshot. The following checks passed:

| Verification | Result |
| --- | --- |
| Snapshot common, chat and Gateway builds | Passed |
| Chat environment tests | 5 passed |
| Chat HTTP, PostgreSQL and Socket.IO suites | 27 passed, none skipped |
| Snapshot Gateway chat/posts routing suites | 6 passed |

Chat tests used a disposable PostgreSQL container, real HTTP servers and real
Socket.IO clients. They covered concurrent conversation opening, send retry
idempotency, conflicting UUID reuse, membership/IDOR, unread/read cursors,
pagination, reconnect persistence, realtime committed messages, offline recovery,
unfriend/revoked-session rejection and rate limits. Auth and User policy responses
were fixture implementations in these suites: this does **not** establish a
live deployment with the project's real Auth/User services.

**Chat is verified on that branch, but is not integrated or left running in the
current checkout.** A combined current-branch Moments + AI + chat acceptance
cannot be claimed until chat is integrated with the current Gateway/runtime.

## Additional historical PostService checks

Before the user clarified the term “post-service”, the Java PostService on the
same archived branch was also checked: 15 Maven tests passed. Its real packaged
runtime was tested against disposable PostgreSQL via the snapshot Gateway on
ports 18087/18080: create/validation/wrong-owner rejection/idempotent soft delete,
PNG upload/read, retry/conflict handling, image access revocation and SQL state
all passed. The initial image byte-equality assertion was corrected to compare
decoded pixels because the service deliberately re-encodes PNGs and strips
metadata. A stale Java launcher child was stopped; the runner now invokes the JVM
directly and stops its process tree. The final rerun passed and removed its
container/processes.

Local evidence: `.codex-output/service-verification-2026-11-15/isolated-report.json`;
runner: `.codex-output/service-verification-2026-11-15/verify-isolated.mjs`.
PostService is additional coverage, not the user's confirmed Moments target.
Its default 8087 conflicts with unified AI's 8087; the isolated override avoided
that collision. Its documented unauthenticated ownerId contract remains a
development limitation; no production acceptance is claimed.
