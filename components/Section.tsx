import type { ReactNode } from 'react';

const PAGES = 13; // landing sections incl. the hero; update when a section is added or removed

// One landing "slide": § number + kicker, display heading, content, page footer (the talk's section rhythm).
export function Section({ n, kicker, title, children }: { n: number; kicker: string; title?: ReactNode; children: ReactNode }) {
  const pad = (x: number) => String(x).padStart(2, '0');
  return (
    <section className="section paper" aria-labelledby={`s${n}`}>
      <header className="section-head">
        <p className="kicker" id={title ? undefined : `s${n}`}>§ {pad(n)} · {kicker}</p>
        {title && <h2 className="display" id={`s${n}`}>{title}</h2>}
      </header>
      {children}
      <footer className="section-foot" aria-hidden><span>learnabolic</span><span>p. {pad(n)} / {PAGES}</span></footer>
    </section>
  );
}

// Classic-Mac window: striped title bar with a close box, ink border, hard shadow.
export function Window({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`window ${className}`}>
      <div className="window-title"><span>{title}</span></div>
      <div className="window-body">{children}</div>
    </div>
  );
}
