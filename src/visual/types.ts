// ─────────────────────────────────────────────────────────────────
// Board visuals — the drawing vocabulary the AI composes per concept.
//
// Why this exists (docs/BOARD_VISUALS.md, DECISIONS.md D-2026-09-28-3):
// the board used to have exactly two drawing tools — "boxes joined by
// arrows" and "a ring of glowing spheres" — so however well the model
// understood a concept, its picture was squeezed into one of those two
// shapes. A graphing concept came out as boxes of prose.
//
// Instead of choosing between whole pictures, the model now composes a
// picture from small bricks (point, line, curve, shape, text, box, arrow,
// table, and a few 3D solids) and ONE renderer draws any combination.
// Every picture is also a teaching SEQUENCE: a few steps, one idea each,
// which the voice tutor reveals as it speaks (reveal_part).
//
// This module is isomorphic (no Node or DOM imports) so the server, the
// pregen script, the browser and the tests all share one definition.
// ─────────────────────────────────────────────────────────────────

/** Colour carries meaning and is the same in every view. Named, not hex,
 * so the model cannot produce unreadable colours on the dark board. */
export const VISUAL_COLORS = ['ink', 'muted', 'emerald', 'amber', 'sky', 'violet', 'rose', 'teal'] as const;
export type VisualColor = typeof VISUAL_COLORS[number];

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export type TextSize = 'sm' | 'md' | 'lg' | 'xl';
export type ArrowEnds = 'none' | 'start' | 'end' | 'both';
export type Weight = 'thin' | 'normal' | 'bold';

// ─── Frames: which space the coordinates live in ────────────────

/** Mathematical coordinates, y pointing UP, drawn with real axes. */
export interface PlaneFrame {
  kind: 'plane';
  x: [number, number];
  y: [number, number];
  /** Which axes to draw. 'x' alone makes a number line or a timeline. */
  axes: 'both' | 'x' | 'y' | 'none';
  grid: boolean;
  /** One unit on x is the same length as one unit on y (true for geometry). */
  equalScale: boolean;
  xLabel?: string;
  yLabel?: string;
  /** Tick spacing; computed automatically when absent. */
  xStep?: number;
  yStep?: number;
}

/** Abstract layout space: x 0..100 left→right, y 0..60 top→bottom.
 * For processes, cycles, cause-and-effect, labelled parts, algebra steps. */
export interface CanvasFrame {
  kind: 'canvas';
}

/** 3D space: x to the right, y UP, z toward the viewer. */
export interface SpaceFrame {
  kind: 'space';
  x: [number, number];
  y: [number, number];
  z: [number, number];
  axes: boolean;
}

export type Frame2D = PlaneFrame | CanvasFrame;

// ─── 2D bricks ───────────────────────────────────────────────────

interface Base {
  /** Unique within the visual; steps refer to it. */
  id: string;
  /** How the tutor would say it ("the vertical line", "point B"). */
  name?: string;
  /** Text drawn next to the element. */
  label?: string;
  color?: VisualColor;
}

export interface PointEl extends Base { kind: 'point'; at: Vec2; style?: 'solid' | 'open'; size?: 'sm' | 'md' | 'lg' }
export interface SegmentEl extends Base { kind: 'segment'; from: Vec2; to: Vec2; arrow?: ArrowEnds; dashed?: boolean; weight?: Weight }
/** Infinite line through two points, clipped to the frame (plane frame only). */
export interface LineEl extends Base { kind: 'line'; through: [Vec2, Vec2]; dashed?: boolean; weight?: Weight }
/** Starts at `from` and runs through `through` to the frame edge (plane frame only). */
export interface RayEl extends Base { kind: 'ray'; from: Vec2; through: Vec2; dashed?: boolean; weight?: Weight }
export interface PolygonEl extends Base { kind: 'polygon'; points: Vec2[]; fill?: boolean; dashed?: boolean }
export interface PolylineEl extends Base { kind: 'polyline'; points: Vec2[]; arrow?: ArrowEnds; dashed?: boolean; weight?: Weight }
/** Circle, or ellipse when ry is given. */
export interface CircleEl extends Base { kind: 'circle'; center: Vec2; r: number; ry?: number; fill?: boolean; dashed?: boolean }
/** Angle marker at `vertex` between rays toward `from` and `to`; `right` draws the square. */
export interface AngleEl extends Base { kind: 'angle'; vertex: Vec2; from: Vec2; to: Vec2; right?: boolean }
/** y = f(x), plotted from a real equation (plane frame only). */
export interface FunctionEl extends Base { kind: 'function'; expr: string; domain?: [number, number]; dashed?: boolean; weight?: Weight }
export interface TextEl extends Base { kind: 'text'; at: Vec2; text: string; size?: TextSize; align?: 'start' | 'middle' | 'end'; math?: boolean }
/** Rounded box with text, centred on `at` (canvas frame only). Size in canvas units, auto when absent. */
export interface BoxEl extends Base { kind: 'box'; at: Vec2; text: string; sub?: string; w?: number; h?: number }
/** Arrow between two other elements, attached to their edges. */
export interface ConnectorEl extends Base { kind: 'connector'; from: string; to: string; arrow?: ArrowEnds; dashed?: boolean; bend?: number }
/** A small table (first row is the header) drawn in a side panel. */
export interface TableEl extends Base { kind: 'table'; rows: string[][]; placement?: 'left' | 'right' }

