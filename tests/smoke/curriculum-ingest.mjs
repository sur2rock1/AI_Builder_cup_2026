// Smoke test for the curriculum library (docs/CURRICULUM.md): runs the REAL
// ingest pipeline (src/curriculum/pdfIngest.ts runIngest + structure.ts)
// end to end with stubbed model steps, against a throwaway curricula file.
// No network. Run with:  npx tsx tests/smoke/curriculum-ingest.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-curric-'));
process.env.CURRICULA_FILE = path.join(tmp, 'curricula.json');
process.env.LEARNER_DATA_DIR = tmp;
process.env.DISABLE_PREGEN = 'true';

const { runIngest } = await import('../../src/curriculum/pdfIngest.ts');
const { getCurriculumAsync, saveCurriculumAsync, resetCurriculumCacheForTests, deleteCurriculum } = await import('../../src/curriculum/ingest.ts');
const catalog = await import('../../src/curriculum/catalog.ts');
const { ageBandFromGrade } = await import('../../src/persona/ageBands.ts');
const { subjectModeForSubject } = await import('../../src/persona/subjectModes.ts');
const { misconceptionCatalog } = await import('../../src/adaptive/reasoningAssessor.ts');
const { compileTeachingPlan } = await import('../../src/plan/compile.ts');

let failed = false;
function ok(cond, label) {
  if (!cond) { console.error(`FAIL ${label}`); failed = true; } else console.log(`ok ${label}`);
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// ─── catalog / age band / subject mode ───────────────────────────
eq(catalog.gradeLevelFromLabel('Grade 8'), 8, 'grade: "Grade 8"');
eq(catalog.gradeLevelFromLabel('Class 7'), 7, 'grade: CBSE "Class 7"');
eq(catalog.gradeLevelFromLabel('Year 9'), 8, 'grade: UK "Year 9" ≈ Grade 8');
eq(catalog.gradeLevelFromLabel('Secondary 2'), 8, 'grade: Singapore "Secondary 2" ≈ Grade 8');
eq(catalog.gradeLevelFromLabel('Secondary 3 (Grade 9)'), 9, 'grade: explicit grade wins');
eq(catalog.gradeLevelFromLabel('MYP 3'), 8, 'grade: "MYP 3" ≈ Grade 8');
eq(catalog.gradeLevelFromLabel('banana'), undefined, 'grade: unparseable');
eq(ageBandFromGrade('Grade 8'), '13-17', 'age band: Grade 8 → 13-17 (was 8-12 before the fix)');
eq(ageBandFromGrade('Secondary 2 (Grade 8)'), '13-17', 'age band: Sec 2 → 13-17');
eq(ageBandFromGrade('Grade 4'), '8-12', 'age band: Grade 4 → 8-12');
eq(ageBandFromGrade('Grade 1'), '5-7', 'age band: Grade 1 → 5-7');
eq(subjectModeForSubject('x', 'Earth Science'), 'well_structured', 'mode: "Earth Science" no longer matches "art"');
eq(subjectModeForSubject('x', 'History'), 'interpretive', 'mode: History');
eq(catalog.normaliseBoard('cbse'), 'CBSE', 'board alias');
eq(catalog.normaliseSubject('maths'), 'Mathematics', 'subject alias');
eq(catalog.courseId('IGCSE', 8, 'maths'), 'igcse--g8--mathematics', 'course id');

// ─── stub model steps ────────────────────────────────────────────
const saved = [];
function deps(overrides = {}) {
  return {
    split: async (f, sourceId, sourceOrder, title) => ({ chunks: [{ file: f.path, sourceId, sourceOrder, title, fromPage: 1, toPage: 40, tmp: false }], pages: 40 }),
    extractTextbook: async () => [],
    extractSyllabus: async () => [],
    proposeStructure: async () => ({}),
    reviewChapter: async () => ({ concepts: [] }),
    loadExisting: (id) => getCurriculumAsync(id),
    save: async (c) => { saved.push(c); await saveCurriculumAsync(c); },
    afterPublish: () => {},
    modelName: () => 'stub-model',
    ...overrides,
  };
}
const job = () => ({ id: 'j', courseId: catalog.courseId('IGCSE', 8, 'Mathematics'), stage: 'queued', message: '', chunksDone: 0, chunksTotal: 0, progress: 0, warnings: [], startedAt: Date.now() });

const BOOK_A = [
  {
    number: 9, title: 'Congruence and Similarity',
    concepts: [
      {
        label: 'Triangle congruence tests', order: 1, difficultyLevel: 3, pages: [2, 5],
        keyFacts: ['SSS, SAS, AAS and RHS prove congruence.'],
        workedExamples: [{ problem: 'Is ABC ≅ XYZ given three equal sides?', solution: 'SSS', answer: 'Yes' }],
        misconceptions: [
          { belief: 'Students assume SSA proves congruence', probeQuestion: 'Can two different triangles share SSA?', correctionHint: 'The swinging side gives two triangles.' },
        ],
        prerequisites: [{ label: 'Angle sum of a triangle', reason: 'Find third angles', checkQuestion: 'Two angles are 70° and 80°; the third?' }],
      },
      {
        label: 'Similarity tests', order: 2, difficultyLevel: 3,
        keyFacts: ['AA is enough for similarity.'],
        workedExamples: [
          { problem: 'Radius 12, chord 18: distance?', solution: 'sqrt(15^2-9^2)=12', answer: '12' },
          { problem: 'garbled example ... P-X-O', solution: '', answer: '' },
        ],
        misconceptions: [{ belief: 'Needs three equal angles', probeQuestion: 'Could the third angle differ?', correctionHint: 'Angle sum.' }],
      },
      { label: 'Exercise 9A', order: 3, keyFacts: ['Practice questions.'] },
      { label: 'No facts concept', order: 4 },
    ],
  },
];
const BOOK_A_CHUNK2 = [{ number: 9, title: 'Congruence and Similarity', concepts: [
  { label: 'Similarity tests', keyFacts: ['Corresponding sides are in the same ratio.'] },
] }];

let chunkCalls = 0;
const idOf = (label, ch = 'ch9-congruence-and-similarity') => catalog.conceptId('igcse--g8--mathematics', ch, label);
const CONG = idOf('Triangle congruence tests');
const SIM = idOf('Similarity tests');
const EX = idOf('Exercise 9A');

const depsA = deps({
  split: async (f, sourceId, sourceOrder, title) => ({ chunks: [
    { file: f.path, sourceId, sourceOrder, title, fromPage: 1, toPage: 60, tmp: false },
    { file: f.path, sourceId, sourceOrder, title, fromPage: 61, toPage: 90, tmp: false },
  ], pages: 90 }),
  extractTextbook: async (chunk) => { chunkCalls++; return chunk.fromPage === 1 ? BOOK_A : BOOK_A_CHUNK2; },
  extractSyllabus: async () => [
    { code: 'C4.1', title: 'Congruence', objectives: ['Use SSS, SAS, ASA/AAS and RHS'], excluded: ['Proofs of the tests'], extension: ['Ambiguous case'] },
  ],
  proposeStructure: async (input) => ({
    subjectMode: 'well_structured',
    conceptTypes: [{ id: 'Congruence & Similarity', description: 'shape equality tests' }],
    concepts: [
      { conceptId: CONG, conceptType: 'congruence-similarity', prerequisites: [{ conceptId: SIM, reason: 'forward edge — must be dropped' }], externalPrerequisites: ['Angle sum of a triangle', 'Invented prerequisite'] },
      { conceptId: SIM, conceptType: 'congruence-similarity', prerequisites: [{ conceptId: CONG, reason: 'Builds on congruence', matchesExtracted: null }, { conceptId: 'nope', reason: 'unknown id' }, { conceptId: SIM, reason: 'self' }] },
      { conceptId: EX, conceptType: 'made-up-type', prerequisites: [] },
    ],
    chapterScope: [{ chapterId: 'ch9-congruence-and-similarity', syllabusRefs: ['C4.1', 'Z9.9 not in syllabus'] }],
  }),
  reviewChapter: async (input) => ({ concepts: input.concepts.map((c) => {
    if (c.id === EX) return { conceptId: c.id, verdict: 'reject', rejectReason: 'exercise heading, not a concept' };
    if (c.id === SIM) return {
      conceptId: c.id, verdict: 'corrected',
      keyFacts: c.keyFacts,
      workedExamples: [
        { problem: 'Radius 15, chord 18: distance?', solution: 'sqrt(15^2-9^2)=12', answer: '12 cm', status: 'corrected' },
        { problem: 'garbled', status: 'wrong_unfixable' },
      ],
      misconceptions: [{ id: 'third-angle-needed', belief: 'Needs three equal angles', probeQuestion: 'Could the third angle differ?', correctionHint: 'Angle sum.' }],
      ladder: [1, 2, 3, 4].map((level) => ({ level, prompt: `L${level} prompt`, lookFor: `L${level} answer` })),
      representations: [{ strategy: 'visual_diagram', idea: 'overlay the triangles' }, { strategy: 'not_a_strategy', idea: 'x' }],
      notes: ['fixed radius'],
    };
    return {
      conceptId: c.id, verdict: 'ok', keyFacts: c.keyFacts,
      workedExamples: c.workedExamples.map((w) => ({ ...w, status: 'verified' })),
      misconceptions: c.misconceptions.map((m) => ({ ...m, id: 'SSA assumed valid!' })),
      ladder: [{ level: 1, prompt: 'Name the four tests', lookFor: 'SSS SAS AAS RHS' }, { level: 9, prompt: 'bad level', lookFor: '' }],
      representations: [{ strategy: 'worked_example', idea: 'two triangle pairs' }],
    };
  }) }),
});

const courseA = await runIngest(job(), {
  apiKey: 'x', board: 'IGCSE', gradeLevel: 8, subject: 'Mathematics',
  textbooks: [{ path: '/tmp/x.pdf', originalName: '757429818_3B_Think-Maths.pdf' }],
  syllabi: [{ path: '/tmp/s.pdf', originalName: 'IGCSE 0580 syllabus.pdf' }],
}, depsA);

eq(chunkCalls, 2, 'both textbook chunks extracted');
eq(courseA.id, 'igcse--g8--mathematics', 'course id from board/grade/subject');
eq([courseA.board, courseA.gradeLevel, courseA.grade, courseA.subjectMode], ['IGCSE', 8, 'Grade 8', 'well_structured'], 'course metadata');
ok(courseA.concepts.every((c) => !c.id.includes('757429818')), 'concept ids never contain the upload file name');
eq(courseA.concepts.map((c) => c.id), [CONG, SIM], 'rejected + fact-less concepts not published, order kept');
const cong = courseA.concepts.find((c) => c.id === CONG);
const sim = courseA.concepts.find((c) => c.id === SIM);
eq(sim.keyFacts.length, 2, 'concept content merged across chunks');
eq(cong.prerequisites, [], 'forward prerequisite edge dropped');
eq(sim.prerequisites, [CONG], 'valid backward edge kept; unknown/self edges dropped');
ok(courseA.verification.prerequisiteEdgesDropped >= 3, 'dropped edges counted');
eq(cong.prerequisiteDetails.map((d) => [d.label, !!d.conceptId]), [['Angle sum of a triangle', false]], 'only REAL external prerequisite kept (invented one ignored)');
eq(sim.prerequisiteDetails.map((d) => d.conceptId), [CONG], 'internal prerequisite detail links the concept');
eq(cong.conceptType, 'congruence-similarity', 'conceptType slugged and assigned');
eq(sim.workedExamples.length, 1, 'unfixable example dropped, corrected one kept');
ok(sim.workedExamples[0].includes('Radius 15'), 'corrected example text published');
eq(courseA.verification.examplesCorrected, 1, 'examplesCorrected counted');
eq(courseA.verification.conceptsRejected, 1, 'rejected concept counted');
eq(cong.misconceptionDetails.map((m) => m.id), ['ssa-assumed-valid'], 'misconception id slugged');
eq(misconceptionCatalog(cong).map((m) => m.id), [`${CONG}::ssa-assumed-valid`], 'diagnostician catalogue uses the stable id');
eq(cong.ladderItems.map((l) => l.level), [1], 'invalid ladder level dropped');
eq(sim.representationIdeas.map((r) => r.strategy), ['visual_diagram'], 'unknown representation strategy dropped');
eq(sim.verification.status, 'corrected', 'per-concept verification status');
const scope = courseA.scopeMaps.find((s) => s.chapterTitle === 'Chapter 9: Congruence and Similarity');
eq([scope.source, scope.inScope, scope.outOfScope, scope.advanced], ['syllabus', ['Use SSS, SAS, ASA/AAS and RHS'], ['Proofs of the tests'], ['Ambiguous case']], 'scope comes from the syllabus text, with provenance');
eq(scope.syllabusRefs, ['C4.1 Congruence'], 'unknown syllabus ref ignored');
eq(courseA.sources.map((s) => s.kind), ['textbook', 'syllabus'], 'sources recorded');

// Persisted and reloadable.
resetCurriculumCacheForTests();
const reloaded = await getCurriculumAsync('igcse--g8--mathematics');
eq(reloaded?.concepts.length, 2, 'course persisted to the curricula file');

// ─── second upload (Book B) merges without touching Book A ───────
const B_ID = idOf('Area ratio of similar figures', 'ch10-area-and-volume');
const courseB = await runIngest(job(), {
  apiKey: 'x', board: 'igcse', gradeLevel: 8, subject: 'maths',
  textbooks: [{ path: '/tmp/b.pdf', originalName: 'Book B.pdf' }], syllabi: [],
}, deps({
  extractTextbook: async () => [{ number: 10, title: 'Area and Volume', statedExclusions: ['Integration'], concepts: [
    { label: 'Area ratio of similar figures', keyFacts: ['Area ratio = k²'], misconceptions: [{ belief: 'Area ratio equals length ratio', probeQuestion: 'Double the side — double the area?', correctionHint: 'k²' }] },
  ] }],
  proposeStructure: async () => ({
    conceptTypes: [{ id: 'scaling', description: '' }],
    concepts: [
      { conceptId: CONG, conceptType: 'scaling' },           // must NOT change: already published
      { conceptId: B_ID, conceptType: 'scaling', prerequisites: [{ conceptId: SIM, reason: 'needs similarity' }] },
    ],
  }),
  reviewChapter: async (input) => ({ concepts: input.concepts.map((c) => ({ conceptId: c.id, verdict: 'ok', keyFacts: c.keyFacts, misconceptions: c.misconceptions })) }),
}));
eq(courseB.id, 'igcse--g8--mathematics', 'aliases (igcse / maths) land on the same course');
eq([courseB.board, courseB.label], ['IGCSE', 'Mathematics'], 'aliases are stored in canonical spelling');
eq(courseB.concepts.map((c) => c.id), [CONG, SIM, B_ID], 'Book B appended after Book A');
eq(courseB.concepts.find((c) => c.id === CONG).conceptType, 'congruence-similarity', 'published conceptType is never changed by a later upload');
eq(courseB.concepts.find((c) => c.id === CONG).misconceptionDetails.map((m) => m.id), ['ssa-assumed-valid'], 'published misconception ids unchanged');
eq(courseB.concepts.find((c) => c.id === B_ID).prerequisites, [SIM], 'new book links to an earlier book');
const textbookScope = courseB.scopeMaps.find((s) => s.chapterTitle === 'Chapter 10: Area and Volume');
eq([textbookScope.source, textbookScope.outOfScope], ['textbook', ['Integration']], 'textbook-only scope: exclusions only as the book states them');
eq(courseB.concepts.find((c) => c.id === B_ID).workedExamples, [], 'no worked examples invented');

// ─── review failure → published WITHOUT worked examples ──────────
const C_ID = idOf('Ratio of volumes', 'ch11-volume');
const courseC = await runIngest(job(), {
  apiKey: 'x', board: 'IGCSE', gradeLevel: 8, subject: 'Mathematics',
  textbooks: [{ path: '/tmp/c.pdf', originalName: 'Book C.pdf' }], syllabi: [],
}, deps({
  extractTextbook: async () => [{ number: 11, title: 'Volume', concepts: [
    { label: 'Ratio of volumes', keyFacts: ['Volume ratio = k³'], workedExamples: [{ problem: 'unverified', answer: '?' }] },
  ] }],
  reviewChapter: async () => { throw new Error('model down'); },
}));
const vol = courseC.concepts.find((c) => c.id === C_ID);
eq(vol.workedExamples, [], 'unreviewed concept published without its worked examples');
eq(vol.conceptType, 'general', 'structure failure → "general" type');

// ─── plan compiler with a real graph (D-2026-09-26-8) ────────────
const learner = (states) => ({ studentId: 's', name: 'S', grade: 'Grade 8', gradeLevel: 8, createdAt: 0, updatedAt: 0, globalInsights: [],
  subjects: { [courseB.id]: { subjectId: courseB.id, subjectLabel: 'M', grade: 'Grade 8', curriculumSource: '', sessionCount: 0, totalMinutes: 0, lastSession: 0, conceptStates: states } } });
const plan1 = compileTeachingPlan(learner({}), courseB, { studentId: 's', subjectId: courseB.id, channel: 'voice', requestedConceptId: B_ID });
eq(plan1.targetConcept.conceptId, B_ID, 'no evidence on the prerequisite → requested concept is taught (not redirected)');
eq(plan1.prerequisitesToProbe.map((p) => p.conceptId), [SIM], 'unevidenced prerequisite is probed first');
eq(plan1.prerequisitesToProbe[0].checkQuestion, 'L1 prompt', 'probe question = prerequisite L1 ladder item when the link has no check question');
eq(plan1.ageBand, '13-17', 'plan age band for Grade 8');
const weakSim = { conceptId: SIM, label: 'Sim', masteryLevel: 'partial', masteryScore: 30, attemptCount: 2, correctCount: 0, lastVisited: 0, strategiesUsed: [], effectiveStrategies: [], ineffectiveStrategies: [], confirmedMisconceptions: [], suspectedMisconceptions: [], quizHistory: [], prerequisitesGapped: [], notes: [], pKnown: 0.3, evidenceLog: [{}] };
const plan2 = compileTeachingPlan(learner({ [SIM]: weakSim }), courseB, { studentId: 's', subjectId: courseB.id, channel: 'voice', requestedConceptId: B_ID });
eq([plan2.targetConcept.conceptId, plan2.targetConcept.reason.rule], [SIM, 'R-PREREQ-FIRST'], 'evidenced weak prerequisite becomes the target');
const plan3 = compileTeachingPlan(learner({}), courseB, { studentId: 's', subjectId: courseB.id, channel: 'voice', requestedConceptId: CONG });
eq(plan3.prerequisitesToProbe.map((p) => [p.label, p.conceptId.startsWith('external:')]), [['Angle sum of a triangle', true]], 'earlier-grade prerequisite probed (probe-only)');

// ─── chapter limit (D-2026-09-26-9) ─────────────────────────────
{
  const SCI = catalog.courseId('CBSE', 7, 'Science');
  const jobSci = () => ({ id: 'j2', courseId: SCI, stage: 'queued', message: '', chunksDone: 0, chunksTotal: 0, chunksSkipped: 0, progress: 0, warnings: [], startedAt: Date.now() });
  const ch = (n, extraFact) => ({ number: n, title: `Topic ${n}`, concepts: [{ label: `Idea ${n}`, keyFacts: [extraFact || `Fact ${n}`] }] });
  const PAGES = { 1: [ch(1), ch(2)], 61: [ch(2, 'Fact 2 continued'), ch(3), ch(4)], 121: [ch(5)] };
  const read = [];
  const sciDeps = () => deps({
    split: async (f, sourceId, sourceOrder, title) => ({ chunks: [1, 61, 121].map((p) => ({ file: f.path, sourceId, sourceOrder, title, fromPage: p, toPage: p + 59, tmp: false })), pages: 180 }),
    extractTextbook: async (chunk) => { read.push(chunk.fromPage); return PAGES[chunk.fromPage]; },
    reviewChapter: async (input) => ({ concepts: input.concepts.map((c) => ({ conceptId: c.id, verdict: 'ok', keyFacts: c.keyFacts })) }),
  });
  const book = { apiKey: 'x', board: 'CBSE', gradeLevel: 7, subject: 'Science', textbooks: [{ path: '/tmp/sci.pdf', originalName: 'NCERT Science 7.pdf' }], syllabi: [] };

  const j1 = jobSci();
  const c3 = await runIngest(j1, { ...book, chapterLimit: 3 }, sciDeps());
  eq(read, [1, 61], 'limit 3: reading stopped once chapter 4 appeared — part 3 never sent to the model');
  eq(j1.chunksSkipped, 1, 'skipped part counted');
  eq([...new Set(c3.concepts.map((c) => c.chapter))], ['Chapter 1: Topic 1', 'Chapter 2: Topic 2', 'Chapter 3: Topic 3'], 'only the first 3 chapters published');
  eq(c3.concepts.find((c) => c.label === 'Idea 2').keyFacts.length, 2, 'a chapter straddling two parts is still complete');
  eq([j1.result.chapterLimit, j1.result.chaptersLoaded.length, j1.result.chaptersNotLoaded], [3, 3, 1], 'job result reports the limit');

  read.length = 0;
  const c5 = await runIngest(jobSci(), { ...book, chapterLimit: 5 }, sciDeps());
  eq(read, [1, 61, 121], 'higher limit reads further');
  eq(c5.concepts.length, 5, 're-upload with a higher limit adds chapters 4–5');
  eq(c5.concepts.slice(0, 3).map((c) => c.id), c3.concepts.map((c) => c.id), 'already-published chapters unchanged');

  read.length = 0;
  const cAll = await runIngest(jobSci(), { ...book }, sciDeps());
  eq([read.length, cAll.concepts.length], [3, 5], 'no limit = whole book (nothing new to add)');
  ok(await deleteCurriculum(SCI), 'delete limit-test course');
}

// ─── delete ──────────────────────────────────────────────────────
ok(await deleteCurriculum('igcse--g8--mathematics'), 'delete course');
resetCurriculumCacheForTests();
eq(await getCurriculumAsync('igcse--g8--mathematics'), null, 'deleted course gone after reload');

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error('\nCURRICULUM INGEST SMOKE: FAILURES ABOVE'); process.exit(1); }
console.log('\nALL curriculum-ingest.mjs CHECKS PASSED');
