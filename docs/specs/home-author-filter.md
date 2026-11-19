# Home author picker

Move the gallery shortcut from the bottom of home to the top-left horn position. Replace the home friends-management button with a dark rounded author menu: All friends (the existing accessible feed including self, matching the reference), each actual friend with avatar/name, and You. Selecting a person filters home posts by owner ID; switching resets the pager to camera to avoid stale indexes. Query the real paginated friends list, including friends without posts, with retry/load-more states. Preserve the gallery's existing All/Friends/Mine filters and personal calendar. Friend management remains on its dedicated tab.

The FeedApi adapter sends ownerId to the existing feed endpoint and requests ten
posts at a time; it no longer scans global pages locally. Selected-author pages
are chronological and load more near the end of the vertical pager. Server-side
authorization is checked for every page. See `author-post-pagination.md` and
ADR-024 for the indexed keyset query. No new endpoint or dependencies. Test
name/avatar rows, pagination, selected-owner filtering and gallery entry location.
