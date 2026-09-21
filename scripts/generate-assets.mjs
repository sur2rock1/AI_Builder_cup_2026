// ─────────────────────────────────────────────────────────────────
// One-off asset generation. Run on YOUR machine (it uses your .env key):
//
//     npm run gen:assets
//
// Produces:
//   public/presenter/stage.jpg   the tutor, standing left, in a real place
//   public/scenes/ladder.jpg     real-world pictures the triangle is traced over
//   public/scenes/ramp.jpg
//   public/scenes/screen.jpg
//   scripts/available-models.txt every model your key can call — use it to
//                                check the model IDs hard-coded in server.ts
//
// Nothing here runs during a lesson. The UI uses these files if they exist
// and falls back to illustrations if they don't.
// Re-run with --only=ladder (etc.) to regenerate a single image.
// ─────────────────────────────────────────────────────────────────
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Modality } from '@google/genai';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY missing from .env'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: KEY });
const only = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];

const NO_TEXT = 'No text, no letters, no numbers, no labels, no watermarks, no logos anywhere in the image.';

const JOBS = [
  {
    id: 'stage', out: 'public/presenter/stage.jpg',
    prompt:
      'Photorealistic 16:9 cinematic photograph. A warm, friendly male maths tutor in his mid-thirties, ' +
      'smart-casual (dark crew-neck sweater), standing in the LEFT THIRD of the frame, framed waist-up, ' +
      'body angled slightly to the right, one open hand gesturing toward the empty right side of the frame ' +
      'as if presenting something there, mid-sentence, kind expression. Setting: a bright rooftop garden ' +
      'terrace at golden hour with a softly blurred city skyline — NOT a classroom, no whiteboard, no desks. ' +
      'The RIGHT TWO-THIRDS of the frame is open, softly out-of-focus background with gentle bokeh, ' +
      'uncluttered, because a graphic will be placed there. Natural warm key light, shallow depth of field, ' +
      'shot on 50mm. ' + NO_TEXT,
  },
  {
    id: 'ladder', out: 'public/scenes/ladder.jpg',
    prompt:
      'Photorealistic 16:9 photograph, exact side-on view (camera perpendicular to the wall), bright daylight. ' +
      'A plain light-coloured house wall rises vertically on the LEFT side of the frame. An aluminium ladder ' +
      'leans against the top of the wall; the foot of the ladder rests on short green lawn toward the RIGHT side ' +
      'of the frame. The wall, the flat ground and the ladder form a clear right-angled triangle, with the ' +
      'right angle at the bottom-left where the wall meets the ground. Blue sky, simple uncluttered composition, ' +
      'no people. ' + NO_TEXT,
  },
  {
    id: 'ramp', out: 'public/scenes/ramp.jpg',
    prompt:
      'Photorealistic 16:9 photograph, exact side-on view, bright daylight. A straight concrete wheelchair ' +
      'access ramp with a metal handrail rises from the ground on the LEFT up to a raised building entrance ' +
      'platform on the RIGHT. The vertical side of the platform, the flat ground and the sloped ramp surface ' +
      'form a clear right-angled triangle. Clean modern building, uncluttered, no people. ' + NO_TEXT,
  },
  {
    id: 'screen', out: 'public/scenes/screen.jpg',
    prompt:
      'Photorealistic 16:9 photograph of a modern living room, camera facing a large flat-screen TV head-on, ' +
      'TV centred and filling about half the frame width, the screen showing a soft abstract colourful gradient, ' +
      'on a low wooden media unit, warm evening lamp light, cosy, uncluttered. ' + NO_TEXT,
  },
];

async function listModels() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=500&key=${KEY}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.models.map(m => ({ name: m.name.replace('models/', ''), methods: m.supportedGenerationMethods || [] }));
}

function pickImageModel(models) {
  const gen = models.filter(m => /image/i.test(m.name) && m.methods.includes('generateContent') && !/preview-tts/i.test(m.name));
  const imagen = models.filter(m => /imagen/i.test(m.name) && m.methods.includes('predict'));
  const pref = gen.find(m => /flash.*image|image.*flash/i.test(m.name)) || gen[0];
  if (pref) return { kind: 'gemini', name: pref.name };
  if (imagen[0]) return { kind: 'imagen', name: imagen[0].name };
  return null;
}

async function generate(model, prompt) {
  if (model.kind === 'imagen') {
    const r = await ai.models.generateImages({ model: model.name, prompt, config: { numberOfImages: 1, aspectRatio: '16:9' } });
    const b64 = r.generatedImages?.[0]?.image?.imageBytes;
    if (!b64) throw new Error('no image returned');
    return Buffer.from(b64, 'base64');
  }
  const r = await ai.models.generateContent({
    model: model.name,
    contents: prompt,
    config: { responseModalities: [Modality.IMAGE, Modality.TEXT], imageConfig: { aspectRatio: '16:9' } },
  });
  const part = (r.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data);
  if (!part) throw new Error('no image returned: ' + (r.text || '').slice(0, 160));
  return Buffer.from(part.inlineData.data, 'base64');
}

const models = await listModels();
fs.writeFileSync('scripts/available-models.txt',
  models.map(m => `${m.name.padEnd(48)} ${m.methods.join(', ')}`).join('\n') + '\n');
console.log(`Your key can call ${models.length} models — full list in scripts/available-models.txt`);

// Flag the model IDs server.ts relies on, so a silent fallback can't hide a typo.
const used = [...new Set((fs.readFileSync('server.ts', 'utf8').match(/'gemini-[a-z0-9.\-]+'/g) || []).map(s => s.slice(1, -1)))];
for (const id of used) console.log(`  ${models.some(m => m.name === id) ? '✓' : '✗ NOT AVAILABLE'}  ${id}  (server.ts)`);

const model = pickImageModel(models);
if (!model) { console.error('No image-capable model available on this key.'); process.exit(1); }
console.log(`\nGenerating with ${model.name}\n`);

for (const job of JOBS) {
  if (only && job.id !== only) continue;
  process.stdout.write(`  ${job.id.padEnd(8)} … `);
  try {
    const buf = await generate(model, job.prompt);
    fs.mkdirSync(path.dirname(job.out), { recursive: true });
    // Saved under .jpg regardless of encoding: browsers sniff image bytes, and a
    // fixed path means the UI needs no manifest.
    fs.writeFileSync(job.out, buf);
    console.log(`saved ${job.out} (${Math.round(buf.length / 1024)} KB)`);
  } catch (e) {
    console.log(`FAILED — ${e.message}`);
  }
}
console.log('\nDone. Restart npm run dev and the stage will pick the images up.');
