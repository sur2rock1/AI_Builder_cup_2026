// Guided mode — pace. The learner chooses how fast the tutor goes.
// Pace changes the tutor's instructions (how much per turn, how much checking in)
// and how slowly the board writes. It never changes WHAT is taught.

export const PACES = ['slow', 'steady', 'quick'] as const;
export type Pace = (typeof PACES)[number];
export const DEFAULT_PACE: Pace = 'steady';

export const isPace = (v: unknown): v is Pace => typeof v === 'string' && (PACES as readonly string[]).includes(v);
export const resolvePace = (v: unknown): Pace => (isPace(v) ? v : DEFAULT_PACE);

/** Added to every beat instruction, so a change made mid-lesson applies from the next beat. */
export function paceGuidance(pace: Pace): string {
  switch (pace) {
    case 'slow':
      return 'PACE: SLOW. The learner asked for a slow pace. Speak in short sentences with a clear pause between ideas. '
        + 'Give ONE idea at a time, then check in ("Does that make sense so far?") and wait for their answer before the next idea. '
        + 'Use the simplest words you can, and add one small everyday example. Spread this beat over several short turns.';
    case 'quick':
      return 'PACE: QUICK. The learner asked for a brisk pace. Get to the point, skip recaps and extra examples, '
        + 'and ask nothing beyond the beat\'s own question. Stay clear and kind.';
    default:
      return 'PACE: STEADY. Do not rush. Cover one idea, leave a short pause, then the next. Check in once during the beat ("Okay so far?"), '
        + 'and give the learner room to speak.';
  }
}

/** Milliseconds between one board item appearing and the next, while the tutor talks through a beat. */
export const paceRevealMs = (pace: Pace): number => (pace === 'slow' ? 5000 : pace === 'quick' ? 2200 : 3500);
