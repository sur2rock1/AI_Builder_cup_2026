// ─────────────────────────────────────────────────────────────────
// Profiler (T14) — the slow loop from docs/LEARNER_MODEL.md §5.2, run at
// session end/disconnect. Where the fast loop (recordReasoningEvidence,
// compilePlanDelta) reacts to ONE exchange in under 3s, the Profiler looks
// back over a WHOLE session with a stronger model and proposes durable,
// cross-exchange claims (docs/LEARNER_MODEL.md §3's LearnerClaim) plus a
// human-readable SessionSummary -- e.g. "still relies on counting on
// fingers for two-digit addition" or "responds well to worked examples on
// this concept type," not just a single answer's classification.
//
// Every proposed claim is deterministic-gated by claimValidator.ts before
// it touches the learner's profile -- the Profiler NEVER writes directly.
// See claimValidator.ts's header for why judgment stays out of the model
// call entirely.
// ─────────────────────────────────────────────────────────────────
import { generateJSON } from '../ai/gateway';
import { getRepo } from './repo';
import {
  ClaimKind, EvidenceEvent, LadderLevel, LearnerClaim, SessionSummary,
} from './learnerModel';
import { ProposedClaim, validateClaims, mergeClaims } from './claimValidator';

const VALID_KINDS: ClaimKind[] = ['strength', 'gap', 'strategy', 'engagement', 'preference', 'pattern'];

export interface RunProfilerInput {
  studentId: string;
  subjectId: string;
  sessionId: string;
  sessionStartedAt: number;
  apiKey: string;
}

export interface RunProfilerResult {
  summary: SessionSummary;
  claimsAccepted: number;
  claimsRejected: number;
  rejectionReasons: string[];
}

function buildDeterministicSummaryFacts(events: EvidenceEvent[]) {
  const conceptsTouched = Array.from(new Set(events.map((e) => e.conceptId)));
  const movesUsed: Record<string, number> = {};
  const representationsUsed: Record<string, number> = {};
  // Ladder moves: for each concept, the lowest -> highest ladderLevel seen
  // in this session's events (in chronological order, as listEvents returns
  // them for the file repo; Firestore orders by timestamp too).
  const ladderMoves: SessionSummary['ladderMoves'] = [];
  const firstLadderByConcept = new Map<string, LadderLevel>();
  const lastLadderByConcept = new Map<string, LadderLevel>();

  for (const e of events) {
    movesUsed[e.moveUsed] = (movesUsed[e.moveUsed] || 0) + 1;
    representationsUsed[e.representationUsed] = (representationsUsed[e.representationUsed] || 0) + 1;
    if (!firstLadderByConcept.has(e.conceptId)) firstLadderByConcept.set(e.conceptId, e.ladderLevel);
    lastLadderByConcept.set(e.conceptId, e.ladderLevel);
  }
  for (const conceptId of conceptsTouched) {
    const from = firstLadderByConcept.get(conceptId)!;
    const to = lastLadderByConcept.get(conceptId)!;
    if (from !== to) ladderMoves.push({ conceptId, from, to });
  }

  // Misconceptions changed: best-effort from candidateMisconceptionIds
  // appearing/disappearing across the session's events for a concept --
  // the authoritative ledger status lives on ConceptState.misconceptionLedger,
  // which the Profiler prompt also receives, but that's per-concept current
  // state, not "what changed in this session," so this is reconstructed here.
  const misconceptionsChanged: SessionSummary['misconceptionsChanged'] = [];
  const seenBefore = new Set<string>();
  for (const e of events) {
    for (const id of e.candidateMisconceptionIds || []) {
      if (!seenBefore.has(id)) {
        misconceptionsChanged.push({ id, from: 'none', to: 'suspected' });
        seenBefore.add(id);
      }
    }
  }

  return { conceptsTouched, movesUsed, representationsUsed, ladderMoves, misconceptionsChanged };
}

