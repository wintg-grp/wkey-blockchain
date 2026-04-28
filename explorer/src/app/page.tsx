import { Suspense } from "react";
import { PageShell } from "@/components/PageShell";
import { HomeHero } from "@/components/HomeHero";
import { StatsRow } from "@/components/StatsRow";
import { TxChart } from "@/components/TxChart";
import { LatestBlocks } from "@/components/LatestBlocks";
import { LatestTransactions } from "@/components/LatestTransactions";
import { networkFromParam } from "@/lib/rpc";

export const revalidate = 0;

export default function Home({
  searchParams,
}: {
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  // Default lang on the server is FR; once hydrated the SettingsProvider
  // re-renders the parts of the UI that need translation.
  const lang = "fr" as const;

  return (
    <PageShell network={network}>
      <HomeHero network={network} />

      <section className="max-w-[1400px] mx-auto px-4 sm:px-6 mt-10 sm:mt-12">
        <Suspense fallback={<div className="h-[180px] card animate-pulse" />}>
          <StatsRow network={network} lang={lang} />
        </Suspense>
      </section>

      <section className="max-w-[1400px] mx-auto px-4 sm:px-6 mt-6 sm:mt-8">
        <Suspense fallback={<div className="h-72 card animate-pulse" />}>
          <TxChart network={network} lang={lang} />
        </Suspense>
      </section>

      <section className="max-w-[1400px] mx-auto px-4 sm:px-6 mt-6 sm:mt-8 grid lg:grid-cols-2 gap-6 mb-10">
        <Suspense fallback={<div className="h-96 card animate-pulse" />}>
          <LatestBlocks network={network} lang={lang} />
        </Suspense>
        <Suspense fallback={<div className="h-96 card animate-pulse" />}>
          <LatestTransactions network={network} lang={lang} />
        </Suspense>
      </section>
    </PageShell>
  );
}
