import React, { useState, useEffect } from 'react';
import { BookOpen, Star, Sparkles, User, Plus, ArrowRight, Trash2 } from 'lucide-react';
import { authFetch } from '../firebase/auth';

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

function getColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function totalMinutes(profile: StudentProfile): number {
  return Object.values(profile.subjects).reduce((s, sub) => s + (sub.totalMinutes || 0), 0);
}

function masteryPercent(profile: StudentProfile): number {
  const allConcepts = Object.values(profile.subjects).flatMap(sub => Object.values(sub.conceptStates || {}));
  if (!allConcepts.length) return 0;
  const avg = allConcepts.reduce((s, c) => s + (c.masteryScore || 0), 0) / allConcepts.length;
  return Math.round(avg);
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onParentPortal }) => {
  const [profiles, setProfiles] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGrade, setNewGrade] = useState('Secondary 2 (Grade 8)');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch('/api/learners')
      .then(r => r.json())
      .then(j => { setProfiles(j.learners || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { setError('Please enter a name'); return; }
    setCreating(true);
    setError('');
    try {
      const studentId = `student_${newName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
      const res = await authFetch('/api/learners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, name: newName.trim(), grade: newGrade }),
      });
      const j = await res.json();
      onLogin(j.learner);
    } catch (e) { setError('Could not create profile. Please try again.'); }
    finally { setCreating(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-start px-4 py-8">
      {/* Stars background */}
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

      {/* Logo & Title */}
      <div className="relative z-10 text-center mb-10 mt-4">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-900/50">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-3xl font-bold text-white tracking-tight">Dr. Marcus</h1>
            <p className="text-indigo-300 text-sm font-medium">Your AI Learning Companion</p>
          </div>
        </div>
        <p className="text-slate-400 text-sm max-w-xs mx-auto">
          A judgment-free space to ask any question, at any pace, as many times as you need.
        </p>
      </div>

      {/* Profile Cards */}
      <div className="relative z-10 w-full max-w-md">
        {loading ? (
          <div className="text-center text-slate-400 py-8">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading profiles…
          </div>
        ) : profiles.length === 0 && !showNew ? (
          <div className="text-center py-6">
            <div className="text-5xl mb-4">👋</div>
            <p className="text-white text-lg font-semibold mb-1">Welcome!</p>
            <p className="text-slate-400 text-sm mb-6">Create your learner profile to get started.</p>
            <button onClick={() => setShowNew(true)}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold px-8 py-3 rounded-2xl transition-all shadow-lg shadow-indigo-900/40">
              Create My Profile
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-3 px-1">
              {profiles.length > 0 ? 'Who\'s learning today?' : ''}
            </h2>
            <div className="space-y-3">
              {profiles.map(p => (
                <button key={p.studentId} onClick={() => onLogin(p)}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/50 rounded-2xl p-4 flex items-center gap-4 transition-all group text-left">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getColor(p.name)} flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-lg`}>
                    {initials(p.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{p.name}</p>
                    <p className="text-slate-400 text-xs">{p.grade}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-indigo-300 text-xs flex items-center gap-1">
                        <Star className="w-3 h-3" /> {masteryPercent(p)}% mastery
                      </span>
                      <span className="text-slate-500 text-xs">{totalMinutes(p)} min studied</span>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
                </button>
              ))}

              {/* Add new profile */}
              {!showNew && (
                <button onClick={() => setShowNew(true)}
                  className="w-full border border-dashed border-white/20 hover:border-indigo-500/60 rounded-2xl p-4 flex items-center gap-3 text-slate-400 hover:text-indigo-300 transition-all">
                  <div className="w-12 h-12 rounded-xl border border-dashed border-slate-600 flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-medium">Add new learner</span>
                </button>
              )}
            </div>
          </>
        )}

        {/* New Profile Form */}
        {showNew && (
          <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-5">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" /> Create Learner Profile
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1 block">Your Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="e.g. Aiden, Mei, Priya…"
                  autoFocus
                  className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 outline-none text-sm transition-colors"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1 block">Grade / Year</label>
                <select value={newGrade} onChange={e => setNewGrade(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none text-sm transition-colors">
                  {GRADE_OPTIONS.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
              {error && <p className="text-rose-400 text-xs">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowNew(false); setError(''); setNewName(''); }}
                  className="flex-1 border border-slate-700 text-slate-400 hover:text-white py-2.5 rounded-xl text-sm transition-colors">
                  Cancel
                </button>
                <button onClick={handleCreate} disabled={creating}
                  className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2">
                  {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Sparkles className="w-4 h-4" /> Let's Go!</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Parent Portal link */}
        <div className="mt-8 text-center">
          <button onClick={onParentPortal}
            className="text-slate-500 hover:text-slate-300 text-sm transition-colors flex items-center gap-2 mx-auto">
            <User className="w-4 h-4" /> Parent / Teacher Portal
          </button>
        </div>
      </div>
    </div>
  );
};
