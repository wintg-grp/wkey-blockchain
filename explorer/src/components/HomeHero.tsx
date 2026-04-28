"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSettings } from "@/lib/settings";
import { SearchBar } from "./SearchBar";

const HeroBackground = dynamic(() => import("./HeroBackground"), { ssr: false });

export function HomeHero({ network }: { network: "mainnet" | "testnet" }) {
  const { t } = useSettings();
  return (
    <section className="relative overflow-hidden border-b border-border bg-pattern">
      <HeroBackground />

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 pt-12 pb-20 md:pt-20 md:pb-28">
        <div className="max-w-5xl">
          <span className="pill bg-accent/12 text-accent mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-soft-pulse" />
            {t.home.heroEyebrow} · {network === "mainnet" ? "Mainnet" : "Testnet"}
          </span>

          <h1 className="display text-[2.75rem] sm:text-7xl md:text-[8rem] lg:text-[10rem] text-text">
            {t.home.heroTitle1}
            <br />
            <span className="text-accent">{t.home.heroTitleAccent}</span>{" "}
            <span className="text-text">{t.home.heroTitle2}</span>
          </h1>

          <p className="mt-8 text-base sm:text-lg text-text-muted max-w-2xl leading-relaxed">
            {t.home.heroSubtitle}
          </p>

          <div className="mt-8 max-w-2xl">
            <SearchBar size="lg" />
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted">
              <span>{t.common.pressSlash}</span>
              <span className="hidden sm:inline">·</span>
              <Link href="/blocks" className="link-accent">{t.nav.blocks}</Link>
              <span>·</span>
              <Link href="/txs" className="link-accent">{t.nav.txs}</Link>
              <span>·</span>
              <Link href="/tokens" className="link-accent">{t.nav.tokens}</Link>
              <span>·</span>
              <Link href="/nfts" className="link-accent">{t.nav.nfts}</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
