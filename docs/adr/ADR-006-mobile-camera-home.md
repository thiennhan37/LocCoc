# ADR-006: Camera-first mobile home

Status: Accepted for the standalone home UI, 2026-10-21.

Use Flutter's camera plugin for foreground photo preview and capture. Keep native
camera ownership in a separate ChangeNotifier session with serialized operations
and lifecycle cleanup. Do not request microphone access; capture is photo-only.
Photos stay in local temporary storage/memory; no upload or fake delivery status.

Keep the unfinished login unchanged. Register `/home` for future successful-login
navigation, and provide `--dart-define=PREVIEW_HOME=true` for UI development.
This flag changes the initial UI only and grants no authenticated API access.

Use the reference's coral, warm white, pill shapes and black controls, applied to
a Locket-style camera composition rather than implementing a map or location access.
