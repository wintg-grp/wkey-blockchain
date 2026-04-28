"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Annuaire","description":"Liste organisée des projets, dApps, validateurs et services qui vivent sur la chaîne WINTG."}}
      en={{"title":"Directory","description":"A curated list of projects, dApps, validators and services living on the WINTG chain."}}
    />
  );
}
