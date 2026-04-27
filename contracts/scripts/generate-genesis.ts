#!/usr/bin/env ts-node
/* eslint-disable no-console */
/**
 * generate-genesis.ts — Génère le fichier `besu/genesis.json` final pour WINTG
 *
 * Le script :
 *   1. Lit les paramètres depuis `.env` et les drapeaux CLI
 *   2. Calcule les adresses CREATE de chaque contrat de vesting
 *      à partir du wallet déployeur (deployer + nonce)
 *   3. Encode l'`extraData` IBFT 2.0 (RLP de la liste des validateurs)
 *   4. Construit l'objet `genesis.json` avec les pré-allocations exactes
 *      et l'écrit dans `besu/genesis.json`
 *
 * Usage :
 *   npm run generate-genesis -- --network mainnet
 *   npm run generate-genesis -- --network testnet --no-prefund-deployer
 *   npm run generate-genesis -- --network mainnet --out custom/genesis.json
 *
 * Variables d'env requises :
 *   DEPLOYER_ADDRESS            — wallet qui déploiera tous les contrats
 *   VALIDATORS                  — adresses des validateurs initiaux (CSV)
 *   LIQUIDITY_MULTISIG_ADDRESS  — Gnosis Safe (ou EOA) recevant la tranche Liquidity
 *
 * Variables d'env optionnelles :
 *   GENESIS_TIMESTAMP           — timestamp du genesis (défaut : now)
 *   DEPLOYER_PREFUND_WTG        — pré-allocation WTG au déployeur (défaut : 10000)
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  encodeRlp,
  getAddress,
  getCreateAddress,
  isAddress,
  toBeHex,
} from "ethers";
import * as dotenv from "dotenv";

// -----------------------------------------------------------------------------
// Constantes immuables (alignées sur la tokenomics du whitepaper WINTG)
// -----------------------------------------------------------------------------

const CHAIN_IDS = {
  mainnet: 2280,
  testnet: 22800,
} as const;

const TOTAL_SUPPLY_WTG = 1_000_000_000n; // 1 milliard de WTG
const WEI_PER_WTG = 10n ** 18n;

const IBFT2_MIX_HASH =
  "0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365";

/**
 * Ordre canonique de déploiement des contrats. Cet ordre fige les nonces
 * du déployeur, donc les adresses CREATE pré-allouées dans le genesis.
 * NE PAS MODIFIER sans coordonner avec `scripts/deploy.ts`.
 */
const DEPLOY_ORDER = [
  "PublicSaleVesting",
  "PrivateSaleVesting",
  "TeamVesting",
  "AdvisorsVesting",
  "EcosystemVesting",
  "AirdropVesting",
  "StakingRewardsReserve",
  "TreasuryVesting",
  "PartnersVesting",
] as const;

type ContractKey = (typeof DEPLOY_ORDER)[number] | "LiquidityMultisig";

/** Allocations en WTG entiers (multipliés par 10^18 ensuite). */
const ALLOCATIONS_WTG: Record<ContractKey, bigint> = {
  PublicSaleVesting:     120_000_000n,
  PrivateSaleVesting:     80_000_000n,
  TeamVesting:           150_000_000n,
  AdvisorsVesting:        30_000_000n,
  EcosystemVesting:      200_000_000n,
  LiquidityMultisig:      70_000_000n,
  AirdropVesting:         80_000_000n,
  StakingRewardsReserve: 150_000_000n,
  TreasuryVesting:       100_000_000n,
  PartnersVesting:        20_000_000n,
};

// -----------------------------------------------------------------------------
// CLI parsing
// -----------------------------------------------------------------------------

interface Cli {
  network: keyof typeof CHAIN_IDS;
  out: string;
  prefundDeployer: boolean;
  prefundAmountWtg: bigint;
}

