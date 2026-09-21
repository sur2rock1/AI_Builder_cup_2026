// ─────────────────────────────────────────────────────────────────
// Pythagoras' Theorem — Singapore Sec 2 curriculum structure
// Source: Think! Mathematics 2B, Chapter 9
// This mirrors what will be extracted from the PDF when uploaded.
// ─────────────────────────────────────────────────────────────────
import { CurriculumSubject, CurriculumConcept } from '../adaptive/learnerModel';

export const PYTHAGORAS_CONCEPTS: CurriculumConcept[] = [
  {
    id: 'right-angle-triangle',
    label: 'Right-Angled Triangle & Its Parts',
    subjectId: 'pythagoras',
    prerequisites: [],
    commonMisconceptions: [
      'Confusing the hypotenuse with any long side (hypotenuse is ALWAYS opposite the right angle)',
      'Thinking any triangle can have a hypotenuse',
      'Labelling adjacent and opposite sides without reference to a specific angle',
    ],
    keyFacts: [
      'A right-angled triangle has exactly one 90° angle',
      'The hypotenuse is the side opposite the right angle — always the longest side',
      'The other two sides are called legs (or catheti)',
      'The right angle is usually marked with a small square',
    ],
    workedExamples: [
      'Draw a triangle with vertices A(0,0), B(3,0), C(0,4). The right angle is at A. The hypotenuse is BC.',
    ],
    difficultyLevel: 1,
    typicalTeachingOrder: 1,
  },
  {
    id: 'pythagoras-theorem-statement',
    label: "Pythagoras' Theorem: a² + b² = c²",
    subjectId: 'pythagoras',
    prerequisites: ['right-angle-triangle'],
    commonMisconceptions: [
      'Applying the theorem to non-right-angled triangles',
      'Forgetting that c must be the hypotenuse (not just any side)',
      'Confusing addition: writing a + b = c instead of a² + b² = c²',
      'Squaring after adding: (a + b)² instead of a² + b²',
      'Thinking the theorem works with perimeters',
    ],
    keyFacts: [
      'In any right-angled triangle: (leg₁)² + (leg₂)² = (hypotenuse)²',
      'Conventionally written as a² + b² = c², where c is always the hypotenuse',
      'The theorem is ONLY valid for right-angled triangles',
      'Pythagoras of Samos, ~570–495 BCE',
    ],
    workedExamples: [
      'Triangle with legs 3 cm and 4 cm: 3² + 4² = 9 + 16 = 25, so hypotenuse = √25 = 5 cm',
      'Triangle with legs 5 cm and 12 cm: 5² + 12² = 25 + 144 = 169, hypotenuse = √169 = 13 cm',
    ],
    difficultyLevel: 2,
    typicalTeachingOrder: 2,
  },
  {
    id: 'finding-hypotenuse',
    label: 'Finding the Hypotenuse Given Both Legs',
    subjectId: 'pythagoras',
    prerequisites: ['pythagoras-theorem-statement'],
    commonMisconceptions: [
      'Adding a + b instead of a² + b²',
      'Forgetting to take the square root at the end',
      'Rounding too early (should only round the final answer)',
      'Writing c = a + b (not squaring the sides)',
    ],
    keyFacts: [
      'c = √(a² + b²)',
      'Always identify which side is the hypotenuse BEFORE calculating',
      'Leave answer in surd form (√x) unless told to give decimal',
    ],
    workedExamples: [
      'Legs = 6 and 8: c² = 6² + 8² = 36 + 64 = 100, c = 10',
      'Legs = 7 and 24: c² = 49 + 576 = 625, c = 25',
    ],
    difficultyLevel: 2,
    typicalTeachingOrder: 3,
  },
  {
    id: 'finding-unknown-leg',
    label: 'Finding an Unknown Leg Given Hypotenuse and One Leg',
    subjectId: 'pythagoras',
    prerequisites: ['finding-hypotenuse'],
    commonMisconceptions: [
      'Adding instead of subtracting: a² = c² + b² (wrong — should subtract)',
      'Subtracting before squaring: a = c - b (wrong — must square first)',
      'Confusing which side is the hypotenuse when solving for a leg',
      'Not checking that c > a and c > b in the answer',
    ],
    keyFacts: [
      'Rearrange: a² = c² - b²',
      'Always check: the hypotenuse is the LARGEST side',
      'Answer should be less than the hypotenuse',
    ],
    workedExamples: [
      'Hypotenuse = 13, one leg = 5: a² = 13² - 5² = 169 - 25 = 144, a = 12',
      'Hypotenuse = 10, one leg = 6: a² = 100 - 36 = 64, a = 8',
    ],
    difficultyLevel: 3,
    typicalTeachingOrder: 4,
  },
  {
    id: 'pythagorean-triples',
    label: 'Pythagorean Triples',
    subjectId: 'pythagoras',
    prerequisites: ['pythagoras-theorem-statement'],
    commonMisconceptions: [
      'Thinking multiples of a triple are NOT triples (e.g., 6-8-10 is just 2×(3-4-5))',
      'Memorising specific triples but not recognising scaled versions',
      'Confusing (3,4,5) with (4,3,5) — order does not matter for the triple',
    ],
    keyFacts: [
      'A Pythagorean triple is (a, b, c) where a² + b² = c² and all are positive integers',
      'Common triples: (3,4,5), (5,12,13), (8,15,17), (7,24,25)',
      'Any multiple of a triple is also a triple: (6,8,10), (9,12,15), etc.',
    ],
    workedExamples: [
      'Is (9,40,41) a triple? 9²+40² = 81+1600 = 1681 = 41². Yes!',
      'Scale (3,4,5) by 7: (21,28,35) is also a Pythagorean triple',
    ],
    difficultyLevel: 2,
    typicalTeachingOrder: 5,
  },
  {
    id: 'converse-pythagoras',
    label: "Converse of Pythagoras' Theorem",
    subjectId: 'pythagoras',
    prerequisites: ['pythagoras-theorem-statement', 'pythagorean-triples'],
    commonMisconceptions: [
      'Testing a² + b² = c² but using the wrong c (must use the LONGEST side as c)',
      'Thinking the converse proves any triangle is right-angled without checking all three sides',
      'Confusing converse (if a²+b²=c² then right-angled) with the original theorem',
    ],
    keyFacts: [
      'If a² + b² = c² for three side lengths, the triangle IS right-angled',
      'The right angle is OPPOSITE the longest side (c)',
      'Used to VERIFY whether a triangle has a right angle from its side lengths',
    ],
    workedExamples: [
      'Sides 5, 12, 13: 5²+12² = 25+144 = 169 = 13². Right-angled! ✓',
      'Sides 4, 5, 6: 4²+5² = 16+25 = 41 ≠ 36 = 6². NOT right-angled.',
    ],
    difficultyLevel: 3,
    typicalTeachingOrder: 6,
  },
  {
    id: 'pythagoras-applications',
    label: "Real-World Applications of Pythagoras' Theorem",
    subjectId: 'pythagoras',
    prerequisites: ['finding-hypotenuse', 'finding-unknown-leg'],
    commonMisconceptions: [
      'Forgetting to draw and label a diagram before setting up the equation',
      'Misidentifying which measurement corresponds to which side',
      'Using Pythagoras when the triangle is not right-angled (e.g., in a non-perpendicular context)',
      'Giving an answer without units',
    ],
    keyFacts: [
      'Always draw a diagram and mark the right angle',
      'Distance between two points: d = √((x₂-x₁)² + (y₂-y₁)²)',
      'Common contexts: ladders against walls, diagonal of a rectangle, distances on a coordinate grid',
    ],
    workedExamples: [
      'A 10m ladder leans against a wall. The foot is 6m from the wall. How high does it reach? h² = 10²-6² = 64, h = 8m',
      'Points A(1,2) and B(4,6): distance = √((4-1)²+(6-2)²) = √(9+16) = √25 = 5',
    ],
    difficultyLevel: 4,
    typicalTeachingOrder: 7,
  },
];

