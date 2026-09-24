// Smoke test for src/ai/gateway.ts — specifically the responseMimeType bug
// found and fixed while migrating liveObserver.ts onto the gateway
// (2026-09-25): generateText() accepted `responseMimeType` in its options
// but never actually placed it on the request, so generateJSON() callers
// were silently relying only on the markdown-fence-strip fallback, never
// real JSON mode. This asserts the fix: the request Gemini actually
// receives carries `config.responseMimeType`.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-gateway-smoke-'));

// A minimal @google/genai stub that records every request's config.
const stub = `
export class GoogleGenAI {
  constructor() {
    this.models = {
      generateContent: async (req) => {
        globalThis.__CALLS__ = globalThis.__CALLS__ || [];
        globalThis.__CALLS__.push({ model: req.model, config: req.config || null });
        return { text: '\`\`\`json\\n{"ok":true}\\n\`\`\`' };
      },
    };
  }
}
`;
fs.writeFileSync(path.join(tmp, 'genai-stub.mjs'), stub);

const script = `
import { generateJSON, generateText } from '${root}/src/ai/gateway.ts';

async function main() {
  const r1 = await generateJSON({ role: 'fast', call: 'smoke.json', apiKey: 'x', prompt: 'hi' });
  if (!r1.data || r1.data.ok !== true) throw new Error('FAIL: generateJSON did not parse the stubbed response');

  const calls = globalThis.__CALLS__ || [];
  const jsonCall = calls[calls.length - 1];
  if (!jsonCall || !jsonCall.config || jsonCall.config.responseMimeType !== 'application/json') {
    throw new Error('FAIL: responseMimeType was not sent on the request — ' + JSON.stringify(jsonCall && jsonCall.config));
  }
  console.log('generateJSON sent responseMimeType=application/json:', JSON.stringify(jsonCall.config));

  globalThis.__CALLS__ = [];
  await generateText({ role: 'fast', call: 'smoke.text', apiKey: 'x', prompt: 'hi' });
  const textCall = (globalThis.__CALLS__ || [])[0];
  if (textCall && textCall.config && textCall.config.responseMimeType) {
    throw new Error('FAIL: responseMimeType leaked into a plain generateText call');
  }
  console.log('generateText (no responseMimeType) sent config:', JSON.stringify(textCall && textCall.config));

  console.log('ALL GATEWAY SMOKE CHECKS PASSED');
}
main().catch((e) => { console.error('GATEWAY SMOKE TEST FAILED:', e); process.exit(1); });
`;
fs.writeFileSync(path.join(tmp, 'run.mts'), script);

const bundlePath = path.join(tmp, 'run.bundle.mjs');
try {
  execFileSync(path.join(root, 'node_modules', '.bin', 'esbuild'), [
    path.join(tmp, 'run.mts'),
    '--bundle', '--platform=node', '--format=esm', '--packages=external',
    `--alias:@google/genai=${path.join(tmp, 'genai-stub.mjs')}`,
    `--outfile=${bundlePath}`,
  ], { cwd: root, encoding: 'utf8' });

  const out = execFileSync(process.execPath, [bundlePath], {
    cwd: root,
    env: { ...process.env, DEMO_MODE: 'false' },
    encoding: 'utf8',
  });
  console.log(out);
} catch (e) {
  console.error(e.stdout || '', e.stderr || '', e.message);
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
