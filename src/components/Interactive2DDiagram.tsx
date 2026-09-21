import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ConceptNode,
  DiagramConnection,
  DynamicDiagramData,
} from '../types';
import {
  Play,
  Pause,
  RotateCw,
  ArrowRight,
  Sparkles,
  Zap,
  Layers,
  Atom,
  Dna,
  Sun,
  Droplets,
  Flame,
  Activity,
  Cpu,
  Info,
  ChevronRight,
  Maximize2,
  Minimize2,
  Volume2,
} from 'lucide-react';

interface Interactive2DDiagramProps {
  diagram: DynamicDiagramData;
  overview?: string;
  highlightedNodeId?: string;
  onNodeClick: (node: ConceptNode) => void;
  onAskTutor?: (question: string) => void;
}

// Map color themes to CSS classes and SVG stroke colors
const COLOR_MAP: Record<
  string,
  {
    bg: string;
    border: string;
    text: string;
    glow: string;
    badge: string;
    svgStroke: string;
    svgFill: string;
    particle: string;
  }
> = {
  emerald: {
    bg: 'bg-emerald-950/60',
    border: 'border-emerald-500/70',
    text: 'text-emerald-300',
    glow: 'rgba(52, 211, 153, 0.4)',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    svgStroke: '#10b981',
    svgFill: '#064e3b',
    particle: '#34d399',
  },
  amber: {
    bg: 'bg-amber-950/60',
    border: 'border-amber-500/70',
    text: 'text-amber-300',
    glow: 'rgba(251, 191, 36, 0.4)',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    svgStroke: '#f59e0b',
    svgFill: '#78350f',
    particle: '#fbbf24',
  },
  sky: {
    bg: 'bg-sky-950/60',
    border: 'border-sky-500/70',
    text: 'text-sky-300',
    glow: 'rgba(56, 189, 248, 0.4)',
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    svgStroke: '#0ea5e9',
    svgFill: '#0c4a6e',
    particle: '#38bdf8',
  },
  violet: {
    bg: 'bg-violet-950/60',
    border: 'border-violet-500/70',
    text: 'text-violet-300',
    glow: 'rgba(167, 139, 250, 0.4)',
    badge: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
    svgStroke: '#8b5cf6',
    svgFill: '#4c1d95',
    particle: '#a78bfa',
  },
  rose: {
    bg: 'bg-rose-950/60',
    border: 'border-rose-500/70',
    text: 'text-rose-300',
    glow: 'rgba(251, 113, 133, 0.4)',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    svgStroke: '#f43f5e',
    svgFill: '#881337',
    particle: '#fb7185',
  },
  teal: {
    bg: 'bg-teal-950/60',
    border: 'border-teal-500/70',
    text: 'text-teal-300',
    glow: 'rgba(45, 212, 191, 0.4)',
    badge: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    svgStroke: '#14b8a6',
    svgFill: '#134e4a',
    particle: '#2dd4bf',
  },
};

// Choose a semantic icon for a node
function getNodeIcon(node: ConceptNode) {
  const text = `${node.label} ${node.sublabel || ''} ${node.category || ''}`.toLowerCase();
  if (text.includes('sun') || text.includes('light') || text.includes('photon') || text.includes('solar')) return Sun;
  if (text.includes('water') || text.includes('liquid') || text.includes('hydro') || text.includes('photolysis')) return Droplets;
  if (text.includes('energy') || text.includes('atp') || text.includes('electron') || text.includes('volt') || text.includes('charge')) return Zap;
  if (text.includes('dna') || text.includes('gene') || text.includes('rna') || text.includes('helix')) return Dna;
  if (text.includes('atom') || text.includes('quantum') || text.includes('orbit') || text.includes('particle')) return Atom;
  if (text.includes('heat') || text.includes('fire') || text.includes('thermal') || text.includes('combustion')) return Flame;
  if (text.includes('enzyme') || text.includes('catalyst') || text.includes('cycle') || text.includes('rubisco')) return RotateCw;
  if (text.includes('circuit') || text.includes('cpu') || text.includes('logic') || text.includes('code')) return Cpu;
  if (text.includes('wave') || text.includes('frequency') || text.includes('rate') || text.includes('pulse')) return Activity;
  return Layers;
}

// Generate meaningful pedagogical phase names instead of "STEP NODE 1"
function getPhaseBadge(index: number, total: number, category?: string): string {
  if (category && category.trim().length > 0 && !category.toLowerCase().includes('node')) {
    return category;
  }
  if (index === 0) return 'Input & Initiation';
  if (index === total - 1) return 'Final Output & Yield';
  if (index === 1) return 'Catalysis & Splitting';
  if (index === 2) return 'Energy Transfer';
  if (index === 3) return 'Synthesis Phase';
  return `Phase ${index + 1}`;
}

