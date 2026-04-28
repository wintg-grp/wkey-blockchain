"use client";

import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";
import { CopyButton } from "@/components/Copy";

export const dynamic = "force-dynamic";

const EMAILS = [
  { addr: "contact@wintg.group",  rolefr: "Demandes générales",          roleen: "General enquiries" },
  { addr: "chain@wintg.group",    rolefr: "Validateurs & infrastructure",roleen: "Validators & infrastructure" },
  { addr: "security@wintg.group", rolefr: "Sécurité & vulnérabilités",   roleen: "Security & vulnerabilities" },
];

export default function ContactPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  return (
    <PageShell network={network}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">
          {fr ? "Contactez-nous" : "Contact us"}
        </h1>
        <p className="mt-5 text-text-muted text-lg max-w-2xl">
          {fr
            ? "Besoin d'aide ? Une partenariat ? Une vulnérabilité à signaler ? Voici comment nous joindre."
            : "Need help? Looking for a partnership? Got a vulnerability to report? Here's how to reach us."}
        </p>

        {/* Email cards */}
        <section className="mt-12">
          <h2 className="display text-3xl text-text">Email</h2>
          <div className="grid sm:grid-cols-3 gap-5 mt-5">
            {EMAILS.map((e) => (
              <div key={e.addr} className="card p-6 flex flex-col">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
                  {fr ? e.rolefr : e.roleen}
                </div>
                <a href={`mailto:${e.addr}`} className="mt-3 font-display text-2xl text-text break-all hover:text-accent transition-colors">
                  {e.addr}
                </a>
                <div className="mt-auto pt-5 flex gap-2">
                  <a href={`mailto:${e.addr}`} className="btn-primary !px-4 !py-2 text-sm">
                    {fr ? "Envoyer un email" : "Send email"}
                  </a>
                  <CopyButton value={e.addr} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Direct messaging */}
        <section className="mt-14">
          <h2 className="display text-3xl text-text">
            {fr ? "Messagerie directe" : "Direct messaging"}
          </h2>
          <div className="grid sm:grid-cols-2 gap-5 mt-5">
            <a
              href="https://wa.me/22871230758"
              target="_blank"
              rel="noopener noreferrer"
              className="card p-6 flex items-center gap-4 hover:border-wintg-500 transition-colors"
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 grid place-items-center text-white">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M20.52 3.48A11.79 11.79 0 0012.04 0C5.46 0 .14 5.32.14 11.9c0 2.1.55 4.15 1.6 5.96L0 24l6.32-1.66a11.85 11.85 0 005.72 1.46h.01c6.58 0 11.9-5.32 11.9-11.9 0-3.18-1.24-6.17-3.43-8.42zM12.05 21.3a9.48 9.48 0 01-4.83-1.32l-.35-.21-3.75.98 1-3.65-.23-.37a9.4 9.4 0 01-1.45-5.04c0-5.21 4.24-9.45 9.46-9.45 2.53 0 4.91.99 6.7 2.78a9.4 9.4 0 012.78 6.7c0 5.22-4.24 9.46-9.45 9.46z"/></svg>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">WhatsApp</div>
                <div className="font-display text-xl text-text mt-1">+228 71 23 07 58</div>
              </div>
            </a>

            <a
              href="https://t.me/wintg_group"
              target="_blank"
              rel="noopener noreferrer"
              className="card p-6 flex items-center gap-4 hover:border-wintg-500 transition-colors"
            >
              <div className="w-12 h-12 rounded-2xl bg-sky-500 grid place-items-center text-white">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M21.94 4.6a1.5 1.5 0 00-2.04-1.4L2.74 9.95a1.5 1.5 0 00.07 2.83l4.36 1.43 1.7 5.4a1 1 0 001.7.36l2.55-2.7 4.4 3.21a1.5 1.5 0 002.36-.9l1.97-13.98zm-5.7 4.06l-7.31 6.7-.28 3.04-1.45-4.6 9.04-5.14z"/></svg>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">Telegram</div>
                <div className="font-display text-xl text-text mt-1">@wintg_group</div>
              </div>
            </a>
          </div>
        </section>

        {/* In-app */}
        <section className="mt-14 rounded-3xl bg-wintg-gradient text-accent-fg p-8 sm:p-10">
          <div className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-80">
            {fr ? "Dans l'application" : "In the app"}
          </div>
          <div className="display text-3xl sm:text-5xl mt-2 leading-none">
            {fr ? "Discutez avec nous" : "Chat with us"}
            <br />
            {fr ? "depuis WINTG." : "right inside WINTG."}
          </div>
          <p className="mt-4 max-w-md opacity-90">
            {fr
              ? "Notre application WINTG embarque un canal d'aide direct. Téléchargez WINTG sur votre téléphone et tapez « Aide » pour démarrer une conversation."
              : "Our WINTG app ships with a direct help channel. Install WINTG on your phone and type “Help” to open a conversation."}
          </p>
        </section>
      </div>
    </PageShell>
  );
}
