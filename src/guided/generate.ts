// ─────────────────────────────────────────────────────────────────
// Guided lesson generator: Gemini writes a line-by-line chalkboard lesson
// for one concept, from material already stored and checked for it
// (curriculum key facts, worked examples, misconceptions, practice items,
// and the board pictures with their steps).
//
//   draft → deterministic checks (validate.ts) → independent critic → repair
//   → ship, or WITHHOLD (fail closed: a withheld concept keeps the standard tutor).
//
// The same loop the lesson text and board pictures use (src/curriculum/lessonGen.ts,
// src/visual/generate.ts). The model is injected so tests run it offline.
// ─────────────────────────────────────────────────────────────────

import { isQuotaError } from '../ai/gateway';
import type { JsonModel } from '../quality/model';
import { BEAT_KINDS, type Beat, type BoardItem, type BoardLine, type GuidedScript, type LineStyle } from './types';
import { validateScript, LIMITS, type PictureRef } from './validate';

// ─── What the generator is given ──────────────────────────────────

/** Every model is out of credits/quota: the run stops (this is not a lesson failure, so nothing is marked 'withheld'). */
export class QuotaExhaustedError extends Error {}

export interface ConceptSource {
  conceptId: string;
  label: string;
  subject: string;
  grade: string;
  keyFacts: string[];
  workedExamples: string[];
  misconceptions: Array<{ belief: string; correctionHint?: string; probeQuestion?: string }>;
  representationIdeas: string[];
  practice: Array<{ level?: number; prompt: string; lookFor?: string }>;
  prerequisites: string[];
}

export interface PictureInfo {
  key: string;
  title: string;
  steps: Array<{ id: string; caption: string; shows: string[] }>;
}

const s = (v: unknown, max = 900) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** Curriculum concept + stored record → what the prompt needs. Never invents content. */
export function sourceFromCurriculum(
  concept: any,
  course: any,
  record: any,
  labelOf: (id: string) => string = (id) => id,
): { source: ConceptSource; pictures: PictureInfo[]; pictureRefs: Record<string, PictureRef> } {
  const source: ConceptSource = {
    conceptId: String(concept.id),
    label: s(concept.label, 200),
    subject: s(course?.subject || course?.label || '', 80),
    grade: s(String(course?.grade ?? course?.gradeLevel ?? ''), 40),
    keyFacts: arr(concept.keyFacts).map((x) => s(x, 600)).filter(Boolean),
    workedExamples: arr(concept.workedExamples).map((x) => s(x, 1400)).filter(Boolean),
    misconceptions: (arr(concept.misconceptionDetails).length ? arr(concept.misconceptionDetails) : arr(concept.commonMisconceptions).map((b: any) => ({ belief: b })))
      .map((m: any) => ({ belief: s(m.belief, 400), correctionHint: s(m.correctionHint, 400) || undefined, probeQuestion: s(m.probeQuestion, 300) || undefined }))
      .filter((m) => m.belief),
    representationIdeas: arr(concept.representationIdeas).map((r: any) => s(typeof r === 'string' ? r : `${r.strategy}: ${r.idea}`, 500)).filter(Boolean),
    practice: arr(concept.ladderItems).map((l: any) => ({ level: l.level, prompt: s(l.prompt, 400), lookFor: s(l.lookFor, 400) || undefined })).filter((l) => l.prompt),
    prerequisites: arr(concept.prerequisites).map((p: any) => labelOf(String(p))),
  };
  const pictures: PictureInfo[] = [];
  const pictureRefs: Record<string, PictureRef> = {};
  for (const [key, v] of Object.entries<any>(record?.visuals ?? {})) {
    if (!v || !Array.isArray(v.steps)) continue;
    const labelById = new Map<string, string>(arr(v.elements).map((e: any) => [String(e.id), s(e.label || e.text || '', 80)]));
    pictures.push({
      key,
      title: s(v.title, 120),
      steps: v.steps.map((st: any) => ({
        id: String(st.id),
        caption: s(st.caption, 200),
        shows: arr(st.show).map((id: any) => labelById.get(String(id)) || '').filter(Boolean),
      })),
    });
    pictureRefs[key] = { steps: v.steps.map((st: any) => ({ id: String(st.id) })) };
  }
  return { source, pictures, pictureRefs };
}