function buildProfilerPrompt(args: {
  events: EvidenceEvent[];
  existingClaims: LearnerClaim[];
  onboardingInterests: string[];
  ledgerSnippets: string[];
}): string {
  const eventLines = args.events.map((e, i) => (
    `${i + 1}. [${e.conceptId}] Q: "${e.questionAsked}" A: "${e.childAnswer}" `
    + `Reasoning: "${e.childReasoning}" -> ${e.classification} (${e.understandingDepth}, `
    + `ladder L${e.ladderLevel}, strategy=${e.representationUsed}, move=${e.moveUsed}, `
    + `errorClass=${e.errorClass}) [eventId=${e.eventId}]`
  )).join('\n');

  const claimLines = args.existingClaims.length
    ? args.existingClaims.map((c) => `- (${c.source}, ${c.status}) [${c.kind}] ${c.statement}`).join('\n')
    : '(none yet)';

  return `You are the session-end Profiler for an adaptive tutoring system. Read this session's
exchanges and propose claims about durable, evidence-supported patterns -- NOT a re-statement
of any single answer. Every claim must be traceable to specific exchanges.

CRITICAL RULES:
- Never propose a fixed psychological label (e.g. "visual learner", "ADHD", "gifted", "lazy").
  Ask instead: "which teaching strategies appear to help THIS child understand THIS type of
  concept?" -- a claim about what worked/didn't, not what the child inherently IS.
- Every claim needs evidenceEventIds drawn ONLY from the eventIds listed below.
- Do not repeat an existing claim verbatim; propose an update or narrower claim only if this
  session adds genuinely new evidence.
- Do not fabricate: if nothing durable emerged this session, return an empty claims array --
  that is a valid and expected outcome, not a failure.

THIS SESSION'S EXCHANGES (chronological):
${eventLines || '(no exchanges recorded)'}

LEARNER'S EXISTING CLAIMS:
${claimLines}

LEARNER'S STATED INTERESTS (for context only, do not propose a claim just to mention these):
${args.onboardingInterests.join(', ') || '(none recorded)'}

RELEVANT MISCONCEPTION LEDGER CONTEXT:
${args.ledgerSnippets.join('\n') || '(none)'}

Return ONLY valid JSON, no markdown fences:
{
  "narrative": "2-4 plain-language sentences a parent/teacher could read, grounded only in what happened this session",
  "claims": [
    {
      "kind": "strength|gap|strategy|engagement|preference|pattern",
      "statement": "plain language, scoped, no labels",
      "childFriendly": "second-person version for the learner card, or null",
      "scope": { "subjectId": "...", "conceptType": "... or null", "conceptId": "... or null" },
      "evidenceEventIds": ["eventId1", "eventId2"]
    }
  ]
}`;
}

/**
 * Run the Profiler for one finished session. Fire-and-forget from the
 * caller's perspective (server.ts calls this on WS close / session end and
 * does not await a response to the client, since the session is already
 * over) -- but every step here is awaited internally so errors are caught
 * and logged, never silently lost.
 *
 * Returns null (not an error) when there is nothing to profile -- an empty
 * or near-empty session should not produce a claim from thin air.
 */
