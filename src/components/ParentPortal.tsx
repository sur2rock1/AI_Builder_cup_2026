import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Brain, Clock, Star, BookOpen, AlertTriangle, TrendingUp,
  ChevronDown, ChevronRight, CheckCircle2, Circle, BarChart3, User, Lightbulb,
} from 'lucide-react';
import { authFetch } from '../firebase/auth';
import type { StudentProfile, ConceptSummary, SubjectSummary } from './LoginScreen';

interface ConceptState extends ConceptSummary {
  conceptId: string;
  label: string;
  masteryScore: number;
  masteryLevel: string;
  attemptCount: number;
  confirmedMisconceptions: string[];
  effectiveStrategies: string[];
  ineffectiveStrategies: string[];
  lastVisited: number;
}

interface SubjectData extends SubjectSummary {
  subjectId: string;
  subjectLabel: string;
  grade: string;
  totalMinutes: number;
  sessionCount: number;
  conceptStates: Record<string, ConceptState>;
}

interface FullLearner extends StudentProfile {
  subjects: Record<string, SubjectData>;
  globalInsights: string[];
}

const MASTERY_COLOR: Record<string, string> = {
  not_started: 'bg-slate-700 text-slate-400',
  exposed:     'bg-rose-500/20 text-rose-300',
  partial:     'bg-orange-500/20 text-orange-300',
  developing:  'bg-amber-500/20 text-amber-300',
  proficient:  'bg-emerald-500/20 text-emerald-300',
  mastered:    'bg-emerald-400/20 text-emerald-300',
};

const MASTERY_BAR: Record<string, string> = {
  not_started: 'bg-slate-600',
  exposed:     'bg-rose-500',
  partial:     'bg-orange-500',
  developing:  'bg-amber-400',
  proficient:  'bg-emerald-500',
  mastered:    'bg-emerald-400',
};

function getAvatarColor(name: string) {
  const colors = ['from-violet-500 to-purple-600','from-sky-500 to-blue-600','from-emerald-500 to-teal-600','from-amber-500 to-orange-600','from-rose-500 to-pink-600'];
  let hash = 0; for (let i=0;i<name.length;i++) hash = name.charCodeAt(i)+((hash<<5)-hash);
  return colors[Math.abs(hash)%colors.length];
}
function initials(name: string) { return name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }
function relativeTime(ts: number): string {
  const d = (Date.now() - ts) / 1000;
  if (d < 120) return 'just now';
  if (d < 3600) return `${Math.round(d/60)}m ago`;
  if (d < 86400) return `${Math.round(d/3600)}h ago`;
  return `${Math.round(d/86400)}d ago`;
}

interface ParentPortalProps {
  onBack: () => void;
  initialStudentId?: string;
}

