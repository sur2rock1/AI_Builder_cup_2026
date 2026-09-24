// ─────────────────────────────────────────────────────────────────
// Curriculum Intelligence Layer
//
// Converts the structured curriculum knowledge base (scope maps,
// prerequisite chains, misconception catalogues) into text blocks
// that are injected into the voice-tutor system prompt.
//
// Key principle from the framework:
//   Curriculum  → defines WHAT the student should learn
//   Student     → defines WHERE the student currently is
//   AI Tutor    → decides HOW to get from here to the outcome
//
// This module handles the "WHAT" injection so the tutor:
//   1. Enforces scope boundaries (never teaches out-of-scope topics)
//   2. Verifies prerequisites before diving into a concept
//   3. Uses curriculum-grounded diagnostic probes to catch misconceptions
// ─────────────────────────────────────────────────────────────────

import {
  CurriculumSubject,
  CurriculumConcept,
  MisconceptionDetail,
  PrerequisiteDetail,
  ChapterScopeMap,
} from '../adaptive/learnerModel';
import { getCurriculum } from './ingest';

// ─── Public API ──────────────────────────────────────────────────

export interface CurriculumIntelligenceContext {
  /** Full text block ready for injection into the system prompt. */
  systemPromptBlock: string;
  /** Compact summary (for logging / parent portal). */
  summary: {
    subjectLabel: string;
    grade: string;
    chapterTitle: string;
    conceptLabel: string;
    prerequisiteCount: number;
    misconceptionCount: number;
    hasScope: boolean;
  };
}

/**
 * Build the curriculum intelligence context for a specific concept.
 * Returns null when the subject or concept cannot be found.
 */
export function buildCurriculumIntelligenceContext(
  subjectId: string,
  conceptId: string,
): CurriculumIntelligenceContext | null {
  const curriculum = getCurriculum(subjectId);
  if (!curriculum) return null;

  const concept = curriculum.concepts.find(c => c.id === conceptId);
  if (!concept) return null;

  const chapterTitle = concept.chapter || 'General';
  const scopeMap = findScopeMap(curriculum, chapterTitle);

  const prereqDetails = resolvePrerequisiteDetails(curriculum, concept);
  const misconceptionDetails = resolveMisconceptionDetails(concept);

  const systemPromptBlock = buildSystemPromptBlock({
    curriculum,
    concept,
    chapterTitle,
    scopeMap,
    prereqDetails,
    misconceptionDetails,
  });

  return {
    systemPromptBlock,
    summary: {
      subjectLabel: curriculum.label,
      grade: curriculum.grade,
      chapterTitle,
      conceptLabel: concept.label,
      prerequisiteCount: prereqDetails.length,
      misconceptionCount: misconceptionDetails.length,
      hasScope: !!scopeMap,
    },
  };
}

/**
 * Get all misconception probe questions for a concept.
 * Used by the diagnostic engine to select probes after a correct answer.
 */
export function getMisconceptionProbes(
  subjectId: string,
  conceptId: string,
): MisconceptionDetail[] {
  const curriculum = getCurriculum(subjectId);
  if (!curriculum) return [];
  const concept = curriculum.concepts.find(c => c.id === conceptId);
  if (!concept) return [];
  return resolveMisconceptionDetails(concept);
}

/**
 * Get the prerequisite check questions for a concept.
 * Used when a student appears stuck — tutor checks foundations first.
 */
export function getPrerequisiteChecks(
  subjectId: string,
  conceptId: string,
): Array<{ conceptLabel: string; checkQuestion: string; reason: string }> {
  const curriculum = getCurriculum(subjectId);
  if (!curriculum) return [];
  const concept = curriculum.concepts.find(c => c.id === conceptId);
  if (!concept) return [];

  const details = resolvePrerequisiteDetails(curriculum, concept);
  return details.map(d => ({
    conceptLabel: d.label,
    checkQuestion: d.checkQuestion,
    reason: d.reason,
  }));
}

/**
 * Check whether a given topic string falls inside, outside or is advanced
 * relative to the curriculum scope for a chapter.
 */
