"use client";

import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function AboutPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { t } = useSettings();
  return (
    <PageShell network={network}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
        <h1 className="display text-5xl sm:text-7xl text-text">{t.about.title}</h1>
        <p className="mt-6 text-text-muted text-lg leading-relaxed">{t.about.body}</p>
      </div>
    </PageShell>
  );
}
