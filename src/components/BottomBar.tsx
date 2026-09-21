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
      className="h-[74px] w-full bg-[#FFFFFF] border-t border-[#E3E6EC] px-4 md:px-8 flex items-center justify-between z-40 select-none shadow-sm"
    >
      {/* Left section: Big "Start / End Lesson" Button & Status Dot */}
      <div className="flex items-center gap-4">
        <button
          id="toggle-lesson-button"
          onClick={onToggleLesson}
          disabled={connectionStatus === 'connecting'}
          className={`px-6 py-2.5 rounded-full font-bold text-sm tracking-wide transition-all duration-200 flex items-center gap-2.5 cursor-pointer shadow-lg active:scale-95 ${
            isLessonActive
              ? 'bg-[#DC2626] hover:bg-[#B91C1C] text-white shadow-md'
              : 'bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold shadow-md'
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
      <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F1F0FE] border border-[#DDE1E8] text-xs">
        <Sparkles className="w-3.5 h-3.5 text-[#4F46E5]" />
        <span className="text-[#626B7B]">
          Dynamic Teaching Surface: <strong className="text-[#161A22]">{currentTopic}</strong> &bull; Speaks, illustrates &amp; tests in real time
        </span>
      </div>

      {/* Right section: Microphone Input Activity Bars */}
      <div id="mic-indicator-box" className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F8F9FB] border border-[#E3E6EC]">
          {isLessonActive ? (
            <Mic className="w-4 h-4 text-[#4F46E5] animate-pulse" />
          ) : (
            <MicOff className="w-4 h-4 text-[#8A93A3]" />
          )}

          {/* Audio Visualizer Waves */}
          <div className="flex items-center gap-1 h-3.5">
            {Array.from({ length: bars }).map((_, i) => (
              <span
                key={i}
                className={`w-1 rounded-full transition-all duration-75 ${
                  isLessonActive && i < activeBars
                    ? 'bg-[#4F46E5] h-3.5'
                    : 'bg-[#DDE1E8] h-1.5'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};
