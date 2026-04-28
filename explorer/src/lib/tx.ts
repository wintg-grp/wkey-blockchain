/**
 * Lightweight projection of a transaction returned by viem when the block
 * is fetched with `includeTransactions: true`. Viem's full Transaction type
 * is a heavy discriminated union (legacy / 1559 / 2930 / 4844 / 7702) — we
 * only need a handful of fields to render the explorer rows. Using this
 * projection avoids fragile type predicates against the union.
 */
export interface ExplorerTx {
  hash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}` | null;
  value: bigint;
}

export function isExplorerTxObject(t: unknown): t is ExplorerTx {
  return (
    typeof t === "object" &&
    t !== null &&
    "hash" in t &&
    "from" in t &&
    "value" in t
  );
}
