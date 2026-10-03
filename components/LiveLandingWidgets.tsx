'use client';
import { useLive } from '@/lib/useLiveLoop';
import { BetaCurves } from './BetaCurves';
import { PolicyDiff } from './PolicyDiff';
import { QHeatmap } from './QHeatmap';
import { RatchetClick } from './RatchetClick';
import { Window } from './Section';
import { Sparkline } from './Sparkline';
import { SprtNeedle } from './SprtNeedle';
import { Steering } from './Steering';

// Landing islands, all fed by the page's one shared loop (LiveProvider). Nothing here is scripted.
export function HeroTrace() {
  const { view } = useLive();
  return <div className="hero-trace" aria-hidden>{view && <Sparkline points={view.trace} width={1000} height={300} span={160} label="" />}</div>;
}

export function HeroGen() {
  const { view } = useLive();
  return <p className="hero-gen muted"><RatchetClick generation={view?.generation ?? 0} /> live sim · gen {view?.generation ?? 0} · fitness {view && Number.isFinite(view.fitness) ? view.fitness.toFixed(2) : '—'}</p>;
}

export function InstrumentCards() {
  const { view: v, env } = useLive(), active = v?.pool.find((c) => c.id === v.activeId);
  const cards = [
    { title: 'Thompson', line: 'Bets on promising candidates without starving the rest.', viz: v && <BetaCurves items={v.pool} activeId={v.activeId} /> },
    { title: 'Q-direction', line: 'Learns where to push: tighten, prune, explore…', viz: v && <QHeatmap q={v.q} directions={env.directions} state={v.qState} choice={v.choice} /> },
    { title: 'SPRT ratchet', line: 'Keeps a change only when the evidence says so. Then never slips back.', viz: <SprtNeedle llr={active?.llr} n={active?.n} /> },
    { title: 'CUSUM', line: "Notices when it's stuck, then explores.", viz: v && <Sparkline points={v.trace.slice(-60)} height={90} span={60} label={v.plateau ? 'Plateau: exploring more' : 'Climbing'} /> },
  ];
  return (
    <div className="cards4">
      {cards.map((c) => (
        <Window key={c.title} title={c.title}>
          <div className="card-viz">{c.viz}</div>
          <p>{c.line}</p>
        </Window>
      ))}
    </div>
  );
}

export function SteeringDemo() {
  const { view: v, env, loop } = useLive();
  if (!v) return <div className="lab-skeleton" />;
  return (
    <div className="steer-demo">
      <Steering goals={env.goals} weights={v.weights} onChange={(w) => loop.setWeights(w)} />
      <Window title={`${env.id}/SKILL.md · gen ${v.generation}`}><PolicyDiff id={v.championId} text={env.toText(v.champion)} /></Window>
    </div>
  );
}
