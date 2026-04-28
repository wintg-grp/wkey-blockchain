"use client";

import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function ContactPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { t } = useSettings();
  return (
    <PageShell network={network}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
        <h1 className="display text-5xl sm:text-7xl text-text">{t.company.contact}</h1>
        <p className="mt-4 text-text-muted">contact@wintg.group · security@wintg.group</p>
        <a href="mailto:contact@wintg.group" className="btn-primary mt-8">contact@wintg.group</a>
      </div>
    </PageShell>
  );
}
