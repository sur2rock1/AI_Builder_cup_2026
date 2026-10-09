import React, { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { authFetch } from '../firebase/auth';
import { DEFAULT_TUTOR_NAME, MAX_TUTOR_NAME_LENGTH, sanitiseTutorName } from '../persona/tutorName';

interface Props {
  studentName: string;
  /** The name saved at the last login, if any. */
  savedName?: string;
  studentId: string;
  onDone: (tutorName: string) => void;
}

/**
 * Shown after every login: "What would you like to call your tutor?"
 * Pre-filled with the name chosen last time (or the default), so keeping it is one tap.
 */
export const TutorNameScreen: React.FC<Props> = ({ studentName, savedName, studentId, onDone }) => {
  const current = sanitiseTutorName(savedName) || DEFAULT_TUTOR_NAME;
  const [text, setText] = useState(current);
  const [saving, setSaving] = useState(false);
  const chosen = sanitiseTutorName(text);

  const submit = async (name: string) => {
    setSaving(true);
    try {
      const res = await authFetch(`/api/learners/${studentId}/tutor-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const j = await res.json().catch(() => ({}));
      onDone(sanitiseTutorName(j?.tutorName) || name);
    } catch {
      onDone(name); // not saved this time, still used for this session
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-app bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md text-center">
        <div className="w-14 h-14 mx-auto bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-900/50 mb-3">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Hi {studentName}!</h1>
        <p className="text-slate-300 text-sm mt-2">What would you like to call your tutor?</p>
        <p className="text-slate-500 text-xs mt-1">Keep the name, or type a new one. You can change it every time you log in.</p>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mt-6">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_TUTOR_NAME_LENGTH}
            autoFocus
            aria-label="Tutor name"
            onKeyDown={(e) => { if (e.key === 'Enter' && !saving) submit(chosen || DEFAULT_TUTOR_NAME); }}
            className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-white text-center text-lg outline-none focus:border-indigo-400"
            placeholder={DEFAULT_TUTOR_NAME}
          />
          <button
            disabled={saving}
            onClick={() => submit(chosen || DEFAULT_TUTOR_NAME)}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl py-3"
          >
            {chosen && chosen === current ? `Keep "${current}"` : `Call my tutor ${chosen || DEFAULT_TUTOR_NAME}`}
            <ArrowRight className="w-4 h-4" />
          </button>
          {current !== DEFAULT_TUTOR_NAME && (
            <button disabled={saving} onClick={() => setText(DEFAULT_TUTOR_NAME)} className="mt-3 text-xs text-slate-400 hover:text-slate-200">
              Go back to {DEFAULT_TUTOR_NAME}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
