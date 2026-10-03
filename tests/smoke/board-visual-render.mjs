// Renders real board pictures through the actual React component
// (react-dom/server — no browser) and checks what a learner would see.
// Imported by board-visual.mjs; can also run alone: npx tsx tests/smoke/board-visual-render.mjs
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoardVisualView } from '../../src/components/BoardVisualView.tsx';
import { sanitizeBoardVisual } from '../../src/visual/sanitize.ts';
import { placeLabels, clipLine, ticks, sampleFunction, layoutFrame } from '../../src/visual/layout.ts';

let passed = 0;
const ok = (name, fn) => {
  try { fn(); passed++; console.log(`ok render: ${name}`); }
  catch (err) { console.error(`FAIL render: ${name}\n  ${err.stack || err.message}`); process.exitCode = 1; }
};
const render = (visual, step) => renderToStaticMarkup(React.createElement(BoardVisualView, { visual, step, onStepChange: () => {} }));
const clean = (raw) => {
  const r = sanitizeBoardVisual(raw);
  assert.ok(r.visual, 'sanitized');
  return r.visual;
};

const lines = clean({
  dim: '2d', title: 'Lines where one coordinate never changes', representation: 'visual_diagram', why: 'x stays 2',
  frame: { kind: 'plane', x: [-3, 6], y: [-4, 5], axes: 'both', grid: true, equalScale: true, xLabel: 'x', yLabel: 'y' },
  elements: [
    { id: 'A', kind: 'point', at: [2, -2], label: 'A(2, -2)', color: 'rose' },
    { id: 'B', kind: 'point', at: [2, 1], label: 'B(2, 1)', color: 'rose' },
    { id: 'C', kind: 'point', at: [2, 4], label: 'C(2, 4)', color: 'rose' },
    { id: 'vline', kind: 'line', through: [[2, -2], [2, 4]], label: 'x = 2', color: 'rose' },
    { id: 'hline', kind: 'line', through: [[-1, 1], [4, 1]], label: 'y = 1', color: 'sky' },
    { id: 'tbl', kind: 'table', rows: [['point', 'x', 'y'], ['A', '2', '-2'], ['B', '2', '1'], ['C', '2', '4']] },
  ],
  steps: [
    { id: 's1', name: 'three points', caption: 'Look at A, B and C.', show: ['A', 'B', 'C', 'tbl'], phase: 'hook' },
    { id: 's2', name: 'the vertical line', caption: 'Every point here has x = 2.', show: ['vline'], phase: 'teach' },
    { id: 's3', name: 'the horizontal line', caption: 'Here y stays 1.', show: ['hline'], phase: 'teach' },
  ],
});

