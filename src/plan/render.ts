// renderPlanForPrompt() — docs/TEACHING_PLAN.md §5. Turns a compiled
// TeachingPlan into the block appended to the composed system prompt.
import { TeachingPlan } from './types';

export function renderPlanForPrompt(plan: TeachingPlan, learnerName?: string): string {
  const lines: string[] = [];
  lines.push(`YOUR PLAN FOR ${learnerName || 'THIS LEARNER'} (plan ${plan.planVersion} · persona v${plan.personaVersion})`);

  if (plan.reviewItems.length) {
    lines.push(`Warm-up reviews (ask first, no teaching unless failed): ${plan.reviewItems.map((r) => r.label).join(', ')}.`);
  }
  lines.push(`Target: ${plan.targetConcept.label}. Goal: reach ladder level ${plan.startLadderGoal}/5. (${plan.targetConcept.reason.text})`);

  if (plan.prerequisitesToProbe.length) {
    lines.push(`Probe these first, max ${plan.limits.maxPrereqProbes}: ${plan.prerequisitesToProbe.map((p) => `"${p.label}"`).join(', ')}.`);
  }

  const repOrder = plan.representationOrder.slice(0, 4).map((r) => r.strategy.replace(/_/g, ' ')).join(' -> ');
  lines.push(`Teach in this order of representations: ${repOrder}.`);
  if (plan.avoidRepresentations.length) {
    lines.push(`Avoid: ${plan.avoidRepresentations.map((a) => `${a.strategy.replace(/_/g, ' ')} (${a.reason.text})`).join('; ')}.`);
  }

  if (plan.watchMisconceptions.length) {
    lines.push(`Watch for: ${plan.watchMisconceptions.map((w) => `[${w.status}] "${w.text}"`).join('; ')}.`);
  }

  lines.push(`Scaffold: ${plan.scaffoldLevel}. Difficulty ${plan.difficulty}/5.${plan.exampleThemes.length ? ` Examples themed on: ${plan.exampleThemes.join(', ')}.` : ''}`);
  lines.push(`Pace: ${plan.pace.chunkSentences[0]}-${plan.pace.chunkSentences[1]} sentences per chunk, check every ${plan.pace.checkEvery} chunk(s), confidence check every ${plan.pace.confidenceCheckEvery} question(s), ~${plan.pace.sessionMinutes} min session.`);
  lines.push(`Limits: probe budget ${plan.limits.probeBudget} · retry cap ${plan.limits.retryCap} · max ${plan.limits.maxChecksWithoutTeach} checks without new teaching.`);
  if (plan.fastTrackEligible) {
    lines.push(`This learner may already know this — after your first check, if the evidence is strong, offer to skip ahead.`);
  }
  for (const line of plan.thinkAloudLines) {
    lines.push(`Say something like this near the start (in your own words): "${line}"`);
  }
  lines.push('This plan adapts HOW you teach. It never overrides the HARD RULES above.');
  return lines.join('\n');
}
