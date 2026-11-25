/**
 * Mock Server — assignKeychain API
 * Ticket: NFC-3
 *
 * Usage:
 *   npm install express cors
 *   node mock-server.js
 * 
---

## Endpoint

| Field  | Value                  |
|--------|------------------------|
| Method | `POST`                 |
| Path   | `/sessions/assign`     |
| Base URL (mock) | `http://localhost:3001` |
| Full mock URL | `http://localhost:3001/sessions/assign` |

---

## Request

**Headers:**
```
Content-Type: application/json
```
 */

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3001;

app.use(cors()); // Allow requests from any frontend origin
app.use(express.json());

let currentPreSession = null;

app.get("/api/pre-session", (req, res) => {
  return res.json({ data: currentPreSession });
});

app.post("/api/pre-session", (req, res) => {
  const { clientName, industry, contextNotes } = req.body;

  if (!clientName || !industry) {
    return res.status(400).json({
      error: "clientName and industry are required",
    });
  }

  currentPreSession = { clientName, industry, contextNotes };
  console.log("Pre-session data loaded:", currentPreSession);
  return res.json({ success: true });
});

app.post("/sessions/assign", (req, res) => {
  const { tagId, sessionId } = req.body;

  // 400 — Missing fields
  if (!tagId || !sessionId) {
    return res.status(400).json({
      success: false,
      error: "BAD_REQUEST",
      message: "tagId and sessionId are required",
    });
  }

  // 404 — Simulate tag/session not found
  if (tagId === "not-found" || sessionId === "not-found") {
    return res.status(404).json({
      success: false,
      error: "NOT_FOUND",
      message: "Session or tag not found",
    });
  }

  // 409 — Simulate tag already assigned
  if (tagId === "conflict" || sessionId === "conflict") {
    return res.status(409).json({
      success: false,
      error: "CONFLICT",
      message: "This tag is already assigned to a session",
    });
  }

  // 500 — Simulate server error
  if (tagId === "error500" || sessionId === "error500") {
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
  }

  // 200 — Success
  return res.status(200).json({
    success: true,
    message: "Keychain assigned successfully",
    data: {
      tagId,
      sessionId,
      assignedAt: new Date().toISOString(),
    },
  });
});

// Catch-all for unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "NOT_FOUND",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

function getPreSessionData() {
  return currentPreSession;
}

module.exports = { app, getPreSessionData };

app.listen(PORT, () => {
  console.log(`\n✅ Mock server running at http://localhost:${PORT}`);
  console.log(`   Endpoint: POST http://localhost:${PORT}/sessions/assign\n`);
  console.log("   Test cases:");
  console.log('   tagId: "abc123"    → 200 success');
  console.log('   tagId: ""          → 400 bad request');
  console.log('   tagId: "not-found" → 404 not found');
  console.log('   tagId: "conflict"  → 409 conflict');
  console.log('   tagId: "error500"  → 500 server error\n');
});