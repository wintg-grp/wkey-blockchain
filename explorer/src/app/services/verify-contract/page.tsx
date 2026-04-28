"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Vérifier un contrat","description":"Soumettez le code source d'un contrat déployé pour le rendre lisible publiquement. Recompilation avec les mêmes paramètres et publication des artefacts."}}
      en={{"title":"Verify a contract","description":"Submit the source code of a deployed contract to make it publicly readable. Recompile with the same settings and publish the artifacts."}}
    />
  );
}
