import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Maximize2, Volume2, Box, PenLine, Target, ChevronRight, HelpCircle, Repeat, Gauge, Hand } from 'lucide-react';
import { ScenePanel, PanelMode } from './ScenePanel';
import type { ConceptMapDiagram } from './ScenePanel';
import { SceneDef } from '../scenes/pythagorasScenes';
import { Scene3DData } from '../types';
import type { BoardVisual, BoardVisual3D } from '../visual/types';
import type { StepState } from './BoardVisualView';
import { FigureSpec, FigurePart, StudentThinking, LiveAssessment, BoardNote } from './TeachingCanvas';
import type { LearnerSnapshot, Level } from '../adaptive/liveObserver';
import { useTutorName } from '../persona/TutorNameContext';
import { useIsNarrow } from '../utils/useMediaQuery';

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
// A presenter stands in a real environment beside a real whiteboard.
// The board is written on in marker, in the tutor's hand, as they speak.
//
// Presenter media is PRE-GENERATED, not streamed. See PRESENTER_CLIPS:
// a small library of short looping clips (idle / talking / thinking /
// pointing / encouraging) selected by audio level and lesson state.
// Nothing is generated at runtime, so there is no added latency and no
// third-party avatar service in the live path.
// ─────────────────────────────────────────────────────────────────

export type PresenterMood = 'idle' | 'talking' | 'thinking' | 'pointing' | 'encouraging';

export interface PresenterMedia {
  /** Looping clips per mood. Any missing mood falls back to `idle`, then to the still. */
  clips?: Partial<Record<PresenterMood, string>>;
  /** Single still, used as poster and as the fallback when no clip exists. */
  still?: string;
  /** Full-bleed environment behind the presenter. */
  background?: string;
}

interface Props {
  /** Guided mode (src/guided): replaces the whole board panel. Omit for the standard board. */
  boardOverride?: React.ReactNode;
  /** Guided mode (src/guided): extra controls in the top bar. */
  headerExtra?: React.ReactNode;
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
  scene: SceneDef | null;
  scene3d?: Scene3DData;
  /** Pre-generated real-world photo (base64 data URI) for this topic, from the pregen cache. */
  pregenPhoto?: string | null;
  /** The reviewer's neutral one-line description of the verified photo. */
  pregenPhotoCaption?: string | null;
  /** Legacy concept map (lessons generated before board pictures). */
  topicDiagram?: ConceptMapDiagram | null;
  /** Board pictures and how far each has been built (docs/BOARD_VISUALS.md). */
  visual?: BoardVisual | null;
  visual3d?: BoardVisual3D | null;
  visualStep?: StepState;
  visual3dStep?: StepState;
  onVisualStepChange?: (s: StepState) => void;
  onVisual3dStepChange?: (s: StepState) => void;
  visualSpotlight?: string[];
  tutorLine?: string;
  presenter?: PresenterMedia;
  studentName?: string;
  onPanelModeChange: (m: PanelMode) => void;
  onConfusion: (signal: string) => void;
  onToggleLesson: () => void;
  onChangeTopic: () => void;
  onOpenProfile: () => void;
}

const MARKER = { ink: '#1F2430', blue: '#2563EB', red: '#DC2626', green: '#059669', amber: '#D97706' };

