// ─────────────────────────────────────────────────────────────────
// Guided mode in the browser — everything App.tsx needs, in one hook, so the
// app itself only gains a few lines.
//
//   • which mode this session asked for (page URL ?tutor=, the on-screen
//     switch, else the server's default)
//   • the prepared lesson for the current concept (fetched when guided)
//   • the shared board, grown by the tutor's advance_beat / fill_slot calls
//
// Nothing here runs in standard mode: no fetch, no state change, and
// handleToolCall returns false so the app handles every call as before.
// ─────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isTutorMode, resolveTutorMode, type TutorMode } from './mode';
import { itemsToStagger } from './board';
import { DEFAULT_PACE, isPace, paceRevealMs, type Pace } from './pace';
import { EMPTY_GUIDED_BOARD, type GuidedBoardState, type GuidedPayload } from './types';

const STORAGE_KEY = 'ananta.tutorMode';
const PACE_KEY = 'ananta.tutorPace';
/** Tool names that belong to guided mode (kept in sync with src/guided/tools.ts). */
const GUIDED_CALL_NAMES = ['advance_beat', 'fill_slot', 'next_line', 'write_aside', 'resume_lesson'];

function readStored(): TutorMode | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('tutor');
    if (isTutorMode(fromUrl)) return fromUrl;
  } catch { /* no window / blocked */ }
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (isTutorMode(stored)) return stored;
  } catch { /* storage unavailable */ }
  return null;
}

const freshBoard = (): GuidedBoardState => ({ ...EMPTY_GUIDED_BOARD, items: [], filled: {} });

