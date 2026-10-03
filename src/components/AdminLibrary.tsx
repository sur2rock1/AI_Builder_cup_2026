import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, KeyRound, Loader2, ShieldCheck, Trash2, RefreshCw } from 'lucide-react';
import { CurriculumUpload } from './CurriculumUpload';

// ─────────────────────────────────────────────────────────────────
// Admin content library (docs/CURRICULUM.md §5). Reached from the small
// "Content library (admin)" link on the login screen.
//
// Every request carries the admin token (X-Admin-Token) checked by
// server/middleware/requireAdmin.ts. When the server has no ADMIN_TOKEN
// configured, requests from the same machine are allowed (local dev) and
// this screen opens without asking.
// ─────────────────────────────────────────────────────────────────

interface CourseRow {
  subjectId: string; label: string; board: string | null; grade: string; gradeLevel: number | null;
  subjectMode: string; conceptCount: number; concepts: Array<{ chapterId: string | null; chapter: string | null }>;
  sources: Array<{ id: string; kind: 'textbook' | 'syllabus'; title: string; pages?: number }>;
  conceptTypes: Record<string, string>;
  verification: null | { conceptsChecked: number; conceptsCorrected: number; conceptsRejected: number; examplesCorrected: number; examplesDropped: number; verifiedAt: number };
  scopeSources: string[];
  prerequisiteEdges: number;
  updatedAt: number | null;
  busy: boolean;
}

const TOKEN_KEY = 'pt-admin-token';
function readToken(): string {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function writeToken(t: string) {
  try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
}

const MODE_LABEL: Record<string, string> = {
  well_structured: 'Well-structured', interpretive: 'Interpretive', skill: 'Skill / language',
};

export const AdminLibrary: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [token, setToken] = useState(readToken());
  const [tokenInput, setTokenInput] = useState('');
  const [authState, setAuthState] = useState<'checking' | 'ok' | 'need-token' | 'error'>('checking');
  const [authError, setAuthError] = useState('');
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [boards, setBoards] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState('');

  const headers = useCallback((): Record<string, string> => (token ? { 'X-Admin-Token': token } : {}), [token]);

  const check = useCallback(async (t: string) => {
    setAuthState('checking');
    try {
      const r = await fetch('/api/admin/check', { headers: t ? { 'X-Admin-Token': t } : {} });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { setAuthState('ok'); return true; }
      setAuthError(j.error || `Server returned ${r.status}`);
      setAuthState(r.status === 503 ? 'error' : 'need-token');
    } catch {
      setAuthError('Could not reach the server.');
      setAuthState('error');
    }
    return false;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [c, cat] = await Promise.all([
        fetch('/api/admin/courses', { headers: headers() }).then(r => r.json()),
        fetch('/api/catalog').then(r => r.json()),
      ]);
      if (c.error) throw new Error(c.error);
      setCourses(c.courses || []);
      setBoards(cat.boards || []);
    } catch (e: any) {
      setError(e.message || 'Could not load the library');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { check(token); }, [check, token]);
  useEffect(() => { if (authState === 'ok') load(); }, [authState, load]);

  const submitToken = async () => {
    const t = tokenInput.trim();
    if (await check(t)) { writeToken(t); setToken(t); }
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    const r = await fetch(`/api/admin/courses/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setError(j.error || 'Delete failed');
    load();
  };

  // Group by board → grade for display.
  const groups = new Map<string, CourseRow[]>();
  for (const c of [...courses].sort((a, b) => (a.board || '').localeCompare(b.board || '') || (a.gradeLevel || 0) - (b.gradeLevel || 0) || a.label.localeCompare(b.label))) {
    const key = `${c.board || 'No board'} · ${c.grade}`;
    groups.set(key, [...(groups.get(key) || []), c]);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-4 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="text-slate-400 hover:text-white text-sm flex items-center gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-2 text-white font-bold">
            <BookOpen className="w-5 h-5 text-indigo-300" /> Content library
          </div>
          {authState === 'ok' ? (
            <button onClick={load} className="text-slate-400 hover:text-white text-sm flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          ) : <span className="w-16" />}
        </div>

        {authState === 'checking' && (
          <div className="text-slate-400 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking access…</div>
        )}

        {(authState === 'need-token' || authState === 'error') && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 max-w-md">
            <p className="text-white font-semibold mb-1 flex items-center gap-2"><KeyRound className="w-4 h-4" /> Admin access</p>
            <p className="text-slate-400 text-sm mb-3">
              {authState === 'error' ? authError : 'Enter the admin token (ADMIN_TOKEN in the server’s .env).'}
            </p>
            {authState === 'need-token' && (
              <>
                <input type="password" value={tokenInput} onChange={e => setTokenInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitToken()}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none text-sm mb-2" />
                {authError && tokenInput && <p className="text-rose-400 text-xs mb-2">{authError}</p>}
                <button onClick={submitToken} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 text-sm font-semibold">Continue</button>
              </>
            )}
          </div>
        )}

        {authState === 'ok' && (
          <>
            <CurriculumUpload adminToken={token} boards={boards} onPublished={() => load()} />

            <h2 className="text-white font-bold mt-8 mb-3">Published courses</h2>
            {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}
            {loading && <div className="text-slate-400 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
            {!loading && courses.length === 0 && (
              <p className="text-slate-500 text-sm">Nothing published yet. Upload a textbook above — learners see a course as soon as its review finishes.</p>
            )}

            {[...groups].map(([group, rows]) => (
              <div key={group} className="mb-5">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{group}</p>
                <div className="space-y-2">
                  {rows.map(c => {
                    const chapters = new Set(c.concepts.map(x => x.chapterId || x.chapter)).size;
                    const v = c.verification;
                    return (
                      <div key={c.subjectId} className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-white font-semibold">{c.label} <span className="text-slate-500 text-xs font-normal">· {MODE_LABEL[c.subjectMode] || c.subjectMode}</span></p>
                            <p className="text-slate-400 text-xs mt-0.5">
                              {chapters} chapter(s) · {c.conceptCount} concepts · {c.prerequisiteEdges} prerequisite links · {Object.keys(c.conceptTypes).length} concept types
                            </p>
                            <p className="text-slate-500 text-xs mt-0.5">
                              Scope from: {c.scopeSources.length ? c.scopeSources.join(', ') : '—'} · Sources: {c.sources.map(s => `${s.title}${s.kind === 'syllabus' ? ' (syllabus)' : ''}`).join(', ') || '—'}
                            </p>
                            {v && (
                              <p className="text-violet-300/80 text-xs mt-1 flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Reviewed {v.conceptsChecked} · corrected {v.conceptsCorrected} · rejected {v.conceptsRejected} · examples fixed {v.examplesCorrected} / dropped {v.examplesDropped}
                              </p>
                            )}
                            <p className="text-slate-600 text-[11px] mt-1 font-mono">{c.subjectId}</p>
                          </div>
                          <div className="flex-shrink-0">
                            {c.busy ? (
                              <span className="text-amber-300 text-xs flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> ingesting</span>
                            ) : confirmDelete === c.subjectId ? (
                              <div className="flex gap-2">
                                <button onClick={() => remove(c.subjectId)} className="text-xs bg-rose-600 hover:bg-rose-500 text-white rounded-lg px-2.5 py-1">Delete</button>
                                <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-400 hover:text-white">Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDelete(c.subjectId)} title="Remove this course from the library"
                                className="text-slate-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminLibrary;
