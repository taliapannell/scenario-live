// =============================================================================
// Nova — Claude on Bedrock + Text-to-Speech (TTS)  : nova-chat.js
// -----------------------------------------------------------------------------
// This module is the "brain + voice" wiring for Nova. It:
//   1. Builds a small DEBUG text input (NOT the final client UI — a dev tool).
//   2. Sends the typed message to Claude on Amazon Bedrock (InvokeModel).
//   3. Parses 6 structured XML tags out of Claude's reply and calls
//      onEntity({ entity, scenePrompt, audioPrompt, scentPrompt, notes }) so the scene,
//      audio, and whiteboard can respond to what the visitor mentioned.
//   4. Speaks the reply with the Web Speech API, and toggles onSpeaking(true/
//      false) so the avatar's particles/bloom react while she talks.
//
// It exposes ONE function, initNovaChat({ onEntity, onSpeaking }), which main.js
// calls and wires to the scene/audio/whiteboard handlers and the novaActive flag.
//
// ⚠️ SECURITY NOTE (read this): the AWS credentials below (VITE_AWS_ACCESS_KEY_ID
// / VITE_AWS_SECRET_ACCESS_KEY) are bundled into the browser, so anyone who opens
// the page can read them. That is acceptable ONLY for a locked-down kiosk PC like
// the Maker's Lab installation, and the IAM user (scenario-live-dev) should be
// scoped to nothing but bedrock:InvokeModel. For anything public, the call must go
// through a tiny backend proxy (the `nova/` folder) so the credentials stay
// server-side. See the README note we should add later.
// =============================================================================

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { resetSession, onEntityDetected, onDreamDetected } from "../shared/session-state.js";
// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------
const AWS_REGION = import.meta.env.VITE_AWS_REGION;
const AWS_ACCESS_KEY_ID = import.meta.env.VITE_AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;
const AWS_SESSION_TOKEN = import.meta.env.VITE_AWS_SESSION_TOKEN;

// Where the pre-session brief lives. Must match the mock-server port.
const PRE_SESSION_URL = "http://localhost:3001/api/pre-session";

// Bedrock model ID for Claude Sonnet 4.6 via the GLOBAL inference endpoint —
// dynamic cross-region routing, no pricing premium, max availability. The
// "global." prefix IS the cross-region inference profile, so it avoids the
// "on-demand throughput isn't supported / use an inference profile"
// ValidationException that the older bare Sonnet 4 ID hit in us-east-2. For
// guaranteed data residency, swap "global." for a regional prefix ("us.") —
// note regional endpoints carry a ~10% premium.
const NOVA_MODEL = "global.anthropic.claude-sonnet-4-6";

// On Bedrock, anthropic_version is a fixed string in the request BODY — it is
// NOT the public API's "2023-06-01" date, and there is no model field in the
// body (the model is selected via modelId on the command instead).
const ANTHROPIC_VERSION = "bedrock-2023-05-31";

// Credentials are pre-assumed role credentials for scenario-live-bedrock-role,
// obtained via `aws sts assume-role` and stored in .env. Refresh every ~1 hour.
const bedrock = new BedrockRuntimeClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    ...(AWS_SESSION_TOKEN ? { sessionToken: AWS_SESSION_TOKEN } : {}),
  },
});

// Keep replies short — they're spoken aloud, so 2–4 sentences feels natural.
const MAX_TOKENS = 1024;

