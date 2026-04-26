import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import { resolve } from "node:path";

// Charger .env depuis la racine du monorepo
dotenv.config({ path: resolve(__dirname, "..", ".env") });

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const RPC_MAINNET = process.env.RPC_URL_MAINNET ?? "https://chain.wkey.app";
const RPC_TESTNET = process.env.RPC_URL_TESTNET ?? "https://testnet-rpc.wkey.app";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
      viaIR: true,
      metadata: {
        bytecodeHash: "ipfs",
      },
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      chainId: 31337,
      blockGasLimit: 30_000_000,
      hardfork: "cancun",
      // WINTG genesis utilise un contractSizeLimit large (factories embarquent
      // plusieurs templates) — match en local pour les tests Hardhat
      allowUnlimitedContractSize: true,
    },
    // Hardhat local node — `npx hardhat node` puis `--network localhost`
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Besu local docker — `docker compose -f docker-compose.local.yml up`
    local: {
      url: "http://127.0.0.1:8545",
      chainId: 22800,
      // Hardhat account 0 — clé connue, OK pour testnet local
      accounts: [
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      ],
    },
    wintgMainnet: {
      url: RPC_MAINNET,
      chainId: 2280,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    wintgTestnet: {
      url: RPC_TESTNET,
      chainId: 22800,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    excludeContracts: [],
  },
  etherscan: {
    apiKey: {
      wintgMainnet: process.env.BLOCKSCOUT_API_KEY ?? "any",
      wintgTestnet: process.env.BLOCKSCOUT_API_KEY ?? "any",
    },
    customChains: [
      {
        network: "wintgMainnet",
        chainId: 2280,
        urls: {
          apiURL: "https://explorer.wkey.app/api",
          browserURL: "https://explorer.wkey.app",
        },
      },
      {
        network: "wintgTestnet",
        chainId: 22800,
        urls: {
          apiURL: "https://testnet-explorer.wkey.app/api",
          browserURL: "https://testnet-explorer.wkey.app",
        },
      },
    ],
  },
  mocha: {
    timeout: 60_000,
  },
};

export default config;
