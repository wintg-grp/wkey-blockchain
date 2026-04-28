"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"DEX tracker","description":"Suivez les paires, les pools et les swaps sur les DEX de WINTG : volume 24 h, liquidité, top tokens, sniffing de pools risqués.","bullets":["Top pools par TVL et volume","Historique des swaps par paire","Détection de rug pulls et de honeypots","Charts heure / jour / semaine"]}}
      en={{"title":"DEX tracker","description":"Track pairs, pools and swaps on WINTG DEXes: 24 h volume, liquidity, top tokens, risky-pool sniffing.","bullets":["Top pools by TVL and volume","Swap history per pair","Rug-pull and honeypot detection","Hourly / daily / weekly charts"]}}
    />
  );
}
