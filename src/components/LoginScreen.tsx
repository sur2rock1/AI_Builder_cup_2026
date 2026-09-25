import React, { useState, useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import { Icon8 } from './Icon8';
import {
  loginWithEmail, registerWithEmail, logout, watchAuth, authFetch,
} from '../firebase/auth';

/**
 * Minimal shape of a concept's progress as the UI needs it. Richer views
 * (ParentPortal) extend this; keeping the base widen-able is what stops
 * `Object.values(...)` collapsing to `unknown` in the consumers.
 */
export interface ConceptSummary {
  masteryScore: number;
  masteryLevel?: string;
  attemptCount?: number;
  conceptId?: string;
  label?: string;
  confirmedMisconceptions?: string[];
  effectiveStrategies?: string[];
  ineffectiveStrategies?: string[];
  lastVisited?: number;
}

export interface SubjectSummary {
  totalMinutes: number;
  sessionCount: number;
  subjectId?: string;
  subjectLabel?: string;
  grade?: string;
  lastSession?: number;
  conceptStates: Record<string, ConceptSummary>;
}

export interface StudentProfile {
  studentId: string;
  name: string;
  grade: string;
  email?: string;
  ownerUid?: string;
  parentUid?: string;
  createdAt: number;
  updatedAt: number;
  subjects: Record<string, SubjectSummary>;
  globalInsights: string[];
}

interface LoginScreenProps {
  onLogin: (profile: StudentProfile) => void;
  onParentPortal: () => void;
}

const GRADE_OPTIONS = [
  'Primary 4 (Grade 4)', 'Primary 5 (Grade 5)', 'Primary 6 (Grade 6)',
  'Secondary 1 (Grade 7)', 'Secondary 2 (Grade 8)', 'Secondary 3 (Grade 9)',
  'Secondary 4 (Grade 10)', 'JC1 / Grade 11', 'JC2 / Grade 12',
];

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-blue-500',
];

const LEARNERS = [
  { name: 'Maya', email: 'maya@lumen.app', password: 'LumenCup2026!', grade: 'Secondary 2 (Grade 8)', role: 'learner' as const },
  { name: 'Ada', email: 'ada@lumen.app', password: 'LumenCup2026!', grade: 'Primary 6 (Grade 6)', role: 'learner' as const },
];

const PARENT_DEMO = { name: 'Parent', email: 'parent@lumen.app', password: 'LumenCup2026!' };

function getColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function authError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/invalid-email') return 'That email does not look right.';
  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential')
    return 'Email or password did not match.';
  if (code === 'auth/email-already-in-use') return 'That email already has an account. Sign in instead.';
  if (code === 'auth/weak-password') return 'Use at least 6 characters for the password.';
  if (code === 'auth/too-many-requests') return 'Too many tries. Wait a moment and try again.';
  return (err as Error)?.message || 'Could not sign in.';
}

