"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Signatures vérifiées","description":"Visualisez, signez et vérifiez des messages avec une adresse WINTG. Idéal pour prouver la propriété d'une adresse hors-chaîne.","bullets":["EIP-191 et EIP-712 pris en charge","Vérification côté serveur","Lien permanent vers la signature"]}}
      en={{"title":"Verified signatures","description":"View, sign and verify messages using a WINTG address. Ideal for proving ownership of an address off-chain.","bullets":["EIP-191 and EIP-712 supported","Server-side verification","Permanent link to the signature"]}}
    />
  );
}
