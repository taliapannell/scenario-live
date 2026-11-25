/**
 * Scent Bridge — HTTP → UDP relay for the Olorama scent diffuser
 *
 * Browsers can't send UDP, so the app POSTs here and this relays the command
 * to the Olorama device on the local network (UDP port 5010, per Olorama's
 * UDP API guide).
 *
 * Usage:
 *   npm run scent-bridge
 *
 * Env (all optional):
 *   OLORAMA_IP          device IP or subnet broadcast (192.168.10.28)
 *   OLORAMA_PORT        device UDP port (default 5010)
 *   OLORAMA_INTENSITY   diffusion ms, 100–500 (default 200)
 *   OLORAMA_FAN_MS      fan time ms, 4000–7000 recommended (default 4000)
 *   SCENT_BRIDGE_PORT   HTTP port for this relay (default 5011)
 *
 * Endpoint:
 *   POST /scent   { "slot": "slot_4" }   → 204 on success
 */

const http = require("http");
const dgram = require("dgram");

const OLORAMA_IP = process.env.OLORAMA_IP || "192.168.10.28";
const OLORAMA_PORT = Number(process.env.OLORAMA_PORT || 5010);
const INTENSITY = clamp(Number(process.env.OLORAMA_INTENSITY || 200), 100, 500);
const FAN_MS = clamp(Number(process.env.OLORAMA_FAN_MS || 4000), 1000, 9000);
const PORT = Number(process.env.SCENT_BRIDGE_PORT || 5011);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// "slot_4" → Olorama scent ID 4. The device accepts IDs 1–10.
function slotToScentId(slot) {
  const match = /^slot_(\d+)$/.exec(slot || "");
  const id = match ? Number(match[1]) : NaN;
  return id >= 1 && id <= 10 ? id : null;
}

// Format from Olorama's DMX guide: OUT,<scent>,<intensity>,<fan>,<fan ms>,1000
// No spaces after commas — the device's parser silently ignores the spaced
// variant shown in Olorama's Unity sample code.
function buildCommand(scentId) {
  const pad = (n, width) => String(n).padStart(width, "0");
  return `OUT,${pad(scentId, 2)},${pad(INTENSITY, 4)},1,${pad(FAN_MS, 5)},1000`;
}

const socket = dgram.createSocket("udp4");
socket.bind(() => socket.setBroadcast(true));

function sendCommand(command) {
  return new Promise((resolve, reject) => {
    socket.send(command, OLORAMA_PORT, OLORAMA_IP, (error) => (error ? reject(error) : resolve()));
  });
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.method !== "POST" || req.url !== "/scent") return res.writeHead(404).end();

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    let slot;
    try {
      slot = JSON.parse(body || "{}").slot;
    } catch {
      return res.writeHead(400).end("Invalid JSON");
    }

    const scentId = slotToScentId(slot);
    if (!scentId) return res.writeHead(400).end(`Unknown scent slot: ${slot}`);

    const command = buildCommand(scentId);
    try {
      await sendCommand(command);
      console.log(`Scent ${slot} → ${OLORAMA_IP}:${OLORAMA_PORT}  "${command}"`);
      res.writeHead(204).end();
    } catch (error) {
      console.error("Could not reach Olorama device:", error);
      res.writeHead(502).end("Olorama send failed");
    }
  });
});

server.listen(PORT, () => {
  console.log(`Scent bridge listening on http://localhost:${PORT}/scent → UDP ${OLORAMA_IP}:${OLORAMA_PORT}`);
});
