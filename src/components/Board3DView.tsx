// ─────────────────────────────────────────────────────────────────
// Board3DView — draws any 3D board picture composed from the 3D bricks
// (point, segment, polygon, sphere, cuboid, cylinder/cone, label) in a
// 'space' frame. Same teaching model as the 2D board: the picture is
// built up step by step, the current step is spotlighted, earlier parts
// fade back. There is no per-topic scene code — this replaces the fixed
// orbit/molecule/dna/geometry templates (Interactive3DVisual keeps them
// only for lessons generated before board pictures existed).
//
// A 3D picture only exists when the generator judged that depth genuinely
// helps the idea (src/visual/prompt.ts, purpose 'space').
// ─────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RotateCw, Pause, LocateFixed } from 'lucide-react';
import type { BoardVisual3D, VisualElement3D, Vec3, VisualColor } from '../visual/types';
import { BOARD_COLORS, StepBar, StepState } from './BoardVisualView';
import { ticks, fmtTick } from '../visual/layout';

interface Props {
  visual: BoardVisual3D;
  step: StepState;
  onStepChange?: (s: StepState) => void;
  spotlight?: string[];
}

const WORLD = 8; // the longest frame side maps to this many world units

interface Brick {
  id: string;
  group: THREE.Group;
  /** Each material with the opacity it has when fully shown. */
  mats: Array<{ m: THREE.Material & { opacity: number }; base: number }>;
  enteredAt: number;
}

function textSprite(text: string, color: string, heightWorld = 0.42): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = '600 44px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  canvas.width = w; canvas.height = 64;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(7,11,22,0.92)';
  ctx.lineWidth = 9;
  ctx.strokeText(text, w / 2, 33);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(heightWorld * (w / 64), heightWorld, 1);
  s.renderOrder = 10;
  return s;
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o: any) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) { m.map?.dispose?.(); m.dispose?.(); }
  });
}

