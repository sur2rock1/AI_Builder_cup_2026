// ─────────────────────────────────────────────────────────────────
// Parent view — the report service.
//   deterministic facts (facts.ts)  +  AI-written narrative (this file)
//
// GenAI role: Gemini turns one child's verified evidence into a short, warm
// letter, a "what works" line and a 5-minute home activity. It is NOT trusted:
//   - it only sees the facts below, with short evidence ids (E1.., C1..)
//   - every sentence must cite at least one real evidence id, or it is dropped
//   - sentences with jargon, labels about the child, percentages or gendered
//     pronouns are dropped
//   - fewer than 2 surviving sentences → the offline template is used instead
//   - a failed/slow model call also falls back to the template
// The result is cached on the profile and only regenerated when the number of
// recorded answers changes. See docs/PARENT_VIEW.md.
// ─────────────────────────────────────────────────────────────────
import { generateJSON } from '../ai/gateway';
import { getRepo } from '../adaptive/repo';
import { getCurriculum } from '../curriculum/ingest';
import { compileTeachingPlan } from '../plan';
import type { EvidenceEvent, LearnerClaim, LearnerProfile } from '../adaptive/learnerModel';
import type { CitedLine, HomeTip, ParentReport, ReportNarrative } from './types';
import { BaseReport, buildBaseReport } from './facts';
import { hasInternalTerm, hasLabel, outcomeWords } from './plainLanguage';

const MAX_PROMPT_EVENTS = 60;
const PRONOUNS = /\b(he|she|his|her|hers|him|himself|herself)\b/i;

// ─── Sentence gate ──────────────────────────────────────────────

export interface LineGateContext {
  /** Every id the model may cite → the real event ids it stands for. */
  idMap: Map<string, string[]>;
  realEventIds: Set<string>;
}

/** Returns a cleaned line, or null (with a reason) if it must not be shown. */
export function gateLine(raw: any, ctx: LineGateContext): { line: CitedLine | null; reason?: string } {
  const text = typeof raw?.text === 'string' ? raw.text.replace(/\s+/g, ' ').trim() : '';
  if (text.length < 20 || text.length > 260) return { line: null, reason: 'length' };
  if (hasInternalTerm(text)) return { line: null, reason: 'jargon' };
  if (hasLabel(text)) return { line: null, reason: 'label' };
  if (/%|\bpercent\b/i.test(text)) return { line: null, reason: 'number-score' };
  if (PRONOUNS.test(text)) return { line: null, reason: 'pronoun' };
  const cited = Array.isArray(raw?.evidence) ? raw.evidence : [];
  const ids = new Set<string>();
  for (const c of cited) {
    for (const real of ctx.idMap.get(String(c).trim().toUpperCase()) || []) {
      if (ctx.realEventIds.has(real)) ids.add(real);
    }
  }
  if (!ids.size) return { line: null, reason: 'no-evidence' };
  return { line: { text, evidenceIds: [...ids].slice(0, 4) } };
}

export function gateHomeTip(raw: any): HomeTip | null {
  const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
  const steps: string[] = Array.isArray(raw?.steps) ? raw.steps.map((s: any) => String(s).trim()).filter(Boolean) : [];
  const minutes = Number(raw?.minutes);
  if (!title || title.length > 90 || steps.length < 2 || steps.length > 4) return null;
  if ([title, ...steps].some((t) => t.length > 220 || hasInternalTerm(t) || hasLabel(t) || /%/.test(t) || PRONOUNS.test(t))) return null;
  return { title, steps, minutes: Math.max(3, Math.min(10, Number.isFinite(minutes) ? Math.round(minutes) : 5)), source: 'ai' };
}

// ─── Offline template (always available, never calls a model) ───

function claimsFor(learner: LearnerProfile, subjectId: string): LearnerClaim[] {
  return (learner.claims || []).filter((c) => c.status === 'active' && (!c.scope.subjectId || c.scope.subjectId === subjectId
    || c.scope.subjectId === 'mathematics'));
}

const STAGE_PHRASE = ['', 'recognise the idea', 'explain why it works', 'solve new problems using the idea', 'use the idea in unfamiliar situations', 'teach the idea back'];

