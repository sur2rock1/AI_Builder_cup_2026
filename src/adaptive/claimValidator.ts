// ─────────────────────────────────────────────────────────────────
// Claim Validator (T14) — the deterministic gate every Profiler-proposed
// LearnerClaim must pass before it is written to a learner's profile.
// docs/LEARNER_MODEL.md §5.2:
//   - every evidenceRef must exist and belong to this learner (this session)
//   - scope required
//   - banned-label lexicon check (e.g. "visual learner", "lazy", "ADHD")
//   - confidence <= f(evidence count): 1 event -> max 0.4; 2 -> 0.6; 3+ -> 0.85
//   - reject claims that contradict a learner_stated/parent_stated claim;
//     mark those `disputed`
//
// This is intentionally the ONLY place claim confidence is computed and the
// ONLY place a claim can be rejected -- the Profiler (profiler.ts) proposes,
// this decides. Keeping judgment out of the LLM call is the whole point:
// the project's own core principle is "do not represent fixed psychological
// labels unless supported by evidence," and a banned-label lexicon check is
// useless if it lives inside the same model call it's supposed to police.
// ─────────────────────────────────────────────────────────────────
import { ClaimKind, LearnerClaim } from './learnerModel';

/** What the Profiler proposes, before validation. No confidence field --
 * the validator computes that from evidence count, never trusts the model's. */
export interface ProposedClaim {
  kind: ClaimKind;
  statement: string;
  childFriendly?: string;
  scope: { subjectId?: string; conceptType?: string; conceptId?: string };
  evidenceRefs: string[];
}

export interface ClaimValidationContext {
  studentId: string;
  /** eventIds that actually belong to this learner's session being profiled --
   * an evidenceRef outside this set fails the ownership check. Scoped to the
   * session being profiled (not the learner's whole history) because that is
   * the only evidence the Profiler call actually saw; a wider allow-list
   * would let a hallucinated eventId from a different session slip through
   * unnoticed. */
  ownedEventIds: Set<string>;
  existingClaims: LearnerClaim[];
}

export interface RejectedClaim {
  claim: ProposedClaim;
  reason: string;
}

export interface ValidationResult {
  accepted: LearnerClaim[];
  rejected: RejectedClaim[];
}

// Deliberately conservative and pattern-based, not exhaustive -- this is a
// safety net, not the sole protection (the persona/prompt layer is the
// first line of defense against generating these in the first place, per
// docs/TUTOR_PERSONA.md and this project's "do not represent these as fixed
// psychological labels" instruction). Matched case-insensitively as whole
// phrases against statement + childFriendly text.
const BANNED_LABEL_PATTERNS: RegExp[] = [
  /\bvisual learner\b/i, /\bauditory learner\b/i, /\bkinesthetic learner\b/i,
  /\breading[- ]?writing learner\b/i,
  /\blazy\b/i, /\bstupid\b/i, /\bdumb\b/i, /\bslow learner\b/i, /\bnot smart\b/i,
  /\bgifted\b/i, /\bunintelligent\b/i,
  /\bADHD\b/i, /\bautis(m|tic)\b/i, /\bdyslexi[ac]\b/i, /\bdyscalculi[ac]\b/i,
  /\bdisorder\b/i, /\bdisability\b/i, /\bspecial needs\b/i,
];

function violatesBannedLexicon(claim: ProposedClaim): string | null {
  const text = `${claim.statement} ${claim.childFriendly || ''}`;
  for (const pattern of BANNED_LABEL_PATTERNS) {
    if (pattern.test(text)) return `contains banned label pattern: ${pattern}`;
  }
  return null;
}

/** docs/LEARNER_MODEL.md §6.3: confidence = min(cap(n), base) x decay(age).
 * At creation, age = 0 so decay(age) = 1. The spec does not say where `base`
 * comes from independently of the evidence-count cap -- REASONABLE INFERENCE
 * (not a verified spec detail): since the validator, not the Profiler, is
 * the sole owner of confidence (the Profiler proposes no confidence value
 * at all -- see ProposedClaim), `base` is treated as 1.0 (full trust up to
 * whatever the evidence count allows), so confidence at creation reduces to
 * cap(n). Decay over time (§7.1) is applied elsewhere, at read/plan-compile
 * time, not here. */
export function capForEvidenceCount(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 0.4;
  if (n === 2) return 0.6;
  return 0.85;
}

