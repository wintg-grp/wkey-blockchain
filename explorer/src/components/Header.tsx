"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { MegaMenu, type MegaItem } from "./MegaMenu";
import { SettingsMenu } from "./SettingsMenu";
import { useSettings } from "@/lib/settings";
import type { NetworkKey } from "@/lib/networks";

export function Header({ network }: { network: NetworkKey }) {
  const { t } = useSettings();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const tools: MegaItem[] = [
    { label: t.tools.inputDataDecoder, href: "/tools/decode" },
    { label: t.tools.inputDataEncoder, href: "/tools/encode" },
    { label: t.tools.unitConverter,    href: "/tools/units" },
    { label: t.tools.csvExport,        href: "/tools/csv" },
    { label: t.tools.balanceChecker,   href: "/tools/balance-checker" },
  ];
  const explore: MegaItem[] = [
    { label: t.explore.gasTracker,    href: "/gas-tracker" },
    { label: t.explore.dexTracker,    href: "/dex-tracker" },
    { label: t.explore.nodeTracker,   href: "/node-tracker" },
    { label: t.explore.labelCloud,    href: "/labels" },
    { label: t.explore.domainLookup,  href: "/domains" },
  ];
  const services: MegaItem[][] = [
    [
      { label: t.services.tokenApprovals,  href: "/services/token-approvals" },
      { label: t.services.verifiedSig,     href: "/services/verified-signatures" },
      { label: t.services.inputMessages,   href: "/services/input-messages" },
      { label: t.services.advancedFilter,  href: "/services/advanced-filter" },
      { label: t.services.chat,            href: "/services/chat" },
    ],
    [
      { label: t.services.apiPlans, href: "/api-plans" },
      { label: t.services.apiDocs,  href: "https://doc.wintg.network" },
    ],
    [
      { label: t.services.codeReader,       href: "/services/code-reader" },
      { label: t.services.verifyContract,   href: "/services/verify-contract" },
      { label: t.services.similarContract,  href: "/services/similar-contract" },
      { label: t.services.contractSearch,   href: "/services/contract-search" },
      { label: t.services.contractDiff,     href: "/services/contract-diff" },
      { label: t.services.vyperCompiler,    href: "/services/vyper-compiler" },
      { label: t.services.bytecodeOpcode,   href: "/services/bytecode-opcode" },
      { label: t.services.broadcastTx,      href: "/services/broadcast-tx" },
    ],
    [
      { label: t.services.chartsStats,    href: "/charts" },
      { label: t.services.leaderboard,    href: "/leaderboard" },
      { label: t.services.directory,      href: "/directory" },
      { label: t.services.newsletter,     href: "/newsletter" },
      { label: t.services.knowledgeBase,  href: "/knowledge-base" },
    ],
  ];

  return (
    <div className="sticky top-0 z-30 px-3 sm:px-4 pt-3 sm:pt-4">
      <header
        className={`max-w-[1400px] mx-auto rounded-2xl sm:rounded-[28px] border border-border transition-all
          ${scrolled
            ? "bg-bg/85 backdrop-blur-md shadow-flat"
            : "bg-surface/70 backdrop-blur-sm"}
        `}
      >
        <div className="px-3 sm:px-5 py-3 flex items-center gap-3 relative">
          <Logo />

          <nav className="hidden lg:flex items-center gap-0.5 ml-2">
            <Link href="/blocks" className="px-3 py-2 text-sm font-semibold text-text hover:bg-surface-2 rounded-xl transition-colors focus-ring">
              {t.nav.blocks}
            </Link>
            <Link href="/txs" className="px-3 py-2 text-sm font-semibold text-text hover:bg-surface-2 rounded-xl transition-colors focus-ring">
              {t.nav.txs}
            </Link>
            <Link href="/tokens" className="px-3 py-2 text-sm font-semibold text-text hover:bg-surface-2 rounded-xl transition-colors focus-ring">
              {t.nav.tokens}
            </Link>
            <Link href="/nfts" className="px-3 py-2 text-sm font-semibold text-text hover:bg-surface-2 rounded-xl transition-colors focus-ring">
              {t.nav.nfts}
            </Link>
            <MegaMenu label={t.nav.tools}    groups={[{ items: tools }]} />
            <MegaMenu label={t.nav.explore}  groups={[{ items: explore }]} />
            <MegaMenu label={t.nav.services} groups={services.map((items) => ({ items }))} />
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <NetworkSwitcher current={network} />
            <SettingsMenu />

            <ConnectWalletButton />

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-surface-2 transition-colors focus-ring"
              aria-label="Menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom-sheet menu */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-full max-h-[85vh] bg-bg rounded-t-3xl border-t border-border overflow-y-auto animate-fade-in-up">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-text-faint rounded-full" />
            </div>

            <div className="flex items-center justify-between px-5 pb-3">
              <Logo />
              <button onClick={() => setMobileOpen(false)} className="p-2 rounded-xl hover:bg-surface-2" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="px-5 pb-2">
              <ConnectWalletButton fullWidth />
            </div>

            <div className="px-3 pb-6">
              <MobileLink href="/blocks"  onClick={() => setMobileOpen(false)}>{t.nav.blocks}</MobileLink>
              <MobileLink href="/txs"     onClick={() => setMobileOpen(false)}>{t.nav.txs}</MobileLink>
              <MobileLink href="/tokens"  onClick={() => setMobileOpen(false)}>{t.nav.tokens}</MobileLink>
              <MobileLink href="/nfts"    onClick={() => setMobileOpen(false)}>{t.nav.nfts}</MobileLink>
              <MobileSection title={t.nav.tools}    items={tools}            onClose={() => setMobileOpen(false)} />
              <MobileSection title={t.nav.explore}  items={explore}          onClose={() => setMobileOpen(false)} />
              <MobileSection title={t.nav.services} items={services.flat()}  onClose={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectWalletButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const { lang } = useSettings();
  return (
    <button
      type="button"
      onClick={() => alert(lang === "fr"
        ? "La connexion wallet sera disponible prochainement."
        : "Wallet connection is coming soon.")}
      className={`btn-primary !py-2 !px-3 sm:!px-4 text-xs sm:text-sm whitespace-nowrap ${
        fullWidth ? "w-full justify-center !py-3" : ""
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
        <path d="M21 12V7H5a2 2 0 010-4h14v4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 5v14a2 2 0 002 2h16v-5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 12a2 2 0 100 4h4v-4z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="hidden sm:inline">Connect</span>
      <span className="sm:hidden inline">{fullWidth ? "Connect wallet" : ""}</span>
    </button>
  );
}

function MobileLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-3 py-3 rounded-xl font-display text-text uppercase text-2xl tracking-tight-display hover:bg-surface-2"
    >
      {children}
    </Link>
  );
}

function MobileSection({ title, items, onClose }: { title: string; items: MegaItem[]; onClose: () => void }) {
  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="px-3 pb-2 text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
        {title}
      </div>
      <ul>
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              onClick={onClose}
              className="block px-3 py-2 text-sm text-text hover:bg-surface-2 rounded-lg"
            >
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
