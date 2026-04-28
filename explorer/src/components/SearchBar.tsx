"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isAddress, isBlockNumber, isTxHash } from "@/lib/format";

export function SearchBar({ size = "md" }: { size?: "md" | "lg" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    const net = params.get("net") ?? "";
    const suffix = net ? `?net=${net}` : "";

    if (isAddress(v)) {
      router.push(`/address/${v}${suffix}`);
    } else if (isTxHash(v)) {
      router.push(`/tx/${v}${suffix}`);
    } else if (isBlockNumber(v)) {
      const num = v.startsWith("0x") ? parseInt(v, 16) : parseInt(v, 10);
      router.push(`/block/${num}${suffix}`);
    } else {
      setError("Enter a block number, transaction hash, or 0x address");
      return;
    }
    setError(null);
    setQ("");
  };

  const isLg = size === "lg";

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div
        className={`group relative flex items-center bg-ink-850/80 backdrop-blur-md border rounded-2xl transition-all
          ${error ? "border-red-500/60" : "border-ink-700/60 focus-within:border-wintg-500/60"}
          ${isLg ? "px-5 py-4 shadow-glow-lg" : "px-4 py-2.5"}
        `}
      >
        <svg
          className={`text-ink-400 ${isLg ? "w-5 h-5 mr-3" : "w-4 h-4 mr-2.5"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (error) setError(null);
          }}
          placeholder={isLg ? "Search by block, transaction or address" : "Search…"}
          className={`flex-1 bg-transparent text-white placeholder:text-ink-400 outline-none ${
            isLg ? "text-base" : "text-sm"
          }`}
          autoComplete="off"
          spellCheck="false"
        />
        <button
          type="submit"
          className={`hidden md:inline-flex items-center justify-center bg-wintg-gradient text-white font-medium rounded-xl transition-transform hover:scale-105 active:scale-95
            ${isLg ? "px-5 py-2.5 ml-3" : "px-3 py-1.5 ml-2 text-xs"}
          `}
        >
          Search
        </button>
      </div>
      {error && (
        <div className="mt-2 text-xs text-red-400">{error}</div>
      )}
    </form>
  );
}
