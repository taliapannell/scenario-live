const endpoint = (import.meta.env.VITE_SONOS_URL || "http://localhost:5005").trim();
const room = (import.meta.env.VITE_SONOS_ROOM || "Immersive Experience Room").trim();

async function sendAudio(file) {
  if (!file) return;
  if (!endpoint) {
    console.info("Sonos endpoint not configured; audio file:", file);
    return;
  }

  const baseUrl = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  const response = await fetch(
    `${baseUrl}/${encodeURIComponent(room)}/clip/${encodeURIComponent(file)}`,
  );
  if (!response.ok) throw new Error(`Sonos request failed (${response.status})`);
}

function createSonosControl() {
  let request = Promise.resolve();

  return {
    play(file) {
      request = request
        .catch(() => {})
        .then(() => sendAudio(file))
        .catch((error) => console.error("Could not control Sonos:", error));
      return request;
    },
  };
}

export { createSonosControl };
