// Guided mode — pace. The learner chooses how fast the tutor goes.
// Pace changes the tutor's instructions (how much per turn, how much checking in: only the lesson's own questions at steady and quick)
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
      return 'PACE: SLOW. The learner asked for a slow pace. Speak in short sentences, one idea at a time, in the simplest words you can, '
        + 'and add one small everyday example when an idea is new. Give them time: when you ask something, wait for their answer.';
    case 'quick':
      return 'PACE: QUICK. The learner asked for a brisk pace. Get to the point, skip recaps and extra examples, '
        + 'and keep your own questions few and short. Stay clear and kind.';
    default:
      return 'PACE: STEADY. Calm and unhurried, one idea at a time, like a good tutor talking at a board, '
        + 'with a short question to the learner now and then.';
  }
}

/** Milliseconds between one board item appearing and the next, while the tutor talks through a beat. */
export const paceRevealMs = (pace: Pace): number => (pace === 'slow' ? 5000 : pace === 'quick' ? 2200 : 3500);
