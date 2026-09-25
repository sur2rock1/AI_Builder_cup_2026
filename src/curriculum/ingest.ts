// ─────────────────────────────────────────────────────────────────
// Curriculum Ingestion — process uploaded PDF pages with Gemini
// and extract structured curriculum data for any subject/chapter.
// ─────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import { CurriculumSubject, CurriculumConcept } from '../adaptive/learnerModel';

const CURRICULA_FILE = path.join(process.cwd(), 'data', 'curricula.json');

function readCurricula(): Record<string, CurriculumSubject> {
  if (!fs.existsSync(CURRICULA_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CURRICULA_FILE, 'utf-8')); } catch { return {}; }
}
function writeCurricula(c: Record<string, CurriculumSubject>) {
  const dir = path.dirname(CURRICULA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CURRICULA_FILE, JSON.stringify(c, null, 2), 'utf-8');
}

export function getCurriculum(subjectId: string): CurriculumSubject | null {
  return readCurricula()[subjectId] || null;
}
export function listCurricula(): CurriculumSubject[] {
  return Object.values(readCurricula());
}
export function saveCurriculum(c: CurriculumSubject): void {
  const all = readCurricula();
  all[c.id] = c;
  writeCurricula(all);
}

/** After extract, the family picks or edits the suggested name. */
export function renameCurriculum(subjectId: string, newLabel: string): CurriculumSubject | null {
  const all = readCurricula();
  const cur = all[subjectId];
  if (!cur) return null;
  const label = newLabel.trim().slice(0, 80) || cur.label;
  const newId = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || subjectId;
  if (newId === subjectId) {
    cur.label = label;
    all[subjectId] = cur;
    writeCurricula(all);
    return cur;
  }
  const dest = all[newId];
  if (dest) {
    const seen = new Set(dest.concepts.map(c => c.id));
    for (const c of cur.concepts) {
      if (seen.has(c.id)) continue;
      dest.concepts.push({ ...c, subjectId: newId });
    }
    dest.label = label;
    dest.prerequisiteMap = Object.fromEntries(dest.concepts.map(c => [c.id, c.prerequisites]));
    dest.concepts.forEach((c, i) => { c.typicalTeachingOrder = i + 1; });
    delete all[subjectId];
    all[newId] = dest;
    writeCurricula(all);
    return dest;
  }
  cur.id = newId;
  cur.label = label;
  cur.concepts.forEach(c => { c.subjectId = newId; });
  all[newId] = cur;
  delete all[subjectId];
  writeCurricula(all);
  return cur;
}

/** Next concept whose prerequisites are all mastered — for ANY curriculum, not just Pythagoras. */
export function nextUnmasteredConcept(c: CurriculumSubject, masteredIds: string[]): CurriculumConcept | undefined {
  const known = new Set(c.concepts.map(x => x.id));
  return [...c.concepts]
    .sort((a, b) => a.typicalTeachingOrder - b.typicalTeachingOrder)
    .find(x => !masteredIds.includes(x.id) &&
      (x.prerequisites || []).filter(p => known.has(p)).every(p => masteredIds.includes(p)));
}

// PDF path: ./pdfIngest.ts. Mixed sources (web, YouTube, EPUB, images): ./sourceIngest.ts.
