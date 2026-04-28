/**
 * External-data wrapper.
 *
 * Some explorer features (cross-chain holdings, address tags, market data)
 * are powered by an external multi-chain data provider. The wrapper below
 * abstracts that integration so the rest of the codebase queries WINTG
 * features through a consistent interface, without ever exposing the
 * underlying provider name or the API key in client bundles.
 *
 * Calls go through a server-side route (to be added under /app/api/*) that
 * proxies the request, attaches the API key, and forwards the result. None
 * of those secrets ever reach the browser.
 */

const PROVIDER_BASE = process.env.EXTERNAL_DATA_BASE_URL ?? "";
const PROVIDER_KEY  = process.env.EXTERNAL_DATA_KEY ?? "";

export interface ExternalAddressLabel {
  address: string;
  label?: string;
  category?: string;
}

export async function lookupAddressLabel(address: string): Promise<ExternalAddressLabel | null> {
  if (!PROVIDER_BASE || !PROVIDER_KEY) return null;
  // Real implementation will live here once we wire the proxy route in.
  // Returning null keeps the explorer fully functional without the feature.
  void address;
  return null;
}

export interface ExternalMarketStat {
  pricePerCoin: number;
  fxRate: number;
  source: "external" | "fallback";
}

export async function fetchMarketSnapshot(): Promise<ExternalMarketStat | null> {
  if (!PROVIDER_BASE || !PROVIDER_KEY) return null;
  return null;
}
