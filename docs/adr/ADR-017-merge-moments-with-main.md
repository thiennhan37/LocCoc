# ADR-017: Preserve Moments and main service boundaries during merge

Date: 2026-11-16. Status: accepted for the conflict resolution.

Both branches independently introduced `ai-service`: Python internal semantic
search on the feature branch and NestJS image enhancement on main. Keeping both
runtimes in one directory would mix dependencies, commands and environment files.
Main also assigned Post port 8087, already used by the feature's Python runtime.

Retain Python `ai-service` and the existing ignored configuration/virtualenv paths.
Move main's NestJS source, OpenAPI and tests into `ai-enhancement-service` with a
matching pnpm package name. Its `/ai/*` route and `AI_SERVICE_URL` remain on 8082.
Python remains internal on 8087; MomentService on 8088 owns `/moments`, verified
identity and final ACL. Do not restore the removed `ai-service-2` or its bytecode.
The obsolete reserved `AI_SEARCH_SERVICE_URL` is removed from gateway validation.

Move the new Post default and both gateway defaults to 8089. Existing ignored
environments are not rewritten; a developer running Post with old overrides must
set `POST_PORT=8089` and `POST_SERVICE_URL=http://127.0.0.1:8089` together.
This supersedes ADR-015's directory/port allocation; ADR-016's Moments contracts
remain authoritative. Chat retains its database, HTTP route and socket setup.

Preserve main's raw streaming image proxy and shared header filtering, plus the
feature's scoped Moments routes, upload bounds, rate limits and capability-header
stripping. Internal AI endpoints are not forwarded through the public image API.
Preserve camera/photo publishing on the home screen and opt-in Moments search /
upload in the memories tab. Password replacement combines both branches' checks.

Verify workspace builds, Gateway routing/streaming tests, Moments and AI tests,
Flutter analyzer/tests, Spring Gateway tests and Compose configuration. No live
Gemini, PayOS, database migration or existing-process restart is part of this merge.
