// Development-only preview of the guided board: step through a lesson's beats
// without a voice session. Open /guided-preview.html on the dev server.
// Not part of the production build (vite builds index.html only).

import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { GuidedBoard } from './GuidedBoard';
import { startBeat, fillSlot, nextLine, addAside, linesRemaining } from './board';
import { EMPTY_GUIDED_BOARD, type GuidedBoardState, type GuidedPayload } from './types';
import { ALL_GUIDED_SCRIPTS } from './registry';

const fresh = (): GuidedBoardState => ({ ...EMPTY_GUIDED_BOARD, items: [], filled: {} });

const Preview: React.FC = () => {
  const [conceptId, setConceptId] = useState(ALL_GUIDED_SCRIPTS[0].conceptId);
  const [payload, setPayload] = useState<GuidedPayload | null>(null);
  const [board, setBoard] = useState<GuidedBoardState>(fresh);
  const [err, setErr] = useState('');

  useEffect(() => {
    setPayload(null); setBoard(fresh()); setErr('');
    // The dev server's endpoint first; a static copy (payloads/<concept>.json) when there is no server.
    fetch(`/api/guided-script?conceptId=${encodeURIComponent(conceptId)}`)
      .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .catch(() => fetch(`payloads/${encodeURIComponent(conceptId)}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))))
      .then(setPayload)
      .catch((e) => setErr(String(e.message || e)));
  }, [conceptId]);

  const [said, setSaid] = useState('');
  // Mirrors the server: a line-by-line beat writes one line per step (asking first where the answer is held back).
  const next = () => {
    if (!payload) return;
    if (linesRemaining(board, payload.script) > 0) {
      const r = nextLine(board, payload.script);
      setBoard(r.state);
      setSaid(r.action === 'ask' ? `ASKS: ${r.line.ask!.prompt}` : r.action === 'write' ? `SAYS: ${r.line.say}` : '');
      return;
    }
    setBoard((b) => startBeat(b, payload.script));
    setSaid('');
  };
  const aside = () => {
    setBoard((b) => addAside(addAside(b, 'gradient = rise ÷ run', 'why do we divide?'), 'it tells us how much UP for each 1 ACROSS'));
    setSaid('SIDE QUESTION answered on the board, then resume_lesson');
  };
  const fillThisBeat = () => {
    if (!payload || board.beatIndex < 0) return;
    const beat = payload.script.beats[board.beatIndex];
    if (beat.ask?.slot) setBoard((b) => fillSlot(b, beat.ask!.slot!, 'sample answer'));
  };
  const reset = () => { setBoard(fresh()); setSaid(''); };
  const beat = payload && board.beatIndex >= 0 ? payload.script.beats[board.beatIndex] : null;
  const total = payload?.script.beats.length ?? 0;
  const visualKeys = useMemo(() => Object.keys(payload?.visuals ?? {}).length, [payload]);

  const btn = 'px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm';
  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui', padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={conceptId} onChange={(e) => setConceptId(e.target.value)} className="bg-white/10 rounded-lg px-2 py-1.5 text-sm">
          {ALL_GUIDED_SCRIPTS.map((s) => <option key={s.conceptId} value={s.conceptId} style={{ color: '#000' }}>{s.title}</option>)}
        </select>
        <button id="next" className={btn} onClick={next}>Next ▶</button>
        <button id="aside" className={btn} onClick={aside}>Side question</button>
        <button id="fill" className={btn} onClick={fillThisBeat}>Fill this beat's blank</button>
        <button id="reset" className={btn} onClick={reset}>Reset</button>
        <span style={{ opacity: 0.7, fontSize: 13 }}>
          {beat ? `beat ${board.beatIndex + 1}/${total} · ${beat.kind} · ${beat.id}` : `not started · ${total} beats · ${visualKeys} pictures loaded`}
          {err && <b style={{ color: '#f88' }}> {err}</b>}
        </span>
      </div>
      <div style={{ position: 'relative', width: 1100, aspectRatio: '16 / 10', borderRadius: 16, overflow: 'hidden' }}>
        {payload && <GuidedBoard payload={payload} board={board} conceptLabel={payload.script.title} />}
      </div>
      {said && <p id="said" style={{ maxWidth: 1100, opacity: 0.9, fontSize: 14 }}>{said}</p>}
      {beat?.ask && <p style={{ maxWidth: 1100, opacity: 0.8, fontSize: 14 }}><b>Tutor asks:</b> {beat.ask.prompt}</p>}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Preview />);
