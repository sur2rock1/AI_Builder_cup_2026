import React, { useState, useEffect, useCallback } from 'react';
import {
  LearnerProfileUI, SubjectProgressUI, ConceptStateUI,
  AssessmentResultUI, AdaptiveSessionUI, CurriculumConceptUI,
} from '../types';
import {
  Brain, TrendingUp, AlertTriangle, CheckCircle, Zap,
  ChevronRight, RotateCcw, Star, Clock, BookOpen, Target, Milestone, ShieldOff,
} from 'lucide-react';
import { authFetch } from '../firebase/auth';

// ─── Mastery colour mapping ─────────────────────────────────────
const MASTERY_COLOR: Record<string, string> = {
  not_started: '#374151',
  exposed:     '#7c3aed',
  partial:     '#b45309',
  developing:  '#0369a1',
  proficient:  '#15803d',
  mastered:    '#d97706',
};
const MASTERY_LABEL: Record<string, string> = {
  not_started: 'Not Started',
  exposed:     'Exposed',
  partial:     'Partial',
  developing:  'Developing',
  proficient:  'Proficient',
  mastered:    'Mastered ✦',
};
const STRATEGY_LABEL: Record<string, string> = {
  direct_explanation:    'Direct Explanation',
  worked_example:        'Worked Example',
  visual_diagram:        'Visual Diagram',
  real_world_analogy:    'Real-World Analogy',
  socratic_questioning:  'Socratic Questioning',
  step_by_step:          'Step-by-Step',
  story_context:         'Story Context',
  interactive_simulation:'Interactive Simulation',
  peer_comparison:       'Peer Comparison',
  prerequisite_review:   'Prerequisite Review',
};
// T21 (FR-13) — evidence ladder / mastery status, from docs/TUTOR_PERSONA.md §5.
const MASTERY_STATUS_LABEL: Record<string, string> = {
  none:         'Not yet secure',
  provisional:  'Provisional',
  durable:      'Durable ✦',
  durable_plus: 'Durable+ ✦✦',
};
const MASTERY_STATUS_COLOR: Record<string, string> = {
  none:         '#6b7280',
  provisional:  '#0369a1',
  durable:      '#15803d',
  durable_plus: '#d97706',
};

const DEPTH_ICON: Record<string, string> = {
  memorised:   '📖',
  recognised:  '👁️',
  understood:  '💡',
  applied:     '🔧',
  transferred: '🚀',
  incorrect:   '❌',
  guessed:     '🎲',
  confused:    '🤔',
};

// ─── Props ──────────────────────────────────────────────────────
interface Props {
  learner: LearnerProfileUI | null;
  session: AdaptiveSessionUI | null;
  currentConcept: CurriculumConceptUI | null;
  lastAssessment: AssessmentResultUI | null;
  onStartSession: (studentId: string, name: string, grade: string, subjectId: string) => void;
  onAssessQuiz: (questionSummary: string, studentAnswer: string, correctAnswer: string, selectedIdx: number, correctIdx: number) => void;
  sessionId: string | null;
  isVisible: boolean;
  /** Hide the floating side tab — the immersive stage opens this from its top bar. */
  hideTab?: boolean;
  onToggle: () => void;
}

// ─── Mastery bar ────────────────────────────────────────────────
function MasteryBar({ score, level }: { score: number; level: string }) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: 3 }}>
        <span style={{ color: MASTERY_COLOR[level] || '#9ca3af', fontWeight: 600 }}>
          {MASTERY_LABEL[level] || level}
        </span>
        <span style={{ color: '#9ca3af' }}>{score}/100</span>
      </div>
      <div style={{ background: '#1f2937', borderRadius: 6, height: 6, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 6,
          background: MASTERY_COLOR[level] || '#6b7280',
          width: `${score}%`,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  );
}

