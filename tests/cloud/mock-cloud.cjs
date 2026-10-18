// Test-only: replaces '@google/genai' and 'firebase-admin' for the BUILT server (dist/server.cjs) so a whole live
// lesson can run offline. Firestore writes are checked with Google's real client validator (the same check the real
// database applies), honouring settings({ ignoreUndefinedProperties }) unless MOCK_IGNORE_SETTINGS=1.
const Module = require('module');
const fs = require('fs');
const path = require('path');
const { Firestore: RealFirestore } = require('@google-cloud/firestore');

const strictValidator = new RealFirestore({ projectId: 'validate-only' });
const lenientValidator = new RealFirestore({ projectId: 'validate-only', ignoreUndefinedProperties: true });
let ignoreUndefined = false;
const store = new Map();
const state = { store, writesOk: 0, invalid: [], lastLive: null, liveConnects: 0, connects: [], toolResponses: [], profilerCalls: 0, observerCalls: 0, assessorCalls: 0, assessorVerdicts: [] };
global.__mockCloud = state;

// ── Firestore (in memory) ──
const plain = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function deepMerge(a, b) { const out = { ...(a || {}) }; for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v; return out; }
function validate(p, data) {
  const v = ignoreUndefined && process.env.MOCK_IGNORE_SETTINGS !== '1' ? lenientValidator : strictValidator;
  try { v.batch().set(v.doc('v/v'), data); state.writesOk++; }
  catch (e) { const msg = `${p}: ${String(e.message).split('\n')[0].slice(0, 200)}`; state.invalid.push(msg); throw e; }
  if (Buffer.byteLength(JSON.stringify(data)) > 1048487) { state.invalid.push(`${p}: over 1 MiB`); throw new Error('Document exceeds 1 MiB'); }
}
const parentOf = (p) => p.split('/').slice(0, -1).join('/');
class DocSnap { constructor(ref, d) { this.ref = ref; this.id = ref.id; this._d = d; this.exists = d !== undefined; } data() { return this._d === undefined ? undefined : plain(this._d); } }
class Query {
  constructor(col, f = [], o = null, lim = null, last = null) { this._col = col; this._f = f; this._o = o; this._lim = lim; this._last = last; }
  where(field, op, val) { return new Query(this._col, [...this._f, [field, op, val]], this._o, this._lim, this._last); }
  orderBy(field, dir = 'asc') { return new Query(this._col, this._f, [field, dir], this._lim, this._last); }
  limit(n) { return new Query(this._col, this._f, this._o, n, null); }
  limitToLast(n) { return new Query(this._col, this._f, this._o, null, n); }
  async get() {
    let docs = [...store.entries()].filter(([p]) => parentOf(p) === this._col).map(([p, d]) => new DocSnap(new DocRef(p), d));
    for (const [f, op, v] of this._f) { if (op !== '==') throw new Error('mock: only == supported'); docs = docs.filter((d) => d._d?.[f] === v); }
    if (this._o) { const [f, dir] = this._o; docs.sort((a, b) => ((a._d?.[f] ?? 0) - (b._d?.[f] ?? 0)) * (dir === 'desc' ? -1 : 1)); }
    if (this._lim != null) docs = docs.slice(0, this._lim);
    if (this._last != null) docs = docs.slice(-this._last);
    return { docs, empty: !docs.length, size: docs.length, forEach: (fn) => docs.forEach(fn) };
  }
}
class CollectionRef extends Query { constructor(p) { super(p); this.path = p; this.id = p.split('/').pop(); } doc(id) { return new DocRef(`${this.path}/${id || Math.random().toString(36).slice(2)}`); } }
class DocRef {
  constructor(p) { this.path = p; this.id = p.split('/').pop(); }
  collection(n) { return new CollectionRef(`${this.path}/${n}`); }
  async get() { return new DocSnap(this, store.get(this.path)); }
  async set(data, opts) { validate(this.path, data); const d = plain(data); store.set(this.path, opts?.merge ? deepMerge(store.get(this.path), d) : d); }
  async update(data) { validate(this.path, data); store.set(this.path, deepMerge(store.get(this.path), plain(data))); }
  async delete() { store.delete(this.path); }
}
const db = {
  collection: (p) => new CollectionRef(p), doc: (p) => new DocRef(p),
  settings: (s) => { if (s && s.ignoreUndefinedProperties) ignoreUndefined = true; },
  batch: () => { const ops = []; return { set: (r, d, o) => { ops.push(() => r.set(d, o)); }, update: (r, d) => { ops.push(() => r.update(d)); }, delete: (r) => { ops.push(() => r.delete()); }, commit: async () => { for (const op of ops) await op(); } }; },
};
// Seed the course library like the migrated cloud project.
try {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/curricula.json'), 'utf8'));
  for (const c of Array.isArray(raw) ? raw : Object.values(raw)) store.set(`curricula/${c.id}`, plain(c));
} catch { /* no local courses */ }

