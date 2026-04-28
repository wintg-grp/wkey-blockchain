/**
 * WINTG Domain Registry helper.
 * -----------------------------
 * Reads .wtg names from the on-chain `WtgDomainRegistry` contract via viem.
 *
 * The contract address is read from environment variables — one per
 * network — so we can ship the explorer before the contract is deployed
 * and just plug the address in once the registry is live:
 *
 *   NEXT_PUBLIC_DOMAIN_REGISTRY_MAINNET=0x...
 *   NEXT_PUBLIC_DOMAIN_REGISTRY_TESTNET=0x...
 *
 * If the address isn't set, the lookup helpers return null/false so the
 * UI can show a "registry not deployed yet" message rather than throwing.
 */

import { getAddress, type Address } from "viem";
import { getClient } from "./rpc";
import type { NetworkKey } from "./networks";

export const DOMAIN_REGISTRY_ABI = [
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "isAvailable",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "recordOf",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [
      { name: "owner_",     type: "address" },
      { name: "resolved",   type: "address" },
      { name: "expiresAt",  type: "uint64"  },
      { name: "text",       type: "string"  },
    ],
  },
  {
    type: "function",
    name: "registrationFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function getRegistryAddress(net: NetworkKey): Address | null {
  const raw =
    net === "mainnet"
      ? process.env.NEXT_PUBLIC_DOMAIN_REGISTRY_MAINNET
      : process.env.NEXT_PUBLIC_DOMAIN_REGISTRY_TESTNET;
  if (!raw) return null;
  try {
    return getAddress(raw);
  } catch {
    return null;
  }
}

/** Strip the `.wtg` suffix and lower-case. Throws if obviously invalid. */
export function normalizeName(input: string): string {
  let s = input.trim().toLowerCase();
  if (s.endsWith(".wtg")) s = s.slice(0, -4);
  if (s.length < 3 || s.length > 32) {
    throw new Error("Name length must be between 3 and 32 characters.");
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s) || s.includes("--")) {
    throw new Error("Name must use a-z, 0-9 and '-' (no leading/trailing or double hyphen).");
  }
  return s;
}

export interface DomainRecord {
  owner: Address;
  resolved: Address;
  expiresAt: number;
  text: string;
}

export async function lookupDomain(
  net: NetworkKey,
  rawName: string,
): Promise<{ name: string; record: DomainRecord | null; deployed: boolean }> {
  const name = normalizeName(rawName);
  const addr = getRegistryAddress(net);
  if (!addr) return { name, record: null, deployed: false };

  const client = getClient(net);
  const [owner, resolved, expiresAt, text] = (await client.readContract({
    address: addr,
    abi: DOMAIN_REGISTRY_ABI,
    functionName: "recordOf",
    args: [name],
  })) as [Address, Address, bigint, string];

  if (owner === "0x0000000000000000000000000000000000000000" || expiresAt === 0n) {
    return { name, record: null, deployed: true };
  }

  return {
    name,
    record: {
      owner,
      resolved,
      expiresAt: Number(expiresAt),
      text,
    },
    deployed: true,
  };
}

export async function fetchRegistrationFee(net: NetworkKey): Promise<bigint | null> {
  const addr = getRegistryAddress(net);
  if (!addr) return null;
  try {
    const fee = (await getClient(net).readContract({
      address: addr,
      abi: DOMAIN_REGISTRY_ABI,
      functionName: "registrationFee",
    })) as bigint;
    return fee;
  } catch {
    return null;
  }
}
