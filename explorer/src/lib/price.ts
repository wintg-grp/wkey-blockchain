/**
 * WTG price oracle.
 *
 * For the bootstrap phase WTG isn't traded yet, so the explorer uses the
 * fixed initial-offering price (1 WTG = 50 CFA). The internal API hook
 * (`fetchExternalWtgPrice`) is a placeholder that the team will wire to
 * the production price source once a listing is live.
 *
 * The CFA → USD rate is also cached here so the rest of the codebase has
 * a single source of truth for currency conversion.
 */

const INITIAL_OFFERING_CFA_PER_WTG = 50;

// Approximate XOF/USD conversion rate. Used for the USD display only —
// updates when the team plugs in a live FX feed.
const APPROX_XOF_PER_USD = 600;

export type WtgPrice = {
  cfaPerWtg: number;
  usdPerWtg: number;
  source: "initial-offering" | "external";
  fetchedAt: number;
};

let cached: WtgPrice = {
  cfaPerWtg: INITIAL_OFFERING_CFA_PER_WTG,
  usdPerWtg: INITIAL_OFFERING_CFA_PER_WTG / APPROX_XOF_PER_USD,
  source: "initial-offering",
  fetchedAt: Date.now(),
};

export function getWtgPrice(): WtgPrice {
  return cached;
}

export function isInitialOffering(): boolean {
  return cached.source === "initial-offering";
}

/**
 * Hook for the external price source. Once a listing is live (DEX, CEX),
 * this function returns the live price; until then it's intentionally a
 * no-op so the rest of the codebase doesn't have to special-case "not
 * listed yet".
 *
 * Wire-up later through the team's data provider — the function signature
 * stays the same so callers don't break.
 */
export async function fetchExternalWtgPrice(): Promise<WtgPrice | null> {
  // Intentionally returns null so `getWtgPrice` keeps the initial-offering value.
  // Replace the body with the actual fetch once the price feed is live.
  return null;
}

/**
 * Format a WTG amount in the active currency.
 */
export function formatPriceFromWtg(amountWtg: number, currency: "cfa" | "usd"): string {
  const price = currency === "cfa" ? cached.cfaPerWtg : cached.usdPerWtg;
  const total = amountWtg * price;
  if (currency === "cfa") {
    return `${Math.round(total).toLocaleString("fr-FR")} CFA`;
  }
  return `$${total.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}

export function formatUnitPrice(currency: "cfa" | "usd"): string {
  if (currency === "cfa") return `${cached.cfaPerWtg.toLocaleString("fr-FR")} CFA`;
  return `$${cached.usdPerWtg.toFixed(4)}`;
}
