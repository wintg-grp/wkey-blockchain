"use client";

import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function ArticlePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { net?: string };
}) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  return (
    <PageShell network={network}>
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <Link href="/knowledge-base" className="text-sm text-accent hover:opacity-80">
          ← {fr ? "Toute la base de connaissances" : "All articles"}
        </Link>
        <h1 className="display text-4xl sm:text-6xl text-text mt-4 capitalize">
          {params.slug.replace(/-/g, " ")}
        </h1>
        <p className="mt-6 text-text-muted leading-relaxed">
          {fr
            ? "Cet article est en cours de rédaction. Nous publions les pages de la base de connaissances par lots — celle-ci sera disponible très prochainement."
            : "This article is being written. We're publishing knowledge-base pages in batches — this one will be live very soon."}
        </p>
        <Link href="/knowledge-base" className="btn-primary mt-8">
          {fr ? "Voir les autres articles" : "Browse other articles"}
        </Link>
      </article>
    </PageShell>
  );
}
