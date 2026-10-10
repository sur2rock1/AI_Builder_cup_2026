import React from 'react';
import { Mic, MicOff, HelpCircle, Repeat, Gauge, Hand, Pause, Play, X } from 'lucide-react';
import type { LessonClip, VisualRegion } from '../curriculum/topicVisual';
import type { BoardNote } from './TeachingCanvas';
import type { LearnerSnapshot, Level } from '../adaptive/liveObserver';
import { LumenOrb } from './LumenOrb';

const LEVEL_TEXT: Record<Level, string> = {
  not_yet_seen: 'Just getting started',
  recognises: 'Recognises it',
  explains: 'Can explain why',
  applies: 'Can use it on new problems',
  transfers: 'Uses it in new situations',
};

interface PictureFrame {
  url: string;
  caption?: string;
}

interface Props {
  conceptLabel: string;
  subject: string;
  grade: string;
  notes: BoardNote | null;
  liveNotes?: string[];
  masteryScore: number;
  isLessonActive: boolean;
  isSpeaking: boolean;
  isThinking?: boolean;
  learner?: LearnerSnapshot | null;
  mouthOpenness: number;
  micLevel: number;
  tutorLine?: string;
  studentName?: string;
  visualUrl?: string;
  generating?: boolean;
  focusRegion?: VisualRegion | null;
  pictureSeries?: PictureFrame[];
  clip?: LessonClip | null;
  clipPlaying?: boolean;
  clipFrame?: number;
  onToggleClip?: () => void;
  onConfusion: (signal: string) => void;
  onToggleLesson: () => void;
  onChangeTopic: () => void;
  onOpenProfile: () => void;
  onSelectPicture?: (url: string) => void;
}

