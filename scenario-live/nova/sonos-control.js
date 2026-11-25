const endpoint = (import.meta.env.VITE_SONOS_URL || "").trim();
const room = (import.meta.env.VITE_SONOS_ROOM || "").trim();

async function sendAudio(file) {
  if (!file) return;
  if (!endpoint || !room) {
    console.info("Sonos settings not configured; audio file:", file);
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
        .then(() => sendAudio(file));
      return request;
    },
  };
}

export { createSonosControl };