/** Same scope + kind = the same underlying claim for merge/contradiction
 * purposes. Deliberately coarse (not text-similarity based) -- text
 * similarity would need another model call, which is exactly the kind of
 * judgment this deterministic gate exists to avoid. */
function sameSlot(a: { kind: ClaimKind; scope: ProposedClaim['scope'] }, b: { kind: ClaimKind; scope: ProposedClaim['scope'] }): boolean {
  return a.kind === b.kind
    && (a.scope.conceptId || null) === (b.scope.conceptId || null)
    && (a.scope.conceptType || null) === (b.scope.conceptType || null)
    && (a.scope.subjectId || null) === (b.scope.subjectId || null);
}

export function validateClaims(
  proposed: ProposedClaim[],
  ctx: ClaimValidationContext,
): ValidationResult {
  const accepted: LearnerClaim[] = [];
  const rejected: RejectedClaim[] = [];
  const now = Date.now();

  const statedClaims = ctx.existingClaims.filter(
    (c) => (c.source === 'learner_stated' || c.source === 'parent_stated') && c.status === 'active',
  );

  for (const claim of proposed) {
    // 1. Scope required.
    if (!claim.scope || (!claim.scope.subjectId && !claim.scope.conceptType && !claim.scope.conceptId)) {
      rejected.push({ claim, reason: 'missing scope (subjectId/conceptType/conceptId all empty)' });
      continue;
    }

    // 2. Every evidenceRef must exist and belong to this learner's session.
    const refs = Array.from(new Set((claim.evidenceRefs || []).filter(Boolean)));
    const unowned = refs.filter((r) => !ctx.ownedEventIds.has(r));
    if (refs.length === 0) {
      rejected.push({ claim, reason: 'no evidenceRefs supplied' });
      continue;
    }
    if (unowned.length > 0) {
      rejected.push({ claim, reason: `evidenceRefs not found in this learner's session: ${unowned.join(', ')}` });
      continue;
    }

    // 3. Banned-label lexicon.
    const lexiconHit = violatesBannedLexicon(claim);
    if (lexiconHit) {
      rejected.push({ claim, reason: `banned-label lexicon: ${lexiconHit}` });
      continue;
    }

    // 4. Reject if it contradicts a learner_stated/parent_stated claim in the
    //    same slot (same kind + scope). Deliberately conservative: ANY
    //    stated claim in the same slot wins over a profiler claim, rather
    //    than attempting semantic contradiction detection (which would need
    //    another model call -- exactly what this deterministic gate exists
    //    to avoid). This can over-reject (a profiler claim that would have
    //    AGREED with the stated one is also blocked), which is the safer
    //    failure direction for a claim about a child.
    const contradicts = statedClaims.find((sc) => sameSlot(sc, claim));
    if (contradicts) {
      rejected.push({ claim, reason: `contradicts existing ${contradicts.source} claim ${contradicts.claimId}` });
      continue;
    }

    // 5. Confidence from evidence count only -- never from the model.
    const confidence = capForEvidenceCount(refs.length);

    accepted.push({
      claimId: `claim_${claim.kind}_${now}_${Math.random().toString(36).slice(2, 8)}`,
      kind: claim.kind,
      statement: claim.statement,
      childFriendly: claim.childFriendly,
      scope: claim.scope,
      confidence,
      evidenceRefs: refs,
      source: 'profiler',
      status: 'active',
      createdAt: now,
      lastConfirmedAt: now,
    });
  }

  return { accepted, rejected };
}

/**
 * Merge newly-validated claims into a learner's existing claim list.
 * Same slot (kind + scope) + source 'profiler' -> update in place (bump
 * evidenceRefs, confidence, lastConfirmedAt) rather than duplicate.
 * Otherwise -> append as a new claim.
 */
export function mergeClaims(existing: LearnerClaim[], accepted: LearnerClaim[]): LearnerClaim[] {
  const result = [...existing];
  for (const claim of accepted) {
    const idx = result.findIndex((c) => c.source === 'profiler' && c.status === 'active' && sameSlot(c, claim));
    if (idx >= 0) {
      const prior = result[idx];
      const mergedRefs = Array.from(new Set([...prior.evidenceRefs, ...claim.evidenceRefs]));
      result[idx] = {
        ...prior,
        statement: claim.statement,
        childFriendly: claim.childFriendly,
        evidenceRefs: mergedRefs,
        confidence: capForEvidenceCount(mergedRefs.length),
        lastConfirmedAt: claim.lastConfirmedAt,
      };
    } else {
      result.push(claim);
    }
  }
  return result;
}