const apps = [];
const adminMock = {
  apps,
  initializeApp: (opts) => { const app = { name: '[DEFAULT]', options: opts || {} }; apps.push(app); return app; },
  app: () => apps[0],
  credential: { cert: (x) => x, applicationDefault: () => ({}) },
  firestore: () => db,
  storage: () => ({ bucket: () => ({ name: 'mock-bucket', file: () => ({ exists: async () => [false], save: async () => { throw new Error('mock storage'); }, download: async () => { throw new Error('mock storage'); }, publicUrl: () => '' }) }) }),
  auth: () => ({ verifyIdToken: async () => { throw new Error('mock auth'); } }),
};

// ── Gemini (scripted) ──
function promptOf(req) {
  const c = req?.contents;
  if (typeof c === 'string') return c;
  return (Array.isArray(c) ? c : [c]).flatMap((m) => (m?.parts || [])).map((p) => p?.text || '').join('\n');
}
function observerReply(prompt) {
  state.observerCalls++;
  const childLines = [...prompt.matchAll(/^CHILD: (.*)$/gm)].map((m) => m[1]);
  const last = (childLines[childLines.length - 1] || '').toLowerCase();
  const seenBefore = /bigger-digit/.test(prompt.split('RECENT CONVERSATION')[0]);
  const mis = { id: 'bigger-digit', text: 'Thinks a negative number with a bigger digit is bigger', status: seenBefore ? 'confirmed' : 'suspected' };
  if (/is more/.test(last)) return { concept: 'Comparing negative numbers', level: 'recognises', understanding: 10, evidence: last.slice(0, 80), noticed: 'Compared the digits, not the positions', strengths: [], misconceptions: [{ ...mis, evidence: last.slice(0, 80) }], nextStep: 'Use the number line' };
  if (/closer to zero/.test(last)) return { concept: 'Comparing negative numbers', level: 'explains', understanding: 30, evidence: last.slice(0, 80), noticed: 'Used distance from zero', strengths: ['Uses the number line'], misconceptions: [], nextStep: 'Try a new situation' };
  if (/warmer/.test(last)) return { concept: 'Comparing negative numbers', level: 'transfers', understanding: 50, evidence: last.slice(0, 80), noticed: 'Used it with temperatures', strengths: ['Transfers to temperature'], misconceptions: [{ ...mis, status: 'resolved', evidence: last.slice(0, 60) }], nextStep: 'Move on' };
  return { concept: 'Comparing negative numbers', level: 'not_yet_seen', understanding: 0, evidence: '', noticed: '', strengths: [], misconceptions: [], nextStep: '' };
}
async function mockGenerate(req) {
  const p = promptOf(req);
  if (/You observe a live voice lesson/.test(p) && /don.t know, (maybe|is it)/i.test((p.match(/^CHILD: (.*)$/gm) || []).slice(-1)[0] || '')) {
    state.observerCalls++;
    const last = ((p.match(/^CHILD: (.*)$/gm) || []).slice(-1)[0] || '').replace(/^CHILD: /, '').toLowerCase();
    return { text: JSON.stringify({ concept: 'Comparing negative numbers', level: 'recognises', understanding: 5, evidence: last.slice(0, 80), noticed: 'Not sure yet', strengths: [], misconceptions: [], nextStep: 'Teach it another way' }) };
  }
  if (/You observe a live voice lesson/.test(p)) {
    const reply = observerReply(p);
    if (/slowly/.test(reply.evidence)) await new Promise((r) => setTimeout(r, 1500)); // still judging when the lesson ends
    return { text: JSON.stringify(reply) };
  }
  if (/diagnostic assessor/.test(p)) {
    state.assessorCalls++;
    if (/closer to zero|further right|warmer/i.test(p)) {
      state.assessorVerdicts.push('clear_reasoning');
      return { text: JSON.stringify({ classification: 'clear_reasoning', understandingDepth: 'understood', candidateMisconceptionIds: [], confidence: 'high', shouldProbe: false, tutorGuidance: 'Confirm and move to a transfer question.' }) };
    }
    state.assessorVerdicts.push('wrong_answer');
    return { text: JSON.stringify({ classification: 'wrong_answer', understandingDepth: 'incorrect', candidateMisconceptionIds: [], confidence: 'high', shouldProbe: true, probeQuestion: 'Which is colder, -5 or -2 degrees?', tutorGuidance: 'Ask which temperature is colder without giving the answer.' }) };
  }
  if (/session-end Profiler/.test(p)) { state.profilerCalls++; return { text: JSON.stringify({ narrative: 'Compared negatives by their digits at first, then used the number line and temperatures.', claims: [] }) }; }
  return { text: 'ok' };
}
function mockLive({ config, callbacks }) {
  state.liveConnects++;
  state.connects.push({ systemInstruction: String(config?.systemInstruction || ''), tools: ((config?.tools || [])[0]?.functionDeclarations || []).map((t) => t.name) });
  const waiting = new Map();
  const send = (m) => { try { callbacks.onmessage?.(m); } catch (e) { console.error('[mock] onmessage threw', e); } };
  const tutorSay = (text) => {
    send({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/pcm;rate=24000' } }] }, outputTranscription: { text } } });
    send({ serverContent: { turnComplete: true } });
  };
  let kicked = false, pendingAssess = null;
  const credits = process.env.MOCK_LIVE_CREDITS === '1';
  if (credits) {
    setTimeout(() => callbacks.onclose?.({ code: 1011, reason: 'Your prepayment credits are depleted.' }), 10);
  } else setTimeout(() => callbacks.onopen?.(), 5);
  const session = {
    sendClientContent: ({ turns }) => {
      const text = turns?.[0]?.parts?.[0]?.text || '';
      if (credits) return; // closed before speaking, like the real API
      if (!kicked) { kicked = true; setTimeout(() => tutorSay('Hi! Which is bigger, minus two or minus five?'), 5); return; }
      setTimeout(() => tutorSay(`You said: ${text}. Let us check on the number line.`), 5);
    },
    sendRealtimeInput: () => {},
    sendToolResponse: (r) => {
      state.toolResponses.push(r);
      for (const fr of r?.functionResponses || []) { const w = waiting.get(fr.id); if (w) { waiting.delete(fr.id); w(fr); } }
      if (pendingAssess) { const t = pendingAssess; pendingAssess = null; setTimeout(() => tutorSay(t), 5); }
    },
    // test control: the voice model calls tools (e.g. advance_beat, show_picture) and then speaks
    modelCalls: async (calls, thenSay) => {
      const replies = await Promise.all(calls.map((c, k) => new Promise((resolve) => {
        const id = `mc_${Date.now()}_${k}_${Math.random().toString(36).slice(2, 6)}`;
        waiting.set(id, resolve);
        send({ toolCall: { functionCalls: [{ id, name: c.name, args: c.args || {} }] } });
      })));
      if (thenSay) tutorSay(thenSay);
      return replies;
    },
    close: () => { setTimeout(() => callbacks.onclose?.({ code: 1000, reason: '' }), 1); },
    // test control: the child speaks (voice path: arrives as an input transcription)
    childSays: (text, { assess = false, representationUsed = 'direct_explanation' } = {}) => {
      send({ serverContent: { inputTranscription: { text } } });
      if (assess) {
        pendingAssess = 'Interesting. Which is colder, minus five or minus two degrees?';
        send({ toolCall: { functionCalls: [{ id: `call_${Date.now()}`, name: 'assess_child_reasoning', args: { questionAsked: 'Which is bigger, -2 or -5?', childAnswer: text, childReasoning: text, promptType: 'check', representationUsed } }] } });
      } else setTimeout(() => tutorSay('Good thinking. What about another pair?'), 5);
    },
  };
  state.lastLive = session;
  return Promise.resolve(session);
}
class MockGenAI {
  constructor() {
    this.models = { generateContent: mockGenerate, get: async ({ model }) => ({ name: model }), list: async () => ({ page: [] }) };
    this.live = { connect: mockLive };
    this.files = { upload: async () => { throw new Error('mock'); } };
  }
}

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'firebase-admin') return adminMock;
  if (request === '@google/genai') { const real = origLoad.apply(this, arguments); return { ...real, GoogleGenAI: MockGenAI }; }
  return origLoad.apply(this, arguments);
};
