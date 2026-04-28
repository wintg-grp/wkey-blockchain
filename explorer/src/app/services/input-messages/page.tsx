"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Messages d'entrée (IDM)","description":"Communication décentralisée sur WINTG : envoyez un message en encodant du texte dans le champ data d'une transaction. Lisible par tout le monde, ancré on-chain.","bullets":["Encodage UTF-8 automatique","Boîte de réception par adresse","Compatible avec n'importe quel wallet"]}}
      en={{"title":"Input data messages (IDM)","description":"Decentralised communication on WINTG: send a message by encoding text in the data field of a transaction. Readable by anyone, anchored on-chain.","bullets":["Automatic UTF-8 encoding","Per-address inbox","Works with any wallet"]}}
    />
  );
}
