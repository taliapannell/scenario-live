const endpoint = (import.meta.env.VITE_STREAM_DIFFUSION_URL || "").trim();

async function sendPrompt(prompt) {
  if (!prompt) return;
  if (!endpoint) {
    console.info("StreamDiffusion endpoint not configured; scene prompt:", prompt);
    return;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) throw new Error(`StreamDiffusion request failed (${response.status})`);
}

function createStreamDiffusion() {
  let request = Promise.resolve();

  return {
    triggerScene(prompt) {
      request = request
        .catch(() => {})
        .then(() => sendPrompt(prompt))
        .catch((error) => console.error("Could not trigger StreamDiffusion:", error));
      return request;
    },
  };
}

export { createStreamDiffusion };
