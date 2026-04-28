"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"WINTG Chat","description":"Une messagerie ancrée on-chain entre adresses WINTG : utile pour discuter avec un dApp, un contrat ou un autre utilisateur sans quitter l'explorateur.","bullets":["Chiffrement de bout en bout (optionnel)","Notifications push","API publique pour les dApps"]}}
      en={{"title":"WINTG Chat","description":"On-chain messaging between WINTG addresses: handy to talk to a dApp, a contract or another user without leaving the explorer.","bullets":["Optional end-to-end encryption","Push notifications","Public API for dApps"]}}
    />
  );
}
