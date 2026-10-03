import type { KR } from '@/lib/env';

// Goals steer: one weight per KR. Fitness is the weighted mean, so the sliders change which challengers win.
export function Steering({ goals, weights, onChange }: { goals: KR[]; weights: Record<string, number>; onChange: (w: Record<string, number>) => void }) {
  return (
    <fieldset className="steering">
      <legend className="kicker">Steer · weights</legend>
      {goals.map((k) => (
        <label key={k.id}>
          <span>{k.label}</span>
          <input type="range" aria-label={`${k.label} weight`} min={0.5} max={4} step={0.5} value={weights[k.id]} onChange={(e) => onChange({ [k.id]: Number(e.target.value) })} />
          <output>{weights[k.id].toFixed(1)}</output>
        </label>
      ))}
    </fieldset>
  );
}
