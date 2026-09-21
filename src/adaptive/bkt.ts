// ─────────────────────────────────────────────────────────────────
// Bayesian Knowledge Tracing (BKT)
//
// Replaces hand-tuned "masteryDelta" magic numbers with a posterior
// probability that the learner knows the skill, given the evidence.
//
// Standard 4-parameter BKT (Corbett & Anderson, 1995):
//   pL0 — prior P(knows the skill before any evidence)
//   pT  — P(transition from not-known to known after an instructional turn)
//   pS  — P(slip):  knows it, but answers wrongly
//   pG  — P(guess): doesn't know it, but answers correctly
//
// Our extension: pS and pG are not fixed. They are conditioned on the
// QUALITY of the evidence, because "correct answer" and "correct answer
// with a clearly articulated method" are not the same observation.
// This is what defends the model against the Correct Answer Trap —
// a correct answer produced by flawed reasoning is treated as a
// high-guess event, so it moves mastery DOWN, not up.
// ─────────────────────────────────────────────────────────────────

import { UnderstandingDepth } from './learnerModel';

export interface BKTParams {
  pL0: number;
  pT: number;
  pS: number;
  pG: number;
}

/** Baseline parameters. Difficulty shifts the prior and the learn rate. */
export function paramsForDifficulty(difficultyLevel: number): BKTParams {
  const d = Math.min(5, Math.max(1, difficultyLevel));
  return {
    pL0: 0.25 - (d - 1) * 0.04,   // harder concept -> lower prior
    pT:  0.30 - (d - 1) * 0.03,   // harder concept -> slower acquisition
    pS:  0.10,
    pG:  0.20,
  };
}

/**
 * Evidence quality per observed depth.
 *
 * slipWeight  — multiplies pS. High when the response is weak evidence of
 *               NOT knowing (e.g. child was distracted / asked to repeat).
 * guessWeight — multiplies pG. High when a correct response is weak evidence
 *               of knowing (memorised, guessed, or correct-but-flawed method).
 */
const EVIDENCE_QUALITY: Record<UnderstandingDepth, { slipWeight: number; guessWeight: number; treatAsCorrect: boolean }> = {
  transferred: { slipWeight: 0.3, guessWeight: 0.10, treatAsCorrect: true  },
  applied:     { slipWeight: 0.5, guessWeight: 0.20, treatAsCorrect: true  },
  understood:  { slipWeight: 0.7, guessWeight: 0.35, treatAsCorrect: true  },
  recognised:  { slipWeight: 1.0, guessWeight: 1.60, treatAsCorrect: true  },
  memorised:   { slipWeight: 1.0, guessWeight: 2.60, treatAsCorrect: true  },
  guessed:     { slipWeight: 1.0, guessWeight: 3.80, treatAsCorrect: true  },
  incorrect:   { slipWeight: 1.0, guessWeight: 1.00, treatAsCorrect: false },
  confused:    { slipWeight: 1.4, guessWeight: 1.00, treatAsCorrect: false },
};

export interface BKTObservation {
  depth: UnderstandingDepth;
  /** True when a misconception was CONFIRMED (not merely suspected). */
  misconceptionConfirmed: boolean;
  difficultyLevel: number;
}

export interface BKTResult {
  /** Posterior P(knows skill), 0..1 */
  pKnown: number;
  /** Same value on the 0–100 scale the UI already uses. */
  masteryScore: number;
  /** Signed change in masteryScore, for display only. */
  delta: number;
  /** Human-readable derivation, surfaced to judges and to the parent portal. */
  derivation: string;
}

function clamp01(x: number): number {
  return Math.min(0.999, Math.max(0.001, x));
}

/**
 * Update P(known) given one observation.
 * priorScore is the existing 0–100 masteryScore (0 means "no evidence yet").
 */
export function updateMastery(
  priorScore: number,
  obs: BKTObservation,
  attemptCount: number,
): BKTResult {
  const p = paramsForDifficulty(obs.difficultyLevel);
  const quality = EVIDENCE_QUALITY[obs.depth] || EVIDENCE_QUALITY.incorrect;

  // No evidence yet -> start from the prior rather than from a literal zero.
  const pL = attemptCount === 0 ? p.pL0 : clamp01(priorScore / 100);

  const pS = clamp01(p.pS * quality.slipWeight);
  const pG = clamp01(p.pG * quality.guessWeight);

  // A confirmed misconception is direct evidence of NOT knowing, regardless
  // of whether the final answer happened to be right.
  const observedCorrect = obs.misconceptionConfirmed ? false : quality.treatAsCorrect;

  let posterior: number;
  if (observedCorrect) {
    const num = pL * (1 - pS);
    posterior = num / (num + (1 - pL) * pG);
  } else {
    const num = pL * pS;
    posterior = num / (num + (1 - pL) * (1 - pG));
  }

  // Learning opportunity: the turn itself may have taught them something.
  // Suppressed while a misconception stands — you cannot build on a broken base.
  const learnRate = obs.misconceptionConfirmed ? 0 : p.pT;
  const pNext = clamp01(posterior + (1 - posterior) * learnRate);

  const masteryScore = Math.round(pNext * 100);
  const derivation =
    `P(known) ${Math.round(pL * 100)}% → ${masteryScore}% · ` +
    `observation=${obs.depth}` +
    (obs.misconceptionConfirmed ? ' + confirmed misconception' : '') +
    ` · pS=${pS.toFixed(2)} pG=${pG.toFixed(2)} pT=${learnRate.toFixed(2)}`;

  return {
    pKnown: pNext,
    masteryScore,
    delta: masteryScore - Math.round(priorScore),
    derivation,
  };
}

/** Mastery threshold for advancing to the next concept. */
export const MASTERY_THRESHOLD = 75;