// Fetches the current pre-session brief from the mock server.
// Returns null if no brief has been submitted or the fetch fails.
async function fetchPreSessionData() {
  try {
    const res = await fetch(PRE_SESSION_URL);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

// Builds Nova's system prompt, injecting client context when a brief is loaded.
function buildSystemPrompt(preSession) {
  const clientContext = preSession
    ? `
You have been briefed on today's client before this session began.
Client name: ${preSession.clientName}
Industry: ${preSession.industry}
Additional context: ${preSession.contextNotes || "None provided"}

Use this information naturally. Do not announce that you were briefed — let it shape how you speak, what examples you reach for, and how you frame ideas. If the client mentions their company or industry, engage with it specifically rather than generically.
`
    : `No client briefing has been provided for this session. Respond to whoever walks in openly and adapt as the conversation develops.`;

  return `You are Nova, the AI guide of Accenture's Emerging Tech Innovation Maker's Lab — a space where innovation and creativity intersect — we run immersive client demos featuring VR, robotics, AI, holographic displays, and hand sensors.

${clientContext}

Your personality: professional, warm, curious, and genuinely intelligent. You are a creative, knowledgeable guide to emerging technology — never robotic, never a generic chatbot. You speak naturally and conversationally, as a brilliant host would.

RESPONSE RULES — THESE ARE NON-NEGOTIABLE:

Every response must be 3 sentences or fewer. No exceptions.
Every response must end with a question directed at the client.
Never lecture. Never list. Never give a paragraph when a sentence will do.
If you feel the urge to explain more, resist it — ask instead.
The question at the end should feel natural, not forced. It should come from genuine curiosity about the client's situation.
These rules apply to every conversation-mode response Nova gives, regardless of topic, regardless of complexity. If the answer genuinely requires more than 3 sentences, break it into two turns — answer part of it, ask a question, and let the client's response open the door to the rest. Dream mode (below) has its own reply rule.

DREAM MODE: If the person describes something they imagine or want to see
(e.g. "I'm dreaming of..."), set <mode>dream</mode>.
In dream mode:
- Their description is the scene. Keep every element they named; do not swap,
  drop, or reinterpret subjects.
- Add only visual craft: lighting, style, atmosphere, camera. Dreamlike, cinematic.
- Keep <reply> to one short line, then stop. Leave <entity> empty.
- If they ask to change a dream ("add...", "make it..."), modify the previous
  <scene_prompt> instead of rewriting it.
- If the request is inappropriate, redirect to a safe, whimsical version.
Otherwise set <mode>conversation</mode> and behave as normal.

After every reply, you MUST return the following seven XML tags on their own lines at the very end of your response, in exactly this order:

<mode>Either "conversation" or "dream".</mode>

<reply>Your spoken response to the visitor — 3 sentences or fewer, always ending with a question.</reply>

<entity>The company name or keyword the visitor mentioned. If none, leave empty.</entity>

<scene_prompt>A cinematic description of a real physical space that matches the conversation. Describe motion and atmosphere — not a static image. Always professional and immersive. If no entity was detected, return exactly: "Futuristic Maker's Lab in New York City. Industrial loft space with exposed brick and cool graffiti murals. 3D printers actively building objects on workbenches. Robots moving purposefully between workstations. Holographic displays floating mid-air. Chemistry glassware glowing on shelves. Purple ambient lighting. Cinematic depth, immersive atmosphere."</scene_prompt>

<audio_prompt>One sentence describing the sonic environment that matches the scene. Used to select a pre-sourced audio file — do not describe music, only ambient sound.</audio_prompt>

<scent_prompt>A short comma-separated list of the scents in the scene (e.g. "Rain-dampened concrete, exhaust, street food"). Used to select a scent cartridge — describe smells only, nothing else.</scent_prompt>

<notes>
- A relevant fact or insight about the detected entity
- An Accenture or Maker's Lab angle on that entity
- One more relevant point
Leave all three lines empty if no entity was detected.
</notes>

These tags are machine instructions — they are stripped before your words are spoken. Never refer to them in your reply.

Additionally, detect if the visitor mentions a specific company name or industry keyword. If you identify one, include it in an <entity> tag on its own line AFTER the <topic> tag:
<entity>VALUE</entity>

Where VALUE is the company name or keyword you detected (e.g., "microsoft", "sustainability", "healthcare"). If you detect no entity, omit this tag.

After detecting an entity, generate THREE additional tags with instructions for the environment:

1. A <scene_prompt> tag describing how the 3D environment should transform:
<scene_prompt>DESCRIPTION</scene_prompt>

2. An <audio_prompt> tag describing what audio/music should play:
<audio_prompt>DESCRIPTION</audio_prompt>

3. A <scent_prompt> tag describing what the room should smell like:
<scent_prompt>DESCRIPTION</scent_prompt>

These tags are machine instructions and should not be included in your spoken reply. Keep your actual response to 3 sentences or fewer, always ending with a question.

GUARDRAILS — topics you must never engage with:
- Religion or religious beliefs
- Politics, political parties, or political figures
- Race or racial topics
- Gender identity debates
- Abortion or reproductive rights
- Gun control
- Immigration policy
- Drug use or legalization
- Anything sexually explicit
- Competitor products or companies (never compare Accenture to competitors)
- Legal or financial advice
- Mental health or self-harm
- Violence or graphic content
- Salary, compensation, or internal Accenture financials
- Confidential client names or projects
- Medical or health advice
- Conspiracy theories or misinformation
- Personal data — never ask for, store, or repeat personal information about a visitor

If a visitor raises any of the above, acknowledge warmly and redirect without being abrupt or robotic. Example: "That's outside what I'm here to explore today — but I'd love to tell you more about what we're building at the Maker's Lab." Always steer back to the Lab, its technology, or Accenture's innovation work.`;
}

// -----------------------------------------------------------------------------
// CONVERSATION STATE
// -----------------------------------------------------------------------------
// The Claude API is stateless — we resend the full history each turn so Nova
// remembers the conversation. (System prompt is sent separately, not in here.)
const messages = [];

// Callbacks wired by initNovaChat — stored at module scope so sendToNova can
// reach them without being inside buildDebugUI's closure.
let _onEntity = null;
let _onSpeaking = null;

// Gate: Bedrock calls are blocked until enableBedrock() is called.
// Opened on first hold-to-talk press (IDLE → ACTIVE transition).
let bedrockEnabled = false;

export function enableBedrock()  { bedrockEnabled = true; }
export function disableBedrock() { bedrockEnabled = false; }
export function resetMessages()  { messages.length = 0; }

// Returns recent conversation as a readable string for context-aware scene generation
export function getCurrentConversationContext() {
  return messages.slice(-10).map(m =>
    `${m.role === 'user' ? 'Visitor' : 'Nova'}: ${m.content}`
  ).join('\n')
}

// Called by main.js to wire scene-shift notifications without a circular import
let _onSceneShift = null
export function setSceneShiftCallback(fn) { _onSceneShift = fn }
let _onDreamShift = null
export function setDreamShiftCallback(fn) { _onDreamShift = fn }

// Expose for dev-console use (so devs can test without pressing the button).
if (typeof window !== 'undefined') {
  window.enableBedrock = () => { bedrockEnabled = true; console.log('[nova] Bedrock enabled.'); };
}

// -----------------------------------------------------------------------------
// TTS OUTPUT ROUTING (setSinkId)
// -----------------------------------------------------------------------------
// IMPORTANT: The Web Speech API (speechSynthesis) used below CANNOT be routed
// to a chosen speaker — setSinkId only exists on media elements. So we keep a
// hidden <audio> element here and route IT to the dedicated speaker. Today the
// Web Speech path ignores this element; when we swap to a streaming TTS that
// returns an audio URL (in the `nova/` folder), call playRoutedAudio(url) and
// the voice will come out of the dedicated speaker.
let routedAudioEl = null;
let dedicatedSinkId = null;
let appendNovaLogMessage = null;
let currentNovaStreamingText = "";

function logChatMessage(who, text) {
  if (!appendNovaLogMessage || !text) return;
  appendNovaLogMessage(who, text);
}

function syncNovaStreamingLog(text) {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return;
  if (currentNovaStreamingText === normalized) return;
  currentNovaStreamingText = normalized;
  logChatMessage("Nova", normalized);
}

// Try to find the dedicated speaker by its label (from VITE_NOVA_SPEAKER) and
// route the <audio> element to it via setSinkId(). Enumerating devices with
// labels requires microphone permission to have been granted at least once.
async function setupDedicatedSpeaker() {
  routedAudioEl = new Audio();
  routedAudioEl.autoplay = true;

  const wantLabel = (import.meta.env.VITE_NOVA_SPEAKER || "").trim().toLowerCase();
  if (!wantLabel) return; // no preference — use system default

  // setSinkId is not supported in every browser (Chrome/Edge: yes; Safari: no).
  if (typeof routedAudioEl.setSinkId !== "function") {
    console.warn("setSinkId not supported in this browser — using default output.");
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const speaker = devices.find(
      (d) => d.kind === "audiooutput" && d.label.toLowerCase().includes(wantLabel)
    );
    if (speaker) {
      await routedAudioEl.setSinkId(speaker.deviceId);
      dedicatedSinkId = speaker.deviceId;
      console.log(`Nova voice routed to "${speaker.label}".`);
    } else {
      console.warn(`No audio output matching "${wantLabel}" — using default.`);
    }
  } catch (err) {
    console.warn("Could not route to dedicated speaker:", err);
  }
}

// For the FUTURE streaming-TTS path: play an audio URL through the routed
// element so it comes out of the dedicated speaker. (Unused by Web Speech.)
export function playRoutedAudio(url, { onStart, onEnd } = {}) {
  if (!routedAudioEl) routedAudioEl = new Audio();
  routedAudioEl.src = url;
  routedAudioEl.onplay = () => onStart && onStart();
  routedAudioEl.onended = () => onEnd && onEnd();
  routedAudioEl.play();
}

// -----------------------------------------------------------------------------
// TTS (Web Speech API) — the working "now" path
// -----------------------------------------------------------------------------
// Picks a pleasant English voice once the browser has loaded its voice list.
let novaVoice = null;
let currentUtterance = null;
function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  // Prefer a natural-sounding English voice; fall back to the first English one.
  novaVoice =
    voices.find((v) => /en/i.test(v.lang) && /(female|samantha|google|zira|aria)/i.test(v.name)) ||
    voices.find((v) => /en/i.test(v.lang)) ||
    voices[0];
}
if ("speechSynthesis" in window) {
  pickVoice();
  // Voices often load asynchronously, so re-pick when they become available.
  window.speechSynthesis.onvoiceschanged = pickVoice;
}

export function interruptNovaSpeech(onSpeaking) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
  onSpeaking && onSpeaking(false);
}

