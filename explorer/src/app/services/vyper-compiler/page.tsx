"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Compilateur Vyper en ligne","description":"Compilez votre code Vyper directement depuis le navigateur. Aucune installation requise — versions multiples du compilateur disponibles."}}
      en={{"title":"Vyper online compiler","description":"Compile your Vyper code straight from the browser. No install required — multiple compiler versions available."}}
    />
  );
}
