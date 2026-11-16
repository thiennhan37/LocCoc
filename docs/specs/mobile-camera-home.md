# Camera-first mobile Home

Home opens the camera immediately after authenticated entry, on a black background. Use the supplied Locket reference: friends pill and avatar above a rounded square preview, flash overlay, gallery/shutter/flip controls, and History below. Keep existing four destinations in a dark rounded navigation bar. Move the existing “Một chút hôm nay” section to Friends; its current story entries remain placeholders. History opens the existing vertical one-post feed.

Reuse CaptureMomentScreen and PhotoEditorScreen with the current authenticated UserApiClient. Gallery uses the existing bounded image picker. Release camera on hidden tabs, covered routes, editing, gallery selection, background, and logout. Resume only when visible and active. Permission errors retain gallery access and a retry action. Do not change backend storage or authentication.

Verify entry, tab/route/background lifecycle, gallery cancel/selection, authenticated editor handoff, post refresh and compact layouts.

## Follow-up: inline feed and all tabs dark
Home is one vertical pager: camera first, then one post per page, including own and friends posts from the existing feed API. History advances this pager rather than opening a route. Returning to camera reactivates it; paging away suspends it. Preserve feed pagination, refresh and viewed-state tracking. All four tabs use a scoped dark theme with black scaffold backgrounds, dark cards and readable foregrounds; login and other independent routes retain their themes.
