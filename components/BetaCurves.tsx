// Each challenger's Beta(a, b) posterior on its win rate, scaled to its own peak (no Gamma function needed).
const XS = Array.from({ length: 49 }, (_, i) => 0.01 + (i / 48) * 0.98);

function curve(a: number, b: number, w: number, h: number) {
  const logs = XS.map((x) => (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x)), top = Math.max(...logs);
  return XS.map((x, i) => `${i ? 'L' : 'M'}${(x * w).toFixed(1)} ${(h - Math.exp(logs[i] - top) * (h - 2)).toFixed(1)}`).join(' ');
}

export function BetaCurves({ items, activeId, width = 180, height = 56 }: { items: { id: string; a: number; b: number }[]; activeId?: string | null; width?: number; height?: number }) {
  const label = items.map((c) => `${c.id} wins ~${Math.round((100 * c.a) / (c.a + c.b))}%`).join(', ') || 'no challengers yet';
  return (
    <svg className="beta" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Challenger posteriors: ${label}`}>
      <line className="beta-mid" x1={width / 2} x2={width / 2} y1={0} y2={height} />
      {items.map((c) => <path key={c.id} className={c.id === activeId ? 'beta-curve active' : 'beta-curve'} d={curve(c.a, c.b, width, height)} />)}
    </svg>
  );
}
