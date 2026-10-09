// ─────────────────────────────────────────────────────────────────
// Guided script checks. A script that fails an ERROR is not served.
// WARNINGS are shown to the author but do not block.
//
// These checks look at structure and length, and (when the stored pictures
// are supplied) that every picture and step the script points at really exists.
// They cannot judge whether the explanation is good — that is for a person
// (or a later model reviewer) to read.
//
// Isomorphic: no Node or DOM imports.
// ─────────────────────────────────────────────────────────────────

import { BEAT_KINDS, type GuidedScript, type BoardItem, type BoardLine } from './types';

export interface ScriptIssues { errors: string[]; warnings: string[] }

export const LIMITS = {
  minBeats: 6,
  maxBeats: 12,
  maxItemsPerBeat: 6,
  maxItemsTotal: 30,
  maxLineChars: 90,
  maxHeadingChars: 48,
  maxSayChars: 700,
  maxLinesPerBeat: 14,
  maxLineSayChars: 320,
};

/** Minimal view of a stored picture, enough to check references. */
export interface PictureRef { steps?: Array<{ id: string }> }

function textOf(item: BoardItem): string[] {
  switch (item.type) {
    case 'heading': case 'point': case 'rule': case 'exception': return [item.text];
    case 'compare': return [item.text, item.title ?? ''];
    case 'work': return item.lines;
    case 'slot': return [item.label];
    case 'line': case 'aside': return [item.text];
    default: return [];
  }
}

/** Unsigned numbers in a line ("−1" counts as 1: a minus is usually an operator). */
const numbersIn = (t: string): string[] => (t.match(/\d+(?:\.\d+)?/g) ?? []);

/**
 * Every number USED in a working calculation must already be on the board (written above it).
 * "Used" means a bare number that is an operand of + − × ÷ / ^ (so coefficients like 3x, subscripts
 * like x1, units like dm3, labels like (1) and given equations are not counted), on a line with "=".
 * The result being worked out may be new. Example: "rise = 5 − 1 = 4" needs 5 and 1 above it;
 * "gradient = 4 ÷ 0" needs 4 and 0 above it.
 * Applied to working lines only. A heuristic: it catches "4 appears from nowhere", not every gap.
 */
const OPS = '+-−×÷*/^';
const isSignedResult = (part: string) => /^[−-]?\d+(?:\.\d+)?\s*(?:%|°|[a-zA-Zµ]{1,4}[²³]?)?\.?$/.test(part.trim());

function operandsIn(seg: string): string[] {
  const out: string[] = [];
  const re = /(?<![\w.])(\d+(?:\.\d+)?)(?![\w.]|\.\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) {
    const before = seg.slice(0, m.index).replace(/[\s(]+$/, '');
    const after = seg.slice(m.index + m[0].length).replace(/^[\s)]+/, '');
    // an operator before counts only if it is binary (something stands before it); "-3" alone is a sign
    let opBefore = false;
    if (before && OPS.includes(before[before.length - 1])) {
      const lhs = before.slice(0, -1).trimEnd();
      opBefore = !!lhs && /[\w)%°]$/.test(lhs);
    }
    const opAfter = !!after && OPS.includes(after[0]) && after.slice(1).trim().length > 0;
    if (opBefore || opAfter) out.push(m[1]);
  }
  return out;
}

export function untracedNumbers(line: string, seenBefore: Set<string>): string[] {
  if (!line.includes('=')) return [];
  const parts = line.split('=');
  // "4567 = 4000 + 500 + ...": a line that starts from a number shows its result on the right, so the last part is not checked
  const startsFromNumber = /(?<![\w.])\d/.test(parts[0]);
  const checked = (startsFromNumber ? parts.slice(0, -1) : parts).filter((p) => !isSignedResult(p));
  return checked.flatMap(operandsIn).filter((x) => !seenBefore.has(x));
}

