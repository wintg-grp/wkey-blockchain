"use client";

import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function BrandPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { t } = useSettings();
  return (
    <PageShell network={network}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
        <h1 className="display text-5xl sm:text-7xl text-text">{t.brand.title}</h1>
        <p className="mt-4 text-text-muted text-lg max-w-xl">{t.brand.body}</p>
        <div className="grid sm:grid-cols-3 gap-4 mt-10">
          <BrandTile label="Primary" hex="#FF6A1A" bg="bg-wintg-500" textCls="text-white" />
          <BrandTile label="Cream"   hex="#FFF1E8" bg="bg-cream-100" textCls="text-ink-900" />
          <BrandTile label="Ink"     hex="#0A0B12" bg="bg-ink-950"  textCls="text-cream-50" />
        </div>
      </div>
    </PageShell>
  );
}

function BrandTile({ label, hex, bg, textCls }: { label: string; hex: string; bg: string; textCls: string }) {
  return (
    <div className={`${bg} ${textCls} rounded-2xl p-6 h-44 flex flex-col justify-end`}>
      <div className="font-display uppercase text-2xl tracking-tight-display">{label}</div>
      <div className="mono opacity-80 text-sm">{hex}</div>
    </div>
  );
}
