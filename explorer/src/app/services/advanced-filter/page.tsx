"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Filtre avancé","description":"Filtrez les transactions par adresse, méthode, montant, plage de blocs ou date. Combinez plusieurs critères et exportez en CSV.","bullets":["Opérateurs ET / OU","Sauvegarde des requêtes","Export direct en CSV"]}}
      en={{"title":"Advanced filter","description":"Filter transactions by address, method, amount, block range or date. Combine multiple criteria and export as CSV.","bullets":["AND / OR operators","Save your queries","Direct CSV export"]}}
    />
  );
}
