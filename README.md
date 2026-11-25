# Scenario Live!

The immersive client demo experience from the Accenture 1MW Maker's Lab. Clients talk to Nova, an AI-powered avatar, while the room's visuals, audio and scent shift with the conversation. Clients leave with an NFC keychain linking to a personalized session summary.

| Folder | Purpose |
|---|---|
| `scenario-live/nova/` | Nova's avatar app (Three.js, Claude on AWS Bedrock) |
| `scenario-live/shared/` | Session state logic shared by the app |
| `scenario-live-local/` | Presenter dashboard (React, TypeScript) |

The public website lives in a separate repo (`makers-lab`).

---

## Nova app (`scenario-live/nova`)

Nova's avatar app. Runs in any browser; the demo runs it full-screen on the iMac.

### Run it

```bash
cd scenario-live/nova
npm install
npx vite          # or: npm run dev
```

Then open the printed URL (e.g. `http://localhost:5173`).

> **Node version:** this project uses Node via nvm. If `node`/`npm` aren't found, run `nvm use 24` first.

### Environment

Create a `.env` file in `nova/` (gitignored — never commit it):

```bash
VITE_ANTHROPIC_API_KEY=sk-ant-...   # required for Nova to talk (Claude API)
VITE_NOVA_SPEAKER=                  # optional: substring of the dedicated TTS speaker's label
VITE_SCENT_URL=http://localhost:5011  # optional: scent bridge (see below); unset = scent is logged only
VITE_STREAM_DIFFUSION_URL=http://<stream-diffusion-host>:<port>/prompt
VITE_SONOS_URL=http://<sonos-http-api-host>:<port>
VITE_SONOS_ROOM=Immersive Experience Room
```

Vite only reads `.env` at server start, so **restart Vite after changing it**.

### Scent (Olorama)

Nova's `<scent_prompt>` tag is matched to a cartridge slot by `sensory/scent.js` and released alongside the scene and audio shifts. Browsers can't send UDP, so a small local relay forwards each slot to the Olorama device:

```bash
npm run scent-bridge   # HTTP :5011 → UDP 192.168.10.28:5010
```

The kiosk PC and the Olorama must be on the same subnet, with UDP 5010 allowed through the firewall. Override with `OLORAMA_IP` (device IP or subnet broadcast), `OLORAMA_PORT`, `OLORAMA_INTENSITY` (100–500 ms), `OLORAMA_FAN_MS`, and `SCENT_BRIDGE_PORT`. Slot → cartridge mapping in `sensory/scent.js` is a placeholder until the hardware is confirmed.

### Display

A standard Three.js `WebGLRenderer`, full-screen in the browser on the iMac. No device detection, no URL flags.

### Pre-demo checklist

1. **Verify Nova renders:** geometry, particles, twinkle, and inner glow all appear; the chest logo is visible.
2. **Verify topic color shifts and speech** (`novaActive` reaction).

### Known risks / gotchas

- **TTS speaker routing:** the current Web Speech API voice **cannot** be routed to a specific speaker via `setSinkId()` (a browser limitation) — it plays out the system default. Per-speaker routing is wired and ready (`VITE_NOVA_SPEAKER`) but only takes effect once Nova uses a streaming TTS that returns an audio stream (see `nova/`).
- **API key exposure:** `VITE_`-prefixed vars are bundled into the browser, so the key is readable on the page. Acceptable for the locked-down kiosk PC only; anything public must proxy the Claude call server-side.

---

*Confidential — Internal Use Only — Accenture Maker's Lab, 1MW*
