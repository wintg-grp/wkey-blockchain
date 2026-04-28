"use client";

/**
 * AboutCards
 * ----------
 * 4 separate stylised cards that tell the WINTG story visually.
 *
 * 1. ChainArchitectureCard — animated SVG inspired by CPU-architecture
 *    diagrams. Shows the WINTG core with traces lighting up in sequence.
 * 2. WorkflowCard           — three connected nodes (Block → Validator →
 *    Treasury) representing the WINTG pipeline.
 * 3. AwardCard              — Product-Hunt-style award badge with a
 *    glossy reflective overlay.
 * 4. MascotCard             — a stylised mascot with rotating glyphs.
 *
 * All four are pure SVG/CSS, no external assets required.
 */

import { useEffect, useState } from "react";

export function AboutCards() {
  return (
    <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
      <ChainArchitectureCard />
      <WorkflowCard />
      <AwardCard />
      <MascotCard />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ChainArchitectureCard() {
  return (
    <article className="card p-5 sm:p-6 overflow-hidden">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="pill bg-accent/12 text-accent">Architecture</span>
        <span className="text-[10px] uppercase tracking-wider text-text-muted">Live</span>
      </div>
      <h3 className="font-display text-2xl text-text">WINTG core</h3>
      <p className="text-xs text-text-muted mt-1">
        IBFT 2.0 · 1 s blocks · 100 M gas
      </p>

      <div className="mt-4 rounded-2xl bg-surface-2 border border-border overflow-hidden aspect-[4/3]">
        <svg viewBox="0 0 200 150" className="w-full h-full text-text-muted">
          {/* Traces */}
          <g stroke="currentColor" fill="none" strokeWidth="0.6" strokeDasharray="100 100" pathLength="100">
            <path d="M 10 30 h 70 q 5 0 5 5 v 40" pathLength="100">
              <animate attributeName="stroke-dashoffset" from="100" to="0" dur="1.5s" fill="freeze" />
            </path>
            <path d="M 190 25 h -70 q -5 0 -5 5 v 35" pathLength="100">
              <animate attributeName="stroke-dashoffset" from="100" to="0" dur="1.7s" fill="freeze" />
            </path>
            <path d="M 30 130 h 60 q 5 0 5 -5 v -25" pathLength="100">
              <animate attributeName="stroke-dashoffset" from="100" to="0" dur="1.9s" fill="freeze" />
            </path>
            <path d="M 170 130 h -60 q -5 0 -5 -5 v -25" pathLength="100">
              <animate attributeName="stroke-dashoffset" from="100" to="0" dur="2.1s" fill="freeze" />
            </path>
          </g>

          {/* Pulses along traces */}
          <circle r="2" fill="#FF6A1A">
            <animateMotion dur="3s" repeatCount="indefinite" path="M 10 30 h 70 q 5 0 5 5 v 40" />
          </circle>
          <circle r="2" fill="#FF6A1A">
            <animateMotion dur="3.5s" repeatCount="indefinite" begin="0.5s" path="M 190 25 h -70 q -5 0 -5 5 v 35" />
          </circle>
          <circle r="2" fill="#FF6A1A">
            <animateMotion dur="3.2s" repeatCount="indefinite" begin="1s" path="M 30 130 h 60 q 5 0 5 -5 v -25" />
          </circle>

          {/* Endpoints */}
          {[[10, 30], [190, 25], [30, 130], [170, 130]].map(([cx, cy], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r="3" fill="rgb(var(--color-surface))" stroke="currentColor" strokeWidth="0.8" />
              <circle cx={cx} cy={cy} r="1.5" fill="#FF6A1A" />
            </g>
          ))}

          {/* Core chip */}
          <g>
            <rect x="80" y="60" width="40" height="30" rx="4" fill="rgb(var(--color-inverse))" />
            <text
              x="100"
              y="79"
              fontSize="9"
              fontFamily="Anton, Inter, sans-serif"
              fontWeight="800"
              textAnchor="middle"
              fill="#FF6A1A"
            >
              WINTG
            </text>
            {/* Pin marks */}
            {[88, 96, 104, 112].map((x) => (
              <rect key={x} x={x} y="56" width="2" height="4" rx="0.5" fill="rgb(var(--color-text-muted))" />
            ))}
            {[88, 96, 104, 112].map((x) => (
              <rect key={x + "b"} x={x} y="90" width="2" height="4" rx="0.5" fill="rgb(var(--color-text-muted))" />
            ))}
          </g>
        </svg>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {["EVM", "IBFT 2.0", "Permissionless"].map((tag) => (
          <span key={tag} className="text-[10px] uppercase tracking-wider text-text-muted bg-surface-2 rounded-full py-1.5">
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function WorkflowCard() {
  const nodes = [
    { id: "tx",    label: "TX",        sub: "user",       color: "from-emerald-400 to-emerald-200", x: 18 },
    { id: "blk",   label: "BLOCK",     sub: "1 s seal",   color: "from-blue-400 to-blue-200",       x: 50 },
    { id: "val",   label: "VALIDATOR", sub: "IBFT vote",  color: "from-amber-400 to-amber-200",     x: 82 },
  ];
  return (
    <article className="card-inverse p-5 sm:p-6 overflow-hidden">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="pill bg-accent text-accent-fg">Pipeline</span>
        <span className="text-[10px] uppercase tracking-wider opacity-70">Real-time</span>
      </div>
      <h3 className="font-display text-2xl">How a tx flows</h3>
      <p className="text-xs opacity-70 mt-1">
        From wallet to finalised block in under a second.
      </p>

      <div className="mt-6 relative aspect-[4/3] rounded-2xl bg-inverse-fg/5 border border-inverse-fg/10 p-4">
        <svg viewBox="0 0 100 60" className="absolute inset-4 w-[calc(100%-2rem)] h-[calc(100%-2rem)] pointer-events-none" preserveAspectRatio="none">
          <line x1="18" y1="50" x2="50" y2="50" stroke="rgba(255,106,26,0.6)" strokeWidth="0.6" strokeDasharray="2 2" />
          <line x1="50" y1="50" x2="82" y2="50" stroke="rgba(255,106,26,0.6)" strokeWidth="0.6" strokeDasharray="2 2" />
          <circle r="0.8" fill="#FF6A1A">
            <animateMotion dur="2.5s" repeatCount="indefinite" path="M 18 50 L 82 50" />
          </circle>
        </svg>

        <div className="grid grid-cols-3 gap-2 sm:gap-4 h-full content-end">
          {nodes.map((n) => (
            <div
              key={n.id}
              className={`rounded-2xl bg-gradient-to-br ${n.color} p-3 text-ink-900 shadow-flat`}
            >
              <div className="text-[9px] uppercase tracking-wider opacity-80">{n.sub}</div>
              <div className="font-display text-xl mt-1 leading-none">{n.label}</div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function AwardCard() {
  return (
    <article className="rounded-3xl p-5 sm:p-6 overflow-hidden bg-wintg-gradient text-accent-fg">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="pill bg-accent-fg/15 text-accent-fg">Award</span>
        <span className="text-[10px] uppercase tracking-wider opacity-80">2026</span>
      </div>
      <h3 className="font-display text-2xl">Builders' choice</h3>
      <p className="text-xs opacity-90 mt-1">
        Recognised by the WINTG developer community.
      </p>

      <div className="mt-5 relative aspect-[4/3] rounded-2xl border-2 border-accent-fg/40 grid place-items-center overflow-hidden">
        <ShineSweep />

        <div className="text-center">
          <svg viewBox="0 0 64 64" className="w-16 h-16 mx-auto" aria-hidden="true">
            <defs>
              <linearGradient id="trophy-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFE5D0" />
                <stop offset="100%" stopColor="#FFDDC3" />
              </linearGradient>
            </defs>
            <path d="M16 8h32v18a16 16 0 01-16 16h0a16 16 0 01-16-16V8z" fill="url(#trophy-grad)" />
            <rect x="22" y="44" width="20" height="6" rx="2" fill="#FFE5D0" />
            <rect x="18" y="50" width="28" height="6" rx="2" fill="#FFDDC3" />
            <path d="M16 14H8a4 4 0 004 4h4M48 14h8a4 4 0 01-4 4h-4" stroke="#FFE5D0" strokeWidth="2" fill="none" />
            <text x="32" y="32" textAnchor="middle" fontSize="14" fontWeight="700" fill="#0A0B12" fontFamily="Anton, sans-serif">W</text>
          </svg>
          <div className="mt-3 font-display text-xl uppercase tracking-tight-display">
            #1 chain builder
          </div>
          <div className="text-[10px] opacity-80 uppercase tracking-wider">UEMOA · 2026</div>
        </div>
      </div>
    </article>
  );
}

function ShineSweep() {
  // simple diagonal gradient that loops to mimic an award-badge sheen
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent"
        style={{ animation: "awardShine 4s linear infinite" }}
      />
      <style jsx>{`
        @keyframes awardShine {
          0%   { transform: translateX(-50%); }
          100% { transform: translateX(450%); }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function MascotCard() {
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const card = document.getElementById("wintg-mascot-card");
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const max = 3;
      const scale = Math.min(1, Math.hypot(dx, dy) / 320);
      setEyeOffset({
        x: Math.max(-max, Math.min(max, (dx / 60) * scale)),
        y: Math.max(-max, Math.min(max, (dy / 60) * scale)),
      });
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <article id="wintg-mascot-card" className="card p-5 sm:p-6 overflow-hidden relative">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="pill bg-accent/12 text-accent">Mascotte</span>
        <span className="text-[10px] uppercase tracking-wider text-text-muted">Beta</span>
      </div>
      <h3 className="font-display text-2xl text-text">Whobee</h3>
      <p className="text-xs text-text-muted mt-1">
        Notre guide curieux qui suit votre pointeur.
      </p>

      <div className="mt-5 relative aspect-[4/3] rounded-2xl bg-wintg-gradient grid place-items-center overflow-hidden">
        {/* Stars */}
        <div className="absolute inset-0">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="absolute w-1 h-1 rounded-full bg-white/60"
              style={{
                left: `${(i * 37) % 100}%`,
                top:  `${(i * 53) % 100}%`,
                opacity: 0.3 + ((i * 17) % 60) / 100,
              }}
            />
          ))}
        </div>

        {/* The mascot */}
        <svg viewBox="0 0 100 100" className="relative w-2/3 h-2/3">
          {/* Body */}
          <ellipse cx="50" cy="62" rx="32" ry="28" fill="rgb(var(--color-inverse))" />
          <ellipse cx="50" cy="58" rx="34" ry="30" fill="none" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="0.5" />

          {/* Head */}
          <circle cx="50" cy="38" r="22" fill="rgb(var(--color-inverse))" />

          {/* Eyes */}
          <g>
            <circle cx="42" cy="38" r="6" fill="#FFFFFF" />
            <circle cx="58" cy="38" r="6" fill="#FFFFFF" />
            <circle cx={42 + eyeOffset.x} cy={38 + eyeOffset.y} r="2.5" fill="#0A0B12" style={{ transition: "all 0.08s ease-out" }} />
            <circle cx={58 + eyeOffset.x} cy={38 + eyeOffset.y} r="2.5" fill="#0A0B12" style={{ transition: "all 0.08s ease-out" }} />
          </g>

          {/* Antenna with W */}
          <line x1="50" y1="16" x2="50" y2="6" stroke="#FFFFFF" strokeWidth="1" />
          <circle cx="50" cy="5" r="3" fill="#FFFFFF" />
          <text x="50" y="7.3" textAnchor="middle" fontSize="3.5" fontWeight="700" fill="#FF6A1A" fontFamily="Anton, sans-serif">W</text>

          {/* Smile */}
          <path d="M 42 50 Q 50 56 58 50" stroke="#FFFFFF" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    </article>
  );
}