export function useGuidedTutor(conceptId?: string | null) {
  /** What this session explicitly asked for; null = use the server default. */
  const [requested, setRequestedState] = useState<TutorMode | null>(() => readStored());
  const [pace, setPaceState] = useState<Pace>(() => {
    try { const v = window.sessionStorage.getItem(PACE_KEY); if (isPace(v)) return v; } catch { /* ignore */ }
    return DEFAULT_PACE;
  });
  const [serverDefault, setServerDefault] = useState<TutorMode>('standard');
  const [guidedConcepts, setGuidedConcepts] = useState<string[]>([]);
  /** What the server says is really running (it falls back to standard if a concept has no lesson). */
  const [running, setRunning] = useState<TutorMode | null>(null);
  const [payload, setPayload] = useState<GuidedPayload | null>(null);
  const [board, setBoard] = useState<GuidedBoardState>(freshBoard);
  const payloadRef = useRef<GuidedPayload | null>(null);
  payloadRef.current = payload;
  // Sync with the voice. The tutor's tool calls arrive when its words are GENERATED, which is ahead of when they are
  // PLAYED. So board changes wait until the audio already received has finished playing, and the items of a beat then
  // appear one at a time while the tutor talks it through.
  const boardRef = useRef<GuidedBoardState>(freshBoard());
  const timers = useRef<number[]>([]);
  const revealTimers = useRef<number[]>([]);
  const lastDue = useRef(0);
  /** Keys of items already on the board but still waiting their turn to appear. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const paceRef = useRef<Pace>(pace);
  paceRef.current = pace;
  const clearTimers = useCallback(() => {
    [...timers.current, ...revealTimers.current].forEach((t) => window.clearTimeout(t));
    timers.current = []; revealTimers.current = []; lastDue.current = 0;
  }, []);
  useEffect(() => clearTimers, [clearTimers]);
  const commit = useCallback((next: GuidedBoardState) => { boardRef.current = next; setBoard(next); }, []);

  // The server's default, and which concepts have a prepared lesson. Failure is silent: standard mode.
  useEffect(() => {
    let alive = true;
    fetch('/api/tutor-mode')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        setServerDefault(resolveTutorMode(undefined, j.default));
        if (Array.isArray(j.guidedConcepts)) setGuidedConcepts(j.guidedConcepts.map(String));
      })
      .catch(() => { /* standard */ });
    return () => { alive = false; };
  }, []);

  const wanted: TutorMode = resolveTutorMode(requested, serverDefault);
  const hasLesson = !!conceptId && guidedConcepts.includes(conceptId);

  // Fetch the prepared lesson only when guided is wanted and the concept has one.
  useEffect(() => {
    clearTimers(); commit(freshBoard()); setHidden(new Set());
    setRunning(null);
    if (wanted !== 'guided' || !conceptId || !hasLesson) { setPayload(null); return; }
    let alive = true;
    fetch(`/api/guided-script?conceptId=${encodeURIComponent(conceptId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setPayload(j && j.script ? (j as GuidedPayload) : null); })
      .catch(() => { if (alive) setPayload(null); });
    return () => { alive = false; };
  }, [wanted, conceptId, hasLesson, clearTimers, commit]);

  const setRequestedMode = useCallback((m: TutorMode) => {
    setRequestedState(m);
    try { window.sessionStorage.setItem(STORAGE_KEY, m); } catch { /* ignore */ }
  }, []);

  const setPace = useCallback((p: Pace) => {
    setPaceState(p);
    try { window.sessionStorage.setItem(PACE_KEY, p); } catch { /* ignore */ }
  }, []);

  /** The server's confirmation, sent when a session starts: a fresh board for a fresh lesson. */
  const onTutorMode = useCallback((m: unknown) => {
    setRunning(isTutorMode(m) ? m : 'standard');
    clearTimers(); commit(freshBoard()); setHidden(new Set());
  }, [clearTimers, commit]);

  /** Run `fn` once the audio already received has finished playing. Calls run in the order they arrived. */
  const afterVoice = useCallback((drainMs: number, fn: () => void) => {
    const due = Math.max(Date.now() + Math.max(0, drainMs), lastDue.current);
    lastDue.current = due;
    const t = window.setTimeout(fn, Math.max(0, due - Date.now()));
    timers.current.push(t);
  }, []);

  /**
   * A board snapshot from the server (it holds the one true board). Shown once the tutor's speech received
   * before it has finished playing; a new beat's block items then appear one by one while the tutor talks.
   * `voiceMsLeft`: how much already-received tutor audio is still to play (AudioManager.msUntilQueuedAudioEnds).
   */
  const onGuidedState = useCallback((state: unknown, voiceMsLeft = 0) => {
    const next = state as GuidedBoardState;
    if (!next || !Array.isArray(next.items)) return;
    afterVoice(voiceMsLeft, () => {
      const prev = boardRef.current;
      const stagger = itemsToStagger(prev, next);
      if (next.beatIndex !== prev.beatIndex) {
        revealTimers.current.forEach((t) => window.clearTimeout(t));
        revealTimers.current = [];
      }
      commit(next);
      setHidden(new Set(stagger));
      const gap = paceRevealMs(paceRef.current);
      stagger.forEach((key, k) => {
        revealTimers.current.push(window.setTimeout(() => setHidden((h) => {
          if (!h.has(key)) return h;
          const n = new Set(h); n.delete(key); return n;
        }), (k + 1) * gap));
      });
    });
  }, [afterVoice, commit]);

  /** Guided tool calls are handled by the server (see onGuidedState); return true so the standard board ignores them. */
  const handleToolCall = useCallback((name: string, _args?: Record<string, any>): boolean => GUIDED_CALL_NAMES.includes(name), []);

  /** Draw the guided board? Guided wanted, a lesson loaded, and the server has not said it fell back to standard. */
  const active = useMemo(() => wanted === 'guided' && !!payload && running !== 'standard', [wanted, payload, running]);

  const shownBoard = useMemo(
    () => (hidden.size ? { ...board, items: board.items.filter((p) => !hidden.has(p.key)) } : board),
    [board, hidden],
  );

  return { pace, setPace, wanted, setRequestedMode, requested, hasLesson, active, payload, board: shownBoard, onTutorMode, onGuidedState, handleToolCall };
}