// ─── Prompts ──────────────────────────────────────────────────────

const SHAPE = `{
  "version": 1,
  "conceptId": "<given>",
  "title": "<short lesson title>",
  "beats": [
    { "id": "b1", "kind": "orient", "say": "<what this beat is for, 1-2 sentences, guidance for the tutor>",
      "board": [ { "type": "heading", "text": "<max 40 chars>" } ],
      "lines": [ { "id": "l1", "text": "<what is written>", "say": "<what the tutor says as it appears>", "style": "point" } ] },
    { "id": "b2", "kind": "show", "say": "...",
      "board": [ { "type": "heading", "text": "..." }, { "type": "picture", "ref": "<picture key>", "step": "<step id>" } ],
      "lines": [
        { "id": "given", "text": "Two points:  (2, 1)  and  (2, 5)", "say": "Let's take two points on the line x = 2: two-comma-one and two-comma-five.", "style": "work" },
        { "id": "rise", "text": "rise = 5 − 1 = 4", "say": "Rise is how far we go up: y goes from 1 to 5, so 5 minus 1 is 4.", "style": "work" },
        { "id": "run", "text": "run = 2 − 2 = 0", "say": "Run is 2 minus 2, which is 0 - we do not move across at all.", "style": "work",
          "ask": { "prompt": "Your turn: x goes from 2 to 2. What is the run?", "lookFor": "0, because both x values are 2", "onMiss": "Point to the two x values on the board - how far across is 2 to 2?" },
          "picture": { "ref": "<picture key>", "step": "<later step id>" } },
        { "id": "rule", "text": "gradient = rise ÷ run", "say": "...", "style": "rule" }
      ] }
  ]
}`;

function sourceBlock(src: ConceptSource, pictures: PictureInfo[]): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `  - ${x}`).join('\n') : '  (none)');
  return `CONCEPT: ${src.label}
SUBJECT: ${src.subject}    GRADE / LEVEL: ${src.grade}
conceptId: ${src.conceptId}
BUILDS ON: ${src.prerequisites.join('; ') || '(nothing listed)'}

KEY FACTS (the only facts you may teach):
${list(src.keyFacts)}

WORKED EXAMPLES (use their numbers and steps; you may split a step into smaller lines, never skip one):
${list(src.workedExamples)}

COMMON MISCONCEPTIONS:
${list(src.misconceptions.map((m) => `${m.belief}${m.correctionHint ? `  →  correction: ${m.correctionHint}` : ''}`))}

REPRESENTATION IDEAS:
${list(src.representationIdeas)}

PRACTICE ITEMS (for the apply / check beats):
${list(src.practice.map((p) => `${p.prompt}${p.lookFor ? `  (look for: ${p.lookFor})` : ''}`))}

BOARD PICTURES (use ONLY these keys and step ids; a step shows everything in earlier steps too):
${pictures.length ? pictures.map((p) => `  • "${p.key}" - ${p.title}\n${p.steps.map((st) => `      ${st.id}: caption "${st.caption}"${st.shows.length ? ` | shows: ${st.shows.join(', ')}` : ''}`).join('\n')}`).join('\n') : '  (none - write no picture items)'}`;
}

