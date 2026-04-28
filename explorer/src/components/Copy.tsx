"use client";

import { useState } from "react";

export function CopyButton({
  value,
  className = "",
  size = 16,
}: {
  value: string;
  className?: string;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Older browsers — silently no-op
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={copied ? "Copied!" : "Copy"}
      aria-label="Copy"
      className={`inline-flex items-center justify-center text-text-muted hover:text-accent transition-colors focus-ring rounded ${className}`}
      style={{ width: size + 8, height: size + 8 }}
    >
      {copied ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
