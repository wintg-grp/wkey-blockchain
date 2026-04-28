"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { isAddress, isBlockNumber, isTxHash } from "@/lib/format";
import { useSettings } from "@/lib/settings";

export function SearchBar({ size = "md" }: { size?: "md" | "lg" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  // "/" hotkey to focus the search bar (skip when typing in another field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
      setError(t.common.searchPlaceholder);
      return;
    }
    setError(null);
    setQ("");
    inputRef.current?.blur();
  };

  const isLg = size === "lg";

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div
        className={`group relative flex items-center bg-surface border rounded-2xl transition-all
          ${error ? "border-red-500/60" : "border-border focus-within:border-accent"}
          ${isLg ? "px-5 py-4" : "px-4 py-2.5"}
        `}
      >
        <svg
          className={`text-text-muted ${isLg ? "w-5 h-5 mr-3" : "w-4 h-4 mr-2.5"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); if (error) setError(null); }}
          placeholder={isLg ? t.common.searchPlaceholder : t.common.search}
          className={`flex-1 bg-transparent text-text placeholder:text-text-muted outline-none ${
            isLg ? "text-base" : "text-sm"
          }`}
          autoComplete="off"
          spellCheck="false"
          aria-label={t.common.search}
        />
        <kbd
          className={`hidden lg:inline-flex items-center justify-center font-mono text-[11px] text-text-muted bg-surface-2 border border-border rounded-md px-1.5 py-0.5 mr-2 ${
            isLg ? "" : "scale-90"
          }`}
        >
          /
        </kbd>
        <button
          type="submit"
          className={`hidden md:inline-flex items-center justify-center bg-accent text-accent-fg font-medium rounded-xl transition-transform hover:scale-105 active:scale-95
            ${isLg ? "px-5 py-2.5 ml-1" : "px-3 py-1.5 ml-1 text-xs"}
          `}
        >
          {t.common.search}
        </button>
      </div>
    </form>
  );
}