export function templateNarrative(base: BaseReport, learner: LearnerProfile, answers: number, now = Date.now()): ReportNarrative {
  const name = base.childName;
  const known = (ids: string[]) => ids.filter((i) => base.evidence[i]);
  const letter: CitedLine[] = [];
  const evOf = (conceptId: string, pick: 'best' | 'last') => {
    const cards = Object.values(base.evidence).filter((c) => c.conceptLabel === base.journey.find((j) => j.conceptId === conceptId)?.label)
      .sort((a, b) => a.at - b.at);
    return cards.length ? [pick === 'last' ? cards[cards.length - 1].id : cards[0].id] : [];
  };

  const top = [...base.journey].filter((j) => j.stage >= 1 && j.mixUp !== 'open').sort((a, b) => b.stage - a.stage)[0];
  if (top) {
    const ev = known(evOf(top.conceptId, 'last'));
    if (ev.length) letter.push({ text: `On “${top.label}”, ${name} can now ${STAGE_PHRASE[top.stage]}.`, evidenceIds: ev });
  }
  for (const s of base.story.filter((t) => t.state === 'fixed')) {
    const ev = known(s.steps[s.steps.length - 1].evidenceIds);
    if (ev.length) letter.push({ text: `A mix-up in “${s.conceptLabel}” was spotted early and is now fixed: a question that was new to ${name} was answered correctly.`, evidenceIds: ev });
  }
  for (const s of base.story.filter((t) => t.state === 'open')) {
    const ev = known(s.steps[s.steps.length - 1].evidenceIds);
    if (ev.length) letter.push({ text: `Ananta is working with ${name} on a mix-up in “${s.conceptLabel}” that has come up more than once.`, evidenceIds: ev });
  }
  for (const s of base.story.filter((t) => t.state === 'watching')) {
    const ev = known(s.steps[0].evidenceIds);
    if (ev.length) letter.push({ text: `Ananta is keeping an eye on a possible mix-up in “${s.conceptLabel}”; it has only been seen once so far.`, evidenceIds: ev });
  }
  if (letter.length < 2) {
    const last = Object.values(base.evidence).sort((a, b) => b.at - a.at)[0];
    if (last) letter.push({ text: `${name} has had ${base.stats.answersChecked} answer${base.stats.answersChecked === 1 ? '' : 's'} checked by Ananta so far, and each one shapes the next lesson.`, evidenceIds: [last.id] });
  }

  const worksFor: CitedLine[] = [];
  for (const s of base.story.filter((t) => t.state === 'fixed')) {
    const ch = s.steps.find((x) => x.kind === 'changed');
    if (ch) worksFor.push({ text: `${name} got past the mix-up in “${s.conceptLabel}” once Ananta changed its approach. Ananta now knows to try that first with similar ideas.`, evidenceIds: known(ch.evidenceIds) });
  }
  for (const c of claimsFor(learner, base.subjectId).filter((x) => x.kind === 'strategy')) {
    const text = c.statement.replace(/\b[Tt]he (learner|student|child)\b/g, name).replace(/\s+/g, ' ').trim();
    const ids = known(c.evidenceRefs);
    if (ids.length && text.length < 260 && !hasInternalTerm(text) && !hasLabel(text) && !PRONOUNS.test(text) && !/%/.test(text)) {
      worksFor.push({ text, evidenceIds: ids.slice(0, 4) });
    }
  }

  const focus = base.story.find((s) => s.state !== 'fixed')?.conceptLabel || base.journey[0]?.label || base.subjectLabel;
  const interest = learner.onboarding?.interests?.[0];
  const homeTip: HomeTip = {
    title: `Five minutes on “${focus}”`,
    minutes: 5,
    steps: [
      `Ask ${name} to teach you “${focus}” as if you had never heard of it. You do not need to know the answer; listening is the job.`,
      `Ask for one example from real life${interest ? `, for instance something to do with ${interest}` : ''}. If it is hard to think of one, that is useful for Ananta to know.`,
      `If ${name} gets stuck, say “show me with a drawing” instead of giving the answer.`,
    ],
    source: 'template',
  };
  return { letter: letter.slice(0, 5), worksFor: worksFor.slice(0, 3), homeTip, source: 'template', basedOnAnswers: answers, generatedAt: now };
}

// ─── AI narrative ───────────────────────────────────────────────