export async function runProfiler(input: RunProfilerInput): Promise<RunProfilerResult | null> {
  const repo = getRepo();
  const learner = await repo.getProfile(input.studentId);
  if (!learner) {
    console.warn(`[Profiler] no profile for ${input.studentId} -- skipping`);
    return null;
  }

  const events = (await repo.listEvents(input.studentId, {
    subjectId: input.subjectId,
    sessionId: input.sessionId,
  })) as EvidenceEvent[];

  if (events.length === 0) {
    console.log(`[Profiler] session ${input.sessionId} had no recorded exchanges -- skipping`);
    return null;
  }

  const facts = buildDeterministicSummaryFacts(events);
  const existingClaims = learner.claims || [];
  const ledgerSnippets = Object.values(learner.subjects?.[input.subjectId]?.conceptStates || {})
    .flatMap((cs) => (cs.misconceptionLedger || []).map((m) => `- [${cs.conceptId}] ${m.text} (${m.status}, ${m.observations}x)`));

  let proposed: ProposedClaim[] = [];
  let narrative = '';
  try {
    const { data } = await generateJSON<{ narrative?: string; claims?: any[] }>({
      role: 'strong',
      call: 'profiler.summarizeSession',
      apiKey: input.apiKey,
      prompt: buildProfilerPrompt({
        events,
        existingClaims,
        onboardingInterests: learner.onboarding?.interests || [],
        ledgerSnippets,
      }),
      timeoutMs: 20000, // session-end, not conversational -- no voice-latency budget to protect
    });

    narrative = typeof data.narrative === 'string' ? data.narrative : '';
    proposed = Array.isArray(data.claims)
      ? data.claims
          .filter((c) => c && VALID_KINDS.includes(c.kind))
          .map((c): ProposedClaim => ({
            kind: c.kind,
            statement: String(c.statement || '').slice(0, 500),
            childFriendly: c.childFriendly ? String(c.childFriendly).slice(0, 300) : undefined,
            scope: {
              subjectId: c.scope?.subjectId || undefined,
              conceptType: c.scope?.conceptType || undefined,
              conceptId: c.scope?.conceptId || undefined,
            },
            evidenceRefs: Array.isArray(c.evidenceEventIds) ? c.evidenceEventIds.filter((id: any) => typeof id === 'string') : [],
          }))
      : [];
  } catch (err: any) {
    // Gemini gateway failure (all candidates failed, or bad JSON) must not
    // lose the session's deterministic summary -- fall back to a plain,
    // fact-only narrative and zero proposed claims, rather than throwing
    // and losing everything.
    console.error(`[Profiler] generateJSON failed for session ${input.sessionId}:`, err?.message || err);
    narrative = `Session covered ${facts.conceptsTouched.length} concept(s): ${facts.conceptsTouched.join(', ') || 'none'}. `
      + `(Automated narrative unavailable this session — model call failed.)`;
  }

  const validation = validateClaims(proposed, {
    studentId: input.studentId,
    ownedEventIds: new Set(events.map((e) => e.eventId)),
    existingClaims,
  });

  if (validation.rejected.length > 0) {
    console.log(`[Profiler] ${validation.rejected.length} proposed claim(s) rejected for ${input.studentId}:`,
      validation.rejected.map((r) => r.reason));
  }

  const summary: SessionSummary = {
    sessionId: input.sessionId,
    startedAt: input.sessionStartedAt,
    endedAt: Date.now(),
    conceptsTouched: facts.conceptsTouched,
    ladderMoves: facts.ladderMoves,
    misconceptionsChanged: facts.misconceptionsChanged,
    movesUsed: facts.movesUsed,
    representationsUsed: facts.representationsUsed,
    narrative,
    planVersion: events[events.length - 1]?.planVersion || 'unknown',
  };

  // Re-read + merge under the profile's latest state (best-effort; this repo
  // layer has no transactions, same caveat as every other read-modify-write
  // in learnerStore.ts).
  const fresh = await repo.getProfile(input.studentId);
  if (fresh) {
    fresh.claims = mergeClaims(fresh.claims || [], validation.accepted);
    fresh.sessionSummaries = [...(fresh.sessionSummaries || []), summary].slice(-30);
    fresh.updatedAt = Date.now();
    await repo.saveProfile(fresh);
  }
  await repo.saveSessionSummary(input.studentId, input.sessionId, summary);

  console.log(`[Profiler] session ${input.sessionId} for ${input.studentId}: `
    + `${validation.accepted.length} claim(s) accepted, ${validation.rejected.length} rejected, `
    + `${events.length} event(s) profiled`);

  return {
    summary,
    claimsAccepted: validation.accepted.length,
    claimsRejected: validation.rejected.length,
    rejectionReasons: validation.rejected.map((r) => r.reason),
  };
}
