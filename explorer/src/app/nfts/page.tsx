"use client";

import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function NftsPage({
  searchParams,
}: {
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const { t } = useSettings();

  return (
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-10">
        <h1 className="display text-5xl sm:text-7xl text-text">{t.nav.nfts}</h1>
        <p className="text-text-muted mt-2 max-w-xl">
          ERC-721 and ERC-1155 collections deployed on WINTG. Game studios, artists and brands
          ship their items via our public NFT factory.
        </p>

        <section className="card p-10 mt-8 text-center">
          <span className="pill bg-accent/12 text-accent">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-soft-pulse" />
            Indexer in progress
          </span>
          <h2 className="display text-3xl text-text mt-4">Pas encore de collections</h2>
          <p className="text-text-muted mt-2 max-w-md mx-auto">
            Les premières collections seront listées dès leur déploiement. Découvrez le guide gaming
            sur{" "}
            <a href="https://doc.wintg.network" className="link-accent">doc.wintg.network</a>.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