// ─── Concept card ───────────────────────────────────────────────
interface ConceptCardProps {
  cs: ConceptStateUI;
  studentId?: string;
  subjectId?: string;
}
const ConceptCard: React.FC<ConceptCardProps> = ({ cs, studentId, subjectId }) => {
  const [expanded, setExpanded] = useState(false);
  const [disputing, setDisputing] = useState<string | null>(null);
  const [disputed, setDisputed] = useState<Set<string>>(new Set());

  // T21 (FR-22) — "That's not right." Marks the ledger entry disputed on the
  // server (server.ts's dispute route -> learnerStore.disputeMisconception);
  // R-WATCH in src/plan/compile.ts only watches suspected/confirmed entries,
  // so a disputed one drops out of the plan on the next compile.
  const handleDispute = useCallback(async (misconceptionId: string) => {
    if (!studentId || !subjectId) return;
    setDisputing(misconceptionId);
    try {
      const res = await authFetch(
        `/api/learners/${encodeURIComponent(studentId)}/subjects/${encodeURIComponent(subjectId)}/concepts/${encodeURIComponent(cs.conceptId)}/misconceptions/${encodeURIComponent(misconceptionId)}/dispute`,
        { method: 'POST' },
      );
      if (res.ok) setDisputed(prev => new Set(prev).add(misconceptionId));
    } catch (err) {
      console.error('[LearnerProfilePanel] dispute failed', err);
    } finally {
      setDisputing(null);
    }
  }, [studentId, subjectId, cs.conceptId]);

  const ledger = (cs.misconceptionLedger || []).filter(m => !disputed.has(m.id));
  const openLedger = ledger.filter(m => m.status === 'suspected' || m.status === 'confirmed');

  return (
    <div
      style={{
        background: '#111827', border: '1px solid #1f2937', borderRadius: 8,
        padding: '10px 12px', marginBottom: 6,
        borderLeft: `3px solid ${MASTERY_COLOR[cs.masteryLevel] || '#374151'}`,
      }}
    >
      <div onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 500 }}>{cs.label}</span>
          <ChevronRight size={14} color="#6b7280" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
        </div>
        <div style={{ marginTop: 6 }}>
          <MasteryBar score={cs.masteryScore} level={cs.masteryLevel} />
        </div>
        {(cs.ladder || cs.masteryStatus) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
            {cs.ladder && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10,
                color: '#9ca3af', background: '#1f2937', borderRadius: 5, padding: '1px 6px',
              }}>
                <Milestone size={10} /> L{cs.ladder.highestLevel}
              </span>
            )}
            {cs.masteryStatus && (
              <span style={{
                fontSize: 10, fontWeight: 600, borderRadius: 5, padding: '1px 6px',
                color: MASTERY_STATUS_COLOR[cs.masteryStatus] || '#9ca3af',
                background: '#1f2937',
              }}>
                {MASTERY_STATUS_LABEL[cs.masteryStatus] || cs.masteryStatus}
              </span>
            )}
          </div>
        )}
      </div>
      {expanded && (
        <div style={{ marginTop: 10, fontSize: 12 }}>
          <div style={{ color: '#9ca3af', marginBottom: 4 }}>
            Attempts: {cs.attemptCount} · Correct: {cs.correctCount}
          </div>

          {/* Misconception ledger — the real per-entry status + a dispute
              affordance, superseding the flat confirmedMisconceptions list
              below where the richer data is available. */}
          {openLedger.length > 0 ? (
            <div style={{ background: '#450a0a', borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
              <div style={{ color: '#fca5a5', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>
                ⚠ Misconception ledger
              </div>
              {openLedger.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                  <div style={{ color: '#f87171', fontSize: 11 }}>
                    [{m.status}] {m.text}
                    <span style={{ color: '#9ca3af' }}> · {m.observations} observation{m.observations === 1 ? '' : 's'}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDispute(m.id); }}
                    disabled={disputing === m.id}
                    title="Tell the tutor this isn't right — it drops from the plan until seen again"
                    style={{
                      flexShrink: 0, background: 'none', border: '1px solid #7f1d1d', borderRadius: 5,
                      color: '#fca5a5', fontSize: 10, padding: '2px 6px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 3, opacity: disputing === m.id ? 0.5 : 1,
                    }}
                  >
                    <ShieldOff size={10} /> {disputing === m.id ? '…' : "Not right"}
                  </button>
                </div>
              ))}
            </div>
          ) : cs.confirmedMisconceptions.length > 0 && (
            <div style={{ background: '#450a0a', borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
              <div style={{ color: '#fca5a5', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>
                ⚠ Confirmed Misconceptions
              </div>
              {cs.confirmedMisconceptions.map((m, i) => (
                <div key={i} style={{ color: '#f87171', fontSize: 11, marginBottom: 2 }}>• {m}</div>
              ))}
            </div>
          )}
          {disputed.size > 0 && (
            <div style={{ color: '#6b7280', fontSize: 10, marginBottom: 6, fontStyle: 'italic' }}>
              You marked {disputed.size} entr{disputed.size === 1 ? 'y' : 'ies'} as not right — dropped from the
              teaching plan until seen again.
            </div>
          )}
          {cs.effectiveStrategies.length > 0 && (
            <div style={{ color: '#86efac', fontSize: 11, marginBottom: 4 }}>
              ✓ Worked well: {cs.effectiveStrategies.map(s => STRATEGY_LABEL[s] || s).join(', ')}
            </div>
          )}
          {cs.ineffectiveStrategies.length > 0 && (
            <div style={{ color: '#fbbf24', fontSize: 11 }}>
              ✗ Didn't help: {cs.ineffectiveStrategies.map(s => STRATEGY_LABEL[s] || s).join(', ')}
            </div>
          )}
          {cs.notes.slice(-2).map((n, i) => (
            <div key={i} style={{ color: '#6b7280', fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>{n}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main panel ─────────────────────────────────────────────────
export const LearnerProfilePanel: React.FC<Props> = ({
  learner, session, currentConcept, lastAssessment,
  onStartSession, sessionId, isVisible, onToggle, hideTab,
}) => {
  const [studentName, setStudentName] = useState('Alex');

  const subjectProgress: SubjectProgressUI | null = learner && session
    ? learner.subjects[session.subjectId] || null
    : null;

  const conceptStates = subjectProgress
    ? Object.values(subjectProgress.conceptStates).sort((a, b) => a.conceptId.localeCompare(b.conceptId))
    : [];

  const overallMastery = conceptStates.length > 0
    ? Math.round(conceptStates.reduce((sum, cs) => sum + cs.masteryScore, 0) / conceptStates.length)
    : 0;

  const handleStart = () => {
    onStartSession('student-demo', studentName, 'Secondary 2 (Grade 8)', 'pythagoras');
  };

  if (!isVisible) {
    if (hideTab) return null;
    return (
      <button
        onClick={onToggle}
        style={{
          position: 'fixed', right: 0, bottom: 96,
          background: '#4F46E5', color: 'white', border: 'none', borderRadius: '10px 0 0 10px',
          padding: '12px 8px', cursor: 'pointer', zIndex: 100,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          fontSize: 11, fontWeight: 600, boxShadow: '0 4px 14px rgba(79,70,229,0.28)',
        }}
      >
        <Brain size={18} />
        <span style={{ writingMode: 'vertical-rl', letterSpacing: 1 }}>LEARNER</span>
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 320,
      background: '#0d1117', borderLeft: '1px solid #1f2937',
      display: 'flex', flexDirection: 'column', zIndex: 99,
      fontFamily: 'system-ui, sans-serif', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid #1f2937',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#0a0f1a',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={18} color="#60a5fa" />
          <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15 }}>Learner Profile</span>
        </div>
        <button onClick={onToggle} style={{
          background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4,
          fontSize: 18, lineHeight: 1,
        }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

        {/* Session setup (before session starts) */}
        {!session && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>START A LEARNING SESSION</div>
            <input
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              placeholder="Student name"
              style={{
                width: '100%', background: '#1f2937', border: '1px solid #374151',
                borderRadius: 8, padding: '8px 10px', color: '#e5e7eb', fontSize: 13,
                marginBottom: 8, boxSizing: 'border-box',
              }}
            />
            <button onClick={handleStart} style={{
              width: '100%', background: '#1d4ed8', color: 'white', border: 'none',
              borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              Begin Adaptive Session →
            </button>
          </div>
        )}

        {/* Learner summary */}
        {learner && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16 }}>{learner.name}</div>
                <div style={{ color: '#9ca3af', fontSize: 12 }}>{learner.grade}</div>
              </div>
              {subjectProgress && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: 18 }}>{overallMastery}%</div>
                  <div style={{ color: '#9ca3af', fontSize: 11 }}>Overall</div>
                </div>
              )}
            </div>

            {subjectProgress && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {[
                  { icon: <Clock size={12}/>, label: `${subjectProgress.sessionCount} sessions` },
                  { icon: <Target size={12}/>, label: `${subjectProgress.totalMinutes}m studied` },
                  { icon: <BookOpen size={12}/>, label: `${conceptStates.length} concepts` },
                ].map(({ icon, label }, i) => (
                  <div key={i} style={{
                    flex: 1, background: '#111827', borderRadius: 8, padding: '6px 8px',
                    display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9ca3af',
                  }}>
                    <span style={{ color: '#60a5fa' }}>{icon}</span>{label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Current concept + strategy */}
        {session && currentConcept && (
          <div style={{
            background: '#0c1528', border: '1px solid #1d4ed8', borderRadius: 10,
            padding: '12px 14px', marginBottom: 14,
          }}>
            <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
              NOW TEACHING
            </div>
            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
              {currentConcept.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={12} color="#fbbf24" />
              <span style={{ color: '#fbbf24', fontSize: 12, fontWeight: 600 }}>
                Strategy: {STRATEGY_LABEL[session.currentStrategy] || session.currentStrategy}
              </span>
            </div>
            {session.pendingStrategySwitch && (
              <div style={{
                marginTop: 8, background: '#292524', borderRadius: 6, padding: '6px 8px',
                fontSize: 11, color: '#fb923c',
              }}>
                ↻ Switching to: {STRATEGY_LABEL[session.pendingStrategySwitch]}
                {session.switchReason && <span style={{ color: '#9ca3af' }}> — {session.switchReason}</span>}
              </div>
            )}
          </div>
        )}

        {/* Last assessment result */}
        {lastAssessment && (
          <div style={{
            background: lastAssessment.misconceptionDetected ? '#1c0a0a' : '#071a0e',
            border: `1px solid ${lastAssessment.misconceptionDetected ? '#7f1d1d' : '#14532d'}`,
            borderRadius: 10, padding: '10px 12px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4,
              color: lastAssessment.misconceptionDetected ? '#fca5a5' : '#86efac' }}>
              {DEPTH_ICON[lastAssessment.understandingDepth]} LAST RESPONSE — {lastAssessment.understandingDepth.toUpperCase()}
            </div>
            {lastAssessment.misconceptionDetected && lastAssessment.misconceptionDescription && (
              <div style={{ color: '#f87171', fontSize: 12, marginBottom: 4 }}>
                ⚠ {lastAssessment.misconceptionDescription}
              </div>
            )}
            <div style={{ color: '#6b7280', fontSize: 11, fontStyle: 'italic' }}>
              {lastAssessment.teachingNote}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: lastAssessment.masteryDelta >= 0 ? '#4ade80' : '#f87171' }}>
              Mastery {lastAssessment.masteryDelta >= 0 ? '+' : ''}{lastAssessment.masteryDelta} pts
            </div>
          </div>
        )}

        {/* Concept states */}
        {conceptStates.length > 0 && (
          <div>
            <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>
              CONCEPT MASTERY MAP
            </div>
            {conceptStates.map(cs => (
              <ConceptCard key={cs.conceptId} cs={cs} studentId={learner?.studentId} subjectId={session?.subjectId} />
            ))}
          </div>
        )}

        {/* Global insights */}
        {learner && learner.globalInsights.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, marginBottom: 6, letterSpacing: 1 }}>
              AI INSIGHTS
            </div>
            {learner.globalInsights.slice(-3).map((insight, i) => (
              <div key={i} style={{
                background: '#111827', borderRadius: 8, padding: '7px 10px',
                marginBottom: 4, color: '#d1d5db', fontSize: 12,
              }}>
                {insight}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LearnerProfilePanel;
