import React from 'react';

// ─────────────────────────────────────────────────────────────────
// Real-world scenes for Pythagoras.
//
// Pedagogy: concreteness fading — start from a situation the child
// recognises (a ladder against a wall), trace the triangle hiding in it,
// then fade to the bare shape. The same three vertices drive both views,
// so the jump from picture to diagram is visibly the same triangle.
//
// Every scene has an illustrated fallback so the lesson never shows a
// broken image. When `npm run gen:assets` has produced a photo in
// public/scenes/, the photo is used instead; its vertices are calibrated
// separately (photoVertices) because a generated photo will not match the
// illustration's composition exactly. Until calibrated, the photo is shown
// with the diagram as an inset rather than a mis-aligned overlay.
// ─────────────────────────────────────────────────────────────────

/** Vertices in a 1600x900 frame. C is the right angle; a = C→B, b = C→A, c = A→B. */
export interface SceneVertices {
  A: [number, number];
  B: [number, number];
  C: [number, number];
}

export interface SceneDef {
  id: string;
  title: string;
  /** What each side IS in the picture — the child reads these, not a/b/c. */
  names: { a: string; b: string; c: string };
  photo: string;
  photoVertices?: SceneVertices;
  vertices: SceneVertices;
  Illustration: React.FC;
}

const Sky: React.FC<{ id: string; top: string; bottom: string }> = ({ id, top, bottom }) => (
  <>
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={top} /><stop offset="1" stopColor={bottom} />
      </linearGradient>
    </defs>
    <rect width="1600" height="900" fill={`url(#${id})`} />
  </>
);

const LadderScene: React.FC = () => (
  <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
    <Sky id="sky-ladder" top="#7EC8F2" bottom="#D8EEF8" />
    <circle cx="1350" cy="170" r="70" fill="#FFE59A" opacity=".9" />
    <g fill="#fff" opacity=".85">
      <ellipse cx="300" cy="150" rx="110" ry="34" /><ellipse cx="380" cy="130" rx="80" ry="36" />
      <ellipse cx="1050" cy="110" rx="90" ry="26" /><ellipse cx="1110" cy="96" rx="60" ry="28" />
    </g>
    {/* distant trees */}
    <g fill="#8CC08A">
      <ellipse cx="1420" cy="690" rx="150" ry="110" /><ellipse cx="1290" cy="710" rx="110" ry="80" />
    </g>
    {/* house */}
    <rect x="160" y="250" width="400" height="510" fill="#E9D3B6" />
    <rect x="160" y="250" width="400" height="510" fill="url(#bricks)" opacity=".35" />
    <defs>
      <pattern id="bricks" width="60" height="30" patternUnits="userSpaceOnUse">
        <path d="M0 0H60M0 15H60M30 0V15M0 15V30M60 15V30" stroke="#B58E68" strokeWidth="2" />
      </pattern>
    </defs>
    <polygon points="130,255 360,110 590,255" fill="#C0634A" />
    <rect x="230" y="330" width="100" height="110" fill="#9FD3EE" stroke="#fff" strokeWidth="10" />
    <rect x="400" y="330" width="100" height="110" fill="#9FD3EE" stroke="#fff" strokeWidth="10" />
    <rect x="300" y="560" width="110" height="200" rx="6" fill="#7A5236" />
    {/* ground */}
    <rect x="0" y="760" width="1600" height="140" fill="#7DBB6E" />
    <rect x="0" y="760" width="1600" height="10" fill="#6AA95C" />
    {/* ladder — rails from foot (1240,760) to top of wall (560,250) */}
    <g strokeLinecap="round">
      <line x1="572" y1="250" x2="1252" y2="760" stroke="#B9772E" strokeWidth="18" />
      <line x1="548" y1="282" x2="1228" y2="792" stroke="#9E6224" strokeWidth="18" opacity=".0" />
      {Array.from({ length: 11 }).map((_, i) => {
        const t = (i + 1) / 12;
        const x = 572 + (1252 - 572) * t, y = 250 + (760 - 250) * t;
        return <line key={i} x1={x - 14} y1={y + 19} x2={x + 14} y2={y - 19} stroke="#8A5520" strokeWidth="9" />;
      })}
    </g>
    {/* a person for scale */}
    <g transform="translate(1330,640)">
      <circle cx="0" cy="0" r="22" fill="#F2C29B" />
      <rect x="-22" y="24" width="44" height="72" rx="14" fill="#5B6CFF" />
      <rect x="-18" y="92" width="14" height="30" fill="#2E3A59" /><rect x="4" y="92" width="14" height="30" fill="#2E3A59" />
    </g>
  </svg>
);