// speak(): say `text` aloud. onStart/onEnd let the caller flip novaActive so
// the avatar reacts while she's talking.
function speak(text, { onStart, onEnd } = {}) {
  if (!("speechSynthesis" in window) || !text) {
    // No TTS available — still fire the callbacks so the visual state is sane.
    onStart && onStart();
    onEnd && onEnd();
    return;
  }
  if (currentUtterance) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  currentUtterance = utterance;
  currentNovaStreamingText = "";
  if (novaVoice) utterance.voice = novaVoice;
  utterance.rate = 1.0;
  utterance.pitch = 1.05; // a touch brighter — Nova's voice
  utterance.onboundary = (event) => {
    const nextText = text.slice(0, event.charIndex + (event.charLength || 0)).replace(/\s+/g, ' ').trim();
    if (nextText) syncNovaStreamingLog(nextText);
  };
  utterance.onstart = () => {
    onStart && onStart();
  };
  utterance.onend = () => {
    if (currentUtterance === utterance) currentUtterance = null;
    currentNovaStreamingText = "";
    onEnd && onEnd();
  };
  utterance.onerror = () => {
    if (currentUtterance === utterance) currentUtterance = null;
    onEnd && onEnd();
  }; // never leave her "stuck speaking"
  window.speechSynthesis.speak(utterance);
}

