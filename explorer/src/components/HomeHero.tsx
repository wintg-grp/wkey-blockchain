"use client";

import dynamic from "next/dynamic";
import { useSettings } from "@/lib/settings";
import { SearchBar } from "./SearchBar";

const HeroBackground = dynamic(() => import("./HeroBackground"), { ssr: false });

export function HomeHero({ network }: { network: "mainnet" | "testnet" }) {
  const { t } = useSettings();
  return (
    <section className="relative overflow-hidden bg-pattern">
      <HeroBackground />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-14 md:pt-24 md:pb-20 text-center">
        <span className="pill bg-accent/12 text-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-soft-pulse" />
          {t.home.heroEyebrow} · {network === "mainnet" ? "Mainnet" : "Testnet"}
        </span>

        <div className="mt-8">
          <SearchBar size="lg" />
          <div className="mt-3 text-xs text-text-muted">
            {t.common.pressSlash}
          </div>
        </div>
      </div>
    </section>
  );
}