export function validateScript(
  script: GuidedScript,
  opts: { expectedConceptId?: string; pictures?: Record<string, PictureRef | undefined> } = {},
): ScriptIssues {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);
  const warn = (m: string) => warnings.push(m);

  if (!script || script.version !== 1) { err('version must be 1'); return { errors, warnings }; }
  if (!script.conceptId) err('conceptId missing');
  if (opts.expectedConceptId && script.conceptId !== opts.expectedConceptId) err(`conceptId "${script.conceptId}" does not match the file's concept`);
  if (!script.title?.trim()) err('title missing');
  if (!Array.isArray(script.beats)) { err('beats must be a list'); return { errors, warnings }; }

  const n = script.beats.length;
  if (n < LIMITS.minBeats || n > LIMITS.maxBeats) err(`needs ${LIMITS.minBeats}–${LIMITS.maxBeats} beats, has ${n}`);
  if (script.beats[0] && script.beats[0].kind !== 'orient') err('the first beat must be "orient"');
  if (!script.beats.some((b) => b.kind === 'rule' || b.board?.some((i) => i.type === 'rule') || b.lines?.some((l) => l.style === 'rule'))) err('the lesson states no rule (needs a "rule" beat, a rule item or a rule line)');
  if (!script.beats.some((b) => b.ask || b.lines?.some((l) => l.ask))) err('no beat asks the learner anything');

  const beatIds = new Set<string>();
  const slotIds = new Set<string>();
  let total = 0;

  script.beats.forEach((b, i) => {
    const at = `beat ${i + 1} (${b.id})`;
    if (!b.id || beatIds.has(b.id)) err(`${at}: id missing or duplicated`);
    beatIds.add(b.id);
    if (!(BEAT_KINDS as readonly string[]).includes(b.kind)) err(`${at}: unknown kind "${b.kind}"`);
    if (!b.say?.trim()) err(`${at}: "say" is empty`);
    else if (b.say.length > LIMITS.maxSayChars) warn(`${at}: "say" is ${b.say.length} chars (limit ${LIMITS.maxSayChars})`);
    if (!Array.isArray(b.board) || (b.board.length === 0 && !b.lines?.length)) err(`${at}: nothing is written on the board`);
    const items = b.board ?? [];
    total += items.length;
    if (items.length > LIMITS.maxItemsPerBeat) err(`${at}: ${items.length} board items (limit ${LIMITS.maxItemsPerBeat})`);

    const pictures = items.filter((x) => x.type === 'picture');
    if (pictures.length > 1) err(`${at}: more than one picture`);

    let lastSide: string | null = null;
    items.forEach((it, k) => {
      for (const t of textOf(it)) {
        if (it.type === 'heading') { if (t.length > LIMITS.maxHeadingChars) warn(`${at} item ${k + 1}: heading is ${t.length} chars`); }
        else if (t.length > LIMITS.maxLineChars) warn(`${at} item ${k + 1}: line is ${t.length} chars (limit ${LIMITS.maxLineChars})`);
        if (/\b(always|never)\b/i.test(t)) warn(`${at} item ${k + 1}: "${t.slice(0, 40)}…" uses always/never — check it is true without exceptions`);
        if (it.type !== 'slot' && it.type !== 'compare' && !t.trim() && it.type !== 'work') err(`${at} item ${k + 1}: empty text`);
      }
      if (it.type === 'compare') {
        if (lastSide === it.side) warn(`${at} item ${k + 1}: two "${it.side}" compare items in a row`);
        lastSide = it.side;
      } else lastSide = null;
      if (it.type === 'slot') {
        if (!it.id || slotIds.has(it.id)) err(`${at}: slot id missing or duplicated`);
        slotIds.add(it.id);
      }
      if (it.type === 'picture' && opts.pictures) {
        const pic = opts.pictures[it.ref];
        if (!pic) err(`${at}: picture "${it.ref}" does not exist in the stored pictures`);
        else if (it.step && it.step !== 'all' && !(pic.steps ?? []).some((s) => s.id === it.step)) {
          err(`${at}: picture "${it.ref}" has no step "${it.step}"`);
        }
      }
    });

    if (b.lines) checkLines(b.lines, items, at, err, warn);
    for (const l of b.lines ?? []) {
      if (l.picture && opts.pictures) {
        const pic = opts.pictures[l.picture.ref];
        if (!pic) err(`${at} line ${l.id}: picture "${l.picture.ref}" does not exist in the stored pictures`);
        else if (l.picture.step && l.picture.step !== 'all' && !(pic.steps ?? []).some((s) => s.id === l.picture!.step)) err(`${at} line ${l.id}: picture "${l.picture.ref}" has no step "${l.picture.step}"`);
      }
    }
    if (b.lines?.length && b.ask) err(`${at}: a line-by-line beat asks on its lines, not on the beat`);
    total += b.lines?.length ?? 0;
    // The answer must not be on the board when the question is asked.
    if (b.ask && items.some((x) => x.type === 'work')) {
      warn(`${at}: worked lines are written together with the question - the answer may be visible before the learner replies (use a line-by-line beat)`);
    }

    if (b.ask) {
      if (!b.ask.prompt?.trim()) err(`${at}: ask has no prompt`);
      if (!b.ask.lookFor?.trim()) err(`${at}: ask has no lookFor`);
      if (!b.ask.onMiss?.trim()) err(`${at}: ask has no onMiss`);
      if (b.ask.slot) {
        const hasSlot = items.some((x) => x.type === 'slot' && x.id === b.ask!.slot);
        if (!hasSlot) err(`${at}: ask.slot "${b.ask.slot}" is not a slot on this beat's board`);
      }
    }
  });

  if (total > LIMITS.maxItemsTotal) warn(`board has ${total} items in total (limit ${LIMITS.maxItemsTotal}) — it will be crowded`);
  const asks = script.beats.filter((b) => b.ask || b.lines?.some((l) => l.ask)).length;
  if (asks < 3) warn(`only ${asks} beats ask the learner something`);
  return { errors, warnings };
}

