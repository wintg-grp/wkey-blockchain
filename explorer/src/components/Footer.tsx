import Link from "next/link";

const ICONS = {
  twitter: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M18.244 2H21l-6.539 7.473L22 22h-6.844l-5.36-7.012L3.6 22H1l7.005-8.005L1.5 2h7.014l4.85 6.413L18.244 2zm-2.396 18h1.79L7.91 4h-1.93l9.868 16z" />
    </svg>
  ),
  discord: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M19.27 5.33A19 19 0 0014.55 4l-.21.43a17 17 0 014.27 2.16 14.4 14.4 0 00-12.4-.16A17 17 0 019.66 4.4L9.41 4a19 19 0 00-4.7 1.34A20.1 20.1 0 002 17a18 18 0 005.5 2.78l.94-1.45a11 11 0 01-1.74-.84l.43-.34a13.7 13.7 0 0011.74 0c.14.12.29.23.43.34a11 11 0 01-1.74.84l.94 1.45A18 18 0 0022 17a20.1 20.1 0 00-2.73-11.67zM9.5 14.5a1.85 1.85 0 110-3.7 1.85 1.85 0 010 3.7zm5 0a1.85 1.85 0 110-3.7 1.85 1.85 0 010 3.7z" />
    </svg>
  ),
  telegram: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M21.94 4.6a1.5 1.5 0 00-2.04-1.4L2.74 9.95a1.5 1.5 0 00.07 2.83l4.36 1.43 1.7 5.4a1 1 0 001.7.36l2.55-2.7 4.4 3.21a1.5 1.5 0 002.36-.9l1.97-13.98zm-5.7 4.06l-7.31 6.7-.28 3.04-1.45-4.6 9.04-5.14z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M12 .5a12 12 0 00-3.79 23.4c.6.11.82-.27.82-.59v-2.07c-3.34.73-4.04-1.6-4.04-1.6-.55-1.4-1.34-1.77-1.34-1.77-1.1-.75.08-.74.08-.74 1.21.09 1.85 1.25 1.85 1.25 1.08 1.84 2.83 1.31 3.52 1 .11-.78.42-1.31.77-1.61-2.66-.3-5.46-1.33-5.46-5.92 0-1.31.47-2.38 1.24-3.21-.13-.3-.54-1.52.11-3.17 0 0 1.01-.32 3.3 1.22a11.45 11.45 0 016 0c2.29-1.54 3.3-1.22 3.3-1.22.65 1.65.24 2.87.12 3.17.77.83 1.24 1.9 1.24 3.21 0 4.6-2.81 5.61-5.49 5.91.43.37.81 1.1.81 2.21v3.27c0 .32.22.7.83.59A12 12 0 0012 .5z" />
    </svg>
  ),
};

type SocialKey = keyof typeof ICONS;

const SOCIALS: { key: SocialKey; envVar: string; label: string; href?: string }[] = [
  { key: "twitter", envVar: "NEXT_PUBLIC_TWITTER_URL", label: "Twitter" },
  { key: "discord", envVar: "NEXT_PUBLIC_DISCORD_URL", label: "Discord" },
  { key: "telegram", envVar: "NEXT_PUBLIC_TELEGRAM_URL", label: "Telegram" },
  { key: "github", envVar: "NEXT_PUBLIC_GITHUB_URL", label: "GitHub" },
];

function getSocials() {
  return SOCIALS.map((s) => ({
    ...s,
    href: process.env[s.envVar],
  })).filter((s) => !!s.href);
}

export function Footer() {
  const socials = getSocials();
  const docUrl = process.env.NEXT_PUBLIC_DOC_URL ?? "https://doc.wintg.network";
  const ghUrl = process.env.NEXT_PUBLIC_GITHUB_URL ?? "";

  return (
    <footer className="mt-24 border-t border-ink-800/80 bg-ink-950/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="text-white font-bold text-lg">WINTG Scan</div>
            <p className="mt-2 text-sm text-ink-300 max-w-md leading-relaxed">
              The official block explorer for the WINTG L1 chain — built for builders,
              traders and validators across Africa and the broader UEMOA region.
            </p>
            <div className="mt-4 flex items-center gap-2.5">
              {socials.map((s) => (
                <a
                  key={s.key}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="grid place-items-center w-9 h-9 rounded-full bg-ink-800 text-ink-200 hover:bg-wintg-500 hover:text-white transition-colors focus-ring"
                >
                  {ICONS[s.key]}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-3">
              Network
            </h3>
            <ul className="space-y-2 text-sm text-ink-300">
              <li>
                <Link href="/?net=mainnet" className="hover:text-white transition-colors">
                  Mainnet (chain 2280)
                </Link>
              </li>
              <li>
                <Link href="/?net=testnet" className="hover:text-white transition-colors">
                  Testnet (chain 22800)
                </Link>
              </li>
              <li>
                <a
                  href="https://rpc.wintg.network"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  RPC endpoint
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-3">
              Resources
            </h3>
            <ul className="space-y-2 text-sm text-ink-300">
              <li>
                <a href={docUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  Documentation
                </a>
              </li>
              {ghUrl && (
                <li>
                  <a href={ghUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                    Source code
                  </a>
                </li>
              )}
              <li>
                <a href="mailto:contact@wintg.group" className="hover:text-white transition-colors">
                  contact@wintg.group
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-ink-800/60 flex flex-col sm:flex-row justify-between gap-3 text-xs text-ink-400">
          <span>© {new Date().getFullYear()} WINTG Group · Apache-2.0</span>
          <span>
            Powered by <span className="text-wintg-500 font-semibold">WINTG Chain</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
