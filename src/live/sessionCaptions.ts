// Persist joined Live captions on turnComplete.
// Admin write only. Never send caption text to GA4 / analytics.
import { admin, initFirebaseAdmin } from '../firebase/admin';

export type SessionIntent = 'learn' | 'homework' | 'exam' | 'writing';
export type SessionStatus = 'live' | 'wrapped' | 'abandoned';
export type CaptionRole = 'child' | 'tutor' | 'board';

export interface LiveSessionDoc {
  sessionId: string;
  learnerId: string;
  subjectId?: string;
  conceptId?: string;
  intent: SessionIntent;
  topic: string;
  grade: string;
  startedAt: number;
  endedAt?: number;
  status: SessionStatus;
  voiceName: string;
  shownMedia?: Array<{ kind: string; title?: string; prompt?: string; url?: string; at: number }>;
}

export interface CaptionTurn {
  turnId: string;
  role: CaptionRole;
  text: string;
  at: number;
  seq: number;
}

const memorySessions = new Map<string, LiveSessionDoc>();
const memoryTurns = new Map<string, CaptionTurn[]>();
const nextSeq = new Map<string, number>();

function db() {
  initFirebaseAdmin();
  return admin.firestore();
}

function intents(v: string): SessionIntent {
  return (['learn', 'homework', 'exam', 'writing'] as const).includes(v as SessionIntent)
    ? v as SessionIntent : 'learn';
}

export async function ensureLiveSession(opts: {
  sessionId: string;
  learnerId: string;
  topic: string;
  grade: string;
  intent?: string;
  subjectId?: string;
  conceptId?: string;
}): Promise<LiveSessionDoc> {
  const existing = memorySessions.get(opts.sessionId);
  if (existing) return existing;
  const doc: LiveSessionDoc = {
    sessionId: opts.sessionId,
    learnerId: opts.learnerId,
    subjectId: opts.subjectId || undefined,
    conceptId: opts.conceptId || undefined,
    intent: intents(opts.intent || 'learn'),
    topic: opts.topic,
    grade: opts.grade,
    startedAt: Date.now(),
    status: 'live',
    voiceName: 'Puck',
  };
  memorySessions.set(opts.sessionId, doc);
  try {
    const { subjectId, conceptId, ...rest } = doc;
    await db().collection('sessions').doc(opts.sessionId).set({
      ...rest,
      ...(subjectId ? { subjectId } : {}),
      ...(conceptId ? { conceptId } : {}),
    }, { merge: true });
  } catch (e) {
    console.warn('[Captions] session write skipped:', String((e as Error).message || e).slice(0, 160));
  }
  return doc;
}

export async function recordShownMedia(
  sessionId: string,
  item: { kind: string; title?: string; prompt?: string; url?: string },
): Promise<void> {
  const row: { kind: string; at: number; title?: string; prompt?: string; url?: string } = {
    kind: item.kind,
    at: Date.now(),
  };
  if (item.title) row.title = item.title;
  if (item.prompt) row.prompt = item.prompt;
  if (item.url) row.url = item.url;
  const prev = memorySessions.get(sessionId);
  if (prev) prev.shownMedia = [...(prev.shownMedia || []), row];
  try {
    const { FieldValue } = admin.firestore;
    await db().collection('sessions').doc(sessionId).set({
      shownMedia: FieldValue.arrayUnion(row),
    }, { merge: true });
  } catch (e) {
    console.warn('[Captions] shownMedia skipped:', String((e as Error).message || e).slice(0, 160));
  }
}

