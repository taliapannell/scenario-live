// =============================================================================
// Nova — Looking Glass output  : holoplay-display.js
// -----------------------------------------------------------------------------
// Renders the scene on a Looking Glass holographic display via HoloPlay.js,
// with a graceful fallback to the normal renderer when no device is present.
//
// HOW THE LOOKING GLASS WORKS (the short version):
//   A Looking Glass shows ~45–100 slightly different views of the scene at once,
//   so each eye/angle sees a different perspective → the image looks truly 3D.
//   HoloPlay.js renders those views into one big image (a "quilt"), then a
//   lenticular shader maps the quilt onto the display's lenses. We hand it our
//   scene + a special multi-view Camera and it does the rest.
//
// ⚠️ COMPATIBILITY: the installed `holoplay` (1.0.3) was written for three.js
// r102. This project uses r184, where two things it relies on were removed:
//   - THREE.Math      → renamed to THREE.MathUtils (r127)
//   - THREE.RGBFormat → removed (r137), use THREE.RGBAFormat
// It also reads `THREE` as a GLOBAL (window.THREE), not an import. So before we
// load the library we publish a shimmed global THREE that restores those names.
// (We can't patch the real import — ES module namespaces are read-only — so we
//  make a shallow copy and add the missing aliases to that.)
// =============================================================================

import * as THREE from "three";

// Build a shimmed global `THREE` so the old HoloPlay library finds the names it
// expects. Object.assign copies all the real exports (same class references),
// then we add back the two removed aliases. Must run BEFORE holoplay loads.
function publishGlobalThree() {
  if (window.THREE && window.THREE.__novaShim) return; // already done
  const shim = Object.assign({}, THREE, {
    Math: THREE.MathUtils, // HoloPlay calls THREE.Math.degToRad / .lerp
    RGBFormat: THREE.RGBAFormat, // HoloPlay's render target format
    __novaShim: true,
  });
  window.THREE = shim;
  globalThis.THREE = shim;
}

// --- Quietly detect a Looking Glass via holoplay-core --------------------------
// HoloPlay's own calibration code pops alert()/confirm() dialogs when no device
// is found, which we never want in dev. So we talk to the Looking Glass Bridge
// (a local websocket on :11222) ourselves and just resolve true/false. No UI.
async function detectLookingGlass(timeoutMs = 2000) {
  let HoloPlayCore;
  try {
    HoloPlayCore = await import("holoplay-core");
  } catch {
    return false; // library missing — treat as "no device"
  }

  return new Promise((resolve) => {
    let settled = false;
    let client = null;
    const finish = (present) => {
      if (settled) return;
      settled = true;
      try {
        client && client.disconnect();
      } catch {
        /* ignore */
      }
      resolve(present);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    try {
      // The Client connects to the Bridge. initCallback gets {devices: [...]};
      // errCallback fires if the Bridge isn't running (no websocket).
      client = new HoloPlayCore.Client(
        (data) => {
          clearTimeout(timer);
          finish(Boolean(data && data.devices && data.devices.length > 0));
        },
        () => {
          clearTimeout(timer);
          finish(false);
        },
        () => {} // closeCallback — ignored
      );
    } catch {
      clearTimeout(timer);
      finish(false);
    }
  });
}

// =============================================================================
// tryEnableHoloPlay() — attempt to switch rendering onto the Looking Glass.
// -----------------------------------------------------------------------------
// Returns { render, camera, mode } on success, or null to keep the fallback.
//
//   scene            : the THREE.Scene to render
//   fallbackRenderer : the standard WebGLRenderer (its canvas is removed on
//                      success so only the HoloPlay canvas remains)
//   cameraPosition   : where to place the holographic camera (Vector3)
//   cameraTarget     : what it looks at (Vector3)
//
// URL overrides for testing:
//   ?holoplay=off → never use HoloPlay (skip detection entirely)
//   ?holoplay=on  → force HoloPlay even if detection fails (on-device debugging)
//   ?holoplay=2d  → HoloPlay's flat 2D debug view (no quilt) on a normal monitor
// =============================================================================
export async function tryEnableHoloPlay({
  scene,
  fallbackRenderer,
  cameraPosition,
  cameraTarget,
}) {
  const mode = new URLSearchParams(window.location.search).get("holoplay");

  if (mode === "off") return null; // forced fallback

  // Detect a device unless we're forcing it on / into 2D debug.
  const forcing = mode === "on" || mode === "2d";
  if (!forcing) {
    const present = await detectLookingGlass();
    if (!present) return null; // no Looking Glass → keep the normal renderer
  }

  try {
    // Publish the shimmed global THREE, THEN dynamically import HoloPlay so its
    // module-eval (which references THREE) sees the shim.
    publishGlobalThree();
    const HoloPlay = await import("holoplay");

    // The HoloPlay renderer wraps its own WebGLRenderer + quilt pipeline.
    // render2d:true gives a flat preview for debugging on an ordinary monitor.
    const renderer = new HoloPlay.Renderer({ render2d: mode === "2d" });

    // The HoloPlay Camera is a multi-view (ArrayCamera) rig. We position it and
    // aim it once; HoloPlay fans out the sub-views around it every frame.
    const camera = new HoloPlay.Camera();
    camera.position.copy(cameraPosition);
    camera.lookAt(cameraTarget);

    // Swap canvases: drop the standard one, show HoloPlay's.
    if (fallbackRenderer && fallbackRenderer.domElement && fallbackRenderer.domElement.parentNode) {
      fallbackRenderer.domElement.parentNode.removeChild(fallbackRenderer.domElement);
    }
    document.body.appendChild(renderer.domElement);
    // Free the fallback renderer's GPU resources — we won't use it anymore.
    try {
      fallbackRenderer && fallbackRenderer.dispose();
    } catch {
      /* ignore */
    }

    return {
      mode: mode === "2d" ? "holoplay-2d" : "holoplay-quilt",
      camera,
      render: () => renderer.render(scene, camera),
    };
  } catch (err) {
    // Any incompatibility (e.g. an r184 API HoloPlay can't handle) → fall back
    // gracefully instead of crashing the whole app.
    console.warn("HoloPlay init failed — falling back to standard renderer:", err);
    return null;
  }
}