export const ImmersiveStage: React.FC<Props> = ({
  boardOverride, headerExtra, conceptLabel, subject, grade, figure, revealed, focusPart,
  studentThinking, assessment, notes, liveNotes, masteryScore, misconceptions,
  isLessonActive, isSpeaking, isThinking, learner, mouthOpenness, micLevel,
  panelMode, scene, scene3d, pregenPhoto, pregenPhotoCaption, topicDiagram, tutorLine, presenter, studentName,
  onPanelModeChange, onConfusion, onToggleLesson, onChangeTopic, onOpenProfile,
  visual, visual3d, visualStep, visual3dStep, onVisualStepChange, onVisual3dStepChange, visualSpotlight,
}) => {
  const tutorName = useTutorName();
  const shown = (p: FigurePart) => revealed.includes(p);
  const isFocus = (p: FigurePart) => focusPart === p;

  // Pick the clip for the current moment. No runtime generation — just selection.
  const mood: PresenterMood =
    !isLessonActive ? 'idle'
    : isThinking || assessment?.shouldProbe ? 'thinking'
    : focusPart ? 'pointing'
    : isSpeaking ? 'talking'
    : 'idle';
  const clip = presenter?.clips?.[mood] || presenter?.clips?.idle;
  const [stillOk, setStillOk] = useState(false);
  useEffect(() => {
    if (!presenter?.still) { setStillOk(false); return; }
    const img = new Image();
    img.onload = () => setStillOk(true);
    img.onerror = () => setStillOk(false);
    img.src = presenter.still;
  }, [presenter?.still]);
  const still = stillOk ? presenter?.still : undefined;


  const narrow = useIsNarrow();

  const boardNode = boardOverride ?? <ScenePanel
              mode={panelMode}
              onModeChange={onPanelModeChange}
              scene={scene}
              figure={figure}
              revealed={revealed}
              focusPart={focusPart}
              studentThinking={studentThinking}
              scene3d={scene3d}
              pregenPhoto={pregenPhoto}
              pregenPhotoCaption={pregenPhotoCaption}
              topicDiagram={topicDiagram}
              visual={visual}
              visual3d={visual3d}
              visualStep={visualStep}
              visual3dStep={visual3dStep}
              onVisualStepChange={onVisualStepChange}
              onVisual3dStepChange={onVisual3dStepChange}
              visualSpotlight={visualSpotlight}
              conceptLabel={conceptLabel}
              isLessonActive={isLessonActive}
              notes={notes}
              liveNotes={liveNotes}
            />;

  const startBtn = (extra = '') => (
    <button onClick={onToggleLesson}
              className={`${extra} px-5 py-2.5 rounded-full text-[14px] font-semibold flex items-center gap-2 cursor-pointer transition-colors ${
                isLessonActive ? 'bg-[#E0483C] hover:bg-[#C93A2F] text-white' : 'bg-[#7C6CFF] hover:bg-[#6A58F5] text-white'}`}>
              {isLessonActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {isLessonActive ? 'End session' : 'Start session'}
            </button>
  );

  const meter = (
    <div className="flex items-center gap-1 h-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className="w-[3px] rounded-full transition-all duration-75"
                      style={{ height: isLessonActive && i < Math.round(micLevel * 9) ? '100%' : '25%',
                               background: isLessonActive && i < Math.round(micLevel * 9) ? '#4ADE80' : 'rgba(255,255,255,0.18)' }} />
              ))}
            </div>
  );

  const chipButtons = (
    <>
    {[{ i: HelpCircle, t: "I don't get it", s: 'dont_understand' },
                { i: Repeat, t: 'Another way', s: 'repeat_differently' },
                { i: Gauge, t: 'Too fast', s: 'too_fast' },
                { i: Hand, t: 'I guessed', s: 'guessed' }].map(({ i: Icon, t, s }) => (
                <button key={s} onClick={() => onConfusion(s)} disabled={!isLessonActive}
                  className="shrink-0 whitespace-nowrap min-h-[40px] lg:min-h-0 px-3 py-1.5 rounded-full bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-[13px] text-white/80 flex items-center gap-1.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <Icon className="w-3 h-3 text-[#7C6CFF]" />{t}
                </button>
              ))}
            
    </>
  );

  const railBody = (
    <>
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
                {(Object.entries(learner.byConcept) as [string, { label: string; understanding: number }][]).map(([id, c]) => (
                  <li key={id}>
                    <div className="flex justify-between text-[12px] text-white/70">
                      <span className={`truncate ${id === learner.concept.id ? 'text-white font-medium' : ''}`}>{c.label}</span>
                      <span className="text-white/40 shrink-0 ml-2">{c.understanding}%</span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, c.understanding)}%`, background: 'linear-gradient(90deg,#4ADE80,#7C6CFF)' }} />
                    </div>
                  </li>
                ))}
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
        </>
  );

  // ── Phones and portrait tablets: one scrolling column, controls pinned at the bottom ──
  if (narrow) {
    return (
      <div className="w-full h-full flex flex-col bg-[#0C0F16] text-white overflow-hidden">
        <div className="shrink-0 relative bg-[#0C0F16] border-b border-white/[0.07]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="min-h-[52px] px-3 py-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-[10px] shrink-0 grid place-items-center text-[14px]"
                   style={{ background: 'linear-gradient(135deg,#7C6CFF,#4ADE80)' }}>◆</div>
              <div className="min-w-0 leading-tight">
                <div className="text-[11.5px] text-white/50 truncate">{subject || 'Maths'} • {grade}</div>
                <div className="text-[14px] text-white/90 font-medium truncate">{conceptLabel}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={onChangeTopic}
                className="min-h-[40px] px-3 rounded-lg bg-white/[0.07] active:bg-white/[0.16] border border-white/10 text-[13px] text-white/75 cursor-pointer">
                Change
              </button>
              <button onClick={onOpenProfile}
                className="min-h-[40px] max-w-[110px] truncate px-3 rounded-lg bg-white/[0.07] active:bg-white/[0.16] border border-white/10 text-[13px] text-white/80 cursor-pointer">
                {studentName || 'Progress'}
              </button>
            </div>
          </div>
          <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-white/10" aria-hidden>
            <div className="h-full transition-all duration-700"
                 style={{ width: `${Math.max(3, masteryScore)}%`, background: 'linear-gradient(90deg,#4ADE80,#7C6CFF)' }} />
          </div>
          {headerExtra && (
            <div className="overflow-x-auto px-3 pb-2 pt-1.5 border-t border-white/[0.05]">
              <div className="w-max">{headerExtra}</div>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="relative overflow-hidden">
            {clip ? (
              <video key={clip} src={clip} poster={still} autoPlay loop muted playsInline
                     className="absolute inset-0 w-full h-full object-cover" />
            ) : still ? (
              <img src={still} alt={tutorName} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <AmbientStage />
            )}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#060912]/10 to-[#060912]/60" />

            <div className="relative z-10 px-3 pt-3 pb-4 flex flex-col gap-3">
              <div className={`relative w-full mx-auto ${boardOverride ? 'aspect-[3/4] sm:aspect-[4/3]' : 'aspect-[4/5] sm:aspect-[4/3]'} landscape:aspect-[16/9]`}>
                {boardNode}
              </div>

              {(!clip && !still) && (
                <div className="flex items-center gap-3">
                  <div className="shrink-0 relative" style={{ width: 76, height: 76 }}>
                    <div style={{ transform: 'scale(0.36)', transformOrigin: 'top left', width: 210, height: 210 }}>
                      <VoiceOrb speaking={isSpeaking} level={mouthOpenness} active={isLessonActive} thinking={!!isThinking} />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[17px] font-semibold text-white leading-tight">{tutorName}</div>
                    <div className="text-[13px] text-white/60 mt-0.5">
                      {isThinking ? 'thinking about what you said…' : isSpeaking ? 'speaking…' : isLessonActive ? 'listening' : 'ready when you are'}
                    </div>
                  </div>
                </div>
              )}

              {isThinking ? (
                <p className="px-4 py-2.5 rounded-2xl bg-black/50 backdrop-blur-md text-[15px] text-white/85">
                  {tutorName} heard you — thinking about your answer…
                </p>
              ) : tutorLine ? (
                <p className="text-[16px] leading-snug text-white/95 px-4 py-2.5 rounded-2xl bg-black/50 backdrop-blur-md line-clamp-5">
                  {tutorLine}
                </p>
              ) : null}
            </div>
          </div>

          <aside className="bg-[#10141D] border-t border-white/[0.07] flex flex-col">{railBody}</aside>
        </div>

        <div className="shrink-0 bg-[#0A0D15] border-t border-white/[0.07] px-3 pt-2"
             style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-3">
            {startBtn('min-h-[44px] shrink-0 whitespace-nowrap')}
            <div className="shrink-0 hidden min-[420px]:block">{meter}</div>
            <div className="flex-1 min-w-0 overflow-x-auto">
              <div className="flex items-center gap-2 w-max pr-1">{chipButtons}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          {headerExtra}
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

          {/* ── Stage layer ─────────────────────────────────────
               With generated media: a single full-frame shot of the presenter in
               a real place (still, or a looping clip per mood — same framing).
               Without it: an ambient environment and a voice orb, so nothing on
               screen ever looks like a missing image. */}
          {clip ? (
            <video key={clip} src={clip} poster={still} autoPlay loop muted playsInline
                   className="absolute inset-0 w-full h-full object-cover" />
          ) : still ? (
            <img src={still} alt={tutorName}
                 className="absolute inset-0 w-full h-full object-cover transition-transform duration-700"
                 style={{ transform: `scale(${1.02 + mouthOpenness * 0.006})` }} />
          ) : (
            <AmbientStage />
          )}
          <div className="absolute inset-0 pointer-events-none"
               style={{ background: 'linear-gradient(90deg, rgba(6,9,18,.10) 0%, rgba(6,9,18,.0) 30%, rgba(6,9,18,.45) 100%)' }} />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#060912] to-transparent pointer-events-none" />

          {!clip && !still && (
            <div className="absolute left-[4%] top-[14%] w-[26%] flex flex-col items-center">
              <VoiceOrb speaking={isSpeaking} level={mouthOpenness} active={isLessonActive} thinking={!!isThinking} />
              <div className="mt-5 text-center">
                <div className="text-[19px] font-semibold text-white">{tutorName}</div>
                <div className="text-[13px] text-white/55 mt-0.5">
                  {isThinking ? 'thinking about what you said…' : isSpeaking ? 'speaking…' : isLessonActive ? 'listening' : 'ready when you are'}
                </div>
              </div>
            </div>
          )}

          {/* ── The lens: real world → shape → 3D ───────────────── */}
          <div className="absolute right-[2.5%] top-[5%] w-[66%] aspect-[16/10] max-h-[80%]">
            {boardNode}
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
                {tutorName} heard you — thinking about your answer
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
            {startBtn()}
            {meter}
            <span className="text-[12px] text-white/40">{isLessonActive ? 'Listening — speak or interrupt anytime' : 'Mic off'}</span>

            <div className="ml-auto flex items-center gap-2">{chipButtons}</div>
          </div>
        </div>

        {/* ── Right rail: what we're working on (not a chat log) ── */}
        <aside className="w-[310px] shrink-0 bg-[#10141D] border-l border-white/[0.07] flex flex-col overflow-y-auto">{railBody}</aside>
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

/** The tutor's presence without a face: a light that breathes when idle and moves with the voice. */
const VoiceOrb: React.FC<{ speaking: boolean; level: number; active: boolean; thinking?: boolean }> = ({ speaking, level, active, thinking }) => {
  const s = 1 + (speaking ? level * 0.22 : 0);
  return (
    <div className="relative w-[210px] h-[210px] grid place-items-center">
      <div className={`absolute inset-0 rounded-full blur-2xl ${active && !speaking ? 'animate-pulse' : ''}`}
           style={{ background: 'radial-gradient(circle, rgba(124,108,255,.55), rgba(34,211,238,.18) 55%, transparent 72%)',
                    transform: `scale(${1.05 + (speaking ? level * 0.35 : 0)})`, transition: 'transform .12s' }} />
      {thinking && (
        <div className="absolute w-[168px] h-[168px] rounded-full border-2 border-white/10 border-t-white/70 animate-spin"
             style={{ animationDuration: '1.1s' }} />
      )}
      <div className="relative w-[128px] h-[128px] rounded-full"
           style={{ background: 'radial-gradient(circle at 35% 30%, #FFFFFF 0%, #C7BFFF 22%, #7C6CFF 55%, #3B2FB8 100%)',
                    boxShadow: '0 0 60px rgba(124,108,255,.65), inset 0 -10px 30px rgba(20,10,80,.45)',
                    transform: `scale(${s})`, transition: 'transform .1s' }} />
    </div>
  );
};
