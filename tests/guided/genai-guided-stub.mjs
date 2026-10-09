// Fake @google/genai for the guided-mode server test. Records what the server
// gives Gemini (full prompt, tool names, opening turn, tool responses) and,
// once connected, plays a tutor that starts beats and fills a blank.
import fs from 'fs';
export * from '../live/genai-live-stub.mjs';

const REC = process.env.GUIDED_RECORD;
const record = (o) => { if (REC) fs.appendFileSync(REC, JSON.stringify(o) + '\n'); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class GoogleGenAI {
  constructor() {
    this.models = { generateContent: async () => ({ text: '{}' }) };
    this.files = {};
    this.live = {
      connect: async ({ config, callbacks }) => {
        record({ kind: 'connect', tools: (config.tools?.[0]?.functionDeclarations || []).map((t) => t.name), prompt: String(config.systemInstruction || '') });
        const session = {
          sendClientContent: (c) => record({ kind: 'client_content', text: c?.turns?.[0]?.parts?.[0]?.text || '' }),
          sendRealtimeInput: () => {},
          sendToolResponse: (r) => record({ kind: 'tool_response', ...r.functionResponses[0] }),
          close: () => {},
        };
        setTimeout(async () => {
          callbacks.onopen?.();
          if (process.env.GUIDED_PLAY === '1') {
            await wait(700);
            callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'a1', name: 'advance_beat', args: {} }] } });
            await wait(200);
            callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'a2', name: 'advance_beat', args: {} }] } });
            await wait(200);
            callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'f1', name: 'fill_slot', args: { slot_id: 'in_common', text: 'the same x' } }] } });
            await wait(200);
            callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'f2', name: 'fill_slot', args: { slot_id: 'not_on_board', text: 'x' } }] } });
            await wait(200);
            callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'n1', name: 'update_chalkboard_notes', args: { title: 't', bulletPoints: ['a'] } }] } });
            await wait(200);
            callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'a3', name: 'advance_beat', args: { beat_id: 'b7' } }] } });
            await wait(100);
            callbacks.onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] }, outputTranscription: { text: 'Let us work it out.' } } });
            await wait(100);
            callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'l1', name: 'next_line', args: {} }, { id: 'l2', name: 'next_line', args: {} }] } });
            await wait(200);
            callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'w1', name: 'write_aside', args: { text: 'rise = change in y', question: 'what is rise?' } }] } });
            await wait(200);
            callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'r1', name: 'resume_lesson', args: {} }] } });
          }
        }, 20);
        return session;
      },
    };
  }
}
