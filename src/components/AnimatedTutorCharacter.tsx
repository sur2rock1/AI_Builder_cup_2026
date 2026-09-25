import React, { useEffect, useState } from 'react';
import { TutorState, TranscriptEntry } from '../types';
import { Volume2, Sparkles, User, GraduationCap, Mic } from 'lucide-react';
import { LumenOrb } from './LumenOrb';

interface AnimatedTutorProps {
  tutorState: TutorState;
  outputTranscript?: TranscriptEntry | null;
  inputTranscript?: TranscriptEntry | null;
  currentTopic?: string;
  currentGrade?: string;
}

export const AnimatedTutorCharacter: React.FC<AnimatedTutorProps> = ({
  tutorState,
  outputTranscript,
  inputTranscript,
  currentTopic = 'Any Topic',
  currentGrade = 'Grade 8',
}) => {
  const [showOutput, setShowOutput] = useState(false);
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    if (outputTranscript?.text) {
      setShowOutput(true);
      const timer = setTimeout(() => setShowOutput(false), 12000);
      return () => clearTimeout(timer);
    }
  }, [outputTranscript?.timestamp, outputTranscript?.text]);

  useEffect(() => {
    if (inputTranscript?.text) {
      setShowInput(true);
      const timer = setTimeout(() => setShowInput(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [inputTranscript?.timestamp, inputTranscript?.text]);

  const openness = Math.min(1, Math.max(0, tutorState.mouthOpenness));
  const isSpeaking = tutorState.isSpeaking || openness > 0.05;

  return (
    <div
      id="animated-tutor-container"
      className="h-full flex flex-col justify-between items-center p-3 sm:p-4 bg-[#FFFFFF] border-r border-[#E3E6EC] text-[#161A22] relative overflow-hidden select-none"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#FFFFFF]/90 via-[#FFFFFF]/95 to-[#F6F7F9] pointer-events-none" />
      <div className="absolute -top-16 -left-16 w-64 h-64 bg-[#E8B86D]/15 rounded-full blur-3xl pointer-events-none" />

      <div id="tutor-header" className="w-full text-center z-10 pt-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E3E6EC] border border-[#DDE1E8] shadow-lg">
          <span
            className={`w-2 h-2 rounded-full ${
              isSpeaking ? 'bg-[#E8B86D] animate-ping' : 'bg-[#10B981]'
            }`}
          />
          <span className="text-xs tracking-wider uppercase font-bold text-[#1B7A6E]">
            {tutorState.name || 'Lumen'}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F7F4EE] text-[#1B7A6E] font-bold border border-[#E8B86D]/50">
            AI TUTOR
          </span>
        </div>
        <p className="text-[11px] text-[#8A93A3] mt-1 font-sans flex items-center justify-center gap-1">
          <GraduationCap className="w-3.5 h-3.5 text-[#1B7A6E]" />
          <span>Interactive Mentor &bull; {currentGrade}</span>
        </p>
      </div>

      <div
        id="tutor-avatar-stage"
        className="w-full flex-1 max-h-[380px] flex flex-col items-center justify-center my-auto z-10 relative"
      >
        <LumenOrb size={220} speaking={isSpeaking} level={openness} active />
        <div className="mt-2.5 flex items-center gap-2 text-xs text-[#626B7B]">
          {isSpeaking ? (
            <span className="flex items-center gap-1.5 text-[#1B7A6E] font-medium">
              <Sparkles className="w-3.5 h-3.5 text-[#E8B86D] animate-spin" />
              Explaining {currentTopic}...
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[#1B7A6E] font-medium">
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              Listening &bull; Speak or interrupt anytime
            </span>
          )}
        </div>
      </div>

      <div
        id="tutor-transcripts-area"
        className="w-full flex flex-col gap-2 z-10 min-h-[140px] max-h-[220px] overflow-y-auto px-1"
      >
        {showInput && inputTranscript?.text && (
          <div className="w-full p-2.5 rounded-xl bg-[#F8F9FB] border border-[#DDE1E8] text-xs shadow-md animate-fadeIn">
            <div className="flex items-center gap-1.5 text-[#626B7B] font-bold mb-1">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span>You ({currentGrade}):</span>
            </div>
            <p className="text-[#2B313C] italic font-sans leading-relaxed">
              &ldquo;{inputTranscript.text}&rdquo;
            </p>
          </div>
        )}

        {showOutput && outputTranscript?.text && (
          <div className="w-full p-2.5 rounded-xl bg-[#F7F4EE] border border-[#E8B86D]/40 text-xs shadow-lg animate-fadeIn">
            <div className="flex items-center justify-between text-[#1B7A6E] font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-[#E8B86D]" />
                <span>Lumen:</span>
              </span>
              <span className="text-[10px] text-[#8A93A3] font-normal">Real-time</span>
            </div>
            <p className="text-[#161A22] font-sans leading-relaxed">
              {outputTranscript.text}
            </p>
          </div>
        )}

        {!showInput && !showOutput && (
          <div className="w-full p-3 rounded-xl bg-[#F8F9FB]/70 border border-[#E3E6EC] text-center text-xs text-[#8A93A3]">
            <p>
              Click <strong className="text-emerald-600">Start Lesson</strong> below to start a live voice session on <strong className="text-[#1B7A6E]">{currentTopic}</strong>. Lumen will speak, listen, and dynamically illustrate the concepts!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