export const PYTHAGORAS_CURRICULUM: CurriculumSubject = {
  id: 'pythagoras',
  label: "Pythagoras' Theorem",
  grade: 'Secondary 2 (Grade 8)',
  source: 'Think! Mathematics 2B, Chapter 9 — Singapore MOE Curriculum',
  concepts: PYTHAGORAS_CONCEPTS,
  prerequisiteMap: {
    'right-angle-triangle':          [],
    'pythagoras-theorem-statement':  ['right-angle-triangle'],
    'finding-hypotenuse':            ['pythagoras-theorem-statement'],
    'finding-unknown-leg':           ['finding-hypotenuse'],
    'pythagorean-triples':           ['pythagoras-theorem-statement'],
    'converse-pythagoras':           ['pythagoras-theorem-statement', 'pythagorean-triples'],
    'pythagoras-applications':       ['finding-hypotenuse', 'finding-unknown-leg'],
  },
};

export function getConcept(id: string): CurriculumConcept | undefined {
  return PYTHAGORAS_CONCEPTS.find(c => c.id === id);
}

export function getNextUnmasteredConcept(
  masteredIds: string[]
): CurriculumConcept | undefined {
  return PYTHAGORAS_CONCEPTS.find(c => {
    if (masteredIds.includes(c.id)) return false;
    return c.prerequisites.every(p => masteredIds.includes(p));
  });
}
