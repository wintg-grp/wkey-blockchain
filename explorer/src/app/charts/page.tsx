"use client";

import { ComingSoonPage } from "@/components/ComingSoon";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function ChartsPage({ searchParams }: { searchParams: { net?: string } }) {
  const { t } = useSettings();
  return (
    <ComingSoonPage
      network={networkFromParam(searchParams.net)}
      title={t.services.chartsStats}
      description="Daily volume, validator activity, gas distributions, contract creation rates."
    />
  );
}
