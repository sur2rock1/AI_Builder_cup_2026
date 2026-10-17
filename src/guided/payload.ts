// ─────────────────────────────────────────────────────────────────
// What the browser is sent for a guided lesson: the script plus the stored
// pictures it points at (and only those). Isomorphic.
// ─────────────────────────────────────────────────────────────────

import type { GuidedScript, GuidedPayload } from './types';

/** The beat where the photo goes up: the first that shows, defines or gives an analogy; otherwise the second beat. */
export function photoBeatId(script: GuidedScript): string | null {
  const beats = script.beats;
  if (!beats.length) return null;
  if (script.photoBeat && beats.some((b) => b.id === script.photoBeat)) return script.photoBeat;
  const pick = beats.find((b) => b.kind === 'show') ?? beats.find((b) => b.kind === 'define') ?? beats.find((b) => b.kind === 'analogy') ?? beats[Math.min(1, beats.length - 1)];
  return pick.id;
}

export function buildGuidedPayload(
  script: GuidedScript,
  storedVisuals: Record<string, unknown> | null | undefined,
  photo?: { photoUrl: string | null; photoCaption: string | null } | null,
): GuidedPayload {
  // Every stored picture travels with the lesson: the server puts them on the board by stage, on request, or as a different explanation.
  const visuals: Record<string, unknown> = {};
  if (storedVisuals) for (const k of Object.keys(storedVisuals)) if (storedVisuals[k] && (storedVisuals[k] as any).steps) visuals[k] = storedVisuals[k];
  const beatId = photo?.photoUrl ? photoBeatId(script) : null;
  return beatId && photo?.photoUrl ? { script, visuals, photo: { url: photo.photoUrl, caption: photo.photoCaption, beatId } } : { script, visuals };
}
