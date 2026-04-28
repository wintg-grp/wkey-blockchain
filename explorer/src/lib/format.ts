import { formatEther } from "viem";

export function shortenAddress(addr: string, head = 6, tail = 4): string {
  if (!addr || addr.length <= head + tail + 2) return addr ?? "";
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function shortenHash(hash: string): string {
  return shortenAddress(hash, 10, 8);
}

export function formatWtg(wei: bigint, maxFrac = 6): string {
  const s = formatEther(wei);
  const [whole, frac = ""] = s.split(".");
  if (!frac) return whole;
  const trimmed = frac.slice(0, maxFrac).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function formatWtgCompact(wei: bigint): string {
  const num = Number(formatEther(wei));
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(num < 1 ? 6 : 4);
}

export function relativeTime(timestamp: bigint | number): string {
  const ts = typeof timestamp === "bigint" ? Number(timestamp) : timestamp;
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function isAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

export function isTxHash(s: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(s);
}

export function isBlockNumber(s: string): boolean {
  return /^\d+$/.test(s) || /^0x[a-fA-F0-9]+$/.test(s);
}

export function gweiFromWei(wei: bigint): string {
  return (Number(wei) / 1e9).toFixed(2);
}
