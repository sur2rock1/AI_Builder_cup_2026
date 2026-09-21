// Latency + robustness tests for the live diagnosis path.
//   npm run test:assessor
// Uses a fake Gemini (genai-stub.mjs) so it runs offline, costs nothing,
// and can simulate slow models, wrong model IDs and rejected settings.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [path.join(here, '../src/adaptive/reasoningAssessor.ts')],
  bundle: true, platform: 'node', format: 'esm', logLevel: 'warning',
  alias: { '@google/genai': path.join(here, 'genai-stub.mjs') },
  outfile: path.join(here, '.build/assessor.bundle.mjs'),
});
let failed = 0;
// Each scenario in its own process: the model cache is per-process by design.
for (const t of ['deadline-slow-model', 'model-id-cache', 'thinking-config-retry', 'all-models-down']) {
  console.log(`\n── ${t}`);
  try {
    const out = execFileSync(process.execPath, [path.join(here, `${t}.mjs`)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    process.stdout.write(out.split('\n').filter(l => /PASS|FAIL/.test(l)).join('\n') + '\n');
    if (/FAIL/.test(out)) failed++;
  } catch (e) { failed++; process.stdout.write(String(e.stdout || e.message)); }
}
console.log(failed ? `\n${failed} scenario(s) failed` : '\nall scenarios passed');
process.exit(failed ? 1 : 0);
