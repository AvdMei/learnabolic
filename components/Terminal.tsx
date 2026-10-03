'use client';
import { useEffect, useRef, useState } from 'react';
import { useIsOnScreen } from '@/lib/useIsOnScreen';
import { Window } from './Section';

// Real CLI output from part 1A, verbatim. Never add lines the CLI does not print.
const LINES = [
  'USE .learnabolic/commit-message/variants/v0.md',
  'PROPOSE tighten: write .learnabolic/commit-message/variants/v1.md as a small edit of v0 (weakest KR: quality), then run: node .claude/skills/learnabolic/scripts/cli.mjs propose commit-message v1 --direction tighten',
  'OK v0 (champion) s=0.75',
  'OK v1 (tighten) is now challenging v0',
  'PROMOTED v3 (fitness 0.47 → 0.75)',
  'PROMOTED v6 (fitness 0.76 → 0.96)',
];
const TEXT = LINES.join('\n');

export function Terminal() {
  const [chars, setChars] = useState(0), ref = useRef<HTMLDivElement>(null), onScreen = useIsOnScreen(ref);
  useEffect(() => {
    if (!onScreen) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setChars(TEXT.length);
    const id = setInterval(() => setChars((c) => (c > TEXT.length + 150 ? 0 : c + 4)), 30); // type, hold, replay
    return () => clearInterval(id);
  }, [onScreen]);
  return (
    <div ref={ref}><Window title="zsh — learnabolic" className="term">
      <pre aria-hidden className="cursor">{TEXT.slice(0, chars)}</pre>
      <pre className="sr-only">{TEXT}</pre>
    </Window></div>
  );
}
