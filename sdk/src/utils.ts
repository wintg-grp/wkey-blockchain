import { parseEther, formatEther, isAddress, getAddress } from "ethers";

/// Convertit un montant WTG (decimal/string) en wei (bigint).
export const parseWtg = (value: string | number): bigint => parseEther(String(value));

/// Formate un montant wei (bigint) en WTG (string).
export const formatWtg = (value: bigint): string => formatEther(value);

/// Vérifie qu'une adresse est valide EVM (sans tenir compte du checksum).
export const isWintgAddress = (addr: unknown): addr is string =>
  typeof addr === "string" && isAddress(addr);

/// Retourne l'adresse en checksum.
export const toChecksumAddress = (addr: string): string => getAddress(addr);
