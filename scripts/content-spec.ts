// Prints the Chapter 1 content spec (no model, no network): npm run spec:ch1 [-- --write]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildConceptSpec, specToMarkdown } from '../src/curriculum/contentSpec';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chapter = process.argv.includes('--chapter') ? process.argv[process.argv.indexOf('--chapter') + 1] : '^Chapter 1:';
const curricula = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curricula.json'), 'utf8'));
const specs = [];
for (const course of curricula) {
  for (const c of course.concepts) {
    if (!new RegExp(chapter, 'i').test(String(c.chapter || ''))) continue;
    specs.push(buildConceptSpec(c, course, course.grade || 'Grade 8'));
  }
}
const md = specToMarkdown(specs);
if (process.argv.includes('--write')) { fs.writeFileSync(path.join(ROOT, 'docs', 'CH1_CONTENT_SPEC.md'), md); console.log('wrote docs/CH1_CONTENT_SPEC.md'); }
else console.log(md);
