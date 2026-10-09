// The per-session switch between the standard tutor and the guided tutor.
// Shown only for a concept that has a guided lesson. A change applies to the
// NEXT session (the mode is chosen when the voice connection opens).

import React from 'react';
import type { TutorMode } from './mode';
import { PACES, type Pace } from './pace';

interface Props {
  value: TutorMode;
  onChange: (m: TutorMode) => void;
  /** True while a voice session is open: the change waits for the next one. */
  locked: boolean;
  /** Pace (guided only). Omit both to hide the pace control. */
  pace?: Pace;
  onPaceChange?: (p: Pace) => void;
}

export const TutorModeSwitch: React.FC<Props> = ({ value, onChange, locked, pace, onPaceChange }) => {
  const btn = (m: TutorMode, label: string) => (
    <button
      type="button"
      aria-pressed={value === m}
      onClick={() => onChange(m)}
      className={`px-3 py-1 text-[12px] font-medium rounded-full transition ${
        value === m ? 'bg-white text-[#0C0F16]' : 'text-white/70 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
  const paceBtn = (p: Pace) => (
    <button
      key={p}
      type="button"
      aria-pressed={pace === p}
      onClick={() => onPaceChange?.(p)}
      className={`px-2.5 py-1 text-[12px] font-medium rounded-full transition capitalize ${
        pace === p ? 'bg-white text-[#0C0F16]' : 'text-white/70 hover:text-white'
      }`}
    >
      {p}
    </button>
  );
  const pill = 'flex items-center gap-1 rounded-full bg-white/[0.07] border border-white/15 p-0.5';
  const tag = 'pl-2 pr-1 text-[10px] uppercase tracking-[0.14em] text-white/45';
  return (
    <div className="flex items-center gap-2">
      <div className={pill} title={locked ? 'Applies to your next session' : 'Choose how the tutor teaches this lesson'}>
        <span className={tag}>Tutor</span>
        {btn('standard', 'Standard')}
        {btn('guided', 'Guided')}
        {locked && <span className="pr-2 pl-1 text-[10px] text-white/45">next session</span>}
      </div>
      {value === 'guided' && pace && onPaceChange && (
        <div className={pill} title="How fast the tutor goes. Changes apply from the next step of the lesson.">
          <span className={tag}>Pace</span>
          {PACES.map(paceBtn)}
        </div>
      )}
    </div>
  );
};
