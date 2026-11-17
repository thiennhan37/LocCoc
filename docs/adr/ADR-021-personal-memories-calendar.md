# ADR-021: Personal memories calendar

Accepted 2026-11-17. Reuse the authenticated feed contract in Flutter with an independent controller, fetching pages and retaining only the signed-in owner's posts. This preserves gateway and service boundaries without new APIs. Group by local date and sort explicitly by creation timestamp. Cost: all accessible feed pages must be read on refresh; a server-side own-post query may be warranted at scale. Never show another owner's posts or hardcoded sample memories.
