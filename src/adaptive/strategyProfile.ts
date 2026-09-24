// ─────────────────────────────────────────────────────────────────
// Cross-concept strategy effectiveness (docs/LEARNER_MODEL.md §6.2).
//
// For each (conceptType, representation) pair we keep a Beta(alpha,beta)
// with a Beta(1,1) prior. "Gain" = the event's masteryAfter > masteryBefore
// OR its ladder level is above the previous event's level on the same
// concept (docs/LEARNER_MODEL.md §5.1).
// ─────────────────────────────────────────────────────────────────
import { StrategyProfile, StrategyStat, TeachingStrategy } from './learnerModel';

export const STRATEGY_DECAY_HALF_LIFE_DAYS = 30;
export const STRATEGY_DECAY_FACTOR = 0.9; // applied per elapsed half-life period

export function recordStrategyOutcome(
  profile: StrategyProfile | undefined,
  conceptType: string,
  strategy: TeachingStrategy,
  gained: boolean,
  now: number = Date.now(),
): StrategyProfile {
  const next: StrategyProfile = profile ? { ...profile } : {};
  const byType = { ...(next[conceptType] || {}) };
  const prior: StrategyStat = byType[strategy] || { alpha: 1, beta: 1, lastUsed: now };

  // Decay old evidence before adding the new observation.
  const decayed = decayStat(prior, now);

  byType[strategy] = {
    alpha: decayed.alpha + (gained ? 1 : 0),
    beta: decayed.beta + (gained ? 0 : 1),
    lastUsed: now,
  };
  next[conceptType] = byType;
  return next;
}

function decayStat(stat: StrategyStat, now: number): StrategyStat {
  const elapsedDays = (now - stat.lastUsed) / (1000 * 60 * 60 * 24);
  if (elapsedDays <= 0) return stat;
  const periods = elapsedDays / STRATEGY_DECAY_HALF_LIFE_DAYS;
  const factor = Math.pow(STRATEGY_DECAY_FACTOR, periods);
  return {
    alpha: 1 + (stat.alpha - 1) * factor,
    beta: 1 + (stat.beta - 1) * factor,
    lastUsed: stat.lastUsed,
  };
}

export function expectedSuccess(stat: StrategyStat | undefined): number {
  if (!stat) return 0.5; // uninformative prior mean
  return stat.alpha / (stat.alpha + stat.beta);
}

/** Ranks representations for a concept type by expected success (demo-mode: deterministic mean). */
export function rankRepresentations(
  profile: StrategyProfile | undefined,
  conceptType: string,
  candidates: TeachingStrategy[],
): Array<{ strategy: TeachingStrategy; expected: number; uses: number }> {
  const byType = profile?.[conceptType] || {};
  return candidates
    .map((strategy) => {
      const stat = byType[strategy];
      return { strategy, expected: expectedSuccess(stat), uses: stat ? stat.alpha + stat.beta - 2 : 0 };
    })
    .sort((a, b) => b.expected - a.expected);
}

/** True once a representation has enough track record to be trusted as "ineffective". */
export const MIN_USES_BEFORE_AVOID = 3;
export const AVOID_THRESHOLD = 0.3;
