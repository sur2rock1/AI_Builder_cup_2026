// ─────────────────────────────────────────────────────────────────
// Guided script registry — which concepts have a prepared script.
//
// Scripts are imported (not read from disk at run time) so they are bundled
// into the server build and the Docker image like any other source file.
//   ./scripts    hand-written lessons (listed below)
//   ./generated  lessons written by Gemini (scripts/generate-guided.ts), which
//                passed every check; listed in ./generated/index.ts (auto-written).
// A generated lesson replaces a hand-written one for the same concept.
// The checker (tests/guided/run.mjs) validates every script in both.
//
// Isomorphic: no Node or DOM imports.
// ─────────────────────────────────────────────────────────────────

import type { GuidedScript } from './types';

import g4PlaceValue from './scripts/cambridge-lower-secondary--g4--mathematics--number--reading-writing-and-partitioning-4-digit-numbers.json';
import g4Mass from './scripts/cambridge-lower-secondary--g4--mathematics--measure--measuring-and-comparing-mass-weight.json';
import g8HorizontalVertical from './scripts/igcse--g8--mathematics--ch1-linear-graphs-and-simultaneous-l--equations-of-horizontal-and-vertical-lines.json';
import g8AxByK from './scripts/igcse--g8--mathematics--ch1-linear-graphs-and-simultaneous-l--graphs-of-linear-equations-in-the-form-ax-by-k.json';

import { GENERATED_GUIDED_SCRIPTS } from './generated/index';

export const HAND_WRITTEN_SCRIPTS: GuidedScript[] = [
  g4PlaceValue, g4Mass, g8HorizontalVertical, g8AxByK,
] as unknown as GuidedScript[];

const generatedIds = new Set(GENERATED_GUIDED_SCRIPTS.map((s) => s.conceptId));

/** Every lesson served: generated ones, plus hand-written ones for concepts not yet generated. */
export const ALL_GUIDED_SCRIPTS: GuidedScript[] = [
  ...GENERATED_GUIDED_SCRIPTS,
  ...HAND_WRITTEN_SCRIPTS.filter((s) => !generatedIds.has(s.conceptId)),
];

const BY_CONCEPT = new Map<string, GuidedScript>(ALL_GUIDED_SCRIPTS.map((s) => [s.conceptId, s]));

export function getGuidedScript(conceptId?: string | null): GuidedScript | null {
  return (conceptId && BY_CONCEPT.get(conceptId)) || null;
}

export function hasGuidedScript(conceptId?: string | null): boolean {
  return !!getGuidedScript(conceptId);
}
