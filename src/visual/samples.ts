// ─────────────────────────────────────────────────────────────────
// Reference pictures: what well-composed board visuals look like across
// very different kinds of idea. Used by scripts/preview-visuals.tsx and
// docs/BOARD_VISUALS.md.
//
// Deliberately NOT given to the model as examples: few-shot pictures
// become templates, which is exactly what this system replaces. The
// model gets the vocabulary and the teaching rules, never these shapes.
// ─────────────────────────────────────────────────────────────────

export const SAMPLE_VISUALS: Record<string, unknown> = {
  // Chapter 1 — Equations of horizontal and vertical lines: the main teaching picture.
  main: {
    dim: '2d', title: 'Lines where one coordinate never changes', purpose: 'teach', representation: 'visual_diagram',
    why: 'Seeing several points share x = 2 shows WHY the whole line is named x = 2, before any rule is stated.',
    frame: { kind: 'plane', x: [-3, 6], y: [-4, 5], axes: 'both', grid: true, equalScale: true, xLabel: 'x', yLabel: 'y' },
    elements: [
      { id: 'A', kind: 'point', at: [2, -2], label: 'A(2, -2)', color: 'rose', name: 'point A' },
      { id: 'B', kind: 'point', at: [2, 1], label: 'B(2, 1)', color: 'rose', name: 'point B' },
      { id: 'C', kind: 'point', at: [2, 4], label: 'C(2, 4)', color: 'rose', name: 'point C' },
      { id: 'tbl', kind: 'table', rows: [['point', 'x', 'y'], ['A', '2', '-2'], ['B', '2', '1'], ['C', '2', '4']], placement: 'right', color: 'rose' },
      { id: 'vline', kind: 'line', through: [[2, -2], [2, 4]], label: 'x = 2', color: 'rose', name: 'the vertical line' },
      { id: 'D', kind: 'point', at: [-1, 1], label: 'D(-1, 1)', color: 'sky' },
      { id: 'E', kind: 'point', at: [4, 1], label: 'E(4, 1)', color: 'sky' },
      { id: 'hline', kind: 'line', through: [[-1, 1], [4, 1]], label: 'y = 1', color: 'sky', name: 'the horizontal line' },
    ],
    steps: [
      { id: 's1', name: 'three points', caption: 'A, B and C — look at their x-values in the table.', show: ['A', 'B', 'C', 'tbl'], phase: 'hook' },
      { id: 's2', name: 'the vertical line', caption: 'Every point on this line has x = 2, so the line is called x = 2.', show: ['vline'], focus: ['vline', 'tbl'], phase: 'teach' },
      { id: 's3', name: 'the horizontal line', caption: 'Along this line x changes but y stays 1: it is y = 1.', show: ['D', 'E', 'hline'], phase: 'teach' },
      { id: 's4', name: 'where they meet', caption: 'The two lines cross at (2, 1) — point B is on both.', show: [], focus: ['B', 'vline', 'hline'], phase: 'check' },
    ],
    checkQuestion: 'A line passes through (5, 0) and (5, 7). What is its equation, and why?',
  },

  // The same concept: a contrast case for the belief "a horizontal line is x = c".
  'contrast:horizontal-line-named-x': {
    dim: '2d', title: 'Testing the rule "a flat line is x = 3"', purpose: 'contrast', representation: 'visual_diagram',
    misconceptionId: 'horizontal-line-named-x',
    why: 'Drawing the line the rule predicts, right next to the real one, lets the learner see the rule break.',
    frame: { kind: 'plane', x: [-3, 6], y: [-2, 6], axes: 'both', grid: true, equalScale: true },
    elements: [
      { id: 'p1', kind: 'point', at: [-2, 3], label: '(-2, 3)', color: 'sky' },
      { id: 'p2', kind: 'point', at: [1, 3], label: '(1, 3)', color: 'sky' },
      { id: 'p3', kind: 'point', at: [4, 3], label: '(4, 3)', color: 'sky' },
      { id: 'flat', kind: 'line', through: [[-2, 3], [4, 3]], color: 'sky', name: 'the flat line' },
      { id: 'test', kind: 'line', through: [[3, -1], [3, 5]], label: 'x = 3', color: 'amber', dashed: true, name: 'the line x = 3' },
      { id: 'q', kind: 'point', at: [3, 3], style: 'open', color: 'amber' },
      { id: 'eq', kind: 'text', at: [-1.5, 3.7], text: 'y = 3', size: 'lg', math: true, color: 'sky' },
    ],
    steps: [
      { id: 's1', name: 'the flat line', caption: 'A flat line through three points. What name should it have?', show: ['p1', 'p2', 'p3', 'flat'], phase: 'teach' },
      { id: 's2', name: 'test x = 3', caption: "Let's test the rule: here is the line x = 3. It stands up instead of lying flat.", show: ['test', 'q'], phase: 'contrast' },
      { id: 's3', name: 'the rule that works', caption: 'Every point on the flat line has y = 3 — so its name is y = 3.', show: ['eq'], focus: ['eq', 'p1', 'p2', 'p3'], phase: 'teach' },
      { id: 's4', name: 'explain the difference', caption: 'Which coordinate stays the same along each line?', show: [], focus: ['flat', 'test'], phase: 'check' },
    ],
    checkQuestion: 'Why does x = 3 stand up instead of lying flat?',
  },

  // Application (ladder L4): the situation only — never the answer.
  apply: {
    dim: '2d', title: 'Rectangle ABCD', purpose: 'apply', representation: 'visual_diagram',
    why: 'The corners are given; naming each edge is the learner\'s job.',
    frame: { kind: 'plane', x: [-1, 9], y: [-1, 8], axes: 'both', grid: true, equalScale: true },
    elements: [
      { id: 'A', kind: 'point', at: [1, 2], label: 'A(1, 2)', color: 'violet' },
      { id: 'B', kind: 'point', at: [7, 2], label: 'B(7, 2)', color: 'violet' },
      { id: 'C', kind: 'point', at: [7, 6], label: 'C(7, 6)', color: 'violet' },
      { id: 'D', kind: 'point', at: [1, 6], label: 'D(1, 6)', color: 'violet' },
      { id: 'rect', kind: 'polygon', points: [[1, 2], [7, 2], [7, 6], [1, 6]], fill: true, color: 'violet' },
    ],
    steps: [
      { id: 's1', name: 'the corners', caption: 'Here are the four corners of a rectangle.', show: ['A', 'B', 'C', 'D'], phase: 'teach' },
      { id: 's2', name: 'the edges', caption: 'Each edge is part of a horizontal or vertical line.', show: ['rect'], phase: 'teach' },
      { id: 's3', name: 'your turn', caption: 'Write the equation of each of the four edges.', show: [], focus: ['rect'], phase: 'apply' },
    ],
  },

  // Inequalities: a number line is just a plane frame with only the x-axis.
  'inequality-number-line': {
    dim: '2d', title: 'x > 3 on a number line', purpose: 'teach', representation: 'visual_diagram',
    why: 'An open circle and an arrow show "every number bigger than 3, but not 3 itself" at a glance.',
    frame: { kind: 'plane', x: [-2, 9], y: [-1, 1], axes: 'x', grid: false },
    elements: [
      { id: 'b', kind: 'point', at: [3, 0], style: 'open', size: 'lg', color: 'amber', name: 'the open circle' },
      { id: 'note', kind: 'text', at: [3, 0.55], text: '3 is not included', size: 'sm', color: 'amber' },
      { id: 'r', kind: 'ray', from: [3, 0], through: [5, 0], color: 'amber', weight: 'bold', label: 'x > 3', name: 'the arrow' },
      { id: 'try', kind: 'point', at: [5.5, 0], color: 'emerald', label: '5.5 works' },
    ],
    steps: [
      { id: 's1', name: 'the boundary', caption: 'Start at 3. The circle is empty because 3 itself is not bigger than 3.', show: ['b', 'note'], phase: 'teach' },
      { id: 's2', name: 'the arrow', caption: 'Every number to the right of 3 makes x > 3 true.', show: ['r'], phase: 'teach' },
      { id: 's3', name: 'test a number', caption: '5.5 is on the arrow — check: is 5.5 > 3?', show: ['try'], phase: 'check' },
    ],
  },

  // Algebra working, laid out line by line on a canvas.
  'algebra-steps': {
    dim: '2d', title: 'Solving 3x + 6 = 12', purpose: 'teach', representation: 'step_by_step',
    why: 'Doing the same thing to both sides, one line at a time, keeps the equation balanced and visible.',
    frame: { kind: 'canvas' },
    elements: [
      { id: 'e1', kind: 'text', at: [40, 10], text: '3x + 6 = 12', size: 'xl', math: true },
      { id: 'e2', kind: 'text', at: [40, 28], text: '3x = 6', size: 'xl', math: true },
      { id: 'e3', kind: 'text', at: [40, 46], text: 'x = 2', size: 'xl', math: true, color: 'emerald' },
      { id: 'c1', kind: 'connector', from: 'e1', to: 'e2', label: '− 6 from both sides', color: 'amber' },
      { id: 'c2', kind: 'connector', from: 'e2', to: 'e3', label: '÷ 3 on both sides', color: 'amber' },
      { id: 'chk', kind: 'text', at: [80, 46], text: 'check: 3(2) + 6 = 12', size: 'sm', color: 'emerald' },
    ],
    steps: [
      { id: 's1', name: 'the equation', caption: 'We want x on its own.', show: ['e1'], phase: 'teach' },
      { id: 's2', name: 'take away 6', caption: 'Take 6 from both sides — the balance stays level.', show: ['e2', 'c1'], phase: 'teach' },
      { id: 's3', name: 'divide by 3', caption: 'Divide both sides by 3.', show: ['e3', 'c2'], phase: 'teach' },
      { id: 's4', name: 'check it', caption: 'Put x = 2 back in: does it give 12?', show: ['chk'], phase: 'check' },
    ],
  },

  // Science: a process loop on a canvas.
  'water-cycle': {
    dim: '2d', title: 'The water cycle', purpose: 'teach', representation: 'visual_diagram',
    why: 'Drawing it as a loop shows the same water is used again and again.',
    frame: { kind: 'canvas' },
    elements: [
      { id: 'sun', kind: 'circle', center: [10, 9], r: 5, fill: true, color: 'amber', label: 'Sun' },
      { id: 'sea', kind: 'box', at: [22, 47], text: 'Sea', sub: 'liquid water', color: 'sky' },
      { id: 'cloud', kind: 'box', at: [52, 14], text: 'Clouds', sub: 'tiny droplets', color: 'muted' },
      { id: 'land', kind: 'box', at: [82, 47], text: 'Rain on land', sub: 'flows downhill', color: 'teal' },
      { id: 'c1', kind: 'connector', from: 'sea', to: 'cloud', label: 'evaporation', bend: 0.25, color: 'amber' },
      { id: 'c2', kind: 'connector', from: 'cloud', to: 'land', label: 'condensation, then rain', bend: 0.25, color: 'sky' },
      { id: 'c3', kind: 'connector', from: 'land', to: 'sea', label: 'rivers carry it back', bend: 0.2, color: 'teal' },
    ],
    steps: [
      { id: 's1', name: 'the sea', caption: 'Most of Earth\'s water starts in the sea.', show: ['sea'], phase: 'hook' },
      { id: 's2', name: 'evaporation', caption: 'The Sun warms it and water rises as vapour.', show: ['sun', 'cloud', 'c1'], phase: 'teach' },
      { id: 's3', name: 'rain', caption: 'Vapour cools into droplets, clouds form and it rains.', show: ['land', 'c2'], phase: 'teach' },
      { id: 's4', name: 'back to the sea', caption: 'Rivers carry it back — the loop starts again.', show: ['c3'], phase: 'teach' },
    ],
    checkQuestion: 'Where does the energy come from to lift the water up?',
  },

  // Two equations, one picture: the solution is where the lines cross.
  'simultaneous-graphical': {
    dim: '2d', title: 'Solving two equations by drawing', purpose: 'teach', representation: 'visual_diagram',
    why: 'The only point on both lines is the only (x, y) that makes both equations true.',
    frame: { kind: 'plane', x: [-2, 6], y: [-3, 7], axes: 'both', grid: true, equalScale: true, xLabel: 'x', yLabel: 'y' },
    elements: [
      { id: 'l1', kind: 'function', expr: '2x - 1', label: 'y = 2x - 1', color: 'sky', name: 'the first line' },
      { id: 'l2', kind: 'function', expr: '-x + 5', label: 'y = -x + 5', color: 'rose', name: 'the second line' },
      { id: 'i', kind: 'point', at: [2, 3], size: 'lg', label: '(2, 3)', color: 'emerald', name: 'the crossing point' },
    ],
    steps: [
      { id: 's1', name: 'the first line', caption: 'Every point on this line makes y = 2x − 1 true.', show: ['l1'], phase: 'teach' },
      { id: 's2', name: 'the second line', caption: 'Every point on this one makes y = −x + 5 true.', show: ['l2'], phase: 'teach' },
      { id: 's3', name: 'the crossing point', caption: 'Only (2, 3) is on both lines.', show: ['i'], phase: 'teach' },
      { id: 's4', name: 'check both', caption: 'Check: x = 2, y = 3 in each equation. Do both work?', show: [], focus: ['i'], phase: 'check' },
    ],
  },
};
