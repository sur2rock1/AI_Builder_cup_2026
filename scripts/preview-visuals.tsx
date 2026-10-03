/**
 * Review board pictures without running the app.
 *
 *   npm run preview:visuals -- --concept <conceptId>   every picture pre-generated for that concept
 *   npm run preview:visuals -- --file <visuals.json>    a JSON file: one picture, or { key: picture }
 *   npm run preview:visuals -- --samples                the built-in reference pictures
 *
 * Writes logs/visual-preview-<name>.html (logs/ is git-ignored): every picture,
 * step by step, exactly as the Shape view draws it, plus the fact-checker's
 * findings and what the voice tutor is told about it. Open it in a browser.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import dotenv from 'dotenv';
import { BoardVisualView } from '../src/components/BoardVisualView';
import { sanitizeBoardVisual, VisualIssue } from '../src/visual/sanitize';
import { boardContextBlock } from '../src/visual/tutorBrief';
import type { AnyBoardVisual, BoardVisual } from '../src/visual/types';
import { SAMPLE_VISUALS } from '../src/visual/samples';

dotenv.config({ path: '.env' });

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function load(): Promise<{ name: string; visuals: Record<string, unknown>; misconceptions: Array<{ id?: string; belief: string }> }> {
  const concept = arg('concept');
  if (concept) {
    const { initFirebaseAdmin } = await import('../src/firebase/admin');
    initFirebaseAdmin();
    const { getPregenAsync } = await import('../src/curriculum/pregenStore');
    const rec = await getPregenAsync([concept]);
    if (!rec) throw new Error(`no pre-generated record for "${concept}"`);
    const visuals = (rec as any).visuals || {};
    if (!Object.keys(visuals).length) throw new Error(`"${concept}" has no board pictures yet — run: npm run pregen -- --visuals-only`);
    const { listCurriculaAsync } = await import('../src/curriculum/ingest');
    const def = (await listCurriculaAsync()).flatMap((c) => c.concepts).find((c) => c.id === concept);
    return { name: concept, visuals, misconceptions: def?.misconceptionDetails ?? [] };
  }
  const file = arg('file');
  if (file) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const visuals = raw && Array.isArray(raw.elements) ? { main: raw } : raw;
    return { name: path.basename(file, '.json'), visuals, misconceptions: [] };
  }
  return { name: 'samples', visuals: SAMPLE_VISUALS as Record<string, unknown>, misconceptions: [] };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function renderVisual(key: string, v: BoardVisual, issues: VisualIssue[]): string {
  const frames = [...v.steps.map((s, i) => ({ label: `Step ${i + 1} of ${v.steps.length} — ${s.phase ?? 'teach'}`, caption: s.caption, step: i as number | 'all' })),
    { label: 'Whole picture', caption: v.checkQuestion ? `Think: ${v.checkQuestion}` : '', step: 'all' as const }];
  const cells = frames.map((f, i) => `
    <figure>
      <figcaption><b>${esc(f.label)}</b><span>${esc(f.caption)}</span></figcaption>
      <div class="board">${renderToStaticMarkup(React.createElement(BoardVisualView, {
        visual: v, step: f.step, showControls: false, idPrefix: `${key}-${i}`,
      }))}</div>
    </figure>`).join('');
  const findings = issues.length
    ? `<ul class="issues">${issues.map((i) => `<li class="${i.severity}">${esc(i.severity)} — ${esc(i.message)}</li>`).join('')}</ul>`
    : '<p class="clean">Fact-checker: no findings.</p>';
  return `
  <section>
    <h2>${esc(v.title)} <small>${esc(key)} · ${esc(v.purpose)} · ${esc(v.representation)}</small></h2>
    <p class="why">${esc(v.why)}</p>
    ${findings}
    <div class="grid">${cells}</div>
  </section>`;
}

async function main() {
  const { name, visuals, misconceptions } = await load();
  const clean: Record<string, AnyBoardVisual> = {};
  const sections: string[] = [];
  for (const [key, raw] of Object.entries(visuals)) {
    const r = sanitizeBoardVisual(raw);
    if (!r.visual) { sections.push(`<section><h2>${esc(key)}</h2><p class="error">Unusable: ${esc(r.issues.map((i) => i.message).join('; '))}</p></section>`); continue; }
    clean[key] = r.visual;
    if (r.visual.dim === '2d') sections.push(renderVisual(key, r.visual, r.issues));
    else sections.push(`<section><h2>${esc(r.visual.title)} <small>${esc(key)} · 3D</small></h2><p class="why">${esc(r.visual.why)}</p><p>3D pictures are previewed in the app (WebGL). Steps: ${r.visual.steps.map((s) => esc(s.name)).join(' → ')}</p></section>`);
  }
  const brief = boardContextBlock({ visuals: clean, misconceptions });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Board pictures — ${esc(name)}</title>
<style>
  body { background:#070B16; color:#E8ECF8; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 24px; }
  h1 { font-size: 22px; } h2 { font-size: 18px; margin: 28px 0 4px; } h2 small { color:#8B93A7; font-weight: 400; font-size: 13px; }
  .why { color:#AAB2C8; margin: 0 0 8px; }
  .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(560px, 1fr)); gap: 16px; }
  figure { margin:0; background:#0B1020; border:1px solid rgba(255,255,255,.12); border-radius: 16px; padding: 12px; }
  figcaption { display:flex; flex-direction:column; gap:2px; margin-bottom: 8px; } figcaption span { color:#C9CFDF; }
  .board { aspect-ratio: 1000 / 600; } .board > div { height: 100%; } .board svg { width:100%; height:100%; }
  .issues li.error { color:#FB7185 } .issues li.warn { color:#FBBF24 } .issues li.fix { color:#8B93A7 } .clean { color:#34D399 }
  pre { white-space: pre-wrap; background:#0B1020; border:1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 14px; color:#C9CFDF; }
</style></head><body>
<h1>Board pictures — ${esc(name)}</h1>
${sections.join('\n')}
<h2>What the voice tutor is told</h2><pre>${esc(brief || '(no main picture — nothing is added to the tutor prompt)')}</pre>
</body></html>`;
  fs.mkdirSync('logs', { recursive: true });
  const out = path.join('logs', `visual-preview-${name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80)}.html`);
  fs.writeFileSync(out, html);
  console.log(`Preview written: ${out}`);
}

main().catch((err) => { console.error('❌', err.message || err); process.exit(1); });
