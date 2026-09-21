// ─────────────────────────────────────────────────────────────────
// Voice diagnosis — which change stops the tutor from speaking?
//
//     npm run diagnose:voice
//
// Opens a real Gemini Live session for each variant below, sends the opening
// turn, answers any tool calls with "ok", and records whether the model
// produced speech. Uses exactly the prompts, tools and settings the server
// uses (src/live/liveConfig.ts). About 1–2 minutes; uses your .env key.
// Results → console and logs/voice-diagnosis.txt
// ─────────────────────────────────────────────────────────────────
import 'dotenv/config';
import fs from 'fs';
import { GoogleGenAI, Modality } from '@google/genai';
import {
  ALL_TOOLS, CLASSIC_TOOLS, classicSystemInstruction, adaptiveSystemInstruction,
  classicKickoff, adaptiveKickoff, vadConfig,
} from '../src/live/liveConfig';

const MODEL = process.env.LIVE_MODEL || 'gemini-3.8-live';
const TOPIC = "Pythagoras' Theorem", GRADE = 'Secondary 2 (Grade 8)';
const WAIT_MS = Number(process.env.DIAG_WAIT_MS) || 15000;
const EXTRA = { contextWindowCompression: { slidingWindow: {} }, sessionResumption: {} };

const variants: Array<{ id: string; what: string; prompt: 'classic' | 'adaptive'; tools: any[]; extra: Record<string, any> }> = [
  { id: 'A', what: 'ORIGINAL (worked before): classic prompt + 8 tools',            prompt: 'classic',  tools: CLASSIC_TOOLS, extra: {} },
  { id: 'B', what: 'new prompt + all tools, original connection settings',          prompt: 'adaptive', tools: ALL_TOOLS,     extra: {} },
  { id: 'C', what: 'LAST BUILD: new prompt + all tools + compression/resumption',   prompt: 'adaptive', tools: ALL_TOOLS,     extra: EXTRA },
  { id: 'D', what: 'new prompt, NO tools',                                          prompt: 'adaptive', tools: [],            extra: {} },
  { id: 'E', what: 'original prompt + ALL new tools',                               prompt: 'classic',  tools: ALL_TOOLS,     extra: {} },
  { id: 'F', what: 'original prompt + 8 tools + compression/resumption',            prompt: 'classic',  tools: CLASSIC_TOOLS, extra: EXTRA },
  { id: 'G', what: 'CURRENT DEFAULT: original + turn-taking (VAD) settings',        prompt: 'classic',  tools: CLASSIC_TOOLS, extra: { realtimeInputConfig: vadConfig() } },
];

interface Result { id: string; what: string; spoke: boolean; firstAudioMs: number | null; tools: string[];
  said: string; turnComplete: boolean; close: string; error: string }

async function run(v: typeof variants[number]): Promise<Result> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const r: Result = { id: v.id, what: v.what, spoke: false, firstAudioMs: null, tools: [], said: '', turnComplete: false, close: '', error: '' };
  const t0 = Date.now();
  let session: any;
  await new Promise<void>(async (done) => {
    const timer = setTimeout(done, WAIT_MS);
    try {
      session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: v.prompt === 'classic'
            ? classicSystemInstruction(TOPIC, GRADE, '') : adaptiveSystemInstruction(TOPIC, GRADE, ''),
          ...(v.tools.length ? { tools: [{ functionDeclarations: v.tools }] } : {}),
          ...v.extra,
        } as any,
        callbacks: {
          onmessage: (m: any) => {
            for (const p of m.serverContent?.modelTurn?.parts || []) {
              if (p.inlineData?.data && r.firstAudioMs === null) { r.firstAudioMs = Date.now() - t0; r.spoke = true; }
            }
            const t = m.serverContent?.outputTranscription?.text;
            if (t) r.said += t;
            if (m.serverContent?.turnComplete) { r.turnComplete = true; clearTimeout(timer); setTimeout(done, 300); }
            for (const c of m.toolCall?.functionCalls || []) {
              r.tools.push(c.name);
              try { session?.sendToolResponse({ functionResponses: [{ id: c.id, name: c.name, response: { result: 'ok' } }] }); } catch {}
            }
          },
          onerror: (e: any) => { r.error = String(e?.message || e); },
          onclose: (e: any) => { r.close = `${e?.code ?? ''} ${e?.reason ?? ''}`.trim(); clearTimeout(timer); done(); },
        },
      });
      session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: v.prompt === 'classic' ? classicKickoff(TOPIC, GRADE) : adaptiveKickoff(TOPIC, GRADE) }] }],
        turnComplete: true,
      });
    } catch (e: any) {
      r.error = String(e?.message || e); clearTimeout(timer); done();
    }
  });
  try { session?.close(); } catch {}
  return r;
}

const lines: string[] = [`Voice diagnosis ${new Date().toISOString()}  model=${MODEL}`, ''];
const log = (s: string) => { console.log(s); lines.push(s); };
for (const v of variants) {
  process.stdout.write(`  ${v.id}  ${v.what} … `);
  const r = await run(v);
  const verdict = r.spoke ? `SPOKE after ${r.firstAudioMs} ms` : 'SILENT';
  console.log(verdict);
  lines.push(`${r.id}  ${verdict.padEnd(22)} ${r.what}`);
  lines.push(`     tools called: ${r.tools.join(', ') || 'none'}   turnComplete: ${r.turnComplete}`
    + (r.close ? `   closed: ${r.close}` : '') + (r.error ? `   ERROR: ${r.error}` : ''));
  if (r.said) lines.push(`     said: "${r.said.trim().slice(0, 160)}"`);
}
fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync('logs/voice-diagnosis.txt', lines.join('\n') + '\n');
log('\nSaved to logs/voice-diagnosis.txt');
process.exit(0);
