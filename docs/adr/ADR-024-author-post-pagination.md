# ADR-024: Indexed author post pagination

Status: Accepted for the requested author lookup and mobile incremental loading.

Use server-side author filtering and chronological keyset pagination on the
existing feed endpoint. Preserve audience authorization and the unfiltered feed.
Index owner, deletion state, timestamp and UUID to match author traversal.
Mobile requests ten posts per author page and reuses its scroll-triggered loader.
This avoids scanning the global feed and avoids offset drift on new posts.
