// Ingest-time "design" rules shared by the full ingest review and the backfill for existing curricula,
// so both ask the model exactly the same thing. Nothing here names a subject or a concept.
export const HINT_RULE = `three graded hints for L3 items — "just tell me the answer" is answered with these: (1) a nudge that names what to look at, (2) a bigger hint that names the method, (3) ONE worked step of a PARALLEL problem with different numbers. None may contain this item's answer. Omit "hints" for L1, L2 and L4.`;

export const PRESENTATION_RULE = `presentation — decide, for THIS concept only, from what it is (never from its subject name):
   "photo": {"useful": true|false, "scene": "one concrete real-world scene in which a key fact is visibly true, no text in it", "why": "..."} — useful ONLY when the idea is about things a child can see in the world; false for abstract, symbolic or procedural ideas.
   "spatial3d": {"useful": true|false, "why": "..."} — useful ONLY when the idea is intrinsically a solid/layered/spatial arrangement that a flat picture would flatten; false for graphs, equations, processes, classification, cycles and comparisons. When in doubt, false.`;

/** A hint leaks when it repeats a long verbatim run of the item's answer key. */
export function leaksAnswer(hint: string, lookFor: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s.]/g, ' ').replace(/\s+/g, ' ').trim();
  const h = norm(hint), words = norm(lookFor).split(' ').filter(Boolean);
  for (let i = 0; i + 6 <= words.length; i++) if (h.includes(words.slice(i, i + 6).join(' '))) return true;
  return false;
}
