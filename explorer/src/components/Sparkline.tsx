/**
 * Tiny inline sparkline for service-status uptime graphs and price strips.
 * Pure SVG, no library needed.
 *
 * - Pass `color` for a fixed colour (default WINTG orange).
 * - Pass `trend="auto"` to colour green/red based on first→last delta.
 */
export function Sparkline({
  data,
  height = 40,
  width = 220,
  color = "#FF6A1A",
  trend,
}: {
  data: number[];
  height?: number;
  width?: number;
  color?: string;
  trend?: "auto";
}) {
  if (data.length === 0) return null;
  let stroke = color;
  if (trend === "auto" && data.length >= 2) {
    stroke = data[data.length - 1] >= data[0] ? "#10B981" : "#EF4444";
  }
  const max = Math.max(1, ...data);
  const min = Math.min(...data);
  const range = Math.max(1, max - min);

  const points = data.map((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * width;
    const y = height - ((v - min) / range) * height * 0.85 - height * 0.075;
    return { x, y };
  });

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const cx = (p0.x + p1.x) / 2;
    path += ` C ${cx.toFixed(2)} ${p0.y.toFixed(2)} ${cx.toFixed(2)} ${p1.y.toFixed(2)} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  const fill = `${path} L ${width} ${height} L 0 ${height} Z`;

  const gradientId = `spark-${stroke.replace("#", "")}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Deterministic mock price series — given a seed, returns a length-N
 * sequence that looks like a real price chart. Used until the indexer
 * ships real OHLC data.
 */
export function mockSeries(seed: number, length = 30, base = 1, volatility = 0.025): number[] {
  let value = base;
  const series: number[] = [];
  let s = seed | 0;
  for (let i = 0; i < length; i++) {
    s = (s * 1664525 + 1013904223) | 0;
    const noise = ((s >>> 0) / 0xffffffff - 0.5) * 2 * volatility;
    value = Math.max(0.0001, value * (1 + noise));
    series.push(value);
  }
  return series;
}
