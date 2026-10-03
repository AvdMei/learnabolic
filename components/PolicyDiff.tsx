'use client';
import { useState } from 'react';

type Op = ' ' | '+' | '-';

// Longest-common-subsequence line diff: old champion → new champion.
function diff(a: string[], b: string[]): [Op, string][] {
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: [Op, string][] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) out.push([' ', a[i++]]), j++;
    else if (j < b.length && (i === a.length || L[i][j + 1] >= L[i + 1][j])) out.push(['+', b[j++]]);
    else out.push(['-', a[i++]]);
  }
  return out;
}

// The champion's text; on promotion the edit shows as red/green lines and the accent flashes along it.
export function PolicyDiff({ id, text }: { id: string; text: string }) {
  const [shown, setShown] = useState({ id, text, before: text });
  if (shown.id !== id || shown.text !== text) setShown({ id, text, before: shown.text }); // derive from props during render
  return (
    <pre className="policy">
      {diff(shown.before.trimEnd().split('\n'), text.trimEnd().split('\n')).map(([op, line], k) => (
        <span key={`${id}-${k}`} className={op === '+' ? 'add flash' : op === '-' ? 'del' : undefined}>
          <span aria-hidden>{op} </span>{op === '-' && <span className="sr-only">removed: </span>}{line}{'\n'}
        </span>
      ))}
    </pre>
  );
}
