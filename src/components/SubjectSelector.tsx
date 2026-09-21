import React, { useState, useEffect } from 'react';
import {
  BookOpen, ChevronRight, LogOut, Star, Clock, CheckCircle2,
  Circle, Upload, Sparkles, ArrowRight, Brain, Lock,
} from 'lucide-react';
import type { StudentProfile } from './LoginScreen';

interface SubjectMeta {
  subjectId: string;
  label: string;
  grade: string;
  source: string;
  conceptCount: number;
  concepts: Array<{ id: string; label: string; typicalTeachingOrder?: number; prerequisites?: string[] }>;
}

interface ConceptProgress {
  masteryScore: number;
  masteryLevel: string;
  attemptCount: number;
}

interface SubjectSelectorProps {
  student: StudentProfile;
  onSelectSubjectConcept: (subjectId: string, subjectLabel: string, conceptId: string, conceptLabel: string, grade: string) => void;
  onLogout: () => void;
  onUploadCurriculum: () => void;
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

function getAvatarColor(name: string) {
  const colors = ['from-violet-500 to-purple-600','from-sky-500 to-blue-600','from-emerald-500 to-teal-600','from-amber-500 to-orange-600','from-rose-500 to-pink-600'];
  let hash = 0; for (let i=0;i<name.length;i++) hash = name.charCodeAt(i)+((hash<<5)-hash);
  return colors[Math.abs(hash)%colors.length];
}
function initials(name: string) { return name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }

export const SubjectSelector: React.FC<SubjectSelectorProps> = ({
  student, onSelectSubjectConcept, onLogout, onUploadCurriculum, onParentPortal,
}) => {
  const [subjects, setSubjects] = useState<SubjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<SubjectMeta | null>(null);
  const [conceptProgress, setConceptProgress] = useState<Record<string, ConceptProgress>>({});

  useEffect(() => {
    // Load all available subjects: built-in Pythagoras + any uploaded
    Promise.all([
      fetch('/api/curricula').then(r => r.json()),
    ]).then(([curriculaJson]) => {
      const list: SubjectMeta[] = curriculaJson.curricula || [];
      setSubjects(list);
      if (list.length === 1) setSelectedSubject(list[0]); // auto-select if only one
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSubject) return;
    const studentSubject = student.subjects?.[selectedSubject.subjectId];
    if (studentSubject?.conceptStates) {
      setConceptProgress(studentSubject.conceptStates as Record<string, ConceptProgress>);
    } else {
      setConceptProgress({});
    }
  }, [selectedSubject, student]);

  const isConceptUnlocked = (concept: { id: string; prerequisites?: string[] }) => {
    if (!concept.prerequisites || concept.prerequisites.length === 0) return true;
    return concept.prerequisites.every(prereqId => {
      const p = conceptProgress[prereqId];
      return p && p.masteryScore >= 40; // 'developing' or above unlocks next
    });
  };

  const conceptsByOrder = selectedSubject
    ? [...selectedSubject.concepts].sort((a, b) => (a.typicalTeachingOrder || 99) - (b.typicalTeachingOrder || 99))
    : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading your subjects…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-5 pb-4 border-b border-white/5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(student.name)} flex items-center justify-center text-white font-bold text-sm`}>
              {initials(student.name)}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{student.name}</p>
              <p className="text-slate-400 text-xs">{student.grade}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onUploadCurriculum}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-300 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-all">
              <Upload className="w-3.5 h-3.5" /> Upload PDF
            </button>
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
              <p className="text-slate-400 text-sm mb-5">Pick a subject to see the chapters.</p>
              {subjects.length === 0 ? (
                <div className="bg-white/5 border border-dashed border-white/20 rounded-2xl p-8 text-center">
                  <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-300 font-medium mb-1">No subjects yet</p>
                  <p className="text-slate-500 text-sm mb-4">Upload a PDF textbook to get started.</p>
                  <button onClick={onUploadCurriculum}
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl">
                    Upload PDF Textbook
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {subjects.map(sub => {
                    const studentSub = student.subjects?.[sub.subjectId];
                    const mastered = Object.values(studentSub?.conceptStates || {}).filter((c: any) => c.masteryScore >= 80).length;
                    const total = sub.conceptCount;
                    return (
                      <button key={sub.subjectId} onClick={() => setSelectedSubject(sub)}
                        className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 rounded-2xl p-4 flex items-center gap-4 transition-all group">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                          <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold">{sub.label}</p>
                          <p className="text-slate-400 text-xs">{sub.grade} · {total} chapters/concepts</p>
                          {mastered > 0 && (
                            <p className="text-emerald-400 text-xs mt-0.5">{mastered}/{total} mastered</p>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                      </button>
                    );
                  })}
                  <button onClick={onUploadCurriculum}
                    className="w-full text-left border border-dashed border-white/20 hover:border-indigo-500/40 rounded-2xl p-4 flex items-center gap-4 text-slate-400 hover:text-indigo-300 transition-all">
                    <div className="w-12 h-12 rounded-xl border border-dashed border-slate-700 flex items-center justify-center">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Add another subject</p>
                      <p className="text-slate-600 text-xs">Upload a PDF textbook</p>
                    </div>
                  </button>
                </div>
              )}
            </>
          )}

          {/* Concept list for selected subject */}
          {selectedSubject && (
            <>
              <div className="flex items-center gap-2 mb-5">
                <button onClick={() => setSelectedSubject(null)}
                  className="text-slate-400 hover:text-white text-sm transition-colors">
                  ← Subjects
                </button>
                <ChevronRight className="w-4 h-4 text-slate-600" />
                <span className="text-white font-semibold text-sm">{selectedSubject.label}</span>
              </div>

              <h2 className="text-white font-bold text-lg mb-1">Choose a chapter or concept</h2>
              <p className="text-slate-400 text-sm mb-5">
                Complete them in order — each concept builds on the last.
              </p>

              {/* Progress summary */}
              {Object.keys(conceptProgress).length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-5 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Overall progress</span>
                      <span>{(Object.values(conceptProgress) as ConceptProgress[]).filter(c => c.masteryScore >= 80).length}/{conceptsByOrder.length} mastered</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all"
                        style={{ width: `${((Object.values(conceptProgress) as ConceptProgress[]).filter(c => c.masteryScore >= 80).length / Math.max(1, conceptsByOrder.length)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {conceptsByOrder.map((concept, idx) => {
                  const prog = conceptProgress[concept.id];
                  const unlocked = isConceptUnlocked(concept);
                  const level = prog?.masteryLevel || 'not_started';
                  const score = prog?.masteryScore || 0;

                  return (
                    <div key={concept.id}
                      className={`relative rounded-2xl border transition-all ${unlocked
                        ? 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-indigo-500/40 cursor-pointer group'
                        : 'bg-white/[0.02] border-white/5 opacity-60 cursor-not-allowed'}`}
                      onClick={() => unlocked && onSelectSubjectConcept(
                        selectedSubject.subjectId, selectedSubject.label,
                        concept.id, concept.label, student.grade
                      )}>
                      <div className="p-4 flex items-center gap-4">
                        {/* Order bubble */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold
                          ${score >= 80 ? 'bg-emerald-500 text-white' : unlocked ? 'bg-indigo-600/40 text-indigo-300' : 'bg-slate-700 text-slate-500'}`}>
                          {score >= 80 ? <CheckCircle2 className="w-5 h-5" /> : unlocked ? idx + 1 : <Lock className="w-4 h-4" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm ${unlocked ? 'text-white' : 'text-slate-500'}`}>
                            {concept.label}
                          </p>
                          {prog && (
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden max-w-[100px]">
                                <div className={`h-full ${MASTERY_COLORS[level]} rounded-full transition-all`} style={{ width: `${score}%` }} />
                              </div>
                              <span className="text-xs text-slate-500">{MASTERY_LABELS[level]}</span>
                            </div>
                          )}
                          {!prog && unlocked && (
                            <p className="text-slate-500 text-xs mt-0.5">Not started</p>
                          )}
                          {!unlocked && (
                            <p className="text-slate-600 text-xs mt-0.5">
                              Complete {concept.prerequisites?.join(', ') || 'prerequisites'} first
                            </p>
                          )}
                        </div>

                        {unlocked && (
                          <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
                        )}
                      </div>

                      {/* Mastery bar accent */}
                      {score > 0 && (
                        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${MASTERY_COLORS[level]}`} />
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