// -----------------------------------------------------------------------------
// BEDROCK CLAUDE CALL
// -----------------------------------------------------------------------------
// Sends the running conversation to Claude on Bedrock via InvokeModel. The body
// is the standard Anthropic Messages shape MINUS the "model" field (Bedrock
// takes the model in modelId) and PLUS anthropic_version. The response `body` is
// a Uint8Array we decode and JSON.parse — same content[] shape as the public API.
// Exported so sceneTimer can call Claude for auto-shift generation.
// Pass customMessages to use a one-off message list; omit to use the live conversation.
export async function callClaude(customMessages) {
  const preSession = await fetchPreSessionData();
  const systemPrompt = buildSystemPrompt(preSession);

  const command = new InvokeModelCommand({
    modelId: NOVA_MODEL,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: ANTHROPIC_VERSION,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: customMessages ?? messages,
    }),
  });

  const response = await bedrock.send(command);
  const data = JSON.parse(new TextDecoder().decode(response.body));

  // The reply is in content[]; concatenate any text blocks.
  return data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// -----------------------------------------------------------------------------
// STRUCTURED RESPONSE PARSING
// -----------------------------------------------------------------------------
// Extracts all 7 XML tags from Nova's reply. Returns the mode and spoken text plus the
// entity/scene/audio/scent/notes fields for downstream scene, audio, and whiteboard use.
// A missing or unrecognised <mode> falls back to 'conversation'.
function extractStructuredResponse(reply) {
  const get = (tag) => {
    const match = reply.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    return match ? match[1].trim() : ''
  }

  const mode        = get('mode').toLowerCase() === 'dream' ? 'dream' : 'conversation'
  const spoken      = get('reply')
  const entity      = get('entity')
  const scenePrompt = get('scene_prompt')
  const audioPrompt = get('audio_prompt')
  const scentPrompt = get('scent_prompt')
  const notesRaw    = get('notes')
  const notes = notesRaw
    .split('\n')
    .map(l => l.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)

  return { mode, spoken, entity, scenePrompt, audioPrompt, scentPrompt, notes }
}

