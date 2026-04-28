"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Classement","description":"Top adresses, top contrats, top validateurs, top tokens. Mise à jour en temps réel."}}
      en={{"title":"Leaderboard","description":"Top addresses, top contracts, top validators, top tokens. Updated in real-time."}}
    />
  );
}
