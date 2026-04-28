import dynamic from "next/dynamic";
import { Suspense } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SearchBar } from "@/components/SearchBar";
import { StatsGrid } from "@/components/StatsGrid";
import { LatestBlocks } from "@/components/LatestBlocks";
import { LatestTransactions } from "@/components/LatestTransactions";
import { networkFromParam } from "@/lib/rpc";

const HeroBackground = dynamic(() => import("@/components/HeroBackground"), {
  ssr: false,
});

export const revalidate = 0;

export default function Home({
  searchParams,
}: {
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);

  return (
    <div className="min-h-screen flex flex-col">
      <Header network={network} />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-ink-800/60">
          <HeroBackground />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 md:py-28">
            <div className="max-w-3xl mx-auto text-center animate-fade-in-up">
              <span className="pill bg-wintg-500/15 text-wintg-500 mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-wintg-500 animate-pulse" />
                Live · {network === "mainnet" ? "Mainnet" : "Testnet"}
              </span>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight">
                Explore the{" "}
                <span className="bg-wintg-gradient bg-clip-text text-transparent">
                  WINTG
                </span>{" "}
                chain
              </h1>
              <p className="mt-5 text-base sm:text-lg text-ink-200 leading-relaxed">
                Real-time blocks, transactions and addresses on the WINTG L1 —
                fast, cheap, permissionless.
              </p>

              <div className="mt-8 max-w-2xl mx-auto">
                <SearchBar size="lg" />
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-10">
          <Suspense fallback={<div className="h-32 card animate-pulse" />}>
            <StatsGrid network={network} />
          </Suspense>
        </section>

        {/* Two-column live feed */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-8 grid lg:grid-cols-2 gap-6">
          <Suspense fallback={<div className="h-96 card animate-pulse" />}>
            <LatestBlocks network={network} />
          </Suspense>
          <Suspense fallback={<div className="h-96 card animate-pulse" />}>
            <LatestTransactions network={network} />
          </Suspense>
        </section>
      </main>

      <Footer />
    </div>
  );
}
