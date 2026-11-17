export function Sparkline({ data }: { data: number[] }) {
  const values = data.length ? data : [0];
  const width = 92;
  const height = 28;
  const max = Math.max(1, ...values);
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - 2 - (value / max) * (height - 6);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline fill="none" stroke="#b8431f" strokeWidth="1.6" points={points} />
    </svg>
  );
}
