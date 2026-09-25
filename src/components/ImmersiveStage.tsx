import React from 'react';
import { Mic, MicOff, Target, ChevronRight, HelpCircle, Repeat, Gauge, Hand } from 'lucide-react';
import { ScenePanel, PanelMode } from './ScenePanel';
import { SceneDef } from '../scenes/pythagorasScenes';
import { Scene3DData } from '../types';
import { FigureSpec, FigurePart, StudentThinking, LiveAssessment, BoardNote } from './TeachingCanvas';
import type { LearnerSnapshot, Level } from '../adaptive/liveObserver';
import { LumenOrb } from './LumenOrb';

const LEVEL_TEXT: Record<Level, string> = {
  not_yet_seen: 'Just getting started',
  recognises: 'Recognises it',
  explains: 'Can explain why',
  applies: 'Can use it on new problems',
  transfers: 'Uses it in new situations',
};

// ─────────────────────────────────────────────────────────────────
// ImmersiveStage — the lesson as a place, not a dashboard.
//
// Lumen is an orb, never a human avatar. The board is the visual;
// the orb is presence (idle glow / voice motion / thinking spin).
// ─────────────────────────────────────────────────────────────────

interface Props {
  conceptLabel: string;
  subject: string;
  grade: string;
  figure: FigureSpec;
  revealed: FigurePart[];
  focusPart: FigurePart | null;
  studentThinking: StudentThinking | null;
  assessment: LiveAssessment | null;
  notes: BoardNote | null;
  liveNotes?: string[];
  masteryScore: number;
  misconceptions: Array<{ id: string; text: string; status: string }>;
  isLessonActive: boolean;
  isSpeaking: boolean;
  isThinking?: boolean;
  /** Live learner picture from the observer; null until the child has spoken. */
  learner?: LearnerSnapshot | null;
  mouthOpenness: number;
  micLevel: number;
  panelMode: PanelMode;
  scene: SceneDef;
  scene3d?: Scene3DData;
  tutorLine?: string;
  studentName?: string;
  onPanelModeChange: (m: PanelMode) => void;
  onConfusion: (signal: string) => void;
  onToggleLesson: () => void;
  onChangeTopic: () => void;
  onOpenProfile: () => void;
}

