"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { useSettings } from "@/lib/settings";
import { networkFromParam } from "@/lib/rpc";
import { CopyButton } from "@/components/Copy";

export const dynamic = "force-dynamic";

interface Unit {
  name: string;
  symbol: string;
  exponent: number; // power of 10 vs the smallest unit (wei)
  description: { fr: string; en: string };
}

const UNITS: Unit[] = [
  { name: "wei",   symbol: "wei",   exponent: 0,  description: { fr: "Plus petite unité du WTG.",                     en: "Smallest unit of WTG." } },
  { name: "kwei",  symbol: "kwei",  exponent: 3,  description: { fr: "Mille wei.",                                    en: "One thousand wei." } },
  { name: "mwei",  symbol: "mwei",  exponent: 6,  description: { fr: "Un million de wei.",                            en: "One million wei." } },
  { name: "gwei",  symbol: "gwei",  exponent: 9,  description: { fr: "Unité courante pour le prix du gaz.",           en: "Common unit for gas price." } },
  { name: "szabo", symbol: "szabo", exponent: 12, description: { fr: "Hérité d'Ethereum, peu utilisé.",                en: "Inherited from Ethereum, rarely used." } },
  { name: "finney",symbol: "finney",exponent: 15, description: { fr: "Hérité d'Ethereum, peu utilisé.",                en: "Inherited from Ethereum, rarely used." } },
  { name: "WTG",   symbol: "WTG",   exponent: 18, description: { fr: "Le WTG natif que les utilisateurs voient.",      en: "The native WTG users see." } },
];

// Multiply a string-decimal `value` by 10^delta. Works on arbitrary precision
// without going through JS number, by manipulating the digit string directly.
function shift(value: string, delta: number): string {
  if (!value) return "";
  let neg = false;
  if (value.startsWith("-")) { neg = true; value = value.slice(1); }
  const [intPart = "0", fracPart = ""] = value.split(".");
  let digits = intPart + fracPart;
  // Position of the decimal in `digits`
  let decPos = intPart.length;
  decPos += delta;

  // Pad if needed
  if (decPos <= 0) {
    digits = "0".repeat(-decPos + 1) + digits;
    decPos = 1;
  } else if (decPos > digits.length) {
    digits = digits + "0".repeat(decPos - digits.length);
  }

  let intOut  = digits.slice(0, decPos).replace(/^0+(?=\d)/, "");
  let fracOut = digits.slice(decPos).replace(/0+$/, "");
  if (intOut === "") intOut = "0";
  const result = fracOut ? `${intOut}.${fracOut}` : intOut;
  return (neg ? "-" : "") + result;
}

export default function UnitConverterPage({ searchParams }: { searchParams: { net?: string } }) {
  const network = networkFromParam(searchParams.net);
  const { lang } = useSettings();
  const fr = lang === "fr";

  const [value, setValue] = useState("1");
  const [from, setFrom] = useState<Unit>(UNITS.find((u) => u.symbol === "WTG") ?? UNITS[6]);

  // Derived: every unit, computed from `value` in `from`
  const rows = useMemo(() => {
    const safe = /^-?\d*\.?\d*$/.test(value) ? value : "";
    return UNITS.map((u) => {
      if (!safe) return { unit: u, out: "" };
      try {
        const out = shift(safe, from.exponent - u.exponent);
        return { unit: u, out };
      } catch {
        return { unit: u, out: "" };
      }
    });
  }, [value, from]);

  // Focus the input on mount, "/" hotkey already exists globally
  useEffect(() => {
    const el = document.getElementById("unit-input") as HTMLInputElement | null;
    el?.focus();
  }, []);

  return (
    <PageShell network={network}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="display text-5xl sm:text-7xl text-text">
          {fr ? "Convertisseur d'unités" : "Unit converter"}
        </h1>
        <p className="mt-4 text-text-muted leading-relaxed">
          {fr
            ? "Le WTG s'exprime en plusieurs unités selon les usages : wei pour interagir avec les contrats, gwei pour le prix du gaz, WTG pour les transferts. Convertissez en un coup d'œil."
            : "WTG is expressed in different units depending on the use case: wei when calling contracts, gwei for gas price, WTG for transfers. Convert at a glance."}
        </p>

        <section className="card p-6 sm:p-8 mt-10">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
                {fr ? "Valeur" : "Value"}
              </label>
              <input
                id="unit-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="mt-1.5 w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 text-2xl font-display tracking-tight-display outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
                {fr ? "Unité" : "Unit"}
              </label>
              <select
                value={from.symbol}
                onChange={(e) =>
                  setFrom(UNITS.find((u) => u.symbol === e.target.value) ?? from)
                }
                className="mt-1.5 w-full bg-surface-2 border border-border rounded-2xl px-4 py-3 text-lg outline-none focus:border-accent transition-colors"
              >
                {UNITS.map((u) => (
                  <option key={u.symbol} value={u.symbol}>{u.symbol}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="card mt-6 overflow-hidden">
          <ul>
            {rows.map(({ unit, out }) => (
              <li
                key={unit.symbol}
                className="grid grid-cols-12 items-center gap-3 px-5 py-4 border-b border-border last:border-b-0"
              >
                <div className="col-span-3 sm:col-span-2">
                  <div className="font-display text-xl text-text">{unit.symbol}</div>
                  <div className="text-[10px] text-text-muted">10^{unit.exponent}</div>
                </div>
                <div className="col-span-7 sm:col-span-8 mono break-all text-text">{out || "—"}</div>
                <div className="col-span-2 sm:col-span-2 text-right">
                  {out && <CopyButton value={out} size={14} />}
                </div>
                <div className="col-span-12 text-xs text-text-muted">
                  {fr ? unit.description.fr : unit.description.en}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
