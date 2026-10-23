## Olorama Scent Testing — Scenario Live!

## Before you start
- The Mac and the Olorama must be on the same network (192.168.10.x).
  - Olorama IP: 192.168.10.28
  - Check the Mac's IP: `ipconfig getifaddr en0`
- Olorama is plugged into Ethernet & connected to the hotspot, powered on, and has cartridges loaded.
- `scenario-live/looking-glass/.env.local` contains:
  `VITE_SCENT_URL=http://localhost:5011`
  (Use .env.local, not .env, because aws-credentials.sh overwrites .env.)
- AWS credentials are current. They expire after 1 hour. To refresh, run
  `./aws-credentials.sh`, then restart Vite.

## Step 1 — Check the device is reachable
    ping -c 2 192.168.10.28
Expect: "0.0% packet loss"

## Step 2 — Start the scent relay (Terminal 1, leave it running)
    cd ~/makers-lab/scenario-live/looking-glass
    npm run scent-bridge
Expect: "Scent bridge listening on http://localhost:5011/scent → UDP 192.168.10.28:5010"

## Step 3 — Fire each slot by hand (Terminal 2)
    curl -i -X POST http://localhost:5011/scent -H "Content-Type: application/json" -d '{"slot":"slot_1"}'
- Expect: "HTTP/1.1 204 No Content", a "Scent slot_1 → ..." line in Terminal 1,
  and the fan running for about 4 seconds while the scent releases.
- Repeat for slot_2 through slot_6. Wait 30–60 seconds between slots.
- Write down which physical cartridge each slot fires.

## Step 4 — Start the app (Terminal 2 or 3, leave it running)
    cd ~/makers-lab/scenario-live/looking-glass
    npm run dev
- Open the URL it prints (usually http://localhost:5173).
- On page load, slot_6 (the Maker's Lab default) should release.

## Step 5 — Test through Nova
- Hold Space, say a line, then release. Or type it in the debug box.
- Press Ctrl+Shift+R to reset between tests (only 2 shifts are allowed per session).

| Say                                      | Expected slot |
|------------------------------------------|---------------|
| "We build cars, automotive manufacturing" | slot_1 |
| "We're a healthcare company"              | slot_2 |
| "We're focused on digital transformation" | slot_3 |
| "We do urban planning for cities"         | slot_4 |
| "We're a corporate finance firm"          | slot_5 |

- For each test, check Terminal 1 for the matching "Scent slot_X → ..." line.
- Ctrl+Shift+R should release slot_6 again.
- Only 2 keyword shifts are allowed per session. Press Ctrl+Shift+R before each phrase,
  then wait 30–60 seconds for the default scent to clear.

## Step 6 — Failure test
- Stop the relay (Ctrl+C in Terminal 1) and talk to Nova.
- Expect: Nova keeps speaking normally, and no scent releases.
- Restart the relay afterwards: `npm run scent-bridge`

## Tuning strength (restart the relay with new values)
    OLORAMA_INTENSITY=100 OLORAMA_FAN_MS=6000 npm run scent-bridge
- Intensity: 100–500 ms (lower = subtler). Default: 200.
- Fan time: 4000–7000 ms recommended. Default: 4000.

## Troubleshooting
- **curl returns 204 but no scent:** device or cartridge problem. Is the slot loaded? Is the fan audible?
  Try intensity 500. Check the device fires from Olorama's own software.
- **curl says "Connection refused":** the relay isn't running (Step 2).
- **Nova answers but there's no "Scent slot_X" line in Terminal 1:**
  - The shift cap was hit: press Ctrl+Shift+R.
  - Or the slot was skipped because it repeats the last scent.
  - Or Nova's scent description didn't contain a trigger word, so it fell back to slot_6.
- **Nova doesn't answer:** AWS credentials have probably expired. Run `./aws-credentials.sh`, then restart Vite.
- **Changed .env or .env.local:** restart Vite (Ctrl+C, then `npm run dev`).
- **The command must have no spaces:** `OUT,04,0200,1,04000,1000`. The device ignores the spaced format.

## Where things live
- Relay and device IP: `scenario-live/looking-glass/scent-bridge.js` (line 25)
- Scent trigger words: `scenario-live/looking-glass/sensory/scent.js` (lines 20–24)
- Browser scent client: `scenario-live/looking-glass/scent-control.js`
- Bridge wiring: `scenario-live/shared/session-state.js` and `main.js`
