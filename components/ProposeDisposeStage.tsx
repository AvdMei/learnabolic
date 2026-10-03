'use client';
import { useEffect, useRef, useState } from 'react';
import { useIsOnScreen } from '@/lib/useIsOnScreen';
import { sprt, sprtStep } from '@/skills/learnabolic/scripts/core.mjs';
import { RatchetClick } from './RatchetClick';
import { Window } from './Section';
import { SprtNeedle } from './SprtNeedle';

// Two scripted edits replayed through the real SPRT, one observation per tick: a good one (wins 14 of 15)
// and a bad one (wins 2 of 14). 40 ticks of 150 ms ≈ 6 s per round: type, slide into the gate, test, stamp.
const SCRIPTS = [
  { minus: '- Write tests when you remember.', plus: '+ Write a failing test first.', wins: [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { minus: '- Keep diffs small.', plus: '+ Rewrite the whole file each time.', wins: [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0] },
];
const LAMPS = ['Thompson', 'Q', 'SPRT', 'CUSUM'];

export function ProposeDisposeStage() {
  const [tick, setTick] = useState(0), ref = useRef<HTMLDivElement>(null), onScreen = useIsOnScreen(ref);
  useEffect(() => {
    if (!onScreen) return;
    const id = setInterval(() => setTick((t) => t + 1), 150);
    return () => clearInterval(id);
  }, [onScreen]);
  const round = Math.floor(tick / 40), k = tick % 40, script = SCRIPTS[round % 2];
  let llr = 0, n = 0, decision = 'continue';
  for (const s of script.wins.slice(0, Math.max(0, k - 12))) {
    if (decision !== 'continue') break;
    llr = sprtStep(llr, s);
    decision = sprt(llr, ++n);
  }
  const typed = Math.min(1, k / 8), kept = Math.ceil(round / 2) + (round % 2 === 0 && decision === 'promote' ? 1 : 0);
  const stamp = decision === 'promote' ? 'kept' : decision === 'reject' ? 'reverted' : null;
  return (
    <div ref={ref} className={`stage ${k >= 9 ? 'slid' : ''}`}>
      <Window title="agent" className="stage-agent">
        <pre className="policy">
          <span className="del">{script.minus.slice(0, Math.round(script.minus.length * typed))}</span>
          <span className="add">{script.plus.slice(0, Math.round(script.plus.length * typed))}</span>
        </pre>
      </Window>
      <Window title="gate" className="stage-gate">
        <ul className="lamps" aria-hidden>{LAMPS.map((l, i) => <li key={l} className={k >= 10 + i ? 'on' : ''}>{l}</li>)}</ul>
        <SprtNeedle llr={llr} n={n} stamp={stamp} />
        <p className="stage-count"><RatchetClick generation={kept} /> kept {kept} · n = {n}</p>
      </Window>
    </div>
  );
}
