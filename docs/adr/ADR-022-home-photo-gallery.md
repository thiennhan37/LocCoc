# ADR-022: Home photo gallery

2026-11-17: Add a separate route and controller for the home photo grid. Read the existing authorized feed through all pages and sort explicitly; avoid changing the prioritized home pager or the personal calendar. Filter by owner ID locally. This adds no API contract but requires reading the accessible history on refresh. Grid thumbnails never mark posts as seen.
