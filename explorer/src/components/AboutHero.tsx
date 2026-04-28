/**
 * AboutHero — animated logo + coin orbits.
 * Pure SVG/CSS — no real images needed. The center is the WINTG mark, the
 * orbiting elements are stylised coin/token glyphs to symbolise the chain.
 */
export function AboutHero() {
  return (
    <div className="relative w-full max-w-[520px] mx-auto aspect-square">
      {/* Outer ring */}
      <div className="absolute inset-0 rounded-full border border-border" />
      <div className="absolute inset-[6%] rounded-full border border-border/70" />
      <div className="absolute inset-[14%] rounded-full border border-border/40" />

      {/* Center logo */}
      <div className="absolute inset-[28%] rounded-full bg-wintg-gradient grid place-items-center shadow-glow-lg">
        <span
          className="font-display text-accent-fg leading-none"
          style={{ fontSize: "clamp(48px, 14vw, 140px)" }}
        >
          W
        </span>
      </div>

      {/* Subtle pulse halo */}
      <div className="absolute inset-[28%] rounded-full bg-accent/30 blur-3xl animate-soft-pulse -z-10" />

      {/* Orbits — each piece animates with a different period for organic feel */}
      <Orbit duration={28} radius={47} startAngle={0}><Coin label="WTG" /></Orbit>
      <Orbit duration={36} radius={47} startAngle={120}><Coin label="₿" /></Orbit>
      <Orbit duration={44} radius={47} startAngle={240}><Coin label="Ξ" /></Orbit>
      <Orbit duration={52} radius={36} startAngle={60}><Coin label="$" small /></Orbit>
      <Orbit duration={60} radius={36} startAngle={180}><Coin label="◎" small /></Orbit>
      <Orbit duration={68} radius={36} startAngle={300}><Coin label="✦" small /></Orbit>
    </div>
  );
}

function Orbit({
  children,
  duration,
  radius,
  startAngle,
}: {
  children: React.ReactNode;
  duration: number;
  radius: number;
  startAngle: number;
}) {
  return (
    <div
      className="absolute inset-0 grid place-items-center"
      style={{
        animation: `aboutOrbit ${duration}s linear infinite`,
        transform: `rotate(${startAngle}deg)`,
      }}
    >
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) translate(${radius}%, 0) rotate(-${startAngle}deg)`,
        }}
      >
        <div style={{ animation: `aboutOrbit ${duration}s linear infinite reverse` }}>
          {children}
        </div>
      </div>

      <style jsx>{`
        @keyframes aboutOrbit {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function Coin({ label, small = false }: { label: string; small?: boolean }) {
  const size = small ? "w-12 h-12 text-xl" : "w-16 h-16 text-3xl";
  return (
    <div
      className={`${size} rounded-full bg-surface border border-border shadow-flat grid place-items-center font-display tracking-tight-display text-text`}
    >
      {label}
    </div>
  );
}
