// ─────────────────────────────────────────────────────────────────
// Parent view — deterministic facts. Everything here is computed from the
// learner model's stored evidence with plain code: no model call, no guessing.
// The AI-written parts (report.ts) are only allowed to talk about what this
// file produces, and must cite it.
// ─────────────────────────────────────────────────────────────────
import type {
  EvidenceEvent, LearnerProfile, MisconceptionRecord,
} from '../adaptive/learnerModel';
import type { TeachingPlan } from '../plan/types';
import type {
  EvidenceCard, NextLessonPlan, ParentReport, StoryStep, StoryThread, TopicProgress,
} from './types';
import { outcomeWords, stageLabel, styleNoun, styleVerbing } from './plainLanguage';

export type BaseReport = Omit<ParentReport, 'narrative' | 'narrativeStale'>;

export function firstName(full: string): string {
  const n = (full || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0];
  return n || 'Your child';
}

export function isSimulated(l: Pick<LearnerProfile, 'studentId' | 'name'>): boolean {
  return l.studentId.startsWith('demo_') || /\(simulated\)/i.test(l.name);
}

/** Quote a child's words, trimmed. Returns '' when there is nothing real to quote. */
export function quote(text: string | undefined, max = 90): string {
  const t = (text || '').replace(/\(simulated\)\s*/gi, '').replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/, '');
  if (!t) return '';
  return `“${t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t}”`;
}

function toCard(e: EvidenceEvent, conceptLabel: string): EvidenceCard {
  const clean = (s?: string) => (s || '').replace(/\(simulated\)\s*/gi, '').trim();
  return {
    id: e.eventId,
    at: e.timestamp,
    conceptLabel,
    asked: clean(e.questionAsked),
    answered: clean(e.childAnswer),
    reasoning: clean(e.childReasoning) || undefined,
    outcome: outcomeWords(e),
  };
}

function stateOf(rec: MisconceptionRecord): StoryThread['state'] | null {
  if (rec.status === 'disputed') return null;
  if (rec.status === 'resolved') return 'fixed';
  if (rec.status === 'confirmed') return 'open';
  return 'watching';
}

function buildStory(
  name: string,
  rec: MisconceptionRecord,
  conceptLabel: string,
  conceptEvents: EvidenceEvent[],
): StoryThread | null {
  const state = stateOf(rec);
  if (!state) return null;
  const hits = conceptEvents.filter((e) => (e.candidateMisconceptionIds || []).includes(rec.id));
  if (!hits.length) return null;

  const steps: StoryStep[] = [];
  const first = hits[0];
  const q1 = quote(first.childReasoning) || quote(first.childAnswer);
  steps.push({
    kind: 'noticed', title: 'Ananta noticed something',
    caption: q1
      ? `${name} said ${q1}. That was a sign of a possible mix-up, so Ananta asked ${name} to explain.`
      : `${name}'s answer suggested a possible mix-up, so Ananta asked ${name} to explain.`,
    at: first.timestamp, evidenceIds: [first.eventId],
  });

  if (state === 'watching') {
    steps.push({
      kind: 'watching', title: 'Keeping an eye on it',
      caption: 'Seen once so far. Ananta will check once more before treating it as a real mix-up rather than a slip.',
      at: rec.lastSeen || first.timestamp, evidenceIds: [first.eventId],
    });
    return { key: rec.id, conceptLabel, mixUp: rec.text, state, steps };
  }

  const second = hits[1] || hits[0];
  const q2 = quote(second.childReasoning) || quote(second.childAnswer);
  steps.push({
    kind: 'confirmed', title: 'Seen again, so it is real',
    caption: `It came up again${q2 ? ` (${name}: ${q2})` : ''}. Seeing it twice, in different questions, tells Ananta this is a real mix-up and not a one-off slip.`,
    at: second.timestamp, evidenceIds: [first.eventId, second.eventId].filter((v, i, a) => a.indexOf(v) === i),
  });

  // The approach Ananta was using when the mix-up was confirmed, and the first different one it used afterwards.
  const before = second.representationUsed;
  const after = conceptEvents.find((e) => e.timestamp > second.timestamp && e.representationUsed !== before);
  if (after) {
    steps.push({
      kind: 'changed', title: 'Ananta changed how it teaches',
      caption: `Repeating the same explanation wasn't working, so Ananta stopped ${styleVerbing(before)} and switched to ${styleVerbing(after.representationUsed)}.`,
      at: after.timestamp, evidenceIds: [after.eventId],
    });
  }

  if (state === 'fixed') {
    const sound = [...conceptEvents].reverse().find((e) =>
      e.timestamp >= (after?.timestamp ?? second.timestamp)
      && ['applied', 'transferred', 'understood'].includes(e.understandingDepth)
      && !(e.candidateMisconceptionIds || []).includes(rec.id));
    const evid = sound || after || second;
    const q3 = quote(sound?.childReasoning) || quote(sound?.childAnswer);
    steps.push({
      kind: 'fixed', title: 'Fixed',
      caption: `${name} then answered a question that was new to ${name}, correctly${q3 ? `, and explained: ${q3}` : ''}. That is how Ananta checks a mix-up is truly gone.`,
      at: rec.resolvedAt || evid.timestamp, evidenceIds: [evid.eventId],
    });
  }
  return { key: rec.id, conceptLabel, mixUp: rec.text, state, steps };
}