function parseCli(): Cli {
  const { values } = parseArgs({
    options: {
      network:               { type: "string", default: "testnet" },
      out:                   { type: "string", default: "" },
      "no-prefund-deployer": { type: "boolean", default: false },
      "prefund-amount":      { type: "string", default: "" },
      help:                  { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const network = String(values.network);
  if (network !== "mainnet" && network !== "testnet") {
    fatal(`--network doit être 'mainnet' ou 'testnet' (reçu : ${network})`);
  }

  const envPrefund = process.env.DEPLOYER_PREFUND_WTG;
  const prefundAmountWtg = BigInt(
    String(values["prefund-amount"]) || envPrefund || "10000",
  );
  if (prefundAmountWtg < 0n) {
    fatal(`--prefund-amount doit être positif (reçu : ${prefundAmountWtg})`);
  }

  const defaultOut = resolve(__dirname, "..", "..", "besu", "genesis.json");
  const out = values.out ? resolve(String(values.out)) : defaultOut;

  return {
    network: network as keyof typeof CHAIN_IDS,
    out,
    prefundDeployer: !values["no-prefund-deployer"],
    prefundAmountWtg,
  };
}

function printHelp() {
  console.log(`
generate-genesis.ts — Génère le fichier besu/genesis.json final

Options :
  --network <mainnet|testnet>   Réseau cible (défaut : testnet)
  --out <chemin>                Fichier de sortie (défaut : besu/genesis.json)
  --no-prefund-deployer         Ne pas pré-allouer de WTG au déployeur
  --prefund-amount <WTG>        Montant prélevé sur Liquidity pour le déployeur
                                (défaut : 10000 WTG)
  -h, --help                    Affiche cette aide

Variables d'environnement (.env) :
  DEPLOYER_ADDRESS              Wallet qui déploiera les contrats (REQUIS)
  VALIDATORS                    Adresses validateurs séparées par virgules (REQUIS)
  LIQUIDITY_MULTISIG_ADDRESS    Adresse multisig Liquidity (REQUIS)
  GENESIS_TIMESTAMP             Timestamp du genesis en hex (défaut : now)
  DEPLOYER_PREFUND_WTG          Surcharge --prefund-amount
`);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function fatal(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

function ok(msg: string): void {
  console.log(`✓ ${msg}`);
}

function info(msg: string): void {
  console.log(`  ${msg}`);
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v || v.trim() === "") fatal(`Variable d'environnement manquante : ${key}`);
  return v.trim();
}

function parseAddressList(raw: string, label: string): string[] {
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) fatal(`${label} : la liste est vide`);
  for (const a of list) {
    if (!isAddress(a)) fatal(`${label} : adresse invalide '${a}'`);
  }
  // Checksum + dédupliquer
  const set = new Set(list.map((a) => getAddress(a)));
  if (set.size !== list.length) fatal(`${label} : doublons détectés`);
  return [...set];
}

// -----------------------------------------------------------------------------
// Encodage IBFT 2.0 extraData
// -----------------------------------------------------------------------------

/**
 * Encode l'`extraData` IBFT 2.0 conforme à `IbftExtraDataCodec` de Besu.
 *
 * Format RLP :
 *   [
 *     vanity (32 octets de zéros),
 *     [validateurs...],
 *     0x80      — vote absent (writeNull)
 *     0x00000000 — round sur 4 octets fixes (writeInt, pas scalaire !)
 *     []        — seals vides (writeList vide)
 *   ]
 *
 * Référence : org.hyperledger.besu.consensus.ibft.IbftExtraDataCodec
 * Vérifié contre `besu rlp encode --type=IBFT_EXTRA_DATA`.
 */
function encodeIbft2ExtraData(validators: string[]): string {
  const vanity = "0x" + "00".repeat(32);
  const validatorsBytes = validators.map((v) => getAddress(v).toLowerCase());
  const emptyVote = "0x";          // writeNull → 0x80 (bytes vides)
  const round = "0x00000000";      // writeInt(0) → 0x84 + 0x00000000 (4 octets fixes)
  const emptySeals: string[] = []; // writeList(empty) → 0xc0

  return encodeRlp([vanity, validatorsBytes, emptyVote, round, emptySeals]);
}

// -----------------------------------------------------------------------------
// Calcul des adresses CREATE
// -----------------------------------------------------------------------------

/**
 * Calcule l'adresse CREATE pour `(deployer, nonce)`.
 *   address = keccak256(rlp([deployer, nonce]))[12:]
 */
function computeCreateAddress(deployer: string, nonce: number): string {
  return getCreateAddress({ from: deployer, nonce });
}

interface VestingAddressMap {
  [contractName: string]: string;
}

function computeVestingAddresses(deployer: string): VestingAddressMap {
  const out: VestingAddressMap = {};
  for (let i = 0; i < DEPLOY_ORDER.length; i++) {
    const name = DEPLOY_ORDER[i];
    out[name] = computeCreateAddress(deployer, i);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Construction du genesis
// -----------------------------------------------------------------------------

interface GenesisAlloc {
  [address: string]: { balance: string };
}

interface Genesis {
  config: Record<string, unknown>;
  nonce: string;
  timestamp: string;
  gasLimit: string;
  difficulty: string;
  mixHash: string;
  coinbase: string;
  extraData: string;
  alloc: GenesisAlloc;
}

function buildGenesis(opts: {
  cli: Cli;
  validators: string[];
  deployer: string;
  liquidityMultisig: string;
  vestingAddresses: VestingAddressMap;
  timestamp: bigint;
}): Genesis {
  const { cli, validators, deployer, liquidityMultisig, vestingAddresses, timestamp } = opts;

  // Sanity check : la somme des allocations doit toujours valoir le supply.
  const totalAllocated = Object.values(ALLOCATIONS_WTG).reduce((a, b) => a + b, 0n);
  if (totalAllocated !== TOTAL_SUPPLY_WTG) {
    fatal(
      `Bug interne : somme des allocations = ${totalAllocated} WTG, attendu ${TOTAL_SUPPLY_WTG}`,
    );
  }

  // Allocations en wei avec gestion du pré-funding du déployeur
  const allocs = new Map<string, bigint>();
  let liquidityWei = ALLOCATIONS_WTG.LiquidityMultisig * WEI_PER_WTG;

  if (cli.prefundDeployer && cli.prefundAmountWtg > 0n) {
    const prefundWei = cli.prefundAmountWtg * WEI_PER_WTG;
    if (prefundWei > liquidityWei) {
      fatal(
        `--prefund-amount (${cli.prefundAmountWtg} WTG) supérieur à la tranche Liquidity (${ALLOCATIONS_WTG.LiquidityMultisig} WTG)`,
      );
    }
    liquidityWei -= prefundWei;
    allocs.set(getAddress(deployer), prefundWei);
    info(
      `Pré-funding déployeur : ${cli.prefundAmountWtg} WTG (prélevés sur Liquidity)`,
    );
  }

  // Vesting contracts (calculés via CREATE)
  for (const name of DEPLOY_ORDER) {
    const wei = ALLOCATIONS_WTG[name] * WEI_PER_WTG;
    const addr = getAddress(vestingAddresses[name]);
    if (allocs.has(addr)) fatal(`Collision d'adresses sur ${addr} (${name})`);
    allocs.set(addr, wei);
  }

  // Liquidity multisig (post-prefund)
  const liquidityAddr = getAddress(liquidityMultisig);
  if (allocs.has(liquidityAddr)) {
    // Si quelqu'un met le multisig = deployer, on additionne plutôt qu'erreur
    allocs.set(liquidityAddr, allocs.get(liquidityAddr)! + liquidityWei);
  } else {
    allocs.set(liquidityAddr, liquidityWei);
  }

  // Vérifier : somme = 1B WTG en wei
  const sumWei = [...allocs.values()].reduce((a, b) => a + b, 0n);
  const expectedWei = TOTAL_SUPPLY_WTG * WEI_PER_WTG;
  if (sumWei !== expectedWei) {
    fatal(
      `Total des allocations = ${sumWei} wei, attendu ${expectedWei} wei`,
    );
  }

  // Sérialisation de alloc (adresses en lowercase, balance en décimal)
  const alloc: GenesisAlloc = {};
  for (const [addr, bal] of [...allocs.entries()].sort(([a], [b]) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  )) {
    alloc[addr.toLowerCase()] = { balance: bal.toString() };
  }

  // extraData IBFT 2.0
  const extraData = encodeIbft2ExtraData(validators);

  return {
    config: {
      chainId:           CHAIN_IDS[cli.network],
      homesteadBlock:    0,
      eip150Block:       0,
      eip155Block:       0,
      eip158Block:       0,
      byzantiumBlock:    0,
      constantinopleBlock: 0,
      petersburgBlock:   0,
      istanbulBlock:     0,
      berlinBlock:       0,
      londonBlock:       0,
      shanghaiTime:      0,
      cancunTime:        0,
      zeroBaseFee:       true,
      ibft2: {
        blockperiodseconds:    1,
        epochlength:           30000,
        requesttimeoutseconds: 4,
        blockreward:           "0x0",
      },
    },
    nonce:      "0x0",
    timestamp:  toBeHex(timestamp),
    gasLimit:   "0x5f5e100", // 100 000 000 (high-throughput target for gaming/dApps)
    difficulty: "0x1",
    mixHash:    IBFT2_MIX_HASH,
    coinbase:   "0x0000000000000000000000000000000000000000",
    extraData,
    alloc,
  };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function main(): void {
  // Charger .env depuis la racine du monorepo
  const envPath = resolve(__dirname, "..", "..", ".env");
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    info(`Pas de .env trouvé à ${envPath} — utilisation des variables d'env shell uniquement`);
  }

  const cli = parseCli();
  console.log(`\n→ Génération du genesis pour le réseau '${cli.network}' (chainId ${CHAIN_IDS[cli.network]})`);

  // Inputs
  const deployer = getAddress(requireEnv("DEPLOYER_ADDRESS"));
  const validators = parseAddressList(requireEnv("VALIDATORS"), "VALIDATORS");
  const liquidityMultisig = getAddress(requireEnv("LIQUIDITY_MULTISIG_ADDRESS"));

  if (cli.network === "mainnet" && validators.length < 1) {
    fatal("Au moins 1 validateur requis pour le mainnet");
  }

  const timestamp = process.env.GENESIS_TIMESTAMP
    ? BigInt(process.env.GENESIS_TIMESTAMP)
    : BigInt(Math.floor(Date.now() / 1000));

  ok(`Deployer            : ${deployer}`);
  ok(`Validateurs (${validators.length})  : ${validators.join(", ")}`);
  ok(`Liquidity multisig  : ${liquidityMultisig}`);
  ok(`Timestamp genesis   : ${timestamp} (${new Date(Number(timestamp) * 1000).toISOString()})`);

  // Calcul des adresses des contrats
  const vestingAddresses = computeVestingAddresses(deployer);
  console.log(`\n→ Adresses CREATE des contrats (deployer + nonce 0..${DEPLOY_ORDER.length - 1}) :`);
  for (let i = 0; i < DEPLOY_ORDER.length; i++) {
    const name = DEPLOY_ORDER[i];
    info(`  nonce ${i.toString().padStart(2, " ")} | ${name.padEnd(22)} → ${vestingAddresses[name]}`);
  }

  // Construction
  const genesis = buildGenesis({
    cli,
    validators,
    deployer,
    liquidityMultisig,
    vestingAddresses,
    timestamp,
  });

  // Écriture
  mkdirSync(dirname(cli.out), { recursive: true });
  writeFileSync(cli.out, JSON.stringify(genesis, null, 2) + "\n", "utf8");

  // Récap
  console.log(`\n→ Récap des allocations :`);
  const totalWei = Object.values(genesis.alloc).reduce(
    (acc, { balance }) => acc + BigInt(balance),
    0n,
  );
  for (const [addr, { balance }] of Object.entries(genesis.alloc)) {
    const wtg = BigInt(balance) / WEI_PER_WTG;
    info(`  ${addr}  ${wtg.toString().padStart(14, " ")} WTG`);
  }
  ok(`Total : ${(totalWei / WEI_PER_WTG).toString()} WTG (= 1 milliard ✓)`);
  ok(`extraData IBFT 2.0 : ${genesis.extraData} (${(genesis.extraData.length - 2) / 2} bytes)`);
  ok(`Écrit dans : ${cli.out}\n`);
}

// -----------------------------------------------------------------------------

if (require.main === module) {
  try {
    main();
  } catch (err) {
    if (err instanceof Error) fatal(err.message);
    fatal(String(err));
  }
}
