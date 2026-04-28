/**
 * StatCluster
 * -----------
 * Renders 4 stats as a single quartered card on mobile (one outer rounded
 * frame, 1-px dividers between cells), and 4 detached cards in a row on
 * desktop. Children should be `<StatTile />` / `<PriceTile />` instances —
 * they pick up the right styling via `.stat-cell*` classes.
 */
export function StatCluster({ children }: { children: React.ReactNode }) {
  return <div className="stat-cluster">{children}</div>;
}