export function classifyTopic(
  subjectId: string,
  chapterTitle: string,
  topicText: string,
): 'in_scope' | 'advanced' | 'out_of_scope' | 'unknown' {
  const curriculum = getCurriculum(subjectId);
  if (!curriculum?.scopeMaps) return 'unknown';

  const scopeMap = findScopeMap(curriculum, chapterTitle);
  if (!scopeMap) return 'unknown';

  const t = norm(topicText);
  if (scopeMap.inScope.some(s => norm(s).includes(t) || t.includes(norm(s)))) return 'in_scope';
  if (scopeMap.outOfScope.some(s => norm(s).includes(t) || t.includes(norm(s)))) return 'out_of_scope';
  if (scopeMap.advanced.some(s => norm(s).includes(t) || t.includes(norm(s)))) return 'advanced';
  return 'unknown';
}

// ─── Internal helpers ────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim();

function findScopeMap(curriculum: CurriculumSubject, chapterTitle: string): ChapterScopeMap | undefined {
  if (!curriculum.scopeMaps) return undefined;
  const t = norm(chapterTitle);
  return curriculum.scopeMaps.find(m => norm(m.chapterTitle) === t || t.includes(norm(m.chapterTitle)));
}

function resolvePrerequisiteDetails(
  curriculum: CurriculumSubject,
  concept: CurriculumConcept,
): PrerequisiteDetail[] {
  // Prefer rich details extracted from the PDF.
  if (concept.prerequisiteDetails && concept.prerequisiteDetails.length > 0) {
    return concept.prerequisiteDetails;
  }

  // Fallback: build lightweight details from plain prerequisite IDs.
  return concept.prerequisites
    .map(prereqId => {
      const prereqConcept = curriculum.concepts.find(c => c.id === prereqId);
      if (!prereqConcept) return null;
      return {
        label: prereqConcept.label,
        reason: `Understanding ${prereqConcept.label} is needed to learn ${concept.label}.`,
        checkQuestion: `Can you explain what you know about ${prereqConcept.label}?`,
      } as PrerequisiteDetail;
    })
    .filter((d): d is PrerequisiteDetail => d !== null)
    .slice(0, 4);
}

function resolveMisconceptionDetails(concept: CurriculumConcept): MisconceptionDetail[] {
  // Prefer rich details extracted from the PDF.
  if (concept.misconceptionDetails && concept.misconceptionDetails.length > 0) {
    return concept.misconceptionDetails;
  }

  // Fallback: convert plain string misconceptions to minimal detail objects.
  return concept.commonMisconceptions.slice(0, 4).map(belief => ({
    belief,
    probeQuestion: `Some students think that ${belief.toLowerCase()} — what do you think about that?`,
    correctionHint: `Gently explain why this is incorrect and revisit ${concept.label} from a different angle.`,
  }));
}

// ─── System prompt block builder ─────────────────────────────────

interface BuildParams {
  curriculum: CurriculumSubject;
  concept: CurriculumConcept;
  chapterTitle: string;
  scopeMap: ChapterScopeMap | undefined;
  prereqDetails: PrerequisiteDetail[];
  misconceptionDetails: MisconceptionDetail[];
}

