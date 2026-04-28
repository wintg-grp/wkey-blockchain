"use client";

import { useSettings } from "@/lib/settings";
import { formatUnitPrice, getWtgPrice, isInitialOffering } from "@/lib/price";

export function PriceTile() {
  const { currency, t } = useSettings();
  const price = getWtgPrice();
  const initial = isInitialOffering();
  return (
    <div className="stat-cell relative overflow-hidden flex flex-col justify-between min-h-[140px] sm:min-h-[160px] lg:min-h-[180px]">
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-accent/10 blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="relative">
        <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
          {t.home.statPrice}
        </div>
        <div className="mt-1.5 font-display uppercase text-text leading-none text-3xl sm:text-4xl lg:text-5xl tracking-tight-display">
          {formatUnitPrice(currency)}
        </div>
        <div className="mt-1 text-[11px] sm:text-xs text-text-muted">
          1 WTG · {price.source === "initial-offering" ? t.home.initialOffer : "Live"}
        </div>
      </div>

      {initial && (
        <span className="relative pill bg-accent/12 text-accent self-start mt-3 text-[10px] sm:text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-soft-pulse" />
          {t.home.initialOffer}
        </span>
      )}
    </div>
  );
}
