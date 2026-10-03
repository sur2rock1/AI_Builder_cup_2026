import fs from 'fs';
import path from 'path';
import { lintVisual } from '../src/quality/visualLint';
import { lintQuiz } from '../src/quality/quizTools';
const dir = 'data/pregenerated';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const tally: Record<string, number> = {};
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const short = f.slice(0, 60);
  let e = 0, w = 0;
  const codes: Record<string, number> = {};
  for (const [k, v] of Object.entries<any>(r.visuals || {})) {
    for (const i of lintVisual(v, { key: k })) { i.severity === 'error' ? e++ : w++; codes[i.code] = (codes[i.code] || 0) + 1; tally[i.code] = (tally[i.code] || 0) + 1; }
  }
  const qi = lintQuiz(r.lessonData?.quiz);
  console.log(short.padEnd(62), `visual errors ${e} warns ${w}  quiz ${qi.map(x => x.code).join(',')}`);
}
console.log(tally);
