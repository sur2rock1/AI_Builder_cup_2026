// T23 (FR-24, FR-04) — "Tutor's-reasoning panel": shows the judge (or a
// curious learner/parent) what the deterministic Teaching Plan decided and
// why, plus a live feed of what the Diagnostician found on each answer and
// what it changed. Every line here traces back to a PlanReason{rule,text,
// evidenceRefs} from src/plan/compile.ts or a diagnosis from
// src/adaptive/reasoningAssessor.ts — nothing here is invented copy.
import React from 'react';
import { Sparkles, Target, Layers, ShieldAlert, Gauge, MessageSquareQuote } from 'lucide-react';
import type {
  TeachingPlanUI, ReasoningLogEntryUI, PlanReasonUI, TeachingStrategy,
} from '../types';

const STRATEGY_LABEL: Record<string, string> = {
  direct_explanation:     'Direct explanation',
  worked_example:         'Worked example',
  visual_diagram:         'Visual diagram',
  real_world_analogy:     'Real-world analogy',
  socratic_questioning:   'Socratic questioning',
  step_by_step:           'Step-by-step',
  story_context:          'Story context',
  interactive_simulation: 'Interactive simulation',
  peer_comparison:        'Peer comparison',
  prerequisite_review:    'Prerequisite review',
};
const stratLabel = (s?: TeachingStrategy | string) => (s ? STRATEGY_LABEL[s] || String(s) : '—');

const CLASSIFICATION_LABEL: Record<string, string> = {
  sound_reasoning: 'Sound reasoning',
  misconception_behind_correct: 'Correct answer, flawed method',
  wrong_answer: 'Wrong answer',
  needs_clarification: 'Needs clarification',
};

function ReasonLine({ reason }: { reason?: PlanReasonUI }) {
  if (!reason) return null;
  return (
    <div style={{ marginTop: 3, fontSize: 11, color: '#7d8590', lineHeight: 1.4 }}>
      <span style={{
        display: 'inline-block', fontFamily: 'monospace', fontSize: 10, color: '#60a5fa',
        background: '#0c1528', border: '1px solid #1d4ed8', borderRadius: 4,
        padding: '0 4px', marginRight: 5,
      }}>{reason.rule}</span>
      {reason.text}
    </div>
  );
}

interface Props {
  plan: TeachingPlanUI | null;
  log: ReasoningLogEntryUI[];
  isVisible: boolean;
  onToggle: () => void;
}