const METHOD = `THE METHOD (non-negotiable). Teach like the best chalkboard teacher: SAY a line, WRITE it, explain it, next line.
1. Every beat is written LINE BY LINE in "lines". "board" may hold only a heading and/or one picture, shown as the beat starts.
2. One line = one idea or one operation. Max ${LIMITS.maxLineChars - 20} characters. Never two steps in one line.
3. "say" is what the tutor says as the line appears: read the line aloud in words, then at most one sentence of why. Max 2 sentences.
4. NEVER SKIP A STEP. In working, go: what is given → unpack it (name each value) → the rule/formula in words → substitute → calculate → what it means.
   Every number used on a line with "=" must already be written on a line ABOVE it in the same beat (only the final result after the last "=" may be new).
5. INTERACTIVE: at least 4 lines across the lesson are ASKED lines (they have "ask"). How an asked line works, in order:
     a) the tutor asks "ask.prompt" - nothing is written yet;
     b) the learner answers (with "ask.onMiss" as a hint if they are stuck);
     c) only then is "text" written on the board, while the tutor says "say" to confirm it.
   So for an asked line:
     - "text" is the ANSWER, written as a normal board line (e.g. "64 × 2 = 128 chromatids") - never the question, never "ask: ...";
     - "ask.prompt" is the question; it must not contain the answer;
     - "say" is spoken AFTER the learner answered: it confirms and explains the answer ("Yes - each of the 64 doubles, so 128.");
     - "ask.onMiss" is a HINT that points to what is on the board - it must NOT state the answer or the calculation that gives it;
     - "ask.lookFor" says what a good answer contains (the reasoning, not only the result).
   The answer must not appear anywhere BEFORE it is asked: not in an earlier line or its "say", not in the heading,
   and not in a picture step shown before it (check each step's caption and "shows"; move the picture on with the
   asked line's own "picture" field, so it changes only when the answer is written).
   GOOD: earlier line "Parent cell: 64 chromosomes"; asked line text "64 × 2 = 128 chromatids", prompt "Each chromosome copies itself. How many chromatids now?", onMiss "Look at the 64 on the board - what happens to each one?", say "Right - 64 doubled is 128 chromatids."
   BAD: an earlier line "Room = organ" and then asking "If a brick is a cell, what is a room?" (answer already shown).
8. Do not repeat a line in other words. Each line adds something new.
6. Use the standard terms of the syllabus for this grade, define each new term in words before using it, and keep sentences short for this age.
7. Teach ONLY what is in the key facts and worked examples. Do not add facts, numbers or claims from elsewhere.

LESSON SHAPE: 7 to 10 beats.
  b1 "orient": 1-3 lines - what we are learning and why it matters (no question yet).
  then "define" / "show" / "analogy" / "method" beats that build the idea step by step, using a worked example line by line;
  at least one line with "style": "rule" states the key rule or definition;
  1-2 "contrast" beats that each take one misconception: write the wrong idea, test it, show why it fails, write the correct idea;
  an "apply" beat: the learner works a fresh practice item, with asked lines for each step they can do;
  a final "check" beat: one asked line that tests the core idea.
Total lines: 25 to 40. Kinds allowed: ${BEAT_KINDS.join(', ')}. Line styles: "work" (working), "point" (a statement), "rule" (boxed rule).`;

export function buildGuidedPrompt(src: ConceptSource, pictures: PictureInfo[]): string {
  return `You are writing a prepared lesson for an AI voice tutor that teaches one child at a time on a shared chalkboard.
The tutor speaks while the board writes; the child can interrupt at any time.

${METHOD}

${sourceBlock(src, pictures)}

Return ONLY JSON in exactly this shape (the example lines show the style - write your own for this concept):
${SHAPE}`;
}

export function buildRepairPrompt(src: ConceptSource, pictures: PictureInfo[], script: unknown, problems: string[]): string {
  return `You wrote this prepared chalkboard lesson. It has problems that must be fixed. Return the WHOLE corrected lesson.

PROBLEMS TO FIX:
${problems.map((p) => `  - ${p}`).join('\n')}

${METHOD}

${sourceBlock(src, pictures)}

THE LESSON TO FIX:
${JSON.stringify(script)}

Return ONLY the corrected JSON, same shape. Keep what is right; change only what the problems require.`;
}

export function buildCriticPrompt(src: ConceptSource, pictures: PictureInfo[], script: GuidedScript): string {
  return `You are an experienced ${src.subject} teacher checking a prepared lesson BEFORE a child sees it. Be strict and specific.
The tutor says each line's "say" while the line is written. Lines with "ask" are hidden until the child answers.

How the lesson runs: the tutor says each line's "say" as the line is written. An ASKED line (it has "ask") works like this:
the tutor asks "ask.prompt" with nothing written; the learner answers; THEN the line's "text" is written and its "say" is spoken to confirm it.
So the "say" and "text" of an asked line coming AFTER the question is correct - do not report that.
The source material is everything listed below (key facts, worked examples, misconceptions, practice items, pictures).

Report an ERROR for any of:
  - a fact, number or calculation that is wrong, or not supported by the source material below;
  - a skipped step: a line that does not follow from the lines above it, or a value used before it is worked out;
  - an answer revealed before its question: in an earlier line or an earlier line's "say", the heading, the ask.prompt itself, the ask.onMiss hint, or a picture step shown before it (check captions and "shows");
  - a "say" that does not match its line, or a misconception stated as if it were true without being corrected;
  - wrong or non-standard terminology for this grade.
Report a WARNING for: wording too hard for the grade, a line with two ideas, a weak hint, or a dull or confusing analogy.
Do not report style preferences.

${sourceBlock(src, pictures)}

THE LESSON:
${JSON.stringify(script)}

Return ONLY JSON: { "issues": [ { "severity": "error" | "warning", "where": "<beat id>/<line id>", "problem": "<what is wrong>", "fix": "<how to fix it>" } ] }
An empty list means the lesson is ready.`;
}

