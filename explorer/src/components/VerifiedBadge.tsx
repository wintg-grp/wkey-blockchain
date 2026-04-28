"use client";

/**
 * VerifiedBadge
 * -------------
 * Small inline icon used next to token / NFT / address labels.
 *
 * - tone="gold"     → WINTG-verified token (audited, listed officially)
 * - tone="blue"     → WINTG-created token (factory-minted, ownership proven)
 * - tone="muted"    → not yet verified
 *
 * Hover the badge for a tooltip explaining what the colour means.
 */
export type VerifiedTone = "gold" | "blue" | "muted";

interface Props {
  tone?: VerifiedTone;
  size?: number;
  title?: string;
}

const COLORS: Record<VerifiedTone, { fg: string; bg: string; ring: string; label: { fr: string; en: string } }> = {
  gold:  { fg: "#FFFFFF", bg: "#E0A82E", ring: "#FFE5A0", label: { fr: "Vérifié WINTG",  en: "WINTG verified"  } },
  blue:  { fg: "#FFFFFF", bg: "#3B82F6", ring: "#BFDBFE", label: { fr: "Créé via WINTG", en: "Created via WINTG" } },
  muted: { fg: "#FFFFFF", bg: "#9CA3AF", ring: "#E5E7EB", label: { fr: "Non vérifié",     en: "Not verified"     } },
};

export function VerifiedBadge({ tone = "gold", size = 14, title }: Props) {
  const c = COLORS[tone];
  return (
    <span
      title={title ?? c.label.en}
      aria-label={title ?? c.label.en}
      className="inline-flex items-center justify-center align-middle"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path
          d="M12 2 14.5 4.5 18 4 18.5 7.5 22 9 20.5 12 22 15 18.5 16.5 18 20 14.5 19.5 12 22 9.5 19.5 6 20 5.5 16.5 2 15 3.5 12 2 9 5.5 7.5 6 4 9.5 4.5z"
          fill={c.bg}
          stroke={c.ring}
          strokeWidth="0.6"
        />
        <path
          d="M8 12.5 11 15.5 16.5 9.5"
          stroke={c.fg}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
