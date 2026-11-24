# Scenario Live — Claude context

Accenture 1MW Maker's Lab immersive demo. Two parts:

- `scenario-live/looking-glass/` — Nova, the holographic AI avatar app (vanilla JS, Three.js, Vite). `scenario-live/shared/session-state.js` is shared session logic.
- `scenario-live-local/` — presenter dashboard "Scenario Live · Presenter" (React, TypeScript).

The public website is a separate repo (`makers-lab`). Audio lives on the demo PC; the Sonos HTTP API submodule was removed.

## Nova / Looking Glass (`scenario-live/looking-glass`)

- **Brain:** `nova-chat.js` calls Claude Sonnet 4.6 (`global.anthropic.claude-sonnet-4-6`) on AWS Bedrock directly from the browser.
  - Conversation replies are 3 sentences or fewer and end with a question.
  - The system prompt includes a guardrail topic list and a pre-session client brief fetched from `http://localhost:3001/api/pre-session`.
  - Replies must include the XML tags `mode`, `dream_edit`, `reply`, `entity`, `scene_prompt`, `audio_prompt`, `scent_prompt` and `notes`.
- **Dream Mode:** when the client describes something they imagine, Claude sets `<mode>dream</mode>` and the client's words become the scene. The code never detects dreams by phrase matching.
  - Missing or unknown `<mode>` means conversation. `<dream_edit>yes</dream_edit>` marks an edit of the current dream.
  - The reply is one short line with no question. Inappropriate dreams are redirected to a safe, whimsical scene.
  - Dreams bypass the company lock and don't count toward `maxShifts`. Session state keeps the current dream prompt (fed back into the system prompt) and its seed, which stays fixed for edits. Any non-dream shift clears both.
  - Every dream logs `[dream-timing]` (push-to-talk release → StreamDiffusion acknowledged); recent timings are on `window.dreamTimings`.
- **Input:** `hold-to-talk.js` is push-to-talk. The first press moves the session IDLE to ACTIVE and opens the Bedrock gate (`enableBedrock`). Nova's voice is the browser Web Speech API.
- **Session logic:** `shared/session-state.js`.
  - A company mention locks the scene.
  - Keywords can trigger up to `maxShifts` (2) shifts, only while no company is locked.
  - `sceneTimer.js` forces a contextual scene shift every 3 minutes, with an 8-second cooldown.
- **Outputs**, wired in `main.js` via `configureSceneHandlers`:
  - Scene: `stream-diffusion.js` (`VITE_STREAM_DIFFUSION_URL`, logs only if unset). POSTs `{ prompt }`, plus `seed` for dreams. On a failed request it sends `FALLBACK_SCENE_PROMPT` (`app-config.js`) once.
  - Audio: `sonos-control.js` (`VITE_SONOS_URL`, default `localhost:5005`, room "Immersive Experience Room").
  - Scent: `scent-control.js` calls `scent-bridge.js` (HTTP :5011 to UDP 192.168.10.28:5010, the Olorama device).
- **Scent mapping:** `sensory/scent.js` maps keywords to slots 1–6. Slots 7–10 are placeholders, and the cartridge mapping is unconfirmed until the hardware is.
- **Display:** `holoplay-display.js` renders to the Looking Glass. Flags are `?holoplay=off|2d|on`. It is unverified on a physical device (the holoplay package targets Three r102, the project uses r184).

### Running it

```bash
cd scenario-live/looking-glass
npm install
npm run dev            # Vite, http://localhost:5173 (use `nvm use 24` if node is missing)
npm run mock           # mock server :3001 (pre-session + NFC assign)
npm run scent-bridge   # scent relay :5011 -> Olorama UDP
node nova-parser-test.mjs      # offline tag parser tests
node session-state-test.mjs    # offline shift cap / Dream Mode state tests
node dream-mode-live-test.mjs  # live Bedrock Dream Mode scenarios (needs `aws login`)
```

- **AWS credentials** expire after about an hour. Run `aws login` (region us-east-1), then `./aws-credentials.sh`, which assumes `scenario-live-bedrock-role` and writes `.env`. Restart Vite afterward. "Security token expired" means this step is needed. See `AWS.md`.
- **`.env`** is gitignored. Vite only reads it at startup.
- **Audio files** (`audio/scenes/*.mp3`) are not all committed. Copy them in from the demo PC copy (see `AUDIO_FILES_LOCAL.txt`).

## Local dashboard (`scenario-live-local`)

- Vite on :5173 with `/api` proxied to `localhost:3001`. Start it with `npm run dev`. It shares port 5173 with the looking-glass app, so run one at a time or change a port.
- **Routes:** `/presenter` (default), `/signin`, `/conversation/:userId`, `/insights/:sessionId`.
- **Presenter page:** session status (IDLE, ACTIVE, ENDED), elapsed timer, topic display, event feed, system-check modal, and an NFC keychain assignment flow with "Simulate Tap" and "Simulate Error" buttons.
- **Real wiring:** only `PreSessionForm`, which POSTs client name, industry and notes to `/api/pre-session`. The mock server stores it and Nova reads it.
- **Not wired:**
  - The dashboard doesn't talk to Looking Glass. Session state, topic and the feed are local React state and simulated. The OSC, Sonos, NFC, API and AI status items aren't real health checks.
  - Sign-in is a placeholder (sets `sessionStorage`; footer says "Cognito (placeholder)").
  - `Insights.tsx` uses mock data (`TODO: wire up to real API`).
  - The NFC assign endpoint exists only in `mock-server.js`.

## Open items and risks

1. The dashboard and Nova are disconnected apps. A real backend is needed for session lifecycle, NFC, insights and `/sessions/assign`.
2. AWS credentials are bundled into the browser (`VITE_` vars). Acceptable only on the locked-down kiosk PC. Anything public needs a server-side proxy.
3. Looking Glass rendering is untested on real hardware. The frosted-glass `transmission` material may not render in the quilt pass.
4. Olorama slots 7–10 are placeholders, and the device IP was last changed on 2026-10-19.
5. `audio/sonos.js` references mp3 names (`finance.mp3`, `healthcare.mp3`, and others) that don't match the files in `audio/scenes/`.
6. Build output (`dist/`, `*.tsbuildinfo`) may be tracked despite `.gitignore`; check before the first commit.
