// =============================================================================
// Scene Shift Timer : sceneTimer.js
// -----------------------------------------------------------------------------
// Keeps the room feeling alive across a session:
//   - First entity/keyword detection starts the 3-minute auto-shift countdown
//   - Auto-shift fires every 3 minutes, generating a contextual scene via Claude
//   - A cooldown lock prevents two shifts from stacking within 8 seconds
//   - Any scene shift (keyword, sketch, or auto) resets the countdown
// =============================================================================

import { callClaude, getCurrentConversationContext } from './nova-chat.js'
import { onEnvironmentUpdate } from '../shared/environment-bridge.js'

let autoShiftTimer = null
let cooldownActive = false
let firstKeywordFired = false

const COOLDOWN_MS = 8000
const AUTO_SHIFT_INTERVAL_MS = 3 * 60 * 1000

// Call this whenever any scene shift happens — keyword, auto, or sketch
export function notifySceneShiftOccurred() {
  resetAutoShiftTimer()
  activateCooldown()
}

// Call this when the first keyword is detected in the client's speech.
// Only fires once per session — after that the 3-minute timer takes over.
export function onFirstKeywordDetected(scenePrompt) {
  if (firstKeywordFired) {
    notifySceneShiftOccurred() // subsequent keywords still reset the 3-minute timer
    return
  }
  if (cooldownActive) return
  firstKeywordFired = true
  fireSceneShift(scenePrompt)
}

// Wipes all state at the start or end of a session
export function resetSceneTimer() {
  if (autoShiftTimer) clearTimeout(autoShiftTimer)
  autoShiftTimer = null
  cooldownActive = false
  firstKeywordFired = false
}

function scheduleNextAutoShift() {
  autoShiftTimer = setTimeout(async () => {
    if (!cooldownActive) {
      await fireSceneShift(null)
    }
    scheduleNextAutoShift()
  }, AUTO_SHIFT_INTERVAL_MS)
}

function resetAutoShiftTimer() {
  if (autoShiftTimer) clearTimeout(autoShiftTimer)
  autoShiftTimer = null
  scheduleNextAutoShift()
}

function activateCooldown() {
  cooldownActive = true
  setTimeout(() => { cooldownActive = false }, COOLDOWN_MS)
}

async function fireSceneShift(prompt) {
  const scenePrompt = prompt ?? await generateContextualShift()
  await onEnvironmentUpdate({ scenePrompt, audioPrompt: null, mode: 'conversation' })
  notifySceneShiftOccurred()
}

async function generateContextualShift() {
  const context = getCurrentConversationContext()
  try {
    const responseText = await callClaude([
      {
        role: 'user',
        content: `Based on this conversation excerpt, write a single cinematic scene prompt describing a visual environment that feels like a natural progression of what's being discussed. One vivid sentence only. No explanation, just the scene description.\n\nConversation:\n${context}`
      }
    ])
    return responseText?.trim() ?? 'Vast open space, soft ambient light, architectural minimalism'
  } catch (err) {
    console.error('[sceneTimer] generateContextualShift failed — using fallback:', err)
    return 'Vast open space, soft ambient light, architectural minimalism'
  }
}
