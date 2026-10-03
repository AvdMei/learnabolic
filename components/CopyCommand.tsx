'use client';
import { useState } from 'react';

// The install pill: one click copies the command; if the clipboard is blocked, say so instead of pretending.
export function CopyCommand({ command }: { command: string }) {
  const [state, setState] = useState<'copy' | 'copied' | 'select it to copy'>('copy');
  const copy = () => Promise.resolve().then(() => navigator.clipboard.writeText(command)).then(() => setState('copied'), () => setState('select it to copy'));
  return (
    <button type="button" className="pill" onClick={copy} aria-label={`Copy command: ${command}`}>
      <code>$ {command}</code>
      <span className="pill-state" aria-live="polite">{state}</span>
    </button>
  );
}