export const ParentPortal: React.FC<ParentPortalProps> = ({ onBack, initialStudentId }) => {
  const [learners, setLearners] = useState<FullLearner[]>([]);
  const [selected, setSelected] = useState<FullLearner | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedConcepts, setExpandedConcepts] = useState<Set<string>>(new Set());

  useEffect(() => {
    authFetch('/api/learners')
      .then(r => r.json())
      .then(j => {
        const list: FullLearner[] = j.learners || [];
        setLearners(list);
        if (initialStudentId) {
          const target = list.find(l => l.studentId === initialStudentId);
          if (target) { setSelected(target); if (Object.keys(target.subjects).length === 1) setSelectedSubject(Object.keys(target.subjects)[0]); }
        }
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [initialStudentId]);

  const toggleConcept = (id: string) => {
    setExpandedConcepts(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const overallMastery = (learner: FullLearner) => {
    const all = Object.values(learner.subjects).flatMap((sub: SubjectData) => Object.values(sub.conceptStates) as ConceptState[]);
    if (!all.length) return 0;
    return Math.round(all.reduce((s,c) => s + c.masteryScore, 0) / all.length);
  };

  const totalMinutes = (learner: FullLearner) =>
    Object.values(learner.subjects).reduce((s, sub) => s + (sub.totalMinutes || 0), 0);

  const subjectData = selected && selectedSubject ? selected.subjects[selectedSubject] : null;

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-5 pb-4 border-b border-white/5">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-400" />
            <h1 className="text-white font-bold">Parent & Teacher Portal</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* ─── No learners ─── */}
          {learners.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <User className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No learner profiles yet.</p>
              <p className="text-sm mt-1">Ask your child to log in and create their profile first.</p>
            </div>
          )}

          {/* ─── Learner cards ─── */}
          {learners.length > 0 && (
            <div>
              <h2 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">Learners</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {learners.map(l => {
                  const mastery = overallMastery(l);
                  const mins = totalMinutes(l);
                  const subjectCount = Object.keys(l.subjects).length;
                  const misconceptions = Object.values(l.subjects)
                    .flatMap((sub: SubjectData) => Object.values(sub.conceptStates) as ConceptState[])
                    .flatMap((c: ConceptState) => c.confirmedMisconceptions || []).length;
                  return (
                    <button key={l.studentId} onClick={() => {
                      setSelected(l);
                      const keys = Object.keys(l.subjects);
                      setSelectedSubject(keys.length === 1 ? keys[0] : null);
                    }}
                      className={`text-left rounded-2xl border p-4 transition-all ${selected?.studentId === l.studentId
                        ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20'}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(l.name)} flex items-center justify-center text-white font-bold text-sm`}>
                          {initials(l.name)}
                        </div>
                        <div>
                          <p className="text-white font-semibold">{l.name}</p>
                          <p className="text-slate-400 text-xs">{l.grade}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-white/5 rounded-xl p-2">
                          <p className="text-white font-bold text-lg">{mastery}%</p>
                          <p className="text-slate-500 text-xs">Mastery</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-2">
                          <p className="text-white font-bold text-lg">{mins}</p>
                          <p className="text-slate-500 text-xs">Minutes</p>
                        </div>
                        <div className={`rounded-xl p-2 ${misconceptions > 0 ? 'bg-rose-500/10' : 'bg-white/5'}`}>
                          <p className={`font-bold text-lg ${misconceptions > 0 ? 'text-rose-400' : 'text-white'}`}>{misconceptions}</p>
                          <p className="text-slate-500 text-xs">Flags</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Selected learner detail ─── */}
          {selected && (
            <>
              {/* Subject tabs */}
              {Object.keys(selected.subjects).length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {(Object.entries(selected.subjects) as Array<[string, SubjectData]>).map(([sid, sub]) => (
                    <button key={sid} onClick={() => setSelectedSubject(sid)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedSubject === sid
                        ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white border border-white/10'}`}>
                      {sub.subjectLabel || sid}
                    </button>
                  ))}
                </div>
              )}

              {Object.keys(selected.subjects).length === 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center text-slate-400">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{selected.name} hasn't started any subject yet.</p>
                </div>
              )}

              {/* Subject detail */}
              {subjectData && (
                <>
                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { icon: Star, label: 'Avg Mastery', value: `${Math.round((Object.values(subjectData.conceptStates) as ConceptState[]).reduce((s,c)=>s+c.masteryScore,0)/Math.max(1,Object.values(subjectData.conceptStates).length))}%`, color: 'text-amber-400' },
                      { icon: Clock, label: 'Study Time', value: `${subjectData.totalMinutes || 0} min`, color: 'text-sky-400' },
                      { icon: BarChart3, label: 'Sessions', value: String(subjectData.sessionCount || 0), color: 'text-indigo-400' },
                      { icon: AlertTriangle, label: 'Misconceptions', value: String((Object.values(subjectData.conceptStates) as ConceptState[]).flatMap(c=>c.confirmedMisconceptions||[]).length), color: 'text-rose-400' },
                    ].map(({ icon: Icon, label, value, color }) => (
                      <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                        <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
                        <p className={`text-xl font-bold ${color}`}>{value}</p>
                        <p className="text-slate-500 text-xs mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Concept progress */}
                  <div>
                    <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" /> Concept Progress
                    </h3>
                    <div className="space-y-2">
                      {(Object.values(subjectData.conceptStates) as ConceptState[])
                        .sort((a,b) => a.lastVisited - b.lastVisited)
                        .map(concept => {
                          const expanded = expandedConcepts.has(concept.conceptId);
                          const hasMisconceptions = (concept.confirmedMisconceptions || []).length > 0;
                          return (
                            <div key={concept.conceptId} className={`rounded-2xl border overflow-hidden transition-all ${hasMisconceptions ? 'border-rose-500/30' : 'border-white/10'} bg-white/5`}>
                              <button className="w-full p-4 flex items-center gap-3 text-left" onClick={() => toggleConcept(concept.conceptId)}>
                                {/* Mastery indicator */}
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${MASTERY_COLOR[concept.masteryLevel] || MASTERY_COLOR.not_started}`}>
                                  {concept.masteryScore}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="text-white text-sm font-medium truncate">{concept.label}</p>
                                    {hasMisconceptions && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden max-w-[120px]">
                                      <div className={`h-full ${MASTERY_BAR[concept.masteryLevel] || 'bg-slate-600'} rounded-full`} style={{ width: `${concept.masteryScore}%` }} />
                                    </div>
                                    <span className="text-slate-500 text-xs capitalize">{concept.masteryLevel?.replace('_',' ')}</span>
                                    <span className="text-slate-600 text-xs">· {concept.attemptCount || 0} attempts</span>
                                  </div>
                                </div>
                                {concept.lastVisited ? (
                                  <span className="text-slate-600 text-xs flex-shrink-0">{relativeTime(concept.lastVisited)}</span>
                                ) : null}
                                {expanded ? <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />}
                              </button>

                              {expanded && (
                                <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                                  {hasMisconceptions && (
                                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                                      <p className="text-rose-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5" /> Confirmed Misconceptions
                                      </p>
                                      <ul className="space-y-1">
                                        {concept.confirmedMisconceptions.map((m, i) => (
                                          <li key={i} className="text-rose-200 text-xs flex items-start gap-2">
                                            <span className="text-rose-500 mt-0.5">•</span> {m}
                                          </li>
                                        ))}
                                      </ul>
                                      <p className="text-rose-400/70 text-xs mt-2 italic">💡 Ask your child to explain this concept in their own words.</p>
                                    </div>
                                  )}
                                  {(concept.effectiveStrategies || []).length > 0 && (
                                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                                      <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1.5">What works for {selected.name}</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {concept.effectiveStrategies.map(s => (
                                          <span key={s} className="bg-emerald-500/20 text-emerald-300 text-xs px-2 py-0.5 rounded-lg capitalize">{s.replace(/_/g,' ')}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {(concept.ineffectiveStrategies || []).length > 0 && (
                                    <div className="bg-white/3 rounded-xl p-3">
                                      <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Strategies to avoid</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {concept.ineffectiveStrategies.map(s => (
                                          <span key={s} className="bg-slate-700 text-slate-400 text-xs px-2 py-0.5 rounded-lg capitalize">{s.replace(/_/g,' ')}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Global insights */}
                  {(selected.globalInsights || []).length > 0 && (
                    <div>
                      <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-amber-400" /> AI Insights for Parents
                      </h3>
                      <div className="space-y-2">
                        {selected.globalInsights.slice(-5).map((insight, i) => (
                          <div key={i} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex gap-2">
                            <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <p className="text-slate-300 text-sm">{insight}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