// ─── Coercion ─────────────────────────────────────────────────────

const STYLES: LineStyle[] = ['work', 'point', 'rule'];

/** Coerce a model answer into a GuidedScript: trims, fills missing ids, drops unknown fields. Never invents teaching content. */
export function normalizeScript(raw: any, conceptId: string, fallbackTitle: string): GuidedScript | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.beats)) return null;
  const beatIds = new Set<string>();
  const beats: Beat[] = raw.beats.map((b: any, i: number): Beat => {
    let id = s(b?.id, 24) || `b${i + 1}`;
    if (beatIds.has(id)) id = `b${i + 1}x`;
    beatIds.add(id);
    const kind = (BEAT_KINDS as readonly string[]).includes(b?.kind) ? b.kind : 'show';
    const board: BoardItem[] = arr(b?.board).flatMap((it: any): BoardItem[] => {
      if (it?.type === 'heading' && s(it.text)) return [{ type: 'heading', text: s(it.text, 60) }];
      if (it?.type === 'picture' && s(it.ref)) return [{ type: 'picture', ref: s(it.ref, 120), ...(s(it.step) ? { step: s(it.step, 20) } : {}) }];
      if ((it?.type === 'point' || it?.type === 'rule') && s(it.text)) return [{ type: it.type, text: s(it.text, 120) }];
      return [];
    });
    const lineIds = new Set<string>();
    const lines: BoardLine[] = arr(b?.lines).flatMap((l: any, k: number): BoardLine[] => {
      const text = s(l?.text, 140);
      if (!text) return [];
      let lid = s(l?.id, 24) || `l${k + 1}`;
      if (lineIds.has(lid)) lid = `${lid}_${k + 1}`;
      lineIds.add(lid);
      const line: BoardLine = { id: lid, text, say: s(l?.say, 500), style: STYLES.includes(l?.style) ? l.style : 'work' };
      if (l?.ask && s(l.ask.prompt)) line.ask = { prompt: s(l.ask.prompt, 300), lookFor: s(l.ask.lookFor, 300), onMiss: s(l.ask.onMiss, 300) };
      if (l?.picture && s(l.picture.ref)) line.picture = { ref: s(l.picture.ref, 120), ...(s(l.picture.step) ? { step: s(l.picture.step, 20) } : {}) };
      return [line];
    });
    return { id, kind, say: s(b?.say, 700), board, ...(lines.length ? { lines } : {}) } as Beat;
  });
  return { version: 1, conceptId, title: s(raw.title, 80) || fallbackTitle, beats };
}

// ─── The loop ─────────────────────────────────────────────────────

export interface CriticIssue { severity: 'error' | 'warning'; where: string; problem: string; fix?: string }

export interface GuidedGenResult {
  script: GuidedScript | null;
  withheld: boolean;
  /** Last draft, kept for review when withheld. */
  quarantined?: GuidedScript | null;
  /** Open problems: validator errors/warnings and critic issues. */
  errors: string[];
  warnings: string[];
  attempts: number;
  criticCalls: number;
  model?: string;
  error?: string;
}

export interface GuidedGenOptions {
  maxAttempts?: number; // draft + repairs, default 3
  critic?: boolean;     // default true
  timeoutMs?: number;
}

const isSoft = (e: string) => /a step is missing/.test(e);