export async function persistCaptionTurns(
  sessionId: string,
  parts: Array<{ role: CaptionRole; text: string }>,
): Promise<CaptionTurn[]> {
  const written: CaptionTurn[] = [];
  let seq = nextSeq.get(sessionId) || 0;
  for (const part of parts) {
    const text = String(part.text || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
    if (!text) continue;
    seq += 1;
    const turn: CaptionTurn = {
      turnId: `t${seq}`,
      role: part.role,
      text,
      at: Date.now(),
      seq,
    };
    const list = memoryTurns.get(sessionId) || [];
    list.push(turn);
    memoryTurns.set(sessionId, list);
    written.push(turn);
    try {
      await db().collection('sessions').doc(sessionId).collection('turns').doc(turn.turnId).set(turn);
    } catch (e) {
      console.warn('[Captions] turn write skipped:', String((e as Error).message || e).slice(0, 160));
    }
  }
  nextSeq.set(sessionId, seq);
  return written;
}

export async function endLiveSession(sessionId: string, status: SessionStatus): Promise<void> {
  const prev = memorySessions.get(sessionId);
  if (prev) {
    if (prev.status === 'wrapped') return;
    prev.status = status;
    prev.endedAt = Date.now();
  }
  try {
    await db().collection('sessions').doc(sessionId).set({
      status,
      endedAt: Date.now(),
    }, { merge: true });
  } catch (e) {
    console.warn('[Captions] session end skipped:', String((e as Error).message || e).slice(0, 160));
  }
}

export async function listSessionsForLearner(learnerId: string): Promise<LiveSessionDoc[]> {
  const fromMem = [...memorySessions.values()].filter(s => s.learnerId === learnerId);
  try {
    const snap = await db().collection('sessions').where('learnerId', '==', learnerId).get();
    const fromFs = snap.docs.map(d => d.data() as LiveSessionDoc);
    const seen = new Set<string>();
    const out: LiveSessionDoc[] = [];
    for (const s of [...fromMem, ...fromFs]) {
      if (!s?.sessionId || seen.has(s.sessionId)) continue;
      seen.add(s.sessionId);
      out.push(s);
    }
    return out.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  } catch {
    return fromMem.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  }
}

export async function listTurns(sessionId: string): Promise<CaptionTurn[]> {
  const fromMem = memoryTurns.get(sessionId) || [];
  try {
    const snap = await db().collection('sessions').doc(sessionId).collection('turns').get();
    const fromFs = snap.docs.map(d => d.data() as CaptionTurn);
    const seen = new Set<number>();
    const out: CaptionTurn[] = [];
    for (const t of [...fromMem, ...fromFs]) {
      if (!t || seen.has(t.seq)) continue;
      seen.add(t.seq);
      out.push(t);
    }
    return out.sort((a, b) => a.seq - b.seq);
  } catch {
    return [...fromMem].sort((a, b) => a.seq - b.seq);
  }
}

export function getSession(sessionId: string): LiveSessionDoc | undefined {
  return memorySessions.get(sessionId);
}

/** Short recap of the last lesson on this topic — used so Lumen does not restart from zero. */
export async function lastLessonRecap(learnerId: string, topic: string, skipSessionId?: string): Promise<string> {
  if (!learnerId) return '';
  const sessions = await listSessionsForLearner(learnerId);
  const needle = (topic || '').toLowerCase().slice(0, 18);
  const picked = sessions.find(s => {
    if (s.sessionId === skipSessionId) return false;
    const t = (s.topic || '').toLowerCase();
    return !needle || t.includes(needle) || t.split(' ')[0] === (topic || '').toLowerCase().split(' ')[0];
  }) || sessions.find(s => s.sessionId !== skipSessionId);
  if (!picked) return '';
  const turns = await listTurns(picked.sessionId);
  if (!turns.length) return '';
  const english = (s: string) => !/[¿¡ñáéíóúü]/i.test(s);
  const child = turns.filter(t => t.role === 'child').map(t => t.text).filter(t => t && english(t)).slice(-5);
  const tutor = turns.filter(t => t.role === 'tutor').map(t => t.text).filter(t => t && english(t)).slice(-3);
  const media = (picked.shownMedia || []).map(m => m.title || m.prompt).filter(t => t && english(t)).slice(-4);
  return [
    `Last session on "${picked.topic}" (${picked.status}).`,
    child.length ? `They said: ${child.join(' / ').slice(0, 360)}` : '',
    tutor.length ? `You left off around: ${tutor[tutor.length - 1].slice(0, 220)}` : '',
    media.length ? `Board already showed: ${media.join(' · ').slice(0, 220)}` : '',
  ].filter(Boolean).join(' ');
}

/** Collect fragments for one Live turn; flush on turnComplete. */
export class CaptionBuffer {
  child = '';
  tutor = '';

  add(role: 'child' | 'tutor', text: string) {
    if (!text) return;
    if (role === 'child') this.child += text;
    else this.tutor += text;
  }

  flush(): Array<{ role: CaptionRole; text: string }> {
    const out: Array<{ role: CaptionRole; text: string }> = [];
    const child = this.child.replace(/\s+/g, ' ').trim();
    const tutor = this.tutor.replace(/\s+/g, ' ').trim();
    if (child) out.push({ role: 'child', text: child });
    if (tutor) out.push({ role: 'tutor', text: tutor });
    this.child = '';
    this.tutor = '';
    return out;
  }
}
