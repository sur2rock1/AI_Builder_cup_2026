// ─────────────────────────────────────────────────────────────────
// Representation catalogue (docs/TUTOR_PERSONA.md §7). Re-uses the
// existing TeachingStrategy enum so no data migration is needed.
// ─────────────────────────────────────────────────────────────────
import { TeachingStrategy } from '../adaptive/learnerModel';

export const REPRESENTATION_DESCRIPTIONS: Record<TeachingStrategy, string> = {
  direct_explanation: 'Clear definitions, first exposure for older learners. Short; never the retry after a failed direct explanation.',
  worked_example: 'Procedures, novices. Fade as competence grows.',
  visual_diagram: 'Spatial and structural ideas. The board shows only what is being said.',
  real_world_analogy: 'Abstract ideas. Themed on learner interests where possible.',
  socratic_questioning: 'Learners at L2+ on ideas that can be reasoned out. Not for novices with no foothold.',
  step_by_step: 'Multi-step procedures. One step per board bullet.',
  story_context: 'Ages 5-12, narrative subjects. Short; the concept stays central.',
  interactive_simulation: 'Relationships between variables. "Change this, watch that."',
  peer_comparison: "Comparing METHODS (e.g. \"another student did it like this\"). Never compares the learner to people.",
  prerequisite_review: 'Missing foundations. Used by PREREQ_DETOUR.',
};

/** Default order per subject mode when there is no per-learner evidence yet
 * (docs/TEACHING_PLAN.md §3). */
export const DEFAULT_REPRESENTATION_ORDER: Record<'well_structured' | 'interpretive' | 'skill', TeachingStrategy[]> = {
  well_structured: [
    'visual_diagram', 'worked_example', 'real_world_analogy',
    'step_by_step', 'interactive_simulation', 'socratic_questioning',
  ],
  interpretive: [
    'real_world_analogy', 'socratic_questioning', 'story_context',
    'direct_explanation', 'peer_comparison',
  ],
  skill: [
    'worked_example', 'step_by_step', 'interactive_simulation',
    'real_world_analogy', 'direct_explanation',
  ],
};

export function representationsForMode(mode: 'well_structured' | 'interpretive' | 'skill'): TeachingStrategy[] {
  return DEFAULT_REPRESENTATION_ORDER[mode];
}
