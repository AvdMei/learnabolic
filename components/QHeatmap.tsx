import { Fragment, type CSSProperties } from 'react';

type Q = Record<string, Record<string, number>>;
const initials = (d: string) => d.split('-').map((w) => w[0]).join('');

// Q-values, states (weakest KR | trend) × edit directions. The cell just chosen pulses.
export function QHeatmap({ q, directions, state, choice }: { q: Q; directions: string[]; state: string; choice: { state: string; direction: string } | null }) {
  const states = [...new Set([...Object.keys(q), state])].sort();
  const best = Object.entries(q[state] ?? {}).sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="qmap" style={{ gridTemplateColumns: `auto repeat(${directions.length}, 1fr)` }} role="img"
      aria-label={`Q-table, ${states.length} states. In ${state} the best direction so far is ${best ? best[0] : 'not learned yet'}.`}>
      <span />
      {directions.map((d) => <span key={d} className="qmap-h" title={d}>{initials(d)}</span>)}
      {states.map((s) => (
        <Fragment key={s}>
          <span className={s === state ? 'qmap-s now' : 'qmap-s'}>{s}</span>
          {directions.map((d) => {
            const v = q[s]?.[d] ?? 0.5, on = choice?.state === s && choice.direction === d;
            return <span key={d} className={on ? 'qmap-c pulse' : 'qmap-c'} title={`${s} · ${d}: ${v.toFixed(2)}`} style={{ '--q': Math.min(1, Math.max(0, (v + 1) / 3)) } as CSSProperties} />;
          })}
        </Fragment>
      ))}
    </div>
  );
}
