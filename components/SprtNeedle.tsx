// Wald boundaries for core.mjs sprt() defaults (α = β = 0.1): promote at ln 9, reject at −ln 9.
const BOUND = Math.log(9);

export function SprtNeedle({ llr = 0, n = 0, stamp }: { llr?: number; n?: number; stamp?: 'kept' | 'reverted' | null }) {
  const angle = Math.max(-1, Math.min(1, llr / BOUND)) * 80;
  return (
    <svg className="needle" viewBox="-62 -58 124 74" role="img" aria-label={`SPRT evidence ${llr.toFixed(2)} after ${n} observations${stamp ? `: ${stamp}` : ''}`}>
      <path className="needle-arc" d="M-50 0 A50 50 0 0 1 50 0" />
      {[-80, 80].map((a) => <line key={a} className="needle-bound" y1={-42} y2={-54} transform={`rotate(${a})`} />)}
      <line className="needle-hand" y2={-46} style={{ transform: `rotate(${angle}deg)` }} />
      <circle r="3" />
      <text x={-60} y={14}>Reject</text>
      <text x={60} y={14} textAnchor="end">Promote</text>
      {stamp && <text className={`stamp stamp-${stamp}`} y={-16} textAnchor="middle">{stamp === 'kept' ? 'KEPT' : 'REVERTED'}</text>}
    </svg>
  );
}
