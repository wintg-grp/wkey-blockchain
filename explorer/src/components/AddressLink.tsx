import Link from "next/link";
import { shortenAddress } from "@/lib/format";
import type { NetworkKey } from "@/lib/networks";

export function AddressLink({
  address,
  network,
  truncate = true,
}: {
  address: string;
  network: NetworkKey;
  truncate?: boolean;
}) {
  return (
    <Link
      href={`/address/${address}?net=${network}`}
      className="link-accent mono"
      title={address}
    >
      {truncate ? shortenAddress(address) : address}
    </Link>
  );
}

export function HashLink({
  hash,
  network,
  type = "tx",
  truncate = true,
}: {
  hash: string;
  network: NetworkKey;
  type?: "tx" | "block";
  truncate?: boolean;
}) {
  const href = type === "tx" ? `/tx/${hash}?net=${network}` : `/block/${hash}?net=${network}`;
  return (
    <Link href={href} className="link-accent mono" title={hash}>
      {truncate ? shortenAddress(hash, 10, 8) : hash}
    </Link>
  );
}
