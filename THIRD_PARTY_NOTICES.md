# Third-party notices

## three.js

- Vendored at `vendor/three/` (r186).
- License: **MIT**.
- Upstream: <https://github.com/mrdoob/three.js>
- The full license text is kept at `vendor/three/LICENSE`.

## Fonts and images

- No web fonts are bundled. The UI uses the system font stacks
  (`Bahnschrift`, `Noto Sans SC`, `Microsoft YaHei`, sans-serif).
- All 3D objects, textures, UI graphics and screenshots are procedural or
  generated for this project.
- Brand names in the demo (`LUYA CLUB`, `OPEN WATER CAMPAIGN`) are fictional
  concept branding, not real manufacturers.

## Audio

- `assets/audio/south-china-sea-90s.ogg` / `.mp3` are synthesized by
  `tools/make-music.py` using numpy and encoded with ffmpeg. No external
  samples or copyrighted recordings are included.
- Fishing SFX are synthesized at runtime with the Web Audio API.

## Screenshots

- `docs/screenshots/` are captures of this project and are distributed under
  the same MIT license.

If you add third-party assets, add their license and attribution here before
publishing.
