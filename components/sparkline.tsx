export function Sparkline({ data }: { data: number[] }) {
  const values = data.length ? data : [0];
  const width = 88;
  const height = 28;
  const max = Math.max(1, ...values);
  const coords = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - 3 - (value / max) * (height - 8);
    return [x, y] as const;
  });
  const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="text-primary">
      <polygon points={area} fill="currentColor" opacity="0.12" />
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={line} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
