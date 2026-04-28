import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  hint,
  variant = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  variant?: "default" | "inverse" | "accent";
  icon?: ReactNode;
}) {
  const klass =
    variant === "inverse"
      ? "card-inverse p-6"
      : variant === "accent"
        ? "p-6 rounded-3xl bg-wintg-gradient text-accent-fg shadow-flat"
        : "card p-6";

  return (
    <div className={`${klass} flex flex-col justify-between min-h-[180px]`}>
      <div className="flex items-start justify-between gap-3">
        <div
          className={`text-[10px] uppercase tracking-[0.18em] font-bold ${
            variant === "default" ? "text-text-muted" : "opacity-80"
          }`}
        >
          {label}
        </div>
        {icon && <div className="opacity-80">{icon}</div>}
      </div>
      <div>
        <div className={`font-display uppercase leading-none text-5xl tracking-tight-display`}>
          {value}
        </div>
        {hint && (
          <div
            className={`mt-2 text-xs ${
              variant === "default" ? "text-text-muted" : "opacity-70"
            }`}
          >
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}
