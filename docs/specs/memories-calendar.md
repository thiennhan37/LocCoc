# Personal memories calendar

Replace the main Flutter home's sample memories with a dark monthly calendar inspired by the supplied reference. The user confirmed that only their own posts appear. Each day uses its newest post as the thumbnail; tapping opens all that day's posts newest first. Group timestamps using device local dates. Highlight today, show empty past days as dots and future days as muted tiles. Display months newest first, including empty intervening months, with pull-to-refresh, loading, error/retry and empty states.

Use the existing authenticated, paginated feed and filter by session user ID. Follow every cursor; do not assume feed order is chronological (it prioritizes recent own posts). Keep memory loading independent of home feed pagination. No new dependencies, endpoints or secrets. A dedicated own-post endpoint is a future optimization for large feeds; filtering just the first feed page is rejected because it misses older posts.