export const TutorReasoningPanel: React.FC<Props> = ({ plan, log, isVisible, onToggle }) => {
  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        style={{
          position: 'fixed', left: 0, bottom: 96,
          background: '#7c3aed', color: 'white', border: 'none', borderRadius: '0 10px 10px 0',
          padding: '12px 8px', cursor: 'pointer', zIndex: 100,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          fontSize: 11, fontWeight: 600, boxShadow: '0 4px 14px rgba(124,58,237,0.28)',
        }}
      >
        <Sparkles size={18} />
        <span style={{ writingMode: 'vertical-rl', letterSpacing: 1 }}>REASONING</span>
      </button>
    );
  }

  const recent = [...log].reverse().slice(0, 12);

  return (
    <div style={{
      position: 'fixed', left: 0, top: 0, bottom: 0, width: 340,
      background: '#0d1117', borderRight: '1px solid #1f2937',
      display: 'flex', flexDirection: 'column', zIndex: 99,
      fontFamily: 'system-ui, sans-serif', overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid #1f2937',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0f1a',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} color="#a78bfa" />
          <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15 }}>Tutor's Reasoning</span>
        </div>
        <button onClick={onToggle} style={{
          background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4,
          fontSize: 18, lineHeight: 1,
        }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {!plan && (
          <div style={{ color: '#6b7280', fontSize: 12, padding: '12px 4px' }}>
            No plan compiled yet for this session — start a lesson to see the deterministic
            Teaching Plan (src/plan/compile.ts) and the live diagnosis feed here.
          </div>
        )}

        {plan && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>
              PLAN {plan.planVersion} · PERSONA v{plan.personaVersion}
            </div>

            <div style={{ background: '#0c1528', border: '1px solid #1d4ed8', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#93c5fd', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>
                <Target size={12} /> TARGET
              </div>
              <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>{plan.targetConcept?.label}</div>
              <ReasonLine reason={plan.targetConcept?.reason} />
            </div>

            {plan.reviewItems?.length > 0 && (
              <div style={{ background: '#111827', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ color: '#d1d5db', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>↻ Reviews due first</div>
                {plan.reviewItems.map((r, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#e5e7eb', marginBottom: 4 }}>
                    {r.conceptId}
                    <ReasonLine reason={r.reason} />
                  </div>
                ))}
              </div>
            )}

            {plan.prerequisitesToProbe?.length > 0 && (
              <div style={{ background: '#111827', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ color: '#d1d5db', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Probe prerequisites first</div>
                {plan.prerequisitesToProbe.map((p, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#e5e7eb', marginBottom: 4 }}>
                    {p.label}
                    <ReasonLine reason={p.reason} />
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: '#111827', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#d1d5db', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                <Layers size={12} /> Teach in this order
              </div>
              {plan.representationOrder?.slice(0, 4).map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: '#e5e7eb', marginBottom: 4 }}>
                  {i + 1}. {stratLabel(r.strategy)}
                  <ReasonLine reason={r.reason} />
                </div>
              ))}
              {plan.avoidRepresentations?.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#fb923c' }}>
                  Avoiding: {plan.avoidRepresentations.map(a => stratLabel(a.strategy)).join(', ')}
                  {plan.avoidRepresentations[0]?.reason && <ReasonLine reason={plan.avoidRepresentations[0].reason} />}
                </div>
              )}
            </div>

            {plan.watchMisconceptions?.length > 0 && (
              <div style={{ background: '#1c0a0a', border: '1px solid #7f1d1d', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fca5a5', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                  <ShieldAlert size={12} /> Watching for
                </div>
                {plan.watchMisconceptions.map((w, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#fecaca', marginBottom: 4 }}>
                    [{w.status}] {w.text}{w.probe ? ` — probe: "${w.probe}"` : ''}
                    <ReasonLine reason={w.reason} />
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#9ca3af' }}>
              <div style={{ flex: 1, background: '#111827', borderRadius: 8, padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Gauge size={12} color="#60a5fa" /> Scaffold: {plan.scaffoldLevel} · Diff {plan.difficulty}/5
              </div>
            </div>
            {plan.thinkAloudLines?.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#a78bfa', fontStyle: 'italic', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <MessageSquareQuote size={12} style={{ marginTop: 2, flexShrink: 0 }} />
                "{plan.thinkAloudLines[0]}"
              </div>
            )}
          </div>
        )}

        {/* Live feed: diagnosis -> plan delta, most recent first */}
        <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
          LIVE — WHAT THE TUTOR JUST DID
        </div>
        {recent.length === 0 && (
          <div style={{ color: '#4b5563', fontSize: 12, fontStyle: 'italic' }}>
            Nothing diagnosed yet this session — this fills in the moment the child answers and
            `assess_child_reasoning` fires.
          </div>
        )}
        {recent.map((entry) => (
          <div key={entry.id} style={{
            borderLeft: `2px solid ${entry.kind === 'diagnosis' ? '#60a5fa' : '#a78bfa'}`,
            paddingLeft: 10, marginBottom: 10,
          }}>
            <div style={{ fontSize: 10, color: '#6b7280' }}>
              {new Date(entry.timestamp).toLocaleTimeString()} · {entry.kind === 'diagnosis' ? 'DIAGNOSIS' : 'PLAN DELTA'}
            </div>
            {entry.kind === 'diagnosis' && entry.diagnosis && (
              <>
                <div style={{ fontSize: 12, color: '#e5e7eb', marginTop: 2 }}>
                  Move <b>{entry.diagnosis.moveUsed}</b> — {CLASSIFICATION_LABEL[entry.diagnosis.classification] || entry.diagnosis.classification}
                  {' '}({entry.diagnosis.confidence} confidence, {entry.diagnosis.diagnosisLatencyMs}ms)
                </div>
                {entry.diagnosis.candidateMisconceptions.length > 0 && (
                  <div style={{ fontSize: 11, color: '#f87171', marginTop: 2 }}>
                    ⚠ {entry.diagnosis.candidateMisconceptions.map(m => m.text).join('; ')}
                  </div>
                )}
                {entry.evidence && (
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                    Ladder L{entry.evidence.ladderLevel} · mastery {entry.evidence.masteryBefore}→{entry.evidence.masteryAfter} · status {entry.evidence.masteryStatus}
                    {entry.evidence.newlyConfirmed.length > 0 && <span style={{ color: '#f87171' }}> · misconception CONFIRMED</span>}
                  </div>
                )}
              </>
            )}
            {entry.kind === 'plan_update' && entry.planUpdate && (
              <div style={{ fontSize: 12, color: '#ddd6fe', marginTop: 2 }}>
                {entry.planUpdate.instruction}
                {entry.planUpdate.nextRepresentation && (
                  <span style={{ color: '#a78bfa' }}> → switching to {stratLabel(entry.planUpdate.nextRepresentation)}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TutorReasoningPanel;
