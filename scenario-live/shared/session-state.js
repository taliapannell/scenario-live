const sessionState = {
    entityLocked: false,      // true if a company has been detected and locked
    currentEntity: null,      // the company name that was locked (if any)
    currentScenePrompt: null,
    currentAudioPrompt: null,
    currentScentPrompt: null,
    shiftCount: 0,            // total environment shifts this session
    maxShifts: 2              // hard cap on shifts (companies + keywords combined)
};

let sceneHandlers = {
    triggerScene: null,
    playAudio: null,
    releaseScent: null,
    resetScene: null,
    resetAudio: null,
    resetScent: null,
};
let defaultScene = { scenePrompt: null, audioPrompt: null };

function configureSceneHandlers(handlers) {
    sceneHandlers = { ...sceneHandlers, ...handlers };
    if (handlers.defaultScene) defaultScene = { ...defaultScene, ...handlers.defaultScene };
}

function setCurrentScene(scenePrompt, audioPrompt = null, scentPrompt = null) {
    sessionState.currentScenePrompt = scenePrompt;
    sessionState.currentAudioPrompt = audioPrompt;
    sessionState.currentScentPrompt = scentPrompt;
}

function getDefaultScene() {
    return { ...defaultScene };
}

function onEntityDetected(entity, entityType, scenePrompt, audioPrompt, scentPrompt) {
    if (!entity) {
        return;  // No entity — do nothing
    }
    
    if (entityType === "company") {
        // Company detection: lock immediately and trigger shift (if not already locked)
        if (!sessionState.entityLocked) {
            sessionState.entityLocked = true;
            sessionState.currentEntity = entity;
            setCurrentScene(scenePrompt, audioPrompt, scentPrompt);
            sceneHandlers.triggerScene?.(scenePrompt);
            sceneHandlers.playAudio?.(audioPrompt);
            sceneHandlers.releaseScent?.(scentPrompt, entity);
            sessionState.shiftCount++;
        }
        // If already company-locked, silently ignore
    } else if (entityType === "keyword") {
        // Keyword detection: only trigger if company is not locked and we haven't hit maxShifts
        if (!sessionState.entityLocked && sessionState.shiftCount < sessionState.maxShifts) {
            setCurrentScene(scenePrompt, audioPrompt, scentPrompt);
            sceneHandlers.triggerScene?.(scenePrompt);
            sceneHandlers.playAudio?.(audioPrompt);
            sceneHandlers.releaseScent?.(scentPrompt, entity);
            sessionState.shiftCount++;
        }
        // Otherwise silently ignore
    }
}

// Direct scene shift used by sceneTimer — bypasses entity-lock and shift cap
// so the room stays alive regardless of whether keywords are still being detected
function triggerSceneShift(scenePrompt) {
  sceneHandlers.triggerScene?.(scenePrompt)
  const audioFile = defaultScene.audioFile ?? defaultScene.audioPrompt
  if (audioFile) sceneHandlers.playAudio?.(audioFile)
}

function resetSession() {
    sessionState.entityLocked = false;
    sessionState.currentEntity = null;
    sessionState.currentScenePrompt = defaultScene.scenePrompt;
    sessionState.currentAudioPrompt = defaultScene.audioPrompt;
    sessionState.currentScentPrompt = null;
    sessionState.shiftCount = 0;
    sceneHandlers.resetScene?.();
    sceneHandlers.resetAudio?.();
    sceneHandlers.resetScent?.();
}

export {
    sessionState,
    configureSceneHandlers,
    getDefaultScene,
    onEntityDetected,
    resetSession,
    setCurrentScene,
    triggerSceneShift,
};