// ─────────────────────────────────────────────────────────────────
// Picture / chalk consistency check.
//
//   npx tsx scripts/check-picture-numbers.ts [--quiet]
//
// For every guided lesson that has stored pictures, works out which picture (and the photo) the child sees at each beat -
// the same way the server does - and checks that the numbers drawn in them (3+ digits, or decimals) are the numbers the
// beat's chalk text and the tutor's words use. A picture of 4040 beside a lesson about 3246 is a teaching error.
// Exit code 1 if any beat disagrees.
// ─────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { GuidedSession } from '../src/guided/session.ts';
import { photoBeatId } from '../src/guided/payload.ts';
import { stripMarks } from '../src/guided/marks.ts';

const root = path.resolve(import.meta.dirname, '..');
const scriptsDir = path.join(root, 'src/guided/scripts');
const pregenDir = path.join(root, 'data/pregenerated');
const quiet = process.argv.includes('--quiet');

const NUM = /\d[\d,]*(?:\.\d+)?/g;
const norm = (s: string) => s.replace(/,/g, '');
const numbersIn = (s: string): string[] => (s.match(NUM) ?? []).map(norm).filter((n) => n.length >= 3 || n.includes('.'));

function pictureNumbers(v: any): Set<string> {
  const out = new Set<string>();
  const add = (s: unknown) => { if (typeof s === 'string') numbersIn(s).forEach((n) => out.add(n)); };
  add(v.title);
  for (const e of v.elements ?? []) { add(e.text); add(e.sub); }
  for (const s of v.steps ?? []) add(s.caption);
  return out;
}

function beatText(b: any): string {
  const parts: string[] = [b.say ?? ''];
  for (const i of b.board ?? []) parts.push(i.text ?? (i.lines ?? []).join(' '));
  for (const l of b.lines ?? []) { parts.push(stripMarks(l.text ?? ''), l.say ?? '', l.ask?.prompt ?? '', l.ask?.board ?? '', l.ask?.lookFor ?? ''); }
  return parts.join(' ');
}

let bad = 0, checked = 0;
for (const f of fs.readdirSync(pregenDir).filter((x) => x.endsWith('.json'))) {
  const sp = path.join(scriptsDir, f);
  if (!fs.existsSync(sp)) continue;
  const rec = JSON.parse(fs.readFileSync(pregenDir + '/' + f, 'utf8'));
  const script = JSON.parse(fs.readFileSync(sp, 'utf8'));
  const visuals = Object.entries<any>(rec.visuals ?? {}).filter(([k, v]) => !k.startsWith('alt:') && v && Array.isArray(v.steps) && v.steps.length);
  const sess = new GuidedSession(script);
  sess.setPictures(visuals.map(([k, v]) => ({ ref: k, title: v.title ?? k, steps: v.steps.map((s: any) => s.id) })));
  const auto: Record<string, string> = (sess as any).plan;
  const plan: Record<string, string[]> = {};
  for (const b of script.beats) {
    const refs: string[] = [];
    if (auto[b.id]) refs.push(auto[b.id]);
    // pictures named by the script itself (a beat may move through more than one)
    for (const i of b.board ?? []) if (i.type === 'picture') refs.push(i.ref);
    for (const l of b.lines ?? []) if (l.picture) refs.push(l.picture.ref);
    if (refs.length) plan[b.id] = [...new Set(refs)];
  }
  const photoBeat = rec.photoMeta?.verified && rec.photoUrl ? photoBeatId(script) : null;
  console.log(`\n${script.title}  [${f.split('--').slice(1, 3).join(' ')}]  photo@${photoBeat ?? '-'}`);
  for (const b of script.beats) {
    const want = new Set<string>();
    const why: string[] = [];
    for (const ref of plan[b.id] ?? []) { const v = rec.visuals[ref]; if (v) { pictureNumbers(v).forEach((n) => { want.add(n); }); why.push(ref); } }
    if (photoBeat === b.id) { numbersIn(rec.photoMeta?.caption ?? '').forEach((n) => want.add(n)); why.push('photo'); }
    if (!why.length) continue;
    checked++;
    const text = norm(beatText(b));
    const have = new Set(numbersIn(text));
    const missing = [...want].filter((n) => !have.has(n));
    // A beat is fine when the picture's own main numbers are present; flag when any are absent.
    const extra = [...have].filter((n) => !want.has(n));
    const ok = missing.length === 0;
    if (!ok) bad++;
    if (!ok || !quiet) console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${b.id} ${b.kind.padEnd(8)} shows ${why.join('+')}: picture numbers [${[...want].join(', ')}]${ok ? '' : `  missing in text: [${missing.join(', ')}]`}${extra.length ? `  text also uses [${extra.join(', ')}]` : ''}`);
  }
}
console.log(`\n${bad ? `${bad} of ${checked} picture beats disagree with their pictures` : `all ${checked} picture beats agree with their pictures`}`);
process.exit(bad ? 1 : 0);