function buildPrompt(base: BaseReport, learner: LearnerProfile, events: EvidenceEvent[], claims: LearnerClaim[]) {
  const recent = events.slice(-MAX_PROMPT_EVENTS);
  const idMap = new Map<string, string[]>();
  const evIdByReal = new Map<string, string>();
  recent.forEach((e, i) => { idMap.set(`E${i + 1}`, [e.eventId]); evIdByReal.set(e.eventId, `E${i + 1}`); });
  const lines = recent.map((e, i) => `E${i + 1} [${base.evidence[e.eventId]?.conceptLabel || e.conceptId}] Ananta asked: "${base.evidence[e.eventId]?.asked || ''}" | ${base.childName} answered: "${base.evidence[e.eventId]?.answered || ''}"${base.evidence[e.eventId]?.reasoning ? ` | explained: "${base.evidence[e.eventId].reasoning}"` : ''} | result: ${outcomeWords(e)} | Ananta was ${e.representationUsed.replace(/_/g, ' ')}`);

  const claimLines: string[] = [];
  claims.forEach((c, i) => {
    const real = c.evidenceRefs.filter((r) => evIdByReal.has(r));
    if (!real.length) return;
    const id = `C${i + 1}`;
    idMap.set(id, real);
    claimLines.push(`${id} (${c.kind}) ${c.statement}`);
  });

  const stories = base.story.map((s) => `- ${s.conceptLabel}: "${s.mixUp}" — ${s.state}. ${s.steps.map((st) => `${st.title} [${st.evidenceIds.map((x) => evIdByReal.get(x)).filter(Boolean).join(',')}]`).join(' → ')}`);
  const notes = (learner.sessionSummaries || []).slice(-4).map((s) => `- ${s.narrative}`);
  const prompt = `You write a short, warm progress note for a parent, using ONLY verified evidence from their child's lessons with Ananta, an AI tutor.

RULES (a program checks every one; lines that break them are deleted):
- Refer to the child as "${base.childName}" or "they". Never he/she/his/her.
- Everyday words only. No jargon, no scores, no percentages, no mention of levels or models.
- Never label the child ("visual learner", "smart", "struggles", "slow"). Describe what happened and what helped.
- Every line in "letter" and "worksFor" must cite 1-3 ids from the evidence lists below (like "E4" or "C2") in "evidence". Do not cite ids that are not listed. Do not state anything the evidence does not show.
- "letter": 3-5 sentences, each under 220 characters, covering what ${base.childName} now understands, what Ananta noticed, and what Ananta changed so far. Do NOT say what Ananta "will" do next: the real plan for the next lesson is shown separately and must not be contradicted or invented.
- "worksFor": 0-3 sentences about which way of explaining helped, ONLY if the evidence shows it.
- "homeTip": one 3-8 minute activity a parent can do tonight with no maths knowledge: 2-4 short steps that make the child explain or draw, never a worksheet.

CHILD: ${base.childName}, ${base.grade}${base.board ? ` ${base.board}` : ''}, ${base.subjectLabel}. Interests: ${(learner.onboarding?.interests || []).join(', ') || 'not given'}.
LESSONS: ${base.stats.lessons} lessons, ${base.stats.minutes} minutes, ${base.stats.answersChecked} answers checked.

MIX-UP STORIES (what Ananta noticed and did):
${stories.join('\n') || '(none)'}

NOTES ANANTA WROTE AFTER RECENT LESSONS:
${notes.join('\n') || '(none)'}

CHECKED STATEMENTS ABOUT HOW THIS CHILD LEARNS:
${claimLines.join('\n') || '(none)'}

ANSWERS (evidence):
${lines.join('\n') || '(none)'}

Return ONLY JSON:
{"letter":[{"text":"...","evidence":["E3","C1"]}],"worksFor":[{"text":"...","evidence":["E5"]}],"homeTip":{"title":"...","minutes":5,"steps":["...","..."]}}`;
  return { prompt, idMap };
}

export async function aiNarrative(
  base: BaseReport, learner: LearnerProfile, events: EvidenceEvent[], apiKey: string,
  gen: typeof generateJSON = generateJSON, now = Date.now(),
): Promise<ReportNarrative | null> {
  const claims = claimsFor(learner, base.subjectId);
  const { prompt, idMap } = buildPrompt(base, learner, events, claims);
  const ctx: LineGateContext = { idMap, realEventIds: new Set(events.map((e) => e.eventId)) };
  let data: any; let model: string | undefined;
  try {
    const r = await gen<any>({ role: 'strong', call: 'parent.report', apiKey, prompt, timeoutMs: 25000 });
    data = r.data; model = r.model;
  } catch (err: any) {
    console.error('[ParentReport] model call failed, using template:', err?.message || err);
    return null;
  }
  let rejected = 0;
  const keep = (arr: any, max: number): CitedLine[] => {
    const out: CitedLine[] = [];
    for (const raw of Array.isArray(arr) ? arr : []) {
      const g = gateLine(raw, ctx);
      if (g.line) out.push(g.line); else rejected++;
    }
    return out.slice(0, max);
  };
  const letter = keep(data?.letter, 5);
  if (letter.length < 2) {
    console.warn(`[ParentReport] only ${letter.length} sentence(s) survived the evidence check (${rejected} rejected) — using template`);
    return null;
  }
  const tpl = templateNarrative(base, learner, events.length, now);
  return {
    letter,
    worksFor: keep(data?.worksFor, 3).length ? keep(data?.worksFor, 3) : tpl.worksFor,
    homeTip: gateHomeTip(data?.homeTip) || tpl.homeTip,
    source: 'ai', model, basedOnAnswers: events.length, generatedAt: now, rejectedLines: rejected,
  };
}

