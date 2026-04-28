"use client";

import { Header } from "./Header";
import { Footer } from "./Footer";
import type { NetworkKey } from "@/lib/networks";

export function PageShell({
  network,
  children,
}: {
  network: NetworkKey;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header network={network} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
