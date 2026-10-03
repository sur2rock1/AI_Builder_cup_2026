// ─────────────────────────────────────────────────────────────────
// Keeping the voice and the board in step.
//
// The voice tutor used to be told nothing about what was on the board:
// every board tool was acknowledged with {result: 'ok'}, and reveal_part
// only understood the Pythagoras triangle's part names. So outside that
// one topic, "the board follows your voice" (docs/TUTOR_PERSONA.md §7,
// VOICE_BOARD_BLOCK) could not happen.
//
// This module:
//   • writes the BOARD PICTURES block for the voice system prompt — each
//     prepared picture, its steps in order, and when to use it;
//   • summarises a picture for an update_diagram tool response, so the
//     tutor learns the step names of a picture drawn mid-lesson;
//   • matches what the tutor says in reveal_part / highlight_concept
//     ("the vertical line", "step 2", "points on x = 2") to a step or
//     to specific bricks;
//   • finds a prepared picture for an update_diagram focus
//     ("contrast: horizontal-line-named-x", "apply", free text).
// Isomorphic — used by server.ts and by the browser (App.tsx).
// ─────────────────────────────────────────────────────────────────
import { AnyBoardVisual, VISUAL_KEYS } from './types';

const STOP = new Set([
  'the', 'a', 'an', 'of', 'on', 'this', 'that', 'these', 'those', 'and', 'to', 'is', 'are', 'in',
  'at', 'for', 'with', 'show', 'shows', 'reveal', 'part', 'parts', 'now', 'here', 'our', 'we',
  'lets', "let's", 'look', 'see', 'it', 'its', 'which', 'where', 'what', 'how', 'picture', 'board',
]);

/** "Vertical lines x = 2" → ["vertical", "line", "x=2"] (lower-cased, light plural stemming). */
export function tokens(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[−–]/g, '-')
    .replace(/\s*=\s*/g, '=')
    // "point A", "vertex B", "side c" are names: keep the letter attached so the
    // single letter survives the stop-word filter ("a") and stays specific.
    .replace(/\b(point|vertex|corner|side|angle|segment|triangle)\s+([a-z])\b(?!\s*=)/g, '$1-$2')
    .replace(/[^a-z0-9=.+\-/^ ]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ''))
    .map((t) => (t.length > 3 && /^[a-z]+s$/.test(t) && !/ss$/.test(t) ? t.slice(0, -1) : t))
    .filter((t) => t && !STOP.has(t));
}

/** Token weights: a word that appears in many candidates ("line") says less than a rare one ("meet"). */
export type Weigher = (token: string) => number;
const uniform: Weigher = () => 1;

export function rarityWeigher(candidates: Array<string | undefined>): Weigher {
  const df = new Map<string, number>();
  for (const c of candidates) for (const t of new Set(tokens(c))) df.set(t, (df.get(t) ?? 0) + 1);
  return (t) => 1 / Math.max(1, df.get(t) ?? 1);
}

/**
 * How well a spoken phrase names a candidate (0..1): the larger of
 * "how much of the phrase is in the candidate" and "how much of the
 * candidate is in the phrase", both rarity-weighted, plus a bonus for an
 * exact phrase. Symmetric so "where the two lines meet" still finds a step
 * called "where they meet".
 */
export function matchScore(query: string, candidate: string | undefined, weigh: Weigher = uniform): number {
  const q = [...new Set(tokens(query))];
  const c = [...new Set(tokens(candidate))];
  if (!q.length || !c.length) return 0;
  const cs = new Set(c);
  const sum = (ts: string[]) => ts.reduce((a, t) => a + weigh(t), 0);
  const hitWeight = sum(q.filter((t) => cs.has(t)));
  if (!hitWeight) return 0;
  let score = Math.max(hitWeight / sum(q), hitWeight / sum(c));
  const qp = tokens(query).join(' '), cp = tokens(candidate).join(' ');
  if (qp && (cp === qp || cp.includes(qp))) score = Math.min(1, score + 0.25);
  return Math.min(1, score);
}

export interface RevealTarget {
  /** Which visual (e.g. 'main' or '3d'). */
  key: string;
  /** Step to move to, when the phrase names a step. */
  stepIndex: number | null;
  /** Bricks the phrase names directly (spotlight them). */
  elementIds: string[];
  score: number;
}

/**
 * Map one phrase the tutor used ("the vertical line", "step 3", "point B")
 * onto the best step or bricks across the pictures on screen.
 */