// ─── Service ────────────────────────────────────────────────────

/** Only this subject's answers. The stores' own `subjectId` filter is NOT applied (neither the file nor the
 * Firestore repository implements it), so without this a child's Maths answers would be reported under Biology.
 * Legacy events with no subjectId are matched by whether their concept belongs to the subject. */
export function eventsForSubject(events: EvidenceEvent[], learner: LearnerProfile, subjectId: string): EvidenceEvent[] {
  const concepts = learner.subjects[subjectId]?.conceptStates || {};
  return events.filter((e) => (e.subjectId ? e.subjectId === subjectId : Boolean(concepts[e.conceptId])));
}

async function load(studentId: string, requestedSubject?: string) {
  const repo = getRepo();
  const learner = await repo.getProfile(studentId);
  if (!learner) return null;
  const subjects = Object.values(learner.subjects);
  if (!subjects.length) return { learner, subjectId: '', events: [] as EvidenceEvent[] };
  const subjectId = requestedSubject && learner.subjects[requestedSubject]
    ? requestedSubject
    : [...subjects].sort((a, b) => (b.lastSession || 0) - (a.lastSession || 0))[0].subjectId;
  const events = eventsForSubject((await repo.listEvents(studentId)) as EvidenceEvent[], learner, subjectId);
  return { learner, subjectId, events };
}

function safePlan(learner: LearnerProfile, subjectId: string) {
  try {
    const curriculum = getCurriculum(subjectId);
    if (!curriculum) return null;
    // Next lesson continues the topic that still has an open or watched mix-up (most recent first);
    // otherwise the plan compiler's own choice stands.
    const states = Object.values(learner.subjects[subjectId]?.conceptStates || {});
    const standing = states
      .filter((cs) => (cs.misconceptionLedger || []).some((m) => m.status === 'confirmed' || m.status === 'suspected'))
      .sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0))[0];
    return compileTeachingPlan(learner, curriculum, {
      studentId: learner.studentId, subjectId, channel: 'text', requestedConceptId: standing?.conceptId,
    });
  } catch (err: any) {
    console.warn('[ParentReport] could not compile next-lesson plan:', err?.message || err);
    return null;
  }
}

/** Instant: deterministic sections + cached (or template) narrative. Never calls a model. */
export async function getParentReport(studentId: string, requestedSubject?: string): Promise<ParentReport | null> {
  const loaded = await load(studentId, requestedSubject);
  if (!loaded) return null;
  const { learner, subjectId, events } = loaded;
  if (!subjectId) return null;
  const base = buildBaseReport(learner, subjectId, events, safePlan(learner, subjectId));
  const cached = learner.parentNarratives?.[subjectId];
  const fresh = cached && events.length > 0 && cached.basedOnAnswers === events.length;
  const narrative = fresh ? cached! : templateNarrative(base, learner, events.length);
  return { ...base, narrative, narrativeStale: !fresh };
}

const inflight = new Map<string, Promise<ParentReport | null>>();
const failedAt = new Map<string, number>();
const RETRY_AFTER_FAIL_MS = 2 * 60_000;

/** Slow path: ask Gemini, validate, cache on the profile, return the full report. */
export function generateParentReport(studentId: string, requestedSubject: string | undefined, apiKey: string | undefined, force = false): Promise<ParentReport | null> {
  const key = `${studentId}:${requestedSubject || ''}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  // After a failed model attempt, don't hammer the model on every page view.
  const lastFail = failedAt.get(key);
  if (lastFail && Date.now() - lastFail < RETRY_AFTER_FAIL_MS && !force) {
    return getParentReport(studentId, requestedSubject);
  }
  const p = (async () => {
    const loaded = await load(studentId, requestedSubject);
    if (!loaded || !loaded.subjectId) return null;
    const { learner, subjectId, events } = loaded;
    const base = buildBaseReport(learner, subjectId, events, safePlan(learner, subjectId));
    let narrative: ReportNarrative | null = null;
    if (apiKey && events.length) narrative = await aiNarrative(base, learner, events, apiKey);
    if (!narrative) narrative = templateNarrative(base, learner, events.length);
    if (narrative.source === 'ai') {
      // Only a real, validated AI narrative is cached. A changed answer count invalidates it.
      const repo = getRepo();
      const fresh = await repo.getProfile(studentId);
      if (fresh) {
        fresh.parentNarratives = { ...(fresh.parentNarratives || {}), [subjectId]: narrative };
        await repo.saveProfile(fresh);
      }
      failedAt.delete(key);
    } else if (apiKey && events.length) {
      failedAt.set(key, Date.now());
    }
    return { ...base, narrative, narrativeStale: false };
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

