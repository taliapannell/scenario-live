const endpoint = (import.meta.env.VITE_STREAM_DIFFUSION_URL || "").trim();

// seed is only sent when set (Dream Mode). The server must honour it for dream
// edits to morph smoothly instead of jumping to a new image.
async function sendPrompt(prompt, { seed } = {}) {
  if (!prompt) return;
  if (!endpoint) {
    console.info("StreamDiffusion endpoint not configured; scene prompt:", prompt, seed ?? "");
    return;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(seed == null ? { prompt } : { prompt, seed }),
  });
  if (!response.ok) throw new Error(`StreamDiffusion request failed (${response.status})`);
}

// fallbackPrompt: calm scene sent once when a generation fails, so the room never
// goes blank or shows an error. triggerScene resolves to { ok, usedFallback } and
// never rejects.
function createStreamDiffusion({ fallbackPrompt = null } = {}) {
  let request = Promise.resolve();

  return {
    triggerScene(prompt, options = {}) {
      request = request
        .catch(() => {})
        .then(() => sendPrompt(prompt, options))
        .then(() => ({ ok: true, usedFallback: false }))
        .catch(async (error) => {
          console.error("Could not trigger StreamDiffusion:", error);
          if (!fallbackPrompt || prompt === fallbackPrompt) return { ok: false, usedFallback: false };
          try {
            await sendPrompt(fallbackPrompt);
            console.warn("StreamDiffusion fell back to the calm scene.");
            return { ok: false, usedFallback: true };
          } catch (fallbackError) {
            console.error("StreamDiffusion fallback scene also failed:", fallbackError);
            return { ok: false, usedFallback: false };
          }
        });
      return request;
    },
  };
}

export { createStreamDiffusion };
