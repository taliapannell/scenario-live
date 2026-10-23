# Scenario Live!

The immersive client demo experience from the Accenture 1MW Maker's Lab. Clients talk to Nova, an AI-powered holographic avatar, while the room's visuals, audio and scent shift with the conversation. Clients leave with an NFC keychain linking to a personalized session summary.

| Folder | Purpose |
|---|---|
| `scenario-live/looking-glass/` | Nova's holographic app (Three.js, HoloPlay.js, Claude on AWS Bedrock) |
| `scenario-live/shared/` | Session state logic shared by the app |
| `scenario-live-local/` | Presenter dashboard (React, TypeScript) |

The public website lives in a separate repo (`makers-lab`).

---

## Looking Glass app (`scenario-live/looking-glass`)

Nova's holographic app. Runs in any browser for development, and renders on a Looking Glass display when one is connected.

### Run it

```bash
cd scenario-live/looking-glass
npm install
npx vite          # or: npm run dev
```

Then open the printed URL (e.g. `http://localhost:5173`).

> **Node version:** this project uses Node via nvm. If `node`/`npm` aren't found, run `nvm use 24` first.

### Environment

Create a `.env` file in `looking-glass/` (gitignored — never commit it):

```bash
VITE_ANTHROPIC_API_KEY=sk-ant-...   # required for Nova to talk (Claude API)
VITE_NOVA_SPEAKER=                  # optional: substring of the dedicated TTS speaker's label
VITE_SCENT_URL=http://localhost:5011  # optional: scent bridge (see below); unset = scent is logged only
```

Vite only reads `.env` at server start, so **restart Vite after changing it**.

### Scent (Olorama)

Nova's `<scent_prompt>` tag is matched to a cartridge slot by `sensory/scent.js` and released alongside the scene and audio shifts. Browsers can't send UDP, so a small local relay forwards each slot to the Olorama device:

```bash
npm run scent-bridge   # HTTP :5011 → UDP 192.168.10.28:5010
```

The kiosk PC and the Olorama must be on the same subnet, with UDP 5010 allowed through the firewall. Override with `OLORAMA_IP` (device IP or subnet broadcast), `OLORAMA_PORT`, `OLORAMA_INTENSITY` (100–500 ms), `OLORAMA_FAN_MS`, and `SCENT_BRIDGE_PORT`. Slot → cartridge mapping in `sensory/scent.js` is a placeholder until the hardware is confirmed.

### Looking Glass rendering & dev flags

The app starts on the standard Three.js renderer (works in any browser), then asynchronously upgrades to the Looking Glass if a device is detected — otherwise it stays on the standard renderer. Override detection with a URL query param:

| URL | Behavior |
|---|---|
| (none) | Auto-detect a Looking Glass; silently fall back to the standard renderer if absent |
| `?holoplay=off` | Never use HoloPlay — skip detection entirely |
| `?holoplay=2d` | HoloPlay's flat 2D debug view on a normal monitor (exercises the library without a device) |
| `?holoplay=on` | Force the full quilt renderer even if detection fails (on-device debugging) |

> The `on` / `2d` flags require **Looking Glass Bridge** to be running, or HoloPlay's own "no device" dialog will appear. The default auto-detect path never shows that dialog.

### On-device test checklist

Before a live demo, validate on the actual hardware in this order:

1. **Bridge running + display connected.** Confirm the Looking Glass Bridge app is open and the display is recognized.
2. **Shim check (no device needed):** load `?holoplay=2d` on a normal monitor — confirms the HoloPlay library initializes under the current Three.js version before going on-device.
3. **Go live:** load with no flag (or `?holoplay=on`) on the display. Confirm the console logs `Looking Glass active (holoplay-quilt)`.
4. **Verify Nova renders:** geometry, particles, twinkle, and inner glow all appear; the wire brain floats above; the chest logo is visible.
5. **Tune camera framing** if needed (narrow ~12.5° fov — see `cameraPosition` / `cameraTarget` in `main.js` §13).
6. **Verify topic color shifts and speech** (`novaActive` reaction) work the same as in the browser.

### Known risks / gotchas

- **Three.js version gap:** the `holoplay` package (1.0.3) targets Three r102; this project uses r184. It's made to work via a compatibility shim in `holoplay-display.js`, but this is **unverified on a physical device**. If it breaks on-device, the modern replacement is [`@lookingglass/webxr`](https://github.com/Looking-Glass/looking-glass-webxr) (WebXR-based, r184-compatible).
- **Frosted-glass material:** Nova's body uses `MeshPhysicalMaterial` with `transmission`, which may render incorrectly in HoloPlay's multi-view quilt pass. If so, swap `makeGlassMaterial()` in `main.js` to a plain `MeshStandardMaterial`.
- **TTS speaker routing:** the current Web Speech API voice **cannot** be routed to a specific speaker via `setSinkId()` (a browser limitation) — it plays out the system default. Per-speaker routing is wired and ready (`VITE_NOVA_SPEAKER`) but only takes effect once Nova uses a streaming TTS that returns an audio stream (see `nova/`).
- **API key exposure:** `VITE_`-prefixed vars are bundled into the browser, so the key is readable on the page. Acceptable for the locked-down kiosk PC only; anything public must proxy the Claude call server-side.

---

*Confidential — Internal Use Only — Accenture Maker's Lab, 1MW*
