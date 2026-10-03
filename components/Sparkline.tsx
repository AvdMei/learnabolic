import type { Point } from '@/lib/loop';

// Fitness per decision on a fixed 0–1 scale: CUSUM plateau bands behind, promotion notches on the line.
export function Sparkline({ points, width = 600, height = 160, label, span = 1 }: { points: Point[]; width?: number; height?: number; label: string; span?: number }) {
  const step = width / Math.max(points.length - 1, span), x = (i: number) => i * step, y = (f: number) => height - f * height;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.f).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      {points.map((p, i) => p.plateau && <rect key={`b${i}`} className="spark-band" x={x(i) - step / 2} width={step} y={0} height={height} />)}
      <path className="spark-line" d={d} vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => p.promoted && <line key={`n${i}`} className="spark-notch" x1={x(i)} x2={x(i)} y1={y(p.f) - 10} y2={y(p.f) + 10} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}
