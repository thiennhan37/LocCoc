# ADR-017: Camera-first mobile Home

Status: Accepted for the requested mobile redesign.

Embed the existing capture screen in authenticated Home instead of maintaining a second camera controller. Preserve four navigation destinations; move stories to Friends and expose feed through History. Reuse existing picker and editor, including JWT session propagation. Camera ownership remains in capture screen with visibility and lifecycle checks. This avoids duplicating native camera and upload state.

Follow-up: Home uses a single vertical pager with camera as its first page and existing feed cards after it. This avoids nested feed paging and makes History a shortcut within Home. All four home tabs share a scoped dark theme; independent authentication routes are unchanged.
