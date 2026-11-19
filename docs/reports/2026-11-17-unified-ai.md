# Unified Python AI verification — 2026-11-17

Branch: `feature/smartly-seeking-moments`. Image editing previously implemented
by NhanTr in Nest `ai-enhancement-service` is ported to Python
`ai-service/app/enhancement`. Original diary/sticker prompt strings were compared
against Git and preserved byte-for-byte. The separate Nest runtime is removed
from source/workspace/start scripts. Local ignored files are archived under
`logs/retired-ai-enhancement-*`, preserving recovery data.

## Behavior and deployment

One Python process on 8087 serves enhancement and internal embeddings/search.
Gateway keeps `/ai/images/enhance`, forwards multipart bytes and injects its
configured service token after removing client credentials. Python authenticates
before parsing; internal semantic endpoints still require their additional
Post-issued actor capability. Current enhancement MVP is public at Gateway
with IP rate limiting; account-based authorization is not introduced by this merge.

Enhancement has separate enable/key/model and fail-closed Redis budgets. It
handles input/output byte limits, full decoding, MIME, pixel limits and actual
sticker transparency. Whole-request deadline covers upload through generation;
client disconnect cancels the provider coroutine. Gemini retries and automatic
continuations are disabled. Provider output URLs are rejected. No persistent
image/business record is created; multipart temporary spools are request-scoped.

No local secret file was edited. Existing deployment must configure
`api-gateway/.env` AI_SERVICE_URL=8087 and AI_SERVICE_TOKEN, configure image
key/model in `ai-service/.env` (the former Nest runtime read root .env), explicitly
enable generation and set budgets. Defaults remain disabled/zero. See
[deployment guide](../specs/unified-ai.md) and [ADR-020](../adr/ADR-020-unified-python-ai.md).

## Evidence

| Check | Result |
| --- | --- |
| Python unit/API/provider transport tests | 86 passed |
| Ruff and pip check | Passed |
| Nest Gateway E2E | 54 passed; includes original streaming/disconnect/rate-limit tests and new credential/routing checks |
| Workspace backend build | Passed after removing Node enhancement package |
| Real Gateway HTTP -> Python -> Redis -> deterministic image fixture | Both diary and sticker passed; unauthenticated direct calls rejected; internal Gateway paths rejected |
| Existing Java/PostgreSQL/S3/Qdrant suite against the same Python fixture | Passed; production SQL applied twice; semantic owner/version behavior retained |
| Docker image | Built; offline non-root multipart/sticker smoke test passed without secret mounts |
| Compose / OpenAPI | Compose validated; public OpenAPI YAML parsed; scripts syntax-checked |
| Prompt fidelity | Both original strings identical to Git source |

Additional regressions verify duplicate/unknown multipart fields, MIME spoofing,
truncated/oversized images, decoded pixel bound, opaque stickers, service
credentials, disabled mode, Redis failure, no quota refund/retry after ambiguity,
upload timeout, client cancellation and independent failure of image/semantic
providers. SDK HTTP transport tests exercise actual serialization with mocked
network responses; no live Gemini call was made.

Logs: ignored `logs/ai-unification-*`. Isolated test containers were removed.
Personal databases/images and existing running application deployments were not
migrated/restarted. Full Flutter/Spring Gateway suites were not rerun because
this merge does not change their code/contracts; Spring's missing AI proxy route
remains a separate parity task.
