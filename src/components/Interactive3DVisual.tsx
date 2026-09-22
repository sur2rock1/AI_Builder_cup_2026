import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Scene3DData } from '../types';
import { RotateCw, Eye, Maximize2, Compass, Info, Sparkles } from 'lucide-react';

interface Interactive3DVisualProps {
  sceneData?: Scene3DData;
  topic: string;
  subject?: string;
  onElementClick?: (elementName: string, desc: string) => void;
}

export const Interactive3DVisual: React.FC<Interactive3DVisualProps> = ({
  sceneData,
  topic,
  subject,
  onElementClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  const [isRotating, setIsRotating] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [activeElement, setActiveElement] = useState<{ name: string; description: string } | null>(null);

  // Mouse drag interaction state
  const isDraggingRef = useRef(false);
  const prevMousePosRef = useRef({ x: 0, y: 0 });
  const rotVelRef = useRef({ x: 0, y: 0 });

  // Infer scene type if not explicitly provided
  const getSceneType = (): Scene3DData['sceneType'] => {
    if (sceneData?.sceneType) return sceneData.sceneType;
    const lower = (topic + ' ' + (subject || '')).toLowerCase();
    if (lower.includes('orbit') || lower.includes('planet') || lower.includes('solar') || lower.includes('gravity') || lower.includes('space') || lower.includes('astronomy')) {
      return 'orbit';
    }
    if (lower.includes('molecule') || lower.includes('atom') || lower.includes('chemical') || lower.includes('bond') || lower.includes('chemistry')) {
      return 'molecule';
    }
    if (lower.includes('dna') || lower.includes('gene') || lower.includes('cell') || lower.includes('biology') || lower.includes('photo')) {
      return 'dna';
    }
    if (lower.includes('history') || lower.includes('war') || lower.includes('earth') || lower.includes('continent') || lower.includes('geography')) {
      return 'globe';
    }
    if (lower.includes('math') || lower.includes('geometry') || lower.includes('vector') || lower.includes('calculus') || lower.includes('triangle')) {
      return 'geometry';
    }
    if (lower.includes('computer') || lower.includes('network') || lower.includes('neural') || lower.includes('code') || lower.includes('algorithm')) {
      return 'network';
    }
    return 'particles';
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x05160d); // Deep chalkboard dark green
    scene.fog = new THREE.FogExp2(0x05160d, 0.035);

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 5, 14);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xd4f7df, 0.8);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xfef08a, 2.2); // Warm chalk sunlight
    mainLight.position.set(10, 15, 10);
    scene.add(mainLight);

    const rimLight = new THREE.PointLight(0x34d399, 3.5, 30); // Emerald rim light
    rimLight.position.set(-10, -5, -10);
    scene.add(rimLight);

    // 5. Build 3D objects according to scene type
    const rootGroup = new THREE.Group();
    groupRef.current = rootGroup;
    scene.add(rootGroup);

    const sceneType = getSceneType();

    // Position camera based on scene type for best viewing angle
    if (sceneType === 'geometry') {
      // Straight-on view for the flat triangle
      camera.position.set(0, 0.1, 13);
      camera.lookAt(0, 0.1, 0);
    }

    // Background floating dust particles
    const particleCount = 200;
    const particleGeo = new THREE.BufferGeometry();
    const posArr = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      posArr[i] = (Math.random() - 0.5) * 30;
      posArr[i + 1] = (Math.random() - 0.5) * 20;
      posArr[i + 2] = (Math.random() - 0.5) * 30;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.12,
      color: 0x6ee7b7,
      transparent: true,
      opacity: 0.5,
    });
    const dustParticles = new THREE.Points(particleGeo, particleMat);
    scene.add(dustParticles);

    // Build specific 3D model
    if (sceneType === 'orbit') {
      // Central Sun / Core
      const coreGeo = new THREE.SphereGeometry(1.6, 32, 32);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.6,
        roughness: 0.2,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      rootGroup.add(core);

      // Orbits and planets
      const orbits = [
        { radius: 3.2, size: 0.45, color: 0x38bdf8, speed: 1.2, name: 'Inner Orbital Body' },
        { radius: 5.2, size: 0.65, color: 0x34d399, speed: 0.8, name: 'Equilibrium Zone' },
        { radius: 7.2, size: 0.5, color: 0xf43f5e, speed: 0.5, name: 'Outer Gravitational Resonance' },
      ];

      orbits.forEach((orb) => {
        // Orbit line
        const ringGeo = new THREE.RingGeometry(orb.radius - 0.02, orb.radius + 0.02, 64);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x24583b,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        rootGroup.add(ring);

        // Planet mesh
        const pGeo = new THREE.SphereGeometry(orb.size, 24, 24);
        const pMat = new THREE.MeshStandardMaterial({ color: orb.color, roughness: 0.4 });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.position.x = orb.radius;
        pMesh.userData = { name: orb.name, radius: orb.radius, speed: orb.speed };
        rootGroup.add(pMesh);
      });
    } else if (sceneType === 'dna') {
      // Double Helix structure
      const strandPoints1: THREE.Vector3[] = [];
      const strandPoints2: THREE.Vector3[] = [];
      const rungs = 32;
      const height = 10;
      const radius = 2.2;

      for (let i = 0; i < rungs; i++) {
        const t = (i / rungs) * Math.PI * 4;
        const y = ((i - rungs / 2) / rungs) * height;
        const x1 = Math.cos(t) * radius;
        const z1 = Math.sin(t) * radius;
        const x2 = Math.cos(t + Math.PI) * radius;
        const z2 = Math.sin(t + Math.PI) * radius;

        strandPoints1.push(new THREE.Vector3(x1, y, z1));
        strandPoints2.push(new THREE.Vector3(x2, y, z2));

        // Connect base pair rungs
        const rungGeo = new THREE.CylinderGeometry(0.08, 0.08, radius * 2, 8);
        const rungMat = new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? 0x38bdf8 : 0xf43f5e,
          roughness: 0.3,
        });
        const rung = new THREE.Mesh(rungGeo, rungMat);
        rung.position.set(0, y, 0);
        rung.rotation.z = Math.PI / 2;
        rung.rotation.y = -t;
        rootGroup.add(rung);

        // Node balls on endpoints
        const bGeo = new THREE.SphereGeometry(0.24, 16, 16);
        const bMat1 = new THREE.MeshStandardMaterial({ color: 0x34d399, roughness: 0.2 });
        const bMat2 = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.2 });
        const b1 = new THREE.Mesh(bGeo, bMat1);
        b1.position.set(x1, y, z1);
        const b2 = new THREE.Mesh(bGeo, bMat2);
        b2.position.set(x2, y, z2);
        rootGroup.add(b1);
        rootGroup.add(b2);
      }
    } else if (sceneType === 'molecule') {
      // Molecular Atomic Lattice
      const centerAtom = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 32, 32),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.2, metalness: 0.1 })
      );
      rootGroup.add(centerAtom);

      const satellitePositions = [
        new THREE.Vector3(2.6, 1.8, 1.2),
        new THREE.Vector3(-2.6, 1.8, -1.2),
        new THREE.Vector3(1.8, -2.4, -1.5),
        new THREE.Vector3(-1.8, -2.4, 1.5),
      ];

      satellitePositions.forEach((pos, idx) => {
        const satAtom = new THREE.Mesh(
          new THREE.SphereGeometry(0.9, 24, 24),
          new THREE.MeshStandardMaterial({
            color: idx % 2 === 0 ? 0x38bdf8 : 0x10b981,
            roughness: 0.2,
          })
        );
        satAtom.position.copy(pos);
        rootGroup.add(satAtom);

        // Bond Cylinder
        const bondLength = pos.length();
        const bondGeo = new THREE.CylinderGeometry(0.18, 0.18, bondLength, 12);
        const bondMat = new THREE.MeshStandardMaterial({ color: 0xd1fae5, roughness: 0.4 });
        const bond = new THREE.Mesh(bondGeo, bondMat);
        bond.position.copy(pos.clone().multiplyScalar(0.5));
        bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
        rootGroup.add(bond);
      });
    } else if (sceneType === 'globe') {
      // 3D Historical / Earth Globe with Latitude Grid
      const globeGeo = new THREE.SphereGeometry(3.6, 36, 36);
      const globeMat = new THREE.MeshStandardMaterial({
        color: 0x14532d,
        wireframe: false,
        roughness: 0.6,
      });
      const globe = new THREE.Mesh(globeGeo, globeMat);
      rootGroup.add(globe);

      // Wireframe overlay grid
      const wireGlobe = new THREE.Mesh(
        new THREE.SphereGeometry(3.62, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0x34d399, wireframe: true, transparent: true, opacity: 0.35 })
      );
      rootGroup.add(wireGlobe);

      // Historical event coordinate markers
      const markerPositions = [
        { lat: 48, lon: 2, name: 'Western Front (Paris Basin)', color: 0xf43f5e },
        { lat: 43, lon: 18, name: 'Sarajevo (Balkans)', color: 0xfbbf24 },
        { lat: 55, lon: 37, name: 'Eastern Front (Moscow/Petrograd)', color: 0x38bdf8 },
        { lat: 50, lon: 4, name: 'Belgium Border Neutrality', color: 0xa855f7 },
      ];

      markerPositions.forEach((m) => {
        const phi = (90 - m.lat) * (Math.PI / 180);
        const theta = (m.lon + 180) * (Math.PI / 180);
        const x = -(3.75 * Math.sin(phi) * Math.cos(theta));
        const z = 3.75 * Math.sin(phi) * Math.sin(theta);
        const y = 3.75 * Math.cos(phi);

        const pin = new THREE.Mesh(
          new THREE.ConeGeometry(0.2, 0.6, 12),
          new THREE.MeshStandardMaterial({ color: m.color })
        );
        pin.position.set(x, y, z);
        pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z).normalize());
        pin.userData = { name: m.name, desc: `Key historical site for ${topic}` };
        rootGroup.add(pin);
      });
    } else if (sceneType === 'geometry') {
      // ─── 3D Right-Angle Triangle ─────────────────────────────────────────
      // Vertices: right angle at origin (bottom-left), base goes right, height goes up
      const A = new THREE.Vector3(-3.2, -2.2, 0); // right angle (90°)
      const B = new THREE.Vector3( 3.2, -2.2, 0); // bottom-right
      const C = new THREE.Vector3(-3.2,  2.4, 0); // top-left

      // Filled translucent triangle face (DoubleSide so it renders from camera)
      const faceGeo = new THREE.BufferGeometry();
      faceGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        A.x, A.y, A.z,
        B.x, B.y, B.z,
        C.x, C.y, C.z,
      ], 3));
      faceGeo.computeVertexNormals();
      const faceMat = new THREE.MeshStandardMaterial({
        color: 0x10b981, transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, roughness: 0.5,
      });
      rootGroup.add(new THREE.Mesh(faceGeo, faceMat));

      // Bold edge outline (3 sides)
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x34d399, linewidth: 2 });
      const edgeLoop = [A, B, C, A];
      rootGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgeLoop), edgeMat));

      // Hypotenuse highlighted in amber
      const hypMat = new THREE.LineBasicMaterial({ color: 0xfbbf24, linewidth: 3 });
      rootGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([B, C]), hypMat));

      // Right-angle square marker at A
      const sq = 0.55;
      const raMat = new THREE.LineBasicMaterial({ color: 0xfbbf24 });
      rootGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(A.x,      A.y + sq, 0),
        new THREE.Vector3(A.x + sq, A.y + sq, 0),
        new THREE.Vector3(A.x + sq, A.y,      0),
      ]), raMat));

      // Vertex glow dots
      const verts = [
        { pos: A, color: 0xfbbf24, label: '90° — Right Angle' },
        { pos: B, color: 0x38bdf8, label: 'Angle B' },
        { pos: C, color: 0xf43f5e, label: 'Angle A' },
      ];
      verts.forEach(v => {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 16, 16),
          new THREE.MeshStandardMaterial({ color: v.color, emissive: v.color, emissiveIntensity: 0.7 })
        );
        dot.position.copy(v.pos);
        dot.userData = { name: v.label, desc: v.label };
        rootGroup.add(dot);
      });

      // Dimension mid-point markers: a (base), b (height), c (hypotenuse)
      const dimDots = [
        { mid: new THREE.Vector3((A.x+B.x)/2, A.y - 0.5, 0), color: 0x86efac, label: 'a — Base' },
        { mid: new THREE.Vector3(A.x - 0.5, (A.y+C.y)/2, 0), color: 0x86efac, label: 'b — Height' },
        { mid: new THREE.Vector3((B.x+C.x)/2 + 0.3, (B.y+C.y)/2, 0), color: 0xfbbf24, label: 'c — Hypotenuse' },
      ];
      dimDots.forEach(d => {
        const dm = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 8, 8),
          new THREE.MeshStandardMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0.5 })
        );
        dm.position.copy(d.mid);
        dm.userData = { name: d.label, desc: d.label };
        rootGroup.add(dm);
      });

      // Subtle orbit ring for depth perception
      rootGroup.add(new THREE.Mesh(
        new THREE.TorusGeometry(4.8, 0.04, 12, 64),
        new THREE.MeshBasicMaterial({ color: 0x1f4e33, transparent: true, opacity: 0.5 })
      ));

    } else {
      // Neural Network / Concept Matrix
      const nodeCount = 14;
      const nodes: THREE.Mesh[] = [];
      const nodePositions: THREE.Vector3[] = [];

      for (let i = 0; i < nodeCount; i++) {
        const pos = new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 6
        );
        nodePositions.push(pos);

        const node = new THREE.Mesh(
          new THREE.SphereGeometry(0.35, 16, 16),
          new THREE.MeshStandardMaterial({
            color: i % 3 === 0 ? 0xfbbf24 : i % 3 === 1 ? 0x38bdf8 : 0x34d399,
            roughness: 0.3,
          })
        );
        node.position.copy(pos);
        rootGroup.add(node);
        nodes.push(node);
      }

      // Interconnect nearby nodes with lines
      const lineMat = new THREE.LineBasicMaterial({ color: 0x2e7952, transparent: true, opacity: 0.7 });
      for (let i = 0; i < nodeCount; i++) {
        for (let j = i + 1; j < nodeCount; j++) {
          if (nodePositions[i].distanceTo(nodePositions[j]) < 4.2) {
            const lineGeo = new THREE.BufferGeometry().setFromPoints([nodePositions[i], nodePositions[j]]);
            const line = new THREE.Line(lineGeo, lineMat);
            rootGroup.add(line);
          }
        }
      }
    }

    // 6. Animation loop
    let clock = new THREE.Clock();

    const animate = () => {
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Inertial spin
      if (groupRef.current) {
        if (isRotating && !isDraggingRef.current) {
          groupRef.current.rotation.y += delta * 0.35;
          groupRef.current.rotation.x += delta * 0.08;
        } else if (!isDraggingRef.current) {
          // Slow down inertia
          groupRef.current.rotation.y += rotVelRef.current.x;
          groupRef.current.rotation.x += rotVelRef.current.y;
          rotVelRef.current.x *= 0.95;
          rotVelRef.current.y *= 0.95;
        }

        // Specific sub-animations (e.g. orbiting bodies)
        if (sceneType === 'orbit') {
          groupRef.current.children.forEach((child) => {
            if (child instanceof THREE.Mesh && child.userData.speed) {
              const theta = time * child.userData.speed;
              child.position.x = Math.cos(theta) * child.userData.radius;
              child.position.z = Math.sin(theta) * child.userData.radius;
            }
          });
        }
      }

      dustParticles.rotation.y = time * 0.03;

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    // 7. Mouse and Touch Interaction Handlers
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      prevMousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !groupRef.current) return;
      const dx = e.clientX - prevMousePosRef.current.x;
      const dy = e.clientY - prevMousePosRef.current.y;

      groupRef.current.rotation.y += dx * 0.008;
      groupRef.current.rotation.x += dy * 0.008;

      rotVelRef.current = { x: dx * 0.003, y: dy * 0.003 };
      prevMousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current) return;
      cameraRef.current.position.z = THREE.MathUtils.clamp(
        cameraRef.current.position.z + e.deltaY * 0.012,
        4,
        28
      );
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newW = entry.contentRect.width;
        const newH = entry.contentRect.height;
        if (newW > 0 && newH > 0 && cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = newW / newH;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(newW, newH);
        }
      }
    });
    resizeObserver.observe(container);

    // Cleanup
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      renderer.dispose();
    };
  }, [topic, sceneData]);

  // Wireframe toggle
  const toggleWireframe = () => {
    setWireframe((prev) => {
      const next = !prev;
      if (groupRef.current) {
        groupRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => (m.wireframe = next));
            } else {
              child.material.wireframe = next;
            }
          }
        });
      }
      return next;
    });
  };

  // Reset Camera
  const resetCamera = () => {
    if (cameraRef.current && groupRef.current) {
      cameraRef.current.position.set(0, 5, 14);
      cameraRef.current.lookAt(0, 0, 0);
      groupRef.current.rotation.set(0, 0, 0);
      rotVelRef.current = { x: 0, y: 0 };
    }
  };

  const sceneType = getSceneType();

  return (
    <div className="w-full h-full flex flex-col relative bg-[#04140b] select-none">
      {/* 3D Canvas Viewport */}
      <div
        ref={containerRef}
        className="w-full flex-1 cursor-grab active:cursor-grabbing relative overflow-hidden"
      />

      {/* Floating 3D Title & Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 max-w-sm pointer-events-none">
        <div className="px-3.5 py-2 rounded-2xl bg-[#092215]/90 border border-[#23583a] backdrop-blur-md shadow-xl pointer-events-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="text-sm font-bold text-white font-serif tracking-wide">
              {sceneData?.title || `3D Spatial Model: ${topic}`}
            </h3>
          </div>
          <p className="text-[11px] text-[#9fc7b1] leading-relaxed">
            {sceneData?.description ||
              `Interactive 3D real-time simulation for ${topic}. Drag with mouse to orbit 360°, scroll to zoom.`}
          </p>
        </div>

        {/* Scene Type Tag */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="px-2.5 py-1 rounded-lg bg-[#0e2a1b] border border-[#1f4e34] text-[10px] text-amber-300 font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Mode: {sceneType.toUpperCase()} 3D</span>
          </span>
          <span className="text-[10px] text-[#719d85]">Click &amp; drag to inspect</span>
        </div>
      </div>

      {/* Viewport Action Controls (Bottom Left) */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 bg-[#092215]/90 border border-[#215337] p-1.5 rounded-2xl backdrop-blur-md shadow-lg">
        <button
          onClick={() => setIsRotating(!isRotating)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
            isRotating
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'bg-[#0f2c1c] text-[#8cbda0] hover:text-white'
          }`}
          title="Toggle Auto-Rotation"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
          <span>{isRotating ? 'Auto-Rotate ON' : 'Rotate Paused'}</span>
        </button>

        <button
          onClick={toggleWireframe}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
            wireframe
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-[#0f2c1c] text-[#8cbda0] hover:text-white'
          }`}
          title="Toggle Wireframe Mode"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>{wireframe ? 'Wireframe ON' : 'Solid Mesh'}</span>
        </button>

        <button
          onClick={resetCamera}
          className="p-1.5 rounded-xl bg-[#0f2c1c] hover:bg-[#163d27] text-[#8cbda0] hover:text-white transition-colors cursor-pointer"
          title="Reset Camera View"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>

      {/* Detail inspect callout if user clicked an element */}
      {activeElement && (
        <div className="absolute bottom-4 right-4 z-10 max-w-xs p-3.5 rounded-2xl bg-[#0a2718] border-2 border-emerald-400/60 shadow-2xl animate-fadeIn text-[#e7f5ed]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-amber-300">{activeElement.name}</span>
            <button
              onClick={() => setActiveElement(null)}
              className="text-xs text-[#7bb094] hover:text-white cursor-pointer"
            >
              &times;
            </button>
          </div>
          <p className="text-[11px] text-[#b3d7c3]">{activeElement.description}</p>
        </div>
      )}
    </div>
  );
};
