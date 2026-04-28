"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Approbations de tokens","description":"Affichez et révoquez les approbations de tokens accordées à des dApps. Une étape essentielle pour protéger vos fonds.","bullets":["Liste de toutes les approbations actives","Révocation en un clic","Identification des dApps malveillantes"]}}
      en={{"title":"Token approvals","description":"Review and revoke the token approvals you have granted to dApps. A critical step to keep your funds safe.","bullets":["List of every active approval","One-click revoke","Malicious dApp flagging"]}}
    />
  );
}
