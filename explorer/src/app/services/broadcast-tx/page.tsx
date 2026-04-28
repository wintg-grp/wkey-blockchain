"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Diffuser une transaction","description":"Diffusez une transaction signée sur le réseau WINTG. Utile quand votre wallet ne peut pas l'envoyer pour vous."}}
      en={{"title":"Broadcast transaction","description":"Broadcast a signed transaction to the WINTG network. Useful when your wallet cannot send it for you."}}
    />
  );
}