export function matchRevealTarget(
  visuals: Array<{ key: string; visual: AnyBoardVisual | null | undefined }>,
  phrase: string,
  threshold = 0.5,
): RevealTarget | null {
  const p = String(phrase || '').trim();
  if (!p) return null;

  // "step 2" / "2" — explicit step numbers.
  const stepNo = /^(?:step\s*)?(\d{1,2})$/i.exec(p);
  if (stepNo) {
    const first = visuals.find((v) => v.visual);
    const idx = Number(stepNo[1]) - 1;
    if (first?.visual && idx >= 0 && idx < first.visual.steps.length) {
      return { key: first.key, stepIndex: idx, elementIds: [], score: 1 };
    }
  }

  // What each brick can be called: its name, label and text, plus "<kind> <label>"
  // so a point labelled "E(4, 1)" answers to "point E".
  type Named = { id: string; kind: string; name?: string; label?: string; text?: string };
  const brickNames = (e: Named) => [e.name, e.label, e.text, e.label ? `${e.kind} ${e.label}` : undefined];

  // Rarity is measured over everything the tutor could be naming on these pictures.
  const weigh = rarityWeigher(visuals.flatMap(({ visual }) => (visual ? [
    ...visual.steps.flatMap((s) => [s.name, s.caption]),
    ...(visual.elements as Named[]).flatMap(brickNames),
  ] : [])));

  let best: RevealTarget | null = null;
  for (const { key, visual } of visuals) {
    if (!visual) continue;
    for (const [i, s] of visual.steps.entries()) {
      const score = Math.max(matchScore(p, s.name, weigh), matchScore(p, s.id, weigh) * 0.9, matchScore(p, s.caption, weigh) * 0.8);
      if (score >= threshold && (!best || score > best.score)) best = { key, stepIndex: i, elementIds: [], score };
    }
    for (const el of visual.elements as Named[]) {
      const score = Math.max(...brickNames(el).map((n) => matchScore(p, n, weigh)), matchScore(p, el.id, weigh) * 0.8);
      if (score < threshold) continue;
      if (!best || score > best.score) {
        best = { key, stepIndex: null, elementIds: [el.id], score };
      } else if (best.key === key && best.stepIndex === null && Math.abs(score - best.score) < 1e-9) {
        best.elementIds.push(el.id);
      }
    }
  }
  if (best && (best as RevealTarget).stepIndex === null) {
    // Bricks named directly: move to the first step that shows them.
    const b = best as RevealTarget;
    const v = visuals.find((x) => x.key === b.key)?.visual;
    if (v) {
      const idx = v.steps.findIndex((s) => s.show.some((id) => b.elementIds.includes(id)));
      if (idx >= 0) b.stepIndex = idx;
    }
  }
  return best;
}

/** Find a prepared picture for an update_diagram focus. */
export function findVisualForFocus(
  visuals: Record<string, AnyBoardVisual> | undefined | null,
  focus: string,
  slug: (s: string) => string,
  threshold = 0.55,
): { key: string; visual: AnyBoardVisual } | null {
  if (!visuals) return null;
  const f = String(focus || '').trim();
  if (!f) return visuals[VISUAL_KEYS.main] ? { key: VISUAL_KEYS.main, visual: visuals[VISUAL_KEYS.main] } : null;
  const lower = f.toLowerCase();

  // Exact keys: "apply", "main", "3d", "contrast:<id>", or "contrast: <id>".
  const compact = lower.replace(/\s*:\s*/, ':').replace(/\s+/g, '-');
  for (const key of [lower, compact, VISUAL_KEYS.focus(slug(f))]) {
    if (visuals[key]) return { key, visual: visuals[key] };
  }
  if (/^contrast\b/.test(lower)) {
    const id = slug(lower.replace(/^contrast\s*:?\s*/, ''));
    if (visuals[VISUAL_KEYS.contrast(id)]) return { key: VISUAL_KEYS.contrast(id), visual: visuals[VISUAL_KEYS.contrast(id)] };
  }

  // Fuzzy: against each picture's focus, title, misconception and why.
  const entries = Object.entries(visuals).filter(([key]) => key !== VISUAL_KEYS.space); // 3D is chosen with switch_board_view
  const weigh = rarityWeigher(entries.flatMap(([key, v]) => [v.focus, v.title, v.misconceptionId?.replace(/-/g, ' '), key.replace(/[:-]/g, ' ')]));
  let best: { key: string; visual: AnyBoardVisual; score: number } | null = null;
  for (const [key, visual] of entries) {
    const score = Math.max(
      matchScore(f, visual.focus, weigh),
      matchScore(f, visual.title, weigh),
      matchScore(f, visual.misconceptionId?.replace(/-/g, ' '), weigh),
      matchScore(f, key.replace(/[:-]/g, ' '), weigh),
      matchScore(f, visual.why, weigh) * 0.7,
    );
    if (score >= threshold && (!best || score > best.score)) best = { key, visual, score };
  }
  return best ? { key: best.key, visual: best.visual } : null;
}

