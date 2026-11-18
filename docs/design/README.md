# Mobile design references

Original Home/Profile mockups and source assets are archived here. The running
Flutter app loads its packaged images from `MobileApp/assets`; these references
are not runtime dependencies.

- `Home.html`, `Profile.html`: self-contained HTML mockups with embedded images.
- `Home.png`, `Profile.png`: original screenshots.
- `extracted_assets/`: source image crops used during design.
- `processed_assets/b64_assets.json`: embedded image data used by the generator.
  Nine redundant PNG copies were removed; identical images remain in Flutter.

Regenerate the HTML from the repository root with:

```powershell
python docs/design/build_designs.py
```

The generator resolves inputs/outputs relative to its own directory and needs
only the Python standard library. Regeneration updates the HTML, not screenshots.