// Dream replies are "one short line" — the example line is two short sentences,
// so cap at 2 and don't expect a closing question.
function enforceDreamReplyStyle(response) {
  const sentences = response
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)

  if (sentences.length > 2) {
    console.warn('[nova-chat] Dream reply exceeded one short line — trimming:', response)
    return sentences.slice(0, 2).join(' ')
  }
  return response
}

// Trims Nova's spoken reply to 3 sentences max and warns when the model drifts.
function enforceResponseStyle(response) {
  const sentences = response
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)

  const trimmed = sentences.length > 3
    ? sentences.slice(0, 3).join(' ')
    : response

  if (sentences.length > 3) {
    console.warn('[nova-chat] Nova response exceeded 3 sentences — trimming:', response)
  }

  if (!trimmed.trim().endsWith('?')) {
    console.warn('[nova-chat] Nova response did not end with a question:', trimmed)
  }

  return trimmed
}

// =============================================================================
// sendToNova — public entry point for sending a visitor message
// =============================================================================
// Called by hold-to-talk (via transcript) and by the debug panel (via text input).
// force: true bypasses the bedrockEnabled gate — used only by the debug panel.
// Returns the spoken reply text, or null if gated/empty.
// =============================================================================
const COMPANY_NAMES = ['accenture', 'microsoft', 'google', 'amazon', 'ibm', 'apple', 'meta', 'salesforce'];
const TOPIC_MAP = { sustainability: 'sustainability', innovation: 'innovation', operations: 'operations' };

export async function sendToNova(text, { force = false } = {}) {
  if (!bedrockEnabled && !force) return null;
  const trimmed = text?.trim();
  if (!trimmed) return null;

  messages.push({ role: 'user', content: trimmed });

  try {
    const reply = await callClaude();
    messages.push({ role: 'assistant', content: reply });

    const { mode, spoken: rawSpoken, entity, scenePrompt, audioPrompt, scentPrompt, notes } = extractStructuredResponse(reply);
    const spoken = mode === 'dream' ? enforceDreamReplyStyle(rawSpoken) : enforceResponseStyle(rawSpoken);

    if (mode === 'dream') {
      // Dreams bypass the entity lock and shift cap — see onDreamDetected.
      if (scenePrompt) {
        onDreamDetected(scenePrompt, audioPrompt, scentPrompt);
        _onDreamShift?.(); // resets the auto-shift timer so it doesn't paint over the dream
      }
    } else if (entity) {
      const entityType = COMPANY_NAMES.some(n => entity.toLowerCase().includes(n)) ? 'company' : 'keyword';
      onEntityDetected(entity, entityType, scenePrompt, audioPrompt, scentPrompt);
      _onEntity?.({ entity, scenePrompt, audioPrompt, scentPrompt, notes });
      _onSceneShift?.(scenePrompt); // first keyword: immediate shift; subsequent: timer reset

      // Shift Nova's visual color to match a recognised topic keyword.
      const topicKey = TOPIC_MAP[entity.toLowerCase()];
      if (topicKey && typeof window.setTopic === 'function') window.setTopic(topicKey);
    }

    speak(spoken, {
      onStart:  () => _onSpeaking?.(true),
      onEnd:    () => _onSpeaking?.(false),
    });

    return spoken;
  } catch (err) {
    console.error('[nova-chat] Bedrock error:', err);
    throw err;
  }
}