/** The step list as the tutor should hear it. */
function stepLines(v: AnyBoardVisual, indent: string): string[] {
  return v.steps.map((s, i) => `${indent}${i + 1}. "${s.name}" — ${s.caption}`);
}

/** Short summary for an update_diagram tool response. */
export function toolSummary(v: AnyBoardVisual) {
  return {
    title: v.title,
    steps: v.steps.map((s) => s.name),
    instruction:
      `The board now shows "${v.title}". Build it up as you explain: at the moment you start each part, ` +
      `call reveal_part with that step's name — in order: ${v.steps.map((s, i) => `${i + 1} "${s.name}"`).join(', ')}.` +
      (v.checkQuestion ? ` When it is complete you can ask: "${v.checkQuestion}"` : ''),
  };
}

export interface BoardContextInput {
  visuals: Record<string, AnyBoardVisual>;
  /** Misconception beliefs by id, so contrast pictures can be described by what they are for. */
  misconceptions?: Array<{ id?: string; belief: string }>;
}

/** The BOARD PICTURES block for the voice system prompt. Empty string when there is nothing prepared. */
export function boardContextBlock({ visuals, misconceptions = [] }: BoardContextInput): string {
  const main = visuals[VISUAL_KEYS.main];
  if (!main) return '';
  const lines: string[] = [];
  lines.push('THE BOARD PICTURES FOR THIS CONCEPT (already drawn and fact-checked — the learner sees them in the Shape view)');
  lines.push(`MAIN PICTURE: "${main.title}" (${main.representation.replace(/_/g, ' ')})${main.why ? ' — ' + main.why : ''}`);
  lines.push('It starts almost empty. Build it up in this order: at the moment you START explaining a step,');
  lines.push('call reveal_part({parts:["<step name>"]}) — one call per step, between spoken chunks, never mid-sentence:');
  lines.push(...stepLines(main, '   '));
  if (main.checkQuestion) lines.push(`   When it is complete, a good question pointing at it: "${main.checkQuestion}"`);
  lines.push('You may go back to an earlier step (reveal_part with its name) if the learner needs it again.');

  const contrasts = Object.entries(visuals).filter(([k]) => k.startsWith('contrast:'));
  if (contrasts.length) {
    lines.push('');
    lines.push('CONTRAST PICTURES — prepared for the known misconceptions. Show one only when the diagnosis');
    lines.push('suspects or confirms that misconception (it is your SWITCH_REPRESENTATION / CONTRAST_CASE move):');
    for (const [key, v] of contrasts) {
      const id = key.slice('contrast:'.length);
      const belief = misconceptions.find((m) => m.id === id)?.belief;
      lines.push(`  • update_diagram({focus: "${key}"}) — "${v.title}"${belief ? ` — for the belief: ${belief}` : ''}`);
      lines.push(`      steps: ${v.steps.map((s) => `"${s.name}"`).join(' → ')}`);
    }
  }

  const apply = visuals[VISUAL_KEYS.apply];
  if (apply) {
    lines.push('');
    lines.push(`APPLICATION PICTURE — when you move to APPLY: update_diagram({focus: "apply"}) — "${apply.title}".`);
    lines.push(`   It shows the situation only, never the answer. Steps: ${apply.steps.map((s) => `"${s.name}"`).join(' → ')}`);
  }

  const space = visuals[VISUAL_KEYS.space];
  lines.push('');
  lines.push(space
    ? `3D VIEW: "${space.title}" — switch_board_view({tab:"3d"}) only when depth genuinely helps. Its steps: ${space.steps.map((s) => `"${s.name}"`).join(' → ')}`
    : '3D VIEW: none for this concept (the idea is flat). Do not switch to 3D.');
  lines.push('For any other idea you want to draw, call update_diagram({focus: "<what you are explaining>"});');
  lines.push('the tool response tells you the new picture\'s step names.');
  return lines.join('\n');
}
