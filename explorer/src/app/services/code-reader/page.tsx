"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Lecteur de code","description":"Lisez le code source d'un contrat vérifié directement dans l'explorateur. Coloration syntaxique, navigation entre fichiers, liens vers les imports."}}
      en={{"title":"Code reader","description":"Read the source code of a verified contract directly in the explorer. Syntax highlighting, file navigation, links to imports."}}
    />
  );
}
