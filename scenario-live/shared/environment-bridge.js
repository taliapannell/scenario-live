import { sessionState } from "./session-state.js";

let visualUpdater = null;
let audioUpdater = null;

export function configureEnvironmentBridge({ updateStreamDiffusion, updateSonos }) {
  visualUpdater = updateStreamDiffusion ?? null;
  audioUpdater = updateSonos ?? null;
}

export function updateStreamDiffusion(scenePrompt) {
  if (!visualUpdater) {
    throw new Error("StreamDiffusion updater is not configured");
  }
  return visualUpdater(scenePrompt);
}

export function updateSonos(audioPrompt) {
  if (!audioUpdater) {
    throw new Error("Sonos updater is not configured");
  }
  return audioUpdater(audioPrompt);
}

export async function onEnvironmentUpdate({ scenePrompt, audioPrompt, mode, responseArrivedAt } = {}) {
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const arrivedAt = Number.isFinite(responseArrivedAt) ? responseArrivedAt : now();
  const normalizedMode = mode === "dream" ? "dream" : "conversation";
  const visualPrompt = scenePrompt?.trim();
  const audioValue = audioPrompt?.trim();

  if (!visualPrompt) {
    console.warn("[Bridge] Missing <scene_prompt>, skipping visual trigger");
  }
  if (!audioValue) {
    console.warn("[Bridge] Missing <audio_prompt>, skipping audio trigger");
  }

  if (!visualPrompt && !audioValue) {
    return;
  }

  if (normalizedMode === "conversation" && sessionState.shiftCount >= sessionState.maxShifts) {
    console.log("[Bridge] Shift limit reached, skipping");
    return;
  }

  if (normalizedMode === "conversation") {
    sessionState.shiftCount++;
  }

  const tasks = [];

  if (visualPrompt) {
    tasks.push(
      Promise.resolve()
        .then(() => updateStreamDiffusion(visualPrompt))
        .then(
          (value) => ({ kind: "visual", value, finishedAt: now(), failed: false }),
          (reason) => ({ kind: "visual", reason, finishedAt: now(), failed: true }),
        ),
    );
  }

  if (audioValue) {
    tasks.push(
      Promise.resolve()
        .then(() => updateSonos(audioValue))
        .then(
          (value) => ({ kind: "audio", value, finishedAt: now(), failed: false }),
          (reason) => ({ kind: "audio", reason, finishedAt: now(), failed: true }),
        ),
    );
  }

  const results = await Promise.allSettled(tasks);

  let visualMs = null;
  let audioMs = null;

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value.kind === "visual") {
        visualMs = Math.round(result.value.finishedAt - arrivedAt);
        if (result.value.failed) {
          console.error("[Bridge] Visual failed:", result.value.reason);
        }
      } else {
        audioMs = Math.round(result.value.finishedAt - arrivedAt);
        if (result.value.failed) {
          console.error("[Bridge] Audio failed:", result.value.reason);
        }
      }
    }
  }

  if (visualMs !== null || audioMs !== null) {
    const visualText = visualMs === null ? "skipped" : `${visualMs}ms`;
    const audioText = audioMs === null ? "skipped" : `${audioMs}ms`;
    const gap = visualMs !== null && audioMs !== null ? `${Math.abs(audioMs - visualMs)}ms` : "n/a";
    console.log(`[Bridge] visual: ${visualText} | audio: ${audioText} | gap: ${gap}`);
  }
}
