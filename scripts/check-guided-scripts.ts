// Validates every guided script (structure, lengths, step order) and, where the lesson has stored pictures, that every picture and step it names exists.
//   npx tsx scripts/check-guided-scripts.ts
import fs from 'node:fs';
import path from 'node:path';
import { validateScript } from '../src/guided/validate.ts';
const root = path.resolve(import.meta.dirname, '..');
let bad = 0, n = 0;
for (const f of fs.readdirSync(path.join(root, 'src/guided/scripts')).filter((x) => x.endsWith('.json'))) {
  const s = JSON.parse(fs.readFileSync(path.join(root, 'src/guided/scripts', f), 'utf8'));
  const pg = path.join(root, 'data/pregenerated', f);
  const rec = fs.existsSync(pg) ? JSON.parse(fs.readFileSync(pg, 'utf8')) : null;
  const r = validateScript(s, { expectedConceptId: s.conceptId, pictures: rec?.visuals });
  n++;
  if (r.errors.length) { bad++; console.log(`FAIL ${f}\n  - ${r.errors.join('\n  - ')}`); }
}
console.log(bad ? `${bad} of ${n} scripts have errors` : `all ${n} guided scripts pass the checks`);
process.exit(bad ? 1 : 0);
