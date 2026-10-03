import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, Check } from 'lucide-react';
import { authFetch } from '../firebase/auth';
import { ageBandFromGrade } from '../persona/ageBands';
import type { StudentProfile } from './LoginScreen';

type Feeling = 'love' | 'ok' | 'worried' | 'skip';

interface CurriculumOption {
  subjectId: string;
  label: string;
}

interface OnboardingProps {
  student: StudentProfile;
  onDone: () => void;
}

const INTEREST_OPTIONS = [
  { id: 'sports', label: 'Sports', emoji: '⚽' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮' },
  { id: 'art', label: 'Art', emoji: '🎨' },
  { id: 'music', label: 'Music', emoji: '🎵' },
  { id: 'animals', label: 'Animals', emoji: '🐾' },
  { id: 'space', label: 'Space', emoji: '🚀' },
  { id: 'cooking', label: 'Cooking', emoji: '🍳' },
];

const FEELING_OPTIONS: Array<{ id: Feeling; label: string; emoji: string }> = [
  { id: 'love', label: 'Love it', emoji: '😄' },
  { id: 'ok', label: "It's ok", emoji: '🙂' },
  { id: 'worried', label: 'A bit worried', emoji: '😟' },
  { id: 'skip', label: 'Skip', emoji: '⏭️' },
];

const LANGUAGE_OPTIONS = ['English', 'Mandarin', 'Malay', 'Tamil', 'Other'];

/**
 * Short, skippable, ≤6-tap onboarding shown once for a new learner right
 * after profile creation (BUILD_PLAN.md T13). Age band is derived from the
 * grade already collected at signup (ageBandFromGrade) — never asked here.
 */
export const Onboarding: React.FC<OnboardingProps> = ({ student, onDone }) => {
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<CurriculumOption[]>([]);
  const [subjectFeelings, setSubjectFeelings] = useState<Record<string, Feeling>>({});
  const [audioFirst, setAudioFirst] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [primaryLanguage, setPrimaryLanguage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Only the courses for this learner's own board + grade (docs/CURRICULUM.md §6).
    const q = new URLSearchParams();
    if (student.board) q.set('board', student.board);
    q.set('grade', String(student.gradeLevel ?? student.grade));
    fetch(`/api/curricula?${q.toString()}`)
      .then(r => r.json())
      .then(j => setSubjects((j.curricula || []).map((c: any) => ({ subjectId: c.subjectId, label: c.label }))))
      .catch(() => setSubjects([]));
  }, []);

  const toggleInterest = (id: string) => {
    setInterests(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const finish = async () => {
    setSaving(true);
    const ageBand = ageBandFromGrade(student.gradeLevel ?? student.grade);
    try {
      await authFetch(`/api/learners/${student.studentId}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interests,
          subjectFeelings,
          accessibility: { audioFirst, largeText, captions },
          languagePrefs: primaryLanguage ? { primary: primaryLanguage } : undefined,
          ageBand,
        }),
      });
    } catch (e) {
      // Best-effort — never block the learner from getting to the lesson.
      console.warn('[Onboarding] could not save onboarding', e);
    } finally {
      setSaving(false);
      onDone();
    }
  };

  const STEPS = ['interests', 'feelings', 'access', 'language'] as const;
  const total = STEPS.length;
  const current = STEPS[step];

  const next = () => {
    if (step < total - 1) setStep(step + 1);
    else finish();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center px-4 py-8">
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-900/50 mb-3">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Hi {student.name}!</h1>
          <p className="text-slate-400 text-sm mt-1">A few quick questions so Dr. Marcus can teach you better. Skip anything you like.</p>
        </div>

        {/* progress dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-8 bg-indigo-400' : i < step ? 'w-4 bg-indigo-600' : 'w-4 bg-white/10'}`} />
          ))}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 min-h-[260px]">
          {current === 'interests' && (
            <>
              <h3 className="text-white font-semibold mb-1">What do you like?</h3>
              <p className="text-slate-400 text-xs mb-4">We'll use these to make examples more fun.</p>
              <div className="grid grid-cols-2 gap-2">
                {INTEREST_OPTIONS.map(opt => {
                  const selected = interests.includes(opt.id);
                  return (
                    <button key={opt.id} onClick={() => toggleInterest(opt.id)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all border ${
                        selected
                          ? 'bg-indigo-600/30 border-indigo-500 text-white'
                          : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-indigo-500/50'
                      }`}>
                      <span>{opt.emoji}</span> {opt.label}
                      {selected && <Check className="w-3.5 h-3.5 ml-auto text-indigo-300" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {current === 'feelings' && (
            <>
              <h3 className="text-white font-semibold mb-1">How do you feel about your subjects?</h3>
              <p className="text-slate-400 text-xs mb-4">There's no wrong answer here.</p>
              <div className="space-y-3">
                {subjects.length === 0 && (
                  <p className="text-slate-500 text-sm">No subjects are loaded for your board and grade yet — you can skip this step.</p>
                )}
                {subjects.map(sub => (
                  <div key={sub.subjectId}>
                    <p className="text-slate-300 text-sm font-medium mb-1.5">{sub.label}</p>
                    <div className="flex gap-1.5">
                      {FEELING_OPTIONS.map(f => (
                        <button key={f.id}
                          onClick={() => setSubjectFeelings(prev => ({ ...prev, [sub.subjectId]: f.id }))}
                          className={`flex-1 flex flex-col items-center gap-0.5 rounded-lg py-2 text-[11px] font-medium border transition-all ${
                            subjectFeelings[sub.subjectId] === f.id
                              ? 'bg-indigo-600/30 border-indigo-500 text-white'
                              : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-indigo-500/50'
                          }`}>
                          <span className="text-base">{f.emoji}</span> {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {current === 'access' && (
            <>
              <h3 className="text-white font-semibold mb-1">Anything that helps you learn?</h3>
              <p className="text-slate-400 text-xs mb-4">Turn any of these on — you can change them later.</p>
              <div className="space-y-2.5">
                {[
                  { key: 'audioFirst', label: 'Read things out loud', value: audioFirst, set: setAudioFirst },
                  { key: 'largeText', label: 'Bigger text', value: largeText, set: setLargeText },
                  { key: 'captions', label: 'Captions for audio', value: captions, set: setCaptions },
                ].map(row => (
                  <button key={row.key} onClick={() => row.set(!row.value)}
                    className={`w-full flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium border transition-all ${
                      row.value ? 'bg-indigo-600/30 border-indigo-500 text-white' : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-indigo-500/50'
                    }`}>
                    {row.label}
                    <div className={`w-9 h-5 rounded-full transition-colors relative ${row.value ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${row.value ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {current === 'language' && (
            <>
              <h3 className="text-white font-semibold mb-1">What language do you know best?</h3>
              <p className="text-slate-400 text-xs mb-4">Optional — helps us explain things clearly.</p>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGE_OPTIONS.map(lang => (
                  <button key={lang} onClick={() => setPrimaryLanguage(lang === primaryLanguage ? '' : lang)}
                    className={`rounded-xl px-3 py-2.5 text-sm font-medium border transition-all ${
                      primaryLanguage === lang ? 'bg-indigo-600/30 border-indigo-500 text-white' : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-indigo-500/50'
                    }`}>
                    {lang}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={finish} disabled={saving}
            className="flex-1 border border-slate-700 text-slate-400 hover:text-white py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50">
            Skip {step < total - 1 ? 'all' : ''}
          </button>
          <button onClick={next} disabled={saving}
            className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2">
            {saving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : step < total - 1
                ? <>Next <ArrowRight className="w-4 h-4" /></>
                : <>Let's go! <Sparkles className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
};
