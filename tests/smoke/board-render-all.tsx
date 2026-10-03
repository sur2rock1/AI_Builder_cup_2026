// Renders every stored board picture at every step (and 'all') and reports throws / empty output.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { BoardVisualView } from '../../src/components/BoardVisualView';

const dir = path.join(process.cwd(), 'data', 'pregenerated');
let bad = 0, total = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const [key, v] of Object.entries<any>(rec.visuals || {})) {
    if (!v || v.dim === '3d') continue;
    const steps: any[] = [...v.steps.keys(), 'all', 99, -1];
    for (const s of steps) {
      total++;
      try {
        const html = renderToStaticMarkup(<BoardVisualView visual={v} step={s} />);
        const shapes = (html.match(/<(circle|line|path|polygon|polyline|rect|text)\b/g) || []).length;
        // Elements that must be on screen at this step (shown by steps <= s, or never staged).
        const stepOf = new Map<string, number>(); v.steps.forEach((st: any, i: number) => st.show.forEach((id: string) => stepOf.set(id, i)));
        const cur = s === 'all' ? v.steps.length - 1 : Math.max(0, Math.min(s, v.steps.length - 1));
        const vis = v.elements.filter((e: any) => s === 'all' || !stepOf.has(e.id) || stepOf.get(e.id)! <= cur);
        const wantPts = vis.filter((e: any) => e.kind === 'point').length;
        const gotCircles = (html.match(/<circle\b/g) || []).length;
        if (wantPts > 0 && gotCircles < wantPts) { bad++; console.log(`MISSING-POINTS ${f.split('--').pop()} :: ${key} step=${s} want>=${wantPts} circles=${gotCircles}`); }
        if (shapes < 8) { bad++; console.log(`SPARSE ${f.split('--').pop()} :: ${key} step=${s} shapes=${shapes}`); }
      } catch (e: any) {
        bad++; console.log(`THROW  ${f.split('--').pop()} :: ${key} step=${s} :: ${e.message}`);
      }
    }
  }
}
console.log(`${total} renders, ${bad} problems`);
