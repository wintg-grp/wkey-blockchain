"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Newsletter","description":"Abonnez-vous pour recevoir les annonces, les nouveautés du protocole et les tutoriels directement dans votre boîte mail."}}
      en={{"title":"Newsletter","description":"Subscribe to receive protocol announcements, product updates and tutorials directly in your inbox."}}
    />
  );
}
