import React, { useState } from 'react';
import { Sparkles, BookOpen, GraduationCap, Search, ArrowRight, X } from 'lucide-react';
import { GradeLevel } from '../types';

interface TopicGradeSelectorProps {
  currentTopic: string;
  currentGrade: string;
  onApplyTopicAndGrade: (topic: string, grade: string) => void;
  isLoading?: boolean;
}

const PRESET_TOPIC_SUGGESTIONS = [
  { topic: 'Photosynthesis & Plant Energy', grade: 'Middle School (Grade 6-8)', subject: 'Biology' },
  { topic: "Newton's 3 Laws of Motion", grade: 'Middle School (Grade 6-8)', subject: 'Physics' },
  { topic: 'The Causes of World War I', grade: 'High School (Grade 9-12)', subject: 'History' },
  { topic: 'Python Loops & Algorithms', grade: 'Beginner / Self-Learner', subject: 'Computer Science' },
  { topic: 'DNA Replication & Double Helix', grade: 'High School (Grade 9-12)', subject: 'Biology' },
  { topic: 'Plate Tectonics & Earthquakes', grade: 'Middle School (Grade 6-8)', subject: 'Earth Science' },
  { topic: 'Shakespeare’s Romeo & Juliet Themes', grade: 'High School (Grade 9-12)', subject: 'Literature' },
  { topic: 'Quantum Physics & Wave-Particle Duality', grade: 'College / Undergraduate', subject: 'Physics' },
];

const GRADE_OPTIONS: GradeLevel[] = [
  'Elementary (Grade 3-5)',
  'Middle School (Grade 6-8)',
  'Secondary 2 (Grade 8)',
  'High School (Grade 9-12)',
  'College / Undergraduate',
  'Beginner / Self-Learner',
];

export const TopicGradeSelector: React.FC<TopicGradeSelectorProps> = ({
  currentTopic,
  currentGrade,
  onApplyTopicAndGrade,
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [topicInput, setTopicInput] = useState(currentTopic);
  const [gradeSelect, setGradeSelect] = useState(currentGrade);

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!topicInput.trim()) return;
    onApplyTopicAndGrade(topicInput.trim(), gradeSelect);
    setIsOpen(false);
  };

  const handleSelectPreset = (presetTopic: string, presetGrade: string) => {
    setTopicInput(presetTopic);
    setGradeSelect(presetGrade);
    onApplyTopicAndGrade(presetTopic, presetGrade);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Trigger Bar Button */}
      <button
        onClick={() => setIsOpen(true)}
<<<<<<< HEAD
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#F1F0FE] hover:bg-[#E8E7FC] border border-[#DDE1E8] text-xs font-semibold text-[#2B313C] shadow-sm transition-all cursor-pointer group"
      >
        <BookOpen className="w-3.5 h-3.5 text-[#4F46E5] group-hover:rotate-6 transition-transform" />
        <span className="text-[#8A93A3]">Topic:</span>
        <span className="font-bold text-[#161A22] max-w-[150px] sm:max-w-[200px] truncate">
          {currentTopic || 'Choose Any Topic On The Fly...'}
        </span>
        <span className="hidden md:inline px-1.5 py-0.5 rounded bg-white text-[10px] text-[#4F46E5] font-mono border border-[#DDE1E8]">
          {currentGrade}
        </span>
        <span className="ml-1 text-[10px] text-[#4F46E5] underline decoration-amber-400/50">
