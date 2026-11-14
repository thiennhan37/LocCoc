# Running the two AI services alongside posts

Decision: [ADR-015](../adr/ADR-015-separate-ai-services.md), confirmed 2026-11-14.

| Service | Default port | Gateway variable | Gateway route |
| --- | --- | --- | --- |
| Gemini image filtering (ai-service) | 8082 | AI_SERVICE_URL | /ai/* |
| Photo posts (post-service) | 8087 | POST_SERVICE_URL | /posts and /posts/* |
| Python embedding/search (ai-service-2) | 8088 | AI_SEARCH_SERVICE_URL (reserved) | None in this merge |

The Python service keeps its direct /api/v1/* API and /docs on port 8088. Its
example environment, documented uvicorn command and search script use this port.
AI_SEARCH_SERVICE_URL is a distinct validated Gateway configuration value reserved
for the future integration; it does not create a route by itself.

Do not point AI_SERVICE_URL at the Python service: that variable belongs to Gemini.
The user deferred /ai-search/* until AI2 verifies identity and ownership instead
of trusting request user_id. Its direct API remains a development interface and
was not deployed or exercised against live user data during this merge.

Ignored environment files are preserved. Existing PORT=8087 in an AI2 environment
will still override the new default; use PORT=8088 for simultaneous local runs.
