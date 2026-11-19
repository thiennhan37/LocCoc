# ADR-023: Home author filtering

2026-11-17: Use the existing friends endpoint for author choices and a client FeedApi adapter for filtering. A filtered request walks past pages without a match to avoid false empty states; the feed controller's generation guard rejects stale refresh responses. All-friends retains the existing combined authorized audience, including self, as shown in the reference. Cost: sparse authors can require several feed requests. No new API or database changes.
