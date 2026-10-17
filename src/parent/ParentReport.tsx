// ─────────────────────────────────────────────────────────────────
// Parent view — "What Ananta has learned about <child>".
// Plain language, no scores. Every AI-written sentence carries a "See why"
// that opens the child's real answer. Built for a parent first and for a
// 3-minute demo second. Data: GET /api/learners/:id/parent-report (instant),
// then POST .../generate to swap in the Gemini-written letter.
// ─────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Search, CheckCheck, RefreshCw, Target, Eye, Sparkles, Home, CalendarClock,
  ChevronDown, ChevronUp, Loader2, ShieldCheck, Lightbulb, BookOpen, FlaskConical,
} from 'lucide-react';
import { authFetch } from '../firebase/auth';
import type {
  CitedLine, EvidenceCard, ParentReport as Report, StoryStepKind, StoryThread, TopicProgress,
} from './types';

interface LearnerLite { studentId: string; name: string; grade: string; subjects: Record<string, unknown> }

const INK = 'text-[#1E2430]';
const MUTED = 'text-[#5E6675]';
const CARD = 'bg-white border border-[#E8E2D6] rounded-2xl';

function when(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ─── "See why": opens the child's real answer behind a sentence ───
const EvidenceList: React.FC<{ ids: string[]; evidence: Record<string, EvidenceCard>; child: string }> = ({ ids, evidence, child }) => {
  const cards = ids.map((i) => evidence[i]).filter(Boolean);
  if (!cards.length) return null;
  return (
    <div className="mt-2 space-y-2" data-testid="evidence-list">
      {cards.map((c) => (
        <div key={c.id} className="rounded-xl bg-[#F6F3EC] border border-[#E8E2D6] p-3 text-[13px] leading-relaxed select-text">
          <div className={`flex items-center justify-between ${MUTED} text-xs mb-1`}>
            <span>{c.conceptLabel}</span><span>{when(c.at)}</span>
          </div>
          {c.asked && <p className={INK}><span className={MUTED}>Ananta asked: </span>{c.asked}</p>}
          {c.answered && <p className={INK}><span className={MUTED}>{child} said: </span>{c.answered}</p>}
          {c.reasoning && <p className={INK}><span className={MUTED}>{child} explained: </span>{c.reasoning}</p>}
          <p className="mt-1.5 inline-block text-xs font-medium text-[#3730A3] bg-[#E0E7FF] rounded-md px-2 py-0.5">{c.outcome}</p>
        </div>
      ))}
    </div>
  );
};

const SeeWhy: React.FC<{ ids: string[]; evidence: Record<string, EvidenceCard>; child: string; label?: string }> = ({ ids, evidence, child, label = 'See why' }) => {
  const [open, setOpen] = useState(false);
  if (!ids.some((i) => evidence[i])) return null;
  return (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-[#4338CA] bg-[#EEF0FF] hover:bg-[#E0E4FF] rounded-full px-2.5 py-1 align-middle">
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{open ? 'Hide' : label}
      </button>
      {open && <EvidenceList ids={ids} evidence={evidence} child={child} />}
    </>
  );
};

// ─── Understanding journey ───
const Journey: React.FC<{ topics: TopicProgress[] }> = ({ topics }) => (
  <div className="space-y-4">
    {topics.map((t) => (
      <div key={t.conceptId}>
        <div className="flex items-start justify-between gap-3">
          <p className={`${INK} text-[15px] font-medium leading-snug`}>{t.label}</p>
          {t.mixUp === 'open' && <span className="shrink-0 text-xs font-medium text-[#9A3412] bg-[#FFEDD5] rounded-full px-2.5 py-0.5">Working on a mix-up</span>}
          {t.mixUp === 'watching' && <span className="shrink-0 text-xs font-medium text-[#854D0E] bg-[#FEF3C7] rounded-full px-2.5 py-0.5">Keeping an eye on it</span>}
          {t.mixUp === 'fixed' && <span className="shrink-0 text-xs font-medium text-[#166534] bg-[#DCFCE7] rounded-full px-2.5 py-0.5">Mix-up fixed</span>}
        </div>
        <div className="mt-2 flex items-center gap-1.5" role="img" aria-label={`${t.stageLabel}, step ${t.stage} of 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <React.Fragment key={n}>
              <span className={`w-3.5 h-3.5 rounded-full border-2 ${n <= t.stage ? 'bg-[#4F46E5] border-[#4F46E5]' : 'bg-white border-[#CFC8B8]'}`} />
              {n < 5 && <span className={`h-0.5 flex-1 ${n < t.stage ? 'bg-[#4F46E5]' : 'bg-[#E1DBCD]'}`} />}
            </React.Fragment>
          ))}
        </div>
        <p className={`mt-1.5 text-[13px] ${MUTED}`}>{t.stageLabel} · {t.answersChecked} answer{t.answersChecked === 1 ? '' : 's'} checked · last {when(t.lastAt)}</p>
      </div>
    ))}
    <p className={`text-xs ${MUTED}`}>Steps: recognises it → explains why → solves new problems → uses it in unfamiliar situations → can teach it back.</p>
  </div>
);

// ─── How Ananta figured the child out ───
const STEP_ICON: Record<StoryStepKind, React.ReactNode> = {
  noticed: <Search className="w-4 h-4" />, confirmed: <CheckCheck className="w-4 h-4" />,
  changed: <RefreshCw className="w-4 h-4" />, fixed: <Target className="w-4 h-4" />, watching: <Eye className="w-4 h-4" />,
};
const STEP_TONE: Record<StoryStepKind, string> = {
  noticed: 'bg-[#E0E7FF] text-[#3730A3]', confirmed: 'bg-[#FFEDD5] text-[#9A3412]',
  changed: 'bg-[#EDE9FE] text-[#5B21B6]', fixed: 'bg-[#DCFCE7] text-[#166534]', watching: 'bg-[#FEF3C7] text-[#854D0E]',
};

const Story: React.FC<{ thread: StoryThread; evidence: Record<string, EvidenceCard>; child: string }> = ({ thread, evidence, child }) => (
  <div className={`${CARD} p-4 sm:p-5`} data-testid="story-thread">
    <p className={`text-xs uppercase tracking-wide font-semibold ${MUTED}`}>{thread.conceptLabel}</p>
    <p className={`${INK} text-[14px] mt-1 mb-4 leading-snug`}><span className={MUTED}>The mix-up: </span>{thread.mixUp}</p>
    <ol className="relative space-y-4 ml-1">
      {thread.steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={`w-8 h-8 rounded-full grid place-items-center ${STEP_TONE[s.kind]}`}>{STEP_ICON[s.kind]}</span>
            {i < thread.steps.length - 1 && <span className="w-0.5 flex-1 bg-[#E1DBCD] mt-1" />}
          </div>
          <div className="flex-1 pb-1 min-w-0">
            <p className={`${INK} text-[15px] font-semibold leading-tight`}>{s.title} <span className={`font-normal text-xs ${MUTED}`}>· {when(s.at)}</span></p>
            <p className={`${INK} text-[14px] leading-relaxed mt-0.5 select-text`}>{s.caption}</p>
            <SeeWhy ids={s.evidenceIds} evidence={evidence} child={child} label="See the moment" />
          </div>
        </li>
      ))}
    </ol>
  </div>
);

// ─── Page ───
interface Props { onBack: () => void; initialStudentId?: string; onUnderTheHood: () => void }

export const ParentReport: React.FC<Props> = ({ onBack, initialStudentId, onUnderTheHood }) => {
  const [learners, setLearners] = useState<LearnerLite[]>([]);
  const [studentId, setStudentId] = useState<string | null>(initialStudentId || null);
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  useEffect(() => {
    authFetch('/api/learners').then((r) => r.json()).then((j) => {
      const list: LearnerLite[] = (j.learners || []).filter((l: LearnerLite) => Object.keys(l.subjects || {}).length > 0);
      setLearners(list);
      setStudentId((cur) => (cur && list.some((l) => l.studentId === cur)) ? cur : (list[0]?.studentId ?? null));
      if (!list.length) setLoading(false);
    }).catch(() => { setError('Could not load learners.'); setLoading(false); });
  }, []);

  const load = useCallback(async (id: string, subj?: string) => {
    const seq = ++reqSeq.current;
    setLoading(true); setError(null); setReport(null);
    try {
      const q = subj ? `?subjectId=${encodeURIComponent(subj)}` : '';
      const res = await authFetch(`/api/learners/${encodeURIComponent(id)}/parent-report${q}`);
      if (res.status === 404) { if (seq === reqSeq.current) { setReport(null); setLoading(false); } return; }
      const { report: r } = await res.json() as { report: Report };
      if (seq !== reqSeq.current) return;
      setReport(r); setLoading(false);
      if (r.narrativeStale) {
        setWriting(true);
        try {
          const g = await authFetch(`/api/learners/${encodeURIComponent(id)}/parent-report/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subjectId: r.subjectId }),
          });
          if (g.ok && seq === reqSeq.current) setReport((await g.json()).report);
        } catch { /* keep the offline version */ }
        if (seq === reqSeq.current) setWriting(false);
      }
    } catch {
      if (seq === reqSeq.current) { setError('Could not load the report.'); setLoading(false); }
    }
  }, []);

  useEffect(() => { if (studentId) load(studentId, subjectId); }, [studentId, subjectId, load]);

  const child = report?.childName || 'your child';
  const fixed = useMemo(() => report?.story.filter((s) => s.state === 'fixed').length ?? 0, [report]);

  return (
    <div className="min-h-app bg-[#FBF8F3]" style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
      <header className="sticky top-0 z-10 bg-[#FBF8F3]/95 backdrop-blur border-b border-[#E8E2D6]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} aria-label="Back" className={`${MUTED} hover:text-[#1E2430] p-1 -ml-1`}><ArrowLeft className="w-5 h-5" /></button>
          <img src="/brand/ananta-emblem-192.png" alt="" aria-hidden="true" className="w-9 h-9 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0">
            <p className={`${INK} font-semibold leading-tight whitespace-nowrap`}>Ananta · Parent view</p>
            <p className={`text-xs ${MUTED} hidden sm:block`}>Where every question opens infinity</p>
          </div>
          <div className="flex rounded-full bg-[#EFEAE0] p-0.5 text-xs font-medium" role="tablist">
            <span className="px-3 py-1.5 rounded-full bg-white shadow-sm text-[#1E2430]" role="tab" aria-selected>Parent view</span>
            <button onClick={onUnderTheHood} className="px-3 py-1.5 rounded-full text-[#5E6675] hover:text-[#1E2430]" role="tab">Under the hood</button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {learners.length > 1 && (
          <div className="flex gap-2 flex-wrap" aria-label="Choose a child">
            {learners.map((l) => (
              <button key={l.studentId} onClick={() => { setSubjectId(undefined); setStudentId(l.studentId); }}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium border ${studentId === l.studentId ? 'bg-[#4F46E5] text-white border-[#4F46E5]' : 'bg-white text-[#1E2430] border-[#E8E2D6] hover:border-[#CFC8B8]'}`}>
                {l.name}
              </button>
            ))}
          </div>
        )}

        {loading && <div className="py-16 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-[#4F46E5]" /></div>}
        {error && <p className="text-sm text-[#9A3412] bg-[#FFEDD5] rounded-xl p-3">{error}</p>}
        {!loading && !report && !error && (
          <div className={`${CARD} p-8 text-center`}>
            <BookOpen className={`w-8 h-8 mx-auto mb-2 ${MUTED}`} />
            <p className={`${INK} font-medium`}>No lessons to report on yet.</p>
            <p className={`text-sm ${MUTED} mt-1`}>Once your child has had a lesson with Ananta, what it learns about them appears here.</p>
          </div>
        )}

        {report && (<>
          {/* Title */}
          <section>
            {report.simulated && (
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[#854D0E] bg-[#FEF3C7] rounded-full px-2.5 py-1 mb-2" data-testid="simulated-badge">
                <FlaskConical className="w-3.5 h-3.5" /> Simulated learner · demo data
              </p>
            )}
            <h1 className={`${INK} text-[26px] leading-tight font-semibold`} style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
              What Ananta has learned about {child}
            </h1>
            <p className={`text-sm ${MUTED} mt-1`}>{report.grade}{report.board ? ` · ${report.board}` : ''} · {report.subjectLabel}</p>
            {report.availableSubjects.length > 1 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {report.availableSubjects.map((s) => (
                  <button key={s.subjectId} onClick={() => setSubjectId(s.subjectId)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${report.subjectId === s.subjectId ? 'bg-[#1E2430] text-white border-[#1E2430]' : 'bg-white text-[#1E2430] border-[#E8E2D6]'}`}>{s.label}</button>
                ))}
              </div>
            )}
          </section>

          {report.stats.answersChecked === 0 && (
            <section className={`${CARD} p-8 text-center`} data-testid="no-lessons">
              <BookOpen className={`w-8 h-8 mx-auto mb-2 ${MUTED}`} />
              <p className={`${INK} font-medium`}>No lessons in {report.subjectLabel} yet.</p>
              <p className={`text-sm ${MUTED} mt-1`}>Once {child} has a lesson with Ananta in this subject, what Ananta learns appears here.</p>
            </section>
          )}

          {report.stats.answersChecked > 0 && (<>
          {/* 0. Ananta's plan for the next lesson - first, because it is what makes Ananta different: the plan is built from this child's own answers */}
          {report.nextLesson && (
            <section className="rounded-2xl border-2 border-[#4F46E5] bg-[#F5F6FF] p-5 shadow-sm" data-testid="next-lesson">
              <h2 className="text-[#3730A3] text-lg font-semibold flex items-center gap-2" style={{ fontFamily: 'Georgia, serif' }}>
                <CalendarClock className="w-5 h-5" />Ananta's plan for {child}'s next lesson
              </h2>
              <p className={`text-sm ${MUTED} mb-3`}>Built from {child}'s own answers so far, not a fixed course.</p>
              <p className={`${INK} text-[18px] font-semibold mb-3`} style={{ fontFamily: 'Georgia, serif' }}>{report.nextLesson.focus}</p>
              <ul className="space-y-2">
                {report.nextLesson.willDo.map((w, i) => (
                  <li key={i} className={`${INK} text-[15px] leading-relaxed flex gap-2`}><span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#4F46E5] shrink-0" />{w}</li>
                ))}
              </ul>
              {report.nextLesson.keepAnEyeOn.length > 0 && (
                <div className="mt-4 rounded-xl bg-[#FEF8E7] border border-[#F3E3B0] p-3">
                  <p className="text-xs font-semibold text-[#854D0E] mb-1 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Ananta will watch for</p>
                  {report.nextLesson.keepAnEyeOn.map((t, i) => <p key={i} className={`text-[13.5px] ${INK} leading-snug`}>{t}</p>)}
                </div>
              )}
              <p className={`text-xs ${MUTED} mt-3`}>This is the plan Ananta really builds before each lesson, from everything below. The next lesson follows it.</p>
            </section>
          )}

          {/* 0b. The lesson that just happened - a parent opening the page after a lesson looks for it first */}
          {report.latestLesson && (
            <section className={`${CARD} p-5`} data-testid="latest-lesson">
              <h2 className={`${INK} text-lg font-semibold flex items-center gap-2`} style={{ fontFamily: 'Georgia, serif' }}>
                <BookOpen className="w-5 h-5 text-[#4F46E5]" />{child}'s latest lesson
              </h2>
              <p className={`text-sm ${MUTED} mb-3`}>
                {when(report.latestLesson.at)}
                {report.latestLesson.minutes ? ` · ${report.latestLesson.minutes} min` : ''}
                {` · ${report.latestLesson.answersChecked} answer${report.latestLesson.answersChecked === 1 ? '' : 's'} checked`}
                {report.latestLesson.answersChecked > 0 ? `, ${report.latestLesson.explained} explained in ${child}'s own words` : ''}
              </p>
              <p className={`${INK} text-[17px] font-semibold mb-2`} style={{ fontFamily: 'Georgia, serif' }}>{report.latestLesson.topics.join(' · ')}</p>
              {report.latestLesson.notes.length > 0 && (
                <div className="mt-3 rounded-xl bg-[#F6F3EC] border border-[#E8E2D6] p-3">
                  <p className={`text-xs font-semibold ${MUTED} mb-2 flex items-center gap-1.5`}><Eye className="w-3.5 h-3.5" />What Ananta noticed during the lesson</p>
                  <ul className="space-y-2">
                    {report.latestLesson.notes.map((n, i) => (
                      <li key={i} className={`text-[14px] ${INK} leading-snug`}>
                        {n.text}
                        {n.childSaid && <span className={`block text-[12.5px] ${MUTED} italic mt-0.5`}>{child} said: “{n.childSaid}”</span>}
                      </li>
                    ))}
                  </ul>
                  <p className={`text-[11.5px] ${MUTED} mt-2`}>Live notes Ananta made while listening. They guide the lesson; only checked answers change what Ananta records about {child}.</p>
                </div>
              )}
              {report.latestLesson.evidenceIds.length > 0 && (
                <div className="mt-2"><SeeWhy ids={report.latestLesson.evidenceIds} evidence={report.evidence} child={child} label={`See ${child}'s answers from this lesson`} /></div>
              )}
            </section>
          )}

          {/* 1. The letter */}
          <section className={`${CARD} p-5`} data-testid="letter">
            <div className="flex items-center justify-between mb-3">
              <h2 className={`text-xs uppercase tracking-wide font-semibold ${MUTED}`}>In a few sentences</h2>
              {writing
                ? <span className="inline-flex items-center gap-1.5 text-xs text-[#4338CA]"><Loader2 className="w-3.5 h-3.5 animate-spin" />Ananta is writing this…</span>
                : report.narrative.source === 'ai'
                  ? <span className="inline-flex items-center gap-1 text-xs font-medium text-[#4338CA] bg-[#EEF0FF] rounded-full px-2 py-0.5"><Sparkles className="w-3 h-3" />Written by Gemini</span>
                  : null}
            </div>
            <div className="space-y-3">
              {report.narrative.letter.map((l: CitedLine, i: number) => (
                <div key={i} className={`${INK} text-[16px] leading-relaxed select-text`} style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                  {l.text}<SeeWhy ids={l.evidenceIds} evidence={report.evidence} child={child} />
                </div>
              ))}
            </div>
            <p className={`text-xs ${MUTED} mt-4 flex gap-1.5`}>
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{report.narrative.source === 'ai'
                ? `Written by Gemini from ${report.narrative.basedOnAnswers} of ${child}'s answers. Any sentence that could not point to a real answer was removed${report.narrative.rejectedLines ? ` (${report.narrative.rejectedLines} removed this time)` : ''}.`
                : `Summarised from ${child}'s recorded answers. Tap “See why” on any line to see the answer behind it.`}</span>
            </p>
          </section>

          {/* 2. Numbers strip */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="At a glance">
            {[
              { v: report.stats.lessons, l: 'lessons' },
              { v: report.stats.minutes, l: 'minutes learning' },
              { v: report.stats.answersChecked, l: 'answers checked' },
              { v: report.stats.mixUpsFixed, l: fixed === 1 || report.stats.mixUpsFixed === 1 ? 'mix-up fixed' : 'mix-ups fixed' },
            ].map((s) => (
              <div key={s.l} className={`${CARD} px-3 py-3 text-center`}>
                <p className={`${INK} text-2xl font-semibold`}>{s.v}</p>
                <p className={`text-xs ${MUTED}`}>{s.l}</p>
              </div>
            ))}
            {report.stats.helpMoments > 0 && (
              <p className={`col-span-2 sm:col-span-4 text-[13px] ${MUTED} px-1`}>
                {child} told Ananta “I don’t get it” or asked for help {report.stats.helpMoments} time{report.stats.helpMoments === 1 ? '' : 's'}. Ananta treats that as a cue to explain differently, never as a problem.
              </p>
            )}
          </section>

          {/* 4. How Ananta figured the child out */}
          {report.story.length > 0 && (
            <section className="space-y-3" data-testid="story">
              <div>
                <h2 className={`${INK} text-lg font-semibold`} style={{ fontFamily: 'Georgia, serif' }}>How Ananta figured {child} out</h2>
                <p className={`text-sm ${MUTED}`}>A right-sounding answer can hide a wrong idea. This is how Ananta finds out, and what it does about it.</p>
              </div>
              {report.story.map((t) => <Story key={t.key} thread={t} evidence={report.evidence} child={child} />)}
            </section>
          )}

          {/* 7. Home tip */}
          <section className="rounded-2xl bg-[#EEF0FF] border border-[#D5DAFF] p-5" data-testid="home-tip">
            <h2 className="text-xs uppercase tracking-wide font-semibold text-[#3730A3] mb-1 flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5" />Try this at home · {report.narrative.homeTip.minutes} minutes
              {report.narrative.homeTip.source === 'ai' && <Sparkles className="w-3 h-3" />}
            </h2>
            <p className={`${INK} text-[17px] font-semibold mb-2`} style={{ fontFamily: 'Georgia, serif' }}>{report.narrative.homeTip.title}</p>
            <ol className="space-y-2 list-decimal ml-5">
              {report.narrative.homeTip.steps.map((s, i) => <li key={i} className={`${INK} text-[14.5px] leading-relaxed pl-1 select-text`}>{s}</li>)}
            </ol>
          </section>

          {/* 5. What works */}
          {report.narrative.worksFor.length > 0 && (
            <section className={`${CARD} p-5`}>
              <h2 className={`text-xs uppercase tracking-wide font-semibold ${MUTED} mb-3 flex items-center gap-1.5`}><Lightbulb className="w-3.5 h-3.5" />What seems to help {child}</h2>
              <ul className="space-y-2.5">
                {report.narrative.worksFor.map((l, i) => (
                  <li key={i} className={`${INK} text-[15px] leading-relaxed select-text`}>{l.text}<SeeWhy ids={l.evidenceIds} evidence={report.evidence} child={child} /></li>
                ))}
              </ul>
              <p className={`text-xs ${MUTED} mt-3`}>This describes what has helped so far with these topics. It is not a label for how {child} “is”, and Ananta keeps testing it.</p>
            </section>
          )}

          {/* 3. Journey */}
          {report.journey.length > 0 && (
            <section className={`${CARD} p-5`}>
              <h2 className={`text-xs uppercase tracking-wide font-semibold ${MUTED} mb-4`}>{child}'s understanding, topic by topic</h2>
              <Journey topics={report.journey} />
            </section>
          )}

          </>)}

          <footer className={`text-xs ${MUTED} pb-8 leading-relaxed`}>
            <p className="font-medium text-[#1E2430] mb-0.5">How Ananta knows</p>
            After every answer, Ananta checks <em>how</em> {child} got there, not just whether it was right. It only calls something a mix-up after seeing it twice, and it counts a mix-up as fixed only when {child} uses the idea in a question they have not seen before. {child} can also tell Ananta “that’s not right” about anything it thinks.
          </footer>
        </>)}
      </main>
    </div>
  );
};