=======
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#122e1e] hover:bg-[#183e29] border border-[#23583a] text-xs font-semibold text-[#f1faf4] shadow-sm transition-all cursor-pointer group"
      >
        <BookOpen className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-6 transition-transform" />
        <span className="text-[#a4d4bc]">Topic:</span>
        <span className="font-bold text-white max-w-[150px] sm:max-w-[200px] truncate">
          {currentTopic || 'Choose Any Topic On The Fly...'}
        </span>
        <span className="hidden md:inline px-1.5 py-0.5 rounded bg-black/40 text-[10px] text-emerald-300 font-mono">
          {currentGrade}
        </span>
        <span className="ml-1 text-[10px] text-amber-400 underline decoration-amber-400/50">
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
          {currentTopic ? 'Change' : 'Enter Topic'}
        </span>
      </button>

      {/* Modal / Dialog Overlay */}
      {isOpen && (
<<<<<<< HEAD
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/90 backdrop-blur-sm animate-fadeIn">
          <div
            className="w-full max-w-xl bg-[#FFFFFF] border-2 border-[#DDE1E8] rounded-3xl p-6 shadow-sm text-[#161A22] relative max-h-[90vh] overflow-y-auto"
=======
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div
            className="w-full max-w-xl bg-[#092215] border-2 border-[#2b6a45] rounded-3xl p-6 shadow-2xl text-[#f3f9f5] relative max-h-[90vh] overflow-y-auto"
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setIsOpen(false)}
<<<<<<< HEAD
              className="absolute top-4 right-4 p-2 rounded-full bg-[#F1F0FE] hover:bg-[#E3E6EC] text-[#8A93A3] hover:text-[#161A22] transition-colors cursor-pointer"
=======
              className="absolute top-4 right-4 p-2 rounded-full bg-[#122e1e] hover:bg-[#1b432a] text-[#a4d4bc] hover:text-white transition-colors cursor-pointer"
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Title */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-amber-400 flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5 text-black" />
              </div>
              <div>
                <h3 className="text-xl font-bold font-serif text-white">
                  Choose Any Subject or Topic
                </h3>
<<<<<<< HEAD
                <p className="text-xs text-[#8A93A3]">
=======
                <p className="text-xs text-[#8ab69e]">
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
                  Enter your topic and grade level. The AI will generate a completely fresh, dynamic lesson and visual blackboard in real time.
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleApply} className="space-y-4">
              {/* Topic Input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-300 mb-1.5">
                  What topic do you want to learn?
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    placeholder="e.g. Photosynthesis, French Revolution, Newton's Laws..."
<<<<<<< HEAD
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#F8F9FB] border-2 border-[#DDE1E8] focus:border-[#4F46E5] focus:outline-none text-[#161A22] text-sm font-medium placeholder-[#A4ACBA]"
                  />
                  <Search className="w-4 h-4 text-[#8A93A3] absolute left-3.5 top-3" />
=======
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0e2a1b] border-2 border-[#23583a] focus:border-amber-400 focus:outline-none text-white text-sm font-medium placeholder-[#5e8871]"
                  />
                  <Search className="w-4 h-4 text-[#7aa78f] absolute left-3.5 top-3" />
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
                </div>
              </div>

              {/* Grade Level Selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-emerald-300 mb-1.5">
                  Your Grade or Learning Level:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {GRADE_OPTIONS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGradeSelect(g)}
                      className={`p-2 rounded-xl text-xs font-medium border text-left transition-all cursor-pointer ${
                        gradeSelect === g
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 font-bold shadow-sm'
<<<<<<< HEAD
                          : 'bg-[#F8F9FB] border-[#E3E6EC] text-[#8A93A3] hover:bg-[#F1F0FE] hover:text-[#161A22]'
                      }`}
                    >
                      <GraduationCap className="w-3.5 h-3.5 mb-1 text-[#4F46E5]" />
=======
                          : 'bg-[#0f2c1c] border-[#1f4e34] text-[#86b59b] hover:bg-[#153b26] hover:text-white'
                      }`}
                    >
                      <GraduationCap className="w-3.5 h-3.5 mb-1 text-amber-400" />
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
                      <span className="block truncate">{g}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !topicInput.trim()}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-amber-400 text-black font-bold text-sm flex items-center justify-center gap-2 hover:opacity-95 transition-opacity shadow-lg cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>Generating Dynamic Blackboard...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Fresh Lesson & Start Learning</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Inspiration Presets */}
<<<<<<< HEAD
            <div className="mt-6 pt-5 border-t border-[#E3E6EC]">
              <span className="text-[11px] font-bold text-[#8A93A3] uppercase tracking-wider block mb-2.5">
=======
            <div className="mt-6 pt-5 border-t border-[#1b432a]">
              <span className="text-[11px] font-bold text-[#8ab69e] uppercase tracking-wider block mb-2.5">
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
                Popular Inspiring Topics Across Subjects:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_TOPIC_SUGGESTIONS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectPreset(preset.topic, preset.grade)}
<<<<<<< HEAD
                    className="p-2.5 rounded-xl bg-[#F8F9FB] hover:bg-[#F1F0FE] border border-[#DDE1E8] text-left transition-colors cursor-pointer group flex items-center justify-between"
=======
                    className="p-2.5 rounded-xl bg-[#0f2a1b] hover:bg-[#163d27] border border-[#23583a] text-left transition-colors cursor-pointer group flex items-center justify-between"
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
                  >
                    <div>
                      <span className="text-[10px] text-amber-300 font-semibold block">
                        {preset.subject} &bull; {preset.grade}
                      </span>
                      <span className="text-xs text-white font-medium group-hover:text-emerald-300">
                        {preset.topic}
                      </span>
                    </div>
<<<<<<< HEAD
                    <ArrowRight className="w-3.5 h-3.5 text-[#A4ACBA] group-hover:text-[#4F46E5] group-hover:translate-x-0.5 transition-all" />
=======
                    <ArrowRight className="w-3.5 h-3.5 text-[#5e8871] group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