function checkLines(lines: BoardLine[], boardItems: BoardItem[], at: string, err: (m: string) => void, warn: (m: string) => void): void {
  if (lines.length === 0) { err(`${at}: "lines" is empty`); return; }
  if (lines.length > LIMITS.maxLinesPerBeat) err(`${at}: ${lines.length} lines (limit ${LIMITS.maxLinesPerBeat})`);
  const ids = new Set<string>();
  const seen = new Set<string>(boardItems.flatMap(textOf).flatMap(numbersIn));
  lines.forEach((l, k) => {
    const where = `${at} line ${k + 1} (${l.id})`;
    if (!l.id || ids.has(l.id)) err(`${where}: id missing or duplicated`);
    ids.add(l.id);
    if (!l.text?.trim()) err(`${where}: empty text`);
    else if (l.text.length > LIMITS.maxLineChars) warn(`${where}: line is ${l.text.length} chars (limit ${LIMITS.maxLineChars})`);
    if (!l.say?.trim()) err(`${where}: "say" is empty - the tutor must say every line it writes`);
    else if (l.say.length > LIMITS.maxLineSayChars) warn(`${where}: "say" is ${l.say.length} chars (limit ${LIMITS.maxLineSayChars})`);
    if (l.ask) {
      if (!l.ask.prompt?.trim() || !l.ask.lookFor?.trim() || !l.ask.onMiss?.trim()) err(`${where}: ask needs prompt, lookFor and onMiss`);
    }
    // Working lines must trace every number; a rule (formula) or a statement may introduce values.
    const missing = (l.style ?? 'work') === 'work' ? untracedNumbers(l.text ?? '', seen) : [];
    if (missing.length) err(`${where}: "${l.text}" uses ${missing.join(', ')} which is not written on any line above it - a step is missing`);
    numbersIn(l.text ?? '').forEach((x) => seen.add(x));
  });
}