export const ImmersiveStage: React.FC<Props> = ({
  conceptLabel, subject, grade, notes, liveNotes = [], masteryScore,
  isLessonActive, isSpeaking, isThinking, learner, mouthOpenness, micLevel,
  tutorLine, studentName, visualUrl, generating, focusRegion, pictureSeries = [],
  clip, clipPlaying, clipFrame = 0, onToggleClip,
  onConfusion, onToggleLesson, onChangeTopic, onOpenProfile, onSelectPicture,
}) => {
  const series = pictureSeries.length ? pictureSeries : (visualUrl ? [{ url: visualUrl }] : []);
  const current = visualUrl || series[series.length - 1]?.url;
  const boardLines = [...(notes?.lines || []), ...liveNotes].slice(0, 8);
  const showClip = Boolean(clipPlaying && clip?.frames?.length);
  const shortTopic = conceptLabel.length > 42 ? `${conceptLabel.slice(0, 40)}…` : conceptLabel;

  return (
    <div className="w-full h-full flex flex-col bg-[#fcf9f3] text-[#1c1c18] overflow-hidden" style={{ fontFamily: 'Lexend, system-ui, sans-serif' }}>
      <header className="shrink-0 h-12 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <LumenOrb size={28} speaking={isSpeaking} level={mouthOpenness} active={isLessonActive} thinking={!!isThinking} />
          <span className="font-semibold">Lumen</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#1b7a6e]" />
          <span className="text-[13px] text-[#6e7976] truncate">
            {subject && subject !== conceptLabel ? `${subject} · ${shortTopic}` : shortTopic}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline px-3 py-1 rounded-full bg-white border border-[#e5e2dc] text-[12px] text-[#3e4946]">
            {grade.split('(')[0].trim()}
          </span>
          <button onClick={onOpenProfile} className="px-3 py-1.5 rounded-full bg-white border border-[#e5e2dc] text-[12px] text-[#3e4946]">
            {studentName || 'Progress'}{learner ? ` · ${LEVEL_TEXT[learner.level]}` : ''}
          </button>
          <button onClick={onChangeTopic} className="px-3 py-1.5 rounded-full text-[12px] text-[#6e7976] hover:text-[#1c1c18] flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Exit
          </button>
        </div>
      </header>

      <div className="px-6 pb-2">
        <div className="rounded-[22px] bg-white border border-[#e5e2dc] px-4 py-2.5 flex items-center gap-3">
          <LumenOrb size={32} speaking={isSpeaking} level={mouthOpenness} active={isLessonActive} thinking={!!isThinking} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#6e7976]">Lumen · listening companion</p>
            <p className="text-[15px] font-medium truncate">
              {isThinking ? 'Lumen heard you — thinking about your answer.'
                : tutorLine || (generating ? `Drawing the next picture of ${shortTopic}…`
                  : isLessonActive ? 'Speak anytime. I’ll keep the picture and the board together.'
                    : 'Start the session when you are ready.')}
            </p>
          </div>
          <span className="hidden md:flex items-center gap-2 text-[12px] text-[#6e7976] shrink-0">
            Listening softly
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-6 pb-3">
        <div className="h-full min-h-0 flex flex-col rounded-[28px] bg-white border border-[#e5e2dc] overflow-hidden shadow-[0_12px_40px_rgba(28,28,24,0.06)]">
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)]">
            <div className="relative min-w-0 min-h-0 overflow-hidden bg-[#f6f3ed]">
              {showClip && clip ? (
                <ClipPane clip={clip} frame={clipFrame} playing={!!clipPlaying} onToggle={onToggleClip} />
              ) : current ? (
                <>
                  <img
                    src={current}
                    alt={conceptLabel}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700"
                    style={focusRegion ? {
                      transform: `scale(${focusRegion.zoom})`,
                      transformOrigin: `${focusRegion.x}% ${focusRegion.y}%`,
                    } : undefined}
                  />
                  {focusRegion && (
                    <>
                      <div className="absolute w-24 h-24 rounded-full border-2 border-[#fecc7f] pointer-events-none"
                           style={{ left: `${focusRegion.x}%`, top: `${focusRegion.y}%`, transform: 'translate(-50%, -50%)' }} />
                      <div className="absolute left-4 bottom-4 rounded-2xl bg-white/92 border border-[#e5e2dc] px-3 py-2 max-w-[70%]">
                        <p className="text-[10px] uppercase tracking-wider text-[#7c5815]">Look here</p>
                        <p className="text-[14px] font-medium">{focusRegion.label}</p>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 grid place-items-center text-[#6e7976] text-sm px-8 text-center">
                  {generating ? `Lumen is drawing ${shortTopic}…` : 'Pictures will line up here as Lumen explains.'}
                </div>
              )}
            </div>

            <aside className="min-w-0 min-h-0 border-t md:border-t-0 md:border-l border-[#e5e2dc] bg-[#fffdf8] flex flex-col overflow-hidden">
              <div className="shrink-0 px-5 pt-4 pb-2">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#6e7976] font-medium">On the board</p>
                <h3 className="text-[17px] font-semibold leading-snug mt-1 line-clamp-2 min-h-[2.4em]">
                  {notes?.title || conceptLabel}
                </h3>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4">
                {boardLines.length === 0 ? (
                  <p className="text-[14px] text-[#6e7976] leading-relaxed">Lumen writes the idea here while the picture stays on the left.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {boardLines.map((line, i) => (
                      <li key={`${i}-${line.slice(0, 24)}`} className="text-[15px] leading-snug text-[#1c1c18] flex gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#1b7a6e] shrink-0" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {notes?.formula && (
                  <p className="mt-4 px-3 py-2 rounded-xl bg-[#f6f3ed] font-mono text-[15px]">{notes.formula}</p>
                )}
              </div>
              <div className="shrink-0 h-10 px-5 flex items-center border-t border-[#e5e2dc] bg-[#fffdf8]">
                <span className="text-[11px] text-[#6e7976]">Familiar ground</span>
                <div className="mx-2 flex-1 h-1.5 rounded-full bg-[#efeae2]">
                  <div className="h-full rounded-full bg-[#1b7a6e] transition-[width] duration-500"
                       style={{ width: `${Math.min(100, Math.max(0, masteryScore))}%` }} />
                </div>
                <span className="text-[11px] text-[#6e7976] w-8 text-right">{Math.round(masteryScore)}%</span>
              </div>
            </aside>
          </div>

          <div className="shrink-0 h-[68px] border-t border-[#e5e2dc] bg-white px-3 flex items-center gap-2 overflow-x-auto">
            {series.length === 0 ? (
              <p className="text-[12px] text-[#6e7976] px-2">Pictures from this lesson will collect here.</p>
            ) : series.map((frame, i) => (
              <button key={`${frame.url}-${i}`} onClick={() => onSelectPicture?.(frame.url)}
                className={`h-12 w-[72px] rounded-xl overflow-hidden border shrink-0 ${
                  !showClip && frame.url === current ? 'border-[#1b7a6e] ring-2 ring-[#1b7a6e]/25' : 'border-[#e5e2dc]'}`}>
                <img src={frame.url} alt={frame.caption || `Picture ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-6 py-3 flex items-center gap-3">
        <button onClick={onToggleLesson}
          className={`px-5 py-2.5 rounded-full text-[14px] font-medium ${
            isLessonActive ? 'bg-[#ffdad6] text-[#690005]' : 'bg-[#1b7a6e] text-white'}`}>
          {isLessonActive ? <span className="flex items-center gap-2"><MicOff className="w-4 h-4" /> End session</span>
            : <span className="flex items-center gap-2"><Mic className="w-4 h-4" /> Start session</span>}
        </button>
        <span className="text-[12px] text-[#6e7976]">{isLessonActive ? 'Listening — speak anytime' : 'Mic off'}</span>
        <div className="ml-auto flex items-center gap-2">
          {[{ i: HelpCircle, t: "I don't get it", s: 'dont_understand' },
            { i: Repeat, t: 'Another way', s: 'repeat_differently' },
            { i: Gauge, t: 'Too fast', s: 'too_fast' },
            { i: Hand, t: 'I guessed', s: 'guessed' }].map(({ i: Icon, t, s }) => (
            <button key={s} onClick={() => onConfusion(s)} disabled={!isLessonActive}
              className="px-3 py-1.5 rounded-full bg-white border border-[#e5e2dc] text-[12px] text-[#3e4946] flex items-center gap-1.5 disabled:opacity-30">
              <Icon className="w-3 h-3 text-[#1b7a6e]" />{t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const ClipPane: React.FC<{ clip: LessonClip; frame: number; playing: boolean; onToggle?: () => void }> = ({
  clip, frame, playing, onToggle,
}) => {
  const i = Math.min(frame, clip.frames.length - 1);
  const f = clip.frames[i];
  return (
    <div className="absolute inset-0 overflow-hidden">
      <img
        src={f.imageUrl}
        alt={clip.title}
        className="absolute inset-0 w-full h-full object-cover"
        style={f.zoom ? { transform: `scale(${f.zoom.scale})`, transformOrigin: `${f.zoom.x}% ${f.zoom.y}%` } : undefined}
      />
      <div className="absolute inset-x-0 bottom-0 p-3 pointer-events-none">
        <div className="pointer-events-auto rounded-2xl bg-white/94 border border-[#e5e2dc] px-3 py-2 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-[#1b7a6e]">{clip.title}</p>
            <p className="text-[13px] font-medium text-[#1c1c18] line-clamp-2">{f.caption}</p>
            <div className="mt-1.5 flex gap-1">
              {clip.frames.map((_, idx) => (
                <span key={idx} className={`h-1 flex-1 rounded-full ${idx <= i ? 'bg-[#1b7a6e]' : 'bg-[#e5e2dc]'}`} />
              ))}
            </div>
          </div>
          <button onClick={onToggle} className="shrink-0 px-3 py-1.5 rounded-full bg-[#1b7a6e] text-white text-[12px] font-medium flex items-center gap-1">
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>
    </div>
  );
};
