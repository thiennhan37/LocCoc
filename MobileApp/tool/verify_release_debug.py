"""Inspect an AOT APK after building with LOCCOC_DEV_TOOLS=true.

This complements the constant gate and widget tests; it is not a device UI test.
"""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

apk = Path(sys.argv[1] if len(sys.argv) > 1 else "build/app/outputs/flutter-apk/app-release.apk")
markers = ["development_debug_panel", "debug_force_refresh", "debug_reveal_access",
           "debug_copy_access", "debug_reload_profile", "debug_reload_counts",
           "LocCoc Debug", "Force Refresh", "DebugScreen"]
with zipfile.ZipFile(apk) as archive:
    entries = [name for name in archive.namelist() if name.startswith("lib/") and name.endswith("/libapp.so")]
    if not entries or any(name.endswith("kernel_blob.bin") for name in archive.namelist()):
        raise SystemExit("Expected an AOT release APK, not a debug/kernel build")
    for name in entries:
        data = archive.read(name)
        found = [marker for marker in markers if any(marker.encode(encoding) in data
                 for encoding in ("utf-8", "utf-16-le"))]
        if found:
            raise SystemExit(f"Development markers found in {name}: {found}")
print(json.dumps({"apk": str(apk.resolve()), "sha256": hashlib.sha256(apk.read_bytes()).hexdigest(),
                  "aot_libraries_checked": entries, "development_markers_found": [],
                  "result": "PASS"}, indent=2))
