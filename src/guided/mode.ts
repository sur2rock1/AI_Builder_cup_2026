// ─────────────────────────────────────────────────────────────────
// Tutor mode — the one switch between the existing tutor and the guided tutor.
//
//   'standard' — the tutor exactly as it was before guided mode existed.
//   'guided'   — the tutor follows a prepared teaching script and writes one
//                growing board while it talks (src/guided/*).
//
// Resolution order (first one that is valid wins):
//   1. the session's own request  (page URL ?tutor=guided, or the on-screen switch)
//   2. the server default         (TUTOR_MODE environment variable)
//   3. 'standard'
//
// Guided mode is additive: if a concept has no guided script, the session
// quietly runs as 'standard'. Removing src/guided/ and its few hook lines
// returns the codebase to the previous behaviour.
//
// Isomorphic: no Node or DOM imports.
// ─────────────────────────────────────────────────────────────────

export const TUTOR_MODES = ['standard', 'guided'] as const;
export type TutorMode = typeof TUTOR_MODES[number];

export const DEFAULT_TUTOR_MODE: TutorMode = 'standard';

export function isTutorMode(v: unknown): v is TutorMode {
  return typeof v === 'string' && (TUTOR_MODES as readonly string[]).includes(v);
}

/** Pure resolver, shared by the browser and the server. */
export function resolveTutorMode(requested: unknown, serverDefault: unknown): TutorMode {
  if (isTutorMode(requested)) return requested;
  if (isTutorMode(serverDefault)) return serverDefault;
  return DEFAULT_TUTOR_MODE;
}
