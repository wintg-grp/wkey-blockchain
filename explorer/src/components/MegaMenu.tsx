"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MegaItem {
  label: string;
  href: string;
}

export function MegaMenu({
  label,
  groups,
  trigger,
}: {
  label: string;
  groups: { title?: string; items: MegaItem[] }[];
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-text hover:bg-surface-2 transition-colors focus-ring"
      >
        {trigger ?? label}
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 mt-2 z-40 min-w-[260px] card shadow-flat p-3 animate-fade-in-up">
          {groups.map((g, gi) => (
            <div key={gi} className={gi > 0 ? "mt-3 pt-3 border-t border-border" : ""}>
              {g.title && (
                <div className="px-2 pb-2 text-[10px] uppercase tracking-[0.18em] font-bold text-text-muted">
                  {g.title}
                </div>
              )}
              <ul className="space-y-0.5">
                {g.items.map((it) => (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between px-2 py-2 rounded-lg text-sm text-text hover:bg-surface-2 hover:text-accent transition-colors"
                    >
                      <span>{it.label}</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-text-faint">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
