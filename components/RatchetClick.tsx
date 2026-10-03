// The ratchet click: the tooth wheel ticks one notch per promotion, with a crisp 120 ms snap. It never turns back.
const TEETH = 12;
const WHEEL = Array.from({ length: TEETH }, (_, i) => {
  const a = (i / TEETH) * 2 * Math.PI, b = ((i + 1) / TEETH) * 2 * Math.PI, p = (r: number, t: number) => `${(r * Math.cos(t)).toFixed(2)} ${(r * Math.sin(t)).toFixed(2)}`;
  return `${i ? 'L' : 'M'}${p(6.5, a)} L${p(10, a)} L${p(6.5, b)}`; // sawtooth: steep face, slow ramp
}).join(' ') + 'Z';

export function RatchetClick({ generation, size = 20 }: { generation: number; size?: number }) {
  return (
    <svg className="ratchet" viewBox="-11 -11 22 22" width={size} height={size} style={{ transform: `rotate(${generation * (360 / TEETH)}deg)` }} aria-hidden>
      <path d={WHEEL} fill="currentColor" />
      <circle r="2.5" fill="var(--window)" />
    </svg>
  );
}
