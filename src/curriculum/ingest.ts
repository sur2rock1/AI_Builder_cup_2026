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

/** Next concept whose prerequisites are all mastered — for ANY curriculum, not just Pythagoras. */
export function nextUnmasteredConcept(c: CurriculumSubject, masteredIds: string[]): CurriculumConcept | undefined {
  const known = new Set(c.concepts.map(x => x.id));
  return [...c.concepts]
    .sort((a, b) => a.typicalTeachingOrder - b.typicalTeachingOrder)
    .find(x => !masteredIds.includes(x.id) &&
      (x.prerequisites || []).filter(p => known.has(p)).every(p => masteredIds.includes(p)));
}

// PDF ingestion lives in ./pdfIngest.ts (split → Files API → per-chapter extraction → merge).
