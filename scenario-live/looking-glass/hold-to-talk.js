// =============================================================================
// hold-to-talk.js — Hold-to-talk button + SpeechRecognition
// =============================================================================
// App state machine:
//   idle   → app starts here; mic never captures; button shows pulsing ring
//   active → first button press transitions here; Bedrock calls enabled
//
// Exports:
//   initHoldToTalk({ onTranscript, onStateChange }) — mount the button to DOM
//   resetHoldToTalk()                               — return to idle (demo reset)
//   getAppState()                                   — 'idle' | 'active'

const SpeechRecognitionAPI =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

let appState = 'idle';
let recognition = null;
let pendingTranscript = '';
// Text from earlier recognition runs in the same hold — the browser ends and we
// restart recognition during long holds, and each run starts with empty results.
let committedTranscript = '';
let speechEndedAt = 0; // performance.now() at button release — start of the dream timing
let _onTranscript = null;
let _onLiveTranscript = null;
let _onStateChange = null;
let btnEl = null;
let isListening = false;
let micStream = null;
let micAudioCtx = null;
let micAnalyser = null;
let micLevelRaf = null;

export function getAppState() { return appState; }

function transitionTo(next) {
  if (appState === next) return;
  appState = next;
  syncButtonClass();
  _onStateChange?.(next);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const CSS = `
#htt-btn {
  position: fixed;
  bottom: 32px;
  right: 32px;
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: rgba(10, 0, 22, 0.88);
  border: 2px solid rgba(161, 0, 255, 0.55);
  color: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-family: sans-serif;
  z-index: 2000;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: border-color 0.2s, background 0.2s, transform 0.12s;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  outline: none;
  overflow: visible;
}

/* Pulsing ring — visible only in idle state */
#htt-btn .htt-ring {
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  border: 2px solid rgba(161, 0, 255, 0.35);
  pointer-events: none;
  opacity: 0;
}

#htt-btn.state-idle .htt-ring {
  animation: htt-pulse 2.6s ease-in-out infinite;
  opacity: 1;
}

@keyframes htt-pulse {
  0%,100% { transform: scale(1);     opacity: 0.5; }
  50%      { transform: scale(1.22); opacity: 0.1; }
}

#htt-btn .htt-icon {
  font-size: 22px;
  line-height: 1;
  pointer-events: none;
}

#htt-btn .htt-label {
  font-size: 8px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.65;
  pointer-events: none;
}

#htt-btn .htt-meter {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 12px;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255,255,255,0.12);
  opacity: 0;
  transition: opacity 0.15s ease;
}

#htt-btn .htt-meter-fill {
  display: block;
  height: 100%;
  width: 4%;
  border-radius: inherit;
  background: linear-gradient(90deg, #7cf7ff 0%, #a100ff 55%, #f4d0ff 100%);
  box-shadow: 0 0 8px rgba(124, 247, 255, 0.8);
  transition: width 0.08s linear;
}

#htt-btn.state-holding .htt-meter,
#htt-btn.state-processing .htt-meter {
  opacity: 1;
}

/* Button is held down */
#htt-btn.state-holding {
  background: rgba(161, 0, 255, 0.28);
  border-color: rgba(161, 0, 255, 1);
  transform: scale(1.1);
}

/* Released — waiting for SpeechRecognition to finish processing */
#htt-btn.state-processing {
  border-color: rgba(100, 200, 255, 0.9);
  animation: htt-proc-pulse 0.7s ease-in-out infinite alternate;
}

@keyframes htt-proc-pulse {
  from { opacity: 0.7; }
  to   { opacity: 1.0; }
}
`;

function injectCSS() {
  if (document.getElementById('htt-styles')) return;
  const el = document.createElement('style');
  el.id = 'htt-styles';
  el.textContent = CSS;
  document.head.appendChild(el);
}

function syncButtonClass() {
  if (!btnEl) return;
  btnEl.classList.remove('state-idle', 'state-active', 'state-holding', 'state-processing');
  btnEl.classList.add(appState === 'idle' ? 'state-idle' : 'state-active');
}

function setHoldState(state) {
  if (!btnEl) return;
  btnEl.classList.remove('state-holding', 'state-processing');
  if (state) btnEl.classList.add(state);
}

function setMicMeter(level) {
  const fill = btnEl?.querySelector('.htt-meter-fill');
  if (!fill) return;
  const clamped = Math.max(4, Math.min(100, Number(level) || 0));
  fill.style.width = `${clamped}%`;
}

// Mic setup happens once per page; the meter loop restarts on every hold and only
// runs while the button is held (including if setup finishes after release).
let micSetup = null;

function setupMicAnalyser() {
  micSetup ??= (async () => {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    micAnalyser = micAudioCtx.createAnalyser();
    micAnalyser.fftSize = 256;
    const source = micAudioCtx.createMediaStreamSource(micStream);
    source.connect(micAnalyser);
  })().catch((err) => {
    micSetup = null; // allow a retry on the next hold (e.g. after permission is granted)
    throw err;
  });
  return micSetup;
}

async function ensureMicMeter() {
  if (!navigator.mediaDevices?.getUserMedia) return;

  try {
    await setupMicAnalyser();
  } catch (err) {
    console.warn('[hold-to-talk] Could not access microphone for meter:', err);
    return;
  }
  if (!isListening || micLevelRaf !== null) return;

  const data = new Uint8Array(micAnalyser.frequencyBinCount);
  const tick = () => {
    if (!micAnalyser || !isListening) {
      micLevelRaf = null;
      return;
    }
    micAnalyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const average = sum / data.length;
    setMicMeter((average / 255) * 100);
    micLevelRaf = requestAnimationFrame(tick);
  };
  tick();
}

function clearMicMeter() {
  cancelAnimationFrame(micLevelRaf);
  micLevelRaf = null;
  setMicMeter(4);
}

// ─── SpeechRecognition ────────────────────────────────────────────────────────

function buildRecognition() {
  if (!SpeechRecognitionAPI) return null;
  const r = new SpeechRecognitionAPI();
  r.continuous = true;
  r.interimResults = true;
  r.lang = 'en-US';
  r.maxAlternatives = 1;

  r.onstart = () => {
    setHoldState('state-holding');
  };

  // e.results holds every result of this recognition run (finals plus the current
  // interim), so rebuild the whole utterance from it rather than from resultIndex.
  r.onresult = (e) => {
    let runText = '';
    for (let i = 0; i < e.results.length; i++) {
      runText += e.results[i][0].transcript + ' ';
    }

    const fullText = `${committedTranscript} ${runText}`.replace(/\s+/g, ' ').trim();
    if (fullText) {
      pendingTranscript = fullText;
      _onLiveTranscript?.(fullText);
    }
  };

  r.onend = () => {
    if (!isListening) {
      setHoldState(null);
      syncButtonClass();
      const text = pendingTranscript.trim();
      pendingTranscript = '';
      committedTranscript = '';
      if (text) _onTranscript?.(text, { speechEndedAt });
      return;
    }

    // Still holding — keep what was said so far and start a new run.
    committedTranscript = pendingTranscript;
    try {
      r.start();
    } catch (_) {}
  };

  r.onerror = (e) => {
    // 'no-speech' and 'aborted' are expected on quick presses — not errors. They can
    // also fire mid-hold after a pause, so keep anything already said.
    if (['no-speech', 'aborted'].includes(e.error)) {
      if (!isListening) {
        setHoldState(null);
        syncButtonClass();
      }
      return;
    }

    console.warn('[hold-to-talk] SpeechRecognition error:', e.error);
    setHoldState(null);
    syncButtonClass();
    pendingTranscript = '';
    committedTranscript = '';

    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      console.warn('[hold-to-talk] Microphone permission was denied. Allow mic access in the browser and hold again.');
    }
  };

  return r;
}

