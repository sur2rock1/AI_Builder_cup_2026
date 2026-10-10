// ─────────────────────────────────────────────────────────────────
// The tutor's name is chosen by the child (docs/TUTOR_PERSONA.md §2).
// Shared by the server (validation, prompt) and the browser (screen,
// labels). No Node or React imports here.
//
// The name is typed by a child and ends up inside the voice tutor's
// system prompt, so it is treated as DATA: it is cleaned to a short
// plain name (letters, digits, spaces, . ' -), never trusted as text.
// ─────────────────────────────────────────────────────────────────

/** What the tutor is called until the child picks another name. */
export const DEFAULT_TUTOR_NAME = 'Ananta';
export const MAX_TUTOR_NAME_LENGTH = 24;

/** A short list of words we will not accept as a name (kept small; the shape rule below is the real guard). */
const BLOCKED = /\b(fuck|shit|bitch|cunt|dick|nazi|rape|porn|sex|kill|hitler)\w*/i;

/**
 * Cleans a typed name. Returns '' when nothing usable is left (caller falls back to the default).
 * Keeps letters (any language), digits, spaces, dot, apostrophe and hyphen; drops everything else
 * (quotes, brackets, newlines, symbols), collapses spaces and cuts to MAX_TUTOR_NAME_LENGTH.
 */
export function sanitiseTutorName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}\p{N} .'\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TUTOR_NAME_LENGTH)
    .trim();
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return '';
  if (BLOCKED.test(cleaned)) return '';
  return cleaned;
}

/** The name to show and speak: the child's choice, else the default. */
export function tutorNameOrDefault(raw: unknown): string {
  return sanitiseTutorName(raw) || DEFAULT_TUTOR_NAME;
}
