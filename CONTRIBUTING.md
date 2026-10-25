# Contributing

Thanks for taking a look at LUYA CLUB.

## Ground rules

- Keep the demo **build-free**: plain ES modules, no bundler, no runtime CDN.
- Keep the public asset budget small. Do not commit generated test screenshots,
  Chrome profiles or QA reports.
- Respect the conservation rules: protected species that are marked
  “must release” stay that way.

## Local development

```bash
node tools/serve.mjs
# http://127.0.0.1:4321/
```

No `npm install` is required. Node 20+ and a WebGL2 browser are enough.

To test the low-end preset:

```text
http://127.0.0.1:4321/?quality=low
```

## Pull requests

1. Describe the change and the player-visible result.
2. Keep unrelated formatting changes out.
3. Include a screenshot/GIF for visual changes and state the browser/GPU used.
4. Run a quick console check (no errors) and verify the three-input flow:
   hold Space → cast, wheel → retrieve, Space → strike/QTE, left click inside the
   guide circle → net.
5. Check mobile at 390×844 if the HUD is touched.

## License

By contributing you agree that your contribution is licensed under the MIT
license in `LICENSE`.
