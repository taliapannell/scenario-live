const endpoint = (import.meta.env.VITE_SCENT_URL || "").trim();

async function sendScent(slot) {
  if (!slot) return;
  if (!endpoint) {
    console.info("Scent bridge endpoint not configured; scent slot:", slot);
    return;
  }

  const baseUrl = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  const response = await fetch(`${baseUrl}/scent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot }),
  });
  if (!response.ok) throw new Error(`Scent request failed (${response.status})`);
}

function createScentControl() {
  let request = Promise.resolve();
  let lastSlot = null;

  return {
    release(slot) {
      // Re-diffusing the scent already in the room just over-saturates it.
      if (!slot || slot === lastSlot) return request;
      lastSlot = slot;
      request = request
        .catch(() => {})
        .then(() => sendScent(slot))
        .catch((error) => {
          lastSlot = null;
          console.error("Could not trigger scent:", error);
        });
      return request;
    },
  };
}

export { createScentControl };
