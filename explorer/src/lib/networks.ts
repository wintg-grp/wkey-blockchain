import { defineChain } from "viem";

export const wintgMainnet = defineChain({
  id: 2280,
  name: "WINTG",
  nativeCurrency: { name: "WINTG", symbol: "WTG", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_MAINNET_RPC ?? "https://rpc.wintg.network"],
      webSocket: [process.env.NEXT_PUBLIC_MAINNET_WS ?? "wss://ws.wintg.network"],
    },
  },
  blockExplorers: {
    default: { name: "WINTG Scan", url: "https://scan.wintg.network" },
  },
});

export const wintgTestnet = defineChain({
  id: 22800,
  name: "WINTG Testnet",
  nativeCurrency: { name: "WINTG", symbol: "WTG", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_TESTNET_RPC ?? "https://testnet-rpc.wintg.network"],
      webSocket: [process.env.NEXT_PUBLIC_TESTNET_WS ?? "wss://testnet-ws.wintg.network"],
    },
  },
  blockExplorers: {
    default: { name: "WINTG Scan", url: "https://scan.wintg.network" },
  },
  testnet: true,
});

export type NetworkKey = "mainnet" | "testnet";

export const NETWORKS = {
  mainnet: wintgMainnet,
  testnet: wintgTestnet,
} as const;

export const DEFAULT_NETWORK: NetworkKey =
  (process.env.NEXT_PUBLIC_DEFAULT_NETWORK as NetworkKey) ?? "mainnet";
