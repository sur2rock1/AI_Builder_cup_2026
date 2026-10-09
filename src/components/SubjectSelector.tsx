import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen, ChevronRight, ChevronDown, LogOut, CheckCircle2, ArrowRight, Brain, Link2,
} from 'lucide-react';
import type { StudentProfile } from './LoginScreen';

// ─────────────────────────────────────────────────────────────────
// Subject → chapter → concept picker for a learner (docs/CURRICULUM.md §6).
//
// Shows only the courses for the learner's own board + grade (chosen at
// signup). Concepts are grouped by chapter in teaching order.
//
// Changed 2026-09-26 (D-2026-09-26-8): concepts are no longer LOCKED until
// their prerequisites reach 40% — with real prerequisite graphs that would
// stop a learner from studying the chapter their class is on today. A
// concept now shows what it "builds on"; the tutor's plan probes those
// prerequisites first and detours only if the evidence says one is weak.
// Uploading content moved to the admin content library — learners never upload.
// ─────────────────────────────────────────────────────────────────

interface ConceptMeta {
  id: string; label: string; typicalTeachingOrder?: number; prerequisites?: string[];
  chapter?: string | null; chapterId?: string | null; chapterNumber?: number | null;
}

interface SubjectMeta {
  subjectId: string;
  label: string;
  board?: string | null;
  grade: string;
  gradeLevel?: number | null;
  source: string;
  conceptCount: number;
  concepts: ConceptMeta[];
}

interface ConceptProgress {
  masteryScore: number;
  masteryLevel: string;
  attemptCount: number;
  masteryStatus?: string;
}

interface SubjectSelectorProps {
  student: StudentProfile;
  onSelectSubjectConcept: (subjectId: string, subjectLabel: string, conceptId: string, conceptLabel: string, grade: string) => void;
  onLogout: () => void;
  onParentPortal: () => void;
}

const MASTERY_COLORS: Record<string, string> = {
  not_started: 'bg-slate-700',
  exposed:     'bg-rose-500/60',
  partial:     'bg-orange-500/60',
  developing:  'bg-amber-500/60',
  proficient:  'bg-emerald-500/60',
  mastered:    'bg-emerald-400',
};

const MASTERY_LABELS: Record<string, string> = {
  not_started: 'Not started',
  exposed:     'Exposed',
  partial:     'Partial',
  developing:  'Developing',
  proficient:  'Proficient',
  mastered:    'Mastered ✓',
};

/** Evidence-gated "done" — the same rule the tutor uses (masteryStatus when set). */
const isDone = (p?: ConceptProgress) =>
  !!p && (p.masteryStatus ? p.masteryStatus !== 'none' : p.masteryScore >= 80);

function getAvatarColor(name: string) {
  const colors = ['from-violet-500 to-purple-600','from-sky-500 to-blue-600','from-emerald-500 to-teal-600','from-amber-500 to-orange-600','from-rose-500 to-pink-600'];
  let hash = 0; for (let i=0;i<name.length;i++) hash = name.charCodeAt(i)+((hash<<5)-hash);
  return colors[Math.abs(hash)%colors.length];
}
function initials(name: string) { return name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }

export const SubjectSelector: React.FC<SubjectSelectorProps> = ({
  student, onSelectSubjectConcept, onLogout, onParentPortal,
}) => {
  const [subjects, setSubjects] = useState<SubjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<SubjectMeta | null>(null);
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = new URLSearchParams();
    if (student.board) q.set('board', student.board);
    q.set('grade', String(student.gradeLevel ?? student.grade));
    fetch(`/api/curricula?${q.toString()}`)
      .then(r => r.json())
      .then(json => {
        const list: SubjectMeta[] = json.curricula || [];
        setSubjects(list);
        if (list.length === 1) setSelectedSubject(list[0]); // auto-select if only one
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [student.board, student.gradeLevel, student.grade]);

  const conceptProgress = useMemo<Record<string, ConceptProgress>>(() => (
    selectedSubject
      ? ((student.subjects?.[selectedSubject.subjectId]?.conceptStates || {}) as Record<string, ConceptProgress>)
      : {}
  ), [selectedSubject, student]);

  const conceptsByOrder = useMemo(() => selectedSubject
    ? [...selectedSubject.concepts].sort((a, b) => (a.typicalTeachingOrder || 99) - (b.typicalTeachingOrder || 99))
    : [], [selectedSubject]);

  const labelById = useMemo(() => new Map(conceptsByOrder.map(c => [c.id, c.label])), [conceptsByOrder]);

  // Chapters in teaching order, each with its concepts.
  const chapters = useMemo(() => {
    const out: Array<{ key: string; title: string; concepts: ConceptMeta[] }> = [];
    const idx = new Map<string, number>();
    for (const c of conceptsByOrder) {
      const key = c.chapterId || c.chapter || 'general';
      if (!idx.has(key)) { idx.set(key, out.length); out.push({ key, title: c.chapter || 'General', concepts: [] }); }
      out[idx.get(key)!].concepts.push(c);
    }
    return out;
  }, [conceptsByOrder]);

  // When a subject opens, expand the chapter the learner is working in
  // (the first with an unfinished concept). Not re-run on progress updates,
  // so it never collapses a chapter the learner opened themselves.
  useEffect(() => {
    if (!chapters.length) return;
    const current = chapters.find(ch => ch.concepts.some(c => !isDone(conceptProgress[c.id]))) || chapters[0];
    setOpenChapters(new Set([current.key]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters]);

  const toggleChapter = (key: string) => setOpenChapters(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (loading) {
    return (
      <div className="min-h-app bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading your subjects…
        </div>
      </div>
    );
  }

  const doneCount = conceptsByOrder.filter(c => isDone(conceptProgress[c.id])).length;

  return (
    <div className="min-h-app bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-5 pb-4 border-b border-white/5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(student.name)} flex items-center justify-center text-white font-bold text-sm`}>
              {initials(student.name)}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{student.name}</p>
              <p className="text-slate-400 text-xs">{student.board ? `${student.board} · ` : ''}{student.grade}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onParentPortal}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-300 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-all">
              <Brain className="w-3.5 h-3.5" /> Parent View
            </button>
            <button onClick={onLogout}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 bg-white/5 hover:bg-rose-500/10 border border-white/10 px-3 py-1.5 rounded-lg transition-all">
              <LogOut className="w-3.5 h-3.5" /> Switch
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto">

          {/* Subject picker */}
          {!selectedSubject && (
            <>
              <h2 className="text-white font-bold text-lg mb-1">What would you like to learn today?</h2>
              <p className="text-slate-400 text-sm mb-5">
                Your subjects for {student.board ? `${student.board} · ` : ''}{student.grade}.
              </p>
              {subjects.length === 0 ? (
                <div className="bg-white/5 border border-dashed border-white/20 rounded-2xl p-8 text-center">
                  <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-300 font-medium mb-1">No subjects yet for your board and grade</p>
                  <p className="text-slate-500 text-sm">Your teacher or admin adds textbooks in the content library. Check back soon!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {subjects.map(sub => {
                    const studentSub = student.subjects?.[sub.subjectId];
                    const mastered = Object.values(studentSub?.conceptStates || {}).filter((c: any) => isDone(c)).length;
                    const chapterCount = new Set(sub.concepts.map(c => c.chapterId || c.chapter || 'general')).size;
                    return (
                      <button key={sub.subjectId} onClick={() => setSelectedSubject(sub)}
                        className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 rounded-2xl p-4 flex items-center gap-4 transition-all group">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                          <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold">{sub.label}</p>
                          <p className="text-slate-400 text-xs">{chapterCount} chapter{chapterCount === 1 ? '' : 's'} · {sub.conceptCount} concepts</p>
                          {mastered > 0 && (
                            <p className="text-emerald-400 text-xs mt-0.5">{mastered}/{sub.conceptCount} mastered</p>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Chapters + concepts for the selected subject */}
          {selectedSubject && (
            <>
              <div className="flex items-center gap-2 mb-5">
                {subjects.length > 1 && (
                  <>
                    <button onClick={() => setSelectedSubject(null)}
                      className="text-slate-400 hover:text-white text-sm transition-colors">
                      ← Subjects
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </>
                )}
                <span className="text-white font-semibold text-sm">{selectedSubject.label}</span>
              </div>

              <h2 className="text-white font-bold text-lg mb-1">Choose a chapter and concept</h2>
              <p className="text-slate-400 text-sm mb-5">
                Start anywhere — pick what your class is doing. If an idea builds on something earlier, your tutor checks that first.
              </p>

              {doneCount > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-5">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Overall progress</span>
                    <span>{doneCount}/{conceptsByOrder.length} mastered</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all"
                      style={{ width: `${(doneCount / Math.max(1, conceptsByOrder.length)) * 100}%` }} />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {chapters.map(ch => {
                  const open = openChapters.has(ch.key);
                  const chDone = ch.concepts.filter(c => isDone(conceptProgress[c.id])).length;
                  return (
                    <div key={ch.key} className="rounded-2xl border border-white/10 bg-white/[0.03]">
                      <button onClick={() => toggleChapter(ch.key)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left">
                        <div>
                          <p className="text-white font-semibold text-sm">{ch.title}</p>
                          <p className="text-slate-500 text-xs">{ch.concepts.length} concepts{chDone ? ` · ${chDone} mastered` : ''}</p>
                        </div>
                        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </button>
                      {open && (
                        <div className="px-2 pb-2 space-y-2">
                          {ch.concepts.map(concept => {
                            const prog = conceptProgress[concept.id];
                            const level = prog?.masteryLevel || 'not_started';
                            const score = prog?.masteryScore || 0;
                            const done = isDone(prog);
                            const buildsOn = (concept.prerequisites || []).map(id => labelById.get(id)).filter(Boolean) as string[];
                            return (
                              <div key={concept.id}
                                className="relative rounded-xl border bg-white/5 hover:bg-white/10 border-white/10 hover:border-indigo-500/40 cursor-pointer group transition-all"
                                onClick={() => onSelectSubjectConcept(
                                  selectedSubject.subjectId, selectedSubject.label,
                                  concept.id, concept.label, student.grade,
                                )}>
                                <div className="p-3 flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold
                                    ${done ? 'bg-emerald-500 text-white' : 'bg-indigo-600/40 text-indigo-300'}`}>
                                    {done ? <CheckCircle2 className="w-4 h-4" /> : (concept.typicalTeachingOrder ?? '•')}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm text-white">{concept.label}</p>
                                    {prog ? (
                                      <div className="flex items-center gap-2 mt-1">
                                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden max-w-[100px]">
                                          <div className={`h-full ${MASTERY_COLORS[level]} rounded-full transition-all`} style={{ width: `${score}%` }} />
                                        </div>
                                        <span className="text-xs text-slate-500">{MASTERY_LABELS[level]}</span>
                                      </div>
                                    ) : (
                                      <p className="text-slate-500 text-xs mt-0.5">Not started</p>
                                    )}
                                    {buildsOn.length > 0 && !done && (
                                      <p className="text-slate-500 text-[11px] mt-1 flex items-center gap-1">
                                        <Link2 className="w-3 h-3" /> Builds on: {buildsOn.join(', ')}
                                      </p>
                                    )}
                                  </div>
                                  <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
                                </div>
                                {score > 0 && (
                                  <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${MASTERY_COLORS[level]}`} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
