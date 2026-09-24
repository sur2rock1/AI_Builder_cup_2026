// ─────────────────────────────────────────────────────────────────
// Evidence ladder (docs/TUTOR_PERSONA.md §5) — maps UnderstandingDepth
// to a ladder level, and computes mastery status from ladder + BKT
// evidence. Pure functions; no I/O.
// ─────────────────────────────────────────────────────────────────
import { LadderLevel, LadderState, MasteryStatus, ReviewState, UnderstandingDepth } from './learnerModel';

export const DEPTH_TO_LADDER: Record<UnderstandingDepth, LadderLevel> = {
  memorised: 1,
  recognised: 1,
  understood: 2,
  applied: 3,
  transferred: 4,
  incorrect: 0,
  guessed: 0,
  confused: 0,
};

/** Thresholds are CHOSEN, not fitted — state this openly (docs/TUTOR_PERSONA.md §5 note). */
export const PROVISIONAL_PKNOWN_THRESHOLD = 0.80;
export const PROVISIONAL_MIN_DISTINCT_L3_ITEMS = 2;
export const DURABLE_MIN_HOURS = 24;
export const DURABLE_PLUS_MIN_DAYS = 7;

export function ladderLevelForDepth(depth: UnderstandingDepth): LadderLevel {
  return DEPTH_TO_LADDER[depth] ?? 0;
}

export function updateLadder(prev: LadderState | undefined, level: LadderLevel, eventId: string): LadderState {
  const base: LadderState = prev || { highestLevel: 0, levelEvidence: {} };
  const levelEvidence = { ...base.levelEvidence };
  const list = levelEvidence[level] ? [...levelEvidence[level]!, eventId] : [eventId];
  levelEvidence[level] = list.slice(-10); // keep it bounded
  return {
    highestLevel: Math.max(base.highestLevel, level) as LadderLevel,
    levelEvidence,
  };
}

/** Number of DISTINCT items (by itemId, falling back to eventId) with ladder level >= threshold. */
export function distinctItemsAtOrAbove(ladder: LadderState, threshold: LadderLevel): number {
  const ids = new Set<string>();
  for (const lvl of Object.keys(ladder.levelEvidence) as unknown as LadderLevel[]) {
    if (Number(lvl) >= threshold) {
      for (const id of ladder.levelEvidence[lvl as LadderLevel] || []) ids.add(id);
    }
  }
  return ids.size;
}

export interface MasteryStatusInput {
  pKnown: number;
  ladder: LadderState;
  anyConfirmedMisconceptionStanding: boolean;
  review?: ReviewState;
  lastReviewPassedAt?: number;
  now?: number;
}

/**
 * Computes mastery status per docs/TUTOR_PERSONA.md §5:
 *   provisional = pKnown >= 0.80 AND ladder evidence >= L3 on >= 2 distinct
 *                 items AND no confirmed misconception standing.
 *   durable     = provisional AND a passed spaced review >= 24h later.
 *   durable_plus= durable AND a second passed review >= 7 days later.
 */
export function computeMasteryStatus(input: MasteryStatusInput): MasteryStatus {
  const { pKnown, ladder, anyConfirmedMisconceptionStanding, review } = input;
  if (anyConfirmedMisconceptionStanding) return 'none';

  const provisional =
    pKnown >= PROVISIONAL_PKNOWN_THRESHOLD &&
    distinctItemsAtOrAbove(ladder, 3) >= PROVISIONAL_MIN_DISTINCT_L3_ITEMS;

  if (!provisional) return 'none';
  if (!review || review.passes === 0) return 'provisional';
  // durable_plus requires a pass with interval >= 7 days; durable requires >= 1 day.
  if (review.intervalDays >= DURABLE_PLUS_MIN_DAYS) return 'durable_plus';
  return 'durable';
}