function buildSystemPromptBlock(p: BuildParams): string {
  const { curriculum, concept, chapterTitle, scopeMap, prereqDetails, misconceptionDetails } = p;
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════');
  lines.push('CURRICULUM INTELLIGENCE — READ CAREFULLY BEFORE TEACHING');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Subject:  ${curriculum.label}`);
  lines.push(`Grade:    ${curriculum.grade}`);
  lines.push(`Chapter:  ${chapterTitle}`);
  lines.push(`Concept:  ${concept.label}`);
  lines.push(`Source:   ${curriculum.source}`);
  lines.push('');

  // ─── Scope constraints ────────────────────────────────────────
  if (scopeMap) {
    lines.push('───────────────────────────────────────────────────────');
    lines.push('CURRICULUM SCOPE — YOU MUST ENFORCE THESE BOUNDARIES');
    lines.push('───────────────────────────────────────────────────────');
    lines.push('');
    if (scopeMap.gradeNote) {
      lines.push(`Grade expectation: ${scopeMap.gradeNote}`);
      lines.push('');
    }

    if (scopeMap.inScope.length > 0) {
      lines.push('✅ IN SCOPE — teach these thoroughly:');
      scopeMap.inScope.forEach(t => lines.push(`   • ${t}`));
      lines.push('');
    }

    if (scopeMap.advanced.length > 0) {
      lines.push('⚠️  ADVANCED — mention briefly only if the student explicitly asks; do not make it the lesson:');
      scopeMap.advanced.forEach(t => lines.push(`   • ${t}`));
      lines.push('');
    }

    if (scopeMap.outOfScope.length > 0) {
      lines.push('🚫 OUT OF SCOPE — do NOT teach these yet; redirect with:');
      lines.push('   "That\'s something you\'ll explore in a later grade — let\'s master this first."');
      scopeMap.outOfScope.forEach(t => lines.push(`   • ${t}`));
      lines.push('');
    }
  }

  // ─── Key facts ───────────────────────────────────────────────
  if (concept.keyFacts.length > 0) {
    lines.push('───────────────────────────────────────────────────────');
    lines.push('KEY FACTS — the student must understand all of these:');
    lines.push('───────────────────────────────────────────────────────');
    concept.keyFacts.forEach(f => lines.push(`  • ${f}`));
    lines.push('');
  }

  // ─── Prerequisite checks ─────────────────────────────────────
  if (prereqDetails.length > 0) {
    lines.push('───────────────────────────────────────────────────────');
    lines.push('PREREQUISITE CHECKS — verify BEFORE teaching the concept');
    lines.push('───────────────────────────────────────────────────────');
    lines.push('');
    lines.push('If the student cannot answer a check question, STOP and teach that');
    lines.push('prerequisite first before returning to this concept.');
    lines.push('');
    prereqDetails.forEach((d, i) => {
      lines.push(`${i + 1}. Prerequisite: ${d.label}`);
      lines.push(`   Why needed: ${d.reason}`);
      lines.push(`   Check question: "${d.checkQuestion}"`);
      lines.push('');
    });
  }

  // ─── Misconception diagnostic probes ─────────────────────────
  if (misconceptionDetails.length > 0) {
    lines.push('───────────────────────────────────────────────────────');
    lines.push('DIAGNOSTIC MISCONCEPTION PROBES');
    lines.push('───────────────────────────────────────────────────────');
    lines.push('');
    lines.push('IMPORTANT: A correct answer does NOT mean the student understands.');
    lines.push('After any correct answer, use one of these probe questions to test');
    lines.push('whether the student holds a common misconception.');
    lines.push('');
    misconceptionDetails.forEach((m, i) => {
      lines.push(`Probe ${i + 1}:`);
      lines.push(`  Wrong belief: "${m.belief}"`);
      if (m.triggerPattern) {
        lines.push(`  Watch for: ${m.triggerPattern}`);
      }
      lines.push(`  Probe question: "${m.probeQuestion}"`);
      lines.push(`  If misconception confirmed: ${m.correctionHint}`);
      lines.push('');
    });
  }

  // ─── Teaching reminders ───────────────────────────────────────
  lines.push('───────────────────────────────────────────────────────');
  lines.push('TEACHING PRINCIPLES');
  lines.push('───────────────────────────────────────────────────────');
  lines.push('• Never move forward merely because the student gave a correct answer.');
  lines.push('  Distinguish memorisation from genuine understanding.');
  lines.push('• If the student appears stuck, check the prerequisite chain above first.');
  lines.push('• If an explanation fails twice, switch strategy entirely.');
  lines.push('  Use: example → analogy → diagram → story → step-by-step.');
  lines.push('• The student must be able to EXPLAIN the concept in their own words.');
  lines.push('• Never shame, compare or pressure. The goal is understanding, not speed.');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}
