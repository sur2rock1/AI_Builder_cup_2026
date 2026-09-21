// ─────────────────────────────────────────────────────────────────
// Live Observer — keeps the learner panel in step with the conversation.
//
// It LISTENS to the voice lesson (the transcripts Gemini Live already
// produces) and, after each exchange, asks a separate text model what the
// child has shown so far. The result goes to the browser only.
//
// It never talks to the voice session: no tool call, no injected text, no
// waiting. The voice conversation runs exactly as before whether this
// succeeds, fails or is slow. (Blocking the voice model on an assessment is
// what caused the pauses earlier — see DECISIONS.md.)
//
// Guard-rails, because the model is not trusted blindly:
//   - understanding moves at most ±MAX_STEP per exchange;
//   - a misconception starts as "suspected"; it can only become "confirmed"
//     if it was already suspected in an earlier exchange (one ambiguous
//     answer never labels a child);
//   - every claim must carry the child's own words as evidence, or it is
//     dropped.
// ─────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';

const MODEL_CANDIDATES = ['gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
const MAX_STEP = 20;
const MAX_TURNS_IN_PROMPT = 14;
const MAX_MISCONCEPTIONS = 4;

let resolvedModel: string | null = null;
const failedModels = new Set<string>();

export interface Turn { role: 'tutor' | 'child' | 'board'; text: string; at: number }

export type Level = 'not_yet_seen' | 'recognises' | 'explains' | 'applies' | 'transfers';

export interface Misconception {
  id: string;
  text: string;
  status: 'suspected' | 'confirmed' | 'resolved';
  evidence: string;
}

export interface LearnerSnapshot {
  concept: { id: string; label: string };
  understanding: number;          // 0–100, for the current concept
  level: Level;
  evidence: string;               // the child's words behind the latest judgement
  noticed: string;                // one line: what this exchange showed
  strengths: string[];
  misconceptions: Misconception[];
  nextStep: string;               // what the lesson should do next
  probeQuestion?: string;         // a question that would tell us more
  exchanges: number;              // child turns observed this session
  updatedAt: number;
  byConcept: Record<string, { label: string; understanding: number; level: Level }>;
}

export function emptySnapshot(topic: string): LearnerSnapshot {
  const id = slug(topic) || 'topic';
  return {
    concept: { id, label: topic },
    understanding: 0, level: 'not_yet_seen', evidence: '', noticed: '',
    strengths: [], misconceptions: [], nextStep: '', exchanges: 0, updatedAt: Date.now(),
    byConcept: {},
  };
}

function slug(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

const LEVELS: Level[] = ['not_yet_seen', 'recognises', 'explains', 'applies', 'transfers'];

function buildPrompt(topic: string, grade: string, turns: Turn[], prev: LearnerSnapshot): string {
  const convo = turns.slice(-MAX_TURNS_IN_PROMPT)
    .map(t => `${t.role === 'child' ? 'CHILD' : t.role === 'tutor' ? 'TUTOR' : 'BOARD'}: ${t.text.trim()}`)
    .join('\n');
  const prevMis = prev.misconceptions.length
    ? prev.misconceptions.map(m => `  ${m.id} [${m.status}] ${m.text}`).join('\n')
    : '  none';

  return `You observe a live voice lesson between a tutor and a child (${grade}) on "${topic}". You are NOT the tutor and you never talk to the child. After each exchange you update a short, evidence-based picture of what the child understands. Return JSON only.

CURRENT PICTURE (from earlier exchanges)
  concept: ${prev.concept.label}
  understanding: ${prev.understanding}/100 (${prev.level})
  misconceptions so far:
${prevMis}

RECENT CONVERSATION (newest last; transcripts come from speech and may be imperfect)
${convo}

RULES
- Judge ONLY from what the CHILD said. The tutor explaining something is not evidence the child understands it.
- "concept": the specific idea being worked on right now (short label, e.g. "Finding the hypotenuse", "Square roots by prime factorisation").
- "level": not_yet_seen | recognises (repeats/recalls) | explains (says why in own words) | applies (solves a new case) | transfers (uses it in an unfamiliar situation).
- "understanding": 0–100 for that concept. A correct answer with no reasoning is at most "recognises". A guess ("I guessed", "maybe…") is not understanding.
- "misconceptions": only if the child's words show a specific faulty idea. Quote their words in "evidence". Keep existing ids when it is the same idea. Status "suspected" unless it already was suspected and the child showed it again ("confirmed"), or the child now clearly reasons correctly about it ("resolved"). Do not invent one from a single unclear reply.
- "evidence": the child's own words that support your judgement (short quote). Empty string if the child has not said anything substantive yet.
- "noticed": one friendly sentence a teacher would find useful (e.g. "Added the sides instead of squaring them first").
- "nextStep": one short line — what would help next (e.g. "Try a triangle with sides 6 and 8", "Revisit what squaring means").
- "probeQuestion": optional — one question that would reveal whether the child really understands.
- If nothing new was learned about the child, keep the previous values.

JSON shape:
{"concept":"","level":"","understanding":0,"evidence":"","noticed":"","strengths":[""],"misconceptions":[{"id":"","text":"","status":"suspected","evidence":""}],"nextStep":"","probeQuestion":""}`;
}

async function callModel(apiKey: string, prompt: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
  const order = [
    ...(resolvedModel ? [resolvedModel] : []),
    ...MODEL_CANDIDATES.filter(m => m !== resolvedModel && !failedModels.has(m)),
  ];
  for (const model of order) {
    try {
      const r = await ai.models.generateContent({
        model, contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.2 },
      });
      const text = r.text || '';
      if (text) {
        if (resolvedModel !== model) console.log(`[LiveObserver] using ${model}`);
        resolvedModel = model;
        return text;
      }
    } catch (e: any) {
      failedModels.add(model);
      console.warn(`[LiveObserver] ${model} failed, skipping: ${String(e?.message || e).slice(0, 160)}`);
    }
  }
  throw new Error('no observer model available');
}

/** Pure: merge the model's JSON into the previous snapshot with guard-rails. Exported for tests. */
export function mergeObservation(prev: LearnerSnapshot, raw: any, childTurnsSoFar: number): LearnerSnapshot {
  const label = typeof raw?.concept === 'string' && raw.concept.trim() ? raw.concept.trim().slice(0, 80) : prev.concept.label;
  const id = slug(label) || prev.concept.id;
  const sameConcept = id === prev.concept.id;
  const base = sameConcept ? prev.understanding : (prev.byConcept[id]?.understanding ?? 0);

  let target = Number(raw?.understanding);
  if (!Number.isFinite(target)) target = base;
  const understanding = Math.round(Math.max(0, Math.min(100, Math.max(base - MAX_STEP, Math.min(base + MAX_STEP, target)))));

  const level: Level = LEVELS.includes(raw?.level) ? raw.level : (sameConcept ? prev.level : 'not_yet_seen');
  const evidence = typeof raw?.evidence === 'string' ? raw.evidence.slice(0, 200) : '';

  // Misconceptions: evidence required; confirmation only after a prior suspicion.
  const prevById = new Map(prev.misconceptions.map(m => [m.id, m]));
  const incoming: Misconception[] = [];
  for (const m of Array.isArray(raw?.misconceptions) ? raw.misconceptions : []) {
    const text = typeof m?.text === 'string' ? m.text.trim().slice(0, 140) : '';
    const ev = typeof m?.evidence === 'string' ? m.evidence.trim().slice(0, 160) : '';
    if (!text || !ev) continue;
    const mid = slug(m?.id || text) || slug(text);
    const before = prevById.get(mid);
    let status: Misconception['status'] = ['suspected', 'confirmed', 'resolved'].includes(m?.status) ? m.status : 'suspected';
    if (status === 'confirmed' && !before) status = 'suspected';
    if (status === 'resolved' && !before) continue; // nothing to resolve
    incoming.push({ id: mid, text, status, evidence: ev });
  }
  const merged = new Map(prevById);
  for (const m of incoming) merged.set(m.id, m);
  const misconceptions = [...merged.values()]
    .sort((a, b) => rank(a.status) - rank(b.status))
    .slice(0, MAX_MISCONCEPTIONS);

  const byConcept = { ...prev.byConcept, [id]: { label, understanding, level } };

  return {
    concept: { id, label },
    understanding, level, evidence: evidence || (sameConcept ? prev.evidence : ''),
    noticed: typeof raw?.noticed === 'string' && raw.noticed.trim() ? raw.noticed.slice(0, 200) : prev.noticed,
    strengths: Array.isArray(raw?.strengths)
      ? raw.strengths.filter((s: any) => typeof s === 'string' && s.trim()).map((s: string) => s.slice(0, 100)).slice(0, 3)
      : prev.strengths,
    misconceptions,
    nextStep: typeof raw?.nextStep === 'string' && raw.nextStep.trim() ? raw.nextStep.slice(0, 160) : prev.nextStep,
    probeQuestion: typeof raw?.probeQuestion === 'string' && raw.probeQuestion.trim() ? raw.probeQuestion.slice(0, 200) : undefined,
    exchanges: childTurnsSoFar,
    updatedAt: Date.now(),
    byConcept,
  };
}

function rank(s: Misconception['status']) { return s === 'confirmed' ? 0 : s === 'suspected' ? 1 : 2; }

/**
 * One per voice session. Feed it transcript fragments; call `exchangeDone()`
 * when the tutor finishes a turn. It observes in the background and calls
 * `onUpdate` with a fresh snapshot. At most one model call in flight; if more
 * exchanges arrive meanwhile, it runs once more with the latest conversation.
 */
export class LiveObserver {
  private turns: Turn[] = [];
  private snapshot: LearnerSnapshot;
  private inFlight = false;
  private rerun = false;
  private closed = false;
  private childTurns = 0;
  private childSinceLast = false;
  private newTurn = false;

  constructor(
    private topic: string,
    private grade: string,
    private apiKey: string,
    private onUpdate: (s: LearnerSnapshot) => void,
    private call: (apiKey: string, prompt: string) => Promise<string> = callModel,
  ) {
    this.snapshot = emptySnapshot(topic);
  }

  /** Append a transcript fragment. Consecutive fragments from the same speaker join into one turn. */
  add(role: Turn['role'], text: string) {
    if (!text) return;
    const last = this.turns[this.turns.length - 1];
    if (last && last.role === role && role !== 'board' && !this.newTurn) last.text += text;
    else {
      this.turns.push({ role, text, at: Date.now() });
      if (role === 'child') { this.childTurns++; }
    }
    this.newTurn = false;
    if (role === 'child') this.childSinceLast = true;
    if (this.turns.length > 60) this.turns.splice(0, this.turns.length - 60);
  }

  /** The tail of the turn in progress for a speaker, sized for a subtitle. */
  currentText(role: 'tutor' | 'child', max = 170): string {
    for (let i = this.turns.length - 1; i >= 0; i--) {
      const t = this.turns[i];
      if (t.role === 'board') continue;
      if (t.role !== role) return '';
      const text = t.text.replace(/\s+/g, ' ').trim();
      if (text.length <= max) return text;
      const cut = text.slice(-max);
      const m = cut.search(/[.!?]\s+\S/);
      return m >= 0 && m < max - 40 ? cut.slice(m + 1).trim() : '…' + cut.slice(cut.indexOf(' ') + 1);
    }
    return '';
  }

  /** The model finished (or was interrupted): the next fragment starts a new turn. */
  boundary() { this.newTurn = true; }

  exchangeDone() {
    this.boundary();
    if (this.closed || !this.childSinceLast) return;
    if (!this.childHasSaidSomething()) return;
    this.childSinceLast = false;
    if (this.inFlight) { this.rerun = true; return; }
    void this.run();
  }

  close() { this.closed = true; }
  get current() { return this.snapshot; }

  private childHasSaidSomething() {
    return this.turns.some(t => t.role === 'child' && t.text.trim().length > 1);
  }

  private async run() {
    this.inFlight = true;
    try {
      do {
        this.rerun = false;
        const t0 = Date.now();
        const prompt = buildPrompt(this.topic, this.grade, this.turns, this.snapshot);
        const text = await this.call(this.apiKey, prompt);
        if (this.closed) return;
        const raw = JSON.parse(text.replace(/```json\s*|\s*```/g, '').trim());
        this.snapshot = mergeObservation(this.snapshot, raw, this.childTurns);
        console.log(`[LiveObserver] ${this.snapshot.concept.label}: ${this.snapshot.understanding}% (${this.snapshot.level}) in ${Date.now() - t0}ms`);
        this.onUpdate(this.snapshot);
      } while (this.rerun && !this.closed);
    } catch (e: any) {
      console.warn('[LiveObserver] observation skipped:', String(e?.message || e).slice(0, 200));
    } finally {
      this.inFlight = false;
    }
  }
}
