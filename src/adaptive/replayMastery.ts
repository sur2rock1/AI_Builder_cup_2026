// ─────────────────────────────────────────────────────────────────
// Recompute a concept's DERIVED mastery fields from its stored evidence events, with the current rules
// (misconception ledger + BKT + the "not yet confirmed" cap), exactly as recordReasoningEvidence applies them one by one.
// Used by scripts/repair-mastery.ts to repair profiles whose mastery froze at 0 under the old rule (D-2026-10-18-1).
// Touches only: misconceptionLedger, masteryScore, pKnown, masteryLevel, masteryStatus and the two legacy mirror arrays.
// Never touches events, attempts, ladder, strategies, transcripts or summaries. Pure.
// ─────────────────────────────────────────────────────────────────
import type { ConceptState, EvidenceEvent, MisconceptionRecord, MasteryLevel, UnderstandingDepth } from './learnerModel';
import { updateMastery, MASTERY_THRESHOLD } from './bkt';
import { computeMasteryStatus } from './ladder';
import { applyLedgerEvidence } from './learnerStore';

function level(score: number, attempts: number): MasteryLevel {
  if (score === 0) return attempts > 0 ? 'exposed' : 'not_started';
  if (score < 20) return 'exposed';
  if (score < 40) return 'partial';
  if (score < 60) return 'developing';
  if (score < 80) return 'proficient';
  return 'mastered';
}

export interface ReplayResult {
  changed: boolean;
  before: { masteryScore: number; status?: string; ledger: string[] };
  after: { masteryScore: number; status?: string; ledger: string[] };
  patch: Pick<ConceptState, 'misconceptionLedger' | 'masteryScore' | 'pKnown' | 'masteryLevel' | 'masteryStatus' | 'suspectedMisconceptions' | 'confirmedMisconceptions'>;
}

export function replayConceptMastery(cs: ConceptState, events: EvidenceEvent[], difficultyLevel = 2): ReplayResult {
  const texts = new Map((cs.misconceptionLedger || []).map((m) => [m.id, m.text]));
  const disputed = new Map((cs.misconceptionLedger || []).filter((m) => m.status === 'disputed').map((m) => [m.id, m]));
  const ledger: MisconceptionRecord[] = [];
  let score = 0, pKnown = 0, attempts = 0;
  const sorted = [...events].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  for (const e of sorted) {
    const cands = (e.candidateMisconceptionIds || []).map((id) => ({ id, text: texts.get(id) || id }));
    applyLedgerEvidence(ledger, { candidateMisconceptions: cands, promptType: e.promptType as any, understandingDepth: e.understandingDepth as UnderstandingDepth }, e.timestamp || 0);
    for (const [id, d] of disputed) { const r = ledger.find((m) => m.id === id); if (r && r.lastSeen <= (d.disputedAt || 0)) { r.status = 'disputed'; r.disputedAt = d.disputedAt; } }
    const standing = ledger.some((m) => m.status === 'confirmed');
    const bkt = updateMastery(score, { depth: e.understandingDepth as UnderstandingDepth, misconceptionConfirmed: standing, difficultyLevel }, attempts);
    score = bkt.masteryScore; pKnown = bkt.pKnown; attempts++;
  }
  const standing = ledger.some((m) => m.status === 'confirmed');
  const status = computeMasteryStatus({ pKnown, ladder: (cs.ladder || { highestLevel: 0, levelEvidence: {} }) as any, anyConfirmedMisconceptionStanding: standing, review: cs.review as any });
  if (status === 'none' && score >= MASTERY_THRESHOLD) { score = MASTERY_THRESHOLD - 1; pKnown = Math.min(pKnown, (MASTERY_THRESHOLD - 1) / 100); }
  const summary = (l: MisconceptionRecord[]) => l.map((m) => `${m.status}/${m.observations}`);
  const patch = {
    misconceptionLedger: ledger,
    masteryScore: score, pKnown, masteryLevel: level(score, cs.attemptCount || attempts), masteryStatus: status,
    suspectedMisconceptions: ledger.filter((m) => m.status === 'suspected').map((m) => m.text),
    confirmedMisconceptions: ledger.filter((m) => m.status === 'confirmed').map((m) => m.text),
  } as ReplayResult['patch'];
  const before = { masteryScore: cs.masteryScore, status: cs.masteryStatus, ledger: summary(cs.misconceptionLedger || []) };
  const after = { masteryScore: score, status, ledger: summary(ledger) };
  const changed = before.masteryScore !== after.masteryScore || before.status !== after.status || JSON.stringify(before.ledger) !== JSON.stringify(after.ledger) || cs.masteryLevel !== patch.masteryLevel;
  return { changed, before, after, patch };
}
