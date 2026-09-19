import React from 'react';
import { ConnectionStatus } from '../types';
import { Mic, MicOff, Sparkles, Play, Square } from 'lucide-react';

interface BottomBarProps {
  isLessonActive: boolean;
  connectionStatus: ConnectionStatus;
  micLevel: number; // 0 to 1
  currentTopic: string;
  onToggleLesson: () => void;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  isLessonActive,
  connectionStatus,
  micLevel,
  currentTopic,
  onToggleLesson,
}) => {
  const bars = 8;
  const activeBars = Math.round(micLevel * bars);

  return (
    <footer
      id="bottom-action-bar"
      className="h-[74px] w-full bg-[#07170e] border-t border-[#1a3827] px-4 md:px-8 flex items-center justify-between z-40 select-none shadow-2xl"
    >
      {/* Left section: Big "Start / End Lesson" Button & Status Dot */}
      <div className="flex items-center gap-4">
        <button
          id="toggle-lesson-button"
          onClick={onToggleLesson}
          disabled={connectionStatus === 'connecting'}
          className={`px-6 py-2.5 rounded-full font-bold text-sm tracking-wide transition-all duration-200 flex items-center gap-2.5 cursor-pointer shadow-lg active:scale-95 ${
            isLessonActive
              ? 'bg-[#c93b3b] hover:bg-[#b02f2f] text-white shadow-rose-900/30'
              : 'bg-[#10b981] hover:bg-[#059669] text-[#062014] font-black shadow-emerald-900/40 hover:shadow-emerald-500/20'
          } ${connectionStatus === 'connecting' ? 'opacity-70 cursor-wait' : ''}`}
        >
          {isLessonActive ? (
            <>
              <Square className="w-4 h-4 fill-current" />
              <span>End Voice Lesson</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Start Voice Lesson</span>
            </>
          )}
        </button>

        {/* Live Status Indicator */}
        <div id="connection-status-pill" className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-emerald-400 animate-pulse'
                : connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
                ? 'bg-amber-400 animate-ping'
                : connectionStatus === 'error'
                ? 'bg-rose-500'
                : 'bg-zinc-500'
            }`}
          />
          <span className="text-xs font-medium text-[#bad5c7]">
            {connectionStatus === 'connected'
              ? 'Live Voice with Dr. Marcus Vance'
              : connectionStatus === 'connecting'
              ? 'Connecting to Voice Tutor...'
              : connectionStatus === 'reconnecting'
              ? 'Reconnecting...'
              : connectionStatus === 'error'
              ? 'Connection Error (Microphone or Server)'
              : 'Voice Tutor Ready'}
          </span>
        </div>
      </div>

      {/* Middle section: Active Topic & Real-Time Dynamic Visuals */}
      <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#102418] border border-[#1f4b30] text-xs">
        <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
        <span className="text-[#8cb89f]">
          Dynamic Teaching Surface: <strong className="text-white">{currentTopic}</strong> &bull; Speaks, illustrates &amp; tests in real time
        </span>
      </div>

      {/* Right section: Microphone Input Activity Bars */}
      <div id="mic-indicator-box" className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#102519] border border-[#1c472d]">
          {isLessonActive ? (
            <Mic className="w-4 h-4 text-emerald-400 animate-pulse" />
          ) : (
            <MicOff className="w-4 h-4 text-[#5e8b72]" />
          )}

          {/* Audio Visualizer Waves */}
          <div className="flex items-center gap-1 h-3.5">
            {Array.from({ length: bars }).map((_, i) => (
              <span
                key={i}
                className={`w-1 rounded-full transition-all duration-75 ${
                  isLessonActive && i < activeBars
                    ? 'bg-amber-400 h-3.5'
                    : 'bg-[#183925] h-1.5'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};
