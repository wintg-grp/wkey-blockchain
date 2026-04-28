"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Recherche de smart contracts","description":"Recherchez des contrats par nom, par signature de fonction, par interface (ERC-20, ERC-721, etc.) ou par auteur."}}
      en={{"title":"Smart contract search","description":"Search contracts by name, function signature, interface (ERC-20, ERC-721, etc.) or author."}}
    />
  );
}