const RampScene: React.FC = () => (
  <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
    <Sky id="sky-ramp" top="#F7C59F" bottom="#FCE9D8" />
    <g fill="#E8B08A" opacity=".55">
      <rect x="80" y="420" width="140" height="340" /><rect x="240" y="360" width="120" height="400" />
      <rect x="1420" y="400" width="130" height="360" />
    </g>
    {/* building entrance on a raised platform */}
    <rect x="1000" y="300" width="460" height="260" fill="#F4EDE4" />
    <rect x="1150" y="380" width="150" height="180" rx="8" fill="#5E7FA3" />
    <rect x="1000" y="560" width="460" height="200" fill="#CFC3B4" />
    <rect x="1000" y="560" width="460" height="14" fill="#B7A999" />
    {/* ramp: foot (420,760) up to platform edge (1000,560) */}
    <polygon points="420,760 1000,560 1000,760" fill="#9DA7B3" />
    <line x1="420" y1="760" x2="1000" y2="560" stroke="#6E7887" strokeWidth="8" />
    {/* handrail */}
    <line x1="440" y1="690" x2="1000" y2="497" stroke="#46505E" strokeWidth="8" strokeLinecap="round" />
    {[520, 640, 760, 880].map((x) => {
      const y = 760 - (x - 420) * (200 / 580);
      return <line key={x} x1={x} y1={y} x2={x} y2={y - 64} stroke="#46505E" strokeWidth="6" />;
    })}
    <rect x="0" y="760" width="1600" height="140" fill="#C9BBA8" />
    {/* wheelchair symbol */}
    <g transform="translate(660,600)" fill="#2563EB">
      <circle cx="0" cy="0" r="40" /><circle cx="0" cy="0" r="30" fill="#fff" />
      <circle cx="0" cy="0" r="18" fill="#2563EB" />
    </g>
  </svg>
);

const ScreenScene: React.FC = () => (
  <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
    <Sky id="sky-room" top="#3A3F5C" bottom="#565C80" />
    <rect x="0" y="690" width="1600" height="210" fill="#2A2D40" />
    <rect x="280" y="760" width="1040" height="36" rx="10" fill="#7B5B42" />
    {/* TV — screen from (420,190) to (1180,620) */}
    <rect x="400" y="170" width="800" height="470" rx="18" fill="#111" />
    <rect x="420" y="190" width="760" height="430" fill="url(#screenGlow)" />
    <defs>
      <linearGradient id="screenGlow" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3B82F6" /><stop offset=".55" stopColor="#8B5CF6" /><stop offset="1" stopColor="#EC4899" />
      </linearGradient>
    </defs>
    <rect x="770" y="640" width="60" height="120" fill="#222" />
    <g fill="#F4F1EA" opacity=".85">
      <rect x="1260" y="520" width="40" height="170" rx="8" /><ellipse cx="1280" cy="500" rx="70" ry="44" fill="#FFE3A6" opacity=".6" />
    </g>
  </svg>
);

export const PYTHAGORAS_SCENES: SceneDef[] = [
  {
    id: 'ladder',
    title: 'The ladder against the wall',
    names: { a: 'ground', b: 'wall', c: 'ladder' },
    photo: '/scenes/ladder.jpg',
    vertices: { C: [560, 760], A: [560, 250], B: [1240, 760] },
    Illustration: LadderScene,
  },
  {
    id: 'ramp',
    title: 'The wheelchair ramp',
    names: { a: 'along the ground', b: 'height', c: 'ramp' },
    photo: '/scenes/ramp.jpg',
    vertices: { C: [1000, 760], A: [1000, 560], B: [420, 760] },
    Illustration: RampScene,
  },
  {
    id: 'screen',
    title: 'How big is that TV?',
    names: { a: 'width', b: 'height', c: 'screen size' },
    photo: '/scenes/screen.jpg',
    vertices: { C: [420, 620], A: [420, 190], B: [1180, 620] },
    Illustration: ScreenScene,
  },
];

export function getScene(id?: string | null): SceneDef {
  return PYTHAGORAS_SCENES.find((s) => s.id === id) || PYTHAGORAS_SCENES[0];
}