export const Board3DView: React.FC<Props> = ({ visual, step, onStepChange, spotlight }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const bricksRef = useRef<Map<string, Brick>>(new Map());
  const controlsRef = useRef<OrbitControls | null>(null);
  const resetRef = useRef<() => void>(() => {});
  const [autoRotate, setAutoRotate] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);

  // ── build the scene whenever the picture changes ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err: any) {
      setWebglError('3D is not available in this browser.');
      return;
    }
    setWebglError(null);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotateSpeed = 0.9;
    controls.autoRotate = true;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1f33, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(6, 10, 8);
    scene.add(sun);

    // Data → world.
    const f = visual.frame;
    const c: Vec3 = [(f.x[0] + f.x[1]) / 2, (f.y[0] + f.y[1]) / 2, (f.z[0] + f.z[1]) / 2];
    const s = WORLD / Math.max(f.x[1] - f.x[0], f.y[1] - f.y[0], f.z[1] - f.z[0]);
    const W = (p: Vec3) => new THREE.Vector3((p[0] - c[0]) * s, (p[1] - c[1]) * s, (p[2] - c[2]) * s);

    const root = new THREE.Group();
    scene.add(root);

    // Axes with real numbers.
    if (f.axes) {
      const axisMat = new THREE.LineBasicMaterial({ color: 0x9aa3b8, transparent: true, opacity: 0.6 });
      const origin: Vec3 = [
        f.x[0] <= 0 && f.x[1] >= 0 ? 0 : f.x[0],
        f.y[0] <= 0 && f.y[1] >= 0 ? 0 : f.y[0],
        f.z[0] <= 0 && f.z[1] >= 0 ? 0 : f.z[0],
      ];
      const axes: Array<{ name: string; from: Vec3; to: Vec3; range: [number, number]; at: (v: number) => Vec3 }> = [
        { name: 'x', from: [f.x[0], origin[1], origin[2]], to: [f.x[1], origin[1], origin[2]], range: f.x, at: (v) => [v, origin[1], origin[2]] },
        { name: 'y', from: [origin[0], f.y[0], origin[2]], to: [origin[0], f.y[1], origin[2]], range: f.y, at: (v) => [origin[0], v, origin[2]] },
        { name: 'z', from: [origin[0], origin[1], f.z[0]], to: [origin[0], origin[1], f.z[1]], range: f.z, at: (v) => [origin[0], origin[1], v] },
      ];
      for (const a of axes) {
        root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([W(a.from), W(a.to)]), axisMat));
        const end = W(a.to), dir = end.clone().sub(W(a.from)).normalize();
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 12), new THREE.MeshBasicMaterial({ color: 0x9aa3b8 }));
        cone.position.copy(end);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        root.add(cone);
        const letter = textSprite(a.name, '#C9CFDF', 0.36);
        letter.position.copy(end.clone().add(dir.clone().multiplyScalar(0.35)));
        root.add(letter);
        for (const v of ticks(a.range, undefined, 5)) {
          if (Math.abs(v) < 1e-9 && a.name !== 'x') continue;
          const t = textSprite(fmtTick(v), 'rgba(201,207,223,0.75)', 0.26);
          t.position.copy(W(a.at(v)).add(new THREE.Vector3(0, -0.22, 0)));
          root.add(t);
        }
      }
    }

    // Bricks.
    const bricks = new Map<string, Brick>();
    const labelStack = new Map<string, number>();
    const colorOf = (el: VisualElement3D) => BOARD_COLORS[(el.color ?? (el.kind === 'label' ? 'ink' : 'sky')) as VisualColor];

    for (const el of visual.elements) {
      const g = new THREE.Group();
      const color = new THREE.Color(colorOf(el));
      const mats: Brick['mats'] = [];
      const track = <M extends THREE.Material>(m: M, base: number): M => {
        (m as any).transparent = true; (m as any).opacity = base;
        mats.push({ m: m as any, base });
        return m;
      };
      let anchor = new THREE.Vector3();

      switch (el.kind) {
        case 'point': {
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 20), track(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }), 1));
          anchor = W(el.at); mesh.position.copy(anchor); g.add(mesh);
          break;
        }
        case 'segment': {
          const a = W(el.from), b = W(el.to);
          const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
          const mat = el.dashed
            ? track(new THREE.LineDashedMaterial({ color, dashSize: 0.22, gapSize: 0.14 }), 1)
            : track(new THREE.LineBasicMaterial({ color }), 1);
          const line = new THREE.Line(geom, mat);
          if (el.dashed) line.computeLineDistances();
          g.add(line);
          const dir = b.clone().sub(a).normalize();
          const addHead = (at: THREE.Vector3, d: THREE.Vector3) => {
            const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 14), track(new THREE.MeshBasicMaterial({ color }), 1));
            head.position.copy(at); head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); g.add(head);
          };
          if (el.arrow === 'end' || el.arrow === 'both') addHead(b, dir);
          if (el.arrow === 'start' || el.arrow === 'both') addHead(a, dir.clone().negate());
          anchor = a.clone().add(b).multiplyScalar(0.5);
          break;
        }
        case 'polygon': {
          const pts = el.points.map(W);
          const pos: number[] = [];
          for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0].toArray(), ...pts[i].toArray(), ...pts[i + 1].toArray());
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          geom.computeVertexNormals();
          if (el.fill !== false) g.add(new THREE.Mesh(geom, track(new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, depthWrite: false }), 0.28)));
          g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), track(new THREE.LineBasicMaterial({ color }), 1)));
          anchor = pts.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
          break;
        }
        case 'sphere': {
          const geom = new THREE.SphereGeometry(el.r * s, 40, 28);
          g.add(new THREE.Mesh(geom, track(new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, wireframe: !!el.wireframe, depthWrite: !el.wireframe }), el.wireframe ? 0.7 : 0.82)));
          anchor = W(el.center); g.position.copy(anchor);
          anchor = anchor.clone().add(new THREE.Vector3(0, el.r * s, 0));
          break;
        }
        case 'cuboid': {
          const geom = new THREE.BoxGeometry(el.size[0] * s, el.size[1] * s, el.size[2] * s);
          if (!el.wireframe) g.add(new THREE.Mesh(geom, track(new THREE.MeshStandardMaterial({ color, roughness: 0.5, depthWrite: false }), 0.3)));
          g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), track(new THREE.LineBasicMaterial({ color }), 1)));
          const center = W(el.center); g.position.copy(center);
          anchor = center.clone().add(new THREE.Vector3(0, (el.size[1] * s) / 2, 0));
          break;
        }
        case 'cylinder': {
          const a = W(el.from), b = W(el.to);
          const len = a.distanceTo(b) || 0.001;
          const geom = new THREE.CylinderGeometry((el.rTop ?? el.r) * s, el.r * s, len, 40, 1, false);
          const mesh = new THREE.Mesh(geom, track(new THREE.MeshStandardMaterial({ color, roughness: 0.5, wireframe: !!el.wireframe, depthWrite: false }), el.wireframe ? 0.7 : 0.4));
          g.add(mesh);
          g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 30), track(new THREE.LineBasicMaterial({ color }), 0.9)));
          g.position.copy(a.clone().add(b).multiplyScalar(0.5));
          g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
          anchor = b.clone();
          break;
        }
        case 'label': {
          const sprite = textSprite(el.text, colorOf(el));
          track(sprite.material, 1);
          anchor = W(el.at); sprite.position.copy(anchor); g.add(sprite);
          break;
        }
      }

      // Element label, stacked when several share a spot.
      if (el.label && el.kind !== 'label') {
        const key = `${anchor.x.toFixed(1)},${anchor.y.toFixed(1)},${anchor.z.toFixed(1)}`;
        const k = labelStack.get(key) ?? 0;
        labelStack.set(key, k + 1);
        const sprite = textSprite(el.label, colorOf(el));
        track(sprite.material, 1);
        const worldPos = anchor.clone().add(new THREE.Vector3(0, 0.38 + k * 0.42, 0));
        // Labels live in world space (not inside a rotated/offset group).
        const holder = new THREE.Group();
        holder.add(sprite);
        sprite.position.copy(worldPos);
        root.add(holder);
        bricks.set(`${el.id}::label`, { id: el.id, group: holder, mats: [mats[mats.length - 1]], enteredAt: 0 });
        mats.pop();
      }
      root.add(g);
      bricks.set(el.id, { id: el.id, group: g, mats, enteredAt: 0 });
    }
    bricksRef.current = bricks;

    // Camera framing.
    const reset = () => {
      camera.position.set(WORLD * 0.95, WORLD * 0.7, WORLD * 1.25);
      controls.target.set(0, 0, 0);
      controls.update();
    };
    reset();
    resetRef.current = reset;

    const resize = () => {
      const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(mount);

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      // Entering bricks fade in over ~600 ms.
      for (const b of bricksRef.current.values()) {
        if (!b.enteredAt) continue;
        const t = Math.min(1, (now - b.enteredAt) / 600);
        for (const { m, base } of b.mats) m.opacity = base * t * ((b.group.userData.dim as number) ?? 1);
        if (t >= 1) b.enteredAt = 0;
      }
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      bricksRef.current = new Map();
      controlsRef.current = null;
    };
  }, [visual]);

  // ── step, focus and dimming ──
  useEffect(() => {
    const n = visual.steps.length;
    const cur = step === 'all' ? n - 1 : Math.max(0, Math.min(step, n - 1));
    const stepOf = new Map<string, number>();
    visual.steps.forEach((st, i) => st.show.forEach((id) => stepOf.set(id, i)));
    const focus = new Set<string>(spotlight ?? []);
    if (step !== 'all') (visual.steps[cur].focus ?? visual.steps[cur].show).forEach((id) => focus.add(id));
    const dimOthers = focus.size > 0 && step !== 'all';
    const now = performance.now();
    for (const b of bricksRef.current.values()) {
      const shownAt = stepOf.get(b.id);
      const visible = step === 'all' || shownAt === undefined || shownAt <= cur;
      const wasVisible = b.group.visible;
      b.group.visible = visible;
      const dim = dimOthers && !focus.has(b.id) ? 0.3 : 1;
      b.group.userData.dim = dim;
      if (visible && step !== 'all' && shownAt === cur && !wasVisible) b.enteredAt = now;
      if (!b.enteredAt) for (const { m, base } of b.mats) m.opacity = base * dim;
    }
  }, [visual, step, spotlight]);

  useEffect(() => { if (controlsRef.current) controlsRef.current.autoRotate = autoRotate; }, [autoRotate]);

  return (
    <div className="w-full h-full flex flex-col gap-2 min-h-0">
      <StepBar visual={visual} step={step} onStepChange={onStepChange} />
      <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden bg-[#070B16]">
        <div ref={mountRef} className="absolute inset-0" />
        {webglError && <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">{webglError}</div>}
        <div className="absolute left-3 bottom-3 flex gap-1.5">
          <button onClick={() => setAutoRotate((a) => !a)}
            className="px-3 h-8 rounded-full text-[12px] font-semibold flex items-center gap-1.5 border border-white/15 bg-black/45 text-white/80 hover:bg-white/15 cursor-pointer">
            {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <RotateCw className="w-3.5 h-3.5" />}{autoRotate ? 'Stop turning' : 'Turn slowly'}
          </button>
          <button onClick={() => resetRef.current()}
            className="px-3 h-8 rounded-full text-[12px] font-semibold flex items-center gap-1.5 border border-white/15 bg-black/45 text-white/80 hover:bg-white/15 cursor-pointer">
            <LocateFixed className="w-3.5 h-3.5" /> Reset view
          </button>
        </div>
        <div className="absolute right-3 bottom-3 text-[11.5px] text-white/45 pointer-events-none">drag to turn · scroll to zoom</div>
      </div>
    </div>
  );
};
