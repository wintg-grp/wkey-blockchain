import { createPublicClient, http, type PublicClient } from "viem";
import { NETWORKS, type NetworkKey, wintgMainnet, wintgTestnet } from "./networks";

const cache = new Map<NetworkKey, PublicClient>();

export function getClient(net: NetworkKey): PublicClient {
  const cached = cache.get(net);
  if (cached) return cached;
  const chain = NETWORKS[net];
  const client = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0], {
      // The chain produces a block every second; tighten the polling.
      timeout: 8_000,
    }),
  });
  cache.set(net, client);
  return client;
}

export function networkFromParam(value?: string | null): NetworkKey {
  if (value === "testnet") return "testnet";
  return "mainnet";
}

export function chainName(net: NetworkKey): string {
  return net === "mainnet" ? wintgMainnet.name : wintgTestnet.name;
}

export function chainId(net: NetworkKey): number {
  return net === "mainnet" ? wintgMainnet.id : wintgTestnet.id;
}
