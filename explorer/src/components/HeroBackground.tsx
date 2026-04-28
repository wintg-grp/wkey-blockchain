"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * HeroBackground — a slow-moving 3D particle network rendered behind the hero.
 *
 * - Two layers of particles (foreground bright orange, background dim purple-ink)
 * - Subtle float animation, mouse-driven camera parallax
 * - Lazy-rendered: parent imports it via `next/dynamic` with ssr:false
 */

function ParticleField({
  count,
  color,
  size,
  spread,
  speed,
}: {
  count: number;
  color: string;
  size: number;
  spread: number;
  speed: number;
}) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * spread;
      arr[i * 3 + 1] = (Math.random() - 0.5) * spread;
      arr[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }
    return arr;
  }, [count, spread]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    ref.current.rotation.x = Math.sin(t * speed * 0.1) * 0.05;
    ref.current.rotation.y = t * speed * 0.03;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={positions.length / 3}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color={color}
        sizeAttenuation
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function NetworkMesh() {
  const ref = useRef<THREE.LineSegments>(null);

  // Build a low-poly icosahedron wireframe and recolor its edges with WINTG orange.
  const geometry = useMemo(() => {
    const ico = new THREE.IcosahedronGeometry(2.6, 1);
    const edges = new THREE.EdgesGeometry(ico);
    return edges;
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    ref.current.rotation.x = t * 0.07;
    ref.current.rotation.y = t * 0.12;
  });

  return (
    <lineSegments ref={ref} geometry={geometry}>
      <lineBasicMaterial color="#FF6A1A" transparent opacity={0.55} />
    </lineSegments>
  );
}

function GlowCore() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    const s = 1 + Math.sin(t * 1.5) * 0.04;
    ref.current.scale.set(s, s, s);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.55, 32, 32]} />
      <meshBasicMaterial color="#FF6A1A" transparent opacity={0.18} />
    </mesh>
  );
}

export default function HeroBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10"
      aria-hidden="true"
    >
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 6], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} color="#FF6A1A" intensity={1.5} />

        <NetworkMesh />
        <GlowCore />

        {/* Bright foreground particles */}
        <ParticleField
          count={350}
          color="#FF6A1A"
          size={0.045}
          spread={9}
          speed={1}
        />
        {/* Dim background particles */}
        <ParticleField
          count={1200}
          color="#7C8095"
          size={0.025}
          spread={18}
          speed={0.4}
        />
      </Canvas>

      {/* Vertical fade so the scene doesn't compete with content */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent via-ink-950/60 to-ink-950" />
    </div>
  );
}
