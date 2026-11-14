# ADR-015: Separate Gemini filtering and Python semantic search

Date: 2026-11-14. Status: accepted by the user during the main merge into
feature/friend-suggestions.

The feature branch and main used AI_SERVICE_URL and /ai for different services.
Python AI2 also defaulted to port 8087, which main now uses for post-service.

Gemini image filtering retains AI_SERVICE_URL, port 8082 and /ai/* through the
Nest Gateway. Post-service retains port 8087. Python ai-service-2 uses port 8088
and the separate AI_SEARCH_SERVICE_URL configuration variable.

AI2 is **not routed through the Gateway in this merge**. The user explicitly
deferred /ai-search/* after reviewing that its indexing/search endpoints trust
the caller's user_id. A later change must enforce verified identity and resource
ownership before exposing those endpoints. Gateway authentication alone does
not establish ownership of the user_id supplied in the request body.

Only code defaults, example configuration and documentation change here; existing
ignored .env files and live services are not modified. Existing local PORT or
AI_SERVICE_URL overrides must be adjusted by the developer when running the
services together. See ../specs/ai-services-coexistence.md.
