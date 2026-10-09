// ─────────────────────────────────────────────────────────────────
// What the browser is sent for a guided lesson: the script plus the stored
// pictures it points at (and only those). Isomorphic.
// ─────────────────────────────────────────────────────────────────

import type { GuidedScript, GuidedPayload } from './types';

export function buildGuidedPayload(script: GuidedScript, storedVisuals: Record<string, unknown> | null | undefined): GuidedPayload {
  const visuals: Record<string, unknown> = {};
  for (const beat of script.beats) {
    for (const item of beat.board) {
      if (item.type === 'picture' && storedVisuals && storedVisuals[item.ref]) visuals[item.ref] = storedVisuals[item.ref];
    }
  }
  return { script, visuals };
}
