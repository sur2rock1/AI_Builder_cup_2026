// Diagnosis-accuracy evaluation runner.
//
//   npm run eval:diagnosis            real run (needs GEMINI_API_KEY; ~45 cases, a few minutes, small cost)
//   npm run eval:diagnosis:dry        pipeline self-test with SYNTHETIC outputs (never quote these numbers)
//   options: --no-naive  skip the plain-prompt baseline    --only A,C  run some concepts    --limit 10
//
// Output: evals/diagnosis/results/<run>/{report.html,summary.md,cases.csv,results.json}
// and a copy in evals/diagnosis/results/latest/ (latest-dry/ for dry runs).
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessReasoning, misconceptionCatalog } from '../../src/adaptive/reasoningAssessor';
import { CaseRecord, Cls, CLASSES, leakCheck } from './metrics';
import { writeReport, RunMeta } from './report';

dotenv.config({ path: '.env.local' });
dotenv.config();

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const DRY = flag('dry');
const NAIVE = !flag('no-naive');
const ONLY = opt('only')?.split(',').map(s => s.trim().toUpperCase());
const LIMIT = opt('limit') ? Number(opt('limit')) : undefined;
const MAX_ATTEMPTS = 3;

const concepts = JSON.parse(fs.readFileSync(path.join(here, 'concepts.json'), 'utf8')).concepts as Record<string, any>;
const casesRaw = fs.readFileSync(path.join(here, 'cases.json'), 'utf8');
let cases = JSON.parse(casesRaw).cases as any[];
if (ONLY) cases = cases.filter(c => ONLY.includes(c.concept));
if (LIMIT) cases = cases.slice(0, LIMIT);

