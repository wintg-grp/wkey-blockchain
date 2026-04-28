import type { ReactNode } from "react";

export function DetailRow({
  label,
  children,
  copyable,
}: {
  label: string;
  children: ReactNode;
  copyable?: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-2 sm:gap-4 py-3.5 border-b border-ink-800/60 last:border-b-0">
      <div className="text-sm text-ink-300 font-medium">{label}</div>
      <div className="text-sm text-white break-words flex items-start gap-2">
        <div className="flex-1 min-w-0">{children}</div>
        {copyable && <CopyButton value={copyable} />}
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  // Server-side rendered. Client interactivity is added by `CopyButtonClient`
  // wrapper if needed; for now we just render the icon as a no-op fallback
  // and rely on browser native context-menu copy.
  return (
    <a
      href={`#`}
      title={`Copy ${value}`}
      className="text-ink-400 hover:text-wintg-500 transition-colors shrink-0 mt-0.5"
      aria-hidden="true"
      tabIndex={-1}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
    </a>
  );
}
