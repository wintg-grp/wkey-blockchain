"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Comparateur de contrats","description":"Comparez deux contrats vérifiés côte à côte. Identifiez rapidement les différences entre versions ou entre forks."}}
      en={{"title":"Contract diff checker","description":"Compare two verified contracts side by side. Quickly identify differences between versions or forks."}}
    />
  );
}