function slugName(name: string) {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '') || 'learner';
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onParentPortal }) => {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [rolePick, setRolePick] = useState<'learner' | 'parent'>('learner');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('Secondary 2 (Grade 8)');
  const [email, setEmail] = useState(LEARNERS[0].email);
  const [password, setPassword] = useState(LEARNERS[0].password);
  const [busy, setBusy] = useState(false);
  const [authErr, setAuthErr] = useState('');
  const [profiles, setProfiles] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const enteredRef = useRef(false);

  useEffect(() => {
    return watchAuth(user => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user) enteredRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (!authUser) { setProfiles([]); return; }
    let cancelled = false;
    setLoading(true);
    authFetch('/api/learners')
      .then(r => r.json())
      .then(j => {
        if (cancelled) return;
        if (j.role === 'parent') {
          setProfiles([]);
          setLoading(false);
          if (!enteredRef.current) {
            enteredRef.current = true;
            onParentPortal();
          }
          return;
        }
        const list: StudentProfile[] = j.learners || [];
        setProfiles(list);
        setLoading(false);
        if (list.length === 1 && !enteredRef.current) {
          enteredRef.current = true;
          onLogin(list[0]);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authUser, onLogin, onParentPortal]);

  const createAndEnter = async (learnerName: string, learnerGrade: string) => {
    const studentId = `student_${slugName(learnerName)}_${Date.now()}`;
    const res = await authFetch('/api/learners', {
      method: 'POST',
      body: JSON.stringify({ studentId, name: learnerName.trim(), grade: learnerGrade }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'Could not start your profile');
    enteredRef.current = true;
    onLogin(j.learner);
  };

  const handleAuth = async () => {
    if (!email.trim() || !password) { setAuthErr('Enter email and password.'); return; }
    if (mode === 'register' && !name.trim()) { setAuthErr('What should we call you?'); return; }
    setBusy(true);
    setAuthErr('');
    try {
      if (mode === 'register') {
        await registerWithEmail(email.trim(), password, name.trim(), rolePick);
        if (rolePick === 'parent') {
          enteredRef.current = true;
          onParentPortal();
        } else {
          await createAndEnter(name.trim(), grade);
        }
      } else {
        await loginWithEmail(email.trim(), password);
      }
    } catch (e) {
      setAuthErr(authError(e));
    } finally {
      setBusy(false);
    }
  };

  const fillLearner = (who: typeof LEARNERS[number]) => {
    setMode('signin');
    setRolePick('learner');
    setEmail(who.email);
    setPassword(who.password);
    setName(who.name);
    setGrade(who.grade);
    setAuthErr('');
  };

  const fillParent = () => {
    setMode('signin');
    setRolePick('parent');
    setEmail(PARENT_DEMO.email);
    setPassword(PARENT_DEMO.password);
    setName(PARENT_DEMO.name);
    setAuthErr('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-start px-4 py-8">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {[...Array(40)].map((_, i) => (
          <div key={i} className="absolute rounded-full bg-white opacity-20 animate-pulse"
            style={{
              width: `${Math.random() * 3 + 1}px`, height: `${Math.random() * 3 + 1}px`,
              top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`, animationDuration: `${2 + Math.random() * 3}s`,
            }} />
        ))}
      </div>

      <div className="relative z-10 text-center mb-8 mt-2">
        <img
          src="/lumen/orb.png"
          alt="Lumen, your tutor"
          className="w-28 h-28 mx-auto mb-3 rounded-full object-cover shadow-[0_0_40px_rgba(232,184,109,0.45)]"
        />
        <h1 className="text-3xl font-bold text-white tracking-tight">Lumen</h1>
        <p className="text-indigo-300 text-sm font-medium">Your AI tutor is ready when you are</p>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {!authReady || (authUser && loading) ? (
          <div className="text-center text-slate-400 py-8">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            {authUser ? 'Opening your lesson…' : 'Checking sign-in…'}
          </div>
        ) : !authUser ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-1">
              {mode === 'signin' ? 'This is your login' : rolePick === 'parent' ? 'Create a parent account' : 'Create your student account'}
            </h2>
            <p className="text-slate-400 text-xs mb-4">
              Parents sign in first and create a login for each child. Kids sign in with their own email. Lumen is the tutor — not an account.
            </p>
            <form className="space-y-3" onSubmit={e => { e.preventDefault(); handleAuth(); }}>
              {mode === 'register' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setRolePick('learner')}
                      className={`rounded-xl py-2 text-xs font-medium border ${rolePick === 'learner' ? 'bg-indigo-600/30 border-indigo-400 text-white' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                      Student
                    </button>
                    <button type="button" onClick={() => setRolePick('parent')}
                      className={`rounded-xl py-2 text-xs font-medium border ${rolePick === 'parent' ? 'bg-indigo-600/30 border-indigo-400 text-white' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                      Parent
                    </button>
                  </div>
                  <label className="block">
                    <span className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Icon8 name="user" size={14} /> Your name
                    </span>
                    <input
                      type="text"
                      name="name"
                      id="lumen-name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 outline-none text-sm"
                      placeholder={rolePick === 'parent' ? 'Your name' : 'Maya, Ada…'}
                    />
                  </label>
                  {rolePick === 'learner' && (
                    <label className="block">
                      <span className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1 block">Grade / Year</span>
                      <select value={grade} onChange={e => setGrade(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none text-sm">
                        {GRADE_OPTIONS.map(g => <option key={g}>{g}</option>)}
                      </select>
                    </label>
                  )}
                </>
              )}
              <label className="block">
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Icon8 name="email" size={14} /> Email
                </span>
                <input
                  type="email"
                  name="email"
                  id="lumen-email"
                  autoComplete="username"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 outline-none text-sm"
                  placeholder="maya@lumen.app"
                />
              </label>
              <label className="block">
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Icon8 name="lock" size={14} /> Password
                </span>
                <input
                  type="password"
                  name="password"
                  id="lumen-password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 outline-none text-sm"
                  placeholder="At least 6 characters"
                />
              </label>
              {authErr && <p className="text-rose-400 text-xs">{authErr}</p>}
              <button type="submit" disabled={busy}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
                {busy ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                  <><Icon8 name="forward" size={16} /> {mode === 'signin' ? 'Continue' : rolePick === 'parent' ? 'Open parent dashboard' : 'Create my account'}</>
                )}
              </button>
            </form>
            <button type="button" onClick={() => { setMode(mode === 'signin' ? 'register' : 'signin'); setAuthErr(''); }}
              className="w-full text-slate-400 hover:text-white text-sm py-1 mt-2">
              {mode === 'signin' ? 'New here? Create your account' : 'Already have an account? Sign in'}
            </button>
            <div className="mt-3 pt-3 border-t border-white/10">
              <p className="text-[11px] text-slate-500 text-center mb-2">Cup demo logins</p>
              <div className="flex gap-2">
                {LEARNERS.map(who => (
                  <button key={who.email} type="button" onClick={() => fillLearner(who)}
                    className="flex-1 text-xs text-indigo-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-2">
                    {who.name}
                  </button>
                ))}
                <button type="button" onClick={fillParent}
                  className="flex-1 text-xs text-indigo-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-2">
                  Parent
                </button>
              </div>
            </div>
          </div>
        ) : profiles.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-slate-400 text-xs mb-3">Signed in as {authUser.email}</p>
            <h2 className="text-white font-semibold mb-1">What should Lumen call you?</h2>
            <p className="text-slate-400 text-xs mb-4">One last step — then Lumen can start teaching.</p>
            <div className="space-y-3">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 outline-none text-sm"
              />
              <select value={grade} onChange={e => setGrade(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none text-sm">
                {GRADE_OPTIONS.map(g => <option key={g}>{g}</option>)}
              </select>
              {authErr && <p className="text-rose-400 text-xs">{authErr}</p>}
              <button disabled={busy} onClick={async () => {
                if (!name.trim()) { setAuthErr('What should Lumen call you?'); return; }
                setBusy(true); setAuthErr('');
                try { await createAndEnter(name.trim(), grade); }
                catch (e) { setAuthErr(authError(e)); }
                finally { setBusy(false); }
              }}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold py-2.5 rounded-xl text-sm">
                Meet Lumen
              </button>
              <button onClick={() => logout()} className="w-full text-slate-500 text-xs">Sign out</button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-slate-400 text-xs mb-3">Signed in as {authUser.email}</p>
            <div className="space-y-3">
              {profiles.map(p => (
                <button key={p.studentId} onClick={() => { enteredRef.current = true; onLogin(p); }}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-4 flex items-center gap-4 text-left">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getColor(p.name)} flex items-center justify-center text-white font-bold text-lg`}>
                    {initials(p.name)}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-semibold">{p.name}</p>
                    <p className="text-slate-400 text-xs">{p.grade}</p>
                  </div>
                  <Icon8 name="forward" size={18} />
                </button>
              ))}
            </div>
            <button onClick={() => logout()} className="mt-6 text-slate-500 text-xs flex items-center gap-1.5 mx-auto">
              <Icon8 name="logout" size={14} /> Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
