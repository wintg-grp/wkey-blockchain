"use client";

import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function BrandPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  return (
    <PageShell network={network}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">
          {fr ? "Identité de marque" : "Brand assets"}
        </h1>
        <p className="mt-5 text-text-muted text-lg max-w-2xl leading-relaxed">
          {fr
            ? "La blockchain a pris le nom de l'entreprise. WINTG est à la fois la chaîne L1, le groupe et la marque. Voici les ressources officielles pour parler de WINTG dans vos articles, vidéos, intégrations et applications."
            : "The blockchain takes the company name. WINTG is simultaneously the L1 chain, the group and the brand. Below are the official assets you can use when talking about WINTG in your articles, videos, integrations and applications."}
        </p>

        {/* Branding guidelines */}
        <section className="mt-14">
          <h2 className="display text-3xl text-text">
            {fr ? "Branding guidelines" : "Branding guidelines"}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
            <Guideline
              title={fr ? "Espace de respiration" : "Breathing room"}
              body={fr
                ? "Laissez toujours un espace équivalent à la moitié de la hauteur du logo autour de la marque. Ne placez aucun élément graphique dans cette zone."
                : "Always leave a clear area equal to half the logo height around the mark. No other graphic elements may sit inside that zone."}
            />
            <Guideline
              title={fr ? "Ne déformez pas le logo" : "Don't distort the mark"}
              body={fr
                ? "Le logo se redimensionne uniquement de manière proportionnelle. Pas de rotation, pas de couleurs hors palette, pas d'effets ou de contours additionnels."
                : "The mark only scales proportionally. No rotation, no off-palette colours, no extra strokes or effects."}
            />
            <Guideline
              title={fr ? "Couleurs officielles" : "Official colours"}
              body={fr
                ? "Orange WINTG #FF6A1A · Cream #FFF1E8 · Ink #0A0B12. Utilisez l'orange uniquement comme accent, jamais en aplat sur de larges surfaces (sauf dans les boutons et CTAs)."
                : "WINTG Orange #FF6A1A · Cream #FFF1E8 · Ink #0A0B12. Use orange as an accent, never as a large flat fill except for buttons and CTAs."}
            />
            <Guideline
              title={fr ? "Typographie" : "Typography"}
              body={fr
                ? "Anton pour les titres et chiffres clés, Inter pour le corps de texte. JetBrains Mono pour les hashes et adresses."
                : "Anton for headlines and big numbers, Inter for body copy. JetBrains Mono for hashes and addresses."}
            />
            <Guideline
              title={fr ? "Nommer la marque" : "Naming"}
              body={fr
                ? "Écrivez « WINTG » en majuscules pour le groupe et la chaîne. « WTG » désigne uniquement le token natif. « WINTG Scan » pour l'explorateur."
                : "Use “WINTG” in uppercase for both the group and the chain. “WTG” refers only to the native token. The explorer is always “WINTG Scan”."}
            />
            <Guideline
              title={fr ? "Aucun produit dérivé non autorisé" : "No unauthorised merch"}
              body={fr
                ? "Pas de t-shirts, mugs, NFTs ou produits dérivés portant la marque WINTG sans accord écrit du groupe."
                : "No t-shirts, mugs, NFTs or merchandise carrying the WINTG mark without written approval from the group."}
            />
          </div>
        </section>

        {/* Logo downloads */}
        <section className="mt-14">
          <h2 className="display text-3xl text-text">
            {fr ? "Logos & favicon" : "Logos & favicon"}
          </h2>
          <div className="grid sm:grid-cols-3 gap-5 mt-6">
            <DownloadCard
              variant="white"
              file="/brand/logo-orange.svg"
              filename="wintg-logo-orange.svg"
              title={fr ? "Logo orange" : "Orange mark"}
              hint={fr ? "À utiliser sur fond clair / cream / blanc." : "For use on light, cream or white backgrounds."}
            />
            <DownloadCard
              variant="orange"
              file="/brand/logo-white.svg"
              filename="wintg-logo-white.svg"
              title={fr ? "Logo blanc" : "White mark"}
              hint={fr ? "À utiliser sur fond coloré ou photographique." : "For use on coloured or photographic backgrounds."}
            />
            <DownloadCard
              variant="white"
              file="/brand/favicon.svg"
              filename="wintg-favicon.svg"
              title="Favicon"
              hint={fr ? "Format SVG, conçu pour les onglets de navigateur." : "SVG, designed for browser tabs."}
            />
          </div>
        </section>

        {/* Agreement */}
        <section className="mt-16">
          <div className="card p-6 sm:p-8">
            <h3 className="font-semibold text-text">
              {fr ? "Conditions d'utilisation des ressources de marque" : "Brand assets terms of use"}
            </h3>
            <p className="mt-3 text-sm text-text-muted leading-relaxed">
              {fr
                ? "En téléchargeant et en utilisant les ressources ci-dessus, vous acceptez de les utiliser uniquement pour parler de WINTG (articles, vidéos, intégrations, démonstrations). Toute utilisation suggérant un partenariat, un endossement ou une affiliation officielle requiert un accord écrit préalable de WINTG Group. La marque WINTG, le logo et les couleurs ne peuvent pas être modifiés. WINTG Group se réserve le droit de demander le retrait d'une utilisation jugée non conforme."
                : "By downloading and using the assets above you agree to use them only to talk about WINTG (articles, videos, integrations, demos). Any use suggesting a partnership, endorsement or official affiliation requires written approval from WINTG Group. The WINTG mark, logo and colours cannot be altered. WINTG Group reserves the right to request the removal of any use it deems non-compliant."}
            </p>
            <div className="mt-4 text-sm">
              <Link href="/contact" className="link-accent">
                {fr ? "Une question ? Contactez-nous." : "A question? Get in touch."}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function Guideline({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-6">
      <h3 className="font-semibold text-text">{title}</h3>
      <p className="mt-2 text-sm text-text-muted leading-relaxed">{body}</p>
    </div>
  );
}

function DownloadCard({
  variant,
  file,
  filename,
  title,
  hint,
}: {
  variant: "white" | "orange";
  file: string;
  filename: string;
  title: string;
  hint: string;
}) {
  const bg = variant === "white" ? "bg-white" : "bg-wintg-gradient";
  return (
    <div className="card p-5">
      <div className={`${bg} rounded-2xl aspect-square grid place-items-center overflow-hidden`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={file} alt={title} className="w-3/5 h-3/5" />
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-text">{title}</div>
          <div className="text-xs text-text-muted mt-0.5">{hint}</div>
        </div>
        <a
          href={file}
          download={filename}
          className="btn-primary !py-2 !px-3 text-xs shrink-0"
          aria-label={`Download ${title}`}
        >
          ↓ SVG
        </a>
      </div>
    </div>
  );
}
