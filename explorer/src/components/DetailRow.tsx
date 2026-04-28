import type { ReactNode } from "react";

export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-2 sm:gap-4 py-3.5 border-b border-border last:border-b-0">
      <div className="text-sm text-text-muted font-medium">{label}</div>
      <div className="text-sm text-text break-words">{children}</div>
    </div>
  );
}