/** Lessons must be line by line, with enough questions - stricter than hand-written scripts. */
function generatedRules(script: GuidedScript): string[] {
  const out: string[] = [];
  script.beats.forEach((b, i) => {
    if (!b.lines?.length) out.push(`beat ${i + 1} (${b.id}) has no "lines" - every beat must be written line by line`);
    if (b.ask) out.push(`beat ${i + 1} (${b.id}) has a beat-level "ask" - put questions on lines instead`);
    if (b.board.some((x) => x.type !== 'heading' && x.type !== 'picture')) out.push(`beat ${i + 1} (${b.id}) writes text in "board" - only a heading and a picture may go there; write text as lines`);
  });
  const asks = script.beats.reduce((n, b) => n + (b.lines?.filter((l) => l.ask).length ?? 0), 0);
  if (asks < 4) out.push(`only ${asks} asked lines - the lesson needs at least 4 lines where the learner answers first`);
  const total = script.beats.reduce((n, b) => n + (b.lines?.length ?? 0), 0);
  if (total > 45) out.push(`${total} lines in total - keep it to 40 or fewer`);
  return out;
}

export async function generateGuidedLesson(
  src: ConceptSource,
  pictures: PictureInfo[],
  pictureRefs: Record<string, PictureRef>,
  model: JsonModel,
  opts: GuidedGenOptions = {},
): Promise<GuidedGenResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  let attempts = 0, criticCalls = 0, usedModel: string | undefined;
  let draft: GuidedScript | null = null;
  let problems: string[] = [];
  let warnings: string[] = [];

  while (attempts < maxAttempts) {
    attempts++;
    const prompt = attempts === 1 || !draft
      ? buildGuidedPrompt(src, pictures)
      : buildRepairPrompt(src, pictures, draft, problems);
    let raw: any;
    try {
      const r = await model({ call: attempts === 1 ? 'guided.draft' : 'guided.repair', role: 'strong', prompt, timeoutMs });
      raw = r.data; usedModel = r.model;
    } catch (err: any) {
      if (isQuotaError(err)) throw new QuotaExhaustedError(String(err?.message || err));
      problems = [`model call failed: ${err?.message || err}`];
      continue;
    }
    const next = normalizeScript(raw, src.conceptId, src.label);
    if (!next) { problems = ['the answer was not a lesson in the required JSON shape']; continue; }
    draft = next;

    const v = validateScript(draft, { expectedConceptId: src.conceptId, pictures: pictureRefs });
    // The "number appears from nowhere" check is a heuristic: worth a repair, but on the last draft it is left
    // to the critic (which reads the working) instead of withholding the lesson for it.
    const soft = v.errors.filter(isSoft);
    const hard = [...v.errors.filter((e) => !isSoft(e)), ...generatedRules(draft)];
    warnings = v.warnings;
    const lastDraft = attempts >= maxAttempts;
    problems = lastDraft ? hard : [...hard, ...soft];
    if (lastDraft) warnings = [...warnings, ...soft.map((e) => `check: ${e}`)];
    if (problems.length) continue;

    if (opts.critic === false) break;
    try {
      criticCalls++;
      const c = await model({ call: 'guided.critic', role: 'review', prompt: buildCriticPrompt(src, pictures, draft), timeoutMs });
      const issues: CriticIssue[] = arr(c.data?.issues).map((x: any): CriticIssue => ({
        severity: x?.severity === 'error' ? 'error' : 'warning', where: s(x?.where, 60), problem: s(x?.problem, 400), fix: s(x?.fix, 400) || undefined,
      })).filter((x) => x.problem);
      const crit = issues.filter((x) => x.severity === 'error').map((x) => `[${x.where}] ${x.problem}${x.fix ? ` - fix: ${x.fix}` : ''}`);
      warnings = [...warnings, ...issues.filter((x) => x.severity === 'warning').map((x) => `critic [${x.where}]: ${x.problem}`)];
      problems = crit;
      if (!problems.length) break;
    } catch (err: any) {
      if (isQuotaError(err)) throw new QuotaExhaustedError(String(err?.message || err));
      // A critic that cannot run is not a pass: withhold rather than ship unchecked.
      problems = [`critic could not run: ${err?.message || err}`];
      break;
    }
  }

  if (draft && problems.length === 0) {
    return { script: draft, withheld: false, errors: [], warnings, attempts, criticCalls, model: usedModel };
  }
  return { script: null, withheld: true, quarantined: draft, errors: problems, warnings, attempts, criticCalls, model: usedModel };
}