export function planToParent(plan: TeachingPlan | null, name: string): NextLessonPlan | null {
  if (!plan) return null;
  const willDo: string[] = [];
  const revisit = plan.reviewItems.map((r) => r.label);
  if (revisit.length) willDo.push(`Start with a quick refresher of ${revisit.map((l) => `“${l}”`).join(', ')}.`);
  const pre = plan.prerequisitesToProbe[0];
  if (pre) willDo.push(`Check that the earlier idea “${pre.label}” is solid before building on it.`);
  const rep = plan.representationOrder[0];
  if (rep) {
    const proven = /^\d+ use/.test(rep.reason.text);
    willDo.push(`Begin by ${styleVerbing(rep.strategy)}${proven ? `, because that has worked well for ${name} on similar ideas` : ''}.`);
  }
  const avoid = plan.avoidRepresentations[0];
  if (avoid) willDo.push(`Avoid ${styleNoun(avoid.strategy)}, which has not helped ${name} so far.`);
  willDo.push(plan.scaffoldLevel === 'full' ? 'Give plenty of support at first, then step back.'
    : plan.scaffoldLevel === 'faded' ? `Offer less help than last time and let ${name} lead more.`
      : `Let ${name} try each problem alone before offering any help.`);
  if (plan.exampleThemes.length) willDo.push(`Use ${plan.exampleThemes.slice(0, 2).join(' and ')} in the examples.`);
  return {
    focus: plan.targetConcept.label,
    willDo,
    keepAnEyeOn: plan.watchMisconceptions.map((w) => w.text),
    revisit,
  };
}

export function buildBaseReport(
  learner: LearnerProfile,
  subjectId: string,
  allEvents: EvidenceEvent[],
  plan: TeachingPlan | null,
  now = Date.now(),
): BaseReport {
  const subject = learner.subjects[subjectId];
  const name = firstName(learner.name);
  const events = allEvents.filter((e) => e.subjectId === subjectId || !e.subjectId)
    .sort((a, b) => a.timestamp - b.timestamp);
  const states = subject ? Object.values(subject.conceptStates) : [];

  const evidence: Record<string, EvidenceCard> = {};
  const labelOf = (cid: string) => subject?.conceptStates[cid]?.label || cid;
  for (const e of events.slice(-150)) evidence[e.eventId] = toCard(e, labelOf(e.conceptId));

  const story: StoryThread[] = [];
  const journey: TopicProgress[] = [];
  let fixed = 0; let open = 0;
  for (const cs of states) {
    const ce = events.filter((e) => e.conceptId === cs.conceptId);
    if (!ce.length && !cs.attemptCount) continue;
    let mix: TopicProgress['mixUp'];
    for (const rec of cs.misconceptionLedger || []) {
      const t = buildStory(name, rec, cs.label, ce);
      if (!t) continue;
      story.push(t);
      if (t.state === 'fixed') { fixed++; mix = mix ?? 'fixed'; }
      if (t.state === 'open') { open++; mix = 'open'; }
      if (t.state === 'watching' && mix !== 'open') mix = 'watching';
    }
    const stage = cs.ladder?.highestLevel ?? 0;
    journey.push({
      conceptId: cs.conceptId, label: cs.label, stage, stageLabel: stageLabel(stage),
      answersChecked: ce.length || cs.attemptCount || 0,
      lastAt: ce.length ? ce[ce.length - 1].timestamp : cs.lastVisited || 0, mixUp: mix,
    });
  }
  journey.sort((a, b) => b.lastAt - a.lastAt);
  // Open and fixed stories (the full noticed → changed → fixed arc) lead; "watching" comes last.
  const rank = { open: 0, fixed: 1, watching: 2 } as const;
  story.sort((a, b) => rank[a.state] - rank[b.state]
    || (b.steps[b.steps.length - 1]?.at || 0) - (a.steps[a.steps.length - 1]?.at || 0));

  const sessions = new Set(events.map((e) => e.sessionId).filter(Boolean));
  const confusionTotal = Object.values(learner.affect?.confusionSignals || {}).reduce((s, n) => s + n, 0);
  const flagged = events.filter((e) => e.selfReportedConfusion || e.helpRequested).length;

  return {
    studentId: learner.studentId,
    childName: name,
    simulated: isSimulated(learner),
    grade: learner.grade,
    board: learner.board,
    subjectId,
    subjectLabel: subject?.subjectLabel || subjectId,
    generatedAt: now,
    stats: {
      lessons: Math.max(sessions.size, subject?.sessionCount || 0),
      minutes: subject?.totalMinutes || 0,
      answersChecked: events.length,
      mixUpsFixed: fixed,
      mixUpsOpen: open,
      helpMoments: Math.max(confusionTotal, flagged),
    },
    journey,
    story,
    nextLesson: planToParent(plan, name),
    evidence,
    availableSubjects: Object.values(learner.subjects).map((s) => ({ subjectId: s.subjectId, label: s.subjectLabel })),
  };
}