ok('step 1 shows only what is being said', () => {
  const html = render(lines, 0);
  assert.match(html, /A\(2, -2\)/);
  assert.match(html, /Look at A, B and C\./);
  assert.doesNotMatch(html, />x = 2</, 'the line is not on the board yet');
  assert.doesNotMatch(html, />y = 1</);
  assert.match(html, /Step 1 of 3/);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

ok('step 2 draws the new line in and spotlights it', () => {
  const html = render(lines, 1);
  assert.match(html, />x = 2</);
  assert.match(html, /data-brick="vline"[^>]*class="bv-enter bv-focus"/);
  assert.match(html, /class="bv-draw"/);
  assert.match(html, /opacity="0.38"/, 'earlier bricks dim while the new idea is spotlighted');
});

ok('regression: a spotlighted vertical/horizontal line stays visible', () => {
  // The glow filter used a bounding-box region; a vertical line's box is zero wide,
  // so the very line being taught vanished while its label stayed (found by rendering
  // the pictures to images, 2026-09-28).
  const html = render(lines, 1);
  assert.match(html, /<filter id="[^"]*-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600"/);
  assert.doesNotMatch(html, /<filter[^>]*x="-30%"/);
});

ok('whole picture: everything, nothing dimmed, question offered', () => {
  const html = render({ ...lines, checkQuestion: 'Why is it called x = 2?' }, 'all');
  assert.match(html, />x = 2</);
  assert.match(html, />y = 1</);
  assert.doesNotMatch(html, /opacity="0.38"/);
  assert.match(html, /Walk me through it/);
  assert.match(html, /Why is it called x = 2\?/);
});

ok('axes carry real numbers and the table renders beside the plot', () => {
  const html = render(lines, 'all');
  for (const t of ['>-2<', '>4<', '>point<']) assert.ok(html.includes(t), t);
  const L = layoutFrame(lines);
  assert.ok(L.table && L.plot.x + L.plot.w <= L.table.x, 'plot does not run under the table');
});

ok('canvas cycle: boxes, connectors with arrowheads, labels in pills', () => {
  const cycle = clean({
    dim: '2d', title: 'The water cycle', representation: 'visual_diagram', why: 'loop',
    frame: { kind: 'canvas' },
    elements: [
      { id: 'sea', kind: 'box', at: [20, 45], text: 'Sea', sub: 'liquid water', color: 'sky' },
      { id: 'cloud', kind: 'box', at: [50, 12], text: 'Clouds', sub: 'tiny droplets', color: 'muted' },
      { id: 'rain', kind: 'box', at: [80, 45], text: 'Rain', color: 'teal' },
      { id: 'c1', kind: 'connector', from: 'sea', to: 'cloud', label: 'evaporation', bend: 0.25, color: 'amber' },
      { id: 'c2', kind: 'connector', from: 'cloud', to: 'rain', label: 'condensation' },
      { id: 'c3', kind: 'connector', from: 'rain', to: 'sea', label: 'runoff', dashed: true },
    ],
    steps: [{ id: 's1', name: 'the loop', caption: 'Water goes round and round.', show: ['sea', 'cloud', 'rain', 'c1', 'c2', 'c3'] }],
  });
  const html = render(cycle, 'all');
  for (const t of ['>Sea<', '>Clouds<', '>Rain<', '>evaporation<', '>runoff<']) assert.ok(html.includes(t), t);
  assert.match(html, /marker-end="url\(#[^)]*-arrow-amber\)"/);
  assert.match(html, /stroke-dasharray="9 7"/);
  assert.doesNotMatch(html, /NaN/);
});

ok('number line with an open point and a ray (x > 3)', () => {
  const nl = clean({
    dim: '2d', title: 'x > 3 on a number line', representation: 'visual_diagram', why: 'region',
    frame: { kind: 'plane', x: [-1, 8], y: [-1, 1], axes: 'x', grid: false },
    elements: [
      { id: 'p', kind: 'point', at: [3, 0], style: 'open', label: '3 not included', color: 'amber' },
      { id: 'r', kind: 'ray', from: [3, 0], through: [5, 0], color: 'amber', weight: 'bold' },
    ],
    steps: [{ id: 's1', name: 'the boundary', caption: '3 itself is not included.', show: ['p'] }, { id: 's2', name: 'the ray', caption: 'Every number bigger than 3.', show: ['r'] }],
  });
  assert.equal(nl.frame.equalScale, false);
  const html = render(nl, 'all');
  assert.match(html, /fill="#0B1020" stroke="#FBBF24"/, 'hollow point');
  assert.match(html, /marker-end="url\(#[^)]*-arrow-amber\)"/, 'ray arrowhead');
  assert.doesNotMatch(html, /NaN/);
});

ok('a curve from a real equation, clipped to the plot', () => {
  const para = clean({
    dim: '2d', title: 'y = x² − 4', representation: 'visual_diagram', why: 'roots',
    frame: { kind: 'plane', x: [-4, 4], y: [-5, 6], axes: 'both', grid: true, equalScale: false },
    elements: [
      { id: 'f', kind: 'function', expr: 'x^2 - 4', label: 'y = x^2 - 4', color: 'violet' },
      { id: 'r1', kind: 'point', at: [-2, 0], label: '(-2, 0)' },
      { id: 'r2', kind: 'point', at: [2, 0], label: '(2, 0)' },
      { id: 'ang', kind: 'angle', vertex: [0, -4], from: [1, -4], to: [0, -3], right: true },
    ],
    steps: [{ id: 's1', name: 'the curve', caption: 'The parabola.', show: ['f', 'r1', 'r2', 'ang'] }],
  });
  const html = render(para, 'all');
  assert.match(html, /clip-path="url\(#[^)]*-clip\)"/);
  assert.match(html, /<polyline[^>]*stroke="#A78BFA"/);
  assert.doesNotMatch(html, /NaN/);
});

// ─── pure layout helpers ─────────────────────────────────────────
ok('labels at the same spot are placed without overlapping', () => {
  const reqs = Array.from({ length: 5 }, (_, i) => ({ key: `l${i}`, text: `Label number ${i}`, anchor: [500, 300], fontSize: 17 }));
  const placed = placeLabels(reqs, [], { x: 0, y: 0, w: 1000, h: 600 });
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i].rect, b = placed[j].rect;
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    assert.ok(!(ox > 0 && oy > 0), `labels ${i} and ${j} overlap`);
  }
});

ok('labels stay inside the board near an edge', () => {
  const [p] = placeLabels([{ key: 'edge', text: 'A long label near the edge', anchor: [995, 5], fontSize: 17 }], [], { x: 0, y: 0, w: 1000, h: 600 });
  assert.ok(p.rect.x >= 0 && p.rect.x + p.rect.w <= 1000 && p.rect.y >= 0, JSON.stringify(p.rect));
});

ok('line clipping: vertical line spans the frame; ray starts at its origin', () => {
  const box = { x: [-3, 6], y: [-4, 5] };
  const [a, b] = clipLine([2, -2], [2, 4], box);
  assert.deepEqual([a[0], b[0]], [2, 2]);
  assert.deepEqual([Math.min(a[1], b[1]), Math.max(a[1], b[1])], [-4, 5]);
  const [r0, r1] = clipLine([3, 0], [5, 0], box, 0);
  assert.deepEqual(r0, [3, 0]); assert.deepEqual(r1, [6, 0]);
  assert.equal(clipLine([10, 10], [11, 11], { x: [0, 1], y: [5, 6] }), null);
});

ok('ticks: nice numbers, zero exact', () => {
  assert.deepEqual(ticks([-3, 6]), [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ticks([0, 1000], undefined, 5), [0, 200, 400, 600, 800, 1000]);
  assert.ok(ticks([-0.3, 0.3]).includes(0));
});

ok('curves break at asymptotes (y = 1/x)', () => {
  const runs = sampleFunction((x) => 1 / x, -5, 5, [-5, 5], (p) => p);
  assert.ok(runs.length >= 2, 'two separate branches');
  for (const run of runs) for (const [, y] of run) assert.ok(Number.isFinite(y));
});

console.log(`${process.exitCode ? 'SOME RENDER CHECKS FAILED' : `ALL ${passed} render checks passed`}`);