// =============================================================================
// PUBLIC ENTRY POINT
// =============================================================================
// onEntity({ entity, scenePrompt, audioPrompt, scentPrompt, notes }) → called when Nova
//   detects a company/keyword; wires to scene, audio, and whiteboard handlers.
// onSpeaking(isSpeaking) → called true when Nova starts talking, false when done.
// =============================================================================
export function initNovaChat({ onEntity, onSpeaking }) {
  _onEntity = onEntity;
  _onSpeaking = onSpeaking;
  buildDebugUI();
  // Set up speaker routing in the background (no-op without VITE_NOVA_SPEAKER).
  setupDedicatedSpeaker();
}

// --- The debug input panel ---------------------------------------------------
// Dev-only text input that bypasses the bedrockEnabled gate (force: true).
// Use window.enableBedrock() in the console if you want the gate respected.
function buildDebugUI() {
  const panel = document.createElement("div");
  panel.id = "nova-debug";
  panel.innerHTML = `
    <div id="nova-log" style="font:12px/1.4 monospace; color:#d9c7ff; max-height:160px;
         overflow:auto; margin-bottom:8px; white-space:pre-wrap;"></div>
    <div style="display:flex; gap:6px;">
      <input id="nova-input" type="text" placeholder="Say something to Nova… (debug)"
        style="flex:1; padding:8px; border-radius:6px; border:1px solid #6a4aa0;
        background:#160a28; color:#fff; font:13px sans-serif; outline:none;" />
      <button id="nova-send" style="padding:8px 14px; border:0; border-radius:6px;
        background:#a100ff; color:#fff; font:13px sans-serif; cursor:pointer;">Send</button>
      <button id="nova-interrupt" style="padding:8px 12px; border:0; border-radius:6px;
        background:#3a2d58; color:#f5d8ff; font:13px sans-serif; cursor:pointer;">Interrupt</button>
    </div>`;
  Object.assign(panel.style, {
    position: "fixed", left: "16px", bottom: "16px", width: "360px", zIndex: "1000",
    background: "rgba(10,0,22,0.82)", padding: "12px", borderRadius: "10px",
    border: "1px solid #4a2d7a", backdropFilter: "blur(6px)",
  });
  document.body.appendChild(panel);

  const input   = panel.querySelector("#nova-input");
  const sendBtn = panel.querySelector("#nova-send");
  const interruptBtn = panel.querySelector("#nova-interrupt");
  const log = panel.querySelector("#nova-log");

  const print = (who, text) => {
    if (!text) return;
    const lines = (log.textContent || "").split("\n").filter(Boolean);
    const line = `${who}: ${text}`;
    const lastNovaLineIndex = [...lines].map((entry, index) => [entry, index]).filter(([entry]) => entry.startsWith("Nova: ")).at(-1)?.[1];

    if (typeof lastNovaLineIndex === "number") {
      lines[lastNovaLineIndex] = line;
    } else {
      lines.push(line);
    }

    log.textContent = lines.join("\n");
    log.scrollTop = log.scrollHeight;
  };
  appendNovaLogMessage = print;

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    print("system", "⚠️  No AWS credentials in .env — run the refresh command and restart Vite.");
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendBtn.disabled = true;
    print("you", text);

    try {
      const spoken = await sendToNova(text, { force: true });
      if (!spoken) print("system", "(no spoken response returned)");
    } catch (err) {
      print("system", "Error: " + err.message);
      console.error(err);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener("click", send);
  interruptBtn.addEventListener("click", () => {
    interruptNovaSpeech(_onSpeaking);
    print("system", "⏹ Nova interrupted.");
    input.focus();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
}

function handleEndOfSession() {
  // Reset the session state when the session ends.
  resetSession();
  console.log("Session state has been reset.");
}

export { handleEndOfSession };