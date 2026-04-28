"use client";

import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";
import { getKbArticle, type Section } from "@/lib/kb-articles";

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

  const article = getKbArticle(decodeURIComponent(params.slug).toLowerCase());

  if (!article) {
    // Article not yet written — show a friendly placeholder rather than 404.
    return (
      <PageShell network={network}>
        <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <Link href={`/knowledge-base?net=${network}`} className="text-sm text-accent hover:opacity-80">
            ← {fr ? "Toute la base de connaissances" : "All articles"}
          </Link>
          <h1 className="display text-4xl sm:text-6xl text-text mt-4 capitalize">
            {decodeURIComponent(params.slug).replace(/-/g, " ")}
          </h1>
          <p className="mt-6 text-text-muted leading-relaxed">
            {fr
              ? "Cet article est en cours de rédaction. Nous publions les pages de la base de connaissances par lots — celle-ci sera disponible très prochainement."
              : "This article is being written. We're publishing knowledge-base pages in batches — this one will be live very soon."}
          </p>
          <Link href={`/knowledge-base?net=${network}`} className="btn-primary mt-8 inline-flex">
            {fr ? "Voir les autres articles" : "Browse other articles"}
          </Link>
        </article>
      </PageShell>
    );
  }

  return (
    <PageShell network={network}>
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <Link href={`/knowledge-base?net=${network}`} className="text-sm text-accent hover:opacity-80">
          ← {fr ? "Toute la base de connaissances" : "All articles"}
        </Link>

        <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-accent mt-6">
          {fr ? article.category.fr : article.category.en}
        </div>
        <h1 className="display text-4xl sm:text-6xl text-text mt-2">
          {fr ? article.title.fr : article.title.en}
        </h1>
        <p className="mt-3 text-text-muted text-sm">
          {fr
            ? `Lecture : environ ${article.readingMinutes} min`
            : `Reading time: about ${article.readingMinutes} min`}
        </p>

        <div className="mt-10 space-y-6 text-text">
          {article.sections.map((s, i) => (
            <SectionRender key={i} section={s} fr={fr} />
          ))}
        </div>

        <div className="mt-14 pt-8 border-t border-border">
          <Link href={`/knowledge-base?net=${network}`} className="btn-primary inline-flex">
            {fr ? "Voir d'autres articles" : "Browse other articles"}
          </Link>
        </div>
      </article>
    </PageShell>
  );
}

function SectionRender({ section, fr }: { section: Section; fr: boolean }) {
  switch (section.type) {
    case "h2":
      return (
        <h2 className="display text-3xl text-text mt-8 first:mt-0">
          {fr ? section.fr : section.en}
        </h2>
      );

    case "p":
      return (
        <p className="text-base text-text-muted leading-relaxed">
          {fr ? section.fr : section.en}
        </p>
      );

    case "ul": {
      const items = (fr ? section.fr : section.en).split("\n").filter(Boolean);
      return (
        <ul className="list-disc pl-5 space-y-2 text-text-muted leading-relaxed">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    }

    case "quote":
      return (
        <blockquote className="border-l-4 border-accent pl-4 text-text-muted italic">
          {fr ? section.fr : section.en}
        </blockquote>
      );

    case "code":
      return (
        <pre className="bg-surface-2 rounded-xl p-4 text-xs mono overflow-x-auto whitespace-pre">
          <code>{section.text}</code>
        </pre>
      );

    case "kv": {
      const rows = (fr ? section.fr : section.en)
        .split("\n")
        .map((r) => r.split("::").map((x) => x.trim()))
        .filter((r) => r.length === 2);
      return (
        <dl className="card p-5 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          {rows.map(([k, v], i) => (
            <div key={i} className="contents">
              <dt className="text-text-muted uppercase text-[10px] tracking-wider font-bold sm:pt-1">{k}</dt>
              <dd className="text-text">{v}</dd>
            </div>
          ))}
        </dl>
      );
    }
  }
}
