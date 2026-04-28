"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Contrats similaires","description":"Trouvez des contrats au bytecode similaire (clones, forks, copies). Utile pour identifier le code source d'un contrat non vérifié."}}
      en={{"title":"Similar contracts","description":"Find contracts with similar bytecode (clones, forks, copies). Useful to identify the source of an unverified contract."}}
    />
  );
}
