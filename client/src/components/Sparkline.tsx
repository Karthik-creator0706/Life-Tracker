/** A tiny trend line for stat tiles. Hidden when there is nothing to draw (fewer than 2 points, or all zeros). */
export default function Sparkline({ values, height = 30 }: { values: number[]; height?: number }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null;

  const w = 100;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = range === 0 ? height / 2 : height - 3 - ((v - min) / range) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${pts.join('L')}`;

  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden>
      <path className="spark-area" d={`${line}L${w},${height}L0,${height}Z`} />
      <path className="spark-line" d={line} pathLength={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
