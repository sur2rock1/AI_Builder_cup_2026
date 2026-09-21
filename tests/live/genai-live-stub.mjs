// Fake @google/genai with a scriptable Live API. Scenario from env LIVE_SCENARIO.
import fs from 'fs';
export const Type = { OBJECT:'OBJECT', STRING:'STRING', ARRAY:'ARRAY', NUMBER:'NUMBER', BOOLEAN:'BOOLEAN' };
export const Modality = { AUDIO:'AUDIO', TEXT:'TEXT', IMAGE:'IMAGE' };
export const EndSensitivity = { END_SENSITIVITY_HIGH: 'END_SENSITIVITY_HIGH', END_SENSITIVITY_LOW: 'END_SENSITIVITY_LOW' };
export const StartSensitivity = { START_SENSITIVITY_HIGH: 'START_SENSITIVITY_HIGH', START_SENSITIVITY_LOW: 'START_SENSITIVITY_LOW' };
export const FileState = { PROCESSING:'PROCESSING', ACTIVE:'ACTIVE', FAILED:'FAILED' };
export const createPartFromUri = (uri, mimeType) => ({ fileData: { fileUri: uri, mimeType } });
const G = globalThis.__LIVE__ = globalThis.__LIVE__ || { connects: [], toolResponses: [], closed: 0 };
const wait = ms => new Promise(r => setTimeout(r, ms));
const REC = process.env.LIVE_RECORD;
const record = (o) => { if (REC) fs.appendFileSync(REC, JSON.stringify(o) + '\n'); };
export class GoogleGenAI {
  constructor() {
    // slow diagnosis model so assess_child_reasoning is still running when cancelled
    this.models = { generateContent: async (req) => {
      const prompt = String(req?.contents || '');
      if (prompt.startsWith('You observe a live voice lesson')) {
        // The learner observer. Deliberately slow and over-confident, to prove
        // (a) the voice never waits for it and (b) the guard-rails hold.
        record({ kind: 'observer_prompt', t: Date.now(), prompt });
        await wait(Number(process.env.OBSERVER_DELAY || 2500));
        record({ kind: 'observer_done', t: Date.now() });
        return { text: JSON.stringify({ concept: 'Finding the hypotenuse', level: 'recognises', understanding: 90,
          evidence: "I added them, it's 7", noticed: 'Added the two sides instead of squaring them first.',
          strengths: ['Knows which side is the hypotenuse'],
          misconceptions: [{ id: 'adds-sides', text: 'Adds the legs instead of squaring and adding', status: 'confirmed', evidence: "I added them, it's 7" }],
          nextStep: 'Try squaring 3 and 4 first', probeQuestion: 'What is 3 squared?' }) };
      }
      await wait(1500); return { text: JSON.stringify({ classification:'clear_reasoning', understandingDepth:'understood', candidateMisconceptionIds:[], confidence:'high', reasoningSummary:'ok', shouldProbe:false, nextStrategy:'worked_example', tutorGuidance:'Praise.' }) }; } };
    this.files = {};
    this.live = { connect: async ({ config, callbacks }) => {
      const n = G.connects.length + 1;
      G.connects.push({ n, handle: config.sessionResumption?.handle || null, compression: !!config.contextWindowCompression });
      record({ kind: 'connect', n, configKeys: Object.keys(config).sort(), tools: (config.tools?.[0]?.functionDeclarations || []).map(t => t.name),
               promptStart: String(config.systemInstruction || '').slice(0, 80), vad: config.realtimeInputConfig?.automaticActivityDetection || null });
      let open = true;
      const emit = m => { if (open) callbacks.onmessage(m); };
      const close = (code, reason) => { if (!open) return; open = false; G.closed++; callbacks.onclose({ code, reason }); };
      const session = {
        sendClientContent: (c) => record({ kind: 'client_content', text: c?.turns?.[0]?.parts?.[0]?.text || '' }),
        sendRealtimeInput: (x) => { if (x?.audio?.data) record({ kind: 'mic', t: Date.now(), bytes: x.audio.data.length }); },
        sendToolResponse: (r) => { if (!open) throw new Error('socket closed'); G.toolResponses.push({ conn: n, ...r.functionResponses[0] }); record({ kind: 'tool_response', t: Date.now(), ...r.functionResponses[0] }); },
        close: () => close(1000, 'client close'),
      };
      setTimeout(async () => {
        callbacks.onopen?.();
        const sc = process.env.LIVE_SCENARIO;
        if (sc === 'observe') {
          // Tutor asks → child answers (fragmented transcript) → tutor replies at once.
          emit({ setupComplete: {} });
          emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] } } });
          emit({ serverContent: { outputTranscription: { text: "Let's find the hypotenuse. " } } });
          emit({ serverContent: { outputTranscription: { text: 'What is it for sides 3 and 4?' } } });
          emit({ serverContent: { turnComplete: true } });
          await wait(300);
          emit({ serverContent: { inputTranscription: { text: 'I added' } } });
          emit({ serverContent: { inputTranscription: { text: " them, it's 7" } } });
          await wait(200);
          record({ kind: 'tutor_reply', t: Date.now() });
          emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'BBBB' } }] } } });
          emit({ serverContent: { outputTranscription: { text: 'Interesting! Tell me how you got 7.' } } });
          record({ kind: 'toolcall_sent', t: Date.now() });
          emit({ toolCall: { functionCalls: [{ id: 'o1', name: 'update_chalkboard_notes', args: { title: 'Your working', bulletPoints: ['3 + 4 = 7'] } }] } });
          emit({ serverContent: { turnComplete: true } });
          return;
        }
        if (sc === 'longboard') {
          // A long explanation: notes, then many live notes, then a question to solve.
          emit({ setupComplete: {} });
          emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] } } });
          emit({ toolCall: { functionCalls: [{ id: 'l0', name: 'update_chalkboard_notes', args: { title: 'Pythagoras Theorem',
            bulletPoints: ['a² + b² = c²', 'c is the hypotenuse', 'It is opposite the right angle', 'Example: 3, 4, 5'] } }] } });
          const n = Number(process.env.LIVE_NOTES || 9);
          for (let i = 1; i <= n; i++) {
            await wait(900);
            record({ kind: 'note_sent', i, t: Date.now() });
            emit({ toolCall: { functionCalls: [{ id: 'w' + i, name: 'write_live_note', args: { note: `Note ${i}: 3² + 4² = 9 + 16 = 25` } }] } });
          }
          await wait(900);
          record({ kind: 'quiz_sent', t: Date.now() });
          emit({ toolCall: { functionCalls: [{ id: 'q1', name: 'pose_quiz', args: { question: 'A ladder leans on a wall. Its foot is 6 m away and it reaches 8 m up. How long is the ladder?',
            options: ['10 m', '14 m', '12 m', '48 m'], correctIndex: 0, explanation: '6² + 8² = 100, √100 = 10' } }] } });
          return;
        }
        if (sc === 'chalk') {
          // Replays the real conversation: a spoken lead-in, then the notes, then a view switch.
          emit({ setupComplete: {} });
          emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: Buffer.alloc(4800).toString('base64') } }] } } });
          await wait(1500);
          emit({ toolCall: { functionCalls: [{ id: 'n1', name: 'update_chalkboard_notes', args: {
            title: 'Finding Square Roots by Prime Factorization',
            bulletPoints: ['Example: √144', 'Step 1: Prime factorization of 144 -> 2 x 2 x 2 x 2 x 3 x 3',
              'Step 2: Group into pairs -> (2 x 2) x (2 x 2) x (3 x 3)', 'Step 3: Take one from each pair -> 2 x 2 x 3 = 12'] } }] } });
          if (process.env.CHALK_THEN) { await wait(Number(process.env.CHALK_THEN)); emit({ toolCall: { functionCalls: [{ id: 'v1', name: 'switch_board_view', args: { tab: 'photo' } }] } }); }
          return;
        }
        if (sc === 'stream') {
          // A tutor who keeps talking: 250 ms of audio + a transcript fragment, 4x a second.
          emit({ setupComplete: {} });
          const pcm = Buffer.alloc(24000 * 2 / 4).toString('base64');   // 250 ms of 24 kHz 16-bit silence-ish
          const words = 'so the longest side opposite the right angle is called the hypotenuse and'.split(' ');
          let i = 0;
          const iv = setInterval(() => {
            if (!open) return clearInterval(iv);
            emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: pcm } }] } } });
            emit({ serverContent: { outputTranscription: { text: ' ' + words[i++ % words.length] } } });
          }, 250);
          return;
        }
        if (sc === 'silent-if-compression') {
          emit({ setupComplete: {} });
          if (!config.contextWindowCompression) {
            emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] } } });
            emit({ serverContent: { outputTranscription: { text: 'Hello there.' } } });
            emit({ serverContent: { turnComplete: true } });
          }
          return;
        }
        if (sc === 'classic') {
          emit({ setupComplete: {} });
          emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] } } });
          emit({ serverContent: { outputTranscription: { text: 'Welcome! ' } } });
          record({ kind: 'toolcall_sent', t: Date.now() });
          emit({ toolCall: { functionCalls: [{ id: 'c-diag', name: 'update_diagram', args: { focus: 'the hypotenuse' } }] } });
          emit({ serverContent: { turnComplete: true } });
          return;
        }
        if (n === 1) {
          emit({ setupComplete: {} });
          if (sc !== 'drop-no-handle') emit({ sessionResumptionUpdate: { resumable: true, newHandle: 'H-1' } });
          // fragmented transcripts, SDK field names
          emit({ serverContent: { outputTranscription: { text: 'Here is a ' } } });
          emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] } } });
          emit({ serverContent: { outputTranscription: { text: 'ladder.' } } });
          emit({ serverContent: { turnComplete: true } });
          emit({ serverContent: { inputTranscription: { text: 'I added them' } } });
          await wait(80);
          // a board call, then an assessment the child barges in on
          emit({ toolCall: { functionCalls: [{ id: 'c-board', name: 'reveal_part', args: { parts: ['triangle', 'hypotenuse'] } }] } });
          emit({ toolCall: { functionCalls: [{ id: 'c-assess', name: 'assess_child_reasoning', args: { questionAsked: 'q', childAnswer: '7', childReasoning: 'I added 3 and 4', promptType: 'check' } }] } });
          await wait(300);
          emit({ serverContent: { interrupted: true } });
          emit({ toolCallCancellation: { ids: ['c-assess'] } });
          await wait(2200);   // past the assess deadline: its response must be skipped
          if (sc === 'goaway') { emit({ goAway: { timeLeft: '5s' } }); await wait(400); close(1000, 'server shutdown'); }
          if (sc === 'drop-with-handle') close(1011, 'internal error');
          if (sc === 'drop-no-handle') close(1011, 'internal error');
        } else {
          emit({ setupComplete: {} });
          emit({ serverContent: { outputTranscription: { text: 'As I was saying…' } } });
        }
      }, 30);
      return session;
    } };
  }
}
