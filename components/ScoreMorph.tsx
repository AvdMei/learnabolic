import type { CSSProperties } from 'react';
import { normalize } from '@/skills/learnabolic/scripts/core.mjs';

// Any score becomes the same thin 0–1 bar. s is computed by core.mjs normalize() with the README's goals.md specs.
// `auto` ranks against your own history; with no history yet it is honestly 0.5.
export const SCORES = [
  { chip: '👍', raw: 1, line: '- thumbs (w=1): 0..1 higher' },
  { chip: '7/10', raw: 7, line: '- quality (w=1): 0..10 higher target 8' },
  { chip: '182 ms', raw: 182, line: '- speed (w=0.3): 0..2000 lower target 500' },
  { chip: '42/45 tests', raw: 42, line: '- tests (w=0.5): auto higher' },
  { chip: '3.1% conversion', raw: 3.1, line: '- conversion (w=1): 0..10 higher target 4' },
];

export function ScoreMorph() {
  return (
    <ul className="morph">
      {SCORES.map((c, i) => {
        const s = normalize(c.raw, c.line.split(': ')[1]);
        return (
          <li key={c.chip} style={{ '--s': s, '--i': i } as CSSProperties}>
            <span className="morph-chip">{c.chip}</span>
            <span className="morph-bar" role="img" aria-label={`${c.chip} becomes s = ${s.toFixed(2)}`}><i /></span>
            <code>s = {s.toFixed(2)}</code>
          </li>
        );
      })}
    </ul>
  );
}