export const Interactive2DDiagram: React.FC<Interactive2DDiagramProps> = ({
  diagram,
  overview,
  highlightedNodeId,
  onNodeClick,
  onAskTutor,
}) => {
  const { nodes = [], connections = [], diagramType = 'flow', title, description } = diagram;

  // View presentation mode: 'flow' (SVG visual pipeline), 'cycle' (radial orbital loop), or 'matrix' (side-by-side cards)
  const initialMode = diagramType === 'cycle' ? 'cycle' : 'flow';
  const [viewMode, setViewMode] = useState<'flow' | 'cycle' | 'matrix'>(initialMode);
  const [selectedNode, setSelectedNode] = useState<ConceptNode | null>(nodes[0] || null);
  const [isPlayingFlow, setIsPlayingFlow] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Update selection if nodes change
  useEffect(() => {
    if (nodes.length > 0 && !selectedNode) {
      setSelectedNode(nodes[0]);
    }
  }, [nodes, selectedNode]);

  // Synchronize when tutor highlights a node via audio
  useEffect(() => {
    if (highlightedNodeId) {
      const match = nodes.find((n) => n.id === highlightedNodeId);
      if (match) {
        setSelectedNode(match);
        const idx = nodes.indexOf(match);
        if (idx !== -1) setActiveStepIndex(idx);
      }
    }
  }, [highlightedNodeId, nodes]);

  // Auto-play stepper through nodes
  useEffect(() => {
    if (!isPlayingFlow || nodes.length === 0) return;
    const interval = setInterval(() => {
      setActiveStepIndex((prev) => {
        const next = (prev + 1) % nodes.length;
        setSelectedNode(nodes[next]);
        onNodeClick(nodes[next]);
        return next;
      });
    }, 2800);
    return () => clearInterval(interval);
  }, [isPlayingFlow, nodes, onNodeClick]);

  // Handle node selection
  const handleSelectNode = (node: ConceptNode, index: number) => {
    setSelectedNode(node);
    setActiveStepIndex(index);
    onNodeClick(node);
  };

  // Node coordinate calculations for Flow / Linear layout
  const flowLayout = useMemo(() => {
    const total = nodes.length;
    const width = 960;
    const height = 440;
    if (total === 0) return { nodesWithPos: [], pathStrings: [] };

    // Arrange nodes in a responsive multi-row or horizontal serpentine layout
    const isSingleRow = total <= 4;
    const cols = isSingleRow ? total : Math.ceil(total / 2);
    const rows = isSingleRow ? 1 : 2;

    const marginX = 80;
    const marginY = 80;
    const usableW = width - marginX * 2;
    const usableH = height - marginY * 2;

    const nodesWithPos = nodes.map((node, i) => {
      let col = i;
      let row = 0;
      if (!isSingleRow) {
        if (i < cols) {
          col = i;
          row = 0;
        } else {
          // Serpentine reverse on row 2 for natural loop
          col = cols - 1 - (i - cols);
          row = 1;
        }
      }

      const x = marginX + (cols > 1 ? (col / (cols - 1)) * usableW : usableW / 2);
      const y = marginY + (rows > 1 ? (row / (rows - 1)) * usableH : usableH / 2);

      return {
        ...node,
        x,
        y,
        index: i,
      };
    });

    // Compute bezier curved connection paths
    const pathStrings: Array<{
      d: string;
      label?: string;
      fromNode: typeof nodesWithPos[0];
      toNode: typeof nodesWithPos[0];
      isActive: boolean;
    }> = [];

    // Fallback linear sequence if connections array is empty
    const effectiveConnections: DiagramConnection[] =
      connections && connections.length > 0
        ? connections
        : nodes.slice(0, -1).map((n, i) => ({
            from: n.label,
            to: nodes[i + 1].label,
            label: 'Yields',
          }));

    effectiveConnections.forEach((conn) => {
      const fromNode = nodesWithPos.find(
        (n) =>
          n.label.toLowerCase().includes(conn.from.toLowerCase()) ||
          conn.from.toLowerCase().includes(n.label.toLowerCase())
      );
      const toNode = nodesWithPos.find(
        (n) =>
          n.label.toLowerCase().includes(conn.to.toLowerCase()) ||
          conn.to.toLowerCase().includes(n.label.toLowerCase())
      );

      if (fromNode && toNode) {
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;

        // Smooth bezier curve
        let d = '';
        if (Math.abs(dy) < 20) {
          // Horizontal straight or slightly curved
          const midX = (fromNode.x + toNode.x) / 2;
          d = `M ${fromNode.x} ${fromNode.y} Q ${midX} ${fromNode.y - 25} ${toNode.x} ${toNode.y}`;
        } else {
          // S-curve between rows
          const cp1x = fromNode.x + dx * 0.5;
          const cp1y = fromNode.y;
          const cp2x = fromNode.x + dx * 0.5;
          const cp2y = toNode.y;
          d = `M ${fromNode.x} ${fromNode.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toNode.x} ${toNode.y}`;
        }

        const isActive = activeStepIndex === fromNode.index;
        pathStrings.push({
          d,
          label: conn.label,
          fromNode,
          toNode,
          isActive,
        });
      }
    });

    return { nodesWithPos, pathStrings };
  }, [nodes, connections, activeStepIndex]);

  // Coordinate calculations for Cycle Layout
  const cycleLayout = useMemo(() => {
    const total = nodes.length;
    const width = 800;
    const height = 500;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 175;

    const nodesWithPos = nodes.map((node, i) => {
      // Start from top (-PI/2) and rotate clockwise
      const angle = -Math.PI / 2 + (i / total) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      return {
        ...node,
        x,
        y,
        angle,
        index: i,
      };
    });

    // Circular flow arcs connecting each node to the next
    const arcPaths = nodesWithPos.map((curr, i) => {
      const next = nodesWithPos[(i + 1) % total];
      // Arc curve around the circle
      const midAngle = (curr.angle + next.angle) / 2 + (next.angle < curr.angle ? Math.PI : 0);
      const arcR = radius * 1.05;
      const arcMidX = centerX + arcR * Math.cos(midAngle);
      const arcMidY = centerY + arcR * Math.sin(midAngle);

      const d = `M ${curr.x} ${curr.y} Q ${arcMidX} ${arcMidY} ${next.x} ${next.y}`;
      return {
        d,
        fromNode: curr,
        toNode: next,
        isActive: activeStepIndex === curr.index,
      };
    });

    return { centerX, centerY, radius, nodesWithPos, arcPaths };
  }, [nodes, activeStepIndex]);

  return (
    <div
      className={`w-full flex flex-col gap-4 text-[#e0f2e9] ${
<<<<<<< HEAD
        isExpanded
          ? 'fixed inset-4 z-50 bg-[#06190e] border-2 border-emerald-500/50 rounded-3xl p-6 shadow-2xl overflow-y-auto'
          : 'relative'
=======
        isExpanded ? 'fixed inset-4 z-50 bg-[#06190e] border-2 border-emerald-500/50 rounded-3xl p-6 shadow-2xl overflow-y-auto' : ''
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
      }`}
    >
      {/* 1. TOP HEADER & DIAGRAM VIEW CONTROLS */}
      <div className="bg-[#0b2617]/90 backdrop-blur-md border border-[#1f5033] rounded-2xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[11px] font-bold text-emerald-300 font-mono flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              2D Interactive Schematic
            </span>
            <span className="text-xs text-[#89bda0] font-mono">
              {nodes.length} Stages Connected
            </span>
          </div>
          <h2 className="text-lg md:text-xl font-bold text-amber-300 font-serif tracking-wide">
            {title || 'Conceptual Flow Schematic'}
          </h2>
          <p className="text-xs text-[#b0d8c4] leading-relaxed max-w-2xl mt-0.5">
            {description || overview}
          </p>
        </div>

        {/* Action Controls & View Switcher */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Animated Flow Player */}
          <button
            onClick={() => setIsPlayingFlow(!isPlayingFlow)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md ${
              isPlayingFlow
                ? 'bg-amber-400 text-black shadow-amber-400/20'
                : 'bg-[#153f28] hover:bg-[#1c5536] text-amber-300 border border-[#2a6843]'
            }`}
            title="Step through reaction flow automatically"
          >
            {isPlayingFlow ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isPlayingFlow ? 'Pause Flow' : 'Animate Flow'}</span>
          </button>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-[#071d11] p-1 rounded-xl border border-[#1b482d]">
            <button
              onClick={() => setViewMode('flow')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'flow'
                  ? 'bg-emerald-500 text-black font-bold shadow'
                  : 'text-[#87b398] hover:text-white'
              }`}
              title="Interactive SVG Flowchart Canvas"
            >
              Pipeline
            </button>
            <button
              onClick={() => setViewMode('cycle')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'cycle'
                  ? 'bg-emerald-500 text-black font-bold shadow'
                  : 'text-[#87b398] hover:text-white'
              }`}
              title="Circular Loop / Cycle Orbit"
            >
              Cycle
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'matrix'
                  ? 'bg-emerald-500 text-black font-bold shadow'
                  : 'text-[#87b398] hover:text-white'
              }`}
              title="Detailed Schematic Cards"
            >
              Grid
            </button>
          </div>

          {/* Expand Fullscreen */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-xl bg-[#0e2c1b] hover:bg-[#16442a] border border-[#235839] text-[#9dc9b1] hover:text-white cursor-pointer transition-colors"
            title={isExpanded ? 'Collapse diagram' : 'Expand diagram'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

<<<<<<< HEAD
      {/* MAIN INTERACTIVE VISUAL CANVAS */}
      <div className="relative w-full rounded-3xl bg-[#06180d] border-2 border-[#1c482c] shadow-2xl overflow-hidden min-h-[440px] pb-24 flex flex-row items-stretch justify-center p-4 gap-4">
=======
      {/* 2. MAIN INTERACTIVE VISUAL CANVAS */}
      <div className="relative w-full rounded-3xl bg-[#06180d] border-2 border-[#1c482c] shadow-2xl overflow-hidden min-h-[440px] flex flex-col items-center justify-center p-4">
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f331f_1px,transparent_1px),linear-gradient(to_bottom,#0f331f_1px,transparent_1px)] bg-[size:28px_28px] opacity-40 pointer-events-none" />
        <div className="absolute inset-0 bg-radial from-transparent via-[#06180d]/60 to-[#06180d] pointer-events-none" />

<<<<<<< HEAD
        {/* 2D GEOMETRY PANEL — full-height left panel for triangle/maths/pythagoras topics */}
        {/triangle|pythagoras|theorem|geometry|right.angle|hypotenuse/i.test(`${title} ${diagram.description || ''} ${overview || ''}`) && (
          <div className="shrink-0 w-[38%] max-w-[420px] rounded-2xl bg-[#041009]/85 border border-[#1c482c] flex flex-col items-center justify-center p-4 select-none">
            <div className="text-[9px] uppercase font-mono font-bold text-emerald-400 mb-2 text-center tracking-wider">Right-Angle Triangle Diagram</div>
            <svg viewBox="0 0 260 220" className="w-full max-h-[360px]" xmlns="http://www.w3.org/2000/svg">
              {/* Triangle fill */}
              <polygon points="30,190 230,190 30,18" fill="rgba(16,185,129,0.12)" stroke="#10b981" strokeWidth="2.2"/>
              {/* Right angle marker */}
              <polyline points="30,163 56,163 56,190" fill="none" stroke="#fbbf24" strokeWidth="2"/>
              {/* Side a — base */}
              <line x1="30" y1="190" x2="230" y2="190" stroke="none"/>
              <text x="130" y="208" fill="#86efac" fontSize="13" fontFamily="monospace" textAnchor="middle">a — base</text>
              {/* Side b — height */}
              <text x="12" y="108" fill="#86efac" fontSize="13" fontFamily="monospace" textAnchor="middle" transform="rotate(-90,12,108)">b — height</text>
              {/* Side c — hypotenuse */}
              <text x="148" y="98" fill="#fbbf24" fontSize="13" fontFamily="monospace" textAnchor="middle" transform="rotate(-42,148,98)">c — hypotenuse</text>
              {/* Vertices */}
              <circle cx="30" cy="190" r="6" fill="#fbbf24"/>
              <circle cx="230" cy="190" r="6" fill="#38bdf8"/>
              <circle cx="30" cy="18" r="6" fill="#f43f5e"/>
              {/* Vertex labels */}
              <text x="10" y="212" fill="#fbbf24" fontSize="11" fontFamily="sans-serif">90°</text>
              <text x="236" y="198" fill="#38bdf8" fontSize="11" fontFamily="sans-serif">B</text>
              <text x="10" y="15" fill="#f43f5e" fontSize="11" fontFamily="sans-serif">A</text>
              {/* Formula box */}
              <rect x="60" y="28" width="140" height="32" rx="6" fill="#071a0c" stroke="#1f4e33" strokeWidth="1.5"/>
              <text x="130" y="48" fill="#fbbf24" fontSize="16" fontFamily="monospace" textAnchor="middle" fontWeight="bold">a²+b²=c²</text>
              {/* Angle arc at B */}
              <path d="M 210,190 A 20,20 0 0,0 202,171" fill="none" stroke="#38bdf8" strokeWidth="1.5"/>
              {/* Angle arc at A (top) */}
              <path d="M 30,42 A 24,24 0 0,1 52,30" fill="none" stroke="#f43f5e" strokeWidth="1.5"/>
            </svg>
            <div className="mt-2 text-center">
              <div className="text-[10px] text-emerald-400 font-mono">Pythagoras Theorem</div>
              <div className="text-[9px] text-[#5a8a6e] mt-0.5">Click a node on the right to highlight sides</div>
            </div>
          </div>
        )}

        {/* MODE A: SVG FLOWCHART PIPELINE CANVAS */}
        {viewMode === 'flow' && (
          <div className="relative flex-1 min-w-0 h-[460px] flex items-center justify-center">
            <svg
              viewBox="0 0 960 440"
              className="w-full h-full select-none"
=======
        {/* MODE A: SVG FLOWCHART PIPELINE CANVAS */}
        {viewMode === 'flow' && (
          <div className="relative w-full h-[460px] flex items-center justify-center overflow-x-auto">
            <svg
              viewBox="0 0 960 440"
              className="w-full h-full min-w-[720px] select-none"
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                {/* Glow Filter */}
                <filter id="node-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>

                {/* Arrow markers for each color */}
                {Object.entries(COLOR_MAP).map(([color, styles]) => (
                  <marker
                    key={color}
                    id={`arrow-${color}`}
                    viewBox="0 0 10 10"
                    refX="28"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill={styles.svgStroke} />
                  </marker>
                ))}

                {/* Animated gradient for active flow pipes */}
                <linearGradient id="flow-pulse" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.2" />
                  <stop offset="50%" stopColor="#fbbf24" stopOpacity="1" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.2" />
                </linearGradient>
              </defs>

              {/* 1. Connection Pipes / Lines */}
              {flowLayout.pathStrings.map((conn, idx) => {
                const colorStyle = COLOR_MAP[conn.fromNode.color] || COLOR_MAP.emerald;
                return (
                  <g key={`flow-path-${idx}`} className="transition-all duration-500">
                    {/* Background wide pipe */}
                    <path
                      d={conn.d}
                      fill="none"
                      stroke="#0e3a22"
                      strokeWidth="10"
                      strokeLinecap="round"
                    />
                    {/* Foreground connector */}
                    <path
                      d={conn.d}
                      fill="none"
                      stroke={conn.isActive ? colorStyle.particle : colorStyle.svgStroke}
                      strokeWidth={conn.isActive ? '4' : '2.5'}
                      strokeDasharray={conn.isActive ? '8 4' : 'none'}
                      className={conn.isActive ? 'animate-pulse' : ''}
                      markerEnd={`url(#arrow-${conn.fromNode.color})`}
                      opacity={conn.isActive ? 1 : 0.75}
                    />

                    {/* Animated moving flow bead */}
                    {conn.isActive && (
                      <circle r="4.5" fill="#fbbf24" filter="url(#node-glow)">
                        <animateMotion
                          path={conn.d}
                          dur="2.2s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}

                    {/* Path relation label badge */}
                    {conn.label && (
                      <text
                        fill="#a3d9bc"
                        fontSize="10"
                        fontFamily="ui-monospace, monospace"
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        <textPath
                          href={`#flow-path-hidden-${idx}`}
                          startOffset="50%"
                        >
                          {conn.label}
                        </textPath>
                      </text>
                    )}
                  </g>
                );
              })}

              {/* 2. Interactive Node Graphical Glyphs */}
              {flowLayout.nodesWithPos.map((node, idx) => {
                const isSelected = selectedNode?.id === node.id;
                const isCurrentActive = activeStepIndex === idx;
                const style = COLOR_MAP[node.color] || COLOR_MAP.emerald;
                const IconComponent = getNodeIcon(node);
                const badgeText = getPhaseBadge(idx, nodes.length, node.category);

                // Card dimensions
                const cardW = 180;
                const cardH = 92;
                const cardX = node.x - cardW / 2;
                const cardY = node.y - cardH / 2;

                return (
                  <g
                    key={node.id}
                    onClick={() => handleSelectNode(node, idx)}
                    className="cursor-pointer transition-transform duration-200 group"
                    style={{
                      transformOrigin: `${node.x}px ${node.y}px`,
                    }}
                  >
                    {/* Outer Glow Halo if active */}
                    {(isSelected || isCurrentActive) && (
                      <rect
                        x={cardX - 4}
                        y={cardY - 4}
                        width={cardW + 8}
                        height={cardH + 8}
                        rx="18"
                        fill="none"
                        stroke={style.svgStroke}
                        strokeWidth="3"
                        filter="url(#node-glow)"
                        opacity="0.8"
                      />
                    )}

                    {/* Main Node Card Body */}
                    <rect
                      x={cardX}
                      y={cardY}
                      width={cardW}
                      height={cardH}
                      rx="14"
                      fill={style.svgFill}
                      stroke={isSelected ? '#fbbf24' : style.svgStroke}
                      strokeWidth={isSelected ? '2.5' : '1.5'}
                      className="transition-colors group-hover:brightness-125"
                    />

                    {/* Category / Phase Pill */}
                    <rect
                      x={cardX + 10}
                      y={cardY + 8}
                      width={cardW - 20}
                      height="18"
                      rx="9"
                      fill="#062213"
                      opacity="0.9"
                    />
                    <text
                      x={node.x}
                      y={cardY + 20}
                      fill={style.particle}
                      fontSize="9.5"
                      fontFamily="ui-sans-serif, system-ui, sans-serif"
                      fontWeight="bold"
                      textAnchor="middle"
                      letterSpacing="0.5"
                    >
                      {badgeText.toUpperCase()}
                    </text>

                    {/* Primary Node Label */}
                    <text
                      x={cardX + 40}
                      y={cardY + 48}
                      fill="#ffffff"
                      fontSize="12.5"
                      fontFamily="ui-serif, Georgia, serif"
                      fontWeight="bold"
                      className="select-none"
                    >
                      {node.label.length > 18 ? `${node.label.slice(0, 16)}...` : node.label}
                    </text>

                    {/* Sublabel / Formula text */}
                    {node.sublabel && (
                      <text
                        x={cardX + 40}
                        y={cardY + 66}
                        fill="#9ed4ba"
                        fontSize="10"
                        fontFamily="ui-monospace, monospace"
                        className="select-none"
                      >
                        {node.sublabel.length > 20 ? `${node.sublabel.slice(0, 18)}...` : node.sublabel}
                      </text>
                    )}

                    {/* Icon Circle Badge */}
                    <circle
                      cx={cardX + 24}
                      cy={cardY + 54}
                      r="13"
                      fill="#072b17"
                      stroke={style.svgStroke}
                      strokeWidth="1.5"
                    />
                    <foreignObject
                      x={cardX + 16}
                      y={cardY + 46}
                      width="16"
                      height="16"
                      className="pointer-events-none"
                    >
                      <IconComponent className="w-4 h-4 text-amber-300" />
                    </foreignObject>

                    {/* Input/Output Connection Pin indicators */}
                    <circle
                      cx={cardX}
                      cy={node.y}
                      r="3.5"
                      fill={style.svgStroke}
                    />
                    <circle
                      cx={cardX + cardW}
                      cy={node.y}
                      r="3.5"
                      fill={style.svgStroke}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* MODE B: CIRCULAR CYCLE VIEW (For cycles like Calvin, Water, Krebs, Carnot) */}
        {viewMode === 'cycle' && (
<<<<<<< HEAD
          <div className="relative flex-1 min-w-0 h-[480px] flex items-center justify-center">
=======
          <div className="relative w-full h-[480px] flex items-center justify-center">
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
            <svg
              viewBox="0 0 800 500"
              className="w-full h-full max-w-2xl select-none"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Central Core Cycle Hub */}
              <circle
                cx={cycleLayout.centerX}
                cy={cycleLayout.centerY}
                r="70"
                fill="#072414"
                stroke="#2a6642"
                strokeWidth="2.5"
                strokeDasharray="6 4"
                className="animate-[spin_60s_linear_infinite]"
              />
              <circle
                cx={cycleLayout.centerX}
                cy={cycleLayout.centerY}
                r="45"
                fill="#0c351e"
                stroke="#34d399"
                strokeWidth="1.5"
              />
              <text
                x={cycleLayout.centerX}
                y={cycleLayout.centerY - 6}
                fill="#fbbf24"
                fontSize="12"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="ui-serif, Georgia"
              >
                CYCLIC
              </text>
              <text
                x={cycleLayout.centerX}
                y={cycleLayout.centerY + 12}
                fill="#a3d9bc"
                fontSize="10"
                fontWeight="600"
                textAnchor="middle"
                fontFamily="ui-sans-serif"
              >
                PROCESS LOOP
              </text>

              {/* Connecting Curved Flow Arcs */}
              {cycleLayout.arcPaths.map((arc, i) => (
                <g key={`cycle-arc-${i}`}>
                  <path
                    d={arc.d}
                    fill="none"
                    stroke={arc.isActive ? '#fbbf24' : '#1b5032'}
                    strokeWidth={arc.isActive ? '3.5' : '2'}
                    strokeDasharray={arc.isActive ? '6 4' : 'none'}
                    markerEnd="url(#arrow-emerald)"
                  />
                  {arc.isActive && (
                    <circle r="4" fill="#fbbf24">
                      <animateMotion path={arc.d} dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                </g>
              ))}

              {/* Orbital Nodes */}
              {cycleLayout.nodesWithPos.map((node, i) => {
                const isSelected = selectedNode?.id === node.id;
                const isCurrentActive = activeStepIndex === i;
                const style = COLOR_MAP[node.color] || COLOR_MAP.emerald;
                const IconComponent = getNodeIcon(node);
                const badgeText = getPhaseBadge(i, nodes.length, node.category);

                const cardW = 150;
                const cardH = 75;
                const cardX = node.x - cardW / 2;
                const cardY = node.y - cardH / 2;

                return (
                  <g
                    key={`cycle-node-${node.id}`}
                    onClick={() => handleSelectNode(node, i)}
                    className="cursor-pointer group"
                  >
                    {(isSelected || isCurrentActive) && (
                      <rect
                        x={cardX - 4}
                        y={cardY - 4}
                        width={cardW + 8}
                        height={cardH + 8}
                        rx="16"
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth="2.5"
                      />
                    )}
                    <rect
                      x={cardX}
                      y={cardY}
                      width={cardW}
                      height={cardH}
                      rx="12"
                      fill={style.svgFill}
                      stroke={style.svgStroke}
                      strokeWidth="1.5"
                      className="group-hover:brightness-125 transition-all"
                    />
                    <text
                      x={node.x}
                      y={cardY + 16}
                      fill={style.particle}
                      fontSize="9"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {badgeText.toUpperCase()}
                    </text>
                    <text
                      x={node.x}
                      y={cardY + 40}
                      fill="#ffffff"
                      fontSize="11.5"
                      fontWeight="bold"
                      textAnchor="middle"
                      fontFamily="ui-serif, Georgia"
                    >
                      {node.label.length > 16 ? `${node.label.slice(0, 14)}...` : node.label}
                    </text>
                    {node.sublabel && (
                      <text
                        x={node.x}
                        y={cardY + 58}
                        fill="#9ed4ba"
                        fontSize="9"
                        textAnchor="middle"
                        fontFamily="ui-monospace"
                      >
                        {node.sublabel.length > 18 ? `${node.sublabel.slice(0, 16)}...` : node.sublabel}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* MODE C: DETAILED SCHEMATIC MATRIX (Enhanced Cards with connecting process bars) */}
        {viewMode === 'matrix' && (
<<<<<<< HEAD
          <div className="flex-1 min-w-0 max-h-[460px] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 p-2 relative z-10 content-start">
=======
          <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-2 relative z-10">
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
            {nodes.map((node, index) => {
              const isSelected = selectedNode?.id === node.id;
              const isCurrentActive = activeStepIndex === index;
              const style = COLOR_MAP[node.color] || COLOR_MAP.emerald;
              const IconComponent = getNodeIcon(node);
              const badgeText = getPhaseBadge(index, nodes.length, node.category);

              return (
                <div
                  key={node.id}
                  onClick={() => handleSelectNode(node, index)}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer shadow-lg flex flex-col justify-between ${
                    style.bg
                  } ${style.border} ${
                    isSelected || isCurrentActive
                      ? 'ring-2 ring-amber-400 scale-[1.02] shadow-amber-400/20'
                      : 'hover:scale-[1.01] hover:brightness-110'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full uppercase font-bold border ${style.badge}`}>
                        {badgeText}
                      </span>
                      <span className="text-[11px] font-mono text-[#86b59b] flex items-center gap-1">
                        <IconComponent className="w-3.5 h-3.5 text-amber-300" />
                        Stage {index + 1}
                      </span>
                    </div>

                    <h4 className={`text-base font-bold mb-1 font-serif tracking-wide text-white`}>
                      {node.label}
                    </h4>

                    {node.sublabel && (
                      <p className="text-xs text-[#a9d7c1] font-mono mb-2">
                        {node.sublabel}
                      </p>
                    )}

                    <p className="text-xs text-[#cadfd4] leading-relaxed line-clamp-3">
                      {node.details}
                    </p>
                  </div>

                  <div className="mt-4 pt-2.5 border-t border-[#1b432a] flex items-center justify-between text-[11px] text-[#86b59b]">
                    <span className="text-emerald-300 font-semibold">Inspect mechanism</span>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-300" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

<<<<<<< HEAD
      {/* 3. LIVE STEP SPOTLIGHT — rendered as overlay INSIDE the canvas, no extra height */}
      {selectedNode && (
        <div className="absolute bottom-0 inset-x-0 z-20 bg-[#06180d]/95 backdrop-blur-sm border-t-2 border-amber-400/40 px-5 py-3 flex items-start gap-4">
          <div className="w-9 h-9 shrink-0 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-300">
            {React.createElement(getNodeIcon(selectedNode), { className: 'w-4 h-4' })}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 font-mono">
                {getPhaseBadge(activeStepIndex, nodes.length, selectedNode.category)}
              </span>
              {selectedNode.sublabel && (
                <span className="text-xs text-[#9fc7b1] font-mono">{selectedNode.sublabel}</span>
              )}
            </div>
            <h3 className="text-sm font-bold text-white font-serif">{selectedNode.label}</h3>
            <p className="text-xs text-[#c8e8d8] leading-relaxed line-clamp-2 mt-0.5">{selectedNode.details}</p>
          </div>
          {onAskTutor && (
            <button
              onClick={() => onAskTutor(`Dr. Vance, explain "${selectedNode.label}" and how it connects to the next concept.`)}
              className="shrink-0 px-2.5 py-1.5 rounded-xl bg-[#143c26] hover:bg-[#1a4e32] border border-[#27643f] text-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow"
            >
              <Volume2 className="w-3 h-3 text-amber-400" />
              <span>Ask Dr. Vance</span>
            </button>
=======
      {/* 3. LIVE STEP SPOTLIGHT & DEEP CONCEPT INSPECTOR */}
      {selectedNode && (
        <div className="bg-[#092214] border-2 border-amber-400/40 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-400/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3 pb-3 border-b border-[#1b432a]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-300">
                {React.createElement(getNodeIcon(selectedNode), { className: 'w-5 h-5' })}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 font-mono">
                    {getPhaseBadge(activeStepIndex, nodes.length, selectedNode.category)}
                  </span>
                  {selectedNode.sublabel && (
                    <span className="text-xs text-[#9fc7b1] font-mono">
                      {selectedNode.sublabel}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-white font-serif tracking-wide mt-0.5">
                  {selectedNode.label}
                </h3>
              </div>
            </div>

            {/* Quick action buttons for the selected node */}
            <div className="flex items-center gap-2">
              {onAskTutor && (
                <button
                  onClick={() =>
                    onAskTutor(
                      `Dr. Vance, can you explain the exact mechanism of "${selectedNode.label}" and how it connects to the next step?`
                    )
                  }
                  className="px-3 py-1.5 rounded-xl bg-[#143c26] hover:bg-[#1a4e32] border border-[#27643f] text-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow"
                >
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ask Dr. Vance to Explain</span>
                </button>
              )}
            </div>
          </div>

          <p className="text-sm text-[#d4ece0] leading-relaxed">
            {selectedNode.details}
          </p>

          {/* Upstream and Downstream Relationship Flow */}
          {connections && connections.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[#163824] flex flex-wrap items-center gap-4 text-xs">
              <span className="text-[11px] uppercase font-mono font-bold text-[#86b59b]">
                Connected Pathway:
              </span>
              {connections
                .filter(
                  (c) =>
                    c.from.toLowerCase().includes(selectedNode.label.toLowerCase()) ||
                    c.to.toLowerCase().includes(selectedNode.label.toLowerCase())
                )
                .map((conn, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0e2d1c] border border-[#214f34] text-[#a4d7bd]"
                  >
                    <span className="font-semibold text-emerald-300">{conn.from}</span>
                    <ArrowRight className="w-3 h-3 text-amber-400" />
                    <span className="font-semibold text-sky-300">{conn.to}</span>
                    {conn.label && (
                      <span className="text-[10px] text-amber-200/80 italic">
                        ({conn.label})
                      </span>
                    )}
                  </div>
                ))}
            </div>
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
          )}
        </div>
      )}
    </div>
  );
};
<<<<<<< HEAD

=======
>>>>>>> 73732644c7c312fafae9fe2617657d797c0e4352
