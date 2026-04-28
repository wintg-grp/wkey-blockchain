"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/**
 * Subtle, theme-aware 3D backdrop for the hero. Renders a slowly rotating
 * orange wireframe + faint particle field. We deliberately keep it small
 * and low-contrast so it never competes with the big headline typography.
 */

function NetworkMesh({ tone }: { tone: number }) {
  const ref = useRef<THREE.LineSegments>(null);
  const geometry = useMemo(() => {
    const ico = new THREE.IcosahedronGeometry(2.4, 1);
    return new THREE.EdgesGeometry(ico);
  }, []);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    ref.current.rotation.x = t * 0.05;
    ref.current.rotation.y = t * 0.09;
  });
  return (
    <lineSegments ref={ref} geometry={geometry}>
      <lineBasicMaterial color="#FF6A1A" transparent opacity={tone} />
    </lineSegments>
  );
}

function Particles({ count, color, opacity }: { count: number; color: string; opacity: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * 12;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 12;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    return arr;
  }, [count]);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.getElapsedTime() * 0.04;
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
        size={0.04}
        color={color}
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function HeroBackground() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const update = () => {
      setIsDark(document.documentElement.dataset.theme === "dark");
    };
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  // Brand orange feels great on either theme; we just dial intensity for light.
  const tone = isDark ? 0.55 : 0.35;
  const particleColor = isDark ? "#FF6A1A" : "#FF7E2D";
  const particleOpacity = isDark ? 0.85 : 0.4;

  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 6], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.5} />
        <NetworkMesh tone={tone} />
        <Particles count={300} color={particleColor} opacity={particleOpacity} />
      </Canvas>

      {/* Soften the bottom so content takes priority */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}
