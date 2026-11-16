# Running AI, Moments, posts and chat together

Current allocation: [ADR-017](../adr/ADR-017-merge-moments-with-main.md), 2026-11-16.

| Service directory | Default port | Gateway variable | Gateway route |
| --- | --- | --- | --- |
| `ai-enhancement-service` (NestJS image filters) | 8082 | AI_SERVICE_URL | /ai/* |
| `chat-service` | 8083 | CHAT_SERVICE_URL | /chat/* |
| `ai-service` (Python embeddings/search) | 8087 | None | Internal only |
| `moment-service` | 8088 | MOMENT_SERVICE_URL | /moments and /moments/* |
| `post-service` | 8089 | POST_SERVICE_URL | /posts and /posts/* |

Python is called only by MomentService with a service token and a signed actor
capability. No /ai-search route is enabled. The old experimental ai-service-2 and
AI_SEARCH_SERVICE_URL reservation are superseded by ADR-016/017.

From the root, `pnpm start:ai` starts Python on Windows; `pnpm dev:ai-enhancement`
(or `pnpm dev:ai`) starts image enhancement. `pnpm start:moment` and
`pnpm start:chat` retain their independent Node runtimes.

Ignored .env files and live processes are preserved. If an existing Post env uses
8087, explicitly set POST_PORT=8089 and matching POST_SERVICE_URL in each gateway
env before running it alongside Python. Image enhancement reads root .env;
Python reads ai-service/.env and uses its dedicated GEMINI_EMBEDDING_API_KEY only.