export type VisualElement2D =
  | PointEl | SegmentEl | LineEl | RayEl | PolygonEl | PolylineEl | CircleEl
  | AngleEl | FunctionEl | TextEl | BoxEl | ConnectorEl | TableEl;

export const ELEMENT_KINDS_2D = [
  'point', 'segment', 'line', 'ray', 'polygon', 'polyline', 'circle',
  'angle', 'function', 'text', 'box', 'connector', 'table',
] as const;

// ─── 3D bricks ───────────────────────────────────────────────────

export interface Point3El extends Base { kind: 'point'; at: Vec3 }
export interface Segment3El extends Base { kind: 'segment'; from: Vec3; to: Vec3; arrow?: ArrowEnds; dashed?: boolean }
/** A flat face through 3+ points (a plane region, a face of a solid, a cross-section). */
export interface Polygon3El extends Base { kind: 'polygon'; points: Vec3[]; fill?: boolean }
export interface SphereEl extends Base { kind: 'sphere'; center: Vec3; r: number; wireframe?: boolean }
export interface CuboidEl extends Base { kind: 'cuboid'; center: Vec3; size: Vec3; wireframe?: boolean }
/** Cylinder between two points; rTop differs from r for cones and frustums. */
export interface CylinderEl extends Base { kind: 'cylinder'; from: Vec3; to: Vec3; r: number; rTop?: number; wireframe?: boolean }
export interface Label3El extends Base { kind: 'label'; at: Vec3; text: string }

export type VisualElement3D = Point3El | Segment3El | Polygon3El | SphereEl | CuboidEl | CylinderEl | Label3El;

export const ELEMENT_KINDS_3D = ['point', 'segment', 'polygon', 'sphere', 'cuboid', 'cylinder', 'label'] as const;

// ─── Steps: the picture as a teaching sequence ───────────────────

/** Where in the tutor's session arc (docs/TUTOR_PERSONA.md §4) a step belongs. */
export const STEP_PHASES = ['hook', 'teach', 'contrast', 'check', 'apply'] as const;
export type StepPhase = typeof STEP_PHASES[number];

export interface VisualStep {
  id: string;
  /** Short handle the tutor uses in reveal_part, e.g. "points on x = 2". */
  name: string;
  /** One sentence the learner reads while this step is on the board. */
  caption: string;
  /** Elements that appear at this step (they stay for later steps). */
  show: string[];
  /** Elements to spotlight during this step; defaults to `show`. */
  focus?: string[];
  phase?: StepPhase;
}

export type VisualPurpose = 'teach' | 'contrast' | 'apply';

interface VisualBase {
  version: 1;
  title: string;
  purpose: VisualPurpose;
  /** The representation it realises (TeachingStrategy, docs/TUTOR_PERSONA.md §7). */
  representation: string;
  /** One sentence: why this picture helps this idea. Shown to the tutor, not the child. */
  why: string;
  /** The teaching focus it was drawn for (update_diagram focus / contrast / apply). */
  focus?: string;
  /** For contrast pictures: the curriculum misconception id it confronts. */
  misconceptionId?: string;
  /** A question the tutor can ask, pointing at the finished picture. */
  checkQuestion?: string;
  steps: VisualStep[];
}

export interface BoardVisual extends VisualBase {
  dim: '2d';
  frame: Frame2D;
  elements: VisualElement2D[];
}

export interface BoardVisual3D extends VisualBase {
  dim: '3d';
  frame: SpaceFrame;
  elements: VisualElement3D[];
}

export type AnyBoardVisual = BoardVisual | BoardVisual3D;

/** Keys used in PregenRecord.visuals. */
export const VISUAL_KEYS = {
  main: 'main',
  space: '3d',
  apply: 'apply',
  contrast: (misconceptionId: string) => `contrast:${misconceptionId}`,
  focus: (focusSlug: string) => `focus:${focusSlug}`,
  alt: (strategy: string) => `alt:${strategy}`,
} as const;

/** Hard limits the sanitizer enforces (and the prompt states). */
export const VISUAL_LIMITS = {
  maxElements: 32,
  maxSteps: 7,
  minSteps: 1,
  maxTextChars: 90,
  maxCaptionChars: 160,
  maxTableRows: 8,
  maxTableCols: 5,
  maxPolygonPoints: 24,
  canvasWidth: 100,
  canvasHeight: 60,
} as const;
