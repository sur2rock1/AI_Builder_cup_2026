// ─────────────────────────────────────────────────────────────────
// Guided mode — chalk marks inside a board line.
//
// A real teacher underlines, circles and colours as they talk. A board line can carry
// those marks inline:
//
//     {{text|style}}            e.g.  {{2|ul}}3
//     {{text|style|label}}      e.g.  {{2|ul|tens}}{{3|ul|ones}}   (label is written under the mark)
//     {{text|style.colour}}     colours: y yellow (default) · p pink · b blue · g green
//
// Styles: ul (underline) · circle · box · hl (highlighter).
// The words on the board are the text with the marks removed (stripMarks): validation, number
// tracing and what the tutor is told is written all use that plain text.
//
// Isomorphic: no Node or DOM imports.
// ─────────────────────────────────────────────────────────────────

export const MARK_STYLES = ['ul', 'circle', 'box', 'hl'] as const;
export type MarkStyle = (typeof MARK_STYLES)[number];
export const MARK_COLOURS = ['y', 'p', 'b', 'g'] as const;
export type MarkColour = (typeof MARK_COLOURS)[number];

export type MarkSegment =
  | { kind: 'text'; text: string }
  | { kind: 'mark'; text: string; style: MarkStyle; colour: MarkColour; label?: string };

const MARK_RE = /\{\{([^{}|]*)\|([a-z]+)(?:\.([a-z]))?(?:\|([^{}]*))?\}\}/g;

export function parseMarks(raw: string): MarkSegment[] {
  const s = String(raw ?? '');
  const out: MarkSegment[] = [];
  let last = 0;
  for (const m of s.matchAll(MARK_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: 'text', text: s.slice(last, idx) });
    const style = (MARK_STYLES as readonly string[]).includes(m[2]) ? (m[2] as MarkStyle) : null;
    if (style) {
      const colour = (MARK_COLOURS as readonly string[]).includes(m[3] ?? '') ? (m[3] as MarkColour) : 'y';
      out.push({ kind: 'mark', text: m[1], style, colour, ...(m[4]?.trim() ? { label: m[4].trim() } : {}) });
    } else {
      out.push({ kind: 'text', text: m[1] }); // unknown style: keep the words, drop the mark
    }
    last = idx + m[0].length;
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) });
  return out;
}

/** The words as written on the board, with no mark syntax. */
export function stripMarks(raw: string): string {
  return parseMarks(raw).map((seg) => seg.text).join('');
}

/** Problems with mark syntax in one line of text (empty when fine). */
export function markProblems(raw: string): string[] {
  const s = String(raw ?? '');
  const problems: string[] = [];
  const open = (s.match(/\{\{/g) ?? []).length;
  const close = (s.match(/\}\}/g) ?? []).length;
  if (open !== close) problems.push('unbalanced {{ }}');
  for (const m of s.matchAll(MARK_RE)) {
    if (!(MARK_STYLES as readonly string[]).includes(m[2])) problems.push(`unknown mark style "${m[2]}"`);
    if (m[3] && !(MARK_COLOURS as readonly string[]).includes(m[3])) problems.push(`unknown mark colour "${m[3]}"`);
    if (!m[1].trim()) problems.push('a mark with no text');
  }
  const leftover = s.replace(MARK_RE, '');
  if (/\{\{|\}\}/.test(leftover)) problems.push('malformed mark (expected {{text|style}} or {{text|style|label}})');
  return problems;
}

const STYLE_WORDS: Record<MarkStyle, string> = { ul: 'underlined', circle: 'circled', box: 'boxed', hl: 'highlighted' };
const COLOUR_WORDS: Record<MarkColour, string> = { y: 'yellow', p: 'pink', b: 'blue', g: 'green' };

/** For the tutor: what is being marked, so it can say it ("I'm underlining the 3"). Empty when no marks. */
export function describeMarks(raw: string): string {
  const marks = parseMarks(raw).filter((s): s is Extract<MarkSegment, { kind: 'mark' }> => s.kind === 'mark');
  return marks
    .map((m) => `"${m.text}" ${STYLE_WORDS[m.style]} in ${COLOUR_WORDS[m.colour]}${m.label ? `, labelled "${m.label}"` : ''}`)
    .join('; ');
}
