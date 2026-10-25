# LUYA CLUB

**A build-free three.js South China Sea dive and first-person lure-fishing experience.**

[中文 README](README.md) · [MIT License](LICENSE) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

![Netting a fish](docs/screenshots/net.jpg)

Scroll from a sunset sea surface down to a 96 m seabed, follow the floating LUYA CLUB sign through the sunlit, twilight and midnight zones, pick one of five concept lure rods on a floating pontoon, then cast, retrieve, strike, fight and net with only **left mouse / wheel / Space**.

Everything — scene, fish, lures, UI, sound effects and the 90-second music loop — is procedurally generated. **No build step, no backend, no API keys, no runtime CDN.**

## Features

- Cinematic dive: Gerstner ocean, sky/clouds/sun, Snell window, light shafts, marine snow, schools and bioluminescence.
- Clickable descent plaques: a TACKLE product page and a BRAND book overlay; the main sign drifts smoothly on one side, avoids plaques, and lands by the seabed rod.
- Five concept rods with different length, power, action and lure range; the guide recommends rod/leader/lure for each fish.
- Five procedural lures: minnow, popper, jig, soft plastic and pencil.
- Twelve South China Sea species with IUCN badges and release rules.
- Fight system: **6 / 8 / 12** QTE rounds for small / medium / large fish; yellowfin, bigeye, cobia and mahi-mahi can enter a **LINE RUN** state (all input locked, line peels outward); a 200 m empty spool fails the fight.
- Wrong oversized gear can cut the line; a correct H rod + 30 LB leader survives the same 40 kg fish.
- The live-bait mechanic has been removed; large fish take normal lures again.
- Procedural WebAudio SFX and a 90-second, seamlessly looping pentatonic sea theme.

![Space strike](docs/screenshots/strike.jpg)

## Quick start

Requirements: **Node.js 20+** and a **WebGL2** browser (recent Chrome / Edge / Safari).

```bash
git clone <your-repo-url> luya-club
cd luya-club
node tools/serve.mjs
```

Open **http://127.0.0.1:4321/**. There is no `npm install` and no build.

Low-end mode (GTX 1050 / integrated graphics):

```text
http://127.0.0.1:4321/?quality=low
```

The repo is a static site; a GitHub Pages workflow is included.

## Controls

| Input | Action |
|---|---|
| Hold Space → release | Charge and cast (up to 120 m) |
| Wheel up / down | Reel in / feed line |
| Mouse | Aim / swing; during a bite, **Space only** sets the hook |
| Space | Hook-set, QTE confirm |
| Left click inside the dashed circle | Scoop the fish |
| Top-right cards | Tackle / leader / bag / guide / sound |

At 6.5 m from shore the net is triggered automatically. The reel only spins while actually reeling.

## Project layout

```text
index.html                 Entry, import map, UI skeleton
css/                      base / shop / fishing / campaign styles
js/core/                  Renderer, state, quality tiers
js/world/                 Ocean, sky, camera, sign, seabed, fish, traffic, campaign
js/game/                  Rod, lures, line, QTE, fight, net, bag
js/data/                  Lure/fish data, guide and gear recommendations
js/ui/                    HUD, captions, fishing UI, campaign pages
js/audio/                 WebAudio SFX + 90 s music hookup
assets/audio/             Synthesized OGG/MP3 music
vendor/three/             three.js r186 (MIT)
tools/serve.mjs           Zero-dependency local static server
tools/make-music.py       Music generator (optional)
docs/screenshots/         README images
```

## Conservation

- **Bigeye tuna** (IUCN VU): must release; the KEEP button is disabled.
- **Giant grouper** (IUCN DD): large reef fish, advisory release; KEEP remains available.
- **Humphead wrasse** (EN / CITES II): guide-only, not a lure target.
- Other species are shown as LC. These are educational game rules, not a substitute for local fisheries regulations.

## Technical notes

- three.js r186 vendored locally; no network runtime dependencies.
- ACES tone mapping plus a custom grade; every model and texture is procedural.
- No bundler, no framework, no npm runtime dependencies.
- Mobile HUD adapted; `?quality=low` targets integrated/GTX 1050-class hardware.
- Fish species and the fish-cam inset are prewarmed behind the loading screen; shader cache handles later loads.

## License

Code, procedural assets, screenshots and synthesized music are released under the **MIT License**. See [LICENSE](LICENSE). Third-party components: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

“LUYA CLUB / OPEN WATER CAMPAIGN” is fictional concept branding, not a real manufacturer. Fork it, re-brand it, and use it for your own lure content.