const sha = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function git(cmd: string): string {
  try { return execSync(`git ${cmd}`, { cwd: path.join(here, '..', '..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return 'unknown'; }
}

/** Collect the assessor's own console output for one call (it logs which model answered, and when it falls back). */
async function withCapturedLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const keep = { log: console.log, warn: console.warn, error: console.error };
  const grab = (...a: any[]) => { logs.push(a.map(x => (typeof x === 'string' ? x : String(x?.message ?? x))).join(' ')); };
  console.log = grab; console.warn = grab; console.error = grab;
  try { return { result: await fn(), logs }; }
  finally { console.log = keep.log; console.warn = keep.warn; console.error = keep.error; }
}

// ── seeded RNG for the dry run (so the dry run is repeatable)
function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

async function naiveJudge(ai: GoogleGenAI, model: string, c: any) {
  const prompt = `A tutor asked a child: "${c.question}"
The correct answer is: "${c.expectedAnswer}"
The child answered: "${c.childAnswer}"
The child explained: "${c.childReasoning || '(no explanation)'}"

Does the child understand the concept? Reply with JSON only: {"understands": true or false, "reason": "one sentence"}`;
  for (let i = 0; i < 2; i++) {
    try {
      const res = await ai.models.generateContent({ model, contents: prompt, config: { responseMimeType: 'application/json' } });
      const j = JSON.parse((res.text || '').replace(/```json\s*|\s*```/g, '').trim());
      return { understands: typeof j.understands === 'boolean' ? j.understands : null, reason: String(j.reason || '') };
    } catch (e: any) {
      if (i === 1) return { understands: null, reason: '', error: String(e?.message || e).slice(0, 140) };
      await sleep(800);
    }
  }
  return { understands: null, reason: '', error: 'unreachable' };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!DRY && !apiKey) { console.error('GEMINI_API_KEY is not set (put it in .env.local). Use --dry for a pipeline self-test.'); process.exit(1); }
  const ai = DRY ? null : new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
  const rnd = mulberry32(7);
  const records: CaseRecord[] = [];
  const models = new Set<string>();
  let naiveModel = '';
  const t0 = Date.now();

  for (const [i, c] of cases.entries()) {
    const cc = concepts[c.concept];
    if (!cc) throw new Error(`case ${c.id}: unknown concept ${c.concept}`);
    const concept = cc.concept;
    const catalog = misconceptionCatalog(concept);
    const goldId = c.gold.misconception ? `${concept.id}::${c.gold.misconception}` : null;
    if (goldId && !catalog.some(m => m.id === goldId)) throw new Error(`case ${c.id}: ${goldId} not in catalogue`);

    const rec: CaseRecord = {
      id: c.id, concept: c.concept, conceptLabel: concept.label, tags: c.tags || [], answerCorrect: c.answerCorrect,
      question: c.question, expectedAnswer: c.expectedAnswer, childAnswer: c.childAnswer, childReasoning: c.childReasoning,
      gold: { classification: c.gold.classification as Cls, misconceptionId: goldId },
      ananta: null, anantaFellBack: false, attempts: 0, model: DRY ? 'dry-run (synthetic)' : '', latencyMs: null, leak: 'not_checkable', naive: null,
    };

    if (DRY) {
      const good = rnd() < 0.8;
      const others = CLASSES.filter(k => k !== rec.gold.classification);
      const cls = good ? rec.gold.classification : others[Math.floor(rnd() * others.length)];
      rec.ananta = {
        classification: cls, ids: cls === 'misconception_behind_correct' || cls === 'wrong_answer' ? (goldId && rnd() < 0.85 ? [goldId] : []) : [],
        confidence: rnd() < 0.5 ? 'high' : 'medium', shouldProbe: cls !== 'clear_reasoning', probeQuestion: 'DRY RUN: synthetic probe',
        tutorGuidance: 'DRY RUN: synthetic guidance', reasoningSummary: 'DRY RUN: synthetic summary',
      };
      rec.latencyMs = Math.round(1500 + rnd() * 2500); rec.attempts = 1;
      rec.naive = { understands: rnd() < 0.75, reason: 'DRY RUN: synthetic' };
    } else {
      for (let a = 1; a <= MAX_ATTEMPTS; a++) {
        const t1 = Date.now();
        const { result, logs } = await withCapturedLogs(() => assessReasoning({
          concept, conceptState: null, questionAsked: c.question, childAnswer: c.childAnswer, childReasoning: c.childReasoning,
          expectedAnswer: c.expectedAnswer, currentStrategy: 'direct_explanation', apiKey,
          subjectLabel: cc.subjectLabel, gradeLevel: cc.gradeLevel, subjectMode: cc.subjectMode,
        }));
        rec.attempts = a;
        rec.latencyMs = Date.now() - t1;
        rec.anantaFellBack = logs.some(l => /using safe fallback/.test(l));
        const answered = logs.map(l => l.match(/\[ReasoningAssessor\] (\S+) answered in (\d+)ms/)).find(Boolean);
        const using = logs.map(l => l.match(/\[ReasoningAssessor\] using (\S+)/)).find(Boolean);
        const mdl = (answered?.[1] || using?.[1]) as string | undefined;
        if (mdl) { rec.model = mdl; models.add(mdl); if (!naiveModel) naiveModel = mdl; }
        rec.ananta = {
          classification: result.classification, ids: result.candidateMisconceptionIds, confidence: result.confidence,
          shouldProbe: result.shouldProbe, probeQuestion: result.probeQuestion, tutorGuidance: result.tutorGuidance,
          reasoningSummary: result.reasoningSummary, faultyStep: result.faultyStep,
        };
        if (!rec.anantaFellBack) break;
        await sleep(1500);
      }
      if (NAIVE) rec.naive = await naiveJudge(ai!, naiveModel || 'gemini-flash-latest', c);
      await sleep(250);
    }

    rec.leak = rec.ananta && !rec.anantaFellBack ? leakCheck(c.expectedAnswer, rec.ananta.probeQuestion, rec.ananta.tutorGuidance) : 'not_checkable';
    records.push(rec);
    const mark = rec.anantaFellBack ? 'FALLBACK' : rec.ananta?.classification === rec.gold.classification ? 'ok' : 'miss';
    console.log(`[${String(i + 1).padStart(2)}/${cases.length}] ${rec.id.padEnd(3)} gold=${rec.gold.classification.padEnd(28)} pred=${(rec.ananta?.classification || '-').padEnd(28)} ${mark}`);
  }

  const startedAt = new Date(t0).toISOString();
  const runId = `${DRY ? 'dry-' : ''}${startedAt.replace(/[:.]/g, '-').slice(0, 19)}`;
  const meta: RunMeta = {
    runId, startedAt, dry: DRY, gitCommit: git('rev-parse --short HEAD'), gitDirty: git('status --porcelain -- src/adaptive evals').length > 0,
    assessorSha: sha(fs.readFileSync(path.join(here, '..', '..', 'src/adaptive/reasoningAssessor.ts'), 'utf8')),
    casesSha: sha(casesRaw), models: Array.from(models), naiveModel: NAIVE && !DRY ? naiveModel : '', naiveEnabled: NAIVE,
    node: process.version, durationSec: Math.round((Date.now() - t0) / 1000),
  };
  const outRoot = path.join(here, 'results');
  const dir = path.join(outRoot, runId);
  writeReport(dir, meta, records);
  const latest = path.join(outRoot, DRY ? 'latest-dry' : 'latest');
  fs.rmSync(latest, { recursive: true, force: true });
  fs.cpSync(dir, latest, { recursive: true });
  console.log(`\nDone in ${meta.durationSec}s.${DRY ? '  (DRY RUN: synthetic numbers, pipeline test only)' : ''}`);
  console.log(`Report:  ${path.join(latest, 'report.html')}`);
  console.log(`Summary: ${path.join(latest, 'summary.md')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
