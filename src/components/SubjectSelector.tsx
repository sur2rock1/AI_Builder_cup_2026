import React, { useState, useEffect } from 'react';
import {
  Sparkles, BookOpen, PenLine, GraduationCap, CheckCircle2, Lock, Upload, ArrowUpRight,
} from 'lucide-react';
import type { StudentProfile } from './LoginScreen';
import { authFetch } from '../firebase/auth';
import { LumenOrb } from './LumenOrb';

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
  onSelectSubjectConcept: (subjectId: string, subjectLabel: string, conceptId: string, conceptLabel: string, grade: string, intent?: string) => void;
  onLogout: () => void;
  onSignOut?: () => void;
  onUploadCurriculum: () => void;
  onParentPortal?: () => void;
}

type Intent = 'learn' | 'homework' | 'exam' | 'writing';

export const SubjectSelector: React.FC<SubjectSelectorProps> = ({
  student, onSelectSubjectConcept, onLogout, onSignOut, onUploadCurriculum,
}) => {
  const [subjects, setSubjects] = useState<SubjectMeta[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [intent, setIntent] = useState<Intent>('learn');
  const [minutes, setMinutes] = useState(15);
  const [picking, setPicking] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<SubjectMeta | null>(null);
  const [conceptProgress, setConceptProgress] = useState<Record<string, ConceptProgress>>({});

  useEffect(() => {
    Promise.all([
      authFetch('/api/curricula').then(r => r.json()).catch(() => fetch('/api/curricula').then(r => r.json())),
    ]).then(([curriculaJson]) => {
      const list: SubjectMeta[] = curriculaJson.curricula || [];
      setSubjects(list);
      setEnrolledIds(curriculaJson.enrolledIds || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSubject) return;
    const studentSubject = student.subjects?.[selectedSubject.subjectId];
    setConceptProgress((studentSubject?.conceptStates as Record<string, ConceptProgress>) || {});
  }, [selectedSubject, student]);

  const enrolled = enrolledIds.length
    ? subjects.filter(s => enrolledIds.includes(s.subjectId))
    : subjects;
  const continueSubject = enrolled[0] || subjects[0] || null;
  const firstName = student.name.split(' ')[0];
  const returning = enrolled.length > 0;

  const startSubject = (sub: SubjectMeta, nextIntent = intent) => {
    const concepts = [...sub.concepts].sort((a, b) => (a.typicalTeachingOrder || 99) - (b.typicalTeachingOrder || 99));
    const next = concepts.find(c => (conceptProgress[c.id]?.masteryScore || 0) < 80) || concepts[0];
    if (!next) return;
    onSelectSubjectConcept(sub.subjectId, sub.label, next.id, next.label, student.grade, nextIntent);
  };

  const isUnlocked = (concept: { prerequisites?: string[] }) => {
    if (!concept.prerequisites?.length) return true;
    return concept.prerequisites.every(id => (conceptProgress[id]?.masteryScore || 0) >= 40);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fcf9f3] flex items-center justify-center" style={{ fontFamily: 'Lexend, system-ui, sans-serif' }}>
        <p className="text-[#6e7976]">Opening Lumen…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcf9f3] text-[#1c1c18] flex flex-col" style={{ fontFamily: 'Lexend, system-ui, sans-serif' }}>
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2.5">
          <LumenOrb size={36} active />
          <span className="text-[18px] font-semibold tracking-tight">Lumen</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onUploadCurriculum} className="text-[12px] text-[#6e7976] hover:text-[#1c1c18] px-3 py-1.5 rounded-full border border-[#e5e2dc]">
            Add materials
          </button>
          <span className="px-3 py-1.5 rounded-full bg-white border border-[#e5e2dc] text-[12px] text-[#3e4946]">
            {firstName} · {student.grade.split('(')[0].trim()}
          </span>
          <button onClick={onSignOut || onLogout} className="text-[12px] text-[#6e7976] hover:text-[#1c1c18] px-3 py-1.5">
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 px-8 pb-10 max-w-[1280px] w-full mx-auto">
        <p className="text-[12px] text-[#6e7976] mb-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1b7a6e]" />
          {returning ? `Welcome back, ${firstName}` : 'Welcome to Lumen'}
        </p>
        <h1 className="text-[40px] font-semibold tracking-tight leading-tight mb-1">
          What do you need today, {firstName}?
        </h1>
        <p className="text-[#6e7976] text-[15px] mb-8">
          {returning ? 'Picked from your last sessions.' : 'Explore a curiosity, or pick a classroom that is already ready.'}
        </p>

        {!picking && !selectedSubject && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <IntentCard
                featured
                icon={continueSubject ? <BookOpen className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                title={continueSubject ? `Continue ${continueSubject.label}` : 'Learn something new'}
                subtitle={continueSubject ? 'Pick up where you left the last picture.' : 'Explore curiosities, ideas, or big questions'}
                badge={continueSubject ? 'Active' : undefined}
                onClick={() => {
                  setIntent('learn');
                  if (continueSubject && returning) startSubject(continueSubject, 'learn');
                  else setPicking(true);
                }}
              />
              <IntentCard
                icon={<PenLine className="w-5 h-5" />}
                title="Homework help"
                subtitle="Work through assignments step by step"
                onClick={() => { setIntent('homework'); setPicking(true); }}
              />
              <IntentCard
                icon={<GraduationCap className="w-5 h-5" />}
                title="Exam prep"
                subtitle="Practice concepts with calming, guided check-ins"
                onClick={() => { setIntent('exam'); setPicking(true); }}
              />
              <IntentCard
                icon={<BookOpen className="w-5 h-5" />}
                title="Writing help"
                subtitle="Draft thoughts, stories, or clear essays"
                onClick={() => { setIntent('writing'); setPicking(true); }}
              />
            </div>

            <aside className="bg-white rounded-[28px] border border-[#e5e2dc] p-6 flex flex-col items-center">
              <LumenOrb size={120} active />
              <p className="mt-4 text-[16px] font-medium">Lumen is listening…</p>
              <p className="text-[13px] text-[#6e7976] mt-1">Ready whenever you speak</p>
              <p className="mt-6 text-[11px] uppercase tracking-[0.14em] text-[#6e7976] self-start">Lesson length</p>
              <div className="mt-2 w-full flex bg-[#f6f3ed] rounded-full p-1">
                {[10, 15, 20].map(n => (
                  <button key={n} onClick={() => setMinutes(n)}
                    className={`flex-1 py-1.5 rounded-full text-[13px] ${minutes === n ? 'bg-[#1b7a6e] text-white' : 'text-[#3e4946]'}`}>
                    {n} min
                  </button>
                ))}
              </div>
              <button
                onClick={() => continueSubject ? startSubject(continueSubject, intent) : setPicking(true)}
                className="mt-5 w-full bg-[#1b7a6e] hover:bg-[#16675d] text-white rounded-full py-3 text-[15px] font-medium">
                Start session
              </button>
            </aside>
          </div>
        )}

        {(picking || selectedSubject) && (
          <div>
            <button onClick={() => { setPicking(false); setSelectedSubject(null); }}
              className="text-[13px] text-[#6e7976] hover:text-[#1c1c18] mb-5">← Back</button>

            {!selectedSubject ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
                {subjects.map(sub => (
                  <button key={sub.subjectId} onClick={() => setSelectedSubject(sub)}
                    className="text-left bg-white hover:border-[#1b7a6e] border border-[#e5e2dc] rounded-[22px] p-5">
                    <p className="font-semibold text-[17px]">{sub.label}</p>
                    <p className="text-[13px] text-[#6e7976] mt-1">{sub.grade} · {sub.conceptCount} chapters</p>
                  </button>
                ))}
                <button onClick={onUploadCurriculum}
                  className="text-left border border-dashed border-[#bdc9c5] rounded-[22px] p-5 text-[#6e7976] hover:text-[#1b7a6e]">
                  <Upload className="w-5 h-5 mb-2" />
                  Add another subject
                </button>
              </div>
            ) : (
              <div>
                <p className="text-[12px] uppercase tracking-[0.16em] text-[#6e7976] mb-1">{selectedSubject.label}</p>
                <h2 className="text-[28px] font-semibold mb-5">Let’s make {selectedSubject.label.toLowerCase()} feel friendly.</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...selectedSubject.concepts].sort((a, b) => (a.typicalTeachingOrder || 99) - (b.typicalTeachingOrder || 99)).map((concept, idx) => {
                  const prog = conceptProgress[concept.id];
                  const unlocked = isUnlocked(concept);
                  const score = prog?.masteryScore || 0;
                  const featured = unlocked && score > 0 && score < 80;
                  return (
                    <button key={concept.id} disabled={!unlocked}
                      onClick={() => unlocked && onSelectSubjectConcept(
                        selectedSubject.subjectId, selectedSubject.label,
                        concept.id, concept.label, student.grade, intent,
                      )}
                      className={`text-left bg-white rounded-[22px] p-5 min-h-[168px] flex flex-col ${
                        featured ? 'border-2 border-[#f3c77a]' : 'border border-[#e5e2dc]'} ${
                        unlocked ? 'hover:border-[#1b7a6e]' : 'opacity-50 cursor-not-allowed'}`}>
                      <div className="flex items-center justify-between text-[12px] text-[#6e7976] mb-6">
                        <span>{featured ? "Lumen’s gentle pick" : unlocked ? 'Ready to practice' : 'Locked'}</span>
                        <span>Card {String(idx + 1).padStart(2, '0')}</span>
                      </div>
                      <p className="text-[20px] font-semibold leading-snug">{concept.label}</p>
                      <p className="text-[13px] text-[#6e7976] mt-1 flex-1">
                        {unlocked ? 'No grades, no ticking pressure. Pick where we should start exploring together.' : 'Finish the earlier chapter first.'}
                      </p>
                      <div className="mt-4">
                        <div className="flex justify-between text-[11px] text-[#6e7976] mb-1">
                          <span>{score >= 80 ? 'Solid start' : score > 0 ? 'Gaining shape' : 'New ground'}</span>
                          <span>{score}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#efeae2]">
                          <div className={`h-full rounded-full ${score >= 80 ? 'bg-[#1b7a6e]' : featured ? 'bg-[#d8a24a]' : 'bg-[#6ec8c0]'}`}
                               style={{ width: `${Math.max(score, 6)}%` }} />
                        </div>
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

const IntentCard: React.FC<{
  featured?: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}> = ({ featured, icon, title, subtitle, badge, onClick }) => (
  <button onClick={onClick}
    className={`text-left rounded-[24px] p-5 min-h-[132px] flex flex-col justify-between transition-colors ${
      featured
        ? 'bg-[#1b7a6e] text-white'
        : 'bg-white text-[#1c1c18] border border-[#e5e2dc] hover:border-[#1b7a6e]/40'}`}>
    <div className="flex items-center justify-between">
      <span className={`w-9 h-9 rounded-full grid place-items-center ${featured ? 'bg-white/15' : 'bg-[#f6f3ed] text-[#1b7a6e]'}`}>
        {icon}
      </span>
      {badge
        ? <span className="text-[11px] uppercase tracking-wider opacity-80 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{badge}</span>
        : <ArrowUpRight className={`w-4 h-4 ${featured ? 'text-white/70' : 'text-[#bdc9c5]'}`} />}
    </div>
    <div>
      <p className="text-[18px] font-semibold">{title}</p>
      <p className={`text-[13px] mt-1 ${featured ? 'text-white/75' : 'text-[#6e7976]'}`}>{subtitle}</p>
    </div>
  </button>
);
