# Home photo gallery

Add a four-square grid button at the lower left of the main home's post area, visible only after leaving camera page zero. Open a dark three-column gallery of accessible photos, sorted by creation time descending, with All, Friends and Mine filters. Friends means all other accessible authors; Mine matches the session user ID. Tap a thumbnail to view the image and caption. Back returns to the prior home page. Keep the personal memories calendar unchanged.

Reuse authenticated FeedApi and follow every cursor before publishing the sorted snapshot: feed priority order is not chronological. Refresh replaces a complete snapshot, errors retain previous results with retry, disposal/overlapping requests ignore stale responses. No API changes or dependencies. All-page loading costs more for large accounts; server-side chronological query is a future optimization. A first-page-only grid is rejected because filters would miss photos.
