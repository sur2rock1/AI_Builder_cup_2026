// ─────────────────────────────────────────────────────────────────
// Curriculum catalog helpers — the one place that decides how a
// board / grade / subject is normalised and how course and concept IDs
// are built (docs/CURRICULUM.md §2–§3).
//
// IDs are built ONLY from board + grade + subject + chapter + concept
// label — never from an uploaded file's name — so re-uploading the same
// book under a different file name lands on the same IDs and a learner's
// history (keyed by concept id) is never orphaned.
//
// Pure functions, no I/O: shared by the server, the ingest pipeline, the
// UI (via /api/catalog) and the tests.
// ─────────────────────────────────────────────────────────────────

export const slug = (s: string, max = 60): string =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');

/** Boards offered as suggestions in the admin upload form and at signup.
 * Any other board name is accepted as typed. */
export const KNOWN_BOARDS = [
  'IGCSE', 'CBSE', 'ICSE', 'IB PYP', 'IB MYP', 'IB DP', 'Singapore MOE',
  'GCSE', 'Common Core', 'Cambridge Lower Secondary', 'State Board',
];

const BOARD_ALIASES: Record<string, string> = {
  'cambridge igcse': 'IGCSE', 'igcse': 'IGCSE',
  'cbse': 'CBSE', 'ncert': 'CBSE', 'ncert cbse': 'CBSE',
  'icse': 'ICSE', 'cisce': 'ICSE',
  'ib': 'IB MYP', 'ib myp': 'IB MYP', 'myp': 'IB MYP',
  'ib dp': 'IB DP', 'ibdp': 'IB DP', 'ib diploma': 'IB DP',
  'ib pyp': 'IB PYP', 'pyp': 'IB PYP',
  'moe': 'Singapore MOE', 'singapore': 'Singapore MOE', 'singapore moe': 'Singapore MOE',
  'gcse': 'GCSE', 'common core': 'Common Core',
};

/** Canonical display name for a board ("cbse" → "CBSE"); unknown boards keep the admin's spelling, trimmed. */
export function normaliseBoard(input: string): string {
  const t = String(input || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  const alias = BOARD_ALIASES[t.toLowerCase()];
  if (alias) return alias;
  const known = KNOWN_BOARDS.find((b) => b.toLowerCase() === t.toLowerCase());
  return known || t;
}

const SUBJECT_ALIASES: Record<string, string> = {
  math: 'Mathematics', maths: 'Mathematics', mathematics: 'Mathematics',
  bio: 'Biology', biology: 'Biology',
  chem: 'Chemistry', chemistry: 'Chemistry',
  phys: 'Physics', physics: 'Physics',
  sci: 'Science', science: 'Science',
  hist: 'History', history: 'History',
  geo: 'Geography', geography: 'Geography',
  english: 'English', 'english language': 'English Language', 'english literature': 'English Literature',
  cs: 'Computer Science', 'computer science': 'Computer Science', ict: 'ICT',
  econ: 'Economics', economics: 'Economics',
};

/** Canonical subject name ("maths" → "Mathematics"). Unknown subjects are title-cased. */
export function normaliseSubject(input: string): string {
  const t = String(input || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  const alias = SUBJECT_ALIASES[t.toLowerCase()];
  if (alias) return alias;
  return t.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/**
 * Numeric grade (1..12) from any common label: "Grade 8", "8", "Class 7"
 * (CBSE), "Year 9" (UK — Year N ≈ Grade N-1), "Secondary 2" / "Sec 2"
 * (Singapore — Sec N ≈ Grade N+6), "Primary 5" (≈ Grade 5), "MYP 3"
 * (≈ Grade 8), "JC1" (≈ Grade 11). Returns undefined when nothing parses.
 */
export function gradeLevelFromLabel(label: string | number | undefined | null): number | undefined {
  if (typeof label === 'number') return label >= 1 && label <= 12 ? Math.round(label) : undefined;
  const g = String(label || '').toLowerCase();
  if (!g) return undefined;
  let m: RegExpMatchArray | null;
  const clamp = (n: number) => (n >= 1 && n <= 12 ? n : undefined);
  if ((m = g.match(/\bgrade\s*(\d{1,2})\b/))) return clamp(+m[1]);
  if ((m = g.match(/\bclass\s*(\d{1,2})\b/))) return clamp(+m[1]);
  if ((m = g.match(/\bstd\.?\s*(\d{1,2})\b/))) return clamp(+m[1]);
  if ((m = g.match(/\byear\s*(\d{1,2})\b/))) return clamp(+m[1] - 1);
  if ((m = g.match(/\b(?:secondary|sec)\s*(\d)\b/))) return clamp(+m[1] + 6);
  if ((m = g.match(/\b(?:primary|pri|p)\s*(\d)\b/))) return clamp(+m[1]);
  if ((m = g.match(/\bmyp\s*(\d)\b/))) return clamp(+m[1] + 5);
  if ((m = g.match(/\bjc\s*(\d)\b/))) return clamp(+m[1] + 10);
  if ((m = g.match(/^\s*(\d{1,2})\s*$/))) return clamp(+m[1]);
  return undefined;
}

/** Display label for a numeric grade. */
export const gradeLabel = (level: number): string => `Grade ${level}`;

export const GRADE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Course id: board + grade + subject, e.g. "igcse--g8--mathematics". */
export function courseId(board: string, gradeLevel: number, subject: string): string {
  return `${slug(normaliseBoard(board), 30)}--g${gradeLevel}--${slug(normaliseSubject(subject), 40)}`;
}

/** Stable chapter key: "ch9-congruence-and-similarity-tests" or "congruence-..." when unnumbered. */
export function chapterKey(number: number | null | undefined, title: string): string {
  const t = slug(title, 32);
  return typeof number === 'number' ? `ch${number}${t ? '-' + t : ''}` : (t || 'general');
}

/** Stable concept id within a course. */
export function conceptId(course: string, chapter: string, label: string): string {
  return `${course}--${chapter}--${slug(label, 60)}`;
}

/** Misconception id unique within its concept, derived from the belief text. */
export function misconceptionKey(belief: string): string {
  return slug(belief, 48) || 'misconception';
}

/**
 * The conceptType a concept's evidence and strategy history are keyed on.
 * The curriculum's own assignment wins (set once at ingest); older concept
 * states / curricula fall back to the stored state value, then the chapter.
 * Every writer (server.ts evidence recording, ensureConceptState) and reader
 * (src/plan/compile.ts R-WATCH / R-REP) must use this one function, or the
 * strategy profile splits across two keys (seen 2026-09-26: seeded learners
 * had "geometry" while live sessions wrote the chapter title).
 */
export function conceptTypeFor(
  def: { conceptType?: string; chapter?: string } | null | undefined,
  state?: { conceptType?: string } | null,
): string {
  return def?.conceptType || state?.conceptType || def?.chapter || 'general';
}

/** Filter predicate: does this course belong to this learner's board + grade? */
export function courseMatchesLearner(
  course: { board?: string; gradeLevel?: number; grade?: string },
  learner: { board?: string; gradeLevel?: number; grade?: string },
): boolean {
  const learnerLevel = learner.gradeLevel ?? gradeLevelFromLabel(learner.grade);
  const courseLevel = course.gradeLevel ?? gradeLevelFromLabel(course.grade);
  if (learnerLevel !== undefined && courseLevel !== undefined && learnerLevel !== courseLevel) return false;
  if (learner.board && course.board && normaliseBoard(learner.board) !== normaliseBoard(course.board)) return false;
  return true;
}
