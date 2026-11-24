// =============================================================================
// Nova — Claude on Bedrock + Text-to-Speech (TTS)  : nova-chat.js
// -----------------------------------------------------------------------------
// This module is the "brain + voice" wiring for Nova. It:
//   1. Builds a small DEBUG text input (NOT the final client UI — a dev tool).
//   2. Sends the typed message to Claude on Amazon Bedrock (InvokeModel).
//   3. Parses 8 structured XML tags out of Claude's reply. In conversation mode it
//      calls onEntity({ entity, scenePrompt, audioPrompt, scentPrompt, notes }) so the
//      scene, audio, and whiteboard can respond to what the visitor mentioned; in
//      Dream Mode the visitor's own description goes straight to the walls.
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
import { sessionState, resetSession, onEntityDetected, onDreamDetected } from "../shared/session-state.js";
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
function buildSystemPrompt(preSession, currentDreamPrompt = null) {
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
- Keep <reply> to one short line (about 10 words), then stop. Leave <entity> empty.
  The dream is already appearing as you speak, so the reply is a statement:
  never ask a question or ask permission to show it.
- If they ask to change a dream ("add...", "make it..."), modify the previous
  <scene_prompt> instead of rewriting it.
- If the request is inappropriate, redirect to a safe, whimsical version.
  Keep the harmless heart of the idea and make the rest playful (e.g. a
  battlefield becomes toy soldiers parading through a candy-colored meadow).
  Always write a new <scene_prompt> for it; never refuse, and never reuse the
  previous scene.
Otherwise set <mode>conversation</mode> and behave as normal.
${currentDreamPrompt ? `
CURRENT DREAM: The walls are showing this dream right now:
${currentDreamPrompt}
If they ask to change it, start from that exact text and change only what they asked for.
` : ""}
After every reply, you MUST return the following eight XML tags on their own lines at the very end of your response, in exactly this order:

<mode>Either "conversation" or "dream".</mode>

<dream_edit>"yes" if this dream changes the current dream, "no" for a brand-new dream or in conversation mode.</dream_edit>

<reply>Your spoken response to the visitor — 3 sentences or fewer, always ending with a question. In dream mode, one short line.</reply>

<entity>The company name or industry keyword the visitor mentioned (e.g. "microsoft", "sustainability", "healthcare"). If they mention both a company and a keyword, use the company. If none, leave empty.</entity>

<scene_prompt>A cinematic description of a real physical space that matches the conversation. Describe motion and atmosphere — not a static image. Always professional and immersive. In dream mode, return the dream scene described above. Otherwise, if no entity was detected, return exactly: "Futuristic Maker's Lab in New York City. Industrial loft space with exposed brick and cool graffiti murals. 3D printers actively building objects on workbenches. Robots moving purposefully between workstations. Holographic displays floating mid-air. Chemistry glassware glowing on shelves. Purple ambient lighting. Cinematic depth, immersive atmosphere."</scene_prompt>

<audio_prompt>One sentence describing the sonic environment that matches the scene. Used to select a pre-sourced audio file — do not describe music, only ambient sound.</audio_prompt>

<scent_prompt>A short comma-separated list of the scents in the scene (e.g. "Rain-dampened concrete, exhaust, street food"). Used to select a scent cartridge — describe smells only, nothing else.</scent_prompt>

<notes>
- A relevant fact or insight about the detected entity
- An Accenture or Maker's Lab angle on that entity
- One more relevant point
Leave all three lines empty if no entity was detected.
</notes>

These tags are machine instructions — they are stripped before your words are spoken. Never refer to them in your reply.

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
export function resetMessages()  { messages.length = 0; conversationEpoch++; }

// Bumped by resetMessages so a reply still in flight from the previous session is
// dropped instead of landing in the next client's empty history.
let conversationEpoch = 0;
// Turns run one at a time, in order, so quick back-to-back holds can't interleave
// their messages or talk over each other.
let turnQueue = Promise.resolve();

// Returns recent conversation as a readable string for context-aware scene generation.
// Nova's turns are reduced to what she actually said, without the machine tags.
export function getCurrentConversationContext() {
  return messages.slice(-10).map(m =>
    m.role === 'user'
      ? `Visitor: ${m.content}`
      : `Nova: ${extractStructuredResponse(m.content).spoken || m.content}`
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
// --- Debug log --------------------------------------------------------------
// Every message gets its own line. Text that streams in (Nova speaking word by
// word, the visitor's live transcript) passes a streamKey and only updates its own
// in-progress line; endLogStream(key) closes that line so the next one starts fresh.
const streamingLogLines = {};

function logLine(who, text, streamKey = null) {
  const log = typeof document !== "undefined" && document.querySelector("#nova-log");
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!log || !normalized) return;

  let lineEl = streamKey ? streamingLogLines[streamKey] : null;
  if (!lineEl) {
    lineEl = document.createElement("div");
    log.appendChild(lineEl);
    if (streamKey) streamingLogLines[streamKey] = lineEl;
  }
  lineEl.textContent = `${who}: ${normalized}`;
  log.scrollTop = log.scrollHeight;
}

function endLogStream(streamKey) {
  delete streamingLogLines[streamKey];
}

// Used by main.js for hold-to-talk: live text while holding, then final on release.
export function logVisitorSpeech(text, { final = false } = {}) {
  logLine("User", text, "visitor");
  if (final) endLogStream("visitor");
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
  endLogStream("nova");
  onSpeaking && onSpeaking(false);
}

// speak(): say `text` aloud. onStart/onEnd let the caller flip novaActive so
// the avatar reacts while she's talking.
function speak(text, { onStart, onEnd } = {}) {
  if (!("speechSynthesis" in window) || !text) {
    // No TTS available — still log the line and fire the callbacks so the visual state is sane.
    logLine("Nova", text);
    onStart && onStart();
    onEnd && onEnd();
    return;
  }
  if (currentUtterance) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
  endLogStream("nova"); // each reply gets its own log line
  const utterance = new SpeechSynthesisUtterance(text);
  currentUtterance = utterance;
  if (novaVoice) utterance.voice = novaVoice;
  utterance.rate = 1.0;
  utterance.pitch = 1.05; // a touch brighter — Nova's voice
  utterance.onboundary = (event) => {
    if (currentUtterance !== utterance) return;
    logLine("Nova", text.slice(0, event.charIndex + (event.charLength || 0)), "nova");
  };
  utterance.onstart = () => {
    onStart && onStart();
  };
  // A cancelled utterance still fires onend/onerror. Only the current one may report
  // "done" — otherwise cutting off a reply would mark Nova as not speaking mid-sentence
  // of the next one. (interruptNovaSpeech reports "done" itself.)
  const finish = () => {
    if (currentUtterance !== utterance) return;
    currentUtterance = null;
    logLine("Nova", text, "nova"); // full line, even if the voice sent no boundary events
    endLogStream("nova");
    onEnd && onEnd();
  };
  utterance.onend = finish;
  utterance.onerror = finish; // never leave her "stuck speaking"
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
// Pass system to replace Nova's tagged-reply system prompt (e.g. for plain scene text).
export async function callClaude(customMessages, { system } = {}) {
  const systemPrompt = system ?? buildSystemPrompt(await fetchPreSessionData(), sessionState.dreamScenePrompt);

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
// Extracts all 8 XML tags from Nova's reply. Returns the mode and spoken text plus the
// entity/scene/audio/scent/notes fields for downstream scene, audio, and whiteboard use.
// A missing or unrecognised <mode> falls back to 'conversation'; dreamEdit is only
// true for an explicit "yes" in dream mode.
function extractStructuredResponse(reply) {
  const get = (tag) => {
    const match = reply.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    return match ? match[1].trim() : ''
  }

  const mode        = get('mode').toLowerCase() === 'dream' ? 'dream' : 'conversation'
  const dreamEdit   = mode === 'dream' && get('dream_edit').toLowerCase() === 'yes'
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

  return { mode, dreamEdit, spoken, entity, scenePrompt, audioPrompt, scentPrompt, notes }
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
// Whole-word match, so keywords like "metal fabrication" or "metaverse" aren't treated
// as Meta (which would lock the scene for the rest of the session).
const COMPANY_PATTERNS = COMPANY_NAMES.map(n => new RegExp(`\\b${n}\\b`, 'i'));
function isCompanyEntity(entity) {
  return COMPANY_PATTERNS.some(p => p.test(entity));
}
const TOPIC_MAP = { sustainability: 'sustainability', innovation: 'innovation', operations: 'operations' };

// Logs "client finishes speaking" → "new scene accepted by StreamDiffusion" for every
// dream, split into the Claude and StreamDiffusion stages. "Visible" is approximated by
// StreamDiffusion acknowledging the prompt — the browser can't see the projectors.
// Recent timings are kept on window.dreamTimings for console inspection.
const dreamTimings = [];
if (typeof window !== 'undefined') window.dreamTimings = dreamTimings;

async function logDreamTiming(speechEndedAt, claudeDoneAt, sceneRequest, isEdit) {
  const result = await Promise.resolve(sceneRequest).catch(() => ({ ok: false }));
  const sceneDoneAt = performance.now();
  const timing = {
    at: new Date().toISOString(),
    isEdit,
    claudeMs: Math.round(claudeDoneAt - speechEndedAt),
    sceneMs: Math.round(sceneDoneAt - claudeDoneAt),
    totalMs: Math.round(sceneDoneAt - speechEndedAt),
    usedFallback: Boolean(result?.usedFallback),
    ok: result?.ok !== false,
  };
  dreamTimings.push(timing);
  if (dreamTimings.length > 50) dreamTimings.shift();
  console.info(
    `[dream-timing] speech→scene ${timing.totalMs}ms (to Claude reply ${timing.claudeMs}ms, StreamDiffusion ${timing.sceneMs}ms)` +
    `${isEdit ? ' [edit]' : ''}${timing.usedFallback ? ' [fallback scene]' : ''}${timing.ok ? '' : ' [FAILED]'}`
  );
}

// speechEndedAt: performance.now() when the client released push-to-talk. The debug
// panel omits it, so timing starts at send.
export async function sendToNova(text, { force = false, speechEndedAt = performance.now() } = {}) {
  if (!bedrockEnabled && !force) return null;
  const trimmed = text?.trim();
  if (!trimmed) return null;

  const turn = turnQueue.then(() => runTurn(trimmed, speechEndedAt));
  turnQueue = turn.catch(() => {});
  return turn;
}

async function runTurn(trimmed, speechEndedAt) {
  const epoch = conversationEpoch;
  const userMessage = { role: 'user', content: trimmed };
  messages.push(userMessage);

  try {
    const reply = await callClaude();
    const claudeDoneAt = performance.now();
    if (epoch !== conversationEpoch) return null; // session was reset while waiting
    messages.push({ role: 'assistant', content: reply });

    const { mode, dreamEdit, spoken: rawSpoken, entity, scenePrompt, audioPrompt, scentPrompt, notes } = extractStructuredResponse(reply);
    const spoken = mode === 'dream' ? enforceDreamReplyStyle(rawSpoken) : enforceResponseStyle(rawSpoken);

    if (mode === 'dream') {
      // Dreams bypass the entity lock and shift cap — see onDreamDetected.
      if (scenePrompt) {
        const sceneRequest = onDreamDetected(scenePrompt, audioPrompt, scentPrompt, { isEdit: dreamEdit });
        _onDreamShift?.(); // resets the auto-shift timer so it doesn't paint over the dream
        logDreamTiming(speechEndedAt, claudeDoneAt, sceneRequest, dreamEdit);
      }
    } else if (entity) {
      const entityType = isCompanyEntity(entity) ? 'company' : 'keyword';
      onEntityDetected(entity, entityType, scenePrompt, audioPrompt, scentPrompt);
      _onEntity?.({ entity, scenePrompt, audioPrompt, scentPrompt, notes });
      _onSceneShift?.(); // restarts the auto-shift countdown; onEntityDetected did the shift

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
    // Take the unanswered message back out so the next turn doesn't send two user
    // messages in a row (Claude would answer the stale one).
    const i = messages.lastIndexOf(userMessage);
    if (i !== -1) messages.splice(i, 1);
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

  const print = (who, text) => logLine(who, text);

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