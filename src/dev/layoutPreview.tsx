// Development-only: renders the tutor stage with sample data so the responsive layout can be checked at
// phone / tablet / desktop sizes without a voice session.   ?view=stage | guided | live
// Not part of the production build (vite builds index.html only).
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { ImmersiveStage } from '../components/ImmersiveStage';
import { GuidedBoard } from '../guided/GuidedBoard';
import { startBeat, nextLine } from '../guided/board';
import { EMPTY_GUIDED_BOARD, type GuidedBoardState } from '../guided/types';
import { ALL_GUIDED_SCRIPTS } from '../guided/registry';
import { SAMPLE_VISUALS } from '../visual/samples';
import { TutorNameProvider } from '../persona/TutorNameContext';
import { TutorModeSwitch } from '../guided/TutorModeSwitch';

const params = new URLSearchParams(location.search);
const view = params.get('view') || 'stage';
const live = view === 'live';

const script = ALL_GUIDED_SCRIPTS[0];
let board: GuidedBoardState = { ...EMPTY_GUIDED_BOARD, items: [], filled: {} };
for (let i = 0; i < 3; i++) board = startBeat(board, script);

const noop = () => {};
const App: React.FC = () => (
  <TutorNameProvider name="Ananta">
    <div id="app-root" className="w-full h-app flex flex-col bg-[#0C0F16] text-white overflow-hidden">
      <main className="flex-1 min-h-0">
        <ImmersiveStage
          headerExtra={view === 'guided' ? <TutorModeSwitch value="guided" onChange={noop} locked={false} pace="steady" onPaceChange={noop} /> : undefined}
          boardOverride={view === 'guided' ? (
            <GuidedBoard payload={{ script, visuals: { main: SAMPLE_VISUALS.main, apply: SAMPLE_VISUALS.apply } as any }} board={board} conceptLabel={script.title} />
          ) : undefined}
          conceptLabel="Equations of Horizontal and Vertical Lines"
          subject="Mathematics" grade="Grade 8"
          figure={{ a: 4, b: 3, unknownSide: null }} revealed={[]} focusPart={null}
          studentThinking={null}
          assessment={{ classification: 'misconception_behind_correct', understandingDepth: 'recognised', confidence: 'medium',
            probeQuestion: 'If a point is on the line x = 2, what must be true about its x-coordinate?', shouldProbe: false } as any}
          notes={null} masteryScore={42}
          misconceptions={[{ id: 'm1', text: 'Thinks y = 3 is a vertical line', status: 'suspected' },
                           { id: 'm2', text: 'Swaps x and y when reading coordinates', status: 'confirmed' }]}
          isLessonActive={live} isSpeaking={live} isThinking={false}
          learner={{ concept: { id: 'c', label: 'Horizontal and vertical lines' }, understanding: 42, level: 'recognises',
            evidence: 'the line goes sideways so it is x', noticed: 'Names the line by direction, not by the value that stays fixed.',
            strengths: ['Plots points accurately'], misconceptions: [], nextStep: 'Compare x = 2 with y = 2 on one grid.',
            exchanges: 3, updatedAt: 1, byConcept: {} } as any}
          mouthOpenness={0.4} micLevel={0.5} panelMode="shape" scene={null}
          visual={SAMPLE_VISUALS.main as any} visualStep="all" visual3dStep="all"
          tutorLine="Look at the three points on the grid. What do you notice about their x-values?"
          studentName="Aisha"
          onPanelModeChange={noop} onConfusion={noop} onToggleLesson={noop} onChangeTopic={noop} onOpenProfile={noop}
        />
      </main>
    </div>
  </TutorNameProvider>
);

createRoot(document.getElementById('root')!).render(<App />);
