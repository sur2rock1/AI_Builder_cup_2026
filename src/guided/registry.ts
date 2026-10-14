// ─────────────────────────────────────────────────────────────────
// Guided script registry — which concepts have a prepared script.
//
// Scripts are imported (not read from disk at run time) so they are bundled
// into the server build and the Docker image like any other source file.
//   ./scripts    hand-written lessons (listed below)
//   ./generated  lessons written by Gemini (scripts/generate-guided.ts), which
//                passed every check; listed in ./generated/index.ts (auto-written).
// A generated lesson replaces a hand-written one for the same concept.
// RUNTIME lessons (written when a curriculum PDF is uploaded, see store.ts) are
// loaded by the server through setRuntimeGuidedScripts() and replace both.
// The checker (tests/guided/run.mjs) validates every script in both.
//
// Isomorphic: no Node or DOM imports.
// ─────────────────────────────────────────────────────────────────

import type { GuidedScript } from './types';

import s0 from './scripts/cambridge-lower-secondary--g4--mathematics--measure--measuring-and-comparing-mass-weight.json';
import s1 from './scripts/cambridge-lower-secondary--g4--mathematics--number--adding-and-subtracting-near-multiples-of-10.json';
import s2 from './scripts/cambridge-lower-secondary--g4--mathematics--number--choosing-efficient-mental-and-written-calculation-methods.json';
import s3 from './scripts/cambridge-lower-secondary--g4--mathematics--number--mental-and-written-addition-strategies.json';
import s4 from './scripts/cambridge-lower-secondary--g4--mathematics--number--mental-subtraction-using-counting-back-and-finding-the-diffe.json';
import s5 from './scripts/cambridge-lower-secondary--g4--mathematics--number--money-and-decimal-place-value.json';
import s6 from './scripts/cambridge-lower-secondary--g4--mathematics--number--multiplication-facts-arrays-and-doubling.json';
import s7 from './scripts/cambridge-lower-secondary--g4--mathematics--number--multiplication-using-factors-and-known-facts.json';
import s8 from './scripts/cambridge-lower-secondary--g4--mathematics--number--multiplying-a-two-digit-number-by-a-single-digit.json';
import s9 from './scripts/cambridge-lower-secondary--g4--mathematics--number--multiplying-and-dividing-by-10-and-100.json';
import s10 from './scripts/cambridge-lower-secondary--g4--mathematics--number--odd-and-even-numbers-and-generalizations.json';
import s11 from './scripts/cambridge-lower-secondary--g4--mathematics--number--ordering-and-rounding-whole-numbers.json';
import s12 from './scripts/cambridge-lower-secondary--g4--mathematics--number--partitioning-to-add-and-subtract-3-digit-numbers.json';
import s13 from './scripts/cambridge-lower-secondary--g4--mathematics--number--positive-and-negative-numbers.json';
import s14 from './scripts/cambridge-lower-secondary--g4--mathematics--number--reading-writing-and-partitioning-4-digit-numbers.json';
import s15 from './scripts/igcse--g8--biology--ch1-introducing-living-things--cell-division-by-meiosis-and-sexual-reproduction.json';
import s16 from './scripts/igcse--g8--biology--ch1-introducing-living-things--cell-division-by-mitosis.json';
import s17 from './scripts/igcse--g8--biology--ch1-introducing-living-things--cell-structure-and-levels-of-organisation.json';
import s18 from './scripts/igcse--g8--biology--ch1-introducing-living-things--characteristics-and-needs-of-living-things.json';
import s19 from './scripts/igcse--g8--biology--ch1-introducing-living-things--classification-and-diversity-of-living-organisms.json';
import s20 from './scripts/igcse--g8--biology--ch1-introducing-living-things--movement-of-substances-diffusion-osmosis-and-active-transpor.json';
import s21 from './scripts/igcse--g8--mathematics--ch1-linear-graphs-and-simultaneous-l--applications-of-simultaneous-equations-in-real-world-context.json';
import s22 from './scripts/igcse--g8--mathematics--ch1-linear-graphs-and-simultaneous-l--equations-of-horizontal-and-vertical-lines.json';
import s23 from './scripts/igcse--g8--mathematics--ch1-linear-graphs-and-simultaneous-l--graphs-of-linear-equations-in-the-form-ax-by-k.json';
import s24 from './scripts/igcse--g8--mathematics--ch1-linear-graphs-and-simultaneous-l--solving-simultaneous-linear-equations-by-elimination.json';
import s25 from './scripts/igcse--g8--mathematics--ch1-linear-graphs-and-simultaneous-l--solving-simultaneous-linear-equations-by-substitution.json';
import s26 from './scripts/igcse--g8--mathematics--ch1-linear-graphs-and-simultaneous-l--solving-simultaneous-linear-equations-graphically.json';
import s27 from './scripts/igcse--g8--mathematics--ch2-linear-inequalities--inequality-notation-and-properties-of-inequalities.json';
import s28 from './scripts/igcse--g8--mathematics--ch2-linear-inequalities--real-world-applications-of-linear-inequalities.json';
import s29 from './scripts/igcse--g8--mathematics--ch2-linear-inequalities--solving-linear-inequalities-and-number-line-representat.json';

import { GENERATED_GUIDED_SCRIPTS } from './generated/index';

export const HAND_WRITTEN_SCRIPTS: GuidedScript[] = [
  s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15, s16, s17, s18, s19, s20, s21, s22, s23, s24, s25, s26, s27, s28, s29,
] as unknown as GuidedScript[];

const generatedIds = new Set(GENERATED_GUIDED_SCRIPTS.map((s) => s.conceptId));

/** Bundled lessons: generated ones, plus hand-written ones for concepts not yet generated. */
const BUNDLED: GuidedScript[] = [
  ...GENERATED_GUIDED_SCRIPTS,
  ...HAND_WRITTEN_SCRIPTS.filter((s) => !generatedIds.has(s.conceptId)),
];

/** Every lesson served. Mutated in place by setRuntimeGuidedScripts so existing imports stay current. */
export const ALL_GUIDED_SCRIPTS: GuidedScript[] = [...BUNDLED];

let BY_CONCEPT = new Map<string, GuidedScript>(ALL_GUIDED_SCRIPTS.map((s) => [s.conceptId, s]));

/** Merge lessons made at upload time over the bundled ones (runtime wins for the same concept). */
export function setRuntimeGuidedScripts(runtime: GuidedScript[]): void {
  const merged = new Map<string, GuidedScript>(BUNDLED.map((s) => [s.conceptId, s]));
  for (const s of runtime) if (s?.conceptId && Array.isArray(s.beats)) merged.set(s.conceptId, s);
  ALL_GUIDED_SCRIPTS.length = 0;
  ALL_GUIDED_SCRIPTS.push(...merged.values());
  BY_CONCEPT = merged;
}

export function getGuidedScript(conceptId?: string | null): GuidedScript | null {
  return (conceptId && BY_CONCEPT.get(conceptId)) || null;
}

export function hasGuidedScript(conceptId?: string | null): boolean {
  return !!getGuidedScript(conceptId);
}