export const ImmersiveStage: React.FC<Props> = ({
  conceptLabel, subject, grade, figure, revealed, focusPart,
  studentThinking, assessment, notes, liveNotes, masteryScore, misconceptions,
  isLessonActive, isSpeaking, isThinking, learner, mouthOpenness, micLevel,
  panelMode, scene, scene3d, tutorLine, studentName,
  onPanelModeChange, onConfusion, onToggleLesson, onChangeTopic, onOpenProfile,
}) => {
  return (
    <div className="w-full h-full flex flex-col bg-[#0C0F16] text-white overflow-hidden">

      {/* ── The only chrome: breadcrumb, change, progress ────── */}
      <div className="shrink-0 h-14 px-5 flex items-center justify-between bg-[#0C0F16] border-b border-white/[0.07]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-[10px] shrink-0 grid place-items-center text-[15px]"
               style={{ background: 'linear-gradient(135deg,#7C6CFF,#4ADE80)' }}>◆</div>
          <div className="flex items-center gap-2.5 text-[13.5px] min-w-0">
            <span className="text-white font-semibold">{subject || 'Maths'}</span>
            <span className="text-white/25">•</span><span className="text-white/50">{grade}</span>
            <span className="text-white/25">•</span>
            <span className="text-white/85 truncate">{conceptLabel}</span>
            <button onClick={onChangeTopic}
              className="ml-1 px-2.5 py-1 rounded-lg bg-white/[0.07] hover:bg-white/[0.13] border border-white/10 text-[12px] text-white/70 cursor-pointer transition-colors shrink-0">
              Change
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-[#7C6CFF]" />
            <span className="text-[11px] uppercase tracking-[0.14em] text-white/40 font-semibold">Understanding</span>
            <div className="w-28 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                   style={{ width: `${Math.max(3, masteryScore)}%`, background: 'linear-gradient(90deg,#4ADE80,#7C6CFF)' }} />
            </div>
          </div>
          <button onClick={onOpenProfile}
            className="px-3 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.13] border border-white/10 text-[12.5px] text-white/75 cursor-pointer transition-colors">
            {studentName || 'Progress'}
          </button>
        </div>
      </div>

      {/* ── Stage + rail ───────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex">

        {/* THE STAGE */}
        <div className="flex-1 min-w-0 relative overflow-hidden">

          <AmbientStage />
          <div className="absolute inset-0 pointer-events-none"
               style={{ background: 'linear-gradient(90deg, rgba(6,9,18,.10) 0%, rgba(6,9,18,.0) 30%, rgba(6,9,18,.45) 100%)' }} />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#060912] to-transparent pointer-events-none" />

          <div className="absolute left-[4%] top-[14%] w-[26%] flex flex-col items-center">
            <LumenOrb size={210} speaking={isSpeaking} level={mouthOpenness} active={isLessonActive} thinking={!!isThinking} />
            <div className="mt-5 text-center">
              <div className="text-[19px] font-semibold text-white">Lumen</div>
              <div className="text-[13px] text-white/55 mt-0.5">
                {isThinking ? 'thinking about what you said…' : isSpeaking ? 'speaking…' : isLessonActive ? 'listening' : 'ready when you are'}
              </div>
            </div>
          </div>

          {/* ── The lens: real world → shape → 3D ───────────────── */}
          <div className="absolute right-[2.5%] top-[5%] w-[66%] aspect-[16/10] max-h-[80%]">
            <ScenePanel
              mode={panelMode}
              onModeChange={onPanelModeChange}
              scene={scene}
              figure={figure}
              revealed={revealed}
              focusPart={focusPart}
              studentThinking={studentThinking}
              scene3d={scene3d}
              conceptLabel={conceptLabel}
              isLessonActive={isLessonActive}
              notes={notes}
              liveNotes={liveNotes}
            />
          </div>

          {/* what the tutor just said — as a subtitle under the picture */}
          {isThinking && (
            <div className="absolute right-[2.5%] w-[66%] bottom-[11%] z-10 flex justify-center pointer-events-none">
              <p className="px-5 py-2.5 rounded-2xl bg-black/50 backdrop-blur-md text-[16px] text-white/85 flex items-center gap-2.5">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                Lumen heard you — thinking about your answer
              </p>
            </div>
          )}
          {tutorLine && !isThinking && (
            <div className="absolute right-[2.5%] w-[66%] bottom-[11%] z-10 flex justify-center pointer-events-none">
              <p className="max-w-[88%] text-center text-[17px] leading-snug text-white/95 px-5 py-2.5 rounded-2xl bg-black/50 backdrop-blur-md line-clamp-3">
                {tutorLine}
              </p>
            </div>
          )}

          {/* session controls */}
          <div className="absolute left-0 right-0 bottom-0 px-5 py-3 flex items-center gap-3 bg-gradient-to-t from-[#0A0D15] to-transparent">
            <button onClick={onToggleLesson}
              className={`px-5 py-2.5 rounded-full text-[14px] font-semibold flex items-center gap-2 cursor-pointer transition-colors ${
                isLessonActive ? 'bg-[#E0483C] hover:bg-[#C93A2F] text-white' : 'bg-[#7C6CFF] hover:bg-[#6A58F5] text-white'}`}>
              {isLessonActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {isLessonActive ? 'End session' : 'Start session'}
            </button>
            <div className="flex items-center gap-1 h-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className="w-[3px] rounded-full transition-all duration-75"
                      style={{ height: isLessonActive && i < Math.round(micLevel * 9) ? '100%' : '25%',
                               background: isLessonActive && i < Math.round(micLevel * 9) ? '#4ADE80' : 'rgba(255,255,255,0.18)' }} />
              ))}
            </div>
            <span className="text-[12px] text-white/40">{isLessonActive ? 'Listening — speak or interrupt anytime' : 'Mic off'}</span>

            <div className="ml-auto flex items-center gap-2">
              {[{ i: HelpCircle, t: "I don't get it", s: 'dont_understand' },
                { i: Repeat, t: 'Another way', s: 'repeat_differently' },
                { i: Gauge, t: 'Too fast', s: 'too_fast' },
                { i: Hand, t: 'I guessed', s: 'guessed' }].map(({ i: Icon, t, s }) => (
                <button key={s} onClick={() => onConfusion(s)} disabled={!isLessonActive}
                  className="px-3 py-1.5 rounded-full bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-[13px] text-white/80 flex items-center gap-1.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <Icon className="w-3 h-3 text-[#7C6CFF]" />{t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right rail: what we're working on (not a chat log) ── */}
        <aside className="w-[310px] shrink-0 bg-[#10141D] border-l border-white/[0.07] flex flex-col overflow-y-auto">
          {assessment?.probeQuestion && (
            <section className="p-4 border-b border-white/[0.06]">
              <h3 className="text-[10px] uppercase tracking-[0.16em] text-[#7C6CFF] font-semibold mb-2">Think about this</h3>
              <p className="text-[15px] leading-relaxed text-white/90 font-medium">{assessment.probeQuestion}</p>
            </section>
          )}

          {misconceptions.length > 0 && (
            <section className="p-4 border-b border-white/[0.06]">
              <h3 className="text-[10px] uppercase tracking-[0.16em] text-white/35 font-semibold mb-2.5">We're working on</h3>
              <ul className="space-y-2.5">
                {misconceptions.map(m => (
                  <li key={m.id} className="flex gap-2.5 items-start">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: m.status === 'confirmed' ? '#F59E0B' : m.status === 'resolved' ? '#4ADE80' : 'rgba(255,255,255,.28)' }} />
                    <div className="min-w-0">
                      <p className="text-[13px] leading-snug text-white/75">{m.text}</p>
                      <span className="text-[9.5px] uppercase tracking-[0.13em] font-semibold"
                            style={{ color: m.status === 'confirmed' ? '#F59E0B' : m.status === 'resolved' ? '#4ADE80' : 'rgba(255,255,255,.3)' }}>
                        {m.status === 'suspected' ? 'checking' : m.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {learner?.noticed && (
            <section className="p-4 border-b border-white/[0.06]">
              <h3 className="text-[10px] uppercase tracking-[0.16em] text-white/35 font-semibold mb-2 flex items-center justify-between">
                <span>What I noticed</span>
                <span key={learner.updatedAt} className="normal-case tracking-normal text-[10px] text-[#4ADE80] animate-fadeIn">● live</span>
              </h3>
              <p key={learner.updatedAt} className="text-[13.5px] leading-snug text-white/85 animate-fadeIn">{learner.noticed}</p>
              {learner.evidence && (
                <p className="mt-1.5 text-[12px] leading-snug text-white/45 italic">You said: “{learner.evidence}”</p>
              )}
              {learner.strengths.length > 0 && (
                <ul className="mt-2.5 space-y-1">
                  {learner.strengths.map((t, i) => (
                    <li key={i} className="text-[12.5px] text-[#86EFAC] flex gap-1.5"><span>✓</span><span className="text-white/70">{t}</span></li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {learner && Object.keys(learner.byConcept).length > 1 && (
            <section className="p-4 border-b border-white/[0.06]">
              <h3 className="text-[10px] uppercase tracking-[0.16em] text-white/35 font-semibold mb-2.5">Ideas this session</h3>
              <ul className="space-y-2">
                {Object.entries(learner.byConcept).map(([id, c]) => {
                  const row = c as { label: string; understanding: number };
                  return (
                  <li key={id}>
                    <div className="flex justify-between text-[12px] text-white/70">
                      <span className={`truncate ${id === learner.concept.id ? 'text-white font-medium' : ''}`}>{row.label}</span>
                      <span className="text-white/40 shrink-0 ml-2">{row.understanding}%</span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, row.understanding)}%`, background: 'linear-gradient(90deg,#4ADE80,#7C6CFF)' }} />
                    </div>
                  </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="p-4 mt-auto">
            <h3 className="text-[10px] uppercase tracking-[0.16em] text-white/35 font-semibold mb-2.5">This session</h3>
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3 flex items-center gap-3">
              <Ring value={masteryScore} />
              <div className="min-w-0">
                <p className="text-[13.5px] text-white/85 font-medium leading-snug">
                  {learner ? LEVEL_TEXT[learner.level]
                    : isLessonActive ? 'Listening to how you think…' : 'Start a session to begin'}
                </p>
                <p className="text-[11.5px] text-white/40 leading-snug mt-0.5 truncate">
                  on {conceptLabel}{learner ? ` · ${learner.exchanges} ${learner.exchanges === 1 ? 'reply' : 'replies'}` : ''}
                </p>
              </div>
            </div>
            {learner?.nextStep && (
              <div className="mt-2.5 w-full rounded-xl bg-white/[0.04] border border-white/[0.07] p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-white/35 font-semibold">Up next</div>
                  <div className="text-[13px] text-white/75 leading-snug mt-0.5">{learner.nextStep}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/35 shrink-0" />
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};

/** Progress ring. Effort-based and private — no streaks, no points, no comparison. */
const Ring: React.FC<{ value: number }> = ({ value }) => {
  const r = 17, circ = 2 * Math.PI * r;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4" />
      <circle cx="22" cy="22" r={r} fill="none" stroke="#7C6CFF" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.max(0.02, value / 100))}
              transform="rotate(-90 22 22)" style={{ transition: 'stroke-dashoffset .8s ease' }} />
      <text x="22" y="26" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{Math.round(value)}</text>
    </svg>
  );
};

/** Ambient environment used until a generated stage photo exists. Deliberately not a room. */
const AmbientStage: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden"
       style={{ background: 'radial-gradient(90% 70% at 25% 30%, #2B3A7A 0%, #121A3A 45%, #070A16 100%)' }}>
    <div className="absolute -left-40 top-10 w-[640px] h-[640px] rounded-full blur-3xl opacity-50"
         style={{ background: 'radial-gradient(circle, #6D5BFF, transparent 65%)' }} />
    <div className="absolute left-[30%] -bottom-40 w-[720px] h-[520px] rounded-full blur-3xl opacity-35"
         style={{ background: 'radial-gradient(circle, #22D3EE, transparent 65%)' }} />
    <div className="absolute inset-0 opacity-50"
         style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.55) 1px, transparent 1.5px)', backgroundSize: '90px 90px' }} />
  </div>
);