// ─── Event handlers ───────────────────────────────────────────────────────────

function startListening() {
  if (isListening) return;
  isListening = true;
  if (appState === 'idle') transitionTo('active');

  pendingTranscript = '';
  committedTranscript = '';
  setHoldState('state-holding');
  ensureMicMeter();

  if (!SpeechRecognitionAPI) {
    console.warn('[hold-to-talk] SpeechRecognition not available in this browser.');
    return;
  }

  if (recognition) {
    try { recognition.abort(); } catch (_) {}
  }

  recognition = buildRecognition();
  if (!recognition) {
    isListening = false;
    setHoldState(null);
    syncButtonClass();
    return;
  }

  try {
    recognition.start();
  } catch (err) {
    console.warn('[hold-to-talk] Could not start recognition:', err);
    isListening = false;
    setHoldState(null);
    syncButtonClass();
  }
}

function stopListening() {
  if (!isListening && !recognition) {
    clearMicMeter();
    setHoldState(null);
    syncButtonClass();
    return;
  }

  isListening = false;
  speechEndedAt = performance.now();
  if (recognition) {
    setHoldState('state-processing');
    try {
      recognition.stop();
    } catch (_) {}
    recognition = null;
  }

  clearMicMeter();
}

function onDown(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  if (e && e.pointerType === 'mouse' && e.button !== 0) return;
  startListening();
}

function onSpaceDown(e) {
  if (e.code !== 'Space') return;
  if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  e.preventDefault();
  if (e.repeat) return;
  startListening();
}

function onSpaceUp(e) {
  if (e.code !== 'Space') return;
  e.preventDefault();
  stopListening();
}

function onUp() {
  stopListening();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initHoldToTalk({ onTranscript, onLiveTranscript, onStateChange } = {}) {
  _onTranscript = onTranscript;
  _onLiveTranscript = onLiveTranscript;
  _onStateChange = onStateChange;

  injectCSS();

  btnEl = document.createElement('button');
  btnEl.id = 'htt-btn';
  btnEl.setAttribute('aria-label', 'Hold Space to talk to Nova');
  btnEl.innerHTML = `
    <span class="htt-ring"></span>
    <span class="htt-icon">🎙</span>
    <span class="htt-label">Hold Space</span>
    <span class="htt-meter"><span class="htt-meter-fill"></span></span>
  `;
  btnEl.classList.add('state-idle');
  document.body.appendChild(btnEl);

  btnEl.addEventListener('pointerdown', onDown);
  btnEl.addEventListener('pointerup', onUp);
  btnEl.addEventListener('pointerleave', () => {
    if (appState === 'active') onUp();
  });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  btnEl.addEventListener('mousedown', onDown);
  btnEl.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp, { passive: true });
  window.addEventListener('keydown', onSpaceDown);
  window.addEventListener('keyup', onSpaceUp);

  if (!SpeechRecognitionAPI) {
    console.warn('[hold-to-talk] SpeechRecognition API not available — button shown but mic capture inactive.');
  }

  console.log('[hold-to-talk] Initialized. App in IDLE state — mic inactive.');
}

export function resetHoldToTalk() {
  if (recognition) {
    try { recognition.abort(); } catch (_) {}
    recognition = null;
  }
  isListening = false;
  clearMicMeter();
  pendingTranscript = '';
  committedTranscript = '';
  transitionTo('idle');
  console.log('[hold-to-talk] Reset to IDLE state.');
}
