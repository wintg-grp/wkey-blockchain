"use client";

import { PageShell } from "@/components/PageShell";
import { AboutHero } from "@/components/AboutHero";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function AboutPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();

  const title  = lang === "fr" ? "À propos" : "About us";
  const ourHistory = lang === "fr" ? "Notre histoire" : "Our history";

  const fr = {
    intro:
      "WINTG est un groupe panafricain qui construit des outils financiers et numériques pour le marché africain. WINTG Scan est l'explorateur officiel de la chaîne WINTG, opérée par notre équipe.",
    members: "Membres dans le groupe",
    since: "Fondation officielle",
    chapters: [
      {
        year: "2024",
        title: "L'idée",
        body: "L'idée d'une blockchain souveraine pour l'Afrique naît bien avant la création de l'entreprise. L'équipe commence à prototyper la chaîne : choix du consensus, modélisation économique, premières simulations.",
      },
      {
        year: "2025",
        title: "WINTG voit le jour",
        body: "Fin 2025 le groupe WINTG est officiellement créé. La blockchain prend le nom de l'entreprise. Les contrats core (token, vesting, factories, validateurs) entrent en phase de tests et audit.",
      },
      {
        year: "2026",
        title: "WINTG Scan",
        body: "WINTG Scan est lancé : l'explorateur officiel de la chaîne WINTG, conçu pour rendre la blockchain accessible à tous les builders, traders et utilisateurs en Afrique et au-delà.",
      },
    ],
  };
  const en = {
    intro:
      "WINTG is a pan-African group building financial and digital infrastructure for the African market. WINTG Scan is the official explorer of the WINTG chain, operated by our team.",
    members: "Members in the group",
    since: "Officially founded",
    chapters: [
      {
        year: "2024",
        title: "The idea",
        body: "The idea of a sovereign blockchain for Africa was born well before the company existed. The team started prototyping the chain — consensus design, economic modelling, early simulations.",
      },
      {
        year: "2025",
        title: "WINTG is born",
        body: "Late 2025, the WINTG group is officially incorporated. The blockchain takes the company name. Core contracts (token, vesting, factories, validators) enter testing and audit.",
      },
      {
        year: "2026",
        title: "WINTG Scan",
        body: "WINTG Scan ships: the official explorer of the WINTG chain, designed to make the blockchain accessible to every builder, trader and user in Africa and beyond.",
      },
    ],
  };
  const c = lang === "fr" ? fr : en;

  return (
    <PageShell network={network}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="display text-5xl sm:text-7xl text-text">{title}</h1>
            <p className="mt-6 text-text-muted text-lg leading-relaxed">{c.intro}</p>

            <div className="grid grid-cols-2 gap-3 mt-10">
              <div className="card-inverse p-6">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-70">
                  {c.members}
                </div>
                <div className="display text-5xl sm:text-6xl mt-2 leading-none">+70</div>
              </div>
              <div className="rounded-3xl bg-wintg-gradient text-accent-fg p-6">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-80">
                  {c.since}
                </div>
                <div className="display text-5xl sm:text-6xl mt-2 leading-none">2026</div>
              </div>
            </div>
          </div>

          <div>
            <AboutHero />
          </div>
        </div>

        <section className="mt-20 sm:mt-24">
          <h2 className="display text-4xl sm:text-6xl text-text">{ourHistory}</h2>
          <div className="grid sm:grid-cols-3 gap-5 mt-10">
            {c.chapters.map((ch, i) => (
              <article
                key={ch.year}
                className={`p-7 rounded-3xl ${
                  i === 1
                    ? "bg-wintg-gradient text-accent-fg"
                    : i === 2
                      ? "card-inverse"
                      : "card"
                }`}
              >
                <div className={`text-[10px] uppercase tracking-[0.18em] font-bold ${i === 0 ? "text-text-muted" : "opacity-70"}`}>
                  {ch.year}
                </div>
                <div className={`mt-2 display text-3xl ${i === 0 ? "text-text" : ""}`}>{ch.title}</div>
                <p className={`mt-4 text-sm leading-relaxed ${i === 0 ? "text-text-muted" : "opacity-80"}`}>
                  {ch.body}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
