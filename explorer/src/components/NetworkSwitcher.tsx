"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { NetworkKey } from "@/lib/networks";

export function NetworkSwitcher({ current }: { current: NetworkKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const switchTo = (net: NetworkKey) => {
    const next = new URLSearchParams(params.toString());
    next.set("net", net);
    start(() => router.push(`${pathname}?${next.toString()}`));
  };

  return (
    <div
      role="tablist"
      aria-label="Network selector"
      className="inline-flex p-1 bg-surface border border-border rounded-xl text-xs font-semibold"
    >
      {(["mainnet", "testnet"] as const).map((n) => {
        const active = current === n;
        return (
          <button
            key={n}
            role="tab"
            aria-selected={active}
            disabled={pending}
            onClick={() => switchTo(n)}
            className={`px-3 py-1.5 rounded-lg capitalize transition-all focus-ring ${
              active
                ? "bg-accent text-accent-fg shadow-flat"
                : "text-text-muted hover:text-text"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  active ? "bg-accent-fg animate-soft-pulse" : "bg-text-faint"
                }`}
              />
              {n}
            </span>
          </button>
        );
      })}
    </div>
  );
}
