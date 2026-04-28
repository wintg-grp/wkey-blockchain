import Link from "next/link";
import { Suspense } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <Suspense fallback={<div className="h-16" />}>
        <Header network="mainnet" />
      </Suspense>
      <main className="flex-1 grid place-items-center px-4 py-20">
        <div className="text-center max-w-md">
          <div className="text-6xl font-bold bg-wintg-gradient bg-clip-text text-transparent">
            404
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">Nothing here</h1>
          <p className="mt-2 text-ink-300">
            The block, transaction or address you're looking for doesn't exist on
            this network. Try the search bar above with a valid hash, address or
            block number.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex px-5 py-2.5 bg-wintg-gradient text-white font-medium rounded-xl shadow-glow"
          >
            Back to home
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
