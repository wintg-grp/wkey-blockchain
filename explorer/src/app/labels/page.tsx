"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Nuage d'étiquettes","description":"Une vue d'ensemble des adresses connues sur WINTG : exchanges, contrats officiels, validateurs, treasuries. Cherchez par étiquette ou explorez le nuage.","bullets":["Recherche full-text","Étiquettes vérifiées vs communautaires","API publique pour intégrer les étiquettes"]}}
      en={{"title":"Label cloud","description":"An overview of known addresses on WINTG: exchanges, official contracts, validators, treasuries. Search by label or explore the cloud.","bullets":["Full-text search","Verified vs community labels","Public API to embed labels"]}}
    />
  );
}
